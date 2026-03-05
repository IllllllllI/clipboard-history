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
//! - 空白标签名返回明确错误而非静默成功
//! - 更新/删除不存在的 ID 静默成功（幂等语义）

use rusqlite::{params, Connection};
use tauri::State;

use crate::error::AppError;

use super::{db_err, DbState, Tag};

// ── 输入校验 ─────────────────────────────────────────────────

/// 规范化标签名：去除首尾空白，拒绝空白名称
fn validate_tag_name(name: &str) -> Result<String, AppError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::Database("标签名称不能为空".into()));
    }
    Ok(trimmed)
}

// ── 业务逻辑 ─────────────────────────────────────────────────

fn get_tags(conn: &Connection) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn
        .prepare("SELECT id, name, color FROM tags ORDER BY name ASC")
        .map_err(|e| db_err("准备查询失败", e))?;

    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| db_err("查询标签失败", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| db_err("读取标签行失败", e))?;

    Ok(tags)
}

fn create_tag(conn: &Connection, name: String, color: Option<String>) -> Result<Tag, AppError> {
    let name = validate_tag_name(&name)?;

    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        params![name, color],
    )
    .map_err(|e| {
        // UNIQUE 约束冲突给出友好提示
        if let rusqlite::Error::SqliteFailure(err, _) = &e {
            if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE {
                return AppError::Database(format!("标签名 '{}' 已存在", name));
            }
        }
        db_err("创建标签失败", e)
    })?;

    let id = conn.last_insert_rowid();
    Ok(Tag { id, name, color })
}

fn update_tag(
    conn: &Connection,
    id: i64,
    name: String,
    color: Option<String>,
) -> Result<(), AppError> {
    let name = validate_tag_name(&name)?;

    conn.execute(
        "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
        params![name, color, id],
    )
    .map_err(|e| {
        if let rusqlite::Error::SqliteFailure(err, _) = &e {
            if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE {
                return AppError::Database(format!("标签名 '{}' 已存在", name));
            }
        }
        db_err("更新标签失败", e)
    })?;

    Ok(())
}

fn delete_tag(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|e| db_err("删除标签失败", e))?;
    Ok(())
}

fn add_tag_to_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
        params![item_id, tag_id],
    )
    .map_err(|e| db_err("添加标签到条目失败", e))?;
    Ok(())
}

fn remove_tag_from_item(conn: &Connection, item_id: i64, tag_id: i64) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
        params![item_id, tag_id],
    )
    .map_err(|e| db_err("从条目移除标签失败", e))?;
    Ok(())
}

// ── Tauri Commands ───────────────────────────────────────────

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
#[path = "tests/tags_tests.rs"]
mod tests;
