import { describe, it, expect } from 'vitest';
import { decodeFileList, detectImageType, detectType, isFileList } from './index';
import { ImageType } from '../types';

describe('decodeFileList', () => {
  it('should recognize CRLF [FILES] prefix as file-list payload', () => {
    const text = '[FILES]\r\nC:\\A\\1.jpg\r\n';
    expect(isFileList(text)).toBe(true);
    expect(detectType(text)).toBe('files');
  });

  it('should recognize [FILES] payload with BOM and leading whitespace', () => {
    const text = '\uFEFF   [FILES]\nC:\\A\\1.jpg\n';
    expect(isFileList(text)).toBe(true);
    expect(detectType(text)).toBe('files');
    expect(decodeFileList(text)).toEqual(['C:\\A\\1.jpg']);
  });

  it('should recognize lowercase [files] prefix', () => {
    const text = '[files]\nC:\\A\\1.jpg\n';
    expect(isFileList(text)).toBe(true);
    expect(detectType(text)).toBe('files');
  });

  it('should recognize prefix with spaces before newline', () => {
    const text = '[FILES]   \r\nC:\\A\\1.jpg\r\n';
    expect(isFileList(text)).toBe(true);
    expect(detectType(text)).toBe('files');
    expect(decodeFileList(text)).toEqual(['C:\\A\\1.jpg']);
  });

  it('should decode payload that uses visible arrow separator', () => {
    const text = '[FILES] ↵ C:\\A\\1.jpg ↵ C:\\B\\2.jpg';
    expect(isFileList(text)).toBe(true);
    expect(detectType(text)).toBe('files');
    expect(decodeFileList(text)).toEqual(['C:\\A\\1.jpg', 'C:\\B\\2.jpg']);
  });

  it('should trim CRLF lines and keep valid file paths', () => {
    const text = '[FILES]\nC:\\A\\1.jpg\r\nC:\\B\\2.png\r\n';
    expect(decodeFileList(text)).toEqual(['C:\\A\\1.jpg', 'C:\\B\\2.png']);
  });

  it('should ignore empty or whitespace-only lines', () => {
    const text = '[FILES]\n\r\n   \nC:\\A\\1.jpg\n';
    expect(decodeFileList(text)).toEqual(['C:\\A\\1.jpg']);
  });
});

describe('detectImageType - HTTP/HTTPS Link Detection', () => {
  describe('HTTP URLs', () => {
    it('should detect HTTP image URLs with common extensions', () => {
      const testCases = [
        'http://example.com/image.jpg',
        'http://example.com/photo.jpeg',
        'http://example.com/picture.png',
        'http://example.com/animation.gif',
        'http://example.com/graphic.webp',
        'http://example.com/vector.svg',
        'http://example.com/bitmap.bmp',
        'http://example.com/icon.ico',
        'http://example.com/photo.tiff',
        'http://example.com/photo.tif',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should detect HTTP image URLs with query parameters', () => {
      const testCases = [
        'http://example.com/image.jpg?size=large',
        'http://example.com/photo.png?width=800&height=600',
        'http://example.com/picture.gif?v=1.0',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should NOT detect HTTP URLs without image extensions', () => {
      const testCases = [
        'http://example.com',
        'http://example.com/page.html',
        'http://example.com/document.pdf',
        'http://example.com/video.mp4',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.None);
      });
    });
  });

  describe('HTTPS URLs', () => {
    it('should detect HTTPS image URLs with common extensions', () => {
      const testCases = [
        'https://example.com/image.jpg',
        'https://example.com/photo.jpeg',
        'https://example.com/picture.png',
        'https://example.com/animation.gif',
        'https://example.com/graphic.webp',
        'https://example.com/vector.svg',
        'https://example.com/bitmap.bmp',
        'https://example.com/icon.ico',
        'https://example.com/photo.tiff',
        'https://example.com/photo.tif',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should detect HTTPS image URLs with query parameters', () => {
      const testCases = [
        'https://example.com/image.jpg?size=large',
        'https://example.com/photo.png?width=800&height=600',
        'https://example.com/picture.gif?v=1.0',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should detect HTTPS image URLs with fragments', () => {
      const testCases = [
        'https://example.com/image.jpg#section1',
        'https://example.com/photo.png?size=large#preview',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should NOT detect HTTPS URLs without image extensions', () => {
      const testCases = [
        'https://example.com',
        'https://example.com/page.html',
        'https://example.com/document.pdf',
        'https://example.com/video.mp4',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.None);
      });
    });
  });

  describe('Real-world image URLs', () => {
    it('should detect real CDN image URLs', () => {
      const testCases = [
        'https://cdn.example.com/images/photo-123.jpg',
        'https://images.example.com/uploads/2024/01/picture.png',
        'https://static.example.com/assets/logo.svg',
        'https://s3.amazonaws.com/bucket/image.webp',
        'https://img95.699pic.com/photo/50059/8720.jpg_wh300.jpg!/fh/300/quality/90',
        'https://p3-aio.ecombdimg.com/obj/ecom-shop-material/png_m_02e078bc29d0cdc128c63939651a6737_sx_1153226_www1440-1440',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should classify CDN-style transformed links as image-url type', () => {
      const url = 'https://img95.699pic.com/photo/50059/8720.jpg_wh300.jpg!/fh/300/quality/90';
      expect(detectType(url)).toBe('image-url');
    });

    it('should classify extensionless ecombdimg material links as image-url type', () => {
      const url = 'https://p3-aio.ecombdimg.com/obj/ecom-shop-material/png_m_02e078bc29d0cdc128c63939651a6737_sx_1153226_www1440-1440';
      expect(detectType(url)).toBe('image-url');
    });

    it('should detect image URLs with complex paths', () => {
      const testCases = [
        'https://example.com/api/v1/images/thumbnail.jpg',
        'https://example.com/user/profile/avatar.png',
        'https://example.com/content/2024/01/15/photo.gif',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      expect(detectImageType('')).toBe(ImageType.None);
    });

    it('should handle URLs with uppercase extensions', () => {
      const testCases = [
        'https://example.com/image.JPG',
        'https://example.com/photo.PNG',
        'https://example.com/picture.GIF',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });

    it('should handle URLs with mixed case extensions', () => {
      const testCases = [
        'https://example.com/image.JpG',
        'https://example.com/photo.PnG',
        'https://example.com/picture.GiF',
      ];

      testCases.forEach(url => {
        expect(detectImageType(url)).toBe(ImageType.HttpUrl);
      });
    });
  });

  describe('Non-HTTP/HTTPS content', () => {
    it('should detect Base64 images', () => {
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(detectImageType(base64Image)).toBe(ImageType.Base64);
    });

    it('should detect local file paths', () => {
      const testCases = [
        '/home/user/pictures/photo.jpg',
        'C:\\Users\\User\\Pictures\\photo.png',
        'C:\\Users\\User\\Pictures\\剪贴板图片 (1).jpg',
        'file:///home/user/image.gif',
      ];

      testCases.forEach(path => {
        expect(detectImageType(path)).toBe(ImageType.LocalFile);
      });
    });

    it('should return None for plain text', () => {
      const testCases = [
        'Hello, world!',
        'This is just text',
        'Not an image',
      ];

      testCases.forEach(text => {
        expect(detectImageType(text)).toBe(ImageType.None);
      });
    });
  });

  describe('Code pattern detection - preventing false positives', () => {
    it('should NOT detect Rust code with image-related strings as images', () => {
      const rustCode = `fn save_clipboard_image() -> Result<String, String> {
    let file_name = format!("img_{}.png", timestamp);
    let file_path = get_images_dir().join(&file_name);
    image.save_with_format(&file_path, ImageFormat::Png)?;
    Ok(file_path.to_string_lossy().to_string())
}`;
      expect(detectImageType(rustCode)).toBe(ImageType.None);
    });

    it('should NOT detect JavaScript code with image paths as images', () => {
      const jsCode = `function loadImage() {
  const imagePath = "/images/photo.jpg";
  return fetch(imagePath);
}`;
      expect(detectImageType(jsCode)).toBe(ImageType.None);
    });

    it('should NOT detect TypeScript code with image extensions as images', () => {
      const tsCode = `const imageExtensions = ['.jpg', '.png', '.gif'];
const isImage = (file: string) => imageExtensions.some(ext => file.endsWith(ext));`;
      expect(detectImageType(tsCode)).toBe(ImageType.None);
    });

    it('should NOT detect Python code with image paths as images', () => {
      const pythonCode = `def save_image(path):
    filename = f"img_{timestamp}.png"
    image.save(os.path.join(path, filename))`;
      expect(detectImageType(pythonCode)).toBe(ImageType.None);
    });

    it('should NOT detect code with function calls containing image paths', () => {
      const testCases = [
        'save_image("/path/to/image.jpg")',
        'loadImage("photo.png")',
        'const img = require("./assets/logo.svg")',
        'import icon from "./images/icon.png"',
      ];

      testCases.forEach(code => {
        expect(detectImageType(code)).toBe(ImageType.None);
      });
    });

    it('should NOT detect code with variable assignments', () => {
      const testCases = [
        'const imagePath = "/home/user/photo.jpg"',
        'let file = "C:\\\\Users\\\\photo.png"',
        'var img = "image.gif"',
      ];

      testCases.forEach(code => {
        expect(detectImageType(code)).toBe(ImageType.None);
      });
    });

    it('should NOT detect code with comments containing image paths', () => {
      const testCases = [
        '// Load image from /path/to/image.jpg',
        '/* Save to C:\\\\Users\\\\photo.png */',
        '# Image path: /home/user/image.gif',
      ];

      testCases.forEach(code => {
        expect(detectImageType(code)).toBe(ImageType.None);
      });
    });

    it('should NOT detect code with control flow statements', () => {
      const testCases = [
        'if (file.endsWith(".jpg")) { return true; }',
        'for (const img of images) { process(img); }',
        'while (hasImages) { loadNext(); }',
        'return "/path/to/image.png"',
      ];

      testCases.forEach(code => {
        expect(detectImageType(code)).toBe(ImageType.None);
      });
    });

    it('should NOT detect Rust attributes and macros', () => {
      const testCases = [
        '#[tauri::command]\nasync fn save_image() {}',
        'println!("Saved to image.jpg")',
        'format!("img_{}.png", id)',
      ];

      testCases.forEach(code => {
        expect(detectImageType(code)).toBe(ImageType.None);
      });
    });

    it('should NOT detect multi-line code files', () => {
      const multiLineCode = `use std::path::PathBuf;
use image::ImageFormat;

fn get_images_dir() -> PathBuf {
    let images_dir = app_data_dir.join("images");
    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).expect("failed to create images dir");
    }
    images_dir
}

async fn save_clipboard_image() -> Result<Option<String>, String> {
    let timestamp = Local::now().format("%Y%m%d%H%M%S%f");
    let file_name = format!("img_{}.png", timestamp);
    let file_path = get_images_dir().join(&file_name);
    
    image.save_with_format(&file_path, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
        
    Ok(Some(file_path.to_string_lossy().to_string()))
}`;
      expect(detectImageType(multiLineCode)).toBe(ImageType.None);
    });
  });

  describe('Valid standalone image paths - should still work', () => {
    it('should detect clean Unix file paths', () => {
      const testCases = [
        '/home/user/photos/vacation.jpg',
        '/var/www/images/logo.png',
        '/tmp/screenshot.gif',
      ];

      testCases.forEach(path => {
        expect(detectImageType(path)).toBe(ImageType.LocalFile);
      });
    });

    it('should detect clean Windows file paths', () => {
      const testCases = [
        'C:\\Users\\John\\Pictures\\photo.jpg',
        'D:\\Images\\banner.png',
        'E:\\Downloads\\image.webp',
      ];

      testCases.forEach(path => {
        expect(detectImageType(path)).toBe(ImageType.LocalFile);
      });
    });

    it('should detect file:// URIs', () => {
      const testCases = [
        'file:///home/user/image.jpg',
        'file:///C:/Users/photo.png',
        'file:///var/images/logo.svg',
      ];

      testCases.forEach(path => {
        expect(detectImageType(path)).toBe(ImageType.LocalFile);
      });
    });
  });
});
