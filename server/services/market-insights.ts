import { db } from "../db";
import { leads, purchases, leadPerformance, marketInsights, marketBenchmarks, uccFilings } from "@shared/schema";
import type { Lead, MarketInsight, MarketBenchmark } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, asc, avg, count, sum } from "drizzle-orm";
import memoizee from "memoizee";

export interface IndustryTrend {
  industry: string;
  trendDirection: 'up' | 'down' | 'stable';
  trendStrength: number; // 0-100
  demandIndex: number; // 0-100
  supplyIndex: number; // 0-100
  competitionDensity: number; // 0-100
  saturationLevel: number; // 0-100
  growthRate: number; // Percentage
  averageDealSize: number;
  conversionRate: number;
  confidence: number;
}

export interface SeasonalPattern {
  month: number;
  demandMultiplier: number; // 1.0 = normal, 1.5 = 50% higher demand
  conversionRateMultiplier: number;
  averageDealSizeMultiplier: number;
  optimalDays: number[]; // Best days of the month
  confidence: number;
}

export interface GeographicHotspot {
  region: string;
  opportunityScore: number; // 0-100
  demandLevel: number; // 0-100
  competitionLevel: number; // 0-100
  averageDealSize: number;
  conversionRate: number;
  growthRate: number; // YoY percentage
  topIndustries: string[];
  confidence: number;
}

export interface MarketForecast {
  timeframe: number; // Days ahead
  predictedDemand: number; // 0-100 index
  predictedSupply: number; // 0-100 index
  predictedConversionRate: number;
  predictedAverageDealSize: number;
  marketConditions: 'buyer_market' | 'seller_market' | 'balanced';
  confidence: number;
  factors: string[]; // Key factors influencing forecast
}

export interface CompetitionAnalysis {
  industry: string;
  region?: string;
  competitorCount: number;
  marketShare: number; // Our share
  averageCompetitorScore: number;
  competitionIntensity: 'low' | 'moderate' | 'high' | 'extreme';
  opportunities: string[];
  threats: string[];
}

export interface MarketInsightResult {
  industryTrends: IndustryTrend[];
  seasonalPatterns: SeasonalPattern[];
  geographicHotspots: GeographicHotspot[];
  marketForecasts: MarketForecast[];
  competitionAnalysis: CompetitionAnalysis[];
  overallMarketCondition: 'excellent' | 'good' | 'neutral' | 'challenging' | 'poor';
  keyInsights: string[];
  recommendations: string[];
  calculatedAt: Date;
}

/**
 * Market Trend Analysis Service
 * Analyzes market trends, patterns, and opportunities using historical data
 */
export class MarketInsightsService {
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

  /**
   * Get comprehensive market insights with caching
   */
  async getMarketInsights(
    filters?: {
      industry?: string;
      region?: string;
      timeframe?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
      forceRefresh?: boolean;
    }
  ): Promise<MarketInsightResult> {
    // Build cache key from filters
    const cacheKey = this.buildCacheKey(filters);
    
    // Check if we should force refresh
    if (!filters?.forceRefresh) {
      // Try to get cached insights first
      const cachedResult = await this.getCachedInsights(cacheKey);
      if (cachedResult) {
        console.log(`[MarketInsights] Returning cached insights for key: ${cacheKey}`);
        return cachedResult;
      }
    }

    console.log(`[MarketInsights] Computing new insights for key: ${cacheKey}`);
    
    // If no cache or force refresh, compute new insights
    const [
      industryTrends,
      seasonalPatterns,
      geographicHotspots,
      marketForecasts,
      competitionAnalysis
    ] = await Promise.all([
      this.analyzeIndustryTrends(filters?.industry),
      this.analyzeSeasonalPatterns(filters?.industry, filters?.region),
      this.analyzeGeographicHotspots(filters?.industry),
      this.generateMarketForecasts(filters?.industry, filters?.region),
      this.analyzeCompetition(filters?.industry, filters?.region)
    ]);

    const overallMarketCondition = this.calculateOverallMarketCondition(
      industryTrends,
      geographicHotspots,
      marketForecasts
    );

    const keyInsights = this.generateKeyInsights(
      industryTrends,
      seasonalPatterns,
      geographicHotspots,
      marketForecasts,
      competitionAnalysis
    );

    const recommendations = this.generateRecommendations(
      industryTrends,
      seasonalPatterns,
      geographicHotspots,
      marketForecasts,
      competitionAnalysis
    );

    const result: MarketInsightResult = {
      industryTrends,
      seasonalPatterns,
      geographicHotspots,
      marketForecasts,
      competitionAnalysis,
      overallMarketCondition,
      keyInsights,
      recommendations,
      calculatedAt: new Date()
    };

    // Store insights in database with cache expiry
    await this.storeMarketInsights({
      ...result,
      cacheKey,
      filters
    });

    return result;
  }

  /**
   * Build a cache key from filters
   */
  private buildCacheKey(filters?: {
    industry?: string;
    region?: string;
    timeframe?: string;
    forceRefresh?: boolean;
  }): string {
    const parts = [
      'market_insights',
      filters?.industry || 'all',
      filters?.region || 'all',
      filters?.timeframe || 'monthly'
    ];
    return parts.join(':');
  }

  /**
   * Get cached insights from database
   */
  private async getCachedInsights(cacheKey: string): Promise<MarketInsightResult | null> {
    try {
      const now = new Date();
      
      // Query for cached insights that haven't expired
      const cached = await db
        .select()
        .from(marketInsights)
        .where(
          and(
            sql`${marketInsights.analysisMetadata}->>'cacheKey' = ${cacheKey}`,
            gte(marketInsights.expiresAt, now)
          )
        )
        .orderBy(desc(marketInsights.calculatedAt))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const cachedData = cached[0];
      
      // Reconstruct the result from cached data
      return {
        industryTrends: cachedData.analysisMetadata?.industryTrends || [],
        seasonalPatterns: cachedData.seasonalFactors as any || [],
        geographicHotspots: cachedData.geographicHotspots as any || [],
        marketForecasts: cachedData.forecastedDemand as any || [],
        competitionAnalysis: cachedData.analysisMetadata?.competitionAnalysis || [],
        overallMarketCondition: cachedData.analysisMetadata?.overallMarketCondition || 'neutral',
        keyInsights: cachedData.analysisMetadata?.keyInsights || [],
        recommendations: cachedData.analysisMetadata?.recommendations || [],
        calculatedAt: cachedData.calculatedAt
      };
    } catch (error) {
      console.error('[MarketInsights] Error fetching cached insights:', error);
      return null;
    }
  }

  /**
   * Analyze industry trends using historical data
   */
  private async analyzeIndustryTrends(targetIndustry?: string): Promise<IndustryTrend[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Get industry performance data
    const industryData = await db
      .select({
        industry: leads.industry,
        totalLeads: count(leads.id),
        soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`),
        avgCreditScore: avg(sql<number>`CAST(${leads.creditScore} AS INTEGER)`),
        avgRevenue: avg(sql<number>`CAST(${leads.annualRevenue} AS INTEGER)`)
      })
      .from(leads)
      .where(targetIndustry ? eq(leads.industry, targetIndustry) : sql`1=1`)
      .groupBy(leads.industry)
      .having(sql`COUNT(${leads.id}) > 5`); // Only industries with sufficient data

    const trends: IndustryTrend[] = [];

    for (const data of industryData) {
      if (!data.industry) continue;

      // Calculate trend by comparing recent vs older data
      const [recentPerformance, olderPerformance] = await Promise.all([
        this.getIndustryPerformance(data.industry, thirtyDaysAgo, new Date()),
        this.getIndustryPerformance(data.industry, sixtyDaysAgo, thirtyDaysAgo)
      ]);

      const conversionRate = data.totalLeads > 0 ? 
        (Number(data.soldLeads) / Number(data.totalLeads)) : 0;

      const growthRate = olderPerformance.totalLeads > 0 ?
        ((recentPerformance.totalLeads - olderPerformance.totalLeads) / olderPerformance.totalLeads) * 100 : 0;

      const trendDirection = growthRate > 5 ? 'up' : growthRate < -5 ? 'down' : 'stable';
      const trendStrength = Math.min(100, Math.abs(growthRate) * 2);

      // Calculate market indices
      const demandIndex = Math.min(100, conversionRate * 200); // Higher conversion = higher demand
      const supplyIndex = Math.min(100, (Number(data.totalLeads) / 100) * 20); // More leads = higher supply
      const competitionDensity = this.calculateCompetitionDensity(Number(data.totalLeads), conversionRate);
      const saturationLevel = this.calculateSaturationLevel(supplyIndex, demandIndex);

      trends.push({
        industry: data.industry,
        trendDirection,
        trendStrength,
        demandIndex,
        supplyIndex,
        competitionDensity,
        saturationLevel,
        growthRate,
        averageDealSize: Number(data.avgDealSize) || 0,
        conversionRate,
        confidence: this.calculateConfidence(Number(data.totalLeads))
      });
    }

    return trends.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Analyze seasonal patterns in the data
   */
  private async analyzeSeasonalPatterns(
    industry?: string,
    region?: string
  ): Promise<SeasonalPattern[]> {
    const patterns: SeasonalPattern[] = [];
    
    // Analyze patterns for each month
    for (let month = 1; month <= 12; month++) {
      const monthData = await db
        .select({
          totalLeads: count(leads.id),
          soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
          avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`),
          avgTimeToClose: avg(leadPerformance.timeToClose)
        })
        .from(leads)
        .leftJoin(leadPerformance, eq(leads.id, leadPerformance.leadId))
        .where(
          and(
            sql`EXTRACT(MONTH FROM ${leads.createdAt}) = ${month}`,
            industry ? eq(leads.industry, industry) : sql`1=1`,
            region ? eq(leads.stateCode, region) : sql`1=1`
          )
        );

      const data = monthData[0];
      if (!data || Number(data.totalLeads) === 0) continue;

      // Calculate monthly multipliers compared to yearly average
      const yearlyAvg = await this.getYearlyAverages(industry, region);
      
      const demandMultiplier = yearlyAvg.avgMonthlyLeads > 0 ?
        Number(data.totalLeads) / yearlyAvg.avgMonthlyLeads : 1;
        
      const conversionRate = Number(data.totalLeads) > 0 ?
        Number(data.soldLeads) / Number(data.totalLeads) : 0;
        
      const conversionRateMultiplier = yearlyAvg.avgConversionRate > 0 ?
        conversionRate / yearlyAvg.avgConversionRate : 1;
        
      const dealSizeMultiplier = yearlyAvg.avgDealSize > 0 && data.avgDealSize ?
        Number(data.avgDealSize) / yearlyAvg.avgDealSize : 1;

      // Determine optimal days (simplified - in real world, would analyze daily patterns)
      const optimalDays = this.calculateOptimalDays(month);

      patterns.push({
        month,
        demandMultiplier: Math.round(demandMultiplier * 100) / 100,
        conversionRateMultiplier: Math.round(conversionRateMultiplier * 100) / 100,
        averageDealSizeMultiplier: Math.round(dealSizeMultiplier * 100) / 100,
        optimalDays,
        confidence: this.calculateConfidence(Number(data.totalLeads))
      });
    }

    return patterns;
  }

  /**
   * Identify geographic hotspots
   */
  private async analyzeGeographicHotspots(industry?: string): Promise<GeographicHotspot[]> {
    const regionData = await db
      .select({
        region: leads.stateCode,
        totalLeads: count(leads.id),
        soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`),
        avgCreditScore: avg(sql<number>`CAST(${leads.creditScore} AS INTEGER)`)
      })
      .from(leads)
      .where(
        and(
          sql`${leads.stateCode} IS NOT NULL`,
          industry ? eq(leads.industry, industry) : sql`1=1`
        )
      )
      .groupBy(leads.stateCode)
      .having(sql`COUNT(${leads.id}) > 3`); // Only regions with sufficient data

    const hotspots: GeographicHotspot[] = [];

    for (const data of regionData) {
      if (!data.region) continue;

      const conversionRate = Number(data.totalLeads) > 0 ?
        Number(data.soldLeads) / Number(data.totalLeads) : 0;

      // Get top industries for this region
      const topIndustries = await this.getTopIndustriesForRegion(data.region);

      // Calculate opportunity score
      const opportunityScore = this.calculateOpportunityScore(
        conversionRate,
        Number(data.avgDealSize) || 0,
        Number(data.avgCreditScore) || 0
      );

      // Calculate competition level
      const competitionLevel = this.calculateRegionalCompetition(Number(data.totalLeads));

      // Calculate growth rate (simplified - comparing to previous period)
      const growthRate = await this.calculateRegionalGrowthRate(data.region);

      hotspots.push({
        region: data.region,
        opportunityScore,
        demandLevel: Math.min(100, conversionRate * 150),
        competitionLevel,
        averageDealSize: Number(data.avgDealSize) || 0,
        conversionRate,
        growthRate,
        topIndustries,
        confidence: this.calculateConfidence(Number(data.totalLeads))
      });
    }

    return hotspots.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Generate market forecasts
   */
  private async generateMarketForecasts(
    industry?: string,
    region?: string
  ): Promise<MarketForecast[]> {
    const forecasts: MarketForecast[] = [];
    const timeframes = [7, 30, 60, 90]; // Days ahead

    for (const timeframe of timeframes) {
      // Get historical data for pattern analysis
      const historicalData = await this.getHistoricalData(timeframe, industry, region);
      
      // Simple moving average prediction
      const predictedDemand = this.predictDemand(historicalData);
      const predictedSupply = this.predictSupply(historicalData);
      const predictedConversionRate = this.predictConversionRate(historicalData);
      const predictedAverageDealSize = this.predictDealSize(historicalData);

      // Determine market conditions
      const marketConditions = this.determineMarketConditions(
        predictedDemand,
        predictedSupply
      );

      // Identify key factors
      const factors = this.identifyKeyFactors(historicalData, timeframe);

      forecasts.push({
        timeframe,
        predictedDemand,
        predictedSupply,
        predictedConversionRate,
        predictedAverageDealSize,
        marketConditions,
        confidence: this.calculateForecastConfidence(historicalData, timeframe),
        factors
      });
    }

    return forecasts;
  }

  /**
   * Analyze competition in the market
   */
  private async analyzeCompetition(
    industry?: string,
    region?: string
  ): Promise<CompetitionAnalysis[]> {
    const analyses: CompetitionAnalysis[] = [];

    // Get competition data
    const competitionData = await db
      .select({
        industry: leads.industry,
        region: leads.stateCode,
        totalLeads: count(leads.id),
        avgQualityScore: avg(leads.qualityScore)
      })
      .from(leads)
      .where(
        and(
          industry ? eq(leads.industry, industry) : sql`1=1`,
          region ? eq(leads.stateCode, region) : sql`1=1`
        )
      )
      .groupBy(leads.industry, leads.stateCode);

    for (const data of competitionData) {
      if (!data.industry) continue;

      const competitorCount = await this.estimateCompetitorCount(data.industry, data.region || undefined);
      const marketShare = await this.calculateMarketShare(data.industry, data.region || undefined);
      const competitionIntensity = this.determineCompetitionIntensity(competitorCount, Number(data.totalLeads));

      const analysis: CompetitionAnalysis = {
        industry: data.industry,
        region: data.region || undefined,
        competitorCount,
        marketShare,
        averageCompetitorScore: Number(data.avgQualityScore) || 0,
        competitionIntensity,
        opportunities: this.identifyOpportunities(data.industry, competitionIntensity),
        threats: this.identifyThreats(data.industry, competitionIntensity)
      };

      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Helper: Get industry performance for a time period
   */
  private async getIndustryPerformance(
    industry: string,
    startDate: Date,
    endDate: Date
  ) {
    const result = await db
      .select({
        totalLeads: count(leads.id),
        soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`)
      })
      .from(leads)
      .where(
        and(
          eq(leads.industry, industry),
          gte(leads.createdAt, startDate),
          lte(leads.createdAt, endDate)
        )
      );

    return {
      totalLeads: Number(result[0]?.totalLeads || 0),
      soldLeads: Number(result[0]?.soldLeads || 0),
      avgDealSize: Number(result[0]?.avgDealSize || 0)
    };
  }

  /**
   * Helper: Calculate competition density
   */
  private calculateCompetitionDensity(totalLeads: number, conversionRate: number): number {
    // High leads with low conversion = high competition
    // Low leads with high conversion = low competition
    const densityScore = totalLeads > 50 ? 
      Math.min(100, (totalLeads / 100) * (1 - conversionRate) * 100) : 
      Math.max(0, 50 - (conversionRate * 50));
    
    return Math.round(densityScore);
  }

  /**
   * Helper: Calculate market saturation level
   */
  private calculateSaturationLevel(supplyIndex: number, demandIndex: number): number {
    // High supply with low demand = high saturation
    const saturation = supplyIndex > demandIndex ?
      Math.min(100, ((supplyIndex - demandIndex) / supplyIndex) * 100) :
      0;
    
    return Math.round(saturation);
  }

  /**
   * Helper: Calculate confidence based on sample size
   */
  private calculateConfidence(sampleSize: number): number {
    // Logarithmic confidence scale
    if (sampleSize < 10) return 25;
    if (sampleSize < 25) return 50;
    if (sampleSize < 50) return 70;
    if (sampleSize < 100) return 85;
    return Math.min(95, 85 + Math.log10(sampleSize / 100) * 10);
  }

  /**
   * Helper: Calculate opportunity score
   */
  private calculateOpportunityScore(
    conversionRate: number,
    avgDealSize: number,
    avgCreditScore: number
  ): number {
    const conversionScore = conversionRate * 100 * 0.4; // 40% weight
    const dealSizeScore = Math.min(100, (avgDealSize / 50000) * 100) * 0.35; // 35% weight
    const creditScore = (avgCreditScore / 850) * 100 * 0.25; // 25% weight
    
    return Math.round(conversionScore + dealSizeScore + creditScore);
  }

  /**
   * Helper: Get yearly averages for comparison
   */
  private async getYearlyAverages(industry?: string, region?: string) {
    const yearlyData = await db
      .select({
        totalLeads: count(leads.id),
        soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`)
      })
      .from(leads)
      .where(
        and(
          industry ? eq(leads.industry, industry) : sql`1=1`,
          region ? eq(leads.stateCode, region) : sql`1=1`
        )
      );

    const data = yearlyData[0];
    const totalLeads = Number(data?.totalLeads || 0);
    const soldLeads = Number(data?.soldLeads || 0);

    return {
      avgMonthlyLeads: totalLeads / 12,
      avgConversionRate: totalLeads > 0 ? soldLeads / totalLeads : 0,
      avgDealSize: Number(data?.avgDealSize || 0)
    };
  }

  /**
   * Helper: Calculate optimal days for a month
   */
  private calculateOptimalDays(month: number): number[] {
    // Simplified: Tuesdays, Wednesdays, and Thursdays tend to be best
    // In real implementation, would analyze actual daily patterns
    return [2, 3, 4, 9, 10, 11, 16, 17, 18, 23, 24, 25];
  }

  /**
   * Helper: Get top industries for a region
   */
  private async getTopIndustriesForRegion(region: string): Promise<string[]> {
    const industries = await db
      .select({
        industry: leads.industry,
        count: count(leads.id)
      })
      .from(leads)
      .where(
        and(
          eq(leads.stateCode, region),
          sql`${leads.industry} IS NOT NULL`
        )
      )
      .groupBy(leads.industry)
      .orderBy(desc(sql`COUNT(${leads.id})`))
      .limit(3);

    return industries.map(i => i.industry!).filter(Boolean);
  }

  /**
   * Helper: Calculate regional competition level
   */
  private calculateRegionalCompetition(leadCount: number): number {
    // Simple competition calculation based on lead density
    if (leadCount < 10) return 20;
    if (leadCount < 25) return 40;
    if (leadCount < 50) return 60;
    if (leadCount < 100) return 80;
    return 95;
  }

  /**
   * Helper: Calculate regional growth rate
   */
  private async calculateRegionalGrowthRate(region: string): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [recent, older] = await Promise.all([
      db.select({ count: count(leads.id) })
        .from(leads)
        .where(and(
          eq(leads.stateCode, region),
          gte(leads.createdAt, thirtyDaysAgo)
        )),
      db.select({ count: count(leads.id) })
        .from(leads)
        .where(and(
          eq(leads.stateCode, region),
          lte(leads.createdAt, thirtyDaysAgo)
        ))
    ]);

    const recentCount = Number(recent[0]?.count || 0);
    const olderCount = Number(older[0]?.count || 0);

    return olderCount > 0 ? 
      Math.round(((recentCount - olderCount) / olderCount) * 100) : 0;
  }

  /**
   * Helper: Get historical data for forecasting
   */
  private async getHistoricalData(
    daysBack: number,
    industry?: string,
    region?: string
  ) {
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    return await db
      .select({
        date: sql<string>`DATE(${leads.createdAt})`,
        totalLeads: count(leads.id),
        soldLeads: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        avgDealSize: avg(sql<number>`CAST(${leads.requestedAmount} AS INTEGER)`)
      })
      .from(leads)
      .where(
        and(
          gte(leads.createdAt, startDate),
          industry ? eq(leads.industry, industry) : sql`1=1`,
          region ? eq(leads.stateCode, region) : sql`1=1`
        )
      )
      .groupBy(sql`DATE(${leads.createdAt})`)
      .orderBy(asc(sql`DATE(${leads.createdAt})`));
  }

  /**
   * Helper: Predict demand using simple moving average
   */
  private predictDemand(historicalData: any[]): number {
    if (historicalData.length === 0) return 50;
    
    const recentData = historicalData.slice(-7); // Last 7 days
    const avgLeads = recentData.reduce((sum, d) => sum + Number(d.totalLeads), 0) / recentData.length;
    
    // Normalize to 0-100 scale
    return Math.min(100, Math.round((avgLeads / 10) * 100));
  }

  /**
   * Helper: Predict supply
   */
  private predictSupply(historicalData: any[]): number {
    if (historicalData.length === 0) return 50;
    
    // Calculate trend in new leads
    const recentData = historicalData.slice(-7);
    const olderData = historicalData.slice(-14, -7);
    
    const recentAvg = recentData.reduce((sum, d) => sum + Number(d.totalLeads), 0) / Math.max(1, recentData.length);
    const olderAvg = olderData.reduce((sum, d) => sum + Number(d.totalLeads), 0) / Math.max(1, olderData.length);
    
    const trend = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
    const predictedSupply = recentAvg * (1 + trend);
    
    return Math.min(100, Math.round((predictedSupply / 10) * 100));
  }

  /**
   * Helper: Predict conversion rate
   */
  private predictConversionRate(historicalData: any[]): number {
    if (historicalData.length === 0) return 0.15;
    
    const recentData = historicalData.slice(-14);
    let totalLeads = 0;
    let totalSold = 0;
    
    for (const data of recentData) {
      totalLeads += Number(data.totalLeads);
      totalSold += Number(data.soldLeads);
    }
    
    return totalLeads > 0 ? totalSold / totalLeads : 0.15;
  }

  /**
   * Helper: Predict average deal size
   */
  private predictDealSize(historicalData: any[]): number {
    if (historicalData.length === 0) return 30000;
    
    const recentData = historicalData.slice(-14);
    const avgDealSizes = recentData
      .map(d => Number(d.avgDealSize))
      .filter(size => size > 0);
    
    if (avgDealSizes.length === 0) return 30000;
    
    return Math.round(
      avgDealSizes.reduce((sum, size) => sum + size, 0) / avgDealSizes.length
    );
  }

  /**
   * Helper: Determine market conditions
   */
  private determineMarketConditions(
    demand: number,
    supply: number
  ): 'buyer_market' | 'seller_market' | 'balanced' {
    const ratio = demand / Math.max(1, supply);
    
    if (ratio > 1.2) return 'seller_market';
    if (ratio < 0.8) return 'buyer_market';
    return 'balanced';
  }

  /**
   * Helper: Identify key factors influencing forecast
   */
  private identifyKeyFactors(historicalData: any[], timeframe: number): string[] {
    const factors: string[] = [];
    
    if (historicalData.length > 0) {
      // Check for trends
      const recentAvg = historicalData.slice(-7).reduce((sum, d) => sum + Number(d.totalLeads), 0) / 7;
      const overallAvg = historicalData.reduce((sum, d) => sum + Number(d.totalLeads), 0) / historicalData.length;
      
      if (recentAvg > overallAvg * 1.2) {
        factors.push("Rising demand trend detected");
      } else if (recentAvg < overallAvg * 0.8) {
        factors.push("Declining demand trend detected");
      }
    }
    
    // Add seasonal factors
    const currentMonth = new Date().getMonth() + 1;
    if ([1, 2, 3].includes(currentMonth)) {
      factors.push("Q1 typically shows increased funding activity");
    } else if ([7, 8].includes(currentMonth)) {
      factors.push("Summer months may show reduced activity");
    } else if ([11, 12].includes(currentMonth)) {
      factors.push("Year-end funding rush expected");
    }
    
    // Add timeframe-specific factors
    if (timeframe <= 7) {
      factors.push("Short-term forecast based on recent patterns");
    } else if (timeframe <= 30) {
      factors.push("Monthly seasonality patterns considered");
    } else {
      factors.push("Long-term trends and seasonal cycles analyzed");
    }
    
    return factors;
  }

  /**
   * Helper: Calculate forecast confidence
   */
  private calculateForecastConfidence(historicalData: any[], timeframe: number): number {
    const dataPoints = historicalData.length;
    
    // Less confidence for longer timeframes
    const timeframeMultiplier = timeframe <= 7 ? 1 : 
                               timeframe <= 30 ? 0.8 : 
                               timeframe <= 60 ? 0.6 : 0.4;
    
    // More data = more confidence
    const dataConfidence = Math.min(95, 50 + (dataPoints * 2));
    
    return Math.round(dataConfidence * timeframeMultiplier);
  }

  /**
   * Helper: Estimate competitor count
   */
  private async estimateCompetitorCount(industry: string, region?: string): Promise<number> {
    // In real implementation, would use external data or more sophisticated analysis
    // For now, estimate based on lead volume
    const leadCount = await db
      .select({ count: count(leads.id) })
      .from(leads)
      .where(
        and(
          eq(leads.industry, industry),
          region ? eq(leads.stateCode, region) : sql`1=1`
        )
      );
    
    const count = Number(leadCount[0]?.count || 0);
    
    // Rough estimation: more leads = more competitors
    if (count < 10) return 2;
    if (count < 25) return 5;
    if (count < 50) return 10;
    if (count < 100) return 20;
    return 30;
  }

  /**
   * Helper: Calculate market share
   */
  private async calculateMarketShare(industry: string, region?: string): Promise<number> {
    // Simplified: based on our lead volume vs estimated total market
    const ourLeads = await db
      .select({ count: count(leads.id) })
      .from(leads)
      .where(
        and(
          eq(leads.industry, industry),
          region ? eq(leads.stateCode, region) : sql`1=1`,
          eq(leads.sold, true)
        )
      );
    
    const ourCount = Number(ourLeads[0]?.count || 0);
    const estimatedMarketSize = ourCount * 10; // Assume we have 10% market share baseline
    
    return Math.min(100, Math.round((ourCount / estimatedMarketSize) * 100));
  }

  /**
   * Helper: Determine competition intensity
   */
  private determineCompetitionIntensity(
    competitorCount: number,
    leadVolume: number
  ): 'low' | 'moderate' | 'high' | 'extreme' {
    const ratio = competitorCount / Math.max(1, leadVolume / 10);
    
    if (ratio < 0.5) return 'low';
    if (ratio < 1) return 'moderate';
    if (ratio < 2) return 'high';
    return 'extreme';
  }

  /**
   * Helper: Identify market opportunities
   */
  private identifyOpportunities(
    industry: string,
    competitionIntensity: string
  ): string[] {
    const opportunities: string[] = [];
    
    if (competitionIntensity === 'low' || competitionIntensity === 'moderate') {
      opportunities.push("Low competition presents expansion opportunity");
    }
    
    // Industry-specific opportunities
    const growthIndustries = ['technology', 'healthcare', 'e-commerce'];
    if (growthIndustries.includes(industry.toLowerCase())) {
      opportunities.push(`Strong growth potential in ${industry} sector`);
    }
    
    opportunities.push("Opportunity to capture market share with quality leads");
    opportunities.push("Potential for premium pricing in underserved segments");
    
    return opportunities;
  }

  /**
   * Helper: Identify market threats
   */
  private identifyThreats(
    industry: string,
    competitionIntensity: string
  ): string[] {
    const threats: string[] = [];
    
    if (competitionIntensity === 'high' || competitionIntensity === 'extreme') {
      threats.push("High competition may pressure margins");
    }
    
    // Industry-specific threats
    const riskyIndustries = ['restaurant', 'retail', 'hospitality'];
    if (riskyIndustries.includes(industry.toLowerCase())) {
      threats.push(`Higher default risk in ${industry} sector`);
    }
    
    threats.push("Market saturation risk in mature segments");
    threats.push("Potential for price competition");
    
    return threats;
  }

  /**
   * Calculate overall market condition
   */
  private calculateOverallMarketCondition(
    trends: IndustryTrend[],
    hotspots: GeographicHotspot[],
    forecasts: MarketForecast[]
  ): 'excellent' | 'good' | 'neutral' | 'challenging' | 'poor' {
    let score = 0;
    let weight = 0;

    // Weight industry trends
    for (const trend of trends) {
      const trendScore = (trend.demandIndex + (100 - trend.saturationLevel)) / 2;
      score += trendScore * trend.confidence;
      weight += trend.confidence;
    }

    // Weight geographic opportunities
    for (const hotspot of hotspots.slice(0, 5)) {
      score += hotspot.opportunityScore * hotspot.confidence;
      weight += hotspot.confidence;
    }

    // Weight market forecasts
    for (const forecast of forecasts) {
      const forecastScore = forecast.marketConditions === 'seller_market' ? 80 :
                           forecast.marketConditions === 'balanced' ? 50 : 20;
      score += forecastScore * forecast.confidence;
      weight += forecast.confidence;
    }

    const avgScore = weight > 0 ? score / weight : 50;

    if (avgScore >= 80) return 'excellent';
    if (avgScore >= 65) return 'good';
    if (avgScore >= 45) return 'neutral';
    if (avgScore >= 30) return 'challenging';
    return 'poor';
  }

  /**
   * Generate key insights from analysis
   */
  private generateKeyInsights(
    trends: IndustryTrend[],
    patterns: SeasonalPattern[],
    hotspots: GeographicHotspot[],
    forecasts: MarketForecast[],
    competition: CompetitionAnalysis[]
  ): string[] {
    const insights: string[] = [];

    // Top performing industries
    const topIndustries = trends
      .filter(t => t.trendDirection === 'up')
      .slice(0, 3);
    
    if (topIndustries.length > 0) {
      insights.push(
        `Growing industries: ${topIndustries.map(t => t.industry).join(', ')} showing ${Math.round(topIndustries[0].growthRate)}% growth`
      );
    }

    // Best geographic regions
    const topRegions = hotspots.slice(0, 3);
    if (topRegions.length > 0) {
      insights.push(
        `Top opportunity regions: ${topRegions.map(h => h.region).join(', ')} with ${Math.round(topRegions[0].opportunityScore)}% opportunity score`
      );
    }

    // Seasonal insights
    const currentMonth = new Date().getMonth() + 1;
    const currentPattern = patterns.find(p => p.month === currentMonth);
    if (currentPattern && currentPattern.demandMultiplier > 1.1) {
      insights.push(
        `Current month shows ${Math.round((currentPattern.demandMultiplier - 1) * 100)}% higher demand than average`
      );
    }

    // Market forecast insights
    const shortTermForecast = forecasts.find(f => f.timeframe === 7);
    if (shortTermForecast) {
      insights.push(
        `Next 7 days: ${shortTermForecast.marketConditions.replace('_', ' ')} conditions expected`
      );
    }

    // Competition insights
    const highCompetition = competition.filter(c => c.competitionIntensity === 'high' || c.competitionIntensity === 'extreme');
    if (highCompetition.length > 0) {
      insights.push(
        `High competition detected in ${highCompetition.length} market segments`
      );
    }

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    trends: IndustryTrend[],
    patterns: SeasonalPattern[],
    hotspots: GeographicHotspot[],
    forecasts: MarketForecast[],
    competition: CompetitionAnalysis[]
  ): string[] {
    const recommendations: string[] = [];

    // Industry recommendations
    const bestIndustry = trends.find(t => t.demandIndex > 70 && t.saturationLevel < 30);
    if (bestIndustry) {
      recommendations.push(
        `Focus on ${bestIndustry.industry} leads - high demand with low saturation`
      );
    }

    // Geographic recommendations
    const bestRegion = hotspots[0];
    if (bestRegion && bestRegion.opportunityScore > 70) {
      recommendations.push(
        `Prioritize ${bestRegion.region} region - ${Math.round(bestRegion.conversionRate * 100)}% conversion rate`
      );
    }

    // Timing recommendations
    const currentMonth = new Date().getMonth() + 1;
    const nextMonth = patterns.find(p => p.month === (currentMonth % 12) + 1);
    if (nextMonth && nextMonth.demandMultiplier > 1.2) {
      recommendations.push(
        `Prepare for increased demand next month - ${Math.round((nextMonth.demandMultiplier - 1) * 100)}% above average`
      );
    }

    // Competition recommendations
    const lowCompetition = competition.find(c => c.competitionIntensity === 'low');
    if (lowCompetition) {
      recommendations.push(
        `Opportunity in ${lowCompetition.industry} - low competition with ${lowCompetition.marketShare}% market share potential`
      );
    }

    // Market condition recommendations
    const forecast = forecasts[0];
    if (forecast && forecast.marketConditions === 'seller_market') {
      recommendations.push(
        "Seller's market conditions - consider premium pricing strategies"
      );
    } else if (forecast && forecast.marketConditions === 'buyer_market') {
      recommendations.push(
        "Buyer's market conditions - focus on volume and competitive pricing"
      );
    }

    return recommendations;
  }

  /**
   * Store market insights in database with caching
   */
  private async storeMarketInsights(data: any): Promise<void> {
    // Use 1 hour cache duration as specified in requirements
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION);

    try {
      // First check if an entry with this cache key exists
      const existing = await db
        .select()
        .from(marketInsights)
        .where(sql`${marketInsights.analysisMetadata}->>'cacheKey' = ${data.cacheKey}`)
        .limit(1);

      const insightData = {
        insightType: 'comprehensive',
        industry: data.filters?.industry,
        region: data.filters?.region,
        timeframe: data.filters?.timeframe || 'monthly',
        trendDirection: this.getOverallTrendDirection(data.industryTrends),
        trendStrength: this.getAverageTrendStrength(data.industryTrends),
        demandIndex: this.getAverageDemandIndex(data.industryTrends),
        supplyIndex: this.getAverageSupplyIndex(data.industryTrends),
        competitionDensity: this.getAverageCompetitionDensity(data.industryTrends),
        saturationLevel: this.getAverageSaturationLevel(data.industryTrends),
        forecastedDemand: data.marketForecasts,
        seasonalFactors: data.seasonalPatterns,
        optimalTimeWindows: this.extractOptimalWindows(data.seasonalPatterns),
        geographicHotspots: data.geographicHotspots,
        regionalOpportunities: this.extractRegionalOpportunities(data.geographicHotspots),
        historicalData: data.industryTrends,
        benchmarks: data.competitionAnalysis,
        confidence: this.calculateOverallConfidence(data),
        dataPoints: this.countDataPoints(data),
        analysisMetadata: {
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          filters: data.filters,
          cacheKey: data.cacheKey,
          // Store complete result data for reconstruction
          industryTrends: data.industryTrends,
          competitionAnalysis: data.competitionAnalysis,
          overallMarketCondition: data.overallMarketCondition,
          keyInsights: data.keyInsights,
          recommendations: data.recommendations
        },
        expiresAt,
        calculatedAt: data.calculatedAt || new Date()
      };

      if (existing.length > 0) {
        // Update existing entry
        await db
          .update(marketInsights)
          .set(insightData)
          .where(sql`${marketInsights.analysisMetadata}->>'cacheKey' = ${data.cacheKey}`);
      } else {
        // Insert new entry
        await db.insert(marketInsights).values(insightData);
      }
      
      console.log(`[MarketInsights] Stored insights with cache key: ${data.cacheKey}, expires at: ${expiresAt.toISOString()}`);
    } catch (error) {
      console.error('[MarketInsights] Failed to store insights:', error);
    }
  }

  // Additional helper methods for storing insights
  private getOverallTrendDirection(trends: IndustryTrend[]): string {
    const upCount = trends.filter(t => t.trendDirection === 'up').length;
    const downCount = trends.filter(t => t.trendDirection === 'down').length;
    
    if (upCount > downCount * 2) return 'up';
    if (downCount > upCount * 2) return 'down';
    return 'stable';
  }

  private getAverageTrendStrength(trends: IndustryTrend[]): string {
    if (trends.length === 0) return '50';
    const avg = trends.reduce((sum, t) => sum + t.trendStrength, 0) / trends.length;
    return avg.toFixed(2);
  }

  private getAverageDemandIndex(trends: IndustryTrend[]): string {
    if (trends.length === 0) return '50';
    const avg = trends.reduce((sum, t) => sum + t.demandIndex, 0) / trends.length;
    return avg.toFixed(2);
  }

  private getAverageSupplyIndex(trends: IndustryTrend[]): string {
    if (trends.length === 0) return '50';
    const avg = trends.reduce((sum, t) => sum + t.supplyIndex, 0) / trends.length;
    return avg.toFixed(2);
  }

  private getAverageCompetitionDensity(trends: IndustryTrend[]): string {
    if (trends.length === 0) return '50';
    const avg = trends.reduce((sum, t) => sum + t.competitionDensity, 0) / trends.length;
    return avg.toFixed(2);
  }

  private getAverageSaturationLevel(trends: IndustryTrend[]): string {
    if (trends.length === 0) return '50';
    const avg = trends.reduce((sum, t) => sum + t.saturationLevel, 0) / trends.length;
    return avg.toFixed(2);
  }

  private extractOptimalWindows(patterns: SeasonalPattern[]): any {
    return patterns.map(p => ({
      month: p.month,
      days: p.optimalDays,
      demandMultiplier: p.demandMultiplier
    }));
  }

  private extractRegionalOpportunities(hotspots: GeographicHotspot[]): any {
    return hotspots
      .filter(h => h.opportunityScore > 60)
      .map(h => ({
        region: h.region,
        score: h.opportunityScore,
        topIndustries: h.topIndustries
      }));
  }

  private calculateOverallConfidence(data: any): string {
    const confidences: number[] = [];
    
    data.industryTrends?.forEach((t: IndustryTrend) => confidences.push(t.confidence));
    data.seasonalPatterns?.forEach((p: SeasonalPattern) => confidences.push(p.confidence));
    data.geographicHotspots?.forEach((h: GeographicHotspot) => confidences.push(h.confidence));
    data.marketForecasts?.forEach((f: MarketForecast) => confidences.push(f.confidence));
    
    if (confidences.length === 0) return '50';
    
    const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    return avg.toFixed(2);
  }

  private countDataPoints(data: any): number {
    let count = 0;
    
    count += data.industryTrends?.length || 0;
    count += data.seasonalPatterns?.length || 0;
    count += data.geographicHotspots?.length || 0;
    count += data.marketForecasts?.length || 0;
    count += data.competitionAnalysis?.length || 0;
    
    return count;
  }
}

// Export singleton instance
export const marketInsightsService = new MarketInsightsService();