use crate::error::AppError;

use super::services;

pub async fn paste_text(app: tauri::AppHandle, hide_on_action: bool) -> Result<(), AppError> {
    services::paste_text(app, hide_on_action).await
}

pub async fn click_and_paste(app: tauri::AppHandle) -> Result<(), AppError> {
    services::click_and_paste(app).await
}

pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    services::copy_file_to_clipboard(path)
}

pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), AppError> {
    services::copy_files_to_clipboard(paths)
}

pub async fn open_file(path: String) -> Result<(), AppError> {
    services::open_file(path).await
}

pub async fn open_file_location(path: String) -> Result<(), AppError> {
    services::open_file_location(path).await
}

pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    services::get_file_icon(input).await
}
