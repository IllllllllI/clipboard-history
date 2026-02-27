//! # 图片处理模块（image_handler）
//!
//! ## 设计思路
//!
//! 该模块将“图片来源识别 → 加载校验 → 解码缩放 → 写入剪贴板 → Tauri 命令暴露”
//! 按职责拆分为多个子模块，避免单文件膨胀与耦合。
//!
//! - `commands`：仅做 IPC 入参/出参适配（薄封装）
//! - `service`：承载可注入状态（`ImageServiceState`）
//! - `handler`：编排整条处理流水线
//! - `loader`：负责 URL/Base64/文件加载与安全校验
//! - `pipeline`：负责解码、像素限制、降采样
//! - `clipboard_writer`：负责写入剪贴板与重试
//! - `config/error/source`：配置、错误、中间数据模型
//!
//! ## 实现思路
//!
//! 对外仅暴露必要类型与命令函数，内部细节保持 `mod` 私有。
//! 在 Tauri 侧通过 `ImageServiceState` 注入状态，提升测试隔离与后续扩展能力。
//!
//! ## 新同事快速上手
//!
//! 可以按下面顺序理解调用链：
//!
//! ```text
//! 前端 invoke
//!    ↓
//! commands.rs（参数适配）
//!    ↓
//! service.rs（State 注入、服务入口）
//!    ↓
//! handler.rs（统一编排 + 阶段耗时日志）
//!    ├─ loader.rs（来源加载 + URL/体积安全校验）
//!    ├─ pipeline.rs（解码 + 像素限制 + 降采样）
//!    └─ clipboard_writer.rs（写剪贴板 + 重试）
//!    ↓
//! 返回 AppError 给前端
//! ```
//!
//! ## 分层职责建议
//!
//! - 调用入口变更（命令名/参数）优先改 `commands.rs`
//! - 配置与策略变更优先改 `config.rs`
//! - 业务流程顺序变更优先改 `handler.rs`
//! - 单阶段行为优化分别改 `loader/pipeline/clipboard_writer`
//! - 前端“档位已同步”问题优先看 `service.rs` 与对应 command

pub mod commands;
mod clipboard_writer;
mod config;
mod error;
mod handler;
mod loader;
mod pipeline;
mod service;
mod source;

pub use commands::{
    copy_base64_image_to_clipboard,
    copy_image_to_clipboard,
    download_and_copy_image,
    get_image_advanced_config,
    get_image_performance_profile,
    set_image_advanced_config,
    set_image_performance_profile,
};
pub use config::{ImageConfig, ImagePerformanceProfile};
pub use error::ImageError;
pub use service::ImageAdvancedConfig;
pub use service::ImageServiceState;
pub use source::ImageSource;

/// 内部核心编排器，不直接暴露给 Tauri 命令层。
pub(crate) use handler::ImageHandler;
