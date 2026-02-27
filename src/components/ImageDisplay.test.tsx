import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ImageDisplay } from './ImageDisplay';
import { ClipItem, ImageType } from '../types';
import { detectImageType } from '../utils';
import * as imageCache from '../utils/imageCache';

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    // Immediately trigger the callback with intersecting entry
    setTimeout(() => {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], this as any);
    }, 0);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() { return []; }
  get root() { return null; }
  get rootMargin() { return ''; }
  get thresholds() { return []; }
}

global.IntersectionObserver = MockIntersectionObserver as any;

describe('ImageDisplay - Link URL Display', () => {
  it('should detect HTTP URL images correctly', () => {
    const httpUrl = 'https://example.com/image.png';
    const imageType = detectImageType(httpUrl);
    expect(imageType).toBe(ImageType.HttpUrl);
  });

  it('should detect base64 images correctly', () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imageType = detectImageType(base64Image);
    expect(imageType).toBe(ImageType.Base64);
  });

  it('should not detect non-image URLs as images', () => {
    const textUrl = 'https://example.com/page.html';
    const imageType = detectImageType(textUrl);
    expect(imageType).toBe(ImageType.None);
  });

  it('should handle various image extensions', () => {
    const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    extensions.forEach(ext => {
      const url = `https://example.com/image${ext}`;
      const imageType = detectImageType(url);
      expect(imageType).toBe(ImageType.HttpUrl);
    });
  });
});

describe('ImageDisplay - URL Click Functionality', () => {
  const createMockClipItem = (text: string): ClipItem => ({
    id: 1,
    text,
    timestamp: Date.now(),
    is_pinned: 0,
    is_snippet: 0,
    is_favorite: 0,
    tags: [],
    picked_color: null,
  });

  it('should render clickable link for HTTP URL images', () => {
    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe(httpUrl);
  });

  it('should have target="_blank" attribute for opening in new tab', () => {
    const httpUrl = 'https://example.com/image.jpg';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('should have rel="noopener noreferrer" for security', () => {
    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should display the URL text in the link', () => {
    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link.textContent).toBe(httpUrl);
  });

  it('should not render link when showLinkInfo is false', () => {
    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={false} />);
    
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  it('should not render link for base64 images', () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const item = createMockClipItem(base64Image);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  it('should handle HTTPS URLs correctly', () => {
    const httpsUrl = 'https://secure.example.com/photo.jpg';
    const item = createMockClipItem(httpsUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(httpsUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should handle HTTP URLs correctly', () => {
    const httpUrl = 'http://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(httpUrl);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('should have hover styles for better UX', () => {
    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    const link = screen.getByRole('link');
    const className = link.getAttribute('class') || '';
    
    // Check for hover-related classes
    expect(className).toContain('hover:text-blue-600');
  });
});

describe('ImageDisplay - Lazy Loading', () => {
  const createMockClipItem = (text: string): ClipItem => ({
    id: 1,
    text,
    timestamp: Date.now(),
    is_pinned: 0,
    is_snippet: 0,
    is_favorite: 0,
    tags: [],
    picked_color: null,
  });

  it('should have loading="lazy" attribute for browser-native lazy loading', async () => {
    // Mock fetchAndCacheImage directly to bypass fetch/cache complexity
    const spy = vi.spyOn(imageCache, 'fetchAndCacheImage').mockResolvedValue('blob:mock-url');

    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for the image to load
    const img = await waitFor(() => screen.getByRole('img'));
    expect(img.getAttribute('loading')).toBe('lazy');
    spy.mockRestore();
  });

  it('should have loading="lazy" for base64 images', async () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const item = createMockClipItem(base64Image);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for the image to load
    const img = await waitFor(() => screen.getByRole('img'));
    expect(img.getAttribute('loading')).toBe('lazy');
  });
});


describe('ImageDisplay - Error Handling', () => {
  const createMockClipItem = (text: string): ClipItem => ({
    id: 1,
    text,
    timestamp: Date.now(),
    is_pinned: 0,
    is_snippet: 0,
    is_favorite: 0,
    tags: [],
    picked_color: null,
  });

  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
  });

  it('should display error message when HTTP image fails to load', async () => {
    // Mock fetch to fail
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for error message to appear
    const errorMessage = await waitFor(() => 
      screen.getByText(/无法加载网络图片/i)
    );
    expect(errorMessage).toBeDefined();
  });

  it('should display error icon when image fails to load', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for error state and check for SVG icon
    await waitFor(() => {
      const svg = document.querySelector('svg');
      expect(svg).toBeDefined();
      expect(svg?.classList.contains('text-red-500')).toBe(true);
    });
  });

  it('should display error message when HTTP image fails to load', async () => {
    // Mock fetch to fail
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
      expect(screen.getByText(/无法加载网络图片/)).toBeDefined();
    });
  });

  it('should display error icon when image fails to load', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Wait for error UI to appear
    await waitFor(() => {
      const errorIcon = screen.getByText('图片加载失败').closest('div')?.querySelector('svg');
      expect(errorIcon).toBeDefined();
    });
  });

  it('should show specific error message for HTTP URL images', async () => {
    // Mock fetchAndCacheImage to throw an error
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    await waitFor(() => {
      expect(screen.getByText(/无法加载网络图片，请检查网络连接或图片链接是否有效/)).toBeDefined();
    });
  });

  it('should show the original URL when HTTP image fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    await waitFor(() => {
      expect(screen.getByText(httpUrl)).toBeDefined();
    });
  });

  it('should not display image when error occurs', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    // Image should not be rendered
    const images = screen.queryAllByRole('img');
    expect(images.length).toBe(0);
  });

  it('should not show link info when error occurs', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} showLinkInfo={true} />);
    
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    // Link should not be rendered (only the URL text in error message)
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(0);
  });

  it('should handle onError event from img element', async () => {
    // Mock successful fetch but image load failure
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['invalid image data'], { type: 'image/png' }))
    });
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    const { container } = render(<ImageDisplay item={item} />);
    
    // Wait for image element to be created
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).toBeDefined();
    });

    // Simulate image load error using fireEvent (triggers React event handlers)
    const img = container.querySelector('img');
    if (img) {
      fireEvent.error(img);
    }

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });
  });

  it('should display error UI with proper styling', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    const { container } = render(<ImageDisplay item={item} />);
    
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    // Check for error container styling
    const errorContainer = container.querySelector('.border-dashed');
    expect(errorContainer).toBeDefined();
    expect(errorContainer?.className).toContain('border-neutral-300');
  });

  it('should show loading state before error', async () => {
    // Mock fetchAndCacheImage to throw an error after a delay
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockImplementation(() => 
      new Promise((_, reject) => setTimeout(() => reject(new Error('Network error')), 100))
    );

    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);
    
    render(<ImageDisplay item={item} />);
    
    // Should show loading state initially
    expect(screen.getByText('加载中...')).toBeDefined();

    // Should show error after loading fails
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    }, { timeout: 2000 });

    // Loading should be gone
    expect(screen.queryByText('加载中...')).toBeNull();
  });

  it('should handle base64 image errors with appropriate message', async () => {
    // Create an invalid base64 image that will fail to load
    const invalidBase64 = 'data:image/png;base64,INVALID_DATA';
    const item = createMockClipItem(invalidBase64);
    
    const { container } = render(<ImageDisplay item={item} />);
    
    // Wait for image to actually be rendered in the DOM
    await waitFor(() => {
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
    });

    // Simulate image load error using fireEvent (triggers React event handlers)
    const img = container.querySelector('img')!;
    fireEvent.error(img);

    // Should show base64-specific error message
    await waitFor(() => {
      expect(screen.getByText(/图片数据格式错误，无法显示/)).toBeDefined();
    });
  });

  it('should be visually distinct from loading state', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);
    
    const { container } = render(<ImageDisplay item={item} />);
    
    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    // Error state should have error icon (not spinner)
    const errorIcon = container.querySelector('svg');
    expect(errorIcon).toBeDefined();
    
    // Should not have loading spinner
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeNull();
  });

  it('should handle different error types gracefully', async () => {
    const testCases = [
      { error: new Error('Network error'), expectedText: '无法加载网络图片' },
      { error: new Error('Timeout'), expectedText: '无法加载网络图片' },
      { error: new Error('404 Not Found'), expectedText: '无法加载网络图片' },
    ];

    for (const testCase of testCases) {
      vi.clearAllMocks();
      vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(testCase.error);

      const httpUrl = 'https://example.com/image.png';
      const item = createMockClipItem(httpUrl);
      
      const { unmount } = render(<ImageDisplay item={item} />);
      
      await waitFor(() => {
        expect(screen.getByText(new RegExp(testCase.expectedText))).toBeDefined();
      });

      unmount();
    }
  });
});
