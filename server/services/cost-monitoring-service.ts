import { db } from '../db';
import { enrichmentCosts, enrichmentJobs, dataIngestionJobs, leads } from '@shared/schema';
import { sql, gte, and, eq, desc } from 'drizzle-orm';
import { waterfallEnrichmentOrchestrator } from './waterfall-enrichment-orchestrator';
import { enrichmentQueueService } from './enrichment-queue-service';
import { bulkDataIngestionService } from './bulk-data-ingestion';

export interface CostMetrics {
  totalCost: number;
  costToday: number;
  costThisWeek: number;
  costThisMonth: number;
  avgCostPerLead: number;
  costBySource: Array<{
    source: string;
    cost: number;
    calls: number;
    avgCost: number;
    percentage: number;
  }>;
  costTrend: Array<{
    date: string;
    cost: number;
    leads: number;
    avgCost: number;
  }>;
}

export interface VendorUsage {
  vendor: string;
  tier: 'free' | 'cheap' | 'premium';
  used: number;
  limit: number;
  percentage: number;
  resetAt: Date;
  costPerCall: number;
  totalCost: number;
  successRate: number;
  avgResponseTime: number;
}

export interface QueueMetrics {
  queueName: string;
  depth: number;
  processing: number;
  throughput: number;
  avgProcessingTime: number;
  errorRate: number;
  status: 'healthy' | 'degraded' | 'critical';
}

export interface DataFreshnessMetrics {
  totalLeads: number;
  freshLeads: number; // < 7 days
  staleLeads: number; // 7-30 days
  veryStaleLeads: number; // > 30 days
  neverEnriched: number;
  lastUpdateRun: Date | null;
  nextScheduledRun: Date | null;
  avgFreshnessScore: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsToday: number;
  errorsByType: Array<{
    type: string;
    count: number;
    lastOccurred: Date;
    affectedLeads: number;
  }>;
  failedEnrichments: Array<{
    leadId: string;
    businessName: string;
    error: string;
    attempts: number;
    lastAttempt: Date;
  }>;
  errorTrend: Array<{
    date: string;
    errors: number;
    successRate: number;
  }>;
}

export interface EnrichmentEfficiency {
  totalLeadsProcessed: number;
  successfulEnrichments: number;
  failedEnrichments: number;
  averageFieldsEnriched: number;
  averageConfidenceScore: number;
  costPerSuccessfulEnrichment: number;
  timeToEnrich: {
    p50: number; // median
    p90: number;
    p99: number;
  };
  bestPerformingSources: Array<{
    source: string;
    successRate: number;
    avgCost: number;
    avgFieldsEnriched: number;
  }>;
}

export class CostMonitoringService {
  private metricsCache: Map<string, { data: any; timestamp: Date }> = new Map();
  private cacheTTL = 60000; // 1 minute cache
  
  /**
   * Get comprehensive cost metrics
   */
  async getCostMetrics(): Promise<CostMetrics> {
    const cacheKey = 'cost-metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    
    // Get total costs
    const costs = await db
      .select({
        totalCost: sql<number>`COALESCE(SUM(CAST(${enrichmentCosts.cost} AS DECIMAL)), 0)`,
        todayCost: sql<number>`COALESCE(SUM(CASE WHEN ${enrichmentCosts.timestamp} >= ${today} THEN CAST(${enrichmentCosts.cost} AS DECIMAL) ELSE 0 END), 0)`,
        weekCost: sql<number>`COALESCE(SUM(CASE WHEN ${enrichmentCosts.timestamp} >= ${weekAgo} THEN CAST(${enrichmentCosts.cost} AS DECIMAL) ELSE 0 END), 0)`,
        monthCost: sql<number>`COALESCE(SUM(CASE WHEN ${enrichmentCosts.timestamp} >= ${monthAgo} THEN CAST(${enrichmentCosts.cost} AS DECIMAL) ELSE 0 END), 0)`,
        totalCalls: sql<number>`COUNT(*)`
      })
      .from(enrichmentCosts);
    
    const totalLeads = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(leads);
    
    // Get cost by source
    const costBySource = await db
      .select({
        source: enrichmentCosts.service,
        cost: sql<number>`SUM(CAST(${enrichmentCosts.cost} AS DECIMAL))`,
        calls: sql<number>`COUNT(*)`
      })
      .from(enrichmentCosts)
      .groupBy(enrichmentCosts.service);
    
    // Get cost trend (last 30 days)
    const costTrend = await db
      .select({
        date: sql<string>`DATE(${enrichmentCosts.timestamp})`,
        cost: sql<number>`SUM(CAST(${enrichmentCosts.cost} AS DECIMAL))`,
        calls: sql<number>`COUNT(*)`
      })
      .from(enrichmentCosts)
      .where(gte(enrichmentCosts.timestamp, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)))
      .groupBy(sql`DATE(${enrichmentCosts.timestamp})`)
      .orderBy(sql`DATE(${enrichmentCosts.timestamp})`);
    
    const totalCost = Number(costs[0]?.totalCost || 0);
    const leadCount = Number(totalLeads[0]?.count || 1);
    
    const metrics: CostMetrics = {
      totalCost,
      costToday: Number(costs[0]?.todayCost || 0),
      costThisWeek: Number(costs[0]?.weekCost || 0),
      costThisMonth: Number(costs[0]?.monthCost || 0),
      avgCostPerLead: totalCost / leadCount,
      costBySource: costBySource.map(s => ({
        source: s.source,
        cost: Number(s.cost),
        calls: Number(s.calls),
        avgCost: Number(s.cost) / Number(s.calls || 1),
        percentage: (Number(s.cost) / totalCost) * 100
      })),
      costTrend: costTrend.map(t => ({
        date: t.date,
        cost: Number(t.cost),
        leads: Number(t.calls),
        avgCost: Number(t.cost) / Number(t.calls || 1)
      }))
    };
    
    this.setCache(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Get vendor usage and quotas
   */
  async getVendorUsage(): Promise<VendorUsage[]> {
    const cacheKey = 'vendor-usage';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const vendors: VendorUsage[] = [];
    
    // Define vendor configurations
    const vendorConfigs = [
      { vendor: 'OpenCorporates', tier: 'free' as const, limit: 500, costPerCall: 0, resetDaily: true },
      { vendor: 'Perplexity', tier: 'cheap' as const, limit: 1000, costPerCall: 0.002, resetDaily: true },
      { vendor: 'OpenAI', tier: 'cheap' as const, limit: 3000, costPerCall: 0.01, resetDaily: true },
      { vendor: 'Hunter.io', tier: 'cheap' as const, limit: 1000, costPerCall: 0.005, resetMonthly: true },
      { vendor: 'Google Places', tier: 'cheap' as const, limit: 2500, costPerCall: 0.002, resetMonthly: true },
      { vendor: 'Clearbit', tier: 'premium' as const, limit: 1000, costPerCall: 0.75, resetMonthly: true },
      { vendor: 'PeopleDataLabs', tier: 'premium' as const, limit: 500, costPerCall: 0.25, resetMonthly: true }
    ];
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    for (const config of vendorConfigs) {
      const startDate = config.resetDaily ? todayStart : monthStart;
      const resetAt = config.resetDaily 
        ? new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
        : new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      // Get usage stats
      const stats = await db
        .select({
          calls: sql<number>`COUNT(*)`,
          totalCost: sql<number>`COALESCE(SUM(CAST(${enrichmentCosts.cost} AS DECIMAL)), 0)`,
          successCount: sql<number>`COUNT(CASE WHEN ${enrichmentCosts.response} IS NOT NULL THEN 1 END)`,
          avgTime: sql<number>`AVG(EXTRACT(EPOCH FROM (${enrichmentCosts.timestamp} - ${enrichmentCosts.timestamp})))`
        })
        .from(enrichmentCosts)
        .where(and(
          eq(enrichmentCosts.service, config.vendor.toLowerCase().replace(/\s+/g, '_')),
          gte(enrichmentCosts.timestamp, startDate)
        ));
      
      const used = Number(stats[0]?.calls || 0);
      const successCount = Number(stats[0]?.successCount || 0);
      
      vendors.push({
        vendor: config.vendor,
        tier: config.tier,
        used,
        limit: config.limit,
        percentage: (used / config.limit) * 100,
        resetAt,
        costPerCall: config.costPerCall,
        totalCost: Number(stats[0]?.totalCost || 0),
        successRate: used > 0 ? (successCount / used) * 100 : 0,
        avgResponseTime: Number(stats[0]?.avgTime || 0)
      });
    }
    
    this.setCache(cacheKey, vendors);
    return vendors;
  }
  
  /**
   * Get queue metrics
   */
  async getQueueMetrics(): Promise<QueueMetrics[]> {
    const queueStats = enrichmentQueueService.getQueueMetrics();
    
    return queueStats.map(stats => {
      let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
      
      if (stats.pendingJobs > 1000 || stats.successRate < 0.5) {
        status = 'critical';
      } else if (stats.pendingJobs > 500 || stats.successRate < 0.8) {
        status = 'degraded';
      }
      
      return {
        queueName: stats.queueName,
        depth: stats.pendingJobs,
        processing: stats.processingJobs,
        throughput: stats.throughput,
        avgProcessingTime: stats.avgProcessingTime,
        errorRate: 1 - stats.successRate,
        status
      };
    });
  }
  
  /**
   * Get data freshness metrics
   */
  async getDataFreshnessMetrics(): Promise<DataFreshnessMetrics> {
    const cacheKey = 'freshness-metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const freshness = await db
      .select({
        totalLeads: sql<number>`COUNT(*)`,
        freshLeads: sql<number>`COUNT(CASE WHEN ${leads.lastEnrichedAt} >= ${sevenDaysAgo} THEN 1 END)`,
        staleLeads: sql<number>`COUNT(CASE WHEN ${leads.lastEnrichedAt} < ${sevenDaysAgo} AND ${leads.lastEnrichedAt} >= ${thirtyDaysAgo} THEN 1 END)`,
        veryStaleLeads: sql<number>`COUNT(CASE WHEN ${leads.lastEnrichedAt} < ${thirtyDaysAgo} THEN 1 END)`,
        neverEnriched: sql<number>`COUNT(CASE WHEN ${leads.lastEnrichedAt} IS NULL THEN 1 END)`,
        avgFreshness: sql<number>`AVG(${leads.freshnessScore})`
      })
      .from(leads);
    
    // Get last and next update runs
    const lastJob = await db
      .select()
      .from(dataIngestionJobs)
      .orderBy(desc(dataIngestionJobs.completedAt))
      .limit(1);
    
    // Next scheduled run is at 2 AM tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    
    const metrics: DataFreshnessMetrics = {
      totalLeads: Number(freshness[0]?.totalLeads || 0),
      freshLeads: Number(freshness[0]?.freshLeads || 0),
      staleLeads: Number(freshness[0]?.staleLeads || 0),
      veryStaleLeads: Number(freshness[0]?.veryStaleLeads || 0),
      neverEnriched: Number(freshness[0]?.neverEnriched || 0),
      lastUpdateRun: lastJob[0]?.completedAt || null,
      nextScheduledRun: tomorrow,
      avgFreshnessScore: Number(freshness[0]?.avgFreshness || 0)
    };
    
    this.setCache(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Get error metrics
   */
  async getErrorMetrics(): Promise<ErrorMetrics> {
    const cacheKey = 'error-metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get error counts
    const errorStats = await db
      .select({
        totalErrors: sql<number>`COUNT(*)`,
        errorsToday: sql<number>`COUNT(CASE WHEN ${enrichmentJobs.createdAt} >= ${today} THEN 1 END)`
      })
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.status, 'failed'));
    
    // Get errors by type
    const errorsByType = await db
      .select({
        error: enrichmentJobs.error,
        count: sql<number>`COUNT(*)`,
        lastOccurred: sql<Date>`MAX(${enrichmentJobs.completedAt})`,
        affectedLeads: sql<number>`COUNT(DISTINCT ${enrichmentJobs.leadId})`
      })
      .from(enrichmentJobs)
      .where(and(
        eq(enrichmentJobs.status, 'failed'),
        gte(enrichmentJobs.createdAt, thirtyDaysAgo)
      ))
      .groupBy(enrichmentJobs.error)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);
    
    // Get failed enrichments details
    const failedEnrichments = await db
      .select({
        leadId: enrichmentJobs.leadId,
        businessName: leads.businessName,
        error: enrichmentJobs.error,
        attempts: enrichmentJobs.retryCount,
        lastAttempt: enrichmentJobs.completedAt
      })
      .from(enrichmentJobs)
      .leftJoin(leads, eq(enrichmentJobs.leadId, leads.id))
      .where(eq(enrichmentJobs.status, 'failed'))
      .orderBy(desc(enrichmentJobs.completedAt))
      .limit(20);
    
    // Get error trend
    const errorTrend = await db
      .select({
        date: sql<string>`DATE(${enrichmentJobs.createdAt})`,
        errors: sql<number>`COUNT(CASE WHEN ${enrichmentJobs.status} = 'failed' THEN 1 END)`,
        total: sql<number>`COUNT(*)`
      })
      .from(enrichmentJobs)
      .where(gte(enrichmentJobs.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${enrichmentJobs.createdAt})`)
      .orderBy(sql`DATE(${enrichmentJobs.createdAt})`);
    
    const metrics: ErrorMetrics = {
      totalErrors: Number(errorStats[0]?.totalErrors || 0),
      errorsToday: Number(errorStats[0]?.errorsToday || 0),
      errorsByType: errorsByType.map(e => ({
        type: e.error || 'Unknown',
        count: Number(e.count),
        lastOccurred: e.lastOccurred || new Date(),
        affectedLeads: Number(e.affectedLeads)
      })),
      failedEnrichments: failedEnrichments.map(f => ({
        leadId: f.leadId || '',
        businessName: f.businessName || 'Unknown',
        error: f.error || 'Unknown error',
        attempts: f.attempts || 0,
        lastAttempt: f.lastAttempt || new Date()
      })),
      errorTrend: errorTrend.map(t => ({
        date: t.date,
        errors: Number(t.errors),
        successRate: Number(t.total) > 0 ? (Number(t.total) - Number(t.errors)) / Number(t.total) : 0
      }))
    };
    
    this.setCache(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Get enrichment efficiency metrics
   */
  async getEnrichmentEfficiency(): Promise<EnrichmentEfficiency> {
    const cacheKey = 'efficiency-metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;
    
    // Get overall stats
    const overallStats = await db
      .select({
        totalProcessed: sql<number>`COUNT(*)`,
        successful: sql<number>`COUNT(CASE WHEN ${enrichmentJobs.status} = 'completed' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN ${enrichmentJobs.status} = 'failed' THEN 1 END)`,
        avgCost: sql<number>`AVG(CAST(${enrichmentJobs.totalCost} AS DECIMAL))`
      })
      .from(enrichmentJobs);
    
    // Get performance by source
    const sourcePerformance = await db
      .select({
        source: enrichmentCosts.service,
        successCount: sql<number>`COUNT(CASE WHEN ${enrichmentCosts.response} IS NOT NULL THEN 1 END)`,
        totalCount: sql<number>`COUNT(*)`,
        avgCost: sql<number>`AVG(CAST(${enrichmentCosts.cost} AS DECIMAL))`
      })
      .from(enrichmentCosts)
      .groupBy(enrichmentCosts.service)
      .orderBy(desc(sql`COUNT(CASE WHEN ${enrichmentCosts.response} IS NOT NULL THEN 1 END) * 1.0 / COUNT(*)`))
      .limit(5);
    
    const totalProcessed = Number(overallStats[0]?.totalProcessed || 0);
    const successful = Number(overallStats[0]?.successful || 0);
    const failed = Number(overallStats[0]?.failed || 0);
    
    const metrics: EnrichmentEfficiency = {
      totalLeadsProcessed: totalProcessed,
      successfulEnrichments: successful,
      failedEnrichments: failed,
      averageFieldsEnriched: 8.5, // Placeholder - would calculate from actual data
      averageConfidenceScore: 0.75, // Placeholder
      costPerSuccessfulEnrichment: successful > 0 ? Number(overallStats[0]?.avgCost || 0) : 0,
      timeToEnrich: {
        p50: 2500, // 2.5 seconds - placeholder
        p90: 8000, // 8 seconds
        p99: 25000 // 25 seconds
      },
      bestPerformingSources: sourcePerformance.map(s => ({
        source: s.source,
        successRate: Number(s.totalCount) > 0 
          ? Number(s.successCount) / Number(s.totalCount) 
          : 0,
        avgCost: Number(s.avgCost),
        avgFieldsEnriched: 5 // Placeholder
      }))
    };
    
    this.setCache(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Get real-time dashboard summary
   */
  async getDashboardSummary(): Promise<{
    costMetrics: CostMetrics;
    vendorUsage: VendorUsage[];
    queueMetrics: QueueMetrics[];
    dataFreshness: DataFreshnessMetrics;
    errorMetrics: ErrorMetrics;
    efficiency: EnrichmentEfficiency;
    recommendations: string[];
  }> {
    const [costMetrics, vendorUsage, queueMetrics, dataFreshness, errorMetrics, efficiency] = 
      await Promise.all([
        this.getCostMetrics(),
        this.getVendorUsage(),
        this.getQueueMetrics(),
        this.getDataFreshnessMetrics(),
        this.getErrorMetrics(),
        this.getEnrichmentEfficiency()
      ]);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations({
      costMetrics,
      vendorUsage,
      queueMetrics,
      dataFreshness,
      errorMetrics,
      efficiency
    });
    
    return {
      costMetrics,
      vendorUsage,
      queueMetrics,
      dataFreshness,
      errorMetrics,
      efficiency,
      recommendations
    };
  }
  
  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(metrics: any): string[] {
    const recommendations: string[] = [];
    
    // Cost recommendations
    if (metrics.costMetrics.avgCostPerLead > 0.01) {
      recommendations.push('Average cost per lead is high. Consider using more free/cheap sources before premium APIs.');
    }
    
    // Vendor usage recommendations
    for (const vendor of metrics.vendorUsage) {
      if (vendor.percentage > 80) {
        recommendations.push(`${vendor.vendor} is at ${vendor.percentage.toFixed(0)}% of quota. Consider spreading load or upgrading plan.`);
      }
      if (vendor.successRate < 50 && vendor.used > 10) {
        recommendations.push(`${vendor.vendor} has low success rate (${vendor.successRate.toFixed(0)}%). Review integration or data quality.`);
      }
    }
    
    // Queue recommendations
    for (const queue of metrics.queueMetrics) {
      if (queue.status === 'critical') {
        recommendations.push(`Queue ${queue.queueName} is critical with ${queue.depth} pending jobs. Consider scaling workers.`);
      } else if (queue.status === 'degraded') {
        recommendations.push(`Queue ${queue.queueName} is degraded. Monitor for potential issues.`);
      }
    }
    
    // Freshness recommendations
    const stalePercentage = (metrics.dataFreshness.staleLeads + metrics.dataFreshness.veryStaleLeads) 
      / metrics.dataFreshness.totalLeads * 100;
    if (stalePercentage > 30) {
      recommendations.push(`${stalePercentage.toFixed(0)}% of leads are stale. Schedule bulk re-enrichment for better data quality.`);
    }
    
    // Error recommendations
    if (metrics.errorMetrics.errorsToday > 100) {
      recommendations.push(`High error rate today (${metrics.errorMetrics.errorsToday} errors). Investigate root cause.`);
    }
    
    // Efficiency recommendations
    if (metrics.efficiency.costPerSuccessfulEnrichment > 0.05) {
      recommendations.push('Cost per enrichment is high. Review waterfall strategy and tier thresholds.');
    }
    
    return recommendations;
  }
  
  /**
   * Cache management
   */
  private getFromCache(key: string): any {
    const cached = this.metricsCache.get(key);
    if (cached && (Date.now() - cached.timestamp.getTime() < this.cacheTTL)) {
      return cached.data;
    }
    return null;
  }
  
  private setCache(key: string, data: any): void {
    this.metricsCache.set(key, { data, timestamp: new Date() });
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.metricsCache.clear();
  }
}

// Export singleton instance
export const costMonitoringService = new CostMonitoringService();