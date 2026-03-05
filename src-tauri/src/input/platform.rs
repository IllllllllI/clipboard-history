//! 平台相关实现
//!
//! - **Windows**: Win32 Shell / GDI / Clipboard API 封装
//! - **非 Windows**: 占位桩实现（返回 `Err` 或 `None`）
//!
//! ## 设计要点
//!
//! - 所有 Win32 资源使用 RAII Guard 自动释放，消除手动 cleanup 的泄漏风险
//! - 图标缓存使用 O(1) LRU（`lru` crate），容量上限 256 条
//! - 缓存同时覆盖 `Some` / `None` 结果，避免对不存在图标的重复 I/O
//! - 画刷创建/销毁封装为 `fill_rect_color` 辅助函数，消除重复模式

use crate::error::AppError;

// ═══════════════════════════════════════════════════════════
//  Windows — 通用工具
// ═══════════════════════════════════════════════════════════

/// 将 UTF-8 字符串转换为 null 终止的 UTF-16 宽字符数组（Win32 API 所需格式）。
#[cfg(target_os = "windows")]
fn to_wide(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// 日志中对路径做隐私脱敏（release 只保留文件名）。
#[cfg(target_os = "windows")]
fn log_path(path: &str) -> String {
    if cfg!(debug_assertions) {
        path.to_string()
    } else {
        std::path::Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| format!("<basename:{}>", n))
            .unwrap_or_else(|| "<basename:unknown>".to_string())
    }
}

// ═══════════════════════════════════════════════════════════
//  Windows — RAII Guards
//
//  保证 Win32 资源在任何退出路径（包括提前 return、`?` 传播）
//  下都能被正确释放，消除手动 cleanup 的泄漏风险。
// ═══════════════════════════════════════════════════════════

// ---------- COM ----------

/// COM STA apartment guard — 仅当本次成功初始化时在 drop 中调用 `CoUninitialize`。
///
/// 如果当前线程已以其它模式初始化（`RPC_E_CHANGED_MODE`），不做反初始化。
#[cfg(target_os = "windows")]
struct ComGuard(bool);

#[cfg(target_os = "windows")]
impl ComGuard {
    fn init_sta() -> Result<Self, AppError> {
        use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};

        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if hr.is_ok() {
            Ok(Self(true))
        } else if hr == RPC_E_CHANGED_MODE {
            Ok(Self(false))
        } else {
            Err(AppError::Input(format!("COM 初始化失败: {:?}", hr)))
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { windows::Win32::System::Com::CoUninitialize() };
        }
    }
}

// ---------- PIDL ----------

/// Shell PIDL 内存 guard — drop 时通过 `CoTaskMemFree` 释放。
#[cfg(target_os = "windows")]
struct PidlGuard(*mut windows::Win32::UI::Shell::Common::ITEMIDLIST);

#[cfg(target_os = "windows")]
impl PidlGuard {
    const fn null() -> Self {
        Self(std::ptr::null_mut())
    }
    fn is_null(&self) -> bool {
        self.0.is_null()
    }
    fn as_const_ptr(&self) -> *const windows::Win32::UI::Shell::Common::ITEMIDLIST {
        self.0 as *const _
    }
}

#[cfg(target_os = "windows")]
impl Drop for PidlGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows::Win32::System::Com::CoTaskMemFree(Some(
                    self.0 as *const std::ffi::c_void,
                ));
            }
        }
    }
}

// ---------- Clipboard ----------

/// 剪贴板会话 guard — drop 时自动调用 `CloseClipboard`。
///
/// 保证即使 `EmptyClipboard` / `SetClipboardData` 失败也不会遗忘关闭。
#[cfg(target_os = "windows")]
struct ClipboardSession;

#[cfg(target_os = "windows")]
impl ClipboardSession {
    fn open() -> Result<Self, AppError> {
        unsafe {
            windows::Win32::System::DataExchange::OpenClipboard(None)
                .map_err(|e| AppError::Clipboard(format!("打开剪贴板失败: {:?}", e)))?;
        }
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardSession {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::DataExchange::CloseClipboard();
        }
    }
}

// ---------- GDI ----------

/// Screen DC guard — drop 时调用 `ReleaseDC(None, hdc)`。
#[cfg(target_os = "windows")]
struct ScreenDcGuard(windows::Win32::Graphics::Gdi::HDC);

#[cfg(target_os = "windows")]
impl Drop for ScreenDcGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::Graphics::Gdi::ReleaseDC(None, self.0);
        }
    }
}

/// Memory DC guard — drop 时调用 `DeleteDC`。
#[cfg(target_os = "windows")]
struct MemDcGuard(windows::Win32::Graphics::Gdi::HDC);

#[cfg(target_os = "windows")]
impl Drop for MemDcGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Graphics::Gdi::DeleteDC(self.0);
        }
    }
}

/// GDI Bitmap guard — drop 时调用 `DeleteObject`。
#[cfg(target_os = "windows")]
struct BitmapGuard(windows::Win32::Graphics::Gdi::HBITMAP);

#[cfg(target_os = "windows")]
impl Drop for BitmapGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Graphics::Gdi::DeleteObject(self.0.into());
        }
    }
}

/// SelectObject 还原 guard — drop 时恢复原先选入的 GDI 对象。
///
/// **声明顺序**：必须在 `BitmapGuard` 之后声明，
/// 确保 drop 时先恢复原对象再删除自定义位图。
#[cfg(target_os = "windows")]
struct SelectionGuard {
    dc: windows::Win32::Graphics::Gdi::HDC,
    old: windows::Win32::Graphics::Gdi::HGDIOBJ,
}

#[cfg(target_os = "windows")]
impl Drop for SelectionGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::Graphics::Gdi::SelectObject(self.dc, self.old);
        }
    }
}

// ---------- Icon ----------

/// HICON guard — drop 时调用 `DestroyIcon`。
#[cfg(target_os = "windows")]
struct IconGuard(windows::Win32::UI::WindowsAndMessaging::HICON);

#[cfg(target_os = "windows")]
impl Drop for IconGuard {
    fn drop(&mut self) {
        if !(self.0).0.is_null() {
            unsafe {
                let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(self.0);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════
//  Windows — 图标缓存（O(1) LRU）
// ═══════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
use once_cell::sync::Lazy;
#[cfg(target_os = "windows")]
use std::sync::Mutex;

/// 图标缓存容量上限。超出后按 LRU 策略淘汰最久未访问的条目。
#[cfg(target_os = "windows")]
const ICON_CACHE_CAPACITY: usize = 256;

/// 全局图标缓存。
///
/// - Key: 小写化的输入（路径或扩展名），消除 Windows 大小写不敏感的重复项。
/// - Value: `Some(data_uri)` 表示成功提取的图标，`None` 表示无图标可提取。
///   缓存 `None` 避免对同一输入的重复 GDI + PNG + I/O 开销。
#[cfg(target_os = "windows")]
static FILE_ICON_CACHE: Lazy<Mutex<lru::LruCache<String, Option<String>>>> = Lazy::new(|| {
    Mutex::new(lru::LruCache::new(
        std::num::NonZeroUsize::new(ICON_CACHE_CAPACITY).unwrap(),
    ))
});

// ═══════════════════════════════════════════════════════════
//  文件操作（跨平台）
// ═══════════════════════════════════════════════════════════

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
            log_path(path),
            result.0 as isize
        );
        return Err(AppError::Input(format!(
            "打开文件失败: ShellExecuteW 返回 {}",
            result.0 as isize
        )));
    }

    log::debug!("open_file 成功: {}", log_path(path));
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn open_file(path: &str) -> Result<(), AppError> {
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn open_file(path: &str) -> Result<(), AppError> {
    std::process::Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn open_file_location(path: &str) -> Result<(), AppError> {
    use std::path::Path;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::{
        Common::ITEMIDLIST, ILFindLastID, SHOpenFolderAndSelectItems, SHParseDisplayName,
    };

    let path_obj = Path::new(path);
    let parent = match path_obj.parent().and_then(|p| p.to_str()) {
        Some(p) => p,
        None => {
            log::debug!(
                "open_file_location: 无法解析父目录，走 fallback: {}",
                log_path(path)
            );
            return open_file_location_fallback(path);
        }
    };

    let parent_wide = to_wide(parent);
    let file_wide = to_wide(path);

    // RAII guards 保证 COM 资源和 PIDL 内存在任何退出路径下都能释放
    let _com = ComGuard::init_sta()?;
    let mut folder_pidl = PidlGuard::null();
    let mut item_pidl = PidlGuard::null();

    unsafe {
        let parse_folder = SHParseDisplayName(
            PCWSTR(parent_wide.as_ptr()),
            None,
            &mut folder_pidl.0,
            0,
            None,
        );

        let parse_item = SHParseDisplayName(
            PCWSTR(file_wide.as_ptr()),
            None,
            &mut item_pidl.0,
            0,
            None,
        );

        let select_result = if parse_folder.is_ok()
            && parse_item.is_ok()
            && !folder_pidl.is_null()
            && !item_pidl.is_null()
        {
            let child = ILFindLastID(item_pidl.as_const_ptr()) as *const ITEMIDLIST;
            if child.is_null() {
                Err(windows::core::Error::empty())
            } else {
                let children = [child];
                SHOpenFolderAndSelectItems(folder_pidl.as_const_ptr(), Some(&children), 0)
            }
        } else {
            Err(windows::core::Error::empty())
        };

        // Guards 自动释放 PIDLs 和 CoUninitialize

        match select_result {
            Ok(()) => {
                log::debug!(
                    "open_file_location: SHOpenFolderAndSelectItems 成功: {}",
                    log_path(path)
                );
                Ok(())
            }
            Err(e) => {
                log::debug!(
                    "open_file_location: SHOpenFolderAndSelectItems 失败，回退 explorer /select: {} ({})",
                    log_path(path),
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
            log_path(path),
            result.0 as isize
        );
        return Err(AppError::Input(format!(
            "打开文件位置失败: ShellExecuteW 返回 {}",
            result.0 as isize
        )));
    }

    log::debug!(
        "open_file_location fallback 成功: {}",
        log_path(path)
    );
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn open_file_location(path: &str) -> Result<(), AppError> {
    std::process::Command::new("open")
        .args(["-R", path])
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn open_file_location(path: &str) -> Result<(), AppError> {
    let parent = std::path::Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    std::process::Command::new("xdg-open")
        .arg(&parent)
        .spawn()
        .map_err(|e| AppError::Input(format!("打开文件位置失败: {}", e)))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════
//  剪贴板操作
// ═══════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
pub fn copy_file_to_clipboard(path: String) -> Result<(), AppError> {
    copy_files_to_clipboard(vec![path])
}

#[cfg(not(target_os = "windows"))]
pub fn copy_file_to_clipboard(_path: String) -> Result<(), AppError> {
    Err(AppError::Input(
        "文件剪贴板复制仅在 Windows 上支持".to_string(),
    ))
}

#[cfg(target_os = "windows")]
pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), AppError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::GlobalFree;
    use windows::Win32::System::DataExchange::{EmptyClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::DROPFILES;

    if paths.is_empty() {
        return Err(AppError::Clipboard("没有可复制的文件路径".to_string()));
    }

    let encoded_paths: Vec<Vec<u16>> = paths
        .iter()
        .map(|p| {
            OsStr::new(p)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        })
        .collect();

    let _ignore = crate::clipboard::IgnoreGuard::new();

    // ClipboardSession guard 保证 CloseClipboard 一定会被调用
    let _session = ClipboardSession::open()?;

    unsafe {
        EmptyClipboard()
            .map_err(|e| AppError::Clipboard(format!("清空剪贴板失败: {:?}", e)))?;

        // 计算 DROPFILES + 所有路径（含 null 终止符）+ 双 null 终止符
        let size = std::mem::size_of::<DROPFILES>()
            + encoded_paths
                .iter()
                .map(|w| w.len() * std::mem::size_of::<u16>())
                .sum::<usize>()
            + std::mem::size_of::<u16>();

        let hglobal = GlobalAlloc(GMEM_MOVEABLE, size)
            .map_err(|e| AppError::Clipboard(format!("分配内存失败: {:?}", e)))?;

        let ptr = GlobalLock(hglobal) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(Some(hglobal));
            log::warn!(
                "copy_files_to_clipboard 失败: 锁定内存失败 (count={})",
                paths.len()
            );
            return Err(AppError::Clipboard("锁定内存失败".to_string()));
        }

        // 填充 DROPFILES 头
        let drop_files = ptr as *mut DROPFILES;
        std::ptr::write_bytes(drop_files, 0, 1);
        (*drop_files).pFiles = std::mem::size_of::<DROPFILES>() as u32;
        (*drop_files).fWide = true.into();

        // 写入文件路径（每个 null 终止，末尾额外 null）
        let mut cur = ptr.add(std::mem::size_of::<DROPFILES>()) as *mut u16;
        for wide in &encoded_paths {
            std::ptr::copy_nonoverlapping(wide.as_ptr(), cur, wide.len());
            cur = cur.add(wide.len());
        }
        *cur = 0;

        let _ = GlobalUnlock(hglobal);

        if let Err(e) = SetClipboardData(
            CF_HDROP.0 as u32,
            Some(windows::Win32::Foundation::HANDLE(hglobal.0)),
        ) {
            // SetClipboardData 失败时手动释放内存
            // 成功时系统接管 hglobal 所有权，不可再释放
            let _ = GlobalFree(Some(hglobal));
            let first = paths.first().map(String::as_str).unwrap_or("");
            log::warn!(
                "copy_files_to_clipboard 失败: SetClipboardData (count={}, first={})",
                paths.len(),
                log_path(first)
            );
            return Err(AppError::Clipboard(format!(
                "设置剪贴板数据失败: {:?}",
                e
            )));
        }

        log::info!("文件已复制到剪贴板: {} 个", paths.len());
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn copy_files_to_clipboard(_paths: Vec<String>) -> Result<(), AppError> {
    Err(AppError::Input(
        "文件剪贴板复制仅在 Windows 上支持".to_string(),
    ))
}

// ═══════════════════════════════════════════════════════════
//  Windows — 图标提取
// ═══════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
pub async fn get_file_icon(input: String) -> Result<Option<String>, AppError> {
    let cache_key = input.to_lowercase();

    // O(1) LRU 缓存查询
    if let Ok(mut cache) = FILE_ICON_CACHE.lock() {
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    let key = cache_key.clone();
    let icon = tokio::task::spawn_blocking(move || get_file_icon_blocking(&input))
        .await
        .map_err(|e| AppError::Input(format!("图标任务执行失败: {}", e)))??;

    // 缓存 Some 和 None，避免对不存在图标的重复 GDI + PNG 开销
    if let Ok(mut cache) = FILE_ICON_CACHE.lock() {
        cache.put(key, icon.clone());
    }

    Ok(icon)
}

#[cfg(not(target_os = "windows"))]
pub async fn get_file_icon(_input: String) -> Result<Option<String>, AppError> {
    Ok(None)
}

/// 阻塞式图标提取（在 `spawn_blocking` 中调用）。
///
/// 使用 Win32 双通道渲染法恢复图标 alpha 通道：
/// 1. 黑底绘制 → 获取 premultiplied RGB
/// 2. 白底绘制 → 通过差值计算 alpha
/// 3. 反 premultiply 得到真实 RGBA
///
/// 所有 GDI 资源通过 RAII guards 自动释放。
#[cfg(target_os = "windows")]
fn get_file_icon_blocking(input: &str) -> Result<Option<String>, AppError> {
    use base64::{engine::general_purpose, Engine as _};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::UI::Shell::{
        SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGFI_USEFILEATTRIBUTES,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        DrawIconEx, GetSystemMetrics, DI_NORMAL, SM_CXICON,
    };

    // ── 1. 确定输入类型（路径 vs 扩展名） ──

    let is_path = input.contains('\\') || input.contains('/') || Path::new(input).exists();

    let wide: Vec<u16> = if is_path {
        OsStr::new(input)
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
        // ── 2. SHGetFileInfo 获取 HICON ──

        let mut shfi = SHFILEINFOW::default();
        let mut flags = SHGFI_ICON | SHGFI_LARGEICON;
        if !is_path {
            flags |= SHGFI_USEFILEATTRIBUTES;
        }

        let attrs = if is_path {
            windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES(0)
        } else {
            FILE_ATTRIBUTE_NORMAL
        };

        let mut result = SHGetFileInfoW(
            windows::core::PCWSTR(wide.as_ptr()),
            attrs,
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );

        // Fallback: 路径查询失败时按扩展名重试
        if result == 0 && is_path {
            if let Some(ext) = Path::new(input).extension().and_then(|e| e.to_str()) {
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

        if result == 0 || (shfi.hIcon).0.is_null() {
            return Ok(None);
        }

        // RAII: 图标会在函数退出时自动销毁
        let _icon = IconGuard(shfi.hIcon);

        // ── 3. 准备 GDI 上下文 ──

        let size: i32 = GetSystemMetrics(SM_CXICON).max(32);
        let pixel_count = (size * size) as usize;
        let buf_bytes = pixel_count * 4;

        // RAII 声明顺序决定 drop 顺序（后声明先 drop）：
        //   _sel → _dib → _mem_dc → _screen_dc → _icon
        let _screen_dc = ScreenDcGuard(GetDC(None));
        let _mem_dc = MemDcGuard(CreateCompatibleDC(Some(_screen_dc.0)));

        let mut bmi_header = BITMAPINFOHEADER::default();
        bmi_header.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi_header.biWidth = size;
        bmi_header.biHeight = -size; // top-down DIB
        bmi_header.biPlanes = 1;
        bmi_header.biBitCount = 32;

        let bmi = BITMAPINFO {
            bmiHeader: bmi_header,
            bmiColors: [RGBQUAD::default()],
        };

        let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
        let dib =
            CreateDIBSection(Some(_mem_dc.0), &bmi, DIB_RGB_COLORS, &mut bits_ptr, None, 0);

        if dib.is_err() || bits_ptr.is_null() {
            // Guards 自动释放 _mem_dc, _screen_dc, _icon
            return Ok(None);
        }
        let dib = dib.unwrap();

        // BitmapGuard 在 SelectionGuard 之前声明 → 后于 SelectionGuard drop
        // 保证先恢复原 GDI 对象，再删除位图
        let _dib = BitmapGuard(dib);
        let _sel = SelectionGuard {
            dc: _mem_dc.0,
            old: SelectObject(_mem_dc.0, dib.into()),
        };

        let rect = RECT {
            left: 0,
            top: 0,
            right: size,
            bottom: size,
        };

        // ── 4. 双通道 alpha 恢复 ──

        // Pass 1: 黑底渲染
        fill_rect_color(_mem_dc.0, &rect, 0x0000_0000);
        let _ = DrawIconEx(
            _mem_dc.0, 0, 0, shfi.hIcon, size, size,
            0, Some(HBRUSH::default()), DI_NORMAL,
        );
        // 必须复制到 Vec——Pass 2 会覆盖同一个 bits_ptr 缓冲区
        let pass_black: Vec<u8> =
            std::slice::from_raw_parts(bits_ptr as *const u8, buf_bytes).to_vec();

        // Pass 2: 白底渲染
        fill_rect_color(_mem_dc.0, &rect, 0x00FF_FFFF);
        let _ = DrawIconEx(
            _mem_dc.0, 0, 0, shfi.hIcon, size, size,
            0, Some(HBRUSH::default()), DI_NORMAL,
        );
        // 直接借用切片，无需复制——此后不再写入 bits_ptr
        let pass_white = std::slice::from_raw_parts(bits_ptr as *const u8, buf_bytes);

        // 从 BGRA（GDI 字节序）重建 RGBA
        let mut rgba = vec![0u8; buf_bytes];
        for i in 0..pixel_count {
            let off = i * 4;
            // GDI BGRA → 提取 R/G/B 分量
            let (b_r, b_g, b_b) = (
                pass_black[off + 2] as i32,
                pass_black[off + 1] as i32,
                pass_black[off] as i32,
            );
            let (w_r, w_g, w_b) = (
                pass_white[off + 2] as i32,
                pass_white[off + 1] as i32,
                pass_white[off] as i32,
            );

            // alpha = 255 - max(diff_r, diff_g, diff_b)
            let diff = (w_r - b_r).max(w_g - b_g).max(w_b - b_b);
            let a = (255 - diff).clamp(0, 255) as u8;

            if a > 0 {
                // 反 premultiply: color = premultiplied / (alpha / 255)
                let af = a as f32 / 255.0;
                rgba[off]     = ((b_r as f32) / af).round().min(255.0) as u8;
                rgba[off + 1] = ((b_g as f32) / af).round().min(255.0) as u8;
                rgba[off + 2] = ((b_b as f32) / af).round().min(255.0) as u8;
                rgba[off + 3] = a;
            }
            // a == 0 → 已由 vec![0u8; ..] 初始化为全透明
        }

        // ── 5. PNG 编码 + Base64 ──

        let img = image::RgbaImage::from_raw(size as u32, size as u32, rgba)
            .ok_or_else(|| AppError::Input("创建图标缓冲区失败".to_string()))?;

        // 预分配 4KB（32x32 图标 PNG 一般 1-3KB）
        let mut buf = std::io::Cursor::new(Vec::with_capacity(4096));
        img.write_to(&mut buf, image::ImageFormat::Png)
            .map_err(|e| AppError::Input(format!("编码图标 PNG 失败: {}", e)))?;

        let b64 = general_purpose::STANDARD.encode(buf.into_inner());
        Ok(Some(format!("data:image/png;base64,{}", b64)))
    }
}

/// 用指定纯色填充矩形，立即销毁画刷。
#[cfg(target_os = "windows")]
unsafe fn fill_rect_color(
    dc: windows::Win32::Graphics::Gdi::HDC,
    rect: &windows::Win32::Foundation::RECT,
    color: u32,
) {
    use windows::Win32::Foundation::COLORREF;
    use windows::Win32::Graphics::Gdi::{CreateSolidBrush, DeleteObject, FillRect};

    unsafe {
        let brush = CreateSolidBrush(COLORREF(color));
        FillRect(dc, rect, brush);
        let _ = DeleteObject(brush.into());
    }
}
