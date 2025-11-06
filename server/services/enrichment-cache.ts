import { Lead } from "@shared/schema";
import { createHash } from "crypto";
import { eventBus } from "./event-bus";
import { cacheManager } from "./cache-manager";

/**
 * Smart Caching and Deduplication System for Enrichment
 * Implements intelligent caching strategies and deduplication logic
 */

// Cache entry structure
export interface EnrichmentCacheEntry {
  key: string;
  leadId?: string;
  data: Partial<Lead>;
  sources: string[];
  timestamp: Date;
  expiresAt: Date;
  hitCount: number;
  lastAccessTime: Date;
  confidence: number;
  version: number;
  metadata: {
    businessName?: string;
    email?: string;
    phone?: string;
    enrichmentDepth: number;
    dataCompleteness: number;
  };
}

// Cache statistics
export interface CacheStatistics {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  avgResponseTime: number;
  memoryUsage: number;
  evictions: number;
  duplicatesSaved: number;
  costSavings: number;
}

// Deduplication result
export interface DeduplicationResult {
  isDuplicate: boolean;
  originalLeadId?: string;
  similarity: number;
  matchedFields: string[];
  recommendation: 'skip' | 'merge' | 'enrich' | 'new';
}

// Cache configuration
export interface CacheConfig {
  maxEntries: number;
  defaultTTL: number;
  intelligentTTL: boolean;
  compressionEnabled: boolean;
  deduplicationThreshold: number;
  evictionPolicy: 'LRU' | 'LFU' | 'FIFO' | 'TTL';
}

export class EnrichmentCache {
  private cache: Map<string, EnrichmentCacheEntry> = new Map();
  private deduplicationIndex: Map<string, Set<string>> = new Map();
  private accessLog: Map<string, number[]> = new Map();
  
  private statistics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    duplicatesSaved: 0,
    totalResponseTime: 0,
    totalRequests: 0
  };
  
  private config: CacheConfig = {
    maxEntries: 10000,
    defaultTTL: 3600000, // 1 hour
    intelligentTTL: true,
    compressionEnabled: false,
    deduplicationThreshold: 0.85,
    evictionPolicy: 'LRU'
  };
  
  // Cost per API call (average across services)
  private readonly avgApiCost = 0.005;
  
  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...this.config, ...config };
    this.initializeCache();
    this.startMaintenanceRoutines();
    
    console.log('[EnrichmentCache] Initialized with intelligent caching and deduplication');
  }
  
  /**
   * Initialize cache and indexes
   */
  private initializeCache() {
    // Build deduplication indexes
    this.deduplicationIndex.set('email', new Set());
    this.deduplicationIndex.set('phone', new Set());
    this.deduplicationIndex.set('businessName', new Set());
    this.deduplicationIndex.set('composite', new Set());
    
    // Register event listeners
    eventBus.on('cache:invalidate', (data: any) => {
      this.invalidateEntry(data.key);
    });
  }
  
  /**
   * Get cached enrichment data
   */
  async get(key: string, options?: { 
    touch?: boolean;
    extendTTL?: boolean;
  }): Promise<EnrichmentCacheEntry | null> {
    const startTime = Date.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.statistics.misses++;
      this.recordResponseTime(Date.now() - startTime);
      return null;
    }
    
    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.invalidateEntry(key);
      this.statistics.misses++;
      this.recordResponseTime(Date.now() - startTime);
      return null;
    }
    
    // Update access information
    if (options?.touch !== false) {
      entry.hitCount++;
      entry.lastAccessTime = new Date();
      
      // Track access for intelligent TTL
      this.trackAccess(key);
      
      // Extend TTL if requested and intelligent TTL is enabled
      if (options?.extendTTL && this.config.intelligentTTL) {
        const newTTL = this.calculateIntelligentTTL(entry);
        entry.expiresAt = new Date(Date.now() + newTTL);
      }
    }
    
    this.statistics.hits++;
    this.recordResponseTime(Date.now() - startTime);
    
    return entry;
  }
  
  /**
   * Set cached enrichment data
   */
  async set(
    key: string,
    data: Partial<Lead>,
    options?: {
      sources?: string[];
      ttl?: number;
      confidence?: number;
      metadata?: any;
    }
  ): Promise<void> {
    // Check cache size and evict if necessary
    if (this.cache.size >= this.config.maxEntries) {
      this.evictEntry();
    }
    
    // Check for duplicates before adding
    const dedupeResult = await this.checkDuplicate(data);
    if (dedupeResult.isDuplicate && dedupeResult.recommendation === 'skip') {
      this.statistics.duplicatesSaved++;
      console.log(`[EnrichmentCache] Duplicate detected, skipping cache entry for key: ${key}`);
      return;
    }
    
    // Calculate TTL
    const ttl = options?.ttl || 
      (this.config.intelligentTTL ? this.calculateIntelligentTTL(data) : this.config.defaultTTL);
    
    // Create cache entry
    const entry: EnrichmentCacheEntry = {
      key,
      leadId: data.id,
      data: this.compressData(data),
      sources: options?.sources || [],
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + ttl),
      hitCount: 0,
      lastAccessTime: new Date(),
      confidence: options?.confidence || this.calculateConfidence(data),
      version: 1,
      metadata: {
        businessName: data.businessName,
        email: data.email,
        phone: data.phone,
        enrichmentDepth: this.calculateEnrichmentDepth(data),
        dataCompleteness: this.calculateCompleteness(data),
        ...options?.metadata
      }
    };
    
    // Update existing entry version if it exists
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      entry.version = existingEntry.version + 1;
      entry.hitCount = existingEntry.hitCount;
    }
    
    // Store in cache
    this.cache.set(key, entry);
    
    // Update deduplication indexes
    this.updateDeduplicationIndexes(key, data);
    
    // Emit cache update event
    eventBus.emit('cache:updated', {
      key,
      size: this.cache.size,
      dataCompleteness: entry.metadata.dataCompleteness
    });
  }
  
  /**
   * Generate cache key for lead data
   */
  generateKey(data: Partial<Lead>, includeTimestamp?: boolean): string {
    const keyParts: string[] = [];
    
    // Add primary identifiers
    if (data.id) keyParts.push(`id:${data.id}`);
    if (data.businessName) keyParts.push(`bn:${data.businessName.toLowerCase()}`);
    if (data.email) keyParts.push(`em:${data.email.toLowerCase()}`);
    if (data.phone) keyParts.push(`ph:${data.phone.replace(/\D/g, '')}`);
    
    // Add secondary identifiers for better matching
    if (data.ownerName) keyParts.push(`on:${data.ownerName.toLowerCase()}`);
    if (data.stateCode) keyParts.push(`st:${data.stateCode}`);
    
    // Add timestamp if requested (for time-sensitive caching)
    if (includeTimestamp) {
      const hourBucket = Math.floor(Date.now() / (1000 * 60 * 60));
      keyParts.push(`ts:${hourBucket}`);
    }
    
    // Create hash for consistent key
    const keyString = keyParts.sort().join('|');
    return createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }
  
  /**
   * Check for duplicate leads
   */
  async checkDuplicate(data: Partial<Lead>): Promise<DeduplicationResult> {
    const result: DeduplicationResult = {
      isDuplicate: false,
      similarity: 0,
      matchedFields: [],
      recommendation: 'new'
    };
    
    // Check exact matches on key fields
    if (data.email) {
      const emailMatches = this.deduplicationIndex.get('email')?.has(data.email.toLowerCase());
      if (emailMatches) {
        result.matchedFields.push('email');
        result.similarity = Math.max(result.similarity, 0.9);
      }
    }
    
    if (data.phone) {
      const cleanPhone = data.phone.replace(/\D/g, '');
      const phoneMatches = this.deduplicationIndex.get('phone')?.has(cleanPhone);
      if (phoneMatches) {
        result.matchedFields.push('phone');
        result.similarity = Math.max(result.similarity, 0.9);
      }
    }
    
    // Check fuzzy match on business name
    if (data.businessName) {
      const businessNameLower = data.businessName.toLowerCase();
      const businessIndex = this.deduplicationIndex.get('businessName');
      
      if (businessIndex) {
        for (const existingName of businessIndex) {
          const similarity = this.calculateStringSimilarity(businessNameLower, existingName);
          if (similarity > this.config.deduplicationThreshold) {
            result.matchedFields.push('businessName');
            result.similarity = Math.max(result.similarity, similarity);
          }
        }
      }
    }
    
    // Check composite key
    const compositeKey = this.generateCompositeKey(data);
    if (compositeKey && this.deduplicationIndex.get('composite')?.has(compositeKey)) {
      result.matchedFields.push('composite');
      result.similarity = 1.0;
    }
    
    // Determine if it's a duplicate and recommendation
    if (result.similarity >= this.config.deduplicationThreshold) {
      result.isDuplicate = true;
      
      // Determine recommendation based on similarity and matched fields
      if (result.similarity === 1.0 && result.matchedFields.includes('composite')) {
        result.recommendation = 'skip';
      } else if (result.similarity > 0.95) {
        result.recommendation = 'merge';
      } else if (result.matchedFields.length >= 2) {
        result.recommendation = 'merge';
      } else {
        result.recommendation = 'enrich';
      }
    }
    
    return result;
  }
  
  /**
   * Invalidate cache entry
   */
  invalidateEntry(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    
    // Remove from deduplication indexes
    this.removeFromDeduplicationIndexes(key, entry.data);
    
    // Delete from cache
    this.cache.delete(key);
    
    console.log(`[EnrichmentCache] Invalidated cache entry: ${key}`);
  }
  
  /**
   * Invalidate entries by pattern
   */
  invalidateByPattern(pattern: RegExp | string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      const matches = typeof pattern === 'string' 
        ? key.includes(pattern)
        : pattern.test(key);
      
      if (matches) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.invalidateEntry(key);
      invalidatedCount++;
    });
    
    return invalidatedCount;
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.deduplicationIndex.forEach(index => index.clear());
    this.accessLog.clear();
    
    console.log('[EnrichmentCache] Cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    const hitRate = this.statistics.totalRequests > 0
      ? (this.statistics.hits / this.statistics.totalRequests) * 100
      : 0;
    
    const missRate = this.statistics.totalRequests > 0
      ? (this.statistics.misses / this.statistics.totalRequests) * 100
      : 0;
    
    const avgResponseTime = this.statistics.totalRequests > 0
      ? this.statistics.totalResponseTime / this.statistics.totalRequests
      : 0;
    
    // Estimate memory usage (simplified)
    const avgEntrySize = 2048; // 2KB average per entry
    const memoryUsage = this.cache.size * avgEntrySize;
    
    // Calculate cost savings
    const costSavings = this.statistics.hits * this.avgApiCost;
    
    return {
      totalEntries: this.cache.size,
      hitRate,
      missRate,
      avgResponseTime,
      memoryUsage,
      evictions: this.statistics.evictions,
      duplicatesSaved: this.statistics.duplicatesSaved,
      costSavings
    };
  }
  
  /**
   * Warm up cache with frequently accessed data
   */
  async warmUp(leads: Partial<Lead>[]): Promise<void> {
    console.log(`[EnrichmentCache] Warming up cache with ${leads.length} leads`);
    
    for (const lead of leads) {
      const key = this.generateKey(lead);
      await this.set(key, lead, {
        ttl: this.config.defaultTTL * 2, // Longer TTL for warm-up data
        confidence: 0.8
      });
    }
    
    console.log('[EnrichmentCache] Cache warm-up completed');
  }
  
  /**
   * Export cache for persistence
   */
  exportCache(): string {
    const exportData = {
      timestamp: new Date(),
      version: '1.0',
      config: this.config,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        data: entry.data,
        metadata: entry.metadata,
        expiresAt: entry.expiresAt,
        hitCount: entry.hitCount
      }))
    };
    
    return JSON.stringify(exportData);
  }
  
  /**
   * Import cache from persistence
   */
  importCache(data: string): void {
    try {
      const importData = JSON.parse(data);
      
      // Clear existing cache
      this.clear();
      
      // Import entries
      for (const entry of importData.entries) {
        const expiresAt = new Date(entry.expiresAt);
        
        // Skip expired entries
        if (expiresAt < new Date()) continue;
        
        this.cache.set(entry.key, {
          ...entry,
          timestamp: new Date(importData.timestamp),
          lastAccessTime: new Date(),
          expiresAt,
          sources: [],
          confidence: 0.7,
          version: 1
        });
      }
      
      // Rebuild indexes
      this.rebuildDeduplicationIndexes();
      
      console.log(`[EnrichmentCache] Imported ${this.cache.size} cache entries`);
    } catch (error) {
      console.error('[EnrichmentCache] Failed to import cache:', error);
    }
  }
  
  // Private helper methods
  
  private calculateIntelligentTTL(data: any): number {
    // Base TTL
    let ttl = this.config.defaultTTL;
    
    // Adjust based on data completeness
    const completeness = this.calculateCompleteness(data);
    if (completeness > 80) {
      ttl *= 2; // Double TTL for complete data
    } else if (completeness < 30) {
      ttl *= 0.5; // Half TTL for incomplete data
    }
    
    // Adjust based on data freshness
    if (data.lastUpdated) {
      const age = Date.now() - new Date(data.lastUpdated).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        // Less than 24 hours old
        ttl *= 1.5;
      }
    }
    
    // Adjust based on access pattern (if entry exists)
    if (data instanceof Object && 'key' in data) {
      const accessPattern = this.accessLog.get(data.key);
      if (accessPattern && accessPattern.length > 5) {
        // Frequently accessed
        ttl *= 2;
      }
    }
    
    // Cap TTL
    const maxTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    const minTTL = 5 * 60 * 1000; // 5 minutes
    
    return Math.max(minTTL, Math.min(maxTTL, ttl));
  }
  
  private calculateConfidence(data: Partial<Lead>): number {
    let confidence = 0;
    let factors = 0;
    
    // Check data sources
    if (data.emailVerified) {
      confidence += 0.9;
      factors++;
    }
    
    if (data.phoneVerified) {
      confidence += 0.9;
      factors++;
    }
    
    // Check data completeness
    const completeness = this.calculateCompleteness(data);
    confidence += completeness / 100;
    factors++;
    
    // Check data age
    if (data.lastUpdated) {
      const age = Date.now() - new Date(data.lastUpdated).getTime();
      const ageFactor = Math.max(0, 1 - (age / (30 * 24 * 60 * 60 * 1000))); // 30 days
      confidence += ageFactor;
      factors++;
    }
    
    return factors > 0 ? confidence / factors : 0.5;
  }
  
  private calculateEnrichmentDepth(data: Partial<Lead>): number {
    const fields = Object.keys(data).filter(key => 
      data[key as keyof Lead] !== null && 
      data[key as keyof Lead] !== undefined
    );
    
    return fields.length;
  }
  
  private calculateCompleteness(data: Partial<Lead>): number {
    const requiredFields = [
      'businessName', 'ownerName', 'email', 'phone',
      'address', 'city', 'stateCode', 'zipCode',
      'industry', 'annualRevenue', 'employeeCount'
    ];
    
    const filledFields = requiredFields.filter(field => 
      data[field as keyof Lead] !== null && 
      data[field as keyof Lead] !== undefined &&
      data[field as keyof Lead] !== ''
    );
    
    return (filledFields.length / requiredFields.length) * 100;
  }
  
  private compressData(data: any): any {
    // Simple compression by removing null/undefined values
    // In production, could use actual compression algorithms
    const compressed: any = {};
    
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined && data[key] !== '') {
        compressed[key] = data[key];
      }
    });
    
    return compressed;
  }
  
  private evictEntry(): void {
    let keyToEvict: string | null = null;
    
    switch (this.config.evictionPolicy) {
      case 'LRU':
        keyToEvict = this.findLRUKey();
        break;
      case 'LFU':
        keyToEvict = this.findLFUKey();
        break;
      case 'FIFO':
        keyToEvict = this.findFIFOKey();
        break;
      case 'TTL':
        keyToEvict = this.findShortestTTLKey();
        break;
    }
    
    if (keyToEvict) {
      this.invalidateEntry(keyToEvict);
      this.statistics.evictions++;
    }
  }
  
  private findLRUKey(): string | null {
    let oldestTime = new Date();
    let lruKey: string | null = null;
    
    this.cache.forEach((entry, key) => {
      if (entry.lastAccessTime < oldestTime) {
        oldestTime = entry.lastAccessTime;
        lruKey = key;
      }
    });
    
    return lruKey;
  }
  
  private findLFUKey(): string | null {
    let minHits = Infinity;
    let lfuKey: string | null = null;
    
    this.cache.forEach((entry, key) => {
      if (entry.hitCount < minHits) {
        minHits = entry.hitCount;
        lfuKey = key;
      }
    });
    
    return lfuKey;
  }
  
  private findFIFOKey(): string | null {
    let oldestTimestamp = new Date();
    let fifoKey: string | null = null;
    
    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        fifoKey = key;
      }
    });
    
    return fifoKey;
  }
  
  private findShortestTTLKey(): string | null {
    let soonestExpiry = new Date(Date.now() + 1000000000);
    let ttlKey: string | null = null;
    
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < soonestExpiry) {
        soonestExpiry = entry.expiresAt;
        ttlKey = key;
      }
    });
    
    return ttlKey;
  }
  
  private trackAccess(key: string): void {
    if (!this.accessLog.has(key)) {
      this.accessLog.set(key, []);
    }
    
    const log = this.accessLog.get(key)!;
    log.push(Date.now());
    
    // Keep only last 100 accesses
    if (log.length > 100) {
      log.shift();
    }
  }
  
  private recordResponseTime(time: number): void {
    this.statistics.totalResponseTime += time;
    this.statistics.totalRequests++;
  }
  
  private updateDeduplicationIndexes(key: string, data: Partial<Lead>): void {
    if (data.email) {
      this.deduplicationIndex.get('email')?.add(data.email.toLowerCase());
    }
    
    if (data.phone) {
      const cleanPhone = data.phone.replace(/\D/g, '');
      this.deduplicationIndex.get('phone')?.add(cleanPhone);
    }
    
    if (data.businessName) {
      this.deduplicationIndex.get('businessName')?.add(data.businessName.toLowerCase());
    }
    
    const compositeKey = this.generateCompositeKey(data);
    if (compositeKey) {
      this.deduplicationIndex.get('composite')?.add(compositeKey);
    }
  }
  
  private removeFromDeduplicationIndexes(key: string, data: Partial<Lead>): void {
    if (data.email) {
      this.deduplicationIndex.get('email')?.delete(data.email.toLowerCase());
    }
    
    if (data.phone) {
      const cleanPhone = data.phone.replace(/\D/g, '');
      this.deduplicationIndex.get('phone')?.delete(cleanPhone);
    }
    
    if (data.businessName) {
      this.deduplicationIndex.get('businessName')?.delete(data.businessName.toLowerCase());
    }
    
    const compositeKey = this.generateCompositeKey(data);
    if (compositeKey) {
      this.deduplicationIndex.get('composite')?.delete(compositeKey);
    }
  }
  
  private rebuildDeduplicationIndexes(): void {
    // Clear existing indexes
    this.deduplicationIndex.forEach(index => index.clear());
    
    // Rebuild from cache entries
    this.cache.forEach((entry, key) => {
      this.updateDeduplicationIndexes(key, entry.data);
    });
  }
  
  private generateCompositeKey(data: Partial<Lead>): string | null {
    const parts: string[] = [];
    
    if (data.businessName) parts.push(data.businessName.toLowerCase());
    if (data.ownerName) parts.push(data.ownerName.toLowerCase());
    if (data.stateCode) parts.push(data.stateCode);
    
    if (parts.length < 2) return null;
    
    return parts.join('|');
  }
  
  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simplified similarity calculation
    // In production, use more sophisticated algorithms like Levenshtein distance
    
    if (str1 === str2) return 1.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 0;
    
    // Check if one contains the other
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }
    
    // Simple character match ratio
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer[i] === shorter[i]) matches++;
    }
    
    return matches / longer.length;
  }
  
  private startMaintenanceRoutines(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
    
    // Export cache snapshot every hour
    setInterval(() => {
      this.createSnapshot();
    }, 60 * 60 * 1000);
    
    // Log statistics every 30 minutes
    setInterval(() => {
      const stats = this.getStatistics();
      console.log('[EnrichmentCache] Statistics:', {
        entries: stats.totalEntries,
        hitRate: `${stats.hitRate.toFixed(1)}%`,
        costSavings: `$${stats.costSavings.toFixed(2)}`,
        duplicatesSaved: stats.duplicatesSaved
      });
    }, 30 * 60 * 1000);
  }
  
  private cleanupExpiredEntries(): void {
    const now = new Date();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (entry.expiresAt < now) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.invalidateEntry(key);
    });
    
    if (keysToDelete.length > 0) {
      console.log(`[EnrichmentCache] Cleaned up ${keysToDelete.length} expired entries`);
    }
  }
  
  private async createSnapshot(): Promise<void> {
    try {
      const snapshot = this.exportCache();
      await cacheManager.set('enrichment_cache_snapshot', snapshot, 24 * 60 * 60);
      console.log('[EnrichmentCache] Snapshot created');
    } catch (error) {
      console.error('[EnrichmentCache] Failed to create snapshot:', error);
    }
  }
}

// Export singleton instance
export const enrichmentCache = new EnrichmentCache({
  maxEntries: 10000,
  defaultTTL: 3600000,
  intelligentTTL: true,
  deduplicationThreshold: 0.85,
  evictionPolicy: 'LRU'
});

// Export types
export type {
  EnrichmentCacheEntry,
  CacheStatistics,
  DeduplicationResult,
  CacheConfig
};