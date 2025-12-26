import { db } from "../db";
import { leads, callLogs, companies, brainConfig, leadAssignments, leadActivities, sourceStats, fundingProducts, type Lead, type Company, type FundingProduct } from "@shared/schema";
import { eq, and, desc, or, isNull, lte, ne, asc, gt, count, sql } from "drizzle-orm";

// Default AI Brain settings
const DEFAULT_SETTINGS = {
  recencyWeight: 0.3,
  sourceWeight: 0.2,
  attemptWeight: 0.2,
  outcomeWeight: 0.3,
  maxAttempts: 10,
  followUpDelayHours: 24
};

// Source quality scores (0-1)
const SOURCE_SCORES: Record<string, number> = {
  referral: 1.0,
  paid: 0.85,
  web: 0.7,
  import: 0.5,
  manual: 0.4,
};

// Outcome scores (0-1) - higher means more promising
const OUTCOME_SCORES: Record<string, number> = {
  connected: 1.0,
  callback_requested: 0.9,
  follow_up: 0.8,
  voicemail: 0.6,
  no_answer: 0.4,
  busy: 0.35,
  wrong_number: 0.1,
  not_interested: 0.05,
  funded: 0.0, // Already converted, no need to prioritize
};

interface AiBrainSettings {
  recencyWeight: number;
  sourceWeight: number;
  attemptWeight: number;
  outcomeWeight: number;
  maxAttempts: number;
  followUpDelayHours: number;
}

interface FundingProductScoringWeights {
  recencyWeight?: number;
  sourceWeight?: number;
  financialWeight?: number;
  riskWeight?: number;
}

export class AiBrainService {
  private settings: AiBrainSettings;
  private fundingProductWeightsCache: Map<string, FundingProductScoringWeights> = new Map();

  constructor(settings?: Partial<AiBrainSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /**
   * Get scoring weights for a specific funding product
   */
  async getFundingProductWeights(fundingProductId: string): Promise<FundingProductScoringWeights | null> {
    // Check cache first
    if (this.fundingProductWeightsCache.has(fundingProductId)) {
      return this.fundingProductWeightsCache.get(fundingProductId) || null;
    }

    // Fetch from database
    const [product] = await db.select().from(fundingProducts).where(eq(fundingProducts.id, fundingProductId)).limit(1);
    
    if (!product || !product.scoringWeights) {
      return null;
    }

    const weights = product.scoringWeights as FundingProductScoringWeights;
    this.fundingProductWeightsCache.set(fundingProductId, weights);
    return weights;
  }

  /**
   * Clear the funding product weights cache (call after updates)
   */
  clearFundingProductCache() {
    this.fundingProductWeightsCache.clear();
  }

  /**
   * Calculate the hot score for a lead based on multiple factors
   * Uses default weights - for funding product-specific scoring, use calculateHotScoreWithProduct
   */
  calculateHotScore(lead: Lead): number {
    const recencyScore = this.calculateRecencyScore(lead);
    const sourceScore = this.calculateSourceScore(lead);
    const attemptScore = this.calculateAttemptScore(lead);
    const outcomeScore = this.calculateOutcomeScore(lead);

    // Weighted average
    const rawScore = 
      (recencyScore * this.settings.recencyWeight) +
      (sourceScore * this.settings.sourceWeight) +
      (attemptScore * this.settings.attemptWeight) +
      (outcomeScore * this.settings.outcomeWeight);

    // Scale to 0-100
    return Math.round(Math.max(0, Math.min(100, rawScore * 100)));
  }

  /**
   * Calculate the hot score for a lead using funding product-specific weights if available
   */
  async calculateHotScoreWithProduct(lead: Lead): Promise<number> {
    // If lead has a funding product, try to get product-specific weights
    if (lead.fundingProductId) {
      const productWeights = await this.getFundingProductWeights(lead.fundingProductId);
      
      if (productWeights) {
        const recencyScore = this.calculateRecencyScore(lead);
        const sourceScore = this.calculateSourceScore(lead);
        const attemptScore = this.calculateAttemptScore(lead);
        const outcomeScore = this.calculateOutcomeScore(lead);

        // Use funding product weights (fall back to default if not specified)
        const weights = {
          recency: productWeights.recencyWeight ?? this.settings.recencyWeight,
          source: productWeights.sourceWeight ?? this.settings.sourceWeight,
          financial: productWeights.financialWeight ?? this.settings.attemptWeight,
          risk: productWeights.riskWeight ?? this.settings.outcomeWeight,
        };

        // Weighted average using funding product weights
        const rawScore = 
          (recencyScore * weights.recency) +
          (sourceScore * weights.source) +
          (attemptScore * weights.financial) +
          (outcomeScore * weights.risk);

        return Math.round(Math.max(0, Math.min(100, rawScore * 100)));
      }
    }

    // Fall back to default scoring
    return this.calculateHotScore(lead);
  }

  /**
   * Calculate recency score based on creation date and last contact
   */
  private calculateRecencyScore(lead: Lead): number {
    const now = new Date();
    const createdAt = new Date(lead.createdAt);
    const lastContact = lead.lastCallAt ? new Date(lead.lastCallAt) : null;
    
    // Use the more recent date
    const referenceDate = lastContact && lastContact > createdAt ? lastContact : createdAt;
    const daysSince = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Decay function - newer is better
    if (daysSince <= 1) return 1.0;
    if (daysSince <= 3) return 0.9;
    if (daysSince <= 7) return 0.75;
    if (daysSince <= 14) return 0.6;
    if (daysSince <= 30) return 0.4;
    if (daysSince <= 60) return 0.25;
    return 0.1;
  }

  /**
   * Calculate source quality score
   */
  private calculateSourceScore(lead: Lead): number {
    const source = lead.sourceType || 'manual';
    return SOURCE_SCORES[source] || 0.4;
  }

  /**
   * Calculate attempt score - decreases with more attempts
   */
  private calculateAttemptScore(lead: Lead): number {
    const attempts = lead.attemptCount || 0;
    const maxAttempts = this.settings.maxAttempts;
    
    if (attempts === 0) return 0.9; // Never contacted - high priority
    if (attempts >= maxAttempts) return 0.05; // Max attempts reached
    
    // Linear decay with attempts
    return Math.max(0.1, 1 - (attempts / maxAttempts) * 0.8);
  }

  /**
   * Calculate outcome score based on last call result
   */
  private calculateOutcomeScore(lead: Lead): number {
    if (!lead.lastOutcome) return 0.5; // No outcome yet - neutral
    return OUTCOME_SCORES[lead.lastOutcome] || 0.5;
  }

  /**
   * Calculate next action date based on outcome and settings
   */
  calculateNextActionAt(lead: Lead, outcome?: string): Date {
    const now = new Date();
    const delayHours = this.settings.followUpDelayHours;
    const currentOutcome = outcome || lead.lastOutcome;
    
    // Different delays based on outcome
    let hoursUntilNextAction = delayHours;
    
    switch (currentOutcome) {
      case 'callback_requested':
        hoursUntilNextAction = 2; // Quick callback
        break;
      case 'voicemail':
        hoursUntilNextAction = 24; // Next day
        break;
      case 'no_answer':
        hoursUntilNextAction = 4; // Try again same day
        break;
      case 'busy':
        hoursUntilNextAction = 2; // Try again soon
        break;
      case 'connected':
        hoursUntilNextAction = 48; // Follow up in 2 days
        break;
      case 'follow_up':
        hoursUntilNextAction = 72; // Follow up in 3 days
        break;
      case 'not_interested':
        hoursUntilNextAction = 168; // Week later
        break;
      case 'funded':
      case 'wrong_number':
        hoursUntilNextAction = 720; // Month later or never
        break;
    }
    
    return new Date(now.getTime() + hoursUntilNextAction * 60 * 60 * 1000);
  }

  /**
   * Determine next action type based on outcome
   */
  determineNextActionType(outcome?: string): string {
    switch (outcome) {
      case 'callback_requested':
        return 'call';
      case 'voicemail':
      case 'no_answer':
      case 'busy':
        return 'call';
      case 'connected':
        return 'follow_up';
      case 'follow_up':
        return 'email';
      case 'not_interested':
        return 'email';
      case 'funded':
        return 'meeting'; // Check-in meeting
      default:
        return 'call';
    }
  }

  /**
   * Update a lead's hot score and next action after a call
   */
  async updateLeadAfterCall(
    leadId: string, 
    outcome: string,
    companySettings?: AiBrainSettings
  ): Promise<Lead | undefined> {
    // Use company-specific settings if provided
    if (companySettings) {
      this.settings = { ...DEFAULT_SETTINGS, ...companySettings };
    }

    // Get current lead
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead) return undefined;

    // Update attempt count and last outcome
    const updatedLead = {
      ...lead,
      attemptCount: (lead.attemptCount || 0) + 1,
      lastOutcome: outcome,
      lastCallAt: new Date(),
      lastContactedAt: new Date(),
    };

    // Calculate new hot score (using funding product-specific weights if available)
    const hotScore = await this.calculateHotScoreWithProduct(updatedLead as Lead);
    const nextActionAt = this.calculateNextActionAt(updatedLead as Lead, outcome);
    const nextActionType = this.determineNextActionType(outcome);

    // Update in database
    const [result] = await db.update(leads)
      .set({
        hotScore,
        attemptCount: updatedLead.attemptCount,
        lastOutcome: outcome,
        lastCallAt: updatedLead.lastCallAt,
        lastContactedAt: updatedLead.lastContactedAt,
        nextActionAt,
        nextActionType,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    return result;
  }

  /**
   * Recalculate hot scores for all leads in a company
   */
  async recalculateCompanyScores(companyId: string): Promise<number> {
    // Get company settings
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (company?.aiBrainSettings) {
      this.settings = { ...DEFAULT_SETTINGS, ...(company.aiBrainSettings as AiBrainSettings) };
    }

    // Get all active leads for the company
    const companyLeads = await db.select().from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          ne(leads.leadStatus, 'won'),
          ne(leads.leadStatus, 'lost')
        )
      );

    // Update each lead's hot score (using funding product-specific weights if available)
    let updated = 0;
    for (const lead of companyLeads) {
      const hotScore = await this.calculateHotScoreWithProduct(lead);
      await db.update(leads)
        .set({ hotScore, updatedAt: new Date() })
        .where(eq(leads.id, lead.id));
      updated++;
    }

    return updated;
  }

  /**
   * Get the next best lead for a company
   */
  async getNextBestLead(companyId: string, skip: number = 0): Promise<Lead | undefined> {
    const results = await db.select().from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          or(
            isNull(leads.nextActionAt),
            lte(leads.nextActionAt, new Date())
          ),
          ne(leads.leadStatus, 'won'),
          ne(leads.leadStatus, 'lost')
        )
      )
      .orderBy(desc(leads.hotScore), asc(leads.attemptCount))
      .limit(1)
      .offset(skip);
    
    return results[0];
  }

  /**
   * Get top leads by hot score for a company
   */
  async getHotLeads(companyId: string, limit: number = 10): Promise<Lead[]> {
    return db.select().from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          ne(leads.leadStatus, 'won'),
          ne(leads.leadStatus, 'lost'),
          gt(leads.hotScore, 50)
        )
      )
      .orderBy(desc(leads.hotScore))
      .limit(limit);
  }

  /**
   * Get leads that need immediate action (due now or overdue)
   */
  async getLeadsNeedingAction(companyId: string): Promise<Lead[]> {
    return db.select().from(leads)
      .where(
        and(
          eq(leads.companyId, companyId),
          or(
            isNull(leads.nextActionAt),
            lte(leads.nextActionAt, new Date())
          ),
          ne(leads.leadStatus, 'won'),
          ne(leads.leadStatus, 'lost')
        )
      )
      .orderBy(desc(leads.hotScore))
      .limit(50);
  }

  /**
   * Get brain configuration for admin portal
   */
  async getBrainConfig(): Promise<any> {
    const [config] = await db.select().from(brainConfig).limit(1);
    
    if (!config) {
      // Create default config
      const [newConfig] = await db.insert(brainConfig).values({
        recencyWeight: DEFAULT_SETTINGS.recencyWeight,
        sourceWeight: DEFAULT_SETTINGS.sourceWeight,
        attemptWeight: DEFAULT_SETTINGS.attemptWeight,
        outcomeWeight: DEFAULT_SETTINGS.outcomeWeight,
        feedbackWeight: 0.2,
        maxAttempts: DEFAULT_SETTINGS.maxAttempts,
        recalcIntervalHours: 24,
        isActive: true,
      }).returning();
      return newConfig;
    }
    
    return config;
  }

  /**
   * Update brain configuration from admin portal
   */
  async updateBrainConfig(updates: Partial<{
    recencyWeight: number;
    sourceWeight: number;
    attemptWeight: number;
    outcomeWeight: number;
    feedbackWeight: number;
    maxAttempts: number;
    recalcIntervalHours: number;
    isActive: boolean;
  }>): Promise<any> {
    let config = await this.getBrainConfig();
    
    const [updated] = await db.update(brainConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(brainConfig.id, config.id))
      .returning();
    
    // Update local settings
    if (updated) {
      this.settings = {
        recencyWeight: updated.recencyWeight,
        sourceWeight: updated.sourceWeight,
        attemptWeight: updated.attemptWeight,
        outcomeWeight: updated.outcomeWeight,
        maxAttempts: updated.maxAttempts,
        followUpDelayHours: DEFAULT_SETTINGS.followUpDelayHours,
      };
    }
    
    return updated;
  }

  /**
   * Calculate feedback-adjusted score for a lead based on buyer outcomes
   */
  async calculateFeedbackScore(leadId: string): Promise<number> {
    // Get all activities for this lead
    const activities = await db.select().from(leadActivities)
      .where(eq(leadActivities.leadId, leadId));
    
    if (activities.length === 0) return 0.5; // Neutral if no feedback
    
    // Weight recent activities more
    let weightedScore = 0;
    let totalWeight = 0;
    
    for (const activity of activities) {
      const daysSince = (Date.now() - new Date(activity.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const weight = Math.max(0.1, 1 - daysSince / 30); // Decay over 30 days
      
      let score = 0.5;
      switch (activity.type) {
        case 'funded':
          score = 1.0;
          break;
        case 'contacted':
          score = 0.7;
          break;
        case 'no_response':
          score = 0.3;
          break;
        case 'bad_lead':
          score = 0.1;
          break;
      }
      
      weightedScore += score * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedScore / totalWeight : 0.5;
  }

  /**
   * Update source statistics based on buyer feedback
   */
  async updateSourceStats(sourceType: string, conversionLabel: string): Promise<void> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Check if we have stats for this source today
    const [existing] = await db.select().from(sourceStats)
      .where(and(
        eq(sourceStats.sourceType, sourceType),
        eq(sourceStats.periodStart, now)
      ))
      .limit(1);
    
    if (existing) {
      // Update existing stats
      const updates: any = { totalLeads: existing.totalLeads + 1 };
      
      switch (conversionLabel) {
        case 'funded':
          updates.fundedCount = existing.fundedCount + 1;
          break;
        case 'contacted':
          updates.contactedCount = existing.contactedCount + 1;
          break;
        case 'bad':
          updates.badLeadCount = existing.badLeadCount + 1;
          break;
        case 'no_response':
          updates.noResponseCount = existing.noResponseCount + 1;
          break;
      }
      
      // Recalculate rate
      const total = updates.totalLeads;
      updates.conversionRate = total > 0 ? (updates.fundedCount || existing.fundedCount) / total : 0;
      
      await db.update(sourceStats)
        .set(updates)
        .where(eq(sourceStats.id, existing.id));
    } else {
      // Create new stats record
      const isFunded = conversionLabel === 'funded' ? 1 : 0;
      const isContacted = conversionLabel === 'contacted' ? 1 : 0;
      const isBad = conversionLabel === 'bad' ? 1 : 0;
      const isNoResponse = conversionLabel === 'no_response' ? 1 : 0;
      
      await db.insert(sourceStats).values({
        sourceType,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        totalLeads: 1,
        fundedCount: isFunded,
        contactedCount: isContacted,
        badLeadCount: isBad,
        noResponseCount: isNoResponse,
        conversionRate: isFunded,
      });
    }
  }

  /**
   * Get source performance stats for admin dashboard
   */
  async getSourcePerformance(): Promise<any[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const stats = await db.select({
      sourceType: sourceStats.sourceType,
      totalLeads: sql<number>`sum(${sourceStats.totalLeads})::int`,
      fundedCount: sql<number>`sum(${sourceStats.fundedCount})::int`,
      contactedCount: sql<number>`sum(${sourceStats.contactedCount})::int`,
      badLeadCount: sql<number>`sum(${sourceStats.badLeadCount})::int`,
      noResponseCount: sql<number>`sum(${sourceStats.noResponseCount})::int`,
    })
    .from(sourceStats)
    .where(gt(sourceStats.periodStart, thirtyDaysAgo))
    .groupBy(sourceStats.sourceType);
    
    return stats.map(s => ({
      ...s,
      conversionRate: s.totalLeads > 0 ? (s.fundedCount / s.totalLeads) * 100 : 0,
    }));
  }

  /**
   * Recalculate all scores globally (scheduled job)
   */
  async recalculateAllScores(): Promise<{ updated: number; duration: number }> {
    const start = Date.now();
    console.log('[AIBrain] Starting global score recalculation...');
    
    // Get all active leads
    const allLeads = await db.select().from(leads)
      .where(
        and(
          ne(leads.leadStatus, 'won'),
          ne(leads.leadStatus, 'lost')
        )
      );
    
    let updated = 0;
    
    for (const lead of allLeads) {
      try {
        const hotScore = this.calculateHotScore(lead);
        
        // Also calculate AI score with feedback if there's a conversion label
        let aiScore = hotScore;
        if (lead.conversionLabel && lead.conversionLabel !== 'unknown') {
          const feedbackScore = await this.calculateFeedbackScore(lead.id);
          aiScore = Math.round((hotScore * 0.7) + (feedbackScore * 100 * 0.3));
        }
        
        await db.update(leads)
          .set({ 
            hotScore, 
            aiScore,
            updatedAt: new Date() 
          })
          .where(eq(leads.id, lead.id));
        
        updated++;
      } catch (error) {
        console.error(`[AIBrain] Failed to update lead ${lead.id}:`, error);
      }
    }
    
    const duration = Date.now() - start;
    console.log(`[AIBrain] Completed score recalculation: ${updated} leads updated in ${duration}ms`);
    
    return { updated, duration };
  }

  /**
   * Start scheduled recalculation job
   */
  startScheduledRecalculation(intervalHours: number = 24): NodeJS.Timeout {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    console.log(`[AIBrain] Starting scheduled recalculation every ${intervalHours} hours`);
    
    // Run immediately
    this.recalculateAllScores().catch(err => {
      console.error('[AIBrain] Initial recalculation failed:', err);
    });
    
    // Then run on interval
    return setInterval(() => {
      this.recalculateAllScores().catch(err => {
        console.error('[AIBrain] Scheduled recalculation failed:', err);
      });
    }, intervalMs);
  }

  /**
   * Get buyer performance stats for admin dashboard
   */
  async getBuyerPerformance(): Promise<any[]> {
    const stats = await db.select({
      buyerId: leadAssignments.buyerId,
      total: count(),
      funded: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'funded' then 1 else 0 end)::int`,
      contacted: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'contacted' then 1 else 0 end)::int`,
      bad: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'bad' then 1 else 0 end)::int`,
      noResponse: sql<number>`sum(case when ${leadAssignments.currentConversionLabel} = 'no_response' then 1 else 0 end)::int`,
    })
    .from(leadAssignments)
    .groupBy(leadAssignments.buyerId);
    
    return stats.map(s => ({
      buyerId: s.buyerId,
      totalLeads: Number(s.total),
      funded: s.funded || 0,
      contacted: s.contacted || 0,
      bad: s.bad || 0,
      noResponse: s.noResponse || 0,
      fundRate: Number(s.total) > 0 ? ((s.funded || 0) / Number(s.total)) * 100 : 0,
      feedbackRate: Number(s.total) > 0 ? (((s.funded || 0) + (s.contacted || 0) + (s.bad || 0) + (s.noResponse || 0)) / Number(s.total)) * 100 : 0,
    }));
  }
}

// Export singleton instance
export const aiBrainService = new AiBrainService();
