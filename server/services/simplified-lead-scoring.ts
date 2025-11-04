import { db } from "../db";
import { leads } from "@shared/schema";
import type { Lead } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface LeadScoreBreakdown {
  dataCompleteness: number; // 0-100
  verificationScores: number; // 0-100
  uccRiskLevel: number; // 0-100
  leadFreshness: number; // 0-100
  weights: {
    dataCompleteness: number;
    verificationScores: number;
    uccRiskLevel: number;
    leadFreshness: number;
  };
}

export interface LeadScoreResult {
  unifiedScore: number; // 0-100
  category: 'excellent' | 'good' | 'fair' | 'poor';
  breakdown: LeadScoreBreakdown;
  color: string;
  description: string;
}

export class SimplifiedLeadScoringService {
  // Default weights for each scoring component (must total 100%)
  private readonly DEFAULT_WEIGHTS = {
    dataCompleteness: 0.30,
    verificationScores: 0.30,
    uccRiskLevel: 0.20,
    leadFreshness: 0.20
  };

  /**
   * Calculate unified lead score based on simple rules
   */
  async calculateLeadScore(lead: Lead, weights = this.DEFAULT_WEIGHTS): Promise<LeadScoreResult> {
    // 1. Calculate data completeness score
    const dataCompletenessScore = this.calculateDataCompleteness(lead);

    // 2. Calculate verification scores average
    const verificationScore = this.calculateVerificationScore(lead);

    // 3. Calculate UCC risk score (inverted - low risk = high score)
    const uccRiskScore = this.calculateUccRiskScore(lead);

    // 4. Calculate freshness score
    const freshnessScore = this.calculateFreshnessScore(lead);

    // Calculate weighted unified score
    const unifiedScore = Math.round(
      dataCompletenessScore * weights.dataCompleteness +
      verificationScore * weights.verificationScores +
      uccRiskScore * weights.uccRiskLevel +
      freshnessScore * weights.leadFreshness
    );

    // Determine category and color
    const category = this.getScoreCategory(unifiedScore);
    const color = this.getScoreColor(unifiedScore);
    const description = this.getScoreDescription(unifiedScore);

    const breakdown: LeadScoreBreakdown = {
      dataCompleteness: dataCompletenessScore,
      verificationScores: verificationScore,
      uccRiskLevel: uccRiskScore,
      leadFreshness: freshnessScore,
      weights: {
        dataCompleteness: weights.dataCompleteness * 100,
        verificationScores: weights.verificationScores * 100,
        uccRiskLevel: weights.uccRiskLevel * 100,
        leadFreshness: weights.leadFreshness * 100
      }
    };

    return {
      unifiedScore,
      category,
      breakdown,
      color,
      description
    };
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataCompleteness(lead: Lead): number {
    const fields = [
      lead.businessName,
      lead.ownerName,
      lead.email,
      lead.phone,
      lead.industry,
      lead.annualRevenue,
      lead.requestedAmount,
      lead.timeInBusiness,
      lead.creditScore,
      lead.stateCode,
      lead.websiteUrl,
      lead.companySize,
      lead.fullAddress,
      lead.city,
      lead.businessDescription
    ];

    // Count non-empty fields
    const filledFields = fields.filter(field => field && field !== '').length;
    const totalFields = fields.length;
    
    // Calculate percentage and convert to 0-100 scale
    return Math.round((filledFields / totalFields) * 100);
  }

  /**
   * Calculate verification score (average of all verification scores)
   */
  private calculateVerificationScore(lead: Lead): number {
    const emailScore = lead.emailVerificationScore || 0;
    const phoneScore = lead.phoneVerificationScore || 0;
    const nameScore = lead.nameVerificationScore || 0;

    // If no verification has been done, return 0
    if (emailScore === 0 && phoneScore === 0 && nameScore === 0) {
      return 0;
    }

    // Calculate average
    return Math.round((emailScore + phoneScore + nameScore) / 3);
  }

  /**
   * Calculate UCC risk score (inverted - low risk = high score)
   */
  private calculateUccRiskScore(lead: Lead): number {
    // If no UCC data, assume medium risk (50% score)
    if (!lead.uccRiskLevel || lead.activeUccCount === 0) {
      return 50;
    }

    // Convert risk level to score
    switch (lead.uccRiskLevel) {
      case 'low':
        return 90; // Low risk = high score
      case 'medium':
        return 50; // Medium risk = medium score
      case 'high':
        return 20; // High risk = low score
      default:
        return 50;
    }
  }

  /**
   * Calculate freshness score based on lead age
   */
  private calculateFreshnessScore(lead: Lead): number {
    // Use existing freshness score if available
    if (lead.freshnessScore !== null && lead.freshnessScore !== undefined) {
      return lead.freshnessScore;
    }

    // Calculate based on lead age
    const leadAge = lead.leadAge || 0;

    if (leadAge <= 1) return 100; // Brand new
    if (leadAge <= 3) return 90;  // Very fresh
    if (leadAge <= 7) return 75;  // Fresh
    if (leadAge <= 14) return 60; // Aging
    if (leadAge <= 30) return 40; // Old
    if (leadAge <= 60) return 20; // Very old
    return 10; // Stale
  }

  /**
   * Get score category based on unified score
   */
  private getScoreCategory(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  /**
   * Get score color based on unified score
   */
  private getScoreColor(score: number): string {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#3b82f6'; // Blue
    if (score >= 40) return '#eab308'; // Yellow
    return '#ef4444'; // Red
  }

  /**
   * Get score description based on unified score
   */
  private getScoreDescription(score: number): string {
    if (score >= 80) return 'Excellent lead with high conversion potential';
    if (score >= 60) return 'Good lead worth pursuing';
    if (score >= 40) return 'Fair lead that needs more qualification';
    return 'Poor lead quality, proceed with caution';
  }

  /**
   * Update lead score in database
   */
  async updateLeadScore(leadId: string): Promise<Lead | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return null;

    const scoreResult = await this.calculateLeadScore(lead);

    // Update lead with new scores
    const [updated] = await db
      .update(leads)
      .set({
        unifiedLeadScore: scoreResult.unifiedScore,
        dataCompletenessScore: scoreResult.breakdown.dataCompleteness,
        leadScoreCategory: scoreResult.category,
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    return updated;
  }

  /**
   * Batch update lead scores
   */
  async batchUpdateLeadScores(leadIds: string[]): Promise<void> {
    for (const leadId of leadIds) {
      await this.updateLeadScore(leadId);
    }
  }

  /**
   * Get score statistics for a batch of leads
   */
  async getScoreStatistics(leadIds: string[]): Promise<{
    averageScore: number;
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  }> {
    const leadList = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadIds[0])); // TODO: Use proper IN clause

    let totalScore = 0;
    let excellent = 0;
    let good = 0;
    let fair = 0;
    let poor = 0;

    for (const lead of leadList) {
      const score = lead.unifiedLeadScore || 0;
      totalScore += score;

      if (score >= 80) excellent++;
      else if (score >= 60) good++;
      else if (score >= 40) fair++;
      else poor++;
    }

    return {
      averageScore: leadList.length > 0 ? Math.round(totalScore / leadList.length) : 0,
      excellent,
      good,
      fair,
      poor
    };
  }
}

export const simplifiedLeadScoringService = new SimplifiedLeadScoringService();