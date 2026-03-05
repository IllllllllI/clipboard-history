use super::*;

// ── 强特征：单条命中即判定为代码 ────────────────────────

#[test]
fn test_rust_function_detected() {
    assert!(is_likely_code("fn main() {}"));
}

#[test]
fn test_rust_attribute_detected() {
    assert!(is_likely_code("#[test]"));
}

#[test]
fn test_rust_macro_detected() {
    assert!(is_likely_code("println!(\"hello\")"));
    assert!(is_likely_code("vec![1, 2, 3]"));
    assert!(is_likely_code("format!(\"x={}\", x)"));
}

#[test]
fn test_let_mut_detected() {
    assert!(is_likely_code("let mut x = 5;"));
}

#[test]
fn test_mutable_reference_detected() {
    assert!(is_likely_code("&mut self"));
}

#[test]
fn test_closure_detected() {
    assert!(is_likely_code("|x| x + 1"));
}

#[test]
fn test_c_preprocessor_detected() {
    assert!(is_likely_code("#include <stdio.h>"));
    assert!(is_likely_code("#define MAX 100"));
}

#[test]
fn test_method_chain_detected() {
    assert!(is_likely_code("result.unwrap()"));
    assert!(is_likely_code("opt.expect(\"msg\")"));
    assert!(is_likely_code("res.map_err(|e| e.to_string())"));
}

#[test]
fn test_multiline_code_detected() {
    let code = "fn save_clipboard_image() -> Result<String, String> {\n    let file_path = get_images_dir();\n}";
    assert!(is_likely_code(code));
}

// ── 弱特征：需 ≥2 条组合才判定 ─────────────────────────

#[test]
fn test_arrow_alone_is_not_enough() {
    // 单独的 -> 是弱特征，不足以判定为代码
    assert!(!is_likely_code("A -> B"));
}

#[test]
fn test_scope_resolution_alone_is_not_enough() {
    // 单独的 :: 是弱特征
    assert!(!is_likely_code("std::io"));
}

#[test]
fn test_two_weak_features_combined_detected() {
    // -> + :: 组合 = 代码
    assert!(is_likely_code("std::io::Result -> bool"));
    // => + Ok(
    assert!(is_likely_code("Ok(x) => x + 1"));
}

#[test]
fn test_arrow_detected_in_function_context() {
    // 强特征 fn + 弱特征 -> = 代码
    assert!(is_likely_code("fn foo() -> i32 { 42 }"));
}

#[test]
fn test_scope_resolution_with_keyword() {
    // 强特征 use + 弱特征 :: = 代码
    assert!(is_likely_code("use std::io::Result"));
}

// ── 非代码文本不应误判 ─────────────────────────────────

#[test]
fn test_plain_text_not_detected() {
    assert!(!is_likely_code("hello world"));
}

#[test]
fn test_short_text_not_detected() {
    assert!(!is_likely_code("abc"));
}

#[test]
fn test_html_entity_not_detected() {
    // 旧版 &\s*\w+ 会误判 &amp; &nbsp; 等 HTML 实体
    assert!(!is_likely_code("copy &amp; paste"));
    assert!(!is_likely_code("&nbsp; spacing"));
}

#[test]
fn test_numeric_colon_not_detected() {
    // 旧版 :: 会误判时间格式
    assert!(!is_likely_code("10::30 is not valid but should not be code"));
}

#[test]
fn test_single_arrow_in_natural_text() {
    assert!(!is_likely_code("step 1 => step 2"));
}
