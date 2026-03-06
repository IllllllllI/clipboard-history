//! Windows 剪贴板多格式读取模块
//!
//! ## 职责
//! - 枚举当前剪贴板中的所有格式
//! - 读取 HTML Format / Rich Text Format 等注册格式
//! - 提供上下文检测帮助上层判断内容类型
//!
//! ## 设计决策
//!
//! ### 为什么不用 arboard？
//! `arboard` 仅提供 text / image / html 三种高级接口。
//! 本模块需要枚举所有格式并读取自定义注册格式（HTML Format、RTF），
//! 因此直接使用 Win32 API 操作系统剪贴板。
//!
//! ### 格式枚举的原子性
//! `OpenClipboard` 到 `CloseClipboard` 之间其他进程无法写入，
//! 保证枚举和读取在同一个快照上完成。
//!
//! ## 实现约束
//! - 仅 Windows 平台可用，其他平台返回空/None
//! - 所有 Win32 调用封装在 `unsafe` 块中

/// 剪贴板格式上下文信息
///
/// 在单次 `OpenClipboard` 期间收集的完整信息。
#[derive(Debug, Clone, Default)]
pub struct ClipboardFormatsInfo {
    /// 所有可用格式名称（用于调试日志）
    pub format_names: Vec<String>,
    /// 是否包含文本格式（CF_UNICODETEXT）
    pub has_text: bool,
    /// 是否包含图片格式（CF_BITMAP / CF_DIB）
    pub has_image: bool,
    /// 是否包含 HTML Format（注册格式）
    pub has_html: bool,
    /// 是否包含 Rich Text Format（注册格式）
    pub has_rtf: bool,
    /// 是否包含文件列表（CF_HDROP）
    pub has_files: bool,
    /// HTML 格式内容（仅提取 Fragment 部分）
    pub html_content: Option<String>,
    /// RTF 格式内容
    pub rtf_content: Option<String>,
}

impl ClipboardFormatsInfo {
    /// 判断是否为富文本上下文（Office/WPS/浏览器表格等）
    ///
    /// 条件：同时存在文本和 HTML（或 RTF）。
    /// 此时附带的图片通常只是渲染截图，应跳过单独保存。
    pub fn is_rich_text_context(&self) -> bool {
        self.has_text && (self.has_html || self.has_rtf)
    }
}

// ============================================================================
// Windows 实现
// ============================================================================

#[cfg(target_os = "windows")]
mod win_impl {
    use super::ClipboardFormatsInfo;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EnumClipboardFormats, GetClipboardData, GetClipboardFormatNameW,
        OpenClipboard, RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::System::Ole::{CF_BITMAP, CF_DIB, CF_HDROP, CF_UNICODETEXT};
    use windows::Win32::Foundation::HGLOBAL;
    use windows::core::{PCWSTR, w};

    /// 已知的标准格式 ID → 名称映射
    fn standard_format_name(id: u32) -> Option<&'static str> {
        match id {
            1 => Some("CF_TEXT"),
            2 => Some("CF_BITMAP"),
            3 => Some("CF_METAFILEPICT"),
            7 => Some("CF_OEMTEXT"),
            8 => Some("CF_DIB"),
            13 => Some("CF_UNICODETEXT"),
            15 => Some("CF_HDROP"),
            17 => Some("CF_DIBV5"),
            _ => None,
        }
    }

    /// 获取格式名称（标准格式返回预定义名称，注册格式查询系统）
    fn get_format_name(format: u32) -> String {
        if let Some(name) = standard_format_name(format) {
            return name.to_string();
        }

        let mut buf = [0u16; 256];
        let len = unsafe { GetClipboardFormatNameW(format, &mut buf) };
        if len > 0 {
            OsString::from_wide(&buf[..len as usize])
                .to_string_lossy()
                .to_string()
        } else {
            format!("Unknown({})", format)
        }
    }

    /// 注册一个剪贴板格式并返回其 ID
    fn register_format(name: PCWSTR) -> u32 {
        unsafe { RegisterClipboardFormatW(name) }
    }

    /// 从剪贴板读取指定格式的原始字节
    ///
    /// 调用前必须已 `OpenClipboard`。返回 `None` 表示该格式不可用。
    ///
    /// # Safety
    /// 调用者必须确保剪贴板已打开。
    unsafe fn read_format_bytes(format: u32) -> Option<Vec<u8>> {
        let handle = unsafe { GetClipboardData(format) }.ok()?;
        let hglobal = HGLOBAL(handle.0 as _);
        let ptr = unsafe { GlobalLock(hglobal) };
        if ptr.is_null() {
            return None;
        }
        let size = unsafe { GlobalSize(hglobal) };
        if size == 0 {
            let _ = unsafe { GlobalUnlock(hglobal) };
            return None;
        }
        let bytes = unsafe { std::slice::from_raw_parts(ptr as *const u8, size) }.to_vec();
        let _ = unsafe { GlobalUnlock(hglobal) };
        Some(bytes)
    }

    /// 从 HTML Format 原始数据中提取 Fragment 部分
    ///
    /// HTML Format 有如下头部：
    /// ```text
    /// Version:0.9
    /// StartHTML:00000097
    /// EndHTML:00000170
    /// StartFragment:00000131
    /// EndFragment:00000163
    /// ```
    fn extract_html_fragment(raw: &[u8]) -> Option<String> {
        let text = String::from_utf8_lossy(raw);

        // 尝试提取 StartFragment/EndFragment 偏移
        let start_offset = text
            .lines()
            .find(|l| l.starts_with("StartFragment:"))
            .and_then(|l| l.trim_start_matches("StartFragment:").trim().parse::<usize>().ok());
        let end_offset = text
            .lines()
            .find(|l| l.starts_with("EndFragment:"))
            .and_then(|l| l.trim_start_matches("EndFragment:").trim().parse::<usize>().ok());

        if let (Some(start), Some(end)) = (start_offset, end_offset) {
            if start < end && end <= raw.len() {
                let fragment = String::from_utf8_lossy(&raw[start..end]).to_string();
                if !fragment.trim().is_empty() {
                    return Some(fragment);
                }
            }
        }

        // 回退：尝试提取 <!--StartFragment--> 与 <!--EndFragment--> 之间的内容
        let start_marker = "<!--StartFragment-->";
        let end_marker = "<!--EndFragment-->";
        if let (Some(s), Some(e)) = (text.find(start_marker), text.find(end_marker)) {
            let content = &text[s + start_marker.len()..e];
            if !content.trim().is_empty() {
                return Some(content.to_string());
            }
        }

        // 最终回退：返回完整内容（去除头部）
        let body = text
            .lines()
            .skip_while(|l| {
                l.starts_with("Version:")
                    || l.starts_with("StartHTML:")
                    || l.starts_with("EndHTML:")
                    || l.starts_with("StartFragment:")
                    || l.starts_with("EndFragment:")
                    || l.starts_with("SourceURL:")
            })
            .collect::<Vec<_>>()
            .join("\n");
        if !body.trim().is_empty() {
            Some(body)
        } else {
            None
        }
    }

    /// 一次性打开剪贴板，枚举所有格式并读取关键数据
    ///
    /// # 返回
    /// `ClipboardFormatsInfo` 包含格式列表和关键格式内容
    pub fn collect_clipboard_formats() -> ClipboardFormatsInfo {
        let mut info = ClipboardFormatsInfo::default();

        unsafe {
            if OpenClipboard(None).is_err() {
                log::warn!("📋 collect_clipboard_formats: 无法打开剪贴板");
                return info;
            }
        }

        let result = (|| {
            // 注册常用格式 ID
            let html_format_id = register_format(w!("HTML Format"));
            let rtf_format_id = register_format(w!("Rich Text Format"));

            // 枚举所有格式
            let mut format_id = 0u32;
            loop {
                format_id = unsafe { EnumClipboardFormats(format_id) };
                if format_id == 0 {
                    break;
                }

                let name = get_format_name(format_id);
                info.format_names.push(name);

                if format_id == CF_UNICODETEXT.0 as u32 {
                    info.has_text = true;
                } else if format_id == CF_BITMAP.0 as u32 || format_id == CF_DIB.0 as u32 {
                    info.has_image = true;
                } else if format_id == CF_HDROP.0 as u32 {
                    info.has_files = true;
                } else if format_id == html_format_id {
                    info.has_html = true;
                } else if format_id == rtf_format_id {
                    info.has_rtf = true;
                }
            }

            // 读取 HTML Format
            if info.has_html && html_format_id != 0 {
                if let Some(bytes) = unsafe { read_format_bytes(html_format_id) } {
                    info.html_content = extract_html_fragment(&bytes);
                }
            }

            // 读取 RTF
            if info.has_rtf && rtf_format_id != 0 {
                if let Some(bytes) = unsafe { read_format_bytes(rtf_format_id) } {
                    // RTF 内容过大时截断（超过 64KB 的 RTF 存储价值低）
                    let rtf_text = String::from_utf8_lossy(&bytes);
                    if rtf_text.len() <= 65536 {
                        info.rtf_content = Some(rtf_text.to_string());
                    } else {
                        log::debug!("📋 RTF 内容过大（{} 字节），跳过保存", rtf_text.len());
                    }
                }
            }
        })();

        let _ = unsafe { CloseClipboard() };
        let _ = result;

        log::debug!(
            "📋 剪贴板格式: [{}] text={} image={} html={} rtf={} files={}",
            info.format_names.join(", "),
            info.has_text,
            info.has_image,
            info.has_html,
            info.has_rtf,
            info.has_files,
        );

        info
    }
}

// ============================================================================
// 非 Windows 平台占位实现
// ============================================================================

#[cfg(not(target_os = "windows"))]
mod fallback_impl {
    use super::ClipboardFormatsInfo;

    pub fn collect_clipboard_formats() -> ClipboardFormatsInfo {
        ClipboardFormatsInfo::default()
    }
}

// ============================================================================
// 公共 API
// ============================================================================

#[cfg(target_os = "windows")]
pub use win_impl::collect_clipboard_formats;

#[cfg(not(target_os = "windows"))]
pub use fallback_impl::collect_clipboard_formats;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_formats_info_is_empty() {
        let info = ClipboardFormatsInfo::default();
        assert!(!info.has_text);
        assert!(!info.has_image);
        assert!(!info.has_html);
        assert!(!info.has_rtf);
        assert!(!info.has_files);
        assert!(!info.is_rich_text_context());
    }

    #[test]
    fn rich_text_context_requires_text_and_html_or_rtf() {
        let mut info = ClipboardFormatsInfo::default();
        info.has_text = true;
        assert!(!info.is_rich_text_context());

        info.has_html = true;
        assert!(info.is_rich_text_context());

        info.has_html = false;
        info.has_rtf = true;
        assert!(info.is_rich_text_context());
    }
}
