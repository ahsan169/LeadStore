import { db } from "../db";
import { leads, callLogs, companies, type Lead, type Company } from "@shared/schema";
import { eq, and, desc, or, isNull, lte, ne, asc, gt } from "drizzle-orm";

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

export class AiBrainService {
  private settings: AiBrainSettings;

  constructor(settings?: Partial<AiBrainSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /**
   * Calculate the hot score for a lead based on multiple factors
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

    // Calculate new hot score
    const hotScore = this.calculateHotScore(updatedLead as Lead);
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

    // Update each lead's hot score
    let updated = 0;
    for (const lead of companyLeads) {
      const hotScore = this.calculateHotScore(lead);
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
}

// Export singleton instance
export const aiBrainService = new AiBrainService();
