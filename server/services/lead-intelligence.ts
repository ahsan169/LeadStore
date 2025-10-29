import { db } from "../db";
import { leads, uccFilings, leadEnrichment, enhancedVerification } from "@shared/schema";
import type { Lead, UccFiling, LeadEnrichment, EnhancedVerification } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { MLScoringService } from "./ml-scoring";
import { enhancedVerificationService } from "./enhanced-verification";
import type { EnhancedVerificationResult } from "./enhanced-verification";

export interface IntelligenceSubScores {
  quality: number;         // 0-100: Data quality and completeness
  freshness: number;       // 0-100: How recent and relevant the lead is
  risk: number;           // 0-100: Lower is better (inverted for display)
  opportunity: number;    // 0-100: Potential value and conversion likelihood
  confidence: number;     // 0-100: Verification and data confidence level
}

export interface IntelligenceBreakdown {
  category: keyof IntelligenceSubScores;
  score: number;
  weight: number;
  contribution: number;
  factors: {
    name: string;
    value: number;
    impact: number;
    description: string;
  }[];
}

export interface IntelligenceMetadata {
  calculatedAt: Date;
  version: string;
  breakdowns: IntelligenceBreakdown[];
  explanations: {
    overall: string;
    quality: string;
    freshness: string;
    risk: string;
    opportunity: string;
    confidence: string;
  };
  recommendations: string[];
  dataWarnings: string[];
}

export interface LeadIntelligenceResult {
  intelligenceScore: number;
  subScores: IntelligenceSubScores;
  metadata: IntelligenceMetadata;
}

/**
 * Unified Lead Intelligence Scoring Service
 * Consolidates all scoring systems into a single, transparent intelligence score
 */
export class LeadIntelligenceService {
  private mlScoringService: MLScoringService;
  private readonly VERSION = "1.0.0";
  
  // Weights for each sub-score in the overall intelligence score
  private readonly WEIGHTS = {
    quality: 0.25,      // 25% - Data quality and completeness
    freshness: 0.20,    // 20% - Lead recency and relevance
    risk: 0.15,         // 15% - Risk assessment
    opportunity: 0.25,  // 25% - Business opportunity potential
    confidence: 0.15    // 15% - Verification confidence
  };

  constructor() {
    this.mlScoringService = new MLScoringService();
  }

  /**
   * Calculate unified intelligence score for a lead
   */
  async calculateIntelligenceScore(lead: Lead, triggerVerification: boolean = false): Promise<LeadIntelligenceResult> {
    // Trigger real-time verification if requested
    let enhancedVerificationResult: EnhancedVerificationResult | null = null;
    if (triggerVerification) {
      try {
        enhancedVerificationResult = await enhancedVerificationService.verifyLead(lead.id, false);
      } catch (error) {
        console.error('[LeadIntelligence] Enhanced verification failed:', error);
      }
    }
    
    // Fetch related data in parallel for efficiency
    const [
      verificationResult,
      enrichmentData,
      uccData,
      mlScore
    ] = await Promise.all([
      enhancedVerificationResult || this.getLatestEnhancedVerification(lead.id),
      this.getEnrichmentData(lead.id),
      this.getUccFilings(lead.businessName),
      this.mlScoringService.scoreLead(lead)
    ]);

    // Calculate sub-scores with enhanced verification data
    const subScores = await this.calculateSubScores(
      lead,
      verificationResult,
      enrichmentData,
      uccData,
      mlScore
    );

    // Calculate overall intelligence score
    const intelligenceScore = this.calculateWeightedScore(subScores);

    // Generate metadata with explanations
    const metadata = this.generateMetadata(
      subScores,
      intelligenceScore,
      lead,
      verificationResult,
      enrichmentData,
      uccData,
      mlScore
    );

    return {
      intelligenceScore,
      subScores,
      metadata
    };
  }

  /**
   * Calculate all sub-scores
   */
  private async calculateSubScores(
    lead: Lead,
    verification: EnhancedVerificationResult | null,
    enrichment: LeadEnrichment | null,
    uccData: UccFiling[],
    mlScore: any
  ): Promise<IntelligenceSubScores> {
    return {
      quality: this.calculateQualityScore(lead, verification, enrichment),
      freshness: this.calculateFreshnessScore(lead, enrichment),
      risk: this.calculateRiskScore(lead, verification, uccData, mlScore),
      opportunity: this.calculateOpportunityScore(lead, enrichment, uccData, mlScore),
      confidence: this.calculateConfidenceScore(lead, verification, enrichment)
    };
  }

  /**
   * Calculate Quality Sub-Score (0-100)
   * Measures data completeness, accuracy, and enrichment
   */
  private calculateQualityScore(
    lead: Lead,
    verification: EnhancedVerificationResult | null,
    enrichment: LeadEnrichment | null
  ): number {
    let score = 0;
    const factors = [];

    // Data completeness (40 points)
    const requiredFields = [
      lead.businessName,
      lead.ownerName,
      lead.email,
      lead.phone,
      lead.industry,
      lead.annualRevenue,
      lead.creditScore
    ];
    const completedFields = requiredFields.filter(field => field && field !== '').length;
    const completenessScore = (completedFields / requiredFields.length) * 40;
    score += completenessScore;

    // Enhanced Verification quality (30 points)
    if (verification) {
      // Use the overall confidence score from enhanced verification
      const verificationScore = (verification.overallConfidenceScore || 0) * 0.3;
      score += verificationScore;
    }

    // Enrichment quality (30 points)
    if (enrichment) {
      let enrichmentScore = 0;
      if (enrichment.linkedinUrl) enrichmentScore += 10;
      if (enrichment.websiteUrl) enrichmentScore += 10;
      if (enrichment.companySize) enrichmentScore += 5;
      if (enrichment.yearFounded) enrichmentScore += 5;
      score += enrichmentScore;
    } else if (lead.isEnriched) {
      // Partial credit for enriched leads without detailed data
      score += 15;
    }

    // Additional quality factors
    if (lead.secondaryPhone) score += 5;
    if (lead.naicsCode) score += 5;

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate Freshness Sub-Score (0-100)
   * Measures how recent and relevant the lead is
   */
  private calculateFreshnessScore(
    lead: Lead,
    enrichment: LeadEnrichment | null
  ): number {
    let score = 100; // Start with perfect freshness
    
    // Age penalty (loses 2 points per day, max 50 points lost)
    const daysSinceUpload = Math.floor(
      (Date.now() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    const agePenalty = Math.min(50, daysSinceUpload * 2);
    score -= agePenalty;

    // Lead age penalty (if provided)
    if (lead.leadAge && lead.leadAge > 0) {
      const leadAgePenalty = Math.min(30, lead.leadAge * 1.5);
      score -= leadAgePenalty;
    }

    // View count penalty (too many views means it's stale)
    if (lead.viewCount > 10) {
      score -= Math.min(20, lead.viewCount - 10);
    }

    // Urgency bonus
    if (lead.urgencyLevel === 'immediate') score += 20;
    else if (lead.urgencyLevel === 'this_week') score += 15;
    else if (lead.urgencyLevel === 'this_month') score += 10;

    // Recent enrichment bonus
    if (enrichment && enrichment.enrichedAt) {
      const daysSinceEnrichment = Math.floor(
        (Date.now() - new Date(enrichment.enrichedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceEnrichment < 7) score += 10;
      else if (daysSinceEnrichment < 30) score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate Risk Sub-Score (0-100, lower is better)
   * Measures potential risks and red flags
   */
  private calculateRiskScore(
    lead: Lead,
    verification: EnhancedVerificationResult | null,
    uccData: UccFiling[],
    mlScore: any
  ): number {
    let riskPoints = 0; // Higher means more risk
    
    // Enhanced Verification risks
    if (verification) {
      if (verification.verificationStatus === 'failed') riskPoints += 40;
      else if (verification.verificationStatus === 'unverified') riskPoints += 30;
      else if (verification.verificationStatus === 'partial') riskPoints += 20;
      
      // Add risk based on confidence breakdown
      if (verification.confidenceBreakdown) {
        // Email risks
        if (!verification.confidenceBreakdown.factors.emailDeliverable) riskPoints += 10;
        if (!verification.confidenceBreakdown.factors.emailNotDisposable) riskPoints += 15;
        
        // Phone risks
        if (!verification.confidenceBreakdown.factors.phoneValid) riskPoints += 10;
        if (!verification.confidenceBreakdown.factors.phoneLowRisk) riskPoints += 10;
        
        // High-risk phone types
        if (verification.phoneVerification?.lineType === 'voip') riskPoints += 15;
        if (verification.phoneVerification?.lineType === 'toll_free') riskPoints += 10;
      }
    } else {
      // No verification is a risk
      riskPoints += 25;
    }

    // Credit score risk
    const creditScore = parseInt(lead.creditScore || '0');
    if (creditScore < 500) riskPoints += 30;
    else if (creditScore < 600) riskPoints += 20;
    else if (creditScore < 650) riskPoints += 10;

    // MCA history risk
    if (lead.previousMCAHistory === 'multiple') riskPoints += 15;
    else if (lead.previousMCAHistory === 'current') riskPoints += 10;

    // UCC filing risk analysis
    if (uccData.length > 0) {
      // Recent filings indicate active debt
      const recentFilings = uccData.filter(ucc => {
        const daysSinceFiling = Math.floor(
          (Date.now() - new Date(ucc.filingDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysSinceFiling < 180; // 6 months
      });
      
      if (recentFilings.length > 3) riskPoints += 20;
      else if (recentFilings.length > 1) riskPoints += 10;
      
      // Stacking pattern detection
      const uniqueLenders = new Set(uccData.map(ucc => ucc.securedParty)).size;
      if (uniqueLenders > 5) riskPoints += 15;
    }

    // Industry risk
    const riskyIndustries = ['restaurant', 'retail', 'construction'];
    if (lead.industry && riskyIndustries.includes(lead.industry.toLowerCase())) {
      riskPoints += 10;
    }

    // Convert to 0-100 scale (inverted so lower risk = higher score for display)
    const riskScore = Math.max(0, Math.min(100, riskPoints));
    return riskScore;
  }

  /**
   * Calculate Opportunity Sub-Score (0-100)
   * Measures business potential and conversion likelihood
   */
  private calculateOpportunityScore(
    lead: Lead,
    enrichment: LeadEnrichment | null,
    uccData: UccFiling[],
    mlScore: any
  ): number {
    let score = 0;

    // ML conversion probability (40 points)
    if (mlScore && mlScore.conversionProbability) {
      score += mlScore.conversionProbability * 40;
    }

    // Revenue potential (20 points)
    const annualRevenue = parseInt(lead.annualRevenue || '0');
    if (annualRevenue > 5000000) score += 20;
    else if (annualRevenue > 2000000) score += 15;
    else if (annualRevenue > 1000000) score += 10;
    else if (annualRevenue > 500000) score += 5;

    // Business size opportunity (15 points)
    if (lead.companySize) {
      if (lead.companySize === '201-500' || lead.companySize === '500+') score += 15;
      else if (lead.companySize === '51-200') score += 10;
      else if (lead.companySize === '11-50') score += 7;
      else if (lead.companySize === '1-10') score += 3;
    }

    // Time in business (10 points)
    const yearsInBusiness = lead.yearsInBusiness || parseInt(lead.timeInBusiness || '0');
    if (yearsInBusiness > 10) score += 10;
    else if (yearsInBusiness > 5) score += 7;
    else if (yearsInBusiness > 2) score += 5;
    else if (yearsInBusiness > 1) score += 3;

    // MCA readiness (10 points)
    if (lead.previousMCAHistory === 'previous_paid') score += 10;
    else if (lead.previousMCAHistory === 'current') score += 7;
    else if (lead.dailyBankDeposits) score += 5;

    // Expected deal size bonus (5 points)
    if (mlScore && mlScore.expectedDealSize) {
      if (mlScore.expectedDealSize > 50000) score += 5;
      else if (mlScore.expectedDealSize > 30000) score += 3;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate Confidence Sub-Score (0-100)
   * Measures data verification confidence and reliability
   */
  private calculateConfidenceScore(
    lead: Lead,
    verification: EnhancedVerificationResult | null,
    enrichment: LeadEnrichment | null
  ): number {
    let score = 0;

    // Enhanced Verification confidence (60 points)
    if (verification) {
      // Use the overall confidence score from enhanced verification
      score += verification.overallConfidenceScore * 0.6;
      
      // Bonus points for specific verification factors (up to 10 points)
      if (verification.confidenceBreakdown) {
        const factors = verification.confidenceBreakdown.factors;
        let bonusPoints = 0;
        
        if (factors.emailSmtpValid && factors.emailMxRecordsValid) bonusPoints += 2;
        if (factors.phoneCarrierKnown && factors.phoneCorrectLocation) bonusPoints += 2;
        if (factors.emailNotDisposable && factors.phoneLowRisk) bonusPoints += 3;
        if (factors.emailDeliverable && factors.phoneValid) bonusPoints += 3;
        
        score += Math.min(10, bonusPoints);
      }
    }

    // Enrichment confidence (30 points)
    if (enrichment) {
      if (enrichment.dataConfidence === 'high') score += 30;
      else if (enrichment.dataConfidence === 'medium') score += 20;
      else if (enrichment.dataConfidence === 'low') score += 10;
    } else if (lead.isEnriched) {
      // Partial credit for enriched status
      score += 15;
    }

    // Revenue confidence (10 points)
    if (lead.revenueConfidence === 'high') score += 10;
    else if (lead.revenueConfidence === 'medium') score += 6;
    else if (lead.revenueConfidence === 'low') score += 3;

    // Data consistency bonus (10 points)
    let consistencyScore = 10;
    
    // Check for data inconsistencies
    if (!lead.email || !lead.email.includes('@')) consistencyScore -= 3;
    if (!lead.phone || lead.phone.length < 10) consistencyScore -= 3;
    if (!lead.businessName || lead.businessName.length < 2) consistencyScore -= 4;
    
    score += Math.max(0, consistencyScore);

    return Math.min(100, Math.round(score));
  }

  /**
   * Calculate weighted overall score
   */
  private calculateWeightedScore(subScores: IntelligenceSubScores): number {
    // Note: Risk score is inverted for the calculation (100 - risk)
    // because lower risk should contribute positively to the overall score
    const invertedRisk = 100 - subScores.risk;
    
    const weightedSum = 
      (subScores.quality * this.WEIGHTS.quality) +
      (subScores.freshness * this.WEIGHTS.freshness) +
      (invertedRisk * this.WEIGHTS.risk) +
      (subScores.opportunity * this.WEIGHTS.opportunity) +
      (subScores.confidence * this.WEIGHTS.confidence);
    
    return Math.round(weightedSum);
  }

  /**
   * Generate detailed metadata with explanations
   */
  private generateMetadata(
    subScores: IntelligenceSubScores,
    intelligenceScore: number,
    lead: Lead,
    verification: VerificationResult | null,
    enrichment: LeadEnrichment | null,
    uccData: UccFiling[],
    mlScore: any
  ): IntelligenceMetadata {
    const breakdowns: IntelligenceBreakdown[] = [
      {
        category: 'quality',
        score: subScores.quality,
        weight: this.WEIGHTS.quality,
        contribution: subScores.quality * this.WEIGHTS.quality,
        factors: this.getQualityFactors(lead, verification, enrichment)
      },
      {
        category: 'freshness',
        score: subScores.freshness,
        weight: this.WEIGHTS.freshness,
        contribution: subScores.freshness * this.WEIGHTS.freshness,
        factors: this.getFreshnessFactors(lead)
      },
      {
        category: 'risk',
        score: subScores.risk,
        weight: this.WEIGHTS.risk,
        contribution: (100 - subScores.risk) * this.WEIGHTS.risk,
        factors: this.getRiskFactors(lead, verification, uccData)
      },
      {
        category: 'opportunity',
        score: subScores.opportunity,
        weight: this.WEIGHTS.opportunity,
        contribution: subScores.opportunity * this.WEIGHTS.opportunity,
        factors: this.getOpportunityFactors(lead, mlScore)
      },
      {
        category: 'confidence',
        score: subScores.confidence,
        weight: this.WEIGHTS.confidence,
        contribution: subScores.confidence * this.WEIGHTS.confidence,
        factors: this.getConfidenceFactors(verification, enrichment)
      }
    ];

    const explanations = this.generateExplanations(subScores, lead, verification);
    const recommendations = this.generateRecommendations(subScores, lead);
    const dataWarnings = this.generateWarnings(lead, verification, subScores);

    return {
      calculatedAt: new Date(),
      version: this.VERSION,
      breakdowns,
      explanations,
      recommendations,
      dataWarnings
    };
  }

  /**
   * Get quality score factors
   */
  private getQualityFactors(
    lead: Lead,
    verification: VerificationResult | null,
    enrichment: LeadEnrichment | null
  ): IntelligenceBreakdown['factors'] {
    const factors = [];

    // Data completeness
    const requiredFields = [
      lead.businessName,
      lead.ownerName,
      lead.email,
      lead.phone,
      lead.industry,
      lead.annualRevenue,
      lead.creditScore
    ];
    const completedFields = requiredFields.filter(field => field && field !== '').length;
    factors.push({
      name: 'Data Completeness',
      value: (completedFields / requiredFields.length) * 100,
      impact: 40,
      description: `${completedFields} of ${requiredFields.length} required fields completed`
    });

    // Verification quality
    if (verification) {
      factors.push({
        name: 'Verification Score',
        value: verification.verificationScore || 0,
        impact: 30,
        description: `Lead verified with ${verification.status} status`
      });
    }

    // Enrichment quality
    if (enrichment || lead.isEnriched) {
      factors.push({
        name: 'Data Enrichment',
        value: enrichment ? 100 : 50,
        impact: 30,
        description: enrichment ? 'Fully enriched with additional data' : 'Partially enriched'
      });
    }

    return factors;
  }

  /**
   * Get freshness score factors
   */
  private getFreshnessFactors(lead: Lead): IntelligenceBreakdown['factors'] {
    const factors = [];
    
    const daysSinceUpload = Math.floor(
      (Date.now() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    factors.push({
      name: 'Upload Recency',
      value: Math.max(0, 100 - (daysSinceUpload * 2)),
      impact: 50,
      description: `Uploaded ${daysSinceUpload} days ago`
    });

    if (lead.leadAge !== null && lead.leadAge !== undefined) {
      factors.push({
        name: 'Lead Age',
        value: Math.max(0, 100 - (lead.leadAge * 1.5)),
        impact: 30,
        description: `Lead is ${lead.leadAge} days old from generation`
      });
    }

    if (lead.urgencyLevel) {
      const urgencyScores = {
        'immediate': 100,
        'this_week': 75,
        'this_month': 50,
        'exploring': 25
      };
      factors.push({
        name: 'Urgency Level',
        value: urgencyScores[lead.urgencyLevel] || 0,
        impact: 20,
        description: `Urgency: ${lead.urgencyLevel}`
      });
    }

    return factors;
  }

  /**
   * Get risk score factors
   */
  private getRiskFactors(
    lead: Lead,
    verification: VerificationResult | null,
    uccData: UccFiling[]
  ): IntelligenceBreakdown['factors'] {
    const factors = [];

    // Verification risk
    if (verification) {
      const statusScores = {
        'verified': 10,
        'warning': 50,
        'failed': 90
      };
      factors.push({
        name: 'Verification Status',
        value: statusScores[verification.status] || 50,
        impact: 40,
        description: `Verification ${verification.status}`
      });
    }

    // Credit score risk
    const creditScore = parseInt(lead.creditScore || '0');
    let creditRisk = 0;
    if (creditScore < 500) creditRisk = 90;
    else if (creditScore < 600) creditRisk = 60;
    else if (creditScore < 650) creditRisk = 30;
    else creditRisk = 10;
    
    factors.push({
      name: 'Credit Risk',
      value: creditRisk,
      impact: 30,
      description: `Credit score: ${creditScore || 'Unknown'}`
    });

    // UCC filing risk
    if (uccData.length > 0) {
      factors.push({
        name: 'UCC Filing Risk',
        value: Math.min(100, uccData.length * 10),
        impact: 30,
        description: `${uccData.length} UCC filings found`
      });
    }

    return factors;
  }

  /**
   * Get opportunity score factors
   */
  private getOpportunityFactors(lead: Lead, mlScore: any): IntelligenceBreakdown['factors'] {
    const factors = [];

    if (mlScore && mlScore.conversionProbability) {
      factors.push({
        name: 'Conversion Probability',
        value: mlScore.conversionProbability * 100,
        impact: 40,
        description: `${(mlScore.conversionProbability * 100).toFixed(1)}% likely to convert`
      });
    }

    const annualRevenue = parseInt(lead.annualRevenue || '0');
    factors.push({
      name: 'Revenue Potential',
      value: Math.min(100, (annualRevenue / 5000000) * 100),
      impact: 30,
      description: `Annual revenue: $${annualRevenue.toLocaleString()}`
    });

    if (lead.companySize) {
      const sizeScores = {
        '500+': 100,
        '201-500': 80,
        '51-200': 60,
        '11-50': 40,
        '1-10': 20
      };
      factors.push({
        name: 'Company Size',
        value: sizeScores[lead.companySize] || 0,
        impact: 15,
        description: `${lead.companySize} employees`
      });
    }

    if (mlScore && mlScore.expectedDealSize) {
      factors.push({
        name: 'Expected Deal Size',
        value: Math.min(100, (mlScore.expectedDealSize / 100000) * 100),
        impact: 15,
        description: `Expected: $${mlScore.expectedDealSize.toLocaleString()}`
      });
    }

    return factors;
  }

  /**
   * Get confidence score factors
   */
  private getConfidenceFactors(
    verification: VerificationResult | null,
    enrichment: LeadEnrichment | null
  ): IntelligenceBreakdown['factors'] {
    const factors = [];

    if (verification) {
      factors.push({
        name: 'Verification Confidence',
        value: verification.confidenceScore || 50,
        impact: 50,
        description: `${verification.confidenceScore || 50}% verification confidence`
      });
    }

    if (enrichment) {
      const confidenceScores = {
        'high': 100,
        'medium': 60,
        'low': 30
      };
      factors.push({
        name: 'Data Confidence',
        value: confidenceScores[enrichment.dataConfidence || 'medium'] || 50,
        impact: 30,
        description: `${enrichment.dataConfidence || 'medium'} confidence in enriched data`
      });
    }

    return factors;
  }

  /**
   * Generate human-readable explanations
   */
  private generateExplanations(
    subScores: IntelligenceSubScores,
    lead: Lead,
    verification: VerificationResult | null
  ): IntelligenceMetadata['explanations'] {
    const getScoreLevel = (score: number) => {
      if (score >= 80) return 'Excellent';
      if (score >= 60) return 'Good';
      if (score >= 40) return 'Fair';
      if (score >= 20) return 'Poor';
      return 'Very Poor';
    };

    const getRiskLevel = (score: number) => {
      if (score >= 80) return 'Very High Risk';
      if (score >= 60) return 'High Risk';
      if (score >= 40) return 'Moderate Risk';
      if (score >= 20) return 'Low Risk';
      return 'Very Low Risk';
    };

    return {
      overall: `This lead has an Intelligence Score of ${Math.round(
        (subScores.quality * this.WEIGHTS.quality) +
        (subScores.freshness * this.WEIGHTS.freshness) +
        ((100 - subScores.risk) * this.WEIGHTS.risk) +
        (subScores.opportunity * this.WEIGHTS.opportunity) +
        (subScores.confidence * this.WEIGHTS.confidence)
      )}/100, indicating ${
        getScoreLevel(Math.round(
          (subScores.quality * this.WEIGHTS.quality) +
          (subScores.freshness * this.WEIGHTS.freshness) +
          ((100 - subScores.risk) * this.WEIGHTS.risk) +
          (subScores.opportunity * this.WEIGHTS.opportunity) +
          (subScores.confidence * this.WEIGHTS.confidence)
        ))
      } overall quality and potential.`,
      
      quality: `Data quality is ${getScoreLevel(subScores.quality)} (${subScores.quality}/100). ${
        subScores.quality >= 60 
          ? 'Most required fields are complete and verified.' 
          : 'Several important fields are missing or unverified.'
      }`,
      
      freshness: `Lead freshness is ${getScoreLevel(subScores.freshness)} (${subScores.freshness}/100). ${
        subScores.freshness >= 60
          ? 'This is a relatively fresh lead with recent activity.'
          : 'This lead may be aging and less likely to convert.'
      }`,
      
      risk: `Risk assessment: ${getRiskLevel(subScores.risk)} (${subScores.risk}/100 risk points). ${
        subScores.risk >= 60
          ? 'Multiple risk factors detected. Proceed with caution.'
          : 'Risk factors are within acceptable range.'
      }`,
      
      opportunity: `Business opportunity is ${getScoreLevel(subScores.opportunity)} (${subScores.opportunity}/100). ${
        subScores.opportunity >= 60
          ? 'Strong potential for conversion and high deal value.'
          : 'Limited opportunity indicators present.'
      }`,
      
      confidence: `Data confidence is ${getScoreLevel(subScores.confidence)} (${subScores.confidence}/100). ${
        subScores.confidence >= 60
          ? 'High confidence in data accuracy and verification.'
          : 'Limited verification available, data confidence is lower.'
      }`
    };
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    subScores: IntelligenceSubScores,
    lead: Lead
  ): string[] {
    const recommendations = [];

    // Quality recommendations
    if (subScores.quality < 60) {
      recommendations.push('Consider enriching this lead with additional data to improve quality score');
      if (!lead.isEnriched) {
        recommendations.push('Enable data enrichment to add LinkedIn, website, and company information');
      }
    }

    // Freshness recommendations
    if (subScores.freshness < 40) {
      recommendations.push('This lead is aging - prioritize immediate outreach to maximize conversion');
    } else if (subScores.freshness > 80) {
      recommendations.push('Fresh lead - ideal time for initial contact');
    }

    // Risk recommendations
    if (subScores.risk > 60) {
      recommendations.push('High risk detected - verify financial information before proceeding');
      recommendations.push('Consider requesting additional documentation or guarantees');
    } else if (subScores.risk < 20) {
      recommendations.push('Low risk profile - expedite the approval process');
    }

    // Opportunity recommendations
    if (subScores.opportunity > 70) {
      recommendations.push('High-value opportunity - assign to senior sales representative');
      if (lead.urgencyLevel === 'immediate') {
        recommendations.push('Immediate need indicated - fast-track this lead');
      }
    } else if (subScores.opportunity < 30) {
      recommendations.push('Lower opportunity score - consider nurture campaign before direct sales');
    }

    // Confidence recommendations
    if (subScores.confidence < 50) {
      recommendations.push('Low data confidence - verify contact information before outreach');
      recommendations.push('Consider phone verification to improve confidence score');
    }

    return recommendations;
  }

  /**
   * Generate data warnings
   */
  private generateWarnings(
    lead: Lead,
    verification: VerificationResult | null,
    subScores: IntelligenceSubScores
  ): string[] {
    const warnings = [];

    // Verification warnings
    if (verification && verification.status === 'failed') {
      warnings.push('Lead failed verification - data may be inaccurate');
    }

    // Credit warnings
    const creditScore = parseInt(lead.creditScore || '0');
    if (creditScore < 500) {
      warnings.push('Very low credit score detected');
    }

    // Freshness warnings
    if (subScores.freshness < 20) {
      warnings.push('Stale lead - may no longer be actively seeking funding');
    }

    // Risk warnings
    if (subScores.risk > 80) {
      warnings.push('Very high risk profile - additional due diligence required');
    }

    // Data completeness warnings
    if (!lead.phone || !lead.email) {
      warnings.push('Missing critical contact information');
    }

    return warnings;
  }

  /**
   * Helper functions to fetch related data
   */
  /**
   * Get the latest enhanced verification for a lead
   */
  private async getLatestEnhancedVerification(leadId: string): Promise<EnhancedVerificationResult | null> {
    try {
      // First try to get from enhanced verification service (which includes caching)
      const status = await enhancedVerificationService.getVerificationStatus(leadId);
      
      if (status.status === 'never_verified') {
        return null;
      }
      
      // Get the full verification data from database
      const [result] = await db
        .select()
        .from(enhancedVerification)
        .where(eq(enhancedVerification.leadId, leadId))
        .orderBy(desc(enhancedVerification.verifiedAt))
        .limit(1);
      
      if (!result) return null;
      
      // Format as EnhancedVerificationResult
      return {
        leadId: result.leadId,
        verificationStatus: result.verificationStatus as any,
        overallConfidenceScore: parseFloat(result.overallConfidenceScore || '0'),
        confidenceBreakdown: result.confidenceBreakdown as any,
        emailVerification: result.emailVerification as any,
        phoneVerification: result.phoneVerification as any,
        cachedUntil: result.cachedUntil || new Date(),
        recommendations: []
      };
    } catch (error) {
      console.error('[LeadIntelligence] Failed to get enhanced verification:', error);
      return null;
    }
  }

  private async getEnrichmentData(leadId: string): Promise<LeadEnrichment | null> {
    const [result] = await db
      .select()
      .from(leadEnrichment)
      .where(eq(leadEnrichment.leadId, leadId))
      .orderBy(desc(leadEnrichment.enrichedAt))
      .limit(1);
    
    return result || null;
  }

  private async getUccFilings(businessName: string): Promise<UccFiling[]> {
    if (!businessName) return [];
    
    return await db
      .select()
      .from(uccFilings)
      .where(eq(uccFilings.debtorName, businessName))
      .orderBy(desc(uccFilings.filingDate));
  }

  /**
   * Batch calculate intelligence scores for multiple leads
   */
  async batchCalculateIntelligenceScores(leadIds: string[]): Promise<Map<string, LeadIntelligenceResult>> {
    const results = new Map<string, LeadIntelligenceResult>();
    
    // Process in batches to avoid overload
    const BATCH_SIZE = 10;
    for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
      const batch = leadIds.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (leadId) => {
        const [lead] = await db
          .select()
          .from(leads)
          .where(eq(leads.id, leadId))
          .limit(1);
        
        if (lead) {
          const result = await this.calculateIntelligenceScore(lead);
          results.set(leadId, result);
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return results;
  }

  /**
   * Update lead with calculated intelligence scores
   */
  async updateLeadIntelligenceScore(leadId: string): Promise<void> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const result = await this.calculateIntelligenceScore(lead);
    
    // Update the lead with the new intelligence scores
    await db
      .update(leads)
      .set({
        intelligenceScore: result.intelligenceScore,
        qualitySubScore: result.subScores.quality,
        freshnessSubScore: result.subScores.freshness,
        riskSubScore: result.subScores.risk,
        opportunitySubScore: result.subScores.opportunity,
        confidenceSubScore: result.subScores.confidence,
        intelligenceMetadata: result.metadata as any,
        intelligenceCalculatedAt: new Date()
      })
      .where(eq(leads.id, leadId));
  }
}

// Export a singleton instance
export const leadIntelligenceService = new LeadIntelligenceService();