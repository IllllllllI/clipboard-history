//! 输入模拟模块
//!
//! # 设计思路
//!
//! 提供键盘/鼠标模拟能力，用于实现"粘贴"和"点击后粘贴"等操作。
//! 同时包含 Windows 平台的文件路径复制功能。
//!
//! # 实现思路
//!
//! - 使用 `enigo` crate 进行跨平台键盘/鼠标模拟。
//! - 粘贴前先隐藏窗口并等待 OS 焦点切换，确保目标窗口接收输入。
//! - 文件复制使用 Windows `CF_HDROP` 格式，粘贴到资源管理器时可直接生成文件。
//! - 非 Windows 平台提供占位实现返回错误。
//! - 统一返回 `Result<(), AppError>`，使用 `IgnoreGuard` 管理忽略标志。

use tauri::Manager;
use enigo::{Enigo, Key, KeyboardControllable};
use crate::error::AppError;

// ============================================================================
// 粘贴文本
// ============================================================================

/// 模拟键盘粘贴操作
///
/// # 参数
/// * `app` - Tauri 应用句柄
/// * `hide_on_action` - 粘贴前是否隐藏窗口
#[tauri::command]
pub async fn paste_text(app: tauri::AppHandle, hide_on_action: bool) -> Result<(), AppError> {
    let mut enigo = Enigo::new();

    if hide_on_action {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Meta);
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Control);
    }

    Ok(())
}

// ============================================================================
// 点击并粘贴
// ============================================================================

/// 模拟鼠标点击后粘贴
///
/// 用于需要先点击获得焦点的应用场景。
#[tauri::command]
pub async fn click_and_paste(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let mut enigo = Enigo::new();

    #[cfg(target_os = "windows")]
    {
        use enigo::{MouseButton, MouseControllable};
        enigo.mouse_click(MouseButton::Left);
        log::debug!("已模拟鼠标点击");
    }

    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    #[cfg(target_os = "macos")]
    {
        enigo.key_down(Key::Meta);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Meta);
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key_down(Key::Control);
        enigo.key_click(Key::Layout('v'));
        enigo.key_up(Key::Control);
    }

    log::debug!("已点击并粘贴");
    Ok(())
}

// ============================================================================
// 复制文件到剪贴板（仅 Windows）
// ============================================================================

/// 将文件路径以 CF_HDROP 格式复制到剪贴板（Windows 专用）
///
/// 粘贴到资源管理器时可直接生成文件。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::UI::Shell::DROPFILES;
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::Foundation::HWND;

    let _guard = crate::clipboard::IgnoreGuard::new();

    unsafe {
        OpenClipboard(HWND(0)).map_err(|e| AppError::Clipboard(format!("打开剪贴板失败：{:?}", e)))?;

        EmptyClipboard().map_err(|e| {
            let _ = CloseClipboard();
            AppError::Clipboard(format!("清空剪贴板失败：{:?}", e))
        })?;

        let mut size = std::mem::size_of::<DROPFILES>();
        size += (path.len() + 1) * 2;
        size += 2;

        let hglobal = GlobalAlloc(GMEM_MOVEABLE, size).map_err(|e| {
            let _ = CloseClipboard();
            AppError::Clipboard(format!("分配内存失败：{:?}", e))
        })?;

        let ptr = GlobalLock(hglobal) as *mut u8;
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err(AppError::Clipboard("锁定内存失败".to_string()));
        }

        let drop_files = ptr as *mut DROPFILES;
        std::ptr::write_bytes(drop_files, 0, 1);
        (*drop_files).pFiles = std::mem::size_of::<DROPFILES>() as u32;
        (*drop_files).pt.x = 0;
        (*drop_files).pt.y = 0;
        (*drop_files).fNC = windows::Win32::Foundation::BOOL(0);
        (*drop_files).fWide = windows::Win32::Foundation::BOOL(1);

        let mut file_ptr = ptr.add(std::mem::size_of::<DROPFILES>()) as *mut u16;
        let wide: Vec<u16> = OsStr::new(&path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        std::ptr::copy_nonoverlapping(wide.as_ptr(), file_ptr, wide.len());
        file_ptr = file_ptr.add(wide.len());
        *file_ptr = 0;

        let _ = GlobalUnlock(hglobal);

        SetClipboardData(
            CF_HDROP.0 as u32,
            windows::Win32::Foundation::HANDLE(hglobal.0 as isize),
        )
        .map_err(|e| {
            let _ = CloseClipboard();
            AppError::Clipboard(format!("设置剪贴板数据失败：{:?}", e))
        })?;

        let _ = CloseClipboard();
        log::info!("文件已复制到剪贴板：{}", path);
        Ok(())
    }
}

/// 非 Windows 平台的占位实现
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn copy_file_to_clipboard(_path: String) -> Result<(), AppError> {
    Err(AppError::Input("文件剪贴板复制仅在 Windows 上支持".to_string()))
}

// ============================================================================
// 打开文件
// ============================================================================

/// 使用系统默认程序打开文件
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    }
    Ok(())
}

// ============================================================================
// 打开文件所在位置
// ============================================================================

/// 在文件管理器中打开文件所在目录并选中该文件
#[tauri::command]
pub async fn open_file_location(path: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    }
    #[cfg(target_os = "linux")]
    {
        // 尝试使用 dbus 选中文件，否则打开父目录
        let parent = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    }
    Ok(())
}

// ============================================================================
// 获取文件图标（仅 Windows）
// ============================================================================

/// 根据文件路径或扩展名获取系统文件图标，返回 base64 PNG
///
/// 如果 `input` 包含路径分隔符或文件实际存在，则尝试获取特定文件的图标。
/// 否则，将其视为扩展名，通过 `SHGFI_USEFILEATTRIBUTES` 获取通用类型图标。
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_USEFILEATTRIBUTES, SHGFI_LARGEICON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, GetSystemMetrics, SM_CXICON};
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Foundation::{HWND, RECT, COLORREF};
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use base64::{Engine as _, engine::general_purpose};

    // 判断是具体文件路径还是扩展名
    let is_path = input.contains('\\') || input.contains('/') || Path::new(&input).exists();

    let wide: Vec<u16> = if is_path {
         OsStr::new(&input)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    } else {
        let dummy = if input.is_empty() {
            "file".to_string()
        } else {
            format!("file.{}", input)
        };
        OsStr::new(&dummy)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };

    unsafe {
        let mut shfi = SHFILEINFOW::default();
        let mut flags = SHGFI_ICON | SHGFI_LARGEICON; // SHGFI_LARGEICON ensures we get 32x32 usually, depending on system settings
        
        // 如果不是具体路径（即纯扩展名查询），或者文件不存在，必须使用 USEFILEATTRIBUTES 伪造查询
        if !is_path {
            flags |= SHGFI_USEFILEATTRIBUTES;
        } else {
            // 如果是路径，检查文件是否存在。如果不存在，fallback to dummy query to avoid failure?
            // 但如果用户传的是 "C:\Fake.txt"，我们可能希望得到 txt 的图标。
            // 对于 .lnk，必须文件存在才能读到特殊图标。如果不存在，SHGetFileInfo 默认会失败。
            // 我们可以尝试不用 USEFILEATTRIBUTES，如果失败（返回0），再退回到 USEFILEATTRIBUTES。
        }

        let mut result = SHGetFileInfoW(
            windows::core::PCWSTR(wide.as_ptr()),
            if is_path { 
                windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0) 
            } else { 
                FILE_ATTRIBUTE_NORMAL 
            },
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );

        // 如果按路径获取失败（例如文件不存在），尝试退回到按扩展名获取通用图标
        if result == 0 && is_path {
             // 提取扩展名
             let path = Path::new(&input);
             if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                 let dummy = format!("file.{}", ext);
                 let wide_dummy: Vec<u16> = OsStr::new(&dummy).encode_wide().chain(std::iter::once(0)).collect();
                 
                 result = SHGetFileInfoW(
                    windows::core::PCWSTR(wide_dummy.as_ptr()),
                    FILE_ATTRIBUTE_NORMAL,
                    Some(&mut shfi),
                    std::mem::size_of::<SHFILEINFOW>() as u32,
                    flags | SHGFI_USEFILEATTRIBUTES,
                );
             }
        }

        if result == 0 || shfi.hIcon.0 == 0 {
            return Ok(None);
        }

        let size: i32 = GetSystemMetrics(SM_CXICON).max(32);
        let pixel_count = (size * size) as usize;

        let hdc_screen = GetDC(HWND(0));
        let hdc_mem = CreateCompatibleDC(hdc_screen);

        let mut bmi_header = BITMAPINFOHEADER::default();
        bmi_header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi_header.biWidth = size;
        bmi_header.biHeight = -size; // top-down
        bmi_header.biPlanes = 1;
        bmi_header.biBitCount = 32;

        let bmi = BITMAPINFO {
            bmiHeader: bmi_header,
            bmiColors: [RGBQUAD::default()],
        };

        let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(
            hdc_mem, &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0,
        );
        if dib.is_err() || bits_ptr.is_null() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(HWND(0), hdc_screen);
            let _ = DestroyIcon(shfi.hIcon);
            return Ok(None);
        }
        let dib = dib.unwrap();
        let old_bmp = SelectObject(hdc_mem, dib);

        let rect = RECT { left: 0, top: 0, right: size, bottom: size };

        // ── Pass 1: 黑色背景 ──
        let black_brush = CreateSolidBrush(COLORREF(0x00000000));
        FillRect(hdc_mem, &rect, black_brush);
        let _ = DeleteObject(black_brush);

        let _ = DrawIconEx(hdc_mem, 0, 0, shfi.hIcon, size, size, 0, HBRUSH::default(), DI_NORMAL);

        let src_b = std::slice::from_raw_parts(bits_ptr as *const u8, pixel_count * 4);
        let pass_black: Vec<u8> = src_b.to_vec(); // BGRA

        // ── Pass 2: 白色背景 ──
        let white_brush = CreateSolidBrush(COLORREF(0x00FFFFFF));
        FillRect(hdc_mem, &rect, white_brush);
        let _ = DeleteObject(white_brush);

        let _ = DrawIconEx(hdc_mem, 0, 0, shfi.hIcon, size, size, 0, HBRUSH::default(), DI_NORMAL);

        let src_w = std::slice::from_raw_parts(bits_ptr as *const u8, pixel_count * 4);
        let pass_white: Vec<u8> = src_w.to_vec(); // BGRA

        // 清理 Win32 资源
        SelectObject(hdc_mem, old_bmp);
        let _ = DeleteObject(dib);
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(HWND(0), hdc_screen);
        let _ = DestroyIcon(shfi.hIcon);

        // ── 合成 RGBA ──
        let mut rgba = vec![0u8; pixel_count * 4];

        for i in 0..pixel_count {
            let off = i * 4;
            // BGRA → 取 BGR
            let b_b = pass_black[off] as i32;
            let b_g = pass_black[off + 1] as i32;
            let b_r = pass_black[off + 2] as i32;

            let w_b = pass_white[off] as i32;
            let w_g = pass_white[off + 1] as i32;
            let w_r = pass_white[off + 2] as i32;

            // alpha = 255 - (white_channel - black_channel)
            // But sometimes (w - b) > 255 or < 0? No, w >= b always SHOULD be true if blending logic holds.
            let diff_r = w_r - b_r;
            let diff_g = w_g - b_g;
            let diff_b = w_b - b_b;
            
            // Theoretically diff_r == diff_g == diff_b. 
            // In practice, use max diff to be closer to opaque.
            let diff = diff_r.max(diff_g).max(diff_b);
            let a = (255 - diff).clamp(0, 255) as u8;

            if a == 0 {
                // Fully transparent
                rgba[off] = 0;
                rgba[off + 1] = 0;
                rgba[off + 2] = 0;
                rgba[off + 3] = 0;
            } else {
                // Reconstruct color: C = C_black / alpha
                // Check specifically for division by zero logic, though a != 0 covers it.
                // Using f32 for precision.
                let af = a as f32 / 255.0; 
                
                // b_channel is premultiplied color: color * alpha
                // so color = b_channel / alpha
                let r = ((b_r as f32) / af).round().min(255.0) as u8;
                let g = ((b_g as f32) / af).round().min(255.0) as u8;
                let b = ((b_b as f32) / af).round().min(255.0) as u8;

                rgba[off] = r;
                rgba[off + 1] = g;
                rgba[off + 2] = b;
                rgba[off + 3] = a;
            }
        }

        // 编码为 PNG
        let img = image::RgbaImage::from_raw(size as u32, size as u32, rgba)
            .ok_or_else(|| AppError::Input("创建图标缓冲区失败".to_string()))?;

        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageOutputFormat::Png)
            .map_err(|e| AppError::Input(format!("编码图标 PNG 失败: {}", e)))?;

        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        Ok(Some(format!("data:image/png;base64,{}", b64)))
    }
}

/// 非 Windows 平台返回 None（前端回退到默认图标）
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn get_file_icon(_extension: String) -> Result<Option<String>, AppError> {
    Ok(None)
}