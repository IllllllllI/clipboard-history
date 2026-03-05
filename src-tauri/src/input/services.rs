//! 业务编排层 — 平台无关的流程控制
//!
//! 本模块负责：
//! - 窗口隐藏 / 焦点切换等待 / 输入模拟节奏控制
//! - 所有平台相关细节委托给 [`super::platform`]
//!
//! ## 设计要点
//!
//! - 粘贴按键模拟通过 [`simulate_paste`] 统一实现，
//!   消除 `paste_text` / `click_and_paste` 的重复代码
//! - `Enigo` 实例延迟到实际使用前才创建（sleep 之后），最小化资源持有时间
//! - 延迟常量命名化（[`FOCUS_SETTLE_MS`] / [`CLICK_SETTLE_MS`]），避免 magic number

use std::time::Duration;

use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};
#[cfg(target_os = "windows")]
use enigo::{Button, Mouse};
use tauri::Manager;
use tokio::time::sleep;

use crate::error::AppError;
use crate::ipc::WINDOW_LABEL_MAIN;
use crate::window_position;

use super::platform;

/// 窗口隐藏后等待目标窗口获得焦点的延迟（毫秒）。
///
/// 300ms 是经验值：过短时目标窗口可能尚未激活，过长则用户体感迟钝。
const FOCUS_SETTLE_MS: u64 = 300;

/// 模拟鼠标点击后等待焦点稳定的延迟（毫秒）。
const CLICK_SETTLE_MS: u64 = 100;

// ═══════════════════════════════════════════════════════════
//  内部辅助
// ═══════════════════════════════════════════════════════════

/// 创建 `Enigo` 输入模拟实例。
fn create_enigo() -> Result<Enigo, AppError> {
    Enigo::new(&Settings::default())
        .map_err(|e| AppError::Input(format!("初始化输入模拟失败: {}", e)))
}

/// 隐藏主窗口和所有 HUD 窗口。
fn hide_windows(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL_MAIN) {
        let _ = window.hide();
    }
    window_position::hide_all_hud_windows(app);
}

/// 模拟系统粘贴快捷键（macOS: ⌘V，其它: Ctrl+V）。
fn simulate_paste(enigo: &mut Enigo) -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    enigo
        .key(modifier, Press)
        .and_then(|_| enigo.key(Key::Unicode('v'), Click))
        .and_then(|_| enigo.key(modifier, Release))
        .map_err(|e| AppError::Input(format!("模拟粘贴按键失败: {}", e)))
}

// ═══════════════════════════════════════════════════════════
//  公开服务
// ═══════════════════════════════════════════════════════════

pub async fn paste_text(app: tauri::AppHandle, hide_on_action: bool) -> Result<(), AppError> {
    if hide_on_action {
        hide_windows(&app);
        sleep(Duration::from_millis(FOCUS_SETTLE_MS)).await;
    }

    // Enigo 在 sleep 之后创建，最小化资源持有时间
    let mut enigo = create_enigo()?;
    simulate_paste(&mut enigo)
}

pub async fn click_and_paste(app: tauri::AppHandle) -> Result<(), AppError> {
    hide_windows(&app);
    sleep(Duration::from_millis(FOCUS_SETTLE_MS)).await;

    let mut enigo = create_enigo()?;

    #[cfg(target_os = "windows")]
    {
        enigo
            .button(Button::Left, Click)
            .map_err(|e| AppError::Input(format!("模拟鼠标点击失败: {}", e)))?;
        log::debug!("已模拟鼠标点击");
    }

    sleep(Duration::from_millis(CLICK_SETTLE_MS)).await;

    simulate_paste(&mut enigo)?;
    log::debug!("已点击并粘贴");
    Ok(())
}

pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    platform::copy_file_to_clipboard(path)
}

pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), AppError> {
    platform::copy_files_to_clipboard(paths)
}

pub async fn open_file(path: String) -> Result<(), AppError> {
    platform::open_file(&path)
}

pub async fn open_file_location(path: String) -> Result<(), AppError> {
    platform::open_file_location(&path)
}

pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    platform::get_file_icon(input).await
}
