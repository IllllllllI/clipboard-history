//! # 剪贴板写入模块
//!
//! ## 设计思路
//!
//! 将与操作系统剪贴板交互的逻辑独立出来，便于隔离平台不稳定因素。
//! 使用阻塞线程执行写入，避免阻塞 async 运行时。
//!
//! ## 实现思路（v2 — Windows 原生写入，绕开 arboard 瓶颈）
//!
//! `arboard` 在 `set_image` 时会在 OpenClipboard→CloseClipboard 之间
//! 完成 PNG 编码与 DIBV5 像素转换，导致剪贴板被长时间锁定。
//! 在其他应用也在监控剪贴板时极易出现 `SetClipboardData` 失败
//! （`os error 1418`: ERROR_CLIPBOARD_NOT_OPEN）。
//!
//! 新方案将所有耗时操作（PNG 编码、ARGB 转换、垂直翻转、全局内存分配）
//! 全部前置到打开剪贴板之前，使 Open→Empty→Set→Close 窗口极短（< 1ms）。
//! 如果写入仍失败则进行有限重试。
//!
//! 非 Windows 平台仍回退到 arboard。
//!
//! ## 错误日志字段约定（Windows）
//!
//! 失败日志统一使用以下可检索字段，便于排障与告警聚合：
//! - `format`: 写入失败的剪贴板格式（如 `PNG`、`CF_DIBV5`）
//! - `hr`: 原始 HRESULT（十六进制）
//! - `code`: 从 HRESULT 解析出的 Win32 错误码（若可解析）
//! - `hint`: 内置错误语义提示（用于快速定位 Busy/内存/资源问题）

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use super::source::PreparedClipboardImage;
use super::{ImageConfig, ImageError, ImageHandler};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClipboardFailureKind {
    Busy,
    Transient,
    Fatal,
}

#[derive(Debug, Clone)]
struct ClipboardWriteFailure {
    kind: ClipboardFailureKind,
    message: String,
}

impl ClipboardWriteFailure {
    fn busy(message: impl Into<String>) -> Self {
        Self {
            kind: ClipboardFailureKind::Busy,
            message: message.into(),
        }
    }

    fn transient(message: impl Into<String>) -> Self {
        Self {
            kind: ClipboardFailureKind::Transient,
            message: message.into(),
        }
    }

    fn fatal(message: impl Into<String>) -> Self {
        Self {
            kind: ClipboardFailureKind::Fatal,
            message: message.into(),
        }
    }

    fn is_retryable(&self) -> bool {
        matches!(self.kind, ClipboardFailureKind::Busy | ClipboardFailureKind::Transient)
    }
}

static JITTER_STATE: AtomicU64 = AtomicU64::new(0);

fn seed_jitter_state() -> u64 {
    let time_seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut state = time_seed ^ ((std::process::id() as u64) << 32) ^ 0x9E37_79B9_7F4A_7C15;
    if state == 0 {
        state = 0xA5A5_5A5A_0123_4567;
    }
    state
}

fn next_jitter_u64() -> u64 {
    let mut current = JITTER_STATE.load(Ordering::Relaxed);

    loop {
        let seeded = if current == 0 {
            seed_jitter_state()
        } else {
            current
        };

        let mut next = seeded;
        next ^= next << 13;
        next ^= next >> 7;
        next ^= next << 17;

        match JITTER_STATE.compare_exchange_weak(current, next, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return next,
            Err(observed) => current = observed,
        }
    }
}

fn compute_backoff_delay_with_jitter(base_delay_ms: u64, attempt: u32, max_delay_ms: u64) -> u64 {
    let exp = base_delay_ms
        .saturating_mul(1_u64 << attempt.saturating_sub(1).min(8));
    let capped = exp.min(max_delay_ms.max(base_delay_ms));
    let jitter_bound = (capped / 3).max(1);
    let jitter = next_jitter_u64() % (jitter_bound + 1);
    capped.saturating_add(jitter)
}

fn hresult_to_win32_code(hr: i32) -> Option<u32> {
    let value = hr as u32;
    if (value & 0xFFFF_0000) == 0x8007_0000 {
        Some(value & 0xFFFF)
    } else {
        None
    }
}

fn format_win32_error_message(
    operation: &str,
    format_name: &str,
    hr: i32,
    detail: &str,
) -> String {
    let code = hresult_to_win32_code(hr);
    let code_str = code
        .map(|c| c.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let hint = win32_error_hint(code);
    format!(
        "{}失败: format={} hr=0x{:08X} code={} hint={} detail={}",
        operation,
        format_name,
        hr as u32,
        code_str,
        hint,
        detail
    )
}

fn win32_error_hint(code: Option<u32>) -> &'static str {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{
            ERROR_ACCESS_DENIED, ERROR_BUSY, ERROR_CLIPBOARD_NOT_OPEN, ERROR_NOT_ENOUGH_MEMORY,
            ERROR_NOT_ENOUGH_QUOTA, ERROR_NO_SYSTEM_RESOURCES, ERROR_OUTOFMEMORY,
        };

        match code {
            Some(c) if c == ERROR_ACCESS_DENIED.0 => "剪贴板被其他进程占用或权限不足",
            Some(c) if c == ERROR_CLIPBOARD_NOT_OPEN.0 => "剪贴板句柄未打开或已失效",
            Some(c) if c == ERROR_BUSY.0 => "系统忙，资源暂不可用",
            Some(c) if c == ERROR_NOT_ENOUGH_MEMORY.0 => "内存不足",
            Some(c) if c == ERROR_OUTOFMEMORY.0 => "系统报告内存耗尽",
            Some(c) if c == ERROR_NO_SYSTEM_RESOURCES.0 => "系统资源不足",
            Some(c) if c == ERROR_NOT_ENOUGH_QUOTA.0 => "进程配额不足",
            Some(_) => "未分类 Win32 错误",
            None => "无法从 HRESULT 解析 Win32 错误码",
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        match code {
            Some(_) => "未分类 Win32 错误",
            None => "无法从 HRESULT 解析 Win32 错误码",
        }
    }
}

fn would_exceed_retry_budget(elapsed_ms: u64, wait_ms: u64, budget_ms: u64) -> bool {
    elapsed_ms.saturating_add(wait_ms) > budget_ms
}

impl ImageHandler {
    /// 将已准备好的 RGBA 数据写入系统剪贴板（含重试）。
    pub(crate) async fn copy_to_clipboard_with_retry(
        &self,
        image: PreparedClipboardImage,
        config: &ImageConfig,
    ) -> Result<(), ImageError> {
        log::debug!("📋 准备复制到剪贴板 - {}x{}", image.width, image.height);

        let _guard = crate::clipboard::IgnoreGuard::new();
        let retries = config.clipboard_retries;
        let retry_delay = config.clipboard_retry_delay;
        let retry_max_total_ms = config.clipboard_retry_max_total_ms;
        let retry_max_delay_ms = config.clipboard_retry_max_delay_ms;
        let width = image.width;
        let height = image.height;
        let bytes = image.bytes;

        tokio::task::spawn_blocking(move || {
            Self::write_image_with_retry(
                width,
                height,
                &bytes,
                retries,
                retry_delay,
                retry_max_total_ms,
                retry_max_delay_ms,
            )
        })
        .await
        .map_err(|e| ImageError::Clipboard(format!("线程执行失败：{}", e)))?
    }

    /// 在阻塞线程中执行写入 + 重试。
    fn write_image_with_retry(
        width: usize,
        height: usize,
        bytes: &[u8],
        retries: u32,
        retry_delay: u64,
        retry_max_total_ms: u64,
        retry_max_delay_ms: u64,
    ) -> Result<(), ImageError> {
        // ── 预编码阶段（不持有剪贴板锁）──────────────
        let prepped = Self::prepare_clipboard_buffers(width, height, bytes)
            .map_err(ImageError::Clipboard)?;

        // ── 写入阶段 + 重试 ─────────────────────────
        let retry_count = retries.max(1);
        let started = Instant::now();
        let mut last_error = None;
        let mut last_kind = ClipboardFailureKind::Transient;
        for attempt in 1..=retry_count {
            if attempt > 1 {
                let elapsed_ms = started.elapsed().as_millis() as u64;
                if elapsed_ms >= retry_max_total_ms {
                    log::warn!(
                        "⏱️ 剪贴板写入重试预算耗尽（{}ms >= {}ms）",
                        elapsed_ms,
                        retry_max_total_ms
                    );
                    break;
                }

                let wait_ms = compute_backoff_delay_with_jitter(
                    retry_delay.max(1),
                    attempt - 1,
                    retry_max_delay_ms,
                );

                if would_exceed_retry_budget(elapsed_ms, wait_ms, retry_max_total_ms) {
                    log::warn!(
                        "⏱️ 跳过第 {} 次重试：等待 {}ms 会超过预算 {}ms",
                        attempt,
                        wait_ms,
                        retry_max_total_ms
                    );
                    break;
                }

                log::debug!(
                    "🔄 重试 {}/{}，等待 {}ms（指数退避+抖动）",
                    attempt,
                    retry_count,
                    wait_ms
                );
                std::thread::sleep(Duration::from_millis(wait_ms));
            }

            match Self::try_fast_clipboard_write(&prepped) {
                Ok(()) => {
                    log::info!("✅ 复制成功 (尝试 {})", attempt);
                    return Ok(());
                }
                Err(failure) => {
                    let retryable = failure.is_retryable();
                    let is_last_attempt = attempt >= retry_count;
                    log::warn!(
                        "❌ 尝试 {} 失败: {}（kind={:?}, retryable={}）",
                        attempt,
                        failure.message,
                        failure.kind,
                        retryable
                    );
                    last_error = Some(failure.message.clone());
                    last_kind = failure.kind;

                    if !retryable {
                        log::warn!("🛑 非可重试错误，提前终止重试");
                        break;
                    }

                    if is_last_attempt {
                        break;
                    }
                }
            }
        }

        let final_message = last_error.unwrap_or_else(|| "未知错误".to_string());
        if last_kind == ClipboardFailureKind::Busy {
            Err(ImageError::ClipboardBusy(final_message))
        } else {
            Err(ImageError::Clipboard(final_message))
        }
    }
}

// ============================================================================
// Windows 原生实现 — 所有重量级编码前置于剪贴板锁之外
// ============================================================================

#[cfg(target_os = "windows")]
mod win32 {
    use super::*;
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;
    use std::mem::size_of;
    use std::ptr::copy_nonoverlapping;
    use windows::Win32::Foundation::{
        GlobalFree, HANDLE, ERROR_ACCESS_DENIED, ERROR_BUSY, ERROR_CLIPBOARD_NOT_OPEN,
        ERROR_NOT_ENOUGH_MEMORY, ERROR_NOT_ENOUGH_QUOTA, ERROR_NO_SYSTEM_RESOURCES,
        ERROR_OUTOFMEMORY,
    };
    use windows::Win32::Graphics::Gdi::{
        BITMAPV5HEADER, BI_BITFIELDS, LCS_GM_IMAGES,
    };
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW,
        SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows::Win32::System::Ole::CF_DIBV5;

    /// 预备好的剪贴板缓冲区（所有编码工作已在此完成）。
    pub(super) struct PreppedBuffers {
        /// PNG 字节（用于 "PNG" 格式）。
        pub png_bytes: Vec<u8>,
        /// DIBv5 字节 = BITMAPV5HEADER + ARGB 像素（翻转后）。
        pub dibv5_bytes: Vec<u8>,
    }

    /// sRGB 色彩空间标识（windows-rs 中没有定义）。
    #[allow(non_upper_case_globals)]
    const LCS_sRGB: u32 = 0x7352_4742;

    impl ImageHandler {
        /// 在**不持有剪贴板的前提下**，准备好 PNG 与 DIBv5 缓冲。
        pub(super) fn prepare_clipboard_buffers(
            width: usize,
            height: usize,
            rgba_bytes: &[u8],
        ) -> Result<PreppedBuffers, String> {
            // ── 1. PNG 编码 ──
            let png_bytes = {
                let mut buf = Vec::new();
                let encoder = PngEncoder::new(&mut buf);
                encoder
                    .write_image(
                        rgba_bytes,
                        width as u32,
                        height as u32,
                        image::ColorType::Rgba8.into(),
                    )
                    .map_err(|e| format!("PNG 编码失败: {}", e))?;
                buf
            };

            // ── 2. 构建 DIBv5（header + ARGB 像素）──
            let dibv5_bytes = build_dibv5(width, height, rgba_bytes)?;

            Ok(PreppedBuffers {
                png_bytes,
                dibv5_bytes,
            })
        }

        /// 极速写入：OpenClipboard→Empty→Set(PNG)→Set(DIBV5)→Close。
        ///
        /// 此函数内不做任何编码/转换，只做内存拷贝与 Win32 调用，
        /// 持有剪贴板的时间通常 < 1ms。
        pub(super) fn try_fast_clipboard_write(prepped: &PreppedBuffers) -> Result<(), ClipboardWriteFailure> {
            unsafe {
                // ── Open ──
                OpenClipboard(None).map_err(|e| classify_win32_error("打开剪贴板", "N/A", &e))?;

                if let Err(e) = EmptyClipboard() {
                    let _ = CloseClipboard();
                    return Err(classify_win32_error("清空剪贴板", "N/A", &e));
                }

                // ── Set PNG（优先级更高，放在前面）──
                if let Err(e) = set_raw_format("PNG", &prepped.png_bytes) {
                    let _ = CloseClipboard();
                    return Err(e);
                }

                // ── Set CF_DIBV5 ──
                if let Err(e) = set_global_data(CF_DIBV5.0 as u32, "CF_DIBV5", &prepped.dibv5_bytes) {
                    let _ = CloseClipboard();
                    return Err(e);
                }

                // ── Close ──
                let _ = CloseClipboard();
            }

            Ok(())
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 辅助函数
    // ────────────────────────────────────────────────────────────────────────

    /// 注册自定义剪贴板格式并设置数据。
    unsafe fn set_raw_format(name: &str, data: &[u8]) -> Result<(), ClipboardWriteFailure> {
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let format_id = RegisterClipboardFormatW(windows::core::PCWSTR(wide.as_ptr()));
        if format_id == 0 {
            return Err(ClipboardWriteFailure::fatal(format!("注册格式 '{}' 失败", name)));
        }
        set_global_data(format_id, name, data)
    }

    /// 将字节写入全局内存并 SetClipboardData。
    unsafe fn set_global_data(
        format_id: u32,
        format_name: &str,
        data: &[u8],
    ) -> Result<(), ClipboardWriteFailure> {
        let hglobal = GlobalAlloc(GMEM_MOVEABLE, data.len())
            .map_err(|e| classify_win32_error("GlobalAlloc", format_name, &e))?;

        let ptr = GlobalLock(hglobal) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(Some(hglobal));
            return Err(ClipboardWriteFailure::transient("GlobalLock 返回空指针".to_string()));
        }

        copy_nonoverlapping(data.as_ptr(), ptr, data.len());
        let _ = GlobalUnlock(hglobal);

        if let Err(e) = SetClipboardData(
            format_id,
            Some(HANDLE(hglobal.0)),
        ) {
            let _ = GlobalFree(Some(hglobal));
            return Err(classify_win32_error("SetClipboardData", format_name, &e));
        }

        Ok(())
    }

    fn classify_win32_error(
        operation: &str,
        format_name: &str,
        err: &windows::core::Error,
    ) -> ClipboardWriteFailure {
        let code = hresult_to_win32_code(err.code().0);
        let message = format_win32_error_message(operation, format_name, err.code().0, &format!("{:?}", err));

        match code {
            Some(c)
                if c == ERROR_ACCESS_DENIED.0
                    || c == ERROR_CLIPBOARD_NOT_OPEN.0
                    || c == ERROR_BUSY.0 => ClipboardWriteFailure::busy(message),
            Some(c)
                if c == ERROR_NOT_ENOUGH_MEMORY.0
                    || c == ERROR_OUTOFMEMORY.0
                    || c == ERROR_NO_SYSTEM_RESOURCES.0
                    || c == ERROR_NOT_ENOUGH_QUOTA.0 => ClipboardWriteFailure::transient(message),
            _ => ClipboardWriteFailure::fatal(message),
        }
    }

    /// 构建完整的 DIBv5 数据（header + 翻转后的 ARGB 像素）。
    fn build_dibv5(width: usize, height: usize, rgba_bytes: &[u8]) -> Result<Vec<u8>, String> {
        let header_size = size_of::<BITMAPV5HEADER>();
        let pixel_count = width * height;
        let pixel_bytes = pixel_count * 4;

        if rgba_bytes.len() != pixel_bytes {
            return Err(format!(
                "像素长度不匹配: 期望 {} 实际 {}",
                pixel_bytes,
                rgba_bytes.len()
            ));
        }

        // ── 将 RGBA → ARGB（Windows 原生格式）并垂直翻转 ──
        let argb_flipped = rgba_to_argb_flipped(rgba_bytes, width, height);

        // ── BITMAPV5HEADER ──
        // 使用正的 height 表示 bottom-up（Windows 标准，兼容性最好）。
        let header = BITMAPV5HEADER {
            bV5Size: header_size as u32,
            bV5Width: width as i32,
            bV5Height: height as i32, // 正值 = bottom-up
            bV5Planes: 1,
            bV5BitCount: 32,
            bV5Compression: BI_BITFIELDS,
            bV5SizeImage: pixel_bytes as u32,
            bV5XPelsPerMeter: 0,
            bV5YPelsPerMeter: 0,
            bV5ClrUsed: 0,
            bV5ClrImportant: 0,
            bV5RedMask: 0x00ff_0000,
            bV5GreenMask: 0x0000_ff00,
            bV5BlueMask: 0x0000_00ff,
            bV5AlphaMask: 0xff00_0000,
            bV5CSType: LCS_sRGB,
            bV5Endpoints: unsafe { std::mem::zeroed() },
            bV5GammaRed: 0,
            bV5GammaGreen: 0,
            bV5GammaBlue: 0,
            bV5Intent: LCS_GM_IMAGES as u32,
            bV5ProfileData: 0,
            bV5ProfileSize: 0,
            bV5Reserved: 0,
        };

        // ── 拼接 ──
        let mut buf = Vec::with_capacity(header_size + pixel_bytes);
        let header_bytes =
            unsafe { std::slice::from_raw_parts(&header as *const _ as *const u8, header_size) };
        buf.extend_from_slice(header_bytes);
        buf.extend_from_slice(&argb_flipped);

        Ok(buf)
    }

    /// RGBA → ARGB + 垂直翻转（行翻转），一次遍历完成两项转换。
    fn rgba_to_argb_flipped(rgba: &[u8], width: usize, height: usize) -> Vec<u8> {
        let row_bytes = width * 4;
        let mut out = vec![0u8; rgba.len()];

        for y in 0..height {
            let src_row = y * row_bytes;
            let dst_row = (height - 1 - y) * row_bytes;
            for x in 0..width {
                let si = src_row + x * 4;
                let di = dst_row + x * 4;
                let r = rgba[si];
                let g = rgba[si + 1];
                let b = rgba[si + 2];
                let a = rgba[si + 3];
                // ARGB 在小端系统（Windows）的内存排布: B G R A
                out[di] = b;
                out[di + 1] = g;
                out[di + 2] = r;
                out[di + 3] = a;
            }
        }

        out
    }
}

// ============================================================================
// 非 Windows 回退方案 — 沿用 arboard
// ============================================================================

#[cfg(not(target_os = "windows"))]
mod fallback {
    use super::*;
    use std::borrow::Cow;

    /// 预备缓冲（非 Windows 仅持有原始 RGBA 引用信息）。
    pub(super) struct PreppedBuffers {
        pub width: usize,
        pub height: usize,
        pub rgba_bytes: Vec<u8>,
    }

    impl ImageHandler {
        pub(super) fn prepare_clipboard_buffers(
            width: usize,
            height: usize,
            rgba_bytes: &[u8],
        ) -> Result<PreppedBuffers, String> {
            Ok(PreppedBuffers {
                width,
                height,
                rgba_bytes: rgba_bytes.to_vec(),
            })
        }

        pub(super) fn try_fast_clipboard_write(prepped: &PreppedBuffers) -> Result<(), ClipboardWriteFailure> {
            let mut clipboard = arboard::Clipboard::new()
            .map_err(|e| ClipboardWriteFailure::busy(format!("无法访问剪贴板：{}", e)))?;

            let image_data = arboard::ImageData {
                width: prepped.width,
                height: prepped.height,
                bytes: Cow::Borrowed(&prepped.rgba_bytes),
            };

            clipboard
                .set_image(image_data)
                .map_err(|e| ClipboardWriteFailure::transient(format!("复制失败：{}", e)))?;

            Ok(())
        }
    }
}

// 根据平台选择具体的 PreppedBuffers 类型
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use win32::PreppedBuffers;
#[cfg(not(target_os = "windows"))]
#[allow(unused_imports)]
use fallback::PreppedBuffers;

#[cfg(test)]
mod tests {
    use super::{
        compute_backoff_delay_with_jitter, format_win32_error_message, hresult_to_win32_code,
        would_exceed_retry_budget,
    };

    #[test]
    fn backoff_delay_stays_within_expected_bounds() {
        let base = 100;
        let max_delay = 900;

        let delay = compute_backoff_delay_with_jitter(base, 4, max_delay);

        assert!(delay >= 800, "delay should be at least exponential base");
        assert!(delay <= 1200, "delay should include bounded jitter only");
    }

    #[test]
    fn backoff_delay_respects_max_cap() {
        let base = 300;
        let max_delay = 500;

        let delay = compute_backoff_delay_with_jitter(base, 8, max_delay);

        assert!(delay >= 500, "delay should be capped at max_delay floor");
        assert!(delay <= 666, "delay should not exceed capped value + jitter");
    }

    #[test]
    fn retry_budget_checker_works() {
        assert!(would_exceed_retry_budget(1700, 120, 1800));
        assert!(!would_exceed_retry_budget(1600, 120, 1800));
        assert!(!would_exceed_retry_budget(0, 0, 1800));
    }

    #[test]
    fn hresult_to_win32_code_extracts_mapped_code() {
        let hr = 0x8007_058A_u32 as i32;
        assert_eq!(hresult_to_win32_code(hr), Some(1418));
        assert_eq!(hresult_to_win32_code(0x8000_4005_u32 as i32), None);
    }

    #[test]
    fn win32_error_message_contains_format_and_hint() {
        let message = format_win32_error_message(
            "SetClipboardData",
            "PNG",
            0x8007_058A_u32 as i32,
            "mock_detail",
        );

        assert!(message.contains("format=PNG"));
        assert!(message.contains("hint="));
        assert!(message.contains("code=1418"));
    }
}