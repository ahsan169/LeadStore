import { storage } from "../storage";
import { eventBus } from "./event-bus";
import OpenAI from 'openai';
import type { Lead, InsertIntelligenceDecision } from "@shared/schema";
import { WaterfallEnrichmentOrchestrator } from "./waterfall-enrichment-orchestrator";
import { MLScoringService } from "./ml-scoring";
import { MasterDatabaseService } from "./master-database";
import { EntityGraphBuilder } from "../intelligence/entity-graph";
import memoizee from 'memoizee';
import { db } from "../db";
import { uccFilings, uccIntelligence, intelligenceDecisions } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { EnrichmentQueue } from "./enrichment-queue";
import { MasterEnrichmentOrchestrator } from "./master-enrichment-orchestrator";
import type { AnalysisReport, DataQualityMetrics, EnrichmentPlan } from "./data-completeness-analyzer";

export interface EnrichmentDecision {
  leadId: string;
  strategy: 'minimal' | 'standard' | 'comprehensive' | 'maximum';
  priority: number;
  services: string[];
  estimatedCost: number;
  actualCost?: number;
  confidence: number;
  reasoning: string;
  skipReasons?: string[];
  batchContext?: {
    batchId: string;
    totalLeads: number;
    remainingBudget: number;
  };
  executionDetails?: {
    triggeredAt?: Date;
    completedAt?: Date;
    enrichmentJobId?: string;
  };
}

interface LeadContext {
  lead: Lead | Partial<Lead>;
  existingData: any;
  historicalPerformance?: any;
  industryInsights?: any;
  relatedEntities?: any;
  uccData?: any;
  masterDbData?: any;
  dataCompletenessAnalysis?: AnalysisReport;
  qualityMetrics?: DataQualityMetrics;
  enrichmentPlan?: EnrichmentPlan;
  batchContext?: {
    batchId: string;
    totalLeads: number;
    remainingBudget: number;
    similarLeadsCount: number;
  };
}

interface IntelligenceMetrics {
  totalDecisions: number;
  averageCost: number;
  accuracyScore: number;
  creditsSaved: number;
  enrichmentSuccessRate: number;
}

export class IntelligenceBrain {
  private openai: OpenAI | null = null;
  private orchestrator: WaterfallEnrichmentOrchestrator;
  private masterEnrichmentOrchestrator: MasterEnrichmentOrchestrator;
  private enrichmentQueue: EnrichmentQueue;
  private scoringService: MLScoringService;
  private entityGraph: EntityGraphBuilder;
  private masterDb: MasterDatabaseService;
  private metrics: IntelligenceMetrics = {
    totalDecisions: 0,
    averageCost: 0,
    accuracyScore: 0.95,
    creditsSaved: 0,
    enrichmentSuccessRate: 0.92
  };

  // Memoized decision cache for similar leads
  private cachedDecision = memoizee(
    async (leadHash: string) => this.computeDecision(leadHash),
    { maxAge: 3600000, promise: true } // 1 hour cache
  );

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    this.orchestrator = new WaterfallEnrichmentOrchestrator();
    this.masterEnrichmentOrchestrator = new MasterEnrichmentOrchestrator();
    this.enrichmentQueue = new EnrichmentQueue();
    this.scoringService = new MLScoringService();
    this.entityGraph = new EntityGraphBuilder();
    this.masterDb = new MasterDatabaseService();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    eventBus.on('lead:created', this.handleNewLead.bind(this));
    eventBus.on('lead:updated', this.handleLeadUpdate.bind(this));
    eventBus.on('enrichment:completed', this.handleEnrichmentComplete.bind(this));
  }

  async analyzeAndDecide(lead: Lead): Promise<EnrichmentDecision> {
    const context = await this.gatherContext(lead);
    const decision = await this.makeIntelligentDecision(context);
    
    // Track metrics
    this.metrics.totalDecisions++;
    this.updateMetrics(decision);
    
    // Emit decision event
    eventBus.emit('brain:decision', { lead, decision });
    
    return decision;
  }

  /**
   * Evaluate a lead with data completeness analysis for upload processing
   */
  async evaluateLead(
    lead: Partial<Lead>,
    analysisReport?: AnalysisReport,
    options?: {
      costBudget?: number;
      urgency?: 'immediate' | 'high' | 'medium' | 'low';
      batchContext?: {
        batchId: string;
        totalLeads: number;
        remainingBudget: number;
        similarLeadsCount: number;
      };
    }
  ): Promise<EnrichmentDecision> {
    // Create a temporary lead object if no ID exists
    const tempLead = {
      ...lead,
      id: lead.id || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    } as Lead;

    // Gather context with analysis report
    const context = await this.gatherContext(tempLead);
    
    // Enhance context with analysis report data
    if (analysisReport) {
      context.dataCompletenessAnalysis = analysisReport;
      context.qualityMetrics = analysisReport.qualityMetrics;
      context.enrichmentPlan = analysisReport.enrichmentPlan;
    }

    // Apply batch context if available
    if (options?.batchContext) {
      context.batchContext = options.batchContext;
    }

    // Make intelligent decision with enhanced context
    const decision = await this.makeIntelligentDecisionWithAnalysis(context, options);
    
    // Store decision in database if we have a real lead ID
    if (lead.id && !lead.id.startsWith('temp-')) {
      await this.storeDecision(lead.id, decision);
    }
    
    // Track metrics
    this.metrics.totalDecisions++;
    this.updateMetrics(decision);
    
    return decision;
  }

  /**
   * Batch evaluate multiple leads for optimized decision making
   */
  async evaluateBatch(
    leads: Array<{ lead: Partial<Lead>; analysis?: AnalysisReport }>,
    options?: {
      totalBudget?: number;
      strategy?: 'cost_optimize' | 'quality_maximize' | 'balanced';
      groupSimilar?: boolean;
      batchId?: string;
    }
  ): Promise<{
    decisions: EnrichmentDecision[];
    batchPlan: {
      totalEstimatedCost: number;
      groupedStrategies: Map<string, string[]>; // strategy -> leadIds
      priorityOrder: string[]; // leadIds in priority order
      costOptimizations: string[];
      expectedQualityGain: number;
      enrichmentJobs: Array<{
        leadId: string;
        priority: number;
        estimatedTime: number;
      }>;
    };
  }> {
    const totalBudget = options?.totalBudget || Infinity;
    let remainingBudget = totalBudget;
    const decisions: EnrichmentDecision[] = [];
    const groupedStrategies = new Map<string, string[]>();
    const priorityOrder: string[] = [];
    const enrichmentJobs: Array<{ leadId: string; priority: number; estimatedTime: number }> = [];

    console.log(`[IntelligenceBrain] Evaluating batch of ${leads.length} leads with budget: ${totalBudget}`);

    // First pass: evaluate all leads individually
    const evaluations = await Promise.all(
      leads.map(async ({ lead, analysis }) => {
        const tempId = lead.id || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const evaluation = await this.evaluateLead(
          { ...lead, id: tempId },
          analysis,
          {
            costBudget: remainingBudget / leads.length, // Initial fair share
            urgency: 'medium',
            batchContext: {
              batchId: options?.batchId || `batch-${Date.now()}`,
              totalLeads: leads.length,
              remainingBudget,
              similarLeadsCount: 0
            }
          }
        );
        return { ...evaluation, lead };
      })
    );

    // Sort by priority and value
    evaluations.sort((a, b) => {
      const scoreA = a.priority * (a.confidence || 0.5);
      const scoreB = b.priority * (b.confidence || 0.5);
      return scoreB - scoreA;
    });

    // Second pass: optimize budget allocation based on strategy
    const strategy = options?.strategy || 'balanced';
    
    for (const evaluation of evaluations) {
      let allocated = false;
      
      if (strategy === 'cost_optimize') {
        // Prefer minimal enrichment to stay within budget
        if (remainingBudget > 0.01) {
          const minimalDecision: EnrichmentDecision = {
            ...evaluation,
            strategy: 'minimal',
            services: ['validation'],
            estimatedCost: 0.01,
            reasoning: `Cost optimization strategy - minimal enrichment (budget: ${remainingBudget.toFixed(2)})`
          };
          decisions.push(minimalDecision);
          remainingBudget -= 0.01;
          allocated = true;
        }
      } else if (strategy === 'quality_maximize' && evaluation.estimatedCost <= remainingBudget) {
        // Use full enrichment when possible
        decisions.push(evaluation);
        remainingBudget -= evaluation.estimatedCost;
        allocated = true;
      } else if (strategy === 'balanced' && evaluation.estimatedCost <= remainingBudget) {
        // Balanced approach - use recommended enrichment if budget allows
        decisions.push(evaluation);
        remainingBudget -= evaluation.estimatedCost;
        allocated = true;
      }

      if (allocated) {
        priorityOrder.push(evaluation.leadId);
        
        // Group by strategy
        const strategyKey = decisions[decisions.length - 1].strategy;
        if (!groupedStrategies.has(strategyKey)) {
          groupedStrategies.set(strategyKey, []);
        }
        groupedStrategies.get(strategyKey)!.push(evaluation.leadId);
        
        // Add to enrichment jobs
        enrichmentJobs.push({
          leadId: evaluation.leadId,
          priority: evaluation.priority,
          estimatedTime: this.estimateProcessingTime(evaluation.services)
        });
      } else {
        // No budget - skip enrichment
        decisions.push({
          ...evaluation,
          strategy: 'minimal',
          services: [],
          estimatedCost: 0,
          reasoning: 'Budget exhausted - no enrichment applied',
          skipReasons: ['Budget exhausted']
        });
      }
    }

    // Calculate optimizations and expected gains
    const totalEstimatedCost = decisions.reduce((sum, d) => sum + d.estimatedCost, 0);
    const expectedQualityGain = this.calculateExpectedQualityGain(decisions);
    const costOptimizations = this.identifyCostOptimizations(groupedStrategies);

    console.log(`[IntelligenceBrain] Batch evaluation complete:
      - Total leads: ${leads.length}
      - Decisions made: ${decisions.length}
      - Total cost: ${totalEstimatedCost.toFixed(2)}
      - Expected quality gain: ${expectedQualityGain.toFixed(1)}%
      - Strategies: ${Array.from(groupedStrategies.keys()).join(', ')}
    `);

    return {
      decisions,
      batchPlan: {
        totalEstimatedCost,
        groupedStrategies,
        priorityOrder,
        costOptimizations,
        expectedQualityGain,
        enrichmentJobs
      }
    };
  }

  /**
   * Make intelligent decision with data completeness analysis
   */
  private async makeIntelligentDecisionWithAnalysis(
    context: LeadContext, 
    options?: {
      costBudget?: number;
      urgency?: 'immediate' | 'high' | 'medium' | 'low';
    }
  ): Promise<EnrichmentDecision> {
    // If we have high-quality data from completeness analysis, use it
    if (context.dataCompletenessAnalysis && context.enrichmentPlan) {
      const plan = context.enrichmentPlan;
      const metrics = context.qualityMetrics;
      
      // Check master database first
      if (context.masterDbData && context.masterDbData.completeness > 0.85) {
        return {
          leadId: context.lead.id as string,
          strategy: 'minimal',
          priority: 3,
          services: ['validation'],
          estimatedCost: 0.01,
          confidence: 0.95,
          reasoning: 'Lead already exists in master database with high completeness',
          skipReasons: ['Data already available in master database']
        };
      }
      
      // Use enrichment plan recommendations
      const recommendedServices = plan.recommendedServices.map(s => s.service);
      const totalCost = plan.totalEstimatedCost;
      
      // Apply budget constraints if specified
      const budget = options?.costBudget || Infinity;
      let selectedServices = recommendedServices;
      let adjustedCost = totalCost;
      
      if (totalCost > budget) {
        // Prioritize services within budget
        selectedServices = [];
        adjustedCost = 0;
        for (const service of plan.recommendedServices) {
          if (adjustedCost + service.estimatedCost <= budget) {
            selectedServices.push(service.service);
            adjustedCost += service.estimatedCost;
          }
        }
      }
      
      // Determine strategy based on plan priority
      let strategy: 'minimal' | 'standard' | 'comprehensive' | 'maximum' = 'standard';
      if (plan.priority === 'urgent' || plan.priority === 'high') {
        strategy = (metrics?.completenessScore ?? 0) < 40 ? 'maximum' : 'comprehensive';
      } else if (plan.priority === 'medium') {
        strategy = 'standard';
      } else {
        strategy = 'minimal';
      }
      
      // Calculate priority based on urgency and quality metrics
      let priority = 5;
      if (options?.urgency === 'immediate') priority = 10;
      else if (options?.urgency === 'high') priority = 8;
      else if (plan.priority === 'urgent') priority = 9;
      else if (plan.priority === 'high') priority = 7;
      
      return {
        leadId: context.lead.id as string,
        strategy,
        priority,
        services: selectedServices,
        estimatedCost: adjustedCost,
        confidence: plan.confidenceLevel / 100,
        reasoning: `Based on data analysis: ${(metrics?.completenessScore ?? 0).toFixed(0)}% complete, ${plan.expectedQualityImprovement.toFixed(0)}% expected improvement. ${plan.executionSteps?.[0]?.description || 'Targeted enrichment recommended'}`
      };
    }
    
    // Fallback to original decision logic
    return this.makeIntelligentDecision(context as LeadContext);
  }

  /**
   * Store enrichment decision in the database for tracking
   */
  private async storeDecision(leadId: string, decision: EnrichmentDecision): Promise<void> {
    try {
      const decisionData: InsertIntelligenceDecision = {
        leadId,
        strategy: decision.strategy,
        priority: decision.priority,
        services: decision.services,
        estimatedCost: decision.estimatedCost.toFixed(4),
        actualCost: decision.actualCost ? decision.actualCost.toFixed(4) : undefined,
        confidence: decision.confidence.toFixed(4),
        reasoning: decision.reasoning,
        skipReasons: decision.skipReasons
      };

      await db.insert(intelligenceDecisions).values(decisionData);
      
      console.log(`[IntelligenceBrain] Stored decision for lead ${leadId}: ${decision.strategy} strategy`);
    } catch (error) {
      console.error('Error storing intelligence decision:', error);
      // Don't throw - continue processing even if storage fails
    }
  }

  /**
   * Calculate expected quality improvement from enrichment decisions
   */
  private calculateExpectedQualityGain(decisions: EnrichmentDecision[]): number {
    if (decisions.length === 0) return 0;
    
    let totalGain = 0;
    for (const decision of decisions) {
      // Estimate quality gain based on strategy and services
      let gain = 0;
      switch (decision.strategy) {
        case 'maximum':
          gain = 40; // 40% improvement expected
          break;
        case 'comprehensive':
          gain = 30; // 30% improvement
          break;
        case 'standard':
          gain = 20; // 20% improvement
          break;
        case 'minimal':
          gain = 5; // 5% improvement
          break;
      }
      
      // Adjust based on confidence
      gain *= decision.confidence;
      totalGain += gain;
    }
    
    return totalGain / decisions.length;
  }

  /**
   * Identify cost optimization opportunities for batch processing
   */
  private identifyCostOptimizations(groupedStrategies: Map<string, string[]>): string[] {
    const optimizations: string[] = [];
    
    for (const [strategy, leadIds] of Array.from(groupedStrategies.entries())) {
      const count = leadIds.length;
      
      if (count >= 10) {
        optimizations.push(`Batch discount opportunity: ${count} leads with ${strategy} strategy`);
      }
      
      if (count >= 5 && (strategy === 'standard' || strategy === 'comprehensive')) {
        optimizations.push(`Consider bulk API calls for ${count} ${strategy} enrichments`);
      }
    }
    
    // Check for deduplication opportunities
    if (groupedStrategies.size > 1) {
      optimizations.push('Group similar leads to reuse enrichment data');
    }
    
    return optimizations;
  }

  /**
   * Estimate processing time for enrichment services
   */
  private estimateProcessingTime(services: string[]): number {
    const serviceTimes: Record<string, number> = {
      'numverify': 1,
      'hunter': 2,
      'clearbit': 3,
      'proxycurl': 3,
      'abstractapi': 2,
      'peopledatalabs': 5,
      'perplexity': 4,
      'openai': 3,
      'validation': 0.5
    };
    
    return services.reduce((total, service) => total + (serviceTimes[service] || 2), 0);
  }

  /**
   * Trigger automatic enrichment based on decisions
   */
  async triggerAutomaticEnrichment(
    leadId: string, 
    decision: EnrichmentDecision
  ): Promise<{ jobId: string; status: string }> {
    if (decision.services.length === 0 || (decision.skipReasons?.length ?? 0) > 0) {
      console.log(`[IntelligenceBrain] Skipping enrichment for lead ${leadId}: ${decision.skipReasons?.join(', ')}`);
      return { jobId: 'skipped', status: 'skipped' };
    }
    
    // Get lead data from storage
    const lead = await storage.getLead(leadId);
    if (!lead) {
      console.warn(`[IntelligenceBrain] Lead ${leadId} not found for enrichment`);
      return { jobId: 'failed', status: 'failed' };
    }
    
    // Map priority to enrichment queue priority
    const queuePriority = decision.priority >= 8 ? 'high' : 
                         decision.priority >= 5 ? 'medium' : 'low';
    
    // Queue for enrichment using the correct method
    const jobId = await this.enrichmentQueue.addToQueue(
      lead,
      queuePriority,
      'api', // source
      {
        batchId: decision.batchContext?.batchId,
        enrichmentOptions: {
          skipPerplexity: !decision.services.includes('perplexity'),
          skipHunter: !decision.services.includes('hunter'),
          skipNumverify: !decision.services.includes('numverify'),
          skipOpenAI: !decision.services.includes('openai'),
          maxRetries: 3
        },
        maxRetries: 3
      }
    );
    
    // Update decision with execution details
    decision.executionDetails = {
      triggeredAt: new Date(),
      enrichmentJobId: jobId
    };
    
    // Store updated decision
    if (!leadId.startsWith('temp-')) {
      await this.storeDecision(leadId, decision);
    }
    
    console.log(`[IntelligenceBrain] Queued enrichment job ${jobId} for lead ${leadId} with priority ${queuePriority}`);
    
    return { jobId, status: 'queued' };
  }

  /**
   * Process batch enrichment jobs
   */
  async processBatchEnrichment(
    decisions: EnrichmentDecision[]
  ): Promise<{ success: number; failed: number; skipped: number }> {
    const results = { success: 0, failed: 0, skipped: 0 };
    
    // Sort by priority
    const sortedDecisions = [...decisions].sort((a, b) => b.priority - a.priority);
    
    // Process in parallel batches
    const batchSize = 10;
    for (let i = 0; i < sortedDecisions.length; i += batchSize) {
      const batch = sortedDecisions.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (decision) => {
          try {
            const result = await this.triggerAutomaticEnrichment(decision.leadId, decision);
            if (result.status === 'skipped') {
              results.skipped++;
            } else {
              results.success++;
            }
            return result;
          } catch (error) {
            console.error(`Error triggering enrichment for ${decision.leadId}:`, error);
            results.failed++;
            return { jobId: 'failed', status: 'failed' };
          }
        })
      );
      
      console.log(`[IntelligenceBrain] Processed batch ${Math.floor(i/batchSize) + 1}: ${batchResults.filter(r => r.status !== 'failed').length} successful`);
    }
    
    return results;
  }

  private async gatherContext(lead: Lead | Partial<Lead>): Promise<LeadContext> {
    // Parallel gather all context data
    const [
      masterDbData,
      uccData,
      relatedEntities,
      historicalPerformance,
      industryInsights
    ] = await Promise.all([
      this.masterDb.search({
        businessName: lead.businessName,
        ownerName: lead.ownerName,
        phone: lead.phone,
        email: lead.email
      }),
      lead.businessName ? this.getUccDataForLead(lead as Lead) : null,
      this.getRelatedEntitiesForLead(lead.id),
      this.getHistoricalPerformance(lead),
      this.getIndustryInsights(lead)
    ]);

    return {
      lead,
      existingData: this.assessExistingData(lead),
      masterDbData,
      uccData,
      relatedEntities,
      historicalPerformance,
      industryInsights
    };
  }

  private async makeIntelligentDecision(context: LeadContext): Promise<EnrichmentDecision> {
    // Check if we already have sufficient data from master database
    if (context.masterDbData && context.masterDbData.completeness > 0.85) {
      return {
        leadId: context.lead.id as string,
        strategy: 'minimal',
        priority: 5,
        services: ['validation'],
        estimatedCost: 0.01,
        confidence: 0.95,
        reasoning: 'Lead already exists in master database with high completeness',
        skipReasons: ['Data already available in master database']
      };
    }

    // Calculate lead value score
    const valueScore = await this.calculateLeadValue(context);
    
    // Determine optimal strategy based on multiple factors
    const strategy = this.determineStrategy(valueScore, context);
    
    // Select specific services based on missing data and strategy
    const services = this.selectServices(strategy, context);
    
    // Calculate estimated cost
    const estimatedCost = this.estimateCost(services);
    
    // Determine priority
    const priority = this.calculatePriority(valueScore, context);
    
    // Generate reasoning using AI if available
    const reasoning = await this.generateReasoning(context, strategy, services);

    return {
      leadId: context.lead.id as string,
      strategy,
      priority,
      services,
      estimatedCost,
      confidence: this.calculateConfidence(context, valueScore),
      reasoning
    };
  }

  private determineStrategy(valueScore: number, context: LeadContext): 'minimal' | 'standard' | 'comprehensive' | 'maximum' {
    // Intelligent strategy selection based on multiple factors
    const existingCompleteness = this.calculateCompleteness(context.lead as Lead);
    const hasUccData = !!context.uccData && context.uccData.filings.length > 0;
    const hasRelatedEntities = context.relatedEntities && context.relatedEntities.length > 0;
    
    // High-value lead with UCC data - maximum enrichment
    if (valueScore > 80 && hasUccData) {
      return 'maximum';
    }
    
    // High-value lead without UCC data - comprehensive enrichment
    if (valueScore > 70) {
      return 'comprehensive';
    }
    
    // Medium value or has related entities - standard enrichment
    if (valueScore > 50 || hasRelatedEntities) {
      return 'standard';
    }
    
    // Low value or already fairly complete - minimal enrichment
    if (existingCompleteness > 0.6 || valueScore < 30) {
      return 'minimal';
    }
    
    return 'standard';
  }

  private selectServices(strategy: string, context: LeadContext): string[] {
    const services: string[] = [];
    const lead = context.lead;
    
    // Always validate phone if present
    if (lead.phone && !lead.phoneVerificationScore) {
      services.push('numverify');
    }
    
    switch (strategy) {
      case 'minimal':
        // Only essential validation
        if (!lead.email && (lead.businessName || lead.ownerName)) {
          services.push('hunter');
        }
        break;
        
      case 'standard':
        // Basic enrichment
        if (!lead.email) services.push('hunter');
        if (!lead.industry || !lead.annualRevenue) services.push('clearbit');
        if (!lead.linkedinUrl) services.push('proxycurl');
        break;
        
      case 'comprehensive':
        // Full enrichment except expensive services
        services.push('hunter', 'clearbit', 'proxycurl', 'abstractapi');
        if (lead.businessName) services.push('perplexity');
        break;
        
      case 'maximum':
        // All available services
        services.push('hunter', 'clearbit', 'proxycurl', 'abstractapi', 'peopledatalabs');
        if (lead.businessName) services.push('perplexity', 'openai');
        break;
    }
    
    // Remove duplicates and filter based on available credits
    return Array.from(new Set(services)).filter(service => this.hasCreditsFor(service));
  }

  private async calculateLeadValue(context: LeadContext): Promise<number> {
    let score = 0;
    const lead = context.lead;
    
    // Business characteristics (40 points)
    if (lead.annualRevenue) {
      const revenue = typeof lead.annualRevenue === 'string' ? parseFloat(lead.annualRevenue) : lead.annualRevenue;
      if (!isNaN(revenue)) {
        score += Math.min(revenue / 50000, 20);
      }
    }
    if (lead.timeInBusiness) {
      const years = typeof lead.timeInBusiness === 'string' ? parseFloat(lead.timeInBusiness) : lead.timeInBusiness;
      if (!isNaN(years)) {
        score += Math.min(years * 2, 10);
      }
    }
    if (lead.industry) {
      const industryScore = this.getIndustryScore(lead.industry);
      score += industryScore * 10;
    }
    
    // UCC data importance (30 points)
    if (context.uccData) {
      score += Math.min(context.uccData.filings.length * 5, 15);
      if (context.uccData.riskScore && context.uccData.riskScore < 50) {
        score += 15;
      }
    }
    
    // Data quality (20 points)
    const completeness = this.calculateCompleteness(lead as Lead);
    score += completeness * 20;
    
    // Urgency and intent (10 points)
    if (lead.urgencyLevel === 'Immediate') score += 10;
    else if (lead.urgencyLevel === 'This Week') score += 7;
    else if (lead.urgencyLevel === 'This Month') score += 5;
    
    return Math.min(score, 100);
  }

  private calculateCompleteness(lead: Lead): number {
    const fields = [
      'businessName', 'ownerName', 'phone', 'email', 'address',
      'city', 'state', 'zipCode', 'industry', 'annualRevenue',
      'timeInBusiness', 'creditScore', 'website', 'socialProfiles'
    ];
    
    const filledFields = fields.filter(field => lead[field as keyof Lead]);
    return filledFields.length / fields.length;
  }

  private calculatePriority(valueScore: number, context: LeadContext): number {
    let priority = Math.floor(valueScore / 10);
    
    // Boost priority for urgent leads
    if (context.lead.urgencyLevel === 'Immediate') {
      priority = Math.min(priority + 3, 10);
    }
    
    // Boost for UCC-backed leads
    if (context.uccData && context.uccData.filings.length > 0) {
      priority = Math.min(priority + 2, 10);
    }
    
    return priority;
  }

  private calculateConfidence(context: LeadContext, valueScore: number): number {
    let confidence = 0.5;
    
    // Increase confidence based on data availability
    if (context.masterDbData) confidence += 0.2;
    if (context.uccData) confidence += 0.15;
    if (context.historicalPerformance) confidence += 0.1;
    if (valueScore > 70) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  private estimateCost(services: string[]): number {
    const costs: Record<string, number> = {
      'numverify': 0.01,
      'hunter': 0.02,
      'clearbit': 0.05,
      'proxycurl': 0.03,
      'abstractapi': 0.02,
      'peopledatalabs': 0.10,
      'perplexity': 0.03,
      'openai': 0.05,
      'validation': 0.01
    };
    
    return services.reduce((total, service) => total + (costs[service] || 0), 0);
  }

  private hasCreditsFor(service: string): boolean {
    // Check if we have available API credits for the service
    // This would integrate with your existing API key management
    return true; // Simplified for now
  }

  private async generateReasoning(context: LeadContext, strategy: string, services: string[]): Promise<string> {
    if (!this.openai) {
      return this.generateBasicReasoning(context, strategy, services);
    }

    try {
      const prompt = this.buildReasoningPrompt(context, strategy, services);
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are an expert lead intelligence analyst. Provide a brief, clear reasoning for enrichment decisions."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || this.generateBasicReasoning(context, strategy, services);
    } catch (error) {
      console.error('Error generating AI reasoning:', error);
      return this.generateBasicReasoning(context, strategy, services);
    }
  }

  private generateBasicReasoning(context: LeadContext, strategy: string, services: string[]): string {
    const reasons = [];
    
    if (context.masterDbData && context.masterDbData.completeness > 0.5) {
      reasons.push(`Found existing data in master database (${Math.round(context.masterDbData.completeness * 100)}% complete)`);
    }
    
    if (context.uccData && context.uccData.filings.length > 0) {
      reasons.push(`UCC data indicates ${context.uccData.filings.length} active filings`);
    }
    
    if (strategy === 'maximum') {
      reasons.push('High-value lead requiring comprehensive verification');
    } else if (strategy === 'minimal') {
      reasons.push('Basic validation sufficient based on existing data');
    }
    
    reasons.push(`Selected ${services.length} enrichment services for optimal cost-benefit ratio`);
    
    return reasons.join('. ');
  }

  private buildReasoningPrompt(context: LeadContext, strategy: string, services: string[]): string {
    return `Analyze this enrichment decision:
    
Lead: ${context.lead.businessName || 'Unknown'} (${context.lead.industry || 'Unknown industry'})
Current completeness: ${Math.round(this.calculateCompleteness(context.lead as Lead) * 100)}%
Strategy selected: ${strategy}
Services to use: ${services.join(', ')}
Has UCC data: ${!!context.uccData}
In master database: ${!!context.masterDbData}

Provide a brief reasoning (max 2 sentences) for why this enrichment strategy is optimal.`;
  }

  private assessExistingData(lead: Lead | Partial<Lead>): any {
    return {
      hasBasicInfo: !!(lead.businessName && lead.ownerName),
      hasContactInfo: !!(lead.phone || lead.email),
      hasBusinessMetrics: !!(lead.annualRevenue && lead.timeInBusiness),
      hasLocation: !!(lead.city && lead.stateCode),
      completeness: this.calculateCompleteness(lead as Lead)
    };
  }

  private async getHistoricalPerformance(lead: Lead | Partial<Lead>): Promise<any> {
    // Get historical performance data for similar leads
    const similarLeads = await storage.searchSimilarLeads({
      industry: lead.industry ?? undefined,
      state: lead.stateCode ?? undefined,
      revenueRange: lead.annualRevenue ?? undefined
    });
    
    return {
      conversionRate: this.calculateConversionRate(similarLeads),
      averageValue: this.calculateAverageValue(similarLeads),
      enrichmentSuccess: this.calculateEnrichmentSuccess(similarLeads)
    };
  }

  private async getIndustryInsights(lead: Lead | Partial<Lead>): Promise<any> {
    if (!lead.industry) return null;
    
    return {
      riskLevel: this.getIndustryRisk(lead.industry),
      growthRate: this.getIndustryGrowth(lead.industry),
      fundingDemand: this.getFundingDemand(lead.industry)
    };
  }

  private getIndustryScore(industry: string): number {
    const scores: Record<string, number> = {
      'Restaurant': 0.8,
      'Retail': 0.7,
      'Construction': 0.9,
      'Transportation': 0.85,
      'Healthcare': 0.75,
      'Professional Services': 0.6,
      'Manufacturing': 0.8,
      'Technology': 0.5
    };
    return scores[industry] || 0.5;
  }

  private getIndustryRisk(industry: string): string {
    const risks: Record<string, string> = {
      'Restaurant': 'high',
      'Retail': 'medium',
      'Construction': 'medium',
      'Transportation': 'low',
      'Healthcare': 'low',
      'Professional Services': 'low',
      'Manufacturing': 'medium',
      'Technology': 'low'
    };
    return risks[industry] || 'medium';
  }

  private getIndustryGrowth(industry: string): number {
    const growth: Record<string, number> = {
      'Technology': 15,
      'Healthcare': 12,
      'E-commerce': 18,
      'Professional Services': 8,
      'Manufacturing': 5,
      'Construction': 7,
      'Restaurant': 3,
      'Retail': 2
    };
    return growth[industry] || 5;
  }

  private getFundingDemand(industry: string): string {
    const demand: Record<string, string> = {
      'Restaurant': 'high',
      'Retail': 'high',
      'Construction': 'very high',
      'Transportation': 'medium',
      'Healthcare': 'medium',
      'E-commerce': 'high',
      'Manufacturing': 'medium',
      'Technology': 'low'
    };
    return demand[industry] || 'medium';
  }

  private calculateConversionRate(leads: Lead[]): number {
    if (leads.length === 0) return 0;
    const converted = leads.filter(l => l.qualityScore && l.qualityScore > 70).length;
    return converted / leads.length;
  }

  private calculateAverageValue(leads: Lead[]): number {
    if (leads.length === 0) return 0;
    const total = leads.reduce((sum, l) => {
      const amount = l.requestedAmount ? parseFloat(l.requestedAmount) : 0;
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    return total / leads.length;
  }

  private calculateEnrichmentSuccess(leads: Lead[]): number {
    if (leads.length === 0) return 0;
    const enriched = leads.filter(l => l.isEnriched).length;
    return enriched / leads.length;
  }

  private updateMetrics(decision: EnrichmentDecision) {
    this.metrics.averageCost = 
      (this.metrics.averageCost * (this.metrics.totalDecisions - 1) + decision.estimatedCost) / 
      this.metrics.totalDecisions;
    
    // Calculate credits saved by intelligent decision making
    const maxCost = 0.28; // Cost if we used all services
    this.metrics.creditsSaved += (maxCost - decision.estimatedCost);
  }

  async executeEnrichment(decision: EnrichmentDecision): Promise<any> {
    // Execute the enrichment based on the decision
    const lead = await storage.getLeadById(decision.leadId);
    if (!lead) throw new Error('Lead not found');
    
    // Log the decision
    await storage.createEnrichmentLog({
      leadId: decision.leadId,
      service: 'intelligence_brain',
      success: true,
      responseData: decision,
      cost: decision.estimatedCost,
      processingTime: 0
    });
    
    // Execute enrichment through orchestrator with proper method
    const results = await this.orchestrator.enrichLead(lead);
    
    // Update master database with new data
    if (results && results.enrichedData) {
      await this.masterDb.addToDatabase({
        id: lead.id,
        businessName: lead.businessName || '',
        ownerName: lead.ownerName ?? undefined,
        phone: lead.phone ?? undefined,
        email: lead.email ?? undefined,
        address: lead.fullAddress ?? undefined,
        city: lead.city ?? undefined,
        state: lead.stateCode ?? undefined,
        zipCode: undefined,
        industry: lead.industry ?? undefined,
        annualRevenue: lead.annualRevenue ? parseFloat(lead.annualRevenue) : undefined,
        timeInBusiness: lead.timeInBusiness ? parseInt(lead.timeInBusiness) : undefined,
        dataQuality: {
          completeness: results.completenessScore || 0,
          accuracy: 0.8,
          lastVerified: new Date(),
          sources: decision.services
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          lastEnriched: new Date(),
          enrichmentCount: 1,
          manuallyVerified: false
        }
      });
    }
    
    return results;
  }

  private async handleNewLead(data: { lead: Lead }) {
    // Automatically analyze and enrich new leads
    const decision = await this.analyzeAndDecide(data.lead);
    
    if (decision.strategy !== 'minimal' || decision.services.length > 0) {
      await this.executeEnrichment(decision);
    }
  }

  private async handleLeadUpdate(data: { lead: Lead, changes: any }) {
    // Re-analyze if significant changes
    if (this.hasSignificantChanges(data.changes)) {
      const decision = await this.analyzeAndDecide(data.lead);
      
      if (decision.confidence > 0.7 && decision.services.length > 0) {
        await this.executeEnrichment(decision);
      }
    }
  }

  private async handleEnrichmentComplete(data: { leadId: string, results: any }) {
    // Learn from enrichment results to improve future decisions
    this.metrics.enrichmentSuccessRate = 
      (this.metrics.enrichmentSuccessRate * 0.95) + 
      (data.results.success ? 0.05 : 0);
  }

  private hasSignificantChanges(changes: any): boolean {
    const significantFields = ['businessName', 'ownerName', 'industry', 'annualRevenue'];
    return significantFields.some(field => field in changes);
  }

  private computeDecision(leadHash: string): Promise<EnrichmentDecision> {
    // This would be the actual computation logic
    // Used by the memoized cache
    return Promise.resolve({} as EnrichmentDecision);
  }

  getMetrics(): IntelligenceMetrics {
    return { ...this.metrics };
  }

  async optimizeStrategy(): Promise<void> {
    // Periodically optimize strategy based on performance
    const recentDecisions = await storage.getRecentEnrichmentLogs(100);
    
    // Analyze success rates and adjust strategies
    const successRates = this.analyzeSuccessRates(recentDecisions);
    
    // Adjust strategy thresholds based on performance
    if (successRates.comprehensive > successRates.maximum * 1.1) {
      // Comprehensive is more efficient, lower the threshold
      console.log('Optimizing: Favoring comprehensive over maximum strategy');
    }
  }

  private analyzeSuccessRates(logs: any[]): Record<string, number> {
    const rates: Record<string, number> = {
      minimal: 0,
      standard: 0,
      comprehensive: 0,
      maximum: 0
    };
    
    // Calculate success rates per strategy
    logs.forEach(log => {
      if (log.responseData && log.responseData.strategy) {
        const strategy = log.responseData.strategy;
        rates[strategy] = (rates[strategy] || 0) + (log.success ? 1 : 0);
      }
    });
    
    return rates;
  }

  private async getUccDataForLead(lead: Lead): Promise<any> {
    try {
      // Fetch UCC filings for this lead
      const filings = await db
        .select()
        .from(uccFilings)
        .where(eq(uccFilings.leadId, lead.id))
        .orderBy(desc(uccFilings.filingDate));

      // Fetch UCC intelligence if available
      const intelligence = await db
        .select()
        .from(uccIntelligence)
        .where(eq(uccIntelligence.leadId, lead.id))
        .orderBy(desc(uccIntelligence.createdAt))
        .limit(1);

      return {
        filings: filings || [],
        intelligence: intelligence[0] || null,
        riskScore: intelligence[0]?.debtStackingScore || null
      };
    } catch (error) {
      console.error('Error fetching UCC data:', error);
      return null;
    }
  }

  private async getRelatedEntitiesForLead(leadId: string | undefined): Promise<any[]> {
    if (!leadId) return [];
    
    try {
      // Build graph for this lead
      const leadData = await storage.getLeadById(leadId);
      if (!leadData) return [];
      
      // Simple related entities lookup based on common attributes
      const relatedLeads = await storage.searchSimilarLeads({
        industry: leadData.industry ?? undefined,
        state: leadData.stateCode ?? undefined,
        revenueRange: leadData.annualRevenue ?? undefined
      });

      return relatedLeads || [];
    } catch (error) {
      console.error('Error fetching related entities:', error);
      return [];
    }
  }
}

// Export singleton instance
export const intelligenceBrain = new IntelligenceBrain();