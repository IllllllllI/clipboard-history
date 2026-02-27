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

use tauri::Window;
use crate::error::AppError;
use std::time::Instant;

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

async fn compute_target_position(window: &Window) -> Result<tauri::PhysicalPosition<i32>, AppError> {
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
    let target = monitor::calculate_window_position_multi_monitor(
        cursor_pos,
        window_size,
        &monitors,
    );
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

    let target_position = compute_target_position(&window).await?;

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

    let target_position = compute_target_position(&window).await?;

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
    restore_if_minimized(&window)?;

    let state = window_state::get_window_state(&window)?;

    match (state.is_visible, state.is_focused) {
        (false, _) => {
            log::debug!("窗口处于隐藏状态，正在显示到光标附近");
            show_window_at_cursor(window).await
        }
        (true, false) => {
            log::debug!("窗口可见但未聚焦，正在重定位并恢复焦点");
            reposition_and_focus(window).await
        }
        (true, true) => {
            log::debug!("窗口可见且已聚焦，正在隐藏");
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
pub async fn handle_global_shortcut(window: Window) -> Result<(), AppError> {
    log::debug!("全局快捷键触发，开始切换窗口状态");
    toggle_window(window).await
}

// 重新导出 Monitor 类型，方便上层统一引用
pub use tauri::Monitor;
