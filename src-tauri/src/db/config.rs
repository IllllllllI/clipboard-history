//! 数据库路径配置子模块
//!
//! ## 职责
//! - 读取/写入数据库目录配置（`config.json`）
//! - 解析当前数据库文件路径（自定义目录优先，默认 app data 回退）
//!
//! ## 输入/输出
//! - 输入：`AppHandle`、配置路径与可选目录字符串
//! - 输出：解析后的 `PathBuf` 或 `Result<(), AppError>`
//!
//! ## 错误语义
//! - 文件系统或配置序列化失败统一映射为 `AppError::Database`

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

use super::db_err;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DbConfig {
    #[serde(default)]
    db_dir: Option<String>,
}

fn get_config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| db_err("获取应用数据目录失败", e))?;
    Ok(app_data_dir.join("config.json"))
}

fn load_db_config_from_path(config_path: &Path) -> DbConfig {
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(config_path) {
            if let Ok(config) = serde_json::from_str(&content) {
                return config;
            }
        }
    }
    DbConfig { db_dir: None }
}

fn load_db_config(app: &AppHandle) -> DbConfig {
    let config_path = match get_config_path(app) {
        Ok(p) => p,
        Err(_) => return DbConfig { db_dir: None },
    };
    load_db_config_from_path(&config_path)
}

fn save_db_config_to_path(config_path: &Path, db_dir: Option<String>) -> Result<(), AppError> {
    let config = DbConfig { db_dir };
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| db_err("序列化配置失败", e))?;
    fs::write(config_path, content)
        .map_err(|e| db_err("写入配置文件失败", e))?;
    Ok(())
}

fn resolve_db_path_from_config(app_data_dir: &Path, config: &DbConfig) -> Result<PathBuf, AppError> {
    if let Some(ref dir) = config.db_dir {
        if !dir.is_empty() {
            let dir_path = PathBuf::from(dir);
            fs::create_dir_all(&dir_path)
                .map_err(|e| db_err("创建数据库目录失败", e))?;
            return Ok(dir_path.join("clipboard.db"));
        }
    }
    Ok(app_data_dir.join("clipboard.db"))
}

pub(crate) fn save_db_config(app: &AppHandle, db_dir: Option<String>) -> Result<(), AppError> {
    let config_path = get_config_path(app)?;
    save_db_config_to_path(&config_path, db_dir)
}

pub(crate) fn resolve_db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| db_err("获取应用数据目录失败", e))?;
    let config = load_db_config(app);
    resolve_db_path_from_config(&app_data_dir, &config)
}

#[cfg(test)]
#[path = "tests/config_tests.rs"]
mod tests;
