//! 代码特征检测模块
//!
//! # 设计思路
//!
//! 当用户从浏览器（如 GitHub）复制代码时，浏览器会同时放入文本和图片数据。
//! 本模块通过正则表达式识别 20 种代码模式，帮助上层判断是否应跳过图片保存。
//!
//! # 实现思路
//!
//! - 使用 `RegexSet` 进行一次性多模式匹配，性能优于逐条匹配。
//! - 通过 `once_cell::sync::Lazy` 在首次调用时编译正则，后续零成本复用。

use once_cell::sync::Lazy;
use regex::RegexSet;

/// 预编译的正则表达式集合：用于代码特征检测
///
/// 检测的模式包括：
/// 1. 语言关键字（fn, function, const, let, struct, impl 等）
/// 2. Rust 属性（#![], #[...]）
/// 3. Rust 宏（format!, println!, eprintln!）
/// 4. 闭包语法（|x|）
/// 5. C/C++ 预处理器（#include, #define 等）
/// 6. 类型箭头 / 匹配箭头（->, =>）
/// 7. 作用域解析运算符（::）
/// 8. Rust 引用与可变引用（&var, &mut var）
/// 9. Result 枚举方法（Ok(), Err(), unwrap(), expect(), map_err()）
static CODE_PATTERNS: Lazy<RegexSet> = Lazy::new(|| {
    RegexSet::new([
        r"(?m)^[\s]*(fn|function|const|let|var|class|struct|impl|mod|use|import|export|def|async|pub|private|static|interface|type|enum|trait)\s",
        r"#!\[",
        r"#\[[\w\s:]+\]",
        r"format!\(",
        r"println!\(",
        r"eprintln!\(",
        r"\|\s*\w+\s*\|",
        r"(?m)^[\s]*#[a-z]+\!",
        r"(?m)^[\s]*#(include|define|ifdef|ifndef|endif)",
        r"->",
        r"=>",
        r"::",
        r"&mut\s+\w+",
        r"&\s*\w+",
        r"let\s+mut\s+",
        r"Ok\(",
        r"Err\(",
        r"unwrap\(\)",
        r"expect\(",
        r"map_err\(",
    ]).unwrap()
});

/// 判断文本是否可能包含代码
///
/// # 设计思路
/// - 极短文本（<5 字符且无换行）直接排除，避免误判。
/// - 使用预编译 `RegexSet` 进行高效批量匹配。
///
/// # 参数
/// * `text` - 剪贴板中的文本内容
///
/// # 返回
/// - `true`：文本包含代码特征
/// - `false`：文本不包含代码特征
pub fn is_likely_code(text: &str) -> bool {
    if text.len() < 5 && !text.contains('\n') {
        return false;
    }
    CODE_PATTERNS.is_match(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rust_function_detected() {
        assert!(is_likely_code("fn main() {}"));
    }

    #[test]
    fn test_rust_attribute_detected() {
        assert!(is_likely_code("#[test]"));
    }

    #[test]
    fn test_plain_text_not_detected() {
        assert!(!is_likely_code("hello world"));
    }

    #[test]
    fn test_short_text_not_detected() {
        assert!(!is_likely_code("abc"));
    }

    #[test]
    fn test_arrow_detected() {
        assert!(is_likely_code("fn foo() -> i32 { 42 }"));
    }

    #[test]
    fn test_scope_resolution_detected() {
        assert!(is_likely_code("std::io::Result"));
    }

    #[test]
    fn test_multiline_code_detected() {
        let code = "fn save_clipboard_image() -> Result<String, String> {\n    let file_path = get_images_dir();\n}";
        assert!(is_likely_code(code));
    }
}
