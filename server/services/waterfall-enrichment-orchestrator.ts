import { EventEmitter } from 'events';
import { Lead, InsertLead, enrichmentJobs, enrichmentCosts } from '@shared/schema';
import { db } from '../db';
import { sql, eq, and, gte, lte } from 'drizzle-orm';
import { enrichmentCache } from './enrichment/cache-service';
import { enrichmentRateLimiter } from './enrichment/rate-limiter';
import { leadDeduplicationService } from './lead-deduplication-service';
import { cacheManager } from './cache-manager';
import OpenAI from 'openai';

// Initialize OpenAI for HotnessScore calculation
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'default',
  baseURL: process.env.OPENAI_API_BASE_URL,
});

export interface EnrichmentTier {
  level: number;
  name: string;
  maxCost: number;
  services: EnrichmentService[];
  successRateThreshold: number;
}

export interface EnrichmentService {
  id: string;
  name: string;
  type: 'cache' | 'free' | 'cheap' | 'premium';
  costPerCall: number;
  bulkSupported: boolean;
  batchSize: number;
  rateLimit: number; // calls per minute
  confidence: number; // 0-1 confidence in data quality
  fields: string[];
  execute: (leads: any[]) => Promise<any[]>;
}

export interface HotnessScore {
  score: number; // 0-100
  factors: {
    revenueSize: number;
    urgency: number;
    completeness: number;
    industry: number;
    geography: number;
    recency: number;
  };
  recommendation: 'skip' | 'basic' | 'standard' | 'premium';
  reasoning: string;
}

export interface WaterfallResult {
  leadId: string;
  enrichedData: any;
  sourcesUsed: Array<{
    service: string;
    tier: number;
    fields: string[];
    cost: number;
    timestamp: Date;
    success: boolean;
    evidence?: any;
  }>;
  totalCost: number;
  hotnessScore: HotnessScore;
  completenessScore: number;
  errors: string[];
}

export class WaterfallEnrichmentOrchestrator extends EventEmitter {
  private tiers: EnrichmentTier[] = [];
  private services: Map<string, EnrichmentService> = new Map();
  private batchQueue: Map<string, any[]> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  
  // Cost tracking
  private costMetrics = {
    totalApiCalls: 0,
    totalCost: 0,
    costByService: new Map<string, number>(),
    successRate: new Map<string, { success: number; total: number }>(),
  };
  
  constructor() {
    super();
    this.initializeTiers();
    this.initializeServices();
    this.startBatchProcessor();
  }
  
  /**
   * Initialize enrichment tiers
   */
  private initializeTiers() {
    // Tier 0: Cache only (free)
    this.tiers.push({
      level: 0,
      name: 'Cache',
      maxCost: 0,
      services: [],
      successRateThreshold: 0.9
    });
    
    // Tier 1: Free sources
    this.tiers.push({
      level: 1,
      name: 'Free',
      maxCost: 0.001,
      services: [],
      successRateThreshold: 0.7
    });
    
    // Tier 2: Cheap sources
    this.tiers.push({
      level: 2,
      name: 'Cheap',
      maxCost: 0.01,
      services: [],
      successRateThreshold: 0.8
    });
    
    // Tier 3: Premium sources
    this.tiers.push({
      level: 3,
      name: 'Premium',
      maxCost: 0.10,
      services: [],
      successRateThreshold: 0.95
    });
  }
  
  /**
   * Initialize enrichment services
   */
  private initializeServices() {
    // Cache service (Tier 0)
    this.registerService({
      id: 'cache',
      name: 'Local Cache',
      type: 'cache',
      costPerCall: 0,
      bulkSupported: true,
      batchSize: 1000,
      rateLimit: 10000,
      confidence: 1.0,
      fields: ['*'],
      execute: async (leads: any[]) => {
        const results = [];
        for (const lead of leads) {
          const cacheKey = enrichmentCache.generateLeadKey(lead.id, 'enrichment');
          const cached = enrichmentCache.get(cacheKey);
          results.push(cached || null);
        }
        return results;
      }
    }, 0);
    
    // Free API services (Tier 1)
    this.registerService({
      id: 'opencorporates_free',
      name: 'OpenCorporates Free',
      type: 'free',
      costPerCall: 0,
      bulkSupported: false,
      batchSize: 1,
      rateLimit: 200,
      confidence: 0.8,
      fields: ['legalName', 'address', 'incorporationDate', 'companyType'],
      execute: async (leads: any[]) => {
        const results = [];
        for (const lead of leads) {
          try {
            const query = encodeURIComponent(lead.businessName || lead.legalName || '');
            const response = await fetch(
              `https://api.opencorporates.com/v0.4/companies/search?q=${query}&per_page=1`
            );
            const data = await response.json();
            const company = data?.results?.companies?.[0]?.company;
            
            if (company) {
              results.push({
                legalName: company.name,
                address: company.registered_address_in_full,
                incorporationDate: company.incorporation_date,
                companyType: company.company_type,
                jurisdiction: company.jurisdiction_code
              });
            } else {
              results.push(null);
            }
          } catch (error) {
            console.error(`[Waterfall] OpenCorporates error:`, error);
            results.push(null);
          }
        }
        return results;
      }
    }, 1);
    
    // Perplexity for research (Tier 1 - very cheap)
    if (process.env.PERPLEXITY_API_KEY) {
      this.registerService({
        id: 'perplexity',
        name: 'Perplexity Research',
        type: 'cheap',
        costPerCall: 0.002,
        bulkSupported: false,
        batchSize: 1,
        rateLimit: 20,
        confidence: 0.7,
        fields: ['industry', 'employeeCount', 'annualRevenue', 'websiteUrl', 'businessDescription'],
        execute: async (leads: any[]) => {
          const results = [];
          for (const lead of leads) {
            try {
              const query = `Find business information for "${lead.businessName}" ${lead.city ? `in ${lead.city}, ${lead.state}` : ''}. Include industry, employee count, annual revenue, and website.`;
              
              const response = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'llama-3.1-sonar-small-128k-online',
                  messages: [
                    { role: 'system', content: 'Extract specific business data. Be concise.' },
                    { role: 'user', content: query }
                  ],
                  temperature: 0.1
                })
              });
              
              const data = await response.json();
              const content = data?.choices?.[0]?.message?.content;
              
              if (content) {
                // Parse the response (simplified - would need better parsing)
                results.push({
                  industry: this.extractField(content, 'industry'),
                  employeeCount: this.extractNumber(content, 'employees'),
                  annualRevenue: this.extractField(content, 'revenue'),
                  websiteUrl: this.extractUrl(content),
                  businessDescription: content.slice(0, 500)
                });
              } else {
                results.push(null);
              }
            } catch (error) {
              console.error(`[Waterfall] Perplexity error:`, error);
              results.push(null);
            }
          }
          return results;
        }
      }, 1);
    }
    
    // OpenAI for insights (Tier 2)
    if (process.env.OPENAI_API_KEY) {
      this.registerService({
        id: 'openai_insights',
        name: 'OpenAI Insights',
        type: 'cheap',
        costPerCall: 0.01,
        bulkSupported: true,
        batchSize: 10,
        rateLimit: 60,
        confidence: 0.75,
        fields: ['businessInsights', 'riskFactors', 'growthPotential', 'recommendedApproach'],
        execute: async (leads: any[]) => {
          try {
            const prompt = leads.map((lead, i) => 
              `${i + 1}. ${lead.businessName} - ${lead.industry || 'Unknown'} - ${lead.city}, ${lead.state}`
            ).join('\n');
            
            const completion = await openai.chat.completions.create({
              model: 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: 'Analyze these businesses and provide brief insights, risk factors, and growth potential for each. Return as JSON array.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.3,
              max_tokens: 1000
            });
            
            const content = completion.choices[0].message.content;
            const insights = JSON.parse(content || '[]');
            
            return insights;
          } catch (error) {
            console.error(`[Waterfall] OpenAI error:`, error);
            return leads.map(() => null);
          }
        }
      }, 2);
    }
    
    // Hunter.io for email verification (Tier 2)
    if (process.env.HUNTER_API_KEY) {
      this.registerService({
        id: 'hunter',
        name: 'Hunter.io',
        type: 'cheap',
        costPerCall: 0.005,
        bulkSupported: false,
        batchSize: 1,
        rateLimit: 50,
        confidence: 0.95,
        fields: ['email', 'emailVerified', 'emailConfidence'],
        execute: async (leads: any[]) => {
          const { hunterService } = await import('./enrichment/hunter-service');
          const results = [];
          
          for (const lead of leads) {
            try {
              if (lead.email) {
                const verification = await hunterService.verifyEmail(lead.email);
                results.push({
                  email: lead.email,
                  emailVerified: verification.result === 'deliverable',
                  emailConfidence: verification.score
                });
              } else if (lead.websiteUrl || lead.domains?.[0]) {
                const domain = lead.domains?.[0] || this.extractDomain(lead.websiteUrl);
                const finder = await hunterService.findEmailByDomain(
                  domain,
                  lead.ownerName?.split(' ')[0],
                  lead.ownerName?.split(' ')[1]
                );
                results.push({
                  email: finder?.email,
                  emailVerified: true,
                  emailConfidence: finder?.score || 0
                });
              } else {
                results.push(null);
              }
            } catch (error) {
              console.error(`[Waterfall] Hunter error:`, error);
              results.push(null);
            }
          }
          
          return results;
        }
      }, 2);
    }
    
    // Clearbit for premium enrichment (Tier 3)
    if (process.env.CLEARBIT_API_KEY) {
      this.registerService({
        id: 'clearbit',
        name: 'Clearbit',
        type: 'premium',
        costPerCall: 0.75,
        bulkSupported: false,
        batchSize: 1,
        rateLimit: 10,
        confidence: 0.98,
        fields: ['*'], // Can enrich all fields
        execute: async (leads: any[]) => {
          const { clearbitService } = await import('./enrichment/clearbit-service');
          const results = [];
          
          for (const lead of leads) {
            try {
              const enriched = await clearbitService.enrichCompany(
                lead.websiteUrl || lead.domains?.[0]
              );
              results.push(enriched);
            } catch (error) {
              console.error(`[Waterfall] Clearbit error:`, error);
              results.push(null);
            }
          }
          
          return results;
        }
      }, 3);
    }
  }
  
  /**
   * Register a service with a tier
   */
  private registerService(service: EnrichmentService, tierLevel: number) {
    this.services.set(service.id, service);
    const tier = this.tiers.find(t => t.level === tierLevel);
    if (tier) {
      tier.services.push(service);
    }
  }
  
  /**
   * Calculate HotnessScore for a lead
   */
  async calculateHotnessScore(lead: any): Promise<HotnessScore> {
    const factors = {
      revenueSize: 0,
      urgency: 0,
      completeness: 0,
      industry: 0,
      geography: 0,
      recency: 0
    };
    
    // Revenue size factor (0-20 points)
    const revenue = parseFloat(lead.annualRevenue || lead.estimatedRevenue || '0');
    if (revenue > 10000000) factors.revenueSize = 20;
    else if (revenue > 5000000) factors.revenueSize = 15;
    else if (revenue > 1000000) factors.revenueSize = 10;
    else if (revenue > 500000) factors.revenueSize = 5;
    
    // Urgency factor (0-20 points)
    if (lead.urgencyLevel === 'immediate') factors.urgency = 20;
    else if (lead.urgencyLevel === 'this_week') factors.urgency = 15;
    else if (lead.urgencyLevel === 'this_month') factors.urgency = 10;
    else factors.urgency = 5;
    
    // Completeness factor (0-20 points)
    const fields = Object.keys(lead).filter(k => lead[k] !== null && lead[k] !== undefined);
    factors.completeness = Math.min((fields.length / 20) * 20, 20);
    
    // Industry factor (0-20 points)
    const hotIndustries = ['technology', 'healthcare', 'finance', 'ecommerce', 'saas'];
    if (lead.industry && hotIndustries.some(ind => lead.industry.toLowerCase().includes(ind))) {
      factors.industry = 20;
    } else if (lead.industry) {
      factors.industry = 10;
    }
    
    // Geography factor (0-10 points)
    const hotStates = ['CA', 'NY', 'TX', 'FL', 'IL'];
    if (hotStates.includes(lead.stateCode)) {
      factors.geography = 10;
    } else if (lead.stateCode) {
      factors.geography = 5;
    }
    
    // Recency factor (0-10 points)
    const leadAge = lead.leadAge || 0;
    if (leadAge === 0) factors.recency = 10;
    else if (leadAge < 7) factors.recency = 8;
    else if (leadAge < 30) factors.recency = 5;
    else if (leadAge < 90) factors.recency = 2;
    
    // Calculate total score
    const score = Object.values(factors).reduce((sum, val) => sum + val, 0);
    
    // Determine recommendation
    let recommendation: 'skip' | 'basic' | 'standard' | 'premium';
    let reasoning: string;
    
    if (score >= 70) {
      recommendation = 'premium';
      reasoning = 'High-value lead with strong revenue potential and urgency. Worth premium enrichment.';
    } else if (score >= 45) {
      recommendation = 'standard';
      reasoning = 'Solid lead with good potential. Standard enrichment recommended.';
    } else if (score >= 20) {
      recommendation = 'basic';
      reasoning = 'Basic lead worth minimal enrichment to qualify.';
    } else {
      recommendation = 'skip';
      reasoning = 'Low-value lead. Skip enrichment or use cache only.';
    }
    
    return {
      score,
      factors,
      recommendation,
      reasoning
    };
  }
  
  /**
   * Main enrichment method with waterfall approach
   */
  async enrichLead(lead: any, options?: {
    maxTier?: number;
    forceRefresh?: boolean;
    bulkMode?: boolean;
  }): Promise<WaterfallResult> {
    const startTime = Date.now();
    console.log(`[Waterfall] Starting enrichment for lead ${lead.id || lead.businessName}`);
    
    // Calculate HotnessScore
    const hotnessScore = await this.calculateHotnessScore(lead);
    
    // Determine max tier based on HotnessScore
    let maxTier = options?.maxTier ?? 3;
    if (hotnessScore.recommendation === 'skip') maxTier = 0;
    else if (hotnessScore.recommendation === 'basic') maxTier = 1;
    else if (hotnessScore.recommendation === 'standard') maxTier = 2;
    
    const result: WaterfallResult = {
      leadId: lead.id || crypto.randomUUID(),
      enrichedData: { ...lead },
      sourcesUsed: [],
      totalCost: 0,
      hotnessScore,
      completenessScore: this.calculateCompleteness(lead),
      errors: []
    };
    
    // Check cache first unless force refresh
    if (!options?.forceRefresh) {
      const cacheKey = enrichmentCache.generateLeadKey(result.leadId, 'enrichment');
      const cached = enrichmentCache.get(cacheKey);
      
      if (cached) {
        console.log(`[Waterfall] Cache hit for lead ${result.leadId}`);
        result.enrichedData = cached;
        result.sourcesUsed.push({
          service: 'cache',
          tier: 0,
          fields: Object.keys(cached),
          cost: 0,
          timestamp: new Date(),
          success: true
        });
        
        // Update metrics
        this.updateMetrics('cache', 0, true);
        
        return result;
      }
    }
    
    // Process through tiers
    for (let tierLevel = 1; tierLevel <= maxTier; tierLevel++) {
      const tier = this.tiers[tierLevel];
      if (!tier) continue;
      
      // Check if we've reached sufficient completeness
      if (result.completenessScore >= tier.successRateThreshold) {
        console.log(`[Waterfall] Stopping at tier ${tierLevel} - sufficient completeness reached`);
        break;
      }
      
      // Try services in this tier
      for (const service of tier.services) {
        // Check cost threshold
        if (result.totalCost + service.costPerCall > tier.maxCost) {
          console.log(`[Waterfall] Skipping ${service.name} - would exceed tier cost limit`);
          continue;
        }
        
        // Check if service provides needed fields
        const missingFields = this.getMissingFields(result.enrichedData);
        const relevantFields = service.fields[0] === '*' 
          ? missingFields 
          : service.fields.filter(f => missingFields.includes(f));
        
        if (relevantFields.length === 0) {
          continue;
        }
        
        try {
          // Execute service with rate limiting
          const enrichmentData = await enrichmentRateLimiter.execute(
            service.id,
            async () => {
              if (options?.bulkMode && service.bulkSupported) {
                // Add to batch queue
                return this.addToBatch(service.id, lead);
              } else {
                // Execute immediately
                const results = await service.execute([lead]);
                return results[0];
              }
            },
            tierLevel // Use tier level as priority
          );
          
          if (enrichmentData) {
            // Merge enriched data
            this.mergeData(result.enrichedData, enrichmentData);
            
            // Track source
            result.sourcesUsed.push({
              service: service.id,
              tier: tierLevel,
              fields: relevantFields,
              cost: service.costPerCall,
              timestamp: new Date(),
              success: true,
              evidence: enrichmentData
            });
            
            // Update cost
            result.totalCost += service.costPerCall;
            
            // Store cost in database
            if (lead.id) {
              await db.insert(enrichmentCosts).values({
                jobId: null,
                service: service.id,
                apiCall: `enrich_${result.leadId}`,
                cost: String(service.costPerCall),
                response: enrichmentData,
                timestamp: new Date()
              });
            }
            
            // Update metrics
            this.updateMetrics(service.id, service.costPerCall, true);
            
            // Recalculate completeness
            result.completenessScore = this.calculateCompleteness(result.enrichedData);
          }
        } catch (error: any) {
          console.error(`[Waterfall] Error with service ${service.id}:`, error);
          result.errors.push(`${service.id}: ${error.message}`);
          
          result.sourcesUsed.push({
            service: service.id,
            tier: tierLevel,
            fields: relevantFields,
            cost: 0,
            timestamp: new Date(),
            success: false
          });
          
          // Update metrics
          this.updateMetrics(service.id, 0, false);
        }
      }
    }
    
    // Cache the result
    const cacheKey = enrichmentCache.generateLeadKey(result.leadId, 'enrichment');
    enrichmentCache.set(cacheKey, result.enrichedData, 'waterfall', result.completenessScore, 86400000); // 24 hours
    
    const duration = Date.now() - startTime;
    console.log(`[Waterfall] Enrichment completed in ${duration}ms. Cost: $${result.totalCost.toFixed(4)}, Completeness: ${result.completenessScore.toFixed(2)}`);
    
    this.emit('enrichment-complete', result);
    
    return result;
  }
  
  /**
   * Bulk enrich multiple leads
   */
  async bulkEnrich(leads: any[], options?: {
    maxTier?: number;
    maxCostPerLead?: number;
  }): Promise<WaterfallResult[]> {
    console.log(`[Waterfall] Starting bulk enrichment for ${leads.length} leads`);
    
    // Group leads by HotnessScore
    const grouped = new Map<string, any[]>();
    
    for (const lead of leads) {
      const hotness = await this.calculateHotnessScore(lead);
      const group = hotness.recommendation;
      
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group)!.push(lead);
    }
    
    const results: WaterfallResult[] = [];
    
    // Process each group with appropriate tier
    for (const [group, groupLeads] of grouped) {
      let maxTier = 3;
      if (group === 'skip') maxTier = 0;
      else if (group === 'basic') maxTier = 1;
      else if (group === 'standard') maxTier = 2;
      
      // Apply cost override if provided
      if (options?.maxTier !== undefined) {
        maxTier = Math.min(maxTier, options.maxTier);
      }
      
      // Process in batches
      const batchSize = 50;
      for (let i = 0; i < groupLeads.length; i += batchSize) {
        const batch = groupLeads.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(lead => 
            this.enrichLead(lead, { 
              maxTier, 
              bulkMode: true 
            })
          )
        );
        
        results.push(...batchResults);
        
        // Process batch queues
        await this.processBatchQueues();
      }
    }
    
    return results;
  }
  
  /**
   * Add lead to batch queue
   */
  private async addToBatch(serviceId: string, lead: any): Promise<any> {
    if (!this.batchQueue.has(serviceId)) {
      this.batchQueue.set(serviceId, []);
    }
    
    const queue = this.batchQueue.get(serviceId)!;
    queue.push(lead);
    
    const service = this.services.get(serviceId);
    if (service && queue.length >= service.batchSize) {
      return this.processBatch(serviceId);
    }
    
    // Return placeholder - will be processed in batch
    return null;
  }
  
  /**
   * Process batch queue for a service
   */
  private async processBatch(serviceId: string): Promise<any> {
    const queue = this.batchQueue.get(serviceId);
    if (!queue || queue.length === 0) return null;
    
    const service = this.services.get(serviceId);
    if (!service) return null;
    
    const batch = queue.splice(0, service.batchSize);
    
    try {
      const results = await service.execute(batch);
      return results;
    } catch (error) {
      console.error(`[Waterfall] Batch processing error for ${serviceId}:`, error);
      return batch.map(() => null);
    }
  }
  
  /**
   * Process all batch queues
   */
  private async processBatchQueues(): Promise<void> {
    const promises = [];
    
    for (const [serviceId, queue] of this.batchQueue) {
      if (queue.length > 0) {
        promises.push(this.processBatch(serviceId));
      }
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Start batch processor
   */
  private startBatchProcessor() {
    // Process batch queues every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processBatchQueues();
    }, 5000);
  }
  
  /**
   * Calculate lead completeness
   */
  private calculateCompleteness(lead: any): number {
    const importantFields = [
      'businessName', 'ownerName', 'email', 'phone',
      'industry', 'annualRevenue', 'address', 'city',
      'state', 'websiteUrl', 'employeeCount'
    ];
    
    const filledFields = importantFields.filter(field => 
      lead[field] !== null && 
      lead[field] !== undefined && 
      lead[field] !== ''
    );
    
    return filledFields.length / importantFields.length;
  }
  
  /**
   * Get missing fields from lead
   */
  private getMissingFields(lead: any): string[] {
    const allFields = [
      'businessName', 'ownerName', 'email', 'phone',
      'industry', 'annualRevenue', 'address', 'city',
      'state', 'websiteUrl', 'employeeCount', 'yearFounded',
      'linkedinUrl', 'socialProfiles', 'businessDescription'
    ];
    
    return allFields.filter(field => 
      lead[field] === null || 
      lead[field] === undefined || 
      lead[field] === ''
    );
  }
  
  /**
   * Merge enriched data into lead
   */
  private mergeData(target: any, source: any): void {
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && value !== undefined && value !== '') {
        // Only override if target doesn't have value or source is more complete
        if (!target[key] || (typeof value === 'string' && value.length > (target[key] || '').length)) {
          target[key] = value;
        }
      }
    }
  }
  
  /**
   * Update cost metrics
   */
  private updateMetrics(service: string, cost: number, success: boolean): void {
    this.costMetrics.totalApiCalls++;
    this.costMetrics.totalCost += cost;
    
    // Update cost by service
    const currentCost = this.costMetrics.costByService.get(service) || 0;
    this.costMetrics.costByService.set(service, currentCost + cost);
    
    // Update success rate
    const stats = this.costMetrics.successRate.get(service) || { success: 0, total: 0 };
    stats.total++;
    if (success) stats.success++;
    this.costMetrics.successRate.set(service, stats);
  }
  
  /**
   * Get cost metrics
   */
  getCostMetrics(): any {
    const serviceMetrics = [];
    
    for (const [service, cost] of this.costMetrics.costByService) {
      const stats = this.costMetrics.successRate.get(service);
      serviceMetrics.push({
        service,
        totalCost: cost,
        callCount: stats?.total || 0,
        successRate: stats ? stats.success / stats.total : 0,
        avgCostPerCall: stats ? cost / stats.total : 0
      });
    }
    
    return {
      totalApiCalls: this.costMetrics.totalApiCalls,
      totalCost: this.costMetrics.totalCost,
      avgCostPerLead: this.costMetrics.totalApiCalls > 0 
        ? this.costMetrics.totalCost / this.costMetrics.totalApiCalls 
        : 0,
      serviceMetrics
    };
  }
  
  /**
   * Helper: Extract field from text
   */
  private extractField(text: string, field: string): string | null {
    const regex = new RegExp(`${field}[:\\s]+([^\\n,]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }
  
  /**
   * Helper: Extract number from text
   */
  private extractNumber(text: string, context: string): number | null {
    const regex = new RegExp(`${context}[:\\s]+(\\d+[,\\d]*)`, 'i');
    const match = text.match(regex);
    return match ? parseInt(match[1].replace(/,/g, '')) : null;
  }
  
  /**
   * Helper: Extract URL from text
   */
  private extractUrl(text: string): string | null {
    const regex = /https?:\/\/[^\s]+/i;
    const match = text.match(regex);
    return match ? match[0] : null;
  }
  
  /**
   * Helper: Extract domain from URL
   */
  private extractDomain(url?: string): string | null {
    if (!url) return null;
    try {
      const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }
}

// Export singleton instance
export const waterfallEnrichmentOrchestrator = new WaterfallEnrichmentOrchestrator();