import { Lead } from "@shared/schema";
import crypto from "crypto";

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
  source: string;
  confidence: number;
  hits: number;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  avgAge: number;
  memoryUsage: number;
}

export class EnrichmentCacheService {
  private cache: Map<string, CacheEntry<any>>;
  private hits = 0;
  private misses = 0;
  private readonly defaultTTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  private readonly maxCacheSize = 10000; // Maximum number of entries
  
  constructor() {
    this.cache = new Map();
    this.startCleanupInterval();
  }
  
  /**
   * Get cached enrichment data
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    // Update hit counter
    entry.hits++;
    this.hits++;
    
    return entry.data as T;
  }
  
  /**
   * Set cached enrichment data
   */
  set<T>(
    key: string, 
    data: T, 
    source: string, 
    confidence: number = 50, 
    ttlMs?: number
  ): void {
    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldest();
    }
    
    const now = new Date();
    const ttl = ttlMs || this.defaultTTL;
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: new Date(now.getTime() + ttl),
      source,
      confidence,
      hits: 0
    });
  }
  
  /**
   * Generate cache key for lead enrichment
   */
  generateLeadKey(leadId: string, dataType: string): string {
    return `lead:${leadId}:${dataType}`;
  }
  
  /**
   * Generate cache key for email enrichment
   */
  generateEmailKey(email: string, dataType: string): string {
    const hash = crypto.createHash('md5').update(email.toLowerCase()).digest('hex');
    return `email:${hash}:${dataType}`;
  }
  
  /**
   * Generate cache key for phone enrichment
   */
  generatePhoneKey(phone: string, dataType: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    return `phone:${cleanPhone}:${dataType}`;
  }
  
  /**
   * Generate cache key for company enrichment
   */
  generateCompanyKey(identifier: string, dataType: string): string {
    const hash = crypto.createHash('md5').update(identifier.toLowerCase()).digest('hex');
    return `company:${hash}:${dataType}`;
  }
  
  /**
   * Check if data needs refresh based on confidence and age
   */
  needsRefresh(key: string, minConfidence: number = 70): boolean {
    const entry = this.cache.get(key);
    
    if (!entry) return true;
    
    // Check if expired
    if (new Date() > entry.expiresAt) return true;
    
    // Check confidence threshold
    if (entry.confidence < minConfidence) return true;
    
    // Check age for high-value data (refresh after 7 days if confidence < 90)
    const ageInDays = (Date.now() - entry.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (entry.confidence < 90 && ageInDays > 7) return true;
    
    return false;
  }
  
  /**
   * Get all cached data for a lead
   */
  getLeadData(leadId: string): Map<string, any> {
    const result = new Map<string, any>();
    const prefix = `lead:${leadId}:`;
    
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(prefix)) {
        const dataType = key.substring(prefix.length);
        if (new Date() <= entry.expiresAt) {
          result.set(dataType, entry.data);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Invalidate all cache entries for a lead
   */
  invalidateLead(leadId: string): void {
    const prefix = `lead:${leadId}:`;
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now();
    let totalAge = 0;
    let validEntries = 0;
    
    for (const entry of this.cache.values()) {
      if (new Date() <= entry.expiresAt) {
        totalAge += now - entry.timestamp.getTime();
        validEntries++;
      }
    }
    
    const hitRate = this.hits + this.misses > 0 
      ? (this.hits / (this.hits + this.misses)) * 100 
      : 0;
    
    return {
      totalEntries: this.cache.size,
      hitRate,
      missRate: 100 - hitRate,
      avgAge: validEntries > 0 ? totalAge / validEntries / (1000 * 60 * 60) : 0, // in hours
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    // Sort by timestamp and remove oldest 10%
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
    
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
  
  /**
   * Estimate memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    // Rough estimation: assume average entry is ~2KB
    return this.cache.size * 2048;
  }
  
  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = new Date();
      const keysToDelete: string[] = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => this.cache.delete(key));
      
      if (keysToDelete.length > 0) {
        console.log(`[Cache] Cleaned up ${keysToDelete.length} expired entries`);
      }
    }, 60 * 60 * 1000); // Run every hour
  }
  
  /**
   * Merge cached data with new data, preserving higher confidence values
   */
  mergeData<T extends Record<string, any>>(
    existing: T | null,
    newData: T,
    existingConfidence: number,
    newConfidence: number
  ): T {
    if (!existing) return newData;
    
    const merged = { ...existing };
    
    for (const key in newData) {
      if (newData[key] !== null && newData[key] !== undefined) {
        // Use new data if confidence is higher or existing data is missing
        if (!merged[key] || newConfidence > existingConfidence) {
          merged[key] = newData[key];
        }
      }
    }
    
    return merged as T;
  }
  
  /**
   * Export cache to JSON for backup
   */
  exportCache(): string {
    const exportData: any[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      exportData.push({
        key,
        ...entry,
        timestamp: entry.timestamp.toISOString(),
        expiresAt: entry.expiresAt.toISOString()
      });
    }
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Import cache from JSON backup
   */
  importCache(json: string): void {
    try {
      const data = JSON.parse(json);
      
      for (const item of data) {
        this.cache.set(item.key, {
          data: item.data,
          timestamp: new Date(item.timestamp),
          expiresAt: new Date(item.expiresAt),
          source: item.source,
          confidence: item.confidence,
          hits: item.hits || 0
        });
      }
      
      console.log(`[Cache] Imported ${data.length} entries`);
    } catch (error) {
      console.error("[Cache] Import failed:", error);
    }
  }
}

export const enrichmentCache = new EnrichmentCacheService();