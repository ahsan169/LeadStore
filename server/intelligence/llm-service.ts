/**
 * LLM Service
 * GPT-4 based intelligent extraction and processing
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { db } from '../db';
import { llmCache } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';

/**
 * LLM configuration
 */
const LLM_CONFIG = {
  model: 'gpt-4-turbo-preview',
  fallbackModel: 'gpt-3.5-turbo',
  maxTokens: 2000,
  temperature: 0.3,
  costPerInputToken: {
    'gpt-4-turbo-preview': 0.00001,
    'gpt-3.5-turbo': 0.0000005
  },
  costPerOutputToken: {
    'gpt-4-turbo-preview': 0.00003,
    'gpt-3.5-turbo': 0.0000015
  },
  maxRetries: 3,
  retryDelay: 1000,
  cacheTTL: 7 * 24 * 60 * 60 * 1000 // 7 days
};

/**
 * Extraction request
 */
export interface ExtractionRequest {
  data: any;
  targetField?: string;
  targetType?: string;
  context?: any;
  requirements?: {
    minConfidence?: number;
    maxTokens?: number;
  };
  promptTemplate?: string;
  useStructuredOutput?: boolean;
}

/**
 * LLM result
 */
export interface LLMResult {
  value: any;
  confidence: number;
  explanation?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cached: boolean;
  processingTime: number;
  structuredOutput?: any;
}

/**
 * Prompt templates for specific tasks
 */
export class PromptTemplates {
  static readonly BUSINESS_ENTITY_EXTRACTION = `
You are an expert at extracting business entity information from unstructured text.

Extract the following information:
- Business Name
- Business Type (LLC, Corporation, etc.)
- Owner/Contact Name
- Industry/Business Category
- Years in Business

Input: {data}

Return a JSON object with the extracted fields and a confidence score (0-100) for each field.
Format:
{
  "businessName": { "value": "...", "confidence": 95 },
  "businessType": { "value": "...", "confidence": 90 },
  "ownerName": { "value": "...", "confidence": 85 },
  "industry": { "value": "...", "confidence": 80 },
  "yearsInBusiness": { "value": "...", "confidence": 75 }
}`;

  static readonly COLLATERAL_PARSING = `
You are an expert at parsing UCC collateral descriptions.

Analyze the following collateral text and extract:
- Type of collateral (equipment, inventory, accounts receivable, etc.)
- Estimated value (if mentioned)
- Specific items or categories
- Any restrictions or conditions

Collateral Text: {data}

Return a structured analysis with confidence scores.`;

  static readonly INDUSTRY_CLASSIFICATION = `
You are an expert at industry classification using NAICS codes.

Based on the following business information, determine:
- Most likely NAICS code (6-digit)
- Industry category
- Business sector
- Risk profile for lending (low/medium/high)

Business Info: {data}

Return structured data with confidence scores for each classification.`;

  static readonly RISK_ASSESSMENT = `
You are a financial risk assessment expert specializing in MCA/business lending.

Analyze the following business data and assess:
- Overall risk level (1-10, where 10 is highest risk)
- Key risk factors
- Positive indicators
- Recommended funding range
- Suggested terms

Business Data: {data}

Provide a detailed risk assessment with explanations.`;

  static readonly FIELD_EXTRACTION = `
You are an expert at extracting specific field values from text.

Target Field: {targetField}
Expected Type: {targetType}
Input Text: {data}

Extract the value for the target field. Consider variations, abbreviations, and context.
Return:
{
  "value": <extracted_value>,
  "confidence": <0-100>,
  "explanation": "<how you determined this>",
  "alternatives": [<other possible values if any>]
}`;

  static readonly REVENUE_DISCOVERY = `
You are an expert at discovering and estimating business revenue from various data sources.

Analyze the following information and estimate:
- Annual revenue
- Monthly revenue
- Revenue trends
- Confidence in estimate
- Data points used for estimation

Business Information: {data}

Provide detailed revenue analysis with supporting evidence.`;

  static readonly ENTITY_RESOLUTION = `
You are an expert at resolving and matching business entities.

Compare these two entities and determine:
- Are they the same business? (yes/no/maybe)
- Confidence score (0-100)
- Matching fields
- Conflicting fields
- Resolution recommendation

Entity 1: {entity1}
Entity 2: {entity2}

Provide detailed comparison and resolution.`;
}

/**
 * LLM cache manager
 */
class LLMCache {
  private memoryCache: Map<string, LLMResult>;
  private maxMemoryItems = 500;
  
  constructor() {
    this.memoryCache = new Map();
  }
  
  /**
   * Get cached result
   */
  async get(cacheKey: string): Promise<LLMResult | null> {
    // Check memory cache
    if (this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey)!;
      return { ...cached, cached: true, cost: 0 };
    }
    
    // Check database cache
    try {
      const result = await db
        .select()
        .from(llmCache)
        .where(eq(llmCache.cacheKey, cacheKey))
        .limit(1);
      
      if (result.length > 0) {
        const dbCached = result[0];
        const age = Date.now() - dbCached.createdAt.getTime();
        
        if (age < LLM_CONFIG.cacheTTL) {
          const llmResult: LLMResult = {
            value: dbCached.response,
            confidence: dbCached.confidence || 0,
            explanation: dbCached.metadata?.explanation,
            model: dbCached.model,
            inputTokens: dbCached.inputTokens || 0,
            outputTokens: dbCached.outputTokens || 0,
            cost: 0, // No cost for cached
            cached: true,
            processingTime: 0
          };
          
          // Add to memory cache
          this.addToMemoryCache(cacheKey, llmResult);
          
          return llmResult;
        }
      }
    } catch (error) {
      console.error('[LLMCache] Database fetch error:', error);
    }
    
    return null;
  }
  
  /**
   * Store result in cache
   */
  async set(cacheKey: string, result: LLMResult): Promise<void> {
    // Add to memory cache
    this.addToMemoryCache(cacheKey, result);
    
    // Store in database
    try {
      await db.insert(llmCache).values({
        cacheKey,
        prompt: cacheKey, // Use cache key as prompt reference
        response: result.value,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        confidence: result.confidence,
        metadata: {
          explanation: result.explanation,
          structuredOutput: result.structuredOutput
        },
        createdAt: new Date()
      }).onConflictDoUpdate({
        target: llmCache.cacheKey,
        set: {
          response: result.value,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost: result.cost,
          confidence: result.confidence,
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.error('[LLMCache] Database store error:', error);
    }
  }
  
  /**
   * Add to memory cache with LRU
   */
  private addToMemoryCache(key: string, result: LLMResult): void {
    if (this.memoryCache.size >= this.maxMemoryItems) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, result);
  }
}

/**
 * LLM Service
 */
export class LLMService {
  private openai: OpenAI;
  private cache: LLMCache;
  private requestQueue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestCount = 0;
  private resetTime = Date.now() + 60000;
  private readonly maxRequestsPerMinute = 500;
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({ apiKey });
    this.cache = new LLMCache();
    
    console.log('[LLMService] Initialized with OpenAI API');
  }
  
  /**
   * Extract information using LLM
   */
  async extract(request: ExtractionRequest): Promise<LLMResult> {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = this.generateCacheKey(request);
    
    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      console.log(`[LLMService] Cache hit for extraction`);
      return cached;
    }
    
    // Build prompt
    const prompt = this.buildPrompt(request);
    
    // Rate limiting
    await this.waitForRateLimit();
    
    try {
      console.log(`[LLMService] Processing extraction request`);
      
      const model = LLM_CONFIG.model;
      let response;
      let retries = 0;
      
      while (retries < LLM_CONFIG.maxRetries) {
        try {
          if (request.useStructuredOutput) {
            response = await this.openai.chat.completions.create({
              model,
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert data extractor. Always return valid JSON.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: LLM_CONFIG.temperature,
              max_tokens: request.requirements?.maxTokens || LLM_CONFIG.maxTokens,
              response_format: { type: 'json_object' }
            });
          } else {
            response = await this.openai.chat.completions.create({
              model,
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert data extractor.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: LLM_CONFIG.temperature,
              max_tokens: request.requirements?.maxTokens || LLM_CONFIG.maxTokens
            });
          }
          
          break;
        } catch (error: any) {
          retries++;
          if (retries >= LLM_CONFIG.maxRetries) {
            throw error;
          }
          
          // If rate limited or server error, wait and retry
          if (error.status === 429 || error.status >= 500) {
            await new Promise(resolve => setTimeout(resolve, LLM_CONFIG.retryDelay * retries));
          } else if (model === LLM_CONFIG.model) {
            // Try fallback model
            console.log(`[LLMService] Falling back to ${LLM_CONFIG.fallbackModel}`);
            response = await this.openai.chat.completions.create({
              model: LLM_CONFIG.fallbackModel,
              messages: [
                {
                  role: 'system',
                  content: 'You are an expert data extractor.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: LLM_CONFIG.temperature,
              max_tokens: request.requirements?.maxTokens || LLM_CONFIG.maxTokens
            });
            break;
          } else {
            throw error;
          }
        }
      }
      
      if (!response) {
        throw new Error('Failed to get LLM response after retries');
      }
      
      // Parse response
      const content = response.choices[0]?.message?.content || '';
      const parsedResult = this.parseResponse(content, request);
      
      // Calculate cost
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const usedModel = response.model || model;
      const cost = this.calculateCost(inputTokens, outputTokens, usedModel);
      
      const result: LLMResult = {
        value: parsedResult.value,
        confidence: parsedResult.confidence,
        explanation: parsedResult.explanation,
        model: usedModel,
        inputTokens,
        outputTokens,
        cost,
        cached: false,
        processingTime: Date.now() - startTime,
        structuredOutput: parsedResult.structuredOutput
      };
      
      // Cache the result
      await this.cache.set(cacheKey, result);
      
      // Track metrics
      eventBus.emit('llm:processed', {
        model: usedModel,
        inputTokens,
        outputTokens,
        cost,
        latency: result.processingTime,
        cached: false
      });
      
      return result;
      
    } catch (error) {
      console.error('[LLMService] Extraction error:', error);
      throw new Error(`LLM extraction failed: ${error}`);
    }
  }
  
  /**
   * Build prompt from request
   */
  private buildPrompt(request: ExtractionRequest): string {
    if (request.promptTemplate) {
      return request.promptTemplate
        .replace('{data}', JSON.stringify(request.data))
        .replace('{targetField}', request.targetField || '')
        .replace('{targetType}', request.targetType || '')
        .replace('{context}', JSON.stringify(request.context || {}));
    }
    
    // Use default field extraction template
    let template = PromptTemplates.FIELD_EXTRACTION;
    
    // Select appropriate template based on target field
    if (request.targetField) {
      const field = request.targetField.toLowerCase();
      if (field.includes('business') || field.includes('company')) {
        template = PromptTemplates.BUSINESS_ENTITY_EXTRACTION;
      } else if (field.includes('industry') || field.includes('naics')) {
        template = PromptTemplates.INDUSTRY_CLASSIFICATION;
      } else if (field.includes('revenue') || field.includes('sales')) {
        template = PromptTemplates.REVENUE_DISCOVERY;
      } else if (field.includes('risk') || field.includes('score')) {
        template = PromptTemplates.RISK_ASSESSMENT;
      } else if (field.includes('collateral') || field.includes('ucc')) {
        template = PromptTemplates.COLLATERAL_PARSING;
      }
    }
    
    return template
      .replace('{data}', JSON.stringify(request.data))
      .replace('{targetField}', request.targetField || '')
      .replace('{targetType}', request.targetType || '');
  }
  
  /**
   * Parse LLM response
   */
  private parseResponse(
    content: string,
    request: ExtractionRequest
  ): { value: any; confidence: number; explanation?: string; structuredOutput?: any } {
    try {
      // Try to parse as JSON first
      const json = JSON.parse(content);
      
      // Check for structured response format
      if (json.value !== undefined && json.confidence !== undefined) {
        return {
          value: json.value,
          confidence: json.confidence,
          explanation: json.explanation,
          structuredOutput: json
        };
      }
      
      // Check for field-specific format
      if (request.targetField && json[request.targetField]) {
        const fieldData = json[request.targetField];
        if (fieldData.value !== undefined && fieldData.confidence !== undefined) {
          return {
            value: fieldData.value,
            confidence: fieldData.confidence,
            explanation: fieldData.explanation,
            structuredOutput: json
          };
        }
      }
      
      // If JSON but not in expected format, use the whole object
      return {
        value: json,
        confidence: 70, // Default medium confidence
        structuredOutput: json
      };
      
    } catch (error) {
      // If not JSON, return as string with lower confidence
      return {
        value: content.trim(),
        confidence: 50,
        explanation: 'Raw text response'
      };
    }
  }
  
  /**
   * Calculate cost based on token usage
   */
  private calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const inputCost = inputTokens * (LLM_CONFIG.costPerInputToken[model as keyof typeof LLM_CONFIG.costPerInputToken] || 0.00001);
    const outputCost = outputTokens * (LLM_CONFIG.costPerOutputToken[model as keyof typeof LLM_CONFIG.costPerOutputToken] || 0.00003);
    return inputCost + outputCost;
  }
  
  /**
   * Generate cache key
   */
  private generateCacheKey(request: ExtractionRequest): string {
    const data = JSON.stringify({
      data: request.data,
      targetField: request.targetField,
      targetType: request.targetType
    });
    
    return `llm_${this.simpleHash(data)}`;
  }
  
  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
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
      console.log(`[LLMService] Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    this.requestCount++;
  }
  
  /**
   * Batch process multiple extractions
   */
  async extractBatch(
    requests: ExtractionRequest[]
  ): Promise<LLMResult[]> {
    const results: LLMResult[] = [];
    
    // Process in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < requests.length; i += concurrency) {
      const batch = requests.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(req => this.extract(req))
      );
      results.push(...batchResults);
    }
    
    return results;
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
}

// Export singleton instance
export const llmService = new LLMService();