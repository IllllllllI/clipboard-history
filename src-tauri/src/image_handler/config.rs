//! # 配置模块
//!
//! ## 设计思路
//!
//! 将所有“可调策略”集中到 `ImageConfig`，保证运行时行为可观测、可调整、可测试。
//! 其中性能档位（quality / balanced / speed）作为高层语义，映射到底层参数组合。
//!
//! ## 实现思路
//!
//! - `Default` 提供生产可用的平衡配置。
//! - `ImagePerformanceProfile` 负责档位字符串解析与反向输出。
//! - `apply_performance_profile` 将档位转换为具体阈值。
//! - `infer_performance_profile` 用于从当前配置反推档位（给前端展示状态）。

use image::imageops::FilterType;

use super::ImageError;

/// 图片处理配置。
///
/// 字段覆盖了下载、解码、降采样与剪贴板写入重试四个阶段。
#[derive(Debug, Clone)]
pub struct ImageConfig {
    /// 下载/读取原始字节时允许的最大文件体积（字节）。
    pub max_file_size: u64,
    /// 网络下载超时时间（秒）。
    pub download_timeout: u64,
    /// 建立连接（TCP/TLS）超时时间（秒）。
    pub connect_timeout: u64,
    /// 下载首包超时时间（毫秒）。
    pub stream_first_byte_timeout_ms: u64,
    /// 下载分块读取超时时间（毫秒）。
    pub stream_chunk_timeout_ms: u64,
    /// 最大重定向次数，避免无限跳转或恶意链路。
    pub max_redirects: usize,
    /// 是否允许访问内网或本地地址（默认关闭，防 SSRF）。
    pub allow_private_network: bool,
    /// 是否对域名执行 DNS 解析后再做内网 IP 拦截。
    ///
    /// 开启后可防止“公网域名 -> 内网IP”绕过策略。
    pub resolve_dns_for_url_safety: bool,
    /// 解码后的像素上限（`width * height`）。
    pub max_decoded_pixels: u64,
    /// 解码阶段允许的预计内存上限（按 RGBA 估算，字节）。
    pub max_decoded_bytes: u64,
    /// 是否启用自适应降采样。
    pub adaptive_resize: bool,
    /// 降采样后目标像素上限（用于控制复制耗时与内存）。
    pub clipboard_target_pixels: u64,
    /// 降采样后宽/高单边最大值。
    pub clipboard_max_dimension: u32,
    /// 降采样滤镜策略。
    pub resize_filter: FilterType,
    /// 写入剪贴板失败时最大重试次数。
    pub clipboard_retries: u32,
    /// 重试间隔（毫秒）。
    pub clipboard_retry_delay: u64,
    /// 单次写入流程允许的总重试预算（毫秒）。
    pub clipboard_retry_max_total_ms: u64,
    /// 单次退避延迟上限（毫秒）。
    pub clipboard_retry_max_delay_ms: u64,
}

impl Default for ImageConfig {
    fn default() -> Self {
        Self {
            max_file_size: 50 * 1024 * 1024,
            download_timeout: 30,
            connect_timeout: 8,
            stream_first_byte_timeout_ms: 10_000,
            stream_chunk_timeout_ms: 15_000,
            max_redirects: 5,
            allow_private_network: false,
            resolve_dns_for_url_safety: true,
            max_decoded_pixels: 40_000_000,
            max_decoded_bytes: 160 * 1024 * 1024,
            adaptive_resize: true,
            clipboard_target_pixels: 5_000_000,
            clipboard_max_dimension: 2560,
            resize_filter: FilterType::Triangle,
            clipboard_retries: 3,
            clipboard_retry_delay: 100,
            clipboard_retry_max_total_ms: 1_800,
            clipboard_retry_max_delay_ms: 900,
        }
    }
}

/// 图片性能档位（面向产品/用户语义）。
///
/// - `Quality`：尽量保真
/// - `Balanced`：质量与性能平衡
/// - `Speed`：优先写入速度
#[derive(Debug, Clone, Copy)]
pub enum ImagePerformanceProfile {
    Quality,
    Balanced,
    Speed,
}

impl ImagePerformanceProfile {
    /// 从外部字符串解析档位。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::ImagePerformanceProfile;
    ///
    /// let p = ImagePerformanceProfile::from_str("balanced")?;
    /// assert_eq!(p.as_str(), "balanced");
    /// # Ok::<(), clipboard_history::image_handler::ImageError>(())
    /// ```
    pub(crate) fn from_str(profile: &str) -> Result<Self, ImageError> {
        match profile.trim().to_lowercase().as_str() {
            "quality" => Ok(Self::Quality),
            "balanced" => Ok(Self::Balanced),
            "speed" => Ok(Self::Speed),
            other => Err(ImageError::InvalidFormat(format!(
                "未知性能档位：{}（可选：quality / balanced / speed）",
                other
            ))),
        }
    }

    /// 将档位输出为稳定字符串，供前端展示与持久化。
    ///
    /// # 示例
    /// ```rust,ignore
    /// use clipboard_history::image_handler::ImagePerformanceProfile;
    ///
    /// assert_eq!(ImagePerformanceProfile::Speed.as_str(), "speed");
    /// ```
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Quality => "quality",
            Self::Balanced => "balanced",
            Self::Speed => "speed",
        }
    }
}

impl ImageConfig {
    /// 基于当前参数反推性能档位。
    ///
    /// 用于“后端当前生效档位”查询场景。
    pub(crate) fn infer_performance_profile(&self) -> ImagePerformanceProfile {
        if !self.adaptive_resize
            && self.clipboard_max_dimension >= 8192
            && self.clipboard_target_pixels >= self.max_decoded_pixels
        {
            return ImagePerformanceProfile::Quality;
        }

        if self.clipboard_target_pixels <= 2_000_000 || self.clipboard_max_dimension <= 1920 {
            return ImagePerformanceProfile::Speed;
        }

        ImagePerformanceProfile::Balanced
    }

    /// 应用指定性能档位到实际参数。
    ///
    /// 保持“档位语义稳定”，便于前端按档位切换而无需了解底层细节。
    pub(crate) fn apply_performance_profile(&mut self, profile: ImagePerformanceProfile) {
        match profile {
            ImagePerformanceProfile::Quality => {
                self.adaptive_resize = false;
                self.clipboard_target_pixels = self.max_decoded_pixels;
                self.clipboard_max_dimension = 8192;
                self.resize_filter = FilterType::CatmullRom;
            }
            ImagePerformanceProfile::Balanced => {
                self.adaptive_resize = true;
                self.clipboard_target_pixels = 5_000_000;
                self.clipboard_max_dimension = 2560;
                self.resize_filter = FilterType::Triangle;
            }
            ImagePerformanceProfile::Speed => {
                self.adaptive_resize = true;
                self.clipboard_target_pixels = 2_000_000;
                self.clipboard_max_dimension = 1920;
                self.resize_filter = FilterType::Nearest;
            }
        }
    }
}
