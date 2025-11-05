/**
 * Intelligence Execution Policy
 * Rules and thresholds for tier escalation and cost management
 */

import { IntelligenceTier, TierResult, IntelligenceContext } from './tiered-intelligence';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tier configuration
 */
export interface TierConfig {
  name: string;
  maxLatency: number;
  cost: number;
  confidenceThreshold: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Escalation configuration
 */
export interface EscalationConfig {
  minConfidenceForSkip: number;
  maxCostPerLead: number;
  maxLatencyPerField?: number;
  confidenceDecayFactor?: number;
  costBudgetPerBatch?: number;
}

/**
 * Policy configuration
 */
export interface PolicyConfig {
  tiers: Record<string, TierConfig>;
  escalation: EscalationConfig;
  caching: {
    ttl: Record<IntelligenceTier, number>;
    maxSize: Record<IntelligenceTier, number>;
  };
  rateLimit: {
    tier0: { requestsPerSecond: number };
    tier1: { requestsPerSecond: number };
    tier2: { requestsPerSecond: number };
  };
  fieldPriorities?: Record<string, number>;
  industryMultipliers?: Record<string, number>;
}

/**
 * Default policy configuration
 */
const DEFAULT_CONFIG: PolicyConfig = {
  tiers: {
    "0": {
      name: "deterministic",
      maxLatency: 100,
      cost: 0,
      confidenceThreshold: 0.95,
      maxRetries: 1
    },
    "1": {
      name: "embeddings",
      maxLatency: 500,
      cost: 0.001,
      confidenceThreshold: 0.85,
      maxRetries: 2,
      retryDelay: 100
    },
    "2": {
      name: "llm",
      maxLatency: 5000,
      cost: 0.02,
      confidenceThreshold: 0.70,
      maxRetries: 3,
      retryDelay: 500
    }
  },
  escalation: {
    minConfidenceForSkip: 0.90,
    maxCostPerLead: 0.10,
    maxLatencyPerField: 10000,
    confidenceDecayFactor: 0.95,
    costBudgetPerBatch: 100
  },
  caching: {
    ttl: {
      0: 86400000, // 1 day (Tier 0 - Deterministic)
      1: 604800000,   // 7 days (Tier 1 - Embeddings)
      2: 2592000000          // 30 days (Tier 2 - LLM)
    },
    maxSize: {
      0: 10000, // Tier 0 - Deterministic
      1: 5000,  // Tier 1 - Embeddings
      2: 1000   // Tier 2 - LLM
    }
  },
  rateLimit: {
    tier0: { requestsPerSecond: 1000 },
    tier1: { requestsPerSecond: 50 },
    tier2: { requestsPerSecond: 10 }
  },
  fieldPriorities: {
    // Critical fields get higher priority (lower threshold)
    businessName: 1.0,
    ownerName: 0.95,
    email: 0.9,
    phone: 0.9,
    industry: 0.85,
    annualRevenue: 0.85,
    creditScore: 0.8,
    // Less critical fields
    yearFounded: 0.7,
    websiteUrl: 0.65,
    businessDescription: 0.6
  },
  industryMultipliers: {
    // High-value industries get more budget
    healthcare: 1.5,
    finance: 1.5,
    technology: 1.3,
    manufacturing: 1.2,
    retail: 1.0,
    restaurant: 0.8,
    unknown: 0.9
  }
};

/**
 * Budget tracker
 */
class BudgetTracker {
  private spent: number = 0;
  private leadCosts: Map<string, number> = new Map();
  private batchBudget: number;
  private leadBudget: number;
  
  constructor(batchBudget: number, leadBudget: number) {
    this.batchBudget = batchBudget;
    this.leadBudget = leadBudget;
  }
  
  canSpend(amount: number, leadId?: string): boolean {
    // Check batch budget
    if (this.spent + amount > this.batchBudget) {
      return false;
    }
    
    // Check lead budget
    if (leadId) {
      const leadSpent = this.leadCosts.get(leadId) || 0;
      if (leadSpent + amount > this.leadBudget) {
        return false;
      }
    }
    
    return true;
  }
  
  spend(amount: number, leadId?: string): void {
    this.spent += amount;
    
    if (leadId) {
      const current = this.leadCosts.get(leadId) || 0;
      this.leadCosts.set(leadId, current + amount);
    }
  }
  
  getSpent(leadId?: string): number {
    if (leadId) {
      return this.leadCosts.get(leadId) || 0;
    }
    return this.spent;
  }
  
  getRemainingBudget(leadId?: string): number {
    if (leadId) {
      const spent = this.leadCosts.get(leadId) || 0;
      return this.leadBudget - spent;
    }
    return this.batchBudget - this.spent;
  }
  
  reset(): void {
    this.spent = 0;
    this.leadCosts.clear();
  }
}

/**
 * Confidence adjuster
 */
class ConfidenceAdjuster {
  private fieldHistory: Map<string, number[]> = new Map();
  
  /**
   * Adjust confidence threshold based on field history
   */
  adjustThreshold(
    field: string,
    baseThreshold: number,
    fieldPriority?: number
  ): number {
    // Apply field priority multiplier
    let adjusted = baseThreshold;
    if (fieldPriority !== undefined) {
      adjusted = baseThreshold * fieldPriority;
    }
    
    // Adjust based on historical success
    const history = this.fieldHistory.get(field) || [];
    if (history.length > 0) {
      const avgConfidence = history.reduce((a, b) => a + b, 0) / history.length;
      
      // If historically low confidence, lower threshold
      if (avgConfidence < 0.7) {
        adjusted *= 0.9;
      }
      // If historically high confidence, raise threshold
      else if (avgConfidence > 0.9) {
        adjusted = Math.min(adjusted * 1.05, 0.99);
      }
    }
    
    return Math.max(0.5, Math.min(0.99, adjusted));
  }
  
  /**
   * Record confidence for learning
   */
  recordConfidence(field: string, confidence: number): void {
    const history = this.fieldHistory.get(field) || [];
    history.push(confidence);
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
    
    this.fieldHistory.set(field, history);
  }
}

/**
 * Execution Policy Manager
 */
export class ExecutionPolicyManager {
  private config: PolicyConfig;
  private configPath: string;
  private budgetTracker: BudgetTracker;
  private confidenceAdjuster: ConfidenceAdjuster;
  private costHistory: number[] = [];
  private latencyHistory: Map<IntelligenceTier, number[]> = new Map();
  
  constructor(configPath?: string) {
    this.configPath = configPath || path.join(__dirname, 'config', 'intelligence.json');
    this.config = this.loadConfig();
    this.budgetTracker = new BudgetTracker(
      this.config.escalation.costBudgetPerBatch || 100,
      this.config.escalation.maxCostPerLead
    );
    this.confidenceAdjuster = new ConfidenceAdjuster();
    
    console.log('[ExecutionPolicy] Initialized with config:', this.configPath);
  }
  
  /**
   * Load configuration from file or use default
   */
  private loadConfig(): PolicyConfig {
    try {
      if (existsSync(this.configPath)) {
        const content = readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(content) as PolicyConfig;
        // Merge with defaults to ensure all fields exist
        return this.mergeConfigs(DEFAULT_CONFIG, loaded);
      }
    } catch (error) {
      console.error('[ExecutionPolicy] Failed to load config, using defaults:', error);
    }
    
    // Save default config
    this.saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  
  /**
   * Save configuration to file
   */
  private saveConfig(config: PolicyConfig): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!existsSync(dir)) {
        const fs = require('fs');
        fs.mkdirSync(dir, { recursive: true });
      }
      
      writeFileSync(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[ExecutionPolicy] Failed to save config:', error);
    }
  }
  
  /**
   * Merge configurations
   */
  private mergeConfigs(defaults: PolicyConfig, loaded: Partial<PolicyConfig>): PolicyConfig {
    return {
      tiers: { ...defaults.tiers, ...loaded.tiers },
      escalation: { ...defaults.escalation, ...loaded.escalation },
      caching: { ...defaults.caching, ...loaded.caching },
      rateLimit: { ...defaults.rateLimit, ...loaded.rateLimit },
      fieldPriorities: { ...defaults.fieldPriorities, ...loaded.fieldPriorities },
      industryMultipliers: { ...defaults.industryMultipliers, ...loaded.industryMultipliers }
    };
  }
  
  /**
   * Get configuration
   */
  getConfig(): PolicyConfig {
    return this.config;
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PolicyConfig>): void {
    this.config = this.mergeConfigs(this.config, updates);
    this.saveConfig(this.config);
  }
  
  /**
   * Get tier configuration
   */
  getTierConfig(tier: IntelligenceTier): TierConfig {
    return this.config.tiers[tier.toString()];
  }
  
  /**
   * Check if should escalate to next tier
   */
  shouldEscalate(
    currentTier: IntelligenceTier,
    result: TierResult,
    context: IntelligenceContext
  ): boolean {
    // Never escalate from highest tier
    if (currentTier === IntelligenceTier.LLM) {
      return false;
    }
    
    const tierConfig = this.getTierConfig(currentTier);
    const leadId = context.metadata?.leadId;
    
    // Check budget constraints
    const nextTier = currentTier + 1;
    const nextTierConfig = this.getTierConfig(nextTier as IntelligenceTier);
    if (!this.budgetTracker.canSpend(nextTierConfig.cost, leadId)) {
      console.log(`[ExecutionPolicy] Budget exceeded, cannot escalate to tier ${nextTier}`);
      return false;
    }
    
    // Check confidence threshold
    const baseThreshold = tierConfig.confidenceThreshold;
    const fieldPriority = context.field ? 
      this.config.fieldPriorities?.[context.field] : undefined;
    
    const adjustedThreshold = this.confidenceAdjuster.adjustThreshold(
      context.field || 'unknown',
      baseThreshold,
      fieldPriority
    );
    
    // Record confidence for learning
    if (context.field) {
      this.confidenceAdjuster.recordConfidence(context.field, result.confidence);
    }
    
    // Check if confidence is below threshold
    if (result.confidence >= adjustedThreshold) {
      return false;
    }
    
    // Check latency constraints
    const totalLatency = context.previousResults?.reduce((sum, r) => sum + r.latency, 0) || 0;
    const maxLatency = context.requirements?.maxLatency || 
                      this.config.escalation.maxLatencyPerField || 10000;
    
    if (totalLatency + nextTierConfig.maxLatency > maxLatency) {
      console.log(`[ExecutionPolicy] Latency budget exceeded, cannot escalate`);
      return false;
    }
    
    // Apply industry multiplier if available
    if (context.metadata?.industry) {
      const multiplier = this.config.industryMultipliers?.[context.metadata.industry] || 1.0;
      const adjustedCost = nextTierConfig.cost * multiplier;
      
      if (!this.budgetTracker.canSpend(adjustedCost, leadId)) {
        return false;
      }
    }
    
    console.log(`[ExecutionPolicy] Escalating from tier ${currentTier} to ${nextTier}`);
    console.log(`  Confidence: ${result.confidence} < ${adjustedThreshold}`);
    console.log(`  Budget remaining: $${this.budgetTracker.getRemainingBudget(leadId).toFixed(4)}`);
    
    return true;
  }
  
  /**
   * Record cost spent
   */
  recordCost(amount: number, leadId?: string): void {
    this.budgetTracker.spend(amount, leadId);
    this.costHistory.push(amount);
    
    // Keep only last 1000 entries
    if (this.costHistory.length > 1000) {
      this.costHistory.shift();
    }
  }
  
  /**
   * Record latency
   */
  recordLatency(tier: IntelligenceTier, latency: number): void {
    const history = this.latencyHistory.get(tier) || [];
    history.push(latency);
    
    // Keep only last 100 entries
    if (history.length > 100) {
      history.shift();
    }
    
    this.latencyHistory.set(tier, history);
  }
  
  /**
   * Get cache TTL for tier
   */
  getCacheTTL(tier: IntelligenceTier): number {
    return this.config.caching.ttl[tier] || 86400000; // Default 1 day
  }
  
  /**
   * Get cache size limit for tier
   */
  getCacheSize(tier: IntelligenceTier): number {
    return this.config.caching.maxSize[tier] || 1000;
  }
  
  /**
   * Get rate limit for tier
   */
  getRateLimit(tier: IntelligenceTier): number {
    const limits = {
      [IntelligenceTier.DETERMINISTIC]: this.config.rateLimit.tier0.requestsPerSecond,
      [IntelligenceTier.EMBEDDINGS]: this.config.rateLimit.tier1.requestsPerSecond,
      [IntelligenceTier.LLM]: this.config.rateLimit.tier2.requestsPerSecond
    };
    
    return limits[tier] || 10;
  }
  
  /**
   * Reset budget tracker
   */
  resetBudget(): void {
    this.budgetTracker.reset();
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    const avgCost = this.costHistory.length > 0 ?
      this.costHistory.reduce((a, b) => a + b, 0) / this.costHistory.length : 0;
    
    const latencyStats: Record<string, number> = {};
    this.latencyHistory.forEach((history, tier) => {
      if (history.length > 0) {
        latencyStats[`tier${tier}AvgLatency`] = 
          history.reduce((a, b) => a + b, 0) / history.length;
      }
    });
    
    return {
      totalSpent: this.budgetTracker.getSpent(),
      averageCostPerOperation: avgCost,
      costHistory: this.costHistory.slice(-10), // Last 10
      latencyStats,
      config: this.config
    };
  }
}

// Create singleton instance
export const executionPolicy = new ExecutionPolicyManager();

/**
 * Helper function to check if should escalate
 */
export function shouldEscalate(
  tier: IntelligenceTier,
  result: TierResult,
  context: IntelligenceContext
): boolean {
  return executionPolicy.shouldEscalate(tier, result, context);
}