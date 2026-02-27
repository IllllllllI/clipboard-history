//! # 剪贴板历史工具 — 库入口
//!
//! ## 架构总览
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────┐
//! │                  前端 (React + TypeScript)                │
//! │                                                          │
//! │  ClipboardCtx ── SettingsCtx ── UICtx ── StatsCtx       │
//! │       ↕               ↕           ↕                      │
//! │  TauriService ── ClipboardDB (统一 invoke)               │
//! │       │  (统一错误处理 + 类型安全)                       │
//! └───────┼──────────────────────────────────────────────────┘
//!         ↕ Tauri IPC (Result<T, AppError>)
//! ┌───────┼──────────────────────────────────────────────────┐
//! │       ↕            后端 (Rust)                           │
//! │                                                          │
//! │  ┌─ error ────── AppError (统一错误类型)                  │
//! │  │                                                       │
//! │  ├─ db ───────── SQLite (rusqlite) CRUD + 统计             │
//! │  │                                                       │
//! │  ├─ clipboard ── 监控 + IgnoreGuard (RAII)               │
//! │  │   ├─ save           图片/SVG 持久化                    │
//! │  │   └─ code_detection 正则代码特征                       │
//! │  │                                                       │
//! │  ├─ image_handler      图片下载·解码·复制                 │
//! │  ├─ input              键盘鼠标模拟 / 文件复制            │
//! │  ├─ storage            图片存储目录 (返回 Result)         │
//! │  └─ window_position    窗口定位·多屏·状态切换             │
//! └──────────────────────────────────────────────────────────┘
//! ```
//!
//! ## 模块职责
//!
//! | 模块 | 职责 |
//! |------|------|
//! | [`error`] | 统一错误类型 `AppError`，所有 Tauri command 的返回类型 |
//! | [`db`] | SQLite 数据库 CRUD、统计、导入导出、自动清理 |
//! | [`clipboard`] | 剪贴板监控、IgnoreGuard RAII、代码检测、图片/SVG 保存 |
//! | [`image_handler`] | 从 URL/Base64/文件加载图片并复制到剪贴板 |
//! | [`input`] | 模拟键盘粘贴、鼠标点击、Windows 文件路径复制 |
//! | [`storage`] | 图片存储目录的获取与自动创建 |
//! | [`window_position`] | 跨平台光标定位、多显示器窗口摆放、状态切换 |

pub mod error;
pub mod clipboard;
pub mod db;
pub mod image_handler;
pub mod input;
pub mod storage;
pub mod settings;
pub mod window_position;
