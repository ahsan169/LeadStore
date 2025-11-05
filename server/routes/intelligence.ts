import { Router } from 'express';
import type { Request, Response } from 'express';
import { storage } from '../storage';
import { intelligenceBrain } from '../services/intelligence-brain';
import { masterDatabase } from '../services/master-database';
import { costOptimization } from '../services/cost-optimization';
import { mlEnhancedDecision } from '../services/ml-enhanced-decision';

const router = Router();

// Middleware to ensure only admins can access intelligence endpoints
function requireAdmin(req: any, res: any, next: any) {
  // Check if user is authenticated (passport stores user in req.user)
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  // Check if user has admin role
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

router.use(requireAdmin);

// Get intelligence metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '24h';
    
    // Get metrics from storage
    const metrics = await storage.getIntelligenceMetrics(timeRange);
    
    // Get ML model metrics
    const modelMetrics = await mlEnhancedDecision.getModelMetrics();
    
    // Combine metrics
    const response = {
      totalDecisions: metrics?.totalDecisions || 0,
      averageConfidence: metrics?.averageConfidence || 0,
      creditsSaved: metrics?.creditsSaved || 0,
      enrichmentSuccessRate: metrics?.enrichmentSuccessRate || 0,
      optimalDecisions: metrics?.optimalDecisions || 0,
      suboptimalDecisions: metrics?.suboptimalDecisions || 0,
      averageProcessingTime: metrics?.averageProcessingTime || 0,
      modelAccuracy: modelMetrics.accuracy
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Intelligence] Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch intelligence metrics' });
  }
});

// Get database statistics
router.get('/database-stats', async (req: Request, res: Response) => {
  try {
    // Get cached entities count
    const cachedEntities = await storage.getMasterDatabaseCache();
    const totalEntities = cachedEntities?.length || 0;
    
    // Calculate statistics from cached data
    const industryCount: Record<string, number> = {};
    const stateCount: Record<string, number> = {};
    let totalCompleteness = 0;
    
    if (cachedEntities) {
      for (const entity of cachedEntities) {
        const data = entity.data as any;
        
        // Count industries
        if (data.industry) {
          industryCount[data.industry] = (industryCount[data.industry] || 0) + 1;
        }
        
        // Count states
        if (data.state) {
          stateCount[data.state] = (stateCount[data.state] || 0) + 1;
        }
        
        // Calculate completeness
        const fields = ['businessName', 'ownerName', 'phone', 'email', 'address', 'city', 'state', 'industry'];
        const filled = fields.filter(f => data[f]).length;
        totalCompleteness += filled / fields.length;
      }
    }
    
    // Sort and get top entries
    const topIndustries = Object.entries(industryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    const topStates = Object.entries(stateCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
    const response = {
      totalEntities,
      dailyGrowth: Math.floor(totalEntities * 0.05), // Simulated growth
      avgCompleteness: totalEntities > 0 ? totalCompleteness / totalEntities : 0,
      topIndustries,
      topStates,
      lastCrawlTime: new Date().toISOString(),
      queuedJobs: 0, // Would come from crawler service
      scrapingSuccess: 92 // Simulated success rate
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Intelligence] Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// Get cost metrics
router.get('/cost-metrics', async (req: Request, res: Response) => {
  try {
    // Get recent decisions for cost analysis
    const recentDecisions = await storage.getIntelligenceDecisions(1000);
    
    // Calculate costs by service
    const serviceUsage: Record<string, { count: number; cost: number; efficiency: number }> = {};
    let totalCost = 0;
    let totalSavings = 0;
    
    if (recentDecisions) {
      for (const decision of recentDecisions) {
        const services = (decision.servicesUsed as string[]) || [];
        const cost = decision.estimatedCost || 0;
        const actualCost = decision.actualCost || cost;
        
        totalCost += actualCost;
        if (cost > actualCost) {
          totalSavings += (cost - actualCost);
        }
        
        // Track service usage
        for (const service of services) {
          if (!serviceUsage[service]) {
            serviceUsage[service] = { count: 0, cost: 0, efficiency: 0 };
          }
          serviceUsage[service].count++;
          serviceUsage[service].cost += actualCost / services.length;
        }
      }
    }
    
    // Calculate efficiency for each service
    for (const service in serviceUsage) {
      const usage = serviceUsage[service];
      usage.efficiency = usage.count > 0 ? (1 - usage.cost / (usage.count * 0.1)) * 100 : 0;
    }
    
    // Convert to array format
    const serviceUsageArray = Object.entries(serviceUsage).map(([service, data]) => ({
      service,
      ...data
    }));
    
    const response = {
      dailySpend: totalCost / 30, // Assuming 30 days of data
      monthlySpend: totalCost,
      averageCostPerLead: recentDecisions && recentDecisions.length > 0 ? totalCost / recentDecisions.length : 0,
      creditUtilization: 75, // Simulated utilization percentage
      efficiencyScore: 85, // Simulated efficiency
      savingsFromOptimization: totalSavings,
      serviceUsage: serviceUsageArray
    };
    
    res.json(response);
  } catch (error) {
    console.error('[Intelligence] Error fetching cost metrics:', error);
    res.status(500).json({ error: 'Failed to fetch cost metrics' });
  }
});

// Get recent decisions
router.get('/recent-decisions', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const decisions = await storage.getIntelligenceDecisions(limit);
    
    // Transform decisions for frontend
    const transformedDecisions = decisions?.map(d => ({
      id: d.id,
      leadId: d.leadId,
      businessName: d.leadId, // Would need to fetch from leads table
      strategy: d.strategy,
      confidence: Math.round((d.confidence || 0.7) * 100),
      services: (d.servicesUsed as string[]) || [],
      estimatedCost: d.estimatedCost || 0,
      actualCost: d.actualCost,
      success: d.success,
      timestamp: d.createdAt
    })) || [];
    
    res.json(transformedDecisions);
  } catch (error) {
    console.error('[Intelligence] Error fetching recent decisions:', error);
    res.status(500).json({ error: 'Failed to fetch recent decisions' });
  }
});

// Get time series data
router.get('/time-series', async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '24h';
    
    // Generate time series data (would come from database in production)
    const dataPoints = [];
    const intervals = timeRange === '1h' ? 12 : timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : 30;
    
    for (let i = 0; i < intervals; i++) {
      dataPoints.push({
        time: new Date(Date.now() - (intervals - i) * 3600000).toISOString(),
        date: new Date(Date.now() - (intervals - i) * 3600000).toLocaleDateString(),
        decisions: Math.floor(Math.random() * 100) + 50,
        enrichments: Math.floor(Math.random() * 80) + 30,
        errors: Math.floor(Math.random() * 10),
        entities: Math.floor(1000 + i * 50 + Math.random() * 20),
        processingTime: Math.floor(Math.random() * 500) + 200,
        successRate: 85 + Math.random() * 10,
        confidence: 70 + Math.random() * 20
      });
    }
    
    res.json(dataPoints);
  } catch (error) {
    console.error('[Intelligence] Error fetching time series:', error);
    res.status(500).json({ error: 'Failed to fetch time series data' });
  }
});

// Trigger manual intelligence analysis
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID required' });
    }
    
    // Get lead from database
    const lead = await storage.getLead(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    // Run intelligence analysis
    const decision = await intelligenceBrain.analyzeAndDecide(lead);
    
    // Store decision
    await storage.logIntelligenceDecision({
      leadId,
      strategy: decision.strategy,
      confidence: decision.confidence,
      servicesUsed: decision.services,
      estimatedCost: decision.estimatedCost,
      reason: decision.reasoning
    });
    
    // Execute enrichment based on decision
    if (decision.services.length > 0 && !decision.skipReasons?.length) {
      // Import enrichment orchestrator
      const { masterEnrichmentOrchestrator } = await import('../services/master-enrichment-orchestrator');
      
      // Execute enrichment with the decided strategy
      const enrichmentResult = await masterEnrichmentOrchestrator.enrichLead(lead, {
        source: 'intelligence',
        priority: decision.priority > 7 ? 'high' : decision.priority > 4 ? 'medium' : 'low',
        forceRefresh: true
      });
      
      // Update decision with actual cost and results
      if (decision.leadId) {
        await storage.updateIntelligenceDecision(decision.leadId, {
          actualCost: enrichmentResult.enrichmentMetadata.apiCallCount * 0.01, // Estimate cost per API call
          success: enrichmentResult.masterEnrichmentScore > 50,
          enrichmentResults: enrichmentResult.finalData
        });
      }
    }
    
    res.json({
      success: true,
      decision
    });
  } catch (error) {
    console.error('[Intelligence] Error analyzing lead:', error);
    res.status(500).json({ error: 'Failed to analyze lead' });
  }
});

// Get optimization suggestions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    // Get recent leads for pattern analysis
    const recentLeads = await storage.getLeads(100);
    
    if (recentLeads && recentLeads.length > 0) {
      // Detect patterns
      const patterns = await mlEnhancedDecision.detectPatterns(recentLeads);
      
      // Get optimization suggestions
      const suggestions = patterns.map(p => ({
        type: p.impact,
        message: p.recommendation,
        confidence: p.confidence,
        affectedCount: p.affectedLeads
      }));
      
      res.json(suggestions);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('[Intelligence] Error getting suggestions:', error);
    res.status(500).json({ error: 'Failed to get optimization suggestions' });
  }
});

// Search master database
router.get('/master-search', async (req: Request, res: Response) => {
  try {
    const { businessName, ownerName, uccNumber, state } = req.query;
    
    const results = await storage.searchMasterDatabase({
      businessName: businessName as string,
      ownerName: ownerName as string,
      uccNumber: uccNumber as string,
      state: state as string
    });
    
    res.json(results || []);
  } catch (error) {
    console.error('[Intelligence] Error searching master database:', error);
    res.status(500).json({ error: 'Failed to search master database' });
  }
});

export default router;