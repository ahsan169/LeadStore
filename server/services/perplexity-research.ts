import type { Lead, InsertLead } from "@shared/schema";
import { storage } from "../storage";

interface PerplexityResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  citations?: string[];
  choices: {
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ResearchResult {
  estimatedRevenue?: number;
  revenueConfidence?: 'high' | 'medium' | 'low';
  employeeCount?: number;
  yearsInBusiness?: number;
  ownerBackground?: string;
  businessDescription?: string;
  keyActivities?: string[];
  competitiveAdvantages?: string[];
  challenges?: string[];
  sources?: string[];
}

class PerplexityResearchEngine {
  private apiKey: string;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 500; // 2 requests per second max
  private cache: Map<string, ResearchResult> = new Map();

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('PERPLEXITY_API_KEY not set - research features will be disabled');
    }
  }

  /**
   * Rate limiting wrapper
   */
  private async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Call Perplexity API with rate limiting
   */
  private async callPerplexity(query: string): Promise<PerplexityResponse | null> {
    if (!this.apiKey) {
      return null;
    }

    await this.rateLimit();

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online',
          messages: [
            {
              role: 'system',
              content: 'Be precise and concise. Extract specific numerical data when available.'
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          return_citations: true,
          search_recency_filter: 'year',
          stream: false
        })
      });

      if (!response.ok) {
        console.error(`Perplexity API error: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json() as PerplexityResponse;
    } catch (error) {
      console.error('Error calling Perplexity API:', error);
      return null;
    }
  }

  /**
   * Parse revenue from text response
   */
  private parseRevenue(text: string): { amount?: number; confidence: 'high' | 'medium' | 'low' } {
    // Look for specific revenue mentions
    const revenuePatterns = [
      /\$(\d+(?:\.\d+)?)\s*([BMK])?(?:\s*(?:million|billion|thousand))?\s*(?:in\s+)?(?:annual\s+)?(?:revenue|sales)/gi,
      /(?:revenue|sales)\s*(?:of|:)?\s*\$(\d+(?:\.\d+)?)\s*([BMK])?(?:\s*(?:million|billion|thousand))?/gi,
      /(?:annual|yearly)\s+(?:revenue|sales)[\s:]+\$(\d+(?:\.\d+)?)\s*([BMK])?/gi,
      /(\d+(?:\.\d+)?)\s*([BMK])?(?:\s*(?:million|billion|thousand))?\s+(?:in\s+)?(?:revenue|sales)/gi
    ];

    let bestMatch: { amount: number; confidence: 'high' | 'medium' | 'low' } | null = null;

    for (const pattern of revenuePatterns) {
      const matches = Array.from(text.matchAll(pattern));
      for (const match of matches) {
        const numStr = match[1];
        const multiplierChar = match[2];
        
        let amount = parseFloat(numStr);
        
        // Apply multiplier
        if (multiplierChar) {
          switch (multiplierChar.toUpperCase()) {
            case 'K': amount *= 1000; break;
            case 'M': amount *= 1000000; break;
            case 'B': amount *= 1000000000; break;
          }
        } else if (text.toLowerCase().includes('million')) {
          amount *= 1000000;
        } else if (text.toLowerCase().includes('billion')) {
          amount *= 1000000000;
        } else if (text.toLowerCase().includes('thousand')) {
          amount *= 1000;
        }

        // Determine confidence based on context
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        if (text.toLowerCase().includes('estimated') || text.toLowerCase().includes('approximately')) {
          confidence = 'medium';
        } else if (text.toLowerCase().includes('reported') || text.toLowerCase().includes('annual report')) {
          confidence = 'high';
        } else if (text.toLowerCase().includes('projected') || text.toLowerCase().includes('expected')) {
          confidence = 'low';
        }

        if (!bestMatch || confidence === 'high') {
          bestMatch = { amount, confidence };
        }
      }
    }

    return bestMatch || { confidence: 'low' };
  }

  /**
   * Parse employee count from text
   */
  private parseEmployeeCount(text: string): number | undefined {
    const employeePatterns = [
      /(\d+(?:,\d+)?)\s*(?:employees|staff|workers)/gi,
      /(?:employees|staff|team\s+of|workforce\s+of)\s*(\d+(?:,\d+)?)/gi,
      /(\d+)[-–]\s*(\d+)\s*(?:employees|staff)/gi // Range pattern
    ];

    for (const pattern of employeePatterns) {
      const match = text.match(pattern);
      if (match) {
        // Handle range by taking the average
        if (match[0].includes('-') || match[0].includes('–')) {
          const numbers = match[0].match(/\d+/g);
          if (numbers && numbers.length >= 2) {
            return Math.floor((parseInt(numbers[0]) + parseInt(numbers[1])) / 2);
          }
        }
        
        const numStr = match[0].match(/\d+(?:,\d+)?/);
        if (numStr) {
          return parseInt(numStr[0].replace(/,/g, ''));
        }
      }
    }

    return undefined;
  }

  /**
   * Parse years in business from text
   */
  private parseYearsInBusiness(text: string): number | undefined {
    const patterns = [
      /(?:founded|established|started)\s+(?:in\s+)?(\d{4})/gi,
      /(\d+)\s+years?\s+(?:in\s+business|of\s+experience|old)/gi,
      /(?:since|from)\s+(\d{4})/gi
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // If it's a year, calculate years since then
        if (match[1] && match[1].length === 4) {
          const year = parseInt(match[1]);
          const currentYear = new Date().getFullYear();
          if (year > 1900 && year <= currentYear) {
            return currentYear - year;
          }
        }
        // If it's already years
        else if (match[1]) {
          return parseInt(match[1]);
        }
      }
    }

    return undefined;
  }

  /**
   * Research a single lead
   */
  async researchLead(lead: Partial<Lead>): Promise<ResearchResult> {
    const cacheKey = `${lead.businessName}_${lead.ownerName}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result: ResearchResult = {
      sources: []
    };

    // Query 1: Company financial information
    if (lead.businessName) {
      const financialQuery = `${lead.businessName} revenue annual income financial information employees size`;
      const financialResponse = await this.callPerplexity(financialQuery);
      
      if (financialResponse) {
        const content = financialResponse.choices[0]?.message?.content || '';
        
        // Parse revenue
        const revenueData = this.parseRevenue(content);
        if (revenueData.amount) {
          result.estimatedRevenue = Math.floor(revenueData.amount);
          result.revenueConfidence = revenueData.confidence;
        }
        
        // Parse employee count
        result.employeeCount = this.parseEmployeeCount(content);
        
        // Parse years in business
        result.yearsInBusiness = this.parseYearsInBusiness(content);
        
        // Add citations as sources
        if (financialResponse.citations) {
          result.sources?.push(...financialResponse.citations);
        }
      }
    }

    // Query 2: Owner background (if owner name provided)
    if (lead.ownerName && lead.businessName) {
      const ownerQuery = `${lead.ownerName} ${lead.businessName} background professional history experience`;
      const ownerResponse = await this.callPerplexity(ownerQuery);
      
      if (ownerResponse) {
        const content = ownerResponse.choices[0]?.message?.content || '';
        
        // Extract owner background summary
        if (content.length > 50) {
          result.ownerBackground = content.substring(0, 500); // Limit to 500 chars
        }
        
        // Add citations
        if (ownerResponse.citations) {
          result.sources?.push(...ownerResponse.citations);
        }
      }
    }

    // Query 3: Business operations and industry details
    if (lead.businessName && lead.industry) {
      const operationsQuery = `${lead.businessName} ${lead.industry} business operations activities services products`;
      const operationsResponse = await this.callPerplexity(operationsQuery);
      
      if (operationsResponse) {
        const content = operationsResponse.choices[0]?.message?.content || '';
        
        // Extract business description
        if (content.length > 50) {
          result.businessDescription = content.substring(0, 300);
        }
        
        // Extract key activities (simplified - could be enhanced with NLP)
        const activities = content.match(/(?:provides?|offers?|specializes?\s+in|focuses?\s+on)\s+([^.]+)/gi);
        if (activities) {
          result.keyActivities = activities.slice(0, 5).map(a => a.substring(0, 100));
        }
        
        // Add citations
        if (operationsResponse.citations) {
          result.sources?.push(...operationsResponse.citations);
        }
      }
    }

    // If no revenue found but we have employee count, estimate based on industry
    if (!result.estimatedRevenue && result.employeeCount && lead.industry) {
      const multiplier = this.getIndustryRevenueMultiplier(lead.industry);
      result.estimatedRevenue = result.employeeCount * multiplier;
      result.revenueConfidence = 'low';
    }

    // Cache the result
    this.cache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Get industry-specific revenue per employee multiplier
   */
  private getIndustryRevenueMultiplier(industry: string): number {
    const industryLower = industry.toLowerCase();
    
    const multipliers: Record<string, number> = {
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

    // Find matching industry
    for (const [key, value] of Object.entries(multipliers)) {
      if (industryLower.includes(key)) {
        return value;
      }
    }

    // Default multiplier
    return 250000;
  }

  /**
   * Research multiple leads in batch
   */
  async researchBatch(leads: Partial<Lead>[], onProgress?: (current: number, total: number) => void): Promise<Map<string, ResearchResult>> {
    const results = new Map<string, ResearchResult>();
    
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (lead.id) {
        const research = await this.researchLead(lead);
        results.set(lead.id, research);
        
        if (onProgress) {
          onProgress(i + 1, leads.length);
        }
      }
    }
    
    return results;
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export const perplexityResearch = new PerplexityResearchEngine();