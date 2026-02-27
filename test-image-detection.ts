import { detectImageType } from './src/utils/index';
import { ImageType } from './src/types';

// Test with actual main.rs content
const mainRsContent = `// Prevents additional console window on Windows in release, DO NOT REMOVE!!
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
}`;

console.log('Testing main.rs content detection:');
const result = detectImageType(mainRsContent);
console.log(`Result: ${result}`);
console.log(`Expected: ${ImageType.None}`);
console.log(`Test ${result === ImageType.None ? 'PASSED ✓' : 'FAILED ✗'}`);

// Test with actual standalone image paths
console.log('\n\nTesting standalone image paths:');
const testPaths = [
    '/home/user/photo.jpg',
    'C:\\Users\\User\\Pictures\\photo.png',
    'file:///home/user/image.gif',
    'https://example.com/image.jpg'
];

testPaths.forEach(path => {
    const result = detectImageType(path);
    const expected = path.startsWith('http') ? ImageType.HttpUrl : ImageType.LocalFile;
    console.log(`Path: ${path}`);
    console.log(`Result: ${result}, Expected: ${expected}`);
    console.log(`Test ${result === expected ? 'PASSED ✓' : 'FAILED ✗'}\n`);
});
