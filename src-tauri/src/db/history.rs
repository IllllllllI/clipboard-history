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

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, ToSql};
use serde::Deserialize;
use tauri::State;

use crate::error::AppError;

use super::{db_err, sql_placeholders, AppStats, ClipFormat, ClipItem, DbState, Tag};

// ── 数据结构 ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ImportItem {
    pub text: String,
    #[serde(default)]
    pub timestamp: i64,
    pub is_pinned: Option<i32>,
    pub is_snippet: Option<i32>,
}

// ── 内部 helper ──────────────────────────────────────────────

fn normalize_flag(value: i32) -> i32 {
    if value == 0 { 0 } else { 1 }
}

/// 批量加载指定条目的标签
///
/// 统一的标签加载入口，`get_history` 和 `get_clip_by_id` 共用，
/// 消除原来两处不同的加载策略（batch query vs `json_group_array` 子查询）。
fn load_tags_batch(conn: &Connection, ids: &[i64]) -> Result<HashMap<i64, Vec<Tag>>, AppError> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let sql = format!(
        "SELECT it.item_id, t.id, t.name, t.color
         FROM item_tags it
         JOIN tags t ON it.tag_id = t.id
         WHERE it.item_id IN ({})
         ORDER BY t.name ASC",
        sql_placeholders(ids.len())
    );
    let params: Vec<&dyn ToSql> = ids.iter().map(|id| id as &dyn ToSql).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| db_err("准备标签查询失败", e))?;
    let rows = stmt
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
        .map_err(|e| db_err("查询标签失败", e))?;

    let mut map: HashMap<i64, Vec<Tag>> = HashMap::new();
    for row in rows {
        let (item_id, tag) = row.map_err(|e| db_err("读取标签行失败", e))?;
        map.entry(item_id).or_default().push(tag);
    }
    Ok(map)
}

/// 切换布尔字段（置顶/收藏）的参数化实现
///
/// 使用枚举而非动态字符串拼 SQL，避免注入风险。
enum ToggleField {
    Pin,
    Favorite,
}

fn toggle_field(conn: &Connection, field: ToggleField, id: i64, current: i32) -> Result<(), AppError> {
    let new_val = if current != 0 { 0 } else { 1 };
    let (sql, label) = match field {
        ToggleField::Pin => ("UPDATE history SET is_pinned = ?1 WHERE id = ?2", "置顶"),
        ToggleField::Favorite => ("UPDATE history SET is_favorite = ?1 WHERE id = ?2", "收藏"),
    };
    conn.execute(sql, params![new_val, id])
        .map_err(|e| db_err(&format!("切换{}失败", label), e))?;
    Ok(())
}

/// 加载指定条目的附加格式数据
fn load_formats(conn: &Connection, item_id: i64) -> Result<Vec<ClipFormat>, AppError> {
    let mut stmt = conn
        .prepare("SELECT format, content FROM clip_formats WHERE item_id = ?1 ORDER BY format")
        .map_err(|e| db_err("准备格式查询失败", e))?;
    let rows = stmt
        .query_map(params![item_id], |row| {
            Ok(ClipFormat {
                format: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|e| db_err("查询格式失败", e))?;

    let mut formats = Vec::new();
    for row in rows {
        formats.push(row.map_err(|e| db_err("读取格式行失败", e))?);
    }
    Ok(formats)
}

/// 插入附加格式数据（HTML/RTF/图片路径）
fn insert_formats(conn: &Connection, item_id: i64, formats: &[(&str, &str)]) -> Result<(), AppError> {
    if formats.is_empty() {
        return Ok(());
    }
    let mut stmt = conn
        .prepare("INSERT OR REPLACE INTO clip_formats (item_id, format, content) VALUES (?1, ?2, ?3)")
        .map_err(|e| db_err("准备格式插入失败", e))?;
    for &(format, content) in formats {
        stmt.execute(params![item_id, format, content])
            .map_err(|e| db_err(&format!("插入格式 {} 失败", format), e))?;
    }
    Ok(())
}

// ── 业务逻辑 ─────────────────────────────────────────────────

fn auto_clear_before(conn: &mut Connection, cutoff: i64) -> Result<(), AppError> {
    let mut stmt = conn
        .prepare("SELECT id FROM history WHERE timestamp < ?1 AND is_pinned = 0 AND is_favorite = 0")
        .map_err(|e| db_err("准备自动清理查询失败", e))?;
    let ids: Vec<i64> = stmt
        .query_map(params![cutoff], |row| row.get(0))
        .map_err(|e| db_err("查询自动清理条目失败", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| db_err("读取自动清理条目失败", e))?;
    drop(stmt);

    if ids.is_empty() {
        return Ok(());
    }

    let candidates = super::cleanup::collect_generated_asset_paths_from_ids(conn, &ids)?;

    // 使用已收集的 ID 集合按主键删除，避免重复评估 WHERE 条件
    let delete_sql = format!(
        "DELETE FROM history WHERE id IN ({})",
        sql_placeholders(ids.len())
    );
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| db_err("开始自动清理事务失败", e))?;
    tx.execute(&delete_sql, params_from_iter(ids.iter()))
        .map_err(|e| db_err("自动清理删除失败", e))?;
    super::cleanup::delete_history_assets_for_ids(&tx, &ids)?;
    tx.commit()
        .map_err(|e| db_err("提交自动清理事务失败", e))?;

    super::cleanup::cleanup_generated_assets(conn, candidates)
}

/// 单次聚合查询获取统计信息
///
/// 将原来的 4 次独立 `COUNT` 查询合并为 1 次条件聚合，
/// 仅扫描一遍 `history` 表。
fn get_stats(conn: &Connection) -> Result<AppStats, AppError> {
    let start_of_day = {
        let now = chrono::Local::now();
        now.date_naive()
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_local_timezone(now.timezone())
            .unwrap()
            .timestamp_millis()
    };

    conn.query_row(
        "SELECT COUNT(*),
                COUNT(CASE WHEN is_pinned = 1 THEN 1 END),
                COUNT(CASE WHEN timestamp >= ?1 THEN 1 END),
                COUNT(CASE WHEN is_favorite = 1 THEN 1 END)
         FROM history",
        params![start_of_day],
        |row| {
            Ok(AppStats {
                total: row.get(0)?,
                pinned: row.get(1)?,
                today: row.get(2)?,
                favorites: row.get(3)?,
            })
        },
    )
    .map_err(|e| db_err("查询统计信息失败", e))
}

/// 查询历史列表
///
/// 直接构造 `ClipItem`（tags 初始为空），再通过 `load_tags_batch`
/// 统一填充标签，消除原来的 `BaseItem` 中间结构。
fn get_history(conn: &Connection, limit: i64) -> Result<Vec<ClipItem>, AppError> {
    let limit = limit.clamp(1, 5000);

    let mut stmt = conn
        .prepare(
            "SELECT id, text, timestamp, is_pinned, is_snippet, is_favorite, picked_color, content_type
             FROM history
             ORDER BY is_pinned DESC, timestamp DESC
             LIMIT ?1",
        )
        .map_err(|e| db_err("准备查询失败", e))?;

    let mut items: Vec<ClipItem> = stmt
        .query_map(params![limit], |row| {
            Ok(ClipItem {
                id: row.get(0)?,
                text: row.get(1)?,
                timestamp: row.get(2)?,
                is_pinned: row.get(3)?,
                is_snippet: row.get(4)?,
                is_favorite: row.get(5)?,
                tags: Vec::new(),
                picked_color: row.get(6)?,
                content_type: row.get::<_, Option<String>>(7)?
                    .unwrap_or_else(|| "text".to_string()),
                formats: Vec::new(),
            })
        })
        .map_err(|e| db_err("查询历史失败", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| db_err("读取行失败", e))?;

    if items.is_empty() {
        return Ok(items);
    }

    let ids: Vec<i64> = items.iter().map(|item| item.id).collect();
    let mut tags_map = load_tags_batch(conn, &ids)?;
    for item in &mut items {
        item.tags = tags_map.remove(&item.id).unwrap_or_default();
    }

    Ok(items)
}

/// 按 ID 查询单条记录
///
/// 使用与 `get_history` 相同的 `load_tags_batch` 策略加载标签，
/// 替代原来的 `json_group_array` 子查询 + `serde_json` 解析。
fn get_clip_by_id(conn: &Connection, id: i64) -> Result<Option<ClipItem>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, text, timestamp, is_pinned, is_snippet, is_favorite, picked_color, content_type
             FROM history WHERE id = ?1 LIMIT 1",
        )
        .map_err(|e| db_err("准备按 ID 查询失败", e))?;

    let mut item = match stmt
        .query_row(params![id], |row| {
            Ok(ClipItem {
                id: row.get(0)?,
                text: row.get(1)?,
                timestamp: row.get(2)?,
                is_pinned: row.get(3)?,
                is_snippet: row.get(4)?,
                is_favorite: row.get(5)?,
                tags: Vec::new(),
                picked_color: row.get(6)?,
                content_type: row.get::<_, Option<String>>(7)?
                    .unwrap_or_else(|| "text".to_string()),
                formats: Vec::new(),
            })
        })
        .optional()
        .map_err(|e| db_err("按 ID 查询历史失败", e))?
    {
        Some(item) => item,
        None => return Ok(None),
    };

    let mut tags_map = load_tags_batch(conn, &[id])?;
    item.tags = tags_map.remove(&id).unwrap_or_default();
    item.formats = load_formats(conn, id)?;
    Ok(Some(item))
}

fn add_clip(conn: &Connection, text: String, is_snippet: i32) -> Result<Option<i64>, AppError> {
    let is_snippet = normalize_flag(is_snippet);

    let text = text.trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }

    // 非 snippet 模式下跳过与上一条相同的记录
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
        "INSERT INTO history (text, timestamp, is_pinned, is_snippet, content_type) VALUES (?1, ?2, 0, ?3, 'text')",
        params![text, now, is_snippet],
    )
    .map_err(|e| db_err("插入记录失败", e))?;

    let inserted_id = conn.last_insert_rowid();
    super::cleanup::sync_item_assets_for_text(conn, inserted_id, &text)?;

    Ok(Some(inserted_id))
}

/// 剪贴板快照入库参数
#[derive(Debug, Deserialize)]
pub struct SnapshotInput {
    pub content_type: String,
    pub text: Option<String>,
    pub html: Option<String>,
    pub rtf: Option<String>,
    pub image_path: Option<String>,
    pub files: Option<Vec<String>>,
}

/// 将完整的剪贴板快照写入数据库
///
/// 根据 `content_type` 确定 `history.text` 的内容：
/// - `"text"` / `"rich"` → 纯文本
/// - `"image"` → 图片文件路径
/// - `"files"` → 编码后的文件列表
///
/// 附加格式（HTML / RTF / 图片路径）存入 `clip_formats` 表。
fn add_clip_snapshot(conn: &Connection, snapshot: SnapshotInput) -> Result<Option<i64>, AppError> {
    let primary_text = snapshot.text.as_deref().unwrap_or("").trim().to_string();
    if primary_text.is_empty() {
        return Ok(None);
    }

    // 去重：与最后一条记录的 text 比较
    let last_text: Option<String> = conn
        .query_row(
            "SELECT text FROM history ORDER BY timestamp DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();
    if last_text.as_deref() == Some(&primary_text) {
        return Ok(None);
    }

    let content_type = match snapshot.content_type.as_str() {
        "text" | "image" | "files" | "rich" => snapshot.content_type.as_str(),
        _ => "text",
    };

    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO history (text, timestamp, is_pinned, is_snippet, content_type) VALUES (?1, ?2, 0, 0, ?3)",
        params![primary_text, now, content_type],
    )
    .map_err(|e| db_err("快照插入记录失败", e))?;

    let inserted_id = conn.last_insert_rowid();

    // 同步资源映射（图片/SVG 路径）
    super::cleanup::sync_item_assets_for_text(conn, inserted_id, &primary_text)?;

    // 插入附加格式
    let mut extra_formats: Vec<(&str, &str)> = Vec::new();
    if let Some(ref html) = snapshot.html {
        if !html.trim().is_empty() {
            extra_formats.push(("html", html));
        }
    }
    if let Some(ref rtf) = snapshot.rtf {
        if !rtf.trim().is_empty() {
            extra_formats.push(("rtf", rtf));
        }
    }
    if let Some(ref image_path) = snapshot.image_path {
        if !image_path.trim().is_empty() {
            extra_formats.push(("image", image_path));
            // 图片路径也需要资源映射
            super::cleanup::sync_item_assets_for_text(conn, inserted_id, image_path)?;
        }
    }
    insert_formats(conn, inserted_id, &extra_formats)?;

    Ok(Some(inserted_id))
}

fn toggle_pin(conn: &Connection, id: i64, current_pinned: i32) -> Result<(), AppError> {
    toggle_field(conn, ToggleField::Pin, id, current_pinned)
}

fn toggle_favorite(conn: &Connection, id: i64, current_favorite: i32) -> Result<(), AppError> {
    toggle_field(conn, ToggleField::Favorite, id, current_favorite)
}

fn bulk_pin(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }
    let sql = format!(
        "UPDATE history SET is_pinned = 1 WHERE id IN ({})",
        sql_placeholders(ids.len())
    );
    conn.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| db_err("批量置顶失败", e))?;
    Ok(())
}

fn update_clip(conn: &Connection, id: i64, new_text: String) -> Result<(), AppError> {
    conn.execute(
        "UPDATE history SET text = ?1 WHERE id = ?2",
        params![new_text, id],
    )
    .map_err(|e| db_err("更新记录失败", e))?;
    super::cleanup::sync_item_assets_for_text(conn, id, &new_text)?;
    Ok(())
}

fn update_picked_color(conn: &Connection, id: i64, color: Option<String>) -> Result<(), AppError> {
    conn.execute(
        "UPDATE history SET picked_color = ?1 WHERE id = ?2",
        params![color, id],
    )
    .map_err(|e| db_err("更新调色板颜色失败", e))?;
    Ok(())
}

/// 导入数据
///
/// 使用 `sync_item_assets_for_text` 统一维护资源映射，
/// 替代原来手动调用 `extract_generated_asset_paths` + 逐条 INSERT 的重复逻辑。
fn import_data(conn: &mut Connection, items: &[ImportItem]) -> Result<(), AppError> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| db_err("开始事务失败", e))?;

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
        )
        .map_err(|e| db_err("导入记录失败", e))?;

        let item_id = tx.last_insert_rowid();
        super::cleanup::sync_item_assets_for_text(&tx, item_id, &item.text)?;
    }

    tx.commit().map_err(|e| db_err("提交事务失败", e))?;
    Ok(())
}

// ── Tauri Commands ───────────────────────────────────────────

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

/// 将剪贴板快照写入数据库并返回完整 ClipItem
///
/// 由前端 `useClipboard` 在收到 `ClipboardSnapshot` 后调用，
/// 替代原来的 `captureClipboardSnapshot + addClipAndGet` 两步调用。
#[tauri::command]
pub fn db_add_clip_snapshot(
    state: State<'_, DbState>,
    snapshot: SnapshotInput,
) -> Result<Option<ClipItem>, AppError> {
    super::with_conn_mut(&state, |conn| {
        match add_clip_snapshot(conn, snapshot)? {
            Some(id) => get_clip_by_id(conn, id),
            None => Ok(None),
        }
    })
}

/// 按需加载指定条目的附加格式数据
///
/// 前端在用户展开/查看条目详情时调用，避免列表加载时的性能开销。
#[tauri::command]
pub fn db_get_clip_formats(
    state: State<'_, DbState>,
    id: i64,
) -> Result<Vec<ClipFormat>, AppError> {
    super::with_read_conn(&state, |conn| load_formats(conn, id))
}

/// 更新指定条目的某个附加格式内容（html / rtf）
fn update_clip_format(conn: &Connection, id: i64, format: &str, content: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE clip_formats SET content = ?1 WHERE item_id = ?2 AND format = ?3",
        params![content, id, format],
    )
    .map_err(|e| db_err(&format!("更新格式 {} 失败", format), e))?;
    Ok(())
}

#[tauri::command]
pub fn db_update_clip_format(
    state: State<'_, DbState>,
    id: i64,
    format: String,
    content: String,
) -> Result<(), AppError> {
    super::with_conn_mut(&state, |conn| update_clip_format(conn, id, &format, &content))
}

#[cfg(test)]
#[path = "tests/history_tests.rs"]
mod tests;
