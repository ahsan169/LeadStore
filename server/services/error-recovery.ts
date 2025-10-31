import { EventEmitter } from 'events';
import type { Lead } from '@shared/schema';

export enum ErrorType {
  API_ERROR = 'api_error',
  DATABASE_ERROR = 'database_error',
  VALIDATION_ERROR = 'validation_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  AUTH_ERROR = 'auth_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  PROCESSING_ERROR = 'processing_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum RecoveryStrategy {
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  RETRY_IMMEDIATELY = 'retry_immediately',
  USE_FALLBACK = 'use_fallback',
  CACHE_AND_QUEUE = 'cache_and_queue',
  CIRCUIT_BREAK = 'circuit_break',
  LOG_AND_CONTINUE = 'log_and_continue',
  ESCALATE = 'escalate',
  FAIL_FAST = 'fail_fast'
}

export interface ErrorContext {
  type: ErrorType;
  service: string;
  operation: string;
  error: Error;
  timestamp: Date;
  retryCount?: number;
  metadata?: any;
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  result?: any;
  error?: Error;
  message: string;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: Date;
  nextRetryTime?: Date;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Advanced Error Recovery Service
 * Handles error recovery strategies, circuit breaking, and resilience patterns
 */
export class ErrorRecoveryService extends EventEmitter {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private errorLog: ErrorContext[] = [];
  private readonly MAX_ERROR_LOG_SIZE = 1000;
  
  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 5, // Open circuit after 5 failures
    resetTimeout: 60000,  // 60 seconds before attempting to close
    halfOpenRequests: 3   // Number of test requests in half-open state
  };
  
  // Service-specific retry configurations
  private readonly serviceRetryConfigs: Record<string, RetryConfig> = {
    'hunter-verification': {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    },
    'numverify-validation': {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    },
    'openai-insights': {
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 60000,
      backoffMultiplier: 1.5,
      jitter: true
    },
    'database': {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: false
    },
    'stripe': {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 20000,
      backoffMultiplier: 2,
      jitter: true
    },
    'default': {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    }
  };
  
  constructor() {
    super();
    this.startHealthCheck();
  }
  
  /**
   * Main error recovery handler
   */
  async handleError(context: ErrorContext): Promise<RecoveryResult> {
    // Log the error
    this.logError(context);
    
    // Determine recovery strategy
    const strategy = this.determineRecoveryStrategy(context);
    
    // Execute recovery
    switch (strategy) {
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        return await this.retryWithBackoff(context);
        
      case RecoveryStrategy.RETRY_IMMEDIATELY:
        return await this.retryImmediately(context);
        
      case RecoveryStrategy.USE_FALLBACK:
        return await this.useFallback(context);
        
      case RecoveryStrategy.CACHE_AND_QUEUE:
        return await this.cacheAndQueue(context);
        
      case RecoveryStrategy.CIRCUIT_BREAK:
        return await this.circuitBreak(context);
        
      case RecoveryStrategy.LOG_AND_CONTINUE:
        return this.logAndContinue(context);
        
      case RecoveryStrategy.ESCALATE:
        return await this.escalate(context);
        
      case RecoveryStrategy.FAIL_FAST:
      default:
        return this.failFast(context);
    }
  }
  
  /**
   * Determine appropriate recovery strategy based on error context
   */
  private determineRecoveryStrategy(context: ErrorContext): RecoveryStrategy {
    // Check circuit breaker state first
    const circuitKey = `${context.service}:${context.operation}`;
    const circuitState = this.circuitBreakers.get(circuitKey);
    
    if (circuitState?.isOpen) {
      if (new Date() < circuitState.nextRetryTime!) {
        return RecoveryStrategy.CIRCUIT_BREAK;
      }
      // Circuit breaker is ready to test (half-open state)
    }
    
    // Strategy based on error type
    switch (context.type) {
      case ErrorType.RATE_LIMIT_ERROR:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
        
      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT_ERROR:
        if ((context.retryCount || 0) < 3) {
          return RecoveryStrategy.RETRY_WITH_BACKOFF;
        }
        return RecoveryStrategy.USE_FALLBACK;
        
      case ErrorType.DATABASE_ERROR:
        // Database errors might be transient
        if (context.error.message.includes('deadlock') ||
            context.error.message.includes('connection')) {
          return RecoveryStrategy.RETRY_WITH_BACKOFF;
        }
        return RecoveryStrategy.ESCALATE;
        
      case ErrorType.API_ERROR:
        // Check if it's a temporary API issue
        if (context.error.message.includes('503') ||
            context.error.message.includes('502')) {
          return RecoveryStrategy.RETRY_WITH_BACKOFF;
        }
        return RecoveryStrategy.USE_FALLBACK;
        
      case ErrorType.VALIDATION_ERROR:
        // Validation errors won't be fixed by retrying
        return RecoveryStrategy.LOG_AND_CONTINUE;
        
      case ErrorType.AUTH_ERROR:
        // Auth errors need escalation
        return RecoveryStrategy.ESCALATE;
        
      default:
        return RecoveryStrategy.LOG_AND_CONTINUE;
    }
  }
  
  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff(context: ErrorContext): Promise<RecoveryResult> {
    const config = this.serviceRetryConfigs[context.service] || this.serviceRetryConfigs.default;
    const retryCount = context.retryCount || 0;
    
    if (retryCount >= config.maxRetries) {
      return this.failFast(context);
    }
    
    // Calculate delay with exponential backoff
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, retryCount);
    delay = Math.min(delay, config.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay += Math.random() * delay * 0.1;
    }
    
    console.log(`[ErrorRecovery] Retrying ${context.service}:${context.operation} after ${delay}ms (attempt ${retryCount + 1}/${config.maxRetries})`);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Emit retry event
    this.emit('retry', {
      ...context,
      retryCount: retryCount + 1,
      delay
    });
    
    return {
      success: false,
      strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
      message: `Scheduled retry after ${delay}ms`
    };
  }
  
  /**
   * Retry immediately without delay
   */
  private async retryImmediately(context: ErrorContext): Promise<RecoveryResult> {
    console.log(`[ErrorRecovery] Retrying immediately: ${context.service}:${context.operation}`);
    
    this.emit('retry', {
      ...context,
      retryCount: (context.retryCount || 0) + 1,
      delay: 0
    });
    
    return {
      success: false,
      strategy: RecoveryStrategy.RETRY_IMMEDIATELY,
      message: 'Retrying immediately'
    };
  }
  
  /**
   * Use fallback mechanism
   */
  private async useFallback(context: ErrorContext): Promise<RecoveryResult> {
    console.log(`[ErrorRecovery] Using fallback for ${context.service}:${context.operation}`);
    
    // Service-specific fallback logic
    let fallbackResult: any = null;
    
    switch (context.service) {
      case 'hunter-verification':
      case 'numverify-validation':
        // Return mock/cached data for verification services
        fallbackResult = {
          status: 'fallback',
          message: 'Using cached/mock data due to service unavailability'
        };
        break;
        
      case 'openai-insights':
        // Return simplified insights without AI
        fallbackResult = {
          status: 'fallback',
          message: 'Using rule-based insights due to AI service unavailability'
        };
        break;
        
      default:
        fallbackResult = {
          status: 'fallback',
          message: 'Service unavailable, using default behavior'
        };
    }
    
    this.emit('fallback', { ...context, fallbackResult });
    
    return {
      success: true,
      strategy: RecoveryStrategy.USE_FALLBACK,
      result: fallbackResult,
      message: 'Fallback mechanism activated'
    };
  }
  
  /**
   * Cache request and queue for later processing
   */
  private async cacheAndQueue(context: ErrorContext): Promise<RecoveryResult> {
    console.log(`[ErrorRecovery] Caching and queuing: ${context.service}:${context.operation}`);
    
    // Store in a queue for later processing
    // This would integrate with a job queue system
    this.emit('queued', context);
    
    return {
      success: true,
      strategy: RecoveryStrategy.CACHE_AND_QUEUE,
      message: 'Request cached and queued for later processing'
    };
  }
  
  /**
   * Circuit breaker pattern implementation
   */
  private async circuitBreak(context: ErrorContext): Promise<RecoveryResult> {
    const circuitKey = `${context.service}:${context.operation}`;
    let circuitState = this.circuitBreakers.get(circuitKey);
    
    if (!circuitState) {
      circuitState = {
        isOpen: false,
        failures: 0,
        lastFailureTime: new Date()
      };
      this.circuitBreakers.set(circuitKey, circuitState);
    }
    
    // Increment failure count
    circuitState.failures++;
    circuitState.lastFailureTime = new Date();
    
    // Check if circuit should open
    if (circuitState.failures >= this.CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      circuitState.isOpen = true;
      circuitState.nextRetryTime = new Date(
        Date.now() + this.CIRCUIT_BREAKER_CONFIG.resetTimeout
      );
      
      console.log(`[ErrorRecovery] Circuit breaker OPEN for ${circuitKey}`);
      this.emit('circuit-open', { service: context.service, operation: context.operation });
    }
    
    return {
      success: false,
      strategy: RecoveryStrategy.CIRCUIT_BREAK,
      error: new Error('Circuit breaker is open'),
      message: `Circuit breaker activated for ${circuitKey}`
    };
  }
  
  /**
   * Log error and continue execution
   */
  private logAndContinue(context: ErrorContext): RecoveryResult {
    console.warn(`[ErrorRecovery] Logging and continuing: ${context.service}:${context.operation}`, context.error);
    
    return {
      success: true,
      strategy: RecoveryStrategy.LOG_AND_CONTINUE,
      message: 'Error logged, continuing execution'
    };
  }
  
  /**
   * Escalate error to higher level handling
   */
  private async escalate(context: ErrorContext): Promise<RecoveryResult> {
    console.error(`[ErrorRecovery] ESCALATING ERROR: ${context.service}:${context.operation}`, context.error);
    
    // Emit escalation event for monitoring/alerting
    this.emit('escalation', context);
    
    // Store critical errors for admin review
    // This could integrate with monitoring systems
    
    return {
      success: false,
      strategy: RecoveryStrategy.ESCALATE,
      error: context.error,
      message: 'Error escalated for manual intervention'
    };
  }
  
  /**
   * Fail fast without recovery attempts
   */
  private failFast(context: ErrorContext): RecoveryResult {
    console.error(`[ErrorRecovery] Failing fast: ${context.service}:${context.operation}`, context.error);
    
    return {
      success: false,
      strategy: RecoveryStrategy.FAIL_FAST,
      error: context.error,
      message: 'Operation failed without recovery attempt'
    };
  }
  
  /**
   * Log error for analysis
   */
  private logError(context: ErrorContext): void {
    this.errorLog.push(context);
    
    // Trim log if too large
    if (this.errorLog.length > this.MAX_ERROR_LOG_SIZE) {
      this.errorLog = this.errorLog.slice(-this.MAX_ERROR_LOG_SIZE);
    }
    
    // Emit error event for monitoring
    this.emit('error-logged', context);
  }
  
  /**
   * Periodic health check for circuit breakers
   */
  private startHealthCheck(): void {
    setInterval(() => {
      const now = Date.now();
      
      this.circuitBreakers.forEach((state, key) => {
        if (state.isOpen && state.nextRetryTime && now >= state.nextRetryTime.getTime()) {
          // Move to half-open state
          console.log(`[ErrorRecovery] Circuit breaker ${key} moving to HALF-OPEN`);
          state.isOpen = false;
          state.failures = Math.floor(state.failures / 2); // Reduce failure count
          this.emit('circuit-half-open', { key });
        }
      });
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsByService: Record<string, number>;
    circuitBreakerStates: Map<string, CircuitBreakerState>;
  } {
    const errorsByType: Record<ErrorType, number> = {} as any;
    const errorsByService: Record<string, number> = {};
    
    this.errorLog.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      errorsByService[error.service] = (errorsByService[error.service] || 0) + 1;
    });
    
    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsByService,
      circuitBreakerStates: this.circuitBreakers
    };
  }
  
  /**
   * Reset circuit breaker for a service
   */
  resetCircuitBreaker(service: string, operation?: string): void {
    const key = operation ? `${service}:${operation}` : service;
    
    if (operation) {
      this.circuitBreakers.delete(key);
    } else {
      // Reset all circuit breakers for the service
      Array.from(this.circuitBreakers.keys())
        .filter(k => k.startsWith(`${service}:`))
        .forEach(k => this.circuitBreakers.delete(k));
    }
    
    console.log(`[ErrorRecovery] Circuit breaker reset for ${key}`);
    this.emit('circuit-reset', { key });
  }
}

// Export singleton instance
export const errorRecoveryService = new ErrorRecoveryService();