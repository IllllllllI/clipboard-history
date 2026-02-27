/**
 * LRU (Least Recently Used) Cache for image data
 * Caches image blob URLs to reduce network requests and improve loading performance
 */

const BYTES_PER_MB = 1024 * 1024;

/** fetchAndCacheImage 中超过此大小(MB)的图片会输出警告 */
const LARGE_IMAGE_WARNING_MB = 10;

interface CacheEntry {
  blobUrl: string;
  timestamp: number;
  size: number; // Approximate size in bytes
}

export class ImageLRUCache {
  private cache: Map<string, CacheEntry>;
  private maxEntries: number;
  private maxMemoryBytes: number;
  private currentMemoryBytes: number;

  /**
   * Creates a new ImageLRUCache
   * @param maxEntries Maximum number of images to cache (default: 50)
   * @param maxMemoryMB Maximum memory usage in MB (default: 100MB)
   */
  constructor(maxEntries: number = 50, maxMemoryMB: number = 100) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.maxMemoryBytes = maxMemoryMB * BYTES_PER_MB;
    this.currentMemoryBytes = 0;
  }

  /**
   * Gets a cached image blob URL
   * @param key The cache key (typically the image URL)
   * @returns The cached blob URL or null if not found
   */
  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Update timestamp to mark as recently used
    entry.timestamp = Date.now();
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.blobUrl;
  }

  /**
   * Stores an image blob URL in the cache
   * @param key The cache key (typically the image URL)
   * @param blobUrl The blob URL to cache
   * @param size Approximate size in bytes (optional)
   */
  set(key: string, blobUrl: string, size: number = 0): void {
    // If key already exists, remove old entry first
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      URL.revokeObjectURL(oldEntry.blobUrl);
      this.cache.delete(key);
      this.currentMemoryBytes -= oldEntry.size;
    }

    // Evict least recently used entries if cache is full (by count or memory)
    while ((this.cache.size >= this.maxEntries || this.currentMemoryBytes + size > this.maxMemoryBytes) 
           && this.cache.size > 0) {
      this.evictLRU();
    }

    // Add new entry
    const entry: CacheEntry = {
      blobUrl,
      timestamp: Date.now(),
      size
    };

    this.cache.set(key, entry);
    this.currentMemoryBytes += size;
  }

  /**
   * Checks if a key exists in the cache
   * @param key The cache key to check
   * @returns True if the key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Removes an entry from the cache
   * @param key The cache key to remove
   */
  remove(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      URL.revokeObjectURL(entry.blobUrl);
      this.cache.delete(key);
      this.currentMemoryBytes -= entry.size;
    }
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    // Revoke all blob URLs to free memory
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.cache.clear();
    this.currentMemoryBytes = 0;
  }

  /**
   * Gets the current number of cached entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Gets the current memory usage in bytes
   */
  getMemoryUsage(): number {
    return this.currentMemoryBytes;
  }

  /**
   * Gets the current memory usage in MB
   */
  getMemoryUsageMB(): number {
    return this.currentMemoryBytes / BYTES_PER_MB;
  }

  /**
   * Gets cache statistics for monitoring
   */
  getStats(): { entries: number; memoryMB: number; maxEntries: number; maxMemoryMB: number } {
    return {
      entries: this.cache.size,
      memoryMB: this.getMemoryUsageMB(),
      maxEntries: this.maxEntries,
      maxMemoryMB: this.maxMemoryBytes / BYTES_PER_MB,
    };
  }

  /**
   * Evicts the least recently used entry from the cache
   */
  private evictLRU(): void {
    // The first entry in the Map is the least recently used
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.remove(firstKey);
    }
  }
}

// Global singleton instance
let globalImageCache: ImageLRUCache | null = null;

/**
 * Gets the global image cache instance
 * @returns The global ImageLRUCache instance
 */
export function getImageCache(): ImageLRUCache {
  if (!globalImageCache) {
    globalImageCache = new ImageLRUCache(50);
  }
  return globalImageCache;
}

/**
 * Resets the global image cache (useful for testing)
 */
export function resetImageCache(): void {
  if (globalImageCache) {
    globalImageCache.clear();
    globalImageCache = null;
  }
}

/**
 * Fetches an image and caches it as a blob URL
 * @param url The image URL to fetch
 * @param timeoutMs Timeout in milliseconds (default: 10000ms = 10s)
 * @returns The blob URL for the image
 */
export async function fetchAndCacheImage(url: string, timeoutMs: number = 10000): Promise<string> {
  const cache = getImageCache();

  // Check if already cached
  const cachedUrl = cache.get(url);
  if (cachedUrl) {
    return cachedUrl;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Fetch the image with timeout and optimized headers
    const response = await fetch(url, { 
      signal: controller.signal,
      // Request compressed images when possible
      headers: {
        'Accept': 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      // Use 'no-cache' to allow browser caching but validate freshness
      cache: 'default',
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Check content length for large images
    const contentLength = response.headers.get('content-length');
    const sizeInMB = contentLength ? parseInt(contentLength) / BYTES_PER_MB : 0;
    
    // Warn about very large images
    if (sizeInMB > LARGE_IMAGE_WARNING_MB) {
      console.warn(`Large image detected: ${sizeInMB.toFixed(2)}MB - ${url}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Cache the blob URL
    cache.set(url, blobUrl, blob.size);

    return blobUrl;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('图片加载超时，请检查网络连接');
    }
    throw error;
  }
}
