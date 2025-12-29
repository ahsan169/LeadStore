/**
 * Tiered Intelligence Execution System
 * Cost-efficient progressive intelligence processing
 */

import { z } from 'zod';
import { Lead, InsertLead } from '@shared/schema';
import { fieldMapper, CanonicalField, FIELD_VALIDATORS, FIELD_SYNONYMS } from './ontology';
import { embeddingsService, EmbeddingResult } from './embeddings-service';
import { llmService, LLMResult } from './llm-service';
import { executionPolicy, TierConfig, shouldEscalate } from './execution-policy';
import { db } from '../db';
import { intelligenceMetrics, embeddings, llmCache } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';

/**
 * Intelligence tiers
 */
export enum IntelligenceTier {
  DETERMINISTIC = 0,
  EMBEDDINGS = 1,
  LLM = 2
}

/**
 * Processing result from a tier
 */
export interface TierResult {
  tier: IntelligenceTier;
  confidence: number;
  value: any;
  cost: number;
  latency: number;
  method: string;
  explanation?: string;
  cached?: boolean;
  error?: string;
}

/**
 * Field extraction result
 */
export interface ExtractionResult {
  field: string;
  originalValue: any;
  extractedValue: any;
  confidence: number;
  tier: IntelligenceTier;
  cost: number;
  latency: number;
  method: string;
  cached: boolean;
  transformations?: string[];
}

/**
 * Intelligence processing context
 */
export interface IntelligenceContext {
  data: any;
  field?: string;
  targetType?: string;
  requirements?: {
    minConfidence?: number;
    maxCost?: number;
    maxLatency?: number;
  };
  previousResults?: TierResult[];
  metadata?: {
    leadId?: string;
    userId?: string;
    batchId?: string;
    source?: string;
  };
}

/**
 * Intelligence metrics tracker
 */
class MetricsTracker {
  private metrics = {
    tierUsage: new Map<IntelligenceTier, number>(),
    costByTier: new Map<IntelligenceTier, number>(),
    latencyByTier: new Map<IntelligenceTier, number[]>(),
    cacheHits: new Map<IntelligenceTier, number>(),
    confidenceByTier: new Map<IntelligenceTier, number[]>(),
    escalations: 0,
    shortCircuits: 0,
    totalCost: 0,
    totalLatency: 0
  };
  
  trackUsage(tier: IntelligenceTier, result: TierResult): void {
    // Update usage count
    const currentUsage = this.metrics.tierUsage.get(tier) || 0;
    this.metrics.tierUsage.set(tier, currentUsage + 1);
    
    // Update cost
    const currentCost = this.metrics.costByTier.get(tier) || 0;
    this.metrics.costByTier.set(tier, currentCost + result.cost);
    this.metrics.totalCost += result.cost;
    
    // Update latency
    const latencies = this.metrics.latencyByTier.get(tier) || [];
    latencies.push(result.latency);
    this.metrics.latencyByTier.set(tier, latencies);
    this.metrics.totalLatency += result.latency;
    
    // Update confidence
    const confidences = this.metrics.confidenceByTier.get(tier) || [];
    confidences.push(result.confidence);
    this.metrics.confidenceByTier.set(tier, confidences);
    
    // Track cache hits
    if (result.cached) {
      const hits = this.metrics.cacheHits.get(tier) || 0;
      this.metrics.cacheHits.set(tier, hits + 1);
    }
  }
  
  trackEscalation(): void {
    this.metrics.escalations++;
  }
  
  trackShortCircuit(): void {
    this.metrics.shortCircuits++;
  }
  
  getMetrics() {
    const tierStats = Array.from(this.metrics.tierUsage.entries()).map(([tier, usage]) => {
      const latencies = this.metrics.latencyByTier.get(tier) || [];
      const confidences = this.metrics.confidenceByTier.get(tier) || [];
      
      return {
        tier,
        usage,
        cost: this.metrics.costByTier.get(tier) || 0,
        cacheHits: this.metrics.cacheHits.get(tier) || 0,
        avgLatency: latencies.length > 0 ? 
          latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        avgConfidence: confidences.length > 0 ?
          confidences.reduce((a, b) => a + b, 0) / confidences.length : 0
      };
    });
    
    return {
      tierStats,
      escalations: this.metrics.escalations,
      shortCircuits: this.metrics.shortCircuits,
      totalCost: this.metrics.totalCost,
      totalLatency: this.metrics.totalLatency,
      avgCostPerLead: this.metrics.tierUsage.size > 0 ?
        this.metrics.totalCost / Array.from(this.metrics.tierUsage.values()).reduce((a, b) => a + b, 0) : 0
    };
  }
  
  async persistMetrics(sessionId: string): Promise<void> {
    const metrics = this.getMetrics();
    
    try {
      await db.insert(intelligenceMetrics).values({
        sessionId,
        tierUsage: metrics.tierStats,
        totalCost: metrics.totalCost,
        totalLatency: metrics.totalLatency,
        escalations: metrics.escalations,
        shortCircuits: metrics.shortCircuits,
        avgCostPerLead: metrics.avgCostPerLead,
        timestamp: new Date()
      } as any);
    } catch (error) {
      console.error('[MetricsTracker] Failed to persist metrics:', error);
    }
  }
}

/**
 * Tier 0: Deterministic Operations
 */
class DeterministicTier {
  private regexPatterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    phone: /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
    ein: /^\d{2}-?\d{7}$/,
    zipCode: /^\d{5}(-\d{4})?$/,
    url: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
    creditScore: /^[3-8]\d{2}$/,
    revenue: /^\$?[\d,]+\.?\d*[KkMmBb]?$/,
    businessType: /^(LLC|INC|CORP|LP|LLP|PLLC|PC|PA|PARTNERSHIP|SOLE PROPRIETOR)/i
  };
  
  private cachedResults = new Map<string, TierResult>();
  
  async process(context: IntelligenceContext): Promise<TierResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.getCacheKey(context);
    if (this.cachedResults.has(cacheKey)) {
      const cached = this.cachedResults.get(cacheKey)!;
      return { ...cached, cached: true, latency: 0 };
    }
    
    let confidence = 0;
    let extractedValue = context.data;
    let method = 'unknown';
    
    try {
      // Try field mapping from ontology
      if (context.field && FIELD_SYNONYMS[context.field as CanonicalField]) {
        const mapped = this.mapFieldWithOntology(context);
        if (mapped.confidence > 0) {
          extractedValue = mapped.value;
          confidence = mapped.confidence;
          method = 'ontology_mapping';
        }
      }
      
      // Try regex pattern matching
      if (confidence < 0.95 && typeof context.data === 'string') {
        const regexResult = this.applyRegexPatterns(context);
        if (regexResult.confidence > confidence) {
          extractedValue = regexResult.value;
          confidence = regexResult.confidence;
          method = 'regex_pattern';
        }
      }
      
      // Try validation rules
      if (context.field && (FIELD_VALIDATORS as any)[context.field as CanonicalField]) {
        const validationResult = this.validateField(context);
        if (validationResult.confidence > confidence) {
          extractedValue = validationResult.value;
          confidence = validationResult.confidence;
          method = 'validation_rules';
        }
      }
      
      // Try rule-based transformations
      if (confidence < 0.95) {
        const transformResult = this.applyTransformations(context);
        if (transformResult.confidence > confidence) {
          extractedValue = transformResult.value;
          confidence = transformResult.confidence;
          method = 'rule_transformation';
        }
      }
      
    } catch (error) {
      console.error('[DeterministicTier] Processing error:', error);
      confidence = 0;
    }
    
    const result: TierResult = {
      tier: IntelligenceTier.DETERMINISTIC,
      confidence,
      value: extractedValue,
      cost: 0,
      latency: Date.now() - startTime,
      method,
      cached: false
    };
    
    // Cache result
    this.cachedResults.set(cacheKey, result);
    
    // Limit cache size
    if (this.cachedResults.size > 10000) {
      const firstKey = this.cachedResults.keys().next().value;
      if (firstKey) this.cachedResults.delete(firstKey);
    }
    
    return result;
  }
  
  private getCacheKey(context: IntelligenceContext): string {
    return `${context.field || 'unknown'}_${JSON.stringify(context.data)}`;
  }
  
  private mapFieldWithOntology(context: IntelligenceContext): { value: any; confidence: number } {
    const field = context.field as CanonicalField;
    const dataStr = String(context.data).toLowerCase().trim();
    
    // Check if data matches any synonym
    const synonyms = FIELD_SYNONYMS[field] || [];
    for (const synonym of synonyms) {
      if (dataStr === synonym.toLowerCase()) {
        return { value: context.data, confidence: 0.95 };
      }
      if (dataStr.includes(synonym.toLowerCase())) {
        return { value: context.data, confidence: 0.85 };
      }
    }
    
    return { value: context.data, confidence: 0 };
  }
  
  private applyRegexPatterns(context: IntelligenceContext): { value: any; confidence: number } {
    const dataStr = String(context.data).trim();
    
    for (const [type, pattern] of Object.entries(this.regexPatterns)) {
      if (pattern.test(dataStr)) {
        let confidence = 0.9;
        
        // Higher confidence for exact field match
        if (context.field && context.field.toLowerCase().includes(type.toLowerCase())) {
          confidence = 0.95;
        }
        
        return { value: dataStr, confidence };
      }
    }
    
    return { value: context.data, confidence: 0 };
  }
  
  private validateField(context: IntelligenceContext): { value: any; confidence: number } {
    const field = context.field as CanonicalField;
    const validator = (FIELD_VALIDATORS as any)[field];
    
    if (!validator) {
      return { value: context.data, confidence: 0 };
    }
    
    try {
      const result = validator.safeParse(context.data);
      if (result.success) {
        return { value: result.data, confidence: 0.95 };
      }
    } catch (error) {
      // Validation failed
    }
    
    return { value: context.data, confidence: 0 };
  }
  
  private applyTransformations(context: IntelligenceContext): { value: any; confidence: number } {
    let value = context.data;
    let confidence = 0;
    
    // Revenue transformation
    if (context.field === 'annualRevenue' || context.field === 'monthlyRevenue') {
      const transformed = this.transformRevenue(String(value));
      if (transformed !== value) {
        return { value: transformed, confidence: 0.85 };
      }
    }
    
    // Phone transformation
    if (context.field === 'phone' || context.field === 'secondaryPhone') {
      const transformed = this.transformPhone(String(value));
      if (transformed !== value) {
        return { value: transformed, confidence: 0.9 };
      }
    }
    
    // Business entity transformation
    if (context.field === 'businessType') {
      const transformed = this.transformBusinessType(String(value));
      if (transformed !== value) {
        return { value: transformed, confidence: 0.85 };
      }
    }
    
    return { value, confidence };
  }
  
  private transformRevenue(value: string): string {
    const cleaned = value.replace(/[^\d\.KkMmBb]/g, '');
    
    if (cleaned.match(/\d+[KkMmBb]/)) {
      const num = parseFloat(cleaned);
      const suffix = cleaned.slice(-1).toUpperCase();
      const multipliers: Record<string, number> = {
        'K': 1000,
        'M': 1000000,
        'B': 1000000000
      };
      
      if (multipliers[suffix]) {
        return String(num * multipliers[suffix]);
      }
    }
    
    return value;
  }
  
  private transformPhone(value: string): string {
    const cleaned = value.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const phone = cleaned.slice(1);
      return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
    }
    
    return value;
  }
  
  private transformBusinessType(value: string): string {
    const normalized = value.toUpperCase().trim();
    
    const mappings: Record<string, string> = {
      'LIMITED LIABILITY COMPANY': 'LLC',
      'INCORPORATED': 'INC',
      'CORPORATION': 'CORP',
      'LIMITED PARTNERSHIP': 'LP',
      'LIMITED LIABILITY PARTNERSHIP': 'LLP',
      'PROFESSIONAL LIMITED LIABILITY COMPANY': 'PLLC'
    };
    
    for (const [full, abbrev] of Object.entries(mappings)) {
      if (normalized.includes(full)) {
        return abbrev;
      }
    }
    
    return value;
  }
}

/**
 * Main Tiered Intelligence Service
 */
export class TieredIntelligenceService {
  private deterministicTier: DeterministicTier;
  private metricsTracker: MetricsTracker;
  private sessionId: string;
  
  constructor() {
    this.deterministicTier = new DeterministicTier();
    this.metricsTracker = new MetricsTracker();
    this.sessionId = this.generateSessionId();
  }
  
  /**
   * Process data through intelligence tiers
   */
  async process(context: IntelligenceContext): Promise<ExtractionResult> {
    const results: TierResult[] = [];
    let finalResult: TierResult | null = null;
    
    // Start with Tier 0 (Deterministic)
    console.log(`[TieredIntelligence] Processing ${context.field || 'data'} with Tier 0`);
    const tier0Result = await this.deterministicTier.process(context);
    results.push(tier0Result);
    this.metricsTracker.trackUsage(IntelligenceTier.DETERMINISTIC, tier0Result);
    
    // Check if we should short-circuit
    if (this.shouldShortCircuit(tier0Result, context)) {
      console.log(`[TieredIntelligence] Short-circuiting at Tier 0 with confidence ${tier0Result.confidence}`);
      this.metricsTracker.trackShortCircuit();
      finalResult = tier0Result;
    } else if (shouldEscalate(IntelligenceTier.DETERMINISTIC, tier0Result, context)) {
      // Escalate to Tier 1 (Embeddings)
      console.log(`[TieredIntelligence] Escalating to Tier 1`);
      this.metricsTracker.trackEscalation();
      
      const tier1Result = await this.processTier1(context, results);
      results.push(tier1Result);
      this.metricsTracker.trackUsage(IntelligenceTier.EMBEDDINGS, tier1Result);
      
      if (this.shouldShortCircuit(tier1Result, context)) {
        console.log(`[TieredIntelligence] Short-circuiting at Tier 1 with confidence ${tier1Result.confidence}`);
        this.metricsTracker.trackShortCircuit();
        finalResult = tier1Result;
      } else if (shouldEscalate(IntelligenceTier.EMBEDDINGS, tier1Result, context)) {
        // Escalate to Tier 2 (LLM)
        console.log(`[TieredIntelligence] Escalating to Tier 2`);
        this.metricsTracker.trackEscalation();
        
        const tier2Result = await this.processTier2(context, results);
        results.push(tier2Result);
        this.metricsTracker.trackUsage(IntelligenceTier.LLM, tier2Result);
        finalResult = tier2Result;
      } else {
        finalResult = tier1Result;
      }
    } else {
      finalResult = tier0Result;
    }
    
    // Persist metrics periodically
    if (Math.random() < 0.1) { // 10% chance to persist
      await this.metricsTracker.persistMetrics(this.sessionId);
    }
    
    // Emit event for monitoring
    eventBus.emit('intelligence:processed', {
      field: context.field,
      tier: finalResult.tier,
      confidence: finalResult.confidence,
      cost: finalResult.cost,
      latency: finalResult.latency,
      cached: finalResult.cached
    });
    
    return {
      field: context.field || 'unknown',
      originalValue: context.data,
      extractedValue: finalResult.value,
      confidence: finalResult.confidence,
      tier: finalResult.tier,
      cost: results.reduce((sum, r) => sum + r.cost, 0),
      latency: results.reduce((sum, r) => sum + r.latency, 0),
      method: finalResult.method,
      cached: finalResult.cached || false
    };
  }
  
  /**
   * Process Tier 1 - Embeddings & Fuzzy Matching
   */
  private async processTier1(
    context: IntelligenceContext,
    previousResults: TierResult[]
  ): Promise<TierResult> {
    const startTime = Date.now();
    
    try {
      // Generate embeddings for similarity matching
      const embeddingResult = await embeddingsService.generateEmbedding(
        String(context.data),
        {
          purpose: context.field || 'general',
          cacheKey: `${context.field}_${context.data}`
        }
      );
      
      // Find similar known values
      const similarityResult = await embeddingsService.findSimilar(
        embeddingResult.embedding,
        {
          category: context.field || 'general',
          threshold: 0.85,
          limit: 5
        }
      );
      
      let confidence = 0;
      let extractedValue = context.data;
      
      if (similarityResult.matches.length > 0) {
        const bestMatch = similarityResult.matches[0];
        confidence = bestMatch.similarity;
        extractedValue = bestMatch.value;
      }
      
      // Also try fuzzy string matching for text fields
      if (typeof context.data === 'string' && confidence < 0.85) {
        const fuzzyResult = await this.fuzzyMatch(context);
        if (fuzzyResult.confidence > confidence) {
          confidence = fuzzyResult.confidence;
          extractedValue = fuzzyResult.value;
        }
      }
      
      return {
        tier: IntelligenceTier.EMBEDDINGS,
        confidence,
        value: extractedValue,
        cost: embeddingResult.cost,
        latency: Date.now() - startTime,
        method: 'embeddings_similarity',
        cached: embeddingResult.cached
      };
      
    } catch (error) {
      console.error('[TieredIntelligence] Tier 1 error:', error);
      return {
        tier: IntelligenceTier.EMBEDDINGS,
        confidence: 0,
        value: context.data,
        cost: 0.001,
        latency: Date.now() - startTime,
        method: 'embeddings_error',
        error: String(error)
      };
    }
  }
  
  /**
   * Process Tier 2 - LLM Operations
   */
  private async processTier2(
    context: IntelligenceContext,
    previousResults: TierResult[]
  ): Promise<TierResult> {
    const startTime = Date.now();
    
    try {
      // Use LLM for complex extraction
      const llmResult = await llmService.extract({
        data: context.data,
        targetField: context.field,
        targetType: context.targetType,
        context: {
          previousAttempts: previousResults.map(r => ({
            tier: r.tier,
            confidence: r.confidence,
            value: r.value,
            method: r.method
          }))
        },
        requirements: context.requirements
      });
      
      return {
        tier: IntelligenceTier.LLM,
        confidence: llmResult.confidence,
        value: llmResult.value,
        cost: llmResult.cost,
        latency: Date.now() - startTime,
        method: 'llm_extraction',
        explanation: llmResult.explanation,
        cached: llmResult.cached
      };
      
    } catch (error) {
      console.error('[TieredIntelligence] Tier 2 error:', error);
      return {
        tier: IntelligenceTier.LLM,
        confidence: 0,
        value: context.data,
        cost: 0.02,
        latency: Date.now() - startTime,
        method: 'llm_error',
        error: String(error)
      };
    }
  }
  
  /**
   * Fuzzy string matching
   */
  private async fuzzyMatch(context: IntelligenceContext): Promise<{ value: any; confidence: number }> {
    // Implement fuzzy matching algorithms
    const dataStr = String(context.data).toLowerCase().trim();
    
    // Levenshtein distance for common business terms
    const commonTerms = this.getCommonTermsForField(context.field);
    let bestMatch = { value: context.data, confidence: 0 };
    
    for (const term of commonTerms) {
      const distance = this.levenshteinDistance(dataStr, term.toLowerCase());
      const maxLength = Math.max(dataStr.length, term.length);
      const similarity = 1 - (distance / maxLength);
      
      if (similarity > bestMatch.confidence) {
        bestMatch = { value: term, confidence: similarity * 0.9 }; // Cap at 0.9 for fuzzy matches
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Levenshtein distance algorithm
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    
    return dp[m][n];
  }
  
  /**
   * Get common terms for a field
   */
  private getCommonTermsForField(field?: string): string[] {
    const fieldTerms: Record<string, string[]> = {
      industry: [
        'Restaurant', 'Retail', 'Construction', 'Healthcare', 'Manufacturing',
        'Transportation', 'Technology', 'Professional Services', 'Real Estate'
      ],
      businessType: [
        'LLC', 'Corporation', 'Partnership', 'Sole Proprietorship', 'INC', 'CORP'
      ],
      state: [
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
        'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
        'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
        'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
        'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
        'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
        'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
        'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
        'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
        'West Virginia', 'Wisconsin', 'Wyoming'
      ],
      urgencyLevel: [
        'immediate', 'this_week', 'this_month', 'exploring'
      ]
    };
    
    return fieldTerms[field || ''] || [];
  }
  
  /**
   * Check if we should short-circuit processing
   */
  private shouldShortCircuit(result: TierResult, context: IntelligenceContext): boolean {
    const minConfidence = context.requirements?.minConfidence || 
                         executionPolicy.getConfig().escalation.minConfidenceForSkip;
    
    return result.confidence >= minConfidence;
  }
  
  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `intel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metricsTracker.getMetrics();
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metricsTracker = new MetricsTracker();
    this.sessionId = this.generateSessionId();
  }
}

// Export singleton instance
export const tieredIntelligence = new TieredIntelligenceService();