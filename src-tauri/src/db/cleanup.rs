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

fn remove_orphan_generated_asset(conn: &Connection, path: &std::path::Path) -> Result<(), AppError> {
    let path_str = path.to_string_lossy().to_string();

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM history WHERE text = ?1 OR text LIKE ?2 OR text LIKE ?3 OR text LIKE ?4",
            params![
                path_str,
                format!("{}\n%", path.to_string_lossy()),
                format!("%\n{}\n%", path.to_string_lossy()),
                format!("%\n{}", path.to_string_lossy()),
            ],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Database(format!("检查图片引用失败: {}", e)))?;

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

fn collect_generated_asset_paths_from_ids(conn: &Connection, ids: &[i64]) -> Result<HashSet<PathBuf>, AppError> {
    if ids.is_empty() {
        return Ok(HashSet::new());
    }

    let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
    let sql = format!("SELECT text FROM history WHERE id IN ({})", placeholders.join(","));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("准备查询待删条目失败: {}", e)))?;

    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询待删条目失败: {}", e)))?;

    let mut result = HashSet::new();
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

pub(crate) fn delete_clip_with_cleanup(conn: &Connection, id: i64) -> Result<(), AppError> {
    let text: Option<String> = conn
        .query_row("SELECT text FROM history WHERE id = ?1", params![id], |row| row.get(0))
        .optional()
        .map_err(|e| AppError::Database(format!("查询待删除记录失败: {}", e)))?;

    let candidates = text
        .map(|value| extract_generated_asset_paths(&value))
        .unwrap_or_default();

    conn.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(format!("删除记录失败: {}", e)))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

pub(crate) fn clear_all_with_cleanup(conn: &Connection) -> Result<(), AppError> {
    let mut stmt = conn
        .prepare("SELECT text FROM history")
        .map_err(|e| AppError::Database(format!("准备清空查询失败: {}", e)))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| AppError::Database(format!("查询清空条目失败: {}", e)))?;

    let mut candidates = HashSet::new();
    for row in rows {
        let text = row.map_err(|e| AppError::Database(format!("读取清空条目失败: {}", e)))?;
        candidates.extend(extract_generated_asset_paths(&text));
    }

    conn.execute("DELETE FROM history", [])
        .map_err(|e| AppError::Database(format!("清空记录失败: {}", e)))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

pub(crate) fn bulk_delete_with_cleanup(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let candidates = collect_generated_asset_paths_from_ids(conn, ids)?;

    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!("DELETE FROM history WHERE id IN ({})", placeholders.join(","));
    let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| AppError::Database(format!("批量删除失败: {}", e)))?;

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

        remove_orphan_generated_asset(&conn, &file_path).expect("cleanup should succeed");

        assert!(file_path.exists(), "multiline referenced file should be kept");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn delete_clip_with_cleanup_removes_db_row_and_orphan_file() {
        let dir = unique_temp_dir("cliphist_delete_flow");
        let file_path = dir.join("img_20260101010101000.png");
        fs::write(&file_path, b"test").expect("create temp file failed");

        let conn = setup_history_conn();
        conn.execute(
            "INSERT INTO history (text) VALUES (?1)",
            params![file_path.to_string_lossy().to_string()],
        )
        .expect("insert history row failed");
        let id = conn.last_insert_rowid();

        delete_clip_with_cleanup(&conn, id).expect("delete flow should succeed");

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

        let conn = setup_history_conn();
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

        bulk_delete_with_cleanup(&conn, &[id1, id3]).expect("bulk delete flow should succeed");

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

        let conn = setup_history_conn();
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

        clear_all_with_cleanup(&conn).expect("clear_all flow should succeed");

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
