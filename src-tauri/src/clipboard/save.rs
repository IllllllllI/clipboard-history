//! 剪贴板内容保存模块
//!
//! # 设计思路
//!
//! 提供将剪贴板中的图片/SVG 保存到磁盘，以及从磁盘文件恢复到剪贴板的命令。
//! 图片保存前会经过三层防护（尺寸检查、代码检测、长文本过滤），
//! 避免浏览器复制代码时附带的预览图被误存。
//!
//! ## 多格式快照
//!
//! `capture_clipboard_snapshot` 读取剪贴板中所有有价值的格式（文本/HTML/RTF/图片/文件），
//! 返回 `ClipboardSnapshot` 结构体。通过 `formats.rs` 枚举格式列表，
//! 智能判定 `content_type`：
//!
//! - **rich**：同时有文本 + HTML/RTF（Office/WPS/浏览器表格），优先保存文本，
//!   附带 HTML 和 RTF 作为附加格式，跳过冗余的渲染截图
//! - **image**：纯图片（截图工具），保存图片文件
//! - **files**：文件列表（资源管理器复制）
//! - **text**：纯文本
//!
//! # 实现思路
//!
//! - 所有函数均为 `#[tauri::command]`，由前端通过 IPC 调用。
//! - 统一返回 `Result<T, AppError>`，前端收到一致的错误格式。
//! - 图片读写委托 `image` crate，SVG 按纯文本处理。
//! - 文件路径由 `storage::get_images_dir` 统一管理。
//! - 写入剪贴板前使用 `IgnoreGuard` RAII 设置忽略标志，防止触发重复保存。

use std::fs;
use chrono::Local;
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::storage::get_images_dir;
use super::code_detection::is_likely_code;
use super::formats::collect_clipboard_formats;
use super::{IgnoreGuard, remember_internal_image_fingerprint, should_ignore_internal_image_by_fingerprint};

const FILES_PREFIX: &str = "[FILES]\n";

// ============================================================================
// 剪贴板快照数据结构
// ============================================================================

/// 剪贴板快照：一次剪贴板变化中所有有价值的格式数据
///
/// 由 `capture_clipboard_snapshot` 生成，前端通过 IPC 接收后
/// 传给 `db_add_clip_snapshot` 入库。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ClipboardSnapshot {
    /// 内容类型：`"text"` | `"image"` | `"files"` | `"rich"`
    pub content_type: String,
    /// 纯文本内容（几乎所有场景都有）
    pub text: Option<String>,
    /// HTML 格式内容（Office/WPS/浏览器富文本复制时存在）
    pub html: Option<String>,
    /// RTF 格式内容（Office/WPS 复制时存在）
    pub rtf: Option<String>,
    /// 保存到磁盘的图片文件路径（截图 / 独立图片）
    pub image_path: Option<String>,
    /// 文件列表（资源管理器复制文件时存在）
    pub files: Option<Vec<String>>,
}

/// 打开系统剪贴板，统一错误转换
fn open_clipboard() -> Result<arboard::Clipboard, AppError> {
    arboard::Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))
}

fn encode_file_list(files: &[String]) -> Option<String> {
    if files.is_empty() {
        return None;
    }
    Some(format!("{}{}", FILES_PREFIX, files.join("\n")))
}

fn should_skip_image_by_text(text: &str) -> bool {
    if text.contains('\n') {
        if is_likely_code(text) {
            log::debug!("🚫 检测到代码内容（多行），跳过保存图片");
            return true;
        }
        if text.len() > 500 {
            log::debug!(
                "🚫 多行长文本（{} 字符）带图片，可能是网页复制，跳过保存",
                text.len()
            );
            return true;
        }
    }

    if is_likely_code(text) {
        log::debug!("🚫 检测到代码内容（单行），跳过保存图片");
        return true;
    }

    false
}

fn save_image_data(
    app: &tauri::AppHandle,
    custom_dir: Option<String>,
    image_data: arboard::ImageData<'_>,
) -> Result<Option<String>, AppError> {
    let width = image_data.width as u32;
    let height = image_data.height as u32;
    let image = image::RgbaImage::from_raw(width, height, image_data.bytes.into_owned())
        .ok_or_else(|| AppError::Clipboard("创建图像缓冲区失败".to_string()))?;

    let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
    let file_name = format!("img_{}.png", timestamp);
    let file_path = get_images_dir(app, custom_dir)?.join(&file_name);

    image
        .save_with_format(&file_path, ImageFormat::Png)
        .map_err(|e| AppError::Clipboard(format!("保存图片失败: {}", e)))?;

    Ok(Some(file_path.to_string_lossy().to_string()))
}

fn save_svg_text(app: &tauri::AppHandle, custom_dir: Option<String>, text: &str) -> Result<Option<String>, AppError> {
    let trimmed = text.trim();
    if (trimmed.contains("<svg") && trimmed.contains("</svg>"))
        || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
    {
        let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
        let file_name = format!("svg_{}.svg", timestamp);
        let file_path = get_images_dir(app, custom_dir)?.join(&file_name);
        fs::write(&file_path, text)?;
        return Ok(Some(file_path.to_string_lossy().to_string()));
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
fn read_clipboard_files_sync() -> Result<Option<Vec<String>>, AppError> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    unsafe {
        if OpenClipboard(None).is_err() {
            return Ok(None);
        }

        let result = (|| -> Result<Option<Vec<String>>, AppError> {
            let handle = GetClipboardData(CF_HDROP.0 as u32);
            let handle = match handle {
                Ok(h) => h,
                Err(_) => return Ok(None),
            };

            let hdrop = HDROP(handle.0);
            let count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
            if count == 0 {
                return Ok(None);
            }

            let mut files = Vec::with_capacity(count as usize);
            for i in 0..count {
                let len = DragQueryFileW(hdrop, i, None);
                if len == 0 {
                    continue;
                }

                let mut buf = vec![0u16; (len + 1) as usize];
                DragQueryFileW(hdrop, i, Some(&mut buf));

                if let Some(pos) = buf.iter().position(|&c| c == 0) {
                    buf.truncate(pos);
                }

                let path = OsString::from_wide(&buf).to_string_lossy().to_string();
                files.push(path);
            }

            if files.is_empty() {
                Ok(None)
            } else {
                log::info!("📁 从剪贴板读取到 {} 个文件", files.len());
                Ok(Some(files))
            }
        })();

        let _ = CloseClipboard();
        result
    }
}

#[cfg(not(target_os = "windows"))]
fn read_clipboard_files_sync() -> Result<Option<Vec<String>>, AppError> {
    Ok(None)
}

// ============================================================================
// 读取剪贴板文件列表
// ============================================================================

/// 从剪贴板读取文件列表（CF_HDROP 格式，Windows 专用）
///
/// 当用户在资源管理器中复制文件时，剪贴板中包含 CF_HDROP 数据。
/// 此命令读取这些文件路径并返回。
///
/// # 返回
/// - `Ok(Some(Vec<String>))`：包含一个或多个文件路径
/// - `Ok(None)`：剪贴板中没有文件
/// - `Err(msg)`：操作失败
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn read_clipboard_files() -> Result<Option<Vec<String>>, AppError> {
    read_clipboard_files_sync()
}

/// 非 Windows 平台的占位实现
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn read_clipboard_files() -> Result<Option<Vec<String>>, AppError> {
    Ok(None)
}

// ============================================================================
// 保存剪贴板图片
// ============================================================================

/// 保存剪贴板中的图片
///
/// # 三层防护
/// 1. **图片大小检查** — 小于 64×64 的通常是图标，跳过
/// 2. **代码特征检测** — 同时存在文本时检测代码模式
/// 3. **多行长文本检查** — 多行 + >500 字符通常是网页复制
///
/// # 参数
/// * `app` - Tauri 应用句柄
/// * `custom_dir` - 自定义保存目录（可选）
///
/// # 返回
/// - `Ok(Some(path))`：图片已保存
/// - `Ok(None)`：无图片或被防护规则跳过
/// - `Err(msg)`：操作失败
#[tauri::command]
pub async fn save_clipboard_image(
    app: tauri::AppHandle,
    custom_dir: Option<String>,
) -> Result<Option<String>, AppError> {
    let mut clipboard = open_clipboard()?;

    let maybe_text = clipboard.get_text().ok();
    if let Ok(image_data) = clipboard.get_image() {
        if let Some(text) = maybe_text.as_deref() {
            if should_skip_image_by_text(text) {
                return Ok(None);
            }
        }
        return save_image_data(&app, custom_dir, image_data);
    }

    Ok(None)
}

// ============================================================================
// 保存剪贴板 SVG
// ============================================================================

/// 保存剪贴板中的 SVG 内容到文件
#[tauri::command]
pub async fn save_clipboard_svg(
    app: tauri::AppHandle,
    custom_dir: Option<String>,
) -> Result<Option<String>, AppError> {
    let mut clipboard = open_clipboard()?;

    if let Ok(text) = clipboard.get_text() {
        return save_svg_text(&app, custom_dir, &text);
    }

    Ok(None)
}

// ============================================================================
// 多格式快照（文件 / 图片 / SVG / HTML / RTF / 文本）
// ============================================================================

/// 单次抓取当前剪贴板所有有价值的格式数据
///
/// ## 判定逻辑
///
/// 1. **文件列表** (CF_HDROP) → `content_type = "files"`
/// 2. **富文本** (文本 + HTML/RTF) → `content_type = "rich"`
///    - 主 text = 纯文本，附加 html/rtf 存入 clip_formats
///    - 附带的图片为渲染截图，默认跳过
/// 3. **纯截图** (图片，无文本，无 HTML) → `content_type = "image"`
/// 4. **纯文本** → `content_type = "text"`
#[tauri::command]
pub async fn capture_clipboard_snapshot(
    app: tauri::AppHandle,
    custom_dir: Option<String>,
) -> Result<Option<ClipboardSnapshot>, AppError> {
    // 第一步：枚举格式并读取 HTML/RTF（Win32 API，一次 Open/Close）
    let formats_info = collect_clipboard_formats();

    // ── 1) 文件列表优先 ──
    if formats_info.has_files {
        if let Some(files) = read_clipboard_files_sync()? {
            if !files.is_empty() {
                let encoded = encode_file_list(&files);
                return Ok(Some(ClipboardSnapshot {
                    content_type: "files".to_string(),
                    text: encoded,
                    files: Some(files),
                    ..Default::default()
                }));
            }
        }
    }

    // 第二步：用 arboard 读取文本和图片
    let mut clipboard = open_clipboard()?;
    let maybe_text = clipboard.get_text().ok();

    // ── 2) 富文本上下文（Office/WPS/浏览器表格等）──
    if formats_info.is_rich_text_context() {
        if let Some(ref text) = maybe_text {
            if !text.trim().is_empty() {
                // 富文本场景：文本是主体，HTML/RTF 是附加格式
                // 图片是渲染截图，信息冗余，不保存
                log::info!(
                    "📋 富文本复制：text={}字符, html={}, rtf={}",
                    text.len(),
                    formats_info.has_html,
                    formats_info.has_rtf,
                );

                // 检查文本是否为 SVG
                if let Some(svg_path) = save_svg_text(&app, custom_dir.clone(), text)? {
                    return Ok(Some(ClipboardSnapshot {
                        content_type: "image".to_string(),
                        text: Some(svg_path.clone()),
                        image_path: Some(svg_path),
                        html: formats_info.html_content,
                        rtf: formats_info.rtf_content,
                        ..Default::default()
                    }));
                }

                return Ok(Some(ClipboardSnapshot {
                    content_type: "rich".to_string(),
                    text: Some(text.clone()),
                    html: formats_info.html_content,
                    rtf: formats_info.rtf_content,
                    ..Default::default()
                }));
            }
        }
    }

    // ── 3) 图片处理 ──
    if let Ok(image_data) = clipboard.get_image() {
        if should_ignore_internal_image_by_fingerprint(
            image_data.width,
            image_data.height,
            image_data.bytes.as_ref(),
        ) {
            log::debug!("⏭️ 检测到应用自身写入的图片指纹，跳过本次剪贴板捕获");
            return Ok(None);
        }

        let skip_image = maybe_text
            .as_deref()
            .is_some_and(|t| should_skip_image_by_text(t));

        if !skip_image {
            if let Some(image_path) = save_image_data(&app, custom_dir.clone(), image_data)? {
                // 纯图片（截图工具等）
                return Ok(Some(ClipboardSnapshot {
                    content_type: "image".to_string(),
                    text: Some(image_path.clone()),
                    image_path: Some(image_path),
                    ..Default::default()
                }));
            }
        }
        log::debug!("⏭️ 跳过图片，回退到文本处理");
    }

    // ── 4) 纯文本 ──
    if let Some(text) = maybe_text {
        // 检查 SVG
        if let Some(svg_path) = save_svg_text(&app, custom_dir, &text)? {
            return Ok(Some(ClipboardSnapshot {
                content_type: "image".to_string(),
                text: Some(svg_path.clone()),
                image_path: Some(svg_path),
                ..Default::default()
            }));
        }

        if !text.trim().is_empty() {
            return Ok(Some(ClipboardSnapshot {
                content_type: "text".to_string(),
                text: Some(text),
                ..Default::default()
            }));
        }
    }

    Ok(None)
}

// ============================================================================
// 从文件复制图片到剪贴板
// ============================================================================

/// 从文件读取图片并复制到剪贴板
#[tauri::command]
pub async fn copy_image_from_file(file_path: String) -> Result<(), AppError> {
    let mut clipboard = open_clipboard()?;

    let img = image::open(&file_path)
        .map_err(|e| AppError::Clipboard(format!("打开图片失败: {}", e)))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let raw = rgba.into_raw();

    remember_internal_image_fingerprint(width as usize, height as usize, &raw);

    let image_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(raw),
    };

    let _guard = IgnoreGuard::new();
    clipboard.set_image(image_data)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(())
}

// ============================================================================
// 从文件复制 SVG 到剪贴板
// ============================================================================

/// 从文件读取 SVG 内容并作为文本复制到剪贴板
#[tauri::command]
pub async fn copy_svg_from_file(file_path: String) -> Result<(), AppError> {
    let mut clipboard = open_clipboard()?;
    let content = fs::read_to_string(&file_path)?;

    let _guard = IgnoreGuard::new();
    clipboard.set_text(content)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(())
}

// ============================================================================
// 写入纯文本到剪贴板
// ============================================================================

/// 将纯文本写入剪贴板
///
/// 统一由后端处理，自动使用 IgnoreGuard 防止重复捕获。
#[tauri::command]
pub async fn write_text_to_clipboard(text: String) -> Result<(), AppError> {
    let mut clipboard = open_clipboard()?;

    let _guard = IgnoreGuard::new();
    clipboard.set_text(text)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
#[path = "tests/save_tests.rs"]
mod tests;
