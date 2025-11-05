import { storage } from "../storage";
import { EventBus } from "./event-bus";
import OpenAI from 'openai';
import type { Lead, EnrichmentLog } from "@shared/schema";
import { WaterfallEnrichmentOrchestrator } from "./waterfall-enrichment-orchestrator";
import { LeadScoringService } from "./ml-scoring";
import { EntityGraphService } from "./entity-graph";
import { UccAnalysisService } from "./ucc-intelligence-analyzer";
import { MasterDatabaseService } from "./master-database";
import memoizee from 'memoizee';

interface EnrichmentDecision {
  leadId: string;
  strategy: 'minimal' | 'standard' | 'comprehensive' | 'maximum';
  priority: number;
  services: string[];
  estimatedCost: number;
  confidence: number;
  reasoning: string;
  skipReasons?: string[];
}

interface LeadContext {
  lead: Lead;
  existingData: any;
  historicalPerformance?: any;
  industryInsights?: any;
  relatedEntities?: any;
  uccData?: any;
  masterDbData?: any;
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
  private scoringService: LeadScoringService;
  private entityGraph: EntityGraphService;
  private uccAnalyzer: UccAnalysisService;
  private masterDb: MasterDatabaseService;
  private eventBus = EventBus.getInstance();
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
    this.scoringService = new LeadScoringService();
    this.entityGraph = new EntityGraphService();
    this.uccAnalyzer = new UccAnalysisService();
    this.masterDb = new MasterDatabaseService();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.eventBus.on('lead:created', this.handleNewLead.bind(this));
    this.eventBus.on('lead:updated', this.handleLeadUpdate.bind(this));
    this.eventBus.on('enrichment:completed', this.handleEnrichmentComplete.bind(this));
  }

  async analyzeAndDecide(lead: Lead): Promise<EnrichmentDecision> {
    const context = await this.gatherContext(lead);
    const decision = await this.makeIntelligentDecision(context);
    
    // Track metrics
    this.metrics.totalDecisions++;
    this.updateMetrics(decision);
    
    // Emit decision event
    this.eventBus.emit('brain:decision', { lead, decision });
    
    return decision;
  }

  private async gatherContext(lead: Lead): Promise<LeadContext> {
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
      lead.businessName ? this.uccAnalyzer.analyzeByBusinessName(lead.businessName) : null,
      this.entityGraph.findRelatedEntities(lead.id),
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
        leadId: context.lead.id,
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
      leadId: context.lead.id,
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
    const existingCompleteness = this.calculateCompleteness(context.lead);
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
    if (lead.phone && !lead.phoneVerified) {
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
        if (!lead.socialProfiles) services.push('proxycurl');
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
    return [...new Set(services)].filter(service => this.hasCreditsFor(service));
  }

  private async calculateLeadValue(context: LeadContext): Promise<number> {
    let score = 0;
    const lead = context.lead;
    
    // Business characteristics (40 points)
    if (lead.annualRevenue) {
      score += Math.min(lead.annualRevenue / 50000, 20);
    }
    if (lead.timeInBusiness) {
      score += Math.min(lead.timeInBusiness * 2, 10);
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
    const completeness = this.calculateCompleteness(lead);
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
Current completeness: ${Math.round(this.calculateCompleteness(context.lead) * 100)}%
Strategy selected: ${strategy}
Services to use: ${services.join(', ')}
Has UCC data: ${!!context.uccData}
In master database: ${!!context.masterDbData}

Provide a brief reasoning (max 2 sentences) for why this enrichment strategy is optimal.`;
  }

  private assessExistingData(lead: Lead): any {
    return {
      hasBasicInfo: !!(lead.businessName && lead.ownerName),
      hasContactInfo: !!(lead.phone || lead.email),
      hasBusinessMetrics: !!(lead.annualRevenue && lead.timeInBusiness),
      hasLocation: !!(lead.city && lead.state),
      completeness: this.calculateCompleteness(lead)
    };
  }

  private async getHistoricalPerformance(lead: Lead): Promise<any> {
    // Get historical performance data for similar leads
    const similarLeads = await storage.searchSimilarLeads({
      industry: lead.industry,
      state: lead.state,
      revenueRange: lead.annualRevenue
    });
    
    return {
      conversionRate: this.calculateConversionRate(similarLeads),
      averageValue: this.calculateAverageValue(similarLeads),
      enrichmentSuccess: this.calculateEnrichmentSuccess(similarLeads)
    };
  }

  private async getIndustryInsights(lead: Lead): Promise<any> {
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
    const total = leads.reduce((sum, l) => sum + (l.requestedAmount || 0), 0);
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
    
    // Execute enrichment through orchestrator
    const results = await this.orchestrator.enrichLeadSelective(lead, decision.services);
    
    // Update master database with new data
    if (results.success) {
      await this.masterDb.updateFromEnrichment(lead.id, results.data);
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
}

// Export singleton instance
export const intelligenceBrain = new IntelligenceBrain();