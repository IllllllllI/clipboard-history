//! # 服务层（可注入状态）
//!
//! ## 设计思路
//!
//! 使用 `ImageServiceState` 作为 Tauri 注入状态，替代全局单例函数。
//! 好处：
//! 1. 生命周期清晰（由 `main.rs` 统一管理）
//! 2. 测试可创建独立实例，减少共享状态副作用
//! 3. 后续可扩展多实例或按会话配置
//!
//! ## 实现思路
//!
//! 对外仅暴露少量稳定 API：
//! - `process_source`：执行完整图片处理链路
//! - `process_url_with_progress`：带进度事件的 URL 处理
//! - `cancel_download`：取消正在进行的下载
//! - `set/get_performance_profile`：切换/读取性能档位
//! - `set/get_advanced_config`：设置/读取高级参数
//!
//! ## 架构细节
//!
//! - `ProgressReporter`：封装进度节流、事件发射和最终状态汇总
//! - `CancelFlagGuard`：RAII 守卫，确保取消标志在 panic / 提前返回时自动清理

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::{ImageAdvancedConfig, ImageConfig, ImageError, ImageHandler, ImagePerformanceProfile, ImageSource};
use tauri::{AppHandle, Emitter, Wry};

pub const IMAGE_DOWNLOAD_PROGRESS_EVENT: &str = "image-download-progress";

// ─── 进度节流常量 ───────────────────────────────────────────────────

const PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(50);
const PROGRESS_HEARTBEAT_INTERVAL: Duration = Duration::from_millis(400);
const PROGRESS_MIN_BYTES_DELTA: u64 = 256 * 1024;
const PROGRESS_MIN_PERCENT_DELTA: u8 = 1;
const PROGRESS_FORCE_PERCENT_DELTA: u8 = 5;

// ─── 进度事件载荷 ──────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImageDownloadProgressPayload {
    pub request_id: String,
    pub progress: u8,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub status: &'static str,
    pub stage: Option<&'static str>,
    pub error_code: Option<&'static str>,
    pub error_message: Option<String>,
}

// ─── 进度节流状态（ProgressReporter 内部） ─────────────────────────

#[derive(Debug)]
struct ThrottleState {
    last_emit_at: Option<Instant>,
    last_progress: u8,
    last_downloaded: u64,
    last_total: Option<u64>,
}

impl ThrottleState {
    fn new() -> Self {
        Self {
            last_emit_at: None,
            last_progress: 0,
            last_downloaded: 0,
            last_total: None,
        }
    }

    fn should_emit(&self, progress: u8, downloaded: u64, total: Option<u64>) -> bool {
        let Some(last_emit_at) = self.last_emit_at else {
            return true;
        };

        let elapsed = last_emit_at.elapsed();
        let progress_delta = progress.saturating_sub(self.last_progress);
        let downloaded_delta = downloaded.saturating_sub(self.last_downloaded);

        if progress_delta >= PROGRESS_FORCE_PERCENT_DELTA {
            return true;
        }
        if progress_delta >= PROGRESS_MIN_PERCENT_DELTA && elapsed >= PROGRESS_MIN_INTERVAL {
            return true;
        }
        if downloaded_delta >= PROGRESS_MIN_BYTES_DELTA && elapsed >= PROGRESS_MIN_INTERVAL {
            return true;
        }
        if total != self.last_total {
            return true;
        }
        elapsed >= PROGRESS_HEARTBEAT_INTERVAL
    }

    fn update(&mut self, progress: u8, downloaded: u64, total: Option<u64>) {
        self.last_emit_at = Some(Instant::now());
        self.last_progress = progress;
        self.last_downloaded = downloaded;
        self.last_total = total;
    }
}

// ─── ProgressReporter ──────────────────────────────────────────────

/// 下载进度事件发射器。
///
/// 封装节流逻辑与事件序列化，使 `process_url_with_progress` 方法体保持简洁。
struct ProgressReporter<'a> {
    request_id: &'a str,
    app: &'a AppHandle<Wry>,
    throttle: Mutex<ThrottleState>,
}

impl<'a> ProgressReporter<'a> {
    fn new(request_id: &'a str, app: &'a AppHandle<Wry>) -> Self {
        Self {
            request_id,
            app,
            throttle: Mutex::new(ThrottleState::new()),
        }
    }

    /// 将已下载量/总量映射为 0-100 百分比。
    fn compute_percent(status: &str, downloaded: u64, total: Option<u64>) -> u8 {
        if status == "completed" {
            return 100;
        }
        match total {
            Some(0) | None => 0,
            Some(t) => (downloaded.saturating_mul(100) / t).min(100) as u8,
        }
    }

    /// 发射一条原始进度事件（不节流）。
    fn emit_raw(
        &self,
        status: &'static str,
        downloaded: u64,
        total: Option<u64>,
        stage: Option<&'static str>,
        error_code: Option<&'static str>,
        error_message: Option<String>,
    ) {
        let progress = Self::compute_percent(status, downloaded, total);
        let payload = ImageDownloadProgressPayload {
            request_id: self.request_id.to_owned(),
            progress,
            downloaded_bytes: downloaded,
            total_bytes: total,
            status,
            stage,
            error_code,
            error_message,
        };
        let _ = self.app.emit(IMAGE_DOWNLOAD_PROGRESS_EVENT, payload);
    }

    /// 发射 downloading 事件（带节流）。
    fn emit_downloading(&self, downloaded: u64, total: Option<u64>) {
        let progress = Self::compute_percent("downloading", downloaded, total);

        let mut guard = match self.throttle.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if !guard.should_emit(progress, downloaded, total) {
            return;
        }
        guard.update(progress, downloaded, total);
        drop(guard);

        self.emit_raw("downloading", downloaded, total, None, None, None);
    }

    /// 读取最后一次记录的进度快照。
    fn last_snapshot(&self) -> (u64, Option<u64>) {
        match self.throttle.lock() {
            Ok(g) => (g.last_downloaded, g.last_total),
            Err(_) => (0, None),
        }
    }

    /// 发射最终状态事件（completed / cancelled / failed）。
    fn emit_final(&self, result: &Result<(), ImageError>) {
        let (last_downloaded, last_total) = self.last_snapshot();

        match result {
            Ok(()) => {
                let completed_total = last_total.or(Some(last_downloaded.max(1)));
                self.emit_raw(
                    "completed",
                    last_downloaded.max(1),
                    completed_total,
                    None,
                    None,
                    None,
                );
            }
            Err(ImageError::Cancelled(_)) => {
                self.emit_raw(
                    "cancelled",
                    last_downloaded,
                    last_total,
                    None,
                    Some("E_CANCELLED"),
                    None,
                );
            }
            Err(err) => {
                self.emit_raw(
                    "failed",
                    last_downloaded,
                    last_total,
                    Some(err.stage()),
                    Some(err.code()),
                    Some(err.to_string()),
                );
            }
        }
    }
}

// ─── CancelFlagGuard ───────────────────────────────────────────────

/// RAII 守卫：在作用域结束时自动从 `cancel_flags` 中移除对应条目。
///
/// 防止 panic 或提前 return 导致取消标志泄漏。
struct CancelFlagGuard<'a> {
    cancel_flags: &'a Mutex<HashMap<String, Arc<AtomicBool>>>,
    request_id: String,
}

impl<'a> CancelFlagGuard<'a> {
    /// 注册取消标志并返回守卫 + 共享标志引用。
    fn register(
        cancel_flags: &'a Mutex<HashMap<String, Arc<AtomicBool>>>,
        request_id: String,
    ) -> Result<(Self, Arc<AtomicBool>), ImageError> {
        let flag = Arc::new(AtomicBool::new(false));
        {
            let mut guard = cancel_flags
                .lock()
                .map_err(|_| ImageError::ResourceLimit("下载取消标志锁已中毒".to_string()))?;
            guard.insert(request_id.clone(), Arc::clone(&flag));
        }
        Ok((
            Self {
                cancel_flags,
                request_id,
            },
            flag,
        ))
    }
}

impl Drop for CancelFlagGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.cancel_flags.lock() {
            guard.remove(&self.request_id);
        }
    }
}

// ─── ImageServiceState ─────────────────────────────────────────────

/// 图片处理服务状态。
///
/// 作为 Tauri `State` 注入到命令层，内部持有 `ImageHandler`。
pub struct ImageServiceState {
    handler: ImageHandler,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl ImageServiceState {
    /// 使用默认配置创建服务状态。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn new() -> Result<Self, ImageError> {
        Self::with_config(ImageConfig::default())
    }

    /// 使用自定义配置创建服务状态。
    ///
    /// 主要用于测试或后续按场景注入不同策略。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::{ImageConfig, ImageServiceState};
    ///
    /// let mut config = ImageConfig::default();
    /// config.allow_private_network = true;
    /// let service = ImageServiceState::with_config(config)?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn with_config(config: ImageConfig) -> Result<Self, ImageError> {
        let handler = ImageHandler::new(config)?;
        Ok(Self {
            handler,
            cancel_flags: Mutex::new(HashMap::new()),
        })
    }

    /// 执行完整处理流程：加载→解码→写入剪贴板。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::{ImageServiceState, ImageSource};
    ///
    /// # async fn demo() -> Result<(), clipboard_history::image_handler::ImageError> {
    /// let service = ImageServiceState::new()?;
    /// service
    ///     .process_source(ImageSource::Url("https://example.com/a.png".into()))
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn process_source(&self, source: ImageSource) -> Result<(), ImageError> {
        self.handler.process_and_copy(source).await
    }

    /// 带进度上报的 URL 下载处理流程。
    ///
    /// 进度通过 Tauri 事件发射到前端，节流策略避免高频发射。
    /// 取消标志使用 RAII 守卫管理，确保异常路径不泄漏。
    pub async fn process_url_with_progress(
        &self,
        app: &AppHandle<Wry>,
        request_id: String,
        url: String,
    ) -> Result<(), ImageError> {
        let (_cancel_guard, cancel_flag) =
            CancelFlagGuard::register(&self.cancel_flags, request_id.clone())?;

        let reporter = ProgressReporter::new(&request_id, app);
        reporter.emit_downloading(0, None);

        let result = self
            .handler
            .process_url_and_copy_with_progress(
                &url,
                |downloaded, total| reporter.emit_downloading(downloaded, total),
                || cancel_flag.load(Ordering::SeqCst),
            )
            .await;

        // 显式 drop 守卫：在发射最终事件前移除取消标志，
        // 使 cancel_download 在下载已结束后正确返回 false。
        drop(_cancel_guard);

        reporter.emit_final(&result);
        result
    }

    /// 请求取消指定下载。
    ///
    /// 若目标 request_id 存在且仍在下载中，标记取消并返回 `true`。
    pub fn cancel_download(&self, request_id: &str) -> Result<bool, ImageError> {
        let guard = self
            .cancel_flags
            .lock()
            .map_err(|_| ImageError::ResourceLimit("下载取消标志锁已中毒".to_string()))?;

        if let Some(flag) = guard.get(request_id) {
            flag.store(true, Ordering::SeqCst);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// 设置性能档位。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// service.set_performance_profile("speed")?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn set_performance_profile(&self, profile: &str) -> Result<(), ImageError> {
        let profile = ImagePerformanceProfile::from_str(profile)?;
        self.handler.set_performance_profile(profile)
    }

    /// 获取当前生效性能档位（字符串）。
    ///
    /// # 示例
    /// ```rust,no_run
    /// use clipboard_history::image_handler::ImageServiceState;
    ///
    /// let service = ImageServiceState::new()?;
    /// let profile = service.get_performance_profile()?;
    /// assert!(matches!(profile.as_str(), "quality" | "balanced" | "speed"));
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn get_performance_profile(&self) -> Result<String, ImageError> {
        let profile = self.handler.get_performance_profile()?;
        Ok(profile.as_str().to_string())
    }

    /// 设置高级配置（验证 + 应用由 `ImageAdvancedConfig` 内聚完成）。
    pub fn set_advanced_config(&self, config: ImageAdvancedConfig) -> Result<(), ImageError> {
        self.handler.set_advanced_config(&config)
    }

    /// 获取高级配置快照。
    pub fn get_advanced_config(&self) -> Result<ImageAdvancedConfig, ImageError> {
        self.handler.get_advanced_config()
    }
}

#[cfg(test)]
#[path = "tests/service_tests.rs"]
mod tests;
