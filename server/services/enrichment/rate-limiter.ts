export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  service: string;
}

export interface QueuedRequest {
  id: string;
  service: string;
  priority: number;
  execute: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: Date;
  retries: number;
}

export interface ServiceUsageStats {
  service: string;
  requestsInWindow: number;
  remainingRequests: number;
  resetTime: Date;
  queueLength: number;
  successRate: number;
  avgResponseTime: number;
}

export class EnrichmentRateLimiter {
  private limits: Map<string, RateLimitConfig>;
  private usage: Map<string, { count: number; resetTime: Date }>;
  private queues: Map<string, QueuedRequest[]>;
  private processing: Map<string, boolean>;
  private stats: Map<string, { success: number; failure: number; totalTime: number }>;
  
  constructor() {
    this.limits = new Map();
    this.usage = new Map();
    this.queues = new Map();
    this.processing = new Map();
    this.stats = new Map();
    
    // Configure default rate limits for each service
    this.configureService("clearbit", 600, 60000); // 600 requests per minute
    this.configureService("hunter", 50, 60000); // 50 requests per minute
    this.configureService("fullcontact", 600, 60000); // 600 requests per minute  
    this.configureService("twilio", 1000, 60000); // 1000 requests per minute
    this.configureService("numverify", 100, 60000); // 100 requests per minute
    
    // Start queue processors
    this.startQueueProcessors();
  }
  
  /**
   * Configure rate limit for a service
   */
  configureService(service: string, maxRequests: number, windowMs: number): void {
    this.limits.set(service, { service, maxRequests, windowMs });
    this.usage.set(service, { count: 0, resetTime: new Date(Date.now() + windowMs) });
    this.queues.set(service, []);
    this.processing.set(service, false);
    this.stats.set(service, { success: 0, failure: 0, totalTime: 0 });
  }
  
  /**
   * Execute a request with rate limiting
   */
  async execute<T>(
    service: string, 
    request: () => Promise<T>,
    priority: number = 5
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: this.generateRequestId(),
        service,
        priority,
        execute: request,
        resolve,
        reject,
        timestamp: new Date(),
        retries: 0
      };
      
      // Try to execute immediately if within rate limit
      if (this.canExecute(service)) {
        this.executeRequest(queuedRequest);
      } else {
        // Add to queue
        this.addToQueue(queuedRequest);
      }
    });
  }
  
  /**
   * Batch execute multiple requests
   */
  async batchExecute<T>(
    service: string,
    requests: Array<() => Promise<T>>,
    priority: number = 5
  ): Promise<T[]> {
    const promises = requests.map(request => 
      this.execute(service, request, priority)
    );
    
    return Promise.all(promises);
  }
  
  /**
   * Check if service can execute a request now
   */
  private canExecute(service: string): boolean {
    const limit = this.limits.get(service);
    const usage = this.usage.get(service);
    
    if (!limit || !usage) return true;
    
    // Reset counter if window has passed
    if (new Date() >= usage.resetTime) {
      usage.count = 0;
      usage.resetTime = new Date(Date.now() + limit.windowMs);
    }
    
    return usage.count < limit.maxRequests;
  }
  
  /**
   * Execute a request and track stats
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    const startTime = Date.now();
    const usage = this.usage.get(request.service);
    const stats = this.stats.get(request.service);
    
    if (usage) {
      usage.count++;
    }
    
    try {
      const result = await request.execute();
      
      if (stats) {
        stats.success++;
        stats.totalTime += Date.now() - startTime;
      }
      
      request.resolve(result);
    } catch (error: any) {
      if (stats) {
        stats.failure++;
      }
      
      // Retry logic for transient errors
      if (this.shouldRetry(error, request)) {
        request.retries++;
        await this.delay(this.calculateBackoff(request.retries));
        this.addToQueue(request);
      } else {
        request.reject(error);
      }
    }
  }
  
  /**
   * Add request to service queue
   */
  private addToQueue(request: QueuedRequest): void {
    const queue = this.queues.get(request.service);
    if (!queue) return;
    
    // Insert based on priority (higher priority first)
    const insertIndex = queue.findIndex(item => item.priority < request.priority);
    if (insertIndex === -1) {
      queue.push(request);
    } else {
      queue.splice(insertIndex, 0, request);
    }
  }
  
  /**
   * Process queued requests for all services
   */
  private startQueueProcessors(): void {
    setInterval(() => {
      for (const [service, queue] of this.queues.entries()) {
        if (!this.processing.get(service) && queue.length > 0) {
          this.processQueue(service);
        }
      }
    }, 100); // Check every 100ms
  }
  
  /**
   * Process queue for a specific service
   */
  private async processQueue(service: string): Promise<void> {
    const queue = this.queues.get(service);
    if (!queue || queue.length === 0) return;
    
    this.processing.set(service, true);
    
    while (queue.length > 0 && this.canExecute(service)) {
      const request = queue.shift();
      if (request) {
        await this.executeRequest(request);
        
        // Small delay between requests to be respectful
        await this.delay(50);
      }
    }
    
    this.processing.set(service, false);
  }
  
  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: any, request: QueuedRequest): boolean {
    // Don't retry if max retries reached
    if (request.retries >= 3) return false;
    
    // Retry on rate limit or network errors
    if (error.status === 429 || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT") {
      return true;
    }
    
    // Don't retry on client errors
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    
    // Retry on server errors
    return error.status >= 500;
  }
  
  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(retries: number): number {
    return Math.min(1000 * Math.pow(2, retries), 30000); // Max 30 seconds
  }
  
  /**
   * Get usage statistics for a service
   */
  getServiceStats(service: string): ServiceUsageStats | null {
    const limit = this.limits.get(service);
    const usage = this.usage.get(service);
    const queue = this.queues.get(service);
    const stats = this.stats.get(service);
    
    if (!limit || !usage || !queue || !stats) return null;
    
    const totalRequests = stats.success + stats.failure;
    
    return {
      service,
      requestsInWindow: usage.count,
      remainingRequests: Math.max(0, limit.maxRequests - usage.count),
      resetTime: usage.resetTime,
      queueLength: queue.length,
      successRate: totalRequests > 0 ? (stats.success / totalRequests) * 100 : 0,
      avgResponseTime: stats.success > 0 ? stats.totalTime / stats.success : 0
    };
  }
  
  /**
   * Get all service statistics
   */
  getAllStats(): ServiceUsageStats[] {
    const allStats: ServiceUsageStats[] = [];
    
    for (const service of this.limits.keys()) {
      const stats = this.getServiceStats(service);
      if (stats) allStats.push(stats);
    }
    
    return allStats;
  }
  
  /**
   * Clear queue for a service
   */
  clearQueue(service: string): void {
    const queue = this.queues.get(service);
    if (queue) {
      // Reject all pending requests
      queue.forEach(request => {
        request.reject(new Error("Queue cleared"));
      });
      queue.length = 0;
    }
  }
  
  /**
   * Reset usage counters for a service
   */
  resetUsage(service: string): void {
    const limit = this.limits.get(service);
    if (limit) {
      this.usage.set(service, {
        count: 0,
        resetTime: new Date(Date.now() + limit.windowMs)
      });
    }
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Get queue position for a service
   */
  getQueuePosition(service: string): number {
    const queue = this.queues.get(service);
    return queue ? queue.length : 0;
  }
  
  /**
   * Estimate wait time for a service queue
   */
  estimateWaitTime(service: string): number {
    const queue = this.queues.get(service);
    const limit = this.limits.get(service);
    const stats = this.stats.get(service);
    
    if (!queue || !limit || !stats || queue.length === 0) return 0;
    
    const avgResponseTime = stats.success > 0 ? stats.totalTime / stats.success : 1000;
    const requestsPerWindow = limit.maxRequests;
    const windowMs = limit.windowMs;
    
    // Estimate based on queue length and processing rate
    const estimatedWindows = Math.ceil(queue.length / requestsPerWindow);
    return estimatedWindows * windowMs + (queue.length * avgResponseTime);
  }
}

export const rateLimiter = new EnrichmentRateLimiter();