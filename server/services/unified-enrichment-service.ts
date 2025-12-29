/**
 * Unified Enrichment Service
 * 
 * This is the single facade for all enrichment operations, consolidating:
 * - AI Decision Engine (strategy planning)
 * - Intelligent Orchestrator (execution)
 * - Queue Management (processing)
 * - Analytics & Monitoring (observability)
 * 
 * This simplifies the previously fragmented enrichment system into one coherent service.
 */

import { db } from '../db';
import { leads } from '@shared/schema';
import { eq, and, isNull, lt, or, desc } from 'drizzle-orm';
import { intelligentEnrichmentOrchestrator } from './intelligent-enrichment-orchestrator';
import { enrichmentQueue } from './enrichment-queue';
import { enrichmentAnalytics } from './enrichment-analytics';
import { enrichmentAuditTrail } from './enrichment-audit-trail';
import { eventBus } from './event-bus';
import { AuditEventType, AuditSeverity } from './enrichment-audit-trail';

export interface EnrichmentStrategy {
  leadId: number;
  priority: 'high' | 'medium' | 'low' | 'skip';
  estimatedCost: number;
  expectedQualityGain: number;
  enrichmentPlan: string[];
  reason: string;
}

export interface EnrichmentResult {
  success: boolean;
  leadId: number;
  fieldsEnriched: string[];
  cost: number;
  duration: number;
  errors?: string[];
}

export class UnifiedEnrichmentService {
  private orchestrator = intelligentEnrichmentOrchestrator;
  private queue = enrichmentQueue;
  private analytics = enrichmentAnalytics;
  private auditTrail = enrichmentAuditTrail;

  constructor() {
    
    console.log('[UnifiedEnrichmentService] Initialized with all components');
  }

  /**
   * STRATEGY PLANNING
   * Analyze a lead and determine enrichment strategy
   */
  async analyzeLeadForEnrichment(leadId: number): Promise<EnrichmentStrategy> {
    try {
      const lead = await db.select().from(leads).where(eq(leads.id, String(leadId))).limit(1);
      if (!lead.length) {
        throw new Error(`Lead ${leadId} not found`);
      }

      const leadData = lead[0];
      
      // Calculate completeness score
      const completeness = this.calculateCompleteness(leadData);
      
      // Determine priority based on completeness and value
      let priority: 'high' | 'medium' | 'low' | 'skip' = 'medium';
      let reason = '';
      
      if (completeness >= 90) {
        priority = 'skip';
        reason = 'Lead is already fully enriched';
      } else if ((leadData.annualRevenue && parseInt(leadData.annualRevenue) > 5000000) || 
                 (leadData.estimatedRevenue && leadData.estimatedRevenue > 5000000)) {
        priority = 'high';
        reason = 'High-revenue lead with enrichment opportunities';
      } else if (completeness < 50) {
        priority = 'high';
        reason = 'Lead has significant data gaps';
      } else if (completeness < 70) {
        priority = 'medium';
        reason = 'Lead has moderate enrichment potential';
      } else {
        priority = 'low';
        reason = 'Lead has minimal enrichment needs';
      }

      // Determine what needs enrichment
      const enrichmentPlan: string[] = [];
      if (!leadData.emailVerificationScore) enrichmentPlan.push('email_verification');
      if (!leadData.phoneVerificationScore) enrichmentPlan.push('phone_verification');
      if (!leadData.annualRevenue && !leadData.estimatedRevenue) enrichmentPlan.push('revenue_estimation');
      if (!leadData.employeeCount) enrichmentPlan.push('employee_count');
      if (!leadData.websiteUrl) enrichmentPlan.push('website_discovery');
      if (!leadData.mcaQualityTier) enrichmentPlan.push('mca_analysis');

      // Estimate cost and quality gain
      const estimatedCost = enrichmentPlan.length * 0.05; // $0.05 per enrichment
      const expectedQualityGain = Math.min(100 - completeness, enrichmentPlan.length * 15);

      const strategy: EnrichmentStrategy = {
        leadId,
        priority,
        estimatedCost,
        expectedQualityGain,
        enrichmentPlan,
        reason
      };

      // Log strategy decision
      await this.auditTrail.log(
        AuditEventType.ENRICHMENT_STARTED,
        'enrichment_strategy_created',
        strategy,
        {
          leadId: String(leadId),
          userId: 'system',
          severity: AuditSeverity.INFO
        }
      );

      return strategy;
    } catch (error) {
      console.error('[UnifiedEnrichmentService] Error analyzing lead:', error);
      throw error;
    }
  }

  /**
   * EXECUTION ENGINE
   * Execute enrichment for a lead based on strategy
   */
  async enrichLead(leadId: number, strategy?: EnrichmentStrategy): Promise<EnrichmentResult> {
    const startTime = Date.now();
    
    try {
      // If no strategy provided, analyze first
      if (!strategy) {
        strategy = await this.analyzeLeadForEnrichment(leadId);
      }

      // Skip if priority is skip
      if (strategy.priority === 'skip') {
        return {
          success: true,
          leadId,
          fieldsEnriched: [],
          cost: 0,
          duration: Date.now() - startTime
        };
      }

      // Execute enrichment via orchestrator
      const result = await this.orchestrator.enrichLead({ id: String(leadId) } as any);
      
      // Determine success based on result
      const isSuccess = result.errors.length === 0;
      const enrichedFields = Object.keys(result.enrichedLead || {});

      // Emit event for other systems
      eventBus.emit('lead:enrichment-complete', {
        leadId,
        success: isSuccess,
        fieldsEnriched: enrichedFields
      });

      return {
        success: isSuccess,
        leadId,
        fieldsEnriched: enrichedFields,
        cost: strategy.estimatedCost,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('[UnifiedEnrichmentService] Error enriching lead:', error);

      return {
        success: false,
        leadId,
        fieldsEnriched: [],
        cost: 0,
        duration: Date.now() - startTime,
        errors: [error.message]
      };
    }
  }

  /**
   * QUEUE MANAGEMENT
   * Queue leads for enrichment based on priority
   */
  async queueLeadForEnrichment(leadId: number, priority?: 'high' | 'medium' | 'low'): Promise<void> {
    try {
      const strategy = await this.analyzeLeadForEnrichment(leadId);
      
      if (strategy.priority === 'skip') {
        console.log(`[UnifiedEnrichmentService] Skipping lead ${leadId} - already enriched`);
        return;
      }

      await this.queue.addToQueue(
        { id: String(leadId) } as any,
        priority || strategy.priority,
        'manual',
        {
          enrichmentOptions: {
            strategy: strategy as any,
            attemptNumber: 1
          } as any
        }
      );

      console.log(`[UnifiedEnrichmentService] Queued lead ${leadId} with ${priority || strategy.priority} priority`);
    } catch (error) {
      console.error('[UnifiedEnrichmentService] Error queueing lead:', error);
      throw error;
    }
  }

  /**
   * BULK OPERATIONS
   * Analyze and enrich multiple leads
   */
  async bulkEnrichHighPriority(): Promise<{ queued: number; skipped: number }> {
    try {
      // Get leads that need enrichment (low quality score, missing data)
      const leadsToEnrich = await db.select()
        .from(leads)
        .where(
          and(
            or(
              lt(leads.qualityScore, 70),
              isNull(leads.emailVerificationScore),
              isNull(leads.phoneVerificationScore)
            )
          )
        )
        .orderBy(desc(leads.annualRevenue))
        .limit(50);

      let queued = 0;
      let skipped = 0;

      for (const lead of leadsToEnrich) {
        const leadIdNum = parseInt(lead.id, 10) || 0;
        const strategy = await this.analyzeLeadForEnrichment(leadIdNum);
        
        if (strategy.priority === 'high' || strategy.priority === 'medium') {
          await this.queueLeadForEnrichment(leadIdNum, strategy.priority);
          queued++;
        } else {
          skipped++;
        }
      }

      console.log(`[UnifiedEnrichmentService] Bulk enrichment: ${queued} queued, ${skipped} skipped`);
      return { queued, skipped };
    } catch (error) {
      console.error('[UnifiedEnrichmentService] Error in bulk enrichment:', error);
      throw error;
    }
  }

  /**
   * OBSERVABILITY
   * Get enrichment statistics and monitoring data
   */
  async getEnrichmentStats() {
    try {
      const metrics = await this.analytics.getEnrichmentMetrics('day');
      const queueStats = this.queue.getStats();
      
      return {
        totalEnriched: metrics.totalEnrichments || 0,
        successRate: metrics.successRate || 0,
        inQueue: queueStats.pending || 0,
        processing: queueStats.processing || 0,
        costSaved: metrics.totalCost || 0,
        avgEnrichmentTime: metrics.averageProcessingTime || 0
      };
    } catch (error) {
      console.error('[UnifiedEnrichmentService] Error getting enrichment stats:', error);
      // Return default values if there's an error
      return {
        totalEnriched: 0,
        successRate: 0,
        inQueue: 0,
        processing: 0,
        costSaved: 0,
        avgEnrichmentTime: 0
      };
    }
  }

  async getRecentJobs(limit: number = 20) {
    // Return empty array as getRecentJobs is not available on enrichmentQueue
    return [];
  }

  /**
   * HELPER METHODS
   */
  private calculateCompleteness(lead: any): number {
    const fields = [
      'businessName', 'ownerName', 'email', 'phone',
      'fullAddress', 'city', 'stateCode',
      'websiteUrl', 'annualRevenue', 'estimatedRevenue', 'employeeCount', 'industry',
      'emailVerificationScore', 'phoneVerificationScore',
      'mcaQualityTier', 'totalUccDebt', 'dataCompletenessScore'
    ];

    const filledFields = fields.filter(field => 
      lead[field] !== null && lead[field] !== undefined && lead[field] !== ''
    );

    return Math.round((filledFields.length / fields.length) * 100);
  }
}

// Export singleton instance
export const unifiedEnrichmentService = new UnifiedEnrichmentService();
