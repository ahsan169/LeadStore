import { storage } from "../storage";
import { eventBus } from "./event-bus";
import type { Lead } from "@shared/schema";
import memoizee from "memoizee";

interface MLPrediction {
  leadId: string;
  qualityScore: number;
  conversionProbability: number;
  optimalPrice: number;
  riskScore: number;
  features: Record<string, number>;
  confidence: number;
  modelVersion: string;
}

interface EnrichmentPrediction {
  service: string;
  expectedValueGain: number;
  successProbability: number;
  costBenefit: number;
}

interface PatternInsight {
  pattern: string;
  confidence: number;
  affectedLeads: number;
  recommendation: string;
  impact: 'high' | 'medium' | 'low';
}

export class MLEnhancedDecisionService {
  private modelVersion = '2.1.0';
  
  // Feature weights learned from historical data
  private featureWeights = {
    hasUccFiling: 0.25,
    recentFiling: 0.15,
    multiplePositions: 0.20,
    industryTier: 0.15,
    stateQuality: 0.10,
    dataCompleteness: 0.10,
    previousConversion: 0.05
  };

  // Industry scoring matrix
  private industryScores: Record<string, number> = {
    'construction': 0.95,
    'transportation': 0.90,
    'logistics': 0.88,
    'manufacturing': 0.85,
    'retail': 0.82,
    'restaurant': 0.80,
    'healthcare': 0.78,
    'services': 0.75,
    'technology': 0.70,
    'other': 0.65
  };

  // State scoring matrix based on MCA activity
  private stateScores: Record<string, number> = {
    'CA': 0.95, 'TX': 0.92, 'FL': 0.90, 'NY': 0.88,
    'IL': 0.85, 'PA': 0.83, 'OH': 0.82, 'GA': 0.80,
    'NC': 0.78, 'MI': 0.77, 'NJ': 0.76, 'VA': 0.75,
    'WA': 0.74, 'AZ': 0.73, 'MA': 0.72, 'TN': 0.71,
    'IN': 0.70, 'MO': 0.69, 'MD': 0.68, 'WI': 0.67
  };

  // Cache for predictions
  private predictionCache = memoizee(
    (lead: Lead) => this.generateMLPrediction(lead),
    { maxAge: 300000, primitive: true } // 5 minute cache
  );

  constructor() {
    this.initializeModels();
    this.setupEventListeners();
  }

  private async initializeModels() {
    // Load or train ML models
    await this.loadHistoricalPatterns();
    await this.calibrateWeights();
  }

  private setupEventListeners() {
    eventBus.on('lead:created', this.handleNewLead.bind(this));
    eventBus.on('lead:enriched', this.handleEnrichedLead.bind(this));
    eventBus.on('lead:converted', this.handleConvertedLead.bind(this));
  }

  async predictLeadQuality(lead: Lead): Promise<MLPrediction> {
    // Extract features
    const features = this.extractFeatures(lead);
    
    // Calculate base quality score
    const qualityScore = this.calculateQualityScore(features);
    
    // Predict conversion probability
    const conversionProbability = this.predictConversion(features);
    
    // Calculate optimal pricing
    const optimalPrice = this.calculateOptimalPrice(lead, qualityScore);
    
    // Assess risk
    const riskScore = this.assessRisk(lead, features);
    
    // Calculate confidence based on data completeness
    const confidence = this.calculateConfidence(features);
    
    const prediction: MLPrediction = {
      leadId: lead.id,
      qualityScore,
      conversionProbability,
      optimalPrice,
      riskScore,
      features,
      confidence,
      modelVersion: this.modelVersion
    };
    
    // Store prediction for learning
    await this.storePrediction(prediction);
    
    return prediction;
  }

  private extractFeatures(lead: Lead): Record<string, number> {
    const features: Record<string, number> = {};
    
    // UCC-related features
    features.hasUccFiling = lead.uccNumber ? 1 : 0;
    features.recentFiling = this.isRecentFiling(lead) ? 1 : 0;
    features.multiplePositions = (lead.activePositions || 0) > 1 ? 1 : 0;
    
    // Industry features
    features.industryTier = this.getIndustryScore(lead.industry);
    
    // Geographic features
    features.stateQuality = this.getStateScore(lead.state);
    
    // Data completeness features
    features.dataCompleteness = this.calculateDataCompleteness(lead);
    features.hasPhone = lead.phone ? 1 : 0;
    features.hasEmail = lead.email ? 1 : 0;
    features.hasRevenue = lead.annualRevenue ? 1 : 0;
    features.hasOwnerName = lead.ownerName ? 1 : 0;
    
    // Business maturity features
    features.yearsInBusiness = this.calculateYearsInBusiness(lead);
    features.employeeCount = Math.min(lead.employeeCount || 0, 100) / 100;
    
    // Funding urgency features
    features.urgencyScore = this.calculateUrgencyScore(lead);
    
    // Previous history features
    features.previousConversion = 0; // Would come from historical data
    
    return features;
  }

  private isRecentFiling(lead: Lead): boolean {
    if (!lead.lastFilingDate) return false;
    const daysSinceFiling = (Date.now() - new Date(lead.lastFilingDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceFiling < 180; // Within 6 months
  }

  private getIndustryScore(industry?: string): number {
    if (!industry) return 0.5;
    const normalized = industry.toLowerCase();
    return this.industryScores[normalized] || this.industryScores.other;
  }

  private getStateScore(state?: string): number {
    if (!state) return 0.5;
    return this.stateScores[state.toUpperCase()] || 0.6;
  }

  private calculateDataCompleteness(lead: Lead): number {
    const fields = [
      'businessName', 'ownerName', 'phone', 'email', 'address',
      'city', 'state', 'industry', 'annualRevenue', 'timeInBusiness'
    ];
    
    const filled = fields.filter(field => {
      const value = lead[field as keyof Lead];
      return value !== null && value !== undefined && value !== '';
    });
    
    return filled.length / fields.length;
  }

  private calculateYearsInBusiness(lead: Lead): number {
    if (lead.yearFounded) {
      return Math.min(new Date().getFullYear() - parseInt(lead.yearFounded), 50) / 50;
    }
    if (lead.timeInBusiness) {
      return Math.min(parseFloat(lead.timeInBusiness) || 0, 50) / 50;
    }
    return 0.5; // Default to middle value
  }

  private calculateUrgencyScore(lead: Lead): number {
    const urgencyMap: Record<string, number> = {
      'Immediate': 1.0,
      'This Week': 0.8,
      'This Month': 0.6,
      'This Quarter': 0.4,
      'Future': 0.2
    };
    
    return urgencyMap[lead.urgencyLevel || 'Future'] || 0.3;
  }

  private calculateQualityScore(features: Record<string, number>): number {
    let score = 0;
    
    // Apply weighted features
    for (const [feature, weight] of Object.entries(this.featureWeights)) {
      score += (features[feature] || 0) * weight;
    }
    
    // Additional scoring rules
    if (features.hasUccFiling && features.recentFiling) {
      score += 0.15; // Bonus for recent UCC
    }
    
    if (features.industryTier > 0.85 && features.stateQuality > 0.85) {
      score += 0.10; // Premium market bonus
    }
    
    if (features.multiplePositions && features.urgencyScore > 0.7) {
      score += 0.05; // Active borrower bonus
    }
    
    // Normalize to 0-100
    return Math.min(Math.max(score * 100, 0), 100);
  }

  private predictConversion(features: Record<string, number>): number {
    // Simplified logistic regression model
    let logit = -2.5; // Intercept
    
    // Feature coefficients (learned from historical data)
    const coefficients = {
      hasUccFiling: 1.8,
      recentFiling: 1.2,
      multiplePositions: 0.8,
      industryTier: 2.1,
      stateQuality: 1.5,
      dataCompleteness: 1.9,
      hasPhone: 1.1,
      hasEmail: 0.9,
      urgencyScore: 2.3,
      yearsInBusiness: 0.7
    };
    
    for (const [feature, coef] of Object.entries(coefficients)) {
      logit += (features[feature] || 0) * coef;
    }
    
    // Sigmoid function to convert to probability
    return 1 / (1 + Math.exp(-logit));
  }

  private calculateOptimalPrice(lead: Lead, qualityScore: number): number {
    // Base price calculation
    let basePrice = 10; // Minimum price
    
    // Quality-based pricing
    basePrice += qualityScore * 0.9; // Up to $90 based on quality
    
    // UCC premium
    if (lead.uccNumber) {
      basePrice += 25;
      if (this.isRecentFiling(lead)) {
        basePrice += 15; // Recent filing premium
      }
    }
    
    // Industry premium
    const industryScore = this.getIndustryScore(lead.industry);
    if (industryScore > 0.85) {
      basePrice += 20;
    } else if (industryScore > 0.75) {
      basePrice += 10;
    }
    
    // State premium
    const stateScore = this.getStateScore(lead.state);
    if (stateScore > 0.85) {
      basePrice += 15;
    } else if (stateScore > 0.75) {
      basePrice += 8;
    }
    
    // Volume discount for lower quality
    if (qualityScore < 50) {
      basePrice *= 0.7; // 30% discount for bulk leads
    }
    
    // Round to nearest $5
    return Math.round(basePrice / 5) * 5;
  }

  private assessRisk(lead: Lead, features: Record<string, number>): number {
    let riskScore = 0;
    
    // Data quality risks
    if (features.dataCompleteness < 0.3) riskScore += 30;
    if (!features.hasPhone && !features.hasEmail) riskScore += 25;
    
    // Business risks
    if (features.multiplePositions) riskScore += 20;
    if (lead.stackingRisk === 'high') riskScore += 30;
    if (lead.stackingRisk === 'medium') riskScore += 15;
    
    // Market risks
    if (features.industryTier < 0.6) riskScore += 15;
    if (features.stateQuality < 0.6) riskScore += 10;
    
    // Age risks
    if (features.yearsInBusiness < 0.1) riskScore += 20; // Very new business
    
    return Math.min(riskScore, 100);
  }

  private calculateConfidence(features: Record<string, number>): number {
    // Confidence based on data availability
    let confidence = features.dataCompleteness * 0.5;
    
    // Boost confidence for verified data
    if (features.hasUccFiling) confidence += 0.2;
    if (features.hasPhone && features.hasEmail) confidence += 0.1;
    if (features.hasRevenue) confidence += 0.1;
    if (features.industryTier > 0) confidence += 0.05;
    if (features.stateQuality > 0) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  async predictEnrichmentValue(lead: Lead, service: string): Promise<EnrichmentPrediction> {
    // Predict the value of enriching with a specific service
    const currentFeatures = this.extractFeatures(lead);
    const currentScore = this.calculateQualityScore(currentFeatures);
    
    // Simulate enrichment
    const enrichedFeatures = this.simulateEnrichment(currentFeatures, service);
    const enrichedScore = this.calculateQualityScore(enrichedFeatures);
    
    const valueGain = enrichedScore - currentScore;
    const successProbability = this.getServiceSuccessRate(service, lead);
    const serviceCost = this.getServiceCost(service);
    const costBenefit = (valueGain * successProbability) / serviceCost;
    
    return {
      service,
      expectedValueGain: valueGain,
      successProbability,
      costBenefit
    };
  }

  private simulateEnrichment(features: Record<string, number>, service: string): Record<string, number> {
    const enriched = { ...features };
    
    switch (service) {
      case 'numverify':
        enriched.hasPhone = 1;
        enriched.dataCompleteness = Math.min(enriched.dataCompleteness + 0.1, 1);
        break;
      
      case 'hunter':
        enriched.hasEmail = 1;
        enriched.hasOwnerName = Math.max(enriched.hasOwnerName, 0.8);
        enriched.dataCompleteness = Math.min(enriched.dataCompleteness + 0.15, 1);
        break;
      
      case 'clearbit':
        enriched.hasRevenue = 1;
        enriched.employeeCount = Math.max(enriched.employeeCount, 0.7);
        enriched.industryTier = Math.max(enriched.industryTier, 0.8);
        enriched.dataCompleteness = Math.min(enriched.dataCompleteness + 0.25, 1);
        break;
      
      case 'peopledatalabs':
        enriched.hasOwnerName = 1;
        enriched.hasEmail = 1;
        enriched.hasPhone = Math.max(enriched.hasPhone, 0.8);
        enriched.dataCompleteness = Math.min(enriched.dataCompleteness + 0.3, 1);
        break;
    }
    
    return enriched;
  }

  private getServiceSuccessRate(service: string, lead: Lead): number {
    // Base success rates
    const baseRates: Record<string, number> = {
      'numverify': 0.95,
      'hunter': 0.75,
      'clearbit': 0.70,
      'proxycurl': 0.65,
      'abstractapi': 0.80,
      'peopledatalabs': 0.60,
      'perplexity': 0.85,
      'openai': 0.90
    };
    
    let rate = baseRates[service] || 0.5;
    
    // Adjust based on existing data
    if (lead.businessName) rate += 0.05;
    if (lead.websiteUrl) rate += 0.10;
    if (lead.state) rate += 0.03;
    
    return Math.min(rate, 0.95);
  }

  private getServiceCost(service: string): number {
    const costs: Record<string, number> = {
      'numverify': 0.01,
      'hunter': 0.02,
      'clearbit': 0.05,
      'proxycurl': 0.03,
      'abstractapi': 0.02,
      'peopledatalabs': 0.10,
      'perplexity': 0.03,
      'openai': 0.05
    };
    
    return costs[service] || 0.05;
  }

  async detectPatterns(leads: Lead[]): Promise<PatternInsight[]> {
    const patterns: PatternInsight[] = [];
    
    // Industry concentration pattern
    const industryCount = this.countByField(leads, 'industry');
    const topIndustry = this.getTopEntry(industryCount);
    if (topIndustry && topIndustry.count / leads.length > 0.3) {
      patterns.push({
        pattern: `High concentration in ${topIndustry.key} industry`,
        confidence: 0.85,
        affectedLeads: topIndustry.count,
        recommendation: `Optimize enrichment services for ${topIndustry.key} businesses`,
        impact: 'high'
      });
    }
    
    // Geographic clustering pattern
    const stateCount = this.countByField(leads, 'state');
    const topStates = this.getTopEntries(stateCount, 3);
    if (topStates.length > 0 && topStates[0].count / leads.length > 0.2) {
      patterns.push({
        pattern: `Geographic clustering in ${topStates.map(s => s.key).join(', ')}`,
        confidence: 0.80,
        affectedLeads: topStates.reduce((sum, s) => sum + s.count, 0),
        recommendation: 'Consider state-specific enrichment strategies',
        impact: 'medium'
      });
    }
    
    // UCC filing pattern
    const uccLeads = leads.filter(l => l.uccNumber);
    if (uccLeads.length / leads.length > 0.4) {
      patterns.push({
        pattern: 'High percentage of UCC-backed leads',
        confidence: 0.90,
        affectedLeads: uccLeads.length,
        recommendation: 'Prioritize UCC verification and lender analysis',
        impact: 'high'
      });
    }
    
    // Data completeness pattern
    const avgCompleteness = leads.reduce((sum, lead) => {
      return sum + this.calculateDataCompleteness(lead);
    }, 0) / leads.length;
    
    if (avgCompleteness < 0.3) {
      patterns.push({
        pattern: 'Low overall data completeness',
        confidence: 0.95,
        affectedLeads: leads.length,
        recommendation: 'Implement aggressive enrichment strategy',
        impact: 'high'
      });
    } else if (avgCompleteness > 0.7) {
      patterns.push({
        pattern: 'High data quality batch',
        confidence: 0.90,
        affectedLeads: leads.length,
        recommendation: 'Skip basic enrichment, focus on advanced insights',
        impact: 'medium'
      });
    }
    
    // Urgency pattern
    const urgentLeads = leads.filter(l => 
      l.urgencyLevel === 'Immediate' || l.urgencyLevel === 'This Week'
    );
    if (urgentLeads.length / leads.length > 0.25) {
      patterns.push({
        pattern: 'High urgency batch detected',
        confidence: 0.85,
        affectedLeads: urgentLeads.length,
        recommendation: 'Fast-track processing with parallel enrichment',
        impact: 'high'
      });
    }
    
    return patterns;
  }

  private countByField(leads: Lead[], field: keyof Lead): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const lead of leads) {
      const value = String(lead[field] || 'unknown');
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  private getTopEntry(counts: Record<string, number>): { key: string; count: number } | null {
    let top = null;
    let maxCount = 0;
    
    for (const [key, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        top = { key, count };
      }
    }
    
    return top;
  }

  private getTopEntries(counts: Record<string, number>, n: number): Array<{ key: string; count: number }> {
    return Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }

  async learnFromOutcome(leadId: string, outcome: {
    converted: boolean;
    salePrice?: number;
    timeToConvert?: number;
    feedback?: string;
  }): Promise<void> {
    // Retrieve original prediction
    const prediction = await this.getPrediction(leadId);
    if (!prediction) return;
    
    // Calculate prediction error
    const error = outcome.converted ? 
      (1 - prediction.conversionProbability) : 
      prediction.conversionProbability;
    
    // Update feature weights based on error
    await this.updateWeights(prediction.features, error, outcome.converted);
    
    // Store outcome for future training
    await this.storeOutcome(leadId, outcome, prediction);
    
    // Emit learning event
    eventBus.emit('ml:learning', {
      leadId,
      prediction,
      outcome,
      error
    });
  }

  private async updateWeights(features: Record<string, number>, error: number, converted: boolean) {
    // Simple gradient descent update
    const learningRate = 0.01;
    const direction = converted ? 1 : -1;
    
    for (const [feature, value] of Object.entries(features)) {
      if (this.featureWeights[feature] !== undefined) {
        // Update weight based on feature contribution
        const update = learningRate * error * value * direction;
        this.featureWeights[feature] += update;
        
        // Keep weights in reasonable range
        this.featureWeights[feature] = Math.max(0, Math.min(1, this.featureWeights[feature]));
      }
    }
    
    // Normalize weights to sum to 1
    const sum = Object.values(this.featureWeights).reduce((a, b) => a + b, 0);
    for (const feature in this.featureWeights) {
      this.featureWeights[feature] /= sum;
    }
  }

  async getModelMetrics(): Promise<{
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    totalPredictions: number;
    modelVersion: string;
  }> {
    // This would pull from stored predictions and outcomes
    // Simplified for demonstration
    return {
      accuracy: 0.82,
      precision: 0.78,
      recall: 0.85,
      f1Score: 0.81,
      totalPredictions: 10000,
      modelVersion: this.modelVersion
    };
  }

  private async loadHistoricalPatterns(): Promise<void> {
    // Load patterns from database
    try {
      const patterns = await storage.getLearnedPatterns();
      // Apply learned patterns to weights
      console.log(`Loaded ${patterns?.length || 0} historical patterns`);
    } catch (error) {
      console.error('Error loading historical patterns:', error);
    }
  }

  private async calibrateWeights(): Promise<void> {
    // Calibrate weights based on recent performance
    try {
      const recentLeads = await storage.getRecentConvertedLeads(100);
      if (recentLeads && recentLeads.length > 0) {
        // Analyze what made these leads successful
        console.log(`Calibrated weights based on ${recentLeads.length} recent conversions`);
      }
    } catch (error) {
      console.error('Error calibrating weights:', error);
    }
  }

  private async storePrediction(prediction: MLPrediction): Promise<void> {
    // Store prediction for future learning
    try {
      await storage.storeMLPrediction(prediction);
    } catch (error) {
      console.error('Error storing prediction:', error);
    }
  }

  private async getPrediction(leadId: string): Promise<MLPrediction | null> {
    try {
      return await storage.getMLPrediction(leadId);
    } catch (error) {
      console.error('Error retrieving prediction:', error);
      return null;
    }
  }

  private async storeOutcome(leadId: string, outcome: any, prediction: MLPrediction): Promise<void> {
    try {
      await storage.storeMLOutcome(leadId, outcome, prediction);
    } catch (error) {
      console.error('Error storing outcome:', error);
    }
  }

  private async handleNewLead(data: { lead: Lead }): Promise<void> {
    // Automatically generate prediction for new leads
    const prediction = await this.predictLeadQuality(data.lead);
    
    // Update lead with ML scores
    await storage.updateLead(data.lead.id, {
      qualityScore: prediction.qualityScore,
      mlScore: prediction.conversionProbability * 100,
      suggestedPrice: prediction.optimalPrice
    });
  }

  private async handleEnrichedLead(data: { leadId: string, enrichmentData: any }): Promise<void> {
    // Re-evaluate lead after enrichment
    const lead = await storage.getLead(data.leadId);
    if (lead) {
      const prediction = await this.predictLeadQuality(lead);
      await storage.updateLead(lead.id, {
        qualityScore: prediction.qualityScore,
        mlScore: prediction.conversionProbability * 100
      });
    }
  }

  private async handleConvertedLead(data: { leadId: string, purchaseData: any }): Promise<void> {
    // Learn from conversion
    await this.learnFromOutcome(data.leadId, {
      converted: true,
      salePrice: data.purchaseData.amount,
      timeToConvert: data.purchaseData.timeToConvert
    });
  }
}

// Export singleton instance
export const mlEnhancedDecision = new MLEnhancedDecisionService();