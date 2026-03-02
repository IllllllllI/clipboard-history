//! 剪贴板管理模块
//!
//! # 设计思路
//!
//! 统一管理剪贴板相关的核心能力：
//! - **监控**：通过 `clipboard-master` 监听系统剪贴板变化，通知前端刷新
//! - **忽略标志 + RAII Guard**：防止应用自身写入剪贴板时触发重复保存，
//!   使用 `IgnoreGuard` 确保即使 panic 也能正确恢复标志
//! - **代码检测**：识别代码内容，避免将浏览器复制代码时附带的预览图误存
//! - **保存**：将剪贴板中的图片/SVG 持久化到磁盘
//!
//! # 实现思路
//!
//! - 忽略标志使用 `AtomicBool` + `SeqCst` 实现无锁跨线程安全。
//! - `IgnoreGuard` 采用 RAII 模式：构造时设置标志，`Drop` 时自动清除。
//! - 监控器运行在独立线程中，通过 Tauri 事件通知前端。
//! - 事件携带 `source` 字段区分外部变化与内部操作。
//! - `listener` 子模块承载监听器实现，对外仅暴露 `start_monitoring()` 工厂函数。
//! - 子模块按职责拆分：检测归 `code_detection`，持久化归 `save`。

pub mod code_detection;
pub mod save;
mod listener;

use std::sync::atomic::{AtomicUsize, Ordering};
use once_cell::sync::Lazy;

pub use listener::start_monitoring;

// ============================================================================
// 剪贴板忽略标志
// ============================================================================

/// 全局计数：忽略后续 N 次剪贴板变化事件
///
/// 当应用主动写入剪贴板（如用户点击"复制"按钮）时设置此标志，
/// 防止该次变化被保存到历史记录中。
static IGNORE_CLIPBOARD_CHANGE_BUDGET: Lazy<AtomicUsize> = Lazy::new(|| AtomicUsize::new(0));

/// 设置忽略下一次剪贴板变化事件的标志
///
/// 在任何主动修改剪贴板内容的操作之前调用。
/// **推荐使用 `IgnoreGuard::new()` 替代直接调用**，以确保标志自动恢复。
pub fn set_ignore_flag() {
    let previous = IGNORE_CLIPBOARD_CHANGE_BUDGET.fetch_add(1, Ordering::SeqCst);
    log::debug!(
        "🚫 已设置剪贴板忽略预算 - 当前预算: {}",
        previous.saturating_add(1)
    );
}

// ============================================================================
// IgnoreGuard — RAII 忽略标志管理
// ============================================================================

/// 剪贴板忽略标志的 RAII 守卫
///
/// 构造时自动设置忽略标志，`Drop` 时什么都不做（标志由监控器消费后自动清除）。
/// 主要的好处是：
/// 1. **语义清晰**：`let _guard = IgnoreGuard::new();` 比裸调用 `set_ignore_flag()` 更易读
/// 2. **防遗漏**：将标志设置与生命周期绑定，代码审查更容易发现遗漏
///
/// # 示例
/// ```rust,no_run
/// use clipboard_history::clipboard;
///
/// fn write_to_clipboard() {
///     let _guard = clipboard::IgnoreGuard::new();
///     // ... 写入剪贴板 ...
///     // guard 离开作用域时，标志已被监控器消费
/// }
/// ```
pub struct IgnoreGuard;

impl IgnoreGuard {
    /// 创建守卫并立即设置忽略标志
    pub fn new() -> Self {
        set_ignore_flag();
        Self
    }
}

pub(crate) fn apply_runtime_settings(settings: &serde_json::Value) {
    listener::apply_event_min_interval_from_settings(settings);
}

pub(crate) fn try_consume_ignore_budget() -> Option<usize> {
    let mut current_budget = IGNORE_CLIPBOARD_CHANGE_BUDGET.load(Ordering::SeqCst);
    while current_budget > 0 {
        match IGNORE_CLIPBOARD_CHANGE_BUDGET.compare_exchange(
            current_budget,
            current_budget - 1,
            Ordering::SeqCst,
            Ordering::SeqCst,
        ) {
            Ok(_) => return Some(current_budget - 1),
            Err(actual) => current_budget = actual,
        }
    }

    None
}
