/**
 * Enhanced Enrichment Routes
 * 
 * Exposes new enrichment capabilities to admin dashboard:
 * - Public data aggregation
 * - Advanced verification
 * - Enhanced lead scoring
 * - Data provider management
 * - Lead discovery engine
 */

import { Express } from "express";
import { publicDataAggregator } from "../services/public-data-aggregator";
import { advancedVerification } from "../services/advanced-verification";
import { enhancedLeadScoring } from "../services/enhanced-lead-scoring";
import { dataProviderManager } from "../services/data-provider-framework";
import { leadDiscoveryEngine } from "../services/lead-discovery-engine";
import { storage } from "../storage";

// Middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: req.session.userId, role: req.session.userRole };
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.userRole !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function setupEnhancedEnrichmentRoutes(app: Express) {
  
  /**
   * GET /api/admin/enrichment/public-data/:companyName
   * Aggregate public data for a company
   */
  app.get("/api/admin/enrichment/public-data/:companyName", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { companyName } = req.params;
      
      const data = await publicDataAggregator.aggregateCompanyData(companyName);
      
      res.json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Public data aggregation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/enrichment/verify-lead
   * Perform comprehensive verification on a lead
   */
  app.post("/api/admin/enrichment/verify-lead", requireAuth, requireAdmin, async (req, res) => {
    try {
      const leadData = req.body;
      
      const verification = await advancedVerification.verifyLead(leadData);
      
      res.json({
        success: true,
        verification
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Verification error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/enrichment/score-lead
   * Calculate enhanced lead score
   */
  app.post("/api/admin/enrichment/score-lead", requireAuth, requireAdmin, async (req, res) => {
    try {
      const factors = req.body;
      
      const score = await enhancedLeadScoring.calculateEnhancedScore(factors);
      
      res.json({
        success: true,
        score
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Scoring error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/admin/enrichment/providers
   * Get list of available data providers
   */
  app.get("/api/admin/enrichment/providers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const providers = dataProviderManager.getAvailableProviders();
      
      res.json({
        success: true,
        providers,
        configured: {
          hunter: !!process.env.HUNTER_API_KEY,
          clearbit: !!process.env.CLEARBIT_API_KEY,
          googlePlaces: !!process.env.GOOGLE_PLACES_API_KEY,
          openCorporates: !!process.env.OPENCORPORATES_API_KEY
        }
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Provider list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/enrichment/find-email
   * Find email using data providers
   */
  app.post("/api/admin/enrichment/find-email", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { firstName, lastName, domain } = req.body;
      
      if (!firstName || !lastName || !domain) {
        return res.status(400).json({
          success: false,
          error: 'firstName, lastName, and domain are required'
        });
      }

      const result = await dataProviderManager.findEmail(firstName, lastName, domain);
      
      res.json({
        success: result.success,
        result
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Find email error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/enrichment/enrich-company
   * Enrich company data using data providers
   */
  app.post("/api/admin/enrichment/enrich-company", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { domain } = req.body;
      
      if (!domain) {
        return res.status(400).json({
          success: false,
          error: 'domain is required'
        });
      }

      const result = await dataProviderManager.enrichCompany(domain);
      
      res.json({
        success: result.success,
        result
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Enrich company error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/admin/discovery/stats
   * Get lead discovery engine statistics
   */
  app.get("/api/admin/discovery/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = leadDiscoveryEngine.getStatistics();
      
      res.json({
        success: true,
        stats
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Discovery stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/discovery/start
   * Start automatic lead discovery
   */
  app.post("/api/admin/discovery/start", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { intervalMinutes = 60 } = req.body;
      
      leadDiscoveryEngine.start(intervalMinutes);
      
      res.json({
        success: true,
        message: `Lead discovery started (every ${intervalMinutes} minutes)`
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Discovery start error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/discovery/stop
   * Stop automatic lead discovery
   */
  app.post("/api/admin/discovery/stop", requireAuth, requireAdmin, async (req, res) => {
    try {
      leadDiscoveryEngine.stop();
      
      res.json({
        success: true,
        message: 'Lead discovery stopped'
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Discovery stop error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/discovery/run-now
   * Run lead discovery immediately
   */
  app.post("/api/admin/discovery/run-now", requireAuth, requireAdmin, async (req, res) => {
    try {
      const results = await leadDiscoveryEngine.discoverLeads();
      
      res.json({
        success: true,
        results
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Discovery run error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/discovery/toggle-source
   * Enable/disable a discovery source
   */
  app.post("/api/admin/discovery/toggle-source", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { sourceKey, enabled } = req.body;
      
      if (!sourceKey || enabled === undefined) {
        return res.status(400).json({
          success: false,
          error: 'sourceKey and enabled are required'
        });
      }

      leadDiscoveryEngine.toggleSource(sourceKey, enabled);
      
      res.json({
        success: true,
        message: `Source ${sourceKey} ${enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Toggle source error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/admin/enrichment/enrich-lead/:id
   * Fully enrich a specific lead using all services
   */
  app.post("/api/admin/enrichment/enrich-lead/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLead(leadId);
      
      if (!lead) {
        return res.status(404).json({
          success: false,
          error: 'Lead not found'
        });
      }

      // 1. Aggregate public data
      let publicData = null;
      if (lead.companyName) {
        publicData = await publicDataAggregator.aggregateCompanyData(lead.companyName);
      }

      // 2. Verify contact information
      const verification = await advancedVerification.verifyLead({
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        website: lead.website || undefined,
        companyName: lead.companyName || undefined
      });

      // 3. Calculate enhanced score
      const score = await enhancedLeadScoring.calculateEnhancedScore({
        industry: lead.industry || publicData?.industry,
        revenue: lead.annualRevenue || (publicData?.revenue ? parseInt(publicData.revenue) : undefined),
        emailVerified: verification.email?.isValid,
        phoneVerified: verification.phone?.isValid,
        domainVerified: verification.domain?.isValid,
        dataCompleteness: verification.overallScore
      });

      // 4. Update lead with enriched data
      await storage.updateLead(leadId, {
        industry: lead.industry || publicData?.industry,
        website: lead.website || publicData?.website,
        phone: lead.phone || publicData?.phone,
        email: lead.email || publicData?.email,
        qualityScore: score.totalScore,
        leadIntelligenceScore: score.totalScore,
        verificationStatus: verification.overallStatus === 'high_confidence' ? 'verified' : 
                            verification.overallStatus === 'medium_confidence' ? 'partial' : 'pending'
      });

      res.json({
        success: true,
        message: 'Lead enriched successfully',
        enrichment: {
          publicData,
          verification,
          score
        }
      });
    } catch (error: any) {
      console.error('[EnhancedEnrichment] Enrich lead error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  console.log('[EnhancedEnrichment] Routes registered');
}
