import { db } from "../db";
import { leads, purchases, leadPerformance, insightAlerts, marketInsights, leadPredictions, insightReports } from "@shared/schema";
import type { Lead, InsightAlert, MarketInsight, LeadPrediction, InsightReport } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc, notInArray } from "drizzle-orm";
import { marketInsightsService } from "./market-insights";
import { predictiveScoringEngine } from "./predictive-scoring";
import { leadIntelligenceService } from "./lead-intelligence";

export interface DailyInsight {
  id: string;
  type: 'market_trend' | 'anomaly' | 'opportunity' | 'risk' | 'recommendation';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  actionRequired: boolean;
  actions: string[];
  data: any;
  createdAt: Date;
}

export interface PortfolioAnalysis {
  totalLeads: number;
  totalValue: number;
  averageQuality: number;
  riskProfile: 'conservative' | 'moderate' | 'aggressive';
  expectedROI: number;
  projectedRevenue: number;
  topPerformers: Lead[];
  underperformers: Lead[];
  diversificationScore: number;
  recommendations: PortfolioRecommendation[];
}

export interface PortfolioRecommendation {
  action: 'buy' | 'sell' | 'hold' | 'optimize';
  target: string; // Lead ID or category
  reasoning: string;
  expectedImpact: number; // Percentage
  priority: 'high' | 'medium' | 'low';
  timeframe: 'immediate' | 'short_term' | 'long_term';
}

export interface MarketTiming {
  currentPhase: 'accumulation' | 'markup' | 'distribution' | 'markdown';
  signal: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  confidence: number;
  indicators: {
    name: string;
    value: number;
    signal: string;
    weight: number;
  }[];
  optimalActions: {
    industry: string;
    action: string;
    reasoning: string;
  }[];
}

export interface AnomalyDetection {
  id: string;
  type: 'volume_spike' | 'price_anomaly' | 'quality_shift' | 'demand_surge' | 'supply_shortage';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  affectedSegment: string;
  deviation: number; // Percentage from normal
  historicalContext: string;
  recommendation: string;
  detectedAt: Date;
}

export interface DailyBrief {
  date: Date;
  marketSummary: string;
  keyMetrics: {
    newLeads: number;
    conversionRate: number;
    averageDealSize: number;
    topIndustry: string;
    topRegion: string;
  };
  insights: DailyInsight[];
  opportunities: OpportunityAlert[];
  risks: RiskAlert[];
  actionItems: ActionItem[];
}

export interface OpportunityAlert {
  id: string;
  type: 'high_value' | 'quick_win' | 'volume_deal' | 'exclusive' | 'emerging_trend';
  leads: Lead[];
  expectedValue: number;
  successProbability: number;
  timeWindow: string;
  action: string;
}

export interface RiskAlert {
  id: string;
  type: 'market_downturn' | 'saturation' | 'quality_decline' | 'competition_increase';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedLeads: number;
  potentialLoss: number;
  mitigation: string;
}

export interface ActionItem {
  id: string;
  action: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  deadline: Date;
  expectedOutcome: string;
  assignedTo?: string;
}

/**
 * Insights Dashboard Service
 * Provides comprehensive analytics, predictions, and actionable insights
 */
export class InsightsDashboardService {
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 24; // 24 hours cache for daily insights
  private readonly INSIGHT_CACHE_PREFIX = 'daily_insights';
  
  constructor() {
    // Use the singleton instance imported at the top of the file
  }

  /**
   * Generate daily insights with key market changes (with caching)
   */
  async generateDailyInsights(forceRefresh: boolean = false): Promise<DailyInsight[]> {
    // Check for cached insights first
    if (!forceRefresh) {
      const cachedInsights = await this.getCachedDailyInsights();
      if (cachedInsights) {
        console.log('[InsightsDashboard] Returning cached daily insights');
        return cachedInsights;
      }
    }

    console.log('[InsightsDashboard] Generating new daily insights');
    const insights: DailyInsight[] = [];
    
    // Get cached market data instead of recomputing
    const [
      marketData,
      volumeChanges,
      qualityTrends,
      conversionTrends
    ] = await Promise.all([
      this.getCachedMarketData(),
      this.analyzeVolumeChanges(),
      this.analyzeQualityTrends(),
      this.analyzeConversionTrends()
    ]);

    // Market trend insights
    for (const trend of marketData.industryTrends.slice(0, 3)) {
      if (trend.trendDirection === 'up' && trend.trendStrength > 70) {
        insights.push({
          id: `trend_${trend.industry}`,
          type: 'market_trend',
          priority: 'high',
          title: `${trend.industry} sector showing strong growth`,
          description: `${trend.industry} leads are experiencing ${Math.round(trend.growthRate)}% growth with ${Math.round(trend.demandIndex)}% demand index`,
          impact: `Potential ${Math.round(trend.averageDealSize)} average deal size`,
          actionRequired: true,
          actions: [
            `Focus acquisition on ${trend.industry} leads`,
            'Adjust pricing strategy for premium positioning',
            'Allocate more resources to this sector'
          ],
          data: trend,
          createdAt: new Date()
        });
      }
    }

    // Volume change insights
    if (volumeChanges.percentageChange > 20) {
      insights.push({
        id: 'volume_surge',
        type: 'anomaly',
        priority: 'high',
        title: `${Math.round(volumeChanges.percentageChange)}% increase in lead volume`,
        description: `Significant surge in new leads detected, ${volumeChanges.newLeads} new leads in the last 24 hours`,
        impact: 'Increased competition and potential price pressure',
        actionRequired: true,
        actions: [
          'Act quickly on high-value leads',
          'Consider bulk purchasing for better rates',
          'Review and adjust filtering criteria'
        ],
        data: volumeChanges,
        createdAt: new Date()
      });
    }

    // Quality trend insights
    if (qualityTrends.trend === 'improving' && qualityTrends.improvement > 10) {
      insights.push({
        id: 'quality_improvement',
        type: 'opportunity',
        priority: 'medium',
        title: 'Lead quality improving across the board',
        description: `Average quality score has increased by ${Math.round(qualityTrends.improvement)}%`,
        impact: 'Higher conversion rates and better ROI expected',
        actionRequired: false,
        actions: [
          'Increase investment in lead acquisition',
          'Focus on premium tier leads'
        ],
        data: qualityTrends,
        createdAt: new Date()
      });
    }

    // Conversion trend insights
    if (conversionTrends.recentRate > conversionTrends.historicalRate * 1.2) {
      insights.push({
        id: 'conversion_uptick',
        type: 'opportunity',
        priority: 'high',
        title: 'Conversion rates above historical average',
        description: `Current conversion rate of ${Math.round(conversionTrends.recentRate * 100)}% vs ${Math.round(conversionTrends.historicalRate * 100)}% historical`,
        impact: 'Optimal time to increase lead acquisition',
        actionRequired: true,
        actions: [
          'Increase lead purchasing budget',
          'Focus on high-conversion industries',
          'Optimize sales process to maintain momentum'
        ],
        data: conversionTrends,
        createdAt: new Date()
      });
    }

    // Geographic insights
    for (const hotspot of marketData.geographicHotspots.slice(0, 2)) {
      if (hotspot.opportunityScore > 75) {
        insights.push({
          id: `geo_${hotspot.region}`,
          type: 'opportunity',
          priority: 'medium',
          title: `${hotspot.region} emerging as high-opportunity region`,
          description: `${hotspot.region} showing ${Math.round(hotspot.conversionRate * 100)}% conversion rate with ${Math.round(hotspot.growthRate)}% growth`,
          impact: `Average deal size of $${Math.round(hotspot.averageDealSize).toLocaleString()}`,
          actionRequired: false,
          actions: [
            `Prioritize ${hotspot.region} leads in acquisition`,
            `Adjust regional pricing strategy`,
            `Build local market expertise`
          ],
          data: hotspot,
          createdAt: new Date()
        });
      }
    }

    // Cache the generated insights
    await this.storeDailyInsights(insights);

    return insights;
  }

  /**
   * Get cached daily insights from database
   */
  private async getCachedDailyInsights(): Promise<DailyInsight[] | null> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Query for cached insights from today
      const cached = await db
        .select()
        .from(insightReports)
        .where(
          and(
            eq(insightReports.reportType, 'daily_insights'),
            gte(insightReports.expiresAt, now),
            gte(insightReports.generatedAt, today)
          )
        )
        .orderBy(desc(insightReports.generatedAt))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const cachedData = cached[0];
      
      // Return the insights from the cache
      return cachedData.keyInsights as DailyInsight[] || null;
    } catch (error) {
      console.error('[InsightsDashboard] Error fetching cached insights:', error);
      return null;
    }
  }

  /**
   * Store daily insights in database cache
   */
  private async storeDailyInsights(insights: DailyInsight[]): Promise<void> {
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION);
    
    try {
      await db.insert(insightReports).values({
        reportType: 'daily_insights',
        period: 'daily',
        dateRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        executiveSummary: `Generated ${insights.length} key insights for today`,
        keyInsights: insights,
        metrics: {
          totalInsights: insights.length,
          highPriority: insights.filter(i => i.priority === 'high').length,
          anomalies: insights.filter(i => i.type === 'anomaly').length,
          opportunities: insights.filter(i => i.type === 'opportunity').length
        },
        recommendations: insights
          .filter(i => i.actionRequired)
          .map(i => i.actions)
          .flat(),
        generatedAt: new Date(),
        generatedBy: 'system',
        reportStatus: 'final',
        expiresAt
      });
      
      console.log(`[InsightsDashboard] Stored daily insights cache, expires at: ${expiresAt.toISOString()}`);
    } catch (error) {
      console.error('[InsightsDashboard] Failed to store insights cache:', error);
    }
  }

  /**
   * Get cached market data without recomputing
   */
  private async getCachedMarketData(): Promise<any> {
    // Use the market insights service which already implements caching
    return await marketInsightsService.getMarketInsights();
  }

  /**
   * Detect anomalies in the data
   */
  async detectAnomalies(): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    
    // Get baseline metrics
    const [
      baselineVolume,
      baselineQuality,
      baselinePrice,
      currentMetrics
    ] = await Promise.all([
      this.getBaselineVolume(),
      this.getBaselineQuality(),
      this.getBaselinePrice(),
      this.getCurrentMetrics()
    ]);

    // Volume anomaly detection
    const volumeDeviation = ((currentMetrics.volume - baselineVolume) / baselineVolume) * 100;
    if (Math.abs(volumeDeviation) > 50) {
      anomalies.push({
        id: `volume_anomaly_${Date.now()}`,
        type: 'volume_spike',
        severity: Math.abs(volumeDeviation) > 100 ? 'critical' : 'warning',
        description: `Lead volume ${volumeDeviation > 0 ? 'spike' : 'drop'} of ${Math.round(Math.abs(volumeDeviation))}% detected`,
        affectedSegment: 'all',
        deviation: volumeDeviation,
        historicalContext: `Normal volume is ${baselineVolume} leads per day`,
        recommendation: volumeDeviation > 0 ? 
          'Increase processing capacity and act quickly on opportunities' :
          'Review lead sources and market conditions',
        detectedAt: new Date()
      });
    }

    // Quality anomaly detection
    const qualityDeviation = ((currentMetrics.quality - baselineQuality) / baselineQuality) * 100;
    if (Math.abs(qualityDeviation) > 20) {
      anomalies.push({
        id: `quality_anomaly_${Date.now()}`,
        type: 'quality_shift',
        severity: qualityDeviation < -30 ? 'critical' : 'warning',
        description: `Lead quality ${qualityDeviation > 0 ? 'improvement' : 'decline'} of ${Math.round(Math.abs(qualityDeviation))}%`,
        affectedSegment: 'new_leads',
        deviation: qualityDeviation,
        historicalContext: `Normal quality score is ${Math.round(baselineQuality)}`,
        recommendation: qualityDeviation > 0 ?
          'Capitalize on higher quality leads with premium pricing' :
          'Review and tighten lead qualification criteria',
        detectedAt: new Date()
      });
    }

    // Price anomaly detection (if tracking prices)
    const priceDeviation = ((currentMetrics.avgPrice - baselinePrice) / baselinePrice) * 100;
    if (Math.abs(priceDeviation) > 30) {
      anomalies.push({
        id: `price_anomaly_${Date.now()}`,
        type: 'price_anomaly',
        severity: Math.abs(priceDeviation) > 50 ? 'warning' : 'info',
        description: `Lead prices ${priceDeviation > 0 ? 'increased' : 'decreased'} by ${Math.round(Math.abs(priceDeviation))}%`,
        affectedSegment: 'market',
        deviation: priceDeviation,
        historicalContext: `Normal price range is $${Math.round(baselinePrice * 0.8)}-$${Math.round(baselinePrice * 1.2)}`,
        recommendation: priceDeviation > 0 ?
          'Consider alternative lead sources or negotiate bulk discounts' :
          'Opportunity to increase lead acquisition at lower costs',
        detectedAt: new Date()
      });
    }

    // Industry-specific anomalies
    const industryAnomalies = await this.detectIndustryAnomalies();
    anomalies.push(...industryAnomalies);

    // Store significant anomalies as alerts
    for (const anomaly of anomalies.filter(a => a.severity !== 'info')) {
      await this.createAlert(anomaly);
    }

    return anomalies;
  }

  /**
   * Analyze portfolio and provide optimization suggestions
   */
  async analyzePortfolio(userId?: string): Promise<PortfolioAnalysis> {
    // Get portfolio leads
    const portfolioLeads = await this.getPortfolioLeads(userId);
    
    if (portfolioLeads.length === 0) {
      return this.getEmptyPortfolio();
    }

    // Calculate portfolio metrics
    const totalValue = portfolioLeads.reduce((sum, lead) => {
      const value = parseInt(lead.requestedAmount || '0') || 30000;
      return sum + value;
    }, 0);

    const averageQuality = portfolioLeads.reduce((sum, lead) => 
      sum + (lead.qualityScore || 50), 0) / portfolioLeads.length;

    // Get predictions for portfolio leads
    const predictions = await Promise.all(
      portfolioLeads.slice(0, 20).map(lead => 
        predictiveScoringEngine.generatePredictions(lead)
      )
    );

    // Calculate expected ROI and revenue
    const expectedROI = predictions.reduce((sum, p) => 
      sum + p.roi.riskAdjustedROI, 0) / predictions.length;
      
    const projectedRevenue = predictions.reduce((sum, p) => 
      sum + (p.dealSize.amount * 0.15 * p.successProbability.probability), 0);

    // Identify top and under performers
    const sortedByScore = portfolioLeads.sort((a, b) => 
      (b.intelligenceScore || 0) - (a.intelligenceScore || 0));
    
    const topPerformers = sortedByScore.slice(0, 5);
    const underperformers = sortedByScore.slice(-5).reverse();

    // Calculate diversification score
    const diversificationScore = this.calculateDiversificationScore(portfolioLeads);

    // Determine risk profile
    const riskProfile = this.assessPortfolioRisk(portfolioLeads, predictions);

    // Generate recommendations
    const recommendations = await this.generatePortfolioRecommendations(
      portfolioLeads,
      predictions,
      diversificationScore,
      riskProfile
    );

    return {
      totalLeads: portfolioLeads.length,
      totalValue,
      averageQuality,
      riskProfile,
      expectedROI,
      projectedRevenue,
      topPerformers,
      underperformers,
      diversificationScore,
      recommendations
    };
  }

  /**
   * Get daily brief with summary and action items
   */
  async getDailyBrief(): Promise<DailyBrief> {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get key metrics
    const [
      newLeadsCount,
      conversionData,
      topIndustryData,
      topRegionData,
      dailyInsights,
      opportunities,
      risks
    ] = await Promise.all([
      this.getNewLeadsCount(yesterday),
      this.getConversionRate(yesterday),
      this.getTopIndustry(yesterday),
      this.getTopRegion(yesterday),
      this.generateDailyInsights(),
      this.identifyOpportunities(),
      this.identifyRisks()
    ]);

    // Generate market summary
    const marketSummary = this.generateMarketSummary({
      newLeadsCount,
      conversionRate: conversionData.rate,
      topIndustry: topIndustryData.industry,
      topRegion: topRegionData.region
    });

    // Generate action items
    const actionItems = this.generateActionItems(dailyInsights, opportunities, risks);

    return {
      date: today,
      marketSummary,
      keyMetrics: {
        newLeads: newLeadsCount,
        conversionRate: conversionData.rate,
        averageDealSize: conversionData.avgDealSize,
        topIndustry: topIndustryData.industry,
        topRegion: topRegionData.region
      },
      insights: dailyInsights,
      opportunities,
      risks,
      actionItems
    };
  }

  /**
   * Get top opportunities based on predictions with caching
   */
  async getTopOpportunities(limit: number = 10, forceRefresh: boolean = false): Promise<Lead[]> {
    // Get unsold leads with high scores
    const opportunities = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          sql`${leads.intelligenceScore} > 70`
        )
      )
      .orderBy(desc(leads.intelligenceScore))
      .limit(limit);

    // Get lead IDs for batch prediction
    const leadIds = opportunities.map(l => l.id);
    
    // Use batch prediction generation for efficiency
    const predictions = await predictiveScoringEngine.batchGeneratePredictions(leadIds, forceRefresh);
    
    // Enhance leads with prediction data
    for (const lead of opportunities) {
      const prediction = predictions.get(lead.id);
      if (prediction) {
        // Add prediction data to lead object for display
        (lead as any).prediction = {
          timeToClose: prediction.timeToClose.days,
          dealSize: prediction.dealSize.amount,
          successProbability: prediction.successProbability.probability,
          roi: prediction.roi.riskAdjustedROI,
          nextAction: prediction.nextBestActions[0]
        };
      }
    }

    return opportunities;
  }

  /**
   * Provide market timing recommendations with caching
   */
  async getMarketTiming(forceRefresh: boolean = false): Promise<MarketTiming> {
    // Check for cached market timing first
    if (!forceRefresh) {
      const cachedTiming = await this.getCachedMarketTiming();
      if (cachedTiming) {
        console.log('[InsightsDashboard] Returning cached market timing');
        return cachedTiming;
      }
    }

    console.log('[InsightsDashboard] Generating new market timing recommendations');
    
    // Get cached market data
    const marketData = await this.getCachedMarketData();
    
    // Analyze market indicators
    const indicators = this.analyzeMarketIndicators(marketData);
    
    // Determine market phase
    const currentPhase = this.determineMarketPhase(indicators);
    
    // Generate trading signal
    const signal = this.generateTradingSignal(currentPhase, indicators);
    
    // Calculate confidence
    const confidence = this.calculateSignalConfidence(indicators);
    
    // Generate optimal actions
    const optimalActions = this.generateOptimalActions(currentPhase, marketData);

    const timing: MarketTiming = {
      currentPhase,
      signal,
      confidence,
      indicators,
      optimalActions
    };

    // Cache the market timing
    await this.storeMarketTiming(timing);

    return timing;
  }

  /**
   * Get cached market timing from database
   */
  private async getCachedMarketTiming(): Promise<MarketTiming | null> {
    try {
      const now = new Date();
      
      // Query for cached market timing that hasn't expired
      const cached = await db
        .select()
        .from(insightReports)
        .where(
          and(
            eq(insightReports.reportType, 'market_timing'),
            gte(insightReports.expiresAt, now)
          )
        )
        .orderBy(desc(insightReports.generatedAt))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const cachedData = cached[0];
      
      // Return the market timing from metadata
      return cachedData.reportMetadata as MarketTiming || null;
    } catch (error) {
      console.error('[InsightsDashboard] Error fetching cached market timing:', error);
      return null;
    }
  }

  /**
   * Store market timing in database cache
   */
  private async storeMarketTiming(timing: MarketTiming): Promise<void> {
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION);
    
    try {
      await db.insert(insightReports).values({
        reportType: 'market_timing',
        period: 'current',
        dateRange: {
          start: new Date().toISOString(),
          end: new Date().toISOString()
        },
        executiveSummary: `Market phase: ${timing.currentPhase}, Signal: ${timing.signal}`,
        keyInsights: timing.optimalActions.map(a => ({
          industry: a.industry,
          action: a.action,
          reasoning: a.reasoning
        })),
        metrics: {
          confidence: timing.confidence,
          indicatorCount: timing.indicators.length
        },
        recommendations: timing.optimalActions.map(a => a.action),
        reportMetadata: timing,
        generatedAt: new Date(),
        generatedBy: 'system',
        reportStatus: 'final',
        expiresAt
      });
      
      console.log(`[InsightsDashboard] Stored market timing cache, expires at: ${expiresAt.toISOString()}`);
    } catch (error) {
      console.error('[InsightsDashboard] Failed to store market timing cache:', error);
    }
  }

  /**
   * Helper: Analyze volume changes
   */
  private async analyzeVolumeChanges() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [recent, previous] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(gte(leads.createdAt, oneDayAgo)),
      db.select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(and(
          gte(leads.createdAt, twoDaysAgo),
          lte(leads.createdAt, oneDayAgo)
        ))
    ]);

    const recentCount = Number(recent[0]?.count || 0);
    const previousCount = Number(previous[0]?.count || 0);
    
    return {
      newLeads: recentCount,
      previousLeads: previousCount,
      percentageChange: previousCount > 0 ? 
        ((recentCount - previousCount) / previousCount) * 100 : 0
    };
  }

  /**
   * Helper: Analyze quality trends
   */
  private async analyzeQualityTrends() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [recent, historical] = await Promise.all([
      db.select({ avgQuality: sql<number>`AVG(quality_score)` })
        .from(leads)
        .where(gte(leads.createdAt, oneDayAgo)),
      db.select({ avgQuality: sql<number>`AVG(quality_score)` })
        .from(leads)
        .where(and(
          gte(leads.createdAt, oneWeekAgo),
          lte(leads.createdAt, oneDayAgo)
        ))
    ]);

    const recentQuality = Number(recent[0]?.avgQuality || 50);
    const historicalQuality = Number(historical[0]?.avgQuality || 50);
    
    return {
      currentAverage: recentQuality,
      historicalAverage: historicalQuality,
      trend: recentQuality > historicalQuality ? 'improving' : 
             recentQuality < historicalQuality ? 'declining' : 'stable',
      improvement: ((recentQuality - historicalQuality) / historicalQuality) * 100
    };
  }

  /**
   * Helper: Analyze conversion trends
   */
  private async analyzeConversionTrends() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recent, historical] = await Promise.all([
      db.select({
        total: sql<number>`COUNT(*)`,
        sold: sql<number>`COUNT(CASE WHEN sold = true THEN 1 END)`
      })
        .from(leads)
        .where(gte(leads.createdAt, oneWeekAgo)),
      db.select({
        total: sql<number>`COUNT(*)`,
        sold: sql<number>`COUNT(CASE WHEN sold = true THEN 1 END)`
      })
        .from(leads)
        .where(and(
          gte(leads.createdAt, oneMonthAgo),
          lte(leads.createdAt, oneWeekAgo)
        ))
    ]);

    const recentRate = Number(recent[0]?.total || 0) > 0 ?
      Number(recent[0]?.sold || 0) / Number(recent[0]?.total) : 0;
    
    const historicalRate = Number(historical[0]?.total || 0) > 0 ?
      Number(historical[0]?.sold || 0) / Number(historical[0]?.total) : 0;

    return {
      recentRate,
      historicalRate,
      trend: recentRate > historicalRate ? 'improving' : 
             recentRate < historicalRate ? 'declining' : 'stable'
    };
  }

  /**
   * Helper: Get baseline metrics
   */
  private async getBaselineVolume(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await db
      .select({ avgDaily: sql<number>`COUNT(*) / 30` })
      .from(leads)
      .where(gte(leads.createdAt, thirtyDaysAgo));
    
    return Number(result[0]?.avgDaily || 10);
  }

  private async getBaselineQuality(): Promise<number> {
    const result = await db
      .select({ avgQuality: sql<number>`AVG(quality_score)` })
      .from(leads);
    
    return Number(result[0]?.avgQuality || 50);
  }

  private async getBaselinePrice(): Promise<number> {
    // Simplified - in real implementation would track actual prices
    return 100; // Base price per lead
  }

  private async getCurrentMetrics() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await db
      .select({
        volume: sql<number>`COUNT(*)`,
        quality: sql<number>`AVG(quality_score)`,
        avgPrice: sql<number>`100` // Simplified
      })
      .from(leads)
      .where(gte(leads.createdAt, oneDayAgo));
    
    return {
      volume: Number(result[0]?.volume || 0),
      quality: Number(result[0]?.quality || 50),
      avgPrice: Number(result[0]?.avgPrice || 100)
    };
  }

  /**
   * Helper: Detect industry-specific anomalies
   */
  private async detectIndustryAnomalies(): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    
    // Get industry performance data
    const industries = await db
      .select({
        industry: leads.industry,
        recentCount: sql<number>`COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END)`,
        historicalCount: sql<number>`COUNT(CASE WHEN created_at <= NOW() - INTERVAL '7 days' THEN 1 END)`,
        recentQuality: sql<number>`AVG(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN quality_score END)`,
        historicalQuality: sql<number>`AVG(CASE WHEN created_at <= NOW() - INTERVAL '7 days' THEN quality_score END)`
      })
      .from(leads)
      .where(sql`${leads.industry} IS NOT NULL`)
      .groupBy(leads.industry);

    for (const data of industries) {
      if (!data.industry) continue;
      
      const recentCount = Number(data.recentCount || 0);
      const historicalAvg = Number(data.historicalCount || 0) / 4; // Rough weekly average
      
      if (historicalAvg > 0) {
        const deviation = ((recentCount - historicalAvg) / historicalAvg) * 100;
        
        if (Math.abs(deviation) > 75) {
          anomalies.push({
            id: `industry_${data.industry}_${Date.now()}`,
            type: deviation > 0 ? 'demand_surge' : 'supply_shortage',
            severity: Math.abs(deviation) > 150 ? 'critical' : 'warning',
            description: `${data.industry} showing ${Math.round(Math.abs(deviation))}% ${deviation > 0 ? 'increase' : 'decrease'} in activity`,
            affectedSegment: data.industry,
            deviation,
            historicalContext: `Normal weekly volume is ${Math.round(historicalAvg)} leads`,
            recommendation: deviation > 0 ?
              `Prioritize ${data.industry} leads - high demand detected` :
              `Monitor ${data.industry} sector - supply constraints may affect pricing`,
            detectedAt: new Date()
          });
        }
      }
    }
    
    return anomalies;
  }

  /**
   * Helper: Create alert from anomaly
   */
  private async createAlert(anomaly: AnomalyDetection): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    try {
      await db.insert(insightAlerts).values({
        alertType: anomaly.type === 'volume_spike' ? 'anomaly' :
                  anomaly.type === 'demand_surge' ? 'market_opportunity' :
                  anomaly.type === 'supply_shortage' ? 'risk_warning' : 'anomaly',
        severity: anomaly.severity,
        title: anomaly.description,
        message: `${anomaly.description}. ${anomaly.historicalContext}`,
        details: {
          anomaly,
          detectedAt: anomaly.detectedAt,
          deviation: anomaly.deviation
        },
        recommendations: [anomaly.recommendation],
        actionRequired: anomaly.severity === 'critical',
        affectedCount: 0, // Would calculate based on segment
        expiresAt
      });
    } catch (error) {
      console.error('[InsightsDashboard] Failed to create alert:', error);
    }
  }

  /**
   * Helper: Get portfolio leads
   */
  private async getPortfolioLeads(userId?: string): Promise<Lead[]> {
    const query = userId ?
      db.select().from(leads).where(eq(leads.soldTo, userId)) :
      db.select().from(leads).where(eq(leads.sold, false));
    
    return await query.limit(100);
  }

  /**
   * Helper: Get empty portfolio response
   */
  private getEmptyPortfolio(): PortfolioAnalysis {
    return {
      totalLeads: 0,
      totalValue: 0,
      averageQuality: 0,
      riskProfile: 'conservative',
      expectedROI: 0,
      projectedRevenue: 0,
      topPerformers: [],
      underperformers: [],
      diversificationScore: 0,
      recommendations: [{
        action: 'buy',
        target: 'high_quality_leads',
        reasoning: 'Start building your portfolio with high-quality leads',
        expectedImpact: 100,
        priority: 'high',
        timeframe: 'immediate'
      }]
    };
  }

  /**
   * Helper: Calculate diversification score
   */
  private calculateDiversificationScore(leads: Lead[]): number {
    if (leads.length === 0) return 0;
    
    // Count unique industries and regions
    const industries = new Set(leads.map(l => l.industry).filter(Boolean));
    const regions = new Set(leads.map(l => l.stateCode).filter(Boolean));
    
    // Calculate diversity metrics
    const industryDiversity = Math.min(100, (industries.size / 10) * 100);
    const regionDiversity = Math.min(100, (regions.size / 20) * 100);
    
    // Check quality distribution
    const qualityBuckets = {
      low: leads.filter(l => (l.qualityScore || 0) < 40).length,
      medium: leads.filter(l => (l.qualityScore || 0) >= 40 && (l.qualityScore || 0) < 70).length,
      high: leads.filter(l => (l.qualityScore || 0) >= 70).length
    };
    
    const qualityDiversity = Object.values(qualityBuckets).filter(v => v > 0).length * 33;
    
    // Weighted average
    return Math.round(
      industryDiversity * 0.4 +
      regionDiversity * 0.3 +
      qualityDiversity * 0.3
    );
  }

  /**
   * Helper: Assess portfolio risk
   */
  private assessPortfolioRisk(leads: Lead[], predictions: any[]): 'conservative' | 'moderate' | 'aggressive' {
    if (leads.length === 0) return 'conservative';
    
    // Calculate average risk metrics
    const avgDefaultRisk = predictions.reduce((sum, p) => 
      sum + p.successProbability.defaultRisk, 0) / predictions.length;
    
    const avgQuality = leads.reduce((sum, l) => 
      sum + (l.qualityScore || 50), 0) / leads.length;
    
    // High risk industries
    const riskyIndustries = ['restaurant', 'retail', 'hospitality'];
    const riskyLeadsCount = leads.filter(l => 
      l.industry && riskyIndustries.includes(l.industry.toLowerCase())
    ).length;
    const riskyPercentage = riskyLeadsCount / leads.length;
    
    // Determine profile
    if (avgDefaultRisk > 0.3 || riskyPercentage > 0.4 || avgQuality < 50) {
      return 'aggressive';
    } else if (avgDefaultRisk < 0.15 && riskyPercentage < 0.2 && avgQuality > 70) {
      return 'conservative';
    }
    return 'moderate';
  }

  /**
   * Helper: Generate portfolio recommendations
   */
  private async generatePortfolioRecommendations(
    leads: Lead[],
    predictions: any[],
    diversificationScore: number,
    riskProfile: string
  ): Promise<PortfolioRecommendation[]> {
    const recommendations: PortfolioRecommendation[] = [];
    
    // Diversification recommendation
    if (diversificationScore < 60) {
      recommendations.push({
        action: 'optimize',
        target: 'portfolio_diversification',
        reasoning: 'Low diversification increases risk - spread investments across industries and regions',
        expectedImpact: 20,
        priority: 'high',
        timeframe: 'short_term'
      });
    }
    
    // Risk-based recommendations
    if (riskProfile === 'aggressive') {
      recommendations.push({
        action: 'sell',
        target: 'high_risk_leads',
        reasoning: 'Portfolio risk is too high - consider selling low-quality, high-risk leads',
        expectedImpact: 15,
        priority: 'medium',
        timeframe: 'immediate'
      });
    } else if (riskProfile === 'conservative') {
      recommendations.push({
        action: 'buy',
        target: 'growth_opportunities',
        reasoning: 'Portfolio is too conservative - add some higher-yield opportunities',
        expectedImpact: 25,
        priority: 'medium',
        timeframe: 'short_term'
      });
    }
    
    // Performance-based recommendations
    const underperformers = leads.filter(l => (l.intelligenceScore || 0) < 40);
    if (underperformers.length > leads.length * 0.2) {
      recommendations.push({
        action: 'sell',
        target: underperformers.map(l => l.id).join(','),
        reasoning: `${underperformers.length} underperforming leads dragging down portfolio performance`,
        expectedImpact: 30,
        priority: 'high',
        timeframe: 'immediate'
      });
    }
    
    // Opportunity recommendations
    const highROI = predictions.filter(p => p.roi.riskAdjustedROI > 50);
    if (highROI.length > 0) {
      recommendations.push({
        action: 'hold',
        target: highROI.map(p => p.leadId).join(','),
        reasoning: `${highROI.length} leads showing exceptional ROI potential`,
        expectedImpact: 40,
        priority: 'high',
        timeframe: 'long_term'
      });
    }
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Helper: Identify opportunities
   */
  private async identifyOpportunities(): Promise<OpportunityAlert[]> {
    const opportunities: OpportunityAlert[] = [];
    
    // High-value opportunities
    const highValueLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          sql`CAST(${leads.requestedAmount} AS INTEGER) > 50000`,
          sql`${leads.qualityScore} > 70`
        )
      )
      .limit(5);
    
    if (highValueLeads.length > 0) {
      opportunities.push({
        id: `high_value_${Date.now()}`,
        type: 'high_value',
        leads: highValueLeads,
        expectedValue: highValueLeads.reduce((sum, l) => 
          sum + (parseInt(l.requestedAmount || '0') || 0), 0),
        successProbability: 0.65,
        timeWindow: '48 hours',
        action: 'Contact immediately - high-value opportunities available'
      });
    }
    
    // Quick win opportunities
    const quickWins = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          eq(leads.urgencyLevel, 'immediate'),
          sql`${leads.qualityScore} > 60`
        )
      )
      .limit(5);
    
    if (quickWins.length > 0) {
      opportunities.push({
        id: `quick_win_${Date.now()}`,
        type: 'quick_win',
        leads: quickWins,
        expectedValue: quickWins.reduce((sum, l) => 
          sum + (parseInt(l.requestedAmount || '0') || 30000), 0),
        successProbability: 0.75,
        timeWindow: '24 hours',
        action: 'Fast-track these leads - immediate funding needed'
      });
    }
    
    // Exclusive opportunities
    const exclusiveLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          eq(leads.exclusivityStatus, 'exclusive')
        )
      )
      .limit(3);
    
    if (exclusiveLeads.length > 0) {
      opportunities.push({
        id: `exclusive_${Date.now()}`,
        type: 'exclusive',
        leads: exclusiveLeads,
        expectedValue: exclusiveLeads.reduce((sum, l) => 
          sum + (parseInt(l.requestedAmount || '0') || 30000), 0),
        successProbability: 0.8,
        timeWindow: '72 hours',
        action: 'Exclusive leads with no competition - premium opportunity'
      });
    }
    
    return opportunities;
  }

  /**
   * Helper: Identify risks
   */
  private async identifyRisks(): Promise<RiskAlert[]> {
    const risks: RiskAlert[] = [];
    
    // Market saturation risk
    const saturationData = await db
      .select({
        totalUnsold: sql<number>`COUNT(*)`,
        avgAge: sql<number>`AVG(EXTRACT(DAY FROM NOW() - created_at))`
      })
      .from(leads)
      .where(eq(leads.sold, false));
    
    const unsoldCount = Number(saturationData[0]?.totalUnsold || 0);
    const avgAge = Number(saturationData[0]?.avgAge || 0);
    
    if (unsoldCount > 500 && avgAge > 30) {
      risks.push({
        id: `saturation_${Date.now()}`,
        type: 'saturation',
        severity: unsoldCount > 1000 ? 'high' : 'medium',
        affectedLeads: unsoldCount,
        potentialLoss: unsoldCount * 50, // Estimated loss per stale lead
        mitigation: 'Consider aggressive pricing or bundling to move inventory'
      });
    }
    
    // Quality decline risk
    const qualityTrend = await this.analyzeQualityTrends();
    if (qualityTrend.trend === 'declining' && qualityTrend.improvement < -10) {
      risks.push({
        id: `quality_${Date.now()}`,
        type: 'quality_decline',
        severity: qualityTrend.improvement < -20 ? 'high' : 'medium',
        affectedLeads: 0, // Would calculate
        potentialLoss: Math.abs(qualityTrend.improvement) * 1000,
        mitigation: 'Review lead sources and tighten quality controls'
      });
    }
    
    // Competition risk
    const competitionData = await marketInsightsService.getMarketInsights();
    const highCompetition = competitionData.competitionAnalysis
      .filter(c => c.competitionIntensity === 'high' || c.competitionIntensity === 'extreme');
    
    if (highCompetition.length > 0) {
      risks.push({
        id: `competition_${Date.now()}`,
        type: 'competition_increase',
        severity: highCompetition.some(c => c.competitionIntensity === 'extreme') ? 'high' : 'medium',
        affectedLeads: 0, // Would calculate
        potentialLoss: highCompetition.length * 5000,
        mitigation: 'Differentiate offerings and focus on exclusive leads'
      });
    }
    
    return risks;
  }

  /**
   * Helper: Get new leads count
   */
  private async getNewLeadsCount(since: Date): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads)
      .where(gte(leads.createdAt, since));
    
    return Number(result[0]?.count || 0);
  }

  /**
   * Helper: Get conversion rate
   */
  private async getConversionRate(since: Date) {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)`,
        sold: sql<number>`COUNT(CASE WHEN sold = true THEN 1 END)`,
        avgDealSize: sql<number>`AVG(CAST(requested_amount AS INTEGER))`
      })
      .from(leads)
      .where(gte(leads.createdAt, since));
    
    const total = Number(result[0]?.total || 0);
    const sold = Number(result[0]?.sold || 0);
    
    return {
      rate: total > 0 ? sold / total : 0,
      avgDealSize: Number(result[0]?.avgDealSize || 30000)
    };
  }

  /**
   * Helper: Get top industry
   */
  private async getTopIndustry(since: Date) {
    const result = await db
      .select({
        industry: leads.industry,
        count: sql<number>`COUNT(*)`
      })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, since),
          sql`${leads.industry} IS NOT NULL`
        )
      )
      .groupBy(leads.industry)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(1);
    
    return {
      industry: result[0]?.industry || 'Unknown',
      count: Number(result[0]?.count || 0)
    };
  }

  /**
   * Helper: Get top region
   */
  private async getTopRegion(since: Date) {
    const result = await db
      .select({
        region: leads.stateCode,
        count: sql<number>`COUNT(*)`
      })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, since),
          sql`${leads.stateCode} IS NOT NULL`
        )
      )
      .groupBy(leads.stateCode)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(1);
    
    return {
      region: result[0]?.region || 'Unknown',
      count: Number(result[0]?.count || 0)
    };
  }

  /**
   * Helper: Generate market summary
   */
  private generateMarketSummary(data: any): string {
    const trend = data.conversionRate > 0.15 ? 'strong' :
                 data.conversionRate > 0.10 ? 'moderate' : 'challenging';
    
    return `Market conditions are ${trend} with ${data.newLeadsCount} new leads and ` +
           `${Math.round(data.conversionRate * 100)}% conversion rate. ` +
           `${data.topIndustry} and ${data.topRegion} are leading performers. ` +
           `Average deal size is $${Math.round(data.avgDealSize || 30000).toLocaleString()}.`;
  }

  /**
   * Helper: Generate action items
   */
  private generateActionItems(
    insights: DailyInsight[],
    opportunities: OpportunityAlert[],
    risks: RiskAlert[]
  ): ActionItem[] {
    const actionItems: ActionItem[] = [];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    // High priority insights
    for (const insight of insights.filter(i => i.priority === 'high')) {
      if (insight.actionRequired) {
        actionItems.push({
          id: `action_${insight.id}`,
          action: insight.actions[0],
          priority: 'urgent',
          deadline: tomorrow,
          expectedOutcome: insight.impact
        });
      }
    }
    
    // Critical opportunities
    for (const opp of opportunities.slice(0, 2)) {
      actionItems.push({
        id: `action_opp_${opp.id}`,
        action: opp.action,
        priority: 'high',
        deadline: new Date(Date.now() + (opp.timeWindow.includes('24') ? 1 : 2) * 24 * 60 * 60 * 1000),
        expectedOutcome: `Capture $${Math.round(opp.expectedValue).toLocaleString()} in value`
      });
    }
    
    // Critical risks
    for (const risk of risks.filter(r => r.severity === 'high')) {
      actionItems.push({
        id: `action_risk_${risk.id}`,
        action: risk.mitigation,
        priority: risk.severity === 'critical' ? 'urgent' : 'high',
        deadline: risk.severity === 'critical' ? tomorrow : nextWeek,
        expectedOutcome: `Mitigate $${Math.round(risk.potentialLoss).toLocaleString()} potential loss`
      });
    }
    
    return actionItems.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Helper: Analyze market indicators
   */
  private analyzeMarketIndicators(marketData: any): any[] {
    const indicators = [];
    
    // Demand/Supply indicator
    const avgDemand = marketData.industryTrends.reduce((sum: number, t: any) => 
      sum + t.demandIndex, 0) / Math.max(1, marketData.industryTrends.length);
    
    const avgSupply = marketData.industryTrends.reduce((sum: number, t: any) => 
      sum + t.supplyIndex, 0) / Math.max(1, marketData.industryTrends.length);
    
    indicators.push({
      name: 'Demand/Supply Ratio',
      value: avgDemand / Math.max(1, avgSupply),
      signal: avgDemand > avgSupply * 1.2 ? 'bullish' :
              avgDemand < avgSupply * 0.8 ? 'bearish' : 'neutral',
      weight: 0.3
    });
    
    // Momentum indicator
    const growthRates = marketData.industryTrends.map((t: any) => t.growthRate);
    const avgGrowth = growthRates.reduce((sum: number, r: number) => sum + r, 0) / Math.max(1, growthRates.length);
    
    indicators.push({
      name: 'Market Momentum',
      value: avgGrowth,
      signal: avgGrowth > 10 ? 'bullish' :
              avgGrowth < -10 ? 'bearish' : 'neutral',
      weight: 0.25
    });
    
    // Saturation indicator
    const avgSaturation = marketData.industryTrends.reduce((sum: number, t: any) => 
      sum + t.saturationLevel, 0) / Math.max(1, marketData.industryTrends.length);
    
    indicators.push({
      name: 'Market Saturation',
      value: avgSaturation,
      signal: avgSaturation < 30 ? 'bullish' :
              avgSaturation > 70 ? 'bearish' : 'neutral',
      weight: 0.2
    });
    
    // Competition indicator
    const avgCompetition = marketData.competitionAnalysis.reduce((sum: number, c: any) => {
      const intensity = c.competitionIntensity === 'extreme' ? 100 :
                       c.competitionIntensity === 'high' ? 75 :
                       c.competitionIntensity === 'moderate' ? 50 : 25;
      return sum + intensity;
    }, 0) / Math.max(1, marketData.competitionAnalysis.length);
    
    indicators.push({
      name: 'Competition Level',
      value: avgCompetition,
      signal: avgCompetition < 40 ? 'bullish' :
              avgCompetition > 60 ? 'bearish' : 'neutral',
      weight: 0.15
    });
    
    // Seasonal indicator
    const currentMonth = new Date().getMonth() + 1;
    const seasonalPattern = marketData.seasonalPatterns.find((p: any) => p.month === currentMonth);
    
    if (seasonalPattern) {
      indicators.push({
        name: 'Seasonal Factor',
        value: seasonalPattern.demandMultiplier,
        signal: seasonalPattern.demandMultiplier > 1.1 ? 'bullish' :
                seasonalPattern.demandMultiplier < 0.9 ? 'bearish' : 'neutral',
        weight: 0.1
      });
    }
    
    return indicators;
  }

  /**
   * Helper: Determine market phase
   */
  private determineMarketPhase(indicators: any[]): MarketTiming['currentPhase'] {
    // Calculate weighted score
    let score = 0;
    let totalWeight = 0;
    
    for (const indicator of indicators) {
      const signalScore = indicator.signal === 'bullish' ? 1 :
                         indicator.signal === 'bearish' ? -1 : 0;
      score += signalScore * indicator.weight;
      totalWeight += indicator.weight;
    }
    
    const normalizedScore = totalWeight > 0 ? score / totalWeight : 0;
    
    // Determine phase based on score
    if (normalizedScore > 0.5) return 'markup'; // Bull market
    if (normalizedScore > 0) return 'accumulation'; // Early bull
    if (normalizedScore > -0.5) return 'distribution'; // Early bear
    return 'markdown'; // Bear market
  }

  /**
   * Helper: Generate trading signal
   */
  private generateTradingSignal(
    phase: MarketTiming['currentPhase'],
    indicators: any[]
  ): MarketTiming['signal'] {
    // Count bullish/bearish signals
    const bullishCount = indicators.filter(i => i.signal === 'bullish').length;
    const bearishCount = indicators.filter(i => i.signal === 'bearish').length;
    
    // Generate signal based on phase and indicators
    if (phase === 'markup' && bullishCount > bearishCount * 2) {
      return 'strong_buy';
    } else if (phase === 'accumulation' || bullishCount > bearishCount) {
      return 'buy';
    } else if (phase === 'markdown' && bearishCount > bullishCount * 2) {
      return 'strong_sell';
    } else if (phase === 'distribution' || bearishCount > bullishCount) {
      return 'sell';
    }
    
    return 'hold';
  }

  /**
   * Helper: Calculate signal confidence
   */
  private calculateSignalConfidence(indicators: any[]): number {
    // Calculate agreement among indicators
    const signals = indicators.map(i => i.signal);
    const mode = this.getMode(signals);
    const agreement = signals.filter(s => s === mode).length / signals.length;
    
    // Weight by indicator confidence
    const avgWeight = indicators.reduce((sum, i) => sum + i.weight, 0) / indicators.length;
    
    return Math.round(agreement * avgWeight * 100);
  }

  /**
   * Helper: Get mode (most common value)
   */
  private getMode(arr: string[]): string {
    const frequency: Record<string, number> = {};
    let maxFreq = 0;
    let mode = arr[0];
    
    for (const item of arr) {
      frequency[item] = (frequency[item] || 0) + 1;
      if (frequency[item] > maxFreq) {
        maxFreq = frequency[item];
        mode = item;
      }
    }
    
    return mode;
  }

  /**
   * Helper: Generate optimal actions
   */
  private generateOptimalActions(
    phase: MarketTiming['currentPhase'],
    marketData: any
  ): any[] {
    const actions = [];
    
    // Phase-specific actions
    switch (phase) {
      case 'accumulation':
        actions.push({
          industry: 'all',
          action: 'Start building positions in high-quality leads',
          reasoning: 'Early bull phase - good entry opportunity'
        });
        break;
      
      case 'markup':
        actions.push({
          industry: 'all',
          action: 'Maximize lead acquisition and aggressive pursuit',
          reasoning: 'Bull market - capitalize on favorable conditions'
        });
        break;
      
      case 'distribution':
        actions.push({
          industry: 'all',
          action: 'Start taking profits on lower-quality leads',
          reasoning: 'Late bull phase - reduce exposure gradually'
        });
        break;
      
      case 'markdown':
        actions.push({
          industry: 'all',
          action: 'Focus on highest quality leads only',
          reasoning: 'Bear market - preserve capital and be selective'
        });
        break;
    }
    
    // Industry-specific actions
    const topIndustries = marketData.industryTrends
      .filter((t: any) => t.trendDirection === 'up')
      .slice(0, 3);
    
    for (const industry of topIndustries) {
      actions.push({
        industry: industry.industry,
        action: `Increase allocation to ${industry.industry}`,
        reasoning: `${Math.round(industry.growthRate)}% growth with strong demand`
      });
    }
    
    return actions;
  }
}

// Export singleton instance
export const insightsDashboardService = new InsightsDashboardService();