import crypto from 'crypto';
import memoizee from 'memoizee';
import type { Lead } from '@shared/schema';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  hitCount: number;
  lastAccessed: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  strategy?: 'LRU' | 'FIFO' | 'LFU'; // Cache eviction strategy
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
  averageResponseTime: number;
  memoryUsage: number;
}

/**
 * Advanced caching service with multi-tier caching, intelligent preloading,
 * and performance monitoring
 */
export class CacheManager {
  private caches: Map<string, Map<string, CacheEntry<any>>> = new Map();
  private stats: Map<string, CacheStats> = new Map();
  private preloadQueue: Set<string> = new Set();
  private memoryLimit: number = 100 * 1024 * 1024; // 100MB limit
  
  // Tiered cache TTLs (in milliseconds)
  private readonly cacheTiers = {
    critical: 5 * 60 * 1000,         // 5 minutes for critical real-time data
    frequent: 30 * 60 * 1000,        // 30 minutes for frequently accessed data
    standard: 60 * 60 * 1000,        // 1 hour for standard data
    stable: 6 * 60 * 60 * 1000,      // 6 hours for stable data
    persistent: 24 * 60 * 60 * 1000, // 24 hours for rarely changing data
    permanent: 72 * 60 * 60 * 1000   // 72 hours for static data
  };

  // Service-specific cache configurations
  private readonly serviceCacheConfig = {
    'hunter-verification': { 
      ttl: this.cacheTiers.persistent, 
      maxSize: 10000,
      strategy: 'LRU' as const
    },
    'numverify-validation': { 
      ttl: this.cacheTiers.persistent, 
      maxSize: 10000,
      strategy: 'LRU' as const
    },
    'lead-enrichment': { 
      ttl: this.cacheTiers.stable, 
      maxSize: 5000,
      strategy: 'LRU' as const
    },
    'ucc-filings': { 
      ttl: this.cacheTiers.standard, 
      maxSize: 2000,
      strategy: 'LFU' as const
    },
    'market-insights': { 
      ttl: this.cacheTiers.frequent, 
      maxSize: 100,
      strategy: 'FIFO' as const
    },
    'predictive-analytics': { 
      ttl: this.cacheTiers.stable, 
      maxSize: 1000,
      strategy: 'LRU' as const
    },
    'ai-insights': { 
      ttl: this.cacheTiers.persistent, 
      maxSize: 500,
      strategy: 'LFU' as const
    }
  };

  constructor() {
    this.initializeCaches();
    this.startPeriodicCleanup();
    this.startPreloader();
  }

  /**
   * Initialize cache stores for each service
   */
  private initializeCaches(): void {
    Object.keys(this.serviceCacheConfig).forEach(service => {
      this.caches.set(service, new Map());
      this.stats.set(service, {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalRequests: 0,
        hitRate: 0,
        averageResponseTime: 0,
        memoryUsage: 0
      });
    });
    
    console.log('[CacheManager] Initialized multi-tier cache system');
  }

  /**
   * Get cached data with intelligent fallback
   */
  async get<T>(
    service: string, 
    key: string, 
    fallback?: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T | null> {
    const startTime = Date.now();
    const cache = this.caches.get(service);
    const stats = this.stats.get(service);
    
    if (!cache || !stats) {
      console.warn(`[CacheManager] Unknown service: ${service}`);
      return fallback ? await fallback() : null;
    }
    
    stats.totalRequests++;
    
    const cacheKey = this.generateCacheKey(key);
    const entry = cache.get(cacheKey);
    
    // Check if entry exists and is valid
    if (entry && entry.expiresAt > Date.now()) {
      // Update access statistics
      entry.hitCount++;
      entry.lastAccessed = Date.now();
      stats.hits++;
      
      // Calculate hit rate
      stats.hitRate = (stats.hits / stats.totalRequests) * 100;
      
      // Track response time
      const responseTime = Date.now() - startTime;
      stats.averageResponseTime = 
        (stats.averageResponseTime * (stats.totalRequests - 1) + responseTime) / 
        stats.totalRequests;
      
      console.log(`[CacheManager] Cache hit for ${service}:${key} (hit rate: ${stats.hitRate.toFixed(1)}%)`);
      return entry.data;
    }
    
    // Cache miss
    stats.misses++;
    console.log(`[CacheManager] Cache miss for ${service}:${key}`);
    
    // Execute fallback if provided
    if (fallback) {
      try {
        const data = await fallback();
        if (data !== null && data !== undefined) {
          await this.set(service, key, data, options);
        }
        return data;
      } catch (error) {
        console.error(`[CacheManager] Fallback failed for ${service}:${key}:`, error);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Set cached data with automatic eviction
   */
  async set<T>(
    service: string, 
    key: string, 
    data: T, 
    options?: CacheOptions
  ): Promise<void> {
    const cache = this.caches.get(service);
    if (!cache) {
      console.warn(`[CacheManager] Unknown service: ${service}`);
      return;
    }
    
    const config = this.serviceCacheConfig[service] || {
      ttl: this.cacheTiers.standard,
      maxSize: 1000,
      strategy: 'LRU' as const
    };
    
    const ttl = options?.ttl || config.ttl;
    const maxSize = options?.maxSize || config.maxSize;
    const strategy = options?.strategy || config.strategy;
    
    // Check cache size and evict if necessary
    if (cache.size >= maxSize) {
      this.evict(service, strategy);
    }
    
    // Check memory usage
    if (this.getMemoryUsage() > this.memoryLimit) {
      this.evictGlobally();
    }
    
    const cacheKey = this.generateCacheKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      hitCount: 0,
      lastAccessed: Date.now()
    };
    
    cache.set(cacheKey, entry);
    console.log(`[CacheManager] Cached data for ${service}:${key} (TTL: ${ttl/1000}s)`);
  }

  /**
   * Invalidate cached data
   */
  invalidate(service?: string, pattern?: string): void {
    if (!service) {
      // Clear all caches
      this.caches.forEach((cache, serviceName) => {
        cache.clear();
        console.log(`[CacheManager] Cleared cache for ${serviceName}`);
      });
      return;
    }
    
    const cache = this.caches.get(service);
    if (!cache) return;
    
    if (!pattern) {
      // Clear entire service cache
      cache.clear();
      console.log(`[CacheManager] Cleared cache for ${service}`);
      return;
    }
    
    // Clear entries matching pattern
    const regex = new RegExp(pattern);
    let cleared = 0;
    cache.forEach((entry, key) => {
      if (regex.test(key)) {
        cache.delete(key);
        cleared++;
      }
    });
    
    console.log(`[CacheManager] Cleared ${cleared} entries for ${service} matching ${pattern}`);
  }

  /**
   * Evict entries based on strategy
   */
  private evict(service: string, strategy: 'LRU' | 'FIFO' | 'LFU'): void {
    const cache = this.caches.get(service);
    const stats = this.stats.get(service);
    
    if (!cache || !stats || cache.size === 0) return;
    
    let keyToEvict: string | null = null;
    
    switch (strategy) {
      case 'LRU': // Least Recently Used
        let oldestAccess = Date.now();
        cache.forEach((entry, key) => {
          if (entry.lastAccessed < oldestAccess) {
            oldestAccess = entry.lastAccessed;
            keyToEvict = key;
          }
        });
        break;
        
      case 'FIFO': // First In, First Out
        let oldestTimestamp = Date.now();
        cache.forEach((entry, key) => {
          if (entry.timestamp < oldestTimestamp) {
            oldestTimestamp = entry.timestamp;
            keyToEvict = key;
          }
        });
        break;
        
      case 'LFU': // Least Frequently Used
        let lowestHitCount = Infinity;
        cache.forEach((entry, key) => {
          if (entry.hitCount < lowestHitCount) {
            lowestHitCount = entry.hitCount;
            keyToEvict = key;
          }
        });
        break;
    }
    
    if (keyToEvict) {
      cache.delete(keyToEvict);
      stats.evictions++;
      console.log(`[CacheManager] Evicted ${keyToEvict} from ${service} (${strategy})`);
    }
  }

  /**
   * Global eviction when memory limit is reached
   */
  private evictGlobally(): void {
    console.warn('[CacheManager] Memory limit reached, performing global eviction');
    
    // Collect all entries across all services
    const allEntries: { service: string; key: string; score: number }[] = [];
    
    this.caches.forEach((cache, service) => {
      cache.forEach((entry, key) => {
        // Score based on age, hit count, and remaining TTL
        const age = Date.now() - entry.timestamp;
        const remainingTTL = entry.expiresAt - Date.now();
        const score = (entry.hitCount * 1000) + (remainingTTL / 1000) - (age / 10000);
        allEntries.push({ service, key, score });
      });
    });
    
    // Sort by score (lower score = candidate for eviction)
    allEntries.sort((a, b) => a.score - b.score);
    
    // Evict bottom 20% of entries
    const evictCount = Math.ceil(allEntries.length * 0.2);
    for (let i = 0; i < evictCount && i < allEntries.length; i++) {
      const entry = allEntries[i];
      const cache = this.caches.get(entry.service);
      if (cache) {
        cache.delete(entry.key);
      }
    }
    
    console.log(`[CacheManager] Evicted ${evictCount} entries globally`);
  }

  /**
   * Generate consistent cache key
   */
  private generateCacheKey(key: string): string {
    // Create a hash for consistent key generation
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Estimate memory usage
   */
  private getMemoryUsage(): number {
    let totalSize = 0;
    this.caches.forEach(cache => {
      cache.forEach(entry => {
        // Rough estimation of object size
        totalSize += JSON.stringify(entry).length;
      });
    });
    return totalSize;
  }

  /**
   * Periodic cleanup of expired entries
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      let totalCleaned = 0;
      const now = Date.now();
      
      this.caches.forEach((cache, service) => {
        let cleaned = 0;
        cache.forEach((entry, key) => {
          if (entry.expiresAt < now) {
            cache.delete(key);
            cleaned++;
            totalCleaned++;
          }
        });
        
        if (cleaned > 0) {
          console.log(`[CacheManager] Cleaned ${cleaned} expired entries from ${service}`);
        }
      });
      
      if (totalCleaned > 0) {
        console.log(`[CacheManager] Total expired entries cleaned: ${totalCleaned}`);
      }
    }, 60 * 1000); // Run every minute
  }

  /**
   * Intelligent preloader for predictive caching
   */
  private startPreloader(): void {
    setInterval(async () => {
      if (this.preloadQueue.size === 0) return;
      
      const itemsToPreload = Array.from(this.preloadQueue).slice(0, 10);
      this.preloadQueue.clear();
      
      console.log(`[CacheManager] Preloading ${itemsToPreload.length} items`);
      
      // Process preload queue
      // This would be implemented based on specific service requirements
    }, 30 * 1000); // Run every 30 seconds
  }

  /**
   * Add item to preload queue
   */
  schedulePreload(identifier: string): void {
    this.preloadQueue.add(identifier);
  }

  /**
   * Get cache statistics
   */
  getStats(service?: string): CacheStats | Map<string, CacheStats> {
    if (service) {
      return this.stats.get(service) || {
        hits: 0,
        misses: 0,
        evictions: 0,
        totalRequests: 0,
        hitRate: 0,
        averageResponseTime: 0,
        memoryUsage: 0
      };
    }
    return this.stats;
  }

  /**
   * Create memoized function with cache integration
   */
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    service: string,
    options?: {
      keyGenerator?: (...args: Parameters<T>) => string;
      ttl?: number;
    }
  ): T {
    const ttl = options?.ttl || this.serviceCacheConfig[service]?.ttl || this.cacheTiers.standard;
    
    return memoizee(fn, {
      promise: true,
      maxAge: ttl,
      preFetch: 0.8, // Refresh when 80% of TTL has passed
      normalizer: options?.keyGenerator || ((...args) => JSON.stringify(args))
    }) as T;
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();