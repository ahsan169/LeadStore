/**
 * Intelligent Brain Pipeline
 * Multi-stage processing with confidence scoring and audit trail
 */

import { z } from 'zod';
import { Lead, InsertLead, UccFiling } from '@shared/schema';
import { fieldMapper, CanonicalField, FIELD_VALIDATORS } from './ontology';
import { leadQualityScorer, funderMatcher } from './industry-knowledge';
import { uccIntelligenceService } from '../services/ucc-intelligence';
import { comprehensiveLeadEnricher, EnrichmentResult } from '../services/comprehensive-lead-enricher';
import { leadCompletionAnalyzer } from '../services/lead-completion-analyzer';
import { eventBus } from '../services/event-bus';
import { db } from '../db';
import { leads, uccFilings, ruleExecutions } from '@shared/schema';
import { eq, and, or, sql } from 'drizzle-orm';
import { rulesEngine, RuleContext, RuleType } from './rules-engine';
import { scorecardManager, LeadMetrics } from './scorecard';

/**
 * Pipeline stage names
 */
export enum PipelineStage {
  INGEST = 'ingest',
  NORMALIZE = 'normalize',
  RESOLVE = 'resolve',
  ENRICH = 'enrich',
  UCC_AGGREGATE = 'ucc_aggregate',
  RULES = 'rules',
  SCORE = 'score',
  EXPORT = 'export'
}

/**
 * Confidence level thresholds
 */
export enum ConfidenceLevel {
  VERY_HIGH = 90,
  HIGH = 75,
  MEDIUM = 50,
  LOW = 25,
  VERY_LOW = 10
}

/**
 * Stage execution status
 */
export enum StageStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Stage context for passing data between stages
 */
export interface StageContext {
  leadId?: string;
  rawData: any;
  normalizedData: Partial<Lead>;
  enrichmentData?: EnrichmentResult;
  uccData?: UccFiling[];
  uccAnalysis?: any;
  score?: number;
  scoreBreakdown?: Record<string, number>;
  confidence: number;
  metadata: {
    source: string;
    timestamp: Date;
    userId?: string;
    batchId?: string;
    sessionId: string;
  };
  audit: AuditEntry[];
  lineage: LineageEntry[];
  errors: ErrorEntry[];
  flags: string[];
  recommendations: string[];
}

/**
 * Audit trail entry
 */
export interface AuditEntry {
  stage: PipelineStage;
  status: StageStatus;
  confidence: number;
  timestamp: Date;
  duration?: number;
  decision?: string;
  explanation?: string;
  changes?: Record<string, any>;
  warnings?: string[];
}

/**
 * Lineage tracking entry
 */
export interface LineageEntry {
  stage: PipelineStage;
  inputFields: string[];
  outputFields: string[];
  transformations: string[];
  source?: string;
  confidence: number;
}

/**
 * Error tracking entry
 */
export interface ErrorEntry {
  stage: PipelineStage;
  error: string;
  timestamp: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolution?: string;
  retryable: boolean;
}

/**
 * Stage result
 */
export interface StageResult {
  status: StageStatus;
  context: StageContext;
  confidence: number;
  duration: number;
  errors?: ErrorEntry[];
}

/**
 * Stage interface
 */
export interface IPipelineStage {
  name: PipelineStage;
  execute(context: StageContext): Promise<StageResult>;
  validate(context: StageContext): boolean;
  rollback?(context: StageContext): Promise<void>;
}

/**
 * Base stage class with common functionality
 */
abstract class BaseStage implements IPipelineStage {
  abstract name: PipelineStage;
  
  abstract executeStage(context: StageContext): Promise<StageContext>;
  
  async execute(context: StageContext): Promise<StageResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      if (!this.validate(context)) {
        throw new Error(`Validation failed for stage ${this.name}`);
      }
      
      // Execute stage
      const updatedContext = await this.executeStage(context);
      
      // Calculate confidence
      const confidence = this.calculateConfidence(updatedContext);
      
      // Add audit entry
      const duration = Date.now() - startTime;
      updatedContext.audit.push({
        stage: this.name,
        status: StageStatus.COMPLETED,
        confidence,
        timestamp: new Date(),
        duration,
        decision: this.getDecision(updatedContext),
        explanation: this.getExplanation(updatedContext)
      });
      
      return {
        status: StageStatus.COMPLETED,
        context: updatedContext,
        confidence,
        duration
      };
      
    } catch (error) {
      const errorEntry: ErrorEntry = {
        stage: this.name,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        severity: 'high',
        retryable: true
      };
      
      context.errors.push(errorEntry);
      
      return {
        status: StageStatus.FAILED,
        context,
        confidence: 0,
        duration: Date.now() - startTime,
        errors: [errorEntry]
      };
    }
  }
  
  validate(context: StageContext): boolean {
    return context !== null && context.rawData !== null;
  }
  
  abstract calculateConfidence(context: StageContext): number;
  abstract getDecision(context: StageContext): string;
  abstract getExplanation(context: StageContext): string;
}

/**
 * Ingest Stage - Parse raw data and detect format
 */
class IngestStage extends BaseStage {
  name = PipelineStage.INGEST;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const { rawData } = context;
    
    // Detect data format
    const format = this.detectFormat(rawData);
    
    // Parse data based on format
    const parsed = this.parseData(rawData, format);
    
    // Initial validation
    const validationResult = this.validateData(parsed);
    
    // Add lineage
    context.lineage.push({
      stage: this.name,
      inputFields: Object.keys(rawData),
      outputFields: Object.keys(parsed),
      transformations: [`Detected format: ${format}`, 'Parsed raw data', 'Initial validation'],
      source: context.metadata.source,
      confidence: validationResult.confidence
    });
    
    context.rawData = parsed;
    context.confidence = validationResult.confidence;
    
    if (validationResult.warnings.length > 0) {
      context.flags.push(...validationResult.warnings);
    }
    
    return context;
  }
  
  private detectFormat(data: any): string {
    if (Array.isArray(data)) return 'array';
    if (typeof data === 'object' && data !== null) return 'object';
    if (typeof data === 'string') {
      try {
        JSON.parse(data);
        return 'json_string';
      } catch {
        return 'csv_string';
      }
    }
    return 'unknown';
  }
  
  private parseData(data: any, format: string): any {
    switch (format) {
      case 'json_string':
        return JSON.parse(data);
      case 'csv_string':
        // Simple CSV parsing logic
        const lines = data.split('\n');
        const headers = lines[0].split(',').map((h: string) => h.trim());
        const values = lines[1]?.split(',').map((v: string) => v.trim()) || [];
        const result: any = {};
        headers.forEach((header: string, index: number) => {
          result[header] = values[index] || '';
        });
        return result;
      case 'array':
        return data[0] || {};
      default:
        return data;
    }
  }
  
  private validateData(data: any): { confidence: number; warnings: string[] } {
    const warnings: string[] = [];
    let confidence = 100;
    
    // Check for required fields
    const requiredFields = ['businessName', 'business name', 'company', 'name'];
    const hasBusinessName = requiredFields.some(field => 
      data[field] || data[field.toLowerCase()] || data[field.replace(' ', '_')]
    );
    
    if (!hasBusinessName) {
      warnings.push('Missing business name');
      confidence -= 30;
    }
    
    // Check for contact information
    const hasContact = data.email || data.phone || data.ownerName;
    if (!hasContact) {
      warnings.push('Missing contact information');
      confidence -= 20;
    }
    
    return { confidence: Math.max(0, confidence), warnings };
  }
  
  calculateConfidence(context: StageContext): number {
    return context.confidence;
  }
  
  getDecision(context: StageContext): string {
    return `Ingested ${Object.keys(context.rawData).length} fields`;
  }
  
  getExplanation(context: StageContext): string {
    return `Successfully parsed raw data with ${context.confidence}% confidence`;
  }
}

/**
 * Normalize Stage - Apply ontology and map fields
 */
class NormalizeStage extends BaseStage {
  name = PipelineStage.NORMALIZE;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const normalized: any = {};
    const mappings: Record<string, string> = {};
    
    // Map fields using ontology
    for (const [rawField, value] of Object.entries(context.rawData)) {
      const canonicalField = fieldMapper.mapToCanonical(rawField);
      
      if (canonicalField) {
        // Apply validators
        const validator = (FIELD_VALIDATORS as Record<string, any>)[canonicalField];
        if (validator) {
          const validatedValue = validator.normalize ? 
            validator.normalize(value) : value;
          
          if (validator.validate(validatedValue)) {
            normalized[canonicalField] = validatedValue;
            mappings[rawField] = canonicalField;
          } else {
            context.flags.push(`Invalid value for ${canonicalField}: ${value}`);
          }
        } else {
          normalized[canonicalField] = value;
          mappings[rawField] = canonicalField;
        }
      }
    }
    
    // Add lineage
    context.lineage.push({
      stage: this.name,
      inputFields: Object.keys(context.rawData),
      outputFields: Object.keys(normalized),
      transformations: Object.entries(mappings).map(([from, to]) => `${from} → ${to}`),
      confidence: this.calculateMappingConfidence(mappings, context.rawData)
    });
    
    context.normalizedData = normalized;
    
    return context;
  }
  
  private calculateMappingConfidence(mappings: Record<string, string>, rawData: any): number {
    const totalFields = Object.keys(rawData).length;
    const mappedFields = Object.keys(mappings).length;
    
    if (totalFields === 0) return 0;
    
    const mappingRate = (mappedFields / totalFields) * 100;
    
    // Bonus for critical fields
    const criticalFields = ['businessName', 'email', 'phone', 'annualRevenue'];
    const criticalMapped = criticalFields.filter(field => 
      Object.values(mappings).includes(field as CanonicalField)
    ).length;
    
    const criticalBonus = (criticalMapped / criticalFields.length) * 20;
    
    return Math.min(100, mappingRate + criticalBonus);
  }
  
  calculateConfidence(context: StageContext): number {
    const lineageEntry = context.lineage.find(l => l.stage === this.name);
    return lineageEntry?.confidence || 50;
  }
  
  getDecision(context: StageContext): string {
    return `Normalized ${Object.keys(context.normalizedData).length} fields`;
  }
  
  getExplanation(context: StageContext): string {
    const mapped = Object.keys(context.normalizedData).length;
    const original = Object.keys(context.rawData).length;
    return `Mapped ${mapped} out of ${original} fields using ontology`;
  }
}

/**
 * Resolve Stage - Entity resolution and deduplication
 */
class ResolveStage extends BaseStage {
  name = PipelineStage.RESOLVE;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const { normalizedData } = context;
    
    // Check for existing leads
    const existingLeads = await this.findExistingLeads(normalizedData);
    
    if (existingLeads.length > 0) {
      // Merge with existing lead
      const merged = await this.mergeWithExisting(normalizedData, existingLeads[0]);
      context.normalizedData = merged;
      context.leadId = existingLeads[0].id;
      
      context.flags.push(`Merged with existing lead ${existingLeads[0].id}`);
      context.lineage.push({
        stage: this.name,
        inputFields: Object.keys(normalizedData),
        outputFields: Object.keys(merged),
        transformations: ['Entity resolution', 'Deduplication', 'Data merge'],
        confidence: 85
      });
    } else {
      // New lead
      context.lineage.push({
        stage: this.name,
        inputFields: Object.keys(normalizedData),
        outputFields: Object.keys(normalizedData),
        transformations: ['No duplicates found', 'New entity created'],
        confidence: 95
      });
    }
    
    return context;
  }
  
  private async findExistingLeads(data: Partial<Lead>): Promise<Lead[]> {
    const conditions = [];
    
    if (data.email) {
      conditions.push(eq(leads.email, data.email));
    }
    
    if (data.phone) {
      conditions.push(eq(leads.phone, data.phone));
    }
    
    if (data.businessName && data.stateCode) {
      conditions.push(
        and(
          eq(leads.businessName, data.businessName),
          eq(leads.stateCode, data.stateCode)
        )
      );
    }
    
    if (conditions.length === 0) return [];
    
    return await db.select()
      .from(leads)
      .where(or(...conditions))
      .limit(5);
  }
  
  private async mergeWithExisting(newData: Partial<Lead>, existing: Lead): Promise<Partial<Lead>> {
    const merged: any = { ...existing };
    
    // Merge non-null values
    for (const [key, value] of Object.entries(newData)) {
      if (value !== null && value !== undefined && value !== '') {
        // Keep existing value if it's more complete
        if (!merged[key] || merged[key] === '' || 
            (typeof value === 'string' && value.length > String(merged[key]).length)) {
          merged[key] = value;
        }
      }
    }
    
    return merged;
  }
  
  calculateConfidence(context: StageContext): number {
    const lineageEntry = context.lineage.find(l => l.stage === this.name);
    return lineageEntry?.confidence || 70;
  }
  
  getDecision(context: StageContext): string {
    return context.leadId ? 
      `Resolved to existing lead ${context.leadId}` : 
      'Created new entity';
  }
  
  getExplanation(context: StageContext): string {
    return context.leadId ? 
      'Entity resolution found and merged with existing lead' : 
      'No duplicates found, treating as new entity';
  }
}

/**
 * Enrich Stage - Add missing data and verify existing
 */
class EnrichStage extends BaseStage {
  name = PipelineStage.ENRICH;
  private enricher: any;
  
  constructor() {
    super();
    this.enricher = comprehensiveLeadEnricher;
  }
  
  async executeStage(context: StageContext): Promise<StageContext> {
    try {
      // Analyze what needs enrichment
      const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(context.normalizedData);
      
      if (analysis.enrichmentPriority === 'none') {
        context.flags.push('Lead already complete, skipping enrichment');
        return context;
      }
      
      // Import tiered intelligence services dynamically
      const { fieldExtractor } = await import('./field-extractor');
      const { tieredIntelligence } = await import('./tiered-intelligence');
      
      // Define fields to extract/enrich based on missing fields
      const missingFieldNames = analysis.missingFields.map((f: any) => typeof f === 'string' ? f : f.field);
      const fieldsToExtract: string[] = missingFieldNames.length > 0 ? 
        missingFieldNames : 
        ['businessName', 'ownerName', 'email', 'phone', 'industry', 'annualRevenue'];
      
      // Use tiered intelligence for field extraction
      const extractionResult = await fieldExtractor.extractFields({
        data: context.normalizedData,
        fields: fieldsToExtract,
        context: {
          leadId: context.leadId,
          userId: context.metadata?.userId,
          batchId: context.metadata?.batchId,
          source: context.metadata?.source
        },
        requirements: {
          minConfidence: 0.7,
          maxCost: 0.10,
          maxLatency: 10000
        },
        options: {
          parallel: true,
          stopOnHighConfidence: true
        }
      });
      
      // Track intelligence metrics
      const tierStats = {
        totalCost: extractionResult.totalCost,
        totalLatency: extractionResult.totalLatency,
        averageConfidence: extractionResult.averageConfidence,
        tiersUsed: Array.from(extractionResult.tiersUsed),
        fieldsExtracted: Object.keys(extractionResult.fields).length
      };
      
      console.log('[EnrichStage] Tiered intelligence results:', tierStats);
      
      // Build enriched data from extraction results
      let enrichedData: any = {};
      const enrichedFields: string[] = [];
      
      for (const [field, result] of Object.entries(extractionResult.fields)) {
        if ((result as any).extractedValue !== null && (result as any).confidence > 0.5) {
          enrichedData[field] = (result as any).extractedValue;
          enrichedFields.push(field);
        }
      }
      
      // If tiered intelligence didn't get enough data, fall back to traditional enrichment
      if (enrichedFields.length < fieldsToExtract.length * 0.5) {
        console.log('[EnrichStage] Falling back to traditional enrichment for additional fields');
        const traditionalResult = await this.enricher.enrichLead(
          context.normalizedData,
          {
            usePerplexity: missingFieldNames.includes('industry'),
            useHunter: missingFieldNames.includes('email'),
            useNumverify: missingFieldNames.includes('phone'),
            maxRetries: 2
          }
        );
        
        if (traditionalResult) {
          // Merge results, preferring tiered intelligence data
          Object.assign(traditionalResult, enrichedData);
          enrichedData = traditionalResult;
          enrichedFields.push(...Object.keys(traditionalResult));
        }
        
        context.enrichmentData = {
          ...traditionalResult,
          enrichedData,
          enrichedFields,
          tierStats,
          method: 'hybrid'
        };
      } else {
        // Use only tiered intelligence results
        context.enrichmentData = {
          success: true,
          enrichedData,
          enrichedFields,
          confidence: extractionResult.averageConfidence * 100,
          sources: [`tiered_intelligence_${tierStats.tiersUsed.join('_')}`],
          tierStats,
          method: 'tiered_intelligence'
        } as any;
      }
      
      if (context.enrichmentData) {
        const enrichData = context.enrichmentData as any;
        if (enrichData.enrichedData || enrichData) {
          // Merge enriched data
          context.normalizedData = {
            ...context.normalizedData,
            ...(enrichData.enrichedData || enrichData)
          };
          
          // Add lineage
          const sources = enrichData.enrichmentMetadata?.sources || [];
          context.lineage.push({
            stage: this.name,
            inputFields: Object.keys(context.normalizedData),
            outputFields: enrichedFields,
            transformations: sources.map((s: string) => `Enriched via ${s}`),
            confidence: enrichData.confidenceScores?.overall || enrichData.confidence || 70
          });
        }
      }
      
    } catch (error) {
      context.errors.push({
        stage: this.name,
        error: error instanceof Error ? error.message : 'Enrichment failed',
        timestamp: new Date(),
        severity: 'medium',
        retryable: true
      });
    }
    
    return context;
  }
  
  calculateConfidence(context: StageContext): number {
    const enrichData = context.enrichmentData as any;
    return enrichData?.confidenceScores?.overall || enrichData?.confidence || 60;
  }
  
  getDecision(context: StageContext): string {
    const enrichData = context.enrichmentData as any;
    const enrichedCount = enrichData?.enrichmentMetadata?.fieldsEnriched?.length || 0;
    return `Enriched ${enrichedCount} fields`;
  }
  
  getExplanation(context: StageContext): string {
    if (!context.enrichmentData) return 'Enrichment skipped or failed';
    
    const enrichData = context.enrichmentData as any;
    const sources = (enrichData.enrichmentMetadata?.sources || []).join(', ') || 'various sources';
    const confidence = enrichData.confidenceScores?.overall || enrichData.confidence || 0;
    return `Enhanced lead data using ${sources} with ${confidence}% confidence`;
  }
}

/**
 * UCC Aggregate Stage - Combine UCC filings and calculate risk
 */
class UccAggregateStage extends BaseStage {
  name = PipelineStage.UCC_AGGREGATE;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const { normalizedData } = context;
    
    if (!normalizedData.businessName) {
      context.flags.push('No business name for UCC lookup');
      return context;
    }
    
    try {
      // Search for UCC filings (renamed to avoid conflict with imported table)
      const uccFilingsTable = uccFilings;
      const uccFilingsResult = await db.select()
        .from(uccFilingsTable)
        .where(
          or(
            eq(uccFilingsTable.debtorName, normalizedData.businessName),
            sql`${uccFilingsTable.debtorName} ILIKE ${normalizedData.businessName}`
          )
        )
        .limit(20);
      
      if (uccFilingsResult.length > 0) {
        context.uccData = uccFilingsResult;
        
        // Analyze UCC data
        const analysis = await this.analyzeUccData(uccFilingsResult, normalizedData);
        context.uccAnalysis = analysis;
        
        // Update normalized data with UCC insights (use type assertions for dynamic properties)
        (context.normalizedData as any).currentPositions = analysis.activePositions;
        (context.normalizedData as any).totalUccAmount = analysis.totalDebt;
        context.normalizedData.stackingRisk = analysis.stackingRisk;
        
        context.lineage.push({
          stage: this.name,
          inputFields: ['businessName', 'email', 'phone'],
          outputFields: ['currentPositions', 'totalUccAmount', 'stackingRisk'],
          transformations: [`Found ${uccFilingsResult.length} UCC filings`, 'Calculated risk metrics'],
          confidence: 85
        });
        
        // Add warnings if high risk
        if (analysis.stackingRisk === 'high' || analysis.stackingRisk === 'critical') {
          context.flags.push(`High stacking risk detected: ${analysis.activePositions} active positions`);
        }
      }
      
    } catch (error) {
      context.errors.push({
        stage: this.name,
        error: error instanceof Error ? error.message : 'UCC aggregation failed',
        timestamp: new Date(),
        severity: 'low',
        retryable: true
      });
    }
    
    return context;
  }
  
  private async analyzeUccData(filings: UccFiling[], lead: Partial<Lead>): Promise<any> {
    // Calculate active positions (use filingType to determine if active)
    const activeFilings = filings.filter(f => 
      f.filingType !== 'termination' && f.filingType !== 'terminated'
    );
    
    // Calculate total debt (use loanAmount if available)
    const totalDebt = filings.reduce((sum, f) => sum + (f.loanAmount || 0), 0);
    
    // Determine stacking risk
    let stackingRisk = 'low';
    if (activeFilings.length >= 4) stackingRisk = 'critical';
    else if (activeFilings.length >= 3) stackingRisk = 'high';
    else if (activeFilings.length >= 2) stackingRisk = 'moderate';
    
    // Get unique lenders
    const lenders = Array.from(new Set(filings.map(f => f.securedParty).filter(Boolean)));
    
    return {
      totalFilings: filings.length,
      activePositions: activeFilings.length,
      totalDebt,
      stackingRisk,
      lenders,
      mostRecentFiling: filings[0]?.filingDate,
      averageAmount: totalDebt / (filings.length || 1)
    };
  }
  
  calculateConfidence(context: StageContext): number {
    if (!context.uccData || context.uccData.length === 0) return 50;
    
    // Higher confidence with more UCC data
    const dataPoints = context.uccData.length;
    return Math.min(95, 70 + (dataPoints * 2.5));
  }
  
  getDecision(context: StageContext): string {
    const count = context.uccData?.length || 0;
    return count > 0 ? 
      `Analyzed ${count} UCC filings` : 
      'No UCC filings found';
  }
  
  getExplanation(context: StageContext): string {
    if (!context.uccAnalysis) return 'No UCC data available';
    
    const { activePositions, stackingRisk } = context.uccAnalysis;
    return `Found ${activePositions} active positions with ${stackingRisk} stacking risk`;
  }
}

/**
 * Rules Stage - Execute business rules
 */
class RulesStage extends BaseStage {
  name = PipelineStage.RULES;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const { normalizedData, uccData } = context;
    
    // Create rule context
    const ruleContext: RuleContext = {
      lead: normalizedData as Lead,
      uccFilings: uccData,
      scores: {},
      transformations: {},
      alerts: [],
      enrichments: {},
      metadata: context.metadata,
      executionPath: [],
      timing: {}
    };
    
    try {
      // Execute all enabled rules
      const results = await rulesEngine.execute(ruleContext);
      
      // Apply transformations to normalized data
      Object.assign(normalizedData, ruleContext.transformations);
      
      // Store rule execution results (use type assertion for extended metadata)
      (context.metadata as any).ruleExecutionResults = results;
      (context.metadata as any).ruleScores = ruleContext.scores;
      (context.metadata as any).ruleAlerts = ruleContext.alerts;
      
      // Add alerts as flags
      ruleContext.alerts.forEach(alert => {
        context.flags.push(`[${alert.severity}] ${alert.message}`);
      });
      
      // Log execution to database if leadId exists
      if (context.leadId) {
        const executionRecords = results.map(result => ({
          leadId: context.leadId!,
          ruleId: result.ruleId,
          matched: result.matched,
          executionTime: result.executionTime,
          actionsExecuted: result.actionsExecuted,
          transformations: result.transformations,
          scores: result.scoreImpact
        }));
        
        // Save to database (non-blocking)
        db.insert(ruleExecutions).values(executionRecords).catch(error => {
          console.error('Failed to log rule executions:', error);
        });
      }
      
      context.lineage.push({
        stage: this.name,
        inputFields: Object.keys(normalizedData),
        outputFields: Object.keys(ruleContext.transformations),
        transformations: [`Executed ${results.length} rules`, `${results.filter(r => r.matched).length} matched`],
        confidence: 90
      });
      
    } catch (error) {
      context.errors.push({
        stage: this.name,
        error: error instanceof Error ? error.message : 'Rules execution failed',
        timestamp: new Date(),
        severity: 'medium',
        retryable: true
      });
    }
    
    return context;
  }
  
  calculateConfidence(context: StageContext): number {
    const results = (context.metadata as any).ruleExecutionResults as any[] || [];
    const matchedCount = results.filter((r: any) => r.matched).length;
    return Math.min(95, 70 + (matchedCount * 2));
  }
  
  getDecision(context: StageContext): string {
    const results = (context.metadata as any).ruleExecutionResults as any[] || [];
    return `Executed ${results.length} rules, ${results.filter((r: any) => r.matched).length} matched`;
  }
  
  getExplanation(context: StageContext): string {
    const alerts = (context.metadata as any).ruleAlerts as any[] || [];
    return alerts.length > 0 ? 
      `Generated ${alerts.length} alerts` : 
      'No alerts generated';
  }
}

/**
 * Score Stage - Calculate final lead score using scorecard
 */
class ScoreStage extends BaseStage {
  name = PipelineStage.SCORE;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    const { normalizedData, uccData, enrichmentData } = context;
    
    // Create lead metrics for scorecard
    const leadMetrics: LeadMetrics = {
      lead: normalizedData as Lead,
      uccFilings: uccData,
      enrichmentData: enrichmentData as any,
      verificationResults: (context.metadata as any).verificationResults as any
    };
    
    // Calculate score using scorecard manager
    const scoreResult = scorecardManager.calculateScore(leadMetrics);
    
    // Store results
    context.score = scoreResult.totalScore;
    context.scoreBreakdown = scoreResult.components.reduce((acc, component) => {
      acc[component.name] = component.weightedScore;
      return acc;
    }, {} as Record<string, number>);
    
    // Add explanations and recommendations
    context.flags.push(...scoreResult.explanations);
    context.recommendations.push(...scoreResult.recommendations);
    
    // Match with funders
    const funderMatchResult = funderMatcher.matchFunders(normalizedData);
    
    // Add funder recommendations
    if (funderMatchResult.recommended.length > 0) {
      context.recommendations.push(
        `Recommended funders: ${funderMatchResult.recommended.slice(0, 3).map((f: any) => f.name).join(', ')}`
      );
    }
    
    context.lineage.push({
      stage: this.name,
      inputFields: Object.keys(normalizedData),
      outputFields: ['score', 'scoreBreakdown', 'funderMatches'],
      transformations: ['Applied scoring algorithm', 'Matched with funders'],
      confidence: 90
    });
    
    return context;
  }
  
  calculateConfidence(context: StageContext): number {
    // Confidence based on data completeness
    const fields = Object.keys(context.normalizedData);
    const criticalFields = ['businessName', 'email', 'phone', 'annualRevenue', 'creditScore'];
    const hasFields = criticalFields.filter(f => 
      context.normalizedData[f as keyof Lead]
    ).length;
    
    return Math.min(100, (hasFields / criticalFields.length) * 100);
  }
  
  getDecision(context: StageContext): string {
    return `Lead score: ${context.score?.toFixed(1)}/100`;
  }
  
  getExplanation(context: StageContext): string {
    if (!context.scoreBreakdown) return 'Scoring not completed';
    
    const topFactors = Object.entries(context.scoreBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([key]) => key);
    
    return `Score based on ${topFactors.join(', ')}`;
  }
}

/**
 * Export Stage - Format for delivery
 */
class ExportStage extends BaseStage {
  name = PipelineStage.EXPORT;
  
  async executeStage(context: StageContext): Promise<StageContext> {
    // Format the final output
    const exportData = {
      lead: context.normalizedData,
      score: context.score,
      scoreBreakdown: context.scoreBreakdown,
      enrichment: {
        sources: (context.enrichmentData as any)?.enrichmentMetadata?.sources || [],
        confidence: (context.enrichmentData as any)?.confidenceScores?.overall || 0,
        fieldsEnriched: (context.enrichmentData as any)?.enrichmentMetadata?.fieldsEnriched || []
      },
      ucc: {
        filings: context.uccData?.length || 0,
        analysis: context.uccAnalysis || null
      },
      quality: {
        confidence: context.confidence,
        flags: context.flags,
        recommendations: context.recommendations
      },
      metadata: {
        processedAt: new Date(),
        pipelineVersion: '1.0.0',
        stages: context.audit.map(a => ({
          name: a.stage,
          status: a.status,
          confidence: a.confidence,
          duration: a.duration
        }))
      }
    };
    
    // Save or update lead in database
    if (context.leadId) {
      await db.update(leads)
        .set({
          ...context.normalizedData,
          qualityScore: context.score,
          lastEnrichedAt: new Date()
        })
        .where(eq(leads.id, context.leadId));
    }
    
    // Emit completion event
    eventBus.emit('brain:pipeline-completed', {
      leadId: context.leadId,
      score: context.score,
      confidence: context.confidence,
      exportData
    });
    
    context.lineage.push({
      stage: this.name,
      inputFields: Object.keys(context.normalizedData),
      outputFields: Object.keys(exportData),
      transformations: ['Formatted for export', 'Saved to database'],
      confidence: 100
    });
    
    return context;
  }
  
  calculateConfidence(context: StageContext): number {
    // Overall pipeline confidence
    const stageConfidences = context.audit
      .filter(a => a.status === StageStatus.COMPLETED)
      .map(a => a.confidence);
    
    if (stageConfidences.length === 0) return 0;
    
    return stageConfidences.reduce((sum, c) => sum + c, 0) / stageConfidences.length;
  }
  
  getDecision(context: StageContext): string {
    return 'Lead processing completed';
  }
  
  getExplanation(context: StageContext): string {
    const stages = context.audit.filter(a => a.status === StageStatus.COMPLETED).length;
    return `Successfully processed through ${stages} pipeline stages`;
  }
}

/**
 * Brain Pipeline Executor
 */
export class BrainPipeline {
  private stages: Map<PipelineStage, IPipelineStage>;
  private stageOrder: PipelineStage[];
  
  constructor() {
    this.stages = new Map();
    this.stageOrder = [
      PipelineStage.INGEST,
      PipelineStage.NORMALIZE,
      PipelineStage.RESOLVE,
      PipelineStage.ENRICH,
      PipelineStage.UCC_AGGREGATE,
      PipelineStage.RULES,
      PipelineStage.SCORE,
      PipelineStage.EXPORT
    ];
    
    // Initialize stages
    this.stages.set(PipelineStage.INGEST, new IngestStage());
    this.stages.set(PipelineStage.NORMALIZE, new NormalizeStage());
    this.stages.set(PipelineStage.RESOLVE, new ResolveStage());
    this.stages.set(PipelineStage.ENRICH, new EnrichStage());
    this.stages.set(PipelineStage.UCC_AGGREGATE, new UccAggregateStage());
    this.stages.set(PipelineStage.RULES, new RulesStage());
    this.stages.set(PipelineStage.SCORE, new ScoreStage());
    this.stages.set(PipelineStage.EXPORT, new ExportStage());
    
    // Initialize scorecard and rules
    scorecardManager.initialize().catch(error => {
      console.error('Failed to initialize scorecard:', error);
    });
    
    // Load default rules
    this.loadDefaultRules().catch(error => {
      console.error('Failed to load default rules:', error);
    });
  }
  
  /**
   * Load default rules from configuration
   */
  private async loadDefaultRules(): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const rulesPath = path.join('server', 'intelligence', 'rules', 'default-rules.json');
      const rulesContent = await fs.readFile(rulesPath, 'utf8');
      const rules = JSON.parse(rulesContent);
      
      for (const rule of rules) {
        rulesEngine.addRule(rule);
      }
      
      console.log(`[BrainPipeline] Loaded ${rules.length} default rules`);
    } catch (error) {
      console.error('[BrainPipeline] Failed to load default rules:', error);
    }
  }
  
  /**
   * Process a lead through the pipeline
   */
  async process(
    rawData: any,
    options?: {
      source?: string;
      userId?: string;
      batchId?: string;
      skipStages?: PipelineStage[];
      shortCircuitConfidence?: number;
    }
  ): Promise<StageContext> {
    // Initialize context
    const context: StageContext = {
      rawData,
      normalizedData: {},
      confidence: 0,
      metadata: {
        source: options?.source || 'manual',
        timestamp: new Date(),
        userId: options?.userId,
        batchId: options?.batchId,
        sessionId: this.generateSessionId()
      },
      audit: [],
      lineage: [],
      errors: [],
      flags: [],
      recommendations: []
    };
    
    const skipStages = options?.skipStages || [];
    const shortCircuitConfidence = options?.shortCircuitConfidence || 95;
    
    console.log(`[BrainPipeline] Starting pipeline processing - Session: ${context.metadata.sessionId}`);
    
    // Execute stages in order
    for (const stageName of this.stageOrder) {
      // Skip if requested
      if (skipStages.includes(stageName)) {
        context.audit.push({
          stage: stageName,
          status: StageStatus.SKIPPED,
          confidence: 0,
          timestamp: new Date(),
          explanation: 'Stage skipped by request'
        });
        continue;
      }
      
      const stage = this.stages.get(stageName);
      if (!stage) continue;
      
      console.log(`[BrainPipeline] Executing stage: ${stageName}`);
      
      const result = await stage.execute(context);
      
      // Update context
      Object.assign(context, result.context);
      
      // Check for failure
      if (result.status === StageStatus.FAILED) {
        console.error(`[BrainPipeline] Stage ${stageName} failed:`, result.errors);
        
        // Continue with reduced confidence
        context.confidence = Math.max(0, context.confidence - 20);
        
        // Stop if critical stage fails
        if (['ingest', 'normalize'].includes(stageName)) {
          console.error(`[BrainPipeline] Critical stage ${stageName} failed, stopping pipeline`);
          break;
        }
      }
      
      // Short-circuit on high confidence
      if (result.confidence >= shortCircuitConfidence && stageName === PipelineStage.SCORE) {
        console.log(`[BrainPipeline] Short-circuiting pipeline with ${result.confidence}% confidence`);
        context.flags.push(`Pipeline short-circuited at ${stageName} with high confidence`);
        
        // Still run export stage
        const exportStage = this.stages.get(PipelineStage.EXPORT);
        if (exportStage) {
          await exportStage.execute(context);
        }
        break;
      }
    }
    
    console.log(`[BrainPipeline] Pipeline completed - Session: ${context.metadata.sessionId}`);
    
    return context;
  }
  
  /**
   * Process multiple leads in batch
   */
  async processBatch(
    leads: any[],
    options?: {
      source?: string;
      userId?: string;
      parallel?: boolean;
      maxConcurrency?: number;
    }
  ): Promise<StageContext[]> {
    const batchId = this.generateBatchId();
    console.log(`[BrainPipeline] Starting batch processing - Batch ID: ${batchId}, Leads: ${leads.length}`);
    
    if (options?.parallel) {
      // Process in parallel with concurrency control
      const maxConcurrency = options.maxConcurrency || 5;
      const results: StageContext[] = [];
      
      for (let i = 0; i < leads.length; i += maxConcurrency) {
        const batch = leads.slice(i, i + maxConcurrency);
        const batchResults = await Promise.all(
          batch.map(lead => this.process(lead, {
            ...options,
            batchId
          }))
        );
        results.push(...batchResults);
      }
      
      return results;
    } else {
      // Process sequentially
      const results: StageContext[] = [];
      
      for (const lead of leads) {
        const result = await this.process(lead, {
          ...options,
          batchId
        });
        results.push(result);
      }
      
      return results;
    }
  }
  
  /**
   * Get pipeline health status
   */
  getStatus(): any {
    return {
      status: 'healthy',
      stages: Array.from(this.stages.keys()).map(name => ({
        name,
        available: true,
        version: '1.0.0'
      })),
      version: '1.0.0',
      timestamp: new Date()
    };
  }
  
  /**
   * Get processing explanation for a lead
   */
  getExplanation(context: StageContext): any {
    return {
      sessionId: context.metadata.sessionId,
      leadId: context.leadId,
      score: context.score,
      confidence: context.confidence,
      audit: context.audit,
      lineage: context.lineage,
      errors: context.errors,
      flags: context.flags,
      recommendations: context.recommendations,
      timeline: this.buildTimeline(context.audit)
    };
  }
  
  private buildTimeline(audit: AuditEntry[]): any[] {
    return audit.map(entry => ({
      stage: entry.stage,
      status: entry.status,
      timestamp: entry.timestamp,
      duration: entry.duration,
      confidence: entry.confidence,
      decision: entry.decision,
      explanation: entry.explanation
    }));
  }
  
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const brainPipeline = new BrainPipeline();