use rusqlite::{params, Connection};

use super::{
    add_clip, auto_clear_before, bulk_pin, get_clip_by_id, get_history, get_stats, import_data,
    load_tags_batch, toggle_favorite, toggle_pin, update_clip, update_picked_color, ImportItem,
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
        );
        CREATE TABLE history_assets (
            item_id INTEGER NOT NULL,
            path TEXT NOT NULL,
            PRIMARY KEY (item_id, path)
        );"
    ).expect("create schema");
    conn
}

#[test]
fn add_clip_deduplicates_non_snippet() {
    let conn = setup_conn();

    add_clip(&conn, "hello".to_string(), 0).expect("first add");
    add_clip(&conn, "hello".to_string(), 0).expect("duplicate add");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .expect("query count");
    assert_eq!(count, 1);
}

#[test]
fn add_clip_returns_inserted_id() {
    let conn = setup_conn();
    let inserted = add_clip(&conn, "first".to_string(), 0).expect("insert should succeed");
    assert!(inserted.is_some());

    let duplicated = add_clip(&conn, "first".to_string(), 0).expect("dedupe should succeed");
    assert!(duplicated.is_none());
}

#[test]
fn toggle_and_bulk_update_fields() {
    let conn = setup_conn();
    conn.execute(
        "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
        params!["a", 1_i64],
    ).expect("insert a");
    let first_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
        params!["b", 2_i64],
    ).expect("insert b");
    let second_id = conn.last_insert_rowid();

    toggle_pin(&conn, first_id, 0).expect("toggle pin");
    toggle_favorite(&conn, first_id, 0).expect("toggle favorite");
    bulk_pin(&conn, &[first_id, second_id]).expect("bulk pin");
    update_clip(&conn, second_id, "b2".to_string()).expect("update clip");
    update_picked_color(&conn, second_id, Some("#112233".to_string())).expect("update color");

    let first_pin: i32 = conn
        .query_row("SELECT is_pinned FROM history WHERE id=?1", params![first_id], |row| row.get(0))
        .expect("query first pin");
    let first_fav: i32 = conn
        .query_row("SELECT is_favorite FROM history WHERE id=?1", params![first_id], |row| row.get(0))
        .expect("query first fav");
    let second_text: String = conn
        .query_row("SELECT text FROM history WHERE id=?1", params![second_id], |row| row.get(0))
        .expect("query second text");
    let second_color: Option<String> = conn
        .query_row("SELECT picked_color FROM history WHERE id=?1", params![second_id], |row| row.get(0))
        .expect("query second color");

    assert_eq!(first_pin, 1);
    assert_eq!(first_fav, 1);
    assert_eq!(second_text, "b2");
    assert_eq!(second_color.as_deref(), Some("#112233"));
}

#[test]
fn import_data_and_history_query_work() {
    let mut conn = setup_conn();
    let items = vec![
        ImportItem { text: "x".to_string(), timestamp: 10, is_pinned: Some(1), is_snippet: Some(0) },
        ImportItem { text: "   ".to_string(), timestamp: 20, is_pinned: Some(0), is_snippet: Some(0) },
        ImportItem { text: "y".to_string(), timestamp: 30, is_pinned: Some(0), is_snippet: Some(1) },
    ];

    import_data(&mut conn, &items).expect("import data");
    let history = get_history(&conn, 10).expect("get history");

    assert_eq!(history.len(), 2);
    assert_eq!(history[0].text, "x");
    assert_eq!(history[0].is_pinned, 1);
}

#[test]
fn auto_clear_before_removes_old_non_pinned_non_favorite() {
    let mut conn = setup_conn();
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 0, 0)",
        params!["old", 100_i64],
    ).expect("insert old");
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 1, 0)",
        params!["pinned", 100_i64],
    ).expect("insert pinned");
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 0, 1)",
        params!["fav", 100_i64],
    ).expect("insert fav");
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 0, 0)",
        params!["new", 1000_i64],
    ).expect("insert new");

    auto_clear_before(&mut conn, 200).expect("auto clear");

    let remaining: Vec<String> = conn
        .prepare("SELECT text FROM history ORDER BY id")
        .expect("prepare query")
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query rows")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect rows");

    assert_eq!(remaining, vec!["pinned", "fav", "new"]);
}

// ── get_stats 单次聚合 ──────────────────────────────────────

#[test]
fn get_stats_returns_correct_aggregates() {
    let conn = setup_conn();

    // 空表应返回全零
    let stats = get_stats(&conn).expect("empty stats");
    assert_eq!(stats.total, 0);
    assert_eq!(stats.pinned, 0);
    assert_eq!(stats.favorites, 0);

    // 插入混合数据
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 1, 0)",
        params!["pinned", now],
    )
    .expect("insert pinned");
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 0, 1)",
        params!["fav", now],
    )
    .expect("insert fav");
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_favorite) VALUES (?1, ?2, 0, 0)",
        params!["plain", now],
    )
    .expect("insert plain");

    let stats = get_stats(&conn).expect("stats with data");
    assert_eq!(stats.total, 3);
    assert_eq!(stats.pinned, 1);
    assert_eq!(stats.favorites, 1);
    // today >= 1 (because all timestamps are from now)
    assert!(stats.today >= 1);
}

// ── load_tags_batch ─────────────────────────────────────────

#[test]
fn load_tags_batch_returns_empty_for_no_ids() {
    let conn = setup_conn();
    let map = load_tags_batch(&conn, &[]).expect("empty ids");
    assert!(map.is_empty());
}

#[test]
fn load_tags_batch_groups_by_item_id() {
    let conn = setup_conn();

    conn.execute(
        "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
        params!["a", 1_i64],
    )
    .expect("insert a");
    let id_a = conn.last_insert_rowid();

    conn.execute("INSERT INTO tags (name, color) VALUES ('red', '#f00')", [])
        .expect("insert tag red");
    let tag_red = conn.last_insert_rowid();
    conn.execute("INSERT INTO tags (name, color) VALUES ('blue', '#00f')", [])
        .expect("insert tag blue");
    let tag_blue = conn.last_insert_rowid();

    conn.execute(
        "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![id_a, tag_red],
    )
    .expect("link red");
    conn.execute(
        "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![id_a, tag_blue],
    )
    .expect("link blue");

    let map = load_tags_batch(&conn, &[id_a]).expect("batch tags");
    let tags = map.get(&id_a).expect("should have tags for id_a");
    assert_eq!(tags.len(), 2);
    // ORDER BY t.name ASC → blue, red
    assert_eq!(tags[0].name, "blue");
    assert_eq!(tags[1].name, "red");
}

// ── get_clip_by_id 标签加载 ─────────────────────────────────

#[test]
fn get_clip_by_id_loads_tags_correctly() {
    let conn = setup_conn();

    conn.execute(
        "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
        params!["hello", 1_i64],
    )
    .expect("insert");
    let id = conn.last_insert_rowid();

    conn.execute("INSERT INTO tags (name, color) VALUES ('urgent', '#ff0')", [])
        .expect("insert tag");
    let tag_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![id, tag_id],
    )
    .expect("link tag");

    let item = get_clip_by_id(&conn, id)
        .expect("query by id")
        .expect("item should exist");
    assert_eq!(item.text, "hello");
    assert_eq!(item.tags.len(), 1);
    assert_eq!(item.tags[0].name, "urgent");
}

#[test]
fn get_clip_by_id_returns_none_for_missing() {
    let conn = setup_conn();
    let result = get_clip_by_id(&conn, 9999).expect("should not error");
    assert!(result.is_none());
}

// ── add_clip snippet 不去重 ─────────────────────────────────

#[test]
fn add_clip_allows_duplicate_snippet() {
    let conn = setup_conn();
    add_clip(&conn, "dup".to_string(), 1).expect("first snippet");
    let second = add_clip(&conn, "dup".to_string(), 1).expect("second snippet");
    assert!(second.is_some(), "snippet should not deduplicate");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .expect("count");
    assert_eq!(count, 2);
}

// ── add_clip 空白文本 ───────────────────────────────────────

#[test]
fn add_clip_rejects_whitespace_only() {
    let conn = setup_conn();
    let result = add_clip(&conn, "   \n\t  ".to_string(), 0).expect("should not error");
    assert!(result.is_none());
}
