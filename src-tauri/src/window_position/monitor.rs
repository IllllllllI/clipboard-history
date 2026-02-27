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
//!
//! # 实现思路
//!
//! - 遍历显示器边界判断光标归属。
//! - 采用左闭右开区间判断边界，避免双屏交界点重复命中。
//! - 纯函数层（`is_cursor_in_monitor_bounds` / `find_cursor_monitor_index` /
//!   `calculate_position_in_monitor`）不依赖 `tauri::Monitor`，可直接单元测试。
//! - 高层 API 仅从 `Monitor` 中提取数据后委托纯函数，保证可测试性。

use tauri::{PhysicalPosition, PhysicalSize, Monitor};
use super::calculation::calculate_window_position;

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

/// 在指定显示器区域内计算窗口的全局坐标（纯几何计算）
///
/// 该函数把"全局坐标问题"转为"单屏相对坐标问题"：
/// 先将光标换算为显示器内相对坐标 → 调用单屏边界收敛算法 → 映射回全局坐标。
///
/// # 设计思路
/// - 借助坐标平移复用已有 `calculate_window_position`，
///   避免在多屏场景重复实现边界约束逻辑。
///
/// # 参数
/// * `cursor_pos`   - 全局坐标系中的光标位置
/// * `window_size`  - 窗口尺寸
/// * `monitor_pos`  - 目标显示器左上角全局坐标
/// * `monitor_size` - 目标显示器尺寸
///
/// # 返回
/// 窗口左上角的全局坐标
pub fn calculate_position_in_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor_pos: PhysicalPosition<i32>,
    monitor_size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let relative_cursor = PhysicalPosition::new(
        cursor_pos.x - monitor_pos.x,
        cursor_pos.y - monitor_pos.y,
    );

    let relative_pos = calculate_window_position(relative_cursor, window_size, monitor_size);

    PhysicalPosition::new(
        monitor_pos.x + relative_pos.x,
        monitor_pos.y + relative_pos.y,
    )
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

/// 基于指定显示器计算窗口位置
///
/// 高层便捷封装：从 `Monitor` 中提取位置/尺寸，
/// 委托 `calculate_position_in_monitor` 完成实际计算。
///
/// # 参数
/// * `cursor_pos`  - 全局坐标系中的光标位置
/// * `window_size` - 窗口尺寸
/// * `monitor`     - 目标显示器
///
/// # 返回
/// 窗口在全局坐标系中的左上角位置
pub fn calculate_window_position_for_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitor: &Monitor
) -> PhysicalPosition<i32> {
    calculate_position_in_monitor(
        cursor_pos,
        window_size,
        *monitor.position(),
        *monitor.size(),
    )
}

/// 计算多显示器场景下的窗口目标位置
///
/// 这是多屏定位的主入口：
/// 1. 选择光标所在显示器
/// 2. 在该显示器内计算最佳位置
/// 3. 返回可直接用于窗口设置的全局坐标
///
/// # 回退策略
/// - 若显示器列表为空，返回 `(0, 0)`
/// - 若光标未命中任何显示器，使用第一块显示器
///
/// # 参数
/// * `cursor_pos`  - 全局坐标系下的光标位置
/// * `window_size` - 窗口尺寸
/// * `monitors`    - 可用显示器列表
///
/// # 返回
/// 窗口在全局坐标系中的左上角位置
pub fn calculate_window_position_multi_monitor(
    cursor_pos: PhysicalPosition<i32>,
    window_size: PhysicalSize<u32>,
    monitors: &[Monitor]
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

    calculate_window_position_for_monitor(cursor_pos, window_size, monitor)
}

// ============================================================================
// 单元测试（仅测试纯几何函数，不依赖 tauri::Monitor）
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ---------- is_cursor_in_monitor_bounds ----------

    #[test]
    fn test_cursor_inside_single_monitor() {
        let cursor = PhysicalPosition::new(960, 540);
        let pos = PhysicalPosition::new(0, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(is_cursor_in_monitor_bounds(cursor, pos, size));
    }

    #[test]
    fn test_cursor_at_origin() {
        let cursor = PhysicalPosition::new(0, 0);
        let pos = PhysicalPosition::new(0, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(is_cursor_in_monitor_bounds(cursor, pos, size),
            "左上角原点属于 [left, right) 区间，应命中");
    }

    #[test]
    fn test_cursor_at_right_boundary_excluded() {
        // 右边界采用开区间，x == 1920 不属于第一屏
        let cursor = PhysicalPosition::new(1920, 540);
        let pos = PhysicalPosition::new(0, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(!is_cursor_in_monitor_bounds(cursor, pos, size),
            "右边界（开区间）不应命中");
    }

    #[test]
    fn test_cursor_at_bottom_boundary_excluded() {
        let cursor = PhysicalPosition::new(960, 1080);
        let pos = PhysicalPosition::new(0, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(!is_cursor_in_monitor_bounds(cursor, pos, size),
            "下边界（开区间）不应命中");
    }

    #[test]
    fn test_cursor_outside_monitor() {
        let cursor = PhysicalPosition::new(-100, 540);
        let pos = PhysicalPosition::new(0, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(!is_cursor_in_monitor_bounds(cursor, pos, size));
    }

    #[test]
    fn test_cursor_on_offset_monitor() {
        // 第二块屏起始于 x=1920
        let cursor = PhysicalPosition::new(2000, 500);
        let pos = PhysicalPosition::new(1920, 0);
        let size = PhysicalSize::new(1920, 1080);
        assert!(is_cursor_in_monitor_bounds(cursor, pos, size));
    }

    // ---------- find_cursor_monitor_index ----------

    #[test]
    fn test_find_index_single_monitor() {
        let monitors = vec![
            (PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)),
        ];
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(960, 540), &monitors),
            Some(0)
        );
    }

    #[test]
    fn test_find_index_dual_horizontal() {
        let monitors = vec![
            (PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)),
            (PhysicalPosition::new(1920, 0), PhysicalSize::new(1920, 1080)),
        ];
        // 光标在第一屏
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(960, 540), &monitors),
            Some(0)
        );
        // 光标在第二屏
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(2880, 540), &monitors),
            Some(1)
        );
    }

    #[test]
    fn test_find_index_boundary_goes_to_second() {
        let monitors = vec![
            (PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)),
            (PhysicalPosition::new(1920, 0), PhysicalSize::new(1920, 1080)),
        ];
        // x==1920 恰好是第二屏的起点
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(1920, 540), &monitors),
            Some(1)
        );
    }

    #[test]
    fn test_find_index_cursor_outside_all() {
        let monitors = vec![
            (PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)),
        ];
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(5000, 5000), &monitors),
            None
        );
    }

    #[test]
    fn test_find_index_empty_list() {
        let monitors: Vec<(PhysicalPosition<i32>, PhysicalSize<u32>)> = vec![];
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(100, 100), &monitors),
            None
        );
    }

    #[test]
    fn test_find_index_vertical_layout() {
        // 上下排列的两块屏
        let monitors = vec![
            (PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080)),
            (PhysicalPosition::new(0, 1080), PhysicalSize::new(1920, 1080)),
        ];
        assert_eq!(
            find_cursor_monitor_index(PhysicalPosition::new(960, 1500), &monitors),
            Some(1)
        );
    }

    // ---------- calculate_position_in_monitor ----------

    #[test]
    fn test_position_in_primary_monitor_center() {
        let cursor = PhysicalPosition::new(960, 540);
        let window = PhysicalSize::new(800, 600);
        let mon_pos = PhysicalPosition::new(0, 0);
        let mon_size = PhysicalSize::new(1920, 1080);

        let result = calculate_position_in_monitor(cursor, window, mon_pos, mon_size);

        // 窗口中心对齐光标：x = 960 - 400 = 560, y = 540 - 300 = 240
        assert_eq!(result.x, 560);
        assert_eq!(result.y, 240);
    }

    #[test]
    fn test_position_in_secondary_monitor() {
        // 第二屏起始于 (1920, 0)，光标在第二屏中心
        let cursor = PhysicalPosition::new(2880, 540);
        let window = PhysicalSize::new(800, 600);
        let mon_pos = PhysicalPosition::new(1920, 0);
        let mon_size = PhysicalSize::new(1920, 1080);

        let result = calculate_position_in_monitor(cursor, window, mon_pos, mon_size);

        // 相对光标 (960, 540)，中心对齐后 (560, 240)，加回偏移 -> (2480, 240)
        assert_eq!(result.x, 1920 + 560);
        assert_eq!(result.y, 240);
    }

    #[test]
    fn test_position_clamped_to_monitor_right_edge() {
        // 光标贴近第二屏右边缘
        let cursor = PhysicalPosition::new(3800, 540);
        let window = PhysicalSize::new(800, 600);
        let mon_pos = PhysicalPosition::new(1920, 0);
        let mon_size = PhysicalSize::new(1920, 1080);

        let result = calculate_position_in_monitor(cursor, window, mon_pos, mon_size);

        // 窗口右边不能超出 1920 + 1920 = 3840
        assert!(result.x + window.width as i32 <= 3840,
            "窗口右边缘应不超过显示器右界");
        assert!(result.x >= 1920,
            "窗口左边缘应不小于显示器左界");
    }

    #[test]
    fn test_position_clamped_to_monitor_top_edge() {
        // 光标贴近屏幕顶部
        let cursor = PhysicalPosition::new(960, 10);
        let window = PhysicalSize::new(800, 600);
        let mon_pos = PhysicalPosition::new(0, 0);
        let mon_size = PhysicalSize::new(1920, 1080);

        let result = calculate_position_in_monitor(cursor, window, mon_pos, mon_size);

        assert_eq!(result.y, 0, "窗口应被裁剪到顶部边界");
    }
}
