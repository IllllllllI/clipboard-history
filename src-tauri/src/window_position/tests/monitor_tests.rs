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
