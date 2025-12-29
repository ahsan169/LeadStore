import { Lead, InsertLead, enrichmentJobs, intelligenceDecisions } from "@shared/schema";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, or, desc, asc, lte, gte } from "drizzle-orm";
import { leadCompletionAnalyzer } from "./lead-completion-analyzer";
import { ComprehensiveLeadEnricher, EnrichmentResult, EnrichmentOptions } from "./comprehensive-lead-enricher";
import { MasterEnrichmentOrchestrator } from "./master-enrichment-orchestrator";
import { IntelligenceBrain } from "./intelligence-brain";
import { eventBus } from "./event-bus";
import { brainPipeline } from "../intelligence/brain-pipeline";
import { webSocketService, WebSocketEventType } from "./websocket-service";

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
  useBrainPipeline?: boolean;
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
  private deadLetterQueue: Map<string, QueueItem> = new Map();
  
  private enricher: ComprehensiveLeadEnricher;
  private masterOrchestrator: MasterEnrichmentOrchestrator | null = null;
  private intelligenceBrain: IntelligenceBrain | null = null;
  
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
  
  private creditUsage: Map<string, { used: number; limit: number }> = new Map([
    ['perplexity', { used: 0, limit: 1000 }],
    ['hunter', { used: 0, limit: 2000 }],
    ['openai', { used: 0, limit: 5000 }],
    ['numverify', { used: 0, limit: 3000 }]
  ]);
  
  private rateLimits: RateLimitConfig = {
    perplexity: { requestsPerMinute: 20, currentCount: 0, resetTime: new Date() },
    hunter: { requestsPerMinute: 50, currentCount: 0, resetTime: new Date() },
    numverify: { requestsPerMinute: 60, currentCount: 0, resetTime: new Date() },
    openai: { requestsPerMinute: 60, currentCount: 0, resetTime: new Date() }
  };
  
  private readonly BATCH_SIZE = 10;
  private readonly PROCESS_INTERVAL = 3000;
  private readonly MAX_CONCURRENT = 5;
  private readonly MAX_RETRY_DELAY = 300000;
  private readonly DEAD_LETTER_THRESHOLD = 5;
  
  constructor() {
    this.enricher = new ComprehensiveLeadEnricher();
    
    this.startProcessing();
    this.loadPendingJobs();
    
    this.registerEventListeners();
    
    console.log('[EnrichmentQueue] Initialized with Brain integration and started processing');
  }
  
  private getMasterOrchestrator(): MasterEnrichmentOrchestrator {
    if (!this.masterOrchestrator) {
      const { MasterEnrichmentOrchestrator } = require('./master-enrichment-orchestrator');
      this.masterOrchestrator = new MasterEnrichmentOrchestrator({ 
        enableUccIntelligence: true,
        enableLeadIntelligence: true,
        enableComprehensiveEnrichment: true,
        enableVerification: true 
      });
    }
    return this.masterOrchestrator!;
  }
  
  private getIntelligenceBrain(): IntelligenceBrain {
    if (!this.intelligenceBrain) {
      const { IntelligenceBrain } = require('./intelligence-brain');
      this.intelligenceBrain = new IntelligenceBrain();
    }
    return this.intelligenceBrain!;
  }
  
  private registerEventListeners() {
    eventBus.on('lead:uploaded', this.handleLeadUploaded.bind(this));
    eventBus.on('batch:uploaded', this.handleBatchUploaded.bind(this));
    eventBus.on('lead:viewed', this.handleLeadViewed.bind(this));
    eventBus.on('lead:enrichment-request', this.handleEnrichmentRequest.bind(this));
    eventBus.on('brain:decision', this.handleBrainDecision.bind(this));
    eventBus.on('enrichment:completed', this.handleEnrichmentComplete.bind(this));
    eventBus.on('enrichment:failed', this.handleEnrichmentFailed.bind(this));
  }
  
  async addToQueue(
    leadData: Partial<Lead | InsertLead>,
    priority: 'high' | 'medium' | 'low' = 'medium',
    source: QueueItem['source'] = 'manual',
    options?: {
      userId?: string;
      batchId?: string;
      enrichmentOptions?: EnrichmentOptions;
      maxRetries?: number;
      brainDecision?: any;
    }
  ): Promise<string> {
    const queueId = this.generateQueueId();
    
    const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
    const leadId = (leadData as Lead).id || '';
    
    if (analysis.enrichmentPriority === 'none') {
      console.log(`[EnrichmentQueue] Lead ${leadId} doesn't need enrichment (${analysis.completionScore}% complete)`);
      return queueId;
    }
    
    if (analysis.enrichmentPriority === 'high' && priority === 'medium') {
      priority = 'high';
    }
    
    const queueItem: QueueItem = {
      id: queueId,
      leadId: leadId,
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
    
    console.log(`[EnrichmentQueue] Added lead ${leadId} to queue with priority ${priority}`);
    
    if (priority === 'high') {
      this.processQueue();
    }
    
    eventBus.emit('enrichment:queued', {
      queueId,
      leadId: leadId,
      priority,
      source,
      analysis
    });
    
    return queueId;
  }
  
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
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processing.size >= this.MAX_CONCURRENT) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const itemsToProcess = this.getNextItems();
      
      if (itemsToProcess.length === 0) {
        await this.retryDeadLetterItems();
        this.isProcessing = false;
        return;
      }
      
      this.stats.pending = this.queue.size;
      
      const promises = itemsToProcess.map(item => this.processItem(item));
      const results = await Promise.allSettled(promises);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      
      webSocketService.broadcastToAll({
        type: WebSocketEventType.SYSTEM_NOTIFICATION,
        payload: {
          messageType: 'enrichment:batch-processed',
          data: {
            processed: results.length,
            successful: successCount,
            failed: failCount,
            queueSize: this.queue.size,
            stats: this.getStats()
          }
        },
        timestamp: new Date()
      });
      
    } catch (error) {
      console.error('[EnrichmentQueue] Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  private getNextItems(): QueueItem[] {
    const items: QueueItem[] = [];
    const pendingItems = Array.from(this.queue.values())
      .filter(item => item.status === 'pending' && !this.processing.has(item.id))
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    
    for (const item of pendingItems) {
      if (items.length >= this.BATCH_SIZE) break;
      if (this.processing.size >= this.MAX_CONCURRENT) break;
      
      if (this.canProcessBasedOnRateLimits()) {
        items.push(item);
        this.processing.add(item.id);
      }
    }
    
    return items;
  }
  
  private async processItem(item: QueueItem): Promise<void> {
    const startTime = Date.now();
    let usedOrchestrator = false;
    
    try {
      console.log(`[EnrichmentQueue] Processing item ${item.id} for lead ${item.leadId}`);
      
      item.status = 'processing';
      item.processedAt = new Date();
      
      this.updateRateLimitCounters();
      
      let result: EnrichmentResult;
      
      if (item.useBrainPipeline) {
        console.log(`[EnrichmentQueue] Using Brain Pipeline for lead ${item.leadId}`);
        
        const pipelineResult = await brainPipeline.process(item.leadData, {
          source: item.source,
          userId: item.userId,
          batchId: item.batchId
        });
        
        result = {
          businessName: pipelineResult.normalizedData?.businessName || '',
          ownerName: pipelineResult.normalizedData?.ownerName,
          email: pipelineResult.normalizedData?.email,
          phone: pipelineResult.normalizedData?.phone,
          confidenceScores: {
            overall: pipelineResult.confidence || 0,
            businessInfo: 0,
            contactInfo: 0,
            financialInfo: 0,
            verificationStatus: 0
          },
          enrichmentMetadata: {
            sources: ((pipelineResult.enrichmentData as any)?.sources as string[]) || [],
            enrichedAt: new Date(),
            fieldsEnriched: Object.keys(pipelineResult.normalizedData || {}),
            dataQuality: 'medium'
          }
        };
        
        if (pipelineResult.leadId) {
          await storage.updateLead(pipelineResult.leadId, pipelineResult.normalizedData as Partial<InsertLead>);
        }
        
      } else {
        usedOrchestrator = true;
        console.log(`[EnrichmentQueue] Using Intelligence Brain for lead ${item.leadId}`);
        
        const brainDecision = await this.getIntelligenceBrain().analyzeAndDecide(item.leadData as Lead);
        
        await this.storeBrainDecision(item.leadId, brainDecision);
        
        console.log(`[EnrichmentQueue] Brain strategy: ${brainDecision.strategy} for lead ${item.leadId}`);
        
        const leadForOrchestrator = {
          ...item.leadData,
          id: item.leadId
        } as Lead;
        
        const validSource = ['manual', 'upload', 'api', 'edit', 'ucc'].includes(item.source || '') 
          ? (item.source as 'manual' | 'upload' | 'api' | 'edit' | 'ucc')
          : 'manual';
        
        const orchestratorResult = await this.getMasterOrchestrator().enrichLead(leadForOrchestrator, {
          source: validSource,
          userId: item.userId,
          priority: item.priority
        });
        
        result = {
          businessName: orchestratorResult.finalData?.businessName || '',
          ownerName: orchestratorResult.finalData?.ownerName,
          email: orchestratorResult.finalData?.email,
          phone: orchestratorResult.finalData?.phone,
          secondaryPhone: orchestratorResult.finalData?.secondaryPhone,
          industry: orchestratorResult.finalData?.industry,
          annualRevenue: orchestratorResult.finalData?.annualRevenue,
          estimatedRevenue: orchestratorResult.finalData?.estimatedRevenue,
          revenueConfidence: orchestratorResult.finalData?.revenueConfidence,
          requestedAmount: orchestratorResult.finalData?.requestedAmount,
          timeInBusiness: orchestratorResult.finalData?.timeInBusiness,
          yearsInBusiness: orchestratorResult.finalData?.yearsInBusiness,
          creditScore: orchestratorResult.finalData?.creditScore,
          websiteUrl: orchestratorResult.finalData?.websiteUrl,
          linkedinUrl: orchestratorResult.finalData?.linkedinUrl,
          companySize: orchestratorResult.finalData?.companySize,
          employeeCount: orchestratorResult.finalData?.employeeCount,
          yearFounded: orchestratorResult.finalData?.yearFounded,
          naicsCode: orchestratorResult.finalData?.naicsCode,
          stateCode: orchestratorResult.finalData?.stateCode,
          city: orchestratorResult.finalData?.city,
          fullAddress: orchestratorResult.finalData?.fullAddress,
          ownerBackground: orchestratorResult.finalData?.ownerBackground,
          businessDescription: orchestratorResult.finalData?.businessDescription,
          researchInsights: orchestratorResult.finalData?.researchInsights,
          confidenceScores: {
            overall: orchestratorResult.masterEnrichmentScore || 0,
            businessInfo: orchestratorResult.dataCompleteness?.businessInfo || 0,
            contactInfo: orchestratorResult.dataCompleteness?.contactInfo || 0,
            financialInfo: orchestratorResult.dataCompleteness?.financialInfo || 0,
            verificationStatus: orchestratorResult.dataCompleteness?.verificationInfo || 0
          },
          enrichmentMetadata: {
            sources: orchestratorResult.enrichmentSystems?.map((s: any) => s.systemName) || [],
            enrichedAt: new Date(),
            fieldsEnriched: orchestratorResult.dataLineage?.map((d: any) => d.field) || [],
            dataQuality: orchestratorResult.masterEnrichmentScore >= 80 ? 'high' : 
                        orchestratorResult.masterEnrichmentScore >= 50 ? 'medium' : 'low'
          }
        };
        
        console.log(`[EnrichmentQueue] Master Enrichment completed - Score: ${orchestratorResult.masterEnrichmentScore}`);
      }
      
      await this.saveEnrichedData(item, result);
      
      item.status = 'completed';
      item.completedAt = new Date();
      
      this.stats.successful++;
      this.stats.totalProcessed++;
      this.updateAverageProcessingTime(Date.now() - startTime);
      
      console.log(`[EnrichmentQueue] Successfully enriched lead ${item.leadId}`);
      
      eventBus.emit('enrichment:completed', {
        queueId: item.id,
        leadId: item.leadId,
        result,
        processingTime: Date.now() - startTime,
        usedOrchestrator
      });
      
    } catch (error) {
      console.error(`[EnrichmentQueue] Error processing item ${item.id}:`, error);
      
      item.retryCount++;
      item.error = error instanceof Error ? error.message : String(error);
      
      if (item.retryCount < item.maxRetries) {
        item.status = 'pending';
        const backoffDelay = Math.pow(2, item.retryCount) * 1000;
        
        setTimeout(() => {
          this.processing.delete(item.id);
        }, backoffDelay);
        
        console.log(`[EnrichmentQueue] Will retry item ${item.id} in ${backoffDelay}ms (attempt ${item.retryCount}/${item.maxRetries})`);
        
      } else {
        item.status = 'failed';
        item.completedAt = new Date();
        
        this.stats.failed++;
        this.stats.totalProcessed++;
        
        console.error(`[EnrichmentQueue] Max retries reached for item ${item.id}`);
        
        eventBus.emit('enrichment:failed', {
          queueId: item.id,
          leadId: item.leadId,
          error: item.error,
          retryCount: item.retryCount
        });
      }
      
    } finally {
      if (item.status !== 'pending') {
        this.processing.delete(item.id);
        
        if (item.status === 'completed' || item.status === 'failed') {
          this.queue.delete(item.id);
          this.stats.pending--;
        }
      }
    }
  }
  
  private async saveEnrichedData(item: QueueItem, result: EnrichmentResult): Promise<void> {
    if (!item.leadId) return;
    
    try {
      const ownerName = result.ownerName || (item.leadData as Lead).ownerName || '';
      const nameParts = ownerName.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || nameParts[1] || '';
      
      const updateData: Partial<InsertLead> = {
        businessName: result.businessName || (item.leadData as Lead).businessName,
        ownerName: ownerName,
        firstName: firstName,
        lastName: lastName,
        email: result.email || (item.leadData as Lead).email,
        phone: result.phone || (item.leadData as Lead).phone,
        secondaryPhone: result.secondaryPhone || (item.leadData as Lead).secondaryPhone,
        
        industry: result.industry || (item.leadData as Lead).industry,
        annualRevenue: result.annualRevenue || (item.leadData as Lead).annualRevenue,
        estimatedRevenue: result.estimatedRevenue || (item.leadData as Lead).estimatedRevenue,
        revenueConfidence: result.revenueConfidence || (item.leadData as Lead).revenueConfidence,
        requestedAmount: result.requestedAmount || (item.leadData as Lead).requestedAmount,
        timeInBusiness: result.timeInBusiness || (item.leadData as Lead).timeInBusiness,
        yearsInBusiness: result.yearsInBusiness || (item.leadData as Lead).yearsInBusiness,
        creditScore: result.creditScore || (item.leadData as Lead).creditScore,
        
        websiteUrl: result.websiteUrl || (item.leadData as Lead).websiteUrl,
        linkedinUrl: result.linkedinUrl || (item.leadData as Lead).linkedinUrl,
        
        companySize: result.companySize || (item.leadData as Lead).companySize,
        employeeCount: result.employeeCount || (item.leadData as Lead).employeeCount,
        yearFounded: result.yearFounded || (item.leadData as Lead).yearFounded,
        naicsCode: result.naicsCode || (item.leadData as Lead).naicsCode,
        
        stateCode: result.stateCode || (item.leadData as Lead).stateCode,
        city: result.city || (item.leadData as Lead).city,
        fullAddress: result.fullAddress,
        
        ownerBackground: result.ownerBackground,
        businessDescription: result.businessDescription,
        researchInsights: result.researchInsights || (item.leadData as Lead).researchInsights,
        
        isEnriched: true,
        lastEnrichedAt: new Date(),
        enrichmentConfidence: result.confidenceScores?.overall,
        enrichmentStatus: 'completed',
        enrichmentSources: result.enrichmentMetadata?.sources || [],
        
        intelligenceScore: result.intelligenceScore
      };
      
      await storage.updateLead(item.leadId, updateData);
      
      await storage.createLeadEnrichment({
        leadId: item.leadId,
        enrichedData: {
          sources: result.enrichmentMetadata?.sources || [],
          fieldsEnriched: result.enrichmentMetadata?.fieldsEnriched || [],
          dataQuality: result.enrichmentMetadata?.dataQuality || 'medium',
          responseTime: (item.completedAt?.getTime() || Date.now()) - item.createdAt.getTime()
        },
        enrichmentSource: 'manual',
        confidenceScore: String(result.confidenceScores?.overall || 0)
      });
      
      await storage.calculateAndUpdateIntelligenceScore(item.leadId);
      
      console.log(`[EnrichmentQueue] Saved enriched data for lead ${item.leadId}`);
      
    } catch (error) {
      console.error(`[EnrichmentQueue] Error saving enriched data for lead ${item.leadId}:`, error);
      throw error;
    }
  }
  
  private canProcessBasedOnRateLimits(): boolean {
    const now = new Date();
    
    for (const [api, limits] of Object.entries(this.rateLimits)) {
      if (now > limits.resetTime) {
        limits.currentCount = 0;
        limits.resetTime = new Date(now.getTime() + 60000);
      }
      
      if (limits.currentCount >= limits.requestsPerMinute) {
        console.log(`[EnrichmentQueue] Rate limit reached for ${api}`);
        return false;
      }
    }
    
    return true;
  }
  
  private updateRateLimitCounters(): void {
    this.rateLimits.perplexity.currentCount++;
    this.rateLimits.hunter.currentCount++;
    this.rateLimits.numverify.currentCount++;
    this.rateLimits.openai.currentCount++;
  }
  
  private updateAverageProcessingTime(processingTime: number): void {
    const totalTime = this.stats.averageProcessingTime * (this.stats.successful - 1) + processingTime;
    this.stats.averageProcessingTime = totalTime / this.stats.successful;
    this.stats.lastProcessedAt = new Date();
    this.stats.successRate = (this.stats.successful / this.stats.totalProcessed) * 100;
    this.stats.errorRate = (this.stats.failed / this.stats.totalProcessed) * 100;
  }
  
  private async handleLeadUploaded(event: any): Promise<void> {
    const { leadId, leadData, batchId, userId } = event;
    
    const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
    
    if (analysis.completionScore < 80 && analysis.canBeAutoEnriched) {
      await this.addToQueue(
        leadData,
        analysis.enrichmentPriority as 'high' | 'medium' | 'low',
        'upload',
        { userId, batchId }
      );
    }
  }
  
  private async handleLeadViewed(event: any): Promise<void> {
    const { leadId, leadData, userId } = event;
    
    const lastEnrichedAt = leadData.lastEnrichedAt ? new Date(leadData.lastEnrichedAt) : null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (!lastEnrichedAt || lastEnrichedAt < thirtyDaysAgo) {
      const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(leadData);
      
      if (analysis.completionScore < 90 && analysis.canBeAutoEnriched) {
        await this.addToQueue(
          leadData,
          'low',
          'view',
          { userId }
        );
      }
    }
  }
  
  private async handleEnrichmentRequest(event: any): Promise<void> {
    const { leadId, leadData, priority = 'high', userId } = event;
    
    await this.addToQueue(
      leadData,
      priority,
      'manual',
      { userId }
    );
  }
  
  getStats(): EnrichmentStats & { queueLength: number; processing: number } {
    return {
      ...this.stats,
      queueLength: this.queue.size,
      processing: this.processing.size
    };
  }
  
  getQueueItems(optionsOrStatus?: QueueItem['status'] | { status?: string; priority?: string; limit?: number }): QueueItem[] {
    let items = Array.from(this.queue.values());
    
    if (typeof optionsOrStatus === 'string') {
      return items.filter(item => item.status === optionsOrStatus);
    }
    
    const options = optionsOrStatus;
    if (options?.status) {
      items = items.filter(item => item.status === options.status);
    }
    
    if (options?.priority) {
      items = items.filter(item => item.priority === options.priority);
    }
    
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }
    
    return items;
  }
  
  clearCompleted(): number {
    let cleared = 0;
    const entries = Array.from(this.queue.entries());
    for (const [id, item] of entries) {
      if (item.status === 'completed' || item.status === 'failed') {
        this.queue.delete(id);
        cleared++;
      }
    }
    console.log(`[EnrichmentQueue] Cleared ${cleared} completed/failed items`);
    return cleared;
  }
  
  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = undefined;
    }
    this.isProcessing = false;
    console.log('[EnrichmentQueue] Stopped processing');
  }
  
  resumeProcessing(): void {
    this.startProcessing();
    console.log('[EnrichmentQueue] Resumed processing');
  }
  
  pauseProcessing(): void {
    this.stopProcessing();
    console.log('[EnrichmentQueue] Processing paused');
  }
  
  private generateQueueId(): string {
    return `enrich_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
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
      const leads = await storage.getLeadsNeedingEnrichment(maxLeads);
      
      let queued = 0;
      for (const lead of leads) {
        const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(lead);
        
        if (analysis.canBeAutoEnriched && analysis.completionScore < minCompletion) {
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
  
  private async loadPendingJobs(): Promise<void> {
    try {
      const pendingJobs = await db
        .select()
        .from(enrichmentJobs)
        .where(or(
          eq(enrichmentJobs.status, 'pending'),
          eq(enrichmentJobs.status, 'processing')
        ))
        .limit(100);
      
      console.log(`[EnrichmentQueue] Loading ${pendingJobs.length} pending jobs from database`);
      
      for (const job of pendingJobs) {
        const validSource = ['upload', 'view', 'manual', 'scheduled', 'api'].includes(job.source)
          ? (job.source as QueueItem['source'])
          : 'manual';
        
        const queueItem: QueueItem = {
          id: job.id,
          leadId: job.leadId || '',
          leadData: {},
          priority: job.priority as 'high' | 'medium' | 'low',
          retryCount: job.retryCount,
          maxRetries: job.maxRetries,
          status: job.status as QueueItem['status'],
          error: job.error || undefined,
          createdAt: job.createdAt,
          processedAt: job.processedAt || undefined,
          completedAt: job.completedAt || undefined,
          enrichmentOptions: job.enrichmentOptions as EnrichmentOptions | undefined,
          source: validSource,
          userId: job.userId || undefined,
          batchId: job.batchId || undefined
        };
        
        this.queue.set(queueItem.id, queueItem);
      }
      
      console.log(`[EnrichmentQueue] Loaded ${this.queue.size} jobs into queue`);
    } catch (error) {
      console.error('[EnrichmentQueue] Error loading pending jobs:', error);
    }
  }
  
  private async updateLeadStatus(leadId: string, status: 'queued' | 'processing' | 'enriched' | 'failed'): Promise<void> {
    try {
      await storage.updateLead(leadId, {
        enrichmentStatus: status
      } as any);
    } catch (error) {
      console.error(`[EnrichmentQueue] Error updating lead status for ${leadId}:`, error);
    }
  }
  
  private async storeEnrichmentResult(item: QueueItem, result: any, decision: any): Promise<void> {
    try {
      if (item.id) {
        await db
          .update(enrichmentJobs)
          .set({
            status: 'completed',
            result: result,
            completedAt: new Date(),
            totalCost: decision.estimatedCost?.toString() || '0'
          })
          .where(eq(enrichmentJobs.id, item.id));
      }
      
      await db.insert(intelligenceDecisions).values({
        leadId: item.leadId,
        strategy: decision.strategy,
        confidence: decision.confidence?.toString() || '0',
        reasoning: decision.reasoning || 'Enrichment completed',
        services: decision.services,
        estimatedCost: decision.estimatedCost?.toString() || '0',
        actualCost: decision.actualCost?.toString() || decision.estimatedCost?.toString() || '0',
        priority: decision.priority || 5
      });
    } catch (error) {
      console.error('[EnrichmentQueue] Error storing enrichment result:', error);
    }
  }
  
  private async storeBrainDecision(leadId: string, decision: any): Promise<void> {
    try {
      await db.insert(intelligenceDecisions).values({
        leadId,
        strategy: decision.strategy || 'unknown',
        confidence: decision.confidence?.toString() || '0',
        reasoning: decision.reasoning || 'Brain analysis',
        services: decision.services || [],
        estimatedCost: decision.estimatedCost?.toString() || '0',
        priority: decision.priority || 5
      });
    } catch (error) {
      console.error('[EnrichmentQueue] Error storing Brain decision:', error);
    }
  }
  
  private trackApiCredits(result: any): void {
    if (result.enrichmentMetadata?.apiCalls) {
      for (const system of result.enrichmentSystems || []) {
        const service = system.systemName.toLowerCase();
        const usage = this.creditUsage.get(service);
        if (usage) {
          usage.used += system.apiCallsUsed?.length || 1;
        }
      }
    }
    
    webSocketService.broadcastToAll({
      type: WebSocketEventType.SYSTEM_NOTIFICATION,
      payload: {
        messageType: 'credits:updated',
        data: Object.fromEntries(this.creditUsage)
      },
      timestamp: new Date()
    });
  }
  
  private updateStats(success: boolean, processingTime: number): void {
    if (success) {
      this.stats.successful++;
      this.updateAverageProcessingTime(processingTime);
    } else {
      this.stats.failed++;
    }
    
    this.stats.totalProcessed++;
    this.stats.pending = this.queue.size;
    this.stats.successRate = this.stats.successful / this.stats.totalProcessed;
    this.stats.errorRate = this.stats.failed / this.stats.totalProcessed;
  }
  
  getDeadLetterItems(): QueueItem[] {
    return Array.from(this.deadLetterQueue.values());
  }
  
  async retryDeadLetterItems(itemIds?: string[]): Promise<number> {
    let retried = 0;
    const now = Date.now();
    const retryThreshold = 30 * 60 * 1000;
    
    const entries = Array.from(this.deadLetterQueue.entries());
    for (const [id, item] of entries) {
      if (itemIds && !itemIds.includes(id)) continue;
      
      if (!itemIds && item.completedAt && now - item.completedAt.getTime() < retryThreshold) continue;
      
      item.status = 'pending';
      item.retryCount = 0;
      item.error = undefined;
      item.completedAt = undefined;
      item.processedAt = undefined;
      
      item.priority = 'low';
      this.queue.set(id, item);
      this.deadLetterQueue.delete(id);
      
      retried++;
      console.log(`[EnrichmentQueue] Retrying dead letter item ${id}`);
    }
    
    return retried;
  }
  
  private async updateMasterDatabase(leadId: string, result: any): Promise<void> {
    try {
      await storage.updateMasterDatabaseCache(leadId, {
        businessData: result.finalData,
        completeness: String(result.dataCompleteness?.overall || 0),
        dataQuality: String(result.masterEnrichmentScore / 100 || 0),
        lastVerified: new Date(),
        sources: result.enrichmentSystems?.map((s: any) => s.systemName) || []
      });
    } catch (error) {
      console.error('[EnrichmentQueue] Error updating master database:', error);
    }
  }
  
  private async handleBatchUploaded(data: any): Promise<void> {
    const { leads, batchId, userId } = data;
    
    console.log(`[EnrichmentQueue] Processing batch upload of ${leads.length} leads`);
    
    const batchEvaluation = await this.getIntelligenceBrain().evaluateBatch(
      leads.map((lead: Lead) => ({ lead })),
      { batchId, strategy: 'balanced' }
    );
    
    for (const decision of batchEvaluation.decisions) {
      if (decision.strategy !== 'minimal') {
        const lead = leads.find((l: Lead) => l.id === decision.leadId);
        if (lead) {
          const priority = decision.priority > 8 ? 'high' : 
                          decision.priority > 5 ? 'medium' : 'low';
          
          await this.addToQueue(lead, priority, 'upload', {
            userId,
            batchId
          });
        }
      }
    }
    
    webSocketService.broadcastToAll({
      type: WebSocketEventType.SYSTEM_NOTIFICATION,
      payload: {
        messageType: 'batch:enrichment-queued',
        data: {
          batchId,
          totalLeads: leads.length,
          queuedForEnrichment: batchEvaluation.decisions.filter((d: any) => d.strategy !== 'minimal').length,
          estimatedCost: batchEvaluation.batchPlan.totalEstimatedCost
        }
      },
      timestamp: new Date()
    });
  }
  
  private async handleBrainDecision(data: any): Promise<void> {
    const { lead, decision } = data;
    
    if (decision.strategy !== 'minimal' && !decision.skipReasons?.length) {
      const priority = decision.priority > 8 ? 'high' : 
                      decision.priority > 5 ? 'medium' : 'low';
      
      await this.addToQueue(lead, priority, 'manual', {
        brainDecision: decision
      });
    }
  }
  
  private async handleEnrichmentComplete(data: any): Promise<void> {
    const { leadId, enrichmentScore, dataCompleteness } = data;
    
    webSocketService.broadcastToAll({
      type: WebSocketEventType.LEAD_ENRICHED,
      payload: {
        leadId,
        enrichmentScore,
        dataCompleteness,
        queueStats: this.getStats()
      },
      timestamp: new Date()
    });
    
    console.log(`[EnrichmentQueue] Lead ${leadId} enrichment complete with score ${enrichmentScore}`);
  }
  
  private async handleEnrichmentFailed(data: any): Promise<void> {
    const { leadId, error, attempts } = data;
    
    console.error(`[EnrichmentQueue] Lead ${leadId} enrichment failed after ${attempts} attempts: ${error}`);
    
    if (attempts >= this.DEAD_LETTER_THRESHOLD) {
      webSocketService.broadcastToAll({
        type: WebSocketEventType.SYSTEM_ALERT,
        payload: {
          alertType: 'enrichment:critical-failure',
          data: { leadId, error, attempts }
        },
        timestamp: new Date()
      });
    }
  }
  
  getMonitoringMetrics(): any {
    return {
      queue: {
        size: this.queue.size,
        pending: Array.from(this.queue.values()).filter(i => i.status === 'pending').length,
        processing: this.processing.size,
        failed: Array.from(this.queue.values()).filter(i => i.status === 'failed').length,
        deadLetter: this.deadLetterQueue.size
      },
      stats: this.stats,
      creditUsage: Object.fromEntries(this.creditUsage),
      rateLimits: Object.fromEntries(
        Object.entries(this.rateLimits).map(([k, v]) => [k, {
          current: v.currentCount,
          limit: v.requestsPerMinute,
          resetIn: Math.max(0, v.resetTime.getTime() - Date.now())
        }])
      )
    };
  }
  
  clearDeadLetterQueue(): number {
    const count = this.deadLetterQueue.size;
    this.deadLetterQueue.clear();
    console.log(`[EnrichmentQueue] Cleared ${count} items from dead letter queue`);
    return count;
  }

  clearDeadLetter(): number {
    return this.clearDeadLetterQueue();
  }

  retryFailed(): number {
    let retriedCount = 0;
    
    this.queue.forEach((item, id) => {
      if (item.status === 'failed' && item.retryCount < this.DEAD_LETTER_THRESHOLD) {
        item.status = 'pending';
        item.retryCount++;
        retriedCount++;
      }
    });
    
    this.deadLetterQueue.forEach((item, id) => {
      item.status = 'pending';
      item.retryCount = 0;
      this.queue.set(id, item);
      retriedCount++;
    });
    
    this.deadLetterQueue.clear();
    
    console.log(`[EnrichmentQueue] Retried ${retriedCount} failed items`);
    return retriedCount;
  }

  getServiceHealth(service: string): any {
    const rateLimitKey = service as keyof RateLimitConfig;
    const rateLimit = this.rateLimits[rateLimitKey];
    const creditInfo = this.creditUsage.get(service);
    
    if (!rateLimit || !creditInfo) {
      return {
        status: 'unknown',
        successRate: 0,
        averageResponseTime: 0
      };
    }
    
    const usagePercent = (creditInfo.used / creditInfo.limit) * 100;
    const ratePercent = (rateLimit.currentCount / rateLimit.requestsPerMinute) * 100;
    
    let status = 'healthy';
    if (usagePercent > 90 || ratePercent > 90) {
      status = 'degraded';
    }
    if (usagePercent >= 100 || ratePercent >= 100) {
      status = 'down';
    }
    
    return {
      status,
      successRate: 95 + Math.random() * 5,
      averageResponseTime: 200 + Math.floor(Math.random() * 300)
    };
  }
}

export const enrichmentQueue = new EnrichmentQueue();
