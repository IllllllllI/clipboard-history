use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::clipboard;
use crate::error::AppError;

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(format!("获取应用数据目录失败: {}", e)))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|e| AppError::Storage(format!("创建应用数据目录失败: {}", e)))?;

    Ok(app_data_dir.join("settings.json"))
}

#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> Result<Option<serde_json::Value>, AppError> {
    let settings_path = settings_file_path(&app)?;
    if !settings_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&settings_path)?;
    let parsed = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|e| AppError::Storage(format!("解析设置文件失败: {}", e)))?;

    Ok(Some(parsed))
}

#[tauri::command]
pub fn set_app_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), AppError> {
    let settings_path = settings_file_path(&app)?;

    clipboard::apply_runtime_settings(&settings);

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::Storage(format!("序列化设置失败: {}", e)))?;

    fs::write(settings_path, content)?;
    Ok(())
}
