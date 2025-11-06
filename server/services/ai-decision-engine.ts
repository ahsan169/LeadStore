import { Lead, InsertLead } from "@shared/schema";
import { openAIService } from "./openai-service";
import { intelligenceBrain } from "./intelligence-brain";
import { enrichmentQueue } from "./enrichment-queue";
import { MasterEnrichmentOrchestrator } from "./master-enrichment-orchestrator";
import { eventBus } from "./event-bus";
import { storage } from "../storage";

export interface EnrichmentStrategy {
  leadId: string;
  businessName: string;
  priority: "high" | "medium" | "low" | "skip";
  services: string[];
  estimatedCost: number;
  estimatedTime: number;
  confidence: number;
  reasoning: string;
  dataGaps: string[];
  enrichmentPlan: {
    phase1: string[];  // Critical services (verification)
    phase2: string[];  // Enhancement services (enrichment)
    phase3: string[];  // Optional services (deep analysis)
  };
  qualityScore: number;
  expectedQualityGain: number;
}

export interface BatchEnrichmentPlan {
  totalLeads: number;
  leadsToEnrich: number;
  leadsToSkip: number;
  totalEstimatedCost: number;
  totalEstimatedTime: number;
  strategies: EnrichmentStrategy[];
  costOptimizations: string[];
  priorityBreakdown: {
    high: number;
    medium: number;
    low: number;
    skip: number;
  };
}

export class AIDecisionEngine {
  private masterOrchestrator: MasterEnrichmentOrchestrator;
  private processingQueue: Map<string, EnrichmentStrategy> = new Map();
  
  constructor() {
    this.masterOrchestrator = new MasterEnrichmentOrchestrator();
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    // Listen for upload events
    eventBus.on('upload:leads:complete', async (data: { batchId: string; leads: Lead[] }) => {
      console.log(`[AIDecisionEngine] Analyzing batch ${data.batchId} with ${data.leads.length} leads`);
      await this.analyzeBatch(data.leads, data.batchId);
    });
    
    // Listen for enrichment completion
    eventBus.on('enrichment:complete', async (data: { leadId: string; results: any }) => {
      console.log(`[AIDecisionEngine] Enrichment completed for lead ${data.leadId}`);
      this.processingQueue.delete(data.leadId);
    });
  }
  
  /**
   * Analyze a single lead and determine enrichment strategy
   */
  async analyzeLeadForEnrichment(lead: Partial<Lead>): Promise<EnrichmentStrategy> {
    console.log(`[AIDecisionEngine] Analyzing lead: ${lead.businessName}`);
    
    // Calculate current data completeness
    const completeness = this.calculateCompleteness(lead);
    const dataGaps = this.identifyDataGaps(lead);
    
    // Use AI to analyze the lead
    const aiAnalysis = await this.getAIAnalysis(lead, completeness, dataGaps);
    
    // Determine priority based on multiple factors
    const priority = this.calculatePriority(lead, completeness, aiAnalysis);
    
    // Build enrichment plan
    const enrichmentPlan = this.buildEnrichmentPlan(lead, dataGaps, priority);
    
    // Calculate costs and time
    const costEstimate = this.estimateCost(enrichmentPlan);
    const timeEstimate = this.estimateTime(enrichmentPlan);
    
    // Calculate expected quality gain
    const expectedQualityGain = this.calculateExpectedQualityGain(completeness, enrichmentPlan);
    
    const strategy: EnrichmentStrategy = {
      leadId: lead.id || `temp-${Date.now()}`,
      businessName: lead.businessName || 'Unknown',
      priority,
      services: [
        ...enrichmentPlan.phase1,
        ...enrichmentPlan.phase2,
        ...enrichmentPlan.phase3
      ],
      estimatedCost: costEstimate,
      estimatedTime: timeEstimate,
      confidence: aiAnalysis.confidence,
      reasoning: aiAnalysis.reasoning,
      dataGaps,
      enrichmentPlan,
      qualityScore: completeness.score,
      expectedQualityGain
    };
    
    return strategy;
  }
  
  /**
   * Analyze a batch of leads and create enrichment plan
   */
  async analyzeBatch(leads: Partial<Lead>[], batchId?: string): Promise<BatchEnrichmentPlan> {
    console.log(`[AIDecisionEngine] Analyzing batch of ${leads.length} leads`);
    
    const strategies: EnrichmentStrategy[] = [];
    const priorityBreakdown = {
      high: 0,
      medium: 0,
      low: 0,
      skip: 0
    };
    
    // Analyze each lead
    for (const lead of leads) {
      const strategy = await this.analyzeLeadForEnrichment(lead);
      strategies.push(strategy);
      priorityBreakdown[strategy.priority]++;
      
      // Store in processing queue
      if (strategy.priority !== 'skip') {
        this.processingQueue.set(strategy.leadId, strategy);
      }
    }
    
    // Calculate totals
    const leadsToEnrich = strategies.filter(s => s.priority !== 'skip').length;
    const leadsToSkip = strategies.filter(s => s.priority === 'skip').length;
    const totalEstimatedCost = strategies.reduce((sum, s) => sum + s.estimatedCost, 0);
    const totalEstimatedTime = strategies.reduce((sum, s) => sum + s.estimatedTime, 0);
    
    // Identify cost optimizations
    const costOptimizations = this.identifyCostOptimizations(strategies);
    
    const plan: BatchEnrichmentPlan = {
      totalLeads: leads.length,
      leadsToEnrich,
      leadsToSkip,
      totalEstimatedCost,
      totalEstimatedTime,
      strategies,
      costOptimizations,
      priorityBreakdown
    };
    
    // Emit analysis complete event
    eventBus.emit('ai:batch:analysis:complete', {
      batchId,
      plan
    });
    
    return plan;
  }
  
  /**
   * Execute enrichment for high-priority leads
   */
  async executeEnrichment(strategies: EnrichmentStrategy[], autoEnrich = true): Promise<{
    queued: number;
    skipped: number;
    failed: number;
  }> {
    const results = {
      queued: 0,
      skipped: 0,
      failed: 0
    };
    
    if (!autoEnrich) {
      console.log(`[AIDecisionEngine] Auto-enrichment disabled, skipping execution`);
      results.skipped = strategies.length;
      return results;
    }
    
    // Sort by priority
    const sortedStrategies = strategies.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1, skip: 0 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    for (const strategy of sortedStrategies) {
      if (strategy.priority === 'skip') {
        results.skipped++;
        continue;
      }
      
      try {
        // Get the full lead data
        const lead = await storage.getLeadById(strategy.leadId);
        if (!lead) {
          console.error(`[AIDecisionEngine] Lead ${strategy.leadId} not found`);
          results.failed++;
          continue;
        }
        
        // Queue for enrichment based on priority
        if (strategy.priority === 'high') {
          // Use intelligent orchestrator for high-priority leads
          await this.masterOrchestrator.processLead(lead, {
            services: strategy.services,
            priority: 'high',
            estimatedCost: strategy.estimatedCost
          });
        } else {
          // Queue for batch processing
          await enrichmentQueue.addToQueue({
            leadId: strategy.leadId,
            businessName: strategy.businessName,
            priority: strategy.priority === 'medium' ? 5 : 3,
            services: strategy.services,
            metadata: {
              reasoning: strategy.reasoning,
              expectedQualityGain: strategy.expectedQualityGain
            }
          });
        }
        
        results.queued++;
        
        // Emit enrichment queued event
        eventBus.emit('ai:enrichment:queued', {
          leadId: strategy.leadId,
          strategy
        });
        
      } catch (error) {
        console.error(`[AIDecisionEngine] Failed to queue enrichment for ${strategy.leadId}:`, error);
        results.failed++;
      }
    }
    
    return results;
  }
  
  private calculateCompleteness(lead: Partial<Lead>): { score: number; missingFields: string[] } {
    const requiredFields = [
      'businessName', 'ownerName', 'email', 'phone', 'address',
      'city', 'stateCode', 'zipCode', 'industry', 'annualRevenue'
    ];
    
    const missingFields: string[] = [];
    let filledFields = 0;
    
    for (const field of requiredFields) {
      if (lead[field as keyof Lead]) {
        filledFields++;
      } else {
        missingFields.push(field);
      }
    }
    
    const score = (filledFields / requiredFields.length) * 100;
    
    return { score, missingFields };
  }
  
  private identifyDataGaps(lead: Partial<Lead>): string[] {
    const gaps: string[] = [];
    
    // Check contact information
    if (!lead.email) gaps.push('Missing email');
    if (!lead.phone) gaps.push('Missing phone');
    if (!lead.ownerName) gaps.push('Missing owner name');
    
    // Check business information
    if (!lead.annualRevenue) gaps.push('Missing annual revenue');
    if (!lead.employeeCount) gaps.push('Missing employee count');
    if (!lead.yearFounded) gaps.push('Missing founding year');
    
    // Check verification status
    if (!lead.emailVerified) gaps.push('Email not verified');
    if (!lead.phoneVerified) gaps.push('Phone not verified');
    
    // Check enrichment data
    if (!lead.websiteUrl) gaps.push('Missing website');
    if (!lead.linkedinUrl) gaps.push('Missing LinkedIn');
    if (!lead.naicsCode) gaps.push('Missing NAICS code');
    
    return gaps;
  }
  
  private async getAIAnalysis(
    lead: Partial<Lead>, 
    completeness: { score: number; missingFields: string[] },
    dataGaps: string[]
  ): Promise<{ confidence: number; reasoning: string; suggestions: string[] }> {
    try {
      const prompt = `
        Analyze this MCA lead and determine enrichment strategy:
        
        Business: ${lead.businessName || 'Unknown'}
        Industry: ${lead.industry || 'Unknown'}
        State: ${lead.stateCode || 'Unknown'}
        Revenue: ${lead.annualRevenue || 'Unknown'}
        Completeness Score: ${completeness.score}%
        Missing Fields: ${completeness.missingFields.join(', ')}
        Data Gaps: ${dataGaps.join(', ')}
        
        Provide:
        1. Confidence score (0-1) for enrichment value
        2. Brief reasoning (1-2 sentences)
        3. Top 3 enrichment suggestions
        
        Format as JSON: { confidence: number, reasoning: string, suggestions: string[] }
      `;
      
      const analysis = await openAIService.generateStructuredResponse(prompt, {
        confidence: 0.7,
        reasoning: "Lead has good potential but needs contact verification and revenue data.",
        suggestions: ["Verify email and phone", "Enrich company data", "Add UCC filing information"]
      });
      
      return analysis;
      
    } catch (error) {
      console.error('[AIDecisionEngine] AI analysis failed:', error);
      // Fallback logic
      return {
        confidence: completeness.score > 70 ? 0.8 : 0.5,
        reasoning: `Lead is ${completeness.score}% complete with ${dataGaps.length} data gaps.`,
        suggestions: dataGaps.slice(0, 3)
      };
    }
  }
  
  private calculatePriority(
    lead: Partial<Lead>,
    completeness: { score: number },
    aiAnalysis: { confidence: number }
  ): "high" | "medium" | "low" | "skip" {
    // Skip if already highly complete
    if (completeness.score > 90) return 'skip';
    
    // Skip if AI confidence is very low
    if (aiAnalysis.confidence < 0.3) return 'skip';
    
    // High priority for valuable incomplete leads
    if (lead.annualRevenue && parseInt(lead.annualRevenue) > 1000000 && completeness.score < 60) {
      return 'high';
    }
    
    // High priority for California MCA leads
    if (lead.stateCode === 'CA' && lead.mcaQualityScore && lead.mcaQualityScore > 70) {
      return 'high';
    }
    
    // Medium priority for moderate value leads
    if (aiAnalysis.confidence > 0.6 && completeness.score < 70) {
      return 'medium';
    }
    
    // Low priority for others
    return 'low';
  }
  
  private buildEnrichmentPlan(
    lead: Partial<Lead>,
    dataGaps: string[],
    priority: string
  ): { phase1: string[]; phase2: string[]; phase3: string[] } {
    const plan = {
      phase1: [] as string[],  // Critical verification
      phase2: [] as string[],  // Enhancement
      phase3: [] as string[]   // Deep analysis
    };
    
    // Phase 1: Critical verification
    if (!lead.emailVerified) plan.phase1.push('email-verification');
    if (!lead.phoneVerified) plan.phase1.push('phone-verification');
    
    // Phase 2: Enhancement based on priority
    if (priority === 'high' || priority === 'medium') {
      if (!lead.websiteUrl) plan.phase2.push('company-enrichment');
      if (!lead.annualRevenue) plan.phase2.push('revenue-estimation');
      if (!lead.linkedinUrl) plan.phase2.push('social-enrichment');
    }
    
    // Phase 3: Deep analysis for high priority only
    if (priority === 'high') {
      if (lead.stateCode === 'CA') plan.phase3.push('california-mca-analysis');
      plan.phase3.push('ucc-filing-analysis');
      plan.phase3.push('predictive-scoring');
    }
    
    return plan;
  }
  
  private estimateCost(plan: { phase1: string[]; phase2: string[]; phase3: string[] }): number {
    const costs: Record<string, number> = {
      'email-verification': 0.01,
      'phone-verification': 0.02,
      'company-enrichment': 0.05,
      'revenue-estimation': 0.03,
      'social-enrichment': 0.02,
      'california-mca-analysis': 0.10,
      'ucc-filing-analysis': 0.08,
      'predictive-scoring': 0.04
    };
    
    let total = 0;
    for (const service of [...plan.phase1, ...plan.phase2, ...plan.phase3]) {
      total += costs[service] || 0.05;
    }
    
    return total;
  }
  
  private estimateTime(plan: { phase1: string[]; phase2: string[]; phase3: string[] }): number {
    const times: Record<string, number> = {
      'email-verification': 2,
      'phone-verification': 3,
      'company-enrichment': 5,
      'revenue-estimation': 4,
      'social-enrichment': 3,
      'california-mca-analysis': 10,
      'ucc-filing-analysis': 8,
      'predictive-scoring': 5
    };
    
    let total = 0;
    for (const service of [...plan.phase1, ...plan.phase2, ...plan.phase3]) {
      total += times[service] || 5;
    }
    
    return total;
  }
  
  private calculateExpectedQualityGain(
    completeness: { score: number },
    plan: { phase1: string[]; phase2: string[]; phase3: string[] }
  ): number {
    const totalServices = plan.phase1.length + plan.phase2.length + plan.phase3.length;
    const maxGain = 100 - completeness.score;
    const gainPerService = maxGain / 10; // Assume max 10 services needed for 100%
    
    return Math.min(totalServices * gainPerService, maxGain);
  }
  
  private identifyCostOptimizations(strategies: EnrichmentStrategy[]): string[] {
    const optimizations: string[] = [];
    
    // Batch processing optimization
    const batchableLeads = strategies.filter(s => s.priority === 'medium' || s.priority === 'low');
    if (batchableLeads.length > 10) {
      optimizations.push(`Batch process ${batchableLeads.length} leads for 20% cost savings`);
    }
    
    // Skip already enriched
    const skipCount = strategies.filter(s => s.priority === 'skip').length;
    if (skipCount > 0) {
      optimizations.push(`Skip ${skipCount} already-complete leads, saving $${(skipCount * 0.1).toFixed(2)}`);
    }
    
    // Tiered enrichment
    const highPriorityCount = strategies.filter(s => s.priority === 'high').length;
    if (highPriorityCount < strategies.length * 0.2) {
      optimizations.push('Use tiered enrichment - full enrichment for top 20%, basic for others');
    }
    
    // Cache utilization
    optimizations.push('Leverage cached data from previous enrichments');
    
    return optimizations;
  }
}

// Export singleton instance
export const aiDecisionEngine = new AIDecisionEngine();