//! 代码特征检测模块
//!
//! # 设计思路
//!
//! 当用户从浏览器（如 GitHub）复制代码时，浏览器会同时放入文本和图片数据。
//! 本模块通过正则表达式识别常见代码模式，帮助上层判断是否应跳过图片保存。
//!
//! # 实现思路
//!
//! - 使用 `RegexSet` 进行一次性多模式匹配，性能优于逐条匹配。
//! - 通过 `once_cell::sync::Lazy` 在首次调用时编译正则，后续零成本复用。
//! - 模式分为 **强特征**（单条命中即为代码）和 **弱特征**（需与其他特征组合）。

use once_cell::sync::Lazy;
use regex::RegexSet;

/// 强特征数量：前 N 条模式为强特征，命中任一即判定为代码
const STRONG_PATTERN_COUNT: usize = 10;

/// 预编译的正则表达式集合：用于代码特征检测
///
/// **排列规则**：前 [`STRONG_PATTERN_COUNT`] 条为强特征，其余为弱特征。
///
/// ### 强特征（单条命中 = 代码）
/// 1. 语言关键字（fn, function, const, let, struct, impl 等）
/// 2. Rust 内部属性（#![...]）
/// 3. Rust 外部属性（#[derive(...)], #[test]）
/// 4. Rust 标准宏调用（format!, println!, vec! 等）
/// 5. C/C++ 预处理器指令（#include, #define 等）
/// 6. Rust let mut 绑定
/// 7. Rust 可变引用（&mut var）
/// 8. 闭包语法（|x|, |x, y|）
/// 9. Rust 行首宏调用（#macro!）
/// 10. Result/Option 方法链（.unwrap(), .expect(), .map_err() 等）
///
/// ### 弱特征（需 ≥2 条弱特征同时命中）
/// 11. 返回类型箭头（->）
/// 12. 匹配箭头 / 箭头函数（=>）
/// 13. 作用域解析运算符，要求字母前缀（std::io）
/// 14. Result/Option 构造（Ok(), Err(), Some()）
static CODE_PATTERNS: Lazy<RegexSet> = Lazy::new(|| {
    RegexSet::new([
        // ── 强特征 ──────────────────────────────────────────
        // [0] 语言关键字（行首匹配）
        r"(?m)^[\s]*(fn|function|const|let|var|class|struct|impl|mod|use|import|export|def|async|pub|private|static|interface|type|enum|trait)\s",
        // [1] Rust 内部属性 #![...]
        r"#!\[",
        // [2] Rust 外部属性 #[derive(...)], #[test]
        r"#\[[\w\s:]+\]",
        // [3] Rust 标准宏调用（支持 !(), ![], !{} 三种语法）
        r"(format|println|eprintln|vec|write|writeln|todo|unimplemented|panic)!\s*[\(\[\{]",
        // [4] C/C++ 预处理器指令
        r"(?m)^[\s]*#(include|define|ifdef|ifndef|endif|pragma)",
        // [5] Rust let mut 绑定
        r"let\s+mut\s+",
        // [6] Rust 可变引用
        r"&mut\s+\w+",
        // [7] 闭包语法 |x|, |x, y|
        r"\|\s*\w+\s*\|",
        // [8] 行首宏调用 #macro!
        r"(?m)^[\s]*#[a-z]+\!",
        // [9] 方法链（.unwrap(), .expect() 等，需前导点号）
        r"\.(unwrap|expect|map_err|and_then|unwrap_or|is_ok|is_err)\(",
        // ── 弱特征 ──────────────────────────────────────────
        // [10] 返回类型箭头 fn() -> T（要求前导 word char 或右括号）
        r"[\w)]\s*->",
        // [11] 匹配箭头 / 箭头函数 =>
        r"=>",
        // [12] 作用域解析运算符（要求字母前缀，排除 10::30 等数字）
        r"[a-zA-Z_]\w*::\w+",
        // [13] Result/Option 构造
        r"(Ok|Err|Some)\(",
    ]).unwrap()
});

/// 判断文本是否可能包含代码
///
/// # 判定规则
/// - 极短文本（<5 字符且无换行）直接排除，避免误判。
/// - **强特征**：命中任一即返回 `true`。
/// - **弱特征**：需同时命中 ≥2 条才返回 `true`。
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

    let matches = CODE_PATTERNS.matches(text);
    if !matches.matched_any() {
        return false;
    }

    // 任一强特征命中 → 确定是代码
    let has_strong = matches.iter().any(|idx| idx < STRONG_PATTERN_COUNT);
    if has_strong {
        return true;
    }

    // 仅弱特征命中 → 需要 ≥2 条组合证据
    let weak_count = matches.iter().filter(|&idx| idx >= STRONG_PATTERN_COUNT).count();
    weak_count >= 2
}

#[cfg(test)]
#[path = "tests/code_detection_tests.rs"]
mod tests;
