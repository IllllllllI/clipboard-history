use super::*;
use crate::db::sql_placeholders;
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

// ── sql_placeholders ────────────────────────────────────────

#[test]
fn sql_placeholders_generates_correct_output() {
    assert_eq!(sql_placeholders(0), "");
    assert_eq!(sql_placeholders(1), "?");
    assert_eq!(sql_placeholders(3), "?,?,?");
}

// ── extract_generated_asset_paths ───────────────────────────

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

// ── normalize_local_path ────────────────────────────────────

#[test]
fn normalize_local_path_handles_empty_and_relative() {
    assert!(normalize_local_path("").is_none());
    assert!(normalize_local_path("   ").is_none());
    assert!(normalize_local_path("relative/path.png").is_none());
}

#[test]
fn normalize_local_path_strips_file_prefix() {
    #[cfg(target_os = "windows")]
    {
        let result = normalize_local_path("file:///C:/test/img.png");
        assert_eq!(result, Some(PathBuf::from("C:/test/img.png")));
    }
    #[cfg(not(target_os = "windows"))]
    {
        let result = normalize_local_path("file:///tmp/img.png");
        assert_eq!(result, Some(PathBuf::from("/tmp/img.png")));
    }
}

// ── remove_orphan / cleanup_generated_assets ────────────────

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

// ── fallback_repair_assets ──────────────────────────────────

#[test]
fn fallback_repair_assets_recovers_missing_mapping() {
    let dir = unique_temp_dir("cliphist_fallback_repair");
    let file_path = dir.join("img_20260101010101000.png");
    fs::write(&file_path, b"data").expect("create temp file failed");

    let conn = setup_history_conn();
    // 插入记录但不插入 history_assets（模拟旧数据）
    conn.execute(
        "INSERT INTO history (text) VALUES (?1)",
        params![file_path.to_string_lossy().to_string()],
    )
    .expect("insert history row failed");

    let mut orphan_set = HashSet::new();
    orphan_set.insert(file_path.clone());

    let repaired = fallback_repair_assets(&conn, &orphan_set).expect("fallback should succeed");
    assert!(repaired.contains(&file_path), "file should be repaired (no longer orphan)");

    // 验证 history_assets 已被修复
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM history_assets WHERE path = ?1",
            params![file_path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .expect("count failed");
    assert!(count > 0, "history_assets should have been repaired");

    let _ = fs::remove_dir_all(&dir);
}

// ── batch cleanup ───────────────────────────────────────────

#[test]
fn cleanup_generated_assets_batch_deletes_only_true_orphans() {
    let dir = unique_temp_dir("cliphist_batch_orphan");
    let orphan = dir.join("img_20260101010101001.png");
    let referenced = dir.join("img_20260101010101002.png");
    fs::write(&orphan, b"orphan").expect("create orphan file failed");
    fs::write(&referenced, b"ref").expect("create referenced file failed");

    let conn = setup_history_conn();
    conn.execute(
        "INSERT INTO history (text) VALUES (?1)",
        params![referenced.to_string_lossy().to_string()],
    )
    .expect("insert history row failed");
    let item_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO history_assets (item_id, path) VALUES (?1, ?2)",
        params![item_id, referenced.to_string_lossy().to_string()],
    )
    .expect("insert history_assets row failed");

    let mut candidates = HashSet::new();
    candidates.insert(orphan.clone());
    candidates.insert(referenced.clone());

    cleanup_generated_assets(&conn, candidates).expect("batch cleanup should succeed");

    assert!(!orphan.exists(), "orphan should be deleted");
    assert!(referenced.exists(), "referenced should be kept");

    let _ = fs::remove_dir_all(&dir);
}

// ── delete_clip_with_cleanup ────────────────────────────────

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

// ── bulk_delete_with_cleanup ────────────────────────────────

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

// ── clear_all_with_cleanup ──────────────────────────────────

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
