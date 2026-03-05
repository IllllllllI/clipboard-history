//! # 核心编排模块
//!
//! ## 设计思路
//!
//! `ImageHandler` 只负责流程编排与配置管理，不直接与 Tauri 绑定。
//! 处理链路固定为：
//! 1. 读取配置快照
//! 2. 按来源加载原始字节
//! 3. 解码并准备 RGBA 数据
//! 4. 写入剪贴板（含重试）
//!
//! ## 实现思路
//!
//! - 配置通过 `Arc<RwLock<ImageConfig>>` 支持运行时动态切档。
//! - 单次请求内使用“同一配置快照”，避免处理中途配置漂移。
//! - 记录 `load/decode/copy/total` 阶段耗时，便于性能诊断。

use bytes::Bytes;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use super::{ImageAdvancedConfig, ImageConfig, ImageError, ImagePerformanceProfile, ImageSource};

/// 图片处理器。
///
/// 封装了配置状态与 HTTP 客户端，并编排各子模块实现完整流程。
pub struct ImageHandler {
    pub(super) config: Arc<RwLock<ImageConfig>>,
    pub(super) download_cache: Arc<Mutex<HashMap<String, CachedUrlDownload>>>,
}

pub(super) struct CachedUrlDownload {
    pub(super) created_at: Instant,
    /// 使用 `Bytes` 实现缓存命中时 O(1) clone（仅引用计数递增）。
    pub(super) bytes: Bytes,
}

impl ImageHandler {
    /// 根据初始配置创建处理器。
    ///
    /// 这里同时构建复用型 HTTP 客户端，减少每次请求的初始化开销。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::{ImageConfig, ImageHandler};
    ///
    /// let handler = ImageHandler::new(ImageConfig::default())?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn new(config: ImageConfig) -> Result<Self, ImageError> {
        Ok(Self {
            config: Arc::new(RwLock::new(config)),
            download_cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// 获取配置快照。
    ///
    /// 作用：保证单次请求链路使用一致参数。
    pub(super) fn config_snapshot(&self) -> Result<ImageConfig, ImageError> {
        self.config
            .read()
            .map(|cfg| cfg.clone())
            .map_err(|_| ImageError::ResourceLimit("配置读取锁已中毒".to_string()))
    }

    /// 设置性能档位。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::{ImageConfig, ImageHandler, ImagePerformanceProfile};
    ///
    /// let handler = ImageHandler::new(ImageConfig::default())?;
    /// handler.set_performance_profile(ImagePerformanceProfile::Balanced)?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn set_performance_profile(&self, profile: ImagePerformanceProfile) -> Result<(), ImageError> {
        let mut config = self
            .config
            .write()
            .map_err(|_| ImageError::ResourceLimit("配置写入锁已中毒".to_string()))?;
        config.apply_performance_profile(profile);

        log::info!(
            "⚙️ 已切换图片性能档位：{:?}（adaptive_resize={}, target_pixels={}, max_dim={}, filter={:?}）",
            profile,
            config.adaptive_resize,
            config.clipboard_target_pixels,
            config.clipboard_max_dimension,
            config.resize_filter
        );

        Ok(())
    }

    /// 获取当前生效档位。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::{ImageConfig, ImageHandler};
    ///
    /// let handler = ImageHandler::new(ImageConfig::default())?;
    /// let _profile = handler.get_performance_profile()?;
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub fn get_performance_profile(&self) -> Result<ImagePerformanceProfile, ImageError> {
        let config = self
            .config
            .read()
            .map_err(|_| ImageError::ResourceLimit("配置读取锁已中毒".to_string()))?;
        Ok(config.infer_performance_profile())
    }

    /// 设置网络安全与解码内存限制等高级配置。
    pub fn set_advanced_config(&self, advanced: &ImageAdvancedConfig) -> Result<(), ImageError> {
        advanced.validate()?;
        let mut config = self
            .config
            .write()
            .map_err(|_| ImageError::ResourceLimit("配置写入锁已中毒".to_string()))?;
        advanced.apply_to(&mut config);
        Ok(())
    }

    /// 获取高级配置快照。
    pub fn get_advanced_config(&self) -> Result<ImageAdvancedConfig, ImageError> {
        let config = self
            .config
            .read()
            .map_err(|_| ImageError::ResourceLimit("配置读取锁已中毒".to_string()))?;
        Ok(ImageAdvancedConfig::from_full(&config))
    }

    /// 处理主入口：从任意来源加载并复制图片。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::{ImageConfig, ImageHandler, ImageSource};
    ///
    /// # async fn demo() -> Result<(), clipboard_history::image_handler::ImageError> {
    /// let handler = ImageHandler::new(ImageConfig::default())?;
    /// handler
    ///     .process_and_copy(ImageSource::FilePath("C:/tmp/test.png".into()))
    ///     .await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn process_and_copy(&self, source: ImageSource) -> Result<(), ImageError> {
        let config = self.config_snapshot()?;
        let total_start = Instant::now();

        let load_start = Instant::now();
        let raw = match source {
            ImageSource::Url(url) => self.load_from_url(&url, &config).await?,
            ImageSource::Base64(data) => self.load_from_base64(&data, &config)?,
            ImageSource::FilePath(path) => self.load_from_file(&path, &config).await?,
        };
        let load_elapsed = load_start.elapsed();

        let decode_start = Instant::now();
        let config_for_decode = config.clone();
        let prepared = tokio::task::spawn_blocking(move || {
            Self::decode_and_prepare_for_clipboard(raw, &config_for_decode)
        })
        .await
        .map_err(|e| ImageError::Decode(format!("解码任务调度失败：{}", e)))??;
        let decode_elapsed = decode_start.elapsed();

        let copy_start = Instant::now();
        self.copy_to_clipboard_with_retry(prepared, &config).await?;
        let copy_elapsed = copy_start.elapsed();

        let total_elapsed = total_start.elapsed();
        log::info!(
            "✅ 图片处理完成 - load={}ms decode={}ms copy={}ms total={}ms",
            load_elapsed.as_millis(),
            decode_elapsed.as_millis(),
            copy_elapsed.as_millis(),
            total_elapsed.as_millis()
        );

        Ok(())
    }

    pub async fn process_url_and_copy_with_progress<P, C>(
        &self,
        url: &str,
        on_progress: P,
        is_cancelled: C,
    ) -> Result<(), ImageError>
    where
        P: Fn(u64, Option<u64>) + Send + Sync,
        C: Fn() -> bool + Send + Sync,
    {
        let config = self.config_snapshot()?;
        let total_start = Instant::now();

        let load_start = Instant::now();
        let raw = self
            .load_from_url_with_hooks(url, &config, &on_progress, &is_cancelled)
            .await?;
        let load_elapsed = load_start.elapsed();

        let decode_start = Instant::now();
        let config_for_decode = config.clone();
        let prepared = tokio::task::spawn_blocking(move || {
            Self::decode_and_prepare_for_clipboard(raw, &config_for_decode)
        })
        .await
        .map_err(|e| ImageError::Decode(format!("解码任务调度失败：{}", e)))??;
        let decode_elapsed = decode_start.elapsed();

        let copy_start = Instant::now();
        self.copy_to_clipboard_with_retry(prepared, &config).await?;
        let copy_elapsed = copy_start.elapsed();

        let total_elapsed = total_start.elapsed();
        log::info!(
            "✅ URL 图片处理完成 - load={}ms decode={}ms copy={}ms total={}ms",
            load_elapsed.as_millis(),
            decode_elapsed.as_millis(),
            copy_elapsed.as_millis(),
            total_elapsed.as_millis()
        );

        Ok(())
    }
}

#[cfg(test)]
#[path = "tests/handler_tests.rs"]
mod tests;
