/**
 * Brain Service Monitoring API Routes
 * Intelligence tier monitoring and cost tracking endpoints
 */

import type { Express } from 'express';
import { db } from '../db';
import { intelligenceMetrics, processingMetrics } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

/**
 * Register Brain Monitoring routes
 */
export function registerBrainMonitoringRoutes(app: Express) {
  /**
   * Get intelligence tier usage statistics
   */
  app.get('/api/brain/intelligence-stats', async (req, res) => {
    try {
      const { tieredIntelligence } = await import('../intelligence/tiered-intelligence');
      const { fieldExtractor } = await import('../intelligence/field-extractor');
      const { executionPolicy } = await import('../intelligence/execution-policy');
      
      const tierMetrics = tieredIntelligence.getMetrics();
      const extractorStats = fieldExtractor.getStatistics();
      const policyStats = executionPolicy.getStatistics();
      
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      const baseQuery = db.select({
        totalCost: sql`SUM(${intelligenceMetrics.totalCost})::numeric`,
        avgCost: sql`AVG(${intelligenceMetrics.avgCostPerLead})::numeric`,
        totalLeads: sql`COUNT(DISTINCT ${intelligenceMetrics.leadId})`,
        avgConfidence: sql`AVG(${intelligenceMetrics.averageConfidence})::numeric`,
        totalEscalations: sql`SUM(${intelligenceMetrics.escalations})::integer`,
        totalShortCircuits: sql`SUM(${intelligenceMetrics.shortCircuits})::integer`,
        cacheHitRate: sql`AVG(CASE WHEN ${intelligenceMetrics.cacheHits} + ${intelligenceMetrics.cacheMisses} > 0 
                         THEN ${intelligenceMetrics.cacheHits}::numeric / (${intelligenceMetrics.cacheHits} + ${intelligenceMetrics.cacheMisses})::numeric 
                         ELSE 0 END)::numeric`
      }).from(intelligenceMetrics);
      
      let dbMetrics: any[];
      if (startDate && endDate) {
        dbMetrics = await (baseQuery as any).where(
          and(
            gte(intelligenceMetrics.timestamp, new Date(startDate)),
            lte(intelligenceMetrics.timestamp, new Date(endDate))
          )
        );
      } else {
        dbMetrics = await baseQuery;
      }
      
      const result = dbMetrics[0];
      
      res.json({
        success: true,
        current: {
          tierMetrics,
          extractorStats,
          policyConfig: policyStats.config
        },
        historical: {
          totalCost: parseFloat(String(result?.totalCost || '0')),
          averageCostPerLead: parseFloat(String(result?.avgCost || '0')),
          totalLeadsProcessed: parseInt(String(result?.totalLeads || '0')),
          averageConfidence: parseFloat(String(result?.avgConfidence || '0')),
          escalationRate: result?.totalEscalations && result?.totalLeads ? 
            (parseInt(String(result.totalEscalations)) / parseInt(String(result.totalLeads))) : 0,
          shortCircuitRate: result?.totalShortCircuits && result?.totalLeads ?
            (parseInt(String(result.totalShortCircuits)) / parseInt(String(result.totalLeads))) : 0,
          cacheHitRate: parseFloat(String(result?.cacheHitRate || '0'))
        }
      });
      
    } catch (error) {
      console.error('[BrainMonitoring] Error getting intelligence stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get intelligence statistics'
      });
    }
  });

  /**
   * Get cost report breakdown by tier
   */
  app.get('/api/brain/cost-report', async (req, res) => {
    try {
      const period = req.query.period as string || 'daily';
      const limit = parseInt(req.query.limit as string) || 30;
      
      const tierCosts = await db.select({
        date: sql`DATE(${intelligenceMetrics.timestamp})`,
        tier0Cost: sql`SUM(COALESCE((${intelligenceMetrics.costByTier}->>'0')::numeric, 0))`,
        tier1Cost: sql`SUM(COALESCE((${intelligenceMetrics.costByTier}->>'1')::numeric, 0))`,
        tier2Cost: sql`SUM(COALESCE((${intelligenceMetrics.costByTier}->>'2')::numeric, 0))`,
        totalCost: sql`SUM(${intelligenceMetrics.totalCost})::numeric`,
        leadCount: sql`COUNT(DISTINCT ${intelligenceMetrics.leadId})`
      })
      .from(intelligenceMetrics)
      .groupBy(sql`DATE(${intelligenceMetrics.timestamp})`)
      .orderBy(desc(sql`DATE(${intelligenceMetrics.timestamp})`))
      .limit(limit);
      
      const aggregatedMetrics = await db.select({
        period: processingMetrics.period,
        periodStart: processingMetrics.periodStart,
        totalCost: processingMetrics.totalCost,
        avgCostPerLead: processingMetrics.avgCostPerLead,
        costBySource: processingMetrics.costBySource,
        totalLeadsProcessed: processingMetrics.totalLeadsProcessed
      })
      .from(processingMetrics)
      .where(eq(processingMetrics.period, period))
      .orderBy(desc(processingMetrics.periodStart))
      .limit(limit);
      
      const trends = {
        dailyAverage: tierCosts.reduce((sum, day: any) => sum + parseFloat(String(day.totalCost || '0')), 0) / Math.max(1, tierCosts.length),
        tier0Percentage: 0,
        tier1Percentage: 0,
        tier2Percentage: 0
      };
      
      const totalCostAllTiers = tierCosts.reduce((sum, day: any) => {
        return sum + 
          parseFloat(String(day.tier0Cost || '0')) + 
          parseFloat(String(day.tier1Cost || '0')) + 
          parseFloat(String(day.tier2Cost || '0'));
      }, 0);
      
      if (totalCostAllTiers > 0) {
        const tier0Total = tierCosts.reduce((sum, day: any) => sum + parseFloat(String(day.tier0Cost || '0')), 0);
        const tier1Total = tierCosts.reduce((sum, day: any) => sum + parseFloat(String(day.tier1Cost || '0')), 0);
        const tier2Total = tierCosts.reduce((sum, day: any) => sum + parseFloat(String(day.tier2Cost || '0')), 0);
        
        trends.tier0Percentage = (tier0Total / totalCostAllTiers) * 100;
        trends.tier1Percentage = (tier1Total / totalCostAllTiers) * 100;
        trends.tier2Percentage = (tier2Total / totalCostAllTiers) * 100;
      }
      
      res.json({
        success: true,
        costBreakdown: tierCosts.map((row: any) => ({
          date: row.date,
          costs: {
            tier0: parseFloat(String(row.tier0Cost || '0')),
            tier1: parseFloat(String(row.tier1Cost || '0')),
            tier2: parseFloat(String(row.tier2Cost || '0')),
            total: parseFloat(String(row.totalCost || '0'))
          },
          leadsProcessed: parseInt(String(row.leadCount || '0')),
          avgCostPerLead: row.leadCount && parseInt(String(row.leadCount)) > 0 ? 
            parseFloat(String(row.totalCost || '0')) / parseInt(String(row.leadCount)) : 0
        })),
        aggregatedMetrics: aggregatedMetrics.map(metric => ({
          period: metric.period,
          startDate: metric.periodStart,
          totalCost: parseFloat(String(metric.totalCost || '0')),
          avgCostPerLead: parseFloat(String(metric.avgCostPerLead || '0')),
          costBySource: metric.costBySource,
          totalLeads: metric.totalLeadsProcessed
        })),
        trends,
        summary: {
          totalCostLast30Days: totalCostAllTiers,
          averageDailyCost: trends.dailyAverage,
          tierDistribution: {
            tier0: `${trends.tier0Percentage.toFixed(1)}%`,
            tier1: `${trends.tier1Percentage.toFixed(1)}%`,
            tier2: `${trends.tier2Percentage.toFixed(1)}%`
          }
        }
      });
      
    } catch (error) {
      console.error('[BrainMonitoring] Error generating cost report:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate cost report'
      });
    }
  });

  /**
   * Get performance metrics by tier
   */
  app.get('/api/brain/performance', async (req, res) => {
    try {
      const { tieredIntelligence } = await import('../intelligence/tiered-intelligence');
      const { embeddingsService } = await import('../intelligence/embeddings-service');
      const { llmService } = await import('../intelligence/llm-service');
      
      const currentStats = {
        tieredIntelligence: tieredIntelligence.getMetrics(),
        embeddings: embeddingsService.getStats(),
        llm: llmService.getStats()
      };
      
      const latencyMetrics = await db.select({
        avgLatency: sql`AVG(${intelligenceMetrics.totalLatency})::numeric`,
        tier0AvgLatency: sql`AVG(COALESCE((${intelligenceMetrics.latencyByTier}->>'0')::numeric, 0))`,
        tier1AvgLatency: sql`AVG(COALESCE((${intelligenceMetrics.latencyByTier}->>'1')::numeric, 0))`,
        tier2AvgLatency: sql`AVG(COALESCE((${intelligenceMetrics.latencyByTier}->>'2')::numeric, 0))`,
        maxLatency: sql`MAX(${intelligenceMetrics.totalLatency})`,
        minLatency: sql`MIN(${intelligenceMetrics.totalLatency})`
      })
      .from(intelligenceMetrics)
      .where(gte(intelligenceMetrics.timestamp, new Date(Date.now() - 24 * 60 * 60 * 1000)));
      
      const processingTimeMetrics = await db.select({
        avgProcessingTime: processingMetrics.avgProcessingTime,
        p95ProcessingTime: processingMetrics.p95ProcessingTime,
        p99ProcessingTime: processingMetrics.p99ProcessingTime,
        period: processingMetrics.period,
        periodStart: processingMetrics.periodStart
      })
      .from(processingMetrics)
      .where(eq(processingMetrics.period, 'hourly'))
      .orderBy(desc(processingMetrics.periodStart))
      .limit(24);
      
      const latencyData = latencyMetrics[0] as any;
      
      res.json({
        success: true,
        performance: {
          latency: {
            average: parseFloat(String(latencyData?.avgLatency || '0')),
            min: parseInt(String(latencyData?.minLatency || '0')),
            max: parseInt(String(latencyData?.maxLatency || '0')),
            byTier: {
              tier0: parseFloat(String(latencyData?.tier0AvgLatency || '0')),
              tier1: parseFloat(String(latencyData?.tier1AvgLatency || '0')),
              tier2: parseFloat(String(latencyData?.tier2AvgLatency || '0'))
            }
          },
          processingTime: {
            hourly: processingTimeMetrics.map(metric => ({
              hour: metric.periodStart,
              avg: metric.avgProcessingTime,
              p95: metric.p95ProcessingTime,
              p99: metric.p99ProcessingTime
            }))
          },
          throughput: {
            embeddings: {
              requestsPerMinute: currentStats.embeddings.requestCount,
              cacheSize: currentStats.embeddings.cacheSize
            },
            llm: {
              requestsPerMinute: currentStats.llm.requestCount,
              cacheSize: currentStats.llm.cacheSize
            }
          },
          caching: {
            tierMetrics: currentStats.tieredIntelligence.tierStats
          }
        }
      });
      
    } catch (error) {
      console.error('[BrainMonitoring] Error getting performance metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get performance metrics'
      });
    }
  });
}
