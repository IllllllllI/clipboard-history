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
//! ## 内部结构
//!
//! - `RetryPolicy`：聚合重试参数（次数、基础延迟、上限、预算）
//! - `execute_with_retries`：通用重试执行器，按策略调度闭包
//! - `ClipboardWriteFailure`：分类错误（Busy / Transient / Fatal）
//! - `win32` / `fallback`：平台特定的预编码 + 快写实现
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

// ── 重试策略 ─────────────────────────────────────────────────

/// 聚合重试行为的四个维度，避免裸参数传递。
#[derive(Debug, Clone, Copy)]
struct RetryPolicy {
    max_attempts: u32,
    base_delay_ms: u64,
    max_delay_ms: u64,
    budget_ms: u64,
}

impl RetryPolicy {
    fn from_config(config: &ImageConfig) -> Self {
        Self {
            max_attempts: config.clipboard_retries.max(1),
            base_delay_ms: config.clipboard_retry_delay.max(1),
            max_delay_ms: config.clipboard_retry_max_delay_ms,
            budget_ms: config.clipboard_retry_max_total_ms,
        }
    }
}

// ── 重试执行器 ───────────────────────────────────────────────

/// 按 `policy` 调度 `op`，遇到 Fatal 立即终止，预算耗尽时提前退出。
fn execute_with_retries<F>(policy: &RetryPolicy, mut op: F) -> Result<(), ImageError>
where
    F: FnMut() -> Result<(), ClipboardWriteFailure>,
{
    let started = Instant::now();
    let mut last_failure: Option<ClipboardWriteFailure> = None;

    for attempt in 1..=policy.max_attempts {
        if attempt > 1 {
            let elapsed_ms = started.elapsed().as_millis() as u64;
            if elapsed_ms >= policy.budget_ms {
                log::warn!(
                    "⏱️ 剪贴板写入重试预算耗尽（{}ms >= {}ms）",
                    elapsed_ms,
                    policy.budget_ms
                );
                break;
            }

            let wait_ms = compute_backoff_delay_with_jitter(
                policy.base_delay_ms,
                attempt - 1,
                policy.max_delay_ms,
            );

            if would_exceed_retry_budget(elapsed_ms, wait_ms, policy.budget_ms) {
                log::warn!(
                    "⏱️ 跳过第 {} 次重试：等待 {}ms 会超过预算 {}ms",
                    attempt,
                    wait_ms,
                    policy.budget_ms
                );
                break;
            }

            log::debug!(
                "🔄 重试 {}/{}，等待 {}ms（指数退避+抖动）",
                attempt,
                policy.max_attempts,
                wait_ms
            );
            std::thread::sleep(Duration::from_millis(wait_ms));
        }

        match op() {
            Ok(()) => {
                log::info!("✅ 复制成功 (尝试 {})", attempt);
                return Ok(());
            }
            Err(failure) => {
                log::warn!(
                    "❌ 尝试 {} 失败: {}（kind={:?}, retryable={}）",
                    attempt,
                    failure.message,
                    failure.kind,
                    failure.is_retryable()
                );
                if !failure.is_retryable() {
                    last_failure = Some(failure);
                    break;
                }
                last_failure = Some(failure);
            }
        }
    }

    let f = last_failure.unwrap_or_else(|| ClipboardWriteFailure::fatal("未知错误"));
    if f.kind == ClipboardFailureKind::Busy {
        Err(ImageError::ClipboardBusy(f.message))
    } else {
        Err(ImageError::Clipboard(f.message))
    }
}

impl ImageHandler {
    /// 将已准备好的 RGBA 数据写入系统剪贴板（含重试）。
    pub(crate) async fn copy_to_clipboard_with_retry(
        &self,
        image: PreparedClipboardImage,
        config: &ImageConfig,
    ) -> Result<(), ImageError> {
        log::debug!("📋 准备复制到剪贴板 - {}x{}", image.width, image.height);

        crate::clipboard::remember_internal_image_fingerprint(
            image.width,
            image.height,
            &image.bytes,
        );
        let _guard = crate::clipboard::IgnoreGuard::new();
        let policy = RetryPolicy::from_config(config);
        let width = image.width;
        let height = image.height;
        let bytes = image.bytes;

        tokio::task::spawn_blocking(move || {
            let prepped = Self::prepare_clipboard_buffers(width, height, &bytes)
                .map_err(ImageError::Clipboard)?;
            execute_with_retries(&policy, || Self::try_fast_clipboard_write(&prepped))
        })
        .await
        .map_err(|e| ImageError::Clipboard(format!("线程执行失败：{}", e)))?
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
            let png_bytes = encode_png(width, height, rgba_bytes)?;
            let dibv5_bytes = build_dibv5(width, height, rgba_bytes)?;
            Ok(PreppedBuffers { png_bytes, dibv5_bytes })
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

    /// PNG 编码辅助，将 RGBA 原始数据编码为 PNG 字节。
    fn encode_png(width: usize, height: usize, rgba: &[u8]) -> Result<Vec<u8>, String> {
        let mut buf = Vec::new();
        let encoder = PngEncoder::new(&mut buf);
        encoder
            .write_image(
                rgba,
                width as u32,
                height as u32,
                image::ColorType::Rgba8.into(),
            )
            .map_err(|e| format!("PNG 编码失败: {}", e))?;
        Ok(buf)
    }

    /// 构建完整的 DIBv5 数据（header + 翻转后的 ARGB 像素）。
    ///
    /// 单次分配：直接将 ARGB 像素写入最终缓冲区，避免中间 Vec 分配。
    fn build_dibv5(width: usize, height: usize, rgba_bytes: &[u8]) -> Result<Vec<u8>, String> {
        let header_size = size_of::<BITMAPV5HEADER>();
        let pixel_bytes = width * height * 4;

        if rgba_bytes.len() != pixel_bytes {
            return Err(format!(
                "像素长度不匹配: 期望 {} 实际 {}",
                pixel_bytes,
                rgba_bytes.len()
            ));
        }

        // 使用正的 height 表示 bottom-up（Windows 标准，兼容性最好）。
        let header = BITMAPV5HEADER {
            bV5Size: header_size as u32,
            bV5Width: width as i32,
            bV5Height: height as i32,
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

        // 单次分配：header + 像素
        let mut buf = vec![0u8; header_size + pixel_bytes];
        let header_bytes =
            unsafe { std::slice::from_raw_parts(&header as *const _ as *const u8, header_size) };
        buf[..header_size].copy_from_slice(header_bytes);

        // RGBA → ARGB + 垂直翻转，直写目标切片，零中间分配
        write_rgba_as_argb_flipped(rgba_bytes, width, height, &mut buf[header_size..]);

        Ok(buf)
    }

    /// RGBA → ARGB 转换 + 垂直翻转，直接写入目标切片。
    ///
    /// 使用 `chunks_exact(4)` 替代手动索引计算，更安全且更 idiomatic。
    fn write_rgba_as_argb_flipped(rgba: &[u8], width: usize, height: usize, out: &mut [u8]) {
        let row_bytes = width * 4;
        for y in 0..height {
            let src_start = y * row_bytes;
            let dst_start = (height - 1 - y) * row_bytes;
            for (src_px, dst_px) in rgba[src_start..src_start + row_bytes]
                .chunks_exact(4)
                .zip(out[dst_start..dst_start + row_bytes].chunks_exact_mut(4))
            {
                // ARGB 在小端系统（Windows）的内存排布: B G R A
                dst_px[0] = src_px[2];
                dst_px[1] = src_px[1];
                dst_px[2] = src_px[0];
                dst_px[3] = src_px[3];
            }
        }
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
#[path = "tests/clipboard_writer_tests.rs"]
mod tests;