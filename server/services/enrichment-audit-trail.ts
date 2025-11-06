import { Lead } from "@shared/schema";
import { storage } from "../storage";
import { eventBus } from "./event-bus";
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Enrichment Audit Trail System
 * Provides comprehensive logging and auditing for all enrichment activities
 */

// Audit log entry types
export enum AuditEventType {
  ENRICHMENT_STARTED = 'enrichment_started',
  ENRICHMENT_COMPLETED = 'enrichment_completed',
  ENRICHMENT_FAILED = 'enrichment_failed',
  API_CALL_MADE = 'api_call_made',
  API_CALL_FAILED = 'api_call_failed',
  DATA_VALIDATED = 'data_validated',
  DATA_CORRECTED = 'data_corrected',
  DUPLICATE_DETECTED = 'duplicate_detected',
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  QUALITY_ISSUE = 'quality_issue',
  ANOMALY_DETECTED = 'anomaly_detected',
  SERVICE_DEGRADED = 'service_degraded',
  SERVICE_RECOVERED = 'service_recovered',
  BUDGET_EXCEEDED = 'budget_exceeded',
  PERMISSION_DENIED = 'permission_denied',
  CONFIG_CHANGED = 'config_changed'
}

// Audit severity levels
export enum AuditSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Audit log entry structure
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  leadId?: string;
  userId?: string;
  service?: string;
  action: string;
  details: any;
  metadata: {
    ip?: string;
    userAgent?: string;
    sessionId?: string;
    requestId?: string;
    correlationId?: string;
  };
  performance?: {
    duration?: number;
    apiCalls?: number;
    cost?: number;
  };
  dataChanges?: {
    before?: any;
    after?: any;
    fieldsModified?: string[];
  };
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  tags?: string[];
}

// Audit trail query options
export interface AuditQueryOptions {
  leadId?: string;
  userId?: string;
  service?: string;
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

// Audit trail statistics
export interface AuditStatistics {
  totalEvents: number;
  eventsByType: { [key in AuditEventType]?: number };
  eventsBySeverity: { [key in AuditSeverity]?: number };
  eventsByService: { [service: string]: number };
  errorRate: number;
  averageDuration: number;
  totalCost: number;
  topUsers: Array<{ userId: string; eventCount: number }>;
  topLeads: Array<{ leadId: string; eventCount: number }>;
}

// Compliance report
export interface ComplianceReport {
  period: { start: Date; end: Date };
  dataAccessEvents: number;
  dataModificationEvents: number;
  unauthorizedAttempts: number;
  dataDeletionEvents: number;
  userActivitySummary: Array<{
    userId: string;
    accessCount: number;
    modificationCount: number;
  }>;
  sensitiveDataAccess: Array<{
    timestamp: Date;
    userId: string;
    leadId: string;
    fieldsAccessed: string[];
  }>;
  anomalousActivities: Array<{
    timestamp: Date;
    description: string;
    severity: AuditSeverity;
  }>;
}

export class EnrichmentAuditTrail {
  private auditLogs: AuditLogEntry[] = [];
  private auditBuffer: AuditLogEntry[] = [];
  private readonly bufferFlushInterval = 5000; // 5 seconds
  private readonly maxBufferSize = 100;
  private readonly auditLogDir = join(process.cwd(), 'logs', 'audit');
  private readonly retentionDays = 90;
  
  // Sensitive fields that require special logging
  private readonly sensitiveFields = [
    'ssn', 'taxId', 'bankAccount', 'creditCard',
    'password', 'apiKey', 'secretKey'
  ];
  
  // Performance tracking
  private performanceMetrics = {
    totalEvents: 0,
    totalDuration: 0,
    totalApiCalls: 0,
    totalCost: 0
  };
  
  constructor() {
    this.initializeAuditSystem();
    this.registerEventListeners();
    this.startFlushRoutine();
    
    console.log('[AuditTrail] Initialized with comprehensive logging');
  }
  
  /**
   * Initialize audit system
   */
  private initializeAuditSystem() {
    // Create audit log directory if it doesn't exist
    if (!existsSync(this.auditLogDir)) {
      mkdirSync(this.auditLogDir, { recursive: true });
    }
    
    // Load recent audit logs from storage (if any)
    this.loadRecentLogs();
  }
  
  /**
   * Log an audit event
   */
  async log(
    eventType: AuditEventType,
    action: string,
    details: any,
    options?: {
      leadId?: string;
      userId?: string;
      service?: string;
      severity?: AuditSeverity;
      metadata?: any;
      performance?: any;
      dataChanges?: any;
      error?: any;
      tags?: string[];
    }
  ): Promise<void> {
    const entry: AuditLogEntry = {
      id: this.generateAuditId(),
      timestamp: new Date(),
      eventType,
      severity: options?.severity || this.determineSeverity(eventType),
      leadId: options?.leadId,
      userId: options?.userId,
      service: options?.service,
      action,
      details: this.sanitizeDetails(details),
      metadata: options?.metadata || {},
      performance: options?.performance,
      dataChanges: options?.dataChanges,
      error: options?.error,
      tags: options?.tags || []
    };
    
    // Add to buffer
    this.auditBuffer.push(entry);
    
    // Update performance metrics
    if (entry.performance) {
      this.performanceMetrics.totalDuration += entry.performance.duration || 0;
      this.performanceMetrics.totalApiCalls += entry.performance.apiCalls || 0;
      this.performanceMetrics.totalCost += entry.performance.cost || 0;
    }
    this.performanceMetrics.totalEvents++;
    
    // Flush if buffer is full
    if (this.auditBuffer.length >= this.maxBufferSize) {
      await this.flushBuffer();
    }
    
    // Emit audit event
    eventBus.emit('audit:logged', {
      eventType,
      severity: entry.severity,
      leadId: entry.leadId,
      service: entry.service
    });
    
    // Log critical events immediately
    if (entry.severity === AuditSeverity.CRITICAL) {
      await this.handleCriticalEvent(entry);
    }
  }
  
  /**
   * Query audit logs
   */
  async query(options: AuditQueryOptions = {}): Promise<AuditLogEntry[]> {
    // Ensure buffer is flushed
    await this.flushBuffer();
    
    let results = [...this.auditLogs];
    
    // Apply filters
    if (options.leadId) {
      results = results.filter(log => log.leadId === options.leadId);
    }
    
    if (options.userId) {
      results = results.filter(log => log.userId === options.userId);
    }
    
    if (options.service) {
      results = results.filter(log => log.service === options.service);
    }
    
    if (options.eventTypes && options.eventTypes.length > 0) {
      results = results.filter(log => options.eventTypes!.includes(log.eventType));
    }
    
    if (options.severities && options.severities.length > 0) {
      results = results.filter(log => options.severities!.includes(log.severity));
    }
    
    if (options.startDate) {
      results = results.filter(log => log.timestamp >= options.startDate!);
    }
    
    if (options.endDate) {
      results = results.filter(log => log.timestamp <= options.endDate!);
    }
    
    // Sort
    results.sort((a, b) => {
      const order = options.sortOrder === 'asc' ? 1 : -1;
      return order * (a.timestamp.getTime() - b.timestamp.getTime());
    });
    
    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    
    return results.slice(offset, offset + limit);
  }
  
  /**
   * Get audit statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<AuditStatistics> {
    await this.flushBuffer();
    
    let logs = this.auditLogs;
    
    // Filter by date range if provided
    if (startDate) {
      logs = logs.filter(log => log.timestamp >= startDate);
    }
    if (endDate) {
      logs = logs.filter(log => log.timestamp <= endDate);
    }
    
    // Calculate statistics
    const stats: AuditStatistics = {
      totalEvents: logs.length,
      eventsByType: {},
      eventsBySeverity: {},
      eventsByService: {},
      errorRate: 0,
      averageDuration: 0,
      totalCost: 0,
      topUsers: [],
      topLeads: []
    };
    
    // Count events by type
    logs.forEach(log => {
      stats.eventsByType[log.eventType] = (stats.eventsByType[log.eventType] || 0) + 1;
      stats.eventsBySeverity[log.severity] = (stats.eventsBySeverity[log.severity] || 0) + 1;
      
      if (log.service) {
        stats.eventsByService[log.service] = (stats.eventsByService[log.service] || 0) + 1;
      }
      
      if (log.performance) {
        stats.totalCost += log.performance.cost || 0;
      }
    });
    
    // Calculate error rate
    const errorCount = stats.eventsBySeverity[AuditSeverity.ERROR] || 0;
    const criticalCount = stats.eventsBySeverity[AuditSeverity.CRITICAL] || 0;
    stats.errorRate = stats.totalEvents > 0 
      ? ((errorCount + criticalCount) / stats.totalEvents) * 100 
      : 0;
    
    // Calculate average duration
    const logsWithDuration = logs.filter(log => log.performance?.duration);
    if (logsWithDuration.length > 0) {
      const totalDuration = logsWithDuration.reduce(
        (sum, log) => sum + (log.performance?.duration || 0), 
        0
      );
      stats.averageDuration = totalDuration / logsWithDuration.length;
    }
    
    // Top users
    const userCounts = new Map<string, number>();
    logs.forEach(log => {
      if (log.userId) {
        userCounts.set(log.userId, (userCounts.get(log.userId) || 0) + 1);
      }
    });
    stats.topUsers = Array.from(userCounts.entries())
      .map(([userId, count]) => ({ userId, eventCount: count }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
    
    // Top leads
    const leadCounts = new Map<string, number>();
    logs.forEach(log => {
      if (log.leadId) {
        leadCounts.set(log.leadId, (leadCounts.get(log.leadId) || 0) + 1);
      }
    });
    stats.topLeads = Array.from(leadCounts.entries())
      .map(([leadId, count]) => ({ leadId, eventCount: count }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
    
    return stats;
  }
  
  /**
   * Generate compliance report
   */
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<ComplianceReport> {
    await this.flushBuffer();
    
    const logs = this.auditLogs.filter(
      log => log.timestamp >= startDate && log.timestamp <= endDate
    );
    
    const report: ComplianceReport = {
      period: { start: startDate, end: endDate },
      dataAccessEvents: 0,
      dataModificationEvents: 0,
      unauthorizedAttempts: 0,
      dataDeletionEvents: 0,
      userActivitySummary: [],
      sensitiveDataAccess: [],
      anomalousActivities: []
    };
    
    // Count event types
    logs.forEach(log => {
      // Data access events
      if (log.action.includes('read') || log.action.includes('view') || log.action.includes('fetch')) {
        report.dataAccessEvents++;
      }
      
      // Data modification events
      if (log.action.includes('update') || log.action.includes('modify') || log.action.includes('enrich')) {
        report.dataModificationEvents++;
      }
      
      // Unauthorized attempts
      if (log.eventType === AuditEventType.PERMISSION_DENIED) {
        report.unauthorizedAttempts++;
      }
      
      // Data deletion events
      if (log.action.includes('delete') || log.action.includes('remove')) {
        report.dataDeletionEvents++;
      }
      
      // Check for sensitive data access
      if (log.dataChanges && log.dataChanges.fieldsModified) {
        const sensitiveAccess = log.dataChanges.fieldsModified.filter(field => 
          this.sensitiveFields.includes(field)
        );
        
        if (sensitiveAccess.length > 0) {
          report.sensitiveDataAccess.push({
            timestamp: log.timestamp,
            userId: log.userId || 'unknown',
            leadId: log.leadId || 'unknown',
            fieldsAccessed: sensitiveAccess
          });
        }
      }
      
      // Detect anomalous activities
      if (log.eventType === AuditEventType.ANOMALY_DETECTED) {
        report.anomalousActivities.push({
          timestamp: log.timestamp,
          description: log.details || 'Anomaly detected',
          severity: log.severity
        });
      }
    });
    
    // Generate user activity summary
    const userActivity = new Map<string, { access: number; modification: number }>();
    
    logs.forEach(log => {
      if (!log.userId) return;
      
      if (!userActivity.has(log.userId)) {
        userActivity.set(log.userId, { access: 0, modification: 0 });
      }
      
      const activity = userActivity.get(log.userId)!;
      
      if (log.action.includes('read') || log.action.includes('view')) {
        activity.access++;
      }
      if (log.action.includes('update') || log.action.includes('modify')) {
        activity.modification++;
      }
    });
    
    report.userActivitySummary = Array.from(userActivity.entries()).map(([userId, activity]) => ({
      userId,
      accessCount: activity.access,
      modificationCount: activity.modification
    }));
    
    return report;
  }
  
  /**
   * Export audit logs
   */
  async exportLogs(
    format: 'json' | 'csv' | 'log' = 'json',
    options?: AuditQueryOptions
  ): Promise<string> {
    const logs = await this.query(options);
    
    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      
      case 'csv':
        const headers = [
          'ID', 'Timestamp', 'Event Type', 'Severity', 
          'Lead ID', 'User ID', 'Service', 'Action', 'Details'
        ];
        const rows = logs.map(log => [
          log.id,
          log.timestamp.toISOString(),
          log.eventType,
          log.severity,
          log.leadId || '',
          log.userId || '',
          log.service || '',
          log.action,
          JSON.stringify(log.details)
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      
      case 'log':
        return logs.map(log => 
          `[${log.timestamp.toISOString()}] [${log.severity.toUpperCase()}] ` +
          `[${log.eventType}] ${log.action} - ${JSON.stringify(log.details)}`
        ).join('\n');
      
      default:
        return '';
    }
  }
  
  /**
   * Archive old audit logs
   */
  async archiveLogs(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    // Filter logs to archive
    const logsToArchive = this.auditLogs.filter(log => log.timestamp < cutoffDate);
    const logsToKeep = this.auditLogs.filter(log => log.timestamp >= cutoffDate);
    
    if (logsToArchive.length === 0) {
      console.log('[AuditTrail] No logs to archive');
      return 0;
    }
    
    // Create archive file
    const archiveFileName = `audit_archive_${cutoffDate.toISOString().split('T')[0]}.json`;
    const archivePath = join(this.auditLogDir, 'archives', archiveFileName);
    
    // Ensure archive directory exists
    const archiveDir = join(this.auditLogDir, 'archives');
    if (!existsSync(archiveDir)) {
      mkdirSync(archiveDir, { recursive: true });
    }
    
    // Write archive file
    writeFileSync(archivePath, JSON.stringify(logsToArchive, null, 2));
    
    // Update in-memory logs
    this.auditLogs = logsToKeep;
    
    console.log(`[AuditTrail] Archived ${logsToArchive.length} logs to ${archiveFileName}`);
    
    return logsToArchive.length;
  }
  
  /**
   * Search audit logs by text
   */
  async searchLogs(searchText: string, options?: AuditQueryOptions): Promise<AuditLogEntry[]> {
    let logs = await this.query(options);
    
    const searchLower = searchText.toLowerCase();
    
    return logs.filter(log => {
      // Search in action
      if (log.action.toLowerCase().includes(searchLower)) return true;
      
      // Search in details
      if (JSON.stringify(log.details).toLowerCase().includes(searchLower)) return true;
      
      // Search in error messages
      if (log.error?.message?.toLowerCase().includes(searchLower)) return true;
      
      // Search in tags
      if (log.tags?.some(tag => tag.toLowerCase().includes(searchLower))) return true;
      
      return false;
    });
  }
  
  // Private helper methods
  
  private registerEventListeners() {
    // Enrichment events
    eventBus.on('enrichment:started', (data: any) => {
      this.log(
        AuditEventType.ENRICHMENT_STARTED,
        'Enrichment process started',
        data,
        {
          leadId: data.leadId,
          userId: data.userId,
          severity: AuditSeverity.INFO
        }
      );
    });
    
    eventBus.on('enrichment:completed', (data: any) => {
      this.log(
        AuditEventType.ENRICHMENT_COMPLETED,
        'Enrichment process completed',
        data,
        {
          leadId: data.leadId,
          userId: data.userId,
          severity: AuditSeverity.INFO,
          performance: {
            duration: data.duration,
            apiCalls: data.apiCalls,
            cost: data.cost
          }
        }
      );
    });
    
    eventBus.on('enrichment:failed', (data: any) => {
      this.log(
        AuditEventType.ENRICHMENT_FAILED,
        'Enrichment process failed',
        data,
        {
          leadId: data.leadId,
          userId: data.userId,
          severity: AuditSeverity.ERROR,
          error: {
            message: data.error,
            stack: data.stack
          }
        }
      );
    });
    
    // API call events
    eventBus.on('api:call', (data: any) => {
      this.log(
        AuditEventType.API_CALL_MADE,
        `API call to ${data.service}`,
        data,
        {
          service: data.service,
          severity: AuditSeverity.DEBUG,
          performance: {
            duration: data.duration
          }
        }
      );
    });
    
    // Quality events
    eventBus.on('qa:issue-detected', (data: any) => {
      this.log(
        AuditEventType.QUALITY_ISSUE,
        'Quality issue detected',
        data,
        {
          leadId: data.leadId,
          severity: AuditSeverity.WARNING
        }
      );
    });
    
    // Cache events
    eventBus.on('cache:hit', (data: any) => {
      this.log(
        AuditEventType.CACHE_HIT,
        'Cache hit',
        data,
        {
          severity: AuditSeverity.DEBUG
        }
      );
    });
    
    eventBus.on('cache:miss', (data: any) => {
      this.log(
        AuditEventType.CACHE_MISS,
        'Cache miss',
        data,
        {
          severity: AuditSeverity.DEBUG
        }
      );
    });
  }
  
  private async flushBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) return;
    
    // Move buffer to main logs
    this.auditLogs.push(...this.auditBuffer);
    
    // Write to file
    const fileName = `audit_${new Date().toISOString().split('T')[0]}.log`;
    const filePath = join(this.auditLogDir, fileName);
    
    const logLines = this.auditBuffer.map(entry => 
      JSON.stringify({
        ...entry,
        timestamp: entry.timestamp.toISOString()
      })
    ).join('\n') + '\n';
    
    appendFileSync(filePath, logLines);
    
    // Clear buffer
    this.auditBuffer = [];
    
    // Trim in-memory logs if too large
    const maxInMemoryLogs = 10000;
    if (this.auditLogs.length > maxInMemoryLogs) {
      this.auditLogs = this.auditLogs.slice(-maxInMemoryLogs);
    }
  }
  
  private startFlushRoutine() {
    setInterval(() => {
      this.flushBuffer();
    }, this.bufferFlushInterval);
    
    // Archive old logs daily
    setInterval(() => {
      this.archiveLogs(this.retentionDays);
    }, 24 * 60 * 60 * 1000);
  }
  
  private loadRecentLogs() {
    // This would load recent logs from storage
    // For now, starting with empty logs
    this.auditLogs = [];
  }
  
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private determineSeverity(eventType: AuditEventType): AuditSeverity {
    switch (eventType) {
      case AuditEventType.ENRICHMENT_FAILED:
      case AuditEventType.API_CALL_FAILED:
      case AuditEventType.SERVICE_DEGRADED:
        return AuditSeverity.ERROR;
      
      case AuditEventType.PERMISSION_DENIED:
      case AuditEventType.BUDGET_EXCEEDED:
        return AuditSeverity.CRITICAL;
      
      case AuditEventType.QUALITY_ISSUE:
      case AuditEventType.ANOMALY_DETECTED:
      case AuditEventType.DUPLICATE_DETECTED:
        return AuditSeverity.WARNING;
      
      case AuditEventType.CACHE_HIT:
      case AuditEventType.CACHE_MISS:
        return AuditSeverity.DEBUG;
      
      default:
        return AuditSeverity.INFO;
    }
  }
  
  private sanitizeDetails(details: any): any {
    if (!details) return details;
    
    // Deep clone to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(details));
    
    // Recursively sanitize sensitive fields
    const sanitizeObject = (obj: any) => {
      for (const key in obj) {
        if (this.sensitiveFields.includes(key.toLowerCase())) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };
    
    sanitizeObject(sanitized);
    
    return sanitized;
  }
  
  private async handleCriticalEvent(entry: AuditLogEntry) {
    // Critical events require immediate action
    console.error(`[AuditTrail] CRITICAL EVENT: ${entry.action}`, entry);
    
    // Could send alerts, notifications, etc.
    eventBus.emit('audit:critical', {
      entry,
      timestamp: new Date()
    });
    
    // Immediately flush to disk
    await this.flushBuffer();
  }
  
  /**
   * Get audit trail health status
   */
  getHealthStatus() {
    return {
      bufferSize: this.auditBuffer.length,
      totalLogs: this.auditLogs.length,
      performanceMetrics: this.performanceMetrics,
      lastFlush: new Date(), // Would track actual last flush time
      status: 'healthy'
    };
  }
}

// Export singleton instance
export const enrichmentAuditTrail = new EnrichmentAuditTrail();

// Export types
export type {
  AuditLogEntry,
  AuditQueryOptions,
  AuditStatistics,
  ComplianceReport
};