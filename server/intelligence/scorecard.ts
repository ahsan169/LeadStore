/**
 * Scorecard System
 * Configurable lead scoring with weights, thresholds, and explanation generation
 */

import { Lead, UccFiling } from '@shared/schema';
import { INDUSTRY_RISK_PROFILES, CREDIT_SCORE_TIERS, BUSINESS_AGE_SCORING, REVENUE_TIERS, UCC_STACKING_RISK } from './industry-knowledge';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Scorecard weight configuration
 */
export interface ScorecardWeights {
  recency: number;
  status_active: number;
  known_mca_funder: number;
  continuation_count: number;
  multi_lien_flag: number;
  data_quality: number;
  contact_validity: number;
  business_age: number;
  revenue_range: number;
  industry_risk: number;
  credit_score: number;
  ucc_status: number;
  enrichment_level: number;
  verification_confidence: number;
}

/**
 * Scorecard thresholds
 */
export interface ScorecardThresholds {
  pass_core_f1: number;
  pass_mca_f1: number;
  high_quality_lead: number;
  medium_quality_lead: number;
  low_quality_lead: number;
  premium_lead: number;
  reject_lead: number;
}

/**
 * Scorecard configuration
 */
export interface ScorecardConfig {
  weights: ScorecardWeights;
  thresholds: ScorecardThresholds;
  version: number;
  effectiveDate: Date;
  description?: string;
  marketAdjustments?: MarketAdjustments;
}

/**
 * Market adjustments for dynamic weight changes
 */
export interface MarketAdjustments {
  enabled: boolean;
  factors: {
    market_volatility?: number; // 0-1 multiplier
    seasonal_adjustment?: number; // 0-1 multiplier
    competition_level?: number; // 0-1 multiplier
    industry_trends?: Record<string, number>; // Industry-specific adjustments
  };
}

/**
 * Score component breakdown
 */
export interface ScoreComponent {
  name: string;
  rawValue: any;
  normalizedScore: number; // 0-100
  weight: number;
  weightedScore: number;
  explanation: string;
  confidence: number; // 0-1
}

/**
 * Overall score result
 */
export interface ScoreResult {
  totalScore: number; // 0-100
  components: ScoreComponent[];
  qualityTier: 'premium' | 'high' | 'medium' | 'low' | 'reject';
  confidence: number; // 0-1 overall confidence
  explanations: string[];
  recommendations: string[];
  metadata: Record<string, any>;
  calculatedAt: Date;
}

/**
 * Lead scoring metrics for analysis
 */
export interface LeadMetrics {
  lead: Lead;
  uccFilings?: UccFiling[];
  enrichmentData?: Record<string, any>;
  verificationResults?: Record<string, any>;
  marketData?: Record<string, any>;
}

/**
 * Scorecard manager class
 */
export class ScorecardManager {
  private currentConfig: ScorecardConfig;
  private configHistory: ScorecardConfig[] = [];
  private configPath: string;

  constructor(configPath: string = 'server/intelligence/rules/scorecard.yaml') {
    this.configPath = configPath;
    this.currentConfig = this.getDefaultConfig();
  }

  /**
   * Initialize scorecard from configuration file
   */
  public async initialize(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf8');
      const config = yaml.load(configContent) as Partial<ScorecardConfig>;
      
      this.currentConfig = {
        ...this.getDefaultConfig(),
        ...config,
        version: (this.currentConfig.version || 0) + 1,
        effectiveDate: new Date()
      };
      
      this.configHistory.push({ ...this.currentConfig });
    } catch (error) {
      console.warn('Failed to load scorecard config, using defaults:', error);
    }
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ScorecardConfig {
    return {
      weights: {
        recency: 0.18,
        status_active: 0.18,
        known_mca_funder: 0.16,
        continuation_count: 0.12,
        multi_lien_flag: -0.08,
        data_quality: 0.18,
        contact_validity: 0.10,
        business_age: 0.08,
        revenue_range: 0.10,
        industry_risk: 0.12,
        credit_score: 0.08,
        ucc_status: 0.14,
        enrichment_level: 0.06,
        verification_confidence: 0.08
      },
      thresholds: {
        pass_core_f1: 0.90,
        pass_mca_f1: 0.85,
        high_quality_lead: 80,
        medium_quality_lead: 60,
        low_quality_lead: 40,
        premium_lead: 90,
        reject_lead: 30
      },
      version: 1,
      effectiveDate: new Date(),
      description: 'Default scorecard configuration'
    };
  }

  /**
   * Calculate lead score
   */
  public calculateScore(metrics: LeadMetrics): ScoreResult {
    const components: ScoreComponent[] = [];
    const explanations: string[] = [];
    const recommendations: string[] = [];

    // Calculate each component
    components.push(this.scoreRecency(metrics));
    components.push(this.scoreUccStatus(metrics));
    components.push(this.scoreKnownMcaFunder(metrics));
    components.push(this.scoreContinuationCount(metrics));
    components.push(this.scoreMultiLienFlag(metrics));
    components.push(this.scoreDataQuality(metrics));
    components.push(this.scoreContactValidity(metrics));
    components.push(this.scoreBusinessAge(metrics));
    components.push(this.scoreRevenueRange(metrics));
    components.push(this.scoreIndustryRisk(metrics));
    components.push(this.scoreCreditScore(metrics));
    components.push(this.scoreEnrichmentLevel(metrics));
    components.push(this.scoreVerificationConfidence(metrics));

    // Apply market adjustments if enabled
    if (this.currentConfig.marketAdjustments?.enabled) {
      this.applyMarketAdjustments(components, metrics);
    }

    // Calculate total score
    let totalScore = 0;
    let totalWeight = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const component of components) {
      totalScore += component.weightedScore;
      totalWeight += Math.abs(component.weight);
      totalConfidence += component.confidence;
      confidenceCount++;

      // Add explanations
      explanations.push(component.explanation);

      // Add recommendations based on low scores
      if (component.normalizedScore < 50 && component.weight > 0) {
        recommendations.push(this.generateRecommendation(component));
      }
    }

    // Normalize to 0-100 scale
    if (totalWeight > 0) {
      totalScore = (totalScore / totalWeight) * 100;
    }
    totalScore = Math.max(0, Math.min(100, totalScore));

    // Calculate average confidence
    const overallConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    // Determine quality tier
    const qualityTier = this.determineQualityTier(totalScore);

    return {
      totalScore,
      components,
      qualityTier,
      confidence: overallConfidence,
      explanations,
      recommendations,
      metadata: {
        configVersion: this.currentConfig.version,
        calculationMethod: 'weighted_average',
        marketAdjustmentsApplied: this.currentConfig.marketAdjustments?.enabled || false
      },
      calculatedAt: new Date()
    };
  }

  /**
   * Score lead recency
   */
  private scoreRecency(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const daysSinceUpload = lead.uploadedAt ? 
      Math.floor((Date.now() - new Date(lead.uploadedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

    let score = 100;
    if (daysSinceUpload <= 1) score = 100;
    else if (daysSinceUpload <= 7) score = 90;
    else if (daysSinceUpload <= 14) score = 75;
    else if (daysSinceUpload <= 30) score = 60;
    else if (daysSinceUpload <= 60) score = 40;
    else if (daysSinceUpload <= 90) score = 20;
    else score = 10;

    return {
      name: 'Lead Recency',
      rawValue: `${daysSinceUpload} days`,
      normalizedScore: score,
      weight: this.currentConfig.weights.recency,
      weightedScore: score * this.currentConfig.weights.recency,
      explanation: `Lead is ${daysSinceUpload} days old (${this.getRecencyLabel(daysSinceUpload)})`,
      confidence: 1.0 // High confidence as this is objective data
    };
  }

  /**
   * Score UCC status
   */
  private scoreUccStatus(metrics: LeadMetrics): ScoreComponent {
    const uccFilings = metrics.uccFilings || [];
    const activeFilings = uccFilings.filter(f => f.status === 'Active').length;
    
    let score = 100;
    let explanation = '';
    
    if (activeFilings === 0) {
      score = 100;
      explanation = 'Clean UCC - no active positions';
    } else if (activeFilings === 1) {
      score = 75;
      explanation = '1 active UCC position - manageable';
    } else if (activeFilings === 2) {
      score = 50;
      explanation = '2 active UCC positions - moderate risk';
    } else if (activeFilings === 3) {
      score = 25;
      explanation = '3 active UCC positions - high stacking risk';
    } else {
      score = 10;
      explanation = `${activeFilings} active UCC positions - severe stacking`;
    }

    return {
      name: 'UCC Status',
      rawValue: `${activeFilings} active`,
      normalizedScore: score,
      weight: this.currentConfig.weights.ucc_status,
      weightedScore: score * this.currentConfig.weights.ucc_status,
      explanation,
      confidence: uccFilings.length > 0 ? 0.9 : 0.5 // Lower confidence if no data
    };
  }

  /**
   * Score known MCA funder match
   */
  private scoreKnownMcaFunder(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const knownFunder = lead.matchedFunder || metrics.enrichmentData?.matchedFunder;
    
    const score = knownFunder ? 100 : 30;
    const explanation = knownFunder ? 
      `Matched to known MCA funder: ${knownFunder}` : 
      'No match to known MCA funders';

    return {
      name: 'Known MCA Funder',
      rawValue: knownFunder || 'No match',
      normalizedScore: score,
      weight: this.currentConfig.weights.known_mca_funder,
      weightedScore: score * this.currentConfig.weights.known_mca_funder,
      explanation,
      confidence: knownFunder ? 0.95 : 0.7
    };
  }

  /**
   * Score continuation count
   */
  private scoreContinuationCount(metrics: LeadMetrics): ScoreComponent {
    const uccFilings = metrics.uccFilings || [];
    const continuations = uccFilings.filter(f => f.filingType?.includes('Continuation')).length;
    
    let score = 100;
    if (continuations === 0) score = 100;
    else if (continuations === 1) score = 80;
    else if (continuations === 2) score = 60;
    else if (continuations === 3) score = 40;
    else score = 20;

    return {
      name: 'Continuation Count',
      rawValue: continuations,
      normalizedScore: score,
      weight: this.currentConfig.weights.continuation_count,
      weightedScore: score * this.currentConfig.weights.continuation_count,
      explanation: `${continuations} UCC continuations found`,
      confidence: uccFilings.length > 0 ? 0.9 : 0.5
    };
  }

  /**
   * Score multi-lien flag
   */
  private scoreMultiLienFlag(metrics: LeadMetrics): ScoreComponent {
    const uccFilings = metrics.uccFilings || [];
    const uniqueLenders = new Set(uccFilings.map(f => f.securedParty).filter(Boolean));
    const hasMultipleLiens = uniqueLenders.size > 1;
    
    const score = hasMultipleLiens ? 0 : 100; // Negative weight will be applied
    const explanation = hasMultipleLiens ? 
      `Multiple liens detected (${uniqueLenders.size} different lenders)` : 
      'Single lender or no liens';

    return {
      name: 'Multi-Lien Flag',
      rawValue: hasMultipleLiens,
      normalizedScore: score,
      weight: this.currentConfig.weights.multi_lien_flag, // This is negative
      weightedScore: score * this.currentConfig.weights.multi_lien_flag,
      explanation,
      confidence: uccFilings.length > 0 ? 0.9 : 0.5
    };
  }

  /**
   * Score data quality
   */
  private scoreDataQuality(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    let completeness = 0;
    let totalFields = 0;

    // Check critical fields
    const criticalFields = [
      'businessName', 'ownerName', 'email', 'phone', 
      'industry', 'annualRevenue', 'city', 'state'
    ];

    for (const field of criticalFields) {
      totalFields++;
      if (lead[field as keyof Lead] && lead[field as keyof Lead] !== '') {
        completeness++;
      }
    }

    const score = (completeness / totalFields) * 100;

    return {
      name: 'Data Quality',
      rawValue: `${completeness}/${totalFields} fields`,
      normalizedScore: score,
      weight: this.currentConfig.weights.data_quality,
      weightedScore: score * this.currentConfig.weights.data_quality,
      explanation: `Data completeness: ${Math.round(score)}% (${completeness} of ${totalFields} critical fields)`,
      confidence: 1.0
    };
  }

  /**
   * Score contact validity
   */
  private scoreContactValidity(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const emailVerified = lead.emailVerificationStatus === 'valid';
    const phoneVerified = lead.phoneVerificationStatus === 'valid';
    
    let score = 0;
    if (emailVerified && phoneVerified) score = 100;
    else if (emailVerified || phoneVerified) score = 60;
    else if (lead.email && lead.phone) score = 30;
    else score = 10;

    const explanation = this.getContactValidityExplanation(emailVerified, phoneVerified);

    return {
      name: 'Contact Validity',
      rawValue: { email: emailVerified, phone: phoneVerified },
      normalizedScore: score,
      weight: this.currentConfig.weights.contact_validity,
      weightedScore: score * this.currentConfig.weights.contact_validity,
      explanation,
      confidence: (emailVerified || phoneVerified) ? 0.95 : 0.6
    };
  }

  /**
   * Score business age
   */
  private scoreBusinessAge(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const yearsInBusiness = lead.yearsInBusiness || 
      (lead.yearFounded ? new Date().getFullYear() - lead.yearFounded : null);
    
    let score = 50; // Default middle score if unknown
    let explanation = 'Business age unknown';
    let confidence = 0.3;

    if (yearsInBusiness !== null) {
      if (yearsInBusiness >= 5) {
        score = 100;
        explanation = `Established business (${yearsInBusiness}+ years)`;
      } else if (yearsInBusiness >= 3) {
        score = 80;
        explanation = `Mature business (${yearsInBusiness} years)`;
      } else if (yearsInBusiness >= 2) {
        score = 60;
        explanation = `Growing business (${yearsInBusiness} years)`;
      } else if (yearsInBusiness >= 1) {
        score = 40;
        explanation = `Young business (${yearsInBusiness} year)`;
      } else {
        score = 20;
        explanation = 'Startup (less than 1 year)';
      }
      confidence = 0.9;
    }

    return {
      name: 'Business Age',
      rawValue: yearsInBusiness || 'Unknown',
      normalizedScore: score,
      weight: this.currentConfig.weights.business_age,
      weightedScore: score * this.currentConfig.weights.business_age,
      explanation,
      confidence
    };
  }

  /**
   * Score revenue range
   */
  private scoreRevenueRange(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const revenue = parseInt(lead.annualRevenue || '0') || lead.estimatedRevenue || 0;
    
    let score = 50; // Default if unknown
    let explanation = 'Revenue unknown';
    let confidence = 0.3;

    if (revenue > 0) {
      if (revenue >= 5000000) {
        score = 90;
        explanation = `Upper mid-market revenue ($${(revenue/1000000).toFixed(1)}M)`;
      } else if (revenue >= 1000000) {
        score = 100;
        explanation = `Ideal MCA range ($${(revenue/1000000).toFixed(1)}M)`;
      } else if (revenue >= 500000) {
        score = 85;
        explanation = `Good MCA candidate ($${(revenue/1000).toFixed(0)}K)`;
      } else if (revenue >= 100000) {
        score = 60;
        explanation = `Limited options ($${(revenue/1000).toFixed(0)}K)`;
      } else {
        score = 30;
        explanation = `Minimal revenue ($${revenue.toLocaleString()})`;
      }
      confidence = lead.revenueConfidence === 'high' ? 0.9 : 0.7;
    }

    return {
      name: 'Revenue Range',
      rawValue: revenue || 'Unknown',
      normalizedScore: score,
      weight: this.currentConfig.weights.revenue_range,
      weightedScore: score * this.currentConfig.weights.revenue_range,
      explanation,
      confidence
    };
  }

  /**
   * Score industry risk
   */
  private scoreIndustryRisk(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const industry = lead.industry || 'Unknown';
    
    let score = 50; // Default middle score
    let riskLevel = 'unknown';
    let confidence = 0.3;

    // Check against industry risk profiles
    for (const [risk, profile] of Object.entries(INDUSTRY_RISK_PROFILES)) {
      if (profile.industries.some(ind => 
        industry.toLowerCase().includes(ind.toLowerCase()) ||
        ind.toLowerCase().includes(industry.toLowerCase())
      )) {
        score = 100 - profile.baseScore; // Invert because lower risk is better
        riskLevel = risk;
        confidence = 0.85;
        break;
      }
    }

    return {
      name: 'Industry Risk',
      rawValue: industry,
      normalizedScore: score,
      weight: this.currentConfig.weights.industry_risk,
      weightedScore: score * this.currentConfig.weights.industry_risk,
      explanation: `Industry: ${industry} (${riskLevel} risk)`,
      confidence
    };
  }

  /**
   * Score credit score
   */
  private scoreCreditScore(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const creditScore = parseInt(lead.creditScore || '0') || 0;
    
    let score = 50;
    let tier = 'unknown';
    let confidence = 0.3;

    if (creditScore > 0) {
      for (const [tierName, tierData] of Object.entries(CREDIT_SCORE_TIERS)) {
        if (creditScore >= tierData.range.min && creditScore <= tierData.range.max) {
          score = (1 - tierData.riskMultiplier + 0.3) * 100; // Convert risk multiplier to score
          tier = tierName;
          confidence = 0.9;
          break;
        }
      }
    }

    return {
      name: 'Credit Score',
      rawValue: creditScore || 'Unknown',
      normalizedScore: score,
      weight: this.currentConfig.weights.credit_score,
      weightedScore: score * this.currentConfig.weights.credit_score,
      explanation: creditScore > 0 ? `Credit score: ${creditScore} (${tier})` : 'Credit score unknown',
      confidence
    };
  }

  /**
   * Score enrichment level
   */
  private scoreEnrichmentLevel(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const enrichmentFields = [
      'linkedinUrl', 'websiteUrl', 'companySize', 'yearFounded',
      'naicsCode', 'estimatedRevenue', 'employeeCount', 'fullAddress'
    ];
    
    let enrichedCount = 0;
    for (const field of enrichmentFields) {
      if (lead[field as keyof Lead]) {
        enrichedCount++;
      }
    }
    
    const score = (enrichedCount / enrichmentFields.length) * 100;

    return {
      name: 'Enrichment Level',
      rawValue: `${enrichedCount}/${enrichmentFields.length}`,
      normalizedScore: score,
      weight: this.currentConfig.weights.enrichment_level,
      weightedScore: score * this.currentConfig.weights.enrichment_level,
      explanation: `${enrichedCount} of ${enrichmentFields.length} enrichment fields populated`,
      confidence: 1.0
    };
  }

  /**
   * Score verification confidence
   */
  private scoreVerificationConfidence(metrics: LeadMetrics): ScoreComponent {
    const lead = metrics.lead;
    const verificationScore = lead.verificationScore || 0;
    const aiConfidence = lead.aiVerificationConfidence || 0;
    
    const combinedScore = (verificationScore + aiConfidence * 100) / 2;

    return {
      name: 'Verification Confidence',
      rawValue: `${Math.round(combinedScore)}%`,
      normalizedScore: combinedScore,
      weight: this.currentConfig.weights.verification_confidence,
      weightedScore: combinedScore * this.currentConfig.weights.verification_confidence,
      explanation: `Verification confidence: ${Math.round(combinedScore)}%`,
      confidence: combinedScore / 100
    };
  }

  /**
   * Apply market adjustments to scores
   */
  private applyMarketAdjustments(components: ScoreComponent[], metrics: LeadMetrics): void {
    if (!this.currentConfig.marketAdjustments?.factors) return;

    const factors = this.currentConfig.marketAdjustments.factors;
    
    // Apply global market adjustments
    if (factors.market_volatility !== undefined) {
      components.forEach(c => {
        if (c.name === 'Industry Risk' || c.name === 'Credit Score') {
          c.weightedScore *= factors.market_volatility!;
        }
      });
    }

    if (factors.seasonal_adjustment !== undefined) {
      components.forEach(c => {
        if (c.name === 'Lead Recency') {
          c.weightedScore *= factors.seasonal_adjustment!;
        }
      });
    }

    // Apply industry-specific adjustments
    if (factors.industry_trends && metrics.lead.industry) {
      const industryAdjustment = factors.industry_trends[metrics.lead.industry];
      if (industryAdjustment !== undefined) {
        const industryComponent = components.find(c => c.name === 'Industry Risk');
        if (industryComponent) {
          industryComponent.weightedScore *= industryAdjustment;
        }
      }
    }
  }

  /**
   * Determine quality tier based on score
   */
  private determineQualityTier(score: number): 'premium' | 'high' | 'medium' | 'low' | 'reject' {
    const thresholds = this.currentConfig.thresholds;
    
    if (score >= thresholds.premium_lead) return 'premium';
    if (score >= thresholds.high_quality_lead) return 'high';
    if (score >= thresholds.medium_quality_lead) return 'medium';
    if (score >= thresholds.low_quality_lead) return 'low';
    return 'reject';
  }

  /**
   * Generate recommendation for low-scoring component
   */
  private generateRecommendation(component: ScoreComponent): string {
    const recommendations: Record<string, string> = {
      'Lead Recency': 'Consider prioritizing fresher leads for better conversion rates',
      'UCC Status': 'Review UCC filings for stacking risk before proceeding',
      'Known MCA Funder': 'Research potential MCA funders for this lead',
      'Data Quality': 'Enrich missing data fields to improve lead quality',
      'Contact Validity': 'Verify contact information before outreach',
      'Business Age': 'Young businesses may need alternative funding options',
      'Revenue Range': 'Verify revenue figures to ensure funding eligibility',
      'Industry Risk': 'Apply stricter underwriting for high-risk industries',
      'Credit Score': 'Consider credit improvement before funding',
      'Enrichment Level': 'Run additional enrichment to gather more data',
      'Verification Confidence': 'Perform additional verification checks'
    };

    return recommendations[component.name] || `Improve ${component.name} to increase overall score`;
  }

  /**
   * Get recency label
   */
  private getRecencyLabel(days: number): string {
    if (days <= 1) return 'fresh';
    if (days <= 7) return 'recent';
    if (days <= 30) return 'aging';
    if (days <= 90) return 'old';
    return 'stale';
  }

  /**
   * Get contact validity explanation
   */
  private getContactValidityExplanation(emailVerified: boolean, phoneVerified: boolean): string {
    if (emailVerified && phoneVerified) return 'Both email and phone verified';
    if (emailVerified) return 'Email verified, phone unverified';
    if (phoneVerified) return 'Phone verified, email unverified';
    return 'Neither email nor phone verified';
  }

  /**
   * Update scorecard configuration
   */
  public async updateConfig(newConfig: Partial<ScorecardConfig>): Promise<void> {
    this.currentConfig = {
      ...this.currentConfig,
      ...newConfig,
      version: this.currentConfig.version + 1,
      effectiveDate: new Date()
    };
    
    this.configHistory.push({ ...this.currentConfig });
    
    // Save to file
    try {
      const yamlContent = yaml.dump(this.currentConfig);
      await fs.writeFile(this.configPath, yamlContent, 'utf8');
    } catch (error) {
      console.error('Failed to save scorecard config:', error);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): ScorecardConfig {
    return { ...this.currentConfig };
  }

  /**
   * Get configuration history
   */
  public getConfigHistory(): ScorecardConfig[] {
    return [...this.configHistory];
  }

  /**
   * Rollback to a previous version
   */
  public async rollbackToVersion(version: number): Promise<boolean> {
    const targetConfig = this.configHistory.find(c => c.version === version);
    if (!targetConfig) return false;

    this.currentConfig = {
      ...targetConfig,
      version: this.currentConfig.version + 1,
      effectiveDate: new Date(),
      description: `Rollback to version ${version}`
    };
    
    this.configHistory.push({ ...this.currentConfig });
    
    // Save to file
    try {
      const yamlContent = yaml.dump(this.currentConfig);
      await fs.writeFile(this.configPath, yamlContent, 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save rollback config:', error);
      return false;
    }
  }
}

// Export singleton instance
export const scorecardManager = new ScorecardManager();