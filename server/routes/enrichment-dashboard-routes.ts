import { Express } from "express";
import { enrichmentQueue } from "../services/enrichment-queue";
import { storage } from "../storage";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { db } from "../db";
import { intelligenceDecisions, enrichmentJobs } from "../../shared/schema";
import { desc, sql, gte, and, eq } from "drizzle-orm";
import { EnrichmentAnalytics } from "../services/enrichment-analytics";
import { EnrichmentAuditTrail, AuditEventType, AuditSeverity } from "../services/enrichment-audit-trail";
import { EnrichmentCache } from "../services/enrichment-cache";
import { EnrichmentQualityAssurance } from "../services/enrichment-quality-assurance";

// Initialize service instances
const analytics = new EnrichmentAnalytics();
const auditTrail = new EnrichmentAuditTrail();
const enrichmentCache = new EnrichmentCache();
const qualityAssurance = new EnrichmentQualityAssurance();

export function registerEnrichmentDashboardRoutes(app: Express) {
  // GET /api/enrichment/stats - Get enrichment statistics
  app.get("/api/enrichment/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = enrichmentQueue.getMonitoringMetrics();
      
      // Get intelligence metrics
      const intelligenceMetrics = await getIntelligenceMetrics();
      
      // Get recent AI decisions
      const recentDecisions = await db
        .select()
        .from(intelligenceDecisions)
        .orderBy(desc(intelligenceDecisions.createdAt))
        .limit(10);

      res.json({
        ...stats,
        intelligence: {
          totalDecisions: intelligenceMetrics.totalDecisions,
          accuracy: intelligenceMetrics.accuracy,
          creditsSaved: intelligenceMetrics.creditsSaved,
          optimizationRate: intelligenceMetrics.optimizationRate,
          recentDecisions: recentDecisions.map(d => ({
            strategy: d.strategy,
            reasoning: d.reasoning,
            confidence: d.confidence,
            estimatedCost: d.estimatedCost,
            priority: d.priority,
            timestamp: d.createdAt
          }))
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching enrichment stats:", error);
      res.status(500).json({ 
        error: "Failed to fetch enrichment statistics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/queue - Get queue items
  app.get("/api/enrichment/queue", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status, priority, limit = '50' } = req.query;
      
      const queueItems = enrichmentQueue.getQueueItems({
        status: status as any,
        priority: priority as any,
        limit: parseInt(limit as string)
      });

      // Enrich queue items with lead names
      const enrichedItems = await Promise.all(
        queueItems.map(async (item) => {
          let businessName = item.leadData?.businessName;
          
          if (!businessName && item.leadId) {
            try {
              const lead = await storage.getLead(item.leadId);
              businessName = lead?.businessName;
            } catch (e) {
              // Ignore errors fetching lead
            }
          }

          return {
            ...item,
            businessName,
            servicesUsed: item.result?.sources || [],
            totalCost: item.result?.totalCost || 0,
            enrichmentScore: item.result?.confidence || 0
          };
        })
      );

      res.json({
        items: enrichedItems,
        total: enrichedItems.length,
        stats: enrichmentQueue.getStats()
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching queue items:", error);
      res.status(500).json({ 
        error: "Failed to fetch queue items",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/health - Get service health status
  app.get("/api/enrichment/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const hunterHealth = enrichmentQueue.getServiceHealth('hunter');
      const numverifyHealth = enrichmentQueue.getServiceHealth('numverify');
      const perplexityHealth = enrichmentQueue.getServiceHealth('perplexity');
      const openaiHealth = enrichmentQueue.getServiceHealth('openai');
      
      const services = [
        { service: 'Perplexity', ...perplexityHealth },
        { service: 'Hunter.io', ...hunterHealth },
        { service: 'Numverify', ...numverifyHealth },
        { service: 'OpenAI', ...openaiHealth }
      ];

      const overallHealth = calculateOverallHealth(services);

      res.json({
        services,
        overall: overallHealth,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching service health:", error);
      res.status(500).json({ 
        error: "Failed to fetch service health",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/activity/recent - Get recent activity
  app.get("/api/enrichment/activity/recent", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = '50' } = req.query;
      
      // Get recent enrichment jobs from database
      const recentJobs = await db
        .select({
          id: enrichmentJobs.id,
          leadId: enrichmentJobs.leadId,
          businessName: enrichmentJobs.businessName,
          status: enrichmentJobs.status,
          processingTime: enrichmentJobs.processingTime,
          servicesUsed: enrichmentJobs.servicesUsed,
          totalCost: enrichmentJobs.totalCost,
          errorMessage: enrichmentJobs.errorMessage,
          createdAt: enrichmentJobs.createdAt,
          completedAt: enrichmentJobs.completedAt
        })
        .from(enrichmentJobs)
        .orderBy(desc(enrichmentJobs.createdAt))
        .limit(parseInt(limit as string));

      res.json({
        activities: recentJobs.map(job => ({
          id: job.id,
          leadId: job.leadId,
          businessName: job.businessName,
          status: job.status,
          action: 'Enrichment',
          duration: job.processingTime,
          servicesUsed: job.servicesUsed || [],
          cost: job.totalCost || 0,
          error: job.errorMessage,
          timestamp: job.createdAt
        }))
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching recent activity:", error);
      res.status(500).json({ 
        error: "Failed to fetch recent activity",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/analytics - Get analytics data from service
  app.get("/api/enrichment/analytics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const metrics = analytics.getMetrics();
      const trends = analytics.getTrends();
      const insights = await analytics.getPerformanceInsights();
      
      res.json({
        success: true,
        data: {
          metrics,
          trends,
          insights
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching analytics:", error);
      res.status(500).json({ 
        error: "Failed to fetch analytics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/audit - Get audit trail data
  app.get("/api/enrichment/audit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = '100', severity } = req.query;
      
      const logs = auditTrail.getRecentLogs(
        parseInt(limit as string), 
        severity as AuditSeverity | undefined
      );
      
      res.json({
        success: true,
        data: {
          logs,
          total: logs.length
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching audit logs:", error);
      res.status(500).json({ 
        error: "Failed to fetch audit logs",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/cache/stats - Get cache statistics
  app.get("/api/enrichment/cache/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = enrichmentCache.getStats();
      const hitRate = enrichmentCache.getHitRate();
      
      res.json({
        success: true,
        data: {
          ...stats,
          hitRate,
          savings: stats.hits * 0.05 // Estimated $ saved per cache hit
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching cache stats:", error);
      res.status(500).json({ 
        error: "Failed to fetch cache statistics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/cache/entries - Get cached entries
  app.get("/api/enrichment/cache/entries", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = '50' } = req.query;
      const entries = enrichmentCache.getRecentEntries(parseInt(limit as string));
      
      res.json({
        success: true,
        data: {
          entries,
          total: entries.length
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching cache entries:", error);
      res.status(500).json({ 
        error: "Failed to fetch cache entries",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/metrics/history - Get historical metrics
  app.get("/api/enrichment/metrics/history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { period = '24h' } = req.query;
      
      // Calculate the time window
      const now = new Date();
      const startTime = new Date();
      
      if (period === '24h') {
        startTime.setHours(startTime.getHours() - 24);
      } else if (period === '7d') {
        startTime.setDate(startTime.getDate() - 7);
      } else if (period === '30d') {
        startTime.setDate(startTime.getDate() - 30);
      }

      // Get enrichment logs from database
      const logs = await db
        .select({
          createdAt: enrichmentJobs.createdAt,
          status: enrichmentJobs.status,
          servicesUsed: enrichmentJobs.servicesUsed,
          totalCost: enrichmentJobs.totalCost,
          processingTime: enrichmentJobs.processingTime,
        })
        .from(enrichmentJobs)
        .where(gte(enrichmentJobs.createdAt, startTime))
        .orderBy(enrichmentJobs.createdAt);

      // Process logs into hourly/daily buckets
      const hourlyData = processIntoTimeBuckets(logs, 'hour');
      const servicePerformance = calculateServicePerformance(logs);
      const costTrends = calculateCostTrends(logs, period as string);

      res.json({
        hourly: hourlyData,
        servicePerformance,
        costTrends,
        summary: {
          totalEnrichments: logs.length,
          successRate: calculateSuccessRate(logs),
          averageCost: calculateAverageCost(logs),
          averageProcessingTime: calculateAverageProcessingTime(logs)
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching historical metrics:", error);
      res.status(500).json({ 
        error: "Failed to fetch historical metrics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/enrichment/queue/pause - Pause queue processing
  app.post("/api/enrichment/queue/pause", requireAuth, requireAdmin, async (req, res) => {
    try {
      enrichmentQueue.pauseProcessing();

      res.json({ 
        success: true, 
        message: 'Queue processing paused' 
      });
    } catch (error) {
      console.error("[Dashboard] Error pausing queue:", error);
      res.status(500).json({ 
        error: "Failed to pause queue",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/enrichment/queue/resume - Resume queue processing
  app.post("/api/enrichment/queue/resume", requireAuth, requireAdmin, async (req, res) => {
    try {
      enrichmentQueue.resumeProcessing();

      res.json({ 
        success: true, 
        message: 'Queue processing resumed' 
      });
    } catch (error) {
      console.error("[Dashboard] Error resuming queue:", error);
      res.status(500).json({ 
        error: "Failed to resume queue",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/enrichment/queue/retry - Retry failed items
  app.post("/api/enrichment/queue/retry", requireAuth, requireAdmin, async (req, res) => {
    try {
      const retriedCount = enrichmentQueue.retryFailed();

      res.json({ 
        success: true, 
        message: `Retried ${retriedCount} failed items`,
        count: retriedCount
      });
    } catch (error) {
      console.error("[Dashboard] Error retrying failed items:", error);
      res.status(500).json({ 
        error: "Failed to retry items",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // DELETE /api/enrichment/dead-letter/clear - Clear dead letter queue
  app.delete("/api/enrichment/dead-letter/clear", requireAuth, requireAdmin, async (req, res) => {
    try {
      const clearedCount = enrichmentQueue.clearDeadLetter();

      res.json({ 
        success: true, 
        message: `Cleared ${clearedCount} items from dead letter queue`,
        count: clearedCount
      });
    } catch (error) {
      console.error("[Dashboard] Error clearing dead letter queue:", error);
      res.status(500).json({ 
        error: "Failed to clear dead letter queue",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/enrichment/cache/clear - Clear cache
  app.post("/api/enrichment/cache/clear", requireAuth, requireAdmin, async (req, res) => {
    try {
      enrichmentCache.clear();
      
      await auditTrail.log({
        type: AuditEventType.CACHE_CLEAR,
        userId: req.user?.id || 'system',
        leadId: undefined,
        action: 'Manual cache clear from dashboard',
        severity: AuditSeverity.INFO,
        metadata: {
          clearedBy: req.user?.username || 'unknown'
        }
      });
      
      res.json({
        success: true,
        message: "Cache cleared successfully"
      });
    } catch (error) {
      console.error("[Dashboard] Error clearing cache:", error);
      res.status(500).json({ 
        error: "Failed to clear cache",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/enrichment/cache/invalidate - Invalidate specific cache entries
  app.post("/api/enrichment/cache/invalidate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!Array.isArray(leadIds)) {
        return res.status(400).json({ error: "leadIds must be an array" });
      }
      
      let invalidatedCount = 0;
      for (const leadId of leadIds) {
        const key = `lead:${leadId}`;
        enrichmentCache.invalidate(key);
        invalidatedCount++;
      }
      
      await auditTrail.log({
        type: AuditEventType.CACHE_INVALIDATION,
        userId: req.user?.id || 'system',
        leadId: undefined,
        action: `Invalidated ${invalidatedCount} cache entries`,
        severity: AuditSeverity.INFO,
        metadata: {
          leadIds,
          invalidatedBy: req.user?.username || 'unknown'
        }
      });
      
      res.json({
        success: true,
        message: `Invalidated ${invalidatedCount} cache entries`,
        count: invalidatedCount
      });
    } catch (error) {
      console.error("[Dashboard] Error invalidating cache:", error);
      res.status(500).json({ 
        error: "Failed to invalidate cache",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/quality/issues - Get quality issues
  app.get("/api/enrichment/quality/issues", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = '50' } = req.query;
      const issues = qualityAssurance.getRecentIssues(parseInt(limit as string));
      
      res.json({
        success: true,
        data: {
          issues,
          total: issues.length
        }
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching quality issues:", error);
      res.status(500).json({ 
        error: "Failed to fetch quality issues",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/quality/metrics - Get quality metrics
  app.get("/api/enrichment/quality/metrics", requireAuth, requireAdmin, async (req, res) => {
    try {
      const metrics = qualityAssurance.getQualityMetrics();
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching quality metrics:", error);
      res.status(500).json({ 
        error: "Failed to fetch quality metrics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/audit/report - Get audit report
  app.get("/api/enrichment/audit/report", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;
      
      const report = auditTrail.generateAuditReport(start, end);
      
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error("[Dashboard] Error generating audit report:", error);
      res.status(500).json({ 
        error: "Failed to generate audit report",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/enrichment/performance-insights - Get performance insights
  app.get("/api/enrichment/performance-insights", requireAuth, requireAdmin, async (req, res) => {
    try {
      const insights = await analytics.getPerformanceInsights();
      
      res.json({
        success: true,
        data: insights
      });
    } catch (error) {
      console.error("[Dashboard] Error fetching performance insights:", error);
      res.status(500).json({ 
        error: "Failed to fetch performance insights",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}

// Helper functions
async function getIntelligenceMetrics() {
  try {
    const [totalDecisions] = await db
      .select({ count: sql<number>`count(*)` })
      .from(intelligenceDecisions);

    const [successfulDecisions] = await db
      .select({ count: sql<number>`count(*)` })
      .from(intelligenceDecisions)
      .where(eq(intelligenceDecisions.success, true));

    const [savedCredits] = await db
      .select({ 
        total: sql<number>`COALESCE(SUM((estimated_cost::numeric - actual_cost::numeric)), 0)` 
      })
      .from(intelligenceDecisions)
      .where(sql`actual_cost::numeric < estimated_cost::numeric`);

    const total = totalDecisions?.count || 0;
    const successful = successfulDecisions?.count || 0;
    
    return {
      totalDecisions: total,
      accuracy: total > 0 ? (successful / total) * 100 : 0,
      creditsSaved: savedCredits?.total || 0,
      optimizationRate: total > 0 ? ((total - successful) / total) * 100 : 0
    };
  } catch (error) {
    console.error("[Dashboard] Error getting intelligence metrics:", error);
    return {
      totalDecisions: 0,
      accuracy: 0,
      creditsSaved: 0,
      optimizationRate: 0
    };
  }
}

function calculateOverallHealth(services: any[]) {
  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;
  const downCount = services.filter(s => s.status === 'down').length;
  
  if (downCount > services.length / 2) return 'critical';
  if (downCount > 0 || degradedCount > services.length / 2) return 'degraded';
  if (degradedCount > 0) return 'partial';
  return 'healthy';
}

function processIntoTimeBuckets(logs: any[], bucketType: 'hour' | 'day') {
  const buckets = new Map();
  
  logs.forEach(log => {
    const date = new Date(log.createdAt);
    const key = bucketType === 'hour' 
      ? `${date.getHours()}:00`
      : date.toISOString().split('T')[0];
    
    if (!buckets.has(key)) {
      buckets.set(key, { successful: 0, failed: 0, total: 0 });
    }
    
    const bucket = buckets.get(key);
    bucket.total++;
    
    if (log.status === 'completed') {
      bucket.successful++;
    } else if (log.status === 'failed') {
      bucket.failed++;
    }
  });

  return Array.from(buckets.entries()).map(([key, value]) => ({
    [bucketType]: key,
    ...value
  }));
}

function calculateServicePerformance(logs: any[]) {
  const serviceStats = new Map();
  
  logs.forEach(log => {
    const services = log.servicesUsed || [];
    services.forEach((service: string) => {
      if (!serviceStats.has(service)) {
        serviceStats.set(service, { total: 0, successful: 0, failed: 0 });
      }
      const stats = serviceStats.get(service);
      stats.total++;
      if (log.status === 'completed') {
        stats.successful++;
      } else if (log.status === 'failed') {
        stats.failed++;
      }
    });
  });
  
  return Array.from(serviceStats.entries()).map(([service, stats]) => ({
    service,
    ...stats,
    successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
  }));
}

function calculateCostTrends(logs: any[], period: string) {
  if (logs.length === 0) return [];
  
  const bucketType = period === '24h' ? 'hour' : 'day';
  const costBuckets = new Map();
  
  logs.forEach(log => {
    const date = new Date(log.createdAt);
    const key = bucketType === 'hour' 
      ? `${date.getHours()}:00`
      : date.toISOString().split('T')[0];
    
    if (!costBuckets.has(key)) {
      costBuckets.set(key, { totalCost: 0, count: 0 });
    }
    
    const bucket = costBuckets.get(key);
    bucket.totalCost += parseFloat(log.totalCost || '0');
    bucket.count++;
  });
  
  return Array.from(costBuckets.entries()).map(([key, value]) => ({
    [bucketType]: key,
    totalCost: value.totalCost,
    averageCost: value.count > 0 ? value.totalCost / value.count : 0,
    count: value.count
  }));
}

function calculateSuccessRate(logs: any[]): number {
  if (logs.length === 0) return 0;
  const successCount = logs.filter(log => log.status === 'completed').length;
  return (successCount / logs.length) * 100;
}

function calculateAverageCost(logs: any[]): number {
  if (logs.length === 0) return 0;
  const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.totalCost || '0'), 0);
  return totalCost / logs.length;
}

function calculateAverageProcessingTime(logs: any[]): number {
  if (logs.length === 0) return 0;
  const totalTime = logs.reduce((sum, log) => sum + (log.processingTime || 0), 0);
  return totalTime / logs.length;
}