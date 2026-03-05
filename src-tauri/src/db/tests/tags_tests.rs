use rusqlite::{params, Connection};

use super::{
    add_tag_to_item, create_tag, delete_tag, get_tags, remove_tag_from_item, update_tag,
    validate_tag_name,
};

fn setup_conn() -> Connection {
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
        );",
    )
    .expect("create schema");
    conn
}

// ── validate_tag_name ────────────────────────────────────────

#[test]
fn validate_trims_whitespace() {
    assert_eq!(validate_tag_name("  hello  ").unwrap(), "hello");
}

#[test]
fn validate_rejects_empty_string() {
    assert!(validate_tag_name("").is_err());
}

#[test]
fn validate_rejects_whitespace_only() {
    assert!(validate_tag_name("   ").is_err());
}

// ── CRUD ─────────────────────────────────────────────────────

#[test]
fn tag_crud_flow_works() {
    let conn = setup_conn();

    let created = create_tag(&conn, "backend".to_string(), Some("#123456".to_string()))
        .expect("create tag");
    assert_eq!(created.name, "backend");

    let tags = get_tags(&conn).expect("get tags");
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].name, "backend");

    update_tag(&conn, created.id, "rust".to_string(), None).expect("update tag");
    let updated = get_tags(&conn).expect("get updated tags");
    assert_eq!(updated[0].name, "rust");
    assert_eq!(updated[0].color, None);

    delete_tag(&conn, created.id).expect("delete tag");
    let remaining = get_tags(&conn).expect("get remaining tags");
    assert!(remaining.is_empty());
}

#[test]
fn create_tag_trims_name() {
    let conn = setup_conn();
    let tag = create_tag(&conn, "  rust  ".to_string(), None).expect("create trimmed");
    assert_eq!(tag.name, "rust");
}

#[test]
fn create_tag_rejects_empty_name() {
    let conn = setup_conn();
    assert!(create_tag(&conn, "".to_string(), None).is_err());
    assert!(create_tag(&conn, "   ".to_string(), None).is_err());
}

#[test]
fn create_tag_duplicate_name_returns_friendly_error() {
    let conn = setup_conn();
    create_tag(&conn, "rust".to_string(), None).expect("first");
    let err = create_tag(&conn, "rust".to_string(), None).unwrap_err();
    let msg = format!("{}", err);
    assert!(msg.contains("已存在"), "expected friendly message, got: {msg}");
}

#[test]
fn update_tag_rejects_empty_name() {
    let conn = setup_conn();
    let tag = create_tag(&conn, "go".to_string(), None).expect("create");
    assert!(update_tag(&conn, tag.id, "".to_string(), None).is_err());
}

#[test]
fn update_tag_duplicate_name_returns_friendly_error() {
    let conn = setup_conn();
    create_tag(&conn, "rust".to_string(), None).expect("first");
    let tag2 = create_tag(&conn, "go".to_string(), None).expect("second");
    let err = update_tag(&conn, tag2.id, "rust".to_string(), None).unwrap_err();
    let msg = format!("{}", err);
    assert!(msg.contains("已存在"), "expected friendly message, got: {msg}");
}

#[test]
fn delete_nonexistent_tag_is_idempotent() {
    let conn = setup_conn();
    // 不报错，幂等
    delete_tag(&conn, 999).expect("delete nonexistent should succeed");
}

// ── 条目-标签关联 ────────────────────────────────────────────

#[test]
fn add_and_remove_item_tag_relation_works() {
    let conn = setup_conn();

    conn.execute(
        "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
        params!["hello", 1_i64],
    )
    .expect("insert history");
    let item_id = conn.last_insert_rowid();

    let tag = create_tag(&conn, "note".to_string(), None).expect("create tag");

    add_tag_to_item(&conn, item_id, tag.id).expect("add relation");
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
            params![item_id, tag.id],
            |row| row.get(0),
        )
        .expect("count");
    assert_eq!(count, 1);

    // 幂等 — 重复添加不报错也不重复行
    add_tag_to_item(&conn, item_id, tag.id).expect("add again");
    let count2: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
            params![item_id, tag.id],
            |row| row.get(0),
        )
        .expect("count after dup");
    assert_eq!(count2, 1, "INSERT OR IGNORE should not duplicate");

    remove_tag_from_item(&conn, item_id, tag.id).expect("remove relation");
    let count3: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
            params![item_id, tag.id],
            |row| row.get(0),
        )
        .expect("count after remove");
    assert_eq!(count3, 0);
}

#[test]
fn remove_nonexistent_relation_is_idempotent() {
    let conn = setup_conn();
    remove_tag_from_item(&conn, 999, 888).expect("remove nonexistent should succeed");
}
