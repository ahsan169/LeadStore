/**
 * MCA/UCC Industry Knowledge Base
 * Comprehensive industry-specific intelligence for lead scoring and risk assessment
 */

import { fieldMapper, FIELD_VALIDATORS, BUSINESS_ENTITY_NORMALIZER, CanonicalField } from './ontology';
import fundersData from './funders.json';

/**
 * Industry risk profiles based on MCA lending patterns
 */
export const INDUSTRY_RISK_PROFILES = {
  // Low Risk Industries (Score: 10-30)
  lowRisk: {
    industries: [
      'Healthcare', 'Medical Services', 'Dental', 'Veterinary',
      'Professional Services', 'Accounting', 'Legal Services',
      'Insurance', 'Real Estate', 'Property Management',
      'Government Contracting', 'Defense Contracting'
    ],
    characteristics: {
      stableRevenue: true,
      lowSeasonality: true,
      highBarriersToEntry: true,
      essentialServices: true,
      strongCollateral: true
    },
    baseScore: 20,
    mcaApprovalRate: 0.85,
    defaultRate: 0.05,
    typicalAdvanceMultiple: 1.3
  },
  
  // Moderate Risk Industries (Score: 31-60)
  moderateRisk: {
    industries: [
      'Manufacturing', 'Wholesale Trade', 'Distribution',
      'Construction', 'General Contracting', 'Home Services',
      'Auto Repair', 'Auto Sales', 'Equipment Rental',
      'Business Services', 'IT Services', 'Marketing',
      'Education', 'Training', 'Childcare'
    ],
    characteristics: {
      moderateRevenue: true,
      someSeasonality: true,
      averageCollateral: true,
      competitiveMarket: true
    },
    baseScore: 45,
    mcaApprovalRate: 0.70,
    defaultRate: 0.10,
    typicalAdvanceMultiple: 1.25
  },
  
  // High Risk Industries (Score: 61-100)
  highRisk: {
    industries: [
      'Restaurant', 'Food Service', 'Bar', 'Nightclub',
      'Retail', 'E-commerce', 'Online Business',
      'Travel', 'Tourism', 'Hospitality',
      'Entertainment', 'Events', 'Recreation',
      'Trucking', 'Transportation', 'Logistics',
      'Startups', 'New Ventures'
    ],
    characteristics: {
      volatileRevenue: true,
      highSeasonality: true,
      lowCollateral: true,
      highCompetition: true,
      cashIntensive: true
    },
    baseScore: 75,
    mcaApprovalRate: 0.50,
    defaultRate: 0.20,
    typicalAdvanceMultiple: 1.18
  }
};

/**
 * Credit score impact on MCA approval and terms
 */
export const CREDIT_SCORE_TIERS = {
  excellent: {
    range: { min: 720, max: 850 },
    approvalProbability: 0.95,
    riskMultiplier: 0.7,
    typicalFactorRate: { min: 1.09, max: 1.15 },
    description: 'Excellent credit - best rates available'
  },
  good: {
    range: { min: 680, max: 719 },
    approvalProbability: 0.85,
    riskMultiplier: 0.9,
    typicalFactorRate: { min: 1.14, max: 1.22 },
    description: 'Good credit - competitive rates'
  },
  fair: {
    range: { min: 620, max: 679 },
    approvalProbability: 0.70,
    riskMultiplier: 1.1,
    typicalFactorRate: { min: 1.20, max: 1.30 },
    description: 'Fair credit - standard rates'
  },
  poor: {
    range: { min: 550, max: 619 },
    approvalProbability: 0.50,
    riskMultiplier: 1.4,
    typicalFactorRate: { min: 1.28, max: 1.40 },
    description: 'Poor credit - higher rates, may require additional security'
  },
  veryPoor: {
    range: { min: 300, max: 549 },
    approvalProbability: 0.25,
    riskMultiplier: 1.8,
    typicalFactorRate: { min: 1.35, max: 1.49 },
    description: 'Very poor credit - limited options, highest rates'
  }
};

/**
 * Time in business impact on lead quality
 */
export const BUSINESS_AGE_SCORING = {
  established: {
    minYears: 5,
    score: 90,
    description: 'Established business with proven track record',
    mcaApprovalRate: 0.85
  },
  mature: {
    minYears: 3,
    maxYears: 5,
    score: 75,
    description: 'Mature business with good history',
    mcaApprovalRate: 0.75
  },
  growing: {
    minYears: 2,
    maxYears: 3,
    score: 60,
    description: 'Growing business meeting minimum requirements',
    mcaApprovalRate: 0.65
  },
  young: {
    minYears: 1,
    maxYears: 2,
    score: 40,
    description: 'Young business, limited options',
    mcaApprovalRate: 0.45
  },
  startup: {
    minYears: 0,
    maxYears: 1,
    score: 20,
    description: 'Startup, very limited MCA options',
    mcaApprovalRate: 0.20
  }
};

/**
 * Revenue-based scoring tiers
 */
export const REVENUE_TIERS = {
  enterprise: {
    minAnnual: 10000000,
    score: 95,
    description: 'Enterprise level revenue',
    preferredFunding: 'bank_loan'
  },
  upperMid: {
    minAnnual: 5000000,
    maxAnnual: 10000000,
    score: 85,
    description: 'Upper mid-market revenue',
    preferredFunding: 'term_loan'
  },
  midMarket: {
    minAnnual: 1000000,
    maxAnnual: 5000000,
    score: 75,
    description: 'Mid-market revenue, ideal for MCA',
    preferredFunding: 'mca'
  },
  smallBusiness: {
    minAnnual: 500000,
    maxAnnual: 1000000,
    score: 65,
    description: 'Small business, good MCA candidate',
    preferredFunding: 'mca'
  },
  microBusiness: {
    minAnnual: 100000,
    maxAnnual: 500000,
    score: 50,
    description: 'Micro business, limited options',
    preferredFunding: 'mca_small'
  },
  minimal: {
    minAnnual: 0,
    maxAnnual: 100000,
    score: 25,
    description: 'Minimal revenue, high risk',
    preferredFunding: 'alternative'
  }
};

/**
 * UCC stacking risk assessment
 */
export const UCC_STACKING_RISK = {
  clean: {
    activePositions: 0,
    riskScore: 10,
    approvalProbability: 0.90,
    description: 'No active positions, clean UCC'
  },
  single: {
    activePositions: 1,
    riskScore: 30,
    approvalProbability: 0.75,
    description: 'Single position, manageable'
  },
  moderate: {
    activePositions: 2,
    riskScore: 50,
    approvalProbability: 0.60,
    description: 'Two positions, moderate risk'
  },
  stacked: {
    activePositions: 3,
    riskScore: 70,
    approvalProbability: 0.40,
    description: 'Three positions, high stacking risk'
  },
  overStacked: {
    activePositions: 4,
    riskScore: 90,
    approvalProbability: 0.20,
    description: 'Four+ positions, severe stacking'
  }
};

/**
 * MCA terminology mappings
 */
export const MCA_TERMINOLOGY = {
  // Funding types
  fundingTypes: {
    'MCA': ['merchant cash advance', 'cash advance', 'merchant advance', 'business cash advance', 'revenue advance'],
    'ACH': ['ach loan', 'ach advance', 'automated clearing house', 'daily ach', 'weekly ach'],
    'Term Loan': ['term loan', 'business term loan', 'fixed term loan', 'installment loan'],
    'LOC': ['line of credit', 'credit line', 'revolving credit', 'business line of credit', 'working capital line'],
    'Invoice': ['invoice factoring', 'invoice financing', 'accounts receivable financing', 'ar financing'],
    'Revenue': ['revenue based financing', 'revenue share', 'revenue based funding', 'rbf'],
    'Equipment': ['equipment financing', 'equipment loan', 'equipment lease', 'machinery financing']
  },
  
  // Payment terms
  paymentTerms: {
    'Daily': ['daily', 'every day', 'business days', 'weekdays', 'daily payment', 'daily ach'],
    'Weekly': ['weekly', 'every week', 'weekly payment', 'weekly ach'],
    'Bi-Weekly': ['bi-weekly', 'biweekly', 'every two weeks', 'every 2 weeks'],
    'Monthly': ['monthly', 'every month', 'monthly payment', 'monthly installment'],
    'Revenue Split': ['split', 'percentage', 'revenue split', 'sales split', 'credit card split']
  },
  
  // Industry jargon
  jargon: {
    'Factor Rate': ['factor', 'factor rate', 'buy rate', 'purchase price', 'cost'],
    'Holdback': ['holdback', 'holdback percentage', 'retrieval rate', 'ach percentage', 'withholding rate'],
    'RTR': ['rtr', 'right to receive', 'payback amount', 'total payback', 'total amount'],
    'Position': ['position', 'lien position', 'priority', 'seniority', '1st position', '2nd position'],
    'Stacking': ['stacking', 'stacked', 'multiple advances', 'multiple positions', 'layered funding'],
    'Default': ['default', 'defaulted', 'non-payment', 'breach', 'delinquent'],
    'COJ': ['coj', 'confession of judgment', 'confession', 'judgment'],
    'UCC': ['ucc', 'ucc-1', 'ucc filing', 'uniform commercial code', 'security interest'],
    'Personal Guarantee': ['pg', 'personal guarantee', 'personal guaranty', 'guarantor', 'personally guaranteed'],
    'Renewal': ['renewal', 'renew', 'refinance', 'refi', 'consolidation', 'payoff']
  }
};

/**
 * Geographic risk factors by state
 */
export const STATE_RISK_FACTORS = {
  // Business-friendly states (lower risk)
  lowRisk: {
    states: ['DE', 'NV', 'WY', 'TX', 'FL', 'SD', 'NH', 'AK', 'WA', 'TN'],
    multiplier: 0.9,
    characteristics: ['business_friendly', 'low_taxes', 'favorable_laws']
  },
  
  // Average risk states
  moderateRisk: {
    states: ['AZ', 'CO', 'GA', 'ID', 'IN', 'IA', 'KS', 'KY', 'ME', 'MI', 'MN', 'MO', 'MT', 'NE', 'NM', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'SC', 'UT', 'VT', 'VA', 'WV', 'WI'],
    multiplier: 1.0,
    characteristics: ['average_business_climate']
  },
  
  // Higher risk states (more regulation, higher taxes)
  highRisk: {
    states: ['CA', 'NY', 'NJ', 'CT', 'MA', 'IL', 'MD', 'HI', 'RI', 'LA', 'AL', 'AR', 'MS', 'DC'],
    multiplier: 1.1,
    characteristics: ['high_regulation', 'high_taxes', 'challenging_business_climate']
  }
};

/**
 * Lead quality scoring engine
 */
export class LeadQualityScorer {
  /**
   * Calculate comprehensive quality score for a lead
   */
  calculateQualityScore(lead: any): {
    score: number;
    breakdown: Record<string, number>;
    flags: string[];
    recommendations: string[];
  } {
    const breakdown: Record<string, number> = {};
    const flags: string[] = [];
    const recommendations: string[] = [];
    
    // 1. Data completeness score (0-25 points)
    breakdown.dataCompleteness = this.scoreDataCompleteness(lead);
    
    // 2. Industry risk score (0-20 points)
    breakdown.industryRisk = this.scoreIndustryRisk(lead.industry);
    
    // 3. Credit score impact (0-20 points)
    breakdown.creditScore = this.scoreCreditWorthiness(lead.creditScore);
    
    // 4. Business age score (0-15 points)
    breakdown.businessAge = this.scoreBusinessAge(lead.yearsInBusiness || lead.timeInBusiness);
    
    // 5. Revenue score (0-10 points)
    breakdown.revenue = this.scoreRevenue(lead.annualRevenue);
    
    // 6. UCC status score (0-10 points)
    breakdown.uccStatus = this.scoreUccStatus(lead);
    
    // Calculate total score
    const totalScore = Object.values(breakdown).reduce((sum, score) => sum + score, 0);
    
    // Generate flags and recommendations
    this.generateFlagsAndRecommendations(lead, breakdown, flags, recommendations);
    
    return {
      score: Math.min(100, Math.max(0, totalScore)),
      breakdown,
      flags,
      recommendations
    };
  }
  
  private scoreDataCompleteness(lead: any): number {
    const requiredFields = ['businessName', 'ownerName', 'email', 'phone'];
    const importantFields = ['industry', 'annualRevenue', 'creditScore', 'state', 'yearsInBusiness'];
    const bonusFields = ['ein', 'fullAddress', 'website', 'secondaryPhone'];
    
    let score = 0;
    
    // Required fields (10 points)
    const requiredComplete = requiredFields.filter(f => lead[f] && lead[f].toString().trim()).length;
    score += (requiredComplete / requiredFields.length) * 10;
    
    // Important fields (10 points)
    const importantComplete = importantFields.filter(f => lead[f] && lead[f].toString().trim()).length;
    score += (importantComplete / importantFields.length) * 10;
    
    // Bonus fields (5 points)
    const bonusComplete = bonusFields.filter(f => lead[f] && lead[f].toString().trim()).length;
    score += (bonusComplete / bonusFields.length) * 5;
    
    return score;
  }
  
  private scoreIndustryRisk(industry?: string): number {
    if (!industry) return 10; // Default middle score if unknown
    
    const normalizedIndustry = industry.toLowerCase().trim();
    
    // Check each risk category
    for (const profile of Object.values(INDUSTRY_RISK_PROFILES)) {
      const match = profile.industries.some(ind => 
        normalizedIndustry.includes(ind.toLowerCase())
      );
      
      if (match) {
        // Invert the base score (lower risk = higher quality score)
        return 20 - (profile.baseScore / 5);
      }
    }
    
    return 10; // Default middle score
  }
  
  private scoreCreditWorthiness(creditScore?: string | number): number {
    if (!creditScore) return 10; // Default middle score
    
    const score = typeof creditScore === 'string' ? parseInt(creditScore, 10) : creditScore;
    
    for (const tier of Object.values(CREDIT_SCORE_TIERS)) {
      if (score >= tier.range.min && score <= tier.range.max) {
        return 20 * tier.approvalProbability;
      }
    }
    
    return 10;
  }
  
  private scoreBusinessAge(timeInBusiness?: string | number): number {
    if (!timeInBusiness) return 7; // Default middle score
    
    let years = 0;
    
    if (typeof timeInBusiness === 'number') {
      years = timeInBusiness;
    } else {
      // Parse various formats: "2 years", "24 months", "2", etc.
      const match = timeInBusiness.match(/(\d+)/);
      if (match) {
        const value = parseInt(match[1], 10);
        if (timeInBusiness.toLowerCase().includes('month')) {
          years = value / 12;
        } else {
          years = value;
        }
      }
    }
    
    for (const tier of Object.values(BUSINESS_AGE_SCORING)) {
      if (years >= (tier.minYears || 0)) {
        if (!('maxYears' in tier) || years < tier.maxYears!) {
          return (tier.score / 100) * 15;
        }
      }
    }
    
    return 7;
  }
  
  private scoreRevenue(revenue?: string | number): number {
    if (!revenue) return 5; // Default middle score
    
    const amount = FIELD_VALIDATORS.currency.normalize(revenue.toString());
    
    for (const tier of Object.values(REVENUE_TIERS)) {
      if (amount >= (tier.minAnnual || 0)) {
        if (!('maxAnnual' in tier) || amount < tier.maxAnnual!) {
          return (tier.score / 100) * 10;
        }
      }
    }
    
    return 5;
  }
  
  private scoreUccStatus(lead: any): number {
    const activePositions = lead.activePositions || lead.currentPositions || 0;
    
    for (const risk of Object.values(UCC_STACKING_RISK)) {
      if (activePositions === risk.activePositions) {
        return 10 - (risk.riskScore / 10);
      }
    }
    
    // More than 4 positions
    if (activePositions > 4) {
      return 0;
    }
    
    return 10; // Clean UCC
  }
  
  private generateFlagsAndRecommendations(
    lead: any,
    breakdown: Record<string, number>,
    flags: string[],
    recommendations: string[]
  ): void {
    // Data completeness flags
    if (breakdown.dataCompleteness < 15) {
      flags.push('Incomplete data');
      recommendations.push('Enrich missing fields before outreach');
    }
    
    // Industry risk flags
    if (breakdown.industryRisk < 10) {
      flags.push('High-risk industry');
      recommendations.push('Requires careful underwriting');
    }
    
    // Credit flags
    if (lead.creditScore && lead.creditScore < 600) {
      flags.push('Low credit score');
      recommendations.push('Consider alternative funding options');
    }
    
    // Business age flags
    if (breakdown.businessAge < 5) {
      flags.push('Young business');
      recommendations.push('Verify time in business documentation');
    }
    
    // Revenue flags
    if (breakdown.revenue < 3) {
      flags.push('Low revenue');
      recommendations.push('May not meet minimum revenue requirements');
    }
    
    // UCC flags
    if (lead.activePositions > 2) {
      flags.push('Multiple UCC positions');
      recommendations.push('High stacking risk - proceed with caution');
    }
    
    // Positive flags
    if (breakdown.creditScore >= 18) {
      flags.push('Excellent credit');
    }
    
    if (breakdown.businessAge >= 12) {
      flags.push('Established business');
    }
    
    if (breakdown.uccStatus >= 9) {
      flags.push('Clean UCC');
    }
  }
}

/**
 * Funder matcher - matches leads to appropriate funders
 */
export class FunderMatcher {
  private funders = fundersData.funders;
  
  /**
   * Find matching funders for a lead based on profile
   */
  matchFunders(lead: any): {
    recommended: any[];
    possible: any[];
    avoid: any[];
    reasoning: string[];
  } {
    const recommended: any[] = [];
    const possible: any[] = [];
    const avoid: any[] = [];
    const reasoning: string[] = [];
    
    // Analyze lead profile
    const creditScore = typeof lead.creditScore === 'string' ? 
      parseInt(lead.creditScore, 10) : lead.creditScore;
    const activePositions = lead.activePositions || 0;
    const revenue = FIELD_VALIDATORS.currency.normalize(
      (lead.annualRevenue || '0').toString()
    );
    
    // Categorize funders based on lead profile
    for (const funder of this.funders) {
      // High credit score - recommend tier 1
      if (creditScore >= 700 && funder.tier === 'tier1') {
        recommended.push(funder);
        continue;
      }
      
      // Bank loans for established businesses
      if (funder.tier === 'bank' && creditScore >= 680 && revenue > 500000) {
        recommended.push(funder);
        continue;
      }
      
      // Avoid high-risk funders for good leads
      if (creditScore >= 650 && funder.tier === 'tier3') {
        avoid.push(funder);
        continue;
      }
      
      // Match based on stacking situation
      if (activePositions >= 2 && funder.tier === 'tier3') {
        possible.push(funder); // They might be only option
        continue;
      }
      
      // Default tier 2 for average leads
      if (funder.tier === 'tier2') {
        possible.push(funder);
      }
    }
    
    // Generate reasoning
    if (creditScore >= 700) {
      reasoning.push('Excellent credit qualifies for tier 1 funders');
    }
    if (activePositions >= 2) {
      reasoning.push('Multiple positions limits funder options');
    }
    if (revenue < 100000) {
      reasoning.push('Low revenue restricts to specialized MCA funders');
    }
    
    return { recommended, possible, avoid, reasoning };
  }
  
  /**
   * Normalize funder name for matching
   */
  normalizeFunderName(name: string): string {
    let normalized = name.toLowerCase().trim();
    
    // Remove common suffixes
    for (const suffix of fundersData.normalization.suffixes_to_remove) {
      const regex = new RegExp(`\\b${suffix}\\b\\.?$`, 'i');
      normalized = normalized.replace(regex, '').trim();
    }
    
    // Replace common abbreviations
    for (const [full, abbrevs] of Object.entries(fundersData.normalization.common_abbreviations)) {
      for (const abbrev of abbrevs) {
        const regex = new RegExp(`\\b${abbrev}\\b`, 'gi');
        normalized = normalized.replace(regex, full);
      }
    }
    
    return normalized;
  }
  
  /**
   * Identify funder from text
   */
  identifyFunder(text: string): {
    funder: any | null;
    confidence: number;
    matchType: 'exact' | 'alias' | 'pattern' | 'fuzzy' | null;
  } {
    const normalized = this.normalizeFunderName(text);
    
    for (const funder of this.funders) {
      // Exact match
      if (normalized === this.normalizeFunderName(funder.name)) {
        return { funder, confidence: 1.0, matchType: 'exact' };
      }
      
      // Alias match
      for (const alias of funder.aliases) {
        if (normalized === this.normalizeFunderName(alias)) {
          return { funder, confidence: 0.95, matchType: 'alias' };
        }
      }
      
      // Pattern match
      for (const pattern of funder.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(normalized)) {
          return { funder, confidence: 0.85, matchType: 'pattern' };
        }
      }
    }
    
    // Fuzzy matching as last resort
    let bestMatch = null;
    let bestScore = 0;
    
    for (const funder of this.funders) {
      const score = this.calculateSimilarity(
        normalized,
        this.normalizeFunderName(funder.name)
      );
      
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = funder;
      }
    }
    
    if (bestMatch) {
      return { funder: bestMatch, confidence: bestScore, matchType: 'fuzzy' };
    }
    
    return { funder: null, confidence: 0, matchType: null };
  }
  
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

/**
 * Risk assessment engine
 */
export class RiskAssessmentEngine {
  /**
   * Comprehensive risk assessment for a lead
   */
  assessRisk(lead: any): {
    riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    riskScore: number;
    factors: Array<{ factor: string; impact: number; description: string }>;
    mitigations: string[];
  } {
    const factors: Array<{ factor: string; impact: number; description: string }> = [];
    const mitigations: string[] = [];
    let totalRisk = 0;
    
    // Industry risk
    const industryRisk = this.assessIndustryRisk(lead.industry);
    factors.push(industryRisk);
    totalRisk += industryRisk.impact;
    
    // Credit risk
    const creditRisk = this.assessCreditRisk(lead.creditScore);
    factors.push(creditRisk);
    totalRisk += creditRisk.impact;
    
    // UCC stacking risk
    const stackingRisk = this.assessStackingRisk(lead);
    factors.push(stackingRisk);
    totalRisk += stackingRisk.impact;
    
    // Revenue risk
    const revenueRisk = this.assessRevenueRisk(lead.annualRevenue);
    factors.push(revenueRisk);
    totalRisk += revenueRisk.impact;
    
    // Geographic risk
    const geoRisk = this.assessGeographicRisk(lead.state);
    factors.push(geoRisk);
    totalRisk += geoRisk.impact;
    
    // Business age risk
    const ageRisk = this.assessBusinessAgeRisk(lead.yearsInBusiness);
    factors.push(ageRisk);
    totalRisk += ageRisk.impact;
    
    // Generate mitigations
    this.generateMitigations(factors, mitigations);
    
    // Determine risk level
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    if (totalRisk <= 30) {
      riskLevel = 'low';
    } else if (totalRisk <= 60) {
      riskLevel = 'moderate';
    } else if (totalRisk <= 80) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }
    
    return {
      riskLevel,
      riskScore: totalRisk,
      factors,
      mitigations
    };
  }
  
  private assessIndustryRisk(industry?: string): { factor: string; impact: number; description: string } {
    if (!industry) {
      return {
        factor: 'Unknown Industry',
        impact: 15,
        description: 'Industry not specified, unable to assess sector risk'
      };
    }
    
    const normalized = industry.toLowerCase();
    
    // Check high risk industries
    if (INDUSTRY_RISK_PROFILES.highRisk.industries.some(ind => 
      normalized.includes(ind.toLowerCase())
    )) {
      return {
        factor: 'High-Risk Industry',
        impact: 25,
        description: `${industry} is a high-risk sector with elevated default rates`
      };
    }
    
    // Check moderate risk
    if (INDUSTRY_RISK_PROFILES.moderateRisk.industries.some(ind => 
      normalized.includes(ind.toLowerCase())
    )) {
      return {
        factor: 'Moderate-Risk Industry',
        impact: 15,
        description: `${industry} has average risk profile`
      };
    }
    
    // Low risk
    return {
      factor: 'Low-Risk Industry',
      impact: 5,
      description: `${industry} is a stable, low-risk sector`
    };
  }
  
  private assessCreditRisk(creditScore?: string | number): { factor: string; impact: number; description: string } {
    if (!creditScore) {
      return {
        factor: 'Unknown Credit',
        impact: 20,
        description: 'Credit score not provided, unable to assess creditworthiness'
      };
    }
    
    const score = typeof creditScore === 'string' ? parseInt(creditScore, 10) : creditScore;
    
    if (score >= 720) {
      return {
        factor: 'Excellent Credit',
        impact: 5,
        description: `Credit score ${score} indicates very low default risk`
      };
    } else if (score >= 680) {
      return {
        factor: 'Good Credit',
        impact: 10,
        description: `Credit score ${score} indicates low default risk`
      };
    } else if (score >= 620) {
      return {
        factor: 'Fair Credit',
        impact: 20,
        description: `Credit score ${score} indicates moderate default risk`
      };
    } else if (score >= 550) {
      return {
        factor: 'Poor Credit',
        impact: 30,
        description: `Credit score ${score} indicates high default risk`
      };
    } else {
      return {
        factor: 'Very Poor Credit',
        impact: 40,
        description: `Credit score ${score} indicates very high default risk`
      };
    }
  }
  
  private assessStackingRisk(lead: any): { factor: string; impact: number; description: string } {
    const positions = lead.activePositions || lead.currentPositions || 0;
    
    if (positions === 0) {
      return {
        factor: 'Clean UCC',
        impact: 0,
        description: 'No active UCC positions'
      };
    } else if (positions === 1) {
      return {
        factor: 'Single Position',
        impact: 10,
        description: 'One active position, normal risk'
      };
    } else if (positions === 2) {
      return {
        factor: 'Moderate Stacking',
        impact: 25,
        description: `${positions} active positions indicate moderate stacking`
      };
    } else if (positions === 3) {
      return {
        factor: 'High Stacking',
        impact: 35,
        description: `${positions} active positions indicate high stacking risk`
      };
    } else {
      return {
        factor: 'Severe Stacking',
        impact: 45,
        description: `${positions}+ active positions indicate severe over-leveraging`
      };
    }
  }
  
  private assessRevenueRisk(revenue?: string | number): { factor: string; impact: number; description: string } {
    if (!revenue) {
      return {
        factor: 'Unknown Revenue',
        impact: 15,
        description: 'Revenue not specified'
      };
    }
    
    const amount = FIELD_VALIDATORS.currency.normalize(revenue.toString());
    
    if (amount >= 5000000) {
      return {
        factor: 'Strong Revenue',
        impact: 5,
        description: `Revenue of $${amount.toLocaleString()} indicates strong cash flow`
      };
    } else if (amount >= 1000000) {
      return {
        factor: 'Good Revenue',
        impact: 10,
        description: `Revenue of $${amount.toLocaleString()} indicates healthy cash flow`
      };
    } else if (amount >= 500000) {
      return {
        factor: 'Moderate Revenue',
        impact: 15,
        description: `Revenue of $${amount.toLocaleString()} meets most MCA requirements`
      };
    } else if (amount >= 100000) {
      return {
        factor: 'Low Revenue',
        impact: 25,
        description: `Revenue of $${amount.toLocaleString()} limits funding options`
      };
    } else {
      return {
        factor: 'Minimal Revenue',
        impact: 35,
        description: `Revenue below $100k indicates high risk`
      };
    }
  }
  
  private assessGeographicRisk(state?: string): { factor: string; impact: number; description: string } {
    if (!state) {
      return {
        factor: 'Unknown Location',
        impact: 10,
        description: 'State not specified'
      };
    }
    
    const normalized = state.toUpperCase();
    
    if (STATE_RISK_FACTORS.highRisk.states.includes(normalized)) {
      return {
        factor: 'High-Risk State',
        impact: 15,
        description: `${normalized} has challenging business environment`
      };
    } else if (STATE_RISK_FACTORS.lowRisk.states.includes(normalized)) {
      return {
        factor: 'Business-Friendly State',
        impact: 5,
        description: `${normalized} has favorable business climate`
      };
    } else {
      return {
        factor: 'Average State Risk',
        impact: 10,
        description: `${normalized} has typical business environment`
      };
    }
  }
  
  private assessBusinessAgeRisk(yearsInBusiness?: string | number): { factor: string; impact: number; description: string } {
    if (!yearsInBusiness) {
      return {
        factor: 'Unknown Business Age',
        impact: 15,
        description: 'Business age not specified'
      };
    }
    
    let years = 0;
    if (typeof yearsInBusiness === 'number') {
      years = yearsInBusiness;
    } else {
      const match = yearsInBusiness.match(/(\d+)/);
      if (match) {
        years = parseInt(match[1], 10);
        if (yearsInBusiness.toLowerCase().includes('month')) {
          years = years / 12;
        }
      }
    }
    
    if (years >= 5) {
      return {
        factor: 'Established Business',
        impact: 5,
        description: `${years}+ years in business indicates stability`
      };
    } else if (years >= 3) {
      return {
        factor: 'Mature Business',
        impact: 10,
        description: `${years} years in business, proven track record`
      };
    } else if (years >= 2) {
      return {
        factor: 'Growing Business',
        impact: 15,
        description: `${years} years in business meets minimum requirements`
      };
    } else if (years >= 1) {
      return {
        factor: 'Young Business',
        impact: 25,
        description: `Only ${years} year(s) in business increases risk`
      };
    } else {
      return {
        factor: 'Startup',
        impact: 35,
        description: 'Less than 1 year in business, very high risk'
      };
    }
  }
  
  private generateMitigations(
    factors: Array<{ factor: string; impact: number; description: string }>,
    mitigations: string[]
  ): void {
    // Sort factors by impact
    const sortedFactors = [...factors].sort((a, b) => b.impact - a.impact);
    
    // Generate mitigations for top risk factors
    for (const factor of sortedFactors.slice(0, 3)) {
      switch (factor.factor) {
        case 'High-Risk Industry':
          mitigations.push('Request additional documentation and bank statements');
          mitigations.push('Consider shorter terms with more frequent monitoring');
          break;
        
        case 'Poor Credit':
        case 'Very Poor Credit':
          mitigations.push('Require personal guarantee and/or additional collateral');
          mitigations.push('Implement daily ACH payments for better control');
          break;
        
        case 'High Stacking':
        case 'Severe Stacking':
          mitigations.push('Perform thorough UCC search and lien position analysis');
          mitigations.push('Contact existing lenders to understand payment obligations');
          mitigations.push('Consider consolidation offer instead of additional advance');
          break;
        
        case 'Low Revenue':
        case 'Minimal Revenue':
          mitigations.push('Verify revenue with bank statements and tax returns');
          mitigations.push('Set conservative advance amount relative to revenue');
          break;
        
        case 'Young Business':
        case 'Startup':
          mitigations.push('Request personal credit check for all owners');
          mitigations.push('Require higher factor rate to account for risk');
          break;
        
        case 'Unknown Industry':
        case 'Unknown Credit':
        case 'Unknown Revenue':
          mitigations.push('Collect missing information before proceeding');
          mitigations.push('Use data enrichment services to fill gaps');
          break;
      }
    }
    
    // Add general best practices
    if (sortedFactors[0].impact >= 30) {
      mitigations.push('Consider declining or referring to specialized high-risk funder');
    }
  }
}

// Export singleton instances
export const leadQualityScorer = new LeadQualityScorer();
export const funderMatcher = new FunderMatcher();
export const riskAssessmentEngine = new RiskAssessmentEngine();