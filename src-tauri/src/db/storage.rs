//! 数据库文件管理子模块
//!
//! ## 职责
//! - 查询当前数据库路径与文件大小
//! - 执行数据库文件迁移（含 WAL/SHM）与连接切换
//! - 持久化数据库目录配置
//!
//! ## 设计决策
//!
//! ### 连接替换策略
//! 迁移期间需要关闭旧连接释放文件锁，再打开新连接。
//! 使用 `open_or_restore()` 封装：成功返回新连接；失败时自动回退到旧路径，
//! 保证 `write_conn` / `read_conn` 始终指向可用数据库。
//!
//! ### WAL sidecar 文件
//! SQLite WAL 模式下 `.db-wal` / `.db-shm` 可能包含未刷入主文件的数据。
//! 复制时先执行 `PRAGMA wal_checkpoint(TRUNCATE)` 将 WAL 刷入主文件，
//! sidecar 文件复制失败仅记录警告（checkpoint 后数据已安全）。
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

use super::{config, db_err, DbState};

// ── 数据结构 ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct DbInfo {
    pub path: String,
    pub size: u64,
}

// ── 内部 helper ──────────────────────────────────────────────

fn get_current_db_path(conn: &Connection) -> Result<PathBuf, AppError> {
    let path_str: String = conn
        .query_row("PRAGMA database_list", [], |row| row.get::<_, String>(2))
        .map_err(|e| db_err("获取当前数据库路径失败", e))?;
    Ok(PathBuf::from(path_str))
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
        app.path()
            .app_data_dir()
            .map_err(|e| db_err("获取应用数据目录失败", e))
    } else {
        Ok(PathBuf::from(new_dir))
    }
}

/// 复制数据库主文件及 WAL sidecar 文件
///
/// 主文件复制失败视为致命错误。
/// sidecar 文件在 checkpoint 后通常为空/可重建，
/// 复制失败仅记录警告不中断迁移。
fn copy_database_files(src: &Path, dst: &Path) -> Result<(), AppError> {
    fs::copy(src, dst).map_err(|e| db_err("复制数据库文件失败", e))?;

    for ext in ["db-wal", "db-shm"] {
        let sidecar_src = src.with_extension(ext);
        if sidecar_src.exists() {
            if let Err(e) = fs::copy(&sidecar_src, dst.with_extension(ext)) {
                log::warn!("复制 sidecar {} 失败（checkpoint 后通常安全）: {}", ext, e);
            }
        }
    }
    Ok(())
}

/// 打开数据库连接并验证 schema；失败时回退到旧路径
///
/// 返回 `Ok(conn)` 或回退后的 `Err`，保证调用方总有可用连接。
fn open_and_verify(db_path: &Path) -> Result<Connection, AppError> {
    let conn = Connection::open(db_path)
        .map_err(|e| db_err("打开数据库失败", e))?;
    conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

    conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get::<_, i64>(0))
        .map_err(|e| db_err("验证数据库失败", e))?;
    Ok(conn)
}

/// 尝试打开新路径；失败时清理新文件并回退到旧路径
///
/// 确保出口时 `*conn` 始终指向可用数据库，消除"指向空 in-memory DB"的窗口。
fn open_or_restore(
    conn: &mut Connection,
    old_path: &Path,
    new_path: &Path,
) -> Result<(), AppError> {
    match open_and_verify(new_path) {
        Ok(new_conn) => {
            *conn = new_conn;
            Ok(())
        }
        Err(e) => {
            log::error!("打开/验证新数据库失败: {}", e);
            cleanup_file_quietly(new_path);
            // 回退到旧路径
            *conn = Connection::open(old_path)
                .map_err(|re| db_err("回退旧连接也失败（数据库可能不可用）", re))?;
            conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
            Err(e)
        }
    }
}

/// 尝试删除文件，失败仅记录警告
fn cleanup_file_quietly(path: &Path) {
    if let Err(e) = fs::remove_file(path) {
        if e.kind() != std::io::ErrorKind::NotFound {
            log::warn!("清理文件 '{}' 失败: {}", path.display(), e);
        }
    }
}

/// 删除旧数据库主文件及 sidecar，失败记录警告
fn cleanup_old_db_files(db_path: &Path) {
    cleanup_file_quietly(db_path);
    cleanup_file_quietly(&db_path.with_extension("db-wal"));
    cleanup_file_quietly(&db_path.with_extension("db-shm"));
}

// ── Tauri Commands ───────────────────────────────────────────

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

        fs::create_dir_all(&new_dir_path)
            .map_err(|e| db_err("创建目标目录失败", e))?;

        let new_db_path = new_dir_path.join("clipboard.db");

        if current_db_path == new_db_path {
            return Ok(build_db_info(&new_db_path));
        }
        if new_db_path.exists() {
            return Err(AppError::Database(
                "目标位置已存在数据库文件 clipboard.db，请选择其他目录或先手动删除".into(),
            ));
        }

        // ── Step 1: 将 WAL 数据刷入主文件 ──
        write_conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| db_err("WAL 检查点失败", e))?;

        // ── Step 2: 关闭旧连接释放文件锁 ──
        // 用 in-memory 占位，立即在 Step 4 替换为新/旧连接
        let placeholder = Connection::open_in_memory()
            .map_err(|e| db_err("创建占位连接失败", e))?;
        let old_write = std::mem::replace(write_conn, placeholder);
        drop(old_write);

        // ── Step 3: 复制文件 ──
        if let Err(e) = copy_database_files(&current_db_path, &new_db_path) {
            log::error!("复制数据库失败，恢复旧连接: {}", e);
            cleanup_file_quietly(&new_db_path);
            // 直接复用 open_or_restore 的恢复逻辑（new_path 已清理，会直接走回退分支）
            *write_conn = Connection::open(&current_db_path)
                .map_err(|re| db_err("恢复旧写连接失败", re))?;
            write_conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
            return Err(e);
        }

        // ── Step 4: 替换写连接 ──
        open_or_restore(write_conn, &current_db_path, &new_db_path)?;

        // ── Step 5: 替换读连接 ──
        let new_read = Connection::open(&new_db_path)
            .map_err(|e| {
                log::error!("打开新数据库读连接失败: {}", e);
                cleanup_file_quietly(&new_db_path);
                // 回退写连接
                if let Ok(c) = Connection::open(&current_db_path) {
                    c.execute_batch("PRAGMA journal_mode=WAL;").ok();
                    *write_conn = c;
                }
                db_err("打开新数据库读连接失败", e)
            })?;
        let old_read = std::mem::replace(read_conn, new_read);
        drop(old_read);

        // ── Step 6: 清理旧文件 ──
        cleanup_old_db_files(&current_db_path);

        // ── Step 7: 持久化配置 ──
        let config_dir = if new_dir.is_empty() { None } else { Some(new_dir.clone()) };
        config::save_db_config(&app, config_dir)?;

        Ok(build_db_info(&new_db_path))
    })
}

#[cfg(test)]
#[path = "tests/storage_tests.rs"]
mod tests;
