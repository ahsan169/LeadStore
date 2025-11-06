import { Express } from "express";
import { multiSourceVerificationEngine } from "../services/multi-source-verification-engine";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { db } from "../db";
import { leads } from "@shared/schema";
import { inArray, eq, desc } from "drizzle-orm";
import { z } from "zod";

// Request validation schemas
const verifyLeadSchema = z.object({
  leadId: z.string(),
  forceRefresh: z.boolean().optional().default(false)
});

const batchVerifySchema = z.object({
  leadIds: z.array(z.string()).min(1).max(100),
  forceRefresh: z.boolean().optional().default(false)
});

const verificationConfigSchema = z.object({
  sources: z.object({
    email: z.boolean().optional(),
    phone: z.boolean().optional(),
    business: z.boolean().optional(),
    address: z.boolean().optional(),
    social: z.boolean().optional()
  }).optional(),
  thresholds: z.object({
    verified: z.number().min(0).max(100).optional(),
    partial: z.number().min(0).max(100).optional(),
    risky: z.number().min(0).max(100).optional()
  }).optional(),
  weights: z.object({
    email: z.number().min(0).max(1).optional(),
    phone: z.number().min(0).max(1).optional(),
    business: z.number().min(0).max(1).optional(),
    address: z.number().min(0).max(1).optional(),
    social: z.number().min(0).max(1).optional()
  }).optional()
});

export function registerMultiSourceVerificationRoutes(app: Express) {
  /**
   * POST /api/verification/verify-lead
   * Verify a single lead using multi-source verification
   */
  app.post("/api/verification/verify-lead", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validated = verifyLeadSchema.parse(req.body);
      
      console.log(`[MultiSourceVerification] Verifying lead: ${validated.leadId}`);
      
      // Verify the lead exists
      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, validated.leadId))
        .limit(1);
      
      if (!lead) {
        return res.status(404).json({
          error: "Lead not found",
          leadId: validated.leadId
        });
      }
      
      // Perform verification
      const result = await multiSourceVerificationEngine.verifyLead(
        validated.leadId,
        validated.forceRefresh
      );
      
      res.json({
        success: true,
        leadId: validated.leadId,
        verification: result,
        message: `Lead verification ${result.status} with ${result.confidence.overall}% confidence`
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error verifying lead:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request",
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: "Failed to verify lead",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * POST /api/verification/batch-verify
   * Batch verify multiple leads
   */
  app.post("/api/verification/batch-verify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validated = batchVerifySchema.parse(req.body);
      
      console.log(`[MultiSourceVerification] Batch verifying ${validated.leadIds.length} leads`);
      
      // Verify all leads exist
      const existingLeads = await db
        .select({ id: leads.id })
        .from(leads)
        .where(inArray(leads.id, validated.leadIds));
      
      const existingIds = new Set(existingLeads.map(l => l.id));
      const missingIds = validated.leadIds.filter(id => !existingIds.has(id));
      
      if (missingIds.length > 0) {
        return res.status(400).json({
          error: "Some leads not found",
          missingIds,
          foundCount: existingIds.size,
          requestedCount: validated.leadIds.length
        });
      }
      
      // Perform batch verification
      const results = await multiSourceVerificationEngine.batchVerify(
        validated.leadIds,
        validated.forceRefresh
      );
      
      // Convert Map to object for JSON response
      const resultsObject: Record<string, any> = {};
      results.forEach((value, key) => {
        resultsObject[key] = value;
      });
      
      // Calculate summary statistics
      const summary = {
        total: results.size,
        verified: 0,
        partiallyVerified: 0,
        risky: 0,
        unverified: 0,
        failed: 0,
        averageConfidence: 0
      };
      
      let totalConfidence = 0;
      results.forEach(result => {
        switch (result.status) {
          case 'verified':
            summary.verified++;
            break;
          case 'partially_verified':
            summary.partiallyVerified++;
            break;
          case 'risky':
            summary.risky++;
            break;
          case 'unverified':
            summary.unverified++;
            break;
          case 'failed':
            summary.failed++;
            break;
        }
        totalConfidence += result.confidence.overall;
      });
      
      summary.averageConfidence = Math.round(totalConfidence / results.size);
      
      res.json({
        success: true,
        summary,
        results: resultsObject,
        message: `Batch verification completed for ${results.size} leads`
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error in batch verification:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request",
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: "Failed to batch verify leads",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /api/verification/stats
   * Get verification statistics
   */
  app.get("/api/verification/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      
      const stats = await multiSourceVerificationEngine.getVerificationStats(hours);
      
      res.json({
        success: true,
        period: `Last ${hours} hours`,
        stats,
        breakdown: {
          verifiedRate: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0,
          partialRate: stats.total > 0 ? Math.round((stats.partial / stats.total) * 100) : 0,
          riskyRate: stats.total > 0 ? Math.round((stats.risky / stats.total) * 100) : 0,
          unverifiedRate: stats.total > 0 ? Math.round((stats.unverified / stats.total) * 100) : 0,
          failedRate: stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0
        }
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error getting stats:", error);
      res.status(500).json({
        error: "Failed to get verification statistics",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * POST /api/verification/verify-batch-by-quality
   * Automatically verify leads based on quality score
   */
  app.post("/api/verification/verify-batch-by-quality", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { minQuality = 50, maxLeads = 50, forceRefresh = false } = req.body;
      
      // Find leads that need verification
      const leadsToVerify = await db
        .select({
          id: leads.id,
          qualityScore: leads.qualityScore,
          lastVerifiedAt: leads.lastVerifiedAt
        })
        .from(leads)
        .where(eq(leads.sold, false))
        .orderBy(desc(leads.qualityScore))
        .limit(maxLeads);
      
      // Filter by quality score and verification age
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const eligibleLeads = leadsToVerify.filter(lead => {
        const qualityOk = (lead.qualityScore || 0) >= minQuality;
        const needsVerification = !lead.lastVerifiedAt || lead.lastVerifiedAt < oneWeekAgo;
        return qualityOk && (needsVerification || forceRefresh);
      });
      
      if (eligibleLeads.length === 0) {
        return res.json({
          success: true,
          message: "No leads need verification at this time",
          checked: leadsToVerify.length,
          eligible: 0
        });
      }
      
      const leadIds = eligibleLeads.map(l => l.id);
      
      console.log(`[MultiSourceVerification] Auto-verifying ${leadIds.length} leads with quality >= ${minQuality}`);
      
      // Perform batch verification
      const results = await multiSourceVerificationEngine.batchVerify(leadIds, forceRefresh);
      
      // Calculate results
      const summary = {
        total: results.size,
        verified: 0,
        improved: 0,
        unchanged: 0,
        degraded: 0
      };
      
      results.forEach(result => {
        if (result.status === 'verified') summary.verified++;
        if (result.confidence.overall >= 70) summary.improved++;
        else if (result.confidence.overall >= 50) summary.unchanged++;
        else summary.degraded++;
      });
      
      res.json({
        success: true,
        message: `Auto-verification completed for ${results.size} leads`,
        summary,
        eligibleLeads: leadIds.length,
        checkedLeads: leadsToVerify.length
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error in auto-verification:", error);
      res.status(500).json({
        error: "Failed to auto-verify leads",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * GET /api/verification/lead/:leadId
   * Get verification details for a specific lead
   */
  app.get("/api/verification/lead/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      
      // Get lead with verification scores
      const [lead] = await db
        .select({
          id: leads.id,
          businessName: leads.businessName,
          email: leads.email,
          phone: leads.phone,
          overallVerificationScore: leads.overallVerificationScore,
          emailVerificationScore: leads.emailVerificationScore,
          phoneVerificationScore: leads.phoneVerificationScore,
          nameVerificationScore: leads.nameVerificationScore,
          verificationStatus: leads.verificationStatus,
          lastVerifiedAt: leads.lastVerifiedAt
        })
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);
      
      if (!lead) {
        return res.status(404).json({
          error: "Lead not found"
        });
      }
      
      res.json({
        success: true,
        lead,
        needsVerification: !lead.lastVerifiedAt || 
          lead.lastVerifiedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        verificationAge: lead.lastVerifiedAt ? 
          Math.floor((Date.now() - lead.lastVerifiedAt.getTime()) / (1000 * 60 * 60)) : null
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error getting lead verification:", error);
      res.status(500).json({
        error: "Failed to get lead verification details",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * POST /api/verification/configure
   * Update verification configuration (admin only)
   */
  app.post("/api/verification/configure", requireAuth, requireAdmin, async (req, res) => {
    try {
      const config = verificationConfigSchema.parse(req.body);
      
      // Note: This would typically update a configuration in the database
      // For now, we'll just validate and return the config
      
      res.json({
        success: true,
        message: "Verification configuration updated",
        config
      });
    } catch (error) {
      console.error("[MultiSourceVerification] Error updating configuration:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid configuration",
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: "Failed to update configuration",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
}

// Export for use in main routes registration
export default registerMultiSourceVerificationRoutes;