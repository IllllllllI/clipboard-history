//! 标签管理子模块
//!
//! ## 职责
//! - 提供标签的增删改查能力
//! - 管理历史条目与标签的关联关系（`item_tags`）
//! - 暴露标签相关 Tauri command
//!
//! ## 输入/输出
//! - 输入：`State<DbState>`、标签字段、条目/标签 ID
//! - 输出：`Tag`、`Vec<Tag>` 或 `Result<(), AppError>`
//!
//! ## 错误语义
//! - 标签查询与写入失败统一映射为 `AppError::Database`

use rusqlite::{params, Connection};
use tauri::State;

use crate::error::AppError;

use super::{DbState, Tag};

fn get_tags(conn: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name ASC")
        .map_err(|e| AppError::Database(format!("准备查询失败: {}", e)))?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| AppError::Database(format!("查询标签失败: {}", e)))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("读取行失败: {}", e)))?;

    Ok(tags)
}

fn create_tag(conn: &Connection, name: String, color: Option<String>) -> Result<Tag, AppError> {
    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        params![name, color],
    ).map_err(|e| AppError::Database(format!("创建标签失败: {}", e)))?;

    let id = conn.last_insert_rowid();
    Ok(Tag { id, name, color })
}

fn update_tag(conn: &Connection, id: i64, name: String, color: Option<String>) -> Result<(), AppError> {
    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    ).map_err(|e| AppError::Database(format!("更新标签失败: {}", e)))?;

    Ok(())
}

fn delete_tag(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(format!("删除标签失败: {}", e)))?;
    Ok(())
}

fn add_tag_to_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![item_id, tag_id],
    ).map_err(|e| AppError::Database(format!("添加标签到条目失败: {}", e)))?;
    Ok(())
}

fn remove_tag_from_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
        params![item_id, tag_id],
    ).map_err(|e| AppError::Database(format!("从条目移除标签失败: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn db_get_tags(state: State<'_, DbState>) -> Result<Vec<Tag>, AppError> {
    super::with_read_conn(&state, get_tags)
}

#[tauri::command]
pub fn db_create_tag(
    state: State<'_, DbState>,
    name: String,
    color: Option<String>,
) -> Result<Tag, AppError> {
    super::with_conn_mut(&state, |conn| create_tag(conn, name, color))
}

#[tauri::command]
pub fn db_update_tag(
    state: State<'_, DbState>,
    id: i64,
    name: String,
    color: Option<String>,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| update_tag(conn, id, name, color))
}

#[tauri::command]
pub fn db_delete_tag(state: State<'_, DbState>, id: i64) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| delete_tag(conn, id))
}

#[tauri::command]
pub fn db_add_tag_to_item(
    state: State<'_, DbState>,
    item_id: i64,
    tag_id: i64,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| add_tag_to_item(conn, item_id, tag_id))
}

#[tauri::command]
pub fn db_remove_tag_from_item(
    state: State<'_, DbState>,
    item_id: i64,
    tag_id: i64,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| remove_tag_from_item(conn, item_id, tag_id))
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::{add_tag_to_item, create_tag, delete_tag, get_tags, remove_tag_from_item, update_tag};

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
            );"
        ).expect("create schema");
        conn
    }

    #[test]
    fn tag_crud_flow_works() {
        let conn = setup_conn();

        let created = create_tag(&conn, "backend".to_string(), Some("#123456".to_string()))
            .expect("create tag");

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
    fn add_and_remove_item_tag_relation_works() {
        let conn = setup_conn();

        conn.execute(
            "INSERT INTO history (text, timestamp) VALUES (?1, ?2)",
            params!["hello", 1_i64],
        ).expect("insert history");
        let item_id = conn.last_insert_rowid();

        let tag = create_tag(&conn, "note".to_string(), None).expect("create tag");

        add_tag_to_item(&conn, item_id, tag.id).expect("add relation");
        let rel_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2", params![item_id, tag.id], |row| row.get(0))
            .expect("query relation count");
        assert_eq!(rel_count, 1);

        remove_tag_from_item(&conn, item_id, tag.id).expect("remove relation");
        let rel_count_after: i64 = conn
            .query_row("SELECT COUNT(*) FROM item_tags WHERE item_id = ?1 AND tag_id = ?2", params![item_id, tag.id], |row| row.get(0))
            .expect("query relation count after");
        assert_eq!(rel_count_after, 0);
    }
}
