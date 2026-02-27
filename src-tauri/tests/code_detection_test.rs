// Tests for code detection in clipboard image saving
use once_cell::sync::Lazy;
use regex::RegexSet;

// Pre-compiled regex set for code detection (same as in main.rs)
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
    fn test_detect_rust_code() {
        let rust_code = r#"fn save_clipboard_image() -> Result<String, String> {
    let file_path = get_images_dir().join(&file_name);
}"#;
        assert!(is_likely_code(rust_code));
    }

    #[test]
    fn test_detect_rust_inner_attribute() {
        let code = r#"#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]"#;
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_use_statement() {
        let code = "use tauri::{AppHandle, Emitter, Manager};";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_struct() {
        let code = "struct Handler { app: AppHandle }";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_impl() {
        let code = "impl ClipboardHandler for Handler {";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_macro() {
        let code = r#"println!("Hello, world!");"#;
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_format() {
        let code = r#"format!("img_{}.png", timestamp)"#;
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_closure() {
        let code = "|x| x + 1";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_rust_attribute() {
        let code = "#[tauri::command]";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_c_preprocessor() {
        let code = "#include <stdio.h>";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_python_def() {
        let code = "def hello_world():";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_javascript_function() {
        let code = "function handleClick() {";
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_not_detect_simple_image_path() {
        let path = "/home/user/photo.jpg";
        assert!(!is_likely_code(path));
    }

    #[test]
    fn test_not_detect_windows_path() {
        let path = "C:\\Users\\User\\Pictures\\photo.png";
        assert!(!is_likely_code(path));
    }

    #[test]
    fn test_not_detect_url() {
        let url = "https://example.com/image.jpg";
        assert!(!is_likely_code(url));
    }

    #[test]
    fn test_not_detect_simple_text() {
        let text = "Hello, this is a simple text message.";
        assert!(!is_likely_code(text));
    }

    #[test]
    fn test_not_detect_short_text() {
        let text = "Hello";
        assert!(!is_likely_code(text));
    }

    #[test]
    fn test_detect_multi_line_rust_code() {
        let code = r#"// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, Wry};
use std::path::PathBuf;

fn get_images_dir(app: &AppHandle, custom_dir: Option<String>) -> PathBuf {
    if let Some(dir) = custom_dir {
        let path = PathBuf::from(dir);
        return path;
    }
    images_dir
}"#;
        assert!(is_likely_code(code));
    }

    #[test]
    fn test_detect_main_rs_content() {
        let main_rs_content = r#"// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, Wry};
use std::path::PathBuf;
use std::fs;
use chrono::Local;
use image::ImageFormat;

fn get_images_dir(app: &AppHandle, custom_dir: Option<String>) -> PathBuf {
    if let Some(dir) = custom_dir {
        if !dir.is_empty() {
            let path = PathBuf::from(dir);
            if !path.exists() {
                let _ = fs::create_dir_all(&path);
            }
            return path;
        }
    }

    let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");
    let images_dir = app_data_dir.join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).expect("failed to create images dir");
    }
    images_dir
}

#[tauri::command]
async fn save_clipboard_image(app: tauri::AppHandle, custom_dir: Option<String>) -> Result<Option<String>, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;

    if let Ok(image_data) = clipboard.get_image() {
        let width = image_data.width as u32;
        let height = image_data.height as u32;
        let image = image::RgbaImage::from_raw(width, height, image_data.bytes.into_owned())
            .ok_or("Failed to create image buffer")?;

        let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
        let file_name = format!("img_{}.png", timestamp);
        let file_path = get_images_dir(&app, custom_dir).join(&file_name);

        image.save_with_format(&file_path, ImageFormat::Png)
            .map_err(|e| e.to_string())?;

        return Ok(Some(file_path.to_string_lossy().to_string()));
    }

    Ok(None)
}"#;
        assert!(is_likely_code(main_rs_content));
    }
}
