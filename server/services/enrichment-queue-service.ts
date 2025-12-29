import { EventEmitter } from 'events';
import { db } from '../db';
import { enrichmentJobs, leads, enrichmentCosts } from '@shared/schema';
import { eq, and, or, sql, lte, gte, isNull } from 'drizzle-orm';
import { waterfallEnrichmentOrchestrator } from './waterfall-enrichment-orchestrator';
import { bulkDataIngestionService } from './bulk-data-ingestion';
import { leadDeduplicationService } from './lead-deduplication-service';

export interface JobQueue {
  name: string;
  priority: number;
  jobs: QueuedJob[];
  processing: boolean;
  maxConcurrency: number;
  retryStrategy: RetryStrategy;
}

export interface QueuedJob {
  id: string;
  type: 'enrich' | 'ingest' | 'dedupe' | 'export' | 'verify';
  priority: 'high' | 'medium' | 'low';
  data: any;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  scheduledFor?: Date;
  attempts: JobAttempt[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface JobAttempt {
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export interface RetryStrategy {
  type: 'exponential' | 'linear' | 'fixed';
  initialDelay: number; // ms
  maxDelay: number; // ms
  factor: number; // multiplier for exponential
}

export interface QueueMetrics {
  queueName: string;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgProcessingTime: number;
  successRate: number;
  throughput: number; // jobs per minute
}

export class EnrichmentQueueService extends EventEmitter {
  private queues: Map<string, JobQueue> = new Map();
  private activeJobs: Map<string, QueuedJob> = new Map();
  private processingIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Metrics
  private metrics: Map<string, {
    completed: number;
    failed: number;
    totalTime: number;
    startTime: Date;
  }> = new Map();
  
  // Rate limiting
  private rateLimits: Map<string, {
    limit: number;
    window: number; // ms
    current: number;
    resetAt: Date;
  }> = new Map();
  
  constructor() {
    super();
    this.initializeQueues();
    this.startQueueProcessors();
    this.loadPendingJobs();
  }
  
  /**
   * Initialize queue configurations
   */
  private initializeQueues() {
    // High priority enrichment queue
    this.createQueue({
      name: 'enrich.high',
      priority: 1,
      jobs: [],
      processing: false,
      maxConcurrency: 5,
      retryStrategy: {
        type: 'exponential',
        initialDelay: 1000,
        maxDelay: 60000,
        factor: 2
      }
    });
    
    // Standard enrichment queue
    this.createQueue({
      name: 'enrich.standard',
      priority: 2,
      jobs: [],
      processing: false,
      maxConcurrency: 10,
      retryStrategy: {
        type: 'exponential',
        initialDelay: 2000,
        maxDelay: 120000,
        factor: 2
      }
    });
    
    // Bulk enrichment queue
    this.createQueue({
      name: 'enrich.bulk',
      priority: 3,
      jobs: [],
      processing: false,
      maxConcurrency: 2,
      retryStrategy: {
        type: 'linear',
        initialDelay: 5000,
        maxDelay: 300000,
        factor: 1.5
      }
    });
    
    // Retry queue for failed jobs
    this.createQueue({
      name: 'enrich.retry',
      priority: 4,
      jobs: [],
      processing: false,
      maxConcurrency: 3,
      retryStrategy: {
        type: 'exponential',
        initialDelay: 10000,
        maxDelay: 600000,
        factor: 3
      }
    });
    
    // Data ingestion queue
    this.createQueue({
      name: 'ingest.data',
      priority: 5,
      jobs: [],
      processing: false,
      maxConcurrency: 1,
      retryStrategy: {
        type: 'fixed',
        initialDelay: 30000,
        maxDelay: 30000,
        factor: 1
      }
    });
    
    // Deduplication queue
    this.createQueue({
      name: 'dedupe.process',
      priority: 6,
      jobs: [],
      processing: false,
      maxConcurrency: 1,
      retryStrategy: {
        type: 'fixed',
        initialDelay: 5000,
        maxDelay: 5000,
        factor: 1
      }
    });
    
    // Initialize rate limits
    this.initializeRateLimits();
  }
  
  /**
   * Create a queue
   */
  private createQueue(config: JobQueue) {
    this.queues.set(config.name, config);
    this.metrics.set(config.name, {
      completed: 0,
      failed: 0,
      totalTime: 0,
      startTime: new Date()
    });
  }
  
  /**
   * Initialize rate limits for external APIs
   */
  private initializeRateLimits() {
    // OpenCorporates free tier
    this.rateLimits.set('opencorporates', {
      limit: 200,
      window: 60000, // per minute
      current: 0,
      resetAt: new Date(Date.now() + 60000)
    });
    
    // Perplexity
    this.rateLimits.set('perplexity', {
      limit: 20,
      window: 60000,
      current: 0,
      resetAt: new Date(Date.now() + 60000)
    });
    
    // OpenAI
    this.rateLimits.set('openai', {
      limit: 60,
      window: 60000,
      current: 0,
      resetAt: new Date(Date.now() + 60000)
    });
    
    // Hunter.io
    this.rateLimits.set('hunter', {
      limit: 50,
      window: 60000,
      current: 0,
      resetAt: new Date(Date.now() + 60000)
    });
    
    // Google Places
    this.rateLimits.set('google_places', {
      limit: 100,
      window: 60000,
      current: 0,
      resetAt: new Date(Date.now() + 60000)
    });
  }
  
  /**
   * Add job to queue
   */
  async addJob(
    queueName: string,
    job: Omit<QueuedJob, 'id' | 'createdAt' | 'attempts' | 'status'>
  ): Promise<QueuedJob> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    const newJob: QueuedJob = {
      ...job,
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      attempts: [],
      status: 'pending'
    };
    
    // Store in database
    if (job.type === 'enrich' && job.data.leadId) {
      await db.insert(enrichmentJobs).values({
        leadId: job.data.leadId,
        batchId: job.data.batchId,
        priority: job.priority,
        status: 'pending',
        retryCount: 0,
        maxRetries: job.maxRetries,
        enrichmentOptions: job.data.options || {},
        source: job.data.source || 'queue',
        userId: job.data.userId
      });
    }
    
    // Add to queue based on priority
    if (job.priority === 'high') {
      queue.jobs.unshift(newJob);
    } else {
      queue.jobs.push(newJob);
    }
    
    this.activeJobs.set(newJob.id, newJob);
    
    console.log(`[Queue] Job ${newJob.id} added to ${queueName}`);
    this.emit('job-added', { queue: queueName, job: newJob });
    
    return newJob;
  }
  
  /**
   * Process jobs in a queue
   */
  private async processQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue || queue.processing) return;
    
    queue.processing = true;
    
    try {
      // Get jobs to process (respecting concurrency)
      const processingCount = queue.jobs.filter(j => j.status === 'processing').length;
      const availableSlots = queue.maxConcurrency - processingCount;
      
      if (availableSlots <= 0) return;
      
      const pendingJobs = queue.jobs
        .filter(j => j.status === 'pending' && (!j.scheduledFor || j.scheduledFor <= new Date()))
        .slice(0, availableSlots);
      
      // Process jobs in parallel
      const promises = pendingJobs.map(job => this.processJob(job, queue));
      await Promise.allSettled(promises);
      
    } finally {
      queue.processing = false;
    }
  }
  
  /**
   * Process individual job
   */
  private async processJob(job: QueuedJob, queue: JobQueue): Promise<void> {
    const startTime = Date.now();
    job.status = 'processing';
    
    const attempt: JobAttempt = {
      attemptNumber: job.attempts.length + 1,
      startedAt: new Date()
    };
    job.attempts.push(attempt);
    
    console.log(`[Queue] Processing job ${job.id} (attempt ${attempt.attemptNumber})`);
    this.emit('job-started', { queue: queue.name, job });
    
    try {
      // Check rate limits
      await this.checkRateLimit(job);
      
      // Execute job based on type
      let result: any;
      
      switch (job.type) {
        case 'enrich':
          result = await this.processEnrichmentJob(job);
          break;
          
        case 'ingest':
          result = await this.processIngestionJob(job);
          break;
          
        case 'dedupe':
          result = await this.processDeduplicationJob(job);
          break;
          
        case 'verify':
          result = await this.processVerificationJob(job);
          break;
          
        case 'export':
          result = await this.processExportJob(job);
          break;
          
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Mark as completed
      attempt.completedAt = new Date();
      attempt.result = result;
      job.status = 'completed';
      
      // Update metrics
      const metrics = this.metrics.get(queue.name)!;
      metrics.completed++;
      metrics.totalTime += Date.now() - startTime;
      
      // Update database
      if (job.type === 'enrich' && job.data.jobId) {
        await db
          .update(enrichmentJobs)
          .set({
            status: 'completed',
            result,
            completedAt: new Date()
          })
          .where(eq(enrichmentJobs.id, job.data.jobId));
      }
      
      console.log(`[Queue] Job ${job.id} completed successfully`);
      this.emit('job-completed', { queue: queue.name, job, result });
      
      // Remove from queue
      const index = queue.jobs.indexOf(job);
      if (index > -1) {
        queue.jobs.splice(index, 1);
      }
      
    } catch (error: any) {
      attempt.completedAt = new Date();
      attempt.error = error.message;
      job.retryCount++;
      
      console.error(`[Queue] Job ${job.id} failed:`, error);
      
      // Update metrics
      const metrics = this.metrics.get(queue.name)!;
      metrics.failed++;
      
      // Determine if should retry
      if (job.retryCount < job.maxRetries) {
        // Calculate retry delay
        const delay = this.calculateRetryDelay(job.retryCount, queue.retryStrategy);
        job.scheduledFor = new Date(Date.now() + delay);
        job.status = 'pending';
        
        console.log(`[Queue] Job ${job.id} scheduled for retry in ${delay}ms`);
        
        // Move to retry queue
        if (queue.name !== 'enrich.retry') {
          const retryQueue = this.queues.get('enrich.retry')!;
          retryQueue.jobs.push(job);
          const index = queue.jobs.indexOf(job);
          if (index > -1) {
            queue.jobs.splice(index, 1);
          }
        }
        
        this.emit('job-retry', { queue: queue.name, job, delay });
      } else {
        // Max retries exceeded
        job.status = 'failed';
        
        // Update database
        if (job.type === 'enrich' && job.data.jobId) {
          await db
            .update(enrichmentJobs)
            .set({
              status: 'failed',
              error: error.message,
              completedAt: new Date()
            })
            .where(eq(enrichmentJobs.id, job.data.jobId));
        }
        
        console.error(`[Queue] Job ${job.id} failed permanently after ${job.retryCount} retries`);
        this.emit('job-failed', { queue: queue.name, job, error: error.message });
        
        // Remove from queue
        const index = queue.jobs.indexOf(job);
        if (index > -1) {
          queue.jobs.splice(index, 1);
        }
      }
    }
  }
  
  /**
   * Process enrichment job
   */
  private async processEnrichmentJob(job: QueuedJob): Promise<any> {
    const { leadId, options = {} } = job.data;
    
    // Fetch lead data
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }
    
    // Execute enrichment
    const result = await waterfallEnrichmentOrchestrator.enrichLead(lead, options);
    
    // Update lead with enriched data
    await db
      .update(leads)
      .set({
        ...result.enrichedData,
        isEnriched: true,
        lastEnrichedAt: new Date()
      })
      .where(eq(leads.id, leadId));
    
    // Store costs
    if (result.totalCost > 0) {
      await db.insert(enrichmentCosts).values({
        jobId: job.data.jobId,
        service: 'waterfall',
        apiCall: `enrich_${leadId}`,
        cost: String(result.totalCost),
        response: result,
        timestamp: new Date()
      });
    }
    
    return result;
  }
  
  /**
   * Process ingestion job
   */
  private async processIngestionJob(job: QueuedJob): Promise<any> {
    const { sourceId, config } = job.data;
    
    const ingestionJob = await bulkDataIngestionService.ingestFromSource(sourceId, config);
    
    // Wait for completion (simplified - would normally track async)
    return ingestionJob;
  }
  
  /**
   * Process deduplication job
   */
  private async processDeduplicationJob(job: QueuedJob): Promise<any> {
    const { jobId } = job.data;
    
    return await leadDeduplicationService.batchDeduplicate(jobId);
  }
  
  /**
   * Process verification job
   */
  private async processVerificationJob(job: QueuedJob): Promise<any> {
    // Placeholder for verification logic
    return { verified: true };
  }
  
  /**
   * Process export job
   */
  private async processExportJob(job: QueuedJob): Promise<any> {
    // Placeholder for export logic
    return { exported: true };
  }
  
  /**
   * Check and enforce rate limits
   */
  private async checkRateLimit(job: QueuedJob): Promise<void> {
    if (job.type !== 'enrich') return;
    
    const service = job.data.service;
    if (!service) return;
    
    const rateLimit = this.rateLimits.get(service);
    if (!rateLimit) return;
    
    // Reset if window expired
    if (new Date() > rateLimit.resetAt) {
      rateLimit.current = 0;
      rateLimit.resetAt = new Date(Date.now() + rateLimit.window);
    }
    
    // Check if limit exceeded
    if (rateLimit.current >= rateLimit.limit) {
      const waitTime = rateLimit.resetAt.getTime() - Date.now();
      console.log(`[Queue] Rate limit exceeded for ${service}, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Reset after waiting
      rateLimit.current = 0;
      rateLimit.resetAt = new Date(Date.now() + rateLimit.window);
    }
    
    // Increment current count
    rateLimit.current++;
  }
  
  /**
   * Calculate retry delay based on strategy
   */
  private calculateRetryDelay(retryCount: number, strategy: RetryStrategy): number {
    let delay: number;
    
    switch (strategy.type) {
      case 'exponential':
        delay = Math.min(
          strategy.initialDelay * Math.pow(strategy.factor, retryCount - 1),
          strategy.maxDelay
        );
        break;
        
      case 'linear':
        delay = Math.min(
          strategy.initialDelay + (strategy.initialDelay * strategy.factor * (retryCount - 1)),
          strategy.maxDelay
        );
        break;
        
      case 'fixed':
        delay = strategy.initialDelay;
        break;
        
      default:
        delay = strategy.initialDelay;
    }
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }
  
  /**
   * Load pending jobs from database
   */
  private async loadPendingJobs() {
    try {
      const pendingJobs = await db
        .select()
        .from(enrichmentJobs)
        .where(or(
          eq(enrichmentJobs.status, 'pending'),
          eq(enrichmentJobs.status, 'processing')
        ))
        .limit(1000);
      
      for (const dbJob of pendingJobs) {
        const queueName = dbJob.priority === 'high' ? 'enrich.high' : 
                         dbJob.priority === 'low' ? 'enrich.bulk' : 
                         'enrich.standard';
        
        await this.addJob(queueName, {
          type: 'enrich',
          priority: dbJob.priority as any,
          data: {
            leadId: dbJob.leadId,
            batchId: dbJob.batchId,
            options: dbJob.enrichmentOptions,
            source: dbJob.source,
            userId: dbJob.userId,
            jobId: dbJob.id
          },
          retryCount: dbJob.retryCount,
          maxRetries: dbJob.maxRetries
        });
      }
      
      console.log(`[Queue] Loaded ${pendingJobs.length} pending jobs from database`);
    } catch (error) {
      console.error('[Queue] Error loading pending jobs:', error);
    }
  }
  
  /**
   * Start queue processors
   */
  private startQueueProcessors() {
    for (const [queueName, queue] of Array.from(this.queues)) {
      // Process queue every 2 seconds
      const interval = setInterval(() => {
        this.processQueue(queueName);
      }, 2000);
      
      this.processingIntervals.set(queueName, interval);
    }
    
    console.log('[Queue] Started queue processors');
  }
  
  /**
   * Schedule nightly bulk verification
   */
  scheduleNightlyVerification() {
    // Run at 2 AM every night
    const now = new Date();
    const night = new Date();
    night.setHours(2, 0, 0, 0);
    
    if (night <= now) {
      night.setDate(night.getDate() + 1);
    }
    
    const delay = night.getTime() - now.getTime();
    
    setTimeout(() => {
      this.runNightlyVerification();
      // Schedule next run
      setInterval(() => {
        this.runNightlyVerification();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, delay);
    
    console.log(`[Queue] Nightly verification scheduled for ${night.toISOString()}`);
  }
  
  /**
   * Run nightly bulk verification
   */
  private async runNightlyVerification() {
    console.log('[Queue] Starting nightly bulk verification');
    
    try {
      // Get all leads that haven't been verified in 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const staleLeads = await db
        .select()
        .from(leads)
        .where(or(
          isNull(leads.lastEnrichedAt),
          lte(leads.lastEnrichedAt, thirtyDaysAgo)
        ))
        .limit(1000);
      
      // Add to bulk queue
      for (const lead of staleLeads) {
        await this.addJob('enrich.bulk', {
          type: 'verify',
          priority: 'low',
          data: {
            leadId: lead.id,
            source: 'nightly_verification'
          },
          retryCount: 0,
          maxRetries: 1
        });
      }
      
      console.log(`[Queue] Added ${staleLeads.length} leads for nightly verification`);
    } catch (error) {
      console.error('[Queue] Error in nightly verification:', error);
    }
  }
  
  /**
   * Get queue metrics
   */
  getQueueMetrics(): QueueMetrics[] {
    const metrics: QueueMetrics[] = [];
    
    for (const [queueName, queue] of Array.from(this.queues)) {
      const queueMetrics = this.metrics.get(queueName)!;
      const elapsedMinutes = (Date.now() - queueMetrics.startTime.getTime()) / 60000;
      
      metrics.push({
        queueName,
        pendingJobs: queue.jobs.filter((j: QueuedJob) => j.status === 'pending').length,
        processingJobs: queue.jobs.filter((j: QueuedJob) => j.status === 'processing').length,
        completedJobs: queueMetrics.completed,
        failedJobs: queueMetrics.failed,
        avgProcessingTime: queueMetrics.completed > 0 
          ? queueMetrics.totalTime / queueMetrics.completed 
          : 0,
        successRate: queueMetrics.completed + queueMetrics.failed > 0
          ? queueMetrics.completed / (queueMetrics.completed + queueMetrics.failed)
          : 0,
        throughput: elapsedMinutes > 0 
          ? queueMetrics.completed / elapsedMinutes 
          : 0
      });
    }
    
    return metrics;
  }
  
  /**
   * Get job by ID
   */
  getJob(jobId: string): QueuedJob | undefined {
    return this.activeJobs.get(jobId);
  }
  
  /**
   * Cancel job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.status === 'completed') {
      return false;
    }
    
    // Remove from queue
    for (const queue of Array.from(this.queues.values())) {
      const index = queue.jobs.findIndex((j: QueuedJob) => j.id === jobId);
      if (index > -1) {
        queue.jobs.splice(index, 1);
        break;
      }
    }
    
    // Update database
    if (job.type === 'enrich' && job.data.jobId) {
      await db
        .update(enrichmentJobs)
        .set({
          status: 'failed',
          error: 'Cancelled by user',
          completedAt: new Date()
        })
        .where(eq(enrichmentJobs.id, job.data.jobId));
    }
    
    this.activeJobs.delete(jobId);
    
    console.log(`[Queue] Job ${jobId} cancelled`);
    this.emit('job-cancelled', { job });
    
    return true;
  }
  
  /**
   * Clear completed jobs
   */
  clearCompletedJobs() {
    for (const queue of Array.from(this.queues.values())) {
      queue.jobs = queue.jobs.filter((j: QueuedJob) => j.status !== 'completed' && j.status !== 'failed');
    }
    
    // Clear from active jobs map
    for (const [id, job] of Array.from(this.activeJobs)) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.activeJobs.delete(id);
      }
    }
  }
  
  /**
   * Cleanup
   */
  destroy() {
    for (const interval of Array.from(this.processingIntervals.values())) {
      clearInterval(interval);
    }
  }
}

// Export singleton instance
export const enrichmentQueueService = new EnrichmentQueueService();

// Schedule nightly verification
enrichmentQueueService.scheduleNightlyVerification();