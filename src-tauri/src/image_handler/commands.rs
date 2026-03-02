//! # Tauri 命令层
//!
//! ## 设计思路
//!
//! 命令层仅做 IPC 参数接收与结果返回，不承载业务逻辑。
//! 所有实际处理交由 `ImageServiceState`，保持命令函数薄、稳定、易测试。

use super::{service, ImageError, ImageSource};
use tauri::{AppHandle, State, Wry};

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageCommandError {
    pub code: &'static str,
    pub stage: &'static str,
    pub message: String,
}

impl From<ImageError> for ImageCommandError {
    fn from(error: ImageError) -> Self {
        Self {
            code: error.code(),
            stage: error.stage(),
            message: error.to_string(),
        }
    }
}

/// 下载网络图片并复制到系统剪贴板。
#[tauri::command]
pub async fn download_and_copy_image(
    state: State<'_, service::ImageServiceState>,
    app: AppHandle<Wry>,
    url: String,
    request_id: String,
) -> Result<(), ImageCommandError> {
    state
        .process_url_with_progress(&app, request_id, url)
        .await
        .map_err(ImageCommandError::from)?;
    Ok(())
}

#[tauri::command]
pub fn cancel_image_download(
    state: State<'_, service::ImageServiceState>,
    request_id: String,
) -> Result<bool, crate::error::AppError> {
    Ok(state.cancel_download(&request_id)?)
}

/// 将 Base64 图片复制到系统剪贴板。
#[tauri::command]
pub async fn copy_base64_image_to_clipboard(
    state: State<'_, service::ImageServiceState>,
    data: String,
) -> Result<(), ImageCommandError> {
    state
        .process_source(ImageSource::Base64(data))
        .await
        .map_err(ImageCommandError::from)?;
    Ok(())
}

/// 将本地图片复制到系统剪贴板。
#[tauri::command]
pub async fn copy_image_to_clipboard(
    state: State<'_, service::ImageServiceState>,
    path: String,
) -> Result<(), ImageCommandError> {
    state
        .process_source(ImageSource::FilePath(path))
        .await
        .map_err(ImageCommandError::from)?;
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
