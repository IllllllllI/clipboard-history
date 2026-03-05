use super::{encode_file_list, should_skip_image_by_text, FILES_PREFIX};

#[test]
fn encode_file_list_returns_none_for_empty() {
    let files: Vec<String> = Vec::new();
    assert!(encode_file_list(&files).is_none());
}

#[test]
fn encode_file_list_uses_files_prefix_and_newlines() {
    let files = vec![
        String::from("C:\\tmp\\a.txt"),
        String::from("C:\\tmp\\b.png"),
    ];
    let encoded = encode_file_list(&files).expect("encoding should produce payload");
    assert!(encoded.starts_with(FILES_PREFIX));
    assert_eq!(encoded, "[FILES]\nC:\\tmp\\a.txt\nC:\\tmp\\b.png");
}

#[test]
fn should_skip_image_by_text_detects_code_snippet() {
    assert!(should_skip_image_by_text("fn main() { println!(\"ok\"); }"));
}

#[test]
fn should_skip_image_by_text_detects_long_multiline_text() {
    let long_line = "a".repeat(501);
    let text = format!("title\n{}", long_line);
    assert!(should_skip_image_by_text(&text));
}

#[test]
fn should_skip_image_by_text_allows_normal_text() {
    assert!(!should_skip_image_by_text("hello world, clipboard history"));
}
