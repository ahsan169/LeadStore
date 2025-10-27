import { storage } from "../storage";
import { db } from "../db";
import { leads, purchases, qualityGuarantee } from "@shared/schema";
import { eq, and, notInArray, gte, lte, ne, sql, desc } from "drizzle-orm";
import type { Lead, Purchase, QualityGuarantee, InsertQualityGuarantee } from "@shared/schema";

// Known bad phone number patterns
const BAD_PHONE_PATTERNS = [
  /^555/, // Fictional numbers
  /^1234567890$/, // Common test number
  /^0{10}$/, // All zeros
  /^1{10}$/, // All ones
  /^(\d)\1{9}$/, // Repeating digit
];

// Phone validation service
export const phoneValidationService = {
  async validatePhone(phone: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    // Remove non-numeric characters for validation
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check length
    if (cleanPhone.length < 10) {
      issues.push("Phone number too short");
    } else if (cleanPhone.length > 11) {
      issues.push("Phone number too long");
    }
    
    // Check against bad patterns
    for (const pattern of BAD_PHONE_PATTERNS) {
      if (pattern.test(cleanPhone)) {
        issues.push("Invalid phone number pattern");
        break;
      }
    }
    
    // Check if disconnected (would typically use a third-party service)
    // For now, we'll simulate by checking specific patterns
    if (cleanPhone.startsWith("555") && cleanPhone.length === 10) {
      issues.push("Disconnected number");
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  },

  async checkDisconnected(phone: string): Promise<boolean> {
    // In production, this would call a phone verification API
    // For now, simulate disconnected check
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.startsWith("555") || cleanPhone.startsWith("000");
  }
};

// Quality guarantee service
export const qualityGuaranteeService = {
  // Report a quality issue
  async reportIssue(data: InsertQualityGuarantee): Promise<QualityGuarantee> {
    // Validate purchase belongs to user
    const purchase = await storage.getPurchase(data.purchaseId);
    if (!purchase) {
      throw new Error("Purchase not found");
    }
    if (purchase.userId !== data.userId) {
      throw new Error("Purchase does not belong to user");
    }
    
    // Check if guarantee is still valid (30 days)
    const guaranteeExpiry = purchase.guaranteeExpiresAt || 
      new Date(purchase.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    if (new Date() > guaranteeExpiry) {
      throw new Error("Quality guarantee period has expired");
    }
    
    // Check if lead belongs to purchase
    const leadIds = purchase.leadIds || [];
    if (!leadIds.includes(data.leadId)) {
      throw new Error("Lead does not belong to this purchase");
    }
    
    // Check for duplicate report
    const existingReports = await storage.getQualityGuaranteesByPurchaseId(data.purchaseId);
    const duplicateReport = existingReports.find(r => r.leadId === data.leadId && r.status === 'pending');
    if (duplicateReport) {
      throw new Error("A quality report for this lead is already pending");
    }
    
    // Automatic validation for disconnected numbers
    if (data.issueType === 'disconnected') {
      const lead = await storage.getLead(data.leadId);
      if (lead) {
        const isDisconnected = await phoneValidationService.checkDisconnected(lead.phone);
        if (isDisconnected) {
          // Auto-approve disconnected numbers
          const report = await storage.createQualityGuarantee({
            ...data,
            status: 'approved'
          });
          
          // Find replacement lead
          const replacementLead = await this.findReplacementLead(purchase, lead, data.userId);
          if (replacementLead) {
            await this.processReplacement(report.id, replacementLead.id, "Auto-approved: disconnected number");
          }
          
          return report;
        }
      }
    }
    
    // Create the quality guarantee report
    return storage.createQualityGuarantee(data);
  },

  // Find a suitable replacement lead
  async findReplacementLead(
    purchase: Purchase, 
    originalLead: Lead, 
    userId: string
  ): Promise<Lead | null> {
    // Get user's previously purchased lead IDs
    const userPurchases = await storage.getPurchasesByUserId(userId);
    const allUserLeadIds = userPurchases.flatMap(p => p.leadIds || []);
    
    // Find available leads matching criteria
    const availableLeads = await db.select()
      .from(leads)
      .where(
        and(
          eq(leads.sold, false),
          eq(leads.tier, purchase.tier),
          notInArray(leads.id, allUserLeadIds), // Not already purchased by user
          ne(leads.id, originalLead.id), // Not the original lead
          // Match quality score range
          gte(leads.qualityScore, originalLead.qualityScore - 10),
          lte(leads.qualityScore, originalLead.qualityScore + 10)
        )
      )
      .orderBy(desc(leads.qualityScore))
      .limit(1);
    
    return availableLeads[0] || null;
  },

  // Process a replacement
  async processReplacement(
    reportId: string,
    replacementLeadId: string,
    notes?: string
  ): Promise<QualityGuarantee | undefined> {
    const report = await storage.getQualityGuaranteeById(reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    
    const purchase = await storage.getPurchase(report.purchaseId);
    if (!purchase) {
      throw new Error("Purchase not found");
    }
    
    // Mark replacement lead as sold
    await storage.markLeadsAsSold([replacementLeadId], purchase.userId);
    
    // Update purchase to include replacement lead
    const updatedLeadIds = [...(purchase.leadIds || []), replacementLeadId];
    await storage.updatePurchase(purchase.id, {
      leadIds: updatedLeadIds,
      totalReplacements: (purchase.totalReplacements || 0) + 1
    });
    
    // Update the quality guarantee report
    return storage.resolveQualityGuarantee(
      reportId,
      'replaced',
      replacementLeadId,
      notes
    );
  },

  // Issue credits for unresolvable issues
  async issueCredits(reportId: string, creditAmount: number): Promise<QualityGuarantee | undefined> {
    const report = await storage.getQualityGuaranteeById(reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    
    const purchase = await storage.getPurchase(report.purchaseId);
    if (!purchase) {
      throw new Error("Purchase not found");
    }
    
    // Update purchase with credits
    await storage.updatePurchase(purchase.id, {
      replacementCredits: (purchase.replacementCredits || 0) + creditAmount
    });
    
    // Resolve the report
    return storage.resolveQualityGuarantee(
      reportId,
      'approved',
      undefined,
      `Issued ${creditAmount} replacement credits`
    );
  },

  // Validate issue automatically
  async validateIssue(
    issueType: string,
    leadId: string
  ): Promise<{ valid: boolean; autoApprove: boolean; reason?: string }> {
    const lead = await storage.getLead(leadId);
    if (!lead) {
      return { valid: false, autoApprove: false, reason: "Lead not found" };
    }
    
    switch (issueType) {
      case 'disconnected':
        const isDisconnected = await phoneValidationService.checkDisconnected(lead.phone);
        return {
          valid: true,
          autoApprove: isDisconnected,
          reason: isDisconnected ? "Phone number verified as disconnected" : undefined
        };
        
      case 'wrong_number':
        const validation = await phoneValidationService.validatePhone(lead.phone);
        return {
          valid: true,
          autoApprove: !validation.valid,
          reason: validation.issues.join(", ")
        };
        
      case 'duplicate':
        // Check for duplicate leads in database
        const duplicates = await db.select()
          .from(leads)
          .where(
            and(
              eq(leads.phone, lead.phone),
              ne(leads.id, leadId)
            )
          )
          .limit(1);
        
        return {
          valid: true,
          autoApprove: duplicates.length > 0,
          reason: duplicates.length > 0 ? "Duplicate lead found in system" : undefined
        };
        
      case 'poor_quality':
        // Poor quality requires manual review
        return {
          valid: true,
          autoApprove: false
        };
        
      default:
        return {
          valid: false,
          autoApprove: false,
          reason: "Invalid issue type"
        };
    }
  },

  // Get guarantee statistics
  async getGuaranteeStats() {
    const stats = await storage.getQualityGuaranteeStats();
    
    // Calculate additional metrics
    const allReports = await storage.getAllQualityGuarantees();
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentReports = allReports.filter(r => new Date(r.reportedAt) >= last30Days);
    
    // Group by issue type
    const issueTypes = allReports.reduce((acc, report) => {
      acc[report.issueType] = (acc[report.issueType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Calculate approval rate
    const resolvedReports = allReports.filter(r => r.status !== 'pending');
    const approvalRate = resolvedReports.length > 0
      ? (resolvedReports.filter(r => r.status === 'approved' || r.status === 'replaced').length / resolvedReports.length) * 100
      : 0;
    
    return {
      ...stats,
      recentReports: recentReports.length,
      issueTypes,
      approvalRate: Math.round(approvalRate),
      averageResolutionHours: Math.round(stats.averageResolutionTime)
    };
  },

  // Check and update guarantee expiry
  async updateGuaranteeExpiry(purchaseId: string): Promise<void> {
    const purchase = await storage.getPurchase(purchaseId);
    if (!purchase || purchase.guaranteeExpiresAt) return;
    
    // Set guarantee expiry to 30 days from purchase
    const expiryDate = new Date(purchase.createdAt);
    expiryDate.setDate(expiryDate.getDate() + 30);
    
    await storage.updatePurchase(purchaseId, {
      guaranteeExpiresAt: expiryDate
    });
  }
};