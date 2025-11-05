import type { Express } from "express";
import { leadCompletionAnalyzer } from "../services/lead-completion-analyzer";
import { enrichmentQueue } from "../services/enrichment-queue";
import { storage } from "../storage";

// Middleware to check authentication
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: req.session.userId, role: req.session.userRole };
  next();
}

// Middleware to check admin role
function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.userRole !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function registerEnrichmentQueueRoutes(app: Express) {
  
  // GET /api/admin/enrichment/queue/stats - Get enrichment queue statistics
  app.get("/api/admin/enrichment/queue/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = enrichmentQueue.getStats();
      const metrics = enrichmentQueue.getMonitoringMetrics();
      
      res.json({
        success: true,
        stats,
        metrics,
        timestamp: new Date()
      });
    } catch (error) {
      console.error("Error fetching enrichment queue stats:", error);
      res.status(500).json({ error: "Failed to fetch enrichment queue statistics" });
    }
  });
  
  // GET /api/admin/enrichment/monitoring - Get comprehensive monitoring data
  app.get("/api/admin/enrichment/monitoring", requireAuth, requireAdmin, async (req, res) => {
    try {
      const metrics = enrichmentQueue.getMonitoringMetrics();
      
      // Get recent enrichment jobs from database
      const recentJobs = await storage.getRecentEnrichmentJobs(10);
      
      // Get enrichment analytics
      const analytics = await storage.getEnrichmentAnalytics();
      
      res.json({
        success: true,
        monitoring: {
          realtime: metrics,
          recentJobs,
          analytics,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error("Error fetching enrichment monitoring data:", error);
      res.status(500).json({ error: "Failed to fetch enrichment monitoring data" });
    }
  });
  
  // GET /api/admin/enrichment/queue/deadletter - Get dead letter queue items
  app.get("/api/admin/enrichment/queue/deadletter", requireAuth, requireAdmin, async (req, res) => {
    try {
      const deadLetterItems = enrichmentQueue.getDeadLetterItems();
      
      res.json({
        success: true,
        items: deadLetterItems,
        count: deadLetterItems.length
      });
    } catch (error) {
      console.error("Error fetching dead letter queue:", error);
      res.status(500).json({ error: "Failed to fetch dead letter queue items" });
    }
  });
  
  // POST /api/admin/enrichment/queue/deadletter/retry - Retry dead letter items
  app.post("/api/admin/enrichment/queue/deadletter/retry", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { itemIds } = req.body;
      
      const retried = await enrichmentQueue.retryDeadLetterItems(itemIds);
      
      res.json({
        success: true,
        message: `Retried ${retried} items from dead letter queue`,
        retriedCount: retried
      });
    } catch (error) {
      console.error("Error retrying dead letter items:", error);
      res.status(500).json({ error: "Failed to retry dead letter items" });
    }
  });
  
  // GET /api/admin/enrichment/queue/items - Get enrichment queue items
  app.get("/api/admin/enrichment/queue/items", requireAuth, requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as any;
      const items = enrichmentQueue.getQueueItems(status);
      
      res.json({
        success: true,
        items,
        count: items.length
      });
    } catch (error) {
      console.error("Error fetching enrichment queue items:", error);
      res.status(500).json({ error: "Failed to fetch enrichment queue items" });
    }
  });
  
  // POST /api/admin/enrichment/queue/batch - Queue all incomplete leads for enrichment
  app.post("/api/admin/enrichment/queue/batch", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { minCompletionScore = 80, maxLeads = 100, priority = 'low' } = req.body;
      
      const queuedCount = await enrichmentQueue.queueIncompleteLeads({
        minCompletionScore,
        maxLeads,
        priority
      });
      
      res.json({
        success: true,
        message: `Queued ${queuedCount} leads for enrichment`,
        queuedCount
      });
    } catch (error) {
      console.error("Error queuing batch enrichment:", error);
      res.status(500).json({ error: "Failed to queue batch enrichment" });
    }
  });
  
  // POST /api/admin/enrichment/queue/pause - Pause enrichment processing
  app.post("/api/admin/enrichment/queue/pause", requireAuth, requireAdmin, async (req, res) => {
    try {
      enrichmentQueue.stopProcessing();
      res.json({
        success: true,
        message: "Enrichment queue processing paused"
      });
    } catch (error) {
      console.error("Error pausing enrichment queue:", error);
      res.status(500).json({ error: "Failed to pause enrichment queue" });
    }
  });
  
  // POST /api/admin/enrichment/queue/resume - Resume enrichment processing
  app.post("/api/admin/enrichment/queue/resume", requireAuth, requireAdmin, async (req, res) => {
    try {
      enrichmentQueue.resumeProcessing();
      res.json({
        success: true,
        message: "Enrichment queue processing resumed"
      });
    } catch (error) {
      console.error("Error resuming enrichment queue:", error);
      res.status(500).json({ error: "Failed to resume enrichment queue" });
    }
  });
  
  // POST /api/admin/enrichment/queue/clear - Clear completed/failed items from queue
  app.post("/api/admin/enrichment/queue/clear", requireAuth, requireAdmin, async (req, res) => {
    try {
      const cleared = enrichmentQueue.clearCompleted();
      res.json({
        success: true,
        message: `Cleared ${cleared} completed/failed items from queue`,
        clearedCount: cleared
      });
    } catch (error) {
      console.error("Error clearing enrichment queue:", error);
      res.status(500).json({ error: "Failed to clear enrichment queue" });
    }
  });
  
  // POST /api/leads/:id/enrich - Manually enrich a specific lead
  app.post("/api/leads/:id/enrich", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      const { priority = 'high' } = req.body;
      
      // Get the lead
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Check if user has access to this lead
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== 'admin' && lead.soldTo !== user.id)) {
        return res.status(403).json({ error: "Access denied to this lead" });
      }
      
      // Analyze lead completion
      const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(lead);
      
      // Queue for enrichment
      const queueId = await enrichmentQueue.addToQueue(
        lead,
        priority,
        'manual',
        { userId: user.id }
      );
      
      res.json({
        success: true,
        message: `Lead queued for enrichment`,
        queueId,
        analysis: {
          completionScore: analysis.completionScore,
          dataQualityScore: analysis.dataQualityScore,
          enrichmentPriority: analysis.enrichmentPriority,
          canBeAutoEnriched: analysis.canBeAutoEnriched,
          missingFields: analysis.missingFields.map(f => ({
            field: f.field,
            importance: f.importance
          }))
        }
      });
    } catch (error) {
      console.error("Error queueing lead for enrichment:", error);
      res.status(500).json({ error: "Failed to queue lead for enrichment" });
    }
  });
  
  // GET /api/leads/:id/completion-analysis - Analyze lead completion
  app.get("/api/leads/:id/completion-analysis", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      
      // Get the lead
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Check if user has access to this lead
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== 'admin' && lead.soldTo !== user.id)) {
        return res.status(403).json({ error: "Access denied to this lead" });
      }
      
      // Analyze lead completion
      const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(lead);
      
      res.json({
        success: true,
        analysis
      });
    } catch (error) {
      console.error("Error analyzing lead completion:", error);
      res.status(500).json({ error: "Failed to analyze lead completion" });
    }
  });
  
  // GET /api/admin/enrichment/batch-analysis - Analyze completion for multiple leads
  app.get("/api/admin/enrichment/batch-analysis", requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      // Get recent leads
      const leads = await storage.getLeadsNeedingEnrichment(80, limit);
      
      // Analyze each lead
      const analyses = await leadCompletionAnalyzer.batchAnalyzeLeads(leads);
      
      // Get statistics
      const stats = leadCompletionAnalyzer.getEnrichmentStats(analyses);
      
      res.json({
        success: true,
        totalAnalyzed: analyses.length,
        stats,
        sampleAnalyses: analyses.slice(0, 10) // Return first 10 as sample
      });
    } catch (error) {
      console.error("Error performing batch analysis:", error);
      res.status(500).json({ error: "Failed to perform batch analysis" });
    }
  });
  
  console.log('[EnrichmentQueueRoutes] Registered enrichment queue management endpoints');
}