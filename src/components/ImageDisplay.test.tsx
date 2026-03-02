import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ImageDisplay } from './ImageDisplay';
import { ClipItem, ImageType } from '../types';
import { detectImageType } from '../utils';
import * as imageCache from '../utils/imageCache';

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    callback([{ isIntersecting: true } as IntersectionObserverEntry], this as any);
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
  const ecombdimgUrl = 'https://p3-aio.ecombdimg.com/obj/ecom-shop-material/png_m_02e078bc29d0cdc128c63939651a6737_sx_1153226_www1440-1440';

  beforeEach(() => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockImplementation(() => new Promise<string>(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect HTTP URL images correctly', () => {
    const httpUrl = 'https://example.com/image.png';
    const imageType = detectImageType(httpUrl);
    expect(imageType).toBe(ImageType.HttpUrl);
  });

  it('should detect extensionless ecombdimg material URLs as HTTP image', () => {
    const imageType = detectImageType(ecombdimgUrl);
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

  it('should render extensionless ecombdimg image URL as clickable link', () => {
    const item = {
      id: 1,
      text: ecombdimgUrl,
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    } as ClipItem;

    render(<ImageDisplay item={item} showLinkInfo={true} />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(ecombdimgUrl);
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

  beforeEach(() => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockImplementation(() => new Promise<string>(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('should fallback to original URL when HTTP fetch cache fails', async () => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);

    const { container } = render(<ImageDisplay item={item} />);

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe(httpUrl);
  });

  it('should show HTTP error message after img onError', async () => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);

    const { container } = render(<ImageDisplay item={item} />);
    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    const img = container.querySelector('img');
    expect(img).toBeTruthy();

    fireEvent.error(img!);

    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
      expect(screen.getByText(/无法加载网络图片/)).toBeDefined();
    });
  });

  it('should hide link info after entering error state', async () => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/broken-image.png';
    const item = createMockClipItem(httpUrl);

    const { container } = render(<ImageDisplay item={item} showLinkInfo={true} />);
    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    const img = container.querySelector('img');
    fireEvent.error(img!);

    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    expect(screen.queryAllByRole('link').length).toBe(0);
  });

  it('should show loading state before error and hide spinner after error', async () => {
    vi.spyOn(imageCache, 'fetchAndCacheImage').mockRejectedValue(new Error('Network error'));

    const httpUrl = 'https://example.com/image.png';
    const item = createMockClipItem(httpUrl);

    const { container } = render(<ImageDisplay item={item} />);
    expect(screen.getByText('加载中...')).toBeDefined();

    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy();
    });
    const img = container.querySelector('img');
    fireEvent.error(img!);

    await waitFor(() => {
      expect(screen.getByText('图片加载失败')).toBeDefined();
    });

    expect(screen.queryByText('加载中...')).toBeNull();
    expect(container.querySelector('.animate-spin')).toBeNull();
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
});
