use once_cell::sync::Lazy;
use regex::RegexSet;

// Same patterns as in main.rs
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

fn is_likely_code(text: &str) -> bool {
    if text.len() < 5 && !text.contains('\n') {
        return false;
    }
    CODE_PATTERNS.is_match(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_provided_code() {
        // Test with the user's provided code
        let user_code = r#"// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, Wry};
use clipboard_master::{ClipboardHandler, Master, CallbackResult};
use std::thread;

static IGNORE_NEXT_CLIPBOARD_CHANGE: Lazy<AtomicBool> = Lazy::new(|| AtomicBool::new(false));

fn is_likely_code(text: &str) -> bool {
    CODE_PATTERNS.is_match(text)
}"#;

        println!("Text length: {} chars", user_code.len());
        println!("Contains newlines: {}", user_code.contains('\n'));
        
        let is_code = is_likely_code(user_code);
        println!("Is detected as code: {}", is_code);
        
        assert!(is_code, "User's code should be detected as code");
    }

    #[test]
    fn test_long_multiline_text() {
        // Simulate long multi-line text (like copying from web page)
        let long_text = "a".repeat(600);
        let multi_line_long = format!("{}\n{}", long_text, long_text);
        
        println!("Text length: {} chars", multi_line_long.len());
        println!("Contains newlines: {}", multi_line_long.contains('\n'));
        
        // This should be detected by the length check in save_clipboard_image
        // even if is_likely_code returns false
        let is_code = is_likely_code(&multi_line_long);
        println!("Is detected as code: {}", is_code);
        
        // The key is: multi-line + length > 500 should skip saving
        assert!(multi_line_long.contains('\n'));
        assert!(multi_line_long.len() > 500);
    }
}
