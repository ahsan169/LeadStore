import { db } from "../db";
import { leads } from "@shared/schema";
import type { Lead } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface LeadInsight {
  type: 'high_revenue' | 'verified_contact' | 'low_debt_risk' | 'recently_updated' | 
        'high_urgency' | 'established_business' | 'expansion_opportunity' | 
        'quick_close' | 'large_deal_size' | 'repeat_customer' | 'fresh_lead' |
        'premium_location' | 'strong_credit' | 'data_complete';
  label: string;
  description: string;
  icon: string; // Icon name for UI
  color: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
  priority: number; // 1-10, higher = more important
}

export interface InsightsResult {
  leadId: string;
  insights: LeadInsight[];
  topInsights: LeadInsight[]; // Top 2-3 most important insights
  tags: string[]; // Quick tags for filtering
  summary: string; // One-line summary
}

export class PracticalInsightsEngine {
  /**
   * Generate actionable insights for a lead
   */
  async generateInsights(lead: Lead): Promise<InsightsResult> {
    const insights: LeadInsight[] = [];

    // Check for high revenue potential
    if (lead.annualRevenue) {
      const revenue = this.parseRevenue(lead.annualRevenue);
      if (revenue > 5000000) {
        insights.push({
          type: 'high_revenue',
          label: 'High Revenue',
          description: `Annual revenue over $${(revenue / 1000000).toFixed(1)}M`,
          icon: 'dollar-sign',
          color: 'green',
          priority: 9
        });
      }
    }

    // Check for estimated revenue (from enrichment)
    if (lead.estimatedRevenue && lead.estimatedRevenue > 5000000) {
      insights.push({
        type: 'high_revenue',
        label: 'High Revenue Potential',
        description: `Estimated revenue over $${(lead.estimatedRevenue / 1000000).toFixed(1)}M`,
        icon: 'trending-up',
        color: 'green',
        priority: 8
      });
    }

    // Check for verified contact info
    if (lead.overallVerificationScore && lead.overallVerificationScore >= 80) {
      insights.push({
        type: 'verified_contact',
        label: 'Verified Contact',
        description: 'All contact information verified',
        icon: 'check-circle',
        color: 'green',
        priority: 8
      });
    } else if (lead.emailVerificationScore && lead.emailVerificationScore >= 80 && 
               lead.phoneVerificationScore && lead.phoneVerificationScore >= 80) {
      insights.push({
        type: 'verified_contact',
        label: 'Verified Contact',
        description: 'Email and phone verified',
        icon: 'check-circle',
        color: 'blue',
        priority: 7
      });
    }

    // Check for low debt risk
    if (lead.uccRiskLevel === 'low' || (lead.activeUccCount === 0)) {
      insights.push({
        type: 'low_debt_risk',
        label: 'Low Debt Risk',
        description: lead.activeUccCount === 0 ? 'No active UCC filings' : 'Low UCC risk level',
        icon: 'shield-check',
        color: 'green',
        priority: 7
      });
    }

    // Check if recently updated
    if (lead.updatedAt) {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceUpdate <= 7) {
        insights.push({
          type: 'recently_updated',
          label: 'Recently Updated',
          description: `Updated ${daysSinceUpdate === 0 ? 'today' : `${daysSinceUpdate} day${daysSinceUpdate === 1 ? '' : 's'} ago`}`,
          icon: 'clock',
          color: 'blue',
          priority: 6
        });
      }
    }

    // Check for high urgency
    if (lead.urgencyLevel === 'immediate' || lead.urgencyLevel === 'this_week') {
      insights.push({
        type: 'high_urgency',
        label: 'High Urgency',
        description: lead.urgencyLevel === 'immediate' ? 'Needs funding immediately' : 'Needs funding this week',
        icon: 'zap',
        color: 'yellow',
        priority: 10
      });
    }

    // Check for established business
    if (lead.timeInBusiness) {
      const years = this.parseTimeInBusiness(lead.timeInBusiness);
      if (years >= 5) {
        insights.push({
          type: 'established_business',
          label: 'Established Business',
          description: `${years}+ years in business`,
          icon: 'building',
          color: 'blue',
          priority: 6
        });
      }
    }

    // Check for expansion opportunity
    if (lead.businessMaturity === 'growing' || 
        (lead.employeeCount && lead.employeeCount > 50)) {
      insights.push({
        type: 'expansion_opportunity',
        label: 'Expansion Opportunity',
        description: 'Business showing growth signals',
        icon: 'trending-up',
        color: 'purple',
        priority: 7
      });
    }

    // Check for quick close potential
    if (lead.conversionProbability && Number(lead.conversionProbability) > 0.7) {
      insights.push({
        type: 'quick_close',
        label: 'Quick Close',
        description: `${Math.round(Number(lead.conversionProbability) * 100)}% conversion probability`,
        icon: 'target',
        color: 'green',
        priority: 9
      });
    }

    // Check for large deal size
    if (lead.requestedAmount) {
      const amount = this.parseAmount(lead.requestedAmount);
      if (amount >= 100000) {
        insights.push({
          type: 'large_deal_size',
          label: 'Large Deal',
          description: `Requesting $${(amount / 1000).toFixed(0)}K`,
          icon: 'dollar-sign',
          color: 'purple',
          priority: 8
        });
      }
    }

    // Check for repeat customer potential
    if (lead.previousMCAHistory === 'previous_paid' || lead.previousMCAHistory === 'multiple') {
      insights.push({
        type: 'repeat_customer',
        label: 'Repeat Customer',
        description: 'Has successfully paid previous MCA',
        icon: 'refresh-cw',
        color: 'green',
        priority: 7
      });
    }

    // Check for fresh lead
    if (lead.freshnessScore && lead.freshnessScore >= 90) {
      insights.push({
        type: 'fresh_lead',
        label: 'Fresh Lead',
        description: 'Brand new lead',
        icon: 'sparkles',
        color: 'blue',
        priority: 8
      });
    } else if (lead.leadAge !== null && lead.leadAge <= 3) {
      insights.push({
        type: 'fresh_lead',
        label: 'Fresh Lead',
        description: `Only ${lead.leadAge} day${lead.leadAge === 1 ? '' : 's'} old`,
        icon: 'sparkles',
        color: 'blue',
        priority: 7
      });
    }

    // Check for premium location
    const premiumStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
    if (lead.stateCode && premiumStates.includes(lead.stateCode)) {
      insights.push({
        type: 'premium_location',
        label: 'Premium Location',
        description: `Located in ${lead.stateCode}`,
        icon: 'map-pin',
        color: 'blue',
        priority: 5
      });
    }

    // Check for strong credit
    if (lead.creditScore) {
      const creditScore = this.parseCreditScore(lead.creditScore);
      if (creditScore >= 700) {
        insights.push({
          type: 'strong_credit',
          label: 'Strong Credit',
          description: `Credit score: ${creditScore}+`,
          icon: 'award',
          color: 'green',
          priority: 8
        });
      }
    }

    // Check for data completeness
    if (lead.dataCompletenessScore && lead.dataCompletenessScore >= 80) {
      insights.push({
        type: 'data_complete',
        label: 'Complete Data',
        description: `${lead.dataCompletenessScore}% data completeness`,
        icon: 'check-square',
        color: 'blue',
        priority: 5
      });
    }

    // Sort insights by priority
    insights.sort((a, b) => b.priority - a.priority);

    // Get top 3 insights
    const topInsights = insights.slice(0, 3);

    // Generate tags
    const tags = this.generateTags(lead, insights);

    // Generate summary
    const summary = this.generateSummary(lead, topInsights);

    return {
      leadId: lead.id,
      insights,
      topInsights,
      tags,
      summary
    };
  }

  /**
   * Generate tags for quick filtering
   */
  private generateTags(lead: Lead, insights: LeadInsight[]): string[] {
    const tags: string[] = [];

    // Add score-based tags
    if (lead.unifiedLeadScore) {
      if (lead.unifiedLeadScore >= 80) tags.push('excellent');
      else if (lead.unifiedLeadScore >= 60) tags.push('good');
      else if (lead.unifiedLeadScore >= 40) tags.push('fair');
      else tags.push('poor');
    }

    // Add insight-based tags
    insights.forEach(insight => {
      switch (insight.type) {
        case 'high_revenue':
          tags.push('high-value');
          break;
        case 'verified_contact':
          tags.push('verified');
          break;
        case 'low_debt_risk':
          tags.push('low-risk');
          break;
        case 'high_urgency':
          tags.push('urgent');
          break;
        case 'established_business':
          tags.push('established');
          break;
        case 'quick_close':
          tags.push('hot-lead');
          break;
        case 'fresh_lead':
          tags.push('new');
          break;
      }
    });

    // Add industry tag if available
    if (lead.industry) {
      tags.push(lead.industry.toLowerCase());
    }

    // Add state tag if available
    if (lead.stateCode) {
      tags.push(lead.stateCode.toLowerCase());
    }

    // Add urgency tag
    if (lead.urgencyLevel) {
      tags.push(lead.urgencyLevel);
    }

    // Remove duplicates
    return Array.from(new Set(tags));
  }

  /**
   * Generate a one-line summary
   */
  private generateSummary(lead: Lead, topInsights: LeadInsight[]): string {
    if (topInsights.length === 0) {
      return 'Standard lead requiring further qualification';
    }

    const parts: string[] = [];

    // Add business name if available
    if (lead.businessName) {
      parts.push(lead.businessName);
    }

    // Add top insight descriptions
    if (topInsights.length > 0) {
      const insightLabels = topInsights.slice(0, 2).map(i => i.label.toLowerCase());
      parts.push(`with ${insightLabels.join(' and ')}`);
    }

    // Add location if available
    if (lead.stateCode) {
      parts.push(`in ${lead.stateCode}`);
    }

    return parts.join(' ') || 'Lead with potential opportunity';
  }

  /**
   * Parse revenue from string
   */
  private parseRevenue(revenue: string): number {
    const cleaned = revenue.replace(/[^0-9.]/g, '');
    const value = parseFloat(cleaned);
    
    if (revenue.toLowerCase().includes('k')) {
      return value * 1000;
    }
    if (revenue.toLowerCase().includes('m')) {
      return value * 1000000;
    }
    
    return value || 0;
  }

  /**
   * Parse amount from string
   */
  private parseAmount(amount: string): number {
    const cleaned = amount.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Parse time in business
   */
  private parseTimeInBusiness(timeStr: string): number {
    const match = timeStr.match(/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
    return 0;
  }

  /**
   * Parse credit score
   */
  private parseCreditScore(creditStr: string): number {
    const match = creditStr.match(/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
    return 0;
  }

  /**
   * Update lead with insights
   */
  async updateLeadInsights(leadId: string): Promise<Lead | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return null;

    const insightsResult = await this.generateInsights(lead);

    // Update lead with insights
    const [updated] = await db
      .update(leads)
      .set({
        leadInsights: insightsResult.insights,
        insightTags: insightsResult.tags,
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    return updated;
  }

  /**
   * Batch update insights for multiple leads
   */
  async batchUpdateInsights(leadIds: string[]): Promise<void> {
    for (const leadId of leadIds) {
      await this.updateLeadInsights(leadId);
    }
  }

  /**
   * Get insight statistics for analytics
   */
  async getInsightStatistics(leadIds: string[]): Promise<{
    totalLeads: number;
    insightCounts: Record<string, number>;
    topInsightTypes: Array<{ type: string; count: number; percentage: number }>;
    averageInsightsPerLead: number;
  }> {
    const leadList = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadIds[0])); // TODO: Use proper IN clause

    const insightCounts: Record<string, number> = {};
    let totalInsights = 0;

    for (const lead of leadList) {
      if (lead.leadInsights && Array.isArray(lead.leadInsights)) {
        const insights = lead.leadInsights as LeadInsight[];
        totalInsights += insights.length;
        
        insights.forEach(insight => {
          insightCounts[insight.type] = (insightCounts[insight.type] || 0) + 1;
        });
      }
    }

    // Convert to sorted array
    const topInsightTypes = Object.entries(insightCounts)
      .map(([type, count]) => ({
        type,
        count,
        percentage: leadList.length > 0 ? Math.round((count / leadList.length) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalLeads: leadList.length,
      insightCounts,
      topInsightTypes,
      averageInsightsPerLead: leadList.length > 0 ? totalInsights / leadList.length : 0
    };
  }
}

export const practicalInsightsEngine = new PracticalInsightsEngine();