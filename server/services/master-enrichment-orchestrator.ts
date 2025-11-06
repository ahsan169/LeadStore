import { Lead, InsertLead, UccFiling } from "@shared/schema";
import { storage } from "../storage";
import { ComprehensiveLeadEnricher, EnrichmentResult, EnrichmentOptions } from "./comprehensive-lead-enricher";
import { LeadIntelligenceService } from "./lead-intelligence";
import { UccIntelligenceExtractor } from "./ucc-intelligence-extractor";
import { UccLeadConnector } from "./ucc-lead-connector";
import { LeadCompletionAnalyzer } from "./lead-completion-analyzer";
import { EnrichmentQueue } from "./enrichment-queue";
import { eventBus } from "./event-bus";
import { dataFusionEngine, type DataFusionResult } from "./data-fusion-engine";
import { cacheManager } from "./cache-manager";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";
import { perplexityResearch } from "./perplexity-research";
import { mcaScoringService } from "./mca-scoring-service";
import { intelligentEnrichmentOrchestrator } from "./intelligent-enrichment-orchestrator";
import OpenAI from "openai";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

export interface MasterEnrichmentSource {
  systemName: string;
  timestamp: Date;
  confidence: number;
  dataProvided: string[];
  apiCallsUsed: string[];
  processingTimeMs: number;
}

export interface DataLineage {
  field: string;
  value: any;
  source: string;
  timestamp: Date;
  confidence: number;
  previousValues?: Array<{
    value: any;
    source: string;
    timestamp: Date;
  }>;
}

export interface MasterEnrichmentResult {
  leadId?: string;
  finalData: EnrichmentResult;
  masterEnrichmentScore: number;
  dataCompleteness: {
    overall: number;
    businessInfo: number;
    contactInfo: number;
    financialInfo: number;
    uccInfo: number;
    verificationInfo: number;
  };
  enrichmentSystems: MasterEnrichmentSource[];
  dataLineage: DataLineage[];
  enrichmentCascade: {
    steps: Array<{
      stepNumber: number;
      action: string;
      dataFound: string[];
      triggeredNext: string[];
      duration: number;
    }>;
    totalDuration: number;
    cascadeDepth: number;
  };
  conflictResolutions: Array<{
    field: string;
    sources: Array<{ source: string; value: any; confidence: number }>;
    resolution: string;
    finalValue: any;
  }>;
  enrichmentMetadata: {
    startedAt: Date;
    completedAt: Date;
    totalDuration: number;
    apiCallCount: number;
    cacheHitRate: number;
    parallelProcesses: number;
    errors: string[];
    warnings: string[];
  };
}

export interface MasterEnrichmentConfig {
  enableUccIntelligence: boolean;
  enableLeadIntelligence: boolean;
  enableComprehensiveEnrichment: boolean;
  enableVerification: boolean;
  enablePerplexityResearch: boolean;
  enableOpenAI: boolean;
  cascadeDepthLimit: number;
  confidenceThreshold: number;
  parallelProcessingLimit: number;
  cacheTTL: number;
  timeoutMs: number;
  retryAttempts: number;
}

export class MasterEnrichmentOrchestrator {
  private leadIntelligenceService: LeadIntelligenceService;
  private uccIntelligenceExtractor: UccIntelligenceExtractor;
  private uccLeadConnector: UccLeadConnector;
  private comprehensiveEnricher: ComprehensiveLeadEnricher;
  private leadCompletionAnalyzer: LeadCompletionAnalyzer;
  
  private defaultConfig: MasterEnrichmentConfig = {
    enableUccIntelligence: true,
    enableLeadIntelligence: true,
    enableComprehensiveEnrichment: true,
    enableVerification: true,
    enablePerplexityResearch: true,
    enableOpenAI: true,
    cascadeDepthLimit: 5,
    confidenceThreshold: 0.8,
    parallelProcessingLimit: 5,
    cacheTTL: 3600000, // 1 hour
    timeoutMs: 60000, // 60 seconds
    retryAttempts: 2
  };
  
  private config: MasterEnrichmentConfig;
  private enrichmentStats = {
    totalProcessed: 0,
    totalApiCalls: 0,
    cacheHits: 0,
    totalCacheAttempts: 0,
    averageEnrichmentTime: 0,
    systemAccuracy: new Map<string, { correct: number; total: number }>()
  };
  
  constructor(config?: Partial<MasterEnrichmentConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    
    // Initialize all services
    this.leadIntelligenceService = new LeadIntelligenceService();
    this.uccIntelligenceExtractor = new UccIntelligenceExtractor();
    this.uccLeadConnector = new UccLeadConnector();
    this.comprehensiveEnricher = new ComprehensiveLeadEnricher();
    this.leadCompletionAnalyzer = new LeadCompletionAnalyzer();
    
    // Register event listeners for automatic enrichment
    this.registerEventListeners();
    
    console.log('[MasterEnrichmentOrchestrator] Initialized with config:', this.config);
  }
  
  /**
   * Master enrichment method - orchestrates all enrichment systems
   */
  async enrichLead(
    leadData: Partial<Lead | InsertLead>,
    options: {
      source?: 'upload' | 'manual' | 'edit' | 'ucc' | 'api';
      userId?: string;
      priority?: 'high' | 'medium' | 'low';
      forceRefresh?: boolean;
    } = {}
  ): Promise<MasterEnrichmentResult> {
    const startTime = Date.now();
    const enrichmentId = this.generateEnrichmentId();
    
    console.log(`[MasterEnrichment] Starting orchestrated enrichment ${enrichmentId} for lead:`, {
      businessName: leadData.businessName,
      leadId: leadData.id,
      source: options.source
    });
    
    // Initialize result structure
    const result: MasterEnrichmentResult = {
      leadId: leadData.id,
      finalData: leadData as EnrichmentResult,
      masterEnrichmentScore: 0,
      dataCompleteness: {
        overall: 0,
        businessInfo: 0,
        contactInfo: 0,
        financialInfo: 0,
        uccInfo: 0,
        verificationInfo: 0
      },
      enrichmentSystems: [],
      dataLineage: [],
      enrichmentCascade: {
        steps: [],
        totalDuration: 0,
        cascadeDepth: 0
      },
      conflictResolutions: [],
      enrichmentMetadata: {
        startedAt: new Date(startTime),
        completedAt: new Date(),
        totalDuration: 0,
        apiCallCount: 0,
        cacheHitRate: 0,
        parallelProcesses: 0,
        errors: [],
        warnings: []
      }
    };
    
    try {
      // Check cache first if not forcing refresh
      if (!options.forceRefresh) {
        const cachedResult = await this.checkCache(leadData);
        if (cachedResult) {
          console.log(`[MasterEnrichment] Cache hit for enrichment ${enrichmentId}`);
          this.enrichmentStats.cacheHits++;
          result.enrichmentMetadata.cacheHitRate = 1;
          return cachedResult;
        }
      }
      this.enrichmentStats.totalCacheAttempts++;
      
      // Step 1: Parallel initial enrichment from all sources
      const parallelResults = await this.runParallelEnrichment(leadData, result);
      
      // Step 2: Data fusion - merge results intelligently
      const fusedData = await this.fuseEnrichmentData(parallelResults, leadData, result);
      result.finalData = fusedData;
      
      // Step 3: Enrichment cascade - use found data to find more data
      await this.runEnrichmentCascade(fusedData, result);
      
      // Step 4: Final verification and scoring
      await this.finalizeEnrichment(result);
      
      // Step 5: Save to database
      await this.saveEnrichmentResults(result);
      
      // Step 6: Cache the result
      await this.cacheResult(leadData, result);
      
      // Update statistics
      this.updateStatistics(result);
      
      // Emit enrichment complete event
      eventBus.emit('master:enrichment-complete', {
        leadId: leadData.id,
        enrichmentId,
        score: result.masterEnrichmentScore,
        completeness: result.dataCompleteness.overall
      });
      
    } catch (error) {
      console.error(`[MasterEnrichment] Error in enrichment ${enrichmentId}:`, error);
      result.enrichmentMetadata.errors.push((error as Error).message);
    }
    
    // Finalize metadata
    const endTime = Date.now();
    result.enrichmentMetadata.completedAt = new Date(endTime);
    result.enrichmentMetadata.totalDuration = endTime - startTime;
    result.enrichmentCascade.totalDuration = endTime - startTime;
    result.enrichmentMetadata.cacheHitRate = this.enrichmentStats.cacheHits / Math.max(1, this.enrichmentStats.totalCacheAttempts);
    
    console.log(`[MasterEnrichment] Completed enrichment ${enrichmentId} in ${result.enrichmentMetadata.totalDuration}ms`);
    
    return result;
  }
  
  /**
   * Run parallel enrichment from all configured sources
   */
  private async runParallelEnrichment(
    leadData: Partial<Lead | InsertLead>,
    result: MasterEnrichmentResult
  ): Promise<any[]> {
    const parallelTasks = [];
    const startTime = Date.now();
    
    // Use IntelligentEnrichmentOrchestrator as the main enrichment engine
    // This includes caching, QA validation, audit trail, and analytics
    parallelTasks.push(
      this.runWithTracking('IntelligentOrchestrator', async () => {
        const orchestratorResult = await intelligentEnrichmentOrchestrator.enrichLead(leadData, {
          strategy: 'comprehensive',
          forceRefresh: false,
          priority: 'high',
          budget: 1.0,
          timeoutMs: this.config.timeoutMs
        });
        
        // The orchestrator result includes enriched lead with all integrated services
        return {
          ...orchestratorResult.enrichedLead,
          servicesUsed: orchestratorResult.servicesUsed,
          totalCost: orchestratorResult.totalCost,
          processingTime: orchestratorResult.processingTime,
          successRate: orchestratorResult.successRate,
          errors: orchestratorResult.errors,
          warnings: orchestratorResult.warnings
        };
      })
    );
    
    // Keep existing comprehensive enrichment as fallback
    if (this.config.enableComprehensiveEnrichment && !this.config.enableUccIntelligence) {
      parallelTasks.push(
        this.runWithTracking('ComprehensiveEnricher', async () => {
          return await this.comprehensiveEnricher.enrichSingleLead(leadData, {
            maxRetries: this.config.retryAttempts,
            timeout: this.config.timeoutMs
          });
        })
      );
    }
    
    // UCC Intelligence extraction
    if (this.config.enableUccIntelligence && leadData.uccNumber) {
      parallelTasks.push(
        this.runWithTracking('UccIntelligence', async () => {
          return await this.uccIntelligenceExtractor.extractIntelligence(leadData);
        })
      );
    }
    
    // MCA Scoring (Colorado methodology)
    if (leadData.securedParties || leadData.uccNumber || leadData.businessName) {
      parallelTasks.push(
        this.runWithTracking('MCAScoring', async () => {
          let uccFilings: Array<{ securedParty: string; filingDate: Date }> = [];
          
          if (leadData.businessName) {
            try {
              const filings = await storage.findUccFilingsByBusinessName(leadData.businessName);
              uccFilings = filings.map(f => ({
                securedParty: f.securedParty || '',
                filingDate: new Date(f.filingDate)
              }));
            } catch (error) {
              console.error('[MCAScoring] Error fetching UCC filings:', error);
            }
          }
          
          if (uccFilings.length === 0 && leadData.securedParties) {
            uccFilings = [{
              securedParty: leadData.securedParties,
              filingDate: leadData.lastFilingDate || new Date()
            }];
          }
          
          const mcaResult = mcaScoringService.enrichLeadWithMCAScore({
            businessName: leadData.businessName || '',
            uccFilings
          });
          
          return mcaResult;
        })
      );
    }
    
    // Lead Intelligence scoring
    if (this.config.enableLeadIntelligence && leadData.id) {
      parallelTasks.push(
        this.runWithTracking('LeadIntelligence', async () => {
          return await this.leadIntelligenceService.calculateIntelligenceScore(leadData.id);
        })
      );
    }
    
    // Email verification via Hunter
    if (this.config.enableVerification && (leadData.email || leadData.businessName)) {
      parallelTasks.push(
        this.runWithTracking('HunterVerification', async () => {
          if (leadData.email) {
            return await hunterService.verifyEmail(leadData.email);
          } else if (leadData.businessName) {
            return await hunterService.findEmailByDomain(
              this.extractDomainFromBusinessName(leadData.businessName),
              leadData.ownerName
            );
          }
        })
      );
    }
    
    // Phone verification via Numverify
    if (this.config.enableVerification && leadData.phone) {
      parallelTasks.push(
        this.runWithTracking('NumverifyVerification', async () => {
          return await numverifyService.verifyPhoneNumber(leadData.phone);
        })
      );
    }
    
    // Perplexity research
    if (this.config.enablePerplexityResearch && leadData.businessName) {
      parallelTasks.push(
        this.runWithTracking('PerplexityResearch', async () => {
          return await perplexityResearch.researchBusiness({
            businessName: leadData.businessName!,
            ownerName: leadData.ownerName,
            location: leadData.stateCode,
            industry: leadData.industry
          });
        })
      );
    }
    
    // Run all tasks in parallel
    result.enrichmentMetadata.parallelProcesses = parallelTasks.length;
    const parallelResults = await Promise.allSettled(parallelTasks);
    
    // Process results and track sources
    const successfulResults = [];
    for (let i = 0; i < parallelResults.length; i++) {
      const taskResult = parallelResults[i];
      if (taskResult.status === 'fulfilled') {
        const { systemName, data, duration } = taskResult.value;
        
        successfulResults.push(data);
        result.enrichmentSystems.push({
          systemName,
          timestamp: new Date(),
          confidence: this.calculateSystemConfidence(systemName, data),
          dataProvided: this.extractProvidedFields(data),
          apiCallsUsed: this.getSystemApiCalls(systemName),
          processingTimeMs: duration
        });
        
        result.enrichmentMetadata.apiCallCount += this.getSystemApiCalls(systemName).length;
      } else {
        result.enrichmentMetadata.errors.push(`${this.getSystemName(i)} failed: ${taskResult.reason}`);
      }
    }
    
    return successfulResults;
  }
  
  /**
   * Intelligent data fusion from multiple sources
   */
  private async fuseEnrichmentData(
    enrichmentResults: any[],
    originalData: Partial<Lead | InsertLead>,
    result: MasterEnrichmentResult
  ): Promise<EnrichmentResult> {
    console.log('[MasterEnrichment] Fusing data from multiple sources...');
    
    // Use the data fusion engine
    const fusionResult = await dataFusionEngine.fuseData(
      enrichmentResults,
      originalData,
      {
        conflictResolution: 'confidence_weighted',
        deduplication: true,
        validation: true
      }
    );
    
    // Track conflict resolutions
    result.conflictResolutions = fusionResult.conflicts.map(conflict => ({
      field: conflict.field,
      sources: conflict.sources,
      resolution: conflict.resolutionMethod,
      finalValue: conflict.resolvedValue
    }));
    
    // Track data lineage
    for (const [field, value] of Object.entries(fusionResult.fusedData)) {
      if (value !== undefined && value !== null) {
        const sourceInfo = fusionResult.lineage.find(l => l.field === field);
        if (sourceInfo) {
          result.dataLineage.push({
            field,
            value,
            source: sourceInfo.source,
            timestamp: new Date(),
            confidence: sourceInfo.confidence,
            previousValues: sourceInfo.alternatives?.map(alt => ({
              value: alt.value,
              source: alt.source,
              timestamp: new Date()
            }))
          });
        }
      }
    }
    
    return fusionResult.fusedData as EnrichmentResult;
  }
  
  /**
   * Run enrichment cascade - use found data to find more data
   */
  private async runEnrichmentCascade(
    currentData: EnrichmentResult,
    result: MasterEnrichmentResult
  ): Promise<void> {
    console.log('[MasterEnrichment] Starting enrichment cascade...');
    
    let cascadeDepth = 0;
    let previousDataHash = this.hashData(currentData);
    let cascadeData = { ...currentData };
    
    while (cascadeDepth < this.config.cascadeDepthLimit) {
      const stepStartTime = Date.now();
      const cascadeStep = {
        stepNumber: cascadeDepth + 1,
        action: '',
        dataFound: [] as string[],
        triggeredNext: [] as string[],
        duration: 0
      };
      
      // Determine what new searches we can perform based on current data
      const cascadeTasks = [];
      
      // If we found a business name but no owner, search for owner
      if (cascadeData.businessName && !cascadeData.ownerName) {
        cascadeStep.action = 'Search for owner using business name';
        cascadeTasks.push(this.searchForOwner(cascadeData.businessName));
        cascadeStep.triggeredNext.push('Owner search');
      }
      
      // If we found owner but no other businesses, search for other businesses
      if (cascadeData.ownerName && cascadeDepth < 2) {
        cascadeStep.action = 'Search for other businesses owned by ' + cascadeData.ownerName;
        cascadeTasks.push(this.searchForOtherBusinesses(cascadeData.ownerName));
        cascadeStep.triggeredNext.push('Related business search');
      }
      
      // If we have business info but no UCC, search for UCC filings
      if (cascadeData.businessName && !cascadeData.uccNumber) {
        cascadeStep.action = 'Search for UCC filings';
        cascadeTasks.push(this.searchForUccFilings(cascadeData.businessName, cascadeData.stateCode));
        cascadeStep.triggeredNext.push('UCC filing search');
      }
      
      // If we have minimal financial info, do deeper research
      if (cascadeData.businessName && !cascadeData.estimatedRevenue) {
        cascadeStep.action = 'Deep financial research';
        cascadeTasks.push(this.performDeepFinancialResearch(cascadeData));
        cascadeStep.triggeredNext.push('Financial research');
      }
      
      if (cascadeTasks.length === 0) {
        console.log('[MasterEnrichment] No more cascade tasks to perform');
        break;
      }
      
      // Execute cascade tasks
      const cascadeResults = await Promise.allSettled(cascadeTasks);
      
      // Merge cascade results
      for (const taskResult of cascadeResults) {
        if (taskResult.status === 'fulfilled' && taskResult.value) {
          const newData = taskResult.value;
          for (const [key, value] of Object.entries(newData)) {
            if (value && !cascadeData[key as keyof EnrichmentResult]) {
              cascadeData[key as keyof EnrichmentResult] = value;
              cascadeStep.dataFound.push(key);
            }
          }
        }
      }
      
      // Calculate step duration
      cascadeStep.duration = Date.now() - stepStartTime;
      result.enrichmentCascade.steps.push(cascadeStep);
      
      // Check if we found new data
      const currentDataHash = this.hashData(cascadeData);
      if (currentDataHash === previousDataHash) {
        console.log('[MasterEnrichment] No new data found in cascade step, stopping');
        break;
      }
      
      previousDataHash = currentDataHash;
      cascadeDepth++;
    }
    
    result.enrichmentCascade.cascadeDepth = cascadeDepth;
    result.finalData = cascadeData;
  }
  
  /**
   * Finalize enrichment with scoring and validation
   */
  private async finalizeEnrichment(result: MasterEnrichmentResult): Promise<void> {
    // Calculate data completeness scores
    result.dataCompleteness = this.calculateDataCompleteness(result.finalData);
    
    // Calculate master enrichment score
    result.masterEnrichmentScore = this.calculateMasterScore(result);
    
    // Perform final validation
    await this.validateEnrichmentResult(result);
  }
  
  /**
   * Calculate data completeness scores
   */
  private calculateDataCompleteness(data: EnrichmentResult): MasterEnrichmentResult['dataCompleteness'] {
    const businessFields = ['businessName', 'industry', 'websiteUrl', 'companySize', 'yearFounded'];
    const contactFields = ['ownerName', 'email', 'phone', 'linkedinUrl'];
    const financialFields = ['annualRevenue', 'estimatedRevenue', 'creditScore', 'requestedAmount'];
    const uccFields = ['uccNumber', 'filingDate', 'securedParties'];
    const verificationFields = ['email', 'phone'];
    
    const calculateCategoryCompleteness = (fields: string[]): number => {
      const filledFields = fields.filter(field => data[field as keyof EnrichmentResult]);
      return Math.round((filledFields.length / fields.length) * 100);
    };
    
    const businessInfo = calculateCategoryCompleteness(businessFields);
    const contactInfo = calculateCategoryCompleteness(contactFields);
    const financialInfo = calculateCategoryCompleteness(financialFields);
    const uccInfo = calculateCategoryCompleteness(uccFields);
    const verificationInfo = calculateCategoryCompleteness(verificationFields);
    
    const overall = Math.round(
      (businessInfo * 0.25 + 
       contactInfo * 0.25 + 
       financialInfo * 0.2 + 
       uccInfo * 0.15 + 
       verificationInfo * 0.15)
    );
    
    return {
      overall,
      businessInfo,
      contactInfo,
      financialInfo,
      uccInfo,
      verificationInfo
    };
  }
  
  /**
   * Calculate master enrichment score
   */
  private calculateMasterScore(result: MasterEnrichmentResult): number {
    let score = 0;
    
    // Completeness contributes 40%
    score += result.dataCompleteness.overall * 0.4;
    
    // Confidence scores contribute 30%
    if (result.finalData.confidenceScores) {
      score += result.finalData.confidenceScores.overall * 0.3;
    }
    
    // Number of sources contribute 20%
    const sourceScore = Math.min(100, result.enrichmentSystems.length * 20);
    score += sourceScore * 0.2;
    
    // Data freshness contributes 10%
    const freshnessScore = 100; // Assume fresh for new enrichment
    score += freshnessScore * 0.1;
    
    return Math.round(score);
  }
  
  /**
   * Save enrichment results to database
   */
  private async saveEnrichmentResults(result: MasterEnrichmentResult): Promise<void> {
    if (!result.leadId) return;
    
    try {
      const updateData: any = {
        ...result.finalData,
        masterEnrichmentScore: result.masterEnrichmentScore,
        dataCompleteness: JSON.stringify(result.dataCompleteness),
        enrichmentSystems: JSON.stringify(result.enrichmentSystems.map(s => s.systemName)),
        lastEnrichedAt: new Date()
      };
      
      if (result.finalData.mcaScore !== undefined) {
        updateData.mcaScore = result.finalData.mcaScore;
        updateData.mcaQualityTier = result.finalData.mcaQualityTier;
        updateData.hasBank = result.finalData.hasBank;
        updateData.hasEquipment = result.finalData.hasEquipment;
        updateData.hasIRS = result.finalData.hasIRS;
        updateData.hasSBA = result.finalData.hasSBA;
        updateData.mcaSector = result.finalData.mcaSector;
        updateData.whyGoodForMCA = result.finalData.whyGoodForMCA;
        updateData.mcaInsights = result.finalData.mcaInsights ? JSON.stringify(result.finalData.mcaInsights) : null;
        updateData.isGovernmentEntity = result.finalData.isGovernmentEntity;
        updateData.mcaRecencyScore = result.finalData.mcaRecencyScore;
        updateData.lastMCAEnrichmentAt = new Date();
      }
      
      // Update lead with enriched data
      await storage.updateLead(result.leadId, updateData);
      
      // Save enrichment metadata
      await storage.createLeadEnrichment({
        leadId: result.leadId,
        enrichmentType: 'master_orchestration',
        enrichmentData: result.finalData,
        confidence: result.masterEnrichmentScore / 100,
        source: result.enrichmentSystems.map(s => s.systemName).join(', '),
        enrichedAt: new Date()
      });
      
      console.log(`[MasterEnrichment] Saved enrichment results for lead ${result.leadId}`);
    } catch (error) {
      console.error('[MasterEnrichment] Error saving results:', error);
      result.enrichmentMetadata.errors.push('Failed to save enrichment results');
    }
  }
  
  /**
   * Helper methods
   */
  
  private async runWithTracking(systemName: string, task: () => Promise<any>): Promise<any> {
    const startTime = Date.now();
    try {
      const data = await task();
      const duration = Date.now() - startTime;
      return { systemName, data, duration };
    } catch (error) {
      console.error(`[MasterEnrichment] Error in ${systemName}:`, error);
      throw error;
    }
  }
  
  private generateEnrichmentId(): string {
    return `enrich_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private extractDomainFromBusinessName(businessName: string): string {
    // Simple extraction - in production, use more sophisticated logic
    return businessName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  }
  
  private calculateSystemConfidence(systemName: string, data: any): number {
    // Calculate confidence based on system and data quality
    const baseConfidence = {
      'ComprehensiveEnricher': 0.85,
      'UccIntelligence': 0.9,
      'LeadIntelligence': 0.8,
      'HunterVerification': 0.95,
      'NumverifyVerification': 0.95,
      'PerplexityResearch': 0.7
    };
    
    let confidence = baseConfidence[systemName as keyof typeof baseConfidence] || 0.5;
    
    // Adjust based on data completeness
    if (data && typeof data === 'object') {
      const fields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
      confidence *= Math.min(1, fields.length / 10);
    }
    
    return confidence;
  }
  
  private extractProvidedFields(data: any): string[] {
    if (!data || typeof data !== 'object') return [];
    return Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
  }
  
  private getSystemApiCalls(systemName: string): string[] {
    const apiCalls: Record<string, string[]> = {
      'ComprehensiveEnricher': ['hunter', 'numverify', 'perplexity', 'openai'],
      'UccIntelligence': [],
      'LeadIntelligence': [],
      'HunterVerification': ['hunter'],
      'NumverifyVerification': ['numverify'],
      'PerplexityResearch': ['perplexity']
    };
    return apiCalls[systemName] || [];
  }
  
  private getSystemName(index: number): string {
    const systems = [
      'ComprehensiveEnricher',
      'UccIntelligence', 
      'LeadIntelligence',
      'HunterVerification',
      'NumverifyVerification',
      'PerplexityResearch'
    ];
    return systems[index] || 'Unknown';
  }
  
  private hashData(data: any): string {
    return JSON.stringify(data);
  }
  
  private async checkCache(leadData: Partial<Lead | InsertLead>): Promise<MasterEnrichmentResult | null> {
    const cacheKey = `master_enrichment:${leadData.id || leadData.businessName}`;
    return await cacheManager.get(cacheKey);
  }
  
  private async cacheResult(leadData: Partial<Lead | InsertLead>, result: MasterEnrichmentResult): Promise<void> {
    const cacheKey = `master_enrichment:${leadData.id || leadData.businessName}`;
    await cacheManager.set(cacheKey, result, this.config.cacheTTL);
  }
  
  private async validateEnrichmentResult(result: MasterEnrichmentResult): Promise<void> {
    // Validate email format
    if (result.finalData.email && !this.isValidEmail(result.finalData.email)) {
      result.enrichmentMetadata.warnings.push('Invalid email format detected');
    }
    
    // Validate phone format
    if (result.finalData.phone && !this.isValidPhone(result.finalData.phone)) {
      result.enrichmentMetadata.warnings.push('Invalid phone format detected');
    }
    
    // Check for suspicious patterns
    if (result.conflictResolutions.length > 10) {
      result.enrichmentMetadata.warnings.push('High number of data conflicts detected');
    }
  }
  
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  private isValidPhone(phone: string): boolean {
    return /^\+?[\d\s\-\(\)]+$/.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }
  
  private updateStatistics(result: MasterEnrichmentResult): void {
    this.enrichmentStats.totalProcessed++;
    this.enrichmentStats.totalApiCalls += result.enrichmentMetadata.apiCallCount;
    
    // Update average enrichment time
    const currentAvg = this.enrichmentStats.averageEnrichmentTime;
    const newAvg = (currentAvg * (this.enrichmentStats.totalProcessed - 1) + result.enrichmentMetadata.totalDuration) / this.enrichmentStats.totalProcessed;
    this.enrichmentStats.averageEnrichmentTime = newAvg;
    
    // Track system accuracy (placeholder for user feedback integration)
    for (const system of result.enrichmentSystems) {
      if (!this.enrichmentStats.systemAccuracy.has(system.systemName)) {
        this.enrichmentStats.systemAccuracy.set(system.systemName, { correct: 0, total: 0 });
      }
      const stats = this.enrichmentStats.systemAccuracy.get(system.systemName)!;
      stats.total++;
      // Assume correct for now - will be updated based on user feedback
      if (system.confidence > 0.8) {
        stats.correct++;
      }
    }
  }
  
  /**
   * Cascade helper methods
   */
  
  private async searchForOwner(businessName: string): Promise<any> {
    try {
      const result = await perplexityResearch.researchBusiness({
        businessName,
        specificQuestions: ['Who is the owner or CEO of this business?']
      });
      return result?.researchInsights?.ownerInformation || {};
    } catch (error) {
      console.error('[MasterEnrichment] Error searching for owner:', error);
      return {};
    }
  }
  
  private async searchForOtherBusinesses(ownerName: string): Promise<any> {
    try {
      const result = await perplexityResearch.researchBusiness({
        ownerName,
        specificQuestions: ['What other businesses does this person own or operate?']
      });
      return result?.researchInsights?.relatedBusinesses || {};
    } catch (error) {
      console.error('[MasterEnrichment] Error searching for other businesses:', error);
      return {};
    }
  }
  
  private async searchForUccFilings(businessName: string, stateCode?: string): Promise<any> {
    try {
      // Search for UCC filings in database
      const filings = await storage.findUccFilingsByBusinessName(businessName);
      if (filings.length > 0) {
        return {
          uccNumber: filings[0].fileNumber,
          filingDate: filings[0].filingDate,
          securedParties: filings[0].securedParty
        };
      }
      return {};
    } catch (error) {
      console.error('[MasterEnrichment] Error searching for UCC filings:', error);
      return {};
    }
  }
  
  private async performDeepFinancialResearch(data: EnrichmentResult): Promise<any> {
    try {
      const prompt = `Research the following business and provide estimated annual revenue and financial information:
        Business: ${data.businessName}
        Industry: ${data.industry || 'Unknown'}
        Location: ${data.stateCode || 'Unknown'}
        Years in business: ${data.yearsInBusiness || 'Unknown'}
        
        Provide realistic estimates based on industry standards and company size.`;
      
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      });
      
      const content = response.choices[0].message.content || '';
      // Parse and extract financial information
      const revenueMatch = content.match(/\$?([\d,]+(?:\.\d+)?)[kKmMbB]?/);
      if (revenueMatch) {
        const revenue = this.parseRevenue(revenueMatch[0]);
        return {
          estimatedRevenue: revenue,
          revenueConfidence: 'medium'
        };
      }
      return {};
    } catch (error) {
      console.error('[MasterEnrichment] Error in financial research:', error);
      return {};
    }
  }
  
  private parseRevenue(revenueStr: string): number {
    const multipliers = { k: 1000, m: 1000000, b: 1000000000 };
    const cleaned = revenueStr.replace(/[$,]/g, '').toLowerCase();
    const match = cleaned.match(/([\d.]+)([kmb])?/);
    if (match) {
      const value = parseFloat(match[1]);
      const multiplier = multipliers[match[2] as keyof typeof multipliers] || 1;
      return value * multiplier;
    }
    return 0;
  }
  
  /**
   * Register event listeners for automatic enrichment
   */
  private registerEventListeners(): void {
    // Lead upload events
    eventBus.on('lead:uploaded', async (data) => {
      console.log('[MasterEnrichment] Received lead:uploaded event');
      await this.enrichLead(data.lead, { source: 'upload', userId: data.userId, priority: 'medium' });
    });
    
    // Lead edit events  
    eventBus.on('lead:updated', async (data) => {
      console.log('[MasterEnrichment] Received lead:updated event');
      await this.enrichLead(data.lead, { source: 'edit', userId: data.userId, priority: 'low' });
    });
    
    // UCC filing events
    eventBus.on('ucc:filing-uploaded', async (data) => {
      console.log('[MasterEnrichment] Received ucc:filing-uploaded event');
      // Find and enrich matching leads
      const matches = await storage.findLeadsByBusinessName(data.filing.debtorName);
      for (const lead of matches) {
        await this.enrichLead(lead, { source: 'ucc', priority: 'high' });
      }
    });
    
    // Manual enrichment request
    eventBus.on('enrichment:request', async (data) => {
      console.log('[MasterEnrichment] Received enrichment:request event');
      await this.enrichLead(data.lead, { source: 'manual', userId: data.userId, priority: data.priority || 'high' });
    });
    
    console.log('[MasterEnrichment] Event listeners registered');
  }
  
  /**
   * Get enrichment statistics
   */
  getStatistics(): typeof this.enrichmentStats {
    return { ...this.enrichmentStats };
  }
  
  /**
   * Get current configuration
   */
  getConfiguration(): MasterEnrichmentConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<MasterEnrichmentConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[MasterEnrichment] Configuration updated:', this.config);
  }
}

// Export singleton instance
export const masterEnrichmentOrchestrator = new MasterEnrichmentOrchestrator();