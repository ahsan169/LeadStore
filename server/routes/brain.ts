/**
 * Brain Service API Routes
 * Intelligent lead processing pipeline endpoints
 */

import type { Express } from 'express';
import { z } from 'zod';
import { brainPipeline, PipelineStage, ConfidenceLevel } from '../intelligence/brain-pipeline';
import { storage } from '../storage';
import { db } from '../db';
import { leads, leadProcessingHistory, processingMetrics } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';
import { enrichmentQueue } from '../services/enrichment-queue';
import { uccIntelligenceService } from '../services/ucc-intelligence';

/**
 * Input schemas
 */
const processLeadSchema = z.object({
  lead: z.any(), // Raw lead data
  options: z.object({
    source: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    skipStages: z.array(z.string()).optional(),
    shortCircuitConfidence: z.number().min(50).max(100).optional(),
    enrichmentOptions: z.object({
      usePerplexity: z.boolean().optional(),
      useHunter: z.boolean().optional(),
      useNumverify: z.boolean().optional(),
      maxRetries: z.number().optional()
    }).optional()
  }).optional()
});

const batchProcessSchema = z.object({
  leads: z.array(z.any()),
  options: z.object({
    source: z.string().optional(),
    parallel: z.boolean().optional(),
    maxConcurrency: z.number().min(1).max(10).optional(),
    skipStages: z.array(z.string()).optional()
  }).optional()
});

const feedbackSchema = z.object({
  leadId: z.string(),
  sessionId: z.string().optional(),
  corrections: z.record(z.string(), z.any()),
  feedback: z.string().optional(),
  confidence: z.number().min(0).max(100).optional()
});

const metricsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).optional(),
  includeStageBreakdown: z.boolean().optional()
});

/**
 * Processing history tracking
 */
interface ProcessingRecord {
  id: string;
  leadId?: string;
  sessionId: string;
  batchId?: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  stages: Array<{
    name: string;
    status: string;
    confidence: number;
    duration?: number;
  }>;
  finalScore?: number;
  finalConfidence?: number;
  errors?: any[];
  flags?: string[];
  source?: string;
}

// In-memory storage for processing records (in production, use database)
const processingHistory = new Map<string, ProcessingRecord>();
const leadSessionMapping = new Map<string, string>(); // leadId -> sessionId

/**
 * Register Brain Service API routes
 */
export function registerBrainRoutes(app: Express) {
  /**
   * Process a single lead through the brain pipeline
   */
  app.post('/api/brain/process', async (req, res) => {
    try {
      console.log('[BrainAPI] Processing lead request received');
      
      const validatedData = processLeadSchema.parse(req.body);
      const { lead, options } = validatedData;
      
      const userId = (req as any).user?.id;
      
      // Start processing timer
      const startTime = new Date();
      
      // Process through pipeline
      const result = await brainPipeline.process(lead, {
        ...options,
        userId,
        skipStages: options?.skipStages as PipelineStage[]
      });
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // Store processing history
      const record: ProcessingRecord = {
        id: result.metadata.sessionId,
        leadId: result.leadId,
        sessionId: result.metadata.sessionId,
        batchId: result.metadata.batchId,
        userId,
        startTime,
        endTime,
        duration,
        stages: result.audit.map(a => ({
          name: a.stage,
          status: a.status,
          confidence: a.confidence,
          duration: a.duration
        })),
        finalScore: result.score,
        finalConfidence: result.confidence,
        errors: result.errors,
        flags: result.flags,
        source: result.metadata.source
      };
      
      processingHistory.set(result.metadata.sessionId, record);
      
      if (result.leadId) {
        leadSessionMapping.set(result.leadId, result.metadata.sessionId);
      }
      
      // Emit event for tracking
      eventBus.emit('brain:lead-processed', {
        sessionId: result.metadata.sessionId,
        leadId: result.leadId,
        score: result.score,
        confidence: result.confidence,
        duration
      });
      
      // Build response
      const response = {
        success: true,
        sessionId: result.metadata.sessionId,
        leadId: result.leadId,
        score: result.score,
        confidence: result.confidence,
        lead: result.normalizedData,
        enrichment: {
          fieldsEnriched: result.enrichmentData?.enrichedFields || [],
          sources: result.enrichmentData?.sources || [],
          confidence: result.enrichmentData?.confidence || 0
        },
        ucc: {
          filingsFound: result.uccData?.length || 0,
          stackingRisk: result.uccAnalysis?.stackingRisk || 'unknown',
          activePositions: result.uccAnalysis?.activePositions || 0
        },
        quality: {
          flags: result.flags,
          recommendations: result.recommendations,
          confidence: result.confidence
        },
        processing: {
          duration,
          stagesCompleted: result.audit.filter(a => a.status === 'completed').length,
          totalStages: result.audit.length
        }
      };
      
      console.log(`[BrainAPI] Lead processed successfully in ${duration}ms`);
      
      res.json(response);
      
    } catch (error) {
      console.error('[BrainAPI] Error processing lead:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  });
  
  /**
   * Process multiple leads in batch
   */
  app.post('/api/brain/batch-process', async (req, res) => {
    try {
      console.log('[BrainAPI] Batch processing request received');
      
      const validatedData = batchProcessSchema.parse(req.body);
      const { leads, options } = validatedData;
      
      const userId = (req as any).user?.id;
      
      console.log(`[BrainAPI] Processing batch of ${leads.length} leads`);
      
      // Process batch
      const results = await brainPipeline.processBatch(leads, {
        ...options,
        userId,
        parallel: options?.parallel !== false,
        maxConcurrency: options?.maxConcurrency || 5
      });
      
      // Store processing history for each lead
      results.forEach(result => {
        const record: ProcessingRecord = {
          id: result.metadata.sessionId,
          leadId: result.leadId,
          sessionId: result.metadata.sessionId,
          batchId: result.metadata.batchId,
          userId,
          startTime: result.metadata.timestamp,
          endTime: new Date(),
          stages: result.audit.map(a => ({
            name: a.stage,
            status: a.status,
            confidence: a.confidence,
            duration: a.duration
          })),
          finalScore: result.score,
          finalConfidence: result.confidence,
          errors: result.errors,
          flags: result.flags,
          source: result.metadata.source
        };
        
        processingHistory.set(result.metadata.sessionId, record);
        
        if (result.leadId) {
          leadSessionMapping.set(result.leadId, result.metadata.sessionId);
        }
      });
      
      // Build response
      const response = {
        success: true,
        batchId: results[0]?.metadata.batchId,
        totalProcessed: results.length,
        successful: results.filter(r => r.score !== undefined).length,
        failed: results.filter(r => r.errors.length > 0).length,
        results: results.map(r => ({
          sessionId: r.metadata.sessionId,
          leadId: r.leadId,
          score: r.score,
          confidence: r.confidence,
          flags: r.flags,
          errors: r.errors
        })),
        summary: {
          averageScore: results.filter(r => r.score).reduce((sum, r) => sum + (r.score || 0), 0) / results.length,
          averageConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
          highQualityLeads: results.filter(r => (r.score || 0) >= 70).length,
          mediumQualityLeads: results.filter(r => (r.score || 0) >= 40 && (r.score || 0) < 70).length,
          lowQualityLeads: results.filter(r => (r.score || 0) < 40).length
        }
      };
      
      console.log(`[BrainAPI] Batch processing completed: ${results.length} leads`);
      
      res.json(response);
      
    } catch (error) {
      console.error('[BrainAPI] Error in batch processing:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Batch processing failed'
      });
    }
  });
  
  /**
   * Get processing explanation for a lead
   */
  app.get('/api/brain/explain/:leadId', async (req, res) => {
    try {
      const { leadId } = req.params;
      
      console.log(`[BrainAPI] Fetching explanation for lead ${leadId}`);
      
      // Find session ID for this lead
      const sessionId = leadSessionMapping.get(leadId);
      
      if (!sessionId) {
        return res.status(404).json({
          success: false,
          error: 'No processing history found for this lead'
        });
      }
      
      // Get processing record
      const record = processingHistory.get(sessionId);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          error: 'Processing record not found'
        });
      }
      
      // Build detailed explanation
      const explanation = {
        leadId,
        sessionId,
        processedAt: record.startTime,
        duration: record.duration,
        finalScore: record.finalScore,
        finalConfidence: record.finalConfidence,
        source: record.source,
        stages: record.stages.map(stage => ({
          name: stage.name,
          status: stage.status,
          confidence: stage.confidence,
          duration: stage.duration,
          description: getStageDescription(stage.name),
          confidenceLevel: getConfidenceLevel(stage.confidence)
        })),
        flags: record.flags || [],
        errors: record.errors || [],
        timeline: buildProcessingTimeline(record),
        confidenceBreakdown: {
          overall: record.finalConfidence,
          level: getConfidenceLevel(record.finalConfidence || 0),
          factors: getConfidenceFactors(record)
        },
        recommendations: getProcessingRecommendations(record)
      };
      
      res.json({
        success: true,
        explanation
      });
      
    } catch (error) {
      console.error('[BrainAPI] Error fetching explanation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch explanation'
      });
    }
  });
  
  /**
   * Submit feedback and corrections for processed lead
   */
  app.post('/api/brain/feedback', async (req, res) => {
    try {
      const validatedData = feedbackSchema.parse(req.body);
      const { leadId, sessionId, corrections, feedback, confidence } = validatedData;
      
      console.log(`[BrainAPI] Feedback received for lead ${leadId}`);
      
      const userId = (req as any).user?.id;
      
      // Apply corrections to the lead
      if (Object.keys(corrections).length > 0) {
        await storage.updateLead(leadId, corrections);
        
        // Re-process the lead with corrections
        const correctedLead = await storage.getLead(leadId);
        
        if (correctedLead) {
          // Queue for re-enrichment with high priority
          await enrichmentQueue.addToQueue(
            correctedLead,
            'high',
            'manual',
            {
              userId,
              enrichmentOptions: {
                skipCache: true,
                forceRefresh: true
              }
            }
          );
        }
      }
      
      // Store feedback
      const feedbackRecord = {
        leadId,
        sessionId: sessionId || leadSessionMapping.get(leadId),
        userId,
        corrections,
        feedback,
        confidence,
        timestamp: new Date()
      };
      
      // Emit event for learning
      eventBus.emit('brain:feedback-received', feedbackRecord);
      
      res.json({
        success: true,
        message: 'Feedback received and applied',
        reprocessing: Object.keys(corrections).length > 0
      });
      
    } catch (error) {
      console.error('[BrainAPI] Error processing feedback:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process feedback'
      });
    }
  });
  
  /**
   * Get pipeline metrics and statistics
   */
  app.get('/api/brain/metrics', async (req, res) => {
    try {
      const query = metricsQuerySchema.parse(req.query);
      
      console.log('[BrainAPI] Fetching pipeline metrics');
      
      // Calculate metrics from processing history
      const records = Array.from(processingHistory.values());
      
      // Filter by date range if provided
      let filteredRecords = records;
      if (query.startDate) {
        const startDate = new Date(query.startDate);
        filteredRecords = filteredRecords.filter(r => r.startTime >= startDate);
      }
      if (query.endDate) {
        const endDate = new Date(query.endDate);
        filteredRecords = filteredRecords.filter(r => r.startTime <= endDate);
      }
      
      // Calculate aggregate metrics
      const metrics = {
        summary: {
          totalProcessed: filteredRecords.length,
          successful: filteredRecords.filter(r => r.finalScore !== undefined).length,
          failed: filteredRecords.filter(r => (r.errors?.length || 0) > 0).length,
          averageScore: calculateAverage(filteredRecords.map(r => r.finalScore || 0)),
          averageConfidence: calculateAverage(filteredRecords.map(r => r.finalConfidence || 0)),
          averageDuration: calculateAverage(filteredRecords.map(r => r.duration || 0))
        },
        performance: {
          p50Duration: calculatePercentile(filteredRecords.map(r => r.duration || 0), 50),
          p95Duration: calculatePercentile(filteredRecords.map(r => r.duration || 0), 95),
          p99Duration: calculatePercentile(filteredRecords.map(r => r.duration || 0), 99),
          throughput: filteredRecords.length / Math.max(1, getDaysBetween(
            filteredRecords[0]?.startTime || new Date(),
            filteredRecords[filteredRecords.length - 1]?.startTime || new Date()
          ))
        },
        quality: {
          highQualityLeads: filteredRecords.filter(r => (r.finalScore || 0) >= 70).length,
          mediumQualityLeads: filteredRecords.filter(r => (r.finalScore || 0) >= 40 && (r.finalScore || 0) < 70).length,
          lowQualityLeads: filteredRecords.filter(r => (r.finalScore || 0) < 40).length,
          averageFlags: calculateAverage(filteredRecords.map(r => (r.flags?.length || 0))),
          errorRate: (filteredRecords.filter(r => (r.errors?.length || 0) > 0).length / filteredRecords.length) * 100
        },
        sources: groupByField(filteredRecords, 'source')
      };
      
      // Add stage breakdown if requested
      if (query.includeStageBreakdown) {
        metrics['stageBreakdown'] = calculateStageMetrics(filteredRecords);
      }
      
      // Add time series if groupBy is specified
      if (query.groupBy) {
        metrics['timeSeries'] = groupByTime(filteredRecords, query.groupBy);
      }
      
      res.json({
        success: true,
        metrics,
        period: {
          start: query.startDate || filteredRecords[0]?.startTime,
          end: query.endDate || filteredRecords[filteredRecords.length - 1]?.startTime
        }
      });
      
    } catch (error) {
      console.error('[BrainAPI] Error fetching metrics:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch metrics'
      });
    }
  });
  
  /**
   * Get pipeline health status
   */
  app.get('/api/brain/pipeline-status', async (req, res) => {
    try {
      console.log('[BrainAPI] Fetching pipeline status');
      
      const status = brainPipeline.getStatus();
      
      // Add runtime metrics
      const runtimeMetrics = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        activeProcessing: Array.from(processingHistory.values())
          .filter(r => !r.endTime)
          .length,
        queuedLeads: 0, // This would come from enrichmentQueue
        last24Hours: {
          processed: Array.from(processingHistory.values())
            .filter(r => r.startTime >= new Date(Date.now() - 24 * 60 * 60 * 1000))
            .length,
          errors: Array.from(processingHistory.values())
            .filter(r => r.startTime >= new Date(Date.now() - 24 * 60 * 60 * 1000))
            .filter(r => (r.errors?.length || 0) > 0)
            .length
        }
      };
      
      res.json({
        success: true,
        status,
        runtime: runtimeMetrics,
        health: {
          status: runtimeMetrics.last24Hours.errors < 10 ? 'healthy' : 'degraded',
          message: runtimeMetrics.last24Hours.errors < 10 ? 
            'Pipeline operating normally' : 
            'Elevated error rate detected'
        }
      });
      
    } catch (error) {
      console.error('[BrainAPI] Error fetching pipeline status:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch status',
        health: {
          status: 'unhealthy',
          message: 'Error fetching pipeline status'
        }
      });
    }
  });
}

/**
 * Helper functions
 */

function getStageDescription(stageName: string): string {
  const descriptions: Record<string, string> = {
    ingest: 'Parse and validate raw lead data',
    normalize: 'Map fields to canonical format using ontology',
    resolve: 'Check for duplicates and merge with existing leads',
    enrich: 'Add missing data from external sources',
    ucc_aggregate: 'Analyze UCC filings and calculate risk',
    score: 'Calculate lead quality score',
    export: 'Format and save processed lead'
  };
  
  return descriptions[stageName] || 'Processing stage';
}

function getConfidenceLevel(confidence: number): string {
  if (confidence >= ConfidenceLevel.VERY_HIGH) return 'Very High';
  if (confidence >= ConfidenceLevel.HIGH) return 'High';
  if (confidence >= ConfidenceLevel.MEDIUM) return 'Medium';
  if (confidence >= ConfidenceLevel.LOW) return 'Low';
  return 'Very Low';
}

function buildProcessingTimeline(record: ProcessingRecord): any[] {
  const timeline = [];
  let currentTime = record.startTime.getTime();
  
  for (const stage of record.stages) {
    timeline.push({
      timestamp: new Date(currentTime),
      event: `${stage.name} started`,
      status: stage.status,
      confidence: stage.confidence
    });
    
    if (stage.duration) {
      currentTime += stage.duration;
      timeline.push({
        timestamp: new Date(currentTime),
        event: `${stage.name} completed`,
        duration: stage.duration
      });
    }
  }
  
  return timeline;
}

function getConfidenceFactors(record: ProcessingRecord): any[] {
  const factors = [];
  
  // Data completeness
  const avgConfidence = calculateAverage(record.stages.map(s => s.confidence));
  factors.push({
    factor: 'Data Completeness',
    impact: avgConfidence > 70 ? 'positive' : 'negative',
    weight: 0.3
  });
  
  // Error presence
  if (record.errors && record.errors.length > 0) {
    factors.push({
      factor: 'Processing Errors',
      impact: 'negative',
      weight: 0.2,
      details: `${record.errors.length} errors encountered`
    });
  }
  
  // Stage success rate
  const successRate = record.stages.filter(s => s.status === 'completed').length / record.stages.length;
  factors.push({
    factor: 'Stage Success Rate',
    impact: successRate > 0.8 ? 'positive' : 'negative',
    weight: 0.25,
    value: `${(successRate * 100).toFixed(0)}%`
  });
  
  return factors;
}

function getProcessingRecommendations(record: ProcessingRecord): string[] {
  const recommendations = [];
  
  // Check for low confidence stages
  const lowConfidenceStages = record.stages.filter(s => s.confidence < 50);
  if (lowConfidenceStages.length > 0) {
    recommendations.push(`Review ${lowConfidenceStages.map(s => s.name).join(', ')} stages for data quality`);
  }
  
  // Check for errors
  if (record.errors && record.errors.length > 0) {
    recommendations.push('Address processing errors before relying on results');
  }
  
  // Check score
  if (record.finalScore && record.finalScore < 40) {
    recommendations.push('Lead quality is low - consider additional verification');
  }
  
  // Check confidence
  if (record.finalConfidence && record.finalConfidence < 60) {
    recommendations.push('Confidence is moderate - manual review recommended');
  }
  
  return recommendations;
}

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function calculatePercentile(numbers: number[], percentile: number): number {
  if (numbers.length === 0) return 0;
  
  const sorted = numbers.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  
  return sorted[Math.max(0, index)];
}

function getDaysBetween(date1: Date, date2: Date): number {
  const diff = Math.abs(date2.getTime() - date1.getTime());
  return diff / (1000 * 60 * 60 * 24);
}

function groupByField(records: ProcessingRecord[], field: keyof ProcessingRecord): Record<string, number> {
  const groups: Record<string, number> = {};
  
  for (const record of records) {
    const value = String(record[field] || 'unknown');
    groups[value] = (groups[value] || 0) + 1;
  }
  
  return groups;
}

function calculateStageMetrics(records: ProcessingRecord[]): any {
  const stageMetrics: Record<string, any> = {};
  
  for (const record of records) {
    for (const stage of record.stages) {
      if (!stageMetrics[stage.name]) {
        stageMetrics[stage.name] = {
          count: 0,
          successful: 0,
          failed: 0,
          totalDuration: 0,
          totalConfidence: 0
        };
      }
      
      stageMetrics[stage.name].count++;
      if (stage.status === 'completed') {
        stageMetrics[stage.name].successful++;
      } else if (stage.status === 'failed') {
        stageMetrics[stage.name].failed++;
      }
      
      stageMetrics[stage.name].totalDuration += stage.duration || 0;
      stageMetrics[stage.name].totalConfidence += stage.confidence;
    }
  }
  
  // Calculate averages
  for (const stageName of Object.keys(stageMetrics)) {
    const metrics = stageMetrics[stageName];
    metrics.averageDuration = metrics.totalDuration / metrics.count;
    metrics.averageConfidence = metrics.totalConfidence / metrics.count;
    metrics.successRate = (metrics.successful / metrics.count) * 100;
    
    delete metrics.totalDuration;
    delete metrics.totalConfidence;
  }
  
  return stageMetrics;
}

function groupByTime(records: ProcessingRecord[], groupBy: string): any[] {
  const groups: Map<string, any> = new Map();
  
  for (const record of records) {
    const key = getTimeKey(record.startTime, groupBy);
    
    if (!groups.has(key)) {
      groups.set(key, {
        period: key,
        count: 0,
        successful: 0,
        failed: 0,
        totalScore: 0,
        totalConfidence: 0
      });
    }
    
    const group = groups.get(key)!;
    group.count++;
    
    if (record.finalScore !== undefined) {
      group.successful++;
      group.totalScore += record.finalScore;
    } else if (record.errors && record.errors.length > 0) {
      group.failed++;
    }
    
    group.totalConfidence += record.finalConfidence || 0;
  }
  
  // Calculate averages and convert to array
  const result = [];
  for (const [key, group] of groups) {
    group.averageScore = group.count > 0 ? group.totalScore / group.count : 0;
    group.averageConfidence = group.count > 0 ? group.totalConfidence / group.count : 0;
    
    delete group.totalScore;
    delete group.totalConfidence;
    
    result.push(group);
  }
  
  return result.sort((a, b) => a.period.localeCompare(b.period));
}

function getTimeKey(date: Date, groupBy: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  
  switch (groupBy) {
    case 'hour':
      return `${year}-${month}-${day} ${hour}:00`;
    case 'day':
      return `${year}-${month}-${day}`;
    case 'week':
      const weekNumber = getWeekNumber(date);
      return `${year}-W${String(weekNumber).padStart(2, '0')}`;
    case 'month':
      return `${year}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}