use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use clipboard_master::{CallbackResult, ClipboardHandler, Master};
use tauri::{AppHandle, Emitter, Wry};

use super::try_consume_ignore_budget;

// ── 常量 ──────────────────────────────────────────────────────

const CLIPBOARD_EVENT_MIN_INTERVAL_DEFAULT_MS: u64 = 80;
const CLIPBOARD_EVENT_MIN_INTERVAL_MIN_MS: u64 = 20;
const CLIPBOARD_EVENT_MIN_INTERVAL_MAX_MS: u64 = 5_000;
const MONITOR_RESTART_BASE_DELAY_MS: u64 = 100;
const MONITOR_RESTART_MAX_DELAY_MS: u64 = 5_000;

// ── 全局节流间隔 ─────────────────────────────────────────────

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

// ── 纯函数：节流判定 ─────────────────────────────────────────

fn debounce_remaining(elapsed: Duration, min_interval: Duration) -> Option<Duration> {
    if elapsed >= min_interval {
        None
    } else {
        Some(min_interval - elapsed)
    }
}

// ── 事件负载 ─────────────────────────────────────────────────

/// 剪贴板变化事件的负载
///
/// 前端通过 `source` 字段区分变化来源，无需维护独立的忽略标志。
#[derive(serde::Serialize, Clone)]
struct ClipboardEventPayload {
    /// 变化来源：`"external"` 表示外部应用，`"internal"` 表示本应用
    source: &'static str,
}

fn emit_external_clipboard_changed(app: &AppHandle<Wry>) {
    if let Err(err) = app.emit(
        "clipboard-changed",
        ClipboardEventPayload { source: "external" },
    ) {
        log::warn!("发送剪贴板变化事件失败: {}", err);
    }
}

// ── TailEmitter：持久化尾沿发射线程 ──────────────────────────

/// 尾沿发射器的共享状态
struct TailState {
    /// 有未发射的外部剪贴板变化事件
    pending: bool,
    /// 最近一次发射时间戳
    last_emit_at: Option<Instant>,
    /// 关闭信号
    shutdown: bool,
}

struct TailEmitterShared {
    state: Mutex<TailState>,
    wake: Condvar,
    app: AppHandle<Wry>,
}

/// 尾沿发射器：确保节流窗口内最后一次剪贴板变化不丢失
///
/// ## 设计思路
///
/// 使用单个持久线程 + `Condvar` 替代原先每次节流都 `thread::spawn` 的方式。
/// 线程在无待处理事件时通过 `Condvar::wait` 阻塞（零 CPU 开销），
/// 被唤醒后按节流间隔延迟发射，若期间有新事件则重置等待。
///
/// ## 优势
///
/// - **零线程创建开销**：整个监听生命周期只创建一个尾沿线程
/// - **精确的延迟控制**：`Condvar::wait_timeout` 语义清晰，无需手动 sleep 循环
/// - **干净的生命周期**：`Drop` 时发送 shutdown 信号，线程安全退出
struct TailEmitter {
    shared: Arc<TailEmitterShared>,
}

impl TailEmitter {
    fn new(app: AppHandle<Wry>) -> Self {
        let shared = Arc::new(TailEmitterShared {
            state: Mutex::new(TailState {
                pending: false,
                last_emit_at: None,
                shutdown: false,
            }),
            wake: Condvar::new(),
            app,
        });

        let worker = Arc::clone(&shared);
        thread::Builder::new()
            .name("clipboard-tail-emitter".into())
            .spawn(move || Self::worker_loop(worker))
            .expect("启动尾沿发射线程失败");

        Self { shared }
    }

    /// 标记有待发射的事件并唤醒工作线程
    fn schedule(&self) {
        let mut state = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        state.pending = true;
        self.shared.wake.notify_one();
    }

    /// 锁定共享状态，供 Handler 读写 `last_emit_at` 等字段
    fn lock_state(&self) -> std::sync::MutexGuard<'_, TailState> {
        self.shared.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn worker_loop(shared: Arc<TailEmitterShared>) {
        log::debug!("📋 尾沿发射线程已启动");
        let mut state = shared.state.lock().unwrap_or_else(|e| e.into_inner());

        loop {
            // 阶段 1：等待待处理事件（无事件时零 CPU 消耗）
            while !state.pending && !state.shutdown {
                state = shared.wake.wait(state).unwrap_or_else(|e| e.into_inner());
            }
            if state.shutdown {
                break;
            }

            // 阶段 2：等待节流间隔满足
            let min_interval = Duration::from_millis(current_event_min_interval_ms());
            let elapsed = state
                .last_emit_at
                .map(|t| Instant::now().saturating_duration_since(t))
                .unwrap_or(min_interval);

            if let Some(remaining) = debounce_remaining(elapsed, min_interval) {
                // 带超时等待：到期或被提前唤醒（有新事件/关闭信号）
                let (new_state, _) = shared
                    .wake
                    .wait_timeout(state, remaining)
                    .unwrap_or_else(|e| e.into_inner());
                state = new_state;
                // 重新进入循环顶部：可能 pending 已被主线程清除，
                // 也可能时间已满足需要发射
                continue;
            }

            // 阶段 3：发射事件
            state.pending = false;
            state.last_emit_at = Some(Instant::now());
            // 释放锁再发射，避免在持有锁时调用可能阻塞的 app.emit
            drop(state);

            emit_external_clipboard_changed(&shared.app);

            // 重新获取锁进入下一轮循环
            state = shared.state.lock().unwrap_or_else(|e| e.into_inner());
        }

        log::debug!("📋 尾沿发射线程已退出");
    }
}

impl Drop for TailEmitter {
    fn drop(&mut self) {
        let mut state = self.shared.state.lock().unwrap_or_else(|e| e.into_inner());
        state.shutdown = true;
        self.shared.wake.notify_one();
        // 注意：不 join 线程——避免在 clipboard_master 的回调线程中死锁
    }
}

// ── Handler ──────────────────────────────────────────────────

/// 剪贴板事件处理器
///
/// 监听系统剪贴板变化，过滤应用自身触发的变化，
/// 并对外部变化做 leading-edge 节流后通知前端。
/// 被节流的尾部事件由 [`TailEmitter`] 延迟补发，保证不丢失。
struct Handler {
    app: AppHandle<Wry>,
    tail_emitter: TailEmitter,
}

impl Handler {
    fn new(app: AppHandle<Wry>) -> Self {
        let tail_emitter = TailEmitter::new(app.clone());
        Self { app, tail_emitter }
    }
}

impl ClipboardHandler for Handler {
    fn on_clipboard_change(&mut self) -> CallbackResult {
        if let Some(remaining) = try_consume_ignore_budget() {
            log::debug!(
                "⏭️  忽略应用主动触发的剪贴板变化，剩余预算: {}",
                remaining
            );
            return CallbackResult::Next;
        }

        let now = Instant::now();
        let min_interval_ms = current_event_min_interval_ms();
        let min_interval = Duration::from_millis(min_interval_ms);

        let mut state = self.tail_emitter.lock_state();
        let elapsed = state
            .last_emit_at
            .map(|t| now.saturating_duration_since(t))
            .unwrap_or(min_interval);

        if debounce_remaining(elapsed, min_interval).is_none() {
            // 间隔已满，立即发射
            state.last_emit_at = Some(now);
            state.pending = false;
            drop(state);
            emit_external_clipboard_changed(&self.app);
        } else {
            // 间隔不足，交给尾沿发射器延迟处理
            drop(state);
            self.tail_emitter.schedule();
            log::trace!(
                "⏱️ 剪贴板变化事件节流：{}ms < {}ms（尾沿补发）",
                elapsed.as_millis(),
                min_interval_ms
            );
        }

        CallbackResult::Next
    }

    fn on_clipboard_error(&mut self, error: std::io::Error) -> CallbackResult {
        log::error!("剪贴板错误：{}", error);
        CallbackResult::Next
    }
}

// ── 公共 API ─────────────────────────────────────────────────

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
            log::warn!(
                "📋 剪贴板监听 {}ms 后重试（attempt={}）",
                backoff_ms,
                restart_attempt
            );
            thread::sleep(Duration::from_millis(backoff_ms));
        }
    });
}

#[cfg(test)]
#[path = "tests/listener_tests.rs"]
mod tests;
