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
