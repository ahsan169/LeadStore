import { Lead, InsertLead } from "@shared/schema";
import { storage } from "../storage";
import { eventBus } from "./event-bus";
import { cacheManager } from "./cache-manager";
import { multiSourceVerificationEngine } from "./multi-source-verification-engine";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";
import { perplexityResearch } from "./perplexity-research";
import { mcaScoringService } from "./mca-scoring-service";
import { comprehensiveLeadEnricher } from "./comprehensive-lead-enricher";
import { dataFusionEngine } from "./data-fusion-engine";

/**
 * Intelligent Enrichment Orchestrator
 * Advanced orchestration with retry logic, circuit breakers, fallback strategies, and intelligent routing
 */

// Circuit breaker states
enum CircuitState {
  CLOSED = 'closed',   // Normal operation
  OPEN = 'open',       // Service is failing, skip it
  HALF_OPEN = 'half_open' // Testing if service recovered
}

// Service health tracking
interface ServiceHealth {
  name: string;
  state: CircuitState;
  failureCount: number;
  lastFailureTime: Date | null;
  successCount: number;
  lastSuccessTime: Date | null;
  averageResponseTime: number;
  isAvailable: boolean;
}

// Enrichment strategy
interface EnrichmentStrategy {
  primary: string[];      // Primary services to try first
  fallback: string[];     // Fallback services if primary fails
  optional: string[];     // Nice-to-have services that don't block
  required: string[];     // Must-succeed services
}

// Retry configuration
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

// Service configuration
interface ServiceConfig {
  name: string;
  timeout: number;
  retryConfig: RetryConfig;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
  priority: number;
  costPerCall: number;
  successRate: number;
}

export class IntelligentEnrichmentOrchestrator {
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private serviceConfigs: Map<string, ServiceConfig> = new Map();
  private enrichmentStrategies: Map<string, EnrichmentStrategy> = new Map();
  private activeEnrichments: Map<string, Promise<any>> = new Map();
  
  // Default configurations
  private defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterMs: 500
  };
  
  private defaultServiceConfig: ServiceConfig = {
    name: 'default',
    timeout: 30000,
    retryConfig: this.defaultRetryConfig,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
    priority: 5,
    costPerCall: 0.01,
    successRate: 0.95
  };
  
  constructor() {
    this.initializeServiceConfigs();
    this.initializeEnrichmentStrategies();
    this.startHealthMonitoring();
    
    console.log('[IntelligentOrchestrator] Initialized with circuit breakers and retry logic');
  }
  
  /**
   * Initialize service configurations
   */
  private initializeServiceConfigs() {
    // Hunter.io configuration
    this.serviceConfigs.set('hunter', {
      name: 'hunter',
      timeout: 15000,
      retryConfig: {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterMs: 200
      },
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 30000,
      priority: 9,
      costPerCall: 0.003,
      successRate: 0.92
    });
    
    // Numverify configuration
    this.serviceConfigs.set('numverify', {
      name: 'numverify',
      timeout: 10000,
      retryConfig: {
        maxAttempts: 2,
        initialDelayMs: 1000,
        maxDelayMs: 3000,
        backoffMultiplier: 1.5,
        jitterMs: 100
      },
      circuitBreakerThreshold: 4,
      circuitBreakerResetMs: 45000,
      priority: 8,
      costPerCall: 0.002,
      successRate: 0.94
    });
    
    // Perplexity configuration
    this.serviceConfigs.set('perplexity', {
      name: 'perplexity',
      timeout: 45000,
      retryConfig: {
        maxAttempts: 2,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterMs: 500
      },
      circuitBreakerThreshold: 2,
      circuitBreakerResetMs: 120000,
      priority: 6,
      costPerCall: 0.02,
      successRate: 0.88
    });
    
    // OpenAI configuration
    this.serviceConfigs.set('openai', {
      name: 'openai',
      timeout: 60000,
      retryConfig: {
        maxAttempts: 3,
        initialDelayMs: 1500,
        maxDelayMs: 15000,
        backoffMultiplier: 2.5,
        jitterMs: 300
      },
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 90000,
      priority: 7,
      costPerCall: 0.01,
      successRate: 0.96
    });
    
    // MCA Scoring configuration
    this.serviceConfigs.set('mca_scoring', {
      name: 'mca_scoring',
      timeout: 5000,
      retryConfig: {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
        jitterMs: 50
      },
      circuitBreakerThreshold: 10,
      circuitBreakerResetMs: 30000,
      priority: 10,
      costPerCall: 0.001,
      successRate: 0.99
    });
    
    // Initialize health tracking for all services
    this.serviceConfigs.forEach((config, name) => {
      this.serviceHealth.set(name, {
        name,
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: null,
        successCount: 0,
        lastSuccessTime: null,
        averageResponseTime: 0,
        isAvailable: true
      });
    });
  }
  
  /**
   * Initialize enrichment strategies for different scenarios
   */
  private initializeEnrichmentStrategies() {
    // High-quality lead strategy
    this.enrichmentStrategies.set('high_quality', {
      primary: ['hunter', 'numverify', 'perplexity', 'mca_scoring'],
      fallback: ['comprehensive_enricher', 'openai'],
      optional: ['social_media', 'business_registry'],
      required: ['hunter', 'numverify']
    });
    
    // Fast enrichment strategy
    this.enrichmentStrategies.set('fast', {
      primary: ['hunter', 'numverify', 'mca_scoring'],
      fallback: ['basic_validation'],
      optional: [],
      required: ['basic_validation']
    });
    
    // Cost-effective strategy
    this.enrichmentStrategies.set('cost_effective', {
      primary: ['basic_validation', 'mca_scoring'],
      fallback: ['hunter'],
      optional: ['numverify'],
      required: ['basic_validation']
    });
    
    // Comprehensive strategy
    this.enrichmentStrategies.set('comprehensive', {
      primary: ['hunter', 'numverify', 'perplexity', 'openai', 'mca_scoring'],
      fallback: ['comprehensive_enricher'],
      optional: ['social_media', 'business_registry', 'credit_bureau'],
      required: ['hunter', 'numverify', 'mca_scoring']
    });
  }
  
  /**
   * Orchestrate intelligent enrichment with fallbacks and retries
   */
  async enrichLead(
    lead: Partial<Lead>,
    options: {
      strategy?: 'high_quality' | 'fast' | 'cost_effective' | 'comprehensive';
      forceRefresh?: boolean;
      priority?: 'high' | 'medium' | 'low';
      budget?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<{
    enrichedLead: Partial<Lead>;
    servicesUsed: string[];
    totalCost: number;
    processingTime: number;
    successRate: number;
    errors: string[];
    warnings: string[];
  }> {
    const startTime = Date.now();
    const enrichmentId = this.generateEnrichmentId();
    const strategy = this.enrichmentStrategies.get(options.strategy || 'high_quality')!;
    
    console.log(`[IntelligentOrchestrator] Starting enrichment ${enrichmentId} with strategy: ${options.strategy || 'high_quality'}`);
    
    // Check if enrichment is already in progress for this lead
    if (lead.id && this.activeEnrichments.has(lead.id)) {
      console.log(`[IntelligentOrchestrator] Enrichment already in progress for lead ${lead.id}`);
      return this.activeEnrichments.get(lead.id)!;
    }
    
    const enrichmentPromise = this.performEnrichment(lead, strategy, options);
    
    if (lead.id) {
      this.activeEnrichments.set(lead.id, enrichmentPromise);
    }
    
    try {
      const result = await enrichmentPromise;
      return result;
    } finally {
      if (lead.id) {
        this.activeEnrichments.delete(lead.id);
      }
    }
  }
  
  /**
   * Perform the actual enrichment with intelligent routing
   */
  private async performEnrichment(
    lead: Partial<Lead>,
    strategy: EnrichmentStrategy,
    options: any
  ): Promise<any> {
    const result = {
      enrichedLead: { ...lead },
      servicesUsed: [] as string[],
      totalCost: 0,
      processingTime: 0,
      successRate: 0,
      errors: [] as string[],
      warnings: [] as string[]
    };
    
    // Phase 1: Try primary services
    const primaryResults = await this.executeServiceGroup(
      strategy.primary,
      lead,
      'primary',
      options
    );
    
    result.enrichedLead = this.mergeResults(result.enrichedLead, primaryResults.data);
    result.servicesUsed.push(...primaryResults.servicesUsed);
    result.totalCost += primaryResults.totalCost;
    result.errors.push(...primaryResults.errors);
    
    // Phase 2: Check if required services succeeded
    const requiredMet = strategy.required.every(service => 
      primaryResults.servicesUsed.includes(service)
    );
    
    if (!requiredMet) {
      console.log('[IntelligentOrchestrator] Required services not met, trying fallbacks');
      
      // Phase 3: Try fallback services
      const fallbackResults = await this.executeServiceGroup(
        strategy.fallback,
        result.enrichedLead,
        'fallback',
        options
      );
      
      result.enrichedLead = this.mergeResults(result.enrichedLead, fallbackResults.data);
      result.servicesUsed.push(...fallbackResults.servicesUsed);
      result.totalCost += fallbackResults.totalCost;
      result.errors.push(...fallbackResults.errors);
    }
    
    // Phase 4: Optional services (non-blocking)
    if (strategy.optional.length > 0 && result.totalCost < (options.budget || Infinity)) {
      this.executeServiceGroup(
        strategy.optional,
        result.enrichedLead,
        'optional',
        options
      ).then(optionalResults => {
        // Log optional results but don't block
        console.log('[IntelligentOrchestrator] Optional services completed:', optionalResults.servicesUsed);
      }).catch(error => {
        console.warn('[IntelligentOrchestrator] Optional services failed:', error);
      });
    }
    
    // Calculate final metrics
    const endTime = Date.now();
    result.processingTime = endTime - Date.now();
    result.successRate = result.servicesUsed.length / (strategy.primary.length + strategy.fallback.length);
    
    // Emit completion event
    eventBus.emit('enrichment:intelligent-complete', {
      leadId: lead.id,
      servicesUsed: result.servicesUsed,
      totalCost: result.totalCost,
      successRate: result.successRate
    });
    
    return result;
  }
  
  /**
   * Execute a group of services with circuit breaker and retry logic
   */
  private async executeServiceGroup(
    services: string[],
    lead: Partial<Lead>,
    groupType: 'primary' | 'fallback' | 'optional',
    options: any
  ): Promise<{
    data: Partial<Lead>;
    servicesUsed: string[];
    totalCost: number;
    errors: string[];
  }> {
    const results = {
      data: {},
      servicesUsed: [] as string[],
      totalCost: 0,
      errors: [] as string[]
    };
    
    // Filter available services based on circuit breaker state
    const availableServices = services.filter(service => 
      this.isServiceAvailable(service)
    );
    
    if (availableServices.length === 0) {
      results.errors.push(`No available services in ${groupType} group`);
      return results;
    }
    
    // Execute services based on priority
    const sortedServices = this.sortServicesByPriority(availableServices);
    
    for (const service of sortedServices) {
      try {
        const serviceResult = await this.executeServiceWithRetry(
          service,
          lead,
          options
        );
        
        if (serviceResult.success) {
          results.data = { ...results.data, ...serviceResult.data };
          results.servicesUsed.push(service);
          results.totalCost += this.getServiceCost(service);
          
          // Update service health
          this.recordServiceSuccess(service, serviceResult.responseTime);
        } else {
          results.errors.push(`${service}: ${serviceResult.error}`);
          this.recordServiceFailure(service, serviceResult.error);
        }
      } catch (error) {
        results.errors.push(`${service}: ${(error as Error).message}`);
        this.recordServiceFailure(service, (error as Error).message);
      }
      
      // Check budget constraint
      if (options.budget && results.totalCost >= options.budget) {
        console.log('[IntelligentOrchestrator] Budget limit reached');
        break;
      }
    }
    
    return results;
  }
  
  /**
   * Execute a service with retry logic
   */
  private async executeServiceWithRetry(
    serviceName: string,
    lead: Partial<Lead>,
    options: any
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    responseTime: number;
  }> {
    const config = this.serviceConfigs.get(serviceName) || this.defaultServiceConfig;
    const retryConfig = config.retryConfig;
    
    let lastError: Error | null = null;
    let attempt = 0;
    
    while (attempt < retryConfig.maxAttempts) {
      attempt++;
      const attemptStartTime = Date.now();
      
      try {
        // Add timeout wrapper
        const servicePromise = this.executeService(serviceName, lead);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service timeout')), config.timeout)
        );
        
        const data = await Promise.race([servicePromise, timeoutPromise]);
        const responseTime = Date.now() - attemptStartTime;
        
        return {
          success: true,
          data,
          responseTime
        };
      } catch (error) {
        lastError = error as Error;
        console.warn(`[IntelligentOrchestrator] ${serviceName} attempt ${attempt} failed:`, lastError.message);
        
        // Don't retry on certain errors
        if (this.isNonRetryableError(lastError)) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        if (attempt < retryConfig.maxAttempts) {
          const baseDelay = Math.min(
            retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, attempt - 1),
            retryConfig.maxDelayMs
          );
          const jitter = Math.random() * retryConfig.jitterMs;
          const delay = baseDelay + jitter;
          
          console.log(`[IntelligentOrchestrator] Retrying ${serviceName} in ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      responseTime: 0
    };
  }
  
  /**
   * Execute individual service
   */
  private async executeService(serviceName: string, lead: Partial<Lead>): Promise<any> {
    switch (serviceName) {
      case 'hunter':
        if (lead.email) {
          return await hunterService.verifyEmail(lead.email);
        } else if (lead.businessName) {
          return await hunterService.findEmailByDomain(
            this.extractDomainFromBusinessName(lead.businessName),
            lead.ownerName
          );
        }
        break;
      
      case 'numverify':
        if (lead.phone) {
          return await numverifyService.validatePhone(lead.phone, lead.stateCode || 'US');
        }
        break;
      
      case 'perplexity':
        if (lead.businessName) {
          return await perplexityResearch.researchBusiness({
            businessName: lead.businessName,
            ownerName: lead.ownerName,
            location: lead.stateCode,
            industry: lead.industry
          });
        }
        break;
      
      case 'mca_scoring':
        if (lead.businessName) {
          const uccFilings = await storage.findUccFilingsByBusinessName(lead.businessName);
          return mcaScoringService.enrichLeadWithMCAScore({
            businessName: lead.businessName,
            uccFilings: uccFilings.map(f => ({
              securedParty: f.securedParty || '',
              filingDate: new Date(f.filingDate)
            }))
          });
        }
        break;
      
      case 'comprehensive_enricher':
        return await comprehensiveLeadEnricher.enrichSingleLead(lead);
      
      case 'basic_validation':
        // Basic validation logic
        return {
          isValid: !!(lead.businessName && (lead.email || lead.phone)),
          completeness: this.calculateCompleteness(lead)
        };
      
      case 'multi_source_verification':
        if (lead.id) {
          const verification = await multiSourceVerificationEngine.verifyLead(lead.id);
          return {
            verificationStatus: verification.status,
            confidence: verification.confidence.overall,
            riskFactors: verification.riskFactors
          };
        }
        break;
      
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
  
  /**
   * Check if service is available (circuit breaker)
   */
  private isServiceAvailable(serviceName: string): boolean {
    const health = this.serviceHealth.get(serviceName);
    if (!health) return true;
    
    // Check circuit breaker state
    if (health.state === CircuitState.OPEN) {
      const config = this.serviceConfigs.get(serviceName);
      if (!config) return false;
      
      // Check if enough time has passed to try again
      if (health.lastFailureTime) {
        const timeSinceFailure = Date.now() - health.lastFailureTime.getTime();
        if (timeSinceFailure > config.circuitBreakerResetMs) {
          // Move to half-open state
          health.state = CircuitState.HALF_OPEN;
          console.log(`[IntelligentOrchestrator] Circuit breaker half-open for ${serviceName}`);
        } else {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Record service success
   */
  private recordServiceSuccess(serviceName: string, responseTime: number) {
    const health = this.serviceHealth.get(serviceName);
    if (!health) return;
    
    health.successCount++;
    health.lastSuccessTime = new Date();
    health.failureCount = 0; // Reset failure count
    
    // Update average response time
    health.averageResponseTime = (health.averageResponseTime * 0.9) + (responseTime * 0.1);
    
    // Close circuit if it was half-open
    if (health.state === CircuitState.HALF_OPEN) {
      health.state = CircuitState.CLOSED;
      console.log(`[IntelligentOrchestrator] Circuit breaker closed for ${serviceName}`);
    }
  }
  
  /**
   * Record service failure
   */
  private recordServiceFailure(serviceName: string, error: string) {
    const health = this.serviceHealth.get(serviceName);
    const config = this.serviceConfigs.get(serviceName);
    
    if (!health || !config) return;
    
    health.failureCount++;
    health.lastFailureTime = new Date();
    
    // Open circuit if threshold exceeded
    if (health.failureCount >= config.circuitBreakerThreshold) {
      health.state = CircuitState.OPEN;
      console.warn(`[IntelligentOrchestrator] Circuit breaker OPEN for ${serviceName} after ${health.failureCount} failures`);
    }
  }
  
  /**
   * Sort services by priority
   */
  private sortServicesByPriority(services: string[]): string[] {
    return services.sort((a, b) => {
      const configA = this.serviceConfigs.get(a);
      const configB = this.serviceConfigs.get(b);
      
      const priorityA = configA?.priority || 0;
      const priorityB = configB?.priority || 0;
      
      return priorityB - priorityA; // Higher priority first
    });
  }
  
  /**
   * Get service cost
   */
  private getServiceCost(serviceName: string): number {
    const config = this.serviceConfigs.get(serviceName);
    return config?.costPerCall || 0;
  }
  
  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const nonRetryableMessages = [
      'Invalid API key',
      'Insufficient credits',
      'Account suspended',
      'Invalid request',
      'Bad request',
      '400',
      '401',
      '403'
    ];
    
    return nonRetryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg.toLowerCase())
    );
  }
  
  /**
   * Merge enrichment results
   */
  private mergeResults(existing: Partial<Lead>, newData: any): Partial<Lead> {
    // Use data fusion engine for intelligent merging
    const merged = { ...existing };
    
    Object.keys(newData).forEach(key => {
      if (newData[key] !== null && newData[key] !== undefined) {
        // Only override if new data is more complete or existing is empty
        if (!merged[key as keyof Lead] || 
            (typeof newData[key] === 'string' && newData[key].length > (merged[key as keyof Lead] as string)?.length)) {
          (merged as any)[key] = newData[key];
        }
      }
    });
    
    return merged;
  }
  
  /**
   * Calculate lead completeness
   */
  private calculateCompleteness(lead: Partial<Lead>): number {
    const fields = [
      'businessName', 'ownerName', 'email', 'phone',
      'industry', 'annualRevenue', 'stateCode', 'city',
      'address', 'yearEstablished', 'employeeCount'
    ];
    
    const filledFields = fields.filter(field => 
      lead[field as keyof Lead] !== null && 
      lead[field as keyof Lead] !== undefined &&
      lead[field as keyof Lead] !== ''
    );
    
    return (filledFields.length / fields.length) * 100;
  }
  
  /**
   * Extract domain from business name
   */
  private extractDomainFromBusinessName(businessName: string): string {
    // Simple heuristic to extract domain
    const cleanName = businessName.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '');
    
    return `${cleanName}.com`;
  }
  
  /**
   * Generate unique enrichment ID
   */
  private generateEnrichmentId(): string {
    return `enrich_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Start health monitoring
   */
  private startHealthMonitoring() {
    // Monitor service health every minute
    setInterval(() => {
      this.serviceHealth.forEach((health, serviceName) => {
        const config = this.serviceConfigs.get(serviceName);
        if (!config) return;
        
        // Calculate service availability
        const totalCalls = health.successCount + health.failureCount;
        if (totalCalls > 0) {
          const successRate = health.successCount / totalCalls;
          health.isAvailable = successRate >= (config.successRate * 0.8); // 80% of expected
        }
        
        // Log health status
        if (!health.isAvailable || health.state !== CircuitState.CLOSED) {
          console.log(`[IntelligentOrchestrator] Service health warning - ${serviceName}:`, {
            state: health.state,
            successRate: totalCalls > 0 ? (health.successCount / totalCalls) : 0,
            averageResponseTime: health.averageResponseTime,
            isAvailable: health.isAvailable
          });
        }
      });
    }, 60000); // Every minute
  }
  
  /**
   * Get service health status
   */
  getServiceHealth(): Map<string, ServiceHealth> {
    return new Map(this.serviceHealth);
  }
  
  /**
   * Get enrichment statistics
   */
  getStatistics() {
    const stats = {
      services: {} as any,
      overall: {
        totalEnrichments: 0,
        averageCost: 0,
        averageResponseTime: 0,
        overallSuccessRate: 0
      }
    };
    
    this.serviceHealth.forEach((health, serviceName) => {
      const totalCalls = health.successCount + health.failureCount;
      stats.services[serviceName] = {
        state: health.state,
        totalCalls,
        successRate: totalCalls > 0 ? (health.successCount / totalCalls) : 0,
        averageResponseTime: health.averageResponseTime,
        lastSuccess: health.lastSuccessTime,
        lastFailure: health.lastFailureTime
      };
      
      stats.overall.totalEnrichments += totalCalls;
    });
    
    // Calculate overall metrics
    let totalSuccesses = 0;
    let totalResponseTime = 0;
    let servicesWithData = 0;
    
    this.serviceHealth.forEach(health => {
      totalSuccesses += health.successCount;
      if (health.averageResponseTime > 0) {
        totalResponseTime += health.averageResponseTime;
        servicesWithData++;
      }
    });
    
    stats.overall.overallSuccessRate = stats.overall.totalEnrichments > 0 
      ? totalSuccesses / stats.overall.totalEnrichments 
      : 0;
    
    stats.overall.averageResponseTime = servicesWithData > 0 
      ? totalResponseTime / servicesWithData 
      : 0;
    
    return stats;
  }
  
  /**
   * Reset circuit breaker for a service
   */
  resetCircuitBreaker(serviceName: string) {
    const health = this.serviceHealth.get(serviceName);
    if (health) {
      health.state = CircuitState.CLOSED;
      health.failureCount = 0;
      console.log(`[IntelligentOrchestrator] Circuit breaker reset for ${serviceName}`);
    }
  }
  
  /**
   * Update service configuration
   */
  updateServiceConfig(serviceName: string, config: Partial<ServiceConfig>) {
    const existing = this.serviceConfigs.get(serviceName);
    if (existing) {
      this.serviceConfigs.set(serviceName, { ...existing, ...config });
      console.log(`[IntelligentOrchestrator] Updated config for ${serviceName}`);
    }
  }
}

// Export singleton instance
export const intelligentEnrichmentOrchestrator = new IntelligentEnrichmentOrchestrator();

// Export types
export type { ServiceHealth, EnrichmentStrategy, RetryConfig, ServiceConfig };