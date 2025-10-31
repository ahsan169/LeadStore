import { EventEmitter } from 'events';
import { db } from '../db';
import { leads, leadBatches, enhancedVerification } from '@shared/schema';
import type { Lead, LeadBatch } from '@shared/schema';
import { eq, sql, inArray } from 'drizzle-orm';
import { enhancedVerificationService } from './enhanced-verification';
import { leadEnrichmentService } from './lead-enrichment';
import { leadIntelligenceService } from './lead-intelligence';
import { mlScoringService } from './ml-scoring';
import { errorRecoveryService, ErrorType, ErrorContext } from './error-recovery';
import { cacheManager } from './cache-manager';

export enum BatchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial'
}

export interface BatchJob {
  id: string;
  batchId: string;
  leadIds: string[];
  operations: BatchOperation[];
  status: BatchStatus;
  progress: number;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  startedAt?: Date;
  completedAt?: Date;
  errors: BatchError[];
}

export interface BatchOperation {
  type: 'verify' | 'enrich' | 'score' | 'analyze' | 'all';
  priority: number;
  config?: any;
}

export interface BatchError {
  leadId: string;
  operation: string;
  error: string;
  timestamp: Date;
}

export interface BatchProcessingConfig {
  chunkSize: number;
  concurrency: number;
  retryFailures: boolean;
  continueOnError: boolean;
  priorityMode: 'fifo' | 'lifo' | 'priority';
  timeout?: number;
}

/**
 * High-performance batch processing service for lead operations
 * Handles large-scale processing with optimizations for speed and reliability
 */
export class BatchProcessor extends EventEmitter {
  private activeJobs: Map<string, BatchJob> = new Map();
  private jobQueue: BatchJob[] = [];
  private isProcessing: boolean = false;
  
  // Optimization configurations
  private readonly DEFAULT_CONFIG: BatchProcessingConfig = {
    chunkSize: 100,      // Process 100 leads at a time
    concurrency: 5,      // Run 5 parallel chunks
    retryFailures: true,
    continueOnError: true,
    priorityMode: 'priority',
    timeout: 300000      // 5 minutes timeout per chunk
  };
  
  // Performance metrics
  private metrics = {
    totalProcessed: 0,
    totalTime: 0,
    averageTimePerLead: 0,
    successRate: 0,
    errorRate: 0
  };
  
  constructor() {
    super();
    this.startProcessor();
  }
  
  /**
   * Create and queue a batch processing job
   */
  async createBatchJob(
    batchId: string,
    operations: BatchOperation[],
    config?: Partial<BatchProcessingConfig>
  ): Promise<BatchJob> {
    console.log(`[BatchProcessor] Creating batch job for batch ${batchId}`);
    
    // Fetch all leads for the batch
    const batchLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.batchId, batchId));
    
    if (batchLeads.length === 0) {
      throw new Error(`No leads found for batch ${batchId}`);
    }
    
    const leadIds = batchLeads.map(l => l.id);
    
    // Create job
    const job: BatchJob = {
      id: `batch-${batchId}-${Date.now()}`,
      batchId,
      leadIds,
      operations: operations.sort((a, b) => b.priority - a.priority),
      status: BatchStatus.PENDING,
      progress: 0,
      totalItems: leadIds.length,
      processedItems: 0,
      successCount: 0,
      failureCount: 0,
      errors: []
    };
    
    // Add to queue based on priority mode
    const jobConfig = { ...this.DEFAULT_CONFIG, ...config };
    if (jobConfig.priorityMode === 'lifo') {
      this.jobQueue.unshift(job);
    } else {
      this.jobQueue.push(job);
    }
    
    this.activeJobs.set(job.id, job);
    
    console.log(`[BatchProcessor] Batch job ${job.id} created with ${leadIds.length} leads`);
    this.emit('job-created', job);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }
    
    return job;
  }
  
  /**
   * Process leads in optimized chunks
   */
  private async processLeadsChunk(
    leadIds: string[],
    operations: BatchOperation[],
    job: BatchJob,
    config: BatchProcessingConfig
  ): Promise<void> {
    const chunkResults = await Promise.allSettled(
      leadIds.map(async (leadId) => {
        try {
          // Check cache first for all operations
          const cacheKey = `batch:${leadId}:${operations.map(o => o.type).join('-')}`;
          const cached = await cacheManager.get(
            'batch-processing',
            cacheKey
          );
          
          if (cached) {
            return { leadId, success: true, cached: true };
          }
          
          // Fetch lead data
          const [lead] = await db
            .select()
            .from(leads)
            .where(eq(leads.id, leadId))
            .limit(1);
          
          if (!lead) {
            throw new Error(`Lead ${leadId} not found`);
          }
          
          // Execute operations in order of priority
          const results: any = {};
          
          for (const operation of operations) {
            try {
              switch (operation.type) {
                case 'verify':
                  results.verification = await this.verifyLead(lead);
                  break;
                  
                case 'enrich':
                  results.enrichment = await this.enrichLead(lead);
                  break;
                  
                case 'score':
                  results.scoring = await this.scoreLead(lead);
                  break;
                  
                case 'analyze':
                  results.intelligence = await this.analyzeLead(lead);
                  break;
                  
                case 'all':
                  // Run all operations in parallel
                  const [verification, enrichment, scoring, intelligence] = await Promise.all([
                    this.verifyLead(lead),
                    this.enrichLead(lead),
                    this.scoreLead(lead),
                    this.analyzeLead(lead)
                  ]);
                  results.verification = verification;
                  results.enrichment = enrichment;
                  results.scoring = scoring;
                  results.intelligence = intelligence;
                  break;
              }
            } catch (opError: any) {
              if (!config.continueOnError) {
                throw opError;
              }
              console.warn(`[BatchProcessor] Operation ${operation.type} failed for lead ${leadId}:`, opError);
              results[operation.type] = { error: opError.message };
            }
          }
          
          // Cache successful results
          await cacheManager.set('batch-processing', cacheKey, results, {
            ttl: 3600000 // 1 hour cache
          });
          
          return { leadId, success: true, results };
        } catch (error: any) {
          // Handle error with recovery service
          const errorContext: ErrorContext = {
            type: ErrorType.PROCESSING_ERROR,
            service: 'batch-processor',
            operation: `process-lead-${leadId}`,
            error,
            timestamp: new Date(),
            metadata: { leadId, operations }
          };
          
          const recovery = await errorRecoveryService.handleError(errorContext);
          
          if (!recovery.success && !config.continueOnError) {
            throw error;
          }
          
          return { 
            leadId, 
            success: false, 
            error: error.message,
            recovery
          };
        }
      })
    );
    
    // Process results
    chunkResults.forEach((result, index) => {
      job.processedItems++;
      job.progress = Math.round((job.processedItems / job.totalItems) * 100);
      
      if (result.status === 'fulfilled') {
        const value = result.value as any;
        if (value.success) {
          job.successCount++;
        } else {
          job.failureCount++;
          job.errors.push({
            leadId: value.leadId,
            operation: 'batch-processing',
            error: value.error,
            timestamp: new Date()
          });
        }
      } else {
        job.failureCount++;
        job.errors.push({
          leadId: leadIds[index],
          operation: 'batch-processing',
          error: result.reason?.message || 'Unknown error',
          timestamp: new Date()
        });
      }
    });
    
    // Emit progress event
    this.emit('progress', {
      jobId: job.id,
      progress: job.progress,
      processed: job.processedItems,
      total: job.totalItems
    });
  }
  
  /**
   * Process a batch job
   */
  private async processBatchJob(job: BatchJob, config: BatchProcessingConfig): Promise<void> {
    console.log(`[BatchProcessor] Starting job ${job.id}`);
    
    job.status = BatchStatus.PROCESSING;
    job.startedAt = new Date();
    this.emit('job-started', job);
    
    try {
      // Split leads into chunks
      const chunks: string[][] = [];
      for (let i = 0; i < job.leadIds.length; i += config.chunkSize) {
        chunks.push(job.leadIds.slice(i, i + config.chunkSize));
      }
      
      console.log(`[BatchProcessor] Processing ${chunks.length} chunks of size ${config.chunkSize}`);
      
      // Process chunks with controlled concurrency
      for (let i = 0; i < chunks.length; i += config.concurrency) {
        const concurrentChunks = chunks.slice(i, i + config.concurrency);
        
        const chunkPromises = concurrentChunks.map(chunk =>
          this.processLeadsChunk(chunk, job.operations, job, config)
        );
        
        // Add timeout if configured
        if (config.timeout) {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Chunk processing timeout')), config.timeout)
          );
          
          await Promise.race([
            Promise.all(chunkPromises),
            timeoutPromise
          ]);
        } else {
          await Promise.all(chunkPromises);
        }
      }
      
      // Update job status
      job.completedAt = new Date();
      if (job.failureCount === 0) {
        job.status = BatchStatus.COMPLETED;
      } else if (job.successCount === 0) {
        job.status = BatchStatus.FAILED;
      } else {
        job.status = BatchStatus.PARTIAL;
      }
      
      // Update metrics
      const processingTime = job.completedAt.getTime() - job.startedAt!.getTime();
      this.updateMetrics(job.processedItems, processingTime, job.successCount, job.failureCount);
      
      console.log(`[BatchProcessor] Job ${job.id} completed: ${job.successCount} success, ${job.failureCount} failures`);
      this.emit('job-completed', job);
      
      // Update batch status in database
      await this.updateBatchStatus(job.batchId, job.status);
      
    } catch (error: any) {
      console.error(`[BatchProcessor] Job ${job.id} failed:`, error);
      job.status = BatchStatus.FAILED;
      job.completedAt = new Date();
      this.emit('job-failed', { job, error });
      
      // Update batch status
      await this.updateBatchStatus(job.batchId, BatchStatus.FAILED);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }
  
  /**
   * Verify a lead with optimizations
   */
  private async verifyLead(lead: Lead): Promise<any> {
    try {
      return await enhancedVerificationService.verifyLead(lead.id, false);
    } catch (error) {
      console.warn(`[BatchProcessor] Verification failed for lead ${lead.id}:`, error);
      return null;
    }
  }
  
  /**
   * Enrich a lead with optimizations
   */
  private async enrichLead(lead: Lead): Promise<any> {
    try {
      return await leadEnrichmentService.enrichLead(lead.id);
    } catch (error) {
      console.warn(`[BatchProcessor] Enrichment failed for lead ${lead.id}:`, error);
      return null;
    }
  }
  
  /**
   * Score a lead with ML
   */
  private async scoreLead(lead: Lead): Promise<any> {
    try {
      return await mlScoringService.scoreLead(lead);
    } catch (error) {
      console.warn(`[BatchProcessor] ML scoring failed for lead ${lead.id}:`, error);
      return null;
    }
  }
  
  /**
   * Analyze lead with intelligence scoring
   */
  private async analyzeLead(lead: Lead): Promise<any> {
    try {
      return await leadIntelligenceService.calculateIntelligenceScore(lead, false);
    } catch (error) {
      console.warn(`[BatchProcessor] Intelligence analysis failed for lead ${lead.id}:`, error);
      return null;
    }
  }
  
  /**
   * Update batch status in database
   */
  private async updateBatchStatus(batchId: string, status: BatchStatus): Promise<void> {
    try {
      await db
        .update(leadBatches)
        .set({
          processingStatus: status === BatchStatus.COMPLETED ? 'completed' : 
                           status === BatchStatus.FAILED ? 'failed' : 'processing'
        })
        .where(eq(leadBatches.id, batchId));
    } catch (error) {
      console.error(`[BatchProcessor] Failed to update batch status:`, error);
    }
  }
  
  /**
   * Update performance metrics
   */
  private updateMetrics(
    processed: number,
    time: number,
    success: number,
    failures: number
  ): void {
    this.metrics.totalProcessed += processed;
    this.metrics.totalTime += time;
    this.metrics.averageTimePerLead = this.metrics.totalTime / this.metrics.totalProcessed;
    
    const total = this.metrics.totalProcessed;
    this.metrics.successRate = ((this.metrics.successRate * (total - processed)) + success) / total;
    this.metrics.errorRate = ((this.metrics.errorRate * (total - processed)) + failures) / total;
  }
  
  /**
   * Start the job processor
   */
  private startProcessor(): void {
    setInterval(async () => {
      if (!this.isProcessing && this.jobQueue.length > 0) {
        await this.processNextJob();
      }
    }, 1000); // Check every second
  }
  
  /**
   * Process the next job in queue
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing || this.jobQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    const job = this.jobQueue.shift()!;
    
    try {
      await this.processBatchJob(job, this.DEFAULT_CONFIG);
    } catch (error) {
      console.error(`[BatchProcessor] Failed to process job:`, error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): BatchJob | null {
    return this.activeJobs.get(jobId) || null;
  }
  
  /**
   * Get all active jobs
   */
  getActiveJobs(): BatchJob[] {
    return Array.from(this.activeJobs.values());
  }
  
  /**
   * Get processing metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }
  
  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const jobIndex = this.jobQueue.findIndex(j => j.id === jobId);
    if (jobIndex !== -1) {
      this.jobQueue.splice(jobIndex, 1);
      this.emit('job-cancelled', { jobId });
      return true;
    }
    return false;
  }
}

// Export singleton instance
export const batchProcessor = new BatchProcessor();