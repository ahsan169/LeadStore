import type { Lead } from "@shared/schema";
import { perplexityResearch } from "./perplexity-research";

interface RevenueEstimate {
  amount: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'direct' | 'perplexity' | 'employee_based' | 'industry_average';
  details?: string;
}

class RevenueDiscoveryService {
  /**
   * Industry average revenues for estimation
   */
  private industryAverages: Record<string, { min: number; max: number; avg: number }> = {
    'technology': { min: 500000, max: 50000000, avg: 5000000 },
    'software': { min: 300000, max: 30000000, avg: 3000000 },
    'retail': { min: 200000, max: 10000000, avg: 2000000 },
    'restaurant': { min: 150000, max: 5000000, avg: 1000000 },
    'construction': { min: 500000, max: 20000000, avg: 3000000 },
    'manufacturing': { min: 1000000, max: 50000000, avg: 5000000 },
    'healthcare': { min: 300000, max: 20000000, avg: 2500000 },
    'real estate': { min: 400000, max: 30000000, avg: 3500000 },
    'professional services': { min: 200000, max: 10000000, avg: 1500000 },
    'finance': { min: 500000, max: 40000000, avg: 4000000 },
    'transportation': { min: 300000, max: 15000000, avg: 2000000 },
    'wholesale': { min: 1000000, max: 30000000, avg: 5000000 },
    'hospitality': { min: 200000, max: 8000000, avg: 1200000 },
    'education': { min: 100000, max: 5000000, avg: 800000 },
    'consulting': { min: 250000, max: 15000000, avg: 2000000 }
  };

  /**
   * Employee count to revenue multipliers by industry
   */
  private employeeMultipliers: Record<string, number> = {
    'technology': 400000,
    'software': 450000,
    'finance': 500000,
    'healthcare': 250000,
    'retail': 200000,
    'restaurant': 150000,
    'construction': 300000,
    'manufacturing': 350000,
    'real estate': 450000,
    'professional services': 300000,
    'consulting': 350000,
    'education': 150000,
    'hospitality': 180000,
    'transportation': 250000,
    'wholesale': 400000
  };

  /**
   * Parse revenue from various text formats
   */
  parseRevenueFromText(text: string): RevenueEstimate | null {
    if (!text) return null;

    // Comprehensive regex patterns for revenue extraction
    const patterns = [
      // $X million/billion format
      /\$(\d+(?:\.\d+)?)\s*([BMK]?)(?:illion|illion|housand)?\s*(?:in\s+)?(?:annual\s+)?(?:revenue|sales|income)/gi,
      // Revenue of $X format
      /(?:revenue|sales|income)\s*(?:of|:|\s)\s*\$(\d+(?:\.\d+)?)\s*([BMK]?)(?:illion|illion|housand)?/gi,
      // X million in revenue format
      /(\d+(?:\.\d+)?)\s*([BMK]?)(?:illion|illion|housand)\s+(?:in\s+)?(?:annual\s+)?(?:revenue|sales|income)/gi,
      // Between X and Y format
      /(?:between|from)\s*\$?(\d+(?:\.\d+)?)\s*(?:to|and|-)\s*\$?(\d+(?:\.\d+)?)\s*([BMK]?)(?:illion|illion|housand)?\s*(?:in\s+)?(?:revenue|sales)/gi,
      // Annual revenue: X format
      /(?:annual|yearly|gross)\s+(?:revenue|sales|income)[\s:]+\$?(\d+(?:\.\d+)?)\s*([BMK]?)(?:illion|illion|housand)?/gi
    ];

    let bestEstimate: RevenueEstimate | null = null;
    let highestConfidence = 0;

    for (const pattern of patterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      for (const match of matches) {
        let amount = 0;
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        
        // Handle range format (between X and Y)
        if (match.length >= 4 && match[2]) {
          const low = parseFloat(match[1]);
          const high = parseFloat(match[2]);
          amount = (low + high) / 2;
          
          const multiplier = match[3];
          amount = this.applyMultiplier(amount, multiplier);
        } else {
          amount = parseFloat(match[1]);
          const multiplier = match[2];
          amount = this.applyMultiplier(amount, multiplier);
        }

        // Determine confidence based on context
        if (text.toLowerCase().includes('reported') || 
            text.toLowerCase().includes('filed') || 
            text.toLowerCase().includes('disclosed')) {
          confidence = 'high';
        } else if (text.toLowerCase().includes('estimated') || 
                   text.toLowerCase().includes('approximately') ||
                   text.toLowerCase().includes('around')) {
          confidence = 'medium';
        } else if (text.toLowerCase().includes('projected') || 
                   text.toLowerCase().includes('expected') ||
                   text.toLowerCase().includes('potential')) {
          confidence = 'low';
        }

        // Calculate confidence score
        const confidenceScore = confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
        
        if (!bestEstimate || confidenceScore > highestConfidence) {
          bestEstimate = {
            amount: Math.floor(amount),
            confidence,
            source: 'direct',
            details: match[0]
          };
          highestConfidence = confidenceScore;
        }
      }
    }

    return bestEstimate;
  }

  /**
   * Apply multiplier to amount based on suffix (K, M, B)
   */
  private applyMultiplier(amount: number, multiplier?: string): number {
    if (!multiplier) return amount;
    
    switch (multiplier.toUpperCase()) {
      case 'K': return amount * 1000;
      case 'M': return amount * 1000000;
      case 'B': return amount * 1000000000;
      default: return amount;
    }
  }

  /**
   * Estimate revenue based on employee count
   */
  estimateFromEmployeeCount(employeeCount: number, industry?: string): RevenueEstimate {
    const normalizedIndustry = this.normalizeIndustry(industry);
    const multiplier = this.employeeMultipliers[normalizedIndustry] || 250000;
    
    return {
      amount: Math.floor(employeeCount * multiplier),
      confidence: 'low',
      source: 'employee_based',
      details: `Estimated based on ${employeeCount} employees at $${multiplier.toLocaleString()} per employee`
    };
  }

  /**
   * Estimate revenue based on industry and business characteristics
   */
  estimateFromIndustry(industry?: string, timeInBusiness?: string): RevenueEstimate {
    const normalizedIndustry = this.normalizeIndustry(industry);
    const industryData = this.industryAverages[normalizedIndustry] || 
                        { min: 100000, max: 5000000, avg: 1000000 };
    
    // Adjust based on time in business
    let adjustmentFactor = 1.0;
    if (timeInBusiness) {
      const years = this.parseTimeInBusiness(timeInBusiness);
      if (years < 2) adjustmentFactor = 0.5;
      else if (years < 5) adjustmentFactor = 0.7;
      else if (years > 10) adjustmentFactor = 1.2;
    }
    
    return {
      amount: Math.floor(industryData.avg * adjustmentFactor),
      confidence: 'low',
      source: 'industry_average',
      details: `Industry average for ${normalizedIndustry} adjusted for business age`
    };
  }

  /**
   * Normalize industry name for matching
   */
  private normalizeIndustry(industry?: string): string {
    if (!industry) return 'general';
    
    const industryLower = industry.toLowerCase();
    
    // Match to known categories
    for (const key of Object.keys(this.industryAverages)) {
      if (industryLower.includes(key)) {
        return key;
      }
    }
    
    // Special mappings
    if (industryLower.includes('food') || industryLower.includes('dining')) return 'restaurant';
    if (industryLower.includes('tech') || industryLower.includes('it')) return 'technology';
    if (industryLower.includes('medical') || industryLower.includes('dental')) return 'healthcare';
    if (industryLower.includes('logistics') || industryLower.includes('shipping')) return 'transportation';
    if (industryLower.includes('hotel') || industryLower.includes('resort')) return 'hospitality';
    
    return 'general';
  }

  /**
   * Parse time in business to years
   */
  private parseTimeInBusiness(timeInBusiness: string): number {
    const match = timeInBusiness.match(/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
    return 0;
  }

  /**
   * Comprehensive revenue discovery for a lead
   */
  async discoverRevenue(lead: Partial<Lead>): Promise<RevenueEstimate | null> {
    // 1. Check if lead already has revenue data
    if (lead.annualRevenue) {
      const parsed = this.parseRevenueFromText(lead.annualRevenue);
      if (parsed) return parsed;
    }

    // 2. Try to get from Perplexity research
    try {
      const research = await perplexityResearch.researchLead(lead);
      if (research.estimatedRevenue) {
        return {
          amount: research.estimatedRevenue,
          confidence: research.revenueConfidence || 'medium',
          source: 'perplexity',
          details: `Discovered via Perplexity research`
        };
      }

      // 3. If Perplexity found employee count but not revenue, estimate
      if (research.employeeCount) {
        return this.estimateFromEmployeeCount(research.employeeCount, lead.industry as any);
      }
    } catch (error) {
      console.error('Error in Perplexity research:', error);
    }

    // 4. Fallback to industry average
    if (lead.industry) {
      return this.estimateFromIndustry(lead.industry, lead.timeInBusiness as any);
    }

    return null;
  }

  /**
   * Batch revenue discovery
   */
  async discoverBatchRevenues(leads: Partial<Lead>[]): Promise<Map<string, RevenueEstimate | null>> {
    const results = new Map<string, RevenueEstimate | null>();
    
    for (const lead of leads) {
      if (lead.id) {
        const estimate = await this.discoverRevenue(lead);
        results.set(lead.id, estimate);
      }
    }
    
    return results;
  }

  /**
   * Calculate revenue score for lead quality
   */
  calculateRevenueScore(revenue: number): number {
    // Score based on revenue ranges suitable for MCA
    if (revenue < 100000) return 20; // Too small
    if (revenue < 250000) return 40; // Small but viable
    if (revenue < 500000) return 60; // Good range for small MCA
    if (revenue < 1000000) return 80; // Ideal range
    if (revenue < 5000000) return 90; // Great range
    if (revenue < 10000000) return 85; // Large but still good
    return 70; // Very large, may have other financing options
  }
}

export const revenueDiscovery = new RevenueDiscoveryService();