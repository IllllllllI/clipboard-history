use super::{
    compute_backoff_delay_with_jitter, execute_with_retries, format_win32_error_message,
    hresult_to_win32_code, would_exceed_retry_budget,
    ClipboardWriteFailure, RetryPolicy,
};

// ── 退避延迟 ─────────────────────────────────────────────────

#[test]
fn backoff_delay_stays_within_expected_bounds() {
    let base = 100;
    let max_delay = 900;

    let delay = compute_backoff_delay_with_jitter(base, 4, max_delay);

    assert!(delay >= 800, "delay should be at least exponential base");
    assert!(delay <= 1200, "delay should include bounded jitter only");
}

#[test]
fn backoff_delay_respects_max_cap() {
    let base = 300;
    let max_delay = 500;

    let delay = compute_backoff_delay_with_jitter(base, 8, max_delay);

    assert!(delay >= 500, "delay should be capped at max_delay floor");
    assert!(delay <= 666, "delay should not exceed capped value + jitter");
}

// ── 预算检查 ─────────────────────────────────────────────────

#[test]
fn retry_budget_checker_works() {
    assert!(would_exceed_retry_budget(1700, 120, 1800));
    assert!(!would_exceed_retry_budget(1600, 120, 1800));
    assert!(!would_exceed_retry_budget(0, 0, 1800));
}

#[test]
fn retry_budget_edge_saturating() {
    // saturating_add(u64::MAX, 1) == u64::MAX, not > u64::MAX → false
    assert!(!would_exceed_retry_budget(u64::MAX, 1, u64::MAX));
    assert!(!would_exceed_retry_budget(0, 0, 0));
    // 1 > 0 → true when budget is 0
    assert!(would_exceed_retry_budget(0, 1, 0));
}

// ── HRESULT 解析 ─────────────────────────────────────────────

#[test]
fn hresult_to_win32_code_extracts_mapped_code() {
    let hr = 0x8007_058A_u32 as i32;
    assert_eq!(hresult_to_win32_code(hr), Some(1418));
    assert_eq!(hresult_to_win32_code(0x8000_4005_u32 as i32), None);
}

#[test]
fn win32_error_message_contains_format_and_hint() {
    let message = format_win32_error_message(
        "SetClipboardData",
        "PNG",
        0x8007_058A_u32 as i32,
        "mock_detail",
    );

    assert!(message.contains("format=PNG"));
    assert!(message.contains("hint="));
    assert!(message.contains("code=1418"));
}

// ── ClipboardWriteFailure ────────────────────────────────────

#[test]
fn failure_retryable_for_busy_and_transient() {
    assert!(ClipboardWriteFailure::busy("busy").is_retryable());
    assert!(ClipboardWriteFailure::transient("transient").is_retryable());
    assert!(!ClipboardWriteFailure::fatal("fatal").is_retryable());
}

// ── RetryPolicy ──────────────────────────────────────────────

#[test]
fn retry_policy_clamps_minimums() {
    use super::super::ImageConfig;
    let mut config = ImageConfig::default();
    config.clipboard_retries = 0;
    config.clipboard_retry_delay = 0;
    let policy = RetryPolicy::from_config(&config);
    assert!(policy.max_attempts >= 1);
    assert!(policy.base_delay_ms >= 1);
}

// ── execute_with_retries ─────────────────────────────────────

#[test]
fn retries_succeed_on_first_attempt() {
    let policy = RetryPolicy {
        max_attempts: 3,
        base_delay_ms: 1,
        max_delay_ms: 10,
        budget_ms: 5000,
    };
    let result = execute_with_retries(&policy, || Ok(()));
    assert!(result.is_ok());
}

#[test]
fn retries_recover_after_transient_failure() {
    let policy = RetryPolicy {
        max_attempts: 3,
        base_delay_ms: 1,
        max_delay_ms: 5,
        budget_ms: 5000,
    };
    let mut call_count = 0u32;
    let result = execute_with_retries(&policy, || {
        call_count += 1;
        if call_count < 2 {
            Err(ClipboardWriteFailure::transient("transient"))
        } else {
            Ok(())
        }
    });
    assert!(result.is_ok());
    assert_eq!(call_count, 2);
}

#[test]
fn retries_stop_on_fatal() {
    let policy = RetryPolicy {
        max_attempts: 5,
        base_delay_ms: 1,
        max_delay_ms: 5,
        budget_ms: 5000,
    };
    let mut call_count = 0u32;
    let result = execute_with_retries(&policy, || {
        call_count += 1;
        Err(ClipboardWriteFailure::fatal("fatal"))
    });
    assert!(result.is_err());
    assert_eq!(call_count, 1, "should not retry after fatal");
}

#[test]
fn retries_exhaust_attempts() {
    let policy = RetryPolicy {
        max_attempts: 3,
        base_delay_ms: 1,
        max_delay_ms: 2,
        budget_ms: 5000,
    };
    let mut call_count = 0u32;
    let result = execute_with_retries(&policy, || {
        call_count += 1;
        Err(ClipboardWriteFailure::busy("busy"))
    });
    assert!(result.is_err());
    assert_eq!(call_count, 3);
    // Busy failure should map to ClipboardBusy
    let err_msg = format!("{}", result.unwrap_err());
    assert!(err_msg.contains("busy"));
}
