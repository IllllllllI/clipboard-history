//! # Tauri 命令层
//!
//! ## 设计思路
//!
//! 命令层仅做 IPC 参数接收与结果返回，不承载业务逻辑。
//! 所有实际处理交由 `ImageServiceState`，保持命令函数薄、稳定、易测试。

use super::{service, ImageSource};
use tauri::State;

/// 下载网络图片并复制到系统剪贴板。
#[tauri::command]
pub async fn download_and_copy_image(
    state: State<'_, service::ImageServiceState>,
    url: String,
) -> Result<(), crate::error::AppError> {
    state.process_source(ImageSource::Url(url)).await?;
    Ok(())
}

/// 将 Base64 图片复制到系统剪贴板。
#[tauri::command]
pub async fn copy_base64_image_to_clipboard(
    state: State<'_, service::ImageServiceState>,
    data: String,
) -> Result<(), crate::error::AppError> {
    state.process_source(ImageSource::Base64(data)).await?;
    Ok(())
}

/// 将本地图片复制到系统剪贴板。
#[tauri::command]
pub async fn copy_image_to_clipboard(
    state: State<'_, service::ImageServiceState>,
    path: String,
) -> Result<(), crate::error::AppError> {
    state.process_source(ImageSource::FilePath(path)).await?;
    Ok(())
}

/// 切换图片处理性能档位。
#[tauri::command]
pub fn set_image_performance_profile(
    state: State<'_, service::ImageServiceState>,
    profile: String,
) -> Result<(), crate::error::AppError> {
    state.set_performance_profile(&profile)?;
    Ok(())
}

/// 查询后端当前生效性能档位。
#[tauri::command]
pub fn get_image_performance_profile(
    state: State<'_, service::ImageServiceState>,
) -> Result<String, crate::error::AppError> {
    Ok(state.get_performance_profile()?)
}

#[tauri::command]
pub fn set_image_advanced_config(
    state: State<'_, service::ImageServiceState>,
    config: service::ImageAdvancedConfig,
) -> Result<(), crate::error::AppError> {
    state.set_advanced_config(config)?;
    Ok(())
}

#[tauri::command]
pub fn get_image_advanced_config(
    state: State<'_, service::ImageServiceState>,
) -> Result<service::ImageAdvancedConfig, crate::error::AppError> {
    Ok(state.get_advanced_config()?)
}
