import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { aiBrainService } from "../services/ai-brain";
import { 
  requireAuth, 
  requireSuperAdmin, 
  requireCompanyAdmin, 
  requireCompanyAccess,
  getCompanyScope 
} from "../middleware/auth";
import { insertCompanySchema, insertCallLogSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcrypt";

const router = Router();

// ========================================
// COMPANY MANAGEMENT ROUTES (Super Admin)
// ========================================

// Get all companies (super_admin only)
router.get("/api/companies", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const companies = await storage.getAllCompanies();
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get single company
router.get("/api/companies/:id", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check access - non-super_admins can only access their own company
    if (req.session.userRole !== "super_admin" && req.session.companyId !== id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const company = await storage.getCompany(id);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create company (super_admin only)
router.post("/api/companies", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const data = insertCompanySchema.parse(req.body);
    
    // Check if slug already exists
    const existing = await storage.getCompanyBySlug(data.slug);
    if (existing) {
      return res.status(400).json({ error: "Company slug already exists" });
    }
    
    const company = await storage.createCompany(data);
    res.status(201).json(company);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update company
router.patch("/api/companies/:id", requireCompanyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check access - non-super_admins can only update their own company
    if (req.session.userRole !== "super_admin" && req.session.companyId !== id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const company = await storage.updateCompany(id, req.body);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    res.json(company);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// COMPANY USER MANAGEMENT
// ========================================

// Get users in company
router.get("/api/companies/:id/users", requireCompanyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check access
    if (req.session.userRole !== "super_admin" && req.session.companyId !== id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const users = await storage.getUsersByCompany(id);
    // Remove passwords from response
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json(safeUsers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create user in company
router.post("/api/companies/:id/users", requireCompanyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check access
    if (req.session.userRole !== "super_admin" && req.session.companyId !== id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const { username, email, password, name, role } = req.body;
    
    // Validate role - company_admin can only create agents
    if (req.session.userRole === "company_admin" && role !== "agent") {
      return res.status(403).json({ error: "Company admins can only create agent users" });
    }
    
    // Check if username or email already exists
    const existingUsername = await storage.getUserByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: "Username already exists" });
    }
    
    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await storage.createUser({
      companyId: id,
      username,
      email,
      password: hashedPassword,
      name: name || username,
      role: role || "agent",
    });
    
    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// AI BRAIN & NEXT BEST LEAD
// ========================================

// Get next best lead for company
router.get("/api/leads/next-best", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    
    if (!companyId) {
      return res.status(400).json({ error: "Company context required" });
    }
    
    // Support skip for "Next Lead" functionality
    const skip = parseInt(req.query.skip as string) || 0;
    const lead = await aiBrainService.getNextBestLead(companyId, skip);
    if (!lead) {
      return res.json({ lead: null, message: "No leads available" });
    }
    
    res.json({ lead });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get hot leads for company
router.get("/api/leads/hot", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    
    if (!companyId) {
      return res.status(400).json({ error: "Company context required" });
    }
    
    const limit = parseInt(req.query.limit as string) || 10;
    const leads = await aiBrainService.getHotLeads(companyId, limit);
    
    res.json({ leads, count: leads.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get leads needing action for company
router.get("/api/leads/action-needed", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    
    if (!companyId) {
      return res.status(400).json({ error: "Company context required" });
    }
    
    const leads = await aiBrainService.getLeadsNeedingAction(companyId);
    
    res.json({ leads, count: leads.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Recalculate all lead scores for company
router.post("/api/leads/recalculate-scores", requireCompanyAdmin, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    
    if (!companyId) {
      return res.status(400).json({ error: "Company context required" });
    }
    
    const updated = await aiBrainService.recalculateCompanyScores(companyId);
    
    res.json({ success: true, updated, message: `Recalculated scores for ${updated} leads` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// CALL LOGGING WITH AI BRAIN INTEGRATION
// ========================================

// Log a call and update lead's AI score
router.post("/api/crm/call-logs", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    const userId = req.session.userId;
    
    if (!companyId || !userId) {
      return res.status(400).json({ error: "Company and user context required" });
    }
    
    const { leadId, phoneDialed, outcome, durationSec, notes, direction } = req.body;
    
    if (!leadId || !outcome) {
      return res.status(400).json({ error: "leadId and outcome are required" });
    }
    
    // Verify lead belongs to company
    const lead = await storage.getLead(leadId);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    if (lead.companyId !== companyId && req.session.userRole !== "super_admin") {
      return res.status(403).json({ error: "Lead does not belong to your company" });
    }
    
    // Create call log
    const callLog = await storage.createCallLog({
      companyId,
      leadId,
      userId,
      phoneDialed: phoneDialed || lead.phone,
      phoneNumber: phoneDialed || lead.phone,
      direction: direction || "outbound",
      outcome,
      durationSec: durationSec || 0,
      duration: durationSec || 0,
      notes: notes || "",
      summary: notes || "",
      startedAt: new Date(),
    });
    
    // Update lead via AI Brain (updates hot score, attempt count, next action)
    const updatedLead = await aiBrainService.updateLeadAfterCall(leadId, outcome);
    
    res.status(201).json({ 
      callLog, 
      lead: updatedLead,
      message: "Call logged and lead score updated"
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get call logs for a lead
router.get("/api/crm/call-logs/lead/:leadId", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const companyId = getCompanyScope(req);
    
    // Verify access
    const lead = await storage.getLead(leadId);
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    if (lead.companyId !== companyId && req.session.userRole !== "super_admin") {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const callLogs = await storage.getCallLogsByLeadId(leadId);
    res.json(callLogs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// COMPANY-SCOPED LEADS
// ========================================

// Get leads for current company
router.get("/api/company/leads", requireCompanyAccess, async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyScope(req);
    
    if (!companyId) {
      return res.status(400).json({ error: "Company context required" });
    }
    
    const limit = parseInt(req.query.limit as string) || 100;
    const leads = await storage.getLeadsByCompany(companyId, limit);
    
    res.json({ leads, count: leads.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// AUTH ENHANCED ENDPOINT
// ========================================

// Get current user with company info
router.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const { password, ...userWithoutPassword } = user;
    
    // Include company info if user has one
    let company = null;
    if (user.companyId) {
      company = await storage.getCompany(user.companyId);
    }
    
    res.json({ 
      user: userWithoutPassword,
      company,
      permissions: {
        canManageCompany: user.role === "super_admin" || user.role === "company_admin",
        canManageUsers: user.role === "super_admin" || user.role === "company_admin",
        canViewAllCompanies: user.role === "super_admin",
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
