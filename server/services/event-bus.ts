import { EventEmitter } from 'events';

/**
 * Event types for service communication
 */
export enum ServiceEventType {
  // UCC Intelligence events
  UCC_DATA_UPDATED = 'ucc:data-updated',
  UCC_FILING_ADDED = 'ucc:filing-added',
  UCC_ANALYSIS_COMPLETE = 'ucc:analysis-complete',
  
  // Lead Intelligence events  
  LEAD_SCORE_RECALCULATION_REQUEST = 'lead:score-recalculation-request',
  LEAD_SCORE_UPDATED = 'lead:score-updated',
  LEAD_INTELLIGENCE_UPDATED = 'lead:intelligence-updated',
  
  // Enhanced Verification events
  VERIFICATION_COMPLETE = 'verification:complete',
  VERIFICATION_FAILED = 'verification:failed',
  
  // General events
  DATA_REFRESH_REQUEST = 'data:refresh-request',
  ERROR_OCCURRED = 'error:occurred'
}

/**
 * Event payload interfaces
 */
export interface UccDataUpdatedEvent {
  leadId: string;
  filingCount?: number;
  hasIntelligence?: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface UccFilingAddedEvent {
  leadId: string;
  filingId: string;
  securedParty: string;
  filingDate: Date;
  metadata?: Record<string, any>;
}

export interface UccAnalysisCompleteEvent {
  leadId: string;
  analysisId?: string;
  intelligenceScore?: number;
  businessHealthScore?: number;
  riskLevel?: string;
  timestamp: Date;
}

export interface LeadScoreRecalculationEvent {
  leadId: string;
  triggerSource: 'ucc_update' | 'enrichment_update' | 'verification_update' | 'manual';
  priority?: 'high' | 'normal' | 'low';
  timestamp: Date;
}

export interface LeadScoreUpdatedEvent {
  leadId: string;
  previousScore?: number;
  newScore: number;
  subScores?: Record<string, number>;
  timestamp: Date;
}

export interface VerificationCompleteEvent {
  leadId: string;
  verificationId: string;
  confidenceScore: number;
  timestamp: Date;
}

export interface ErrorEvent {
  service: string;
  operation: string;
  leadId?: string;
  error: Error | string;
  timestamp: Date;
}

/**
 * Type-safe event emitter for service communication
 */
interface ServiceEventMap {
  [ServiceEventType.UCC_DATA_UPDATED]: UccDataUpdatedEvent;
  [ServiceEventType.UCC_FILING_ADDED]: UccFilingAddedEvent;
  [ServiceEventType.UCC_ANALYSIS_COMPLETE]: UccAnalysisCompleteEvent;
  [ServiceEventType.LEAD_SCORE_RECALCULATION_REQUEST]: LeadScoreRecalculationEvent;
  [ServiceEventType.LEAD_SCORE_UPDATED]: LeadScoreUpdatedEvent;
  [ServiceEventType.LEAD_INTELLIGENCE_UPDATED]: LeadScoreUpdatedEvent;
  [ServiceEventType.VERIFICATION_COMPLETE]: VerificationCompleteEvent;
  [ServiceEventType.VERIFICATION_FAILED]: VerificationCompleteEvent;
  [ServiceEventType.DATA_REFRESH_REQUEST]: { leadId: string; timestamp: Date };
  [ServiceEventType.ERROR_OCCURRED]: ErrorEvent;
}

/**
 * Service Event Bus for decoupled communication between services
 * Implements the Event-Driven Architecture pattern to prevent circular dependencies
 */
class ServiceEventBus extends EventEmitter {
  private static instance: ServiceEventBus;
  private eventHistory: Array<{ type: string; payload: any; timestamp: Date }> = [];
  private maxHistorySize = 100;

  private constructor() {
    super();
    this.setMaxListeners(50); // Increase max listeners for multiple services
  }

  /**
   * Get singleton instance of the event bus
   */
  public static getInstance(): ServiceEventBus {
    if (!ServiceEventBus.instance) {
      ServiceEventBus.instance = new ServiceEventBus();
    }
    return ServiceEventBus.instance;
  }

  /**
   * Emit a typed event
   */
  public emitEvent<T extends ServiceEventType>(
    eventType: T,
    payload: ServiceEventMap[T]
  ): void {
    try {
      // Add to history
      this.addToHistory(eventType, payload);
      
      // Log event for debugging
      console.log(`[EventBus] Emitting ${eventType}`, {
        leadId: (payload as any).leadId,
        timestamp: (payload as any).timestamp || new Date()
      });
      
      // Emit the event
      this.emit(eventType, payload);
    } catch (error) {
      console.error(`[EventBus] Error emitting ${eventType}:`, error);
      this.emitError('EventBus', 'emitEvent', error as Error);
    }
  }

  /**
   * Subscribe to a typed event
   */
  public onEvent<T extends ServiceEventType>(
    eventType: T,
    handler: (payload: ServiceEventMap[T]) => void | Promise<void>
  ): void {
    console.log(`[EventBus] Registering handler for ${eventType}`);
    
    // Wrap handler to catch errors
    const safeHandler = async (payload: ServiceEventMap[T]) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${eventType}:`, error);
        this.emitError('EventHandler', eventType, error as Error);
      }
    };
    
    this.on(eventType, safeHandler);
  }

  /**
   * Subscribe to an event once
   */
  public onceEvent<T extends ServiceEventType>(
    eventType: T,
    handler: (payload: ServiceEventMap[T]) => void | Promise<void>
  ): void {
    console.log(`[EventBus] Registering one-time handler for ${eventType}`);
    
    const safeHandler = async (payload: ServiceEventMap[T]) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[EventBus] Error in one-time handler for ${eventType}:`, error);
        this.emitError('EventHandler', eventType, error as Error);
      }
    };
    
    this.once(eventType, safeHandler);
  }

  /**
   * Unsubscribe from an event
   */
  public offEvent<T extends ServiceEventType>(
    eventType: T,
    handler: (payload: ServiceEventMap[T]) => void
  ): void {
    console.log(`[EventBus] Removing handler for ${eventType}`);
    this.off(eventType, handler);
  }

  /**
   * Emit an error event
   */
  private emitError(service: string, operation: string, error: Error, leadId?: string): void {
    const errorEvent: ErrorEvent = {
      service,
      operation,
      leadId,
      error: error.message || error,
      timestamp: new Date()
    };
    
    this.emit(ServiceEventType.ERROR_OCCURRED, errorEvent);
  }

  /**
   * Add event to history for debugging
   */
  private addToHistory(type: string, payload: any): void {
    this.eventHistory.push({
      type,
      payload,
      timestamp: new Date()
    });
    
    // Keep history size limited
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history for debugging
   */
  public getEventHistory(): Array<{ type: string; payload: any; timestamp: Date }> {
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Request lead score recalculation
   * This is a convenience method for UCC service to trigger recalculation
   */
  public requestLeadScoreRecalculation(
    leadId: string,
    source: 'ucc_update' | 'enrichment_update' | 'verification_update' | 'manual' = 'ucc_update',
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): void {
    this.emitEvent(ServiceEventType.LEAD_SCORE_RECALCULATION_REQUEST, {
      leadId,
      triggerSource: source,
      priority,
      timestamp: new Date()
    });
  }

  /**
   * Notify UCC data update
   * This is a convenience method for UCC service
   */
  public notifyUccDataUpdated(
    leadId: string,
    filingCount?: number,
    hasIntelligence?: boolean
  ): void {
    this.emitEvent(ServiceEventType.UCC_DATA_UPDATED, {
      leadId,
      filingCount,
      hasIntelligence,
      timestamp: new Date()
    });
  }

  /**
   * Get listener count for a specific event
   */
  public getListenerCount(eventType: ServiceEventType): number {
    return this.listenerCount(eventType);
  }

  /**
   * Check if event bus is properly initialized
   */
  public isInitialized(): boolean {
    return true; // Since we're using singleton pattern
  }
}

// Export singleton instance
export const eventBus = ServiceEventBus.getInstance();

// Export convenience functions
export const emitUccDataUpdated = (leadId: string, filingCount?: number, hasIntelligence?: boolean) => {
  eventBus.notifyUccDataUpdated(leadId, filingCount, hasIntelligence);
};

export const requestLeadScoreRecalculation = (
  leadId: string,
  source: 'ucc_update' | 'enrichment_update' | 'verification_update' | 'manual' = 'ucc_update',
  priority: 'high' | 'normal' | 'low' = 'normal'
) => {
  eventBus.requestLeadScoreRecalculation(leadId, source, priority);
};