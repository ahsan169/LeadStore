/**
 * Intelligent Field Extractor
 * Progressive field extraction through intelligence tiers
 */

import { Lead, InsertLead } from '@shared/schema';
import { 
  tieredIntelligence,
  IntelligenceContext,
  ExtractionResult,
  IntelligenceTier
} from './tiered-intelligence';
import { CanonicalField } from './ontology';
import { executionPolicy } from './execution-policy';
import { eventBus } from '../services/event-bus';

/**
 * Field extraction request
 */
export interface FieldExtractionRequest {
  data: any;
  fields: string[];
  context?: {
    leadId?: string;
    userId?: string;
    batchId?: string;
    source?: string;
  };
  requirements?: {
    minConfidence?: number;
    maxCost?: number;
    maxLatency?: number;
  };
  options?: {
    parallel?: boolean;
    stopOnHighConfidence?: boolean;
    preferredTiers?: IntelligenceTier[];
  };
}

/**
 * Field extraction response
 */
export interface FieldExtractionResponse {
  fields: Record<string, ExtractionResult>;
  totalCost: number;
  totalLatency: number;
  averageConfidence: number;
  tiersUsed: Set<IntelligenceTier>;
  explanations: Record<string, string>;
}

/**
 * Extraction strategy
 */
export interface ExtractionStrategy {
  field: string;
  priority: number;
  requiredConfidence: number;
  maxCost: number;
  preferredMethod?: string;
}

/**
 * Field Extractor Service
 */
export class FieldExtractorService {
  private extractionHistory: Map<string, ExtractionResult[]>;
  private strategies: Map<string, ExtractionStrategy>;
  
  constructor() {
    this.extractionHistory = new Map();
    this.strategies = this.initializeStrategies();
    
    console.log('[FieldExtractor] Initialized with strategies for', this.strategies.size, 'fields');
  }
  
  /**
   * Initialize extraction strategies
   */
  private initializeStrategies(): Map<string, ExtractionStrategy> {
    const strategies = new Map<string, ExtractionStrategy>();
    
    // Critical business fields
    strategies.set('businessName', {
      field: 'businessName',
      priority: 1,
      requiredConfidence: 0.9,
      maxCost: 0.03,
      preferredMethod: 'deterministic'
    });
    
    strategies.set('ownerName', {
      field: 'ownerName',
      priority: 2,
      requiredConfidence: 0.85,
      maxCost: 0.02,
      preferredMethod: 'deterministic'
    });
    
    // Contact information
    strategies.set('email', {
      field: 'email',
      priority: 3,
      requiredConfidence: 0.95,
      maxCost: 0.01,
      preferredMethod: 'regex'
    });
    
    strategies.set('phone', {
      field: 'phone',
      priority: 3,
      requiredConfidence: 0.95,
      maxCost: 0.01,
      preferredMethod: 'regex'
    });
    
    // Financial fields
    strategies.set('annualRevenue', {
      field: 'annualRevenue',
      priority: 4,
      requiredConfidence: 0.8,
      maxCost: 0.03,
      preferredMethod: 'embeddings'
    });
    
    strategies.set('creditScore', {
      field: 'creditScore',
      priority: 5,
      requiredConfidence: 0.85,
      maxCost: 0.02,
      preferredMethod: 'regex'
    });
    
    // Business details
    strategies.set('industry', {
      field: 'industry',
      priority: 6,
      requiredConfidence: 0.75,
      maxCost: 0.04,
      preferredMethod: 'embeddings'
    });
    
    strategies.set('yearFounded', {
      field: 'yearFounded',
      priority: 8,
      requiredConfidence: 0.7,
      maxCost: 0.02,
      preferredMethod: 'deterministic'
    });
    
    // UCC-related fields
    strategies.set('uccNumber', {
      field: 'uccNumber',
      priority: 7,
      requiredConfidence: 0.9,
      maxCost: 0.02,
      preferredMethod: 'regex'
    });
    
    strategies.set('filingDate', {
      field: 'filingDate',
      priority: 8,
      requiredConfidence: 0.85,
      maxCost: 0.01,
      preferredMethod: 'regex'
    });
    
    // Address fields
    strategies.set('city', {
      field: 'city',
      priority: 9,
      requiredConfidence: 0.8,
      maxCost: 0.02,
      preferredMethod: 'embeddings'
    });
    
    strategies.set('state', {
      field: 'state',
      priority: 9,
      requiredConfidence: 0.85,
      maxCost: 0.01,
      preferredMethod: 'deterministic'
    });
    
    strategies.set('zipCode', {
      field: 'zipCode',
      priority: 10,
      requiredConfidence: 0.95,
      maxCost: 0.01,
      preferredMethod: 'regex'
    });
    
    return strategies;
  }
  
  /**
   * Extract multiple fields
   */
  async extractFields(request: FieldExtractionRequest): Promise<FieldExtractionResponse> {
    const startTime = Date.now();
    const results: Record<string, ExtractionResult> = {};
    const tiersUsed = new Set<IntelligenceTier>();
    const explanations: Record<string, string> = {};
    
    // Sort fields by priority
    const sortedFields = this.sortFieldsByPriority(request.fields);
    
    // Extract fields
    if (request.options?.parallel) {
      // Parallel extraction
      const promises = sortedFields.map(field => 
        this.extractSingleField(field, request)
      );
      
      const fieldResults = await Promise.all(promises);
      
      fieldResults.forEach((result, index) => {
        const field = sortedFields[index];
        results[field] = result;
        tiersUsed.add(result.tier);
        
        if (result.method) {
          explanations[field] = this.generateExplanation(field, result);
        }
      });
      
    } else {
      // Sequential extraction with short-circuiting
      for (const field of sortedFields) {
        const result = await this.extractSingleField(field, request);
        results[field] = result;
        tiersUsed.add(result.tier);
        
        if (result.method) {
          explanations[field] = this.generateExplanation(field, result);
        }
        
        // Check if we should stop due to high confidence
        if (request.options?.stopOnHighConfidence && result.confidence >= 0.95) {
          console.log(`[FieldExtractor] Short-circuiting extraction for ${field} with confidence ${result.confidence}`);
        }
      }
    }
    
    // Calculate totals
    const totalCost = Object.values(results).reduce((sum, r) => sum + r.cost, 0);
    const totalLatency = Date.now() - startTime;
    const confidences = Object.values(results).map(r => r.confidence);
    const averageConfidence = confidences.length > 0 ?
      confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
    
    // Store in history
    request.fields.forEach(field => {
      const history = this.extractionHistory.get(field) || [];
      history.push(results[field]);
      
      // Keep only last 100 entries
      if (history.length > 100) {
        history.shift();
      }
      
      this.extractionHistory.set(field, history);
    });
    
    // Emit metrics event
    eventBus.emit('extraction:completed', {
      fields: request.fields.length,
      totalCost,
      totalLatency,
      averageConfidence,
      tiersUsed: Array.from(tiersUsed)
    });
    
    return {
      fields: results,
      totalCost,
      totalLatency,
      averageConfidence,
      tiersUsed,
      explanations
    };
  }
  
  /**
   * Extract a single field
   */
  private async extractSingleField(
    field: string,
    request: FieldExtractionRequest
  ): Promise<ExtractionResult> {
    const strategy = this.strategies.get(field) || this.getDefaultStrategy(field);
    
    // Build intelligence context
    const context: IntelligenceContext = {
      data: this.getFieldData(request.data, field),
      field,
      targetType: this.getFieldType(field),
      requirements: {
        minConfidence: request.requirements?.minConfidence || strategy.requiredConfidence,
        maxCost: Math.min(
          request.requirements?.maxCost || Infinity,
          strategy.maxCost
        ),
        maxLatency: request.requirements?.maxLatency
      },
      metadata: request.context
    };
    
    // Check if field data exists
    if (!context.data || context.data === '' || context.data === null) {
      return {
        field,
        originalValue: null,
        extractedValue: null,
        confidence: 0,
        tier: IntelligenceTier.DETERMINISTIC,
        cost: 0,
        latency: 0,
        method: 'no_data',
        cached: false
      };
    }
    
    try {
      // Process through tiered intelligence
      const result = await tieredIntelligence.process(context);
      
      // Log extraction details
      console.log(`[FieldExtractor] Extracted ${field}:`);
      console.log(`  Value: ${result.extractedValue}`);
      console.log(`  Confidence: ${result.confidence}`);
      console.log(`  Tier: ${result.tier}`);
      console.log(`  Cost: $${result.cost.toFixed(4)}`);
      console.log(`  Method: ${result.method}`);
      
      return result;
      
    } catch (error) {
      console.error(`[FieldExtractor] Failed to extract ${field}:`, error);
      
      return {
        field,
        originalValue: context.data,
        extractedValue: null,
        confidence: 0,
        tier: IntelligenceTier.DETERMINISTIC,
        cost: 0,
        latency: 0,
        method: 'error',
        cached: false
      };
    }
  }
  
  /**
   * Get field data from raw data
   */
  private getFieldData(data: any, field: string): any {
    // Direct field access
    if (data[field] !== undefined) {
      return data[field];
    }
    
    // Try variations of field name
    const variations = [
      field,
      field.toLowerCase(),
      field.toUpperCase(),
      this.snakeToCamel(field),
      this.camelToSnake(field),
      field.replace(/_/g, ''),
      field.replace(/-/g, ''),
      field.replace(/\s+/g, '')
    ];
    
    for (const variation of variations) {
      if (data[variation] !== undefined) {
        return data[variation];
      }
    }
    
    // Try to find in nested structures
    if (typeof data === 'object' && data !== null) {
      for (const key in data) {
        const value = data[key];
        if (typeof value === 'object' && value !== null) {
          const nested = this.getFieldData(value, field);
          if (nested !== undefined && nested !== null) {
            return nested;
          }
        }
      }
    }
    
    // If data is a string, it might contain the field
    if (typeof data === 'string') {
      return data;
    }
    
    // If data is an array, try to extract from first element
    if (Array.isArray(data) && data.length > 0) {
      return this.getFieldData(data[0], field);
    }
    
    return null;
  }
  
  /**
   * Get field type
   */
  private getFieldType(field: string): string {
    const typeMap: Record<string, string> = {
      businessName: 'string',
      ownerName: 'string',
      email: 'email',
      phone: 'phone',
      annualRevenue: 'number',
      creditScore: 'number',
      yearFounded: 'number',
      industry: 'string',
      uccNumber: 'string',
      filingDate: 'date',
      city: 'string',
      state: 'string',
      zipCode: 'string'
    };
    
    return typeMap[field] || 'string';
  }
  
  /**
   * Sort fields by priority
   */
  private sortFieldsByPriority(fields: string[]): string[] {
    return fields.sort((a, b) => {
      const strategyA = this.strategies.get(a);
      const strategyB = this.strategies.get(b);
      
      const priorityA = strategyA?.priority || 99;
      const priorityB = strategyB?.priority || 99;
      
      return priorityA - priorityB;
    });
  }
  
  /**
   * Get default strategy for unknown field
   */
  private getDefaultStrategy(field: string): ExtractionStrategy {
    return {
      field,
      priority: 99,
      requiredConfidence: 0.7,
      maxCost: 0.02,
      preferredMethod: 'auto'
    };
  }
  
  /**
   * Generate explanation for extraction
   */
  private generateExplanation(field: string, result: ExtractionResult): string {
    const tierNames = {
      [IntelligenceTier.DETERMINISTIC]: 'pattern matching',
      [IntelligenceTier.EMBEDDINGS]: 'semantic analysis',
      [IntelligenceTier.LLM]: 'AI extraction'
    };
    
    const tierName = tierNames[result.tier];
    const confidence = Math.round(result.confidence * 100);
    
    if (result.confidence >= 0.9) {
      return `Extracted ${field} using ${tierName} with ${confidence}% confidence`;
    } else if (result.confidence >= 0.7) {
      return `Likely match for ${field} using ${tierName} (${confidence}% confidence)`;
    } else if (result.confidence >= 0.5) {
      return `Possible match for ${field} using ${tierName} (${confidence}% confidence)`;
    } else {
      return `Low confidence extraction for ${field} using ${tierName} (${confidence}% confidence)`;
    }
  }
  
  /**
   * Convert snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  
  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
  
  /**
   * Batch extract fields from multiple records
   */
  async batchExtract(
    records: any[],
    fields: string[],
    options?: {
      parallel?: boolean;
      maxConcurrency?: number;
    }
  ): Promise<FieldExtractionResponse[]> {
    const results: FieldExtractionResponse[] = [];
    const concurrency = options?.maxConcurrency || 5;
    
    if (options?.parallel) {
      // Process in batches with concurrency control
      for (let i = 0; i < records.length; i += concurrency) {
        const batch = records.slice(i, i + concurrency);
        const batchPromises = batch.map(record =>
          this.extractFields({
            data: record,
            fields,
            options: { parallel: true }
          })
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
    } else {
      // Sequential processing
      for (const record of records) {
        const result = await this.extractFields({
          data: record,
          fields
        });
        results.push(result);
      }
    }
    
    return results;
  }
  
  /**
   * Get extraction statistics
   */
  getStatistics() {
    const fieldStats: Record<string, any> = {};
    
    this.extractionHistory.forEach((history, field) => {
      if (history.length === 0) return;
      
      const confidences = history.map(h => h.confidence);
      const costs = history.map(h => h.cost);
      const tiers = history.map(h => h.tier);
      
      fieldStats[field] = {
        extractionCount: history.length,
        avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
        avgCost: costs.reduce((a, b) => a + b, 0) / costs.length,
        tierDistribution: {
          deterministic: tiers.filter(t => t === IntelligenceTier.DETERMINISTIC).length,
          embeddings: tiers.filter(t => t === IntelligenceTier.EMBEDDINGS).length,
          llm: tiers.filter(t => t === IntelligenceTier.LLM).length
        }
      };
    });
    
    return {
      fieldStats,
      totalExtractions: Array.from(this.extractionHistory.values())
        .reduce((sum, h) => sum + h.length, 0)
    };
  }
  
  /**
   * Clear extraction history
   */
  clearHistory(): void {
    this.extractionHistory.clear();
  }
  
  /**
   * Update extraction strategy
   */
  updateStrategy(field: string, strategy: Partial<ExtractionStrategy>): void {
    const existing = this.strategies.get(field) || this.getDefaultStrategy(field);
    this.strategies.set(field, { ...existing, ...strategy });
  }
}

// Export singleton instance
export const fieldExtractor = new FieldExtractorService();