//! 剪贴板内容保存模块
//!
//! # 设计思路
//!
//! 提供将剪贴板中的图片/SVG 保存到磁盘，以及从磁盘文件恢复到剪贴板的命令。
//! 图片保存前会经过三层防护（尺寸检查、代码检测、长文本过滤），
//! 避免浏览器复制代码时附带的预览图被误存。
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
use crate::error::AppError;
use crate::storage::get_images_dir;
use super::code_detection::is_likely_code;
use super::IgnoreGuard;

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
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::DataExchange::{CloseClipboard, OpenClipboard, GetClipboardData};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return Ok(None);
        }

        let result = (|| -> Result<Option<Vec<String>>, AppError> {
            let handle = GetClipboardData(CF_HDROP.0 as u32);
            let handle = match handle {
                Ok(h) => h,
                Err(_) => return Ok(None),
            };

            let hdrop = HDROP(handle.0);

            // 获取文件数量
            let count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
            if count == 0 {
                return Ok(None);
            }

            let mut files = Vec::with_capacity(count as usize);

            for i in 0..count {
                // 获取文件名长度
                let len = DragQueryFileW(hdrop, i, None);
                if len == 0 {
                    continue;
                }

                // 读取文件名
                let mut buf = vec![0u16; (len + 1) as usize];
                DragQueryFileW(hdrop, i, Some(&mut buf));

                // 去掉末尾的 null terminator
                if let Some(pos) = buf.iter().position(|&c| c == 0) {
                    buf.truncate(pos);
                }

                let path = OsString::from_wide(&buf)
                    .to_string_lossy()
                    .to_string();
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
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    if let Ok(image_data) = clipboard.get_image() {
        // 防护层 1：检查图片大小
        if image_data.width < 64 || image_data.height < 64 {
            log::debug!(
                "🚫 图片太小 ({}x{})，可能是图标，跳过保存",
                image_data.width, image_data.height
            );
            return Ok(None);
        }

        // 防护层 2 & 3：检查文本内容
        if let Ok(text) = clipboard.get_text() {
            if text.contains('\n') {
                if is_likely_code(&text) {
                    log::debug!("🚫 检测到代码内容（多行），跳过保存图片");
                    return Ok(None);
                }
                if text.len() > 500 {
                    log::debug!(
                        "🚫 多行长文本（{} 字符）带图片，可能是网页复制，跳过保存",
                        text.len()
                    );
                    return Ok(None);
                }
            }
            if is_likely_code(&text) {
                log::debug!("🚫 检测到代码内容（单行），跳过保存图片");
                return Ok(None);
            }
        }

        // 通过所有检查，保存图片
        let width = image_data.width as u32;
        let height = image_data.height as u32;
        let image =
            image::RgbaImage::from_raw(width, height, image_data.bytes.into_owned())
                .ok_or_else(|| AppError::Clipboard("创建图像缓冲区失败".to_string()))?;

        let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
        let file_name = format!("img_{}.png", timestamp);
        let file_path = get_images_dir(&app, custom_dir)?.join(&file_name);

        image
            .save_with_format(&file_path, ImageFormat::Png)
            .map_err(|e| AppError::Clipboard(format!("保存图片失败: {}", e)))?;

        return Ok(Some(file_path.to_string_lossy().to_string()));
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
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    if let Ok(text) = clipboard.get_text() {
        let trimmed = text.trim();
        if (trimmed.contains("<svg") && trimmed.contains("</svg>"))
            || (trimmed.starts_with("<?xml") && trimmed.contains("<svg"))
        {
            let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
            let file_name = format!("svg_{}.svg", timestamp);
            let file_path = get_images_dir(&app, custom_dir)?.join(&file_name);

            fs::write(&file_path, text)?;

            return Ok(Some(file_path.to_string_lossy().to_string()));
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
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    let img = image::open(&file_path)
        .map_err(|e| AppError::Clipboard(format!("打开图片失败: {}", e)))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let image_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
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
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
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
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    let _guard = IgnoreGuard::new();
    clipboard.set_text(text)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(())
}
