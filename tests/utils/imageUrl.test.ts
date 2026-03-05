import { describe, it, expect, vi } from 'vitest';

// Mock Tauri's convertFileSrc before importing the module
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `https://asset.localhost/${encodeURIComponent(path)}`,
}));

import { extractFormatLabel, formatBytes, resolveImageSrc } from '../../src/utils/imageUrl';

// ============================================================================
// extractFormatLabel
// ============================================================================

describe('extractFormatLabel', () => {
  describe('Base64 data URLs', () => {
    it('should extract PNG from data:image/png;base64,...', () => {
      expect(extractFormatLabel('data:image/png;base64,iVBOR...')).toBe('PNG');
    });

    it('should extract JPEG from data:image/jpeg;base64,...', () => {
      expect(extractFormatLabel('data:image/jpeg;base64,/9j/...')).toBe('JPEG');
    });

    it('should extract GIF from data:image/gif;base64,...', () => {
      expect(extractFormatLabel('data:image/gif;base64,R0lG...')).toBe('GIF');
    });

    it('should extract SVG from data:image/svg+xml;base64,...', () => {
      expect(extractFormatLabel('data:image/svg+xml;base64,PHN2Zy...')).toBe('SVG');
    });

    it('should extract WEBP from data:image/webp;base64,...', () => {
      expect(extractFormatLabel('data:image/webp;base64,UklG...')).toBe('WEBP');
    });

    it('should return null for malformed data URL without semicolon', () => {
      expect(extractFormatLabel('data:image/png')).toBeNull();
    });
  });

  describe('HTTP/HTTPS URLs', () => {
    it('should extract JPG from URL with .jpg extension', () => {
      expect(extractFormatLabel('https://example.com/photo.jpg')).toBe('JPG');
    });

    it('should extract PNG from URL with query parameters', () => {
      expect(extractFormatLabel('https://example.com/image.png?w=800&h=600')).toBe('PNG');
    });

    it('should extract GIF from URL with hash fragment', () => {
      expect(extractFormatLabel('https://example.com/anim.gif#preview')).toBe('GIF');
    });

    it('should handle uppercase extensions', () => {
      expect(extractFormatLabel('https://cdn.example.com/PHOTO.JPEG')).toBe('JPEG');
    });

    it('should handle mixed case extensions', () => {
      expect(extractFormatLabel('https://cdn.example.com/photo.Png')).toBe('PNG');
    });

    it('should extract from complex CDN paths', () => {
      expect(extractFormatLabel('https://img95.699pic.com/photo/50059/8720.jpg')).toBe('JPG');
    });

    it('should return null for URLs without image extensions', () => {
      expect(extractFormatLabel('https://example.com/page.html')).toBeNull();
    });

    it('should return null for extensionless URLs', () => {
      expect(extractFormatLabel('https://example.com/image')).toBeNull();
    });

    it('should handle newer formats like AVIF, HEIC, JXL', () => {
      expect(extractFormatLabel('https://example.com/photo.avif')).toBe('AVIF');
      expect(extractFormatLabel('https://example.com/photo.heic')).toBe('HEIC');
      expect(extractFormatLabel('https://example.com/photo.jxl')).toBe('JXL');
    });
  });

  describe('Local file paths', () => {
    it('should extract PNG from Windows path', () => {
      expect(extractFormatLabel('C:\\Users\\User\\photo.png')).toBe('PNG');
    });

    it('should extract JPG from Unix path', () => {
      expect(extractFormatLabel('/home/user/photos/vacation.jpg')).toBe('JPG');
    });

    it('should extract from path with spaces', () => {
      expect(extractFormatLabel('/home/user/My Photos/image (1).webp')).toBe('WEBP');
    });

    it('should return null for non-image file', () => {
      expect(extractFormatLabel('/home/user/document.pdf')).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty string', () => {
      expect(extractFormatLabel('')).toBeNull();
    });

    it('should return null for plain text', () => {
      expect(extractFormatLabel('hello world')).toBeNull();
    });

    it('should handle malformed URLs gracefully', () => {
      expect(extractFormatLabel('not://a valid url with spaces.png')).toBe('PNG');
    });
  });
});

// ============================================================================
// formatBytes
// ============================================================================

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format negative values as 0 Bytes', () => {
    expect(formatBytes(-100)).toBe('0 Bytes');
  });

  it('should format NaN as 0 Bytes', () => {
    expect(formatBytes(NaN)).toBe('0 Bytes');
  });

  it('should format Infinity as 0 Bytes', () => {
    expect(formatBytes(Infinity)).toBe('0 Bytes');
  });

  it('should format bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should respect custom decimals', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    expect(formatBytes(1536, 3)).toBe('1.5 KB');
  });
});

// ============================================================================
// resolveImageSrc
// ============================================================================

describe('resolveImageSrc', () => {
  it('should return data URLs unchanged', () => {
    const dataUrl = 'data:image/png;base64,iVBOR...';
    expect(resolveImageSrc(dataUrl)).toBe(dataUrl);
  });

  it('should return HTTP URLs unchanged', () => {
    const httpUrl = 'https://example.com/image.png';
    expect(resolveImageSrc(httpUrl)).toBe(httpUrl);
  });

  it('should convert local file paths via convertFileSrc', () => {
    const localPath = 'C:\\Users\\User\\photo.png';
    const result = resolveImageSrc(localPath);
    expect(result).toContain('asset.localhost');
  });

  it('should convert file:// URIs via convertFileSrc', () => {
    const fileUri = 'file:///home/user/photo.jpg';
    const result = resolveImageSrc(fileUri);
    expect(result).toContain('asset.localhost');
  });

  it('should convert Unix absolute paths via convertFileSrc', () => {
    const unixPath = '/home/user/photo.png';
    const result = resolveImageSrc(unixPath);
    expect(result).toContain('asset.localhost');
  });
});
