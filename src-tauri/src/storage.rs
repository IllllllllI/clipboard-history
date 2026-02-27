//! 图片存储目录管理模块
//!
//! # 设计思路
//!
//! 统一管理剪贴板图片的持久化存储路径，支持用户自定义目录，
//! 并在目录不存在时自动创建。
//!
//! # 实现思路
//!
//! - 优先使用用户在设置中配置的自定义目录。
//! - 未设置时回退到应用默认数据目录下的 `images` 子目录。
//! - 目录不存在时自动 `create_dir_all`，避免上层判断。
//! - 所有可能失败的操作均返回 `Result`，不使用 `expect()` / `unwrap()`。

use serde::Serialize;
use tauri::AppHandle;
use tauri::Manager;
use std::path::PathBuf;
use std::fs;

use crate::error::AppError;

/// 存储目录信息
#[derive(Debug, Clone, Serialize)]
pub struct StorageInfo {
    pub path: String,
    pub total_size: u64,
    pub file_count: u64,
}

/// 获取图片存储目录
///
/// # 参数
/// * `app` - Tauri 应用句柄，用于获取应用数据目录
/// * `custom_dir` - 用户自定义目录（可选）
///
/// # 返回
/// - `Ok(PathBuf)` — 可用的图片存储目录
/// - `Err(AppError::Storage)` — 无法获取或创建目录
pub fn get_images_dir(app: &AppHandle, custom_dir: Option<String>) -> Result<PathBuf, AppError> {
    // 优先使用用户自定义目录
    if let Some(dir) = custom_dir {
        if !dir.is_empty() {
            let path = PathBuf::from(&dir);
            if !path.exists() {
                fs::create_dir_all(&path).map_err(|e| {
                    AppError::Storage(format!("创建自定义目录 '{}' 失败: {}", dir, e))
                })?;
            }
            return Ok(path);
        }
    }

    // 使用应用默认数据目录
    let app_data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::Storage(format!("获取应用数据目录失败: {}", e))
    })?;
    let images_dir = app_data_dir.join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| {
            AppError::Storage(format!("创建图片目录失败: {}", e))
        })?;
    }
    Ok(images_dir)
}

/// 获取图片存储目录信息（路径 + 占用大小 + 文件数）
#[tauri::command]
pub fn get_images_dir_info(app: AppHandle, custom_dir: Option<String>) -> Result<StorageInfo, AppError> {
    let dir = get_images_dir(&app, custom_dir)?;
    let mut total_size: u64 = 0;
    let mut file_count: u64 = 0;

    if dir.exists() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        total_size += metadata.len();
                        file_count += 1;
                    }
                }
            }
        }
    }

    Ok(StorageInfo {
        path: dir.to_string_lossy().to_string(),
        total_size,
        file_count,
    })
}
