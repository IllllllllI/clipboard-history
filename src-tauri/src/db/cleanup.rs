//! 数据清理子模块
//!
//! ## 职责
//! - 解析历史文本中的受管资源路径（图片/SVG）
//! - 维护 `history_assets` 映射并执行删除后的孤儿文件清理
//! - 提供单条、批量、清空等删除流程的复用逻辑
//!
//! ## 输入/输出
//! - 输入：`Connection`、条目 ID 集合或文本
//! - 输出：候选路径集合或 `Result<(), AppError>`
//!
//! ## 错误语义
//! - SQL 操作失败返回 `AppError::Database`
//! - 文件删除失败返回 `AppError::Storage`

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};

use crate::error::AppError;

fn normalize_local_path(raw: &str) -> Option<PathBuf> {
    let mut value = raw.trim().to_string();
    if value.is_empty() {
        return None;
    }

    if let Some(stripped) = value.strip_prefix("file://") {
        value = stripped.to_string();
    }

    #[cfg(target_os = "windows")]
    {
        if value.starts_with('/') && value.chars().nth(2) == Some(':') {
            value = value.trim_start_matches('/').to_string();
        }
    }

    let path = PathBuf::from(value);
    if path.is_absolute() {
        Some(path)
    } else {
        None
    }
}

fn is_generated_clipboard_asset(path: &std::path::Path) -> bool {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_ascii_lowercase();
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_ascii_lowercase();

    (file_name.starts_with("img_") && ext == "png")
        || (file_name.starts_with("svg_") && ext == "svg")
}

pub(crate) fn extract_generated_asset_paths(text: &str) -> HashSet<PathBuf> {
    let mut paths = HashSet::new();

    for line in text.lines() {
        if let Some(path) = normalize_local_path(line) {
            if is_generated_clipboard_asset(&path) {
                paths.insert(path);
            }
        }
    }

    if paths.is_empty() {
        if let Some(path) = normalize_local_path(text) {
            if is_generated_clipboard_asset(&path) {
                paths.insert(path);
            }
        }
    }

    paths
}

pub(crate) fn sync_item_assets_for_text(conn: &Connection, item_id: i64, text: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM history_assets WHERE item_id = ?1",
        params![item_id],
    )
    .map_err(|e| AppError::Database(format!("清理历史资源映射失败: {}", e)))?;

    let paths = extract_generated_asset_paths(text);
    if paths.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
        .map_err(|e| AppError::Database(format!("准备插入历史资源映射失败: {}", e)))?;

    for path in paths {
        let path_str = path.to_string_lossy().to_string();
        stmt.execute(params![item_id, path_str])
            .map_err(|e| AppError::Database(format!("写入历史资源映射失败: {}", e)))?;
    }

    Ok(())
}

pub(crate) fn sync_item_assets_from_history_text(conn: &Connection, item_id: i64) -> Result<HashSet<PathBuf>, AppError> {
    let text: Option<String> = conn
        .query_row("SELECT text FROM history WHERE id = ?1", params![item_id], |row| row.get(0))
        .optional()
        .map_err(|e| AppError::Database(format!("读取条目文本失败: {}", e)))?;

    let Some(text) = text else {
        return Ok(HashSet::new());
    };

    let paths = extract_generated_asset_paths(&text);
    sync_item_assets_for_text(conn, item_id, &text)?;
    Ok(paths)
}

fn collect_paths_from_history_assets(conn: &Connection, ids: &[i64]) -> Result<HashSet<PathBuf>, AppError> {
    if ids.is_empty() {
        return Ok(HashSet::new());
    }

    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT DISTINCT path FROM history_assets WHERE item_id IN ({})",
        placeholders.join(",")
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("准备查询资源映射失败: {}", e)))?;

    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询资源映射失败: {}", e)))?;

    let mut result = HashSet::new();
    for row in rows {
        let path_str = row.map_err(|e| AppError::Database(format!("读取资源映射失败: {}", e)))?;
        if let Some(path) = normalize_local_path(&path_str) {
            result.insert(path);
        }
    }
    Ok(result)
}

pub(crate) fn delete_history_assets_for_ids(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let sql = format!(
        "DELETE FROM history_assets WHERE item_id IN ({})",
        placeholders.join(",")
    );

    conn.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| AppError::Database(format!("删除历史资源映射失败: {}", e)))?;

    Ok(())
}

fn remove_orphan_generated_asset(conn: &Connection, path: &std::path::Path) -> Result<(), AppError> {
    let path_str = path.to_string_lossy().to_string();

    let mut count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM history_assets WHERE path = ?1",
            params![path_str.clone()],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Database(format!("检查资源映射引用失败: {}", e)))?;

    if count == 0 {
        let mut stmt = conn
            .prepare("SELECT id, text FROM history")
            .map_err(|e| AppError::Database(format!("准备回退引用扫描失败: {}", e)))?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| AppError::Database(format!("执行回退引用扫描失败: {}", e)))?;

        let mut matched_ids = Vec::new();
        for row in rows {
            let (item_id, text) = row.map_err(|e| AppError::Database(format!("读取回退引用扫描数据失败: {}", e)))?;
            if extract_generated_asset_paths(&text).contains(path) {
                matched_ids.push(item_id);
            }
        }

        if !matched_ids.is_empty() {
            let mut insert_stmt = conn
                .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
                .map_err(|e| AppError::Database(format!("准备回退写入资源映射失败: {}", e)))?;
            for item_id in matched_ids {
                insert_stmt
                    .execute(params![item_id, path_str.clone()])
                    .map_err(|e| AppError::Database(format!("回退写入资源映射失败: {}", e)))?;
                count += 1;
            }
        }
    }

    if count == 0 {
        match fs::remove_file(path) {
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(AppError::Storage(format!("删除图片文件失败 '{}': {}", path.display(), e)));
            }
        }
    }

    Ok(())
}

pub(crate) fn backfill_missing_history_assets(conn: &Connection, batch_size: usize) -> Result<(), AppError> {
    let batch_size = batch_size.clamp(100, 5_000);

    loop {
        let mut select_stmt = conn
            .prepare(
                "SELECT h.id, h.text
                 FROM history h
                 LEFT JOIN history_assets ha ON ha.item_id = h.id
                 WHERE ha.item_id IS NULL
                 LIMIT ?1",
            )
            .map_err(|e| AppError::Database(format!("准备增量回填查询失败: {}", e)))?;

        let rows = select_stmt
            .query_map([batch_size as i64], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| AppError::Database(format!("查询增量回填数据失败: {}", e)))?;

        let mut pending = Vec::new();
        for row in rows {
            pending.push(
                row.map_err(|e| AppError::Database(format!("读取增量回填数据失败: {}", e)))?
            );
        }

        if pending.is_empty() {
            break;
        }

        let mut insert_stmt = conn
            .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
            .map_err(|e| AppError::Database(format!("准备增量回填插入失败: {}", e)))?;

        for (item_id, text) in pending {
            for path in extract_generated_asset_paths(&text) {
                insert_stmt
                    .execute(params![item_id, path.to_string_lossy().to_string()])
                    .map_err(|e| AppError::Database(format!("写入增量回填映射失败: {}", e)))?;
            }
        }
    }

    Ok(())
}

pub(crate) fn collect_generated_asset_paths_from_ids(conn: &Connection, ids: &[i64]) -> Result<HashSet<PathBuf>, AppError> {
    if ids.is_empty() {
        return Ok(HashSet::new());
    }

    let mut result = collect_paths_from_history_assets(conn, ids)?;

    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let sql = format!("SELECT text FROM history WHERE id IN ({})", placeholders.join(","));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("准备查询待删条目失败: {}", e)))?;

    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询待删条目失败: {}", e)))?;

    for row in rows {
        let text = row.map_err(|e| AppError::Database(format!("读取待删条目失败: {}", e)))?;
        result.extend(extract_generated_asset_paths(&text));
    }

    Ok(result)
}

pub(crate) fn cleanup_generated_assets(conn: &Connection, candidates: HashSet<PathBuf>) -> Result<(), AppError> {
    for path in candidates {
        remove_orphan_generated_asset(conn, &path)?;
    }
    Ok(())
}

pub(crate) fn delete_clip_with_cleanup(conn: &mut Connection, id: i64) -> Result<(), AppError> {
    let mut candidates = collect_paths_from_history_assets(conn, &[id])?;
    if candidates.is_empty() {
        candidates = sync_item_assets_from_history_text(conn, id)?;
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::Database(format!("开始删除事务失败: {}", e)))?;

    tx.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(format!("删除记录失败: {}", e)))?;
    delete_history_assets_for_ids(&tx, &[id])?;
    tx.commit()
        .map_err(|e| AppError::Database(format!("提交删除事务失败: {}", e)))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

pub(crate) fn clear_all_with_cleanup(conn: &mut Connection) -> Result<(), AppError> {
    let mut candidates = HashSet::new();

    let mut asset_stmt = conn
        .prepare("SELECT DISTINCT path FROM history_assets")
        .map_err(|e| AppError::Database(format!("准备查询历史资源映射失败: {}", e)))?;
    let asset_rows = asset_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询历史资源映射失败: {}", e)))?;
    for row in asset_rows {
        let path_str = row.map_err(|e| AppError::Database(format!("读取历史资源映射失败: {}", e)))?;
        if let Some(path) = normalize_local_path(&path_str) {
            candidates.insert(path);
        }
    }

    let mut stmt = conn
        .prepare("SELECT text FROM history")
        .map_err(|e| AppError::Database(format!("准备清空查询失败: {}", e)))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询清空条目失败: {}", e)))?;
    for row in rows {
        let text = row.map_err(|e| AppError::Database(format!("读取清空条目失败: {}", e)))?;
        candidates.extend(extract_generated_asset_paths(&text));
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::Database(format!("开始清空事务失败: {}", e)))?;

    tx.execute("DELETE FROM history", [])
        .map_err(|e| AppError::Database(format!("清空记录失败: {}", e)))?;
    tx.execute("DELETE FROM history_assets", [])
        .map_err(|e| AppError::Database(format!("清空历史资源映射失败: {}", e)))?;
    tx.commit()
        .map_err(|e| AppError::Database(format!("提交清空事务失败: {}", e)))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

pub(crate) fn bulk_delete_with_cleanup(conn: &mut Connection, ids: &[i64]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let candidates = collect_generated_asset_paths_from_ids(conn, ids)?;

    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!("DELETE FROM history WHERE id IN ({})", placeholders.join(","));
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::Database(format!("开始批量删除事务失败: {}", e)))?;

    tx.execute(&sql, params.as_slice())
        .map_err(|e| AppError::Database(format!("批量删除失败: {}", e)))?;
    delete_history_assets_for_ids(&tx, ids)?;
    tx.commit()
        .map_err(|e| AppError::Database(format!("提交批量删除事务失败: {}", e)))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("{}_{}", prefix, nanos));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn setup_history_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite failed");
        conn.execute(
            "CREATE TABLE history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL
            )",
            [],
        )
        .expect("create history table failed");
        conn.execute(
            "CREATE TABLE history_assets (
                item_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                PRIMARY KEY (item_id, path)
            )",
            [],
        )
        .expect("create history_assets table failed");
        conn
    }

    #[test]
    fn extract_generated_asset_paths_only_collects_managed_files() {
        let dir = unique_temp_dir("cliphist_extract_assets");
        let managed_png = dir.join("img_20260101010101000.png");
        let managed_svg = dir.join("svg_20260101010101000.svg");
        let user_png = dir.join("holiday.png");

        let text = format!(
            "{}\n{}\n{}",
            managed_png.to_string_lossy(),
            managed_svg.to_string_lossy(),
            user_png.to_string_lossy(),
        );

        let paths = extract_generated_asset_paths(&text);

        assert!(paths.contains(&managed_png));
        assert!(paths.contains(&managed_svg));
        assert!(!paths.contains(&user_png));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_orphan_generated_asset_deletes_file_when_unreferenced() {
        let dir = unique_temp_dir("cliphist_delete_orphan");
        let file_path = dir.join("img_20260101010101000.png");
        fs::write(&file_path, b"test").expect("create temp file failed");

        let conn = setup_history_conn();
        remove_orphan_generated_asset(&conn, &file_path).expect("orphan cleanup failed");

        assert!(!file_path.exists(), "orphan file should be removed");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_orphan_generated_asset_keeps_file_when_still_referenced() {
        let dir = unique_temp_dir("cliphist_keep_referenced");
        let file_path = dir.join("img_20260101010101000.png");
        fs::write(&file_path, b"test").expect("create temp file failed");

        let conn = setup_history_conn();
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![file_path.to_string_lossy().to_string()],
        )
        .expect("insert history row failed");
        let item_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO history_assets (item_id, path) VALUES (?1, ?2)",
            params![item_id, file_path.to_string_lossy().to_string()],
        )
        .expect("insert history_assets row failed");

        remove_orphan_generated_asset(&conn, &file_path).expect("cleanup should succeed");

        assert!(file_path.exists(), "referenced file should be kept");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_orphan_generated_asset_keeps_file_when_multiline_referenced() {
        let dir = unique_temp_dir("cliphist_keep_multiline");
        let file_path = dir.join("svg_20260101010101000.svg");
        fs::write(&file_path, b"<svg/>").expect("create temp file failed");

        let conn = setup_history_conn();
        let value = format!("line1\n{}\nline3", file_path.to_string_lossy());
        conn.execute("INSERT INTO history (text) VALUES (?1)", params![value])
            .expect("insert multiline history row failed");
        let item_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO history_assets (item_id, path) VALUES (?1, ?2)",
            params![item_id, file_path.to_string_lossy().to_string()],
        )
        .expect("insert history_assets row failed");

        remove_orphan_generated_asset(&conn, &file_path).expect("cleanup should succeed");

        assert!(file_path.exists(), "multiline referenced file should be kept");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_clip_with_cleanup_removes_db_row_and_orphan_file() {
        let dir = unique_temp_dir("cliphist_delete_flow");
        let file_path = dir.join("img_20260101010101000.png");
        fs::write(&file_path, b"test").expect("create temp file failed");

        let mut conn = setup_history_conn();
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![file_path.to_string_lossy().to_string()],
        )
        .expect("insert history row failed");
        let id = conn.last_insert_rowid();

        delete_clip_with_cleanup(&mut conn, id).expect("delete flow should succeed");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history WHERE id = ?1", params![id], |row| row.get(0))
            .expect("count row failed");
        assert_eq!(count, 0, "row should be deleted from history");
        assert!(!file_path.exists(), "orphan managed file should be removed");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn bulk_delete_with_cleanup_keeps_shared_file_and_removes_unique_file() {
        let dir = unique_temp_dir("cliphist_bulk_flow");
        let shared = dir.join("img_20260101010101000.png");
        let unique = dir.join("svg_20260101010101000.svg");
        fs::write(&shared, b"shared").expect("create shared file failed");
        fs::write(&unique, b"unique").expect("create unique file failed");

        let mut conn = setup_history_conn();
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![shared.to_string_lossy().to_string()],
        )
        .expect("insert shared row #1 failed");
        let id1 = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![shared.to_string_lossy().to_string()],
        )
        .expect("insert shared row #2 failed");
        let _id2 = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![unique.to_string_lossy().to_string()],
        )
        .expect("insert unique row failed");
        let id3 = conn.last_insert_rowid();

        bulk_delete_with_cleanup(&mut conn, &[id1, id3]).expect("bulk delete flow should succeed");

        assert!(shared.exists(), "shared file should be kept because id2 still references it");
        assert!(!unique.exists(), "unique file should be removed as orphan");

        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .expect("count remaining rows failed");
        assert_eq!(remaining, 1, "only one row should remain after bulk delete");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clear_all_with_cleanup_removes_managed_files_only() {
        let dir = unique_temp_dir("cliphist_clear_all_flow");
        let managed_png = dir.join("img_20260101010101000.png");
        let managed_svg = dir.join("svg_20260101010101000.svg");
        let user_png = dir.join("holiday.png");

        fs::write(&managed_png, b"managed-png").expect("create managed png failed");
        fs::write(&managed_svg, b"managed-svg").expect("create managed svg failed");
        fs::write(&user_png, b"user-png").expect("create user png failed");

        let mut conn = setup_history_conn();
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![managed_png.to_string_lossy().to_string()],
        )
        .expect("insert managed png row failed");
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![managed_svg.to_string_lossy().to_string()],
        )
        .expect("insert managed svg row failed");
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![user_png.to_string_lossy().to_string()],
        )
        .expect("insert user png row failed");

        clear_all_with_cleanup(&mut conn).expect("clear_all flow should succeed");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .expect("count rows after clear all failed");
        assert_eq!(count, 0, "history should be empty after clear_all");

        assert!(!managed_png.exists(), "managed png should be removed");
        assert!(!managed_svg.exists(), "managed svg should be removed");
        assert!(user_png.exists(), "non-managed local file should not be removed");

        let _ = fs::remove_dir_all(&dir);
    }
}
