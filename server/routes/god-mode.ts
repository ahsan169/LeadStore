import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  leads, 
  leadAssignments, 
  leadActivities, 
  brainConfig,
  sourceStats,
  users,
  purchases
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, count, sum } from "drizzle-orm";
import { aiBrainService } from "../services/ai-brain";

const router = Router();

// Middleware to require super_admin role
function requireSuperAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const user = req.user as any;
  if (user.role !== "super_admin" && user.role !== "admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  
  next();
}

// ========================================
// DASHBOARD STATS
// ========================================

// GET /api/god-mode/dashboard - Get overall platform stats
router.get("/api/god-mode/dashboard", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Total leads
    const [leadStats] = await db.select({
      total: count(),
      withFeedback: sql<number>`sum(case when ${leads.conversionLabel} != 'unknown' and ${leads.conversionLabel} is not null then 1 else 0 end)::int`,
    }).from(leads);
    
    // Total assignments
    const [assignmentStats] = await db.select({
      total: count(),
      funded: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'funded' then 1 else 0 end)::int`,
      contacted: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'contacted' then 1 else 0 end)::int`,
      bad: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'bad' then 1 else 0 end)::int`,
      noResponse: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'no_response' then 1 else 0 end)::int`,
    }).from(leadAssignments);
    
    // Total purchases revenue
    const [revenueStats] = await db.select({
      totalRevenue: sql<number>`coalesce(sum(${purchases.totalAmount}), 0)::numeric`,
      purchaseCount: count(),
    }).from(purchases)
    .where(eq(purchases.status, "completed"));
    
    // Active buyers (users with role = buyer who have assignments)
    const [buyerStats] = await db.select({
      activeBuyers: sql<number>`count(distinct ${leadAssignments.buyerId})::int`,
    }).from(leadAssignments);
    
    // Recent activities (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [activityStats] = await db.select({
      recentActivities: count(),
    }).from(leadActivities)
    .where(gte(leadActivities.createdAt, sevenDaysAgo));
    
    // Calculate rates
    const totalAssignments = Number(assignmentStats?.total) || 0;
    const fundedCount = assignmentStats?.funded || 0;
    const feedbackCount = (assignmentStats?.funded || 0) + 
                          (assignmentStats?.contacted || 0) + 
                          (assignmentStats?.bad || 0) + 
                          (assignmentStats?.noResponse || 0);
    
    res.json({
      leads: {
        total: Number(leadStats?.total) || 0,
        withFeedback: leadStats?.withFeedback || 0,
      },
      assignments: {
        total: totalAssignments,
        funded: fundedCount,
        contacted: assignmentStats?.contacted || 0,
        bad: assignmentStats?.bad || 0,
        noResponse: assignmentStats?.noResponse || 0,
      },
      revenue: {
        total: Number(revenueStats?.totalRevenue) || 0,
        purchaseCount: Number(revenueStats?.purchaseCount) || 0,
      },
      buyers: {
        active: buyerStats?.activeBuyers || 0,
      },
      rates: {
        fundRate: totalAssignments > 0 ? ((fundedCount / totalAssignments) * 100).toFixed(2) : "0.00",
        feedbackRate: totalAssignments > 0 ? ((feedbackCount / totalAssignments) * 100).toFixed(2) : "0.00",
      },
      recentActivities: Number(activityStats?.recentActivities) || 0,
    });
  } catch (error: any) {
    console.error("[GodMode] Error fetching dashboard:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// BUYER PERFORMANCE
// ========================================

// GET /api/god-mode/buyers - Get buyer performance leaderboard
router.get("/api/god-mode/buyers", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const buyerPerformance = await aiBrainService.getBuyerPerformance();
    
    // Enrich with user info
    const enriched = await Promise.all(buyerPerformance.map(async (bp) => {
      const [user] = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
      }).from(users).where(eq(users.id, bp.buyerId)).limit(1);
      
      return {
        ...bp,
        username: user?.username || "Unknown",
        email: user?.email || "N/A",
      };
    }));
    
    // Sort by fund rate descending
    enriched.sort((a, b) => b.fundRate - a.fundRate);
    
    res.json({ buyers: enriched });
  } catch (error: any) {
    console.error("[GodMode] Error fetching buyer performance:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// SOURCE PERFORMANCE
// ========================================

// GET /api/god-mode/sources - Get source performance stats
router.get("/api/god-mode/sources", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const sourcePerformance = await aiBrainService.getSourcePerformance();
    
    res.json({ sources: sourcePerformance });
  } catch (error: any) {
    console.error("[GodMode] Error fetching source performance:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// BRAIN CONFIG
// ========================================

// GET /api/god-mode/brain - Get AI Brain configuration
router.get("/api/god-mode/brain", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const config = await aiBrainService.getBrainConfig();
    res.json({ config });
  } catch (error: any) {
    console.error("[GodMode] Error fetching brain config:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/god-mode/brain - Update AI Brain configuration
router.put("/api/god-mode/brain", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const updates = req.body;
    
    // Validate weights sum to 1 (or close to it)
    const totalWeight = (updates.recencyWeight || 0) + 
                       (updates.sourceWeight || 0) + 
                       (updates.attemptWeight || 0) + 
                       (updates.outcomeWeight || 0) +
                       (updates.feedbackWeight || 0);
    
    if (totalWeight > 1.1 || totalWeight < 0.9) {
      return res.status(400).json({ 
        error: "Weight values should sum to approximately 1.0",
        currentSum: totalWeight 
      });
    }
    
    const config = await aiBrainService.updateBrainConfig(updates);
    res.json({ config, message: "Configuration updated successfully" });
  } catch (error: any) {
    console.error("[GodMode] Error updating brain config:", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/god-mode/brain/recalculate - Trigger immediate score recalculation
router.post("/api/god-mode/brain/recalculate", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await aiBrainService.recalculateAllScores();
    res.json({ 
      success: true, 
      message: `Recalculated scores for ${result.updated} leads in ${result.duration}ms`,
      ...result 
    });
  } catch (error: any) {
    console.error("[GodMode] Error triggering recalculation:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// RECENT ACTIVITIES
// ========================================

// GET /api/god-mode/activities - Get recent buyer activities
router.get("/api/god-mode/activities", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    const activities = await db.select({
      id: leadActivities.id,
      leadId: leadActivities.leadId,
      buyerId: leadActivities.buyerId,
      type: leadActivities.type,
      oldStatus: leadActivities.oldStatus,
      newStatus: leadActivities.newStatus,
      note: leadActivities.note,
      dealAmount: leadActivities.dealAmount,
      createdAt: leadActivities.createdAt,
    })
    .from(leadActivities)
    .orderBy(desc(leadActivities.createdAt))
    .limit(limit);
    
    // Enrich with lead and user info
    const enriched = await Promise.all(activities.map(async (activity) => {
      const [lead] = await db.select({
        businessName: leads.businessName,
      }).from(leads).where(eq(leads.id, activity.leadId)).limit(1);
      
      const [user] = await db.select({
        username: users.username,
      }).from(users).where(eq(users.id, activity.buyerId)).limit(1);
      
      return {
        ...activity,
        businessName: lead?.businessName || "Unknown",
        buyerName: user?.username || "Unknown",
      };
    }));
    
    res.json({ activities: enriched });
  } catch (error: any) {
    console.error("[GodMode] Error fetching activities:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
