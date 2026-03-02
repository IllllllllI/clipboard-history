use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use clipboard_master::{CallbackResult, ClipboardHandler, Master};
use tauri::{AppHandle, Emitter, Wry};

use super::try_consume_ignore_budget;

const CLIPBOARD_EVENT_MIN_INTERVAL_DEFAULT_MS: u64 = 80;
const CLIPBOARD_EVENT_MIN_INTERVAL_MIN_MS: u64 = 20;
const CLIPBOARD_EVENT_MIN_INTERVAL_MAX_MS: u64 = 5_000;
const MONITOR_RESTART_BASE_DELAY_MS: u64 = 100;
const MONITOR_RESTART_MAX_DELAY_MS: u64 = 5_000;

static CLIPBOARD_EVENT_MIN_INTERVAL_MS: AtomicU64 =
    AtomicU64::new(CLIPBOARD_EVENT_MIN_INTERVAL_DEFAULT_MS);

fn normalize_clipboard_event_min_interval_ms(value_ms: u64) -> u64 {
    value_ms.clamp(
        CLIPBOARD_EVENT_MIN_INTERVAL_MIN_MS,
        CLIPBOARD_EVENT_MIN_INTERVAL_MAX_MS,
    )
}

pub(crate) fn apply_event_min_interval_from_settings(settings: &serde_json::Value) {
    let from_settings = settings
        .get("clipboardEventMinIntervalMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(CLIPBOARD_EVENT_MIN_INTERVAL_DEFAULT_MS);
    let normalized = normalize_clipboard_event_min_interval_ms(from_settings);
    CLIPBOARD_EVENT_MIN_INTERVAL_MS.store(normalized, Ordering::Relaxed);
    log::debug!("📋 剪贴板监听节流间隔已更新: {}ms", normalized);
}

fn current_event_min_interval_ms() -> u64 {
    CLIPBOARD_EVENT_MIN_INTERVAL_MS.load(Ordering::Relaxed)
}

fn compute_restart_backoff_ms(restart_attempt: u32) -> u64 {
    let exp = 1_u64 << restart_attempt.saturating_sub(1).min(6);
    MONITOR_RESTART_BASE_DELAY_MS
        .saturating_mul(exp)
        .min(MONITOR_RESTART_MAX_DELAY_MS)
}

fn debounce_remaining(elapsed: Duration, min_interval: Duration) -> Option<Duration> {
    if elapsed >= min_interval {
        None
    } else {
        Some(min_interval - elapsed)
    }
}

#[derive(Debug, PartialEq, Eq)]
enum DebounceDecision {
    EmitNow,
    Throttle {
        remaining: Duration,
        start_tail_worker: bool,
    },
}

fn decide_debounce_action(
    elapsed: Duration,
    min_interval: Duration,
    tail_worker_running: bool,
) -> DebounceDecision {
    match debounce_remaining(elapsed, min_interval) {
        Some(remaining) => DebounceDecision::Throttle {
            remaining,
            start_tail_worker: !tail_worker_running,
        },
        None => DebounceDecision::EmitNow,
    }
}

fn emit_external_clipboard_changed(app: &AppHandle<Wry>) {
    if let Err(err) = app.emit(
        "clipboard-changed",
        ClipboardEventPayload { source: "external" },
    ) {
        log::warn!("发送剪贴板变化事件失败: {}", err);
    }
}

#[derive(Debug, Default)]
struct DebounceState {
    last_external_emit_at: Option<Instant>,
    pending_external_change: bool,
    tail_worker_running: bool,
}

/// 剪贴板事件处理器（内部实现）
///
/// 监听系统剪贴板变化，过滤应用自身触发的变化，
/// 并对外部变化做轻量节流后通知前端。
struct Handler {
    app: AppHandle<Wry>,
    debounce_state: Arc<Mutex<DebounceState>>,
}

impl Handler {
    fn new(app: AppHandle<Wry>) -> Self {
        Self {
            app,
            debounce_state: Arc::new(Mutex::new(DebounceState::default())),
        }
    }

    fn spawn_tail_worker(&self, initial_wait: Duration) {
        let app = self.app.clone();
        let debounce_state = Arc::clone(&self.debounce_state);

        thread::spawn(move || {
            let mut wait_for = initial_wait;

            loop {
                if !wait_for.is_zero() {
                    thread::sleep(wait_for);
                }

                let now = Instant::now();
                let min_interval = Duration::from_millis(current_event_min_interval_ms());
                let should_emit;

                {
                    let lock = debounce_state.lock();
                    let mut state = match lock {
                        Ok(guard) => guard,
                        Err(poisoned) => {
                            log::warn!("剪贴板节流状态锁中毒，继续使用恢复数据");
                            poisoned.into_inner()
                        }
                    };

                    if !state.pending_external_change {
                        state.tail_worker_running = false;
                        break;
                    }

                    let elapsed = state
                        .last_external_emit_at
                        .map(|last| now.saturating_duration_since(last))
                        .unwrap_or(min_interval);

                    if let Some(remaining) = debounce_remaining(elapsed, min_interval) {
                        wait_for = remaining;
                        continue;
                    }

                    state.pending_external_change = false;
                    state.last_external_emit_at = Some(now);
                    state.tail_worker_running = false;
                    should_emit = true;
                }

                if should_emit {
                    emit_external_clipboard_changed(&app);
                }

                break;
            }
        });
    }
}

/// 剪贴板变化事件的负载
///
/// 前端通过 `source` 字段区分变化来源，无需维护独立的忽略标志。
#[derive(serde::Serialize, Clone)]
struct ClipboardEventPayload {
    /// 变化来源：`"external"` 表示外部应用，`"internal"` 表示本应用
    source: &'static str,
}

impl ClipboardHandler for Handler {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        if let Some(remaining_budget) = try_consume_ignore_budget() {
            log::debug!("⏭️  忽略应用主动触发的剪贴板变化，剩余预算: {}", remaining_budget);
            return CallbackResult::Next;
        }

        let now = Instant::now();
        let min_interval_ms = current_event_min_interval_ms();
        let min_interval = Duration::from_millis(min_interval_ms);
        let mut emit_now = false;
        let mut schedule_tail_wait = None;

        {
            let lock = self.debounce_state.lock();
            let mut state = match lock {
                Ok(guard) => guard,
                Err(poisoned) => {
                    log::warn!("剪贴板节流状态锁中毒，继续使用恢复数据");
                    poisoned.into_inner()
                }
            };

            let elapsed = state
                .last_external_emit_at
                .map(|last| now.saturating_duration_since(last))
                .unwrap_or(min_interval);

            match decide_debounce_action(elapsed, min_interval, state.tail_worker_running) {
                DebounceDecision::Throttle {
                    remaining,
                    start_tail_worker,
                } => {
                    state.pending_external_change = true;
                    if start_tail_worker {
                        state.tail_worker_running = true;
                        schedule_tail_wait = Some(remaining);
                    }
                    log::trace!(
                        "⏱️ 剪贴板变化事件节流：{}ms < {}ms（尾沿补发）",
                        elapsed.as_millis(),
                        min_interval_ms
                    );
                }
                DebounceDecision::EmitNow => {
                    state.last_external_emit_at = Some(now);
                    state.pending_external_change = false;
                    emit_now = true;
                }
            }
        }

        if let Some(wait_for) = schedule_tail_wait {
            self.spawn_tail_worker(wait_for);
        }

        if emit_now {
            emit_external_clipboard_changed(&self.app);
        }

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        log::error!("剪贴板错误：{}", error);
        CallbackResult::Next
    }
}

/// 在后台线程启动剪贴板监控
///
/// # 参数
/// * `app` - Tauri 应用句柄，用于向前端发送事件
pub fn start_monitoring(app: AppHandle<Wry>) {
    if let Ok(Some(settings)) = crate::settings::get_app_settings(app.clone()) {
        apply_event_min_interval_from_settings(&settings);
    }

    thread::spawn(move || {
        let mut restart_attempt: u32 = 0;
        loop {
            match Master::new(Handler::new(app.clone())) {
                Ok(mut master) => {
                    restart_attempt = 0;
                    log::info!("📋 剪贴板监听已启动");
                    let _ = master.run();
                    log::warn!("📋 剪贴板监听已退出，将尝试重启");
                }
                Err(err) => {
                    log::error!("📋 创建剪贴板监听失败: {}", err);
                }
            }

            restart_attempt = restart_attempt.saturating_add(1);
            let backoff_ms = compute_restart_backoff_ms(restart_attempt);
            log::warn!("📋 剪贴板监听 {}ms 后重试（attempt={}）", backoff_ms, restart_attempt);
            thread::sleep(Duration::from_millis(backoff_ms));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        compute_restart_backoff_ms, debounce_remaining, decide_debounce_action,
        normalize_clipboard_event_min_interval_ms,
        DebounceDecision,
    };
    use std::time::Duration;

    #[test]
    fn normalize_clipboard_event_min_interval_clamps_bounds() {
        assert_eq!(normalize_clipboard_event_min_interval_ms(5), 20);
        assert_eq!(normalize_clipboard_event_min_interval_ms(80), 80);
        assert_eq!(normalize_clipboard_event_min_interval_ms(6_000), 5_000);
    }

    #[test]
    fn debounce_remaining_returns_expected_values() {
        let min = Duration::from_millis(80);
        assert_eq!(debounce_remaining(Duration::from_millis(20), min), Some(Duration::from_millis(60)));
        assert_eq!(debounce_remaining(Duration::from_millis(80), min), None);
        assert_eq!(debounce_remaining(Duration::from_millis(120), min), None);
    }

    #[test]
    fn debounce_decision_emit_now_when_interval_reached() {
        let decision = decide_debounce_action(
            Duration::from_millis(80),
            Duration::from_millis(80),
            false,
        );
        assert_eq!(decision, DebounceDecision::EmitNow);
    }

    #[test]
    fn debounce_decision_starts_tail_worker_when_throttled_first_time() {
        let decision = decide_debounce_action(
            Duration::from_millis(20),
            Duration::from_millis(80),
            false,
        );
        assert_eq!(
            decision,
            DebounceDecision::Throttle {
                remaining: Duration::from_millis(60),
                start_tail_worker: true,
            }
        );
    }

    #[test]
    fn debounce_decision_does_not_restart_tail_worker_when_already_running() {
        let decision = decide_debounce_action(
            Duration::from_millis(10),
            Duration::from_millis(80),
            true,
        );
        assert_eq!(
            decision,
            DebounceDecision::Throttle {
                remaining: Duration::from_millis(70),
                start_tail_worker: false,
            }
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
}
