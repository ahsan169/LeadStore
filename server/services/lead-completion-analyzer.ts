import { Lead, InsertLead } from "@shared/schema";
import { ComprehensiveLeadEnricher, EnrichmentResult } from "./comprehensive-lead-enricher";

// Field importance weights for prioritization (0-1 scale)
const FIELD_IMPORTANCE = {
  businessName: 1.0,      // Critical - must have
  ownerName: 0.95,        // Very important for contact
  email: 0.9,             // Critical for communication
  phone: 0.85,            // Important for contact
  secondaryPhone: 0.3,    // Nice to have backup
  industry: 0.7,          // Important for targeting
  annualRevenue: 0.8,     // Critical for qualification
  estimatedRevenue: 0.75, // Good alternative to actual revenue
  requestedAmount: 0.6,   // Useful for deal sizing
  timeInBusiness: 0.65,   // Important for risk assessment
  yearsInBusiness: 0.65,  // Alternative to timeInBusiness
  creditScore: 0.7,       // Important for qualification
  websiteUrl: 0.6,        // Useful for research
  linkedinUrl: 0.4,       // Nice for additional research
  companySize: 0.5,       // Helpful for targeting
  employeeCount: 0.5,     // Alternative to company size
  yearFounded: 0.4,       // Useful context
  naicsCode: 0.3,         // Technical classification
  stateCode: 0.6,         // Important for location
  city: 0.5,              // Useful for location
  fullAddress: 0.55,      // Complete location info
  
  // UCC-specific fields
  uccNumber: 0.4,         // Useful for financing history
  filingDate: 0.35,       // Historical context
  securedParties: 0.45,   // Current obligations
  
  // Enrichment confidence tracking
  revenueConfidence: 0.3, // Metadata field
  enrichmentConfidence: 0.2, // Tracking field
};

export interface FieldAnalysis {
  field: string;
  hasValue: boolean;
  importance: number;
  currentValue?: any;
  isEmpty: boolean;
  canBeEnriched: boolean;
  enrichmentStrategy?: string;
}

export interface CompletionAnalysis {
  leadId?: string;
  completionScore: number; // 0-100
  dataQualityScore: number; // 0-100
  missingFields: FieldAnalysis[];
  presentFields: FieldAnalysis[];
  enrichmentPriority: 'high' | 'medium' | 'low' | 'none';
  enrichmentStrategies: EnrichmentStrategy[];
  estimatedEnrichmentTime: number; // seconds
  recommendedActions: string[];
  canBeAutoEnriched: boolean;
  enrichmentConfidence: number; // 0-100 estimated success rate
}

export interface EnrichmentStrategy {
  priority: number;
  strategyName: string;
  description: string;
  requiredFields: string[];
  targetFields: string[];
  estimatedSuccessRate: number; // 0-100
  estimatedDuration: number; // seconds
  apiSources: string[];
}

export class LeadCompletionAnalyzer {
  private enricher: ComprehensiveLeadEnricher;
  
  constructor() {
    this.enricher = new ComprehensiveLeadEnricher();
  }
  
  /**
   * Analyze a lead to determine its completion status and enrichment needs
   */
  analyzeLeadCompletion(lead: Partial<Lead | InsertLead>): CompletionAnalysis {
    const startTime = Date.now();
    
    // Analyze each field
    const fieldAnalyses: FieldAnalysis[] = [];
    let totalImportance = 0;
    let completedImportance = 0;
    
    for (const [field, importance] of Object.entries(FIELD_IMPORTANCE)) {
      const value = lead[field as keyof typeof lead];
      const hasValue = this.hasValidValue(value);
      const isEmpty = !hasValue;
      
      const analysis: FieldAnalysis = {
        field,
        hasValue,
        importance,
        currentValue: value,
        isEmpty,
        canBeEnriched: this.canFieldBeEnriched(field, lead)
      };
      
      // Add enrichment strategy hint
      if (isEmpty && analysis.canBeEnriched) {
        analysis.enrichmentStrategy = this.getFieldEnrichmentHint(field, lead);
      }
      
      fieldAnalyses.push(analysis);
      totalImportance += importance;
      if (hasValue) {
        completedImportance += importance;
      }
    }
    
    // Calculate completion score (weighted by importance)
    const completionScore = Math.round((completedImportance / totalImportance) * 100);
    
    // Separate missing and present fields
    const missingFields = fieldAnalyses
      .filter(f => f.isEmpty)
      .sort((a, b) => b.importance - a.importance); // Sort by importance
    
    const presentFields = fieldAnalyses
      .filter(f => !f.isEmpty);
    
    // Calculate data quality score based on critical fields
    const dataQualityScore = this.calculateDataQualityScore(lead, presentFields);
    
    // Determine enrichment priority
    const enrichmentPriority = this.determineEnrichmentPriority(completionScore, missingFields);
    
    // Generate enrichment strategies
    const enrichmentStrategies = this.generateEnrichmentStrategies(lead, missingFields, completionScore);
    
    // Estimate enrichment time and confidence
    const estimatedEnrichmentTime = enrichmentStrategies
      .reduce((sum, strategy) => sum + strategy.estimatedDuration, 0);
    
    const enrichmentConfidence = this.calculateEnrichmentConfidence(lead, enrichmentStrategies);
    
    // Generate recommended actions
    const recommendedActions = this.generateRecommendedActions(
      completionScore,
      missingFields,
      enrichmentStrategies
    );
    
    // Check if can be auto-enriched
    const canBeAutoEnriched = this.canAutoEnrich(lead, enrichmentStrategies);
    
    const analysis: CompletionAnalysis = {
      leadId: (lead as any).id,
      completionScore,
      dataQualityScore,
      missingFields,
      presentFields,
      enrichmentPriority,
      enrichmentStrategies,
      estimatedEnrichmentTime,
      recommendedActions,
      canBeAutoEnriched,
      enrichmentConfidence
    };
    
    const duration = Date.now() - startTime;
    console.log(`[LeadCompletionAnalyzer] Analysis completed in ${duration}ms for lead ${(lead as any).id || 'new'}`);
    
    return analysis;
  }
  
  /**
   * Check if a value is valid (not empty, null, undefined, or placeholder)
   */
  private hasValidValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '') return false;
      // Check for common placeholder values
      if (['n/a', 'na', 'none', 'unknown', 'not available', 'tbd', '-'].includes(trimmed)) {
        return false;
      }
    }
    if (typeof value === 'number' && value === 0) {
      return false; // Consider 0 as missing for numeric fields
    }
    return true;
  }
  
  /**
   * Determine if a field can be enriched based on available data
   */
  private canFieldBeEnriched(field: string, lead: Partial<Lead | InsertLead>): boolean {
    // Map fields to required data for enrichment
    const enrichmentRequirements: Record<string, string[]> = {
      ownerName: ['businessName', 'phone', 'email'],
      email: ['businessName', 'ownerName', 'websiteUrl'],
      phone: ['businessName', 'ownerName', 'city'],
      websiteUrl: ['businessName'],
      linkedinUrl: ['businessName', 'ownerName'],
      annualRevenue: ['businessName', 'websiteUrl'],
      estimatedRevenue: ['businessName', 'industry'],
      companySize: ['businessName', 'websiteUrl'],
      employeeCount: ['businessName', 'linkedinUrl'],
      industry: ['businessName', 'websiteUrl'],
      fullAddress: ['businessName', 'city', 'stateCode'],
      yearFounded: ['businessName'],
      socialProfiles: ['businessName', 'websiteUrl'],
    };
    
    const requirements = enrichmentRequirements[field];
    if (!requirements) return false;
    
    // Check if we have at least one required field
    return requirements.some(req => this.hasValidValue(lead[req as keyof typeof lead]));
  }
  
  /**
   * Get enrichment hint for a specific field
   */
  private getFieldEnrichmentHint(field: string, lead: Partial<Lead | InsertLead>): string {
    const hints: Record<string, string> = {
      ownerName: 'Search business registrations and LinkedIn',
      email: 'Use Hunter.io or extract from website',
      phone: 'Search business directories and verify with Numverify',
      websiteUrl: 'Search Google for business name',
      linkedinUrl: 'Search LinkedIn API',
      annualRevenue: 'Estimate from employee count and industry',
      estimatedRevenue: 'Use Perplexity to find financial data',
      companySize: 'Extract from LinkedIn or estimate',
      industry: 'Classify based on business name and website',
      fullAddress: 'Geocode partial address or search directories',
      yearFounded: 'Search business registrations',
    };
    
    return hints[field] || 'Use comprehensive enrichment';
  }
  
  /**
   * Calculate data quality score based on critical fields
   */
  private calculateDataQualityScore(lead: Partial<Lead | InsertLead>, presentFields: FieldAnalysis[]): number {
    let score = 0;
    const weights = {
      hasBusinessName: 20,
      hasOwnerName: 15,
      hasEmail: 15,
      hasPhone: 15,
      hasRevenue: 10,
      hasIndustry: 10,
      hasLocation: 10,
      hasWebsite: 5,
    };
    
    if (this.hasValidValue(lead.businessName)) score += weights.hasBusinessName;
    if (this.hasValidValue(lead.ownerName)) score += weights.hasOwnerName;
    if (this.hasValidValue(lead.email)) score += weights.hasEmail;
    if (this.hasValidValue(lead.phone)) score += weights.hasPhone;
    if (this.hasValidValue(lead.annualRevenue) || this.hasValidValue(lead.estimatedRevenue)) {
      score += weights.hasRevenue;
    }
    if (this.hasValidValue(lead.industry)) score += weights.hasIndustry;
    if (this.hasValidValue(lead.stateCode) && this.hasValidValue(lead.city)) {
      score += weights.hasLocation;
    }
    if (this.hasValidValue(lead.websiteUrl)) score += weights.hasWebsite;
    
    return Math.min(100, score);
  }
  
  /**
   * Determine enrichment priority based on completion and missing critical fields
   */
  private determineEnrichmentPriority(
    completionScore: number, 
    missingFields: FieldAnalysis[]
  ): 'high' | 'medium' | 'low' | 'none' {
    // Check for missing critical fields (importance > 0.8)
    const missingCritical = missingFields.filter(f => f.importance > 0.8);
    
    if (completionScore >= 95) return 'none';
    if (missingCritical.length > 0 || completionScore < 50) return 'high';
    if (completionScore < 70) return 'medium';
    return 'low';
  }
  
  /**
   * Generate enrichment strategies based on available data
   */
  private generateEnrichmentStrategies(
    lead: Partial<Lead | InsertLead>,
    missingFields: FieldAnalysis[],
    completionScore: number = 0
  ): EnrichmentStrategy[] {
    const strategies: EnrichmentStrategy[] = [];
    
    // Strategy 1: Business Name Only - Find everything else
    if (this.hasValidValue(lead.businessName) && !this.hasValidValue(lead.ownerName)) {
      strategies.push({
        priority: 1,
        strategyName: 'Business-First Discovery',
        description: 'Use business name to find owner, contact info, and company details',
        requiredFields: ['businessName'],
        targetFields: ['ownerName', 'email', 'phone', 'websiteUrl', 'industry', 'annualRevenue'],
        estimatedSuccessRate: 75,
        estimatedDuration: 15,
        apiSources: ['perplexity', 'hunter', 'numverify']
      });
    }
    
    // Strategy 2: Owner Name Only - Find business details
    if (this.hasValidValue(lead.ownerName) && !this.hasValidValue(lead.businessName)) {
      strategies.push({
        priority: 1,
        strategyName: 'Owner-First Discovery',
        description: 'Use owner name to find associated business and details',
        requiredFields: ['ownerName'],
        targetFields: ['businessName', 'email', 'phone', 'industry'],
        estimatedSuccessRate: 60,
        estimatedDuration: 20,
        apiSources: ['perplexity', 'linkedin']
      });
    }
    
    // Strategy 3: Phone Only - Reverse lookup
    if (this.hasValidValue(lead.phone) && !this.hasValidValue(lead.businessName)) {
      strategies.push({
        priority: 2,
        strategyName: 'Phone Reverse Lookup',
        description: 'Use phone number to find business and owner information',
        requiredFields: ['phone'],
        targetFields: ['businessName', 'ownerName', 'fullAddress'],
        estimatedSuccessRate: 65,
        estimatedDuration: 10,
        apiSources: ['numverify', 'perplexity']
      });
    }
    
    // Strategy 4: Email Domain Extraction
    if (this.hasValidValue(lead.email) && !this.hasValidValue(lead.websiteUrl)) {
      const domain = this.extractDomainFromEmail(lead.email as string);
      if (domain && !domain.includes('gmail') && !domain.includes('yahoo')) {
        strategies.push({
          priority: 3,
          strategyName: 'Email Domain Discovery',
          description: 'Extract company domain from email and enrich',
          requiredFields: ['email'],
          targetFields: ['websiteUrl', 'businessName', 'industry'],
          estimatedSuccessRate: 80,
          estimatedDuration: 5,
          apiSources: ['hunter', 'perplexity']
        });
      }
    }
    
    // Strategy 5: Partial Address Completion
    if ((this.hasValidValue(lead.city) || this.hasValidValue(lead.stateCode)) && 
        !this.hasValidValue(lead.fullAddress)) {
      strategies.push({
        priority: 4,
        strategyName: 'Address Completion',
        description: 'Complete partial address information',
        requiredFields: ['city', 'stateCode'],
        targetFields: ['fullAddress'],
        estimatedSuccessRate: 85,
        estimatedDuration: 3,
        apiSources: ['geocoding']
      });
    }
    
    // Strategy 6: Revenue Estimation
    if (this.hasValidValue(lead.businessName) && !this.hasValidValue(lead.annualRevenue)) {
      strategies.push({
        priority: 5,
        strategyName: 'Revenue Estimation',
        description: 'Estimate revenue based on industry and company size',
        requiredFields: ['businessName'],
        targetFields: ['estimatedRevenue', 'employeeCount', 'revenueConfidence'],
        estimatedSuccessRate: 70,
        estimatedDuration: 12,
        apiSources: ['perplexity', 'openai']
      });
    }
    
    // Strategy 7: Comprehensive enrichment for partially complete leads
    if (completionScore > 30 && completionScore < 80) {
      strategies.push({
        priority: 6,
        strategyName: 'Comprehensive Fill',
        description: 'Use all available data to fill remaining gaps',
        requiredFields: ['businessName', 'ownerName'],
        targetFields: missingFields.map(f => f.field),
        estimatedSuccessRate: 60,
        estimatedDuration: 25,
        apiSources: ['perplexity', 'hunter', 'numverify', 'openai']
      });
    }
    
    // Sort strategies by priority
    return strategies.sort((a, b) => a.priority - b.priority);
  }
  
  /**
   * Calculate enrichment confidence based on available data and strategies
   */
  private calculateEnrichmentConfidence(
    lead: Partial<Lead | InsertLead>,
    strategies: EnrichmentStrategy[]
  ): number {
    if (strategies.length === 0) return 0;
    
    // Base confidence on best strategy success rate
    const bestStrategy = strategies[0];
    let confidence = bestStrategy ? bestStrategy.estimatedSuccessRate : 0;
    
    // Adjust based on data quality
    if (this.hasValidValue(lead.businessName)) confidence += 10;
    if (this.hasValidValue(lead.ownerName)) confidence += 5;
    if (this.hasValidValue(lead.phone)) confidence += 5;
    if (this.hasValidValue(lead.email)) confidence += 5;
    
    // Cap at 95% (never 100% certain)
    return Math.min(95, confidence);
  }
  
  /**
   * Generate recommended actions based on analysis
   */
  private generateRecommendedActions(
    completionScore: number,
    missingFields: FieldAnalysis[],
    strategies: EnrichmentStrategy[]
  ): string[] {
    const actions: string[] = [];
    
    if (completionScore < 30) {
      actions.push('Critical: This lead requires immediate enrichment');
    }
    
    if (completionScore < 50) {
      actions.push('Schedule for priority enrichment queue');
    } else if (completionScore < 80) {
      actions.push('Add to standard enrichment queue');
    }
    
    // Suggest specific missing critical fields
    const criticalMissing = missingFields
      .filter(f => f.importance > 0.8)
      .map(f => f.field);
    
    if (criticalMissing.length > 0) {
      actions.push(`Priority: Enrich ${criticalMissing.join(', ')}`);
    }
    
    // Suggest best strategy
    if (strategies.length > 0) {
      const best = strategies[0];
      actions.push(`Recommended: ${best.strategyName} (${best.estimatedSuccessRate}% success rate)`);
    }
    
    // Data quality warnings
    if (!this.hasValidValue(missingFields.find(f => f.field === 'businessName'))) {
      actions.push('Warning: Missing business name will limit enrichment success');
    }
    
    if (completionScore > 90) {
      actions.push('Lead is well-enriched, consider manual review only');
    }
    
    return actions;
  }
  
  /**
   * Determine if lead can be auto-enriched
   */
  private canAutoEnrich(
    lead: Partial<Lead | InsertLead>,
    strategies: EnrichmentStrategy[]
  ): boolean {
    // Must have at least one strategy
    if (strategies.length === 0) return false;
    
    // Must have minimum required data (business name OR owner name OR phone)
    const hasMinimumData = 
      this.hasValidValue(lead.businessName) ||
      this.hasValidValue(lead.ownerName) ||
      this.hasValidValue(lead.phone);
    
    if (!hasMinimumData) return false;
    
    // Check if best strategy has good success rate
    const bestStrategy = strategies[0];
    return bestStrategy && bestStrategy.estimatedSuccessRate >= 60;
  }
  
  /**
   * Extract domain from email address
   */
  private extractDomainFromEmail(email: string): string | null {
    const match = email.match(/@(.+)$/);
    return match ? match[1] : null;
  }
  
  /**
   * Batch analyze multiple leads
   */
  async batchAnalyzeLeads(leads: Array<Partial<Lead | InsertLead>>): Promise<CompletionAnalysis[]> {
    console.log(`[LeadCompletionAnalyzer] Starting batch analysis for ${leads.length} leads`);
    
    const analyses = leads.map(lead => this.analyzeLeadCompletion(lead));
    
    // Generate summary statistics
    const avgCompletion = analyses.reduce((sum, a) => sum + a.completionScore, 0) / analyses.length;
    const needsEnrichment = analyses.filter(a => a.enrichmentPriority !== 'none').length;
    
    console.log(`[LeadCompletionAnalyzer] Batch analysis complete:`);
    console.log(`  - Average completion: ${avgCompletion.toFixed(1)}%`);
    console.log(`  - Needs enrichment: ${needsEnrichment}/${leads.length}`);
    console.log(`  - Can auto-enrich: ${analyses.filter(a => a.canBeAutoEnriched).length}`);
    
    return analyses;
  }
  
  /**
   * Get enrichment statistics for reporting
   */
  getEnrichmentStats(analyses: CompletionAnalysis[]): {
    avgCompletionScore: number;
    avgDataQualityScore: number;
    avgEnrichmentConfidence: number;
    totalEstimatedTime: number;
    priorityBreakdown: Record<string, number>;
    topMissingFields: Array<{ field: string; count: number; avgImportance: number }>;
    autoEnrichableCount: number;
    recommendedStrategies: Record<string, number>;
  } {
    const fieldMissingCounts = new Map<string, { count: number; totalImportance: number }>();
    const strategyCount = new Map<string, number>();
    const priorityCount = { high: 0, medium: 0, low: 0, none: 0 };
    
    let totalCompletion = 0;
    let totalQuality = 0;
    let totalConfidence = 0;
    let totalTime = 0;
    let autoEnrichable = 0;
    
    for (const analysis of analyses) {
      totalCompletion += analysis.completionScore;
      totalQuality += analysis.dataQualityScore;
      totalConfidence += analysis.enrichmentConfidence;
      totalTime += analysis.estimatedEnrichmentTime;
      
      if (analysis.canBeAutoEnriched) autoEnrichable++;
      
      priorityCount[analysis.enrichmentPriority]++;
      
      // Track missing fields
      for (const field of analysis.missingFields) {
        const current = fieldMissingCounts.get(field.field) || { count: 0, totalImportance: 0 };
        current.count++;
        current.totalImportance += field.importance;
        fieldMissingCounts.set(field.field, current);
      }
      
      // Track strategies
      for (const strategy of analysis.enrichmentStrategies) {
        strategyCount.set(
          strategy.strategyName, 
          (strategyCount.get(strategy.strategyName) || 0) + 1
        );
      }
    }
    
    // Calculate top missing fields
    const topMissingFields = Array.from(fieldMissingCounts.entries())
      .map(([field, data]) => ({
        field,
        count: data.count,
        avgImportance: data.totalImportance / data.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    const recommendedStrategies = Object.fromEntries(strategyCount.entries());
    
    return {
      avgCompletionScore: totalCompletion / analyses.length,
      avgDataQualityScore: totalQuality / analyses.length,
      avgEnrichmentConfidence: totalConfidence / analyses.length,
      totalEstimatedTime: totalTime,
      priorityBreakdown: priorityCount,
      topMissingFields,
      autoEnrichableCount: autoEnrichable,
      recommendedStrategies
    };
  }
}

// Export singleton instance
export const leadCompletionAnalyzer = new LeadCompletionAnalyzer();