/**
 * Comprehensive Data Completeness Analyzer
 * Analyzes lead data quality, completeness, and enrichment needs
 */

import { Lead, InsertLead } from "@shared/schema";
import { z } from "zod";
import { FIELD_VALIDATORS, CanonicalField } from "../intelligence/ontology";
import { eventBus } from "./event-bus";
import { costOptimization } from "./cost-optimization";
import memoizee from 'memoizee';

// Field importance weights for MCA/UCC leads (0-1 scale)
const FIELD_IMPORTANCE: Record<string, number> = {
  // Critical fields (0.9-1.0)
  businessName: 1.0,
  ownerName: 0.95,
  email: 0.9,
  phone: 0.9,
  
  // High importance (0.7-0.9)
  annualRevenue: 0.85,
  estimatedRevenue: 0.8,
  industry: 0.75,
  creditScore: 0.75,
  timeInBusiness: 0.75,
  yearsInBusiness: 0.75,
  
  // Medium importance (0.5-0.7)
  requestedAmount: 0.65,
  stateCode: 0.65,
  city: 0.6,
  fullAddress: 0.6,
  websiteUrl: 0.6,
  employeeCount: 0.55,
  companySize: 0.55,
  
  // Lower importance (0.3-0.5)
  linkedinUrl: 0.45,
  yearFounded: 0.4,
  secondaryPhone: 0.4,
  naicsCode: 0.35,
  
  // UCC fields (0.3-0.6)
  uccNumber: 0.5,
  filingDate: 0.45,
  securedParties: 0.5,
  stackingRisk: 0.6,
  activePositions: 0.55,
  
  // Meta fields (0.2-0.4)
  source: 0.3,
  tags: 0.25,
  businessDescription: 0.35,
};

// Enrichment service costs (in credits/cents)
const ENRICHMENT_COSTS = {
  numverify: 0.01,      // Phone validation
  hunter: 0.02,         // Email finding
  clearbit: 0.05,       // Company data
  proxycurl: 0.03,      // LinkedIn data
  abstractapi: 0.02,    // General validation
  peopledatalabs: 0.08, // Comprehensive people data
  perplexity: 0.04,     // Research
  openai: 0.06,         // AI analysis
  geocoding: 0.01,      // Address completion
};

export interface FieldAnalysis {
  field: string;
  canonicalName: string;
  hasValue: boolean;
  currentValue?: any;
  importance: number;
  
  // Quality metrics
  isValid: boolean;
  validationErrors?: string[];
  confidence: number; // 0-100
  freshness: number;  // 0-100 (100 = very fresh, 0 = stale)
  
  // Enrichment info
  canBeEnriched: boolean;
  enrichmentSources: string[];
  enrichmentCost: number;
  enrichmentPriority: number; // 1-10
  enrichmentStrategy?: string;
}

export interface DataQualityMetrics {
  // Overall scores (0-100)
  completenessScore: number;
  validityScore: number;
  freshnessScore: number;
  confidenceScore: number;
  overallQualityScore: number;
  
  // Field-level metrics
  totalFields: number;
  filledFields: number;
  validFields: number;
  criticalFieldsMissing: number;
  criticalFieldsInvalid: number;
  
  // Coverage percentages
  fieldCoverage: Record<string, number>;
  categoryCoverage: {
    business: number;
    contact: number;
    financial: number;
    location: number;
    ucc: number;
  };
}

export interface EnrichmentPlan {
  leadId?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  
  // Recommended services
  recommendedServices: Array<{
    service: string;
    targetFields: string[];
    estimatedCost: number;
    estimatedSuccessRate: number;
    justification: string;
  }>;
  
  // Cost-benefit analysis
  totalEstimatedCost: number;
  expectedQualityImprovement: number; // Percentage points
  costPerQualityPoint: number;
  roi: number; // Return on investment score
  
  // Execution strategy
  executionSteps: Array<{
    step: number;
    description: string;
    services: string[];
    expectedOutcome: string;
  }>;
  
  estimatedDuration: number; // seconds
  confidenceLevel: number; // 0-100
}

export interface AnalysisReport {
  leadId?: string;
  timestamp: Date;
  
  // Quality metrics
  qualityMetrics: DataQualityMetrics;
  
  // Field-level analysis
  fieldAnalyses: FieldAnalysis[];
  missingCriticalFields: FieldAnalysis[];
  invalidFields: FieldAnalysis[];
  
  // Enrichment plan
  enrichmentPlan: EnrichmentPlan;
  
  // Recommendations
  recommendations: string[];
  warnings: string[];
  
  // Value assessment
  leadValue: {
    currentValue: number; // 0-100
    potentialValue: number; // 0-100 after enrichment
    valueCategory: 'premium' | 'standard' | 'basic' | 'poor';
  };
}

export interface BatchAnalysisReport {
  batchId: string;
  totalLeads: number;
  analysisTimestamp: Date;
  
  // Overall statistics
  overallStats: {
    avgCompletenessScore: number;
    avgQualityScore: number;
    avgFreshnessScore: number;
    leadsNeedingEnrichment: number;
    leadsReadyToSell: number;
    leadsPoorQuality: number;
  };
  
  // Field coverage
  fieldCoverageReport: Record<string, {
    filled: number;
    valid: number;
    percentage: number;
  }>;
  
  // Enrichment opportunities
  enrichmentOpportunities: {
    totalEstimatedCost: number;
    expectedQualityGain: number;
    priorityBreakdown: Record<string, number>;
    topServicesNeeded: Array<{ service: string; count: number; totalCost: number }>;
  };
  
  // Quality distribution
  qualityDistribution: {
    premium: number;
    standard: number;
    basic: number;
    poor: number;
  };
  
  // Individual analyses
  leadAnalyses: AnalysisReport[];
}

export class DataCompletenessAnalyzer {
  // Memoized validation cache
  private validateField = memoizee(
    (fieldName: string, value: any) => this._validateField(fieldName, value),
    { maxAge: 3600000 } // 1 hour cache
  );

  /**
   * Analyze a single lead comprehensively
   */
  analyzeLead(lead: Partial<Lead | InsertLead>): AnalysisReport {
    const startTime = Date.now();
    
    // Perform field-level analysis
    const fieldAnalyses = this.analyzeFields(lead);
    
    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(fieldAnalyses, lead);
    
    // Identify issues
    const missingCriticalFields = fieldAnalyses
      .filter(f => !f.hasValue && f.importance >= 0.8)
      .sort((a, b) => b.importance - a.importance);
    
    const invalidFields = fieldAnalyses
      .filter(f => f.hasValue && !f.isValid)
      .sort((a, b) => b.importance - a.importance);
    
    // Generate enrichment plan
    const enrichmentPlan = this.generateEnrichmentPlan(lead, fieldAnalyses, qualityMetrics);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      qualityMetrics,
      missingCriticalFields,
      invalidFields,
      enrichmentPlan
    );
    
    // Generate warnings
    const warnings = this.generateWarnings(
      qualityMetrics,
      missingCriticalFields,
      invalidFields
    );
    
    // Assess lead value
    const leadValue = this.assessLeadValue(lead, qualityMetrics, enrichmentPlan);
    
    const report: AnalysisReport = {
      leadId: (lead as any).id,
      timestamp: new Date(),
      qualityMetrics,
      fieldAnalyses,
      missingCriticalFields,
      invalidFields,
      enrichmentPlan,
      recommendations,
      warnings,
      leadValue
    };
    
    const duration = Date.now() - startTime;
    console.log(`[DataCompletenessAnalyzer] Lead analysis completed in ${duration}ms`);
    
    // Emit analysis event
    eventBus.emit('analysis:completed', report);
    
    return report;
  }

  /**
   * Analyze all fields of a lead
   */
  private analyzeFields(lead: Partial<Lead | InsertLead>): FieldAnalysis[] {
    const analyses: FieldAnalysis[] = [];
    
    for (const [field, importance] of Object.entries(FIELD_IMPORTANCE)) {
      const value = lead[field as keyof typeof lead];
      const hasValue = this.hasValidValue(value);
      
      const analysis: FieldAnalysis = {
        field,
        canonicalName: this.getCanonicalFieldName(field),
        hasValue,
        currentValue: value,
        importance,
        isValid: hasValue ? this.validateField(field, value) : false,
        confidence: this.calculateFieldConfidence(field, value, lead),
        freshness: this.calculateFieldFreshness(field, lead),
        canBeEnriched: this.canFieldBeEnriched(field, lead),
        enrichmentSources: this.getEnrichmentSources(field),
        enrichmentCost: this.calculateEnrichmentCost(field),
        enrichmentPriority: this.calculateEnrichmentPriority(field, importance, hasValue)
      };
      
      // Add validation errors if invalid
      if (hasValue && !analysis.isValid) {
        analysis.validationErrors = this.getValidationErrors(field, value);
      }
      
      // Add enrichment strategy if can be enriched
      if (analysis.canBeEnriched && !hasValue) {
        analysis.enrichmentStrategy = this.getEnrichmentStrategy(field, lead);
      }
      
      analyses.push(analysis);
    }
    
    return analyses;
  }

  /**
   * Calculate comprehensive quality metrics
   */
  private calculateQualityMetrics(
    fieldAnalyses: FieldAnalysis[],
    lead: Partial<Lead | InsertLead>
  ): DataQualityMetrics {
    // Calculate completeness
    const totalImportance = fieldAnalyses.reduce((sum, f) => sum + f.importance, 0);
    const filledImportance = fieldAnalyses
      .filter(f => f.hasValue)
      .reduce((sum, f) => sum + f.importance, 0);
    const completenessScore = Math.round((filledImportance / totalImportance) * 100);
    
    // Calculate validity
    const filledFields = fieldAnalyses.filter(f => f.hasValue);
    const validFields = filledFields.filter(f => f.isValid);
    const validityScore = filledFields.length > 0
      ? Math.round((validFields.length / filledFields.length) * 100)
      : 0;
    
    // Calculate freshness
    const avgFreshness = fieldAnalyses
      .filter(f => f.hasValue)
      .reduce((sum, f, _, arr) => sum + f.freshness / arr.length, 0);
    const freshnessScore = Math.round(avgFreshness);
    
    // Calculate confidence
    const avgConfidence = fieldAnalyses
      .filter(f => f.hasValue)
      .reduce((sum, f, _, arr) => sum + f.confidence / arr.length, 0);
    const confidenceScore = Math.round(avgConfidence);
    
    // Overall quality score (weighted average)
    const overallQualityScore = Math.round(
      completenessScore * 0.35 +
      validityScore * 0.3 +
      freshnessScore * 0.15 +
      confidenceScore * 0.2
    );
    
    // Count critical fields
    const criticalFields = fieldAnalyses.filter(f => f.importance >= 0.8);
    const criticalFieldsMissing = criticalFields.filter(f => !f.hasValue).length;
    const criticalFieldsInvalid = criticalFields.filter(f => f.hasValue && !f.isValid).length;
    
    // Calculate field coverage by category
    const fieldCoverage = this.calculateFieldCoverage(fieldAnalyses);
    const categoryCoverage = this.calculateCategoryCoverage(fieldAnalyses);
    
    return {
      completenessScore,
      validityScore,
      freshnessScore,
      confidenceScore,
      overallQualityScore,
      totalFields: fieldAnalyses.length,
      filledFields: filledFields.length,
      validFields: validFields.length,
      criticalFieldsMissing,
      criticalFieldsInvalid,
      fieldCoverage,
      categoryCoverage
    };
  }

  /**
   * Generate comprehensive enrichment plan
   */
  private generateEnrichmentPlan(
    lead: Partial<Lead | InsertLead>,
    fieldAnalyses: FieldAnalysis[],
    qualityMetrics: DataQualityMetrics
  ): EnrichmentPlan {
    // Determine priority based on quality and missing critical fields
    const priority = this.determineEnrichmentPriority(qualityMetrics);
    
    // Select services based on missing fields and cost-effectiveness
    const recommendedServices = this.selectEnrichmentServices(lead, fieldAnalyses);
    
    // Calculate costs and benefits
    const totalEstimatedCost = recommendedServices.reduce((sum, s) => sum + s.estimatedCost, 0);
    const expectedQualityImprovement = this.estimateQualityImprovement(
      qualityMetrics,
      recommendedServices,
      fieldAnalyses
    );
    const costPerQualityPoint = expectedQualityImprovement > 0 
      ? totalEstimatedCost / expectedQualityImprovement 
      : 0;
    const roi = this.calculateROI(totalEstimatedCost, expectedQualityImprovement, lead);
    
    // Generate execution steps
    const executionSteps = this.generateExecutionSteps(recommendedServices, fieldAnalyses);
    
    // Estimate duration
    const estimatedDuration = recommendedServices.reduce((sum, s) => {
      const baseDuration = {
        numverify: 2,
        hunter: 5,
        clearbit: 8,
        proxycurl: 10,
        abstractapi: 3,
        peopledatalabs: 12,
        perplexity: 15,
        openai: 10,
        geocoding: 2
      };
      return sum + (baseDuration[s.service as keyof typeof baseDuration] || 5);
    }, 0);
    
    // Calculate confidence level
    const confidenceLevel = this.calculatePlanConfidence(lead, recommendedServices);
    
    return {
      leadId: (lead as any).id,
      priority,
      recommendedServices,
      totalEstimatedCost,
      expectedQualityImprovement,
      costPerQualityPoint,
      roi,
      executionSteps,
      estimatedDuration,
      confidenceLevel
    };
  }

  /**
   * Select optimal enrichment services
   */
  private selectEnrichmentServices(
    lead: Partial<Lead | InsertLead>,
    fieldAnalyses: FieldAnalysis[]
  ): EnrichmentPlan['recommendedServices'] {
    const services: EnrichmentPlan['recommendedServices'] = [];
    const missingFields = fieldAnalyses.filter(f => !f.hasValue && f.canBeEnriched);
    
    // Phone validation - highest priority if phone exists but not verified
    if (lead.phone && !(lead as any).phoneVerified) {
      services.push({
        service: 'numverify',
        targetFields: ['phoneVerified', 'phoneType'],
        estimatedCost: ENRICHMENT_COSTS.numverify,
        estimatedSuccessRate: 95,
        justification: 'Validate and verify phone number for contact quality'
      });
    }
    
    // Email finding - critical for communication
    const needsEmail = missingFields.find(f => f.field === 'email');
    if (needsEmail && (lead.businessName || lead.ownerName)) {
      services.push({
        service: 'hunter',
        targetFields: ['email', 'emailVerified'],
        estimatedCost: ENRICHMENT_COSTS.hunter,
        estimatedSuccessRate: 75,
        justification: 'Find and verify email for critical communication channel'
      });
    }
    
    // Company enrichment - for business context
    const needsBusinessData = missingFields.some(f => 
      ['industry', 'annualRevenue', 'employeeCount', 'yearFounded'].includes(f.field)
    );
    if (needsBusinessData && lead.businessName) {
      services.push({
        service: 'clearbit',
        targetFields: ['industry', 'annualRevenue', 'employeeCount', 'yearFounded', 'websiteUrl'],
        estimatedCost: ENRICHMENT_COSTS.clearbit,
        estimatedSuccessRate: 70,
        justification: 'Enrich company data for better qualification and targeting'
      });
    }
    
    // LinkedIn data - for social proof and additional contact info
    if (!lead.linkedinUrl && (lead.businessName || lead.ownerName)) {
      services.push({
        service: 'proxycurl',
        targetFields: ['linkedinUrl', 'socialProfiles', 'companySize'],
        estimatedCost: ENRICHMENT_COSTS.proxycurl,
        estimatedSuccessRate: 65,
        justification: 'Get LinkedIn profile for social validation and networking'
      });
    }
    
    // Research for missing revenue data
    if (!lead.annualRevenue && !lead.estimatedRevenue && lead.businessName) {
      services.push({
        service: 'perplexity',
        targetFields: ['estimatedRevenue', 'businessDescription', 'revenueConfidence'],
        estimatedCost: ENRICHMENT_COSTS.perplexity,
        estimatedSuccessRate: 60,
        justification: 'Research business for revenue estimation and insights'
      });
    }
    
    // Address completion
    if ((lead.city || lead.stateCode) && !lead.fullAddress) {
      services.push({
        service: 'geocoding',
        targetFields: ['fullAddress', 'zipCode'],
        estimatedCost: ENRICHMENT_COSTS.geocoding,
        estimatedSuccessRate: 85,
        justification: 'Complete address information for location-based services'
      });
    }
    
    // Sort by priority (based on cost-effectiveness)
    return services.sort((a, b) => {
      const aEfficiency = a.estimatedSuccessRate / a.estimatedCost;
      const bEfficiency = b.estimatedSuccessRate / b.estimatedCost;
      return bEfficiency - aEfficiency;
    });
  }

  /**
   * Generate execution steps for enrichment
   */
  private generateExecutionSteps(
    services: EnrichmentPlan['recommendedServices'],
    fieldAnalyses: FieldAnalysis[]
  ): EnrichmentPlan['executionSteps'] {
    const steps: EnrichmentPlan['executionSteps'] = [];
    
    // Group services by dependency order
    const validationServices = services.filter(s => 
      ['numverify', 'abstractapi', 'geocoding'].includes(s.service)
    );
    const discoveryServices = services.filter(s => 
      ['hunter', 'clearbit', 'proxycurl'].includes(s.service)
    );
    const researchServices = services.filter(s => 
      ['perplexity', 'openai', 'peopledatalabs'].includes(s.service)
    );
    
    let stepNumber = 1;
    
    // Step 1: Validation
    if (validationServices.length > 0) {
      steps.push({
        step: stepNumber++,
        description: 'Validate existing data fields',
        services: validationServices.map(s => s.service),
        expectedOutcome: 'Verified phone numbers, addresses, and basic data validity'
      });
    }
    
    // Step 2: Discovery
    if (discoveryServices.length > 0) {
      steps.push({
        step: stepNumber++,
        description: 'Discover missing contact and company information',
        services: discoveryServices.map(s => s.service),
        expectedOutcome: 'Found emails, company details, and social profiles'
      });
    }
    
    // Step 3: Research
    if (researchServices.length > 0) {
      steps.push({
        step: stepNumber++,
        description: 'Deep research for business insights and estimates',
        services: researchServices.map(s => s.service),
        expectedOutcome: 'Revenue estimates, business descriptions, and detailed insights'
      });
    }
    
    // Step 4: Final validation
    steps.push({
      step: stepNumber++,
      description: 'Cross-validate all enriched data',
      services: [],
      expectedOutcome: 'Confirmed data accuracy and consistency'
    });
    
    return steps;
  }

  /**
   * Validate field value
   */
  private _validateField(fieldName: string, value: any): boolean {
    if (!value) return false;
    
    // Use validators from ontology if available
    const canonicalField = this.getCanonicalFieldName(fieldName);
    const validator = (FIELD_VALIDATORS as any)[canonicalField];
    
    if (validator) {
      try {
        validator.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    
    // Custom validation for specific fields
    switch (fieldName) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      
      case 'phone':
        const phoneRegex = /^[\d\s\-\(\)\+\.]+$/;
        const cleaned = value.toString().replace(/\D/g, '');
        return phoneRegex.test(value) && cleaned.length >= 10;
      
      case 'annualRevenue':
      case 'estimatedRevenue':
      case 'requestedAmount':
        return !isNaN(parseFloat(value)) && parseFloat(value) > 0;
      
      case 'creditScore':
        const score = parseInt(value);
        return !isNaN(score) && score >= 300 && score <= 850;
      
      case 'websiteUrl':
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      
      case 'stateCode':
        return /^[A-Z]{2}$/.test(value);
      
      default:
        return true; // Default to valid if no specific validation
    }
  }

  /**
   * Get validation errors for a field
   */
  private getValidationErrors(fieldName: string, value: any): string[] {
    const errors: string[] = [];
    
    switch (fieldName) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push('Invalid email format');
        }
        break;
      
      case 'phone':
        const cleaned = value.toString().replace(/\D/g, '');
        if (cleaned.length < 10) {
          errors.push('Phone number too short');
        }
        if (cleaned.length > 15) {
          errors.push('Phone number too long');
        }
        break;
      
      case 'creditScore':
        const score = parseInt(value);
        if (score < 300 || score > 850) {
          errors.push('Credit score must be between 300 and 850');
        }
        break;
      
      case 'websiteUrl':
        try {
          new URL(value);
        } catch {
          errors.push('Invalid URL format');
        }
        break;
      
      case 'stateCode':
        if (!/^[A-Z]{2}$/.test(value)) {
          errors.push('State code must be 2 uppercase letters');
        }
        break;
    }
    
    return errors;
  }

  /**
   * Calculate field confidence score
   */
  private calculateFieldConfidence(
    fieldName: string,
    value: any,
    lead: Partial<Lead | InsertLead>
  ): number {
    if (!value) return 0;
    
    let confidence = 50; // Base confidence
    
    // Increase confidence if field is verified
    if (fieldName === 'email' && (lead as any).emailVerified) confidence += 40;
    if (fieldName === 'phone' && (lead as any).phoneVerified) confidence += 40;
    
    // Increase confidence based on enrichment source
    if (lead.enrichmentSources) {
      const sources = lead.enrichmentSources as any;
      if (sources[fieldName]) {
        const source = sources[fieldName];
        const sourceConfidence = {
          manual: 90,
          clearbit: 85,
          hunter: 80,
          peopledatalabs: 85,
          perplexity: 75,
          openai: 70,
          proxycurl: 75
        };
        confidence = sourceConfidence[source as keyof typeof sourceConfidence] || confidence;
      }
    }
    
    // Decrease confidence for placeholder values
    const valueLower = value.toString().toLowerCase();
    if (['n/a', 'unknown', 'tbd'].includes(valueLower)) {
      confidence = 10;
    }
    
    return Math.min(100, confidence);
  }

  /**
   * Calculate field freshness score
   */
  private calculateFieldFreshness(
    fieldName: string,
    lead: Partial<Lead | InsertLead>
  ): number {
    // Base freshness on when lead was uploaded and last enriched
    const now = Date.now();
    const uploadedAt = (lead as any).uploadedAt ? new Date((lead as any).uploadedAt).getTime() : now;
    const lastEnrichedAt = lead.lastEnrichedAt ? new Date(lead.lastEnrichedAt).getTime() : uploadedAt;
    
    // Calculate days since last update
    const daysSinceUpdate = (now - Math.max(uploadedAt, lastEnrichedAt)) / (1000 * 60 * 60 * 24);
    
    // Different decay rates for different fields
    const decayRates = {
      // Contact info changes moderately
      email: 180,     // 6 months
      phone: 180,     // 6 months
      ownerName: 365, // 1 year
      
      // Business info changes slowly
      businessName: 730,  // 2 years
      industry: 1095,     // 3 years
      yearFounded: Infinity, // Never changes
      
      // Financial info changes frequently
      annualRevenue: 365,      // 1 year
      estimatedRevenue: 365,   // 1 year
      creditScore: 90,        // 3 months
      requestedAmount: 30,    // 1 month
      
      // Location info changes rarely
      stateCode: 1095,   // 3 years
      city: 730,         // 2 years
      fullAddress: 365,  // 1 year
      
      // UCC info has specific timing
      uccNumber: 180,         // 6 months
      activePositions: 30,    // 1 month
      stackingRisk: 30,      // 1 month
    };
    
    const decayRate = decayRates[fieldName as keyof typeof decayRates] || 180;
    
    // Calculate freshness (100 = brand new, 0 = very stale)
    const freshness = Math.max(0, 100 - (daysSinceUpdate / decayRate) * 100);
    
    return Math.round(freshness);
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    metrics: DataQualityMetrics,
    missingCritical: FieldAnalysis[],
    invalidFields: FieldAnalysis[],
    enrichmentPlan: EnrichmentPlan
  ): string[] {
    const recommendations: string[] = [];
    
    // Quality-based recommendations
    if (metrics.overallQualityScore < 30) {
      recommendations.push('⚠️ Critical: This lead requires immediate comprehensive enrichment');
    } else if (metrics.overallQualityScore < 50) {
      recommendations.push('📊 Priority: Schedule for high-priority enrichment queue');
    } else if (metrics.overallQualityScore < 70) {
      recommendations.push('📈 Recommended: Add to standard enrichment queue');
    } else if (metrics.overallQualityScore > 85) {
      recommendations.push('✅ Excellent: Lead is ready for sale with minimal enrichment needed');
    }
    
    // Missing critical fields
    if (missingCritical.length > 0) {
      const fields = missingCritical.slice(0, 3).map(f => f.field).join(', ');
      recommendations.push(`🔍 Enrich critical fields: ${fields}`);
    }
    
    // Invalid fields
    if (invalidFields.length > 0) {
      const fields = invalidFields.slice(0, 3).map(f => f.field).join(', ');
      recommendations.push(`⚠️ Fix invalid data in: ${fields}`);
    }
    
    // Cost-effective enrichment
    if (enrichmentPlan.roi > 5) {
      recommendations.push(`💰 High ROI enrichment available (${enrichmentPlan.roi.toFixed(1)}x return)`);
    }
    
    // Service-specific recommendations
    if (enrichmentPlan.recommendedServices.length > 0) {
      const topService = enrichmentPlan.recommendedServices[0];
      recommendations.push(`🎯 Start with ${topService.service} (${topService.estimatedSuccessRate}% success rate)`);
    }
    
    // Freshness recommendations
    if (metrics.freshnessScore < 50) {
      recommendations.push('🔄 Data is stale - prioritize re-verification');
    }
    
    // Category-specific recommendations
    if (metrics.categoryCoverage.business < 50) {
      recommendations.push('🏢 Focus on enriching business information');
    }
    if (metrics.categoryCoverage.contact < 50) {
      recommendations.push('📞 Priority: Complete contact information');
    }
    if (metrics.categoryCoverage.financial < 30) {
      recommendations.push('💵 Add financial data for better qualification');
    }
    
    return recommendations;
  }

  /**
   * Generate warnings based on analysis
   */
  private generateWarnings(
    metrics: DataQualityMetrics,
    missingCritical: FieldAnalysis[],
    invalidFields: FieldAnalysis[]
  ): string[] {
    const warnings: string[] = [];
    
    // Critical missing fields
    if (!missingCritical.find(f => f.field === 'businessName')) {
      warnings.push('❌ Missing business name will severely limit enrichment success');
    }
    if (!missingCritical.find(f => f.field === 'phone') && !missingCritical.find(f => f.field === 'email')) {
      warnings.push('❌ No contact information - lead may be unreachable');
    }
    
    // Low confidence warnings
    if (metrics.confidenceScore < 30) {
      warnings.push('⚠️ Very low confidence in data accuracy');
    }
    
    // Validity warnings
    if (metrics.criticalFieldsInvalid > 2) {
      warnings.push('⚠️ Multiple critical fields have invalid data');
    }
    
    // Staleness warnings
    if (metrics.freshnessScore < 25) {
      warnings.push('📅 Data is very stale and may be outdated');
    }
    
    // Quality warnings
    if (metrics.overallQualityScore < 20) {
      warnings.push('🚫 Lead quality too poor for effective sales');
    }
    
    return warnings;
  }

  /**
   * Assess lead value
   */
  private assessLeadValue(
    lead: Partial<Lead | InsertLead>,
    metrics: DataQualityMetrics,
    enrichmentPlan: EnrichmentPlan
  ): AnalysisReport['leadValue'] {
    // Calculate current value based on available data
    let currentValue = metrics.overallQualityScore;
    
    // Adjust based on specific valuable fields
    if (lead.annualRevenue && parseFloat(lead.annualRevenue as string) > 1000000) {
      currentValue += 10;
    }
    if (lead.creditScore && parseInt(lead.creditScore as string) > 700) {
      currentValue += 5;
    }
    if (lead.urgencyLevel === 'Immediate') {
      currentValue += 10;
    }
    if (lead.stackingRisk === 'low') {
      currentValue += 5;
    }
    
    currentValue = Math.min(100, currentValue);
    
    // Calculate potential value after enrichment
    const potentialValue = Math.min(100, currentValue + enrichmentPlan.expectedQualityImprovement);
    
    // Determine value category
    let valueCategory: 'premium' | 'standard' | 'basic' | 'poor';
    if (potentialValue >= 80) valueCategory = 'premium';
    else if (potentialValue >= 60) valueCategory = 'standard';
    else if (potentialValue >= 40) valueCategory = 'basic';
    else valueCategory = 'poor';
    
    return {
      currentValue,
      potentialValue,
      valueCategory
    };
  }

  /**
   * Batch analyze multiple leads
   */
  async batchAnalyze(leads: Array<Partial<Lead | InsertLead>>, batchId: string): Promise<BatchAnalysisReport> {
    console.log(`[DataCompletenessAnalyzer] Starting batch analysis for ${leads.length} leads`);
    const startTime = Date.now();
    
    // Analyze each lead
    const leadAnalyses = leads.map(lead => this.analyzeLead(lead));
    
    // Calculate overall statistics
    const overallStats = this.calculateBatchStatistics(leadAnalyses);
    
    // Generate field coverage report
    const fieldCoverageReport = this.generateFieldCoverageReport(leadAnalyses);
    
    // Calculate enrichment opportunities
    const enrichmentOpportunities = this.calculateEnrichmentOpportunities(leadAnalyses);
    
    // Calculate quality distribution
    const qualityDistribution = this.calculateQualityDistribution(leadAnalyses);
    
    const report: BatchAnalysisReport = {
      batchId,
      totalLeads: leads.length,
      analysisTimestamp: new Date(),
      overallStats,
      fieldCoverageReport,
      enrichmentOpportunities,
      qualityDistribution,
      leadAnalyses
    };
    
    const duration = Date.now() - startTime;
    console.log(`[DataCompletenessAnalyzer] Batch analysis completed in ${duration}ms`);
    
    // Emit batch analysis event
    eventBus.emit('batch:analysis:completed', report);
    
    return report;
  }

  // Helper methods...
  
  private hasValidValue(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '') return false;
      if (['n/a', 'na', 'none', 'unknown', 'not available', 'tbd', '-'].includes(trimmed)) {
        return false;
      }
    }
    if (typeof value === 'number' && value === 0) {
      return false;
    }
    return true;
  }

  private getCanonicalFieldName(field: string): string {
    // Map to canonical names from ontology
    const mapping: Record<string, string> = {
      businessName: CanonicalField.BUSINESS_NAME,
      ownerName: CanonicalField.OWNER_NAME,
      email: CanonicalField.EMAIL,
      phone: CanonicalField.PHONE,
      annualRevenue: CanonicalField.ANNUAL_REVENUE,
      creditScore: CanonicalField.CREDIT_SCORE,
      uccNumber: CanonicalField.UCC_NUMBER,
      // Add more mappings as needed
    };
    return mapping[field] || field;
  }

  private canFieldBeEnriched(field: string, lead: Partial<Lead | InsertLead>): boolean {
    const enrichmentRequirements: Record<string, string[]> = {
      email: ['businessName', 'ownerName', 'websiteUrl'],
      phone: ['businessName', 'ownerName'],
      websiteUrl: ['businessName'],
      linkedinUrl: ['businessName', 'ownerName'],
      annualRevenue: ['businessName', 'websiteUrl'],
      estimatedRevenue: ['businessName'],
      industry: ['businessName', 'websiteUrl'],
      fullAddress: ['city', 'stateCode'],
      employeeCount: ['businessName', 'linkedinUrl'],
    };
    
    const requirements = enrichmentRequirements[field];
    if (!requirements) return false;
    
    return requirements.some(req => this.hasValidValue(lead[req as keyof typeof lead]));
  }

  private getEnrichmentSources(field: string): string[] {
    const sourcesMap: Record<string, string[]> = {
      email: ['hunter', 'clearbit', 'peopledatalabs'],
      phone: ['numverify', 'clearbit', 'peopledatalabs'],
      websiteUrl: ['clearbit', 'perplexity'],
      linkedinUrl: ['proxycurl', 'peopledatalabs'],
      annualRevenue: ['clearbit', 'perplexity', 'openai'],
      estimatedRevenue: ['perplexity', 'openai'],
      industry: ['clearbit', 'perplexity'],
      fullAddress: ['geocoding', 'clearbit'],
      employeeCount: ['clearbit', 'proxycurl', 'peopledatalabs'],
    };
    return sourcesMap[field] || [];
  }

  private calculateEnrichmentCost(field: string): number {
    const sources = this.getEnrichmentSources(field);
    if (sources.length === 0) return 0;
    
    // Return minimum cost from available sources
    const costs = sources.map(s => ENRICHMENT_COSTS[s as keyof typeof ENRICHMENT_COSTS] || 0);
    return Math.min(...costs);
  }

  private calculateEnrichmentPriority(field: string, importance: number, hasValue: boolean): number {
    if (hasValue) return 0;
    
    // Priority based on importance and enrichment cost
    const cost = this.calculateEnrichmentCost(field);
    const costFactor = cost > 0 ? 1 / cost : 10; // Inverse cost (cheaper = higher priority)
    
    return Math.round(importance * 5 + costFactor * 5);
  }

  private getEnrichmentStrategy(field: string, lead: Partial<Lead | InsertLead>): string {
    const strategies: Record<string, string> = {
      email: 'Use Hunter.io with business domain or owner name',
      phone: 'Verify with Numverify and search business directories',
      websiteUrl: 'Search company name in Clearbit or Google',
      linkedinUrl: 'Use ProxyURL with business or owner name',
      annualRevenue: 'Estimate using Perplexity research or Clearbit data',
      industry: 'Classify using business name and website content',
      fullAddress: 'Geocode partial address or search in business directories',
    };
    return strategies[field] || 'Use comprehensive enrichment service';
  }

  private calculateFieldCoverage(fieldAnalyses: FieldAnalysis[]): Record<string, number> {
    const coverage: Record<string, number> = {};
    
    for (const analysis of fieldAnalyses) {
      coverage[analysis.field] = analysis.hasValue ? 100 : 0;
    }
    
    return coverage;
  }

  private calculateCategoryCoverage(fieldAnalyses: FieldAnalysis[]): DataQualityMetrics['categoryCoverage'] {
    const categories = {
      business: ['businessName', 'industry', 'yearFounded', 'websiteUrl', 'businessDescription'],
      contact: ['ownerName', 'email', 'phone', 'secondaryPhone', 'linkedinUrl'],
      financial: ['annualRevenue', 'estimatedRevenue', 'creditScore', 'requestedAmount'],
      location: ['stateCode', 'city', 'fullAddress', 'zipCode'],
      ucc: ['uccNumber', 'filingDate', 'securedParties', 'activePositions', 'stackingRisk']
    };
    
    const coverage: DataQualityMetrics['categoryCoverage'] = {
      business: 0,
      contact: 0,
      financial: 0,
      location: 0,
      ucc: 0
    };
    
    for (const [category, fields] of Object.entries(categories)) {
      const categoryAnalyses = fieldAnalyses.filter(f => fields.includes(f.field));
      const filledCount = categoryAnalyses.filter(f => f.hasValue).length;
      coverage[category as keyof typeof coverage] = 
        categoryAnalyses.length > 0 ? Math.round((filledCount / categoryAnalyses.length) * 100) : 0;
    }
    
    return coverage;
  }

  private determineEnrichmentPriority(metrics: DataQualityMetrics): EnrichmentPlan['priority'] {
    if (metrics.overallQualityScore >= 85) return 'none';
    if (metrics.criticalFieldsMissing > 2 || metrics.overallQualityScore < 30) return 'urgent';
    if (metrics.overallQualityScore < 50) return 'high';
    if (metrics.overallQualityScore < 70) return 'medium';
    return 'low';
  }

  private estimateQualityImprovement(
    currentMetrics: DataQualityMetrics,
    services: EnrichmentPlan['recommendedServices'],
    fieldAnalyses: FieldAnalysis[]
  ): number {
    let improvement = 0;
    
    // Estimate improvement per service
    for (const service of services) {
      const targetFields = fieldAnalyses.filter(f => 
        service.targetFields.includes(f.field) && !f.hasValue
      );
      
      for (const field of targetFields) {
        improvement += field.importance * service.estimatedSuccessRate / 100 * 10;
      }
    }
    
    // Cap at realistic improvement
    const maxPossibleScore = 100 - currentMetrics.overallQualityScore;
    return Math.min(improvement, maxPossibleScore);
  }

  private calculateROI(cost: number, qualityImprovement: number, lead: Partial<Lead | InsertLead>): number {
    if (cost === 0) return 10; // Free enrichment has infinite ROI, cap at 10
    
    // Estimate value of quality improvement
    let valueMultiplier = 1;
    
    // Higher value leads have better ROI
    if (lead.annualRevenue && parseFloat(lead.annualRevenue as string) > 1000000) {
      valueMultiplier = 2;
    }
    if (lead.urgencyLevel === 'Immediate') {
      valueMultiplier *= 1.5;
    }
    if (lead.creditScore && parseInt(lead.creditScore as string) > 700) {
      valueMultiplier *= 1.2;
    }
    
    // Calculate ROI: (Value gained / Cost) 
    const valueGained = qualityImprovement * valueMultiplier * 0.1; // $0.10 per quality point
    return valueGained / cost;
  }

  private calculatePlanConfidence(
    lead: Partial<Lead | InsertLead>,
    services: EnrichmentPlan['recommendedServices']
  ): number {
    if (services.length === 0) return 0;
    
    // Average success rate of services
    const avgSuccessRate = services.reduce((sum, s) => sum + s.estimatedSuccessRate, 0) / services.length;
    
    // Adjust based on available seed data
    let confidence = avgSuccessRate;
    if (lead.businessName) confidence += 10;
    if (lead.ownerName) confidence += 5;
    if (lead.phone || lead.email) confidence += 5;
    
    return Math.min(95, confidence);
  }

  private calculateBatchStatistics(analyses: AnalysisReport[]): BatchAnalysisReport['overallStats'] {
    const total = analyses.length;
    if (total === 0) {
      return {
        avgCompletenessScore: 0,
        avgQualityScore: 0,
        avgFreshnessScore: 0,
        leadsNeedingEnrichment: 0,
        leadsReadyToSell: 0,
        leadsPoorQuality: 0
      };
    }
    
    const avgCompletenessScore = analyses.reduce((sum, a) => 
      sum + a.qualityMetrics.completenessScore, 0) / total;
    const avgQualityScore = analyses.reduce((sum, a) => 
      sum + a.qualityMetrics.overallQualityScore, 0) / total;
    const avgFreshnessScore = analyses.reduce((sum, a) => 
      sum + a.qualityMetrics.freshnessScore, 0) / total;
    
    const leadsNeedingEnrichment = analyses.filter(a => 
      a.enrichmentPlan.priority !== 'none').length;
    const leadsReadyToSell = analyses.filter(a => 
      a.qualityMetrics.overallQualityScore >= 75).length;
    const leadsPoorQuality = analyses.filter(a => 
      a.qualityMetrics.overallQualityScore < 40).length;
    
    return {
      avgCompletenessScore: Math.round(avgCompletenessScore),
      avgQualityScore: Math.round(avgQualityScore),
      avgFreshnessScore: Math.round(avgFreshnessScore),
      leadsNeedingEnrichment,
      leadsReadyToSell,
      leadsPoorQuality
    };
  }

  private generateFieldCoverageReport(analyses: AnalysisReport[]): BatchAnalysisReport['fieldCoverageReport'] {
    const report: BatchAnalysisReport['fieldCoverageReport'] = {};
    const total = analyses.length;
    
    if (total === 0) return report;
    
    // Aggregate field data across all analyses
    const fieldStats = new Map<string, { filled: number; valid: number }>();
    
    for (const analysis of analyses) {
      for (const field of analysis.fieldAnalyses) {
        const stats = fieldStats.get(field.field) || { filled: 0, valid: 0 };
        if (field.hasValue) {
          stats.filled++;
          if (field.isValid) stats.valid++;
        }
        fieldStats.set(field.field, stats);
      }
    }
    
    // Convert to report format
    for (const [field, stats] of Array.from(fieldStats.entries())) {
      report[field] = {
        filled: stats.filled,
        valid: stats.valid,
        percentage: Math.round((stats.filled / total) * 100)
      };
    }
    
    return report;
  }

  private calculateEnrichmentOpportunities(
    analyses: AnalysisReport[]
  ): BatchAnalysisReport['enrichmentOpportunities'] {
    let totalCost = 0;
    let totalQualityGain = 0;
    const priorityBreakdown: Record<string, number> = {
      urgent: 0,
      high: 0,
      medium: 0,
      low: 0,
      none: 0
    };
    const serviceUsage = new Map<string, { count: number; totalCost: number }>();
    
    for (const analysis of analyses) {
      const plan = analysis.enrichmentPlan;
      totalCost += plan.totalEstimatedCost;
      totalQualityGain += plan.expectedQualityImprovement;
      priorityBreakdown[plan.priority]++;
      
      for (const service of plan.recommendedServices) {
        const usage = serviceUsage.get(service.service) || { count: 0, totalCost: 0 };
        usage.count++;
        usage.totalCost += service.estimatedCost;
        serviceUsage.set(service.service, usage);
      }
    }
    
    // Get top services
    const topServicesNeeded = Array.from(serviceUsage.entries())
      .map(([service, usage]) => ({ service, ...usage }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    return {
      totalEstimatedCost: Math.round(totalCost * 100) / 100,
      expectedQualityGain: Math.round(totalQualityGain / analyses.length),
      priorityBreakdown,
      topServicesNeeded
    };
  }

  private calculateQualityDistribution(analyses: AnalysisReport[]): BatchAnalysisReport['qualityDistribution'] {
    const distribution = {
      premium: 0,
      standard: 0,
      basic: 0,
      poor: 0
    };
    
    for (const analysis of analyses) {
      distribution[analysis.leadValue.valueCategory]++;
    }
    
    return distribution;
  }
}

// Export singleton instance
export const dataCompletenessAnalyzer = new DataCompletenessAnalyzer();