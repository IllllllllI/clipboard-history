//! 数据库文件管理子模块
//!
//! ## 职责
//! - 查询当前数据库路径与文件大小
//! - 执行数据库文件迁移（含 WAL/SHM）与连接切换
//! - 持久化数据库目录配置
//!
//! ## 输入/输出
//! - 输入：`AppHandle`、`State<DbState>`、目标目录
//! - 输出：`DbInfo` 或 `Result<(), AppError>`
//!
//! ## 错误语义
//! - 文件复制、连接切换、目录操作失败统一映射为 `AppError::Database`

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::error::AppError;

use super::{config, DbState};

#[derive(Debug, Clone, Serialize)]
pub struct DbInfo {
    pub path: String,
    pub size: u64,
}

fn get_current_db_path(conn: &Connection) -> Result<PathBuf, AppError> {
    let current_path_str: String = conn
        .query_row("PRAGMA database_list", [], |row| row.get::<_, String>(2))
        .map_err(|e| AppError::Database(format!("获取当前数据库路径失败: {}", e)))?;
    Ok(PathBuf::from(current_path_str))
}

fn build_db_info(path: &Path) -> DbInfo {
    let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    DbInfo {
        path: path.to_string_lossy().to_string(),
        size,
    }
}

fn resolve_new_dir_path(app: &AppHandle, new_dir: &str) -> Result<PathBuf, AppError> {
    if new_dir.is_empty() {
        app.path().app_data_dir().map_err(|e| {
            AppError::Database(format!("获取应用数据目录失败: {}", e))
        })
    } else {
        Ok(PathBuf::from(new_dir))
    }
}

fn copy_database_files(current_db_path: &Path, new_db_path: &Path) -> Result<(), AppError> {
    fs::copy(current_db_path, new_db_path).map_err(|e| {
        AppError::Database(format!("复制数据库文件失败: {}", e))
    })?;

    let wal_src = current_db_path.with_extension("db-wal");
    let shm_src = current_db_path.with_extension("db-shm");
    if wal_src.exists() {
        let _ = fs::copy(&wal_src, new_db_path.with_extension("db-wal"));
    }
    if shm_src.exists() {
        let _ = fs::copy(&shm_src, new_db_path.with_extension("db-shm"));
    }
    Ok(())
}

fn restore_connection(conn: &mut Connection, current_db_path: &Path) {
    match Connection::open(current_db_path) {
        Ok(fallback) => {
            fallback.execute_batch("PRAGMA journal_mode=WAL;").ok();
            *conn = fallback;
        }
        Err(open_err) => {
            log::error!("恢复旧连接也失败: {}", open_err);
        }
    }
}

fn replace_connection_to_new_db(
    conn: &mut Connection,
    current_db_path: &Path,
    new_db_path: &Path,
) -> Result<(), AppError> {
    match Connection::open(new_db_path) {
        Ok(new_conn) => {
            new_conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

            match new_conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get::<_, i64>(0)) {
                Ok(_) => {
                    *conn = new_conn;
                    Ok(())
                }
                Err(verify_err) => {
                    log::error!("验证新数据库失败: {}", verify_err);
                    drop(new_conn);
                    let _ = fs::remove_file(new_db_path);
                    restore_connection(conn, current_db_path);
                    Err(AppError::Database(format!("验证新数据库失败: {}", verify_err)))
                }
            }
        }
        Err(open_err) => {
            log::error!("打开新数据库失败: {}", open_err);
            let _ = fs::remove_file(new_db_path);
            restore_connection(conn, current_db_path);
            Err(AppError::Database(format!("打开新数据库失败: {}", open_err)))
        }
    }
}

#[tauri::command]
pub fn db_get_info(state: State<'_, DbState>) -> Result<DbInfo, AppError> {
    super::with_read_conn(&state, |conn| {
        let path = get_current_db_path(conn)?;
        Ok(build_db_info(&path))
    })
}

#[tauri::command]
pub fn db_move_database(
    app: AppHandle,
    state: State<'_, DbState>,
    new_dir: String,
) -> Result<DbInfo, AppError> {
    super::with_conn_pair_mut(&state, |write_conn, read_conn| {
        let current_db_path = get_current_db_path(write_conn)?;
        let new_dir_path = resolve_new_dir_path(&app, &new_dir)?;

        fs::create_dir_all(&new_dir_path).map_err(|e| {
            AppError::Database(format!("创建目标目录失败: {}", e))
        })?;

        let new_db_path = new_dir_path.join("clipboard.db");

        if current_db_path == new_db_path {
            return Ok(build_db_info(&new_db_path));
        }

        if new_db_path.exists() {
            return Err(AppError::Database(
                "目标位置已存在数据库文件 clipboard.db，请选择其他目录或先手动删除".to_string()
            ));
        }

        write_conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| AppError::Database(format!("WAL 检查点失败: {}", e)))?;

        let temp_conn = Connection::open_in_memory()
            .map_err(|e| AppError::Database(format!("创建临时连接失败: {}", e)))?;
        let old_conn = std::mem::replace(write_conn, temp_conn);
        drop(old_conn);

        let copy_result = copy_database_files(&current_db_path, &new_db_path);

        if let Err(e) = copy_result {
            log::error!("复制数据库失败，尝试恢复旧连接: {}", e);
            let _ = fs::remove_file(&new_db_path);
            restore_connection(write_conn, &current_db_path);
            return Err(e);
        }

        replace_connection_to_new_db(write_conn, &current_db_path, &new_db_path)?;

        match Connection::open(&new_db_path) {
            Ok(new_read_conn) => {
                let old_read_conn = std::mem::replace(read_conn, new_read_conn);
                drop(old_read_conn);
            }
            Err(open_err) => {
                log::error!("打开新数据库读连接失败: {}", open_err);
                let _ = fs::remove_file(&new_db_path);
                restore_connection(write_conn, &current_db_path);
                return Err(AppError::Database(format!("打开新数据库读连接失败: {}", open_err)));
            }
        }

        let _ = fs::remove_file(&current_db_path);
        let _ = fs::remove_file(current_db_path.with_extension("db-wal"));
        let _ = fs::remove_file(current_db_path.with_extension("db-shm"));

        let config_dir = if new_dir.is_empty() {
            None
        } else {
            Some(new_dir.clone())
        };
        config::save_db_config(&app, config_dir)?;

        Ok(build_db_info(&new_db_path))
    })
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::{
        build_db_info, copy_database_files, get_current_db_path, replace_connection_to_new_db,
    };

    fn unique_temp_dir() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock error")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("clipboard-history-test-{nanos}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn get_current_db_path_returns_file_path() {
        let dir = unique_temp_dir();
        let db_path = dir.join("clipboard.db");
        let conn = Connection::open(&db_path).expect("open db");

        let resolved = get_current_db_path(&conn).expect("get db path");
        assert_eq!(resolved, db_path);

        drop(conn);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn build_db_info_uses_real_size_or_zero() {
        let dir = unique_temp_dir();
        let file = dir.join("a.db");
        std::fs::write(&file, vec![1_u8; 17]).expect("write file");

        let info = build_db_info(&file);
        assert_eq!(info.path, file.to_string_lossy().to_string());
        assert_eq!(info.size, 17);

        let missing = dir.join("missing.db");
        let missing_info = build_db_info(&missing);
        assert_eq!(missing_info.size, 0);

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn copy_database_files_copies_main_and_sidecars() {
        let src_dir = unique_temp_dir();
        let dst_dir = unique_temp_dir();

        let src_db = src_dir.join("clipboard.db");
        std::fs::write(&src_db, b"main").expect("write main db");
        std::fs::write(src_db.with_extension("db-wal"), b"wal").expect("write wal");
        std::fs::write(src_db.with_extension("db-shm"), b"shm").expect("write shm");

        let dst_db = dst_dir.join("clipboard.db");
        copy_database_files(&src_db, &dst_db).expect("copy files");

        assert!(dst_db.exists());
        assert!(dst_db.with_extension("db-wal").exists());
        assert!(dst_db.with_extension("db-shm").exists());

        let _ = std::fs::remove_dir_all(src_dir);
        let _ = std::fs::remove_dir_all(dst_dir);
    }

    #[test]
    fn replace_connection_to_new_db_switches_to_valid_target() {
        let current_dir = unique_temp_dir();
        let target_dir = unique_temp_dir();

        let current_db = current_dir.join("clipboard.db");
        {
            let conn = Connection::open(&current_db).expect("open current db");
            conn.execute("CREATE TABLE history (id INTEGER PRIMARY KEY, text TEXT)", [])
                .expect("create history in current");
            conn.execute("INSERT INTO history (text) VALUES ('current')", [])
                .expect("insert current");
        }

        let target_db = target_dir.join("clipboard.db");
        {
            let conn = Connection::open(&target_db).expect("open target db");
            conn.execute("CREATE TABLE history (id INTEGER PRIMARY KEY, text TEXT)", [])
                .expect("create history in target");
            conn.execute("INSERT INTO history (text) VALUES ('target')", [])
                .expect("insert target");
        }

        let mut conn = Connection::open_in_memory().expect("open memory db");
        replace_connection_to_new_db(&mut conn, &current_db, &target_db).expect("replace connection");

        let text: String = conn
            .query_row("SELECT text FROM history LIMIT 1", [], |row| row.get(0))
            .expect("query migrated connection");
        assert_eq!(text, "target");

        let _ = std::fs::remove_dir_all(current_dir);
        let _ = std::fs::remove_dir_all(target_dir);
    }

    #[test]
    fn replace_connection_to_new_db_rolls_back_when_target_invalid() {
        let current_dir = unique_temp_dir();
        let target_dir = unique_temp_dir();

        let current_db = current_dir.join("clipboard.db");
        {
            let conn = Connection::open(&current_db).expect("open current db");
            conn.execute("CREATE TABLE history (id INTEGER PRIMARY KEY, text TEXT)", [])
                .expect("create history in current");
            conn.execute("INSERT INTO history (text) VALUES ('current')", [])
                .expect("insert current");
        }

        let target_db = target_dir.join("clipboard.db");
        {
            let conn = Connection::open(&target_db).expect("open invalid target db");
            conn.execute("CREATE TABLE not_history (id INTEGER PRIMARY KEY)", [])
                .expect("create invalid schema");
        }

        let mut conn = Connection::open_in_memory().expect("open memory db");
        let result = replace_connection_to_new_db(&mut conn, &current_db, &target_db);
        assert!(result.is_err(), "invalid target should fail");
        assert!(
            !target_db.exists(),
            "invalid target db should be removed during rollback"
        );

        let text: String = conn
            .query_row("SELECT text FROM history LIMIT 1", [], |row| row.get(0))
            .expect("query rolled back connection");
        assert_eq!(text, "current");

        let _ = std::fs::remove_dir_all(current_dir);
        let _ = std::fs::remove_dir_all(target_dir);
    }
}
