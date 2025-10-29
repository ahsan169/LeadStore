/**
 * UCC Intelligence Integration Service
 * Integrates all enhanced UCC components into a unified system
 */

import { db } from "../db";
import { leads, uccFilings } from "@shared/schema";
import type { Lead, UccFiling } from "@shared/schema";
import { eq } from "drizzle-orm";

// Import all enhanced components
import { enhancedUccIntelligenceService } from "./ucc-intelligence-enhanced";
import { uccLeadMatchingService } from "./ucc-lead-matching";
import { uccMonitoringService } from "./ucc-monitoring";
import { uccParser } from "./ucc-parser";
import { leadIntelligenceService } from "./lead-intelligence";

/**
 * Unified UCC Intelligence Result
 */
export interface UnifiedUccResult {
  leadId: string;
  businessIntelligence: any;
  industryPatterns: any;
  advancedPatterns: any;
  predictiveAnalysis: any;
  dashboardData: any;
  relatedLeads: any;
  monitoringEnabled: boolean;
  confidence: number;
  insights: {
    critical: string[];
    opportunities: string[];
    warnings: string[];
    recommendations: string[];
  };
}

/**
 * Unified UCC Intelligence Integration Service
 * Orchestrates all UCC intelligence components
 */
export class UccIntelligenceIntegrationService {
  /**
   * Initialize the UCC intelligence system
   */
  async initialize(): Promise<void> {
    console.log('[UccIntegration] Initializing UCC Intelligence System...');
    
    // Initialize state formats
    await enhancedUccIntelligenceService.initializeStateFormats();
    
    // Start monitoring service
    await uccMonitoringService.startMonitoring();
    
    console.log('[UccIntegration] UCC Intelligence System initialized');
  }
  
  /**
   * Process UCC filing upload with full intelligence analysis
   */
  async processUccFiling(
    fileBuffer: Buffer,
    filename: string,
    leadId?: string,
    options: {
      enableMonitoring?: boolean;
      findRelatedLeads?: boolean;
      updateIntelligenceScore?: boolean;
    } = {}
  ): Promise<UnifiedUccResult> {
    const {
      enableMonitoring = true,
      findRelatedLeads = true,
      updateIntelligenceScore = true
    } = options;
    
    console.log(`[UccIntegration] Processing UCC filing: ${filename}`);
    
    // Step 1: Parse the UCC filing
    const parseResult = await uccParser.parseUccCsv(fileBuffer.toString('utf8'));
    if (!parseResult.success) {
      throw new Error(`Failed to parse UCC filing: ${parseResult.errors.join(', ')}`);
    }
    
    // Step 2: Save parsed filings to database
    const savedFilings: UccFiling[] = [];
    if (leadId) {
      for (const record of parseResult.records) {
        const filing = await db.insert(uccFilings).values({
          leadId,
          debtorName: record.debtorName,
          securedParty: record.securedParty,
          filingDate: record.filingDate,
          fileNumber: record.fileNumber,
          collateralDescription: record.collateralDescription,
          loanAmount: record.loanAmount,
          filingType: record.filingType,
          jurisdiction: record.jurisdiction
        }).returning();
        savedFilings.push(filing[0]);
      }
    }
    
    // Step 3: Run enhanced analysis if we have a lead
    let analysisResult = null;
    if (leadId && savedFilings.length > 0) {
      analysisResult = await enhancedUccIntelligenceService.analyzeUccFilings(leadId, savedFilings);
    }
    
    // Step 4: Find related leads
    let relatedLeads = null;
    if (leadId && findRelatedLeads) {
      relatedLeads = await uccLeadMatchingService.findRelatedLeads(leadId, {
        maxDepth: 2,
        minConfidence: 30,
        includeIndirect: true,
        searchUccData: true
      });
    }
    
    // Step 5: Enable monitoring
    if (leadId && enableMonitoring) {
      await uccMonitoringService.enableMonitoring(leadId, {
        alerts: {
          newFilings: true,
          stackingDetection: true,
          refinancingActivity: true,
          relatedEntities: true,
          riskThresholds: {
            critical: 80,
            high: 60,
            medium: 40
          },
          fraudPatterns: true,
          expansionSignals: true,
          distressSignals: true
        },
        checkFrequency: 'hourly'
      });
    }
    
    // Step 6: Update lead intelligence score
    if (leadId && updateIntelligenceScore && analysisResult) {
      await this.updateLeadIntelligenceWithUcc(leadId, analysisResult);
    }
    
    // Step 7: Generate unified insights
    const insights = this.generateUnifiedInsights(analysisResult, relatedLeads);
    
    return {
      leadId: leadId || '',
      businessIntelligence: analysisResult?.businessIntelligence,
      industryPatterns: analysisResult?.industryPatterns,
      advancedPatterns: analysisResult?.advancedPatterns,
      predictiveAnalysis: analysisResult?.predictiveAnalysis,
      dashboardData: analysisResult?.dashboardData,
      relatedLeads,
      monitoringEnabled: enableMonitoring && !!leadId,
      confidence: analysisResult?.confidence || 0,
      insights
    };
  }
  
  /**
   * Analyze existing lead with UCC intelligence
   */
  async analyzeLead(
    leadId: string,
    options: {
      refreshFilings?: boolean;
      enableMonitoring?: boolean;
      findRelatedLeads?: boolean;
    } = {}
  ): Promise<UnifiedUccResult> {
    const {
      refreshFilings = false,
      enableMonitoring = true,
      findRelatedLeads = true
    } = options;
    
    console.log(`[UccIntegration] Analyzing lead: ${leadId}`);
    
    // Get lead
    const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead[0]) {
      throw new Error('Lead not found');
    }
    
    // Get UCC filings
    const filings = await db.select()
      .from(uccFilings)
      .where(eq(uccFilings.leadId, leadId));
    
    if (filings.length === 0) {
      console.log(`[UccIntegration] No UCC filings found for lead ${leadId}`);
      return {
        leadId,
        businessIntelligence: null,
        industryPatterns: null,
        advancedPatterns: null,
        predictiveAnalysis: null,
        dashboardData: null,
        relatedLeads: null,
        monitoringEnabled: false,
        confidence: 0,
        insights: {
          critical: [],
          opportunities: ['No UCC filings found - consider obtaining UCC data for this lead'],
          warnings: [],
          recommendations: ['Upload UCC filings to enable advanced intelligence']
        }
      };
    }
    
    // Run enhanced analysis
    const analysisResult = await enhancedUccIntelligenceService.analyzeUccFilings(leadId, filings);
    
    // Find related leads
    let relatedLeads = null;
    if (findRelatedLeads) {
      relatedLeads = await uccLeadMatchingService.findRelatedLeads(leadId, {
        maxDepth: 2,
        minConfidence: 30,
        includeIndirect: true,
        searchUccData: true
      });
    }
    
    // Enable monitoring
    if (enableMonitoring) {
      await uccMonitoringService.enableMonitoring(leadId);
    }
    
    // Update lead intelligence
    await this.updateLeadIntelligenceWithUcc(leadId, analysisResult);
    
    // Generate insights
    const insights = this.generateUnifiedInsights(analysisResult, relatedLeads);
    
    return {
      leadId,
      businessIntelligence: analysisResult.businessIntelligence,
      industryPatterns: analysisResult.industryPatterns,
      advancedPatterns: analysisResult.advancedPatterns,
      predictiveAnalysis: analysisResult.predictiveAnalysis,
      dashboardData: analysisResult.dashboardData,
      relatedLeads,
      monitoringEnabled: enableMonitoring,
      confidence: analysisResult.confidence,
      insights
    };
  }
  
  /**
   * Get real-time monitoring status
   */
  async getMonitoringStatus(leadId?: string): Promise<any> {
    if (leadId) {
      // Get monitoring config and recent alerts for specific lead
      const alerts = await db.select()
        .from(uccMonitoringAlerts)
        .where(eq(uccMonitoringAlerts.leadId, leadId))
        .orderBy(desc(uccMonitoringAlerts.createdAt))
        .limit(10);
      
      return {
        leadId,
        monitoringEnabled: true, // Would check actual config
        recentAlerts: alerts,
        summary: await uccMonitoringService.getMonitoringSummary()
      };
    } else {
      // Get overall monitoring summary
      return await uccMonitoringService.getMonitoringSummary();
    }
  }
  
  /**
   * Update lead intelligence with UCC insights
   */
  private async updateLeadIntelligenceWithUcc(
    leadId: string,
    analysisResult: any
  ): Promise<void> {
    try {
      // Get current lead
      const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead[0]) return;
      
      // Calculate UCC-enhanced scores
      const uccRiskAdjustment = Math.round(
        (analysisResult.advancedPatterns.stacking.riskScore * 0.3 +
         analysisResult.predictiveAnalysis.defaultRisk.probability * 100 * 0.4) / 10
      );
      
      const uccOpportunityBoost = Math.round(
        (analysisResult.businessIntelligence.expansionSignals.confidenceScore * 0.3 +
         analysisResult.predictiveAnalysis.consolidation.readinessScore * 0.2) / 10
      );
      
      // Update lead with enhanced scores
      await db.update(leads)
        .set({
          riskSubScore: Math.min(100, Math.max(0, 
            (lead[0].riskSubScore || 50) + uccRiskAdjustment
          )),
          opportunitySubScore: Math.min(100, Math.max(0,
            (lead[0].opportunitySubScore || 50) + uccOpportunityBoost
          )),
          intelligenceMetadata: {
            ...(lead[0].intelligenceMetadata as any || {}),
            uccEnhanced: true,
            uccAnalysisDate: new Date(),
            uccInsights: {
              debtVelocity: analysisResult.businessIntelligence.debtVelocity,
              stackingDetected: analysisResult.advancedPatterns.stacking.detected,
              defaultRisk: analysisResult.predictiveAnalysis.defaultRisk.probability,
              consolidationOpportunity: analysisResult.predictiveAnalysis.consolidation.isCandidate,
              expansionSignals: analysisResult.businessIntelligence.expansionSignals.isExpanding,
              relatedEntities: analysisResult.advancedPatterns.hiddenRelationships.entities.length
            }
          }
        })
        .where(eq(leads.id, leadId));
      
      // Trigger full intelligence recalculation
      await leadIntelligenceService.calculateIntelligenceScore(lead[0], false);
      
      console.log(`[UccIntegration] Updated lead intelligence for ${leadId}`);
    } catch (error) {
      console.error('[UccIntegration] Error updating lead intelligence:', error);
    }
  }
  
  /**
   * Generate unified insights from all analyses
   */
  private generateUnifiedInsights(
    analysisResult: any,
    relatedLeads: any
  ): UnifiedUccResult['insights'] {
    const critical: string[] = [];
    const opportunities: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (!analysisResult) {
      return { critical, opportunities, warnings, recommendations };
    }
    
    // Extract critical insights
    if (analysisResult.advancedPatterns?.stacking?.severity === 'critical') {
      critical.push(
        `CRITICAL: Severe loan stacking detected - ${analysisResult.advancedPatterns.stacking.details}`
      );
    }
    
    if (analysisResult.predictiveAnalysis?.defaultRisk?.probability > 0.7) {
      critical.push(
        `CRITICAL: High default risk (${(analysisResult.predictiveAnalysis.defaultRisk.probability * 100).toFixed(0)}%) within ${analysisResult.predictiveAnalysis.defaultRisk.timeframe} months`
      );
    }
    
    if (analysisResult.advancedPatterns?.fraudIndicators?.suspiciousActivity) {
      critical.push(
        `CRITICAL: Suspicious patterns detected - investigate immediately`
      );
    }
    
    // Extract opportunities
    if (analysisResult.predictiveAnalysis?.consolidation?.isCandidate) {
      opportunities.push(
        `Strong consolidation candidate - potential savings: $${analysisResult.predictiveAnalysis.consolidation.potentialSavings.toLocaleString()}`
      );
    }
    
    if (analysisResult.businessIntelligence?.expansionSignals?.isExpanding) {
      opportunities.push(
        `Business expansion detected (${analysisResult.businessIntelligence.expansionSignals.expansionType}) - offer growth financing`
      );
    }
    
    if (relatedLeads?.matchedLeads?.length > 2) {
      opportunities.push(
        `Portfolio opportunity: ${relatedLeads.matchedLeads.length} related businesses identified`
      );
    }
    
    if (analysisResult.predictiveAnalysis?.nextFinancing?.likelihood > 0.7) {
      opportunities.push(
        `Likely to need financing in ${analysisResult.predictiveAnalysis.nextFinancing.estimatedTimeframe} days (~$${analysisResult.predictiveAnalysis.nextFinancing.estimatedAmount.toLocaleString()})`
      );
    }
    
    // Extract warnings
    if (analysisResult.businessIntelligence?.lenderConcentration?.diversificationRating === 'single-source') {
      warnings.push(
        'Single lender dependency - high concentration risk'
      );
    }
    
    if (analysisResult.businessIntelligence?.paymentBehavior?.hasPaymentIssues) {
      warnings.push(
        `Payment difficulties detected - ${analysisResult.businessIntelligence.paymentBehavior.refinancingPattern} refinancing pattern`
      );
    }
    
    if (analysisResult.advancedPatterns?.lifecycle?.stage === 'distressed') {
      warnings.push(
        'Business in distress stage - requires immediate attention'
      );
    }
    
    // Extract recommendations from dashboard data
    if (analysisResult.dashboardData?.recommendations) {
      analysisResult.dashboardData.recommendations
        .filter((r: any) => r.category === 'immediate')
        .forEach((r: any) => recommendations.push(r.action));
    }
    
    // Industry-specific recommendations
    if (analysisResult.industryPatterns?.insights?.recommendations) {
      analysisResult.industryPatterns.insights.recommendations.forEach((r: string) => 
        recommendations.push(r)
      );
    }
    
    return { critical, opportunities, warnings, recommendations };
  }
  
  /**
   * Generate executive summary report
   */
  async generateExecutiveReport(leadId: string): Promise<string> {
    const result = await this.analyzeLead(leadId);
    
    let report = `# UCC Intelligence Report\n\n`;
    report += `## Executive Summary\n\n`;
    report += `**Lead ID:** ${leadId}\n`;
    report += `**Confidence Score:** ${result.confidence}%\n`;
    report += `**Monitoring Status:** ${result.monitoringEnabled ? 'Active' : 'Inactive'}\n\n`;
    
    // Critical Issues
    if (result.insights.critical.length > 0) {
      report += `### ⚠️ Critical Issues\n\n`;
      result.insights.critical.forEach(issue => {
        report += `- ${issue}\n`;
      });
      report += `\n`;
    }
    
    // Opportunities
    if (result.insights.opportunities.length > 0) {
      report += `### 💰 Opportunities\n\n`;
      result.insights.opportunities.forEach(opp => {
        report += `- ${opp}\n`;
      });
      report += `\n`;
    }
    
    // Key Metrics
    if (result.businessIntelligence) {
      report += `### 📊 Key Metrics\n\n`;
      report += `- **Debt Velocity:** ${result.businessIntelligence.debtVelocity.filingsPerMonth.toFixed(1)} filings/month (${result.businessIntelligence.debtVelocity.trend})\n`;
      report += `- **Lender Concentration:** ${result.businessIntelligence.lenderConcentration.numberOfLenders} lenders (${result.businessIntelligence.lenderConcentration.diversificationRating})\n`;
      report += `- **Collateral Quality:** ${result.businessIntelligence.collateralQuality.overallScore}/100\n`;
      report += `- **Expansion Signals:** ${result.businessIntelligence.expansionSignals.isExpanding ? 'Yes' : 'No'}\n\n`;
    }
    
    // Predictions
    if (result.predictiveAnalysis) {
      report += `### 🔮 Predictions\n\n`;
      report += `- **Default Risk:** ${(result.predictiveAnalysis.defaultRisk.probability * 100).toFixed(1)}% in ${result.predictiveAnalysis.defaultRisk.timeframe} months\n`;
      report += `- **Next Financing:** ${(result.predictiveAnalysis.nextFinancing.likelihood * 100).toFixed(0)}% chance in ${result.predictiveAnalysis.nextFinancing.estimatedTimeframe} days\n`;
      report += `- **Consolidation Ready:** ${result.predictiveAnalysis.consolidation.isCandidate ? 'Yes' : 'No'}\n\n`;
    }
    
    // Related Entities
    if (result.relatedLeads?.matchedLeads?.length > 0) {
      report += `### 🔗 Related Entities\n\n`;
      report += `Found ${result.relatedLeads.matchedLeads.length} related businesses:\n`;
      result.relatedLeads.matchedLeads.slice(0, 5).forEach((match: any) => {
        report += `- ${match.lead.businessName} (${match.overallConfidence}% match)\n`;
      });
      report += `\n`;
    }
    
    // Recommendations
    if (result.insights.recommendations.length > 0) {
      report += `### 📋 Recommendations\n\n`;
      result.insights.recommendations.forEach(rec => {
        report += `1. ${rec}\n`;
      });
    }
    
    return report;
  }
}

// Export singleton instance
export const uccIntelligenceIntegration = new UccIntelligenceIntegrationService();

// Also export table references that might be missing
import { pgTable, text, varchar, timestamp, boolean, jsonb, decimal, integer } from "drizzle-orm/pg-core";
import { sql, desc } from "drizzle-orm";

// Add missing UCC-related tables
export const uccIntelligence = pgTable("ucc_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull().unique(),
  analysisType: text("analysis_type").notNull(), // 'basic' or 'enhanced_comprehensive'
  businessIntelligence: jsonb("business_intelligence"),
  industryInsights: jsonb("industry_insights"),
  riskIndicators: jsonb("risk_indicators"),
  actionableInsights: jsonb("actionable_insights"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
});

export const uccRelationships = pgTable("ucc_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId1: varchar("lead_id_1").references(() => leads.id).notNull(),
  leadId2: varchar("lead_id_2").references(() => leads.id).notNull(),
  relationshipType: text("relationship_type").notNull(), // 'owner', 'subsidiary', 'partner', etc.
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  metadata: jsonb("metadata"),
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
});

export const uccMonitoringAlerts = pgTable("ucc_monitoring_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  alertType: text("alert_type").notNull(),
  severity: text("severity").notNull(), // 'info', 'warning', 'critical'
  title: text("title").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  actionRequired: text("action_required"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const uccStateFormats = pgTable("ucc_state_formats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateCode: text("state_code").notNull().unique(),
  stateName: text("state_name").notNull(),
  formatVersion: text("format_version").notNull(),
  columnMappings: jsonb("column_mappings").notNull(),
  dateFormat: text("date_format"),
  filingNumberPattern: text("filing_number_pattern"),
  hasAdditionalFields: jsonb("has_additional_fields"),
  collateralCodes: jsonb("collateral_codes"),
  filingTypes: jsonb("filing_types"),
  continuationRules: jsonb("continuation_rules"),
  characteristics: jsonb("characteristics"),
  parsingHints: text("parsing_hints").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});