import { db } from "../db";
import { uccFilings, uccIntelligence, uccRelationships } from "@shared/schema";
import type { UccFiling, UccIntelligence, UccRelationship } from "@shared/schema";
import { eq, and, or, desc, gte, sql, ilike } from "drizzle-orm";

/**
 * UCC Data Helper Service
 * 
 * This service provides shared access to UCC data from the database
 * without creating circular dependencies. It contains only data access
 * methods and basic calculations, no service dependencies.
 */
export class UccDataHelperService {
  private static instance: UccDataHelperService;

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): UccDataHelperService {
    if (!UccDataHelperService.instance) {
      UccDataHelperService.instance = new UccDataHelperService();
    }
    return UccDataHelperService.instance;
  }

  /**
   * Get UCC filings for a business
   */
  async getUccFilings(businessName: string): Promise<UccFiling[]> {
    try {
      const filings = await db
        .select()
        .from(uccFilings)
        .where(
          ilike(uccFilings.debtorName, `%${businessName}%`)
        )
        .orderBy(desc(uccFilings.filingDate));
      
      return filings;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching UCC filings:', error);
      return [];
    }
  }

  /**
   * Get UCC filings by lead ID
   */
  async getUccFilingsByLeadId(leadId: string): Promise<UccFiling[]> {
    try {
      const filings = await db
        .select()
        .from(uccFilings)
        .where(eq(uccFilings.leadId, leadId))
        .orderBy(desc(uccFilings.filingDate));
      
      return filings;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching UCC filings by lead ID:', error);
      return [];
    }
  }

  /**
   * Get UCC intelligence analysis for a lead
   */
  async getUccIntelligenceAnalysis(leadId: string): Promise<UccIntelligence | null> {
    try {
      const result = await db
        .select()
        .from(uccIntelligence)
        .where(eq(uccIntelligence.leadId, leadId))
        .orderBy(desc(uccIntelligence.analyzedAt))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching UCC intelligence:', error);
      return null;
    }
  }

  /**
   * Get all UCC intelligence records for a lead
   */
  async getAllUccIntelligence(leadId: string): Promise<UccIntelligence[]> {
    try {
      const records = await db
        .select()
        .from(uccIntelligence)
        .where(eq(uccIntelligence.leadId, leadId))
        .orderBy(desc(uccIntelligence.analyzedAt));
      
      return records;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching all UCC intelligence:', error);
      return [];
    }
  }

  /**
   * Get UCC relationships for a lead
   */
  async getUccRelationships(leadId: string): Promise<UccRelationship[]> {
    try {
      const relationships = await db
        .select()
        .from(uccRelationships)
        .where(
          or(
            eq(uccRelationships.leadIdA, leadId),
            eq(uccRelationships.leadIdB, leadId)
          )
        )
        .orderBy(desc(uccRelationships.relationshipStrength));
      
      return relationships;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching UCC relationships:', error);
      return [];
    }
  }

  /**
   * Calculate basic UCC influence metrics
   * This is a simplified version of UCC influence calculation
   * that can be used without circular dependencies
   */
  async calculateBasicUccInfluence(leadId: string): Promise<{
    hasUccData: boolean;
    filingCount: number;
    recentFilingCount: number;
    uniqueLenderCount: number;
    hasIntelligenceAnalysis: boolean;
    riskIndicator: 'low' | 'moderate' | 'high' | 'critical';
    debtVelocity: 'low' | 'moderate' | 'high';
  }> {
    const filings = await this.getUccFilingsByLeadId(leadId);
    const intelligence = await this.getUccIntelligenceAnalysis(leadId);
    
    // Calculate time windows
    const now = Date.now();
    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    const threeMonthsAgo = now - (90 * 24 * 60 * 60 * 1000);
    
    // Count recent filings
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > sixMonthsAgo
    );
    const veryRecentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > threeMonthsAgo
    );
    
    // Count unique lenders
    const uniqueLenders = new Set(filings.map(f => f.securedParty));
    
    // Determine risk indicator
    let riskIndicator: 'low' | 'moderate' | 'high' | 'critical' = 'low';
    if (intelligence?.riskLevel) {
      riskIndicator = intelligence.riskLevel as any;
    } else if (uniqueLenders.size >= 3 && recentFilings.length >= 3) {
      riskIndicator = 'high';
    } else if (recentFilings.length >= 2) {
      riskIndicator = 'moderate';
    }
    
    // Determine debt velocity
    let debtVelocity: 'low' | 'moderate' | 'high' = 'low';
    if (veryRecentFilings.length >= 3) {
      debtVelocity = 'high';
    } else if (recentFilings.length >= 2) {
      debtVelocity = 'moderate';
    }
    
    return {
      hasUccData: filings.length > 0,
      filingCount: filings.length,
      recentFilingCount: recentFilings.length,
      uniqueLenderCount: uniqueLenders.size,
      hasIntelligenceAnalysis: intelligence !== null,
      riskIndicator,
      debtVelocity
    };
  }

  /**
   * Get recent UCC activity summary
   */
  async getRecentUccActivity(daysBack: number = 30): Promise<{
    leadId: string;
    businessName?: string;
    filingCount: number;
    lastFilingDate?: Date;
  }[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      
      const recentFilings = await db
        .select({
          leadId: uccFilings.leadId,
          businessName: uccFilings.debtorName,
          filingCount: sql<number>`count(*)`,
          lastFilingDate: sql<Date>`max(${uccFilings.filingDate})`
        })
        .from(uccFilings)
        .where(gte(uccFilings.filingDate, cutoffDate))
        .groupBy(uccFilings.leadId, uccFilings.debtorName);
      
      return recentFilings as any;
    } catch (error) {
      console.error('[UccDataHelper] Error fetching recent UCC activity:', error);
      return [];
    }
  }

  /**
   * Store UCC intelligence analysis in the database
   */
  async saveUccIntelligence(data: Omit<UccIntelligence, 'id'>): Promise<void> {
    try {
      await db.insert(uccIntelligence).values(data);
      console.log('[UccDataHelper] UCC intelligence saved for lead:', data.leadId);
    } catch (error) {
      console.error('[UccDataHelper] Error saving UCC intelligence:', error);
      throw error;
    }
  }

  /**
   * Update UCC filing with lead association
   */
  async associateFilingWithLead(filingId: string, leadId: string): Promise<void> {
    try {
      await db
        .update(uccFilings)
        .set({ leadId })
        .where(eq(uccFilings.id, filingId));
      
      console.log(`[UccDataHelper] Associated filing ${filingId} with lead ${leadId}`);
    } catch (error) {
      console.error('[UccDataHelper] Error associating filing with lead:', error);
      throw error;
    }
  }

  /**
   * Get UCC influence score components
   * This provides the raw data needed to calculate influence
   * without needing to import the full intelligence service
   */
  async getUccInfluenceComponents(leadId: string): Promise<{
    filings: UccFiling[];
    intelligence: UccIntelligence | null;
    relationships: UccRelationship[];
    metrics: {
      totalFilings: number;
      recentFilings: number;
      uniqueLenders: number;
      averageLoanAmount: number | null;
      oldestFilingDays: number | null;
      newestFilingDays: number | null;
    };
  }> {
    const [filings, intelligence, relationships] = await Promise.all([
      this.getUccFilingsByLeadId(leadId),
      this.getUccIntelligenceAnalysis(leadId),
      this.getUccRelationships(leadId)
    ]);
    
    const now = Date.now();
    const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);
    
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > sixMonthsAgo
    );
    
    const uniqueLenders = new Set(filings.map(f => f.securedParty));
    
    // Calculate average loan amount if available
    const loanAmounts = filings
      .map(f => f.loanAmount)
      .filter(amount => amount !== null && amount !== undefined) as number[];
    
    const averageLoanAmount = loanAmounts.length > 0
      ? loanAmounts.reduce((a, b) => a + b, 0) / loanAmounts.length
      : null;
    
    // Calculate filing age metrics
    let oldestFilingDays = null;
    let newestFilingDays = null;
    
    if (filings.length > 0) {
      const filingDates = filings.map(f => new Date(f.filingDate).getTime());
      const oldest = Math.min(...filingDates);
      const newest = Math.max(...filingDates);
      
      oldestFilingDays = Math.floor((now - oldest) / (24 * 60 * 60 * 1000));
      newestFilingDays = Math.floor((now - newest) / (24 * 60 * 60 * 1000));
    }
    
    return {
      filings,
      intelligence,
      relationships,
      metrics: {
        totalFilings: filings.length,
        recentFilings: recentFilings.length,
        uniqueLenders: uniqueLenders.size,
        averageLoanAmount,
        oldestFilingDays,
        newestFilingDays
      }
    };
  }

  /**
   * Check if a lead has UCC data
   */
  async hasUccData(leadId: string): Promise<boolean> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(uccFilings)
        .where(eq(uccFilings.leadId, leadId))
        .limit(1);
      
      return result[0]?.count > 0;
    } catch (error) {
      console.error('[UccDataHelper] Error checking UCC data existence:', error);
      return false;
    }
  }
}

// Export singleton instance
export const uccDataHelper = UccDataHelperService.getInstance();