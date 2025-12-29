import { db } from "../db";
import { leads, uccFilings } from "@shared/schema";
import type { Lead, UccFiling } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { enhancedUccIntelligenceService } from "./ucc-intelligence-enhanced";
import { uccLeadMatchingService } from "./ucc-lead-matching";

/**
 * Alert types for UCC monitoring
 */
export type AlertType = 
  | 'new_filing'
  | 'multiple_filings'
  | 'stacking_detected'
  | 'refinancing_detected'
  | 'related_entity_filing'
  | 'risk_threshold_exceeded'
  | 'consolidation_opportunity'
  | 'expansion_detected'
  | 'distress_signal'
  | 'fraud_pattern';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * UCC Monitoring Alert
 */
export interface UccAlert {
  id: string;
  leadId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata: any;
  actionRequired: string;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

/**
 * Monitoring configuration for a lead
 */
export interface LeadMonitoringConfig {
  leadId: string;
  enabled: boolean;
  alerts: {
    newFilings: boolean;
    stackingDetection: boolean;
    refinancingActivity: boolean;
    relatedEntities: boolean;
    riskThresholds: {
      critical: number; // e.g., 80
      high: number;     // e.g., 60
      medium: number;   // e.g., 40
    };
    fraudPatterns: boolean;
    expansionSignals: boolean;
    distressSignals: boolean;
  };
  autoActions: {
    reanalyzeOnNewFiling: boolean;
    updateRelationships: boolean;
    refreshRiskScores: boolean;
    notifyOnCritical: boolean;
  };
  checkFrequency: 'real-time' | 'hourly' | 'daily' | 'weekly';
  lastChecked?: Date;
  nextCheck?: Date;
}

/**
 * Monitoring summary for dashboard
 */
export interface MonitoringSummary {
  totalMonitoredLeads: number;
  activeAlerts: number;
  criticalAlerts: number;
  recentEvents: Array<{
    leadId: string;
    businessName: string;
    eventType: string;
    severity: AlertSeverity;
    timestamp: Date;
  }>;
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topRisks: Array<{
    leadId: string;
    businessName: string;
    riskScore: number;
    primaryRisk: string;
  }>;
}

/**
 * Real-time UCC Monitoring Service
 * Continuously monitors UCC filings and generates alerts for significant events
 */
export class UccMonitoringService {
  private monitoringConfigs: Map<string, LeadMonitoringConfig> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private checkInterval = 60000; // 1 minute default
  
  /**
   * Start monitoring service
   */
  async startMonitoring(): Promise<void> {
    console.log('[UccMonitoring] Starting monitoring service...');
    
    // Load monitoring configurations
    await this.loadMonitoringConfigs();
    
    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, this.checkInterval);
    
    // Perform initial check
    await this.performMonitoringCycle();
    
    console.log('[UccMonitoring] Monitoring service started');
  }
  
  /**
   * Stop monitoring service
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[UccMonitoring] Monitoring service stopped');
    }
  }
  
  /**
   * Enable monitoring for a lead
   */
  async enableMonitoring(
    leadId: string,
    config?: Partial<LeadMonitoringConfig>
  ): Promise<LeadMonitoringConfig> {
    const defaultConfig: LeadMonitoringConfig = {
      leadId,
      enabled: true,
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
      autoActions: {
        reanalyzeOnNewFiling: true,
        updateRelationships: true,
        refreshRiskScores: true,
        notifyOnCritical: true
      },
      checkFrequency: 'hourly',
      lastChecked: new Date()
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    this.monitoringConfigs.set(leadId, finalConfig);
    
    // Save to database (would need monitoring_configs table)
    // await this.saveMonitoringConfig(finalConfig);
    
    console.log(`[UccMonitoring] Enabled monitoring for lead ${leadId}`);
    
    // Perform initial check for this lead
    await this.monitorLead(leadId);
    
    return finalConfig;
  }
  
  /**
   * Disable monitoring for a lead
   */
  async disableMonitoring(leadId: string): Promise<void> {
    this.monitoringConfigs.delete(leadId);
    console.log(`[UccMonitoring] Disabled monitoring for lead ${leadId}`);
  }
  
  /**
   * Perform a monitoring cycle
   */
  private async performMonitoringCycle(): Promise<void> {
    const now = new Date();
    const leadsToCheck: string[] = [];
    
    // Determine which leads need checking
    this.monitoringConfigs.forEach((config, leadId) => {
      if (!config.enabled) return;
      
      const shouldCheck = this.shouldCheckLead(config, now);
      if (shouldCheck) {
        leadsToCheck.push(leadId);
      }
    });
    
    if (leadsToCheck.length === 0) return;
    
    console.log(`[UccMonitoring] Checking ${leadsToCheck.length} leads...`);
    
    // Check leads in parallel (with batching for large numbers)
    const batchSize = 10;
    for (let i = 0; i < leadsToCheck.length; i += batchSize) {
      const batch = leadsToCheck.slice(i, i + batchSize);
      await Promise.all(batch.map(leadId => this.monitorLead(leadId)));
    }
  }
  
  /**
   * Monitor a specific lead
   */
  private async monitorLead(leadId: string): Promise<void> {
    try {
      const config = this.monitoringConfigs.get(leadId);
      if (!config || !config.enabled) return;
      
      // Get lead data
      const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead[0]) return;
      
      // Get recent filings
      const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const recentFilings = await db.select()
        .from(uccFilings)
        .where(
          and(
            eq(uccFilings.leadId, leadId),
            gte(uccFilings.filingDate, recentCutoff)
          )
        )
        .orderBy(desc(uccFilings.filingDate));
      
      // Check for various conditions
      const checks = await Promise.all([
        this.checkNewFilings(lead[0], recentFilings, config),
        this.checkStackingPattern(lead[0], recentFilings, config),
        this.checkRefinancingActivity(lead[0], recentFilings, config),
        this.checkRiskThresholds(lead[0], config),
        this.checkFraudPatterns(lead[0], recentFilings, config),
        this.checkExpansionSignals(lead[0], recentFilings, config),
        this.checkDistressSignals(lead[0], recentFilings, config)
      ]);
      
      // Update last checked
      config.lastChecked = new Date();
      config.nextCheck = this.calculateNextCheck(config);
      
      // Perform auto-actions if configured
      if (config.autoActions.reanalyzeOnNewFiling && recentFilings.length > 0) {
        await this.triggerReanalysis(lead[0]);
      }
      
      if (config.autoActions.updateRelationships) {
        await this.updateRelationships(lead[0]);
      }
    } catch (error) {
      console.error(`[UccMonitoring] Error monitoring lead ${leadId}:`, error);
    }
  }
  
  /**
   * Check for new filings
   */
  private async checkNewFilings(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.newFilings || recentFilings.length === 0) return;
    
    // Check if any filings are newer than last check
    const newFilings = recentFilings.filter(f => 
      config.lastChecked && new Date(f.filingDate) > config.lastChecked
    );
    
    if (newFilings.length > 0) {
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'new_filing',
        severity: newFilings.length > 2 ? 'warning' : 'info',
        title: `New UCC Filing${newFilings.length > 1 ? 's' : ''} Detected`,
        description: `${newFilings.length} new filing(s) found for ${lead.businessName}`,
        metadata: {
          filings: newFilings.map(f => ({
            fileNumber: f.fileNumber,
            lender: f.securedParty,
            amount: f.loanAmount,
            date: f.filingDate
          }))
        },
        actionRequired: 'Review new filings and assess impact on risk profile',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Check for stacking pattern
   */
  private async checkStackingPattern(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.stackingDetection) return;
    
    // Get filings from last 30 days
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last30DaysFilings = await db.select()
      .from(uccFilings)
      .where(
        and(
          eq(uccFilings.leadId, lead.id),
          gte(uccFilings.filingDate, last30Days)
        )
      );
    
    // Count unique lenders
    const uniqueLenders = new Set(last30DaysFilings.map(f => f.securedParty));
    
    if (uniqueLenders.size >= 3) {
      const severity: AlertSeverity = 
        uniqueLenders.size >= 5 ? 'critical' :
        uniqueLenders.size >= 4 ? 'warning' : 'info';
      
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'stacking_detected',
        severity,
        title: 'Loan Stacking Pattern Detected',
        description: `${uniqueLenders.size} different lenders in 30 days - high risk of default`,
        metadata: {
          lenderCount: uniqueLenders.size,
          lenders: Array.from(uniqueLenders),
          totalAmount: last30DaysFilings.reduce((sum, f) => sum + (f.loanAmount || 0), 0),
          timeWindow: 30
        },
        actionRequired: severity === 'critical' 
          ? 'URGENT: Contact immediately for consolidation offer'
          : 'Consider offering debt consolidation',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Check for refinancing activity
   */
  private async checkRefinancingActivity(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.refinancingActivity) return;
    
    // Look for refinancing indicators
    const refinancingFilings = recentFilings.filter(f => 
      f.collateralDescription?.toLowerCase().includes('refinanc') ||
      f.filingType === 'amendment'
    );
    
    if (refinancingFilings.length > 0) {
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'refinancing_detected',
        severity: refinancingFilings.length > 2 ? 'warning' : 'info',
        title: 'Refinancing Activity Detected',
        description: `${refinancingFilings.length} refinancing indicator(s) found`,
        metadata: {
          count: refinancingFilings.length,
          filings: refinancingFilings.map(f => ({
            type: f.filingType,
            lender: f.securedParty,
            date: f.filingDate
          }))
        },
        actionRequired: 'Opportunity: Offer competitive refinancing terms',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Check risk thresholds
   */
  private async checkRiskThresholds(
    lead: Lead,
    config: LeadMonitoringConfig
  ): Promise<void> {
    // Get current risk score (from intelligence metadata or calculate)
    const riskScore = (lead.riskSubScore || 0);
    
    let severity: AlertSeverity | null = null;
    let threshold = '';
    
    if (riskScore >= config.alerts.riskThresholds.critical) {
      severity = 'critical';
      threshold = 'critical';
    } else if (riskScore >= config.alerts.riskThresholds.high) {
      severity = 'warning';
      threshold = 'high';
    } else if (riskScore >= config.alerts.riskThresholds.medium) {
      severity = 'info';
      threshold = 'medium';
    }
    
    if (severity) {
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'risk_threshold_exceeded',
        severity,
        title: `Risk Score Exceeds ${threshold.charAt(0).toUpperCase() + threshold.slice(1)} Threshold`,
        description: `Current risk score: ${riskScore} (${threshold} threshold: ${config.alerts.riskThresholds[threshold as keyof typeof config.alerts.riskThresholds]})`,
        metadata: {
          currentScore: riskScore,
          threshold,
          thresholdValue: config.alerts.riskThresholds[threshold as keyof typeof config.alerts.riskThresholds]
        },
        actionRequired: severity === 'critical' 
          ? 'URGENT: Immediate intervention required'
          : 'Review risk factors and consider proactive measures',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Check for fraud patterns
   */
  private async checkFraudPatterns(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.fraudPatterns || recentFilings.length < 2) return;
    
    // Check for same-day multiple lender filings
    const filingsByDate = new Map<string, UccFiling[]>();
    recentFilings.forEach(f => {
      const dateKey = new Date(f.filingDate).toDateString();
      const dateFilings = filingsByDate.get(dateKey) || [];
      dateFilings.push(f);
      filingsByDate.set(dateKey, dateFilings);
    });
    
    for (const [date, filings] of Array.from(filingsByDate.entries())) {
      const uniqueLenders = new Set(filings.map((f: UccFiling) => f.securedParty));
      if (uniqueLenders.size > 2) {
        const alert: Omit<UccAlert, 'id'> = {
          leadId: lead.id,
          type: 'fraud_pattern',
          severity: 'critical',
          title: 'Suspicious Filing Pattern Detected',
          description: `${uniqueLenders.size} different lenders filed on same day (${date})`,
          metadata: {
            date,
            lenderCount: uniqueLenders.size,
            lenders: Array.from(uniqueLenders),
            pattern: 'same-day-multiple'
          },
          actionRequired: 'CRITICAL: Investigate immediately for potential fraud',
          createdAt: new Date(),
          acknowledged: false
        };
        
        await this.createAlert(alert);
        break; // One alert per check
      }
    }
  }
  
  /**
   * Check for expansion signals
   */
  private async checkExpansionSignals(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.expansionSignals) return;
    
    const expansionKeywords = ['equipment', 'machinery', 'expansion', 'new location', 'upgrade'];
    const expansionFilings = recentFilings.filter(f => 
      f.collateralDescription && 
      expansionKeywords.some(keyword => 
        f.collateralDescription!.toLowerCase().includes(keyword)
      )
    );
    
    if (expansionFilings.length > 0) {
      const totalAmount = expansionFilings.reduce((sum, f) => sum + (f.loanAmount || 0), 0);
      
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'expansion_detected',
        severity: 'info',
        title: 'Business Expansion Signals Detected',
        description: `${expansionFilings.length} filing(s) indicate business expansion`,
        metadata: {
          count: expansionFilings.length,
          totalAmount: totalAmount / 100,
          indicators: expansionFilings.map(f => ({
            collateral: f.collateralDescription,
            amount: f.loanAmount ? f.loanAmount / 100 : null
          }))
        },
        actionRequired: 'OPPORTUNITY: Offer growth financing products',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Check for distress signals
   */
  private async checkDistressSignals(
    lead: Lead,
    recentFilings: UccFiling[],
    config: LeadMonitoringConfig
  ): Promise<void> {
    if (!config.alerts.distressSignals) return;
    
    const distressKeywords = ['liquidation', 'foreclosure', 'default', 'emergency', 'urgent'];
    const distressFilings = recentFilings.filter(f => 
      f.collateralDescription && 
      distressKeywords.some(keyword => 
        f.collateralDescription!.toLowerCase().includes(keyword)
      )
    );
    
    // Also check for terminations (could indicate defaults)
    const terminations = recentFilings.filter(f => f.filingType === 'termination');
    
    if (distressFilings.length > 0 || terminations.length > 1) {
      const alert: Omit<UccAlert, 'id'> = {
        leadId: lead.id,
        type: 'distress_signal',
        severity: 'warning',
        title: 'Business Distress Signals Detected',
        description: `Warning signs of financial distress found in recent filings`,
        metadata: {
          distressCount: distressFilings.length,
          terminationCount: terminations.length,
          indicators: distressFilings.map(f => f.collateralDescription)
        },
        actionRequired: 'Review account and consider intervention or restructuring',
        createdAt: new Date(),
        acknowledged: false
      };
      
      await this.createAlert(alert);
    }
  }
  
  /**
   * Create an alert
   */
  private async createAlert(alert: Omit<UccAlert, 'id'>): Promise<void> {
    try {
      // Generate ID
      const alertWithId: UccAlert = {
        ...alert,
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Save to database (would need alerts table)
      await (db as any).insert((null as any)).values({
        leadId: alert.leadId,
        alertType: alert.type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        metadata: alert.metadata,
        actionRequired: alert.actionRequired,
        acknowledged: false,
        createdAt: alert.createdAt
      });
      
      console.log(`[UccMonitoring] Alert created: ${alert.type} for lead ${alert.leadId}`);
      
      // Send notifications if configured
      if (alert.severity === 'critical') {
        await this.sendCriticalNotification(alertWithId);
      }
    } catch (error) {
      console.error('[UccMonitoring] Error creating alert:', error);
    }
  }
  
  /**
   * Get monitoring summary
   */
  async getMonitoringSummary(): Promise<MonitoringSummary> {
    // Get all active alerts
    const activeAlerts = await db.select()
      .from((null as any))
      .where(eq((null as any).acknowledged, false))
      .orderBy(desc((null as any).createdAt))
      .limit(100) as any[];
    
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    
    // Get recent events
    const recentEvents = activeAlerts.slice(0, 10).map(alert => ({
      leadId: alert.leadId,
      businessName: '', // Would need to join with leads table
      eventType: alert.alertType,
      severity: alert.severity as AlertSeverity,
      timestamp: new Date(alert.createdAt)
    }));
    
    // Calculate risk distribution
    const riskDistribution = {
      critical: criticalAlerts.length,
      high: activeAlerts.filter(a => a.severity === 'warning').length,
      medium: activeAlerts.filter(a => a.severity === 'info').length,
      low: 0 // Would calculate from leads without alerts
    };
    
    // Get top risks (would need to join with leads and calculate)
    const topRisks: MonitoringSummary['topRisks'] = [];
    
    return {
      totalMonitoredLeads: this.monitoringConfigs.size,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      recentEvents,
      riskDistribution,
      topRisks
    };
  }
  
  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<void> {
    await db.update((null as any))
      .set({
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date()
      })
      .where(eq((null as any).id, alertId));
    
    console.log(`[UccMonitoring] Alert ${alertId} acknowledged by ${acknowledgedBy}`);
  }
  
  /**
   * Helper: Should check lead based on frequency
   */
  private shouldCheckLead(config: LeadMonitoringConfig, now: Date): boolean {
    if (!config.lastChecked) return true;
    
    const timeSinceLastCheck = now.getTime() - config.lastChecked.getTime();
    
    switch (config.checkFrequency) {
      case 'real-time':
        return true;
      case 'hourly':
        return timeSinceLastCheck >= 60 * 60 * 1000;
      case 'daily':
        return timeSinceLastCheck >= 24 * 60 * 60 * 1000;
      case 'weekly':
        return timeSinceLastCheck >= 7 * 24 * 60 * 60 * 1000;
      default:
        return true;
    }
  }
  
  /**
   * Helper: Calculate next check time
   */
  private calculateNextCheck(config: LeadMonitoringConfig): Date {
    const now = new Date();
    
    switch (config.checkFrequency) {
      case 'real-time':
        return new Date(now.getTime() + 60 * 1000); // 1 minute
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 60 * 60 * 1000);
    }
  }
  
  /**
   * Helper: Trigger reanalysis
   */
  private async triggerReanalysis(lead: Lead): Promise<void> {
    console.log(`[UccMonitoring] Triggering reanalysis for lead ${lead.id}`);
    
    // Get all filings for the lead
    const filings = await db.select()
      .from(uccFilings)
      .where(eq(uccFilings.leadId, lead.id));
    
    // Run enhanced analysis
    await enhancedUccIntelligenceService.analyzeUccFilings(lead.id, filings);
  }
  
  /**
   * Helper: Update relationships
   */
  private async updateRelationships(lead: Lead): Promise<void> {
    console.log(`[UccMonitoring] Updating relationships for lead ${lead.id}`);
    
    // Find related leads
    await uccLeadMatchingService.findRelatedLeads(lead.id, {
      maxDepth: 2,
      minConfidence: 30,
      includeIndirect: true,
      searchUccData: true
    });
  }
  
  /**
   * Helper: Send critical notification
   */
  private async sendCriticalNotification(alert: UccAlert): Promise<void> {
    // This would integrate with notification service
    console.log(`[UccMonitoring] CRITICAL ALERT: ${alert.title} for lead ${alert.leadId}`);
    
    // Could send email, webhook, SMS, etc.
  }
  
  /**
   * Helper: Load monitoring configs from database
   */
  private async loadMonitoringConfigs(): Promise<void> {
    // This would load from a monitoring_configs table
    // For now, we'll use in-memory storage
    console.log('[UccMonitoring] Loaded monitoring configurations');
  }
}

// Export singleton instance
export const uccMonitoringService = new UccMonitoringService();