import { db } from "../db";
import { savedSearches, savedSearchMatches, leads } from "@shared/schema";
import type { SavedSearch, SavedSearchMatch, Lead } from "@shared/schema";
import { eq, and, or, gte, lte, ilike, inArray, sql } from "drizzle-orm";

export interface SearchCriteria {
  // Basic filters
  industry?: string;
  stateCode?: string;
  minRevenue?: number;
  maxRevenue?: number;
  minRequestedAmount?: number;
  maxRequestedAmount?: number;
  creditScore?: string;
  timeInBusiness?: string;
  urgencyLevel?: string;
  
  // Score filters
  minUnifiedScore?: number;
  minVerificationScore?: number;
  maxUccRiskLevel?: string;
  
  // Advanced filters
  hasWebsite?: boolean;
  isEnriched?: boolean;
  isVerified?: boolean;
  freshnessCategory?: string;
  insightTags?: string[];
}

export interface SavedSearchInput {
  name: string;
  description?: string;
  searchCriteria: SearchCriteria;
  emailNotifications?: boolean;
  inAppNotifications?: boolean;
  notificationFrequency?: 'instant' | 'daily' | 'weekly';
}

export class SavedSearchService {
  /**
   * Create a new saved search
   */
  async createSavedSearch(userId: string, input: SavedSearchInput): Promise<SavedSearch> {
    const [savedSearch] = await db
      .insert(savedSearches)
      .values({
        userId,
        name: input.name,
        description: input.description,
        searchCriteria: input.searchCriteria,
        emailNotifications: input.emailNotifications ?? true,
        inAppNotifications: input.inAppNotifications ?? true,
        notificationFrequency: input.notificationFrequency ?? 'daily',
      })
      .returning();

    // Run initial matching
    await this.matchLeadsToSavedSearch(savedSearch.id);

    return savedSearch;
  }

  /**
   * Update a saved search
   */
  async updateSavedSearch(searchId: string, userId: string, input: Partial<SavedSearchInput>): Promise<SavedSearch | null> {
    const [updated] = await db
      .update(savedSearches)
      .set({
        ...input,
        updatedAt: new Date()
      })
      .where(and(
        eq(savedSearches.id, searchId),
        eq(savedSearches.userId, userId)
      ))
      .returning();

    if (updated && input.searchCriteria) {
      // Re-run matching if criteria changed
      await this.matchLeadsToSavedSearch(updated.id);
    }

    return updated;
  }

  /**
   * Delete a saved search
   */
  async deleteSavedSearch(searchId: string, userId: string): Promise<boolean> {
    // Delete matches first
    await db
      .delete(savedSearchMatches)
      .where(eq(savedSearchMatches.savedSearchId, searchId));

    // Delete saved search
    const result = await db
      .delete(savedSearches)
      .where(and(
        eq(savedSearches.id, searchId),
        eq(savedSearches.userId, userId)
      ));

    return result.rowCount > 0;
  }

  /**
   * Get saved searches for a user
   */
  async getUserSavedSearches(userId: string): Promise<SavedSearch[]> {
    return await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(savedSearches.createdAt);
  }

  /**
   * Match leads to a saved search
   */
  async matchLeadsToSavedSearch(searchId: string): Promise<number> {
    const [search] = await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.id, searchId))
      .limit(1);

    if (!search) return 0;

    const criteria = search.searchCriteria as SearchCriteria;
    
    // Build query based on criteria
    const conditions: any[] = [];

    if (criteria.industry) {
      conditions.push(ilike(leads.industry, `%${criteria.industry}%`));
    }
    if (criteria.stateCode) {
      conditions.push(eq(leads.stateCode, criteria.stateCode));
    }
    if (criteria.minRevenue) {
      // Parse revenue string to number for comparison
      conditions.push(sql`
        CASE 
          WHEN ${leads.annualRevenue} LIKE '%M%' THEN 
            CAST(REPLACE(REPLACE(${leads.annualRevenue}, '$', ''), 'M', '') AS NUMERIC) * 1000000
          WHEN ${leads.annualRevenue} LIKE '%K%' THEN 
            CAST(REPLACE(REPLACE(${leads.annualRevenue}, '$', ''), 'K', '') AS NUMERIC) * 1000
          ELSE 
            CAST(REPLACE(${leads.annualRevenue}, '$', '') AS NUMERIC)
        END >= ${criteria.minRevenue}
      `);
    }
    if (criteria.minRequestedAmount) {
      conditions.push(sql`
        CAST(REPLACE(REPLACE(${leads.requestedAmount}, '$', ''), ',', '') AS NUMERIC) >= ${criteria.minRequestedAmount}
      `);
    }
    if (criteria.creditScore) {
      conditions.push(ilike(leads.creditScore, `%${criteria.creditScore}%`));
    }
    if (criteria.urgencyLevel) {
      conditions.push(eq(leads.urgencyLevel, criteria.urgencyLevel));
    }
    if (criteria.minUnifiedScore) {
      conditions.push(gte(leads.unifiedLeadScore, criteria.minUnifiedScore));
    }
    if (criteria.minVerificationScore) {
      conditions.push(gte(leads.overallVerificationScore, criteria.minVerificationScore));
    }
    if (criteria.maxUccRiskLevel) {
      conditions.push(or(
        eq(leads.uccRiskLevel, 'low'),
        criteria.maxUccRiskLevel === 'medium' ? eq(leads.uccRiskLevel, 'medium') : sql`false`
      ));
    }
    if (criteria.hasWebsite) {
      conditions.push(sql`${leads.websiteUrl} IS NOT NULL AND ${leads.websiteUrl} != ''`);
    }
    if (criteria.isEnriched) {
      conditions.push(eq(leads.isEnriched, true));
    }
    if (criteria.isVerified) {
      conditions.push(or(
        eq(leads.verificationStatus, 'verified'),
        eq(leads.verificationStatus, 'partial')
      ));
    }

    // Get matching leads
    const matchingLeads = await db
      .select()
      .from(leads)
      .where(conditions.length > 0 ? and(...conditions) : sql`true`);

    // Get existing matches to avoid duplicates
    const existingMatches = await db
      .select()
      .from(savedSearchMatches)
      .where(eq(savedSearchMatches.savedSearchId, searchId));

    const existingLeadIds = new Set(existingMatches.map(m => m.leadId));
    let newMatchCount = 0;

    // Create new matches
    for (const lead of matchingLeads) {
      if (!existingLeadIds.has(lead.id)) {
        const matchScore = this.calculateMatchScore(lead, criteria);
        
        await db.insert(savedSearchMatches).values({
          savedSearchId: searchId,
          leadId: lead.id,
          matchScore
        });
        
        newMatchCount++;
      }
    }

    // Update saved search stats
    if (newMatchCount > 0) {
      await db
        .update(savedSearches)
        .set({
          lastMatchedAt: new Date(),
          matchCount: sql`${savedSearches.matchCount} + ${newMatchCount}`,
          newMatchCount: sql`${savedSearches.newMatchCount} + ${newMatchCount}`,
          updatedAt: new Date()
        })
        .where(eq(savedSearches.id, searchId));
    }

    return newMatchCount;
  }

  /**
   * Calculate how well a lead matches the criteria
   */
  private calculateMatchScore(lead: Lead, criteria: SearchCriteria): number {
    let score = 50; // Base score for matching basic criteria
    let maxPossibleBonus = 0;
    let earnedBonus = 0;

    // Bonus for high scores
    if (criteria.minUnifiedScore && lead.unifiedLeadScore) {
      maxPossibleBonus += 15;
      if (lead.unifiedLeadScore > criteria.minUnifiedScore + 20) {
        earnedBonus += 15;
      } else if (lead.unifiedLeadScore > criteria.minUnifiedScore + 10) {
        earnedBonus += 10;
      } else if (lead.unifiedLeadScore > criteria.minUnifiedScore) {
        earnedBonus += 5;
      }
    }

    // Bonus for verification
    if (lead.overallVerificationScore) {
      maxPossibleBonus += 10;
      if (lead.overallVerificationScore >= 90) {
        earnedBonus += 10;
      } else if (lead.overallVerificationScore >= 70) {
        earnedBonus += 7;
      } else if (lead.overallVerificationScore >= 50) {
        earnedBonus += 5;
      }
    }

    // Bonus for freshness
    if (lead.freshnessScore) {
      maxPossibleBonus += 10;
      if (lead.freshnessScore >= 90) {
        earnedBonus += 10;
      } else if (lead.freshnessScore >= 70) {
        earnedBonus += 7;
      } else if (lead.freshnessScore >= 50) {
        earnedBonus += 5;
      }
    }

    // Bonus for urgency match
    if (criteria.urgencyLevel && lead.urgencyLevel === criteria.urgencyLevel) {
      maxPossibleBonus += 10;
      earnedBonus += 10;
    }

    // Bonus for enrichment
    if (lead.isEnriched) {
      maxPossibleBonus += 5;
      earnedBonus += 5;
    }

    // Calculate final score
    if (maxPossibleBonus > 0) {
      score += Math.round((earnedBonus / maxPossibleBonus) * 50);
    }

    return Math.min(100, score);
  }

  /**
   * Get matches for a saved search
   */
  async getSavedSearchMatches(searchId: string, userId: string): Promise<Array<SavedSearchMatch & { lead: Lead }>> {
    // Verify ownership
    const [search] = await db
      .select()
      .from(savedSearches)
      .where(and(
        eq(savedSearches.id, searchId),
        eq(savedSearches.userId, userId)
      ))
      .limit(1);

    if (!search) return [];

    // Get matches with lead data
    const matches = await db
      .select({
        match: savedSearchMatches,
        lead: leads
      })
      .from(savedSearchMatches)
      .innerJoin(leads, eq(savedSearchMatches.leadId, leads.id))
      .where(eq(savedSearchMatches.savedSearchId, searchId))
      .orderBy(savedSearchMatches.matchedAt);

    return matches.map(row => ({
      ...row.match,
      lead: row.lead
    }));
  }

  /**
   * Mark matches as read
   */
  async markMatchesAsRead(searchId: string, userId: string): Promise<void> {
    // Verify ownership
    const [search] = await db
      .select()
      .from(savedSearches)
      .where(and(
        eq(savedSearches.id, searchId),
        eq(savedSearches.userId, userId)
      ))
      .limit(1);

    if (!search) return;

    // Mark all matches as read
    await db
      .update(savedSearchMatches)
      .set({ isRead: true })
      .where(and(
        eq(savedSearchMatches.savedSearchId, searchId),
        eq(savedSearchMatches.isRead, false)
      ));

    // Reset new match count
    await db
      .update(savedSearches)
      .set({ 
        newMatchCount: 0,
        updatedAt: new Date()
      })
      .where(eq(savedSearches.id, searchId));
  }

  /**
   * Run matching for all active searches (for cron job)
   */
  async runMatchingForAllSearches(): Promise<number> {
    const activeSearches = await db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.isActive, true));

    let totalNewMatches = 0;

    for (const search of activeSearches) {
      const newMatches = await this.matchLeadsToSavedSearch(search.id);
      totalNewMatches += newMatches;

      // Send notifications if needed
      if (newMatches > 0 && search.notificationFrequency === 'instant') {
        // TODO: Send notification
        console.log(`New matches for saved search ${search.name}: ${newMatches}`);
      }
    }

    return totalNewMatches;
  }

  /**
   * Get user's notification summary
   */
  async getUserNotificationSummary(userId: string): Promise<{
    totalSavedSearches: number;
    totalNewMatches: number;
    searches: Array<{ id: string; name: string; newMatchCount: number }>;
  }> {
    const userSearches = await db
      .select()
      .from(savedSearches)
      .where(and(
        eq(savedSearches.userId, userId),
        eq(savedSearches.isActive, true)
      ));

    const searches = userSearches.map(s => ({
      id: s.id,
      name: s.name,
      newMatchCount: s.newMatchCount
    }));

    const totalNewMatches = searches.reduce((sum, s) => sum + s.newMatchCount, 0);

    return {
      totalSavedSearches: searches.length,
      totalNewMatches,
      searches: searches.filter(s => s.newMatchCount > 0)
    };
  }
}

export const savedSearchService = new SavedSearchService();