import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageLRUCache, getImageCache, fetchAndCacheImage } from './imageCache';

describe('ImageLRUCache', () => {
  let cache: ImageLRUCache;

  beforeEach(() => {
    cache = new ImageLRUCache(3); // Small cache for testing
  });

  describe('Basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'blob:url1');
      expect(cache.get('key1')).toBe('blob:url1');
    });

    it('should return null for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'blob:url1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      cache.set('key1', 'blob:url1');
      expect(cache.size()).toBe(1);
      cache.set('key2', 'blob:url2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when cache is full', () => {
      cache.set('key1', 'blob:url1');
      cache.set('key2', 'blob:url2');
      cache.set('key3', 'blob:url3');
      
      // Cache is now full (3 items)
      expect(cache.size()).toBe(3);
      
      // Add a 4th item, should evict key1 (least recently used)
      cache.set('key4', 'blob:url4');
      
      expect(cache.size()).toBe(3);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should update LRU order when accessing items', () => {
      cache.set('key1', 'blob:url1');
      cache.set('key2', 'blob:url2');
      cache.set('key3', 'blob:url3');
      
      // Access key1, making it most recently used
      cache.get('key1');
      
      // Add a 4th item, should evict key2 (now least recently used)
      cache.set('key4', 'blob:url4');
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('Remove and clear', () => {
    it('should remove specific entries', () => {
      cache.set('key1', 'blob:url1');
      cache.set('key2', 'blob:url2');
      
      cache.remove('key1');
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'blob:url1');
      cache.set('key2', 'blob:url2');
      cache.set('key3', 'blob:url3');
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
    });
  });

  describe('Update existing entries', () => {
    it('should update existing entry without increasing size', () => {
      cache.set('key1', 'blob:url1');
      expect(cache.size()).toBe(1);
      
      cache.set('key1', 'blob:url1-updated');
      expect(cache.size()).toBe(1);
      expect(cache.get('key1')).toBe('blob:url1-updated');
    });
  });

  describe('Cache statistics', () => {
    it('should return correct cache statistics', () => {
      const stats = cache.getStats();
      expect(stats.entries).toBe(0);
      expect(stats.maxEntries).toBe(3);
      
      cache.set('key1', 'blob:url1', 1024);
      cache.set('key2', 'blob:url2', 2048);
      
      const updatedStats = cache.getStats();
      expect(updatedStats.entries).toBe(2);
      expect(updatedStats.memoryMB).toBeGreaterThan(0);
    });
  });
});

describe('getImageCache', () => {
  it('should return a singleton instance', () => {
    const cache1 = getImageCache();
    const cache2 = getImageCache();
    
    expect(cache1).toBe(cache2);
  });

  it('should maintain state across calls', () => {
    const cache1 = getImageCache();
    cache1.set('test', 'blob:test');
    
    const cache2 = getImageCache();
    expect(cache2.get('test')).toBe('blob:test');
  });
});

describe('fetchAndCacheImage', () => {
  beforeEach(() => {
    // Clear the global cache before each test
    getImageCache().clear();
    
    // Mock global fetch
    global.fetch = vi.fn();
    
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  });

  it('should fetch and cache an image', async () => {
    const mockBlob = new Blob(['image data'], { type: 'image/png' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => name === 'content-length' ? '1024' : null
      },
      blob: () => Promise.resolve(mockBlob)
    });

    const url = 'https://example.com/image.png';
    const blobUrl = await fetchAndCacheImage(url);

    expect(blobUrl).toBe('blob:mock-url');
    expect(getImageCache().has(url)).toBe(true);
  });

  it('should return cached URL on subsequent calls', async () => {
    const mockBlob = new Blob(['image data'], { type: 'image/png' });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => name === 'content-length' ? '1024' : null
      },
      blob: () => Promise.resolve(mockBlob)
    });

    const url = 'https://example.com/image.png';
    
    // First call - should fetch
    const blobUrl1 = await fetchAndCacheImage(url);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    
    // Second call - should use cache
    const blobUrl2 = await fetchAndCacheImage(url);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still only 1 call
    expect(blobUrl1).toBe(blobUrl2);
  });

  it('should throw error on fetch failure', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      statusText: 'Not Found'
    });

    const url = 'https://example.com/nonexistent.png';
    
    await expect(fetchAndCacheImage(url)).rejects.toThrow('Failed to fetch image: Not Found');
  });
});
