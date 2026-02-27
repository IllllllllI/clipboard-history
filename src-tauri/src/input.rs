//! 输入模拟模块（分层门面）
//!
//! - `commands`：Tauri command 对外入口
//! - `services`：业务编排与平台无关逻辑
//! - `platform`：平台相关实现（Win32 / 非 Windows 占位）

#[path = "input/commands.rs"]
mod commands;
#[path = "input/services.rs"]
mod services;
#[path = "input/platform.rs"]
mod platform;

use crate::error::AppError;

#[tauri::command]
pub async fn paste_text(app: tauri::AppHandle, hide_on_action: bool) -> Result<(), AppError> {
    commands::paste_text(app, hide_on_action).await
}

#[tauri::command]
pub async fn click_and_paste(app: tauri::AppHandle) -> Result<(), AppError> {
    commands::click_and_paste(app).await
}

#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    commands::copy_file_to_clipboard(path)
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), AppError> {
    commands::open_file(path).await
}

#[tauri::command]
pub async fn open_file_location(path: String) -> Result<(), AppError> {
    commands::open_file_location(path).await
}

#[tauri::command]
pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    commands::get_file_icon(input).await
}