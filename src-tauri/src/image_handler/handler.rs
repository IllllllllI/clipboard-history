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

use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use super::{ImageConfig, ImageError, ImagePerformanceProfile, ImageSource};

/// 图片处理器。
///
/// 封装了配置状态与 HTTP 客户端，并编排各子模块实现完整流程。
pub struct ImageHandler {
    pub(super) config: Arc<RwLock<ImageConfig>>,
    pub(super) download_cache: Arc<Mutex<HashMap<String, CachedUrlDownload>>>,
}

pub(super) struct CachedUrlDownload {
    pub(super) created_at: Instant,
    pub(super) bytes: Vec<u8>,
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
    pub fn set_advanced_config(
        &self,
        allow_private_network: bool,
        resolve_dns_for_url_safety: bool,
        max_decoded_bytes: u64,
        connect_timeout: u64,
        stream_first_byte_timeout_ms: u64,
        stream_chunk_timeout_ms: u64,
        clipboard_retry_max_total_ms: u64,
        clipboard_retry_max_delay_ms: u64,
    ) -> Result<(), ImageError> {
        if max_decoded_bytes < 8 * 1024 * 1024 {
            return Err(ImageError::InvalidFormat("max_decoded_bytes 不能小于 8MB".to_string()));
        }
        if !(1..=120).contains(&connect_timeout) {
            return Err(ImageError::InvalidFormat("connect_timeout 必须在 1~120 秒之间".to_string()));
        }
        if !(500..=120_000).contains(&stream_first_byte_timeout_ms) {
            return Err(ImageError::InvalidFormat("stream_first_byte_timeout_ms 必须在 500~120000 毫秒之间".to_string()));
        }
        if !(500..=120_000).contains(&stream_chunk_timeout_ms) {
            return Err(ImageError::InvalidFormat("stream_chunk_timeout_ms 必须在 500~120000 毫秒之间".to_string()));
        }
        if !(200..=30_000).contains(&clipboard_retry_max_total_ms) {
            return Err(ImageError::InvalidFormat("clipboard_retry_max_total_ms 必须在 200~30000 毫秒之间".to_string()));
        }
        if !(10..=5_000).contains(&clipboard_retry_max_delay_ms) {
            return Err(ImageError::InvalidFormat("clipboard_retry_max_delay_ms 必须在 10~5000 毫秒之间".to_string()));
        }
        if clipboard_retry_max_delay_ms > clipboard_retry_max_total_ms {
            return Err(ImageError::InvalidFormat("clipboard_retry_max_delay_ms 不能大于 clipboard_retry_max_total_ms".to_string()));
        }

        let mut config = self
            .config
            .write()
            .map_err(|_| ImageError::ResourceLimit("配置写入锁已中毒".to_string()))?;

        config.allow_private_network = allow_private_network;
        config.resolve_dns_for_url_safety = resolve_dns_for_url_safety;
        config.max_decoded_bytes = max_decoded_bytes;
        config.connect_timeout = connect_timeout;
        config.stream_first_byte_timeout_ms = stream_first_byte_timeout_ms;
        config.stream_chunk_timeout_ms = stream_chunk_timeout_ms;
        config.clipboard_retry_max_total_ms = clipboard_retry_max_total_ms;
        config.clipboard_retry_max_delay_ms = clipboard_retry_max_delay_ms;

        Ok(())
    }

    /// 获取高级配置快照。
    pub fn get_advanced_config(&self) -> Result<(bool, bool, u64, u64, u64, u64, u64, u64), ImageError> {
        let config = self
            .config
            .read()
            .map_err(|_| ImageError::ResourceLimit("配置读取锁已中毒".to_string()))?;

        Ok((
            config.allow_private_network,
            config.resolve_dns_for_url_safety,
            config.max_decoded_bytes,
            config.connect_timeout,
            config.stream_first_byte_timeout_ms,
            config.stream_chunk_timeout_ms,
            config.clipboard_retry_max_total_ms,
            config.clipboard_retry_max_delay_ms,
        ))
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
            ImageSource::FilePath(path) => self.load_from_file(&path, &config)?,
        };
        let load_elapsed = load_start.elapsed();

        let decode_start = Instant::now();
        let prepared = self.decode_and_prepare_for_clipboard(raw, &config)?;
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
        let prepared = self.decode_and_prepare_for_clipboard(raw, &config)?;
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
mod tests {
    use super::*;
    use crate::image_handler::source::{PreparedClipboardImage, RawImageData};
    use base64::{Engine as _, engine::general_purpose};
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use std::io::Cursor;
    use std::time::Instant;
    use tokio::runtime::Runtime;

    fn create_png_bytes(width: u32, height: u32) -> Vec<u8> {
        let img = ImageBuffer::from_fn(width, height, |x, y| {
            let r = (x % 255) as u8;
            let g = (y % 255) as u8;
            let b = ((x + y) % 255) as u8;
            Rgba([r, g, b, 255])
        });

        let dyn_img = DynamicImage::ImageRgba8(img);
        let mut cursor = Cursor::new(Vec::new());
        dyn_img
            .write_to(&mut cursor, ImageFormat::Png)
            .expect("failed to encode test image");
        cursor.into_inner()
    }

    #[test]
    fn perf_decode_pipeline_multiple_sizes() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let config = handler.config_snapshot().expect("config snapshot failed");
        let cases = [(1024, 1024), (2048, 2048), (3840, 2160)];

        for (width, height) in cases {
            let png = create_png_bytes(width, height);
            let start = Instant::now();

            let prepared = handler
                .decode_and_prepare_for_clipboard(RawImageData {
                    bytes: png.clone(),
                    source_hint: "test",
                }, &config)
                .expect("decode pipeline should succeed");

            let elapsed = start.elapsed();
            println!(
                "[perf] decode {}x{} input={}KB output={}KB elapsed={}ms",
                width,
                height,
                png.len() / 1024,
                prepared.bytes.len() / 1024,
                elapsed.as_millis()
            );

            assert!(prepared.width <= width as usize);
            assert!(prepared.height <= height as usize);
            assert_eq!(prepared.bytes.len(), prepared.width * prepared.height * 4);
        }
    }

    #[test]
    fn stress_rejects_too_many_pixels() {
        let mut config = ImageConfig::default();
        config.max_decoded_pixels = 1_000_000;

        let handler = ImageHandler::new(config).expect("handler init failed");
        let config = handler.config_snapshot().expect("config snapshot failed");
        let png = create_png_bytes(2000, 2000);

        let result = handler.decode_and_prepare_for_clipboard(RawImageData {
            bytes: png,
            source_hint: "test",
        }, &config);

        assert!(matches!(result, Err(ImageError::ResourceLimit(_))));
    }

    #[test]
    fn perf_base64_parse_and_decode() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let config = handler.config_snapshot().expect("config snapshot failed");
        let png = create_png_bytes(1920, 1080);
        let encoded = general_purpose::STANDARD.encode(&png);
        let data_url = format!("data:image/png;base64,{}", encoded);

        let parse_start = Instant::now();
        let decoded = ImageHandler::parse_base64(&data_url).expect("parse base64 failed");
        let parse_elapsed = parse_start.elapsed();

        let decode_start = Instant::now();
        let prepared = handler
            .decode_and_prepare_for_clipboard(RawImageData {
                bytes: decoded,
                source_hint: "base64-test",
            }, &config)
            .expect("decode pipeline should succeed");
        let decode_elapsed = decode_start.elapsed();

        println!(
            "[perf] base64 parse={}ms decode={}ms output={}KB",
            parse_elapsed.as_millis(),
            decode_elapsed.as_millis(),
            prepared.bytes.len() / 1024
        );

        assert_eq!(prepared.width, 1920);
        assert_eq!(prepared.height, 1080);
    }

    #[test]
    fn adaptive_resize_downscales_large_image() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let config = handler.config_snapshot().expect("config snapshot failed");
        let png = create_png_bytes(3840, 2160);

        let prepared = handler
            .decode_and_prepare_for_clipboard(RawImageData {
                bytes: png,
                source_hint: "adaptive-test",
            }, &config)
            .expect("decode pipeline should succeed");

        assert!(prepared.width < 3840);
        assert!(prepared.height < 2160);
        assert_eq!(prepared.bytes.len(), prepared.width * prepared.height * 4);
    }

    #[test]
    fn advanced_config_rejects_invalid_connect_timeout() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

        let result = handler.set_advanced_config(
            false,
            true,
            160 * 1024 * 1024,
            0,
            10_000,
            15_000,
            1_800,
            900,
        );

        assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
    }

    #[test]
    fn advanced_config_rejects_invalid_stream_timeouts() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

        let first_byte_result = handler.set_advanced_config(
            false,
            true,
            160 * 1024 * 1024,
            8,
            100,
            15_000,
            1_800,
            900,
        );
        assert!(matches!(first_byte_result, Err(ImageError::InvalidFormat(_))));

        let chunk_result = handler.set_advanced_config(
            false,
            true,
            160 * 1024 * 1024,
            8,
            10_000,
            100,
            1_800,
            900,
        );
        assert!(matches!(chunk_result, Err(ImageError::InvalidFormat(_))));

        let retry_budget_result = handler.set_advanced_config(
            false,
            true,
            160 * 1024 * 1024,
            8,
            10_000,
            15_000,
            100,
            900,
        );
        assert!(matches!(retry_budget_result, Err(ImageError::InvalidFormat(_))));

        let retry_max_delay_result = handler.set_advanced_config(
            false,
            true,
            160 * 1024 * 1024,
            8,
            10_000,
            15_000,
            1_800,
            6_000,
        );
        assert!(matches!(retry_max_delay_result, Err(ImageError::InvalidFormat(_))));
    }

    #[test]
    fn advanced_config_accepts_valid_timeout_ranges() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");

        handler
            .set_advanced_config(
                true,
                false,
                96 * 1024 * 1024,
                12,
                12_000,
                18_000,
                2_400,
                1_200,
            )
            .expect("advanced config should accept valid timeout values");

        let (
            allow_private_network,
            resolve_dns,
            max_decoded,
            connect_timeout,
            first_byte,
            chunk,
            retry_budget,
            retry_max_delay,
        ) =
            handler.get_advanced_config().expect("read advanced config failed");

        assert!(allow_private_network);
        assert!(!resolve_dns);
        assert_eq!(max_decoded, 96 * 1024 * 1024);
        assert_eq!(connect_timeout, 12);
        assert_eq!(first_byte, 12_000);
        assert_eq!(chunk, 18_000);
        assert_eq!(retry_budget, 2_400);
        assert_eq!(retry_max_delay, 1_200);
    }

    #[test]
    #[ignore = "requires system clipboard access"]
    fn perf_decode_vs_clipboard_write_stage() {
        let handler = ImageHandler::new(ImageConfig::default()).expect("handler init failed");
        let config = handler.config_snapshot().expect("config snapshot failed");
        let runtime = Runtime::new().expect("runtime init failed");

        let cases = [(1920, 1080), (3840, 2160)];

        for (width, height) in cases {
            let png = create_png_bytes(width, height);

            let decode_start = Instant::now();
            let prepared = handler
                .decode_and_prepare_for_clipboard(RawImageData {
                    bytes: png,
                    source_hint: "clipboard-stage-test",
                }, &config)
                .expect("decode pipeline should succeed");
            let decode_elapsed = decode_start.elapsed();

            let write_iterations = 3u128;
            let mut write_total_ms = 0u128;

            for _ in 0..write_iterations {
                let write_image = PreparedClipboardImage {
                    width: prepared.width,
                    height: prepared.height,
                    bytes: prepared.bytes.clone(),
                };

                let write_start = Instant::now();
                runtime
                    .block_on(handler.copy_to_clipboard_with_retry(write_image, &config))
                    .expect("clipboard write should succeed");
                write_total_ms += write_start.elapsed().as_millis();
            }

            let write_avg_ms = write_total_ms / write_iterations;

            println!(
                "[perf] stage {}x{} decode={}ms clipboard_write_avg={}ms output={}KB",
                width,
                height,
                decode_elapsed.as_millis(),
                write_avg_ms,
                prepared.bytes.len() / 1024
            );
        }
    }
}
