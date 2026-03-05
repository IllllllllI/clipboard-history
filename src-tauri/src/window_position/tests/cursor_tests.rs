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
