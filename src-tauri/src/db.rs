//! 数据库模块
//!
//! # 设计思路
//!
//! 将所有 SQLite 数据库操作集中到 Rust 后端，前端通过 Tauri IPC 调用。
//! 使用 `rusqlite` 直接操作 SQLite，替代前端的 `@tauri-apps/plugin-sql`。
//!
//! # 优势
//!
//! - **类型安全**：Rust struct + serde，编译期保证数据结构正确
//! - **一致性**：单一数据源，后端统一管控
//! - **性能**：Rust 端可用事务批量写入
//! - **可维护性**：SQL 逻辑集中在一个模块

use std::sync::Mutex;
use std::fs;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::error::AppError;

mod config;
mod cleanup;
mod history;
mod schema;
mod storage;
mod tags;

pub use history::*;
pub use storage::*;
pub use tags::*;

// ============================================================================
// 数据模型
// ============================================================================

/// 标签
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
}

/// 剪贴板历史条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: i64,
    pub text: String,
    pub timestamp: i64,
    pub is_pinned: i32,
    pub is_snippet: i32,
    pub is_favorite: i32,
    pub tags: Vec<Tag>,
    /// 用户在调色板中选择的颜色（不覆盖原始 text）
    pub picked_color: Option<String>,
}

/// 应用统计信息
#[derive(Debug, Clone, Serialize)]
pub struct AppStats {
    pub total: i64,
    pub today: i64,
    pub pinned: i64,
    pub favorites: i64,
}

// ============================================================================
// 数据库状态（Tauri Managed State）
// ============================================================================

/// 数据库连接封装，由 Tauri 托管
pub struct DbState(pub Mutex<Connection>);

pub(crate) fn with_conn<T>(state: &State<'_, DbState>, op: impl FnOnce(&Connection) -> Result<T, AppError>) -> Result<T, AppError> {
    let conn = state.0.lock().map_err(|e| {
        AppError::Database(format!("获取数据库锁失败: {}", e))
    })?;
    op(&conn)
}

// ============================================================================
// 数据库配置管理
// ============================================================================

// ============================================================================
// 数据库初始化
// ============================================================================

/// 初始化数据库连接与 Schema
///
/// 在 `main.rs` 的 `setup` 阶段调用，创建表结构并执行迁移。
/// 返回的 `Connection` 将被包装为 `DbState` 注册到 Tauri 状态管理中。
pub fn init_db(app: &AppHandle) -> Result<Connection, AppError> {
    let db_path = config::resolve_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::Database(format!("创建数据库目录失败: {}", e))
        })?;
    }
    log::info!("数据库路径: {}", db_path.display());

    let conn = Connection::open(&db_path).map_err(|e| {
        AppError::Database(format!("打开数据库失败: {}", e))
    })?;

    schema::initialize_schema(&conn)?;

    Ok(conn)
}

// ============================================================================
// Tauri Commands
// ============================================================================

// 历史与标签命令已拆分到 `db/history.rs` 和 `db/tags.rs`，
// 通过 `pub use` 在本模块维持 `db::xxx` 兼容导出。

// ============================================================================
// 数据库路径管理 Commands
// ============================================================================

