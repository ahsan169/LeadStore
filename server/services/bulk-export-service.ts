import { EventEmitter } from 'events';
import { db } from '../db';
import { leads, purchases, users, enrichmentCosts, dataEvidence } from '@shared/schema';
import { eq, and, inArray, gte, lte, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import Papa from 'papaparse';
import { Stripe } from 'stripe';
import { createHash } from 'crypto';
import { enrichmentCache } from './enrichment/cache-service';
import { costMonitoringService } from './cost-monitoring-service';
import { waterfallEnrichmentOrchestrator } from './waterfall-enrichment-orchestrator';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-11-20.acacia',
});

export interface ExportTier {
  id: string;
  name: string;
  description: string;
  pricePerLead: number;
  deliveryTime: number; // minutes
  includesEnrichment: boolean;
  includesEvidence: boolean;
  includesConfidenceScores: boolean;
  includesCostBreakdown: boolean;
  maxLeads: number;
  formats: ('csv' | 'parquet' | 'json' | 'excel')[];
}

export interface ExportJob {
  id: string;
  userId: string;
  purchaseId?: string;
  tier: ExportTier;
  leadIds: string[];
  format: 'csv' | 'parquet' | 'json' | 'excel';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalLeads: number;
  processedLeads: number;
  totalCost: number;
  downloadUrl?: string;
  expiresAt?: Date;
  metadata: any;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface ExportOptions {
  includeEnrichment?: boolean;
  includeEvidence?: boolean;
  includeConfidenceScores?: boolean;
  includeCostBreakdown?: boolean;
  includeMetadata?: boolean;
  enrichmentOptions?: {
    maxTier?: number;
    forceRefresh?: boolean;
  };
  filters?: {
    industries?: string[];
    states?: string[];
    minQualityScore?: number;
    maxQualityScore?: number;
    minRevenue?: number;
    maxRevenue?: number;
    ageRange?: { min: number; max: number };
  };
}

export interface ExportResult {
  jobId: string;
  downloadUrl: string;
  expiresAt: Date;
  totalLeads: number;
  totalCost: number;
  format: string;
  metadata: {
    exportedAt: Date;
    includedFields: string[];
    averageQualityScore: number;
    averageEnrichmentCost: number;
  };
}

export class BulkExportService extends EventEmitter {
  private exportQueue: Map<string, ExportJob> = new Map();
  private processingInterval: NodeJS.Timeout | null = null;
  private exportPath: string;
  
  // Export tiers configuration
  private tiers: Map<string, ExportTier> = new Map();
  
  constructor() {
    super();
    this.exportPath = path.join(process.cwd(), 'exports');
    this.initializeTiers();
    this.initializeExportDirectory();
    this.startProcessor();
  }
  
  /**
   * Initialize export tiers
   */
  private initializeTiers() {
    // Instant tier - immediate delivery, basic data
    this.tiers.set('instant', {
      id: 'instant',
      name: 'Instant Export',
      description: 'Basic lead data, immediate delivery',
      pricePerLead: 0.001,
      deliveryTime: 0,
      includesEnrichment: false,
      includesEvidence: false,
      includesConfidenceScores: false,
      includesCostBreakdown: false,
      maxLeads: 10000,
      formats: ['csv', 'json']
    });
    
    // Standard tier - enriched data, fast delivery
    this.tiers.set('standard', {
      id: 'standard',
      name: 'Standard Export',
      description: 'Enriched lead data with confidence scores',
      pricePerLead: 0.005,
      deliveryTime: 5,
      includesEnrichment: true,
      includesEvidence: false,
      includesConfidenceScores: true,
      includesCostBreakdown: false,
      maxLeads: 50000,
      formats: ['csv', 'json', 'excel']
    });
    
    // Premium tier - full data with evidence
    this.tiers.set('premium', {
      id: 'premium',
      name: 'Premium Export',
      description: 'Complete data with evidence and cost breakdown',
      pricePerLead: 0.01,
      deliveryTime: 15,
      includesEnrichment: true,
      includesEvidence: true,
      includesConfidenceScores: true,
      includesCostBreakdown: true,
      maxLeads: 100000,
      formats: ['csv', 'parquet', 'json', 'excel']
    });
    
    // Enterprise tier - custom everything
    this.tiers.set('enterprise', {
      id: 'enterprise',
      name: 'Enterprise Export',
      description: 'Custom export with all features and formats',
      pricePerLead: 0.02,
      deliveryTime: 30,
      includesEnrichment: true,
      includesEvidence: true,
      includesConfidenceScores: true,
      includesCostBreakdown: true,
      maxLeads: 1000000,
      formats: ['csv', 'parquet', 'json', 'excel']
    });
  }
  
  /**
   * Initialize export directory
   */
  private async initializeExportDirectory() {
    try {
      await fs.mkdir(this.exportPath, { recursive: true });
    } catch (error) {
      console.error('[BulkExport] Failed to create export directory:', error);
    }
  }
  
  /**
   * Create export job
   */
  async createExportJob(
    userId: string,
    leadIds: string[],
    tierId: string,
    format: 'csv' | 'parquet' | 'json' | 'excel',
    options?: ExportOptions
  ): Promise<ExportJob> {
    const tier = this.tiers.get(tierId);
    if (!tier) {
      throw new Error(`Invalid tier: ${tierId}`);
    }
    
    if (!tier.formats.includes(format)) {
      throw new Error(`Format ${format} not supported for tier ${tierId}`);
    }
    
    if (leadIds.length > tier.maxLeads) {
      throw new Error(`Too many leads. Maximum for ${tier.name} is ${tier.maxLeads}`);
    }
    
    // Calculate cost
    const totalCost = leadIds.length * tier.pricePerLead;
    
    // Create job
    const job: ExportJob = {
      id: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      tier,
      leadIds,
      format,
      status: 'pending',
      progress: 0,
      totalLeads: leadIds.length,
      processedLeads: 0,
      totalCost,
      metadata: options || {},
      createdAt: new Date()
    };
    
    // Add to queue
    this.exportQueue.set(job.id, job);
    
    // Track usage in Stripe
    await this.reportUsageToStripe(userId, leadIds.length, tierId, totalCost);
    
    console.log(`[BulkExport] Created export job ${job.id} for ${leadIds.length} leads`);
    this.emit('job-created', job);
    
    // Process immediately for instant tier
    if (tier.deliveryTime === 0) {
      await this.processJob(job);
    }
    
    return job;
  }
  
  /**
   * Process export job
   */
  private async processJob(job: ExportJob) {
    console.log(`[BulkExport] Processing job ${job.id}`);
    job.status = 'processing';
    
    try {
      // Fetch lead data
      const leadData = await this.fetchLeadData(job);
      
      // Enrich if needed
      if (job.tier.includesEnrichment) {
        await this.enrichLeads(leadData, job);
      }
      
      // Add evidence if needed
      if (job.tier.includesEvidence) {
        await this.addEvidence(leadData, job);
      }
      
      // Add confidence scores
      if (job.tier.includesConfidenceScores) {
        this.addConfidenceScores(leadData);
      }
      
      // Add cost breakdown
      if (job.tier.includesCostBreakdown) {
        await this.addCostBreakdown(leadData, job);
      }
      
      // Export to file
      const filePath = await this.exportToFile(leadData, job);
      
      // Generate download URL
      const downloadUrl = await this.generateDownloadUrl(filePath, job);
      
      // Update job
      job.status = 'completed';
      job.progress = 100;
      job.processedLeads = job.totalLeads;
      job.downloadUrl = downloadUrl;
      job.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      job.completedAt = new Date();
      
      console.log(`[BulkExport] Completed job ${job.id}`);
      this.emit('job-completed', job);
      
    } catch (error: any) {
      console.error(`[BulkExport] Job ${job.id} failed:`, error);
      job.status = 'failed';
      job.error = error.message;
      this.emit('job-failed', job);
    }
  }
  
  /**
   * Fetch lead data from database
   */
  private async fetchLeadData(job: ExportJob): Promise<any[]> {
    console.log(`[BulkExport] Fetching ${job.leadIds.length} leads`);
    
    const leadData = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, job.leadIds));
    
    // Apply filters if provided
    const filters = job.metadata?.filters;
    if (filters) {
      return leadData.filter(lead => {
        if (filters.industries && !filters.industries.includes(lead.industry || '')) {
          return false;
        }
        if (filters.states && !filters.states.includes(lead.stateCode || '')) {
          return false;
        }
        if (filters.minQualityScore && (lead.qualityScore || 0) < filters.minQualityScore) {
          return false;
        }
        if (filters.maxQualityScore && (lead.qualityScore || 0) > filters.maxQualityScore) {
          return false;
        }
        if (filters.minRevenue) {
          const revenue = parseFloat(lead.annualRevenue || '0');
          if (revenue < filters.minRevenue) return false;
        }
        if (filters.maxRevenue) {
          const revenue = parseFloat(lead.annualRevenue || '0');
          if (revenue > filters.maxRevenue) return false;
        }
        return true;
      });
    }
    
    return leadData;
  }
  
  /**
   * Enrich leads if not already enriched
   */
  private async enrichLeads(leadData: any[], job: ExportJob) {
    console.log(`[BulkExport] Enriching ${leadData.length} leads`);
    
    const enrichmentOptions = job.metadata?.enrichmentOptions || {};
    const batchSize = 50;
    
    for (let i = 0; i < leadData.length; i += batchSize) {
      const batch = leadData.slice(i, i + batchSize);
      
      const enrichmentPromises = batch.map(async (lead) => {
        // Check if already enriched
        if (lead.isEnriched && !enrichmentOptions.forceRefresh) {
          return lead;
        }
        
        // Enrich using waterfall orchestrator
        const result = await waterfallEnrichmentOrchestrator.enrichLead(
          lead,
          enrichmentOptions
        );
        
        // Merge enriched data back
        Object.assign(lead, result.enrichedData);
        lead.enrichmentMetadata = {
          hotnessScore: result.hotnessScore,
          sourcesUsed: result.sourcesUsed,
          totalCost: result.totalCost,
          completenessScore: result.completenessScore
        };
        
        return lead;
      });
      
      await Promise.all(enrichmentPromises);
      
      // Update progress
      job.processedLeads = Math.min(i + batchSize, leadData.length);
      job.progress = Math.floor((job.processedLeads / job.totalLeads) * 50); // 50% for enrichment
      this.emit('job-progress', job);
    }
  }
  
  /**
   * Add evidence to leads
   */
  private async addEvidence(leadData: any[], job: ExportJob) {
    console.log(`[BulkExport] Adding evidence to ${leadData.length} leads`);
    
    for (const lead of leadData) {
      // Fetch evidence from database
      const evidence = await db
        .select()
        .from(dataEvidence)
        .where(eq(dataEvidence.leadId, lead.id));
      
      lead.evidence = evidence.map(e => ({
        source: e.source,
        field: e.field,
        value: e.value,
        confidence: e.confidence,
        timestamp: e.timestamp,
        metadata: e.metadata
      }));
    }
  }
  
  /**
   * Add confidence scores to leads
   */
  private addConfidenceScores(leadData: any[]) {
    console.log(`[BulkExport] Adding confidence scores`);
    
    for (const lead of leadData) {
      const scores = {
        overall: this.calculateOverallConfidence(lead),
        businessInfo: this.calculateFieldGroupConfidence(lead, [
          'businessName', 'legalName', 'industry', 'yearFounded'
        ]),
        contactInfo: this.calculateFieldGroupConfidence(lead, [
          'email', 'phone', 'ownerName', 'websiteUrl'
        ]),
        financialInfo: this.calculateFieldGroupConfidence(lead, [
          'annualRevenue', 'employeeCount', 'creditScore'
        ]),
        locationInfo: this.calculateFieldGroupConfidence(lead, [
          'address', 'city', 'stateCode', 'zipCode'
        ])
      };
      
      lead.confidenceScores = scores;
    }
  }
  
  /**
   * Add cost breakdown to leads
   */
  private async addCostBreakdown(leadData: any[], job: ExportJob) {
    console.log(`[BulkExport] Adding cost breakdown`);
    
    for (const lead of leadData) {
      // Get enrichment costs for this lead
      const costs = await db
        .select({
          service: enrichmentCosts.service,
          cost: enrichmentCosts.cost,
          timestamp: enrichmentCosts.timestamp
        })
        .from(enrichmentCosts)
        .where(eq(enrichmentCosts.apiCall, `enrich_${lead.id}`));
      
      const totalCost = costs.reduce((sum, c) => sum + parseFloat(c.cost), 0);
      
      lead.costBreakdown = {
        total: totalCost,
        perService: costs,
        exportCost: job.tier.pricePerLead,
        profitMargin: job.tier.pricePerLead - totalCost
      };
    }
  }
  
  /**
   * Export data to file
   */
  private async exportToFile(leadData: any[], job: ExportJob): Promise<string> {
    const filename = `export_${job.id}_${Date.now()}.${job.format}`;
    const filePath = path.join(this.exportPath, filename);
    
    console.log(`[BulkExport] Exporting to ${job.format} format`);
    
    switch (job.format) {
      case 'csv':
        await this.exportToCSV(leadData, filePath);
        break;
      
      case 'json':
        await this.exportToJSON(leadData, filePath);
        break;
      
      case 'excel':
        await this.exportToExcel(leadData, filePath);
        break;
      
      case 'parquet':
        await this.exportToParquet(leadData, filePath);
        break;
      
      default:
        throw new Error(`Unsupported format: ${job.format}`);
    }
    
    return filePath;
  }
  
  /**
   * Export to CSV
   */
  private async exportToCSV(data: any[], filePath: string) {
    // Flatten nested objects for CSV
    const flattenedData = data.map(lead => {
      const flat: any = {};
      
      // Basic fields
      Object.keys(lead).forEach(key => {
        if (typeof lead[key] !== 'object' || lead[key] === null) {
          flat[key] = lead[key];
        }
      });
      
      // Flatten confidence scores
      if (lead.confidenceScores) {
        Object.keys(lead.confidenceScores).forEach(key => {
          flat[`confidence_${key}`] = lead.confidenceScores[key];
        });
      }
      
      // Flatten cost breakdown
      if (lead.costBreakdown) {
        flat['cost_total'] = lead.costBreakdown.total;
        flat['cost_export'] = lead.costBreakdown.exportCost;
        flat['profit_margin'] = lead.costBreakdown.profitMargin;
      }
      
      // Flatten enrichment metadata
      if (lead.enrichmentMetadata) {
        flat['hotness_score'] = lead.enrichmentMetadata.hotnessScore?.score;
        flat['completeness_score'] = lead.enrichmentMetadata.completenessScore;
        flat['enrichment_cost'] = lead.enrichmentMetadata.totalCost;
      }
      
      return flat;
    });
    
    const csv = Papa.unparse(flattenedData, {
      header: true,
      delimiter: ',',
      newline: '\n'
    });
    
    await fs.writeFile(filePath, csv, 'utf8');
  }
  
  /**
   * Export to JSON
   */
  private async exportToJSON(data: any[], filePath: string) {
    const jsonData = {
      exportedAt: new Date(),
      totalRecords: data.length,
      metadata: {
        version: '1.0',
        schema: 'lead_export_v1'
      },
      leads: data
    };
    
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8');
  }
  
  /**
   * Export to Excel (using CSV for simplicity)
   */
  private async exportToExcel(data: any[], filePath: string) {
    // For now, export as CSV with .xlsx extension
    // In production, use a library like xlsx or exceljs
    const csvPath = filePath.replace('.excel', '.csv');
    await this.exportToCSV(data, csvPath);
    await fs.rename(csvPath, filePath.replace('.excel', '.xlsx'));
  }
  
  /**
   * Export to Parquet
   */
  private async exportToParquet(data: any[], filePath: string) {
    // For Parquet, we'd use a library like parquetjs
    // For now, export as JSON with .parquet extension
    console.log('[BulkExport] Parquet export not fully implemented, using JSON format');
    const jsonPath = filePath.replace('.parquet', '.json');
    await this.exportToJSON(data, jsonPath);
    await fs.rename(jsonPath, filePath);
  }
  
  /**
   * Generate download URL
   */
  private async generateDownloadUrl(filePath: string, job: ExportJob): Promise<string> {
    // In production, upload to S3 and generate presigned URL
    // For now, return local file path
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const filename = path.basename(filePath);
    
    // Generate secure token
    const token = createHash('sha256')
      .update(`${job.id}-${job.userId}-${Date.now()}`)
      .digest('hex');
    
    // Store token for validation
    enrichmentCache.set(`download-${token}`, {
      jobId: job.id,
      userId: job.userId,
      filePath,
      expiresAt: job.expiresAt
    }, 'download', 1, 24 * 60 * 60 * 1000); // 24 hours
    
    return `${baseUrl}/api/exports/download/${token}`;
  }
  
  /**
   * Report usage to Stripe for metered billing
   */
  private async reportUsageToStripe(
    userId: string,
    leadCount: number,
    tierId: string,
    totalCost: number
  ) {
    try {
      // Get user's Stripe customer ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user?.stripeCustomerId) {
        console.warn(`[BulkExport] No Stripe customer ID for user ${userId}`);
        return;
      }
      
      // Find subscription with metered price
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active'
      });
      
      if (subscriptions.data.length === 0) {
        console.warn(`[BulkExport] No active subscription for user ${userId}`);
        return;
      }
      
      const subscription = subscriptions.data[0];
      const meteredItem = subscription.items.data.find(item => 
        item.price.recurring?.usage_type === 'metered'
      );
      
      if (!meteredItem) {
        console.warn(`[BulkExport] No metered price item found for user ${userId}`);
        return;
      }
      
      // Report usage
      await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
        quantity: leadCount,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
        metadata: {
          export_tier: tierId,
          total_cost: totalCost.toString()
        }
      });
      
      console.log(`[BulkExport] Reported usage to Stripe: ${leadCount} leads for user ${userId}`);
      
    } catch (error) {
      console.error('[BulkExport] Failed to report usage to Stripe:', error);
    }
  }
  
  /**
   * Calculate overall confidence
   */
  private calculateOverallConfidence(lead: any): number {
    const fields = [
      'businessName', 'ownerName', 'email', 'phone',
      'industry', 'annualRevenue', 'address', 'city',
      'stateCode', 'websiteUrl', 'employeeCount'
    ];
    
    const filledFields = fields.filter(f => lead[f] !== null && lead[f] !== undefined && lead[f] !== '');
    return filledFields.length / fields.length;
  }
  
  /**
   * Calculate field group confidence
   */
  private calculateFieldGroupConfidence(lead: any, fields: string[]): number {
    const filledFields = fields.filter(f => lead[f] !== null && lead[f] !== undefined && lead[f] !== '');
    return filledFields.length / fields.length;
  }
  
  /**
   * Start job processor
   */
  private startProcessor() {
    this.processingInterval = setInterval(() => {
      this.processPendingJobs();
    }, 60000); // Check every minute
  }
  
  /**
   * Process pending jobs
   */
  private async processPendingJobs() {
    const now = new Date();
    
    for (const [jobId, job] of this.exportQueue) {
      if (job.status === 'pending') {
        const elapsed = (now.getTime() - job.createdAt.getTime()) / 1000 / 60;
        
        if (elapsed >= job.tier.deliveryTime) {
          await this.processJob(job);
        }
      }
    }
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): ExportJob | undefined {
    return this.exportQueue.get(jobId);
  }
  
  /**
   * Get user's export jobs
   */
  getUserJobs(userId: string): ExportJob[] {
    return Array.from(this.exportQueue.values())
      .filter(job => job.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  /**
   * Download file
   */
  async downloadFile(token: string): Promise<{ filePath: string; filename: string } | null> {
    const cacheKey = `download-${token}`;
    const downloadInfo = enrichmentCache.get(cacheKey);
    
    if (!downloadInfo) {
      return null;
    }
    
    if (new Date() > new Date(downloadInfo.expiresAt)) {
      enrichmentCache.delete(cacheKey);
      return null;
    }
    
    return {
      filePath: downloadInfo.filePath,
      filename: path.basename(downloadInfo.filePath)
    };
  }
  
  /**
   * Get export metrics
   */
  async getExportMetrics(): Promise<{
    totalExports: number;
    totalLeadsExported: number;
    totalRevenue: number;
    exportsByTier: Record<string, number>;
    exportsByFormat: Record<string, number>;
    averageExportSize: number;
  }> {
    const jobs = Array.from(this.exportQueue.values());
    const completedJobs = jobs.filter(j => j.status === 'completed');
    
    const metrics = {
      totalExports: completedJobs.length,
      totalLeadsExported: completedJobs.reduce((sum, j) => sum + j.totalLeads, 0),
      totalRevenue: completedJobs.reduce((sum, j) => sum + j.totalCost, 0),
      exportsByTier: {} as Record<string, number>,
      exportsByFormat: {} as Record<string, number>,
      averageExportSize: 0
    };
    
    // Count by tier
    for (const job of completedJobs) {
      const tierId = job.tier.id;
      metrics.exportsByTier[tierId] = (metrics.exportsByTier[tierId] || 0) + 1;
      
      const format = job.format;
      metrics.exportsByFormat[format] = (metrics.exportsByFormat[format] || 0) + 1;
    }
    
    // Calculate average
    metrics.averageExportSize = metrics.totalExports > 0 
      ? metrics.totalLeadsExported / metrics.totalExports 
      : 0;
    
    return metrics;
  }
  
  /**
   * Cleanup old export files
   */
  async cleanupOldExports() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    try {
      const files = await fs.readdir(this.exportPath);
      
      for (const file of files) {
        const filePath = path.join(this.exportPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          console.log(`[BulkExport] Cleaned up old export: ${file}`);
        }
      }
    } catch (error) {
      console.error('[BulkExport] Cleanup error:', error);
    }
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }
}

// Export singleton instance
export const bulkExportService = new BulkExportService();

// Schedule daily cleanup
setInterval(() => {
  bulkExportService.cleanupOldExports();
}, 24 * 60 * 60 * 1000);