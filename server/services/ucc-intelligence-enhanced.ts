import OpenAI from "openai";
import type { Lead, UccFiling, InsertUccFiling, InsertUccIntelligence, InsertUccRelationship, UccIntelligence, UccRelationship, UccStateFormat } from "@shared/schema";
import { db } from "../db";
import { leads, uccFilings, uccIntelligence, uccRelationships } from "@shared/schema";
import { eq, and, or, sql, desc, ilike, gte, lte, inArray, between, not } from "drizzle-orm";
import { leadIntelligenceService } from "./lead-intelligence";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

/**
 * Enhanced Business Intelligence from UCC Filings
 */
export interface UccBusinessIntelligence {
  // Debt Analysis
  debtVelocity: {
    filingsPerMonth: number;
    accelerationRate: number; // % increase/decrease in filing rate
    trend: 'accelerating' | 'stable' | 'decelerating';
    riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  };
  
  // Lender Risk Analysis
  lenderConcentration: {
    dominantLender: string | null;
    concentrationScore: number; // 0-100, higher = more concentration risk
    numberOfLenders: number;
    diversificationRating: 'well-diversified' | 'moderate' | 'concentrated' | 'single-source';
    recommendations: string[];
  };
  
  // Collateral Analysis
  collateralQuality: {
    overallScore: number; // 0-100
    liquidityRating: 'highly-liquid' | 'liquid' | 'illiquid' | 'distressed';
    assetTypes: Array<{
      type: string;
      value: number;
      liquidity: number;
      risk: string;
    }>;
    warningFlags: string[];
  };
  
  // Payment Patterns
  paymentBehavior: {
    hasPaymentIssues: boolean;
    refinancingPattern: 'none' | 'normal' | 'concerning' | 'distressed';
    defaultProbability: number; // 0-1
    earlyWarningSignals: string[];
  };
  
  // Business Expansion Indicators
  expansionSignals: {
    isExpanding: boolean;
    expansionType: 'equipment' | 'location' | 'inventory' | 'workforce' | 'mixed' | null;
    confidenceScore: number; // 0-100
    recentInvestments: Array<{
      type: string;
      amount: number;
      date: Date;
      purpose: string;
    }>;
  };
}

/**
 * Industry-Specific Pattern Recognition
 */
export interface IndustryPatterns {
  industry: string;
  subIndustry?: string;
  patterns: {
    typicalFinancingCycle: string;
    seasonalPatterns: boolean;
    averageDebtLoad: number;
    commonCollateral: string[];
    riskFactors: string[];
  };
  insights: {
    businessHealth: 'thriving' | 'growing' | 'stable' | 'struggling' | 'distressed';
    industryPosition: 'leader' | 'average' | 'laggard' | 'at-risk';
    specificSignals: string[];
    recommendations: string[];
  };
}

/**
 * Advanced Pattern Detection Results
 */
export interface AdvancedPatterns {
  // Loan Stacking Detection
  stacking: {
    detected: boolean;
    severity: 'none' | 'mild' | 'moderate' | 'severe' | 'critical';
    mcaCount: number;
    timeWindow: number; // days
    totalExposure: number;
    riskScore: number; // 0-100
    details: string;
  };
  
  // Refinancing Analysis
  refinancing: {
    hasRefinancingChain: boolean;
    chainLength: number;
    pattern: 'healthy' | 'normal' | 'concerning' | 'distressed';
    costMultiplier: number; // vs market rate
    consolidationOpportunity: boolean;
    savingsPotential: number;
  };
  
  // Fraud Detection
  fraudIndicators: {
    suspiciousActivity: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
    patterns: Array<{
      type: string;
      confidence: number;
      description: string;
    }>;
    requiresInvestigation: boolean;
  };
  
  // Business Lifecycle
  lifecycle: {
    stage: 'startup' | 'growth' | 'mature' | 'declining' | 'distressed';
    confidence: number;
    indicators: string[];
    projectedTrajectory: 'improving' | 'stable' | 'deteriorating';
    timeToNextStage: number; // months
  };
  
  // Hidden Relationships
  hiddenRelationships: {
    detected: boolean;
    entities: Array<{
      name: string;
      type: 'shell' | 'subsidiary' | 'affiliate' | 'related';
      confidence: number;
      evidence: string[];
    }>;
    ownershipWeb: Map<string, string[]>;
    riskImplications: string[];
  };
}

/**
 * Predictive Capabilities
 */
export interface PredictiveAnalysis {
  // Default Risk Prediction
  defaultRisk: {
    probability: number; // 0-1
    timeframe: number; // months
    confidence: number; // 0-100
    riskFactors: Array<{
      factor: string;
      weight: number;
      contribution: number;
    }>;
    earlyWarningScore: number; // 0-100
  };
  
  // Next Financing Prediction
  nextFinancing: {
    likelihood: number; // 0-1
    estimatedTimeframe: number; // days
    estimatedAmount: number;
    recommendedProducts: string[];
    triggers: string[];
  };
  
  // Consolidation Analysis
  consolidation: {
    isCandidate: boolean;
    readinessScore: number; // 0-100
    potentialSavings: number;
    currentAPR: number;
    consolidatedAPR: number;
    optimalTiming: Date;
    barriers: string[];
  };
}

/**
 * Enhanced Lead Matching Results
 */
export interface EnhancedMatchingResult {
  leadId: string;
  matchedLeads: Array<{
    leadId: string;
    matchType: 'exact' | 'fuzzy' | 'address' | 'phone' | 'email' | 'owner' | 'related';
    confidence: number; // 0-100
    evidence: string[];
  }>;
  relationships: Array<{
    type: 'owner' | 'subsidiary' | 'partner' | 'supplier' | 'customer';
    strength: number; // 0-100
    bidirectional: boolean;
    description: string;
  }>;
  scoring: {
    relationshipStrength: number; // 0-100
    riskContagion: number; // 0-100
    opportunityScore: number; // 0-100
    crossSellPotential: string[];
    portfolioValue: number;
  };
}

/**
 * Business Intelligence Dashboard Data
 */
export interface UccDashboardData {
  // Executive Summary
  executiveSummary: {
    overallRiskScore: number; // 0-100
    opportunityScore: number; // 0-100
    actionableInsights: Array<{
      priority: 'critical' | 'high' | 'medium' | 'low';
      type: string;
      message: string;
      action: string;
      impact: number;
    }>;
  };
  
  // Debt Timeline
  debtTimeline: Array<{
    date: Date;
    event: string;
    amount: number;
    lender: string;
    type: 'new' | 'renewal' | 'termination' | 'amendment';
    impact: 'positive' | 'neutral' | 'negative';
    description: string;
  }>;
  
  // Lender Network
  lenderNetwork: {
    nodes: Array<{
      id: string;
      type: 'business' | 'lender' | 'guarantor';
      name: string;
      risk: number;
      size: number;
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: string;
      strength: number;
      label: string;
    }>;
  };
  
  // Risk Heat Map
  riskHeatMap: {
    geographic: Map<string, number>; // state/region -> risk score
    temporal: Array<{ period: string; risk: number }>;
    categorical: Map<string, number>; // risk category -> score
  };
  
  // Industry Benchmarking
  industryBenchmark: {
    industryAverage: number;
    percentile: number;
    strengths: string[];
    weaknesses: string[];
    improvementAreas: Array<{
      area: string;
      currentScore: number;
      industryScore: number;
      gap: number;
      recommendation: string;
    }>;
  };
  
  // Actionable Recommendations
  recommendations: Array<{
    id: string;
    category: 'immediate' | 'short-term' | 'long-term';
    action: string;
    rationale: string;
    expectedImpact: string;
    implementation: string[];
    roi: number;
  }>;
}

/**
 * Real-time Monitoring Configuration
 */
export interface MonitoringConfig {
  leadId: string;
  alerts: {
    newFilings: boolean;
    stackingDetection: boolean;
    refinancingActivity: boolean;
    relatedEntities: boolean;
    riskThresholds: {
      critical: number;
      high: number;
      medium: number;
    };
  };
  autoReanalysis: {
    enabled: boolean;
    triggers: string[];
    frequency: 'real-time' | 'hourly' | 'daily' | 'weekly';
  };
  notifications: {
    email: boolean;
    inApp: boolean;
    webhook?: string;
  };
}

/**
 * Enhanced UCC Intelligence Service
 * Advanced business intelligence and pattern recognition from UCC filings
 */
export class EnhancedUccIntelligenceService {
  private readonly INDUSTRY_PATTERNS: Map<string, any> = new Map([
    ['restaurant', {
      equipment: ['kitchen', 'refrigeration', 'pos', 'furniture'],
      seasonality: true,
      typicalDebtMultiple: 0.3, // debt/revenue
      expansionSignals: ['kitchen equipment', 'new location', 'franchise fee'],
      distressSignals: ['inventory financing', 'equipment sale-leaseback']
    }],
    ['trucking', {
      equipment: ['trucks', 'trailers', 'gps', 'maintenance'],
      seasonality: false,
      typicalDebtMultiple: 0.5,
      expansionSignals: ['fleet expansion', 'new routes', 'warehouse'],
      distressSignals: ['equipment refinancing', 'sale of trucks']
    }],
    ['construction', {
      equipment: ['machinery', 'tools', 'vehicles', 'safety'],
      seasonality: true,
      typicalDebtMultiple: 0.4,
      expansionSignals: ['heavy equipment', 'new contracts', 'bonding'],
      distressSignals: ['project financing gaps', 'equipment returns']
    }],
    ['healthcare', {
      equipment: ['medical devices', 'diagnostic', 'furniture', 'it'],
      seasonality: false,
      typicalDebtMultiple: 0.35,
      expansionSignals: ['new equipment', 'practice acquisition', 'expansion'],
      distressSignals: ['receivables financing', 'equipment downgrades']
    }],
    ['retail', {
      equipment: ['inventory', 'fixtures', 'pos', 'security'],
      seasonality: true,
      typicalDebtMultiple: 0.25,
      expansionSignals: ['inventory increase', 'new location', 'renovation'],
      distressSignals: ['inventory liquidation', 'lease buyouts']
    }]
  ]);

  /**
   * Perform comprehensive UCC analysis with enhanced intelligence
   */
  async analyzeUccFilings(
    leadId: string,
    filings: UccFiling[]
  ): Promise<{
    businessIntelligence: UccBusinessIntelligence;
    industryPatterns: IndustryPatterns;
    advancedPatterns: AdvancedPatterns;
    predictiveAnalysis: PredictiveAnalysis;
    dashboardData: UccDashboardData;
    confidence: number;
  }> {
    // Fetch lead data for context
    const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!lead[0]) throw new Error('Lead not found');
    
    // Perform parallel analysis
    const [
      businessIntelligence,
      industryPatterns,
      advancedPatterns,
      predictiveAnalysis
    ] = await Promise.all([
      this.analyzeBusinessIntelligence(filings, lead[0]),
      this.analyzeIndustryPatterns(filings, lead[0]),
      this.detectAdvancedPatterns(filings, lead[0]),
      this.generatePredictiveAnalysis(filings, lead[0])
    ]);
    
    // Generate dashboard data
    const dashboardData = this.generateDashboardData(
      lead[0],
      filings,
      businessIntelligence,
      industryPatterns,
      advancedPatterns,
      predictiveAnalysis
    );
    
    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(
      businessIntelligence,
      industryPatterns,
      advancedPatterns,
      predictiveAnalysis
    );
    
    // Save analysis to database
    await this.saveEnhancedAnalysis(leadId, {
      businessIntelligence,
      industryPatterns,
      advancedPatterns,
      predictiveAnalysis,
      dashboardData,
      confidence
    });
    
    // Update lead intelligence score
    await this.updateLeadIntelligence(leadId, {
      businessIntelligence,
      advancedPatterns,
      predictiveAnalysis
    });
    
    return {
      businessIntelligence,
      industryPatterns,
      advancedPatterns,
      predictiveAnalysis,
      dashboardData,
      confidence
    };
  }

  /**
   * Analyze business intelligence from filings
   */
  private async analyzeBusinessIntelligence(
    filings: UccFiling[],
    lead: Lead
  ): Promise<UccBusinessIntelligence> {
    // Sort filings by date
    const sortedFilings = [...filings].sort((a, b) => 
      new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime()
    );
    
    // Calculate debt velocity
    const debtVelocity = this.calculateDebtVelocity(sortedFilings);
    
    // Analyze lender concentration
    const lenderConcentration = this.analyzeLenderConcentration(sortedFilings);
    
    // Score collateral quality
    const collateralQuality = await this.scoreCollateralQuality(sortedFilings);
    
    // Detect payment patterns
    const paymentBehavior = this.detectPaymentPatterns(sortedFilings);
    
    // Identify expansion signals
    const expansionSignals = this.identifyExpansionSignals(sortedFilings, lead);
    
    return {
      debtVelocity,
      lenderConcentration,
      collateralQuality,
      paymentBehavior,
      expansionSignals
    };
  }

  /**
   * Calculate debt accumulation velocity
   */
  private calculateDebtVelocity(filings: UccFiling[]): UccBusinessIntelligence['debtVelocity'] {
    if (filings.length === 0) {
      return {
        filingsPerMonth: 0,
        accelerationRate: 0,
        trend: 'stable',
        riskLevel: 'low'
      };
    }
    
    // Group filings by month
    const filingsByMonth = new Map<string, number>();
    const amountsByMonth = new Map<string, number>();
    
    filings.forEach(filing => {
      const date = new Date(filing.filingDate);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      filingsByMonth.set(monthKey, (filingsByMonth.get(monthKey) || 0) + 1);
      if (filing.loanAmount) {
        amountsByMonth.set(monthKey, (amountsByMonth.get(monthKey) || 0) + filing.loanAmount);
      }
    });
    
    // Calculate average filings per month
    const months = Array.from(filingsByMonth.keys());
    const totalMonths = months.length;
    const totalFilings = filings.length;
    const filingsPerMonth = totalFilings / totalMonths;
    
    // Calculate acceleration (compare recent 3 months to previous 3 months)
    const recentMonths = months.slice(-3);
    const previousMonths = months.slice(-6, -3);
    
    const recentAvg = recentMonths.reduce((sum, month) => 
      sum + (filingsByMonth.get(month) || 0), 0) / Math.max(recentMonths.length, 1);
    const previousAvg = previousMonths.reduce((sum, month) => 
      sum + (filingsByMonth.get(month) || 0), 0) / Math.max(previousMonths.length, 1);
    
    const accelerationRate = previousAvg > 0 
      ? ((recentAvg - previousAvg) / previousAvg) * 100 
      : 0;
    
    // Determine trend and risk
    let trend: 'accelerating' | 'stable' | 'decelerating';
    let riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    
    if (accelerationRate > 50) {
      trend = 'accelerating';
      riskLevel = filingsPerMonth > 2 ? 'critical' : 'high';
    } else if (accelerationRate > 20) {
      trend = 'accelerating';
      riskLevel = filingsPerMonth > 1.5 ? 'high' : 'moderate';
    } else if (accelerationRate < -20) {
      trend = 'decelerating';
      riskLevel = 'low';
    } else {
      trend = 'stable';
      riskLevel = filingsPerMonth > 1 ? 'moderate' : 'low';
    }
    
    // Check for stacking pattern (multiple filings in 30 days)
    const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > last30Days
    ).length;
    
    if (recentFilings >= 4) {
      riskLevel = 'critical';
      trend = 'accelerating';
    } else if (recentFilings >= 3) {
      riskLevel = 'high';
    }
    
    return {
      filingsPerMonth,
      accelerationRate,
      trend,
      riskLevel
    };
  }

  /**
   * Analyze lender concentration risk
   */
  private analyzeLenderConcentration(
    filings: UccFiling[]
  ): UccBusinessIntelligence['lenderConcentration'] {
    // Count filings and amounts by lender
    const lenderStats = new Map<string, { count: number; amount: number }>();
    let totalAmount = 0;
    
    filings.forEach(filing => {
      const lender = filing.securedParty;
      const stats = lenderStats.get(lender) || { count: 0, amount: 0 };
      stats.count++;
      stats.amount += filing.loanAmount || 0;
      lenderStats.set(lender, stats);
      totalAmount += filing.loanAmount || 0;
    });
    
    const numberOfLenders = lenderStats.size;
    
    // Find dominant lender
    let dominantLender: string | null = null;
    let maxAmount = 0;
    
    lenderStats.forEach((stats, lender) => {
      if (stats.amount > maxAmount) {
        maxAmount = stats.amount;
        dominantLender = lender;
      }
    });
    
    // Calculate concentration score (Herfindahl index)
    let concentrationScore = 0;
    if (totalAmount > 0) {
      lenderStats.forEach(stats => {
        const marketShare = stats.amount / totalAmount;
        concentrationScore += marketShare * marketShare * 100;
      });
    }
    
    // Determine diversification rating
    let diversificationRating: 'well-diversified' | 'moderate' | 'concentrated' | 'single-source';
    if (numberOfLenders === 1) {
      diversificationRating = 'single-source';
    } else if (concentrationScore > 60) {
      diversificationRating = 'concentrated';
    } else if (concentrationScore > 30) {
      diversificationRating = 'moderate';
    } else {
      diversificationRating = 'well-diversified';
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    if (diversificationRating === 'single-source') {
      recommendations.push('Critical: Diversify funding sources immediately to reduce dependency risk');
    } else if (diversificationRating === 'concentrated') {
      recommendations.push('Consider adding 1-2 additional lenders to improve negotiating position');
    }
    
    if (numberOfLenders > 5) {
      recommendations.push('Consider consolidating debt to reduce management complexity');
    }
    
    return {
      dominantLender,
      concentrationScore,
      numberOfLenders,
      diversificationRating,
      recommendations
    };
  }

  /**
   * Score collateral quality using AI
   */
  private async scoreCollateralQuality(
    filings: UccFiling[]
  ): Promise<UccBusinessIntelligence['collateralQuality']> {
    // Extract unique collateral descriptions
    const collateralDescriptions = filings
      .map(f => f.collateralDescription)
      .filter(desc => desc && desc.length > 0);
    
    if (collateralDescriptions.length === 0) {
      return {
        overallScore: 50,
        liquidityRating: 'illiquid',
        assetTypes: [],
        warningFlags: ['No collateral information available']
      };
    }
    
    // Use AI to analyze collateral
    try {
      const prompt = `Analyze the following UCC collateral descriptions and provide a quality assessment:

Collateral Descriptions:
${collateralDescriptions.slice(0, 10).join('\n')}

Provide a JSON response with:
1. overallScore: 0-100 quality score
2. liquidityRating: 'highly-liquid', 'liquid', 'illiquid', or 'distressed'
3. assetTypes: Array of {type, estimatedValue, liquidity (0-100), risk}
4. warningFlags: Array of concerning patterns

Consider:
- Asset liquidity and marketability
- Depreciation rates
- Specialization vs general use
- Market demand
- Recovery rates in default`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      
      const analysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        overallScore: analysis.overallScore || 50,
        liquidityRating: analysis.liquidityRating || 'illiquid',
        assetTypes: analysis.assetTypes || [],
        warningFlags: analysis.warningFlags || []
      };
    } catch (error) {
      console.error('[UCC] Error analyzing collateral quality:', error);
      
      // Fallback analysis
      const hasEquipment = collateralDescriptions.some(d => 
        d && d.toLowerCase().includes('equipment') || 
        d && d.toLowerCase().includes('machinery')
      );
      const hasInventory = collateralDescriptions.some(d => 
        d && d.toLowerCase().includes('inventory')
      );
      const hasReceivables = collateralDescriptions.some(d => 
        d && d.toLowerCase().includes('receivable') || 
        d && d.toLowerCase().includes('account')
      );
      
      return {
        overallScore: hasEquipment ? 60 : hasInventory ? 50 : hasReceivables ? 40 : 30,
        liquidityRating: hasReceivables ? 'liquid' : hasInventory ? 'liquid' : 'illiquid',
        assetTypes: [
          ...(hasEquipment ? [{type: 'Equipment', value: 0, liquidity: 60, risk: 'moderate'}] : []),
          ...(hasInventory ? [{type: 'Inventory', value: 0, liquidity: 70, risk: 'moderate'}] : []),
          ...(hasReceivables ? [{type: 'Receivables', value: 0, liquidity: 80, risk: 'low'}] : [])
        ],
        warningFlags: []
      };
    }
  }

  /**
   * Detect payment patterns and issues
   */
  private detectPaymentPatterns(
    filings: UccFiling[]
  ): UccBusinessIntelligence['paymentBehavior'] {
    // Look for refinancing patterns
    const refinancingKeywords = ['refinance', 'consolidate', 'restructure', 'modify'];
    const hasRefinancing = filings.some(f => 
      f.collateralDescription && 
      refinancingKeywords.some(keyword => 
        f.collateralDescription!.toLowerCase().includes(keyword)
      )
    );
    
    // Look for amendments and terminations
    const amendments = filings.filter(f => f.filingType === 'amendment');
    const terminations = filings.filter(f => f.filingType === 'termination');
    const continuations = filings.filter(f => f.filingType === 'continuation');
    
    // Calculate refinancing pattern
    let refinancingPattern: 'none' | 'normal' | 'concerning' | 'distressed' = 'none';
    let defaultProbability = 0.1; // Base 10%
    const earlyWarningSignals: string[] = [];
    
    // Check filing velocity in last 90 days
    const last90Days = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > last90Days
    );
    
    if (recentFilings.length >= 5) {
      refinancingPattern = 'distressed';
      defaultProbability += 0.4;
      earlyWarningSignals.push('Excessive financing activity in last 90 days');
    } else if (recentFilings.length >= 3) {
      refinancingPattern = 'concerning';
      defaultProbability += 0.2;
      earlyWarningSignals.push('High financing activity suggests cash flow stress');
    } else if (hasRefinancing) {
      refinancingPattern = 'normal';
      defaultProbability += 0.1;
    }
    
    // Check for stacking (multiple lenders in short period)
    const lendersLast60Days = new Set(
      filings
        .filter(f => new Date(f.filingDate).getTime() > Date.now() - 60 * 24 * 60 * 60 * 1000)
        .map(f => f.securedParty)
    ).size;
    
    if (lendersLast60Days >= 3) {
      defaultProbability += 0.3;
      earlyWarningSignals.push(`Loan stacking detected: ${lendersLast60Days} lenders in 60 days`);
    }
    
    // Check amendment ratio
    const amendmentRatio = amendments.length / Math.max(filings.length, 1);
    if (amendmentRatio > 0.3) {
      defaultProbability += 0.15;
      earlyWarningSignals.push('High amendment rate suggests payment negotiations');
    }
    
    // Cap probability at 0.9
    defaultProbability = Math.min(defaultProbability, 0.9);
    
    return {
      hasPaymentIssues: refinancingPattern === 'concerning' || refinancingPattern === 'distressed',
      refinancingPattern,
      defaultProbability,
      earlyWarningSignals
    };
  }

  /**
   * Identify business expansion signals
   */
  private identifyExpansionSignals(
    filings: UccFiling[],
    lead: Lead
  ): UccBusinessIntelligence['expansionSignals'] {
    const recentInvestments: Array<{
      type: string;
      amount: number;
      date: Date;
      purpose: string;
    }> = [];
    
    // Look for equipment purchases
    const equipmentKeywords = ['equipment', 'machinery', 'vehicle', 'truck', 'tool'];
    const expansionKeywords = ['new', 'additional', 'expansion', 'upgrade', 'purchase'];
    
    let isExpanding = false;
    let expansionType: 'equipment' | 'location' | 'inventory' | 'workforce' | 'mixed' | null = null;
    let confidenceScore = 0;
    
    filings.forEach(filing => {
      const desc = filing.collateralDescription?.toLowerCase() || '';
      
      const hasEquipment = equipmentKeywords.some(kw => desc.includes(kw));
      const hasExpansion = expansionKeywords.some(kw => desc.includes(kw));
      
      if (hasEquipment && hasExpansion) {
        isExpanding = true;
        expansionType = 'equipment';
        confidenceScore += 20;
        
        if (filing.loanAmount) {
          recentInvestments.push({
            type: 'Equipment',
            amount: filing.loanAmount / 100,
            date: new Date(filing.filingDate),
            purpose: 'Business expansion'
          });
        }
      }
      
      // Check for inventory expansion
      if (desc.includes('inventory') && desc.includes('increase')) {
        isExpanding = true;
        expansionType = expansionType === 'equipment' ? 'mixed' : 'inventory';
        confidenceScore += 15;
      }
      
      // Check for location expansion
      if (desc.includes('lease') || desc.includes('location') || desc.includes('property')) {
        if (expansionKeywords.some(kw => desc.includes(kw))) {
          isExpanding = true;
          expansionType = expansionType ? 'mixed' : 'location';
          confidenceScore += 25;
        }
      }
    });
    
    // Industry-specific checks
    if (lead.industry) {
      const industryPattern = this.INDUSTRY_PATTERNS.get(lead.industry.toLowerCase());
      if (industryPattern) {
        filings.forEach(filing => {
          const desc = filing.collateralDescription?.toLowerCase() || '';
          industryPattern.expansionSignals.forEach((signal: string) => {
            if (desc.includes(signal.toLowerCase())) {
              isExpanding = true;
              confidenceScore += 10;
            }
          });
        });
      }
    }
    
    // Cap confidence at 100
    confidenceScore = Math.min(confidenceScore, 100);
    
    return {
      isExpanding,
      expansionType,
      confidenceScore,
      recentInvestments
    };
  }

  /**
   * Analyze industry-specific patterns
   */
  private async analyzeIndustryPatterns(
    filings: UccFiling[],
    lead: Lead
  ): Promise<IndustryPatterns> {
    const industry = lead.industry?.toLowerCase() || 'general';
    const pattern = this.INDUSTRY_PATTERNS.get(industry) || {
      equipment: [],
      seasonality: false,
      typicalDebtMultiple: 0.3,
      expansionSignals: [],
      distressSignals: []
    };
    
    // Calculate business health based on patterns
    let healthScore = 50; // Start neutral
    const specificSignals: string[] = [];
    const recommendations: string[] = [];
    
    // Check for expansion signals
    pattern.expansionSignals.forEach((signal: string) => {
      if (filings.some(f => f.collateralDescription?.toLowerCase().includes(signal))) {
        healthScore += 10;
        specificSignals.push(`Expansion indicator: ${signal}`);
      }
    });
    
    // Check for distress signals
    pattern.distressSignals.forEach((signal: string) => {
      if (filings.some(f => f.collateralDescription?.toLowerCase().includes(signal))) {
        healthScore -= 15;
        specificSignals.push(`Warning signal: ${signal}`);
      }
    });
    
    // Calculate debt load vs industry typical
    const totalDebt = filings.reduce((sum, f) => sum + (f.loanAmount || 0), 0) / 100;
    const estimatedRevenue = parseInt(lead.annualRevenue || '0');
    const debtRatio = estimatedRevenue > 0 ? totalDebt / estimatedRevenue : 0;
    const industryRatio = pattern.typicalDebtMultiple;
    
    let industryPosition: 'leader' | 'average' | 'laggard' | 'at-risk' = 'average';
    if (debtRatio < industryRatio * 0.5) {
      industryPosition = 'leader';
      healthScore += 20;
      recommendations.push('Strong position for growth financing');
    } else if (debtRatio < industryRatio * 1.5) {
      industryPosition = 'average';
    } else if (debtRatio < industryRatio * 2) {
      industryPosition = 'laggard';
      healthScore -= 10;
      recommendations.push('Consider debt consolidation');
    } else {
      industryPosition = 'at-risk';
      healthScore -= 30;
      recommendations.push('Urgent: Restructure debt to avoid default');
    }
    
    // Determine business health
    let businessHealth: 'thriving' | 'growing' | 'stable' | 'struggling' | 'distressed';
    if (healthScore >= 80) businessHealth = 'thriving';
    else if (healthScore >= 65) businessHealth = 'growing';
    else if (healthScore >= 45) businessHealth = 'stable';
    else if (healthScore >= 25) businessHealth = 'struggling';
    else businessHealth = 'distressed';
    
    return {
      industry,
      patterns: {
        typicalFinancingCycle: pattern.seasonality ? 'seasonal' : 'continuous',
        seasonalPatterns: pattern.seasonality,
        averageDebtLoad: totalDebt,
        commonCollateral: pattern.equipment,
        riskFactors: pattern.distressSignals
      },
      insights: {
        businessHealth,
        industryPosition,
        specificSignals,
        recommendations
      }
    };
  }

  /**
   * Detect advanced patterns using AI
   */
  private async detectAdvancedPatterns(
    filings: UccFiling[],
    lead: Lead
  ): Promise<AdvancedPatterns> {
    const [stacking, refinancing, fraudIndicators, lifecycle, hiddenRelationships] = await Promise.all([
      this.detectStackingPattern(filings),
      this.analyzeRefinancingChain(filings),
      this.detectFraudPatterns(filings),
      this.inferBusinessLifecycle(filings, lead),
      this.detectHiddenRelationships(filings, lead)
    ]);
    
    return {
      stacking,
      refinancing,
      fraudIndicators,
      lifecycle,
      hiddenRelationships
    };
  }

  /**
   * Detect loan stacking patterns
   */
  private async detectStackingPattern(
    filings: UccFiling[]
  ): Promise<AdvancedPatterns['stacking']> {
    // Group filings by time windows
    const windows = [7, 14, 30, 60, 90]; // days
    let stackingDetected = false;
    let severity: 'none' | 'mild' | 'moderate' | 'severe' | 'critical' = 'none';
    let mcaCount = 0;
    let timeWindow = 0;
    let totalExposure = 0;
    
    for (const window of windows) {
      const cutoff = Date.now() - window * 24 * 60 * 60 * 1000;
      const recentFilings = filings.filter(f => 
        new Date(f.filingDate).getTime() > cutoff
      );
      
      // Count unique lenders (MCAs)
      const uniqueLenders = new Set(recentFilings.map(f => f.securedParty)).size;
      const totalAmount = recentFilings.reduce((sum, f) => sum + (f.loanAmount || 0), 0);
      
      if (uniqueLenders >= 2) {
        stackingDetected = true;
        mcaCount = uniqueLenders;
        timeWindow = window;
        totalExposure = totalAmount / 100;
        
        // Determine severity
        if (uniqueLenders >= 5 && window <= 30) severity = 'critical';
        else if (uniqueLenders >= 4 && window <= 30) severity = 'severe';
        else if (uniqueLenders >= 3 && window <= 30) severity = 'moderate';
        else if (uniqueLenders >= 2 && window <= 14) severity = 'moderate';
        else severity = 'mild';
        
        break; // Use the smallest window that shows stacking
      }
    }
    
    // Calculate risk score
    let riskScore = 0;
    if (stackingDetected) {
      riskScore = Math.min(100, (mcaCount * 20) + (60 - timeWindow) + (totalExposure / 10000));
    }
    
    const details = stackingDetected
      ? `${mcaCount} different lenders in ${timeWindow} days with total exposure of $${totalExposure.toLocaleString()}`
      : 'No stacking pattern detected';
    
    return {
      detected: stackingDetected,
      severity,
      mcaCount,
      timeWindow,
      totalExposure,
      riskScore,
      details
    };
  }

  /**
   * Analyze refinancing chains
   */
  private async analyzeRefinancingChain(
    filings: UccFiling[]
  ): Promise<AdvancedPatterns['refinancing']> {
    // Look for refinancing patterns
    const refinancingFilings = filings.filter(f => 
      f.collateralDescription?.toLowerCase().includes('refinanc') ||
      f.filingType === 'amendment'
    );
    
    const hasRefinancingChain = refinancingFilings.length > 0;
    const chainLength = refinancingFilings.length;
    
    // Calculate cost multiplier (estimate based on frequency)
    let costMultiplier = 1.0;
    if (chainLength > 3) costMultiplier = 2.5;
    else if (chainLength > 2) costMultiplier = 2.0;
    else if (chainLength > 1) costMultiplier = 1.5;
    
    // Determine pattern
    let pattern: 'healthy' | 'normal' | 'concerning' | 'distressed' = 'healthy';
    if (chainLength >= 4) pattern = 'distressed';
    else if (chainLength >= 3) pattern = 'concerning';
    else if (chainLength >= 1) pattern = 'normal';
    
    // Calculate consolidation opportunity
    const uniqueLenders = new Set(filings.map(f => f.securedParty)).size;
    const consolidationOpportunity = uniqueLenders > 2 && costMultiplier > 1.5;
    
    // Estimate savings potential
    const totalDebt = filings.reduce((sum, f) => sum + (f.loanAmount || 0), 0) / 100;
    const savingsPotential = consolidationOpportunity 
      ? totalDebt * (costMultiplier - 1.2) / costMultiplier 
      : 0;
    
    return {
      hasRefinancingChain,
      chainLength,
      pattern,
      costMultiplier,
      consolidationOpportunity,
      savingsPotential
    };
  }

  /**
   * Detect potential fraud patterns
   */
  private async detectFraudPatterns(
    filings: UccFiling[]
  ): Promise<AdvancedPatterns['fraudIndicators']> {
    const patterns: Array<{
      type: string;
      confidence: number;
      description: string;
    }> = [];
    
    // Check for same-day multiple lender filings
    const filingsByDate = new Map<string, UccFiling[]>();
    filings.forEach(f => {
      const dateKey = new Date(f.filingDate).toDateString();
      const dateFilings = filingsByDate.get(dateKey) || [];
      dateFilings.push(f);
      filingsByDate.set(dateKey, dateFilings);
    });
    
    filingsByDate.forEach((dateFilings, date) => {
      const uniqueLenders = new Set(dateFilings.map(f => f.securedParty)).size;
      if (uniqueLenders > 2) {
        patterns.push({
          type: 'same-day-multiple',
          confidence: 85,
          description: `${uniqueLenders} different lenders filed on ${date}`
        });
      }
    });
    
    // Check for circular financing
    const lenderDebtorPairs = new Map<string, Set<string>>();
    filings.forEach(f => {
      const lenderDebtors = lenderDebtorPairs.get(f.securedParty) || new Set();
      lenderDebtors.add(f.debtorName);
      lenderDebtorPairs.set(f.securedParty, lenderDebtors);
    });
    
    // Check for rapid succession filings
    for (let i = 1; i < filings.length; i++) {
      const daysDiff = Math.abs(
        new Date(filings[i].filingDate).getTime() - 
        new Date(filings[i-1].filingDate).getTime()
      ) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 3 && filings[i].securedParty !== filings[i-1].securedParty) {
        patterns.push({
          type: 'rapid-succession',
          confidence: 70,
          description: `Multiple lenders within ${Math.round(daysDiff)} days`
        });
        break;
      }
    }
    
    // Determine overall risk level
    let riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';
    if (patterns.length === 0) riskLevel = 'none';
    else if (patterns.some(p => p.confidence > 90)) riskLevel = 'critical';
    else if (patterns.some(p => p.confidence > 80)) riskLevel = 'high';
    else if (patterns.some(p => p.confidence > 60)) riskLevel = 'medium';
    else riskLevel = 'low';
    
    return {
      suspiciousActivity: patterns.length > 0,
      riskLevel,
      patterns,
      requiresInvestigation: riskLevel === 'high' || riskLevel === 'critical'
    };
  }

  /**
   * Infer business lifecycle stage
   */
  private async inferBusinessLifecycle(
    filings: UccFiling[],
    lead: Lead
  ): Promise<AdvancedPatterns['lifecycle']> {
    const indicators: string[] = [];
    let stage: 'startup' | 'growth' | 'mature' | 'declining' | 'distressed' = 'mature';
    let confidence = 60;
    
    // Age of business
    const yearsInBusiness = parseInt(lead.timeInBusiness || '0');
    if (yearsInBusiness < 2) {
      stage = 'startup';
      indicators.push('Business less than 2 years old');
      confidence += 20;
    } else if (yearsInBusiness < 5) {
      stage = 'growth';
      indicators.push('Business in growth phase (2-5 years)');
      confidence += 15;
    }
    
    // Financing patterns
    const sortedFilings = [...filings].sort((a, b) => 
      new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime()
    );
    
    // Calculate financing velocity trend
    const firstHalf = sortedFilings.slice(0, Math.floor(sortedFilings.length / 2));
    const secondHalf = sortedFilings.slice(Math.floor(sortedFilings.length / 2));
    
    const firstHalfAvgAmount = firstHalf.reduce((sum, f) => sum + (f.loanAmount || 0), 0) / Math.max(firstHalf.length, 1);
    const secondHalfAvgAmount = secondHalf.reduce((sum, f) => sum + (f.loanAmount || 0), 0) / Math.max(secondHalf.length, 1);
    
    let projectedTrajectory: 'improving' | 'stable' | 'deteriorating' = 'stable';
    
    if (secondHalfAvgAmount > firstHalfAvgAmount * 1.5) {
      if (stage !== 'startup') stage = 'growth';
      projectedTrajectory = 'improving';
      indicators.push('Increasing financing amounts suggest expansion');
      confidence += 10;
    } else if (secondHalfAvgAmount < firstHalfAvgAmount * 0.7) {
      if (stage !== 'startup') stage = 'declining';
      projectedTrajectory = 'deteriorating';
      indicators.push('Decreasing financing amounts suggest contraction');
      confidence += 10;
    }
    
    // Check for distress signals
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > Date.now() - 90 * 24 * 60 * 60 * 1000
    );
    
    if (recentFilings.length >= 4) {
      stage = 'distressed';
      projectedTrajectory = 'deteriorating';
      indicators.push('High recent financing activity indicates distress');
      confidence += 15;
    }
    
    // Estimate time to next stage
    let timeToNextStage = 12; // months
    if (stage === 'startup') timeToNextStage = 18;
    else if (stage === 'growth') timeToNextStage = 24;
    else if (stage === 'distressed') timeToNextStage = 3;
    
    return {
      stage,
      confidence: Math.min(confidence, 100),
      indicators,
      projectedTrajectory,
      timeToNextStage
    };
  }

  /**
   * Detect hidden relationships between entities
   */
  private async detectHiddenRelationships(
    filings: UccFiling[],
    lead: Lead
  ): Promise<AdvancedPatterns['hiddenRelationships']> {
    const entities: Array<{
      name: string;
      type: 'shell' | 'subsidiary' | 'affiliate' | 'related';
      confidence: number;
      evidence: string[];
    }> = [];
    
    const ownershipWeb = new Map<string, string[]>();
    const riskImplications: string[] = [];
    
    // Look for similar business names
    const businessName = lead.businessName.toLowerCase();
    const nameVariations = this.generateNameVariations(businessName);
    
    // Check other leads for related businesses
    const relatedLeads = await db.select()
      .from(leads)
      .where(
        and(
          not(eq(leads.id, lead.id)),
          or(
            ...nameVariations.map(variation => 
              ilike(leads.businessName, `%${variation}%`)
            )
          )
        )
      )
      .limit(10);
    
    relatedLeads.forEach(relatedLead => {
      const similarity = this.calculateNameSimilarity(businessName, relatedLead.businessName.toLowerCase());
      if (similarity > 0.7) {
        entities.push({
          name: relatedLead.businessName,
          type: similarity > 0.9 ? 'subsidiary' : 'affiliate',
          confidence: similarity * 100,
          evidence: [`Name similarity: ${(similarity * 100).toFixed(0)}%`]
        });
        
        // Add to ownership web
        const connections = ownershipWeb.get(lead.businessName) || [];
        connections.push(relatedLead.businessName);
        ownershipWeb.set(lead.businessName, connections);
      }
    });
    
    // Check for shared addresses or phone numbers
    if (lead.phone) {
      const phoneMatches = await db.select()
        .from(leads)
        .where(
          and(
            not(eq(leads.id, lead.id)),
            eq(leads.phone, lead.phone)
          )
        )
        .limit(5);
      
      phoneMatches.forEach(match => {
        if (!entities.some(e => e.name === match.businessName)) {
          entities.push({
            name: match.businessName,
            type: 'related',
            confidence: 90,
            evidence: ['Shared phone number']
          });
        }
      });
    }
    
    // Risk implications
    if (entities.length > 0) {
      riskImplications.push(`Connected to ${entities.length} related entities`);
      
      if (entities.some(e => e.type === 'shell')) {
        riskImplications.push('Possible shell company structure detected');
      }
      
      if (entities.length > 3) {
        riskImplications.push('Complex corporate structure may indicate risk layering');
      }
    }
    
    return {
      detected: entities.length > 0,
      entities,
      ownershipWeb,
      riskImplications
    };
  }

  /**
   * Generate predictive analysis
   */
  private async generatePredictiveAnalysis(
    filings: UccFiling[],
    lead: Lead
  ): Promise<PredictiveAnalysis> {
    const [defaultRisk, nextFinancing, consolidation] = await Promise.all([
      this.predictDefaultRisk(filings, lead),
      this.predictNextFinancing(filings, lead),
      this.analyzeConsolidationOpportunity(filings, lead)
    ]);
    
    return {
      defaultRisk,
      nextFinancing,
      consolidation
    };
  }

  /**
   * Predict default risk
   */
  private async predictDefaultRisk(
    filings: UccFiling[],
    lead: Lead
  ): Promise<PredictiveAnalysis['defaultRisk']> {
    const riskFactors: Array<{
      factor: string;
      weight: number;
      contribution: number;
    }> = [];
    
    let baseProbability = 0.1; // 10% base rate
    
    // Factor 1: Debt velocity (30% weight)
    const last90Days = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > last90Days
    ).length;
    
    const velocityContribution = Math.min(0.3, recentFilings * 0.06);
    baseProbability += velocityContribution;
    riskFactors.push({
      factor: 'Debt Velocity',
      weight: 0.3,
      contribution: velocityContribution
    });
    
    // Factor 2: Lender diversity (20% weight)
    const uniqueLenders = new Set(filings.map(f => f.securedParty)).size;
    const diversityContribution = uniqueLenders > 3 ? 0.15 : uniqueLenders > 1 ? 0.05 : 0;
    baseProbability += diversityContribution;
    riskFactors.push({
      factor: 'Multiple Lenders',
      weight: 0.2,
      contribution: diversityContribution
    });
    
    // Factor 3: Credit score (25% weight)
    const creditScore = parseInt(lead.creditScore || '0');
    let creditContribution = 0;
    if (creditScore < 550) creditContribution = 0.25;
    else if (creditScore < 600) creditContribution = 0.15;
    else if (creditScore < 650) creditContribution = 0.05;
    baseProbability += creditContribution;
    riskFactors.push({
      factor: 'Credit Score',
      weight: 0.25,
      contribution: creditContribution
    });
    
    // Factor 4: Industry risk (15% weight)
    const industryRisk = this.getIndustryRiskFactor(lead.industry || '');
    baseProbability += industryRisk * 0.15;
    riskFactors.push({
      factor: 'Industry Risk',
      weight: 0.15,
      contribution: industryRisk * 0.15
    });
    
    // Factor 5: Time in business (10% weight)
    const yearsInBusiness = parseInt(lead.timeInBusiness || '0');
    const maturityContribution = yearsInBusiness < 2 ? 0.1 : yearsInBusiness < 5 ? 0.05 : 0;
    baseProbability += maturityContribution;
    riskFactors.push({
      factor: 'Business Maturity',
      weight: 0.1,
      contribution: maturityContribution
    });
    
    // Calculate timeframe (higher risk = shorter timeframe)
    const timeframe = baseProbability > 0.7 ? 3 : baseProbability > 0.5 ? 6 : baseProbability > 0.3 ? 12 : 24;
    
    // Calculate early warning score
    const earlyWarningScore = Math.min(100, baseProbability * 120);
    
    // Confidence based on data completeness
    const confidence = filings.length > 0 ? Math.min(95, 50 + filings.length * 5) : 30;
    
    return {
      probability: Math.min(0.95, baseProbability),
      timeframe,
      confidence,
      riskFactors,
      earlyWarningScore
    };
  }

  /**
   * Predict next financing need
   */
  private async predictNextFinancing(
    filings: UccFiling[],
    lead: Lead
  ): Promise<PredictiveAnalysis['nextFinancing']> {
    // Calculate average time between filings
    if (filings.length < 2) {
      return {
        likelihood: 0.3,
        estimatedTimeframe: 180,
        estimatedAmount: parseInt(lead.requestedAmount || '50000'),
        recommendedProducts: ['Term loan', 'Line of credit'],
        triggers: ['Seasonal cash flow needs']
      };
    }
    
    const sortedFilings = [...filings].sort((a, b) => 
      new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime()
    );
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < sortedFilings.length; i++) {
      const days = Math.round(
        (new Date(sortedFilings[i].filingDate).getTime() - 
         new Date(sortedFilings[i-1].filingDate).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }
    
    const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
    const lastFiling = sortedFilings[sortedFilings.length - 1];
    const daysSinceLastFiling = Math.round(
      (Date.now() - new Date(lastFiling.filingDate).getTime()) / 
      (1000 * 60 * 60 * 24)
    );
    
    // Predict timeframe
    const estimatedTimeframe = Math.max(7, avgInterval - daysSinceLastFiling);
    
    // Calculate likelihood based on pattern
    let likelihood = 0.5;
    if (daysSinceLastFiling > avgInterval * 0.8) likelihood = 0.8;
    else if (daysSinceLastFiling > avgInterval * 0.5) likelihood = 0.6;
    
    // Estimate amount based on trend
    const amounts = filings.map(f => f.loanAmount || 0).filter(a => a > 0);
    const avgAmount = amounts.length > 0 
      ? amounts.reduce((sum, a) => sum + a, 0) / amounts.length 
      : 50000 * 100;
    const trend = amounts.length > 1 
      ? (amounts[amounts.length - 1] - amounts[0]) / amounts[0] 
      : 0;
    const estimatedAmount = Math.round((avgAmount * (1 + trend * 0.2)) / 100);
    
    // Recommend products based on pattern
    const recommendedProducts: string[] = [];
    if (intervals.some(i => i < 30)) {
      recommendedProducts.push('Debt consolidation loan');
    }
    if (lead.industry?.toLowerCase().includes('retail') || lead.industry?.toLowerCase().includes('restaurant')) {
      recommendedProducts.push('Revenue-based financing');
    }
    recommendedProducts.push('Term loan', 'Line of credit');
    
    // Identify triggers
    const triggers: string[] = [];
    if (lead.industry && this.INDUSTRY_PATTERNS.get(lead.industry.toLowerCase())?.seasonality) {
      triggers.push('Seasonal cash flow variation');
    }
    if (trend > 0.2) triggers.push('Business expansion needs');
    if (filings.length > 3) triggers.push('Recurring working capital needs');
    
    return {
      likelihood,
      estimatedTimeframe,
      estimatedAmount,
      recommendedProducts,
      triggers
    };
  }

  /**
   * Analyze consolidation opportunity
   */
  private async analyzeConsolidationOpportunity(
    filings: UccFiling[],
    lead: Lead
  ): Promise<PredictiveAnalysis['consolidation']> {
    const uniqueLenders = new Set(filings.map(f => f.securedParty)).size;
    const totalDebt = filings.reduce((sum, f) => sum + (f.loanAmount || 0), 0) / 100;
    
    // Not a candidate if only one lender
    if (uniqueLenders <= 1) {
      return {
        isCandidate: false,
        readinessScore: 0,
        potentialSavings: 0,
        currentAPR: 0,
        consolidatedAPR: 0,
        optimalTiming: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        barriers: ['Single lender - no consolidation benefit']
      };
    }
    
    // Calculate readiness score
    let readinessScore = 0;
    const barriers: string[] = [];
    
    // Multiple lenders increase readiness
    readinessScore += Math.min(40, uniqueLenders * 10);
    
    // Credit score affects eligibility
    const creditScore = parseInt(lead.creditScore || '0');
    if (creditScore >= 650) readinessScore += 30;
    else if (creditScore >= 600) readinessScore += 15;
    else barriers.push('Credit score below consolidation threshold');
    
    // Time in business
    const yearsInBusiness = parseInt(lead.timeInBusiness || '0');
    if (yearsInBusiness >= 3) readinessScore += 20;
    else if (yearsInBusiness >= 2) readinessScore += 10;
    else barriers.push('Business too young for consolidation');
    
    // Recent filing activity
    const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentFilings = filings.filter(f => 
      new Date(f.filingDate).getTime() > last30Days
    ).length;
    if (recentFilings === 0) readinessScore += 10;
    else barriers.push('Recent financing activity - wait for stability');
    
    // Estimate APR savings
    const currentAPR = uniqueLenders > 3 ? 0.45 : uniqueLenders > 2 ? 0.35 : 0.25;
    const consolidatedAPR = creditScore >= 650 ? 0.12 : creditScore >= 600 ? 0.18 : 0.25;
    const potentialSavings = totalDebt * (currentAPR - consolidatedAPR);
    
    // Optimal timing
    const monthsToWait = recentFilings > 0 ? 3 : creditScore < 600 ? 6 : 1;
    const optimalTiming = new Date(Date.now() + monthsToWait * 30 * 24 * 60 * 60 * 1000);
    
    return {
      isCandidate: readinessScore >= 50,
      readinessScore,
      potentialSavings,
      currentAPR: currentAPR * 100,
      consolidatedAPR: consolidatedAPR * 100,
      optimalTiming,
      barriers
    };
  }

  /**
   * Generate dashboard data
   */
  private generateDashboardData(
    lead: Lead,
    filings: UccFiling[],
    businessIntelligence: UccBusinessIntelligence,
    industryPatterns: IndustryPatterns,
    advancedPatterns: AdvancedPatterns,
    predictiveAnalysis: PredictiveAnalysis
  ): UccDashboardData {
    // Generate executive summary
    const overallRiskScore = Math.round(
      (advancedPatterns.stacking.riskScore * 0.3 +
       predictiveAnalysis.defaultRisk.earlyWarningScore * 0.4 +
       (100 - businessIntelligence.collateralQuality.overallScore) * 0.3)
    );
    
    const opportunityScore = Math.round(
      (businessIntelligence.expansionSignals.confidenceScore * 0.3 +
       (100 - overallRiskScore) * 0.3 +
       (predictiveAnalysis.consolidation.readinessScore) * 0.4)
    );
    
    // Generate actionable insights
    const actionableInsights: Array<{
      priority: 'critical' | 'high' | 'medium' | 'low';
      type: string;
      message: string;
      action: string;
      impact: number;
    }> = [];
    
    // Critical insights
    if (advancedPatterns.stacking.severity === 'critical') {
      actionableInsights.push({
        priority: 'critical',
        type: 'Risk',
        message: `Critical loan stacking detected: ${advancedPatterns.stacking.details}`,
        action: 'Immediate intervention required - offer consolidation',
        impact: 90
      });
    }
    
    if (predictiveAnalysis.defaultRisk.probability > 0.7) {
      actionableInsights.push({
        priority: 'critical',
        type: 'Default Risk',
        message: `High default probability: ${(predictiveAnalysis.defaultRisk.probability * 100).toFixed(0)}% within ${predictiveAnalysis.defaultRisk.timeframe} months`,
        action: 'Prioritize for proactive restructuring',
        impact: 85
      });
    }
    
    // High priority insights
    if (predictiveAnalysis.consolidation.isCandidate && predictiveAnalysis.consolidation.potentialSavings > 10000) {
      actionableInsights.push({
        priority: 'high',
        type: 'Opportunity',
        message: `Strong consolidation candidate - potential savings: $${predictiveAnalysis.consolidation.potentialSavings.toLocaleString()}`,
        action: 'Contact immediately with consolidation offer',
        impact: 75
      });
    }
    
    if (businessIntelligence.expansionSignals.isExpanding) {
      actionableInsights.push({
        priority: 'high',
        type: 'Growth',
        message: `Business expansion detected: ${businessIntelligence.expansionSignals.expansionType}`,
        action: 'Offer growth financing products',
        impact: 70
      });
    }
    
    // Medium priority insights
    if (advancedPatterns.hiddenRelationships.detected) {
      actionableInsights.push({
        priority: 'medium',
        type: 'Relationships',
        message: `Connected to ${advancedPatterns.hiddenRelationships.entities.length} related entities`,
        action: 'Consider portfolio approach for all related businesses',
        impact: 60
      });
    }
    
    // Build debt timeline
    const debtTimeline = filings.map(f => ({
      date: new Date(f.filingDate),
      event: `${f.filingType || 'Filing'} with ${f.securedParty}`,
      amount: f.loanAmount ? f.loanAmount / 100 : 0,
      lender: f.securedParty,
      type: f.filingType as any || 'new',
      impact: f.filingType === 'termination' ? 'positive' as const : 'neutral' as const,
      description: f.collateralDescription || 'General business assets'
    })).sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Build lender network
    const lenderNetwork = this.buildLenderNetwork(lead, filings);
    
    // Generate risk heat map
    const riskHeatMap = {
      geographic: new Map([
        [lead.stateCode || 'Unknown', overallRiskScore]
      ]),
      temporal: this.generateTemporalRiskMap(filings),
      categorical: new Map([
        ['Stacking', advancedPatterns.stacking.riskScore],
        ['Default', predictiveAnalysis.defaultRisk.earlyWarningScore],
        ['Fraud', advancedPatterns.fraudIndicators.riskLevel === 'critical' ? 100 : 
                  advancedPatterns.fraudIndicators.riskLevel === 'high' ? 75 :
                  advancedPatterns.fraudIndicators.riskLevel === 'medium' ? 50 : 25],
        ['Concentration', businessIntelligence.lenderConcentration.concentrationScore],
        ['Payment', businessIntelligence.paymentBehavior.defaultProbability * 100]
      ])
    };
    
    // Industry benchmarking
    const industryBenchmark = {
      industryAverage: 50,
      percentile: Math.round(100 - overallRiskScore),
      strengths: [
        ...(businessIntelligence.expansionSignals.isExpanding ? ['Business expansion'] : []),
        ...(businessIntelligence.collateralQuality.overallScore > 70 ? ['Strong collateral'] : []),
        ...(industryPatterns.insights.businessHealth === 'thriving' || industryPatterns.insights.businessHealth === 'growing' ? ['Positive growth trajectory'] : [])
      ],
      weaknesses: [
        ...(advancedPatterns.stacking.detected ? ['Loan stacking'] : []),
        ...(businessIntelligence.lenderConcentration.diversificationRating === 'single-source' ? ['Single lender dependency'] : []),
        ...(businessIntelligence.paymentBehavior.hasPaymentIssues ? ['Payment difficulties'] : [])
      ],
      improvementAreas: [
        {
          area: 'Debt Management',
          currentScore: 100 - advancedPatterns.stacking.riskScore,
          industryScore: 75,
          gap: advancedPatterns.stacking.riskScore - 25,
          recommendation: 'Consolidate multiple debts to reduce complexity'
        },
        {
          area: 'Lender Diversification',
          currentScore: 100 - businessIntelligence.lenderConcentration.concentrationScore,
          industryScore: 70,
          gap: businessIntelligence.lenderConcentration.concentrationScore - 30,
          recommendation: businessIntelligence.lenderConcentration.recommendations[0] || 'Maintain healthy lender mix'
        }
      ]
    };
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      businessIntelligence,
      advancedPatterns,
      predictiveAnalysis,
      industryPatterns
    );
    
    return {
      executiveSummary: {
        overallRiskScore,
        opportunityScore,
        actionableInsights
      },
      debtTimeline,
      lenderNetwork,
      riskHeatMap,
      industryBenchmark,
      recommendations
    };
  }

  /**
   * Helper: Generate name variations for fuzzy matching
   */
  private generateNameVariations(name: string): string[] {
    const variations: string[] = [name];
    
    // Remove common suffixes
    const suffixes = ['llc', 'inc', 'corp', 'corporation', 'company', 'co', 'ltd', 'limited'];
    let baseName = name;
    suffixes.forEach(suffix => {
      if (baseName.endsWith(` ${suffix}`)) {
        baseName = baseName.slice(0, -suffix.length - 1);
        variations.push(baseName);
      }
    });
    
    // Add variations with different suffixes
    if (baseName !== name) {
      suffixes.forEach(suffix => {
        variations.push(`${baseName} ${suffix}`);
      });
    }
    
    // Handle DBA names
    if (name.includes('dba')) {
      const parts = name.split('dba');
      variations.push(parts[0].trim(), parts[1]?.trim());
    }
    
    return Array.from(new Set(variations.filter(v => v && v.length > 2)));
  }

  /**
   * Helper: Calculate name similarity
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    // Simple Levenshtein distance-based similarity
    const longer = name1.length > name2.length ? name1 : name2;
    const shorter = name1.length > name2.length ? name2 : name1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Helper: Levenshtein distance
   */
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

  /**
   * Helper: Get industry risk factor
   */
  private getIndustryRiskFactor(industry: string): number {
    const riskFactors: Record<string, number> = {
      'restaurant': 0.7,
      'retail': 0.6,
      'construction': 0.5,
      'transportation': 0.4,
      'healthcare': 0.3,
      'technology': 0.3,
      'manufacturing': 0.4,
      'professional services': 0.2
    };
    
    const key = industry.toLowerCase();
    for (const [ind, factor] of Object.entries(riskFactors)) {
      if (key.includes(ind)) return factor;
    }
    return 0.4; // Default medium risk
  }

  /**
   * Helper: Build lender network graph
   */
  private buildLenderNetwork(lead: Lead, filings: UccFiling[]) {
    const nodes: any[] = [
      {
        id: lead.id,
        type: 'business',
        name: lead.businessName,
        risk: 50, // Will be updated
        size: 100
      }
    ];
    
    const edges: any[] = [];
    const lenderNodes = new Map<string, any>();
    
    filings.forEach((filing, index) => {
      // Add lender node if not exists
      if (!lenderNodes.has(filing.securedParty)) {
        const lenderNode = {
          id: `lender-${index}`,
          type: 'lender',
          name: filing.securedParty,
          risk: 30,
          size: 50
        };
        nodes.push(lenderNode);
        lenderNodes.set(filing.securedParty, lenderNode);
      }
      
      // Add edge
      edges.push({
        source: lead.id,
        target: lenderNodes.get(filing.securedParty).id,
        type: filing.filingType || 'loan',
        strength: filing.loanAmount ? Math.min(100, filing.loanAmount / 10000) : 50,
        label: filing.loanAmount ? `$${(filing.loanAmount / 100).toLocaleString()}` : 'Unknown'
      });
    });
    
    return { nodes, edges };
  }

  /**
   * Helper: Generate temporal risk map
   */
  private generateTemporalRiskMap(filings: UccFiling[]) {
    const riskByPeriod: Array<{ period: string; risk: number }> = [];
    
    // Group by quarter
    const quarterMap = new Map<string, number>();
    
    filings.forEach(filing => {
      const date = new Date(filing.filingDate);
      const quarter = `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
      quarterMap.set(quarter, (quarterMap.get(quarter) || 0) + 1);
    });
    
    quarterMap.forEach((count, quarter) => {
      // Risk increases with filing frequency
      const risk = Math.min(100, count * 25);
      riskByPeriod.push({ period: quarter, risk });
    });
    
    return riskByPeriod.sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Helper: Generate recommendations
   */
  private generateRecommendations(
    businessIntelligence: UccBusinessIntelligence,
    advancedPatterns: AdvancedPatterns,
    predictiveAnalysis: PredictiveAnalysis,
    industryPatterns: IndustryPatterns
  ): UccDashboardData['recommendations'] {
    const recommendations: UccDashboardData['recommendations'] = [];
    let recId = 0;
    
    // Immediate actions
    if (advancedPatterns.stacking.severity === 'critical' || advancedPatterns.stacking.severity === 'severe') {
      recommendations.push({
        id: `rec-${++recId}`,
        category: 'immediate',
        action: 'Offer emergency debt consolidation',
        rationale: `Severe loan stacking detected with ${advancedPatterns.stacking.mcaCount} lenders`,
        expectedImpact: 'Prevent default and reduce payment burden by 40-60%',
        implementation: [
          'Contact lead within 24 hours',
          'Prepare consolidation proposal',
          'Offer preferential rates',
          'Fast-track approval process'
        ],
        roi: 3.5
      });
    }
    
    if (predictiveAnalysis.consolidation.isCandidate && predictiveAnalysis.consolidation.potentialSavings > 20000) {
      recommendations.push({
        id: `rec-${++recId}`,
        category: 'immediate',
        action: 'Present consolidation opportunity',
        rationale: `Can save $${predictiveAnalysis.consolidation.potentialSavings.toLocaleString()} annually`,
        expectedImpact: `Reduce APR from ${predictiveAnalysis.consolidation.currentAPR}% to ${predictiveAnalysis.consolidation.consolidatedAPR}%`,
        implementation: [
          'Calculate exact savings',
          'Prepare comparison sheet',
          'Schedule consultation',
          'Expedite underwriting'
        ],
        roi: 2.8
      });
    }
    
    // Short-term actions
    if (businessIntelligence.expansionSignals.isExpanding) {
      recommendations.push({
        id: `rec-${++recId}`,
        category: 'short-term',
        action: 'Offer growth financing package',
        rationale: `Business showing ${businessIntelligence.expansionSignals.expansionType} expansion signals`,
        expectedImpact: 'Capture growth opportunity and increase wallet share',
        implementation: [
          'Analyze expansion needs',
          'Design custom financing solution',
          'Include equipment financing',
          'Offer competitive terms'
        ],
        roi: 2.2
      });
    }
    
    if (predictiveAnalysis.nextFinancing.likelihood > 0.7) {
      recommendations.push({
        id: `rec-${++recId}`,
        category: 'short-term',
        action: 'Proactive financing offer',
        rationale: `${(predictiveAnalysis.nextFinancing.likelihood * 100).toFixed(0)}% likely to need financing in ${predictiveAnalysis.nextFinancing.estimatedTimeframe} days`,
        expectedImpact: `Preempt competition and secure $${predictiveAnalysis.nextFinancing.estimatedAmount.toLocaleString()} deal`,
        implementation: [
          'Pre-approve credit line',
          'Send personalized offer',
          'Highlight quick funding',
          'Provide multiple options'
        ],
        roi: 1.8
      });
    }
    
    // Long-term actions
    if (industryPatterns.insights.businessHealth === 'struggling' || industryPatterns.insights.businessHealth === 'distressed') {
      recommendations.push({
        id: `rec-${++recId}`,
        category: 'long-term',
        action: 'Implement recovery program',
        rationale: `Business health: ${industryPatterns.insights.businessHealth}`,
        expectedImpact: 'Stabilize business and prevent default',
        implementation: [
          'Assign dedicated advisor',
          'Create payment plan',
          'Provide business consulting',
          'Monitor progress monthly'
        ],
        roi: 1.5
      });
    }
    
    return recommendations;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(
    businessIntelligence: UccBusinessIntelligence,
    industryPatterns: IndustryPatterns,
    advancedPatterns: AdvancedPatterns,
    predictiveAnalysis: PredictiveAnalysis
  ): number {
    const confidences = [
      businessIntelligence.expansionSignals.confidenceScore,
      advancedPatterns.lifecycle.confidence,
      predictiveAnalysis.defaultRisk.confidence,
      advancedPatterns.hiddenRelationships.entities.reduce((sum, e) => sum + e.confidence, 0) / 
        Math.max(advancedPatterns.hiddenRelationships.entities.length, 1)
    ];
    
    return Math.round(
      confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    );
  }

  /**
   * Save enhanced analysis to database
   */
  private async saveEnhancedAnalysis(
    leadId: string,
    analysis: any
  ): Promise<void> {
    try {
      // Save to ucc_intelligence table
      await db.insert(uccIntelligence).values({
        leadId,
        aiAnalysis: {
          analysisType: 'enhanced_comprehensive',
          businessIntelligence: analysis.businessIntelligence,
          advancedPatterns: analysis.advancedPatterns,
          predictiveAnalysis: analysis.predictiveAnalysis,
          actionableInsights: analysis.dashboardData?.executiveSummary?.actionableInsights,
          confidence: analysis.confidence,
          analyzedAt: new Date()
        },
        industryInsights: analysis.industryPatterns,
        businessHealthScore: analysis.confidence
      }).onConflictDoUpdate({
        target: uccIntelligence.leadId,
        set: {
          aiAnalysis: {
            analysisType: 'enhanced_comprehensive',
            businessIntelligence: analysis.businessIntelligence,
            advancedPatterns: analysis.advancedPatterns,
            predictiveAnalysis: analysis.predictiveAnalysis,
            actionableInsights: analysis.dashboardData?.executiveSummary?.actionableInsights,
            confidence: analysis.confidence,
            analyzedAt: new Date()
          } as any,
          industryInsights: analysis.industryPatterns as any,
          businessHealthScore: analysis.confidence
        }
      });
    } catch (error) {
      console.error('[UCC] Error saving enhanced analysis:', error);
    }
  }

  /**
   * Update lead intelligence scores with UCC insights
   */
  private async updateLeadIntelligence(
    leadId: string,
    analysis: any
  ): Promise<void> {
    try {
      // Calculate UCC-based adjustments to intelligence score
      const uccRiskAdjustment = -Math.round(
        (analysis.advancedPatterns.stacking.riskScore * 0.3 +
         analysis.predictiveAnalysis.defaultRisk.probability * 100 * 0.4) / 10
      );
      
      const uccOpportunityAdjustment = Math.round(
        (analysis.businessIntelligence.expansionSignals.confidenceScore * 0.3 +
         (analysis.predictiveAnalysis.consolidation.readinessScore) * 0.2) / 10
      );
      
      // Update lead with UCC-enhanced scores
      const currentLead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (currentLead[0]) {
        const updatedRiskScore = Math.max(0, Math.min(100, 
          (currentLead[0].riskSubScore || 50) + uccRiskAdjustment
        ));
        
        const updatedOpportunityScore = Math.max(0, Math.min(100,
          (currentLead[0].opportunitySubScore || 50) + uccOpportunityAdjustment
        ));
        
        await db.update(leads)
          .set({
            riskSubScore: updatedRiskScore,
            opportunitySubScore: updatedOpportunityScore,
            intelligenceMetadata: {
              ...((currentLead[0].intelligenceMetadata as any) || {}),
              uccEnhanced: true,
              uccAnalysisDate: new Date(),
              uccInsights: {
                stacking: analysis.advancedPatterns.stacking.detected,
                defaultRisk: analysis.predictiveAnalysis.defaultRisk.probability,
                consolidationOpportunity: analysis.predictiveAnalysis.consolidation.isCandidate,
                expansionSignals: analysis.businessIntelligence.expansionSignals.isExpanding
              }
            }
          })
          .where(eq(leads.id, leadId));
      }
    } catch (error) {
      console.error('[UCC] Error updating lead intelligence:', error);
    }
  }
}

// Export singleton instance
export const enhancedUccIntelligenceService = new EnhancedUccIntelligenceService();