//! 窗口位置计算模块（纯函数，零副作用）
//!
//! 该模块实现"单显示器内"的核心几何算法，提供两种定位策略：
//!
//! 1. **智能贴近光标** ([`calculate_smart_near_cursor`])：
//!    窗口默认出现在光标右下方（带偏移），当空间不足时自动翻转方向。
//!    类似右键菜单/下拉弹窗的行为，光标不会遮挡窗口内容。
//!
//! 2. **窗口中心对齐光标** ([`calculate_window_position`])：
//!    窗口中心点对齐光标位置，再做边界收敛。
//!
//! # 设计思路
//!
//! - **纯函数化**：所有函数仅依赖输入参数，不含 I/O、log、全局状态，
//!   便于单元测试与属性测试（property-based testing），调用方按需记日志。
//! - **DRY**：共用验证（[`validate_dimensions`]）与坐标钳位（[`clamp_axis`]）
//!   消除重复逻辑，保证两策略行为一致。
//! - 先算理想位置，再做边界收敛，逻辑清晰且可证明不会越界。
//! - 对异常输入（零尺寸、窗口大于屏幕）给出安全回退，避免上层崩溃。

use tauri::{PhysicalPosition, PhysicalSize};

/// 光标与窗口之间的默认偏移像素
pub const DEFAULT_CURSOR_OFFSET: i32 = 8;

// ── 内部工具 ────────────────────────────────────────────────

/// 校验后的安全 i32 尺寸，保证全部为正数且窗口 ≤ 屏幕。
struct Dimensions {
    sw: i32,
    sh: i32,
    ww: i32,
    wh: i32,
}

/// 校验窗口/屏幕尺寸。返回 `None` 代表无法定位，调用方应回退 `(0, 0)`。
///
/// 校验规则：
/// - 任一维度为 0 → 无效
/// - 窗口大于屏幕 → 无法完全容纳
#[inline]
fn validate_dimensions(
    window_size: PhysicalSize<u32>,
    screen_bounds: PhysicalSize<u32>,
) -> Option<Dimensions> {
    let (ww, wh) = (window_size.width, window_size.height);
    let (sw, sh) = (screen_bounds.width, screen_bounds.height);

    if ww == 0 || wh == 0 || sw == 0 || sh == 0 || ww > sw || wh > sh {
        return None;
    }

    Some(Dimensions {
        sw: sw as i32,
        sh: sh as i32,
        ww: ww as i32,
        wh: wh as i32,
    })
}

/// 将坐标钳位到 `[0, max_pos]`，`max_pos < 0` 时回退为 0。
#[inline]
fn clamp_axis(value: i32, max_pos: i32) -> i32 {
    value.clamp(0, max_pos.max(0))
}

// ── 定位策略 ────────────────────────────────────────────────

/// 智能贴近光标定位（类似右键菜单/下拉弹窗）
///
/// 默认将窗口放置在光标**右下方**（带 [`DEFAULT_CURSOR_OFFSET`] 偏移），
/// 当右侧或下方空间不足时自动翻转到对侧，确保窗口完全在屏幕内。
///
/// # 翻转规则
/// - **X 轴**：右侧放不下 → 翻到光标左侧
/// - **Y 轴**：下方放不下 → 翻到光标上方
/// - 翻转后仍溢出 → 贴屏幕该侧边界
///
/// # 与 [`calculate_window_position`] 的区别
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
/// 窗口左上角坐标；异常输入时返回 `(0, 0)`
pub fn calculate_smart_near_cursor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    screen_bounds: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let d = match validate_dimensions(window_size, screen_bounds) {
        Some(d) => d,
        None => return PhysicalPosition::new(0, 0),
    };

    let offset = DEFAULT_CURSOR_OFFSET;

    // X 轴：优先放右侧，放不下翻左侧
    let final_x = {
        let right_x = cursor_pos.x + offset;
        if right_x + d.ww <= d.sw {
            right_x
        } else {
            let left_x = cursor_pos.x - offset - d.ww;
            if left_x >= 0 { left_x } else { (d.sw - d.ww).max(0) }
        }
    };

    // Y 轴：优先放下方，放不下翻上方
    let final_y = {
        let below_y = cursor_pos.y + offset;
        if below_y + d.wh <= d.sh {
            below_y
        } else {
            let above_y = cursor_pos.y - offset - d.wh;
            if above_y >= 0 { above_y } else { (d.sh - d.wh).max(0) }
        }
    };

    PhysicalPosition::new(final_x, final_y)
}

/// 计算窗口在屏幕中的最优位置（窗口中心对齐光标，再做边界收敛）
///
/// # 设计思路
/// - 将问题拆分为"理想位置计算"与"边界约束"两阶段，易读且稳定。
/// - X/Y 轴独立处理，便于扩展（例如后续增加边距策略）。
/// - 通过 [`clamp_axis`] 统一处理负坐标与超界情况。
///
/// # 已覆盖的边界场景
/// - 窗口大于屏幕 / 零尺寸：返回 `(0, 0)`
/// - 光标位于边界：自动向内收敛
/// - 负坐标输入：裁剪到最小可见位置
///
/// # 参数
/// * `cursor_pos`    - 屏幕坐标系下的光标位置
/// * `window_size`   - 窗口尺寸（宽、高）
/// * `screen_bounds` - 屏幕尺寸（宽、高）
///
/// # 返回
/// 窗口左上角坐标 `PhysicalPosition<i32>`
///
/// # 后置条件
/// - `result.x >= 0`、`result.y >= 0`
/// - 若窗口可容纳：`result.x + window_size.width <= screen_bounds.width`
/// - 若窗口可容纳：`result.y + window_size.height <= screen_bounds.height`
/// - 若窗口超屏 / 零尺寸：`result == (0, 0)`
pub fn calculate_window_position(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    screen_bounds: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let d = match validate_dimensions(window_size, screen_bounds) {
        Some(d) => d,
        None => return PhysicalPosition::new(0, 0),
    };

    // 理想位置：窗口中心对齐光标
    let ideal_x = cursor_pos.x.saturating_sub(d.ww / 2);
    let ideal_y = cursor_pos.y.saturating_sub(d.wh / 2);

    // 边界收敛
    PhysicalPosition::new(
        clamp_axis(ideal_x, d.sw - d.ww),
        clamp_axis(ideal_y, d.sh - d.wh),
    )
}

#[cfg(test)]
#[path = "tests/calculation_tests.rs"]
mod tests;
