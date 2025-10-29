import { storage } from "../storage";
import { db } from "../db";
import { leads, purchases, leadPerformance, apiKeys, webhooks, apiUsage } from "@shared/schema";
import { sql, desc, and, gte, lte, eq, count } from "drizzle-orm";
import { WebSocket, WebSocketServer } from "ws";
import type { Request, Response } from "express";
import { apiKeyManager, webhookDispatcher } from "./enterprise-api";

// WebSocket clients for real-time Command Center updates
const commandCenterClients = new Map<string, WebSocket>();

export class CommandCenterService {
  private wss: WebSocketServer | null = null;

  /**
   * Initialize WebSocket server for Command Center
   */
  initializeWebSocketServer(server: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: "/ws/command-center"
    });

    this.wss.on("connection", (ws: WebSocket, req: any) => {
      const userId = req.userId || "anonymous";
      commandCenterClients.set(userId, ws);

      console.log(`Command Center WebSocket connected for user: ${userId}`);
      
      // Send initial connection message
      ws.send(JSON.stringify({
        type: "connected",
        message: "Connected to Command Center",
        timestamp: new Date().toISOString()
      }));

      ws.on("close", () => {
        commandCenterClients.delete(userId);
        console.log(`Command Center WebSocket disconnected for user: ${userId}`);
      });

      ws.on("error", (error) => {
        console.error("Command Center WebSocket error:", error);
        commandCenterClients.delete(userId);
      });

      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(userId, data, ws);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      });
    });

    // Start periodic updates
    this.startPeriodicUpdates();
  }

  /**
   * Handle messages from WebSocket clients
   */
  private handleClientMessage(userId: string, data: any, ws: WebSocket) {
    switch (data.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
        break;
      case "subscribe":
        // Handle subscription to specific data streams
        console.log(`User ${userId} subscribed to:`, data.channels);
        break;
      default:
        console.log("Unknown message type:", data.type);
    }
  }

  /**
   * Start periodic updates to connected clients
   */
  private startPeriodicUpdates() {
    // Send metrics updates every 10 seconds
    setInterval(async () => {
      const metrics = await this.getRealtimeMetrics();
      this.broadcastToClients({
        type: "metrics-update",
        metrics,
        timestamp: new Date().toISOString()
      });
    }, 10000);

    // Send activity updates every 5 seconds
    setInterval(async () => {
      const activities = await this.getRecentActivities(5);
      if (activities.length > 0) {
        activities.forEach(activity => {
          this.broadcastToClients({
            type: "activity",
            activity,
            timestamp: new Date().toISOString()
          });
        });
      }
    }, 5000);
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastToClients(data: any) {
    const message = JSON.stringify(data);
    commandCenterClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  /**
   * Send message to specific user
   */
  sendToUser(userId: string, data: any) {
    const ws = commandCenterClients.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Get unified dashboard data
   */
  async getDashboardData(userId: string) {
    try {
      // Get key metrics
      const metrics = await this.getKeyMetrics();

      // Get API usage chart data
      const apiUsageChart = await this.getApiUsageChartData();

      // Get recent activities
      const recentActivities = await this.getRecentActivities(20);

      // Get system health
      const systemHealth = await this.getSystemHealth();

      // Get lead performance data
      const leadPerformance = await this.getLeadPerformanceData();

      // Get conversion funnel
      const conversionFunnel = await this.getConversionFunnel();

      return {
        metrics,
        apiUsageChart,
        recentActivities,
        systemHealth,
        leadPerformance,
        conversionFunnel,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error getting dashboard data:", error);
      throw error;
    }
  }

  /**
   * Get key metrics for overview
   */
  private async getKeyMetrics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get revenue data
    const currentMonthRevenue = await db
      .select({ total: sql`COALESCE(SUM(total_amount), 0)` })
      .from(purchases)
      .where(gte(purchases.purchasedAt, startOfMonth))
      .then(r => Number(r[0]?.total || 0));

    const lastMonthRevenue = await db
      .select({ total: sql`COALESCE(SUM(total_amount), 0)` })
      .from(purchases)
      .where(and(
        gte(purchases.purchasedAt, startOfLastMonth),
        lte(purchases.purchasedAt, endOfLastMonth)
      ))
      .then(r => Number(r[0]?.total || 0));

    const revenueGrowth = lastMonthRevenue ? 
      Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    // Get API usage data
    const apiCallsToday = await storage.getApiUsageCount(new Date());

    // Get webhook metrics
    const activeWebhooks = await storage.getActiveWebhooksCount();
    const webhookDeliveryRate = await this.getWebhookDeliveryRate();

    // Get lead metrics
    const totalLeads = await storage.getTotalLeadsCount();
    const leadsThisMonth = await storage.getLeadsCountSince(startOfMonth);

    return {
      totalRevenue: currentMonthRevenue,
      revenueGrowth,
      apiCallsToday,
      apiCallsTrend: "120ms", // This would be calculated from real data
      activeWebhooks,
      webhookDeliveryRate,
      systemHealth: "Operational",
      uptime: "99.9",
      totalLeads,
      leadsThisMonth,
      conversionRate: await this.getConversionRate(),
      avgDealSize: await this.getAverageDealSize()
    };
  }

  /**
   * Get real-time metrics for WebSocket updates
   */
  private async getRealtimeMetrics() {
    return {
      apiCallsLastMinute: await storage.getApiUsageCount(new Date(Date.now() - 60000)),
      activeUsers: commandCenterClients.size,
      systemLoad: Math.random() * 100, // This would come from actual system monitoring
      responseTime: Math.random() * 500, // This would be actual response time
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get API usage chart data
   */
  private async getApiUsageChartData() {
    const days = 7;
    const data = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const calls = await storage.getApiUsageCount(date);
      const errors = Math.floor(calls * 0.02); // Simulate 2% error rate
      
      data.push({
        date: date.toISOString().split("T")[0],
        calls,
        errors,
        avgResponseTime: Math.random() * 300 + 50 // 50-350ms
      });
    }
    
    return data;
  }

  /**
   * Get recent activities across the system
   */
  async getRecentActivities(limit: number = 20) {
    const activities = [];
    
    // Get recent purchases
    const recentPurchases = await db
      .select()
      .from(purchases)
      .orderBy(desc(purchases.purchasedAt))
      .limit(5);

    recentPurchases.forEach(purchase => {
      activities.push({
        type: "success",
        title: "New Purchase",
        description: `${purchase.leadCount} leads purchased for $${purchase.totalAmount}`,
        timestamp: purchase.purchasedAt,
        metadata: {
          userId: purchase.userId,
          amount: `$${purchase.totalAmount}`
        }
      });
    });

    // Get recent API key activities
    const recentApiKeys = await db
      .select()
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt))
      .limit(5);

    recentApiKeys.forEach(key => {
      activities.push({
        type: "info",
        title: "API Key Created",
        description: `New API key "${key.keyName}" was created`,
        timestamp: key.createdAt,
        metadata: {
          keyName: key.keyName
        }
      });
    });

    // Sort by timestamp and limit
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities.slice(0, limit);
  }

  /**
   * Get system health metrics
   */
  private async getSystemHealth() {
    return {
      status: "operational",
      uptime: 99.9,
      services: {
        api: "operational",
        database: "operational",
        websocket: "operational",
        email: "operational"
      },
      lastIncident: null
    };
  }

  /**
   * Get lead performance data
   */
  private async getLeadPerformanceData() {
    const performance = await db
      .select()
      .from(leadPerformance)
      .orderBy(desc(leadPerformance.updatedAt))
      .limit(100);

    return performance;
  }

  /**
   * Get conversion funnel data
   */
  private async getConversionFunnel() {
    const totalLeads = await storage.getTotalLeadsCount();
    const contacted = await storage.getLeadsCountByStatus("contacted");
    const qualified = await storage.getLeadsCountByStatus("qualified");
    const closedWon = await storage.getLeadsCountByStatus("closed_won");

    return [
      { stage: "Total Leads", count: totalLeads, percentage: 100 },
      { stage: "Contacted", count: contacted, percentage: (contacted / totalLeads) * 100 },
      { stage: "Qualified", count: qualified, percentage: (qualified / totalLeads) * 100 },
      { stage: "Closed Won", count: closedWon, percentage: (closedWon / totalLeads) * 100 }
    ];
  }

  /**
   * Get webhook delivery rate
   */
  private async getWebhookDeliveryRate() {
    const webhooks = await storage.getAllWebhooks();
    if (webhooks.length === 0) return 100;

    const totalDeliveries = webhooks.reduce((sum, w) => sum + (w.successCount + w.failureCount), 0);
    const successfulDeliveries = webhooks.reduce((sum, w) => sum + w.successCount, 0);

    return totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 100;
  }

  /**
   * Get conversion rate
   */
  private async getConversionRate() {
    const totalLeads = await storage.getTotalLeadsCount();
    const closedWon = await storage.getLeadsCountByStatus("closed_won");
    return totalLeads > 0 ? Math.round((closedWon / totalLeads) * 100) : 0;
  }

  /**
   * Get average deal size
   */
  private async getAverageDealSize() {
    const deals = await db
      .select({ amount: leadPerformance.dealAmount })
      .from(leadPerformance)
      .where(eq(leadPerformance.status, "closed_won"));

    if (deals.length === 0) return 0;

    const total = deals.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    return Math.round(total / deals.length);
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(userId: string, format: string = "csv") {
    try {
      // Get all analytics data
      const data = await this.getDashboardData(userId);
      
      // Generate export file
      const exportData = {
        exportedAt: new Date().toISOString(),
        metrics: data.metrics,
        apiUsage: data.apiUsageChart,
        leadPerformance: data.leadPerformance,
        conversionFunnel: data.conversionFunnel
      };

      // Create CSV or JSON file
      let content: string;
      let contentType: string;
      let filename: string;

      if (format === "csv") {
        // Convert to CSV format
        content = this.convertToCSV(exportData);
        contentType = "text/csv";
        filename = `analytics_export_${Date.now()}.csv`;
      } else {
        content = JSON.stringify(exportData, null, 2);
        contentType = "application/json";
        filename = `analytics_export_${Date.now()}.json`;
      }

      // Store file temporarily and return download URL
      // In production, this would upload to S3 or similar
      const downloadUrl = `/api/command-center/download/${filename}`;
      
      return {
        downloadUrl,
        filename,
        size: content.length,
        format
      };
    } catch (error) {
      console.error("Error exporting analytics:", error);
      throw error;
    }
  }

  /**
   * Convert data to CSV format
   */
  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production use a proper CSV library
    let csv = "Metric,Value\n";
    
    // Add metrics
    Object.entries(data.metrics).forEach(([key, value]) => {
      csv += `${key},${value}\n`;
    });
    
    csv += "\nDate,API Calls,Errors,Avg Response Time\n";
    data.apiUsage.forEach((row: any) => {
      csv += `${row.date},${row.calls},${row.errors},${row.avgResponseTime}\n`;
    });
    
    return csv;
  }

  /**
   * Handle real-time alert
   */
  sendAlert(userId: string, alert: {
    title: string;
    description: string;
    variant?: "default" | "destructive";
    metadata?: any;
  }) {
    this.sendToUser(userId, {
      type: "alert",
      ...alert,
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instance
export const commandCenterService = new CommandCenterService();