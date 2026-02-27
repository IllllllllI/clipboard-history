//! 窗口位置计算模块
//!
//! 该模块实现“单显示器内”的核心几何算法：
//! 在尽量贴近光标的前提下，保证窗口完整落在屏幕边界内。
//!
//! # 设计思路
//!
//! - 算法纯函数化：输入为光标、窗口尺寸、屏幕尺寸，输出唯一坐标，便于测试。
//! - 先算理想位置，再做边界收敛，逻辑清晰且可证明不会越界。
//! - 对异常输入（零尺寸、窗口大于屏幕）给出安全回退，避免上层崩溃。
//!
//! # 实现思路
//!
//! 1. 处理异常尺寸，必要时直接返回 `(0, 0)`。
//! 2. 以“窗口中心对齐光标”计算理想左上角。
//! 3. 分别对 X/Y 轴进行区间裁剪，使窗口保持在 `[0, screen - window]`。
//! 4. 返回最终位置。

use tauri::{PhysicalPosition, PhysicalSize};

/// 计算窗口在屏幕中的最优位置（贴近光标且不越界）
///
/// 该函数实现窗口定位的核心规则：
/// 先让窗口中心与光标对齐，再将结果收敛到屏幕可见范围内。
///
/// # 设计思路
/// - 将问题拆分为“理想位置计算”与“边界约束”两阶段，易读且稳定。
/// - X/Y 轴独立处理，便于扩展（例如后续增加边距策略）。
/// - 通过饱和运算和显式分支避免整数溢出与符号边界问题。
///
/// # 已覆盖的边界场景
/// - 窗口大于屏幕：返回 `(0, 0)`，尽可能显示窗口内容
/// - 光标位于边界：自动向内收敛，不让窗口超界
/// - 负坐标输入：裁剪到最小可见位置
/// - 零尺寸输入：返回 `(0, 0)` 作为安全兜底
///
/// # 实现步骤
/// 1. 处理异常尺寸（零尺寸、窗口超屏）
/// 2. 计算理想位置（窗口中心对齐光标）
/// 3. 修正 X 坐标，确保横向不越界
/// 4. 修正 Y 坐标，确保纵向不越界
/// 5. 返回最终坐标
///
/// # 参数
/// * `cursor_pos` - 屏幕坐标系下的光标位置
/// * `window_size` - 窗口尺寸（宽、高）
/// * `screen_bounds` - 屏幕尺寸（宽、高）
///
/// # 返回
/// 返回窗口左上角坐标 `PhysicalPosition<i32>`
///
/// # 后置条件
/// - `result.x >= 0`
/// - `result.y >= 0`
/// - 若窗口可容纳：`result.x + window_size.width <= screen_bounds.width`
/// - 若窗口可容纳：`result.y + window_size.height <= screen_bounds.height`
/// - 若窗口超屏：`result == (0, 0)`
///
/// # 示例
/// ```ignore
/// use tauri::{PhysicalPosition, PhysicalSize};
///
/// let cursor = PhysicalPosition::new(1000, 500);
/// let window = PhysicalSize::new(800, 600);
/// let screen = PhysicalSize::new(1920, 1080);
///
/// let position = calculate_window_position(cursor, window, screen);
/// ```
pub fn calculate_window_position(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    screen_bounds: PhysicalSize<u32>
) -> PhysicalPosition<i32> {
    // 边界场景 1：窗口或屏幕任一维度为 0，无法进行有效定位，直接回退到原点
    if window_size.width == 0 || window_size.height == 0 ||
       screen_bounds.width == 0 || screen_bounds.height == 0 {
        log::warn!("Zero-sized window or screen detected. Returning (0, 0).");
        return PhysicalPosition::new(0, 0);
    }

    // 边界场景 2：窗口大于屏幕，无法完全显示，固定放置在左上角
    if window_size.width > screen_bounds.width || window_size.height > screen_bounds.height {
        log::warn!(
            "Warning: Window size ({}x{}) exceeds screen bounds ({}x{}). Positioning at (0, 0).",
            window_size.width, window_size.height, screen_bounds.width, screen_bounds.height
        );
        return PhysicalPosition::new(0, 0);
    }

    // 步骤 1：计算理想位置（窗口中心对齐光标）
    let ideal_x = cursor_pos.x.saturating_sub(window_size.width as i32 / 2);
    let ideal_y = cursor_pos.y.saturating_sub(window_size.height as i32 / 2);

    // 步骤 2：修正 X 坐标，保证窗口完全处于屏幕横向范围
    let final_x = if ideal_x < 0 {
        0
    } else if ideal_x.saturating_add(window_size.width as i32) > screen_bounds.width as i32 {
        screen_bounds.width as i32 - window_size.width as i32
    } else {
        ideal_x
    };

    // 步骤 3：修正 Y 坐标，保证窗口完全处于屏幕纵向范围
    let final_y = if ideal_y < 0 {
        0
    } else if ideal_y.saturating_add(window_size.height as i32) > screen_bounds.height as i32 {
        screen_bounds.height as i32 - window_size.height as i32
    } else {
        ideal_y
    };

    PhysicalPosition::new(final_x, final_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_window_position_cursor_at_center() {
        let cursor = PhysicalPosition::new(960, 540);
        let window = PhysicalSize::new(800, 600);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_window_position(cursor, window, screen);

        assert_eq!(result.x, 960 - 400);
        assert_eq!(result.y, 540 - 300);
    }

    #[test]
    fn test_calculate_window_position_cursor_at_top_left() {
        let cursor = PhysicalPosition::new(0, 0);
        let window = PhysicalSize::new(800, 600);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_window_position(cursor, window, screen);

        assert_eq!(result.x, 0);
        assert_eq!(result.y, 0);
    }

    #[test]
    fn test_calculate_window_position_cursor_at_bottom_right() {
        let cursor = PhysicalPosition::new(1920, 1080);
        let window = PhysicalSize::new(800, 600);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_window_position(cursor, window, screen);

        assert_eq!(result.x, 1920 - 800);
        assert_eq!(result.y, 1080 - 600);
    }

    #[test]
    fn test_calculate_window_position_window_larger_than_screen() {
        let cursor = PhysicalPosition::new(960, 540);
        let window = PhysicalSize::new(2000, 1200);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_window_position(cursor, window, screen);

        assert_eq!(result.x, 0);
        assert_eq!(result.y, 0);
    }

    #[test]
    fn test_calculate_window_position_zero_window_size() {
        let cursor = PhysicalPosition::new(960, 540);
        let window = PhysicalSize::new(0, 0);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_window_position(cursor, window, screen);

        assert_eq!(result.x, 0);
        assert_eq!(result.y, 0);
    }

    #[test]
    fn test_calculate_window_position_deterministic() {
        let cursor = PhysicalPosition::new(1000, 500);
        let window = PhysicalSize::new(800, 600);
        let screen = PhysicalSize::new(1920, 1080);

        let result1 = calculate_window_position(cursor, window, screen);
        let result2 = calculate_window_position(cursor, window, screen);

        assert_eq!(result1.x, result2.x);
        assert_eq!(result1.y, result2.y);
    }
}
