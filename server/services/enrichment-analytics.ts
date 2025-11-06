import { Lead } from "@shared/schema";
import { storage } from "../storage";
import { eventBus } from "./event-bus";
import { cacheManager } from "./cache-manager";

/**
 * Enrichment Analytics Service
 * Tracks and analyzes enrichment performance, success rates, and provides insights
 */

// Time period types
type TimePeriod = 'hour' | 'day' | 'week' | 'month' | 'all_time';

// Analytics metrics
export interface EnrichmentMetrics {
  period: TimePeriod;
  startDate: Date;
  endDate: Date;
  totalEnrichments: number;
  successfulEnrichments: number;
  failedEnrichments: number;
  partialEnrichments: number;
  successRate: number;
  averageProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
  totalApiCalls: number;
  totalCost: number;
  averageCostPerLead: number;
  dataCompletenessImprovement: number;
  fieldsEnriched: {
    [fieldName: string]: {
      count: number;
      successRate: number;
      averageConfidence: number;
    };
  };
}

// Service performance metrics
export interface ServiceMetrics {
  serviceName: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  errorRate: number;
  availability: number;
  costPerCall: number;
  totalCost: number;
  commonErrors: Array<{
    error: string;
    count: number;
  }>;
}

// Enrichment trend
export interface EnrichmentTrend {
  timestamp: Date;
  value: number;
  metric: 'volume' | 'success_rate' | 'processing_time' | 'cost' | 'completeness';
}

// Quality metrics
export interface QualityMetrics {
  averageQualityScore: number;
  qualityScoreDistribution: {
    excellent: number;  // 90-100
    good: number;       // 70-89
    fair: number;       // 50-69
    poor: number;       // 0-49
  };
  dataIntegrityScore: number;
  anomalyRate: number;
  autoCorrectionsApplied: number;
  duplicatesDetected: number;
}

// Cost analytics
export interface CostAnalytics {
  period: TimePeriod;
  totalCost: number;
  costByService: {
    [serviceName: string]: {
      cost: number;
      percentage: number;
      calls: number;
    };
  };
  costByStrategy: {
    [strategy: string]: number;
  };
  costTrend: EnrichmentTrend[];
  projectedMonthlyCost: number;
  budgetUtilization: number;
}

// Performance insights
export interface PerformanceInsights {
  recommendations: string[];
  bottlenecks: Array<{
    service: string;
    issue: string;
    impact: 'high' | 'medium' | 'low';
    suggestion: string;
  }>;
  optimizationOpportunities: Array<{
    area: string;
    potentialSavings: number;
    implementation: string;
  }>;
}

export class EnrichmentAnalytics {
  private metricsCache: Map<string, any> = new Map();
  private analyticsBuffer: any[] = [];
  private readonly bufferFlushInterval = 5000; // 5 seconds
  private readonly metricsRetentionDays = 30;
  
  // In-memory storage for real-time metrics
  private realtimeMetrics = {
    currentHour: {
      enrichments: 0,
      successes: 0,
      failures: 0,
      totalTime: 0,
      apiCalls: 0,
      cost: 0
    },
    currentDay: {
      enrichments: 0,
      successes: 0,
      failures: 0,
      totalTime: 0,
      apiCalls: 0,
      cost: 0
    }
  };
  
  constructor() {
    this.initializeEventListeners();
    this.startMetricsAggregation();
    console.log('[EnrichmentAnalytics] Initialized with real-time tracking');
  }
  
  /**
   * Initialize event listeners for tracking
   */
  private initializeEventListeners() {
    // Track enrichment start
    eventBus.on('enrichment:started', (data: any) => {
      this.trackEnrichmentStart(data);
    });
    
    // Track enrichment completion
    eventBus.on('enrichment:completed', (data: any) => {
      this.trackEnrichmentCompletion(data);
    });
    
    // Track enrichment failure
    eventBus.on('enrichment:failed', (data: any) => {
      this.trackEnrichmentFailure(data);
    });
    
    // Track API calls
    eventBus.on('api:call', (data: any) => {
      this.trackApiCall(data);
    });
    
    // Track quality issues
    eventBus.on('qa:issue-detected', (data: any) => {
      this.trackQualityIssue(data);
    });
  }
  
  /**
   * Get enrichment metrics for a time period
   */
  async getEnrichmentMetrics(period: TimePeriod = 'day'): Promise<EnrichmentMetrics> {
    const cacheKey = `metrics_${period}_${Date.now()}`;
    
    // Check cache (with 1-minute TTL for real-time data)
    const cached = this.metricsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.data;
    }
    
    const { startDate, endDate } = this.getDateRange(period);
    
    // Aggregate metrics
    const metrics = await this.aggregateMetrics(startDate, endDate);
    
    // Calculate derived metrics
    metrics.successRate = metrics.totalEnrichments > 0
      ? (metrics.successfulEnrichments / metrics.totalEnrichments) * 100
      : 0;
    
    metrics.averageCostPerLead = metrics.totalEnrichments > 0
      ? metrics.totalCost / metrics.totalEnrichments
      : 0;
    
    // Cache the result
    this.metricsCache.set(cacheKey, {
      timestamp: Date.now(),
      data: metrics
    });
    
    return metrics;
  }
  
  /**
   * Get service-specific metrics
   */
  async getServiceMetrics(period: TimePeriod = 'day'): Promise<ServiceMetrics[]> {
    const { startDate, endDate } = this.getDateRange(period);
    
    // Aggregate service metrics from stored data
    const services = ['hunter', 'numverify', 'perplexity', 'openai', 'mca_scoring'];
    const serviceMetrics: ServiceMetrics[] = [];
    
    for (const serviceName of services) {
      const metrics = await this.aggregateServiceMetrics(serviceName, startDate, endDate);
      serviceMetrics.push(metrics);
    }
    
    // Sort by total calls descending
    serviceMetrics.sort((a, b) => b.totalCalls - a.totalCalls);
    
    return serviceMetrics;
  }
  
  /**
   * Get enrichment trends over time
   */
  async getEnrichmentTrends(
    metric: 'volume' | 'success_rate' | 'processing_time' | 'cost' | 'completeness',
    period: TimePeriod = 'week'
  ): Promise<EnrichmentTrend[]> {
    const { startDate, endDate } = this.getDateRange(period);
    const trends: EnrichmentTrend[] = [];
    
    // Determine granularity based on period
    const granularity = this.getGranularity(period);
    
    // Generate time buckets
    const current = new Date(startDate);
    while (current <= endDate) {
      const bucketEnd = new Date(current);
      bucketEnd.setHours(bucketEnd.getHours() + granularity);
      
      // Get metrics for this time bucket
      const bucketMetrics = await this.aggregateMetrics(current, bucketEnd);
      
      let value = 0;
      switch (metric) {
        case 'volume':
          value = bucketMetrics.totalEnrichments;
          break;
        case 'success_rate':
          value = bucketMetrics.successRate;
          break;
        case 'processing_time':
          value = bucketMetrics.averageProcessingTime;
          break;
        case 'cost':
          value = bucketMetrics.totalCost;
          break;
        case 'completeness':
          value = bucketMetrics.dataCompletenessImprovement;
          break;
      }
      
      trends.push({
        timestamp: new Date(current),
        value,
        metric
      });
      
      current.setHours(current.getHours() + granularity);
    }
    
    return trends;
  }
  
  /**
   * Get quality metrics
   */
  async getQualityMetrics(period: TimePeriod = 'day'): Promise<QualityMetrics> {
    const { startDate, endDate } = this.getDateRange(period);
    
    // Aggregate quality data from QA reports
    const qualityData = await this.aggregateQualityData(startDate, endDate);
    
    return {
      averageQualityScore: qualityData.totalScore / Math.max(1, qualityData.count),
      qualityScoreDistribution: {
        excellent: qualityData.excellent,
        good: qualityData.good,
        fair: qualityData.fair,
        poor: qualityData.poor
      },
      dataIntegrityScore: qualityData.integrityScore,
      anomalyRate: qualityData.anomalies / Math.max(1, qualityData.count),
      autoCorrectionsApplied: qualityData.corrections,
      duplicatesDetected: qualityData.duplicates
    };
  }
  
  /**
   * Get cost analytics
   */
  async getCostAnalytics(period: TimePeriod = 'day', budgetLimit?: number): Promise<CostAnalytics> {
    const { startDate, endDate } = this.getDateRange(period);
    
    // Aggregate cost data
    const costData = await this.aggregateCostData(startDate, endDate);
    
    // Calculate cost trends
    const costTrend = await this.getEnrichmentTrends('cost', period);
    
    // Project monthly cost based on current rate
    const daysInPeriod = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const dailyRate = costData.totalCost / Math.max(1, daysInPeriod);
    const projectedMonthlyCost = dailyRate * 30;
    
    // Calculate budget utilization if budget provided
    const budgetUtilization = budgetLimit ? (costData.totalCost / budgetLimit) * 100 : 0;
    
    return {
      period,
      totalCost: costData.totalCost,
      costByService: costData.byService,
      costByStrategy: costData.byStrategy,
      costTrend,
      projectedMonthlyCost,
      budgetUtilization
    };
  }
  
  /**
   * Get performance insights and recommendations
   */
  async getPerformanceInsights(period: TimePeriod = 'day'): Promise<PerformanceInsights> {
    const metrics = await this.getEnrichmentMetrics(period);
    const serviceMetrics = await this.getServiceMetrics(period);
    const qualityMetrics = await this.getQualityMetrics(period);
    
    const insights: PerformanceInsights = {
      recommendations: [],
      bottlenecks: [],
      optimizationOpportunities: []
    };
    
    // Analyze success rate
    if (metrics.successRate < 80) {
      insights.recommendations.push(
        `Success rate is ${metrics.successRate.toFixed(1)}%. Review failing services and consider fallback options.`
      );
    }
    
    // Analyze processing time
    if (metrics.averageProcessingTime > 5000) {
      insights.recommendations.push(
        'Average processing time is high. Consider implementing parallel processing or caching.'
      );
    }
    
    // Identify service bottlenecks
    serviceMetrics.forEach(service => {
      if (service.errorRate > 0.1) {
        insights.bottlenecks.push({
          service: service.serviceName,
          issue: `High error rate: ${(service.errorRate * 100).toFixed(1)}%`,
          impact: service.totalCalls > 100 ? 'high' : 'medium',
          suggestion: 'Review service configuration and implement retry logic'
        });
      }
      
      if (service.averageResponseTime > 3000) {
        insights.bottlenecks.push({
          service: service.serviceName,
          issue: `Slow response time: ${service.averageResponseTime}ms`,
          impact: 'medium',
          suggestion: 'Consider implementing timeout and fallback strategies'
        });
      }
    });
    
    // Identify optimization opportunities
    if (metrics.dataCompletenessImprovement < 30) {
      insights.optimizationOpportunities.push({
        area: 'Data Enrichment',
        potentialSavings: metrics.totalCost * 0.2,
        implementation: 'Add more data sources or improve existing integrations'
      });
    }
    
    // Quality-based recommendations
    if (qualityMetrics.anomalyRate > 0.15) {
      insights.recommendations.push(
        'High anomaly rate detected. Review data validation rules and source reliability.'
      );
    }
    
    if (qualityMetrics.duplicatesDetected > metrics.totalEnrichments * 0.05) {
      insights.optimizationOpportunities.push({
        area: 'Deduplication',
        potentialSavings: metrics.totalCost * 0.1,
        implementation: 'Implement better duplicate detection before enrichment'
      });
    }
    
    // Service-specific optimizations
    const underutilizedServices = serviceMetrics.filter(s => 
      s.totalCalls < 10 && s.availability > 0.9
    );
    
    if (underutilizedServices.length > 0) {
      insights.recommendations.push(
        `Underutilized services detected: ${underutilizedServices.map(s => s.serviceName).join(', ')}`
      );
    }
    
    return insights;
  }
  
  /**
   * Get real-time dashboard data
   */
  async getDashboardData(): Promise<{
    current: {
      activeEnrichments: number;
      successRateToday: number;
      averageTimeToday: number;
      costToday: number;
    };
    trends: {
      volume: EnrichmentTrend[];
      successRate: EnrichmentTrend[];
    };
    topServices: ServiceMetrics[];
    recentFailures: Array<{
      leadId: string;
      service: string;
      error: string;
      timestamp: Date;
    }>;
  }> {
    // Get current metrics
    const todayMetrics = await this.getEnrichmentMetrics('day');
    
    // Get trends for the last 24 hours
    const volumeTrend = await this.getEnrichmentTrends('volume', 'day');
    const successTrend = await this.getEnrichmentTrends('success_rate', 'day');
    
    // Get top services
    const topServices = (await this.getServiceMetrics('day')).slice(0, 5);
    
    // Get recent failures (mock for now)
    const recentFailures: any[] = [];
    
    return {
      current: {
        activeEnrichments: 0, // Would track from active enrichment queue
        successRateToday: todayMetrics.successRate,
        averageTimeToday: todayMetrics.averageProcessingTime,
        costToday: todayMetrics.totalCost
      },
      trends: {
        volume: volumeTrend.slice(-24), // Last 24 hours
        successRate: successTrend.slice(-24)
      },
      topServices,
      recentFailures
    };
  }
  
  /**
   * Generate analytics report
   */
  async generateReport(period: TimePeriod = 'week'): Promise<{
    summary: string;
    metrics: EnrichmentMetrics;
    quality: QualityMetrics;
    cost: CostAnalytics;
    insights: PerformanceInsights;
    recommendations: string[];
  }> {
    const metrics = await this.getEnrichmentMetrics(period);
    const quality = await this.getQualityMetrics(period);
    const cost = await this.getCostAnalytics(period);
    const insights = await this.getPerformanceInsights(period);
    
    // Generate summary
    const summary = this.generateSummary(metrics, quality, cost);
    
    // Compile all recommendations
    const recommendations = [
      ...insights.recommendations,
      ...this.generateRecommendations(metrics, quality, cost)
    ];
    
    return {
      summary,
      metrics,
      quality,
      cost,
      insights,
      recommendations
    };
  }
  
  // Private helper methods
  
  private trackEnrichmentStart(data: any) {
    this.analyticsBuffer.push({
      type: 'enrichment_start',
      timestamp: new Date(),
      ...data
    });
  }
  
  private trackEnrichmentCompletion(data: any) {
    this.analyticsBuffer.push({
      type: 'enrichment_complete',
      timestamp: new Date(),
      ...data
    });
    
    // Update real-time metrics
    this.realtimeMetrics.currentHour.enrichments++;
    this.realtimeMetrics.currentHour.successes++;
    this.realtimeMetrics.currentDay.enrichments++;
    this.realtimeMetrics.currentDay.successes++;
    
    if (data.processingTime) {
      this.realtimeMetrics.currentHour.totalTime += data.processingTime;
      this.realtimeMetrics.currentDay.totalTime += data.processingTime;
    }
    
    if (data.cost) {
      this.realtimeMetrics.currentHour.cost += data.cost;
      this.realtimeMetrics.currentDay.cost += data.cost;
    }
  }
  
  private trackEnrichmentFailure(data: any) {
    this.analyticsBuffer.push({
      type: 'enrichment_failure',
      timestamp: new Date(),
      ...data
    });
    
    // Update real-time metrics
    this.realtimeMetrics.currentHour.enrichments++;
    this.realtimeMetrics.currentHour.failures++;
    this.realtimeMetrics.currentDay.enrichments++;
    this.realtimeMetrics.currentDay.failures++;
  }
  
  private trackApiCall(data: any) {
    this.analyticsBuffer.push({
      type: 'api_call',
      timestamp: new Date(),
      ...data
    });
    
    // Update real-time metrics
    this.realtimeMetrics.currentHour.apiCalls++;
    this.realtimeMetrics.currentDay.apiCalls++;
  }
  
  private trackQualityIssue(data: any) {
    this.analyticsBuffer.push({
      type: 'quality_issue',
      timestamp: new Date(),
      ...data
    });
  }
  
  private startMetricsAggregation() {
    // Flush buffer periodically
    setInterval(() => {
      if (this.analyticsBuffer.length > 0) {
        this.flushAnalyticsBuffer();
      }
    }, this.bufferFlushInterval);
    
    // Reset hourly metrics
    setInterval(() => {
      this.realtimeMetrics.currentHour = {
        enrichments: 0,
        successes: 0,
        failures: 0,
        totalTime: 0,
        apiCalls: 0,
        cost: 0
      };
    }, 60 * 60 * 1000); // Every hour
    
    // Reset daily metrics
    setInterval(() => {
      this.realtimeMetrics.currentDay = {
        enrichments: 0,
        successes: 0,
        failures: 0,
        totalTime: 0,
        apiCalls: 0,
        cost: 0
      };
    }, 24 * 60 * 60 * 1000); // Every day
  }
  
  private async flushAnalyticsBuffer() {
    const events = [...this.analyticsBuffer];
    this.analyticsBuffer = [];
    
    // Process and store events
    // In production, this would write to a time-series database
    for (const event of events) {
      await this.processAnalyticsEvent(event);
    }
  }
  
  private async processAnalyticsEvent(event: any) {
    // Store event for historical analysis
    // This is a simplified version - in production would use proper storage
    const key = `analytics_${event.type}_${event.timestamp.getTime()}`;
    await cacheManager.set(key, event, this.metricsRetentionDays * 24 * 60 * 60);
  }
  
  private getDateRange(period: TimePeriod): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'hour':
        startDate.setHours(startDate.getHours() - 1);
        break;
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all_time':
        startDate.setFullYear(2020); // Arbitrary old date
        break;
    }
    
    return { startDate, endDate };
  }
  
  private getGranularity(period: TimePeriod): number {
    // Returns hours for bucketing
    switch (period) {
      case 'hour':
        return 1; // 1 hour buckets
      case 'day':
        return 1; // 1 hour buckets
      case 'week':
        return 6; // 6 hour buckets
      case 'month':
        return 24; // 1 day buckets
      case 'all_time':
        return 24 * 7; // 1 week buckets
      default:
        return 1;
    }
  }
  
  private async aggregateMetrics(startDate: Date, endDate: Date): Promise<EnrichmentMetrics> {
    // This is a simplified version - in production would query from database
    return {
      period: 'day',
      startDate,
      endDate,
      totalEnrichments: this.realtimeMetrics.currentDay.enrichments,
      successfulEnrichments: this.realtimeMetrics.currentDay.successes,
      failedEnrichments: this.realtimeMetrics.currentDay.failures,
      partialEnrichments: 0,
      successRate: 0, // Calculated later
      averageProcessingTime: this.realtimeMetrics.currentDay.totalTime / 
        Math.max(1, this.realtimeMetrics.currentDay.enrichments),
      medianProcessingTime: 0,
      p95ProcessingTime: 0,
      totalApiCalls: this.realtimeMetrics.currentDay.apiCalls,
      totalCost: this.realtimeMetrics.currentDay.cost,
      averageCostPerLead: 0, // Calculated later
      dataCompletenessImprovement: 35, // Mock value
      fieldsEnriched: {
        email: { count: 45, successRate: 0.89, averageConfidence: 0.92 },
        phone: { count: 38, successRate: 0.84, averageConfidence: 0.88 },
        revenue: { count: 31, successRate: 0.76, averageConfidence: 0.81 }
      }
    };
  }
  
  private async aggregateServiceMetrics(
    serviceName: string,
    startDate: Date,
    endDate: Date
  ): Promise<ServiceMetrics> {
    // Mock implementation - in production would query from database
    const mockData: { [key: string]: ServiceMetrics } = {
      hunter: {
        serviceName: 'hunter',
        totalCalls: 156,
        successfulCalls: 142,
        failedCalls: 14,
        averageResponseTime: 850,
        p95ResponseTime: 1200,
        errorRate: 0.09,
        availability: 0.98,
        costPerCall: 0.003,
        totalCost: 0.468,
        commonErrors: [
          { error: 'Rate limit exceeded', count: 8 },
          { error: 'Invalid email format', count: 6 }
        ]
      },
      numverify: {
        serviceName: 'numverify',
        totalCalls: 134,
        successfulCalls: 127,
        failedCalls: 7,
        averageResponseTime: 620,
        p95ResponseTime: 950,
        errorRate: 0.05,
        availability: 0.99,
        costPerCall: 0.002,
        totalCost: 0.268,
        commonErrors: [
          { error: 'Invalid phone format', count: 7 }
        ]
      },
      perplexity: {
        serviceName: 'perplexity',
        totalCalls: 45,
        successfulCalls: 41,
        failedCalls: 4,
        averageResponseTime: 3200,
        p95ResponseTime: 5000,
        errorRate: 0.09,
        availability: 0.95,
        costPerCall: 0.02,
        totalCost: 0.90,
        commonErrors: [
          { error: 'Timeout', count: 3 },
          { error: 'API error', count: 1 }
        ]
      },
      openai: {
        serviceName: 'openai',
        totalCalls: 78,
        successfulCalls: 75,
        failedCalls: 3,
        averageResponseTime: 2100,
        p95ResponseTime: 3500,
        errorRate: 0.04,
        availability: 0.99,
        costPerCall: 0.01,
        totalCost: 0.78,
        commonErrors: [
          { error: 'Context too long', count: 2 },
          { error: 'Rate limit', count: 1 }
        ]
      },
      mca_scoring: {
        serviceName: 'mca_scoring',
        totalCalls: 289,
        successfulCalls: 287,
        failedCalls: 2,
        averageResponseTime: 150,
        p95ResponseTime: 280,
        errorRate: 0.007,
        availability: 0.999,
        costPerCall: 0.001,
        totalCost: 0.289,
        commonErrors: [
          { error: 'Database timeout', count: 2 }
        ]
      }
    };
    
    return mockData[serviceName] || {
      serviceName,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      errorRate: 0,
      availability: 0,
      costPerCall: 0,
      totalCost: 0,
      commonErrors: []
    };
  }
  
  private async aggregateQualityData(startDate: Date, endDate: Date): Promise<any> {
    // Mock implementation
    return {
      count: 100,
      totalScore: 7850,
      excellent: 35,
      good: 42,
      fair: 18,
      poor: 5,
      integrityScore: 88,
      anomalies: 12,
      corrections: 67,
      duplicates: 8
    };
  }
  
  private async aggregateCostData(startDate: Date, endDate: Date): Promise<any> {
    // Mock implementation
    return {
      totalCost: 2.695,
      byService: {
        hunter: { cost: 0.468, percentage: 17.4, calls: 156 },
        numverify: { cost: 0.268, percentage: 9.9, calls: 134 },
        perplexity: { cost: 0.90, percentage: 33.4, calls: 45 },
        openai: { cost: 0.78, percentage: 28.9, calls: 78 },
        mca_scoring: { cost: 0.289, percentage: 10.7, calls: 289 }
      },
      byStrategy: {
        high_quality: 1.45,
        fast: 0.89,
        cost_effective: 0.355
      }
    };
  }
  
  private generateSummary(
    metrics: EnrichmentMetrics,
    quality: QualityMetrics,
    cost: CostAnalytics
  ): string {
    const parts = [];
    
    parts.push(`Enrichment Analytics Summary (${metrics.period})`);
    parts.push(`Total Enrichments: ${metrics.totalEnrichments}`);
    parts.push(`Success Rate: ${metrics.successRate.toFixed(1)}%`);
    parts.push(`Average Processing Time: ${metrics.averageProcessingTime}ms`);
    parts.push(`Total Cost: $${cost.totalCost.toFixed(2)}`);
    parts.push(`Average Quality Score: ${quality.averageQualityScore.toFixed(1)}/100`);
    
    if (metrics.successRate < 80) {
      parts.push('⚠️ Success rate below target threshold');
    }
    
    if (quality.anomalyRate > 0.15) {
      parts.push('⚠️ High anomaly rate detected');
    }
    
    return parts.join('\n');
  }
  
  private generateRecommendations(
    metrics: EnrichmentMetrics,
    quality: QualityMetrics,
    cost: CostAnalytics
  ): string[] {
    const recommendations: string[] = [];
    
    // Cost-based recommendations
    if (cost.projectedMonthlyCost > 1000) {
      recommendations.push('Consider implementing cost optimization strategies');
    }
    
    // Quality-based recommendations
    if (quality.averageQualityScore < 70) {
      recommendations.push('Improve data validation and enrichment sources');
    }
    
    // Performance-based recommendations
    if (metrics.averageProcessingTime > 5000) {
      recommendations.push('Implement caching and parallel processing');
    }
    
    return recommendations;
  }
  
  /**
   * Export analytics data
   */
  async exportAnalytics(period: TimePeriod = 'month', format: 'json' | 'csv' = 'json'): Promise<string> {
    const report = await this.generateReport(period);
    
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    } else {
      // Convert to CSV format
      const lines: string[] = [];
      lines.push('Metric,Value');
      lines.push(`Total Enrichments,${report.metrics.totalEnrichments}`);
      lines.push(`Success Rate,${report.metrics.successRate.toFixed(1)}%`);
      lines.push(`Average Processing Time,${report.metrics.averageProcessingTime}ms`);
      lines.push(`Total Cost,$${report.cost.totalCost.toFixed(2)}`);
      lines.push(`Average Quality Score,${report.quality.averageQualityScore.toFixed(1)}`);
      
      return lines.join('\n');
    }
  }
  
  /**
   * Clear old analytics data
   */
  async cleanupOldData(daysToKeep: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // Clear old cached metrics
    this.metricsCache.forEach((value, key) => {
      if (value.timestamp < cutoffDate.getTime()) {
        this.metricsCache.delete(key);
      }
    });
    
    console.log(`[EnrichmentAnalytics] Cleaned up data older than ${daysToKeep} days`);
  }
}

// Export singleton instance
export const enrichmentAnalytics = new EnrichmentAnalytics();

// Export types
export type {
  EnrichmentMetrics,
  ServiceMetrics,
  EnrichmentTrend,
  QualityMetrics,
  CostAnalytics,
  PerformanceInsights
};