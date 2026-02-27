//! 统一错误类型模块
//!
//! # 设计思路
//!
//! 定义全局统一的 `AppError` 枚举，替代各模块中分散的
//! `.map_err(|e| e.to_string())`、`format!(...)`、`expect()` 等不一致模式。
//!
//! 所有 `#[tauri::command]` 函数统一返回 `Result<T, AppError>`，
//! 前端通过 `Serialize` 获得结构化的错误信息。
//!
//! # 实现思路
//!
//! - 使用 `thiserror` 派生可读错误消息。
//! - 为 `ImageError` 提供 `From` 转换，无需手动 map。
//! - 实现 `Serialize` 将错误序列化为字符串，满足 Tauri IPC 要求。

use serde::Serialize;

use crate::image_handler::ImageError;

/// 应用级统一错误类型
///
/// 所有 Tauri command 均返回此类型，确保前端收到一致的错误格式。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// 剪贴板读写操作失败
    #[error("剪贴板操作失败: {0}")]
    Clipboard(String),

    /// 图片处理流水线错误（下载 / 解码 / 复制）
    #[error("{0}")]
    Image(#[from] ImageError),

    /// 文件系统 I/O 错误
    #[error("文件系统错误: {0}")]
    Io(#[from] std::io::Error),

    /// 存储目录不可用
    #[error("存储目录不可用: {0}")]
    Storage(String),

    /// 窗口操作失败
    #[error("窗口操作失败: {0}")]
    Window(String),

    /// 输入模拟失败
    #[error("输入模拟失败: {0}")]
    Input(String),

    /// 数据库操作失败
    #[error("数据库错误: {0}")]
    Database(String),
}

/// Tauri IPC 要求返回值实现 `Serialize`。
/// 将错误序列化为人类可读的字符串。
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
