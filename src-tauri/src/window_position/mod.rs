//! 窗口定位模块（跨平台光标跟踪与窗口摆放）
//!
//! 该模块负责以下核心能力：
//! - 获取 Windows / macOS / Linux 上的光标位置
//! - 按光标附近的最佳可视区域计算窗口位置
//! - 处理多显示器场景下的目标屏幕选择
//! - 保证窗口不会超出显示器可见边界
//! - 统一管理窗口可见性与焦点状态
//! - 通过全局快捷键实现“显示/重定位/隐藏”切换
//!
//! # 设计思路
//!
//! 1. **职责拆分**：将“取光标”“算位置”“选显示器”“查状态”拆为独立子模块，
//!    由本文件作为编排入口，降低耦合，便于单元测试。
//! 2. **跨平台一致性**：对外统一使用 `tauri::PhysicalPosition` 坐标语义，
//!    平台差异（如 macOS 坐标原点）在底层模块内部吸收。
//! 3. **失败可回退**：关键步骤尽量返回可读错误，光标读取失败时由下层提供回退值，
//!    提升快捷键触发时的可用性。
//!
//! # 实现思路
//!
//! - `cursor`：负责跨平台读取光标，并在短时失败时重试。
//! - `calculation`：仅处理“单屏内”窗口几何计算，保证窗口完全在边界内。
//! - `monitor`：先判定光标属于哪块屏，再调用单屏算法计算最终全局坐标。
//! - `window_state`：读取窗口当前可见性与焦点，供切换逻辑决策。
//! - 当前文件内命令函数只做流程编排：读取上下文 -> 计算位置 -> 执行窗口操作。
//!
//! # 坐标系统说明
//!
//! 不同系统坐标原点不同：
//! - **Windows / Linux**：左上角为原点，Y 轴向下增大
//! - **macOS**：左下角为原点，Y 轴向上增大
//!
//! 本模块会在 macOS 分支内完成坐标换算，对外保持统一行为。

pub mod cursor;
pub mod calculation;
pub mod monitor;
pub mod window_state;

use crate::ipc::{
    WINDOW_LABEL_HUD_HOST, WINDOW_LABEL_MAIN,
};
use serde::Deserialize;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder, Window};
use tauri::window::Color;
use crate::error::AppError;
use std::time::Instant;

/// 在 Windows 上通过 SetWindowPos 强制将 HUD 窗口置于 Z 轴最顶层。
///
/// 当主窗口和 HUD 窗口都处于 TOPMOST 带时，`set_always_on_top(true)` 不一定能
/// 保证 HUD 在主窗口之上（同带窗口取决于最后激活顺序）。
/// 此函数调用 Win32 `SetWindowPos(hwnd, HWND_TOPMOST, ...)` 强制重排序。
#[cfg(target_os = "windows")]
fn force_hud_topmost(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::HWND as WinHWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOMOVE, SWP_NOSIZE, SWP_NOACTIVATE, HWND_TOPMOST,
    };
    if let Ok(tauri_hwnd) = window.hwnd() {
        let win_hwnd = WinHWND(tauri_hwnd.0);
        unsafe {
            let _ = SetWindowPos(
                win_hwnd,
                Some(HWND_TOPMOST),
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn force_hud_topmost(window: &tauri::WebviewWindow) {
    // 非 Windows 平台回退：仅依赖 Tauri 的 always_on_top
    let _ = window.set_always_on_top(true);
}

const DOWNLOAD_HUD_OFFSET_X: i32 = 14;
const DOWNLOAD_HUD_OFFSET_Y: i32 = 18;
const DOWNLOAD_HUD_WIDTH: u32 = 320;
const DOWNLOAD_HUD_HEIGHT: u32 = 160;
const CLIPITEM_HUD_OFFSET_X: i32 = 18;
const CLIPITEM_HUD_OFFSET_Y: i32 = 18;
const CLIPITEM_HUD_LINEAR_WIDTH: u32 = 324;
const CLIPITEM_HUD_LINEAR_HEIGHT: u32 = 50;
const CLIPITEM_HUD_EDGE_INSET: i32 = 6;
const RADIAL_MENU_SIZE: u32 = 344;

#[derive(Clone, Copy)]
enum ClipItemHudAxis {
    Horizontal,
    Vertical,
}

impl ClipItemHudAxis {
    fn as_str(self) -> &'static str {
        match self {
            ClipItemHudAxis::Horizontal => "horizontal",
            ClipItemHudAxis::Vertical => "vertical",
        }
    }
}

#[derive(Clone, Copy)]
enum MainWindowNearestEdge {
    Top,
    Right,
    Bottom,
    Left,
}

/// 安全钳位：当 `min > max`（窗口大于容器）时返回 `min`（贴左/上对齐），
/// 否则等同于 `i32::clamp`。
#[inline]
fn saturating_clamp(value: i32, min_value: i32, max_value: i32) -> i32 {
    if min_value > max_value {
        return min_value;
    }
    value.clamp(min_value, max_value)
}

fn detect_nearest_main_window_edge(
    cursor_x: i32,
    cursor_y: i32,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
) -> MainWindowNearestEdge {
    let distance_top = (cursor_y - top).abs();
    let distance_right = (right - cursor_x).abs();
    let distance_bottom = (bottom - cursor_y).abs();
    let distance_left = (cursor_x - left).abs();

    let mut nearest = (distance_top, MainWindowNearestEdge::Top);
    if distance_right < nearest.0 {
        nearest = (distance_right, MainWindowNearestEdge::Right);
    }
    if distance_bottom < nearest.0 {
        nearest = (distance_bottom, MainWindowNearestEdge::Bottom);
    }
    if distance_left < nearest.0 {
        nearest = (distance_left, MainWindowNearestEdge::Left);
    }

    nearest.1
}

// ── 统一 HUD 宿主窗口 ──
//
// 所有 HUD（ClipItem / Radial Menu / Download）共享同一个 WebView2 窗口，
// 从 3 个独立进程（~150-240MB）降低到 1 个进程（~50-80MB）。
// 窗口在首次需要或 warmup 时创建，内部 React 应用根据事件动态渲染
// 对应的 HUD 组件。
//
// 窗口属性选择最大公约数配置：
// - 透明背景（radial-menu / clipitem-hud 需要，download-hud 组件自行绘制背景）
// - 不可调整大小、无装饰、始终置顶、跳过任务栏
// - 初始尺寸取最大 HUD（radial-menu 344x344）
// - Windows 上避免在 builder 阶段设置 non-focusable，否则 WebView2 可能以
//   0x80070057（参数错误）失败；焦点/穿透由 show/hide 阶段按模式动态控制。

/// 获取或按需创建统一 HUD 宿主窗口
fn get_or_create_hud_host(app: &AppHandle) -> Result<tauri::WebviewWindow, AppError> {
    if let Some(w) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        return Ok(w);
    }
    log::info!("lazily creating hud-host window");
    WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL_HUD_HOST,
        WebviewUrl::App("hud.html".into()),
    )
    .title("HUD Host")
    .inner_size(344.0, 344.0)
    .transparent(true)
    .background_color(Color(0, 0, 0, 0))
    .shadow(false)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .devtools(false)
    .visible(false)
    .build()
    .map_err(|e| AppError::Window(format!("创建 HUD 宿主窗口失败: {}", e)))
}

// ── 主窗口置顶切换 ──

#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), AppError> {
    let window = app
        .get_webview_window(WINDOW_LABEL_MAIN)
        .ok_or_else(|| AppError::Window("主窗口不存在".to_string()))?;
    window
        .set_always_on_top(enabled)
        .map_err(|e| AppError::Window(format!("设置主窗口置顶失败: {}", e)))?;
    log::info!("set_always_on_top: enabled={enabled}");
    Ok(())
}

// ── HUD 窗口后台预热 ──
//
// 主窗口 show 时在后台线程预创建 HUD 宿主窗口，确保
// 用户交互时 HUD 能立刻出现（~0ms 延迟）。
// 主窗口 hide 时销毁 HUD 窗口释放内存。

/// 在后台预创建 HUD 窗口（非阻塞），供主窗口 show 后调用
pub fn warmup_hud_in_background(app: &AppHandle) {
    match get_or_create_hud_host(app) {
        Ok(w) => {
            let _ = w.set_position(tauri::PhysicalPosition::new(-9999_i32, -9999_i32));
            log::debug!("后台预热 HUD 窗口完成");
        }
        Err(e) => {
            log::warn!("后台预热 HUD 窗口失败: {e}");
        }
    }
}

/// 将 HUD 宿主窗口隐藏并移到屏外（不销毁 WebView2 进程）。
///
/// 与 `destroy()` 不同，`hide() + 移到 (-9999,-9999)` 保持 WebView2 进程存活，
/// 下次 show 时零延迟（~0ms vs 重建的 200-600ms）。
/// 窗口销毁仅在 `hide_all_hud_windows`（主窗口隐藏/关闭后）中执行。
fn stash_hud_offscreen(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        let _ = window.hide();
        let _ = window.set_position(PhysicalPosition::new(-9999_i32, -9999_i32));
        // 开启鼠标穿透，防止隐藏窗口拦截点击
        let _ = window.set_ignore_cursor_events(true);
    }
    Ok(())
}


/// 根据指定边缘，计算 ClipItem HUD 在主窗口边缘外的布局（轴向 + 尺寸 + 坐标）。
///
/// 这是边缘定位的**唯一真相源**，
/// `position_clipitem_hud_near_cursor` 和 `position_clipitem_hud_at_main_edge` 均委托此函数。
fn layout_clipitem_hud_at_edge(
    edge: MainWindowNearestEdge,
    main_pos: PhysicalPosition<i32>,
    main_size: PhysicalSize<u32>,
) -> (ClipItemHudAxis, PhysicalSize<u32>, PhysicalPosition<i32>) {
    let left = main_pos.x;
    let top = main_pos.y;
    let right = left + main_size.width as i32;
    let bottom = top + main_size.height as i32;

    let (axis, width, height) = match edge {
        MainWindowNearestEdge::Top | MainWindowNearestEdge::Bottom => {
            (ClipItemHudAxis::Horizontal, CLIPITEM_HUD_LINEAR_WIDTH, CLIPITEM_HUD_LINEAR_HEIGHT)
        }
        MainWindowNearestEdge::Left | MainWindowNearestEdge::Right => {
            (ClipItemHudAxis::Vertical, CLIPITEM_HUD_LINEAR_HEIGHT, CLIPITEM_HUD_LINEAR_WIDTH)
        }
    };

    let width_i32 = width as i32;
    let height_i32 = height as i32;
    let center_x = left + (main_size.width as i32 - width_i32).max(0) / 2;
    let center_y = top + (main_size.height as i32 - height_i32).max(0) / 2;

    let target = match edge {
        MainWindowNearestEdge::Top => {
            let x = saturating_clamp(center_x, left, right - width_i32);
            let y = top - height_i32 - CLIPITEM_HUD_EDGE_INSET;
            PhysicalPosition::new(x, y)
        }
        MainWindowNearestEdge::Bottom => {
            let x = saturating_clamp(center_x, left, right - width_i32);
            let y = bottom + CLIPITEM_HUD_EDGE_INSET;
            PhysicalPosition::new(x, y)
        }
        MainWindowNearestEdge::Left => {
            let x = left - width_i32 - CLIPITEM_HUD_EDGE_INSET;
            let y = saturating_clamp(center_y, top, bottom - height_i32);
            PhysicalPosition::new(x, y)
        }
        MainWindowNearestEdge::Right => {
            let x = right + CLIPITEM_HUD_EDGE_INSET;
            let y = saturating_clamp(center_y, top, bottom - height_i32);
            PhysicalPosition::new(x, y)
        }
    };

    (axis, PhysicalSize::new(width, height), target)
}

/// 根据光标位置自动检测最近边缘，再计算 HUD 布局
fn compute_clipitem_hud_edge_position(
    cursor_pos: PhysicalPosition<i32>,
    main_pos: PhysicalPosition<i32>,
    main_size: PhysicalSize<u32>,
) -> (ClipItemHudAxis, PhysicalSize<u32>, PhysicalPosition<i32>) {
    let left = main_pos.x;
    let top = main_pos.y;
    let right = left + main_size.width as i32;
    let bottom = top + main_size.height as i32;
    let edge = detect_nearest_main_window_edge(cursor_pos.x, cursor_pos.y, left, top, right, bottom);
    layout_clipitem_hud_at_edge(edge, main_pos, main_size)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowPlacementMode {
    SmartNearCursor,
    CursorTopLeft,
    CursorCenter,
    CustomAnchor,
    MonitorCenter,
    ScreenCenter,
    Custom,
    LastPosition,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPlacementConfig {
    pub mode: WindowPlacementMode,
    pub custom_x: Option<i32>,
    pub custom_y: Option<i32>,
}

fn default_placement_config() -> WindowPlacementConfig {
    WindowPlacementConfig {
        mode: WindowPlacementMode::SmartNearCursor,
        custom_x: Some(120),
        custom_y: Some(120),
    }
}

fn clamp_position_to_monitor(
    pos: tauri::PhysicalPosition<i32>,
    window_size: tauri::PhysicalSize<u32>,
    monitor: &tauri::Monitor,
) -> tauri::PhysicalPosition<i32> {
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();

    let max_x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32).max(0);
    let max_y = monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32).max(0);

    tauri::PhysicalPosition::new(
        pos.x.clamp(monitor_pos.x, max_x),
        pos.y.clamp(monitor_pos.y, max_y),
    )
}

fn detect_monitor_from_point<'a>(
    point: tauri::PhysicalPosition<i32>,
    monitors: &'a [tauri::Monitor],
) -> Option<&'a tauri::Monitor> {
    monitor::detect_cursor_monitor(point, monitors)
}

fn calculate_monitor_center_position(
    monitor: &tauri::Monitor,
    window_size: tauri::PhysicalSize<u32>,
) -> tauri::PhysicalPosition<i32> {
    let monitor_pos = monitor.position();
    let monitor_size = monitor.size();

    let centered_x = monitor_pos.x + (monitor_size.width as i32 - window_size.width as i32).max(0) / 2;
    let centered_y = monitor_pos.y + (monitor_size.height as i32 - window_size.height as i32).max(0) / 2;

    tauri::PhysicalPosition::new(centered_x, centered_y)
}

fn restore_if_minimized(window: &Window) -> Result<(), AppError> {
    let is_minimized = window
        .is_minimized()
        .map_err(|e| AppError::Window(format!("Failed to query minimized state: {}", e)))?;

    if is_minimized {
        window
            .unminimize()
            .map_err(|e| AppError::Window(format!("Failed to restore minimized window: {}", e)))?;
    }

    Ok(())
}

async fn compute_target_position(
    window: &Window,
    config: &WindowPlacementConfig,
) -> Result<tauri::PhysicalPosition<i32>, AppError> {
    let started = Instant::now();

    let t0 = Instant::now();
    let current_monitor = window.current_monitor()
        .map_err(|e| AppError::Window(format!("Failed to get current monitor: {}", e)))?;
    let current_monitor_cost = t0.elapsed();

    let t1 = Instant::now();
    let cursor_pos = cursor::get_cursor_position_with_retry(current_monitor.as_ref()).await;
    let cursor_cost = t1.elapsed();

    let t2 = Instant::now();
    let window_size = window.outer_size()
        .map_err(|e| AppError::Window(format!("Failed to get window size: {}", e)))?;
    let size_cost = t2.elapsed();

    let t3 = Instant::now();
    let monitors = window.available_monitors()
        .map_err(|e| AppError::Window(format!("Failed to get available monitors: {}", e)))?;
    let monitors_cost = t3.elapsed();

    let t4 = Instant::now();
    let fallback_monitor = current_monitor
        .as_ref()
        .or_else(|| monitors.first());

    let target = match config.mode {
        WindowPlacementMode::SmartNearCursor => {
            monitor::calculate_smart_position_multi_monitor(cursor_pos, window_size, &monitors)
        }
        WindowPlacementMode::CursorTopLeft => {
            let monitor = monitor::detect_cursor_monitor(cursor_pos, &monitors)
                .or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            clamp_position_to_monitor(cursor_pos, window_size, monitor)
        }
        WindowPlacementMode::CursorCenter => {
            let monitor = monitor::detect_cursor_monitor(cursor_pos, &monitors)
                .or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            let ideal = tauri::PhysicalPosition::new(
                cursor_pos.x - window_size.width as i32 / 2,
                cursor_pos.y - window_size.height as i32 / 2,
            );
            clamp_position_to_monitor(ideal, window_size, monitor)
        }
        WindowPlacementMode::CustomAnchor => {
            let anchor_x = config.custom_x.unwrap_or(0);
            let anchor_y = config.custom_y.unwrap_or(0);
            let monitor = monitor::detect_cursor_monitor(cursor_pos, &monitors)
                .or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            let ideal = tauri::PhysicalPosition::new(
                cursor_pos.x - anchor_x,
                cursor_pos.y - anchor_y,
            );
            clamp_position_to_monitor(ideal, window_size, monitor)
        }
        WindowPlacementMode::MonitorCenter => {
            let monitor = monitor::detect_cursor_monitor(cursor_pos, &monitors)
                .or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            calculate_monitor_center_position(monitor, window_size)
        }
        WindowPlacementMode::ScreenCenter => {
            let monitor = monitors.first().or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            calculate_monitor_center_position(monitor, window_size)
        }
        WindowPlacementMode::Custom => {
            let custom_x = config.custom_x.unwrap_or(120);
            let custom_y = config.custom_y.unwrap_or(120);
            let custom_pos = tauri::PhysicalPosition::new(custom_x, custom_y);

            let monitor = detect_monitor_from_point(custom_pos, &monitors)
                .or(fallback_monitor)
                .ok_or_else(|| AppError::Window("No monitor available".to_string()))?;

            clamp_position_to_monitor(custom_pos, window_size, monitor)
        }
        WindowPlacementMode::LastPosition => {
            window
                .outer_position()
                .map_err(|e| AppError::Window(format!("Failed to get current window position: {}", e)))?
        }
    };
    let calc_cost = t4.elapsed();

    let total_cost = started.elapsed();
    log::debug!(
        "window_position stages: current_monitor={}ms cursor={}ms window_size={}ms monitors={}ms calc={}ms total={}ms",
        current_monitor_cost.as_millis(),
        cursor_cost.as_millis(),
        size_cost.as_millis(),
        monitors_cost.as_millis(),
        calc_cost.as_millis(),
        total_cost.as_millis(),
    );

    Ok(target)
}

/// 在光标附近显示窗口（支持多显示器）
///
/// 该函数是窗口定位流程的主编排入口：
/// 1. 获取当前显示器上下文（用于光标回退策略）
/// 2. 获取光标位置（带重试）
/// 3. 读取窗口尺寸与显示器列表
/// 4. 计算目标窗口坐标
/// 5. 设置位置、显示窗口并抢占焦点
///
/// # 设计思路
/// - 将“计算”与“执行”分离：几何逻辑交给 `monitor`，当前函数只负责调用顺序。
/// - 统一错误出口：每一步都映射为可读错误信息，便于前端定位问题。
///
/// # 实现思路
/// - 先收集所有计算所需上下文，再一次性计算位置，避免重复系统调用。
/// - `show` 与 `set_focus` 分离调用，确保窗口从隐藏态切换后焦点可控。
///
/// # 参数
/// * `window` - 需要显示并定位的 Tauri 窗口
///
/// # 返回
/// - `Ok(())`：窗口已成功定位并显示
/// - `Err(String)`：任一步骤失败
#[tauri::command]
pub async fn show_window_at_cursor(window: Window) -> Result<(), AppError> {
    restore_if_minimized(&window)?;

    let target_position = compute_target_position(&window, &default_placement_config()).await?;

    window.set_position(target_position)
        .map_err(|e| AppError::Window(format!("Failed to set window position: {}", e)))?;

    window.show()
        .map_err(|e| AppError::Window(format!("Failed to show window: {}", e)))?;

    window.set_focus()
        .map_err(|e| AppError::Window(format!("Failed to set window focus: {}", e)))?;

    Ok(())
}

/// 将已显示窗口重定位到光标附近，并恢复焦点
///
/// 该函数用于“窗口可见但失焦”的场景，避免用户在多屏/多窗口切换后
/// 还需要手动找回窗口位置与输入焦点。
///
/// # 设计思路
/// - 与首次显示逻辑共享同一套定位算法，保证行为一致。
/// - 不重复调用 `show`，仅做位置修正与焦点恢复，减少状态抖动。
///
/// # 参数
/// * `window` - 需要重定位并聚焦的 Tauri 窗口
///
/// # 返回
/// - `Ok(())`：窗口已完成重定位并获得焦点
/// - `Err(String)`：任一步骤失败
#[tauri::command]
pub async fn reposition_and_focus(window: Window) -> Result<(), AppError> {
    restore_if_minimized(&window)?;

    let target_position = compute_target_position(&window, &default_placement_config()).await?;

    window.set_position(target_position)
        .map_err(|e| AppError::Window(format!("Failed to set window position: {}", e)))?;

    window.set_focus()
        .map_err(|e| AppError::Window(format!("Failed to set window focus: {}", e)))?;

    Ok(())
}

/// 根据当前状态切换窗口可见性
///
/// 切换规则：
/// - **不可见**：显示到光标附近
/// - **可见但失焦**：重定位到光标并恢复焦点
/// - **可见且聚焦**：隐藏窗口
///
/// # 设计思路
/// - 采用有限状态分支（visible/focused）实现可预测行为。
/// - 所有分支只调用单一职责函数，便于排查与后续扩展。
///
/// # 参数
/// * `window` - 需要切换状态的 Tauri 窗口
///
/// # 返回
/// - `Ok(())`：切换成功
/// - `Err(String)`：任一步骤失败
#[tauri::command]
pub async fn toggle_window(window: Window) -> Result<(), AppError> {
    toggle_window_with_config(window, default_placement_config()).await
}

async fn toggle_window_with_config(
    window: Window,
    config: WindowPlacementConfig,
) -> Result<(), AppError> {
    restore_if_minimized(&window)?;

    let state = window_state::get_window_state(&window)?;
    let is_main_window = window.label() == WINDOW_LABEL_MAIN;
    let hud_focused = is_main_window && is_any_hud_focused(window.app_handle());
    let treat_as_focused = state.is_focused || hud_focused;

    if is_main_window && hud_focused {
        log::debug!("主窗口未聚焦但 HUD 子窗口持有焦点，按已聚焦处理快捷键切换");
    }

    match (state.is_visible, treat_as_focused) {
        (false, _) => {
            log::debug!("窗口处于隐藏状态，正在显示到光标附近");
            let target_position = compute_target_position(&window, &config).await?;
            window.set_position(target_position)
                .map_err(|e| AppError::Window(format!("Failed to set window position: {}", e)))?;
            window.show()
                .map_err(|e| AppError::Window(format!("Failed to show window: {}", e)))?;
            // 主窗口显示后后台预热 HUD 窗口，确保悬停时即刻响应
            if is_main_window {
                warmup_hud_in_background(window.app_handle());
            }
            window.set_focus()
                .map_err(|e| AppError::Window(format!("Failed to set window focus: {}", e)))
        }
        (true, false) => {
            log::debug!("窗口可见但未聚焦，正在重定位并恢复焦点");
            let target_position = compute_target_position(&window, &config).await?;
            window.set_position(target_position)
                .map_err(|e| AppError::Window(format!("Failed to set window position: {}", e)))?;
            window.set_focus()
                .map_err(|e| AppError::Window(format!("Failed to set window focus: {}", e)))
        }
        (true, true) => {
            log::debug!("窗口可见且已聚焦，正在隐藏");
            // 同步隐藏所有 HUD 子窗口，防止主窗口隐藏后 HUD 残留
            hide_all_hud_windows(window.app_handle());
            window.hide()
                .map_err(|e| AppError::Window(format!("Failed to hide window: {}", e)))
        }
    }
}

/// 处理全局快捷键触发事件
///
/// 这是 `toggle_window` 的语义包装层，用于向上层暴露更清晰的命令入口。
///
/// # 设计思路
/// - 保持快捷键处理函数轻量，仅负责记录触发与转发调用。
///
/// # 参数
/// * `window` - 需要执行切换的 Tauri 窗口
///
/// # 返回
/// - `Ok(())`：窗口状态切换成功
/// - `Err(String)`：切换失败的错误信息
#[tauri::command]
pub async fn handle_global_shortcut(
    window: Window,
    placement: Option<WindowPlacementConfig>,
) -> Result<(), AppError> {
    log::debug!("全局快捷键触发，开始切换窗口状态");
    let config = placement.unwrap_or_else(default_placement_config);
    toggle_window_with_config(window, config).await
}

#[tauri::command]
pub async fn show_download_hud(app: AppHandle) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    window
        .set_size(tauri::PhysicalSize::new(DOWNLOAD_HUD_WIDTH, DOWNLOAD_HUD_HEIGHT))
        .map_err(|e| AppError::Window(format!("重置下载 HUD 窗口尺寸失败: {}", e)))?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| AppError::Window(format!("设置下载 HUD 鼠标穿透失败: {}", e)))?;

    window
        .show()
        .map_err(|e| AppError::Window(format!("显示 HUD 窗口失败: {}", e)))?;

    // 强制 HUD 在所有 TOPMOST 窗口之上（含主窗口）
    force_hud_topmost(&window);

    Ok(())
}

#[tauri::command]
pub async fn hide_download_hud(app: AppHandle) -> Result<(), AppError> {
    stash_hud_offscreen(&app)?;
    Ok(())
}

#[tauri::command]
pub async fn position_download_hud_near_cursor(app: AppHandle) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    let current_monitor = window
        .current_monitor()
        .map_err(|e| AppError::Window(format!("读取 HUD 当前显示器失败: {}", e)))?;

    let cursor_pos = cursor::get_cursor_position_with_retry(current_monitor.as_ref()).await;

    let window_size = tauri::PhysicalSize::new(DOWNLOAD_HUD_WIDTH, DOWNLOAD_HUD_HEIGHT);

    window
        .set_size(window_size)
        .map_err(|e| AppError::Window(format!("重置 HUD 窗口尺寸失败: {}", e)))?;

    let monitors = window
        .available_monitors()
        .map_err(|e| AppError::Window(format!("读取可用显示器失败: {}", e)))?;

    let fallback_monitor = current_monitor.as_ref().or_else(|| monitors.first());

    let target_monitor = detect_monitor_from_point(cursor_pos, &monitors)
        .or(fallback_monitor)
        .ok_or_else(|| AppError::Window("没有可用的显示器用于定位下载 HUD".to_string()))?;

    let ideal = PhysicalPosition::new(
        cursor_pos.x.saturating_add(DOWNLOAD_HUD_OFFSET_X),
        cursor_pos.y.saturating_add(DOWNLOAD_HUD_OFFSET_Y),
    );

    let target = clamp_position_to_monitor(ideal, window_size, target_monitor);

    window
        .set_position(target)
        .map_err(|e| AppError::Window(format!("移动 HUD 窗口失败: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn show_clipitem_hud(app: AppHandle) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    window
        .show()
        .map_err(|e| AppError::Window(format!("显示 ClipItem HUD 窗口失败: {}", e)))?;

    // 强制 HUD 在所有 TOPMOST 窗口之上（含主窗口）
    force_hud_topmost(&window);

    Ok(())
}

#[tauri::command]
pub async fn hide_clipitem_hud(app: AppHandle) -> Result<(), AppError> {
    stash_hud_offscreen(&app)?;
    Ok(())
}

#[tauri::command]
pub async fn position_clipitem_hud_near_cursor(
    app: AppHandle,
    mode: Option<String>,
) -> Result<String, AppError> {
    let window = get_or_create_hud_host(&app)?;

    // 注意：不再检查 is_visible()。
    // 隐藏状态窗口也允许定位——调用方（openClipItemHud）会先定位再 show()，
    // 防止窗口在停泊坐标 (-9999,-9999) 处被显示。
    // JS 侧的 HudManager.isDragging() 守卫已足够防止拖拽期间的滞后 IPC 问题。

    let current_monitor = window
        .current_monitor()
        .map_err(|e| AppError::Window(format!("读取 ClipItem HUD 当前显示器失败: {}", e)))?;

    let cursor_pos = cursor::get_cursor_position_with_retry(current_monitor.as_ref()).await;

    let (axis, size, target) = if let Some(main_window) = app.get_webview_window(WINDOW_LABEL_MAIN) {
        let main_pos = main_window
            .outer_position()
            .map_err(|e| AppError::Window(format!("读取主窗口位置失败: {}", e)))?;
        let main_size = main_window
            .outer_size()
            .map_err(|e| AppError::Window(format!("读取主窗口尺寸失败: {}", e)))?;
        compute_clipitem_hud_edge_position(cursor_pos, main_pos, main_size)
    } else {
        (
            ClipItemHudAxis::Horizontal,
            PhysicalSize::new(CLIPITEM_HUD_LINEAR_WIDTH, CLIPITEM_HUD_LINEAR_HEIGHT),
            PhysicalPosition::new(
                cursor_pos.x.saturating_add(CLIPITEM_HUD_OFFSET_X),
                cursor_pos.y.saturating_add(CLIPITEM_HUD_OFFSET_Y),
            ),
        )
    };

    // 忽略 mode 参数（仅保留兼容签名），线性 HUD 窗口始终使用 edge 布局
    let _ = mode;

    window
        .set_size(size)
        .map_err(|e| AppError::Window(format!("调整 ClipItem HUD 窗口尺寸失败: {}", e)))?;

    window
        .set_position(target)
        .map_err(|e| AppError::Window(format!("移动 ClipItem HUD 窗口失败: {}", e)))?;

    Ok(axis.as_str().to_string())
}

/// 将线性 HUD 固定在主窗口指定边缘（top / bottom / left / right）。
///
/// 与 `position_clipitem_hud_near_cursor`（动态跟随光标）不同，
/// 该命令始终将 HUD 居中对齐到主窗口的指定边缘，不依赖光标位置。
///
/// # 返回
/// 与动态定位一致，返回对应轴向字符串（`"horizontal"` / `"vertical"`）。
#[tauri::command]
pub async fn position_clipitem_hud_at_main_edge(
    app: AppHandle,
    edge: String,
) -> Result<String, AppError> {
    let window = get_or_create_hud_host(&app)?;

    let main_window = app
        .get_webview_window(WINDOW_LABEL_MAIN)
        .ok_or_else(|| AppError::Window("主窗口不存在".to_string()))?;

    let main_pos = main_window
        .outer_position()
        .map_err(|e| AppError::Window(format!("读取主窗口位置失败: {}", e)))?;
    let main_size = main_window
        .outer_size()
        .map_err(|e| AppError::Window(format!("读取主窗口尺寸失败: {}", e)))?;

    let parsed_edge = match edge.as_str() {
        "top" => MainWindowNearestEdge::Top,
        "bottom" => MainWindowNearestEdge::Bottom,
        "left" => MainWindowNearestEdge::Left,
        "right" => MainWindowNearestEdge::Right,
        _ => MainWindowNearestEdge::Top,
    };

    let (axis, size, target) = layout_clipitem_hud_at_edge(parsed_edge, main_pos, main_size);

    window
        .set_size(size)
        .map_err(|e| AppError::Window(format!("调整 ClipItem HUD 窗口尺寸失败: {}", e)))?;

    window
        .set_position(target)
        .map_err(|e| AppError::Window(format!("移动 ClipItem HUD 窗口失败: {}", e)))?;

    Ok(axis.as_str().to_string())
}

#[tauri::command]
pub async fn set_clipitem_hud_mouse_passthrough(
    app: AppHandle,
    passthrough: bool,
) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        window
            .set_ignore_cursor_events(passthrough)
            .map_err(|e| AppError::Window(format!("设置 ClipItem HUD 鼠标穿透失败: {}", e)))?;
    }
    Ok(())
}

// ── 径向菜单命令（共享 HUD 宿主窗口） ──

/// 一步完成径向菜单打开：定位 + 发送快照 + 取消穿透 + 显示 + 置顶。
///
/// 将原先 TS 端 4 次串行 IPC 合并为 1 次，消除 ~10-15ms IPC 往返延迟。
/// `snapshot` 使用 `serde_json::Value` 透传，Rust 侧不关心具体字段。
#[tauri::command]
pub async fn open_radial_menu_at_cursor(
    app: AppHandle,
    snapshot: serde_json::Value,
) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    // 0. 重置为正确的正方形尺寸
    window
        .set_size(tauri::PhysicalSize::new(RADIAL_MENU_SIZE, RADIAL_MENU_SIZE))
        .map_err(|e| AppError::Window(format!("重置径向菜单尺寸失败: {}", e)))?;

    // 1. 定位：光标居中
    let current_monitor = window
        .current_monitor()
        .map_err(|e| AppError::Window(format!("读取径向菜单当前显示器失败: {}", e)))?;
    let cursor_pos = cursor::get_cursor_position_with_retry(current_monitor.as_ref()).await;
    let half = RADIAL_MENU_SIZE as i32 / 2;
    let target = PhysicalPosition::new(
        cursor_pos.x.saturating_add(-half),
        cursor_pos.y.saturating_add(-half),
    );
    window
        .set_position(target)
        .map_err(|e| AppError::Window(format!("移动径向菜单窗口失败: {}", e)))?;

    // 2. 发送快照到 HUD 宿主窗口
    use tauri::Emitter;
    window
        .emit("radial-menu-snapshot", &snapshot)
        .map_err(|e| AppError::Window(format!("发送径向菜单快照失败: {}", e)))?;

    // 3. 取消鼠标穿透
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| AppError::Window(format!("设置径向菜单鼠标穿透失败: {}", e)))?;

    // 4. 显示 + 强制置顶
    window
        .show()
        .map_err(|e| AppError::Window(format!("显示径向菜单窗口失败: {}", e)))?;
    force_hud_topmost(&window);

    Ok(())
}

#[tauri::command]
pub async fn show_radial_menu(app: AppHandle) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    window
        .show()
        .map_err(|e| AppError::Window(format!("显示径向菜单窗口失败: {}", e)))?;

    // 强制 HUD 在所有 TOPMOST 窗口之上（含主窗口）
    force_hud_topmost(&window);

    Ok(())
}

#[tauri::command]
pub async fn hide_radial_menu(app: AppHandle) -> Result<(), AppError> {
    stash_hud_offscreen(&app)?;
    Ok(())
}

#[tauri::command]
pub async fn position_radial_menu_at_cursor(app: AppHandle) -> Result<(), AppError> {
    let window = get_or_create_hud_host(&app)?;

    window
        .set_size(tauri::PhysicalSize::new(RADIAL_MENU_SIZE, RADIAL_MENU_SIZE))
        .map_err(|e| AppError::Window(format!("重置径向菜单尺寸失败: {}", e)))?;

    let current_monitor = window
        .current_monitor()
        .map_err(|e| AppError::Window(format!("读取径向菜单当前显示器失败: {}", e)))?;

    let cursor_pos = cursor::get_cursor_position_with_retry(current_monitor.as_ref()).await;

    let half = RADIAL_MENU_SIZE as i32 / 2;
    let target = PhysicalPosition::new(
        cursor_pos.x.saturating_add(-half),
        cursor_pos.y.saturating_add(-half),
    );

    window
        .set_position(target)
        .map_err(|e| AppError::Window(format!("移动径向菜单窗口失败: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub async fn set_radial_menu_mouse_passthrough(
    app: AppHandle,
    passthrough: bool,
) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        window
            .set_ignore_cursor_events(passthrough)
            .map_err(|e| AppError::Window(format!("设置径向菜单鼠标穿透失败: {}", e)))?;
    }
    Ok(())
}

/// 判断 HUD 宿主窗口是否持有焦点
///
/// 用于主窗口失焦时判断焦点是否转移到了 HUD 子窗口，
/// 如果是则不应隐藏 HUD。
pub fn is_any_hud_focused(app: &AppHandle) -> bool {
    if let Some(w) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        if w.is_focused().unwrap_or(false) {
            return true;
        }
    }
    false
}

/// 检测当前前景窗口是否属于本应用。
///
/// 在 Windows 上通过 Win32 `GetForegroundWindow` 获取前景 HWND，
/// 与本应用所有已知窗口的 HWND 进行比对。
/// 在非 Windows 平台上回退到 Tauri 的 `is_focused()` 检查。
///
/// 主要用途：主窗口 blur 事件触发时，判断用户是在与自己的
/// HUD 窗口交互（不应隐藏 HUD），还是真正切换到了其他应用。
#[tauri::command]
pub fn is_app_foreground_window(app: AppHandle) -> bool {
    is_app_foreground_window_inner(&app)
}

fn is_app_foreground_window_inner(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

        let fg_hwnd = unsafe { GetForegroundWindow() };
        if fg_hwnd.0.is_null() {
            return false;
        }

        let labels = [
            WINDOW_LABEL_MAIN,
            WINDOW_LABEL_HUD_HOST,
        ];
        for label in labels {
            if let Some(w) = app.get_webview_window(label) {
                if let Ok(hwnd) = w.hwnd() {
                    if std::ptr::eq(hwnd.0 as *const (), fg_hwnd.0 as *const ()) {
                        return true;
                    }
                }
            }
        }
        false
    }

    #[cfg(not(target_os = "windows"))]
    {
        let labels = [
            WINDOW_LABEL_MAIN,
            WINDOW_LABEL_HUD_HOST,
        ];
        for label in labels {
            if let Some(w) = app.get_webview_window(label) {
                if w.is_focused().unwrap_or(false) {
                    return true;
                }
            }
        }
        false
    }
}

/// 隐藏 HUD 宿主窗口
///
/// 当主窗口隐藏时调用，避免 HUD 残留在屏幕上。
pub fn hide_all_hud_windows(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(WINDOW_LABEL_HUD_HOST) {
        let _ = w.destroy();
    }
}

// 重新导出 Monitor 类型，方便上层统一引用
pub use tauri::Monitor;

