//! 多显示器支持模块
//!
//! 该模块负责在多屏环境中完成两件事：
//! 1) 判断光标当前位于哪块显示器；
//! 2) 基于该显示器计算窗口最终全局坐标。
//!
//! # 设计思路
//!
//! - 复用单屏算法：先把全局坐标转换为"显示器内相对坐标"，
//!   使用 `calculation` 计算后再映射回全局坐标。
//! - 将"显示器选择"与"位置计算"拆分，保证函数职责单一。
//! - 提供无显示器/未命中显示器时的兜底策略，提升鲁棒性。
//! - 核心几何判断抽取为不依赖 `Monitor` 的纯函数，便于单元测试。
//! - **策略泛型化**：通过 [`position_in_monitor_with`] / [`multi_monitor_with`]
//!   消除中心对齐与智能贴近两套策略的重复代码，仅需传递不同的定位函数。
//!
//! # 实现思路
//!
//! - 遍历显示器边界判断光标归属。
//! - 采用左闭右开区间判断边界，避免双屏交界点重复命中。
//! - 纯函数层（`is_cursor_in_monitor_bounds` / `find_cursor_monitor_index` /
//!   `position_in_monitor_with`）不依赖 `tauri::Monitor`，可直接单元测试。
//! - 高层 API 仅从 `Monitor` 中提取数据后委托纯函数，保证可测试性。

use tauri::{PhysicalPosition, PhysicalSize, Monitor};
use super::calculation::{calculate_window_position, calculate_smart_near_cursor};

/// 单屏定位函数签名（光标, 窗口尺寸, 屏幕尺寸 → 窗口坐标）
type PositionStrategy = fn(PhysicalPosition<i32>, PhysicalSize<u32>, PhysicalSize<u32>) -> PhysicalPosition<i32>;

// ============================================================================
// 纯几何函数（不依赖 tauri::Monitor，可直接单元测试）
// ============================================================================

/// 判断光标是否在指定的显示器区域内
///
/// 使用左闭右开区间 `[left, right)` × `[top, bottom)` 判断归属，
/// 保证相邻显示器交界处不会重复命中。
///
/// # 参数
/// * `cursor_pos`   - 光标的全局坐标
/// * `monitor_pos`  - 显示器左上角的全局坐标
/// * `monitor_size` - 显示器尺寸（宽、高）
///
/// # 返回
/// `true` 表示光标在该区域内
pub fn is_cursor_in_monitor_bounds(
    cursor_pos: PhysicalPosition<i32>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> bool {
    let x_in_bounds = cursor_pos.x >= monitor_pos.x
        && cursor_pos.x < monitor_pos.x + monitor_size.width as i32;
    let y_in_bounds = cursor_pos.y >= monitor_pos.y
        && cursor_pos.y < monitor_pos.y + monitor_size.height as i32;
    x_in_bounds && y_in_bounds
}

/// 在一组显示器区域中查找光标所在的索引
///
/// 遍历显示器位置/尺寸列表，返回第一个包含光标的索引。
/// 若均未命中，返回 `None`。
///
/// # 参数
/// * `cursor_pos` - 光标的全局坐标
/// * `monitors`   - 显示器 (位置, 尺寸) 的列表
///
/// # 返回
/// - `Some(index)`：光标落在第 `index` 块显示器
/// - `None`：所有显示器均未命中
pub fn find_cursor_monitor_index(
    cursor_pos: PhysicalPosition<i32>,
    monitors: &[(PhysicalPosition<i32>, PhysicalSize<u32>)],
) -> Option<usize> {
    monitors.iter().position(|(pos, size)| {
        is_cursor_in_monitor_bounds(cursor_pos, *pos, *size)
    })
}

/// 通用单屏定位：在指定显示器区域内，以给定策略计算窗口全局坐标
///
/// 将"全局坐标问题"转为"单屏相对坐标问题"：
/// 先将光标换算为显示器内相对坐标 → 调用 `strategy` → 映射回全局坐标。
///
/// 通过函数指针参数消除中心对齐 / 智能贴近两套策略的重复代码。
///
/// # 参数
/// * `cursor_pos`   - 全局坐标系中的光标位置
/// * `window_size`  - 窗口尺寸
/// * `monitor_pos`  - 目标显示器左上角全局坐标
/// * `monitor_size` - 目标显示器尺寸
/// * `strategy`     - 单屏定位函数
///
/// # 返回
/// 窗口左上角的全局坐标
fn position_in_monitor_with(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
    strategy: PositionStrategy,
) -> PhysicalPosition<i32> {
    let relative_cursor = PhysicalPosition::new(
        cursor_pos.x - monitor_pos.x,
        cursor_pos.y - monitor_pos.y,
    );

    let relative_pos = strategy(relative_cursor, window_size, monitor_size);

    PhysicalPosition::new(
        monitor_pos.x + relative_pos.x,
        monitor_pos.y + relative_pos.y,
    )
}

/// 在指定显示器区域内计算窗口的全局坐标（中心对齐策略）
///
/// 委托 [`position_in_monitor_with`] + [`calculate_window_position`]。
pub fn calculate_position_in_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    position_in_monitor_with(cursor_pos, window_size, monitor_pos, monitor_size, calculate_window_position)
}

/// 在指定显示器区域内，以"智能贴近光标"策略计算窗口全局坐标
///
/// 委托 [`position_in_monitor_with`] + [`calculate_smart_near_cursor`]。
pub fn calculate_smart_position_in_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    position_in_monitor_with(cursor_pos, window_size, monitor_pos, monitor_size, calculate_smart_near_cursor)
}

// ============================================================================
// 高层 API（依赖 tauri::Monitor，委托纯函数完成计算）
// ============================================================================

/// 检测光标所在显示器
///
/// 遍历所有可用显示器，内部委托 `is_cursor_in_monitor_bounds` 判断归属。
/// 未命中时回退到首个显示器。
///
/// # 参数
/// * `cursor_pos` - 全局屏幕坐标系下的光标位置
/// * `monitors`   - 可用显示器切片
///
/// # 返回
/// - `Some(&Monitor)`：命中的显示器（或首屏保底）
/// - `None`：`monitors` 为空
pub fn detect_cursor_monitor<'a>(
    cursor_pos: PhysicalPosition<i32>,
    monitors: &'a [Monitor]
) -> Option<&'a Monitor> {
    for monitor in monitors {
        if is_cursor_in_monitor_bounds(cursor_pos, *monitor.position(), *monitor.size()) {
            return Some(monitor);
        }
    }
    monitors.first()
}

/// 基于指定显示器计算窗口位置（中心对齐）
///
/// 高层便捷封装：从 `Monitor` 中提取位置/尺寸，
/// 委托 [`calculate_position_in_monitor`] 完成实际计算。
pub fn calculate_window_position_for_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor: &Monitor,
) -> PhysicalPosition<i32> {
    calculate_position_in_monitor(cursor_pos, window_size, *monitor.position(), *monitor.size())
}

/// 通用多显示器定位：选择光标所在显示器，使用给定策略计算窗口坐标
///
/// # 回退策略
/// - 显示器列表为空 → `(0, 0)`
/// - 光标未命中任何显示器 → 使用第一块显示器
fn multi_monitor_with(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitors: &[Monitor],
    strategy: PositionStrategy,
) -> PhysicalPosition<i32> {
    if monitors.is_empty() {
        log::warn!("No monitors available. Returning (0, 0).");
        return PhysicalPosition::new(0, 0);
    }

    let monitor = detect_cursor_monitor(cursor_pos, monitors)
        .unwrap_or_else(|| {
            log::warn!("Cursor not on any monitor. Using first monitor.");
            &monitors[0]
        });

    position_in_monitor_with(
        cursor_pos,
        window_size,
        *monitor.position(),
        *monitor.size(),
        strategy,
    )
}

/// 计算多显示器场景下的窗口目标位置（中心对齐策略）
///
/// 这是多屏定位的主入口：
/// 1. 选择光标所在显示器
/// 2. 在该显示器内计算最佳位置
/// 3. 返回可直接用于窗口设置的全局坐标
pub fn calculate_window_position_multi_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitors: &[Monitor],
) -> PhysicalPosition<i32> {
    multi_monitor_with(cursor_pos, window_size, monitors, calculate_window_position)
}

/// 多显示器场景下的智能贴近光标定位
///
/// 与 [`calculate_window_position_multi_monitor`] 类似，但使用右下偏移+翻转策略。
pub fn calculate_smart_position_multi_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitors: &[Monitor],
) -> PhysicalPosition<i32> {
    multi_monitor_with(cursor_pos, window_size, monitors, calculate_smart_near_cursor)
}

// ============================================================================
// 单元测试（仅测试纯几何函数，不依赖 tauri::Monitor）
// ============================================================================

#[cfg(test)]
#[path = "tests/monitor_tests.rs"]
mod tests;
