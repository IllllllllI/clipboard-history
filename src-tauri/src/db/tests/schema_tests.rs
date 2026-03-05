use std::collections::HashSet;

use rusqlite::Connection;

use super::initialize_schema;

// ── with_fk_off 安全性 ──────────────────────────────────────

#[test]
fn with_fk_off_restores_fk_on_success() {
    let conn = Connection::open_in_memory().expect("create memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    super::with_fk_off(&conn, |_conn| Ok(())).expect("should succeed");

    let fk: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .expect("query fk");
    assert_eq!(fk, 1, "foreign_keys should be re-enabled after success");
}

#[test]
fn with_fk_off_restores_fk_on_error() {
    let conn = Connection::open_in_memory().expect("create memory db");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    let result = super::with_fk_off(&conn, |_conn| {
        Err(crate::error::AppError::Database("test error".into()))
    });
    assert!(result.is_err());

    let fk: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .expect("query fk");
    assert_eq!(fk, 1, "foreign_keys should be re-enabled even after error");
}

// ── 迁移注册表一致性 ────────────────────────────────────────

#[test]
fn migrations_are_monotonically_ordered_and_match_schema_version() {
    let versions: Vec<i64> = super::MIGRATIONS.iter().map(|(v, _)| *v).collect();
    for window in versions.windows(2) {
        assert!(
            window[0] < window[1],
            "migrations must be strictly increasing: {} >= {}",
            window[0],
            window[1]
        );
    }
    assert_eq!(
        *versions.last().expect("at least one migration"),
        super::SCHEMA_VERSION,
        "last migration target must equal SCHEMA_VERSION"
    );
}

// ── 基础功能 ────────────────────────────────────────────────

#[test]
fn initialize_schema_is_idempotent() {
    let conn = Connection::open_in_memory().expect("create memory db");

    initialize_schema(&conn).expect("first init should succeed");
    initialize_schema(&conn).expect("second init should succeed");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='history'", [], |row| row.get(0))
        .expect("query table count");

    let assets_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='history_assets'", [], |row| row.get(0))
        .expect("query history_assets table count");

    assert_eq!(count, 1, "history table should exist exactly once");
    assert_eq!(assets_count, 1, "history_assets table should exist exactly once");
}

#[test]
fn initialize_schema_creates_expected_columns_and_indexes() {
    let conn = Connection::open_in_memory().expect("create memory db");
    initialize_schema(&conn).expect("init should succeed");

    let mut stmt = conn
        .prepare("PRAGMA table_info(history)")
        .expect("prepare table_info");
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .expect("query columns")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect columns");
    let column_set: HashSet<String> = columns.into_iter().collect();

    for required in [
        "id",
        "text",
        "timestamp",
        "is_pinned",
        "is_snippet",
        "is_favorite",
        "picked_color",
    ] {
        assert!(
            column_set.contains(required),
            "missing required column: {required}"
        );
    }

    let mut index_stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
        .expect("prepare index query");
    let index_names = index_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query indexes")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect indexes");
    let index_set: HashSet<String> = index_names.into_iter().collect();

    for required in [
        "idx_history_timestamp",
        "idx_history_pinned_timestamp",
        "idx_history_favorite_timestamp",
        "idx_item_tags_item_id",
        "idx_item_tags_tag_id",
        "idx_history_assets_item_id",
        "idx_history_assets_path",
    ] {
        assert!(
            index_set.contains(required),
            "missing required index: {required}"
        );
    }

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("query user_version");
    assert_eq!(version, super::SCHEMA_VERSION);
}

#[test]
fn initialize_schema_enforces_boolean_flag_checks() {
    let conn = Connection::open_in_memory().expect("create memory db");
    initialize_schema(&conn).expect("init should succeed");

    let invalid_insert = conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_snippet, is_favorite)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        ("invalid", 1_i64, 2_i32, 0_i32, 0_i32),
    );

    assert!(invalid_insert.is_err(), "CHECK 约束应拒绝无效标志值");
}

#[test]
fn initialize_schema_migrates_v3_flags_to_v4_constraints() {
    let conn = Connection::open_in_memory().expect("create memory db");

    conn.execute_batch(
        "CREATE TABLE history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned INTEGER DEFAULT 0,
            is_snippet INTEGER DEFAULT 0,
            is_favorite INTEGER DEFAULT 0,
            picked_color TEXT
        );
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );
        CREATE TABLE item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id)
        );
        CREATE TABLE history_assets (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path)
        );
        PRAGMA user_version = 3;"
    )
    .expect("prepare legacy v3 schema");

    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_snippet, is_favorite)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        ("legacy", 1_i64, 2_i32, -3_i32, 0_i32),
    )
    .expect("insert legacy v3 data");

    initialize_schema(&conn).expect("migrate from v3 to v4");

    let (is_pinned, is_snippet, is_favorite): (i32, i32, i32) = conn
        .query_row(
            "SELECT is_pinned, is_snippet, is_favorite FROM history WHERE text = 'legacy'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("query migrated flags");

    assert_eq!((is_pinned, is_snippet, is_favorite), (1, 1, 0));

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("query user_version after migrate");
    assert_eq!(version, super::SCHEMA_VERSION);

    let invalid_update = conn.execute(
        "UPDATE history SET is_snippet = 7 WHERE text = 'legacy'",
        [],
    );
    assert!(invalid_update.is_err(), "迁移后应启用 CHECK 约束");

    // v5 修复后 history_assets 应该可以正常写入/删除
    conn.execute(
        "INSERT INTO history_assets (item_id, path) VALUES (1, '/tmp/test.png')",
        [],
    )
    .expect("v5 迁移后 history_assets 应该可正常写入");

    conn.execute(
        "DELETE FROM history_assets WHERE item_id = 1",
        [],
    )
    .expect("v5 迁移后 history_assets 应该可正常删除");
}

#[test]
fn v5_migration_repairs_broken_history_assets_fk() {
    let conn = Connection::open_in_memory().expect("create memory db");

    conn.execute_batch("PRAGMA foreign_keys=OFF;").unwrap();
    conn.execute_batch(
        "CREATE TABLE history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
            is_snippet INTEGER NOT NULL DEFAULT 0 CHECK (is_snippet IN (0, 1)),
            is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
            picked_color TEXT
        );
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );
        CREATE TABLE item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE TABLE history_assets (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path),
            FOREIGN KEY (item_id) REFERENCES history_old(id) ON DELETE CASCADE
        );
        INSERT INTO history (text, timestamp) VALUES ('test', 1000);
        INSERT INTO history_assets (item_id, path) VALUES (1, '/tmp/img.png');
        PRAGMA user_version = 4;"
    )
    .expect("prepare broken v4 state");
    conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();

    let broken = conn.execute("DELETE FROM history_assets WHERE item_id = 1", []);
    assert!(broken.is_err(), "应能重现 history_old 外键悬空问题");

    initialize_schema(&conn).expect("v5 repair migration should succeed");

    conn.execute(
        "INSERT INTO history_assets (item_id, path) VALUES (1, '/tmp/new.png')",
        [],
    )
    .expect("修复后 history_assets 应该可正常写入");

    conn.execute("DELETE FROM history_assets WHERE item_id = 1", [])
        .expect("修复后 history_assets 应该可正常删除");

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("query user_version after v5 repair");
    assert_eq!(version, super::SCHEMA_VERSION);
}

#[test]
fn v6_migration_repairs_broken_item_tags_fk() {
    let conn = Connection::open_in_memory().expect("create memory db");

    conn.execute_batch(
        "PRAGMA foreign_keys=OFF;
        CREATE TABLE history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            is_snippet INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            picked_color TEXT
        );
        CREATE TABLE tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT
        );
        CREATE TABLE item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES history_old(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE TABLE history_assets (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path),
            FOREIGN KEY (item_id) REFERENCES history(id) ON DELETE CASCADE
        );
        INSERT INTO history (id, text, timestamp, is_pinned, is_snippet, is_favorite, picked_color)
        VALUES (1, 'hello', 1, 0, 0, 0, NULL);
        INSERT INTO tags (id, name, color) VALUES (1, 't', NULL);
        INSERT INTO item_tags (item_id, tag_id) VALUES (1, 1);
        PRAGMA user_version = 5;
        PRAGMA foreign_keys=ON;"
    )
    .expect("prepare broken v5 state");

    let broken = conn.execute("DELETE FROM item_tags WHERE item_id = 1 AND tag_id = 1", []);
    assert!(broken.is_err(), "应能重现 item_tags 的 history_old 外键悬空问题");

    initialize_schema(&conn).expect("v6 migration should repair broken item_tags fk");

    conn.execute("DELETE FROM item_tags WHERE item_id = 1 AND tag_id = 1", [])
        .expect("修复后 item_tags 应该可正常删除");
    conn.execute("INSERT INTO item_tags (item_id, tag_id) VALUES (1, 1)", [])
        .expect("修复后 item_tags 应该可正常写入");

    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("query user_version after v6 repair");
    assert_eq!(version, super::SCHEMA_VERSION);
}
