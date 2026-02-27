//! 数据库模块入口（Facade）
//!
//! ## 职责
//! - 定义数据库共享数据模型（`ClipItem`、`Tag`、`AppStats`）
//! - 管理读写分离连接状态（`DbState`）与访问 helper
//! - 初始化数据库与 Schema，并导出各子模块命令
//!
//! ## 输入/输出
//! - 输入：`AppHandle`、`State<DbState>` 与调用参数
//! - 输出：`Result<T, AppError>`
//!
//! ## 错误语义
//! - 数据库连接与锁相关错误统一映射为 `AppError::Database`

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

/// 数据库连接封装（读写分离），由 Tauri 托管
pub struct DbState {
    pub write_conn: Mutex<Connection>,
    pub read_conn: Mutex<Connection>,
}

pub(crate) fn with_conn_mut<T>(state: &State<'_, DbState>, op: impl FnOnce(&mut Connection) -> Result<T, AppError>) -> Result<T, AppError> {
    let mut conn = state.write_conn.lock().map_err(|e| {
        AppError::Database(format!("获取数据库锁失败: {}", e))
    })?;
    op(&mut conn)
}

pub(crate) fn with_read_conn<T>(state: &State<'_, DbState>, op: impl FnOnce(&Connection) -> Result<T, AppError>) -> Result<T, AppError> {
    let conn = state.read_conn.lock().map_err(|e| {
        AppError::Database(format!("获取数据库读锁失败: {}", e))
    })?;
    op(&conn)
}

pub(crate) fn with_conn_pair_mut<T>(
    state: &State<'_, DbState>,
    op: impl FnOnce(&mut Connection, &mut Connection) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let mut write_conn = state.write_conn.lock().map_err(|e| {
        AppError::Database(format!("获取数据库写锁失败: {}", e))
    })?;
    let mut read_conn = state.read_conn.lock().map_err(|e| {
        AppError::Database(format!("获取数据库读锁失败: {}", e))
    })?;
    op(&mut write_conn, &mut read_conn)
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
/// 返回的 `DbState` 将注册到 Tauri 状态管理中。
pub fn init_db(app: &AppHandle) -> Result<DbState, AppError> {
    let db_path = config::resolve_db_path(app)?;
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::Database(format!("创建数据库目录失败: {}", e))
        })?;
    }
    log::info!("数据库路径: {}", db_path.display());

    let write_conn = Connection::open(&db_path).map_err(|e| {
        AppError::Database(format!("打开数据库失败: {}", e))
    })?;
    let read_conn = Connection::open(&db_path).map_err(|e| {
        AppError::Database(format!("打开数据库读连接失败: {}", e))
    })?;

    schema::initialize_schema(&write_conn)?;

    Ok(DbState {
        write_conn: Mutex::new(write_conn),
        read_conn: Mutex::new(read_conn),
    })
}

// ============================================================================
// Tauri Commands
// ============================================================================

// 历史与标签命令已拆分到 `db/history.rs` 和 `db/tags.rs`，
// 通过 `pub use` 在本模块维持 `db::xxx` 兼容导出。

// ============================================================================
// 数据库路径管理 Commands
// ============================================================================

