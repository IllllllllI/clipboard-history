use super::{
    compute_restart_backoff_ms, debounce_remaining,
    normalize_clipboard_event_min_interval_ms,
};
use std::time::Duration;

#[test]
fn normalize_clipboard_event_min_interval_clamps_bounds() {
    assert_eq!(normalize_clipboard_event_min_interval_ms(5), 20);
    assert_eq!(normalize_clipboard_event_min_interval_ms(80), 80);
    assert_eq!(normalize_clipboard_event_min_interval_ms(6_000), 5_000);
}

#[test]
fn debounce_remaining_returns_none_when_interval_reached() {
    let min = Duration::from_millis(80);
    assert_eq!(debounce_remaining(Duration::from_millis(80), min), None);
    assert_eq!(debounce_remaining(Duration::from_millis(120), min), None);
}

#[test]
fn debounce_remaining_returns_duration_when_interval_not_reached() {
    let min = Duration::from_millis(80);
    assert_eq!(
        debounce_remaining(Duration::from_millis(20), min),
        Some(Duration::from_millis(60))
    );
    assert_eq!(
        debounce_remaining(Duration::from_millis(0), min),
        Some(Duration::from_millis(80))
    );
}

#[test]
fn debounce_remaining_boundary_at_exact_interval() {
    let min = Duration::from_millis(100);
    // 恰好等于间隔 → 允许发射
    assert_eq!(debounce_remaining(Duration::from_millis(100), min), None);
    // 差 1ms → 仍需等待
    assert_eq!(
        debounce_remaining(Duration::from_millis(99), min),
        Some(Duration::from_millis(1))
    );
}

#[test]
fn restart_backoff_grows_then_caps() {
    assert_eq!(compute_restart_backoff_ms(1), 100);
    assert_eq!(compute_restart_backoff_ms(2), 200);
    assert_eq!(compute_restart_backoff_ms(3), 400);
    assert_eq!(compute_restart_backoff_ms(7), 5_000);
    assert_eq!(compute_restart_backoff_ms(20), 5_000);
}
