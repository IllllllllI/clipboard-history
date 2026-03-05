use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;

use super::{
    build_db_info, cleanup_file_quietly, cleanup_old_db_files, copy_database_files,
    get_current_db_path, open_and_verify, open_or_restore,
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

fn create_test_db(path: &std::path::Path) {
    let conn = Connection::open(path).expect("open db");
    conn.execute(
        "CREATE TABLE history (id INTEGER PRIMARY KEY, text TEXT)",
        [],
    )
    .expect("create history");
    conn.execute("INSERT INTO history (text) VALUES ('data')", [])
        .expect("insert data");
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

// ── open_and_verify ─────────────────────────────────────────

#[test]
fn open_and_verify_succeeds_for_valid_db() {
    let dir = unique_temp_dir();
    let db_path = dir.join("clipboard.db");
    create_test_db(&db_path);

    let conn = open_and_verify(&db_path).expect("should succeed");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .expect("query");
    assert_eq!(count, 1);

    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn open_and_verify_fails_for_invalid_schema() {
    let dir = unique_temp_dir();
    let db_path = dir.join("clipboard.db");
    let conn = Connection::open(&db_path).expect("open");
    conn.execute("CREATE TABLE not_history (id INTEGER)", [])
        .expect("create wrong table");
    drop(conn);

    let result = open_and_verify(&db_path);
    assert!(result.is_err(), "missing history table should fail verify");

    let _ = std::fs::remove_dir_all(dir);
}

// ── open_or_restore ─────────────────────────────────────────

#[test]
fn open_or_restore_switches_on_valid_target() {
    let old_dir = unique_temp_dir();
    let new_dir = unique_temp_dir();
    let old_db = old_dir.join("clipboard.db");
    let new_db = new_dir.join("clipboard.db");

    create_test_db(&old_db);
    {
        let c = Connection::open(&new_db).expect("open new");
        c.execute("CREATE TABLE history (id INTEGER PRIMARY KEY, text TEXT)", [])
            .expect("create table");
        c.execute("INSERT INTO history (text) VALUES ('new')", [])
            .expect("insert");
    }

    let mut conn = Connection::open_in_memory().expect("open memory");
    open_or_restore(&mut conn, &old_db, &new_db).expect("should switch");

    let text: String = conn
        .query_row("SELECT text FROM history LIMIT 1", [], |row| row.get(0))
        .expect("query");
    assert_eq!(text, "new");

    let _ = std::fs::remove_dir_all(old_dir);
    let _ = std::fs::remove_dir_all(new_dir);
}

#[test]
fn open_or_restore_falls_back_on_invalid_target() {
    let old_dir = unique_temp_dir();
    let new_dir = unique_temp_dir();
    let old_db = old_dir.join("clipboard.db");
    let new_db = new_dir.join("clipboard.db");

    create_test_db(&old_db);
    {
        let c = Connection::open(&new_db).expect("open new");
        c.execute("CREATE TABLE bad (id INTEGER)", [])
            .expect("create wrong table");
    }

    let mut conn = Connection::open_in_memory().expect("open memory");
    let result = open_or_restore(&mut conn, &old_db, &new_db);
    assert!(result.is_err());

    // conn should be restored to old_db
    let text: String = conn
        .query_row("SELECT text FROM history LIMIT 1", [], |row| row.get(0))
        .expect("should query old db after restore");
    assert_eq!(text, "data");

    // new_db should be cleaned up
    assert!(!new_db.exists(), "invalid new db should be removed");

    let _ = std::fs::remove_dir_all(old_dir);
    let _ = std::fs::remove_dir_all(new_dir);
}

// ── cleanup helpers ─────────────────────────────────────────

#[test]
fn cleanup_file_quietly_ignores_missing() {
    let dir = unique_temp_dir();
    let missing = dir.join("nope.db");
    // should not panic
    cleanup_file_quietly(&missing);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cleanup_old_db_files_removes_all_three() {
    let dir = unique_temp_dir();
    let db = dir.join("clipboard.db");
    std::fs::write(&db, b"main").expect("write main");
    std::fs::write(db.with_extension("db-wal"), b"wal").expect("write wal");
    std::fs::write(db.with_extension("db-shm"), b"shm").expect("write shm");

    cleanup_old_db_files(&db);

    assert!(!db.exists());
    assert!(!db.with_extension("db-wal").exists());
    assert!(!db.with_extension("db-shm").exists());

    let _ = std::fs::remove_dir_all(dir);
}
