//! 窗口位置计算模块
//!
//! 该模块实现"单显示器内"的核心几何算法，提供两种定位策略：
//!
//! 1. **智能贴近光标** (`calculate_smart_near_cursor`)：
//!    窗口默认出现在光标右下方（带 8px 偏移），当空间不足时自动翻转方向。
//!    类似右键菜单/下拉弹窗的行为，光标不会遮挡窗口内容。
//!
//! 2. **窗口中心对齐光标** (`calculate_window_position`)：
//!    窗口中心点对齐光标位置，再做边界收敛。
//!
//! # 设计思路
//!
//! - 算法纯函数化：输入为光标、窗口尺寸、屏幕尺寸，输出唯一坐标，便于测试。
//! - 先算理想位置，再做边界收敛，逻辑清晰且可证明不会越界。
//! - 对异常输入（零尺寸、窗口大于屏幕）给出安全回退，避免上层崩溃。

use tauri::{PhysicalPosition, PhysicalSize};

/// 光标与窗口之间的偏移像素
const CURSOR_OFFSET: i32 = 8;

/// 智能贴近光标定位（类似右键菜单/下拉弹窗）
///
/// 默认将窗口放置在光标**右下方**（带 `CURSOR_OFFSET` 偏移），
/// 当右侧或下方空间不足时自动翻转到对侧，确保窗口完全在屏幕内。
///
/// # 翻转规则
/// - **X 轴**：右侧放不下 → 翻到光标左侧
/// - **Y 轴**：下方放不下 → 翻到光标上方
/// - 翻转后仍溢出 → 贴屏幕该侧边界
///
/// # 与 `calculate_window_position` 的区别
/// | | `smart_near_cursor` | `window_position`（中心对齐） |
/// |---|---|---|
/// | 锚点 | 光标在窗口左上角外侧 | 光标在窗口中心 |
/// | 适用场景 | 快速操作、减少遮挡 | 对称美观 |
///
/// # 参数
/// * `cursor_pos`    - 屏幕坐标系下的光标位置
/// * `window_size`   - 窗口尺寸（宽、高）
/// * `screen_bounds` - 屏幕尺寸（宽、高）
///
/// # 返回
/// 窗口左上角坐标
pub fn calculate_smart_near_cursor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    screen_bounds: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    // 异常兜底
    if window_size.width == 0 || window_size.height == 0 ||
       screen_bounds.width == 0 || screen_bounds.height == 0 {
        return PhysicalPosition::new(0, 0);
    }
    if window_size.width > screen_bounds.width || window_size.height > screen_bounds.height {
        return PhysicalPosition::new(0, 0);
    }

    let sw = screen_bounds.width as i32;
    let sh = screen_bounds.height as i32;
    let ww = window_size.width as i32;
    let wh = window_size.height as i32;

    // X 轴：优先放右侧，放不下翻左侧
    let final_x = {
        let right_x = cursor_pos.x + CURSOR_OFFSET;
        if right_x + ww <= sw {
            right_x
        } else {
            let left_x = cursor_pos.x - CURSOR_OFFSET - ww;
            if left_x >= 0 {
                left_x
            } else {
                // 两边都放不下，贴紧右边界
                (sw - ww).max(0)
            }
        }
    };

    // Y 轴：优先放下方，放不下翻上方
    let final_y = {
        let below_y = cursor_pos.y + CURSOR_OFFSET;
        if below_y + wh <= sh {
            below_y
        } else {
            let above_y = cursor_pos.y - CURSOR_OFFSET - wh;
            if above_y >= 0 {
                above_y
            } else {
                // 两边都放不下，贴紧下边界
                (sh - wh).max(0)
            }
        }
    };

    PhysicalPosition::new(final_x, final_y)
}

/// 计算窗口在屏幕中的最优位置（窗口中心对齐光标，再做边界收敛）
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

    // ---------- calculate_smart_near_cursor ----------

    #[test]
    fn test_smart_cursor_at_center_goes_right_below() {
        // 光标在屏幕中间，右下方空间充足 → 窗口在光标右下方
        let cursor = PhysicalPosition::new(500, 400);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_smart_near_cursor(cursor, window, screen);

        assert_eq!(result.x, 500 + 8);  // cursor_x + OFFSET
        assert_eq!(result.y, 400 + 8);  // cursor_y + OFFSET
    }

    #[test]
    fn test_smart_cursor_near_right_edge_flips_left() {
        // 光标贴近右边缘，右侧放不下 → 翻到左侧
        let cursor = PhysicalPosition::new(1800, 400);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_smart_near_cursor(cursor, window, screen);

        // left_x = 1800 - 8 - 400 = 1392
        assert_eq!(result.x, 1392);
        assert_eq!(result.y, 400 + 8);
    }

    #[test]
    fn test_smart_cursor_near_bottom_edge_flips_up() {
        // 光标贴近下边缘，下方放不下 → 翻到上方
        let cursor = PhysicalPosition::new(500, 900);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_smart_near_cursor(cursor, window, screen);

        assert_eq!(result.x, 500 + 8);
        // above_y = 900 - 8 - 300 = 592
        assert_eq!(result.y, 592);
    }

    #[test]
    fn test_smart_cursor_at_bottom_right_flips_both() {
        // 光标在右下角 → 两边都翻
        let cursor = PhysicalPosition::new(1800, 900);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_smart_near_cursor(cursor, window, screen);

        assert_eq!(result.x, 1800 - 8 - 400);  // 1392
        assert_eq!(result.y, 900 - 8 - 300);    // 592
    }

    #[test]
    fn test_smart_cursor_at_origin() {
        // 光标在左上角 → 右下方放
        let cursor = PhysicalPosition::new(0, 0);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let result = calculate_smart_near_cursor(cursor, window, screen);

        assert_eq!(result.x, 8);
        assert_eq!(result.y, 8);
    }

    #[test]
    fn test_smart_differs_from_center() {
        // 验证 smart 和 center 结果不同
        let cursor = PhysicalPosition::new(500, 400);
        let window = PhysicalSize::new(400, 300);
        let screen = PhysicalSize::new(1920, 1080);

        let smart = calculate_smart_near_cursor(cursor, window, screen);
        let center = calculate_window_position(cursor, window, screen);

        // smart: (508, 408), center: (300, 250) — 明显不同
        assert_ne!(smart.x, center.x);
        assert_ne!(smart.y, center.y);
    }
}
