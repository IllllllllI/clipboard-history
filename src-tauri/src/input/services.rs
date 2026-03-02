use enigo::{
    Button,
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Mouse, Settings,
};
use tauri::Manager;

use crate::error::AppError;

use super::platform;

pub async fn paste_text(app: tauri::AppHandle, hide_on_action: bool) -> Result<(), AppError> {
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| AppError::Input(format!("初始化输入模拟失败: {}", e)))?;

    if hide_on_action {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Press)
            .and_then(|_| enigo.key(Key::Unicode('v'), Click))
            .and_then(|_| enigo.key(Key::Meta, Release))
            .map_err(|e| AppError::Input(format!("模拟粘贴按键失败: {}", e)))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Press)
            .and_then(|_| enigo.key(Key::Unicode('v'), Click))
            .and_then(|_| enigo.key(Key::Control, Release))
            .map_err(|e| AppError::Input(format!("模拟粘贴按键失败: {}", e)))?;
    }

    Ok(())
}

pub async fn click_and_paste(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| AppError::Input(format!("初始化输入模拟失败: {}", e)))?;

    #[cfg(target_os = "windows")]
    {
        enigo
            .button(Button::Left, Click)
            .map_err(|e| AppError::Input(format!("模拟鼠标点击失败: {}", e)))?;
        log::debug!("已模拟鼠标点击");
    }

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    #[cfg(target_os = "macos")]
    {
        enigo
            .key(Key::Meta, Press)
            .and_then(|_| enigo.key(Key::Unicode('v'), Click))
            .and_then(|_| enigo.key(Key::Meta, Release))
            .map_err(|e| AppError::Input(format!("模拟粘贴按键失败: {}", e)))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo
            .key(Key::Control, Press)
            .and_then(|_| enigo.key(Key::Unicode('v'), Click))
            .and_then(|_| enigo.key(Key::Control, Release))
            .map_err(|e| AppError::Input(format!("模拟粘贴按键失败: {}", e)))?;
    }

    log::debug!("已点击并粘贴");
    Ok(())
}

pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    platform::copy_file_to_clipboard(path)
}

pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), AppError> {
    platform::copy_files_to_clipboard(paths)
}

#[cfg(target_os = "windows")]
pub async fn open_file(path: String) -> Result<(), AppError> {
    platform::open_file(&path)
}

#[cfg(target_os = "macos")]
pub async fn open_file(path: String) -> Result<(), AppError> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub async fn open_file(path: String) -> Result<(), AppError> {
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "windows")]
pub async fn open_file_location(path: String) -> Result<(), AppError> {
    platform::open_file_location(&path)
}

#[cfg(target_os = "macos")]
pub async fn open_file_location(path: String) -> Result<(), AppError> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub async fn open_file_location(path: String) -> Result<(), AppError> {
    let parent = std::path::Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    std::process::Command::new("xdg-open")
        .arg(&parent)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    Ok(())
}

pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    platform::get_file_icon(input).await
}
