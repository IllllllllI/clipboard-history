//! # 剪贴板写入模块
//!
//! ## 设计思路
//!
//! 将与操作系统剪贴板交互的逻辑独立出来，便于隔离平台不稳定因素。
//! 使用阻塞线程执行写入，避免阻塞 async 运行时。
//!
//! ## 实现思路
//!
//! - 写入前设置 `IgnoreGuard`，避免监听器将“应用自身写入”误判为外部变更。
//! - 失败时按配置进行有限重试。
//! - 单次请求内复用同一 RGBA 缓冲，减少重复分配。

use arboard;
use std::borrow::Cow;
use std::time::Duration;

use super::source::PreparedClipboardImage;
use super::{ImageConfig, ImageError, ImageHandler};

impl ImageHandler {
    /// 将已准备好的 RGBA 数据写入系统剪贴板（含重试）。
    pub(crate) async fn copy_to_clipboard_with_retry(
        &self,
        image: PreparedClipboardImage,
        config: &ImageConfig,
    ) -> Result<(), ImageError> {
        log::debug!("📋 准备复制到剪贴板 - {}x{}", image.width, image.height);

        let _guard = crate::clipboard::IgnoreGuard::new();
        let retries = config.clipboard_retries;
        let retry_delay = config.clipboard_retry_delay;
        let width = image.width;
        let height = image.height;
        let bytes = image.bytes;

        tokio::task::spawn_blocking(move || {
            let mut last_error = None;

            for attempt in 1..=retries {
                if attempt > 1 {
                    log::debug!("🔄 重试 {}/{}", attempt, retries);
                    std::thread::sleep(Duration::from_millis(retry_delay));
                }

                match Self::try_clipboard_copy(width, height, &bytes) {
                    Ok(_) => {
                        log::info!("✅ 复制成功 (尝试 {})", attempt);
                        return Ok(());
                    }
                    Err(e) => {
                        last_error = Some(e);
                        log::warn!("❌ 尝试 {} 失败", attempt);
                    }
                }
            }

            Err(ImageError::Clipboard(
                last_error.unwrap_or_else(|| "未知错误".to_string()),
            ))
        })
        .await
        .map_err(|e| ImageError::Clipboard(format!("线程执行失败：{}", e)))?
    }

    /// 执行一次底层剪贴板写入。
    ///
    /// 返回 `String` 便于在重试循环中记录最后一次失败原因。
    fn try_clipboard_copy(width: usize, height: usize, bytes: &[u8]) -> Result<(), String> {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("无法访问剪贴板：{}", e))?;

        let image_data = arboard::ImageData {
            width,
            height,
            bytes: Cow::Borrowed(bytes),
        };

        clipboard
            .set_image(image_data)
            .map_err(|e| format!("复制失败：{}", e))?;

        Ok(())
    }
}
