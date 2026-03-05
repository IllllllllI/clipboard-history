//! # 数据源与中间模型
//!
//! ## 设计思路
//!
//! 将“外部输入类型”和“流水线中间结果”解耦：
//! - `ImageSource` 表示外部来源语义
//! - `RawImageData` 表示已加载但未解码的字节（使用 `bytes::Bytes` 实现零拷贝缓存共享）
//! - `PreparedClipboardImage` 表示可直接写入剪贴板的 RGBA 数据

use bytes::Bytes;

/// 图片输入来源。
pub enum ImageSource {
    /// 网络地址来源。
    Url(String),
    /// Base64（支持 Data URL 与纯 Base64 字符串）。
    Base64(String),
    /// 本地文件路径来源。
    FilePath(String),
}

/// 加载阶段输出：原始字节与来源标识。
///
/// 使用 `bytes::Bytes` 替代 `Vec<u8>`，使下载缓存命中时仅做引用计数递增
/// 而非整段字节拷贝（对多 MB 图片有显著收益）。
pub(crate) struct RawImageData {
    /// 原始图片字节（引用计数共享，零拷贝 clone）。
    pub(crate) bytes: Bytes,
    /// 来源提示（用于日志与诊断）。
    pub(crate) source_hint: &'static str,
}

/// 解码阶段输出：可写入剪贴板的 RGBA 像素数据。
pub(crate) struct PreparedClipboardImage {
    /// 图像宽度（像素）。
    pub(crate) width: usize,
    /// 图像高度（像素）。
    pub(crate) height: usize,
    /// RGBA 字节数组（`width * height * 4`）。
    pub(crate) bytes: Vec<u8>,
}
