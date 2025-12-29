import { storage } from "../storage";
import { db } from "../db";
import { leads, alertHistory } from "@shared/schema";
import { and, gte, lte, inArray, sql, or, eq } from "drizzle-orm";
import { sendAlertNotification } from "../email";
import type { Lead, LeadAlert, LeadBatch } from "@shared/schema";
import { WebSocket } from "ws";

export interface AlertCriteria {
  industries?: string[];
  states?: string[];
  minRevenue?: number;
  maxRevenue?: number;
  minQuality?: number;
  maxQuality?: number;
  minTimeInBusiness?: number;
  minCreditScore?: number;
  maxCreditScore?: number;
  exclusivityStatus?: string[];
  previousMCAHistory?: string[];
  urgencyLevel?: string[];
}

// WebSocket clients for real-time notifications
const alertClients = new Map<string, WebSocket>();

export function addAlertClient(userId: string, ws: WebSocket) {
  alertClients.set(userId, ws);
  
  ws.on("close", () => {
    alertClients.delete(userId);
  });
  
  ws.on("error", () => {
    alertClients.delete(userId);
  });
}

export function sendRealTimeAlert(userId: string, message: any) {
  const client = alertClients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

export class LeadAlertService {
  /**
   * Check new leads against all active alerts
   */
  async processNewBatch(batchId: string): Promise<void> {
    try {
      // Get the batch details
      const batch = await storage.getLeadBatch(batchId);
      if (!batch) return;
      
      // Get all active alerts
      const activeAlerts = await storage.getActiveAlerts();
      if (!activeAlerts.length) return;
      
      // Get all leads from this batch
      const batchLeads = await storage.getLeadsByBatchId(batchId);
      if (!batchLeads.length) return;
      
      console.log(`Processing batch ${batchId} with ${batchLeads.length} leads against ${activeAlerts.length} active alerts`);
      
      // Process each alert
      for (const alert of activeAlerts) {
        await this.processAlertForBatch(alert, batch, batchLeads);
      }
    } catch (error) {
      console.error("Error processing batch for alerts:", error);
    }
  }
  
  /**
   * Process a single alert against a batch of leads
   */
  private async processAlertForBatch(alert: LeadAlert, batch: LeadBatch, batchLeads: Lead[]): Promise<void> {
    try {
      const criteria = alert.criteria as AlertCriteria;
      
      // Match leads against criteria
      const matchedLeads = this.matchLeadsWithCriteria(batchLeads, criteria);
      
      if (matchedLeads.length === 0) {
        return; // No matches
      }
      
      console.log(`Alert ${alert.alertName} matched ${matchedLeads.length} leads from batch ${batch.id}`);
      
      // Create alert history record
      const alertHistory = await storage.createAlertHistory({
        alertId: alert.id,
        leadBatchId: batch.id,
        matchedLeads: matchedLeads.length,
        leadIds: matchedLeads.map(l => l.id),
        notificationSent: false,
      });
      
      // Update last triggered timestamp
      await storage.updateLeadAlert(alert.id, {
        lastTriggeredAt: new Date(),
      } as any);
      
      // Send notifications
      await this.sendNotifications(alert, alertHistory, matchedLeads);
      
      // Update notification status
      await storage.updateAlertHistory(alertHistory.id, {
        notificationSent: true,
      });
    } catch (error) {
      console.error(`Error processing alert ${alert.id}:`, error);
    }
  }
  
  /**
   * Match leads against alert criteria
   */
  private matchLeadsWithCriteria(leads: Lead[], criteria: AlertCriteria): Lead[] {
    return leads.filter(lead => {
      // Check industry
      if (criteria.industries?.length && lead.industry) {
        if (!criteria.industries.includes(lead.industry)) {
          return false;
        }
      }
      
      // Check state
      if (criteria.states?.length && lead.stateCode) {
        if (!criteria.states.includes(lead.stateCode)) {
          return false;
        }
      }
      
      // Check revenue range
      if (criteria.minRevenue || criteria.maxRevenue) {
        const revenue = parseFloat(lead.annualRevenue || "0");
        if (criteria.minRevenue && revenue < criteria.minRevenue) {
          return false;
        }
        if (criteria.maxRevenue && revenue > criteria.maxRevenue) {
          return false;
        }
      }
      
      // Check quality score
      if (criteria.minQuality !== undefined || criteria.maxQuality !== undefined) {
        if (criteria.minQuality !== undefined && lead.qualityScore < criteria.minQuality) {
          return false;
        }
        if (criteria.maxQuality !== undefined && lead.qualityScore > criteria.maxQuality) {
          return false;
        }
      }
      
      // Check time in business
      if (criteria.minTimeInBusiness) {
        const timeInBusiness = parseFloat(lead.timeInBusiness || "0");
        if (timeInBusiness < criteria.minTimeInBusiness) {
          return false;
        }
      }
      
      // Check credit score
      if (criteria.minCreditScore || criteria.maxCreditScore) {
        const creditScore = parseInt(lead.creditScore || "0");
        if (criteria.minCreditScore && creditScore < criteria.minCreditScore) {
          return false;
        }
        if (criteria.maxCreditScore && creditScore > criteria.maxCreditScore) {
          return false;
        }
      }
      
      // Check exclusivity status
      if (criteria.exclusivityStatus?.length && lead.exclusivityStatus) {
        if (!criteria.exclusivityStatus.includes(lead.exclusivityStatus)) {
          return false;
        }
      }
      
      // Check MCA history
      if (criteria.previousMCAHistory?.length && lead.previousMCAHistory) {
        if (!criteria.previousMCAHistory.includes(lead.previousMCAHistory)) {
          return false;
        }
      }
      
      // Check urgency level
      if (criteria.urgencyLevel?.length && lead.urgencyLevel) {
        if (!criteria.urgencyLevel.includes(lead.urgencyLevel)) {
          return false;
        }
      }
      
      return true; // Lead matches all criteria
    });
  }
  
  /**
   * Send notifications for matched leads
   */
  private async sendNotifications(alert: LeadAlert, history: any, matchedLeads: Lead[]): Promise<void> {
    // Get user details
    const user = await storage.getUser(alert.userId);
    if (!user) return;
    
    // Send real-time WebSocket notification
    sendRealTimeAlert(alert.userId, {
      type: "alert_triggered",
      alertId: alert.id,
      alertName: alert.alertName,
      matchedCount: matchedLeads.length,
      historyId: history.id,
      timestamp: new Date(),
    });
    
    // Send email notification if enabled
    if (alert.emailNotifications) {
      const sampleLeads = matchedLeads.slice(0, 5); // First 5 leads as preview
      await sendAlertNotification(user.email, {
        alertName: alert.alertName,
        matchedCount: matchedLeads.length,
        sampleLeads: sampleLeads.map(l => ({
          businessName: l.businessName,
          industry: l.industry || "N/A",
          state: l.stateCode || "N/A",
          revenue: l.annualRevenue || "N/A",
          qualityScore: l.qualityScore,
        })),
        viewUrl: `${process.env.APP_URL}/alerts/${alert.id}/history`,
      });
    }
  }
  
  /**
   * Test an alert against existing leads
   */
  async testAlert(alertId: string, limit: number = 10): Promise<{ count: number; sampleLeads: Lead[] }> {
    const alert = await storage.getLeadAlert(alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }
    
    const criteria = alert.criteria as AlertCriteria;
    
    // Build query conditions
    const conditions: any[] = [];
    
    if (criteria.industries?.length) {
      conditions.push(inArray(leads.industry, criteria.industries));
    }
    
    if (criteria.states?.length) {
      conditions.push(inArray(leads.stateCode, criteria.states));
    }
    
    if (criteria.minQuality !== undefined) {
      conditions.push(gte(leads.qualityScore, criteria.minQuality));
    }
    
    if (criteria.maxQuality !== undefined) {
      conditions.push(lte(leads.qualityScore, criteria.maxQuality));
    }
    
    if (criteria.exclusivityStatus?.length) {
      conditions.push(inArray(leads.exclusivityStatus, criteria.exclusivityStatus));
    }
    
    if (criteria.previousMCAHistory?.length) {
      conditions.push(inArray(leads.previousMCAHistory, criteria.previousMCAHistory));
    }
    
    if (criteria.urgencyLevel?.length) {
      conditions.push(inArray(leads.urgencyLevel, criteria.urgencyLevel));
    }
    
    // Add condition to only check unsold leads
    conditions.push(sql`${leads.sold} = false`);
    
    // Execute query with conditions
    const query = conditions.length > 0
      ? db.select().from(leads).where(and(...conditions))
      : db.select().from(leads).where(sql`${leads.sold} = false`);
    
    const allMatches = await query;
    const sampleLeads = allMatches.slice(0, limit);
    
    return {
      count: allMatches.length,
      sampleLeads,
    };
  }
  
  /**
   * Get alert statistics
   */
  async getAlertStats(alertId: string): Promise<{
    totalTriggers: number;
    totalMatches: number;
    avgMatchesPerTrigger: number;
    lastTriggered?: Date;
  }> {
    const alert = await storage.getLeadAlert(alertId);
    if (!alert) {
      throw new Error("Alert not found");
    }
    
    const history = await storage.getAlertHistoryByAlertId(alertId);
    
    const totalTriggers = history.length;
    const totalMatches = history.reduce((sum, h) => sum + h.matchedLeads, 0);
    const avgMatchesPerTrigger = totalTriggers > 0 ? totalMatches / totalTriggers : 0;
    
    return {
      totalTriggers,
      totalMatches,
      avgMatchesPerTrigger,
      lastTriggered: alert.lastTriggeredAt || undefined,
    };
  }
}

// Export singleton instance
export const leadAlertService = new LeadAlertService();

// Helper to update alert history in storage (add this to storage interface if missing)
declare module "../storage" {
  interface IStorage {
    updateAlertHistory(id: string, data: Partial<any>): Promise<any>;
  }
}

// Implement the missing method in storage
(storage as any).updateAlertHistory = async function(id: string, data: any) {
  const result = await db.update(alertHistory).set(data).where(eq(alertHistory.id, id)).returning();
  return result[0];
};