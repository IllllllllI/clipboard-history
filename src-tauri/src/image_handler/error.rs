//! # 错误模型模块
//!
//! ## 设计思路
//!
//! 使用单一错误枚举承载图片链路中的所有错误来源，避免字符串拼接式错误处理。
//! 通过 `thiserror` 保持人类可读错误，同时让调用侧可按分支匹配。

/// 图片处理统一错误类型。
///
/// 该类型会在命令层被上转为 `AppError`，最终透传给前端。
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

    #[error("资源限制：{0}")]
    ResourceLimit(String),
}

impl From<ImageError> for String {
    /// 兼容部分仍使用字符串错误的调用点。
    fn from(error: ImageError) -> Self {
        error.to_string()
    }
}
