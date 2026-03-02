use crate::error::AppError;

#[cfg(target_os = "windows")]
use once_cell::sync::Lazy;
#[cfg(target_os = "windows")]
use std::collections::{HashMap, VecDeque};
#[cfg(target_os = "windows")]
use std::sync::Mutex;

#[cfg(target_os = "windows")]
fn to_wide(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
fn format_sensitive_path_for_log(path: &str) -> String {
    if cfg!(debug_assertions) {
        path.to_string()
    } else {
        std::path::Path::new(path)
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| format!("<basename:{}>", name))
            .unwrap_or_else(|| "<basename:unknown>".to_string())
    }
}

#[cfg(target_os = "windows")]
const ICON_CACHE_MAX_ENTRIES: usize = 256;

#[cfg(target_os = "windows")]
struct IconCache {
    map: HashMap<String, Option<String>>,
    order: VecDeque<String>,
}

#[cfg(target_os = "windows")]
impl IconCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&mut self, key: &str) -> Option<Option<String>> {
        let value = self.map.get(key).cloned()?;
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            self.order.remove(pos);
        }
        self.order.push_back(key.to_string());
        Some(value)
    }

    fn put(&mut self, key: String, value: Option<String>) {
        if self.map.contains_key(&key) {
            if let Some(pos) = self.order.iter().position(|k| k == &key) {
                self.order.remove(pos);
            }
        }

        self.map.insert(key.clone(), value);
        self.order.push_back(key);

        while self.map.len() > ICON_CACHE_MAX_ENTRIES {
            if let Some(oldest) = self.order.pop_front() {
                self.map.remove(&oldest);
            } else {
                break;
            }
        }
    }
}

#[cfg(target_os = "windows")]
static FILE_ICON_CACHE: Lazy<Mutex<IconCache>> = Lazy::new(|| Mutex::new(IconCache::new()));

#[cfg(target_os = "windows")]
pub fn open_file(path: &str) -> Result<(), AppError> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let op = to_wide("open");
    let path_wide = to_wide(path);

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(path_wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if result.0 as isize <= 32 {
        log::warn!(
            "open_file 失败: {} (ShellExecuteW={})",
            format_sensitive_path_for_log(path),
            result.0 as isize
        );
        return Err(AppError::Input(format!(
            "打开文件失败: ShellExecuteW 返回 {}",
            result.0 as isize
        )));
    }

    log::debug!("open_file 成功: {}", format_sensitive_path_for_log(path));

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn open_file_location(path: &str) -> Result<(), AppError> {
    use std::path::Path;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::{
        Common::ITEMIDLIST, ILFindLastID, SHOpenFolderAndSelectItems, SHParseDisplayName,
    };

    let path_obj = Path::new(path);
    let parent = match path_obj.parent().and_then(|p| p.to_str()) {
        Some(p) => p,
        None => {
            log::debug!(
                "open_file_location: 无法解析父目录，走 fallback: {}",
                format_sensitive_path_for_log(path)
            );
            return open_file_location_fallback(path);
        }
    };

    let parent_wide = to_wide(parent);
    let file_wide = to_wide(path);

    let mut folder_pidl: *mut ITEMIDLIST = std::ptr::null_mut();
    let mut item_pidl: *mut ITEMIDLIST = std::ptr::null_mut();

    let mut need_uninit = false;

    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        if hr.is_ok() {
            need_uninit = true;
        } else if hr != RPC_E_CHANGED_MODE {
            return Err(AppError::Input(format!("初始化 COM 失败: {:?}", hr)));
        }

        let parse_folder = SHParseDisplayName(
            PCWSTR(parent_wide.as_ptr()),
            None,
            &mut folder_pidl,
            0,
            None,
        );

        let parse_item = SHParseDisplayName(
            PCWSTR(file_wide.as_ptr()),
            None,
            &mut item_pidl,
            0,
            None,
        );

        let select_result = if parse_folder.is_ok() && parse_item.is_ok() && !folder_pidl.is_null() && !item_pidl.is_null() {
            let child = ILFindLastID(item_pidl as *const ITEMIDLIST) as *const ITEMIDLIST;
            if child.is_null() {
                Err(windows::core::Error::empty())
            } else {
                let children = [child];
                SHOpenFolderAndSelectItems(folder_pidl as *const ITEMIDLIST, Some(&children), 0)
            }
        } else {
            Err(windows::core::Error::empty())
        };

        if !folder_pidl.is_null() {
            CoTaskMemFree(Some(folder_pidl as *const std::ffi::c_void));
        }
        if !item_pidl.is_null() {
            CoTaskMemFree(Some(item_pidl as *const std::ffi::c_void));
        }
        if need_uninit {
            CoUninitialize();
        }

        match select_result {
            Ok(()) => {
                log::debug!(
                    "open_file_location: SHOpenFolderAndSelectItems 成功: {}",
                    format_sensitive_path_for_log(path)
                );
                Ok(())
            }
            Err(e) => {
                log::debug!(
                    "open_file_location: SHOpenFolderAndSelectItems 失败，回退 explorer /select: {} ({})",
                    format_sensitive_path_for_log(path),
                    e
                );
                open_file_location_fallback(path)
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn open_file_location_fallback(path: &str) -> Result<(), AppError> {
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let explorer = to_wide("explorer.exe");
    let params = to_wide(&format!("/select,\"{}\"", path));

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR::null(),
            PCWSTR(explorer.as_ptr()),
            PCWSTR(params.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    if result.0 as isize <= 32 {
        log::warn!(
            "open_file_location fallback 失败: {} (ShellExecuteW={})",
            format_sensitive_path_for_log(path),
            result.0 as isize
        );
        return Err(AppError::Input(format!(
            "打开文件位置失败: ShellExecuteW 返回 {}",
            result.0 as isize
        )));
    }

    log::debug!(
        "open_file_location fallback 成功: {}",
        format_sensitive_path_for_log(path)
    );

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    copy_files_to_clipboard(vec![path])
}

#[cfg(not(target_os = "windows"))]
pub fn copy_file_to_clipboard(_path: String) -> Result<(), AppError> {
    Err(AppError::Input("文件剪贴板复制仅在 Windows 上支持".to_string()))
}

#[cfg(target_os = "windows")]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), AppError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::GlobalFree;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::DROPFILES;

    if paths.is_empty() {
        return Err(AppError::Clipboard("没有可复制的文件路径".to_string()));
    }

    let encoded_paths: Vec<Vec<u16>> = paths
        .iter()
        .map(|path| {
            OsStr::new(path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect::<Vec<u16>>()
        })
        .collect();

    let _guard = crate::clipboard::IgnoreGuard::new();

    unsafe {
        OpenClipboard(None).map_err(|e| AppError::Clipboard(format!("打开剪贴板失败：{:?}", e)))?;

        EmptyClipboard().map_err(|e| {
            let _ = CloseClipboard();
            AppError::Clipboard(format!("清空剪贴板失败：{:?}", e))
        })?;

        let mut size = std::mem::size_of::<DROPFILES>();
        size += encoded_paths
            .iter()
            .map(|wide| wide.len() * std::mem::size_of::<u16>())
            .sum::<usize>();
        size += std::mem::size_of::<u16>();

        let hglobal = GlobalAlloc(GMEM_MOVEABLE, size).map_err(|e| {
            let _ = CloseClipboard();
            AppError::Clipboard(format!("分配内存失败：{:?}", e))
        })?;

        let ptr = GlobalLock(hglobal) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(Some(hglobal));
            let _ = CloseClipboard();
            log::warn!(
                "copy_files_to_clipboard 失败: 锁定内存失败 (count={})",
                paths.len()
            );
            return Err(AppError::Clipboard("锁定内存失败".to_string()));
        }

        let drop_files = ptr as *mut DROPFILES;
        std::ptr::write_bytes(drop_files, 0, 1);
        (*drop_files).pFiles = std::mem::size_of::<DROPFILES>() as u32;
        (*drop_files).pt.x = 0;
        (*drop_files).pt.y = 0;
        (*drop_files).fNC = false.into();
        (*drop_files).fWide = true.into();

        let mut file_ptr = ptr.add(std::mem::size_of::<DROPFILES>()) as *mut u16;
        for wide in &encoded_paths {
            std::ptr::copy_nonoverlapping(wide.as_ptr(), file_ptr, wide.len());
            file_ptr = file_ptr.add(wide.len());
        }
        *file_ptr = 0;

        let _ = GlobalUnlock(hglobal);

        if let Err(e) = SetClipboardData(
            CF_HDROP.0 as u32,
            Some(windows::Win32::Foundation::HANDLE(hglobal.0)),
        ) {
            let _ = GlobalFree(Some(hglobal));
            let _ = CloseClipboard();
            let first_path = paths.first().map(String::as_str).unwrap_or("");
            log::warn!(
                "copy_files_to_clipboard 失败: SetClipboardData (count={}, first={})",
                paths.len(),
                format_sensitive_path_for_log(first_path)
            );
            return Err(AppError::Clipboard(format!("设置剪贴板数据失败：{:?}", e)));
        }

        let _ = CloseClipboard();
        log::info!("文件已复制到剪贴板：{} 个", paths.len());
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_paths: Vec<String>) -> Result<(), AppError> {
    Err(AppError::Input("文件剪贴板复制仅在 Windows 上支持".to_string()))
}

#[cfg(target_os = "windows")]
pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    let cache_key = input.to_lowercase();

    if let Ok(mut cache) = FILE_ICON_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached);
        }
    }

    let icon = tokio::task::spawn_blocking(move || get_file_icon_blocking(input))
        .await
        .map_err(|e| AppError::Input(format!("图标任务执行失败: {}", e)))??;

    if let Ok(mut cache) = FILE_ICON_CACHE.lock() {
        cache.put(cache_key, icon.clone());
    }

    Ok(icon)
}

#[cfg(not(target_os = "windows"))]
pub async fn get_file_icon(_input: String) -> Result<Option<String>, AppError> {
    Ok(None)
}

#[cfg(target_os = "windows")]
fn get_file_icon_blocking(input: String) -> Result<Option<String>, AppError> {
    use base64::{engine::general_purpose, Engine as _};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows::Win32::Foundation::{COLORREF, RECT};
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_USEFILEATTRIBUTES,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DestroyIcon, DrawIconEx, GetSystemMetrics, DI_NORMAL, SM_CXICON,
    };

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
        let mut flags = SHGFI_ICON | SHGFI_LARGEICON;

        if !is_path {
            flags |= SHGFI_USEFILEATTRIBUTES;
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

        if result == 0 && is_path {
            let path = Path::new(&input);
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let dummy = format!("file.{}", ext);
                let wide_dummy: Vec<u16> = OsStr::new(&dummy)
                    .encode_wide()
                    .chain(std::iter::once(0))
                    .collect();

                result = SHGetFileInfoW(
                    windows::core::PCWSTR(wide_dummy.as_ptr()),
                    FILE_ATTRIBUTE_NORMAL,
                    Some(&mut shfi),
                    std::mem::size_of::<SHFILEINFOW>() as u32,
                    flags | SHGFI_USEFILEATTRIBUTES,
                );
            }
        }

        if result == 0 || shfi.hIcon.0.is_null() {
            return Ok(None);
        }

        let size: i32 = GetSystemMetrics(SM_CXICON).max(32);
        let pixel_count = (size * size) as usize;

        let hdc_screen = GetDC(None);
        let hdc_mem = CreateCompatibleDC(Some(hdc_screen));

        let mut bmi_header = BITMAPINFOHEADER::default();
        bmi_header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi_header.biWidth = size;
        bmi_header.biHeight = -size;
        bmi_header.biPlanes = 1;
        bmi_header.biBitCount = 32;

        let bmi = BITMAPINFO {
            bmiHeader: bmi_header,
            bmiColors: [RGBQUAD::default()],
        };

        let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(Some(hdc_mem), &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0);
        if dib.is_err() || bits_ptr.is_null() {
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);
            let _ = DestroyIcon(shfi.hIcon);
            return Ok(None);
        }
        let dib = dib.unwrap();
        let old_bmp = SelectObject(hdc_mem, dib.into());

        let rect = RECT {
            left: 0,
            top: 0,
            right: size,
            bottom: size,
        };

        let black_brush = CreateSolidBrush(COLORREF(0x00000000));
        FillRect(hdc_mem, &rect, black_brush);
        let _ = DeleteObject(black_brush.into());

        let _ = DrawIconEx(
            hdc_mem,
            0,
            0,
            shfi.hIcon,
            size,
            size,
            0,
            Some(HBRUSH::default()),
            DI_NORMAL,
        );

        let src_b = std::slice::from_raw_parts(bits_ptr as *const u8, pixel_count * 4);
        let pass_black: Vec<u8> = src_b.to_vec();

        let white_brush = CreateSolidBrush(COLORREF(0x00FFFFFF));
        FillRect(hdc_mem, &rect, white_brush);
        let _ = DeleteObject(white_brush.into());

        let _ = DrawIconEx(
            hdc_mem,
            0,
            0,
            shfi.hIcon,
            size,
            size,
            0,
            Some(HBRUSH::default()),
            DI_NORMAL,
        );

        let src_w = std::slice::from_raw_parts(bits_ptr as *const u8, pixel_count * 4);
        let pass_white: Vec<u8> = src_w.to_vec();

        SelectObject(hdc_mem, old_bmp);
        let _ = DeleteObject(dib.into());
        let _ = DeleteDC(hdc_mem);
        let _ = ReleaseDC(None, hdc_screen);
        let _ = DestroyIcon(shfi.hIcon);

        let mut rgba = vec![0u8; pixel_count * 4];

        for i in 0..pixel_count {
            let off = i * 4;
            let b_b = pass_black[off] as i32;
            let b_g = pass_black[off + 1] as i32;
            let b_r = pass_black[off + 2] as i32;

            let w_b = pass_white[off] as i32;
            let w_g = pass_white[off + 1] as i32;
            let w_r = pass_white[off + 2] as i32;

            let diff_r = w_r - b_r;
            let diff_g = w_g - b_g;
            let diff_b = w_b - b_b;

            let diff = diff_r.max(diff_g).max(diff_b);
            let a = (255 - diff).clamp(0, 255) as u8;

            if a == 0 {
                rgba[off] = 0;
                rgba[off + 1] = 0;
                rgba[off + 2] = 0;
                rgba[off + 3] = 0;
            } else {
                let af = a as f32 / 255.0;

                let r = ((b_r as f32) / af).round().min(255.0) as u8;
                let g = ((b_g as f32) / af).round().min(255.0) as u8;
                let b = ((b_b as f32) / af).round().min(255.0) as u8;

                rgba[off] = r;
                rgba[off + 1] = g;
                rgba[off + 2] = b;
                rgba[off + 3] = a;
            }
        }

        let img = image::RgbaImage::from_raw(size as u32, size as u32, rgba)
            .ok_or_else(|| AppError::Input("创建图标缓冲区失败".to_string()))?;

        let mut buf = std::io::Cursor::new(Vec::new());
        img.write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| AppError::Input(format!("编码图标 PNG 失败: {}", e)))?;

        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        Ok(Some(format!("data:image/png;base64,{}", b64)))
    }
}
