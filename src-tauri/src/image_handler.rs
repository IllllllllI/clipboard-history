// Improved image processing module with better architecture

use base64::{Engine as _, engine::general_purpose};
use image::{DynamicImage, GenericImageView};
use arboard;
use std::sync::Arc;
use once_cell::sync::Lazy;

// ============================================================================
// Configuration
// ============================================================================

/// Configuration for image processing operations
#[derive(Debug, Clone)]
pub struct ImageConfig {
    /// Maximum file size in bytes (default: 50MB)
    pub max_file_size: u64,
    /// Download timeout in seconds (default: 30s)
    pub download_timeout: u64,
    /// Maximum clipboard retry attempts (default: 3)
    pub clipboard_retries: u32,
    /// Delay between clipboard retries in milliseconds (default: 100ms)
    pub clipboard_retry_delay: u64,
}

impl Default for ImageConfig {
    fn default() -> Self {
        Self {
            max_file_size: 50 * 1024 * 1024, // 50MB
            download_timeout: 30,
            clipboard_retries: 3,
            clipboard_retry_delay: 100,
        }
    }
}

// ============================================================================
// Error Types
// ============================================================================

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("网络错误：{0}")]
    Network(String),
    
    #[error("解码错误：{0}")]
    Decode(String),
    
    #[error("格式错误：{0}")]
    InvalidFormat(String),
    
    #[error("剪贴板错误：{0}")]
    Clipboard(String),
    
    #[error("文件错误：{0}")]
    FileSystem(String),
    
    #[error("超时错误：{0}")]
    Timeout(String),
}

impl From<ImageError> for String {
    fn from(error: ImageError) -> Self {
        error.to_string()
    }
}

// ============================================================================
// Image Source Abstraction
// ============================================================================

/// Represents different sources of image data
pub enum ImageSource {
    Url(String),
    Base64(String),
    FilePath(String),
}

/// Result of loading image data
struct LoadedImage {
    data: DynamicImage,
    width: u32,
    height: u32,
}

// ============================================================================
// Core Image Handler
// ============================================================================

pub struct ImageHandler {
    config: Arc<ImageConfig>,
    http_client: reqwest::Client,
}

impl ImageHandler {
    pub fn new(config: ImageConfig) -> Result<Self, ImageError> {
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(config.download_timeout))
            .build()
            .map_err(|e| ImageError::Network(format!("无法创建 HTTP 客户端：{}", e)))?;
        
        Ok(Self {
            config: Arc::new(config),
            http_client,
        })
    }
    
    /// Main entry point: load image from any source and copy to clipboard
    pub async fn process_and_copy(&self, source: ImageSource) -> Result<(), ImageError> {
        // Load image based on source type
        let loaded = match source {
            ImageSource::Url(url) => self.load_from_url(&url).await?,
            ImageSource::Base64(data) => self.load_from_base64(&data)?,
            ImageSource::FilePath(path) => self.load_from_file(&path)?,
        };
        
        // Convert to clipboard format
        let rgba = loaded.data.to_rgba8();
        let image_bytes = rgba.into_raw();
        
        // Copy to clipboard with retry
        self.copy_to_clipboard_with_retry(loaded.width, loaded.height, image_bytes).await?;
        
        Ok(())
    }
    
    // ------------------------------------------------------------------------
    // Image Loading Methods
    // ------------------------------------------------------------------------
    
    async fn load_from_url(&self, url: &str) -> Result<LoadedImage, ImageError> {
        log::info!("🌐 开始下载图片 - URL: {}", url);
        
        // Validate protocol
        Self::validate_url_protocol(url)?;
        
        // Download with validation
        let bytes = self.download_with_validation(url).await?;
        
        // Decode
        let data = Self::decode_image(&bytes)?;
        let (width, height) = data.dimensions();
        
        log::info!("✅ 图片下载并解码成功 - 尺寸: {}x{}", width, height);
        
        Ok(LoadedImage { data, width, height })
    }
    
    fn load_from_base64(&self, data: &str) -> Result<LoadedImage, ImageError> {
        log::info!("📝 开始处理 base64 图片");
        
        let bytes = Self::parse_base64(data)?;
        let data = Self::decode_image(&bytes)?;
        let (width, height) = data.dimensions();
        
        log::info!("✅ Base64 图片解码成功 - 尺寸: {}x{}", width, height);
        
        Ok(LoadedImage { data, width, height })
    }
    
    fn load_from_file(&self, path: &str) -> Result<LoadedImage, ImageError> {
        log::info!("📁 开始读取本地图片 - 路径: {}", path);
        
        if !std::path::Path::new(path).exists() {
            return Err(ImageError::FileSystem(format!("文件不存在：{}", path)));
        }
        
        let data = image::open(path)
            .map_err(|e| ImageError::FileSystem(format!("无法打开图片：{}", e)))?;
        
        let (width, height) = data.dimensions();
        
        log::info!("✅ 本地图片读取成功 - 尺寸: {}x{}", width, height);
        
        Ok(LoadedImage { data, width, height })
    }
    
    // ------------------------------------------------------------------------
    // Download Helper
    // ------------------------------------------------------------------------
    
    async fn download_with_validation(&self, url: &str) -> Result<Vec<u8>, ImageError> {
        log::debug!("📡 发送 HTTP 请求...");
        
        let response = self.http_client.get(url)
            .send()
            .await
            .map_err(|e| self.map_reqwest_error(e, url))?;
        
        // Validate status
        if !response.status().is_success() {
            return Err(ImageError::Network(
                format!("HTTP {}: {}", response.status().as_u16(), 
                    Self::status_message(response.status().as_u16()))
            ));
        }
        
        // Validate Content-Type
        if let Some(ct) = response.headers().get("content-type") {
            if let Ok(ct_str) = ct.to_str() {
                if !ct_str.starts_with("image/") {
                    return Err(ImageError::InvalidFormat(
                        format!("不是图片类型：{}", ct_str)
                    ));
                }
            }
        }
        
        // Check size before download
        if let Some(cl) = response.headers().get("content-length") {
            if let Ok(cl_str) = cl.to_str() {
                if let Ok(size) = cl_str.parse::<u64>() {
                    if size > self.config.max_file_size {
                        return Err(ImageError::InvalidFormat(
                            format!("文件过大：{:.2} MB（限制：{:.2} MB）",
                                size as f64 / 1024.0 / 1024.0,
                                self.config.max_file_size as f64 / 1024.0 / 1024.0)
                        ));
                    }
                }
            }
        }
        
        // Download
        let bytes = response.bytes()
            .await
            .map_err(|e| ImageError::Network(format!("下载失败：{}", e)))?;
        
        // Validate size after download
        if bytes.len() as u64 > self.config.max_file_size {
            return Err(ImageError::InvalidFormat("下载后文件超过大小限制".to_string()));
        }
        
        log::debug!("✅ 下载完成 - {} bytes", bytes.len());
        
        Ok(bytes.to_vec())
    }
    
    // ------------------------------------------------------------------------
    // Clipboard Operations
    // ------------------------------------------------------------------------
    
    async fn copy_to_clipboard_with_retry(
        &self,
        width: u32,
        height: u32,
        bytes: Vec<u8>
    ) -> Result<(), ImageError> {
        log::debug!("📋 准备复制到剪贴板 - {}x{}", width, height);
        
        // 设置忽略标志，避免触发重复保存
        let _guard = crate::clipboard::IgnoreGuard::new();
        
        let config = Arc::clone(&self.config);
        
        tokio::task::spawn_blocking(move || {
            let image_data = arboard::ImageData {
                width: width as usize,
                height: height as usize,
                bytes: std::borrow::Cow::Owned(bytes),
            };
            
            let mut last_error = None;
            
            for attempt in 1..=config.clipboard_retries {
                if attempt > 1 {
                    log::debug!("🔄 重试 {}/{}", attempt, config.clipboard_retries);
                    std::thread::sleep(std::time::Duration::from_millis(config.clipboard_retry_delay));
                }
                
                match Self::try_clipboard_copy(&image_data) {
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
                last_error.unwrap_or_else(|| "未知错误".to_string())
            ))
        })
        .await
        .map_err(|e| ImageError::Clipboard(format!("线程执行失败：{}", e)))?
    }
    
    fn try_clipboard_copy(image_data: &arboard::ImageData) -> Result<(), String> {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| format!("无法访问剪贴板：{}", e))?;
        
        let cloned_data = arboard::ImageData {
            width: image_data.width,
            height: image_data.height,
            bytes: image_data.bytes.clone(),
        };
        
        clipboard.set_image(cloned_data)
            .map_err(|e| format!("复制失败：{}", e))?;
        
        Ok(())
    }
    
    // ------------------------------------------------------------------------
    // Validation & Parsing Helpers
    // ------------------------------------------------------------------------
    
    fn validate_url_protocol(url: &str) -> Result<(), ImageError> {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ImageError::InvalidFormat("仅支持 HTTP/HTTPS".to_string()));
        }
        Ok(())
    }
    
    fn parse_base64(data: &str) -> Result<Vec<u8>, ImageError> {
        if !data.starts_with("data:image/") {
            return Err(ImageError::InvalidFormat("无效的 base64 格式".to_string()));
        }
        
        let base64_start = data.find(";base64,")
            .ok_or_else(|| ImageError::InvalidFormat("缺少 base64 标记".to_string()))?;
        
        let base64_data = &data[base64_start + 8..];
        
        general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| ImageError::Decode(format!("Base64 解码失败：{}", e)))
    }
    
    fn decode_image(bytes: &[u8]) -> Result<DynamicImage, ImageError> {
        image::load_from_memory(bytes)
            .map_err(|e| ImageError::Decode(format!("图片解码失败：{}", e)))
    }
    
    // ------------------------------------------------------------------------
    // Error Mapping
    // ------------------------------------------------------------------------
    
    fn map_reqwest_error(&self, e: reqwest::Error, _url: &str) -> ImageError {
        if e.is_timeout() {
            ImageError::Timeout(format!("下载超时（{}秒）", self.config.download_timeout))
        } else if e.is_connect() {
            ImageError::Network(format!("无法连接：{}", e))
        } else {
            ImageError::Network(format!("请求失败：{}", e))
        }
    }
    
    fn status_message(code: u16) -> &'static str {
        match code {
            404 => "未找到",
            403 => "访问被拒绝",
            500..=599 => "服务器错误",
            _ => "请求失败"
        }
    }
}

// ============================================================================
// Tauri Commands (Thin wrappers)
// ============================================================================

static HANDLER: Lazy<ImageHandler> = Lazy::new(|| {
    ImageHandler::new(ImageConfig::default())
        .expect("Failed to initialize ImageHandler")
});

#[tauri::command]
pub async fn download_and_copy_image(url: String) -> Result<(), crate::error::AppError> {
    HANDLER.process_and_copy(ImageSource::Url(url)).await?;
    Ok(())
}

#[tauri::command]
pub async fn copy_base64_image_to_clipboard(data: String) -> Result<(), crate::error::AppError> {
    HANDLER.process_and_copy(ImageSource::Base64(data)).await?;
    Ok(())
}

#[tauri::command]
pub async fn copy_image_to_clipboard(path: String) -> Result<(), crate::error::AppError> {
    HANDLER.process_and_copy(ImageSource::FilePath(path)).await?;
    Ok(())
}
