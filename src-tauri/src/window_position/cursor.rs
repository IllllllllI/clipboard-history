//! 光标位置模块（跨平台）
//!
//! 该模块负责在 Windows、macOS、Linux 上统一获取光标坐标，
//! 并向上层提供一致的坐标语义。
//!
//! # 设计思路
//!
//! - 平台差异下沉：按平台分别实现底层读取函数，对上层暴露统一接口。
//! - 可靠性优先：加入短重试与指数退避，降低偶发读取失败对体验的影响。
//! - 可用性兜底：连续失败时回退到屏幕中心，保证窗口定位流程可继续执行。
//!
//! # 实现思路
//!
//! - `get_cursor_position()`：平台专属实现，负责“单次读取”。
//! - `get_cursor_position_with_retry()`：通用包装，负责重试、延迟、回退。
//! - macOS 分支完成坐标系换算，统一为左上角原点坐标。
//!
//! # 坐标系统处理
//!
//! 不同系统坐标系差异：
//! - **Windows / Linux**：左上角原点，Y 轴向下增大
//! - **macOS**：左下角原点，Y 轴向上增大
//!
//! macOS 坐标换算公式：`y_top_left = screen_height - y_bottom_left`

use tauri::{PhysicalPosition, Monitor};
use std::time::Duration;

/// 获取光标位置（带重试与回退）
///
/// 该函数包装平台特定读取逻辑：若单次失败会进行有限重试，
/// 所有重试失败后回退到屏幕中心（或原点）。
///
/// # 设计思路
/// - 在性能与稳定性之间平衡：限制重试次数，避免阻塞主流程。
/// - 回退值可用优先：即使系统调用异常，也尽量返回“可定位”坐标。
///
/// # 重试策略
/// - 最大尝试次数：3 次
/// - 退避延迟：10ms、20ms（指数退避）
/// - 目标耗时：控制在 100ms 量级内
/// - 最终回退：优先返回显示器中心，其次 `(0, 0)`
///
/// # 参数
/// * `monitor` - 可选显示器信息，用于计算中心点回退坐标
///
/// # 返回
/// - `PhysicalPosition<i32>`：成功时返回真实光标坐标；失败时返回回退坐标
///
/// # 示例
/// ```ignore
/// let monitor = window.current_monitor().ok().flatten();
/// let cursor_pos = get_cursor_position_with_retry(monitor.as_ref()).await;
/// println!("光标位置: ({}, {})", cursor_pos.x, cursor_pos.y);
/// ```
pub async fn get_cursor_position_with_retry(monitor: Option<&Monitor>) -> PhysicalPosition<i32> {
    const MAX_RETRIES: u32 = 3;
    const INITIAL_DELAY_MS: u64 = 10;

    let mut delay_ms = INITIAL_DELAY_MS;

    for attempt in 0..MAX_RETRIES {
        match get_cursor_position().await {
            Ok(pos) => {
                if attempt > 0 {
                    log::debug!("Successfully retrieved cursor position on attempt {}", attempt + 1);
                }
                return pos;
            }
            Err(e) => {
                log::warn!("Failed to get cursor position (attempt {}): {}", attempt + 1, e);

                if attempt < MAX_RETRIES - 1 {
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                    delay_ms *= 2;
                }
            }
        }
    }

    log::warn!("所有获取光标位置的尝试均失败，回退到屏幕中心。");

    if let Some(monitor) = monitor {
        let size = monitor.size();
        let position = monitor.position();

        let center_x = position.x + (size.width as i32 / 2);
        let center_y = position.y + (size.height as i32 / 2);

        PhysicalPosition::new(center_x, center_y)
    } else {
        log::warn!("没有可用的显示器信息，使用原点 (0, 0) 作为回退。");
        PhysicalPosition::new(0, 0)
    }
}

/// 在 Windows 上获取光标位置
#[cfg(target_os = "windows")]
pub async fn get_cursor_position() -> Result<PhysicalPosition<i32>, String> {
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows::Win32::Foundation::POINT;

    unsafe {
        let mut point = POINT { x: 0, y: 0 };
        GetCursorPos(&mut point)
            .map_err(|e| format!("Failed to get cursor position: {:?}", e))?;

        Ok(PhysicalPosition::new(point.x, point.y))
    }
}

/// 在 macOS 上获取光标位置（含坐标系转换）
#[cfg(target_os = "macos")]
pub async fn get_cursor_position() -> Result<PhysicalPosition<i32>, String> {
    use cocoa::appkit::{NSEvent, NSScreen};
    use cocoa::foundation::NSPoint;

    unsafe {
        let location: NSPoint = NSEvent::mouseLocation();

        let main_screen = NSScreen::mainScreen();
        if main_screen.is_null() {
            return Err("Failed to get main screen for coordinate conversion".to_string());
        }

        let screen_frame = NSScreen::frame(main_screen);
        let screen_height = screen_frame.size.height;

        // 将左下角原点坐标转换为左上角原点坐标
        let y_top_left = screen_height - location.y;

        Ok(PhysicalPosition::new(location.x as i32, y_top_left as i32))
    }
}

/// 在 Linux（X11）上获取光标位置
#[cfg(target_os = "linux")]
pub async fn get_cursor_position() -> Result<PhysicalPosition<i32>, String> {
    use x11::xlib::{XOpenDisplay, XQueryPointer, XDefaultRootWindow, XCloseDisplay};
    use std::ptr;

    unsafe {
        let display = XOpenDisplay(ptr::null());
        if display.is_null() {
            return Err("Failed to open X11 display".to_string());
        }

        let root = XDefaultRootWindow(display);

        let mut root_return = 0;
        let mut child_return = 0;
        let mut root_x = 0;
        let mut root_y = 0;
        let mut win_x = 0;
        let mut win_y = 0;
        let mut mask_return = 0;

        let result = XQueryPointer(
            display,
            root,
            &mut root_return,
            &mut child_return,
            &mut root_x,
            &mut root_y,
            &mut win_x,
            &mut win_y,
            &mut mask_return
        );

        XCloseDisplay(display);

        if result == 0 {
            return Err("XQueryPointer failed to retrieve cursor position".to_string());
        }

        Ok(PhysicalPosition::new(root_x, root_y))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    // ========================================================================
    // 平台特定测试（仅在对应平台编译/运行，依赖真实 OS 环境）
    // ========================================================================

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_windows_get_cursor_position_returns_valid_coordinates() {
        let result = get_cursor_position().await;
        assert!(result.is_ok(), "Should successfully get cursor position on Windows");

        let pos = result.unwrap();
        assert!(pos.x >= -10000 && pos.x <= 10000, "X coordinate should be reasonable");
        assert!(pos.y >= -10000 && pos.y <= 10000, "Y coordinate should be reasonable");
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn test_windows_get_cursor_position_is_deterministic() {
        let pos1 = get_cursor_position().await;
        let pos2 = get_cursor_position().await;

        assert!(pos1.is_ok(), "First call should succeed");
        assert!(pos2.is_ok(), "Second call should succeed");

        let p1 = pos1.unwrap();
        let p2 = pos2.unwrap();
        let distance = ((p1.x - p2.x).pow(2) + (p1.y - p2.y).pow(2)) as f64;
        let distance = distance.sqrt();

        assert!(distance < 100.0, "Cursor positions should be close together, got distance: {}", distance);
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn test_macos_get_cursor_position_returns_valid_coordinates() {
        let result = get_cursor_position().await;
        assert!(result.is_ok(), "Should successfully get cursor position on macOS");

        let pos = result.unwrap();
        assert!(pos.x >= -10000 && pos.x <= 10000, "X coordinate should be reasonable");
        assert!(pos.y >= -10000 && pos.y <= 10000, "Y coordinate should be reasonable");
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn test_macos_coordinate_conversion() {
        let result = get_cursor_position().await;
        assert!(result.is_ok(), "Should successfully get cursor position on macOS");

        let pos = result.unwrap();
        assert!(pos.y >= 0, "Y coordinate should be non-negative after conversion to top-left origin");
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn test_linux_get_cursor_position_returns_valid_coordinates() {
        let result = get_cursor_position().await;
        assert!(result.is_ok(), "Should successfully get cursor position on Linux");

        let pos = result.unwrap();
        assert!(pos.x >= -10000 && pos.x <= 10000, "X coordinate should be reasonable");
        assert!(pos.y >= -10000 && pos.y <= 10000, "Y coordinate should be reasonable");
    }

    // ========================================================================
    // 通用测试（所有平台均可运行，测试重试/回退/性能等通用逻辑）
    // ========================================================================

    #[tokio::test]
    async fn test_get_cursor_position_with_retry_succeeds() {
        let pos = get_cursor_position_with_retry(None).await;
        assert!(pos.x >= -10000 && pos.x <= 10000, "X coordinate should be reasonable");
        assert!(pos.y >= -10000 && pos.y <= 10000, "Y coordinate should be reasonable");
    }

    #[tokio::test]
    async fn test_get_cursor_position_with_retry_performance() {
        let start = Instant::now();
        let _pos = get_cursor_position_with_retry(None).await;
        let elapsed = start.elapsed();

        assert!(elapsed.as_millis() < 150,
            "Cursor position retrieval should complete within 150ms, took {}ms",
            elapsed.as_millis());
    }

    #[tokio::test]
    async fn test_get_cursor_position_with_retry_is_deterministic() {
        let pos1 = get_cursor_position_with_retry(None).await;
        let pos2 = get_cursor_position_with_retry(None).await;

        let distance = ((pos1.x - pos2.x).pow(2) + (pos1.y - pos2.y).pow(2)) as f64;
        let distance = distance.sqrt();

        assert!(distance < 100.0, "Retry wrapper should return consistent positions, got distance: {}", distance);
    }
}
