import { storage } from "../storage";
import { db } from "../db";
import { leads, leadBatches, leadAging } from "@shared/schema";
import { eq, sql, and, lte, gte } from "drizzle-orm";
import type { Lead, LeadAging, InsertLeadAging } from "@shared/schema";

export enum FreshnessCategory {
  NEW = "new",         // 0-3 days
  FRESH = "fresh",     // 4-7 days
  AGING = "aging",     // 8-14 days
  STALE = "stale"      // 15+ days
}

export interface FreshnessStats {
  new: number;
  fresh: number;
  aging: number;
  stale: number;
  avgFreshnessScore: number;
  hotLeads: Lead[];
  expiringLeads: Lead[];
}

export class LeadFreshnessService {
  private static instance: LeadFreshnessService;
  private updateInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): LeadFreshnessService {
    if (!LeadFreshnessService.instance) {
      LeadFreshnessService.instance = new LeadFreshnessService();
    }
    return LeadFreshnessService.instance;
  }

  /**
   * Calculate freshness score based on days since upload
   */
  calculateFreshnessScore(uploadDate: Date): number {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 3) return 100;      // NEW: Perfect freshness
    if (daysDiff <= 7) return 85;       // FRESH: Very good
    if (daysDiff <= 14) return 60;      // AGING: Moderate
    if (daysDiff <= 30) return 30;      // STALE: Low
    return 10;                           // Very stale
  }

  /**
   * Get freshness category based on days old
   */
  getFreshnessCategory(uploadDate: Date): FreshnessCategory {
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 3) return FreshnessCategory.NEW;
    if (daysDiff <= 7) return FreshnessCategory.FRESH;
    if (daysDiff <= 14) return FreshnessCategory.AGING;
    return FreshnessCategory.STALE;
  }

  /**
   * Get urgency level for a lead
   */
  getUrgencyLevel(lead: Lead): {
    level: "critical" | "high" | "medium" | "low";
    message: string;
    discount?: number;
  } {
    const daysSinceUpload = Math.floor((new Date().getTime() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceUpload <= 1) {
      return {
        level: "low",
        message: "NEW TODAY! Fresh lead just added"
      };
    }
    
    if (daysSinceUpload <= 3) {
      return {
        level: "low", 
        message: `Added ${daysSinceUpload} days ago - Still fresh!`
      };
    }
    
    if (daysSinceUpload <= 7) {
      return {
        level: "medium",
        message: "Limited time - Act fast!",
        discount: 5
      };
    }
    
    if (daysSinceUpload <= 14) {
      return {
        level: "high",
        message: "LAST CHANCE - Expiring soon!",
        discount: 10
      };
    }
    
    return {
      level: "critical",
      message: "FINAL HOURS - 15% off!",
      discount: 15
    };
  }

  /**
   * Update freshness scores for all leads
   */
  async updateAllFreshnessScores(): Promise<void> {
    try {
      console.log("[LeadFreshness] Starting freshness score update...");
      
      // Update all lead freshness scores
      await storage.updateFreshnessScores();
      
      // Calculate and store aging statistics by batch
      const batches = await storage.getAllLeadBatches();
      
      for (const batch of batches) {
        const batchLeads = await storage.getLeadsByBatchId(batch.id);
        
        if (batchLeads.length === 0) continue;
        
        // Group by freshness category
        const categoryCounts: Record<FreshnessCategory, number> = {
          [FreshnessCategory.NEW]: 0,
          [FreshnessCategory.FRESH]: 0,
          [FreshnessCategory.AGING]: 0,
          [FreshnessCategory.STALE]: 0
        };
        
        let totalFreshnessScore = 0;
        
        for (const lead of batchLeads) {
          const category = this.getFreshnessCategory(lead.uploadedAt);
          categoryCounts[category]++;
          totalFreshnessScore += lead.freshnessScore;
        }
        
        // Store aging analytics for each category
        for (const [category, count] of Object.entries(categoryCounts)) {
          if (count > 0) {
            const avgDays = this.getCategoryAvgDays(category as FreshnessCategory);
            
            const agingData: InsertLeadAging = {
              leadBatchId: batch.id,
              ageInDays: avgDays,
              freshnessCategory: category as FreshnessCategory,
              leadCount: count,
              averageFreshnessScore: String(totalFreshnessScore / batchLeads.length)
            };
            
            await storage.createLeadAging(agingData);
          }
        }
      }
      
      console.log("[LeadFreshness] Freshness scores updated successfully");
    } catch (error) {
      console.error("[LeadFreshness] Error updating freshness scores:", error);
    }
  }

  /**
   * Get average days for a freshness category
   */
  private getCategoryAvgDays(category: FreshnessCategory): number {
    switch (category) {
      case FreshnessCategory.NEW: return 2;      // Average of 0-3 days (rounded)
      case FreshnessCategory.FRESH: return 6;    // Average of 4-7 days (rounded)
      case FreshnessCategory.AGING: return 11;   // Average of 8-14 days
      case FreshnessCategory.STALE: return 20;   // 15+ days (using 20 as average)
      default: return 0;
    }
  }

  /**
   * Track when a lead is viewed
   */
  async trackLeadView(leadId: string): Promise<Lead | undefined> {
    return storage.trackLeadView(leadId);
  }

  /**
   * Get freshness statistics
   */
  async getFreshnessStats(): Promise<FreshnessStats> {
    const stats = await storage.getFreshnessStats();
    
    // Get hot leads (new leads with high quality)
    const hotLeads = await db.select()
      .from(leads)
      .where(and(
        eq(leads.sold, false),
        gte(leads.qualityScore, 80),
        sql`EXTRACT(DAY FROM NOW() - ${leads.uploadedAt}) <= 3`
      ))
      .limit(10)
      .orderBy(sql`${leads.qualityScore} DESC, ${leads.uploadedAt} DESC`);
    
    // Get expiring leads (aging leads that will become stale soon)
    const expiringLeads = await db.select()
      .from(leads)
      .where(and(
        eq(leads.sold, false),
        sql`EXTRACT(DAY FROM NOW() - ${leads.uploadedAt}) BETWEEN 12 AND 14`
      ))
      .limit(10)
      .orderBy(sql`${leads.qualityScore} DESC`);
    
    return {
      ...stats,
      hotLeads,
      expiringLeads
    };
  }

  /**
   * Get leads by freshness category
   */
  async getLeadsByFreshness(category: FreshnessCategory): Promise<Lead[]> {
    return storage.getLeadsByFreshness(category);
  }

  /**
   * Start automatic freshness updates (daily)
   */
  startAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    // Update immediately on start
    this.updateAllFreshnessScores();
    
    // Then update every 24 hours
    this.updateInterval = setInterval(() => {
      this.updateAllFreshnessScores();
    }, 24 * 60 * 60 * 1000); // 24 hours
    
    console.log("[LeadFreshness] Auto-update scheduled (every 24 hours)");
  }

  /**
   * Stop automatic updates
   */
  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log("[LeadFreshness] Auto-update stopped");
    }
  }

  /**
   * Get price with freshness discount
   */
  getDiscountedPrice(originalPrice: number, lead: Lead): {
    finalPrice: number;
    discount: number;
    discountPercent: number;
  } {
    const urgency = this.getUrgencyLevel(lead);
    const discountPercent = urgency.discount || 0;
    const discount = (originalPrice * discountPercent) / 100;
    const finalPrice = originalPrice - discount;
    
    return {
      finalPrice,
      discount,
      discountPercent
    };
  }

  /**
   * Check if lead needs freshness alert
   */
  shouldShowFreshnessAlert(lead: Lead): boolean {
    const daysSinceUpload = Math.floor((new Date().getTime() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    // Show alert for leads that are about to expire (12-14 days old)
    return daysSinceUpload >= 12 && daysSinceUpload <= 14 && !lead.sold;
  }

  /**
   * Get badge info for a lead
   */
  getLeadBadge(lead: Lead): {
    text: string;
    color: "green" | "yellow" | "orange" | "red";
    pulse: boolean;
    icon?: string;
  } | null {
    const category = this.getFreshnessCategory(lead.uploadedAt);
    const daysSinceUpload = Math.floor((new Date().getTime() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24));
    
    switch (category) {
      case FreshnessCategory.NEW:
        if (daysSinceUpload === 0) {
          return {
            text: "NEW TODAY",
            color: "green",
            pulse: true,
            icon: "sparkles"
          };
        }
        return {
          text: "NEW",
          color: "green",
          pulse: false,
          icon: "star"
        };
        
      case FreshnessCategory.FRESH:
        return {
          text: "FRESH",
          color: "green",
          pulse: false,
          icon: "leaf"
        };
        
      case FreshnessCategory.AGING:
        if (daysSinceUpload >= 12) {
          return {
            text: "LIMITED TIME",
            color: "orange",
            pulse: true,
            icon: "clock"
          };
        }
        return {
          text: "AGING",
          color: "yellow",
          pulse: false,
          icon: "hourglass"
        };
        
      case FreshnessCategory.STALE:
        return {
          text: "LAST CHANCE",
          color: "red",
          pulse: true,
          icon: "alert-triangle"
        };
        
      default:
        return null;
    }
  }
}

// Export singleton instance
export const leadFreshnessService = LeadFreshnessService.getInstance();