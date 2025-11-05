/**
 * Embeddings Service
 * Text embeddings generation and similarity matching using OpenAI
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { db } from '../db';
import { embeddings } from '@shared/schema';
import { eq, and, sql, cosineDistance } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';

/**
 * Embedding configuration
 */
const EMBEDDING_CONFIG = {
  model: 'text-embedding-ada-002',
  maxBatchSize: 100,
  dimensions: 1536,
  costPerToken: 0.0000001, // Approximate cost
  cacheTTL: 30 * 24 * 60 * 60 * 1000 // 30 days in ms
};

/**
 * Embedding result
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokens: number;
  cost: number;
  cached: boolean;
  cacheKey?: string;
  timestamp: Date;
}

/**
 * Similarity search options
 */
export interface SimilarityOptions {
  category?: string;
  threshold?: number;
  limit?: number;
  excludeIds?: string[];
}

/**
 * Similarity match
 */
export interface SimilarityMatch {
  id: string;
  text: string;
  value: any;
  similarity: number;
  metadata?: any;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
  texts: string[];
  category?: string;
  metadata?: Record<string, any>[];
}

/**
 * Embeddings cache manager
 */
class EmbeddingsCache {
  private memoryCache: Map<string, EmbeddingResult>;
  private maxMemoryItems = 1000;
  
  constructor() {
    this.memoryCache = new Map();
  }
  
  /**
   * Get cached embedding from memory or database
   */
  async get(cacheKey: string): Promise<EmbeddingResult | null> {
    // Check memory cache first
    if (this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey)!;
      const age = Date.now() - cached.timestamp.getTime();
      
      if (age < EMBEDDING_CONFIG.cacheTTL) {
        return { ...cached, cached: true };
      } else {
        this.memoryCache.delete(cacheKey);
      }
    }
    
    // Check database cache
    try {
      const result = await db
        .select()
        .from(embeddings)
        .where(eq(embeddings.cacheKey, cacheKey))
        .limit(1);
      
      if (result.length > 0) {
        const dbCached = result[0];
        const age = Date.now() - dbCached.createdAt.getTime();
        
        if (age < EMBEDDING_CONFIG.cacheTTL) {
          const embeddingResult: EmbeddingResult = {
            text: dbCached.text,
            embedding: dbCached.embedding as number[],
            model: dbCached.model,
            tokens: dbCached.tokens || 0,
            cost: 0, // No cost for cached result
            cached: true,
            cacheKey: dbCached.cacheKey,
            timestamp: dbCached.createdAt
          };
          
          // Add to memory cache
          this.addToMemoryCache(cacheKey, embeddingResult);
          
          return embeddingResult;
        }
      }
    } catch (error) {
      console.error('[EmbeddingsCache] Database fetch error:', error);
    }
    
    return null;
  }
  
  /**
   * Store embedding in cache
   */
  async set(cacheKey: string, result: EmbeddingResult): Promise<void> {
    // Add to memory cache
    this.addToMemoryCache(cacheKey, result);
    
    // Store in database
    try {
      await db.insert(embeddings).values({
        cacheKey,
        text: result.text,
        embedding: result.embedding,
        model: result.model,
        tokens: result.tokens,
        category: 'general',
        metadata: {},
        createdAt: result.timestamp
      }).onConflictDoUpdate({
        target: embeddings.cacheKey,
        set: {
          embedding: result.embedding,
          tokens: result.tokens,
          createdAt: result.timestamp
        }
      });
    } catch (error) {
      console.error('[EmbeddingsCache] Database store error:', error);
    }
  }
  
  /**
   * Add to memory cache with LRU eviction
   */
  private addToMemoryCache(key: string, result: EmbeddingResult): void {
    if (this.memoryCache.size >= this.maxMemoryItems) {
      // Remove oldest item (LRU)
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, result);
  }
  
  /**
   * Clear cache
   */
  clear(): void {
    this.memoryCache.clear();
  }
}

/**
 * Embeddings service
 */
export class EmbeddingsService {
  private openai: OpenAI;
  private cache: EmbeddingsCache;
  private rateLimitQueue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestCount = 0;
  private resetTime = Date.now() + 60000;
  private readonly maxRequestsPerMinute = 3000; // OpenAI limit
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({ apiKey });
    this.cache = new EmbeddingsCache();
    
    console.log('[EmbeddingsService] Initialized with OpenAI API');
  }
  
  /**
   * Generate embedding for text
   */
  async generateEmbedding(
    text: string,
    options?: {
      purpose?: string;
      cacheKey?: string;
      skipCache?: boolean;
    }
  ): Promise<EmbeddingResult> {
    const startTime = Date.now();
    
    // Generate cache key if not provided
    const cacheKey = options?.cacheKey || this.generateCacheKey(text, options?.purpose);
    
    // Check cache unless explicitly skipped
    if (!options?.skipCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`[EmbeddingsService] Cache hit for key: ${cacheKey}`);
        return cached;
      }
    }
    
    // Rate limiting
    await this.waitForRateLimit();
    
    try {
      console.log(`[EmbeddingsService] Generating embedding for text (${text.length} chars)`);
      
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_CONFIG.model,
        input: text
      });
      
      const embedding = response.data[0].embedding;
      const tokens = response.usage?.total_tokens || Math.ceil(text.length / 4);
      const cost = tokens * EMBEDDING_CONFIG.costPerToken;
      
      const result: EmbeddingResult = {
        text,
        embedding,
        model: EMBEDDING_CONFIG.model,
        tokens,
        cost,
        cached: false,
        cacheKey,
        timestamp: new Date()
      };
      
      // Cache the result
      await this.cache.set(cacheKey, result);
      
      // Track metrics
      eventBus.emit('embeddings:generated', {
        tokens,
        cost,
        latency: Date.now() - startTime,
        cached: false
      });
      
      return result;
      
    } catch (error) {
      console.error('[EmbeddingsService] Generation error:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }
  }
  
  /**
   * Generate embeddings in batch
   */
  async generateBatch(request: BatchEmbeddingRequest): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];
    
    // Check cache for each text
    for (let i = 0; i < request.texts.length; i++) {
      const text = request.texts[i];
      const cacheKey = this.generateCacheKey(text, request.category);
      const cached = await this.cache.get(cacheKey);
      
      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }
    
    // Process uncached texts in batches
    if (uncachedTexts.length > 0) {
      const batchSize = Math.min(EMBEDDING_CONFIG.maxBatchSize, uncachedTexts.length);
      
      for (let i = 0; i < uncachedTexts.length; i += batchSize) {
        const batch = uncachedTexts.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch, request.category);
        
        // Place results in correct positions
        for (let j = 0; j < batchResults.length; j++) {
          const originalIndex = uncachedIndices[i + j];
          results[originalIndex] = batchResults[j];
          
          // Add metadata if provided
          if (request.metadata?.[originalIndex]) {
            results[originalIndex].metadata = request.metadata[originalIndex];
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Process a batch of texts
   */
  private async processBatch(texts: string[], category?: string): Promise<EmbeddingResult[]> {
    await this.waitForRateLimit();
    
    try {
      const response = await this.openai.embeddings.create({
        model: EMBEDDING_CONFIG.model,
        input: texts
      });
      
      const results: EmbeddingResult[] = [];
      const totalTokens = response.usage?.total_tokens || texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
      const tokensPerText = Math.ceil(totalTokens / texts.length);
      const costPerText = tokensPerText * EMBEDDING_CONFIG.costPerToken;
      
      for (let i = 0; i < texts.length; i++) {
        const cacheKey = this.generateCacheKey(texts[i], category);
        const result: EmbeddingResult = {
          text: texts[i],
          embedding: response.data[i].embedding,
          model: EMBEDDING_CONFIG.model,
          tokens: tokensPerText,
          cost: costPerText,
          cached: false,
          cacheKey,
          timestamp: new Date()
        };
        
        // Cache each result
        await this.cache.set(cacheKey, result);
        results.push(result);
      }
      
      return results;
      
    } catch (error) {
      console.error('[EmbeddingsService] Batch processing error:', error);
      throw new Error(`Failed to process batch: ${error}`);
    }
  }
  
  /**
   * Find similar embeddings
   */
  async findSimilar(
    embedding: number[],
    options: SimilarityOptions = {}
  ): Promise<{ matches: SimilarityMatch[]; searchTime: number }> {
    const startTime = Date.now();
    const threshold = options.threshold || 0.7;
    const limit = options.limit || 10;
    
    try {
      // Search in database using vector similarity
      // Note: This is a simplified version. In production, you'd use pgvector or similar
      const results = await db
        .select({
          id: embeddings.id,
          text: embeddings.text,
          embedding: embeddings.embedding,
          metadata: embeddings.metadata,
          category: embeddings.category
        })
        .from(embeddings)
        .where(
          and(
            options.category ? eq(embeddings.category, options.category) : sql`true`,
            options.excludeIds?.length ? sql`${embeddings.id} NOT IN (${options.excludeIds.join(',')})` : sql`true`
          )
        )
        .limit(limit * 2); // Get more to filter by similarity
      
      // Calculate similarities
      const matches: SimilarityMatch[] = [];
      
      for (const row of results) {
        const similarity = this.cosineSimilarity(embedding, row.embedding as number[]);
        
        if (similarity >= threshold) {
          matches.push({
            id: row.id,
            text: row.text,
            value: row.metadata?.value || row.text,
            similarity,
            metadata: row.metadata
          });
        }
      }
      
      // Sort by similarity and limit
      matches.sort((a, b) => b.similarity - a.similarity);
      const topMatches = matches.slice(0, limit);
      
      return {
        matches: topMatches,
        searchTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('[EmbeddingsService] Similarity search error:', error);
      return { matches: [], searchTime: Date.now() - startTime };
    }
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (norm1 * norm2);
  }
  
  /**
   * Store known values with embeddings for future matching
   */
  async storeKnownValues(
    values: Array<{ text: string; value: any; category: string; metadata?: any }>
  ): Promise<void> {
    const embedingRequests = values.map(v => v.text);
    const embedingResults = await this.generateBatch({
      texts: embedingRequests,
      category: 'known_values'
    });
    
    // Store with metadata for future retrieval
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const embedding = embedingResults[i];
      
      try {
        await db.insert(embeddings).values({
          text: value.text,
          embedding: embedding.embedding,
          model: EMBEDDING_CONFIG.model,
          tokens: embedding.tokens,
          category: value.category,
          metadata: {
            ...value.metadata,
            value: value.value
          },
          cacheKey: this.generateCacheKey(value.text, value.category),
          createdAt: new Date()
        }).onConflictDoNothing();
      } catch (error) {
        console.error(`[EmbeddingsService] Failed to store known value: ${value.text}`, error);
      }
    }
    
    console.log(`[EmbeddingsService] Stored ${values.length} known values`);
  }
  
  /**
   * Generate cache key
   */
  private generateCacheKey(text: string, purpose?: string): string {
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const hash = this.simpleHash(normalizedText);
    return purpose ? `${purpose}_${hash}` : `embed_${hash}`;
  }
  
  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Rate limiting
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    
    if (now >= this.resetTime) {
      this.requestCount = 0;
      this.resetTime = now + 60000;
    }
    
    if (this.requestCount >= this.maxRequestsPerMinute) {
      const waitTime = this.resetTime - now;
      console.log(`[EmbeddingsService] Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    this.requestCount++;
  }
  
  /**
   * Get service statistics
   */
  getStats() {
    return {
      cacheSize: this.cache.memoryCache?.size || 0,
      requestCount: this.requestCount,
      resetTime: new Date(this.resetTime)
    };
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[EmbeddingsService] Cache cleared');
  }
}

// Export singleton instance
export const embeddingsService = new EmbeddingsService();