/**
 * 图片 Blob URL LRU 缓存
 *
 * 设计要点：
 * - 利用 Map 插入序维护 LRU 顺序，get 时 delete→re-insert
 * - 淘汰时自动 `URL.revokeObjectURL` 释放 Blob 内存
 * - 支持条目数 + 字节数双重上限
 * - `fetchAndCacheImage` 内置请求去重，避免并发重复 fetch
 *
 * 与 useImageResource 中 memCache 的关系：
 * - 本模块管理 HTTP 图片的 **Blob URL 生命周期**（创建 & 回收）
 * - memCache 管理 **所有类型** 图片已解析 src 的瞬时缓存（含 loaded 状态），
 *   用于跨组件 re-render 时跳过重新解析
 */

const BYTES_PER_MB = 1024 * 1024;

/** fetchAndCacheImage 中超过此大小的图片会输出控制台警告 */
const LARGE_IMAGE_WARNING_MB = 10;

// ============================================================================
// LRU Cache
// ============================================================================

interface CacheEntry {
  blobUrl: string;
  /** Blob 字节大小（用于内存上限判断） */
  size: number;
}

export class ImageLRUCache {
  private readonly map = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private usedBytes = 0;

  /**
   * @param maxEntries 最大条目数（默认 10）
   * @param maxMemoryMB 最大内存占用 MB（默认 20）
   */
  constructor(maxEntries = 10, maxMemoryMB = 20) {
    this.maxEntries = maxEntries;
    this.maxBytes = maxMemoryMB * BYTES_PER_MB;
  }

  /**
   * 获取缓存的 Blob URL。命中时自动提升为最近使用。
   */
  get(key: string): string | null {
    const entry = this.map.get(key);
    if (!entry) return null;

    // delete→re-insert 保持 Map 尾部 = 最近使用
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.blobUrl;
  }

  /**
   * 存入 Blob URL。已存在相同 key 时先回收旧 Blob。
   * @param size Blob 字节大小（为 0 时不参与内存上限判断）
   */
  set(key: string, blobUrl: string, size = 0): void {
    // 已存在：先回收旧条目
    const old = this.map.get(key);
    if (old) {
      URL.revokeObjectURL(old.blobUrl);
      this.usedBytes -= old.size;
      this.map.delete(key);
    }

    // 淘汰直到满足 条目 + 内存 双重上限
    while (
      this.map.size > 0 &&
      (this.map.size >= this.maxEntries || this.usedBytes + size > this.maxBytes)
    ) {
      this.evictOldest();
    }

    this.map.set(key, { blobUrl, size });
    this.usedBytes += size;
  }

  /** 检查 key 是否存在 */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /** 移除并回收指定 key 的 Blob URL */
  remove(key: string): void {
    const entry = this.map.get(key);
    if (!entry) return;
    URL.revokeObjectURL(entry.blobUrl);
    this.usedBytes -= entry.size;
    this.map.delete(key);
  }

  /** 清空全部条目并回收所有 Blob URL */
  clear(): void {
    for (const entry of this.map.values()) {
      URL.revokeObjectURL(entry.blobUrl);
    }
    this.map.clear();
    this.usedBytes = 0;
  }

  /** 当前缓存条目数 */
  size(): number {
    return this.map.size;
  }

  /** 当前内存占用（字节） */
  getMemoryUsage(): number {
    return this.usedBytes;
  }

  /** 当前内存占用（MB） */
  getMemoryUsageMB(): number {
    return this.usedBytes / BYTES_PER_MB;
  }

  /** 统计信息（调试 / 监控） */
  getStats() {
    return {
      entries: this.map.size,
      memoryMB: this.getMemoryUsageMB(),
      maxEntries: this.maxEntries,
      maxMemoryMB: this.maxBytes / BYTES_PER_MB,
    } as const;
  }

  // ── 内部 ──

  /** 淘汰 Map 首条（最久未使用） */
  private evictOldest(): void {
    const first = this.map.keys().next().value;
    if (first !== undefined) this.remove(first);
  }
}

// ============================================================================
// 全局单例
// ============================================================================

let instance: ImageLRUCache | null = null;

/** 获取全局 ImageLRUCache 单例 */
export function getImageCache(): ImageLRUCache {
  if (!instance) instance = new ImageLRUCache(10);
  return instance;
}

/** 重置全局缓存（测试用） */
export function resetImageCache(): void {
  instance?.clear();
  instance = null;
}

// ============================================================================
// fetchAndCacheImage — 带去重的 HTTP 图片 Blob 化
// ============================================================================

/** 正在进行中的 fetch 请求（避免同一 URL 多次并发） */
const pendingFetches = new Map<string, Promise<string>>();

/**
 * 获取 HTTP 图片并缓存为 Blob URL。
 *
 * - 跨域图片直接返回原 URL（由 `<img>` 自行加载，避免 CORS 阻断）
 * - 同 URL 并发调用自动去重，共享同一 Promise
 *
 * @param url 图片 HTTP URL
 * @param timeoutMs 超时毫秒（默认 10 000）
 */
export async function fetchAndCacheImage(url: string, timeoutMs = 10_000): Promise<string> {
  // 跨域检测：跨域图片 fetch 会被 CORS 拦截，改由 <img> 直接加载
  try {
    if (typeof window !== 'undefined') {
      const parsed = new URL(url, window.location.href);
      if (parsed.origin !== window.location.origin) return url;
    }
  } catch { /* 非标准 URL → 走下方 fetch 路径 */ }

  const cache = getImageCache();

  // 缓存命中
  const cached = cache.get(url);
  if (cached) return cached;

  // 去重：复用正在进行的请求
  const inflight = pendingFetches.get(url);
  if (inflight) return inflight;

  const promise = doFetch(cache, url, timeoutMs);
  pendingFetches.set(url, promise);

  // 无论成功或失败都清除 pending（catch 吞掉拒绝以防 unhandled rejection）
  promise.catch(() => {}).finally(() => { pendingFetches.delete(url); });

  return promise;
}

/** 实际 fetch 逻辑（内部） */
async function doFetch(cache: ImageLRUCache, url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/webp,image/avif,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      cache: 'default',
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);

    // 大图警告
    const cl = res.headers.get('content-length');
    if (cl) {
      const mb = parseInt(cl, 10) / BYTES_PER_MB;
      if (mb > LARGE_IMAGE_WARNING_MB) {
        console.warn(`Large image detected: ${mb.toFixed(2)}MB — ${url}`);
      }
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    cache.set(url, blobUrl, blob.size);
    return blobUrl;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('图片加载超时，请检查网络连接');
    }
    throw err;
  }
}
