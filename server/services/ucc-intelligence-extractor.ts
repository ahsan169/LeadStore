import { InsertLead } from "../../shared/schema";

// MCA lender patterns for identifying cash advance providers
const MCA_LENDER_PATTERNS = [
  // Direct MCA Companies
  /\b(capital|cash|advance|fund|merchant|business)\s*(stack|funding|solutions?|services?|direct|source|partners?|group|llc)\b/i,
  /\b(quick|fast|rapid|express|instant)\s*(capital|cash|fund|finance)/i,
  /\badvance\s*(me|now|today|funding|capital)/i,
  /\b(daily|square|paypal)\s*(capital|working\s*capital)/i,
  /\bkabbage|ondeck|bluevine|fundbox|credibly/i,
  /\byellowstone|everest|pearl|complete\s*business/i,
  /\bfunder[sz]?\s*(direct|one|360)/i,
  /\b(national|american|united)\s*funding/i,
  /\bcapify|behalf|clearbanc|liberis/i,
  /\bmerchant\s*(cash|advance|growth)/i,
  
  // Factoring Companies (also indicates alternative lending)
  /\bfactor(ing|s)?\s*(company|services?|solutions?)/i,
  /\breceivable[sz]?\s*(funding|capital|finance)/i,
  /\binvoice\s*(factor|fund|advance)/i,
  
  // Alternative/Online Lenders
  /\balternative\s*(capital|funding|lending)/i,
  /\bonline\s*(capital|lender[sz]?|funding)/i,
  /\bfintech\s*(capital|fund|lender)/i,
  
  // Common MCA-related terms in company names
  /\bworking\s*capital/i,
  /\bcash\s*flow\s*(solutions?|capital)/i,
  /\brevenue\s*(based|advance)/i,
  /\bISO\s*(partner|funding)/i,  // ISO = Independent Sales Organization
];

// Traditional bank patterns
const BANK_PATTERNS = [
  /\b(bank|bancorp|banking)\b/i,
  /\b(chase|wells\s*fargo|citi|capital\s*one|pnc|truist|regions|fifth\s*third|key\s*bank)/i,
  /\b(credit\s*union|federal\s*credit)/i,
  /\b(savings|loan|trust\s*company)/i,
  /\bfdic\b/i,
  /\b(community|regional|national)\s*bank/i,
];

// SBA lender patterns
const SBA_PATTERNS = [
  /\bsba\b/i,
  /\bsmall\s*business\s*administration/i,
  /\b(cdc|504|7a)\s*(loan|lender)/i,  // Common SBA loan types
];

// Asset-based lenders (equipment financing, etc.)
const ASSET_LENDER_PATTERNS = [
  /\bequipment\s*(finance|capital|leasing)/i,
  /\basset\s*(based|finance|funding)/i,
  /\b(truck|vehicle|machinery)\s*(finance|capital)/i,
  /\bleasing\s*(company|services?|solutions?)/i,
];

interface UccIntelligence {
  // Owner information
  ownerName: string | null;
  ownerNameConfidence: 'high' | 'medium' | 'low';
  
  // Secured party analysis
  securedParties: Array<{
    name: string;
    type: 'mca' | 'bank' | 'sba' | 'asset_based' | 'other';
    isAlternativeLender: boolean;
  }>;
  primaryLenderType: 'mca' | 'traditional' | 'mixed' | 'unknown';
  hasMultipleMcaPositions: boolean;
  
  // Filing history
  totalFilings: number;
  activePositions: number;
  terminatedPositions: number;
  lastFilingDate: Date | null;
  firstFilingDate: Date | null;
  filingSpanDays: number;
  averageFilingFrequency: number; // days between filings
  
  // Financial intelligence
  estimatedAnnualRevenue: number | null;
  revenueConfidenceScore: number; // 0-100
  revenueEstimationMethod: string;
  totalExposure: number | null; // Total amount across all filings
  averageLoanAmount: number | null;
  
  // Risk indicators
  stackingRisk: 'high' | 'medium' | 'low';
  distressSignals: string[];
  businessMaturity: 'new' | 'growing' | 'established' | 'mature';
}

export class UccIntelligenceExtractor {
  
  /**
   * Extract owner name from business name and other fields
   */
  private extractOwnerName(data: any): { name: string | null, confidence: 'high' | 'medium' | 'low' } {
    // Check if owner name is directly provided
    if (data.ownerName && data.ownerName.trim()) {
      return { name: data.ownerName.trim(), confidence: 'high' };
    }
    
    const businessName = (data.businessName || data.debtor_name || '').trim();
    if (!businessName) {
      return { name: null, confidence: 'low' };
    }
    
    // Common patterns for extracting owner names from business names
    const patterns = [
      // "John Smith LLC", "Jane Doe Inc"
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s+(?:LLC|Inc|Corp|Company|Co|LTD|Limited|Group|Enterprises?|Services?)\.?)/i,
      
      // "Smith, John DBA Some Business"
      /^([A-Z][a-z]+),\s*([A-Z][a-z]+)(?:\s+DBA\s+.+)?/i,
      
      // "The John Smith Company"
      /^The\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:Company|Co|Group|Enterprises?)/i,
      
      // DBA patterns: "Some Business DBA John Smith Services"
      /DBA\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s+Services?)?$/i,
    ];
    
    for (const pattern of patterns) {
      const match = businessName.match(pattern);
      if (match) {
        const name = match[1].trim();
        // Validate it looks like a person's name
        if (this.looksLikePersonName(name)) {
          return { name, confidence: 'medium' };
        }
      }
    }
    
    // Check notes or additional fields for owner information
    const notes = (data.notes || '').toLowerCase();
    const ownerMatch = notes.match(/owner[:\s]+([a-z]+(?:\s+[a-z]+)+)/i);
    if (ownerMatch) {
      return { name: this.titleCase(ownerMatch[1]), confidence: 'medium' };
    }
    
    // Try to extract from full address if it contains "ATTN:" or "C/O"
    const fullAddress = (data.full_address || data.address || '').toUpperCase();
    const attnMatch = fullAddress.match(/(?:ATTN|C\/O)[:\s]+([A-Z]+(?:\s+[A-Z]+)+)/);
    if (attnMatch) {
      return { name: this.titleCase(attnMatch[1]), confidence: 'low' };
    }
    
    return { name: null, confidence: 'low' };
  }
  
  /**
   * Check if a string looks like a person's name
   */
  private looksLikePersonName(name: string): boolean {
    const words = name.split(/\s+/);
    
    // Should have 2-4 words
    if (words.length < 2 || words.length > 4) return false;
    
    // Each word should start with uppercase and be mostly letters
    const namePattern = /^[A-Z][a-z]+$/;
    const validWords = words.filter(w => namePattern.test(w));
    
    // At least 2 valid name words
    return validWords.length >= 2;
  }
  
  /**
   * Parse and analyze secured parties
   */
  private parseSecuredParties(securedPartiesStr: string): UccIntelligence['securedParties'] {
    if (!securedPartiesStr) return [];
    
    // Split by common separators
    const parties = securedPartiesStr
      .split(/[;,]|\s+AND\s+|\s+&\s+/i)
      .map(p => p.trim())
      .filter(p => p.length > 2);
    
    return parties.map(party => {
      const upperParty = party.toUpperCase();
      
      // Determine lender type
      let type: UccIntelligence['securedParties'][0]['type'] = 'other';
      let isAlternativeLender = false;
      
      // Check for MCA patterns first (most specific)
      if (MCA_LENDER_PATTERNS.some(pattern => pattern.test(party))) {
        type = 'mca';
        isAlternativeLender = true;
      }
      // Then check for SBA
      else if (SBA_PATTERNS.some(pattern => pattern.test(party))) {
        type = 'sba';
      }
      // Then banks
      else if (BANK_PATTERNS.some(pattern => pattern.test(party))) {
        type = 'bank';
      }
      // Then asset-based
      else if (ASSET_LENDER_PATTERNS.some(pattern => pattern.test(party))) {
        type = 'asset_based';
        isAlternativeLender = true;
      }
      // Check if it's alternative even if not MCA
      else if (/\b(capital|fund|finance|financial)/i.test(party) && 
               !/\b(bank|credit\s*union)/i.test(party)) {
        isAlternativeLender = true;
      }
      
      // Clean up common suffixes for display
      const cleanName = party
        .replace(/\s*AS\s+REPRESENTATIVE$/i, '')
        .replace(/\s*\([^)]+\)$/, '')  // Remove parenthetical info
        .trim();
      
      return {
        name: cleanName,
        type,
        isAlternativeLender
      };
    });
  }
  
  /**
   * Calculate filing history metrics
   */
  private calculateFilingMetrics(data: any): Partial<UccIntelligence> {
    const filingCount = parseInt(data.filing_count || data.filingCount || '1') || 1;
    const filingDate = this.parseDate(data.filing_date || data.filingDate);
    const expireDate = this.parseDate(data.expire_date || data.expireDate);
    const amendDate = this.parseDate(data.amend_date || data.amendDate);
    const filingType = (data.filing_type || data.filingType || '').toLowerCase();
    
    // Determine active vs terminated positions
    let activePositions = filingCount;
    let terminatedPositions = 0;
    
    if (filingType.includes('termination')) {
      terminatedPositions = 1;
      activePositions = Math.max(0, filingCount - 1);
    } else if (expireDate && expireDate < new Date()) {
      // If expired, consider it terminated
      terminatedPositions = 1;
      activePositions = Math.max(0, filingCount - 1);
    }
    
    // Calculate filing span
    let filingSpanDays = 0;
    let averageFilingFrequency = 0;
    
    if (filingDate && amendDate && amendDate > filingDate) {
      filingSpanDays = Math.floor((amendDate.getTime() - filingDate.getTime()) / (1000 * 60 * 60 * 24));
      if (filingCount > 1) {
        averageFilingFrequency = Math.floor(filingSpanDays / (filingCount - 1));
      }
    } else if (filingDate) {
      // Calculate span from filing date to now
      filingSpanDays = Math.floor((new Date().getTime() - filingDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    return {
      totalFilings: filingCount,
      activePositions,
      terminatedPositions,
      lastFilingDate: amendDate || filingDate,
      firstFilingDate: filingDate,
      filingSpanDays,
      averageFilingFrequency
    };
  }
  
  /**
   * Estimate annual revenue based on UCC filing data
   */
  private estimateRevenue(data: any, securedParties: UccIntelligence['securedParties']): {
    revenue: number | null,
    confidence: number,
    method: string
  } {
    // Method 1: Use suggested price as a baseline (if available)
    const suggestedPrice = parseFloat(data.suggested_price || data.suggestedPrice || '0');
    
    // Method 2: Use industry and employee count
    const industry = (data.industry || '').toLowerCase();
    const score = parseInt(data.score || data.creditScore || '0');
    const state = data.state || data.stateCode || '';
    
    // Method 3: Use filing amounts and lender types
    const lenderCount = parseInt(data.lender_count || data.lenderCount || '0') || securedParties.length;
    const hasMCA = securedParties.some(p => p.type === 'mca');
    const hasBank = securedParties.some(p => p.type === 'bank');
    
    let estimatedRevenue: number | null = null;
    let confidence = 0;
    let method = 'unknown';
    
    // Revenue estimation based on MCA lending patterns
    // MCA typically lends 10-15% of annual revenue
    if (hasMCA && suggestedPrice > 0) {
      // Suggested price correlates with deal size
      // Typical MCA amounts: $5k-$500k
      // Price tiers: $15 = small, $50 = medium, $100+ = large
      if (suggestedPrice <= 20) {
        estimatedRevenue = 250000 + Math.random() * 250000; // $250k-$500k
        confidence = 60;
      } else if (suggestedPrice <= 50) {
        estimatedRevenue = 500000 + Math.random() * 500000; // $500k-$1M
        confidence = 65;
      } else if (suggestedPrice <= 100) {
        estimatedRevenue = 1000000 + Math.random() * 1500000; // $1M-$2.5M
        confidence = 70;
      } else {
        estimatedRevenue = 2500000 + Math.random() * 2500000; // $2.5M-$5M
        confidence = 75;
      }
      method = 'mca_lending_patterns';
    }
    
    // Adjust based on industry
    if (estimatedRevenue && industry) {
      const industryMultipliers: Record<string, number> = {
        'trucking': 1.3,
        'logistics': 1.3,
        'transportation': 1.3,
        'construction': 1.2,
        'manufacturing': 1.4,
        'wholesale': 1.5,
        'retail': 0.9,
        'restaurant': 0.8,
        'hospitality': 0.85,
        'healthcare': 1.1,
        'professional': 1.0,
        'technology': 1.2,
        'ecommerce': 1.1
      };
      
      const multiplier = industryMultipliers[industry] || 1.0;
      estimatedRevenue = estimatedRevenue * multiplier;
      confidence += 5;
    }
    
    // Adjust based on credit score
    if (score > 0) {
      if (score >= 700) {
        estimatedRevenue = (estimatedRevenue || 1000000) * 1.2;
        confidence += 10;
      } else if (score >= 650) {
        estimatedRevenue = (estimatedRevenue || 800000) * 1.1;
        confidence += 5;
      } else if (score < 600) {
        estimatedRevenue = (estimatedRevenue || 500000) * 0.9;
        confidence -= 5;
      }
    }
    
    // Adjust based on number of lenders (more lenders = likely larger business)
    if (lenderCount > 2) {
      estimatedRevenue = (estimatedRevenue || 750000) * (1 + (lenderCount - 2) * 0.1);
      confidence += lenderCount * 2;
    }
    
    // State-based adjustments (cost of living / business environment)
    const highRevenueStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'MA', 'WA'];
    const lowRevenueStates = ['WV', 'MS', 'AR', 'KY', 'AL', 'SC'];
    
    if (highRevenueStates.includes(state)) {
      estimatedRevenue = (estimatedRevenue || 800000) * 1.15;
      confidence += 3;
    } else if (lowRevenueStates.includes(state)) {
      estimatedRevenue = (estimatedRevenue || 600000) * 0.85;
      confidence += 3;
    }
    
    // Fallback estimation if no MCA data
    if (!estimatedRevenue) {
      if (hasBank) {
        estimatedRevenue = 1500000 + Math.random() * 1500000; // Banks lend to larger businesses
        confidence = 50;
        method = 'bank_lending_patterns';
      } else {
        estimatedRevenue = 500000 + Math.random() * 500000; // Conservative estimate
        confidence = 30;
        method = 'default_estimation';
      }
    }
    
    // Cap confidence at 85 (we're estimating, not reporting)
    confidence = Math.min(85, Math.max(0, confidence));
    
    return {
      revenue: Math.round(estimatedRevenue || 0),
      confidence,
      method
    };
  }
  
  /**
   * Calculate risk indicators
   */
  private calculateRiskIndicators(
    securedParties: UccIntelligence['securedParties'],
    filingMetrics: Partial<UccIntelligence>
  ): Pick<UccIntelligence, 'stackingRisk' | 'distressSignals' | 'businessMaturity'> {
    const distressSignals: string[] = [];
    let stackingRisk: 'high' | 'medium' | 'low' = 'low';
    
    // Check for MCA stacking (multiple MCA lenders)
    const mcaCount = securedParties.filter(p => p.type === 'mca').length;
    if (mcaCount >= 3) {
      stackingRisk = 'high';
      distressSignals.push('Multiple MCA positions detected');
    } else if (mcaCount >= 2) {
      stackingRisk = 'medium';
      distressSignals.push('Some MCA stacking present');
    }
    
    // Check filing frequency (rapid filings = distress)
    if (filingMetrics.averageFilingFrequency && filingMetrics.averageFilingFrequency < 30) {
      distressSignals.push('Rapid filing frequency (< 30 days between filings)');
      stackingRisk = 'high';
    } else if (filingMetrics.averageFilingFrequency && filingMetrics.averageFilingFrequency < 60) {
      distressSignals.push('Frequent filings (< 60 days between filings)');
      if (stackingRisk === 'low') stackingRisk = 'medium';
    }
    
    // Check for recent terminations
    if (filingMetrics.terminatedPositions && filingMetrics.terminatedPositions > 0) {
      distressSignals.push('Recent position terminations');
    }
    
    // Determine business maturity based on filing history
    let businessMaturity: 'new' | 'growing' | 'established' | 'mature' = 'new';
    if (filingMetrics.filingSpanDays) {
      if (filingMetrics.filingSpanDays > 1825) { // 5+ years
        businessMaturity = 'mature';
      } else if (filingMetrics.filingSpanDays > 730) { // 2+ years
        businessMaturity = 'established';
      } else if (filingMetrics.filingSpanDays > 365) { // 1+ year
        businessMaturity = 'growing';
      }
    }
    
    return {
      stackingRisk,
      distressSignals,
      businessMaturity
    };
  }
  
  /**
   * Parse date strings
   */
  private parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  /**
   * Convert to title case
   */
  private titleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }
  
  /**
   * Main extraction method
   */
  public extractIntelligence(data: any): UccIntelligence {
    // Extract owner name
    const ownerExtraction = this.extractOwnerName(data);
    
    // Parse secured parties
    const securedParties = this.parseSecuredParties(
      data.secured_parties || data.securedParties || ''
    );
    
    // Determine primary lender type
    let primaryLenderType: UccIntelligence['primaryLenderType'] = 'unknown';
    const hasMCA = securedParties.some(p => p.type === 'mca');
    const hasBank = securedParties.some(p => p.type === 'bank');
    
    if (hasMCA && hasBank) {
      primaryLenderType = 'mixed';
    } else if (hasMCA) {
      primaryLenderType = 'mca';
    } else if (hasBank) {
      primaryLenderType = 'traditional';
    }
    
    // Calculate filing metrics
    const filingMetrics = this.calculateFilingMetrics(data);
    
    // Estimate revenue
    const revenueEstimation = this.estimateRevenue(data, securedParties);
    
    // Calculate risk indicators
    const riskIndicators = this.calculateRiskIndicators(securedParties, filingMetrics);
    
    // Calculate total exposure (if amounts available)
    const totalExposure = null; // Would need loan amounts from filings
    const averageLoanAmount = null; // Would need loan amounts from filings
    
    return {
      // Owner information
      ownerName: ownerExtraction.name,
      ownerNameConfidence: ownerExtraction.confidence,
      
      // Secured party analysis
      securedParties,
      primaryLenderType,
      hasMultipleMcaPositions: securedParties.filter(p => p.type === 'mca').length > 1,
      
      // Filing history
      ...filingMetrics,
      
      // Financial intelligence
      estimatedAnnualRevenue: revenueEstimation.revenue,
      revenueConfidenceScore: revenueEstimation.confidence,
      revenueEstimationMethod: revenueEstimation.method,
      totalExposure,
      averageLoanAmount,
      
      // Risk indicators
      ...riskIndicators
    } as UccIntelligence;
  }
  
  /**
   * Format intelligence for display/storage
   */
  public formatIntelligence(intelligence: UccIntelligence): any {
    return {
      owner: {
        name: intelligence.ownerName || 'Not identified',
        confidence: intelligence.ownerNameConfidence
      },
      lenders: {
        parties: intelligence.securedParties.map(p => ({
          name: p.name,
          type: p.type,
          isAlternative: p.isAlternativeLender
        })),
        primaryType: intelligence.primaryLenderType,
        hasMultipleMCA: intelligence.hasMultipleMcaPositions
      },
      filings: {
        total: intelligence.totalFilings,
        active: intelligence.activePositions,
        terminated: intelligence.terminatedPositions,
        lastFiling: intelligence.lastFilingDate?.toISOString().split('T')[0] || null,
        firstFiling: intelligence.firstFilingDate?.toISOString().split('T')[0] || null,
        spanDays: intelligence.filingSpanDays,
        avgFrequency: intelligence.averageFilingFrequency
      },
      financial: {
        estimatedRevenue: intelligence.estimatedAnnualRevenue,
        revenueConfidence: intelligence.revenueConfidenceScore,
        estimationMethod: intelligence.revenueEstimationMethod,
        totalExposure: intelligence.totalExposure,
        avgLoanAmount: intelligence.averageLoanAmount
      },
      risk: {
        stackingLevel: intelligence.stackingRisk,
        distressSignals: intelligence.distressSignals,
        businessMaturity: intelligence.businessMaturity
      }
    };
  }
}

// Export singleton instance
export const uccIntelligenceExtractor = new UccIntelligenceExtractor();