import { Lead, InsertLead } from "@shared/schema";
import { storage } from "../storage";
import { leadCompletionAnalyzer } from "./lead-completion-analyzer";
import { ComprehensiveLeadEnricher, EnrichmentResult, EnrichmentOptions } from "./comprehensive-lead-enricher";
import { eventBus } from "./event-bus";

interface QueueItem {
  id: string;
  leadId: string;
  leadData: Partial<Lead | InsertLead>;
  priority: 'high' | 'medium' | 'low';
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  enrichmentOptions?: EnrichmentOptions;
  source: 'upload' | 'view' | 'manual' | 'scheduled' | 'api';
  userId?: string;
  batchId?: string;
}

interface RateLimitConfig {
  perplexity: { requestsPerMinute: number; currentCount: number; resetTime: Date };
  hunter: { requestsPerMinute: number; currentCount: number; resetTime: Date };
  numverify: { requestsPerMinute: number; currentCount: number; resetTime: Date };
  openai: { requestsPerMinute: number; currentCount: number; resetTime: Date };
}

interface EnrichmentStats {
  totalProcessed: number;
  successful: number;
  failed: number;
  pending: number;
  averageProcessingTime: number;
  lastProcessedAt?: Date;
  errorRate: number;
  successRate: number;
}

export class EnrichmentQueue {
  private queue: Map<string, QueueItem> = new Map();
  private processing: Set<string> = new Set();
  private enricher: ComprehensiveLeadEnricher;
  private isProcessing: boolean = false;
  private processInterval?: NodeJS.Timeout;
  private stats: EnrichmentStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    pending: 0,
    averageProcessingTime: 0,
    errorRate: 0,
    successRate: 0
  };
  
  private rateLimits: RateLimitConfig = {
    perplexity: { requestsPerMinute: 20, currentCount: 0, resetTime: new Date() },
    hunter: { requestsPerMinute: 50, currentCount: 0, resetTime: new Date() },
    numverify: { requestsPerMinute: 60, currentCount: 0, resetTime: new Date() },
    openai: { requestsPerMinute: 60, currentCount: 0, resetTime: new Date() }
  };
  
  private readonly BATCH_SIZE = 5; // Process 5 items at a time
  private readonly PROCESS_INTERVAL = 5000; // Check queue every 5 seconds
  private readonly MAX_CONCURRENT = 3; // Max concurrent enrichment processes
  
  constructor() {
    this.enricher = new ComprehensiveLeadEnricher();
    this.startProcessing();
    
    // Register event listeners
    eventBus.on('lead:uploaded', this.handleLeadUploaded.bind(this));
    eventBus.on('lead:viewed', this.handleLeadViewed.bind(this));
    eventBus.on('lead:enrichment-request', this.handleEnrichmentRequest.bind(this));
    
    console.log('[EnrichmentQueue] Initialized and started processing');
  }
  
  /**
   * Add a lead to the enrichment queue
   */
  async addToQueue(
    leadData: Partial<Lead | InsertLead>,
    priority: 'high' | 'medium' | 'low' = 'medium',
    source: QueueItem['source'] = 'manual',
    options?: {
      userId?: string;
      batchId?: string;
      enrichmentOptions?: EnrichmentOptions;
      maxRetries?: number;
    }
  ): Promise<string> {
    const queueId = this.generateQueueId();
    
    // Analyze the lead to determine if it needs enrichment
    const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
    
    if (analysis.enrichmentPriority === 'none') {
      console.log(`[EnrichmentQueue] Lead ${leadData.id} doesn't need enrichment (${analysis.completionScore}% complete)`);
      return queueId;
    }
    
    // Auto-adjust priority based on completion analysis
    if (analysis.enrichmentPriority === 'high' && priority === 'medium') {
      priority = 'high';
    }
    
    const queueItem: QueueItem = {
      id: queueId,
      leadId: leadData.id || '',
      leadData,
      priority,
      retryCount: 0,
      maxRetries: options?.maxRetries || 3,
      status: 'pending',
      createdAt: new Date(),
      enrichmentOptions: options?.enrichmentOptions,
      source,
      userId: options?.userId,
      batchId: options?.batchId
    };
    
    this.queue.set(queueId, queueItem);
    this.stats.pending++;
    
    console.log(`[EnrichmentQueue] Added lead ${leadData.id} to queue with priority ${priority}`);
    
    // If high priority, trigger immediate processing
    if (priority === 'high') {
      this.processQueue();
    }
    
    // Emit event for tracking
    eventBus.emit('enrichment:queued', {
      queueId,
      leadId: leadData.id,
      priority,
      source,
      analysis
    });
    
    return queueId;
  }
  
  /**
   * Start the queue processing loop
   */
  private startProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }
    
    this.processInterval = setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue();
      }
    }, this.PROCESS_INTERVAL);
    
    console.log('[EnrichmentQueue] Started processing loop');
  }
  
  /**
   * Process items from the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processing.size >= this.MAX_CONCURRENT) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Get items to process, sorted by priority
      const itemsToProcess = this.getNextItems();
      
      if (itemsToProcess.length === 0) {
        this.isProcessing = false;
        return;
      }
      
      // Process items in parallel (up to BATCH_SIZE)
      const promises = itemsToProcess.map(item => this.processItem(item));
      await Promise.allSettled(promises);
      
    } catch (error) {
      console.error('[EnrichmentQueue] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Get next items from queue based on priority and rate limits
   */
  private getNextItems(): QueueItem[] {
    const items: QueueItem[] = [];
    const pendingItems = Array.from(this.queue.values())
      .filter(item => item.status === 'pending' && !this.processing.has(item.id))
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        // Then by creation time
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    
    // Check rate limits and select items
    for (const item of pendingItems) {
      if (items.length >= this.BATCH_SIZE) break;
      if (this.processing.size >= this.MAX_CONCURRENT) break;
      
      // Check if we can process based on rate limits
      if (this.canProcessBasedOnRateLimits()) {
        items.push(item);
        this.processing.add(item.id);
      }
    }
    
    return items;
  }
  
  /**
   * Process a single queue item
   */
  private async processItem(item: QueueItem): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`[EnrichmentQueue] Processing item ${item.id} for lead ${item.leadId}`);
      
      // Update status
      item.status = 'processing';
      item.processedAt = new Date();
      
      // Update rate limit counters
      this.updateRateLimitCounters();
      
      // Perform enrichment
      const result = await this.enricher.enrichSingleLead(
        item.leadData,
        item.enrichmentOptions || {}
      );
      
      // Save enriched data
      await this.saveEnrichedData(item, result);
      
      // Update item status
      item.status = 'completed';
      item.completedAt = new Date();
      
      // Update stats
      this.stats.successful++;
      this.stats.totalProcessed++;
      this.updateAverageProcessingTime(Date.now() - startTime);
      
      console.log(`[EnrichmentQueue] Successfully enriched lead ${item.leadId}`);
      
      // Emit success event
      eventBus.emit('enrichment:completed', {
        queueId: item.id,
        leadId: item.leadId,
        result,
        processingTime: Date.now() - startTime
      });
      
    } catch (error) {
      console.error(`[EnrichmentQueue] Error processing item ${item.id}:`, error);
      
      item.retryCount++;
      item.error = error instanceof Error ? error.message : String(error);
      
      if (item.retryCount < item.maxRetries) {
        // Retry with exponential backoff
        item.status = 'pending';
        const backoffDelay = Math.pow(2, item.retryCount) * 1000;
        
        setTimeout(() => {
          this.processing.delete(item.id);
        }, backoffDelay);
        
        console.log(`[EnrichmentQueue] Will retry item ${item.id} in ${backoffDelay}ms (attempt ${item.retryCount}/${item.maxRetries})`);
        
      } else {
        // Max retries reached
        item.status = 'failed';
        item.completedAt = new Date();
        
        this.stats.failed++;
        this.stats.totalProcessed++;
        
        console.error(`[EnrichmentQueue] Max retries reached for item ${item.id}`);
        
        // Emit failure event
        eventBus.emit('enrichment:failed', {
          queueId: item.id,
          leadId: item.leadId,
          error: item.error,
          retryCount: item.retryCount
        });
      }
      
    } finally {
      // Remove from processing set
      if (item.status !== 'pending') {
        this.processing.delete(item.id);
        
        // Remove from queue if completed or failed
        if (item.status === 'completed' || item.status === 'failed') {
          this.queue.delete(item.id);
          this.stats.pending--;
        }
      }
    }
  }
  
  /**
   * Save enriched data to database
   */
  private async saveEnrichedData(item: QueueItem, result: EnrichmentResult): Promise<void> {
    if (!item.leadId) return;
    
    try {
      // Prepare update data
      const updateData: Partial<InsertLead> = {
        // Basic fields
        businessName: result.businessName || item.leadData.businessName,
        ownerName: result.ownerName || item.leadData.ownerName,
        email: result.email || item.leadData.email,
        phone: result.phone || item.leadData.phone,
        secondaryPhone: result.secondaryPhone || item.leadData.secondaryPhone,
        
        // Business details
        industry: result.industry || item.leadData.industry,
        annualRevenue: result.annualRevenue || item.leadData.annualRevenue,
        estimatedRevenue: result.estimatedRevenue || item.leadData.estimatedRevenue,
        revenueConfidence: result.revenueConfidence || item.leadData.revenueConfidence,
        requestedAmount: result.requestedAmount || item.leadData.requestedAmount,
        timeInBusiness: result.timeInBusiness || item.leadData.timeInBusiness,
        yearsInBusiness: result.yearsInBusiness || item.leadData.yearsInBusiness,
        creditScore: result.creditScore || item.leadData.creditScore,
        
        // Online presence
        websiteUrl: result.websiteUrl || item.leadData.websiteUrl,
        linkedinUrl: result.linkedinUrl || item.leadData.linkedinUrl,
        
        // Company info
        companySize: result.companySize || item.leadData.companySize,
        employeeCount: result.employeeCount || item.leadData.employeeCount,
        yearFounded: result.yearFounded || item.leadData.yearFounded,
        naicsCode: result.naicsCode || item.leadData.naicsCode,
        
        // Location
        stateCode: result.stateCode || item.leadData.stateCode,
        city: result.city || item.leadData.city,
        fullAddress: result.fullAddress,
        
        // Additional insights
        ownerBackground: result.ownerBackground,
        businessDescription: result.businessDescription,
        researchInsights: result.researchInsights || item.leadData.researchInsights,
        
        // Enrichment tracking
        isEnriched: true,
        lastEnrichedAt: new Date(),
        enrichmentConfidence: result.confidenceScores?.overall,
        enrichmentStatus: 'completed',
        enrichmentSources: result.enrichmentMetadata?.sources || [],
        
        // Intelligence score will be recalculated after update
        intelligenceScore: result.intelligenceScore
      };
      
      // Update the lead
      await storage.updateLead(item.leadId, updateData);
      
      // Store enrichment history
      await storage.createLeadEnrichment({
        leadId: item.leadId,
        sourceApi: result.enrichmentMetadata?.sources.join(',') || 'comprehensive',
        fieldsEnriched: result.enrichmentMetadata?.fieldsEnriched || [],
        dataQuality: result.enrichmentMetadata?.dataQuality || 'medium',
        confidenceScore: result.confidenceScores?.overall || 0,
        responseTime: (item.completedAt?.getTime() || Date.now()) - item.createdAt.getTime(),
        success: true,
        errorMessage: null
      });
      
      // Recalculate intelligence score with new data
      await storage.calculateAndUpdateIntelligenceScore(item.leadId);
      
      console.log(`[EnrichmentQueue] Saved enriched data for lead ${item.leadId}`);
      
    } catch (error) {
      console.error(`[EnrichmentQueue] Error saving enriched data for lead ${item.leadId}:`, error);
      throw error;
    }
  }
  
  /**
   * Check if we can process based on rate limits
   */
  private canProcessBasedOnRateLimits(): boolean {
    const now = new Date();
    
    // Check and reset rate limits if needed
    for (const [api, limits] of Object.entries(this.rateLimits)) {
      if (now > limits.resetTime) {
        limits.currentCount = 0;
        limits.resetTime = new Date(now.getTime() + 60000); // Reset in 1 minute
      }
      
      // Check if we've hit the limit
      if (limits.currentCount >= limits.requestsPerMinute) {
        console.log(`[EnrichmentQueue] Rate limit reached for ${api}`);
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Update rate limit counters
   */
  private updateRateLimitCounters(): void {
    // Increment counters for APIs we'll use
    this.rateLimits.perplexity.currentCount++;
    this.rateLimits.hunter.currentCount++;
    this.rateLimits.numverify.currentCount++;
    this.rateLimits.openai.currentCount++;
  }
  
  /**
   * Update average processing time
   */
  private updateAverageProcessingTime(processingTime: number): void {
    const totalTime = this.stats.averageProcessingTime * (this.stats.successful - 1) + processingTime;
    this.stats.averageProcessingTime = totalTime / this.stats.successful;
    this.stats.lastProcessedAt = new Date();
    this.stats.successRate = (this.stats.successful / this.stats.totalProcessed) * 100;
    this.stats.errorRate = (this.stats.failed / this.stats.totalProcessed) * 100;
  }
  
  /**
   * Handle lead uploaded event
   */
  private async handleLeadUploaded(event: any): Promise<void> {
    const { leadId, leadData, batchId, userId } = event;
    
    // Analyze the lead
    const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
    
    // Auto-enrich if incomplete
    if (analysis.completionScore < 80 && analysis.canBeAutoEnriched) {
      await this.addToQueue(
        leadData,
        analysis.enrichmentPriority as 'high' | 'medium' | 'low',
        'upload',
        { userId, batchId }
      );
    }
  }
  
  /**
   * Handle lead viewed event
   */
  private async handleLeadViewed(event: any): Promise<void> {
    const { leadId, leadData, userId } = event;
    
    // Check if data is stale (not enriched in last 30 days)
    const lastEnrichedAt = leadData.lastEnrichedAt ? new Date(leadData.lastEnrichedAt) : null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (!lastEnrichedAt || lastEnrichedAt < thirtyDaysAgo) {
      // Analyze the lead
      const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
      
      // Queue for enrichment if incomplete
      if (analysis.completionScore < 90 && analysis.canBeAutoEnriched) {
        await this.addToQueue(
          leadData,
          'low', // Low priority for view-triggered enrichment
          'view',
          { userId }
        );
      }
    }
  }
  
  /**
   * Handle manual enrichment request
   */
  private async handleEnrichmentRequest(event: any): Promise<void> {
    const { leadId, leadData, priority = 'high', userId } = event;
    
    await this.addToQueue(
      leadData,
      priority,
      'manual',
      { userId }
    );
  }
  
  /**
   * Get queue statistics
   */
  getStats(): EnrichmentStats & { queueLength: number; processing: number } {
    return {
      ...this.stats,
      queueLength: this.queue.size,
      processing: this.processing.size
    };
  }
  
  /**
   * Get queue items by status
   */
  getQueueItems(status?: QueueItem['status']): QueueItem[] {
    const items = Array.from(this.queue.values());
    if (status) {
      return items.filter(item => item.status === status);
    }
    return items;
  }
  
  /**
   * Clear completed/failed items from queue
   */
  clearCompleted(): number {
    let cleared = 0;
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'completed' || item.status === 'failed') {
        this.queue.delete(id);
        cleared++;
      }
    }
    console.log(`[EnrichmentQueue] Cleared ${cleared} completed/failed items`);
    return cleared;
  }
  
  /**
   * Stop processing
   */
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }
    this.isProcessing = false;
    console.log('[EnrichmentQueue] Stopped processing');
  }
  
  /**
   * Resume processing
   */
  resumeProcessing(): void {
    this.startProcessing();
    console.log('[EnrichmentQueue] Resumed processing');
  }
  
  /**
   * Generate unique queue ID
   */
  private generateQueueId(): string {
    return `enrich_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Queue all incomplete leads for enrichment
   */
  async queueIncompleteLeads(options?: {
    minCompletionScore?: number;
    maxLeads?: number;
    priority?: 'high' | 'medium' | 'low';
  }): Promise<number> {
    const minCompletion = options?.minCompletionScore || 80;
    const maxLeads = options?.maxLeads || 100;
    const priority = options?.priority || 'low';
    
    console.log(`[EnrichmentQueue] Queuing incomplete leads (< ${minCompletion}% complete)`);
    
    try {
      // Get leads that need enrichment
      const leads = await storage.getLeadsNeedingEnrichment(minCompletion, maxLeads);
      
      let queued = 0;
      for (const lead of leads) {
        const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(lead);
        
        if (analysis.canBeAutoEnriched) {
          await this.addToQueue(lead, priority, 'scheduled');
          queued++;
        }
      }
      
      console.log(`[EnrichmentQueue] Queued ${queued} leads for enrichment`);
      return queued;
      
    } catch (error) {
      console.error('[EnrichmentQueue] Error queuing incomplete leads:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const enrichmentQueue = new EnrichmentQueue();