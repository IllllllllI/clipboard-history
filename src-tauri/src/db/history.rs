//! 历史记录子模块
//!
//! ## 职责
//! - 提供历史记录增删改查、置顶/收藏、统计与导入能力
//! - 封装自动清理逻辑，并与资源清理子模块协同
//! - 暴露对应的 Tauri command 给前端调用
//!
//! ## 输入/输出
//! - 输入：`State<DbState>`、历史记录参数、导入数据集合
//! - 输出：`Result<T, AppError>`，其中 `T` 包含 `Vec<ClipItem>`、`AppStats` 等
//!
//! ## 错误语义
//! - 数据访问与 SQL 执行失败统一映射为 `AppError::Database`

use std::collections::HashMap;

use rusqlite::{params, Connection, ToSql};
use serde::Deserialize;
use tauri::{State};

use crate::error::AppError;

use super::{AppStats, ClipItem, DbState, Tag};

#[derive(Debug, Deserialize)]
pub struct ImportItem {
    pub text: String,
    #[serde(default)]
    pub timestamp: i64,
    pub is_pinned: Option<i32>,
    pub is_snippet: Option<i32>,
}

fn normalize_flag(value: i32) -> i32 {
    if value == 0 { 0 } else { 1 }
}

fn auto_clear_before(conn: &mut Connection, cutoff: i64) -> Result<(), AppError> {
    let mut stmt = conn
        .prepare("SELECT id FROM history WHERE timestamp < ?1 AND is_pinned = 0 AND is_favorite = 0")
        .map_err(|e| AppError::Database(format!("准备自动清理查询失败: {}", e)))?;
    let rows = stmt
        .query_map(params![cutoff], |row| row.get::<_, i64>(0))
        .map_err(|e| AppError::Database(format!("查询自动清理条目失败: {}", e)))?;

    let mut ids = Vec::new();
    for row in rows {
        ids.push(row.map_err(|e| AppError::Database(format!("读取自动清理条目失败: {}", e)))?);
    }

    let candidates = super::cleanup::collect_generated_asset_paths_from_ids(conn, &ids)?;

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::Database(format!("开始自动清理事务失败: {}", e)))?;
    tx.execute(
        "DELETE FROM history WHERE timestamp < ?1 AND is_pinned = 0 AND is_favorite = 0",
        params![cutoff],
    ).map_err(|e| AppError::Database(format!("自动清理失败: {}", e)))?;
    super::cleanup::delete_history_assets_for_ids(&tx, &ids)?;
    tx.commit()
        .map_err(|e| AppError::Database(format!("提交自动清理事务失败: {}", e)))?;

    super::cleanup::cleanup_generated_assets(conn, candidates)
}

fn get_stats(conn: &Connection) -> Result<AppStats, AppError> {
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("查询总数失败: {}", e)))?;

    let pinned: i64 = conn
        .query_row("SELECT COUNT(*) FROM history WHERE is_pinned = 1", [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("查询置顶数失败: {}", e)))?;

    let start_of_day = {
        let now = chrono::Local::now();
        now.date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(now.timezone())
            .unwrap()
            .timestamp_millis()
    };

    let today: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM history WHERE timestamp >= ?1",
            params![start_of_day],
            |row| row.get(0),
        )
        .map_err(|e| AppError::Database(format!("查询今日数失败: {}", e)))?;

    let favorites: i64 = conn
        .query_row("SELECT COUNT(*) FROM history WHERE is_favorite = 1", [], |row| row.get(0))
        .map_err(|e| AppError::Database(format!("查询收藏数失败: {}", e)))?;

    Ok(AppStats { total, today, pinned, favorites })
}

fn get_history(conn: &Connection, limit: i64) -> Result<Vec<ClipItem>, AppError> {
    let limit = limit.clamp(1, 5000);

    #[derive(Debug)]
    struct BaseItem {
        id: i64,
        text: String,
        timestamp: i64,
        is_pinned: i32,
        is_snippet: i32,
        is_favorite: i32,
        picked_color: Option<String>,
    }

    let mut stmt = conn
        .prepare(" 
            SELECT h.id, h.text, h.timestamp, h.is_pinned, h.is_snippet, h.is_favorite, h.picked_color
            FROM history h
            ORDER BY h.is_pinned DESC, h.timestamp DESC
            LIMIT ?1
        ")
        .map_err(|e| AppError::Database(format!("准备查询失败: {}", e)))?;

    let base_items = stmt
        .query_map(params![limit], |row| {
            Ok(BaseItem {
                id: row.get(0)?,
                text: row.get(1)?,
                timestamp: row.get(2)?,
                is_pinned: row.get(3)?,
                is_snippet: row.get(4)?,
                is_favorite: row.get(5)?,
                picked_color: row.get(6)?,
            })
        })
        .map_err(|e| AppError::Database(format!("查询历史失败: {}", e)))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::Database(format!("读取行失败: {}", e)))?;

    if base_items.is_empty() {
        return Ok(Vec::new());
    }

    let ids: Vec<i64> = base_items.iter().map(|item| item.id).collect();
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "SELECT it.item_id, t.id, t.name, t.color
         FROM item_tags it
         JOIN tags t ON it.tag_id = t.id
         WHERE it.item_id IN ({})
         ORDER BY t.name ASC",
        placeholders.join(",")
    );

    let params: Vec<&dyn ToSql> = ids.iter().map(|id| id as &dyn ToSql).collect();
    let mut tag_stmt = conn
        .prepare(&sql)
        .map_err(|e| AppError::Database(format!("准备标签批量查询失败: {}", e)))?;

    let tag_rows = tag_stmt
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                Tag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                },
            ))
        })
        .map_err(|e| AppError::Database(format!("查询标签失败: {}", e)))?;

    let mut tags_by_item: HashMap<i64, Vec<Tag>> = HashMap::new();
    for row in tag_rows {
        let (item_id, tag) = row.map_err(|e| AppError::Database(format!("读取标签行失败: {}", e)))?;
        tags_by_item.entry(item_id).or_default().push(tag);
    }

    let items = base_items
        .into_iter()
        .map(|item| ClipItem {
            id: item.id,
            text: item.text,
            timestamp: item.timestamp,
            is_pinned: item.is_pinned,
            is_snippet: item.is_snippet,
            is_favorite: item.is_favorite,
            tags: tags_by_item.remove(&item.id).unwrap_or_default(),
            picked_color: item.picked_color,
        })
        .collect();

    Ok(items)
}

fn get_clip_by_id(conn: &Connection, id: i64) -> Result<Option<ClipItem>, AppError> {
    let mut stmt = conn
        .prepare(
            "
            SELECT h.id, h.text, h.timestamp, h.is_pinned, h.is_snippet, h.is_favorite,
                   COALESCE((
                       SELECT json_group_array(json_object('id', t.id, 'name', t.name, 'color', t.color))
                       FROM item_tags it
                       JOIN tags t ON it.tag_id = t.id
                       WHERE it.item_id = h.id
                   ), '[]') as tags,
                   h.picked_color
            FROM history h
            WHERE h.id = ?1
            LIMIT 1
            ",
        )
        .map_err(|e| AppError::Database(format!("准备按 ID 查询失败: {}", e)))?;

    let mut rows = stmt
        .query(params![id])
        .map_err(|e| AppError::Database(format!("按 ID 查询历史失败: {}", e)))?;

    if let Some(row) = rows
        .next()
        .map_err(|e| AppError::Database(format!("读取按 ID 查询结果失败: {}", e)))?
    {
        let tags_json: String = row.get(6).map_err(|e| AppError::Database(format!("读取标签 JSON 失败: {}", e)))?;
        let tags: Vec<Tag> = serde_json::from_str(&tags_json).unwrap_or_default();
        let item = ClipItem {
            id: row.get(0).map_err(|e| AppError::Database(format!("读取 id 失败: {}", e)))?,
            text: row.get(1).map_err(|e| AppError::Database(format!("读取 text 失败: {}", e)))?,
            timestamp: row.get(2).map_err(|e| AppError::Database(format!("读取 timestamp 失败: {}", e)))?,
            is_pinned: row.get(3).map_err(|e| AppError::Database(format!("读取 is_pinned 失败: {}", e)))?,
            is_snippet: row.get(4).map_err(|e| AppError::Database(format!("读取 is_snippet 失败: {}", e)))?,
            is_favorite: row.get(5).map_err(|e| AppError::Database(format!("读取 is_favorite 失败: {}", e)))?,
            tags,
            picked_color: row.get(7).map_err(|e| AppError::Database(format!("读取 picked_color 失败: {}", e)))?,
        };
        Ok(Some(item))
    } else {
        Ok(None)
    }
}

fn add_clip(conn: &Connection, text: String, is_snippet: i32) -> Result<Option<i64>, AppError> {
        let is_snippet = normalize_flag(is_snippet);

    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }

    if is_snippet == 0 {
        let last_text: Option<String> = conn
            .query_row(
                "SELECT text FROM history ORDER BY timestamp DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .ok();
        if last_text.as_deref() == Some(&text) {
            return Ok(None);
        }
    }

    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_snippet) VALUES (?1, ?2, 0, ?3)",
        params![text, now, is_snippet],
    ).map_err(|e| AppError::Database(format!("插入记录失败: {}", e)))?;

    let inserted_id = conn.last_insert_rowid();
    super::cleanup::sync_item_assets_for_text(conn, inserted_id, &text)?;

    Ok(Some(inserted_id))
}

fn toggle_pin(conn: &Connection, id: i64, current_pinned: i32) -> Result<(), AppError> {
    let new_val = if current_pinned != 0 { 0 } else { 1 };
    conn.execute(
        "UPDATE history SET is_pinned = ?1 WHERE id = ?2",
        params![new_val, id],
    ).map_err(|e| AppError::Database(format!("切换置顶失败: {}", e)))?;
    Ok(())
}

fn toggle_favorite(conn: &Connection, id: i64, current_favorite: i32) -> Result<(), AppError> {
    let new_val = if current_favorite != 0 { 0 } else { 1 };
    conn.execute(
        "UPDATE history SET is_favorite = ?1 WHERE id = ?2",
        params![new_val, id],
    ).map_err(|e| AppError::Database(format!("切换收藏失败: {}", e)))?;
    Ok(())
}

fn bulk_pin(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    let placeholders: Vec<String> = ids.iter().map(|_| "?".to_string()).collect();
    let sql = format!(
        "UPDATE history SET is_pinned = 1 WHERE id IN ({})",
        placeholders.join(",")
    );
    let params: Vec<&dyn ToSql> = ids.iter().map(|id| id as &dyn ToSql).collect();
    conn.execute(&sql, params.as_slice())
        .map_err(|e| AppError::Database(format!("批量置顶失败: {}", e)))?;
    Ok(())
}

fn update_clip(conn: &Connection, id: i64, new_text: String) -> Result<(), AppError> {
    conn.execute(
        "UPDATE history SET text = ?1 WHERE id = ?2",
        params![new_text, id],
    ).map_err(|e| AppError::Database(format!("更新记录失败: {}", e)))?;
    super::cleanup::sync_item_assets_for_text(conn, id, &new_text)?;
    Ok(())
}

fn update_picked_color(conn: &Connection, id: i64, color: Option<String>) -> Result<(), AppError> {
    conn.execute(
        "UPDATE history SET picked_color = ?1 WHERE id = ?2",
        params![color, id],
    ).map_err(|e| AppError::Database(format!("更新调色板颜色失败: {}", e)))?;
    Ok(())
}

fn import_data(conn: &mut Connection, items: &[ImportItem]) -> Result<(), AppError> {
    let tx = conn.unchecked_transaction().map_err(|e| {
        AppError::Database(format!("开始事务失败: {}", e))
    })?;

    for item in items {
        if item.text.trim().is_empty() {
            continue;
        }
        let timestamp = if item.timestamp > 0 {
            item.timestamp
        } else {
            chrono::Utc::now().timestamp_millis()
        };
        tx.execute(
            "INSERT INTO history (text, timestamp, is_pinned, is_snippet) VALUES (?1, ?2, ?3, ?4)",
            params![
                item.text,
                timestamp,
                normalize_flag(item.is_pinned.unwrap_or(0)),
                normalize_flag(item.is_snippet.unwrap_or(0)),
            ],
        ).map_err(|e| AppError::Database(format!("导入记录失败: {}", e)))?;

        let item_id = tx.last_insert_rowid();
        for path in super::cleanup::extract_generated_asset_paths(&item.text) {
            tx.execute(
                "INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)",
                params![item_id, path.to_string_lossy().to_string()],
            ).map_err(|e| AppError::Database(format!("导入资源映射失败: {}", e)))?;
        }
    }

    tx.commit().map_err(|e| AppError::Database(format!("提交事务失败: {}", e)))?;
    Ok(())
}

#[tauri::command]
pub fn db_auto_clear(state: State<'_, DbState>, auto_clear_days: i64) -> Result<(), AppError> {
    if auto_clear_days <= 0 {
        return Ok(());
    }
    super::with_conn_mut(&state, |conn| {
        let cutoff = chrono::Utc::now().timestamp_millis() - (auto_clear_days * 24 * 60 * 60 * 1000);
        auto_clear_before(conn, cutoff)
    })
}

#[tauri::command]
pub fn db_get_stats(state: State<'_, DbState>) -> Result<AppStats, AppError> {
    super::with_read_conn(&state, get_stats)
}

#[tauri::command]
pub fn db_get_history(state: State<'_, DbState>, limit: i64) -> Result<Vec<ClipItem>, AppError> {
    super::with_read_conn(&state, |conn| get_history(conn, limit))
}

#[tauri::command]
pub fn db_add_clip(
    state: State<'_, DbState>,
    text: String,
    is_snippet: i32,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| {
        let _ = add_clip(conn, text, is_snippet)?;
        Ok(())
    })
}

#[tauri::command]
pub fn db_add_clip_and_get(
    state: State<'_, DbState>,
    text: String,
    is_snippet: i32,
) -> Result<Option<ClipItem>, AppError> {
    super::with_conn_mut(&state, |conn| {
        let inserted_id = add_clip(conn, text, is_snippet)?;
        match inserted_id {
            Some(id) => get_clip_by_id(conn, id),
            None => Ok(None),
        }
    })
}

#[tauri::command]
pub fn db_toggle_pin(
    state: State<'_, DbState>,
    id: i64,
    current_pinned: i32,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| toggle_pin(conn, id, current_pinned))
}

#[tauri::command]
pub fn db_toggle_favorite(
    state: State<'_, DbState>,
    id: i64,
    current_favorite: i32,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| toggle_favorite(conn, id, current_favorite))
}

#[tauri::command]
pub fn db_delete_clip(state: State<'_, DbState>, id: i64) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| super::cleanup::delete_clip_with_cleanup(conn, id))
}

#[tauri::command]
pub fn db_clear_all(state: State<'_, DbState>) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| super::cleanup::clear_all_with_cleanup(conn))
}

#[tauri::command]
pub fn db_bulk_delete(state: State<'_, DbState>, ids: Vec<i64>) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| super::cleanup::bulk_delete_with_cleanup(conn, &ids))
}

#[tauri::command]
pub fn db_bulk_pin(state: State<'_, DbState>, ids: Vec<i64>) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| bulk_pin(conn, &ids))
}

#[tauri::command]
pub fn db_update_clip(
    state: State<'_, DbState>,
    id: i64,
    new_text: String,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| update_clip(conn, id, new_text))
}

#[tauri::command]
pub fn db_update_picked_color(
    state: State<'_, DbState>,
    id: i64,
    color: Option<String>,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| update_picked_color(conn, id, color))
}

#[tauri::command]
pub fn db_import_data(
    state: State<'_, DbState>,
    items: Vec<ImportItem>,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| import_data(conn, &items))
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};

    use super::{
        add_clip, auto_clear_before, bulk_pin, get_history, import_data, toggle_favorite, toggle_pin,
        update_clip, update_picked_color, ImportItem,
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
}
