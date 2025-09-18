import { Cue } from '../types';

interface CacheEntry {
  cues: Cue[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class SubtitleCache {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultTTL = 1000 * 60 * 30; // 30 minutes
  private readonly maxCacheSize = 50;

  set(videoId: string, cues: Cue[], ttl?: number): void {
    // 清理過期的快取項目
    this.cleanup();
    
    // 如果快取已滿，移除最舊的項目
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(videoId, {
      cues: [...cues], // 深拷貝避免引用問題
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  get(videoId: string): Cue[] | null {
    const entry = this.cache.get(videoId);
    
    if (!entry) {
      return null;
    }

    // 檢查是否過期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(videoId);
      return null;
    }

    return [...entry.cues]; // 回傳深拷貝
  }

  has(videoId: string): boolean {
    const entry = this.cache.get(videoId);
    if (!entry) return false;
    
    // 檢查是否過期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(videoId);
      return false;
    }
    
    return true;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(videoId: string): boolean {
    return this.cache.delete(videoId);
  }

  // 預載字幕 - 在背景下載但不阻塞 UI
  async preload(videoId: string): Promise<void> {
    if (this.has(videoId)) {
      return; // 已經有快取了
    }

    try {
      const response = await fetch(`/api/transcript?videoId=${encodeURIComponent(videoId)}`);
      if (response.ok) {
        const data = await response.json();
        this.set(videoId, data.cues || []);
      }
    } catch (error) {
      console.warn('預載字幕失敗:', error);
      // 預載失敗不應該影響主要功能
    }
  }

  // 批量預載相關影片的字幕
  async preloadBatch(videoIds: string[]): Promise<void> {
    const preloadPromises = videoIds
      .filter(id => !this.has(id))
      .map(id => this.preload(id));
    
    // 使用 Promise.allSettled 確保部分失敗不會影響其他預載
    await Promise.allSettled(preloadPromises);
  }

  private cleanup(): void {
    const now = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  // 獲取快取統計資訊
  getStats() {
    this.cleanup(); // 先清理過期項目
    
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        videoId: key,
        cueCount: entry.cues.length,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl
      }))
    };
  }
}

// 單例模式，確保全域只有一個快取實例
export const subtitleCache = new SubtitleCache();