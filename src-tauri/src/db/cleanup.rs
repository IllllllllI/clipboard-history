//! 数据清理子模块
//!
//! ## 职责
//! - 解析历史文本中的受管资源路径（图片/SVG）
//! - 维护 `history_assets` 映射并执行删除后的孤儿文件清理
//! - 提供单条、批量、清空等删除流程的复用逻辑
//!
//! ## 设计决策
//!
//! ### 孤儿检测策略
//! 删除条目后需判断其关联文件是否仍被其他条目引用。
//! 采用 **单次批量 SQL 查询** 替代逐文件全表扫描：
//! 1. 收集候选路径集合
//! 2. 一次 `SELECT path FROM history_assets WHERE path IN (?)` 获取仍被引用的路径
//! 3. 集合差即为真正的孤儿文件
//!
//! ### 回退扫描
//! `history_assets` 映射可能因旧版本数据不完整而缺失。
//! 回退扫描仅在 **发现候选集中无任何映射记录** 时触发，且会顺带修复映射，
//! 避免后续操作重复触发。
//!
//! ## 输入/输出
//! - 输入：`Connection`、条目 ID 集合或文本
//! - 输出：候选路径集合或 `Result<(), AppError>`
//!
//! ## 错误语义
//! - SQL 操作失败返回 `AppError::Database`
//! - 文件删除失败返回 `AppError::Storage`

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};

use crate::error::AppError;

use super::{db_err, sql_placeholders};

// ── 路径工具 ─────────────────────────────────────────────────

/// 将原始文本正则化为本地绝对路径
///
/// 处理 `file://` 前缀和 Windows 风格的 `/C:/...` 路径。
/// 非绝对路径或空字符串返回 `None`。
fn normalize_local_path(raw: &str) -> Option<PathBuf> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let stripped = trimmed.strip_prefix("file://").unwrap_or(trimmed);

    #[cfg(target_os = "windows")]
    let stripped = if stripped.starts_with('/') && stripped.as_bytes().get(2) == Some(&b':') {
        stripped.trim_start_matches('/')
    } else {
        stripped
    };

    let path = PathBuf::from(stripped);
    path.is_absolute().then_some(path)
}

/// 判断路径是否为应用生成的受管资源（`img_*.png` / `svg_*.svg`）
fn is_generated_clipboard_asset(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    (name.starts_with("img_") && ext == "png") || (name.starts_with("svg_") && ext == "svg")
}

// ── 路径提取 ─────────────────────────────────────────────────

/// 从文本中提取应用生成的资源路径集合
///
/// 先按行扫描；如果逐行未命中，则将整体文本视为单路径尝试。
pub(crate) fn extract_generated_asset_paths(text: &str) -> HashSet<PathBuf> {
    let mut paths = HashSet::new();

    for line in text.lines() {
        if let Some(path) = normalize_local_path(line) {
            if is_generated_clipboard_asset(&path) {
                paths.insert(path);
            }
        }
    }

    // 整体文本可能本身就是一条完整路径（无换行）
    if paths.is_empty() {
        if let Some(path) = normalize_local_path(text) {
            if is_generated_clipboard_asset(&path) {
                paths.insert(path);
            }
        }
    }

    paths
}

// ── history_assets 映射维护 ──────────────────────────────────

/// 将指定条目的 `history_assets` 映射同步为 `text` 中提取的路径
pub(crate) fn sync_item_assets_for_text(
    conn: &Connection,
    item_id: i64,
    text: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM history_assets WHERE item_id = ?1",
        params![item_id],
    )
    .map_err(|e| db_err("清理历史资源映射失败", e))?;

    let paths = extract_generated_asset_paths(text);
    if paths.is_empty() {
        return Ok(());
    }

    let mut stmt = conn
        .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
        .map_err(|e| db_err("准备插入历史资源映射失败", e))?;

    for path in &paths {
        stmt.execute(params![item_id, path.to_string_lossy()])
            .map_err(|e| db_err("写入历史资源映射失败", e))?;
    }

    Ok(())
}

/// 从数据库读取条目文本，提取路径并同步 `history_assets`
pub(crate) fn sync_item_assets_from_history_text(
    conn: &Connection,
    item_id: i64,
) -> Result<HashSet<PathBuf>, AppError> {
    let text: Option<String> = conn
        .query_row(
            "SELECT text FROM history WHERE id = ?1",
            params![item_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| db_err("读取条目文本失败", e))?;

    let Some(text) = text else {
        return Ok(HashSet::new());
    };

    let paths = extract_generated_asset_paths(&text);
    sync_item_assets_for_text(conn, item_id, &text)?;
    Ok(paths)
}

/// 从 `history_assets` 表查询指定 ID 集合关联的路径
fn collect_paths_from_history_assets(
    conn: &Connection,
    ids: &[i64],
) -> Result<HashSet<PathBuf>, AppError> {
    if ids.is_empty() {
        return Ok(HashSet::new());
    }

    let sql = format!(
        "SELECT DISTINCT path FROM history_assets WHERE item_id IN ({})",
        sql_placeholders(ids.len())
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| db_err("准备查询资源映射失败", e))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| db_err("查询资源映射失败", e))?;

    let mut result = HashSet::new();
    for row in rows {
        let path_str = row.map_err(|e| db_err("读取资源映射失败", e))?;
        if let Some(path) = normalize_local_path(&path_str) {
            result.insert(path);
        }
    }
    Ok(result)
}

/// 批量删除指定 ID 集合的 `history_assets` 记录
pub(crate) fn delete_history_assets_for_ids(
    conn: &Connection,
    ids: &[i64],
) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let sql = format!(
        "DELETE FROM history_assets WHERE item_id IN ({})",
        sql_placeholders(ids.len())
    );
    conn.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| db_err("删除历史资源映射失败", e))?;
    Ok(())
}

// ── 孤儿文件清理 ─────────────────────────────────────────────

/// 从候选路径集合中过滤出仍被 `history_assets` 引用的路径
///
/// 返回仍被引用的路径集合，用于从候选集中减去。
fn query_still_referenced_paths(
    conn: &Connection,
    candidates: &HashSet<PathBuf>,
) -> Result<HashSet<PathBuf>, AppError> {
    if candidates.is_empty() {
        return Ok(HashSet::new());
    }

    let path_strs: Vec<String> = candidates.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    let sql = format!(
        "SELECT DISTINCT path FROM history_assets WHERE path IN ({})",
        sql_placeholders(path_strs.len())
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| db_err("准备查询被引用路径失败", e))?;
    let rows = stmt
        .query_map(params_from_iter(path_strs.iter()), |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| db_err("查询被引用路径失败", e))?;

    let mut referenced = HashSet::new();
    for row in rows {
        let path_str = row.map_err(|e| db_err("读取被引用路径失败", e))?;
        if let Some(path) = normalize_local_path(&path_str) {
            referenced.insert(path);
        }
    }
    Ok(referenced)
}

/// 回退扫描：当 `history_assets` 映射缺失时，扫描 `history.text` 修复映射
///
/// 仅在发现候选路径在 `history_assets` 中完全无记录时触发。
/// 扫描采用分批游标，避免一次性加载全部文本。
fn fallback_repair_assets(
    conn: &Connection,
    orphan_candidates: &HashSet<PathBuf>,
) -> Result<HashSet<PathBuf>, AppError> {
    if orphan_candidates.is_empty() {
        return Ok(HashSet::new());
    }

    let mut repaired = HashSet::new();
    let batch_size: i64 = 1000;
    let mut last_id: i64 = 0;

    let mut select_stmt = conn
        .prepare("SELECT id, text FROM history WHERE id > ?1 ORDER BY id ASC LIMIT ?2")
        .map_err(|e| db_err("准备回退引用扫描失败", e))?;
    let mut insert_stmt = conn
        .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
        .map_err(|e| db_err("准备回退写入资源映射失败", e))?;

    loop {
        let rows = select_stmt
            .query_map([last_id, batch_size], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| db_err("执行回退引用扫描失败", e))?;

        let mut batch_count = 0u32;
        for row in rows {
            let (item_id, text) =
                row.map_err(|e| db_err("读取回退引用扫描数据失败", e))?;
            last_id = item_id;
            batch_count += 1;

            let text_paths = extract_generated_asset_paths(&text);
            for candidate in orphan_candidates {
                if text_paths.contains(candidate) {
                    let path_str = candidate.to_string_lossy();
                    insert_stmt
                        .execute(params![item_id, path_str])
                        .map_err(|e| db_err("回退写入资源映射失败", e))?;
                    repaired.insert(candidate.clone());
                }
            }
        }

        if batch_count == 0 {
            break;
        }
    }

    Ok(repaired)
}

/// 删除磁盘上的孤儿文件（忽略 NotFound）
fn remove_file_if_exists(path: &Path) -> Result<(), AppError> {
    match fs::remove_file(path) {
        Ok(()) => {
            log::debug!("🗑️ 已删除孤儿资源: {}", path.display());
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(AppError::Storage(format!(
            "删除图片文件失败 '{}': {}",
            path.display(),
            e
        ))),
    }
}

/// **批量**清理孤儿文件
///
/// ## 流程
/// 1. 一次查询获取候选中仍被引用的路径
/// 2. 集合差得到真正的孤儿
/// 3. 若 `history_assets` 映射为空（旧数据），触发回退扫描修复
/// 4. 删除最终确认的孤儿文件
pub(crate) fn cleanup_generated_assets(
    conn: &Connection,
    candidates: HashSet<PathBuf>,
) -> Result<(), AppError> {
    if candidates.is_empty() {
        return Ok(());
    }

    let still_referenced = query_still_referenced_paths(conn, &candidates)?;
    let mut orphans: HashSet<PathBuf> = candidates
        .difference(&still_referenced)
        .cloned()
        .collect();

    // 回退修复：如果有候选但 history_assets 完全无记录，
    // 可能是旧数据未建映射，需扫描 history.text 补充
    if !orphans.is_empty() {
        let repaired = fallback_repair_assets(conn, &orphans)?;
        for path in &repaired {
            orphans.remove(path);
        }
    }

    for path in &orphans {
        remove_file_if_exists(path)?;
    }

    Ok(())
}

/// 对单个路径做孤儿检测（供测试使用）
#[cfg(test)]
fn remove_orphan_generated_asset(conn: &Connection, path: &Path) -> Result<(), AppError> {
    let mut set = HashSet::with_capacity(1);
    set.insert(path.to_path_buf());
    cleanup_generated_assets(conn, set)
}

// ── 回填 ─────────────────────────────────────────────────────

/// 分批回填缺失的 `history_assets` 映射
///
/// 在 Schema 迁移时调用，使用游标分批处理避免一次性加载全部数据。
/// 预编译语句在循环外创建，循环内复用。
pub(crate) fn backfill_missing_history_assets(
    conn: &Connection,
    batch_size: usize,
) -> Result<(), AppError> {
    let batch_size = batch_size.clamp(100, 5_000) as i64;
    let mut last_id: i64 = 0;

    let mut select_stmt = conn
        .prepare(
            "SELECT id, text FROM history WHERE id > ?1 ORDER BY id ASC LIMIT ?2",
        )
        .map_err(|e| db_err("准备增量回填查询失败", e))?;

    let mut insert_stmt = conn
        .prepare("INSERT OR IGNORE INTO history_assets (item_id, path) VALUES (?1, ?2)")
        .map_err(|e| db_err("准备增量回填插入失败", e))?;

    loop {
        let rows = select_stmt
            .query_map([last_id, batch_size], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| db_err("查询增量回填数据失败", e))?;

        let pending: Vec<(i64, String)> = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| db_err("读取增量回填数据失败", e))?;

        if pending.is_empty() {
            break;
        }

        for (item_id, text) in &pending {
            last_id = *item_id;
            for path in extract_generated_asset_paths(text) {
                insert_stmt
                    .execute(params![item_id, path.to_string_lossy()])
                    .map_err(|e| db_err("写入增量回填映射失败", e))?;
            }
        }
    }

    Ok(())
}

// ── 候选路径收集 ─────────────────────────────────────────────

/// 收集指定 ID 集合关联的所有受管资源路径
///
/// 同时从 `history_assets` 表和 `history.text` 双重提取，
/// 确保即使映射不完整也不会遗漏。
pub(crate) fn collect_generated_asset_paths_from_ids(
    conn: &Connection,
    ids: &[i64],
) -> Result<HashSet<PathBuf>, AppError> {
    if ids.is_empty() {
        return Ok(HashSet::new());
    }

    let mut result = collect_paths_from_history_assets(conn, ids)?;

    let sql = format!(
        "SELECT text FROM history WHERE id IN ({})",
        sql_placeholders(ids.len())
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| db_err("准备查询待删条目失败", e))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |row| row.get::<_, String>(0))
        .map_err(|e| db_err("查询待删条目失败", e))?;

    for row in rows {
        let text = row.map_err(|e| db_err("读取待删条目失败", e))?;
        result.extend(extract_generated_asset_paths(&text));
    }

    Ok(result)
}

// ── 删除流程 ─────────────────────────────────────────────────

/// 删除单条记录并清理关联的孤儿文件
pub(crate) fn delete_clip_with_cleanup(conn: &mut Connection, id: i64) -> Result<(), AppError> {
    let mut candidates = collect_paths_from_history_assets(conn, &[id])?;
    if candidates.is_empty() {
        candidates = sync_item_assets_from_history_text(conn, id)?;
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| db_err("开始删除事务失败", e))?;

    tx.execute("DELETE FROM history WHERE id = ?1", params![id])
        .map_err(|e| db_err("删除记录失败", e))?;
    delete_history_assets_for_ids(&tx, &[id])?;
    tx.commit().map_err(|e| db_err("提交删除事务失败", e))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

/// 清空所有记录并清理关联的受管文件
///
/// 使用分批游标从 `history_assets` + `history.text` 收集候选路径，
/// 避免一次性将全部文本加载到内存。
pub(crate) fn clear_all_with_cleanup(conn: &mut Connection) -> Result<(), AppError> {
    // 第 1 步：从 history_assets 收集（仅路径字符串，内存占用小）
    let mut candidates = HashSet::new();
    {
        let mut stmt = conn
            .prepare("SELECT DISTINCT path FROM history_assets")
            .map_err(|e| db_err("准备查询历史资源映射失败", e))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| db_err("查询历史资源映射失败", e))?;
        for row in rows {
            let path_str = row.map_err(|e| db_err("读取历史资源映射失败", e))?;
            if let Some(path) = normalize_local_path(&path_str) {
                candidates.insert(path);
            }
        }
    }

    // 第 2 步：分批扫描 history.text 补充遗漏的路径
    {
        let batch_size: i64 = 1000;
        let mut last_id: i64 = 0;
        let mut stmt = conn
            .prepare("SELECT id, text FROM history WHERE id > ?1 ORDER BY id ASC LIMIT ?2")
            .map_err(|e| db_err("准备清空扫描失败", e))?;

        loop {
            let rows = stmt
                .query_map([last_id, batch_size], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| db_err("查询清空扫描失败", e))?;

            let batch: Vec<(i64, String)> = rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| db_err("读取清空扫描数据失败", e))?;

            if batch.is_empty() {
                break;
            }

            for (item_id, text) in &batch {
                last_id = *item_id;
                candidates.extend(extract_generated_asset_paths(text));
            }
        }
    }

    // 第 3 步：事务内清空表
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| db_err("开始清空事务失败", e))?;
    tx.execute("DELETE FROM history", [])
        .map_err(|e| db_err("清空记录失败", e))?;
    tx.execute("DELETE FROM history_assets", [])
        .map_err(|e| db_err("清空历史资源映射失败", e))?;
    tx.commit().map_err(|e| db_err("提交清空事务失败", e))?;

    // 第 4 步：清空后表已无数据，直接删除文件（无需再查引用）
    for path in &candidates {
        remove_file_if_exists(path)?;
    }

    Ok(())
}

/// 批量删除记录并清理关联的孤儿文件
pub(crate) fn bulk_delete_with_cleanup(
    conn: &mut Connection,
    ids: &[i64],
) -> Result<(), AppError> {
    if ids.is_empty() {
        return Ok(());
    }

    let candidates = collect_generated_asset_paths_from_ids(conn, ids)?;

    let sql = format!(
        "DELETE FROM history WHERE id IN ({})",
        sql_placeholders(ids.len())
    );
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| db_err("开始批量删除事务失败", e))?;
    tx.execute(&sql, params_from_iter(ids.iter()))
        .map_err(|e| db_err("批量删除失败", e))?;
    delete_history_assets_for_ids(&tx, ids)?;
    tx.commit()
        .map_err(|e| db_err("提交批量删除事务失败", e))?;

    cleanup_generated_assets(conn, candidates)?;
    Ok(())
}

#[cfg(test)]
#[path = "tests/cleanup_tests.rs"]
mod tests;
