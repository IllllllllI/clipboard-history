//! # 解码与变换流水线模块
//!
//! ## 设计思路
//!
//! 将“字节 → 图像 → RGBA”的过程集中管理，并在关键节点增加资源上限控制。
//! 优先做尺寸检查，再进行完整解码，降低恶意输入触发高内存开销的风险。
//!
//! ## 实现思路
//!
//! 1. 读取 header 尺寸（格式识别由 ImageReader 统一完成）
//! 2. 按像素上限快速拒绝
//! 3. 完整解码，尽早释放编码字节缓冲
//! 4. 一次性转换 RGBA（`into_rgba8` 对已有 RGBA8 零拷贝）
//! 5. 根据配置决定是否降采样
//! 6. 校验字节长度一致性

use fast_image_resize as fr;
use image::{DynamicImage, GenericImageView, ImageBuffer, ImageReader, Rgba};
use std::io::Cursor;

use super::source::{PreparedClipboardImage, RawImageData};
use super::{ImageConfig, ImageError, ImageHandler};

impl ImageHandler {
    /// 将原始字节解码为可写入剪贴板的 RGBA 数据。
    ///
    /// 该函数为纯计算函数（不依赖 `&self`），可安全在 `spawn_blocking` 中调用。
    pub(crate) fn decode_and_prepare_for_clipboard(
        raw: RawImageData,
        config: &ImageConfig,
    ) -> Result<PreparedClipboardImage, ImageError> {
        let RawImageData {
            bytes: raw_bytes,
            source_hint,
        } = raw;

        let (header_width, header_height) = Self::inspect_dimensions_from_memory(&raw_bytes)?;
        Self::validate_pixel_limits(config, header_width, header_height)?;
        Self::validate_decoded_memory_limits(config, header_width, header_height)?;

        let decoded = image::load_from_memory(&raw_bytes)
            .map_err(|e| ImageError::Decode(format!("图片解码失败：{}", e)))?;

        // 编码字节在完成解码后不再需要，尽早释放以降低峰值内存
        drop(raw_bytes);

        let (raw_width, raw_height) = decoded.dimensions();
        // 仅在实际尺寸与头部声明不一致时才做第二轮校验（防畸形图片）
        if raw_width != header_width || raw_height != header_height {
            Self::validate_pixel_limits(config, raw_width, raw_height)?;
            Self::validate_decoded_memory_limits(config, raw_width, raw_height)?;
        }

        let optimized = Self::maybe_downscale_for_clipboard(decoded, config)?;
        let (width, height) = optimized.dimensions();

        // into_rgba8 对已经是 RGBA8 的图像零拷贝移动，避免 to_rgba8 的深拷贝
        let rgba = optimized.into_rgba8();
        let bytes = rgba.into_raw();

        let expected_len = (width as usize)
            .checked_mul(height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| ImageError::ResourceLimit("图片尺寸导致内存溢出风险".to_string()))?;

        if bytes.len() != expected_len {
            return Err(ImageError::Decode("解码后像素数据长度异常".to_string()));
        }

        log::info!(
            "✅ 图片解码成功 - 来源: {} 原始尺寸: {}x{} 输出尺寸: {}x{}",
            source_hint,
            raw_width,
            raw_height,
            width,
            height
        );

        Ok(PreparedClipboardImage {
            width: width as usize,
            height: height as usize,
            bytes,
        })
    }

    /// 仅通过内存中的图片头信息读取宽高。
    ///
    /// 用于在完整解码前做像素限制检查。
    fn inspect_dimensions_from_memory(bytes: &[u8]) -> Result<(u32, u32), ImageError> {
        let cursor = Cursor::new(bytes);
        let reader = ImageReader::new(cursor)
            .with_guessed_format()
            .map_err(|e| ImageError::InvalidFormat(format!("无法识别图片格式：{}", e)))?;

        reader
            .into_dimensions()
            .map_err(|e| ImageError::InvalidFormat(format!("无法读取图片尺寸：{}", e)))
    }

    /// 校验像素数量是否超过配置上限。
    fn validate_pixel_limits(
        config: &ImageConfig,
        width: u32,
        height: u32,
    ) -> Result<(), ImageError> {
        let pixels = (width as u64)
            .checked_mul(height as u64)
            .ok_or_else(|| ImageError::ResourceLimit("图片像素数溢出".to_string()))?;

        if pixels > config.max_decoded_pixels {
            return Err(ImageError::ResourceLimit(format!(
                "图片像素过大：{} 像素（限制：{} 像素）",
                pixels, config.max_decoded_pixels
            )));
        }

        Ok(())
    }

    fn validate_decoded_memory_limits(
        config: &ImageConfig,
        width: u32,
        height: u32,
    ) -> Result<(), ImageError> {
        let estimated = (width as u64)
            .checked_mul(height as u64)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or_else(|| ImageError::ResourceLimit("图片解码内存估算溢出".to_string()))?;

        if estimated > config.max_decoded_bytes {
            return Err(ImageError::ResourceLimit(format!(
                "图片解码预计内存过大：{:.2} MB（限制：{:.2} MB）",
                estimated as f64 / 1024.0 / 1024.0,
                config.max_decoded_bytes as f64 / 1024.0 / 1024.0
            )));
        }

        Ok(())
    }

    /// 按配置执行自适应降采样。
    ///
    /// 目标是在视觉可接受范围内降低复制耗时与内存压力。
    fn maybe_downscale_for_clipboard(
        image: DynamicImage,
        config: &ImageConfig,
    ) -> Result<DynamicImage, ImageError> {
        if !config.adaptive_resize {
            return Ok(image);
        }

        let (width, height) = image.dimensions();
        if width == 0 || height == 0 {
            return Err(ImageError::Decode("图片宽或高为 0，无法计算缩放比".to_string()));
        }

        let source_pixels = (width as u64)
            .checked_mul(height as u64)
            .ok_or_else(|| ImageError::ResourceLimit("图片像素数溢出".to_string()))?;

        let over_dimension = width > config.clipboard_max_dimension
            || height > config.clipboard_max_dimension;
        let over_pixels = source_pixels > config.clipboard_target_pixels;

        if !over_dimension && !over_pixels {
            return Ok(image);
        }

        let dimension_scale = (config.clipboard_max_dimension as f64 / width as f64)
            .min(config.clipboard_max_dimension as f64 / height as f64);
        let pixel_scale = (config.clipboard_target_pixels as f64 / source_pixels as f64).sqrt();

        let scale = dimension_scale.min(pixel_scale).min(1.0);

        if scale <= 0.0 {
            return Err(ImageError::ResourceLimit("缩放比例计算异常".to_string()));
        }

        let target_width = ((width as f64 * scale).floor() as u32).max(1);
        let target_height = ((height as f64 * scale).floor() as u32).max(1);

        log::info!(
            "🧩 自适应降采样：{}x{} -> {}x{}（filter={:?}）",
            width,
            height,
            target_width,
            target_height,
            config.resize_filter
        );

        match Self::resize_with_fast_image_resize(&image, target_width, target_height, config.resize_filter)
        {
            Ok(resized) => Ok(resized),
            Err(err) => {
                log::warn!(
                    "⚠️ fast_image_resize 降采样失败，回退 image::resize_exact：{}",
                    err
                );
                Ok(image.resize_exact(
                    target_width,
                    target_height,
                    config.resize_filter,
                ))
            }
        }
    }

    fn resize_with_fast_image_resize(
        image: &DynamicImage,
        target_width: u32,
        target_height: u32,
        filter: image::imageops::FilterType,
    ) -> Result<DynamicImage, ImageError> {
        let src = image.to_rgba8();
        let (src_width, src_height) = src.dimensions();

        let src_image = fr::images::Image::from_vec_u8(
            src_width,
            src_height,
            src.into_raw(),
            fr::PixelType::U8x4,
        )
        .map_err(|e| ImageError::Decode(format!("构建源图像缓冲失败：{}", e)))?;

        let mut dst_image = fr::images::Image::new(target_width, target_height, fr::PixelType::U8x4);

        let mut resizer = fr::Resizer::new();
        let options = fr::ResizeOptions::new().resize_alg(fr::ResizeAlg::Convolution(
            Self::to_fast_filter(filter),
        ));

        resizer
            .resize(&src_image, &mut dst_image, Some(&options))
            .map_err(|e| ImageError::Decode(format!("fast_image_resize 执行失败：{}", e)))?;

        let rgba = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(
            target_width,
            target_height,
            dst_image.into_vec(),
        )
        .ok_or_else(|| ImageError::Decode("fast_image_resize 输出缓冲长度异常".to_string()))?;

        Ok(DynamicImage::ImageRgba8(rgba))
    }

    fn to_fast_filter(filter: image::imageops::FilterType) -> fr::FilterType {
        match filter {
            image::imageops::FilterType::Nearest => fr::FilterType::Box,
            image::imageops::FilterType::Triangle => fr::FilterType::Bilinear,
            image::imageops::FilterType::CatmullRom => fr::FilterType::CatmullRom,
            image::imageops::FilterType::Gaussian => fr::FilterType::Mitchell,
            image::imageops::FilterType::Lanczos3 => fr::FilterType::Lanczos3,
        }
    }
}
