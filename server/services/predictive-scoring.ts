import { db } from "../db";
import { leads, leadPredictions, leadPerformance, purchases, marketBenchmarks, uccFilings } from "@shared/schema";
import type { Lead, LeadPrediction, MarketBenchmark } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, avg, count } from "drizzle-orm";
import { MLScoringService } from "./ml-scoring";
import { marketInsightsService } from "./market-insights";
import { cacheManager } from "./cache-manager";

export interface TimeToClosePrediction {
  days: number;
  confidence: number;
  factors: {
    urgencyLevel: number;
    industryAverage: number;
    creditScoreImpact: number;
    seasonalAdjustment: number;
    competitionFactor: number;
  };
  range: {
    optimistic: number; // Best case scenario
    realistic: number;  // Most likely
    pessimistic: number; // Worst case scenario
  };
}

export interface DealSizePrediction {
  amount: number;
  confidence: number;
  range: {
    min: number;
    median: number;
    max: number;
  };
  factors: {
    requestedAmount: number;
    annualRevenue: number;
    industryNorm: number;
    creditAdjustment: number;
    timeInBusinessMultiplier: number;
  };
}

export interface SuccessProbabilityPrediction {
  probability: number; // 0-1
  fundingLikelihood: number; // 0-1
  defaultRisk: number; // 0-1
  factors: {
    businessHealth: number;
    marketConditions: number;
    competitiveLandscape: number;
    historicalPerformance: number;
    verificationScore: number;
  };
}

export interface ROIPrediction {
  expectedROI: number; // Percentage
  riskAdjustedROI: number; // Percentage
  paybackPeriod: number; // Days
  breakEvenPoint: number; // Days
  factors: {
    dealSize: number;
    successProbability: number;
    riskFactor: number;
    marketConditions: number;
  };
}

export interface LifecycleStagePrediction {
  currentStage: 'awareness' | 'consideration' | 'decision' | 'purchase' | 'retention';
  confidence: number;
  nextStageTransitionProbability: number;
  estimatedDaysToNextStage: number;
  indicators: string[];
}

export interface NextBestAction {
  action: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: number; // 0-100
  reasoning: string;
  timing: 'immediate' | 'within_24h' | 'within_week' | 'schedule';
  channel: 'phone' | 'email' | 'sms' | 'direct_mail' | 'automated';
}

export interface PredictiveInsight {
  leadId: string;
  timeToClose: TimeToClosePrediction;
  dealSize: DealSizePrediction;
  successProbability: SuccessProbabilityPrediction;
  roi: ROIPrediction;
  lifecycleStage: LifecycleStagePrediction;
  nextBestActions: NextBestAction[];
  marketTiming: 'early' | 'optimal' | 'late' | 'missed';
  competitivePosition: 'strong' | 'moderate' | 'weak';
  overallScore: number; // 0-100
  confidence: number; // Overall confidence in predictions
}

/**
 * Predictive Lead Scoring Engine
 * Provides forward-looking predictions and actionable insights for individual leads
 */
export class PredictiveScoringEngine {
  private mlScoringService: MLScoringService;
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 6; // 6 hours cache for predictions
  private marketInsightsCache: Map<string, { data: any; expiry: Date }> = new Map();
  
  // Industry benchmarks for predictions
  private readonly INDUSTRY_CLOSING_TIMES: Record<string, number> = {
    'technology': 14,
    'healthcare': 21,
    'finance': 10,
    'retail': 18,
    'restaurant': 25,
    'construction': 20,
    'manufacturing': 16,
    'professional services': 12,
    'default': 18
  };

  // Lifecycle stage thresholds
  private readonly LIFECYCLE_INDICATORS = {
    awareness: ['initial_inquiry', 'website_visit', 'lead_uploaded'],
    consideration: ['email_opened', 'qualification_complete', 'document_requested'],
    decision: ['proposal_sent', 'negotiation_started', 'references_checked'],
    purchase: ['contract_sent', 'funding_approved', 'paperwork_complete'],
    retention: ['funded', 'first_payment', 'renewal_opportunity']
  };

  constructor() {
    this.mlScoringService = new MLScoringService();
  }

  /**
   * Generate comprehensive predictions for a lead with caching
   */
  async generatePredictions(lead: Lead, forceRefresh: boolean = false): Promise<PredictiveInsight> {
    // Check for cached prediction first
    if (!forceRefresh) {
      const cachedPrediction = await this.getCachedPrediction(lead.id);
      if (cachedPrediction) {
        console.log(`[PredictiveScoring] Returning cached prediction for lead ${lead.id}`);
        return cachedPrediction;
      }
    }

    console.log(`[PredictiveScoring] Generating new prediction for lead ${lead.id}`);
    
    // Get cached market insights or fetch new ones
    const marketInsights = await this.getCachedMarketInsights(
      lead.industry || 'all',
      lead.stateCode || 'all'
    );

    // Fetch all other relevant data in parallel
    const [
      historicalPerformance,
      marketBenchmark,
      competitorData,
      mlScore
    ] = await Promise.all([
      this.getHistoricalPerformance(lead),
      this.getMarketBenchmark(lead),
      this.getCompetitorData(lead),
      this.mlScoringService.scoreLead(lead)
    ]);

    // Generate individual predictions
    const timeToClose = this.predictTimeToClose(lead, historicalPerformance, marketBenchmark);
    const dealSize = this.predictDealSize(lead, marketBenchmark, mlScore);
    const successProbability = this.predictSuccessProbability(lead, historicalPerformance, mlScore);
    const roi = this.predictROI(lead, dealSize, successProbability, timeToClose);
    const lifecycleStage = this.predictLifecycleStage(lead);
    const nextBestActions = this.generateNextBestActions(lead, timeToClose, successProbability, lifecycleStage);
    const marketTiming = this.assessMarketTiming(lead, marketInsights);
    const competitivePosition = this.assessCompetitivePosition(lead, competitorData, mlScore);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(
      successProbability,
      roi,
      timeToClose,
      competitivePosition
    );

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence([
      timeToClose.confidence,
      dealSize.confidence,
      successProbability.probability * 100,
      lifecycleStage.confidence
    ]);

    const prediction: PredictiveInsight = {
      leadId: lead.id,
      timeToClose,
      dealSize,
      successProbability,
      roi,
      lifecycleStage,
      nextBestActions,
      marketTiming,
      competitivePosition,
      overallScore,
      confidence
    };

    // Store prediction in database with proper expiry
    await this.storePrediction(lead, prediction);

    return prediction;
  }

  /**
   * Get cached prediction using CacheManager
   */
  private async getCachedPrediction(leadId: string): Promise<PredictiveInsight | null> {
    // Try CacheManager first
    const cacheKey = `lead:${leadId}`;
    const cached = await cacheManager.get<PredictiveInsight>(
      'predictive-analytics',
      cacheKey
    );
    
    if (cached) {
      console.log(`[PredictiveScoring] Cache hit for prediction ${leadId}`);
      return cached;
    }
    
    // Fall back to database
    try {
      const now = new Date();
      
      // Query for cached predictions that haven't expired
      const dbCached = await db
        .select()
        .from(leadPredictions)
        .where(
          and(
            eq(leadPredictions.leadId, leadId),
            gte(leadPredictions.expiresAt, now)
          )
        )
        .limit(1);

      if (dbCached.length === 0) {
        return null;
      }

      const cachedData = dbCached[0];
      
      // Reconstruct the PredictiveInsight from cached data
      return {
        leadId: cachedData.leadId,
        timeToClose: {
          days: cachedData.timeToClosePrediction || 18,
          confidence: Number(cachedData.timeToCloseConfidence || 50),
          factors: cachedData.factorsAnalyzed?.timeToClose || {},
          range: {
            optimistic: Math.round((cachedData.timeToClosePrediction || 18) * 0.7),
            realistic: cachedData.timeToClosePrediction || 18,
            pessimistic: Math.round((cachedData.timeToClosePrediction || 18) * 1.5)
          }
        },
        dealSize: {
          amount: Number(cachedData.dealSizePrediction || 30000),
          confidence: Number(cachedData.dealSizeConfidence || 50),
          range: cachedData.dealSizeRange as any || { min: 21000, median: 30000, max: 42000 },
          factors: cachedData.factorsAnalyzed?.dealSize || {}
        },
        successProbability: {
          probability: Number(cachedData.successProbability || 0.15),
          fundingLikelihood: Number(cachedData.fundingLikelihood || 0.15),
          defaultRisk: Number(cachedData.defaultRisk || 0.1),
          factors: cachedData.factorsAnalyzed?.successProbability || {}
        },
        roi: {
          expectedROI: Number(cachedData.expectedROI || 10),
          riskAdjustedROI: Number(cachedData.riskAdjustedROI || 5),
          paybackPeriod: cachedData.paybackPeriod || 90,
          breakEvenPoint: Math.round((cachedData.paybackPeriod || 90) * 1.2),
          factors: cachedData.factorsAnalyzed?.roi || {}
        },
        lifecycleStage: {
          currentStage: cachedData.lifecycleStage as any || 'awareness',
          confidence: 75,
          nextStageTransitionProbability: (cachedData.stageTransitionProbability as any)?.probability || 0.5,
          estimatedDaysToNextStage: (cachedData.stageTransitionProbability as any)?.daysToTransition || 7,
          indicators: []
        },
        nextBestActions: cachedData.nextBestActions as any || [],
        marketTiming: cachedData.marketTiming as any || 'optimal',
        competitivePosition: (cachedData.competitiveAnalysis as any)?.position || 'moderate',
        overallScore: (cachedData.competitiveAnalysis as any)?.score || 50,
        confidence: Number(cachedData.confidence || 50)
      };
    } catch (error) {
      console.error('[PredictiveScoring] Error fetching cached prediction:', error);
      return null;
    }
  }

  /**
   * Get cached market insights or fetch new ones
   */
  private async getCachedMarketInsights(industry: string, region: string): Promise<any> {
    const cacheKey = `${industry}:${region}`;
    const now = new Date();
    
    // Check in-memory cache first
    const cached = this.marketInsightsCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      console.log(`[PredictiveScoring] Using cached market insights for ${cacheKey}`);
      return cached.data;
    }
    
    // Fetch new market insights (will use its own caching)
    const marketInsights = await marketInsightsService.getMarketInsights({
      industry: industry !== 'all' ? industry : undefined,
      region: region !== 'all' ? region : undefined
    });
    
    // Cache for future use within this batch
    this.marketInsightsCache.set(cacheKey, {
      data: marketInsights,
      expiry: new Date(Date.now() + this.CACHE_DURATION)
    });
    
    return marketInsights;
  }

  /**
   * Predict time to close for a lead
   */
  private predictTimeToClose(
    lead: Lead,
    historicalData: any,
    benchmark: MarketBenchmark | null
  ): TimeToClosePrediction {
    // Base time from industry average
    const industryBase = this.INDUSTRY_CLOSING_TIMES[lead.industry?.toLowerCase() || 'default'];
    
    // Urgency factor
    const urgencyMultiplier = this.getUrgencyMultiplier(lead.urgencyLevel);
    
    // Credit score factor (better credit = faster approval)
    const creditScore = parseInt(lead.creditScore || '650');
    const creditMultiplier = creditScore > 700 ? 0.8 : creditScore > 600 ? 1.0 : 1.3;
    
    // Seasonal adjustment (Q4 and Q1 tend to be faster)
    const month = new Date().getMonth() + 1;
    const seasonalMultiplier = [1, 2, 3, 10, 11, 12].includes(month) ? 0.9 : 1.1;
    
    // Competition factor (more competition = longer time)
    const competitionMultiplier = lead.exclusivityStatus === 'exclusive' ? 0.7 :
                                  lead.exclusivityStatus === 'semi_exclusive' ? 0.9 : 1.2;

    // Calculate predicted days
    const baseDays = industryBase * urgencyMultiplier * creditMultiplier * seasonalMultiplier * competitionMultiplier;
    
    // Calculate range
    const range = {
      optimistic: Math.round(baseDays * 0.7),
      realistic: Math.round(baseDays),
      pessimistic: Math.round(baseDays * 1.5)
    };

    // Calculate confidence based on data quality
    const confidence = this.calculateTimeToCloseConfidence(lead, historicalData);

    return {
      days: range.realistic,
      confidence,
      factors: {
        urgencyLevel: urgencyMultiplier * 100,
        industryAverage: industryBase,
        creditScoreImpact: creditMultiplier * 100,
        seasonalAdjustment: seasonalMultiplier * 100,
        competitionFactor: competitionMultiplier * 100
      },
      range
    };
  }

  /**
   * Predict deal size for a lead
   */
  private predictDealSize(
    lead: Lead,
    benchmark: MarketBenchmark | null,
    mlScore: any
  ): DealSizePrediction {
    // Start with requested amount or industry average
    const requestedAmount = parseInt(lead.requestedAmount || '0');
    const industryAvg = benchmark?.avgDealSize ? Number(benchmark.avgDealSize) : 30000;
    
    let baseAmount = requestedAmount > 0 ? requestedAmount : industryAvg;

    // Annual revenue factor (can support larger deals with higher revenue)
    const annualRevenue = parseInt(lead.annualRevenue || '0');
    let revenueMultiplier = 1.0;
    if (annualRevenue > 0) {
      const revenueRatio = baseAmount / annualRevenue;
      if (revenueRatio > 0.15) {
        // Requested amount is too high relative to revenue
        revenueMultiplier = 0.7;
      } else if (revenueRatio < 0.05) {
        // Conservative request, might qualify for more
        revenueMultiplier = 1.3;
      }
    }

    // Credit score adjustment
    const creditScore = parseInt(lead.creditScore || '650');
    const creditMultiplier = creditScore > 750 ? 1.2 :
                             creditScore > 700 ? 1.1 :
                             creditScore > 650 ? 1.0 :
                             creditScore > 600 ? 0.8 : 0.6;

    // Time in business factor
    const timeInBusiness = parseInt(lead.timeInBusiness || '2');
    const timeMultiplier = timeInBusiness > 5 ? 1.15 :
                           timeInBusiness > 3 ? 1.0 :
                           timeInBusiness > 1 ? 0.85 : 0.7;

    // Calculate predicted amount
    const predictedAmount = baseAmount * revenueMultiplier * creditMultiplier * timeMultiplier;

    // ML Score adjustment
    const mlAdjustment = mlScore.expectedDealSize ? Number(mlScore.expectedDealSize) : predictedAmount;
    const finalAmount = (predictedAmount * 0.7 + mlAdjustment * 0.3); // Blend predictions

    // Calculate range
    const range = {
      min: Math.round(finalAmount * 0.7),
      median: Math.round(finalAmount),
      max: Math.round(finalAmount * 1.4)
    };

    // Calculate confidence
    const confidence = this.calculateDealSizeConfidence(lead, requestedAmount > 0);

    return {
      amount: range.median,
      confidence,
      range,
      factors: {
        requestedAmount: requestedAmount || industryAvg,
        annualRevenue: annualRevenue || 0,
        industryNorm: industryAvg,
        creditAdjustment: creditMultiplier * 100,
        timeInBusinessMultiplier: timeMultiplier * 100
      }
    };
  }

  /**
   * Predict success probability
   */
  private predictSuccessProbability(
    lead: Lead,
    historicalData: any,
    mlScore: any
  ): SuccessProbabilityPrediction {
    // Start with ML-based probability
    const mlProbability = Number(mlScore.conversionProbability || 0.15);

    // Business health score
    const businessHealth = this.calculateBusinessHealth(lead);
    
    // Market conditions score
    const marketConditions = this.assessMarketConditions(lead);
    
    // Competitive landscape
    const competitiveLandscape = lead.exclusivityStatus === 'exclusive' ? 0.8 :
                                 lead.exclusivityStatus === 'semi_exclusive' ? 0.6 : 0.4;
    
    // Historical performance (if available)
    const historicalPerformance = historicalData.successRate || 0.5;
    
    // Verification score impact
    const verificationScore = (lead.qualityScore || 50) / 100;

    // Weighted average probability
    const probability = (
      mlProbability * 0.3 +
      businessHealth * 0.2 +
      marketConditions * 0.15 +
      competitiveLandscape * 0.15 +
      historicalPerformance * 0.1 +
      verificationScore * 0.1
    );

    // Calculate funding likelihood (probability of getting funded if pursued)
    const fundingLikelihood = this.calculateFundingLikelihood(lead, probability);
    
    // Calculate default risk (probability of default if funded)
    const defaultRisk = this.calculateDefaultRisk(lead);

    return {
      probability: Math.min(1, Math.max(0, probability)),
      fundingLikelihood: Math.min(1, Math.max(0, fundingLikelihood)),
      defaultRisk: Math.min(1, Math.max(0, defaultRisk)),
      factors: {
        businessHealth: businessHealth * 100,
        marketConditions: marketConditions * 100,
        competitiveLandscape: competitiveLandscape * 100,
        historicalPerformance: historicalPerformance * 100,
        verificationScore: verificationScore * 100
      }
    };
  }

  /**
   * Predict ROI
   */
  private predictROI(
    lead: Lead,
    dealSize: DealSizePrediction,
    successProbability: SuccessProbabilityPrediction,
    timeToClose: TimeToClosePrediction
  ): ROIPrediction {
    // Base ROI calculation
    const investmentCost = this.calculateInvestmentCost(lead);
    const expectedRevenue = dealSize.amount * 0.15; // Assume 15% commission
    const expectedProfit = expectedRevenue - investmentCost;
    const expectedROI = (expectedProfit / investmentCost) * 100;

    // Risk-adjusted ROI
    const riskFactor = 1 - successProbability.defaultRisk;
    const riskAdjustedRevenue = expectedRevenue * successProbability.probability * riskFactor;
    const riskAdjustedProfit = riskAdjustedRevenue - investmentCost;
    const riskAdjustedROI = (riskAdjustedProfit / investmentCost) * 100;

    // Payback period (when investment is recovered)
    const dailyRevenue = expectedRevenue / 180; // Assume 6-month term
    const paybackPeriod = Math.ceil(investmentCost / dailyRevenue) + timeToClose.days;

    // Break-even point
    const breakEvenPoint = Math.ceil((investmentCost * 1.2) / dailyRevenue) + timeToClose.days;

    return {
      expectedROI: Math.round(expectedROI),
      riskAdjustedROI: Math.round(riskAdjustedROI),
      paybackPeriod,
      breakEvenPoint,
      factors: {
        dealSize: dealSize.amount,
        successProbability: successProbability.probability * 100,
        riskFactor: riskFactor * 100,
        marketConditions: 75 // Placeholder - would be calculated from market data
      }
    };
  }

  /**
   * Predict lifecycle stage
   */
  private predictLifecycleStage(lead: Lead): LifecycleStagePrediction {
    // Determine current stage based on lead data and activity
    let currentStage: LifecycleStagePrediction['currentStage'] = 'awareness';
    const indicators: string[] = [];

    // Check for stage indicators
    if (lead.sold) {
      currentStage = 'retention';
      indicators.push('Lead has been sold');
    } else if (lead.viewCount > 5) {
      currentStage = 'decision';
      indicators.push('Multiple views indicate active consideration');
    } else if (lead.qualityScore > 70) {
      currentStage = 'consideration';
      indicators.push('High quality score suggests qualified lead');
    } else if (lead.isEnriched) {
      currentStage = 'consideration';
      indicators.push('Lead has been enriched with additional data');
    }

    // Add urgency-based indicators
    if (lead.urgencyLevel === 'immediate') {
      if (currentStage === 'awareness') currentStage = 'consideration';
      if (currentStage === 'consideration') currentStage = 'decision';
      indicators.push('High urgency level indicates advanced stage');
    }

    // Calculate transition probability
    const transitionProbability = this.calculateStageTransitionProbability(currentStage, lead);

    // Estimate days to next stage
    const daysToNextStage = this.estimateDaysToNextStage(currentStage, lead);

    // Calculate confidence
    const confidence = indicators.length > 0 ? Math.min(95, 50 + indicators.length * 15) : 40;

    return {
      currentStage,
      confidence,
      nextStageTransitionProbability: transitionProbability,
      estimatedDaysToNextStage: daysToNextStage,
      indicators
    };
  }

  /**
   * Generate next best actions
   */
  private generateNextBestActions(
    lead: Lead,
    timeToClose: TimeToClosePrediction,
    successProbability: SuccessProbabilityPrediction,
    lifecycleStage: LifecycleStagePrediction
  ): NextBestAction[] {
    const actions: NextBestAction[] = [];

    // High priority actions based on success probability
    if (successProbability.probability > 0.7) {
      actions.push({
        action: 'Prioritize immediate outreach',
        priority: 'high',
        expectedImpact: 85,
        reasoning: `High success probability (${Math.round(successProbability.probability * 100)}%) warrants immediate attention`,
        timing: 'immediate',
        channel: 'phone'
      });
    }

    // Stage-specific actions
    switch (lifecycleStage.currentStage) {
      case 'awareness':
        actions.push({
          action: 'Send introductory email with value proposition',
          priority: 'medium',
          expectedImpact: 60,
          reasoning: 'Lead needs education about available options',
          timing: 'within_24h',
          channel: 'email'
        });
        break;

      case 'consideration':
        actions.push({
          action: 'Schedule qualification call',
          priority: 'high',
          expectedImpact: 75,
          reasoning: 'Lead is actively considering options and needs guidance',
          timing: 'immediate',
          channel: 'phone'
        });
        actions.push({
          action: 'Send case studies and testimonials',
          priority: 'medium',
          expectedImpact: 65,
          reasoning: 'Build trust and demonstrate value',
          timing: 'within_24h',
          channel: 'email'
        });
        break;

      case 'decision':
        actions.push({
          action: 'Present formal offer with terms',
          priority: 'high',
          expectedImpact: 90,
          reasoning: 'Lead is ready to make a decision',
          timing: 'immediate',
          channel: 'phone'
        });
        actions.push({
          action: 'Offer limited-time incentive',
          priority: 'medium',
          expectedImpact: 70,
          reasoning: `Time to close prediction is ${timeToClose.days} days - incentive may accelerate`,
          timing: 'immediate',
          channel: 'email'
        });
        break;

      case 'purchase':
        actions.push({
          action: 'Expedite documentation and funding',
          priority: 'high',
          expectedImpact: 95,
          reasoning: 'Lead has committed - focus on smooth execution',
          timing: 'immediate',
          channel: 'phone'
        });
        break;

      case 'retention':
        actions.push({
          action: 'Schedule check-in call for satisfaction',
          priority: 'low',
          expectedImpact: 40,
          reasoning: 'Maintain relationship for future opportunities',
          timing: 'schedule',
          channel: 'phone'
        });
        break;
    }

    // Add enrichment action if not enriched
    if (!lead.isEnriched) {
      actions.push({
        action: 'Enrich lead data for better insights',
        priority: 'medium',
        expectedImpact: 55,
        reasoning: 'Additional data will improve prediction accuracy',
        timing: 'immediate',
        channel: 'automated'
      });
    }

    // Add urgency-based actions
    if (lead.urgencyLevel === 'immediate') {
      actions.push({
        action: 'Fast-track application processing',
        priority: 'high',
        expectedImpact: 80,
        reasoning: 'Lead has immediate funding need',
        timing: 'immediate',
        channel: 'phone'
      });
    }

    // Sort by priority and impact
    return actions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      return priorityDiff !== 0 ? priorityDiff : b.expectedImpact - a.expectedImpact;
    });
  }

  /**
   * Helper: Get urgency multiplier
   */
  private getUrgencyMultiplier(urgencyLevel?: string): number {
    switch (urgencyLevel) {
      case 'immediate': return 0.5;
      case 'this_week': return 0.7;
      case 'this_month': return 1.0;
      case 'exploring': return 1.5;
      default: return 1.2;
    }
  }

  /**
   * Helper: Calculate time to close confidence
   */
  private calculateTimeToCloseConfidence(lead: Lead, historicalData: any): number {
    let confidence = 50;

    // Data completeness adds confidence
    if (lead.urgencyLevel) confidence += 10;
    if (lead.creditScore) confidence += 10;
    if (lead.industry) confidence += 10;
    if (lead.annualRevenue) confidence += 5;
    if (lead.timeInBusiness) confidence += 5;

    // Historical data adds confidence
    if (historicalData && historicalData.sampleSize > 10) {
      confidence += Math.min(10, historicalData.sampleSize / 10);
    }

    return Math.min(95, confidence);
  }

  /**
   * Helper: Calculate deal size confidence
   */
  private calculateDealSizeConfidence(lead: Lead, hasRequestedAmount: boolean): number {
    let confidence = 40;

    if (hasRequestedAmount) confidence += 20;
    if (lead.annualRevenue) confidence += 15;
    if (lead.creditScore) confidence += 10;
    if (lead.timeInBusiness) confidence += 10;
    if (lead.industry) confidence += 5;

    return Math.min(90, confidence);
  }

  /**
   * Helper: Calculate business health
   */
  private calculateBusinessHealth(lead: Lead): number {
    let health = 0.5;

    // Credit score impact
    const creditScore = parseInt(lead.creditScore || '650');
    if (creditScore > 750) health += 0.2;
    else if (creditScore > 700) health += 0.15;
    else if (creditScore > 650) health += 0.1;
    else if (creditScore < 600) health -= 0.1;

    // Time in business impact
    const timeInBusiness = parseInt(lead.timeInBusiness || '2');
    if (timeInBusiness > 5) health += 0.15;
    else if (timeInBusiness > 3) health += 0.1;
    else if (timeInBusiness < 1) health -= 0.1;

    // Revenue impact
    const annualRevenue = parseInt(lead.annualRevenue || '0');
    if (annualRevenue > 1000000) health += 0.15;
    else if (annualRevenue > 500000) health += 0.1;
    else if (annualRevenue > 100000) health += 0.05;

    // Previous MCA history
    if (lead.previousMCAHistory === 'previous_paid') health += 0.1;
    else if (lead.previousMCAHistory === 'current') health += 0.05;
    else if (lead.previousMCAHistory === 'multiple') health -= 0.05;

    return Math.min(1, Math.max(0, health));
  }

  /**
   * Helper: Assess market conditions
   */
  private assessMarketConditions(lead: Lead): number {
    // Simplified market assessment
    let conditions = 0.6;

    // Industry factors
    const growthIndustries = ['technology', 'healthcare', 'e-commerce', 'finance'];
    const challengingIndustries = ['restaurant', 'retail', 'hospitality'];

    if (lead.industry) {
      if (growthIndustries.includes(lead.industry.toLowerCase())) {
        conditions += 0.15;
      } else if (challengingIndustries.includes(lead.industry.toLowerCase())) {
        conditions -= 0.1;
      }
    }

    // Geographic factors
    const strongStates = ['CA', 'NY', 'TX', 'FL', 'IL'];
    if (lead.stateCode && strongStates.includes(lead.stateCode)) {
      conditions += 0.1;
    }

    // Seasonal factors
    const month = new Date().getMonth() + 1;
    if ([1, 2, 3, 10, 11, 12].includes(month)) {
      conditions += 0.05; // Q1 and Q4 tend to be stronger
    }

    return Math.min(1, Math.max(0, conditions));
  }

  /**
   * Helper: Calculate funding likelihood
   */
  private calculateFundingLikelihood(lead: Lead, baseProbability: number): number {
    let likelihood = baseProbability;

    // Adjust based on specific factors
    if (lead.dailyBankDeposits) likelihood += 0.1;
    if (lead.urgencyLevel === 'immediate') likelihood += 0.15;
    if (lead.previousMCAHistory === 'previous_paid') likelihood += 0.1;
    if (lead.exclusivityStatus === 'exclusive') likelihood += 0.1;

    return Math.min(1, likelihood);
  }

  /**
   * Helper: Calculate default risk
   */
  private calculateDefaultRisk(lead: Lead): number {
    let risk = 0.15; // Base risk

    // Credit score impact
    const creditScore = parseInt(lead.creditScore || '650');
    if (creditScore < 600) risk += 0.2;
    else if (creditScore < 650) risk += 0.1;
    else if (creditScore > 750) risk -= 0.05;

    // Industry risk
    const riskyIndustries = ['restaurant', 'retail', 'hospitality', 'construction'];
    if (lead.industry && riskyIndustries.includes(lead.industry.toLowerCase())) {
      risk += 0.15;
    }

    // Time in business
    const timeInBusiness = parseInt(lead.timeInBusiness || '2');
    if (timeInBusiness < 1) risk += 0.15;
    else if (timeInBusiness < 2) risk += 0.1;
    else if (timeInBusiness > 5) risk -= 0.05;

    // Previous MCA history
    if (lead.previousMCAHistory === 'multiple') risk += 0.1;

    return Math.min(0.8, Math.max(0.05, risk));
  }

  /**
   * Helper: Calculate investment cost
   */
  private calculateInvestmentCost(lead: Lead): number {
    // Base cost of lead
    let cost = 100; // Base cost

    // Adjust for exclusivity
    if (lead.exclusivityStatus === 'exclusive') cost *= 2.5;
    else if (lead.exclusivityStatus === 'semi_exclusive') cost *= 1.5;

    // Adjust for quality
    const qualityScore = lead.qualityScore || 50;
    cost *= (qualityScore / 50); // Higher quality = higher cost

    // Adjust for freshness
    const freshnessScore = lead.freshnessScore || 100;
    cost *= (freshnessScore / 100);

    // Add operational costs (sales, processing, etc.)
    cost += 50;

    return cost;
  }

  /**
   * Helper: Calculate stage transition probability
   */
  private calculateStageTransitionProbability(
    currentStage: LifecycleStagePrediction['currentStage'],
    lead: Lead
  ): number {
    const baseTransitionRates = {
      awareness: 0.6,
      consideration: 0.7,
      decision: 0.8,
      purchase: 0.9,
      retention: 0.3
    };

    let probability = baseTransitionRates[currentStage];

    // Adjust based on lead quality
    const qualityScore = lead.qualityScore || 50;
    probability *= (qualityScore / 70);

    // Adjust based on urgency
    if (lead.urgencyLevel === 'immediate') probability *= 1.3;
    else if (lead.urgencyLevel === 'exploring') probability *= 0.7;

    return Math.min(1, Math.max(0, probability));
  }

  /**
   * Helper: Estimate days to next stage
   */
  private estimateDaysToNextStage(
    currentStage: LifecycleStagePrediction['currentStage'],
    lead: Lead
  ): number {
    const baseDaysToNextStage = {
      awareness: 7,
      consideration: 5,
      decision: 3,
      purchase: 2,
      retention: 90
    };

    let days = baseDaysToNextStage[currentStage];

    // Adjust based on urgency
    if (lead.urgencyLevel === 'immediate') days = Math.ceil(days * 0.5);
    else if (lead.urgencyLevel === 'exploring') days = Math.ceil(days * 2);

    return days;
  }

  /**
   * Helper: Assess market timing
   */
  private assessMarketTiming(lead: Lead, marketInsights: any): 'early' | 'optimal' | 'late' | 'missed' {
    // Check lead age
    const daysSinceUpload = Math.floor(
      (Date.now() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceUpload > 30) return 'missed';
    if (daysSinceUpload > 14) return 'late';

    // Check market conditions
    const industryTrend = marketInsights.industryTrends.find(
      (t: any) => t.industry === lead.industry
    );

    if (industryTrend) {
      if (industryTrend.trendDirection === 'up' && daysSinceUpload < 3) return 'optimal';
      if (industryTrend.saturationLevel > 70) return 'late';
    }

    // Check urgency
    if (lead.urgencyLevel === 'immediate' && daysSinceUpload < 7) return 'optimal';

    return daysSinceUpload < 7 ? 'early' : 'optimal';
  }

  /**
   * Helper: Assess competitive position
   */
  private assessCompetitivePosition(
    lead: Lead,
    competitorData: any,
    mlScore: any
  ): 'strong' | 'moderate' | 'weak' {
    let score = 50;

    // Exclusivity advantage
    if (lead.exclusivityStatus === 'exclusive') score += 30;
    else if (lead.exclusivityStatus === 'semi_exclusive') score += 15;

    // Quality advantage
    if (lead.qualityScore > 80) score += 20;
    else if (lead.qualityScore > 60) score += 10;

    // ML score advantage
    if (mlScore.mlQualityScore > 80) score += 15;
    else if (mlScore.mlQualityScore > 60) score += 5;

    // Enrichment advantage
    if (lead.isEnriched) score += 10;

    // View count disadvantage (others have seen it)
    if (lead.viewCount > 10) score -= 20;
    else if (lead.viewCount > 5) score -= 10;

    if (score >= 75) return 'strong';
    if (score >= 45) return 'moderate';
    return 'weak';
  }

  /**
   * Helper: Calculate overall score
   */
  private calculateOverallScore(
    successProbability: SuccessProbabilityPrediction,
    roi: ROIPrediction,
    timeToClose: TimeToClosePrediction,
    competitivePosition: string
  ): number {
    let score = 0;

    // Success probability (40% weight)
    score += successProbability.probability * 40;

    // ROI (30% weight)
    const roiScore = Math.min(100, Math.max(0, roi.riskAdjustedROI));
    score += (roiScore / 100) * 30;

    // Time to close (20% weight) - faster is better
    const timeScore = Math.max(0, 100 - (timeToClose.days * 2));
    score += (timeScore / 100) * 20;

    // Competitive position (10% weight)
    const positionScore = competitivePosition === 'strong' ? 100 :
                          competitivePosition === 'moderate' ? 60 : 30;
    score += (positionScore / 100) * 10;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  /**
   * Helper: Calculate overall confidence
   */
  private calculateOverallConfidence(confidences: number[]): number {
    if (confidences.length === 0) return 50;
    
    const sum = confidences.reduce((acc, conf) => acc + conf, 0);
    return Math.round(sum / confidences.length);
  }

  /**
   * Helper: Get historical performance data
   */
  private async getHistoricalPerformance(lead: Lead) {
    // Get performance data for similar leads
    const similarLeads = await db
      .select({
        totalLeads: count(leads.id),
        successfulLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgTimeToClose: avg(leadPerformance.timeToClose)
      })
      .from(leads)
      .leftJoin(leadPerformance, eq(leads.id, leadPerformance.leadId))
      .where(
        and(
          lead.industry ? eq(leads.industry, lead.industry) : sql`1=1`,
          lead.stateCode ? eq(leads.stateCode, lead.stateCode) : sql`1=1`
        )
      );

    const data = similarLeads[0];
    const totalLeads = Number(data?.totalLeads || 0);
    const successfulLeads = Number(data?.successfulLeads || 0);

    return {
      sampleSize: totalLeads,
      successRate: totalLeads > 0 ? successfulLeads / totalLeads : 0,
      avgTimeToClose: Number(data?.avgTimeToClose || 18)
    };
  }

  /**
   * Helper: Get market benchmark
   */
  private async getMarketBenchmark(lead: Lead): Promise<MarketBenchmark | null> {
    const [benchmark] = await db
      .select()
      .from(marketBenchmarks)
      .where(
        and(
          eq(marketBenchmarks.benchmarkType, 'industry'),
          eq(marketBenchmarks.category, lead.industry || 'default')
        )
      )
      .limit(1);

    return benchmark || null;
  }

  /**
   * Helper: Get competitor data
   */
  private async getCompetitorData(lead: Lead) {
    // Get data about competing leads in the same market
    const competingLeads = await db
      .select({
        count: count(leads.id),
        avgQualityScore: avg(leads.qualityScore),
        avgFreshnessScore: avg(leads.freshnessScore)
      })
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          lead.industry ? eq(leads.industry, lead.industry) : sql`1=1`,
          lead.stateCode ? eq(leads.stateCode, lead.stateCode) : sql`1=1`
        )
      );

    return {
      competingLeads: Number(competingLeads[0]?.count || 0),
      avgCompetitorQuality: Number(competingLeads[0]?.avgQualityScore || 50),
      avgCompetitorFreshness: Number(competingLeads[0]?.avgFreshnessScore || 50)
    };
  }

  /**
   * Store prediction in database with caching
   */
  private async storePrediction(lead: Lead, prediction: PredictiveInsight): Promise<void> {
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION); // 6 hours cache

    try {
      await db.insert(leadPredictions).values({
        leadId: lead.id,
        
        // Time predictions
        timeToClosePrediction: prediction.timeToClose.days,
        timeToCloseConfidence: prediction.timeToClose.confidence.toString(),
        optimalContactTime: {
          bestDays: this.getOptimalContactDays(),
          bestHours: this.getOptimalContactHours()
        },
        
        // Deal predictions
        dealSizePrediction: prediction.dealSize.amount.toString(),
        dealSizeRange: prediction.dealSize.range,
        dealSizeConfidence: prediction.dealSize.confidence.toString(),
        
        // Success predictions
        successProbability: prediction.successProbability.probability.toString(),
        fundingLikelihood: prediction.successProbability.fundingLikelihood.toString(),
        defaultRisk: prediction.successProbability.defaultRisk.toString(),
        
        // ROI predictions
        expectedROI: prediction.roi.expectedROI.toString(),
        riskAdjustedROI: prediction.roi.riskAdjustedROI.toString(),
        paybackPeriod: prediction.roi.paybackPeriod,
        
        // Lifecycle predictions
        lifecycleStage: prediction.lifecycleStage.currentStage,
        stageTransitionProbability: {
          probability: prediction.lifecycleStage.nextStageTransitionProbability,
          daysToTransition: prediction.lifecycleStage.estimatedDaysToNextStage
        },
        churnRisk: '0.1', // Simplified for now
        
        // Next best actions
        nextBestActions: prediction.nextBestActions,
        recommendedChannels: this.extractChannels(prediction.nextBestActions),
        recommendedOffers: this.generateOffers(lead, prediction),
        
        // Market context
        marketPosition: {
          timing: prediction.marketTiming,
          competitivePosition: prediction.competitivePosition
        },
        competitiveAnalysis: {
          position: prediction.competitivePosition,
          score: prediction.overallScore
        },
        marketTiming: prediction.marketTiming,
        
        // Metadata
        modelVersion: '1.0.0',
        confidence: prediction.confidence.toString(),
        factorsAnalyzed: {
          timeToClose: prediction.timeToClose.factors,
          dealSize: prediction.dealSize.factors,
          successProbability: prediction.successProbability.factors,
          roi: prediction.roi.factors
        },
        
        expiresAt
      })
      .onConflictDoUpdate({
        target: leadPredictions.leadId,
        set: {
          timeToClosePrediction: prediction.timeToClose.days,
          dealSizePrediction: prediction.dealSize.amount.toString(),
          successProbability: prediction.successProbability.probability.toString(),
          expectedROI: prediction.roi.expectedROI.toString(),
          calculatedAt: sql`CURRENT_TIMESTAMP`
        }
      });
    } catch (error) {
      console.error('[PredictiveScoring] Failed to store prediction:', error);
    }
  }

  /**
   * Helper: Get optimal contact days
   */
  private getOptimalContactDays(): string[] {
    // Tuesday through Thursday tend to be best
    return ['Tuesday', 'Wednesday', 'Thursday'];
  }

  /**
   * Helper: Get optimal contact hours
   */
  private getOptimalContactHours(): string[] {
    // 10 AM - 12 PM and 2 PM - 4 PM tend to be best
    return ['10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM'];
  }

  /**
   * Helper: Extract recommended channels
   */
  private extractChannels(actions: NextBestAction[]): string[] {
    const channels = new Set(actions.map(a => a.channel));
    return Array.from(channels);
  }

  /**
   * Helper: Generate personalized offers
   */
  private generateOffers(lead: Lead, prediction: PredictiveInsight): any[] {
    const offers = [];

    // High success probability offer
    if (prediction.successProbability.probability > 0.7) {
      offers.push({
        type: 'premium_terms',
        description: 'Expedited funding with preferential terms',
        discount: '5% rate reduction',
        validity: '48 hours'
      });
    }

    // Time-sensitive offer
    if (lead.urgencyLevel === 'immediate') {
      offers.push({
        type: 'fast_track',
        description: 'Same-day approval process',
        benefit: 'Funding within 24 hours',
        validity: '24 hours'
      });
    }

    // Volume offer
    if (prediction.dealSize.amount > 50000) {
      offers.push({
        type: 'volume_discount',
        description: 'Reduced fees for larger funding amounts',
        discount: '10% fee reduction',
        validity: '7 days'
      });
    }

    return offers;
  }

  /**
   * Batch generate predictions for multiple leads with optimized caching
   */
  async batchGeneratePredictions(leadIds: string[], forceRefresh: boolean = false): Promise<Map<string, PredictiveInsight>> {
    const results = new Map<string, PredictiveInsight>();
    
    // First, fetch all leads and check for existing predictions
    const leadsData = await db
      .select()
      .from(leads)
      .where(sql`${leads.id} = ANY(${leadIds})`);
    
    // Group leads by industry and region for efficient market insights caching
    const leadGroups = new Map<string, Lead[]>();
    for (const lead of leadsData) {
      const key = `${lead.industry || 'all'}:${lead.stateCode || 'all'}`;
      if (!leadGroups.has(key)) {
        leadGroups.set(key, []);
      }
      leadGroups.get(key)!.push(lead);
    }
    
    // Pre-fetch market insights for all unique combinations
    console.log(`[PredictiveScoring] Pre-fetching market insights for ${leadGroups.size} unique segments`);
    for (const [key] of leadGroups) {
      const [industry, region] = key.split(':');
      await this.getCachedMarketInsights(industry, region);
    }
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 20; // Can be larger now that we're reusing market insights
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (leadId) => {
        const lead = leadsData.find(l => l.id === leadId);
        if (lead) {
          // Check for cached prediction first
          if (!forceRefresh) {
            const cachedPrediction = await this.getCachedPrediction(leadId);
            if (cachedPrediction) {
              results.set(leadId, cachedPrediction);
              return;
            }
          }
          
          // Generate new prediction (will use cached market insights)
          const prediction = await this.generatePredictions(lead, forceRefresh);
          results.set(leadId, prediction);
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    console.log(`[PredictiveScoring] Batch generated ${results.size} predictions (${leadIds.length - results.size} were cached)`);
    
    return results;
  }
}

// Export singleton instance
export const predictiveScoringEngine = new PredictiveScoringEngine();