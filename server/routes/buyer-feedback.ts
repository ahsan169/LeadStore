import { Router, Request, Response } from "express";
import { db } from "../db";
import { 
  leads, 
  leadAssignments, 
  leadActivities, 
  purchases,
  users,
  brainConfig,
  sourceStats,
  type Lead,
  type LeadAssignment,
  type LeadActivity,
  insertLeadActivitySchema
} from "@shared/schema";
import { eq, and, desc, gte, lte, sql, count, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Middleware to require authenticated buyer
function requireBuyer(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// ========================================
// MY LEADS - Buyer's assigned leads
// ========================================

// GET /api/my-leads - Get paginated list of buyer's assigned leads
router.get("/api/my-leads", requireBuyer, async (req: Request, res: Response) => {
  try {
    const buyerId = (req.user as any).id;
    
    // Parse query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = (page - 1) * limit;
    
    // Optional filters
    const status = req.query.status as string;
    const minScore = parseInt(req.query.minScore as string) || 0;
    const maxScore = parseInt(req.query.maxScore as string) || 100;
    const sourceType = req.query.source as string;
    const batchId = req.query.batchId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    
    // Build conditions
    const conditions = [eq(leadAssignments.buyerId, buyerId)];
    
    if (status) {
      conditions.push(eq(leadAssignments.status, status));
    }
    
    if (batchId) {
      conditions.push(eq(leadAssignments.batchId, batchId));
    }
    
    // Get assignments with lead data
    const assignmentsWithLeads = await db
      .select({
        assignment: leadAssignments,
        lead: leads,
      })
      .from(leadAssignments)
      .innerJoin(leads, eq(leadAssignments.leadId, leads.id))
      .where(and(...conditions))
      .orderBy(desc(leadAssignments.assignedAt))
      .limit(limit)
      .offset(offset);
    
    // Filter by score and source on lead data
    const filtered = assignmentsWithLeads.filter(row => {
      const score = row.lead.aiScore || 50;
      if (score < minScore || score > maxScore) return false;
      if (sourceType && row.lead.sourceType !== sourceType) return false;
      return true;
    });
    
    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: count() })
      .from(leadAssignments)
      .where(eq(leadAssignments.buyerId, buyerId));
    
    // Transform response
    const myLeads = filtered.map(row => ({
      assignmentId: row.assignment.id,
      leadId: row.lead.id,
      businessName: row.lead.businessName,
      ownerName: row.lead.ownerName,
      email: row.lead.email,
      phone: row.lead.phone,
      industry: row.lead.industry,
      stateCode: row.lead.stateCode,
      aiScore: row.lead.aiScore || 50,
      status: row.assignment.status,
      conversionLabel: row.assignment.currentConversionLabel || row.lead.conversionLabel || "unknown",
      source: row.lead.sourceType || "import",
      assignedAt: row.assignment.assignedAt,
      lastOutcomeAt: row.lead.lastOutcomeAt,
      pricePaidCents: row.assignment.pricePaidCents,
      batchId: row.assignment.batchId,
    }));
    
    res.json({
      leads: myLeads,
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error fetching my leads:", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/my-leads/stats - Get buyer's lead statistics
router.get("/api/my-leads/stats", requireBuyer, async (req: Request, res: Response) => {
  try {
    const buyerId = (req.user as any).id;
    
    // Get status counts
    const statusCounts = await db
      .select({
        status: leadAssignments.status,
        count: count(),
      })
      .from(leadAssignments)
      .where(eq(leadAssignments.buyerId, buyerId))
      .groupBy(leadAssignments.status);
    
    // Transform to object
    const stats = {
      total: 0,
      new: 0,
      working: 0,
      contacted: 0,
      funded: 0,
      bad_lead: 0,
      no_response: 0,
    };
    
    statusCounts.forEach(row => {
      const count = Number(row.count);
      stats.total += count;
      if (row.status in stats) {
        (stats as any)[row.status] = count;
      }
    });
    
    // Calculate rates
    const feedbackGiven = stats.funded + stats.bad_lead + stats.contacted + stats.no_response;
    const fundRate = stats.total > 0 ? (stats.funded / stats.total) * 100 : 0;
    const feedbackRate = stats.total > 0 ? (feedbackGiven / stats.total) * 100 : 0;
    
    res.json({
      stats,
      fundRate: fundRate.toFixed(2),
      feedbackRate: feedbackRate.toFixed(2),
      feedbackGiven,
    });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error fetching stats:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// LEAD ACTIVITY - Log buyer feedback
// ========================================

// POST /api/leads/:id/activity - Log activity for a lead
router.post("/api/leads/:id/activity", requireBuyer, async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const buyerId = (req.user as any).id;
    
    // Validate request body
    const activitySchema = z.object({
      type: z.enum(["status_change", "note", "funded", "bad_lead", "contacted", "no_response"]),
      newStatus: z.string().optional(),
      note: z.string().optional(),
      dealAmount: z.number().optional(),
    });
    
    const body = activitySchema.parse(req.body);
    
    // Verify buyer has assignment for this lead
    const [assignment] = await db
      .select()
      .from(leadAssignments)
      .where(and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.buyerId, buyerId)
      ))
      .limit(1);
    
    if (!assignment) {
      return res.status(403).json({ error: "You don't have access to this lead" });
    }
    
    // Get current lead for old status
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    const oldStatus = assignment.status;
    
    // Determine new status and conversion label based on activity type
    let newStatus = body.newStatus || oldStatus;
    let conversionLabel = lead.conversionLabel || "unknown";
    
    switch (body.type) {
      case "funded":
        newStatus = "funded";
        conversionLabel = "funded";
        break;
      case "bad_lead":
        newStatus = "bad_lead";
        conversionLabel = "bad";
        break;
      case "contacted":
        newStatus = "contacted";
        conversionLabel = "contacted";
        break;
      case "no_response":
        newStatus = "no_response";
        conversionLabel = "no_response";
        break;
      case "status_change":
        newStatus = body.newStatus || oldStatus;
        break;
    }
    
    // Create activity record
    const user = req.user as any;
    const [activity] = await db
      .insert(leadActivities)
      .values({
        leadId,
        buyerId,
        companyId: user.companyId || null,
        assignmentId: assignment.id,
        type: body.type,
        oldStatus,
        newStatus,
        note: body.note,
        dealAmount: body.dealAmount?.toString(),
      })
      .returning();
    
    // Update assignment status
    await db
      .update(leadAssignments)
      .set({
        status: newStatus,
        currentConversionLabel: conversionLabel,
      })
      .where(eq(leadAssignments.id, assignment.id));
    
    // Update lead with conversion label and last outcome
    await db
      .update(leads)
      .set({
        conversionLabel,
        lastOutcomeAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId));
    
    res.json({
      success: true,
      activity,
      newStatus,
      conversionLabel,
    });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error logging activity:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/leads/:id/activities - Get activity history for a lead
router.get("/api/leads/:id/activities", requireBuyer, async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const buyerId = (req.user as any).id;
    
    // Verify buyer has assignment for this lead
    const [assignment] = await db
      .select()
      .from(leadAssignments)
      .where(and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.buyerId, buyerId)
      ))
      .limit(1);
    
    if (!assignment) {
      return res.status(403).json({ error: "You don't have access to this lead" });
    }
    
    // Get activities
    const activities = await db
      .select()
      .from(leadActivities)
      .where(and(
        eq(leadActivities.leadId, leadId),
        eq(leadActivities.buyerId, buyerId)
      ))
      .orderBy(desc(leadActivities.createdAt))
      .limit(50);
    
    res.json({ activities });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error fetching activities:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// LEAD ASSIGNMENT - Create assignments on purchase
// ========================================

// Helper function to create assignments for a purchase
export async function createAssignmentsForPurchase(
  purchaseId: string,
  buyerId: string,
  leadIds: string[],
  pricePerLead: number,
  batchId?: string,
  companyId?: string | null
): Promise<void> {
  if (!leadIds || leadIds.length === 0) return;
  
  const assignments = leadIds.map(leadId => ({
    leadId,
    buyerId,
    companyId: companyId || null,
    purchaseId,
    batchId: batchId || null,
    pricePaidCents: pricePerLead,
    status: "new" as const,
    currentConversionLabel: "unknown" as const,
  }));
  
  await db.insert(leadAssignments).values(assignments);
  
  console.log(`[BuyerFeedback] Created ${assignments.length} assignments for purchase ${purchaseId} (company: ${companyId || "none"})`);
}

// POST /api/purchases/:id/assign - Manually assign leads from a purchase (admin use)
router.post("/api/purchases/:id/assign", requireBuyer, async (req: Request, res: Response) => {
  try {
    const purchaseId = req.params.id;
    
    // Get purchase
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, purchaseId))
      .limit(1);
    
    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }
    
    // Verify buyer owns this purchase
    if (purchase.userId !== (req.user as any).id) {
      return res.status(403).json({ error: "You don't have access to this purchase" });
    }
    
    // Check if already assigned
    const existingAssignments = await db
      .select({ count: count() })
      .from(leadAssignments)
      .where(eq(leadAssignments.purchaseId, purchaseId));
    
    if (Number(existingAssignments[0]?.count) > 0) {
      return res.json({ message: "Leads already assigned", count: existingAssignments[0].count });
    }
    
    // Create assignments
    const leadIds = purchase.leadIds || [];
    const pricePerLead = Math.round((Number(purchase.totalAmount) * 100) / leadIds.length);
    
    await createAssignmentsForPurchase(purchaseId, purchase.userId, leadIds, pricePerLead);
    
    res.json({ success: true, assignedCount: leadIds.length });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error assigning leads:", error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// REPLACEMENT CREDITS - Bad lead replacement
// ========================================

// POST /api/leads/:id/request-replacement - Request replacement credit for bad lead
router.post("/api/leads/:id/request-replacement", requireBuyer, async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const buyerId = (req.user as any).id;
    const { reason } = req.body;
    
    // Get assignment
    const [assignment] = await db
      .select()
      .from(leadAssignments)
      .where(and(
        eq(leadAssignments.leadId, leadId),
        eq(leadAssignments.buyerId, buyerId)
      ))
      .limit(1);
    
    if (!assignment) {
      return res.status(403).json({ error: "You don't have access to this lead" });
    }
    
    // Mark as bad lead if not already
    if (assignment.status !== "bad_lead") {
      await db
        .update(leadAssignments)
        .set({
          status: "bad_lead",
          currentConversionLabel: "bad",
        })
        .where(eq(leadAssignments.id, assignment.id));
      
      // Log activity
      const user = req.user as any;
      await db.insert(leadActivities).values({
        leadId,
        buyerId,
        companyId: user.companyId || null,
        assignmentId: assignment.id,
        type: "bad_lead",
        oldStatus: assignment.status,
        newStatus: "bad_lead",
        note: reason || "Replacement requested",
      });
      
      // Update lead
      await db
        .update(leads)
        .set({
          conversionLabel: "bad",
          lastOutcomeAt: new Date(),
        })
        .where(eq(leads.id, leadId));
    }
    
    res.json({
      success: true,
      message: "Replacement request submitted. Credits will be reviewed by admin.",
    });
  } catch (error: any) {
    console.error("[BuyerFeedback] Error requesting replacement:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
