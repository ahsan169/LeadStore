import { 
  enrichmentServices, 
  getEnabledServicesByTier, 
  calculateEnrichmentCost,
  costThresholds,
  completenessThresholds 
} from './tiered-enrichment-config';
import { PerplexityEnricher } from './perplexity-enricher';
import { OpenAIEnricher } from './openai-enricher';
import { HunterVerifier } from './hunter-verifier';
import { NumverifyService } from './numverify-service';
import { ProxycurlEnricher } from './proxycurl-enricher';
import { AbstractAPIEnricher } from './abstractapi-enricher';
import { ClearbitEnricher } from './clearbit-enricher';
import { PeopleDataLabsEnricher } from './peopledatalabs-enricher';

interface EnrichmentResult {
  data: Record<string, any>;
  servicesUsed: string[];
  totalCost: number;
  completenessScore: number;
  tier: number;
  errors: string[];
}

interface LeadData {
  id: string;
  businessName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  estimatedValue?: number;
}

export class CostEfficientEnrichmentOrchestrator {
  private enrichers: Record<string, any> = {};
  
  constructor() {
    this.initializeEnrichers();
  }
  
  private initializeEnrichers() {
    // Initialize only enabled services
    if (enrichmentServices.perplexity.enabled) {
      this.enrichers.perplexity = new PerplexityEnricher();
    }
    if (enrichmentServices.openai.enabled) {
      this.enrichers.openai = new OpenAIEnricher();
    }
    if (enrichmentServices.hunter.enabled && process.env.HUNTER_API_KEY) {
      this.enrichers.hunter = new HunterVerifier();
    }
    if (enrichmentServices.numverify.enabled && process.env.NUMVERIFY_API_KEY) {
      this.enrichers.numverify = new NumverifyService();
    }
    if (enrichmentServices.proxycurl.enabled && process.env.PROXYCURL_API_KEY) {
      this.enrichers.proxycurl = new ProxycurlEnricher();
    }
    if (enrichmentServices.abstractapi.enabled && process.env.ABSTRACTAPI_KEY) {
      this.enrichers.abstractapi = new AbstractAPIEnricher();
    }
    if (enrichmentServices.clearbit.enabled && process.env.CLEARBIT_API_KEY) {
      this.enrichers.clearbit = new ClearbitEnricher();
    }
    if (enrichmentServices.peopledatalabs.enabled && process.env.PEOPLEDATALABS_API_KEY) {
      this.enrichers.peopledatalabs = new PeopleDataLabsEnricher();
    }
  }
  
  async enrichLead(leadData: LeadData): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      data: { ...leadData },
      servicesUsed: [],
      totalCost: 0,
      completenessScore: this.calculateCompleteness(leadData),
      tier: 0,
      errors: []
    };
    
    // Determine lead value for tier selection
    const leadValue = leadData.estimatedValue || 50; // Default $50 value
    
    // Try Tier 1 (Free/Low-Cost)
    if (result.completenessScore < completenessThresholds.tier1Minimum) {
      await this.enrichWithTier(1, leadData, result);
    }
    
    // Try Tier 2 if needed and cost-effective
    if (result.completenessScore < completenessThresholds.tier2Minimum && 
        result.totalCost < costThresholds.maxTier1CostPerLead) {
      await this.enrichWithTier(2, leadData, result);
    }
    
    // Try Tier 3 only for high-value leads
    if (result.completenessScore < completenessThresholds.tier3Target && 
        leadValue >= costThresholds.minLeadValueForTier3 &&
        result.totalCost < costThresholds.maxTier2CostPerLead) {
      await this.enrichWithTier(3, leadData, result);
    }
    
    return result;
  }
  
  private async enrichWithTier(tier: number, leadData: LeadData, result: EnrichmentResult) {
    const services = getEnabledServicesByTier(tier);
    
    for (const service of services) {
      // Check if we already have enough data
      if (result.completenessScore >= completenessThresholds[`tier${tier}Minimum` as keyof typeof completenessThresholds]) {
        break;
      }
      
      // Check cost threshold
      if (result.totalCost + service.costPerRequest > this.getMaxCostForLead(leadData.estimatedValue || 50)) {
        continue;
      }
      
      try {
        const enricher = this.enrichers[Object.keys(enrichmentServices).find(k => enrichmentServices[k] === service)!];
        if (!enricher) continue;
        
        const enrichedData = await this.callEnricher(enricher, service, leadData, result.data);
        
        if (enrichedData && Object.keys(enrichedData).length > 0) {
          result.data = this.mergeData(result.data, enrichedData);
          result.servicesUsed.push(service.name);
          result.totalCost += service.costPerRequest;
          result.completenessScore = this.calculateCompleteness(result.data);
          result.tier = Math.max(result.tier, tier);
        }
      } catch (error: any) {
        result.errors.push(`${service.name}: ${error.message}`);
      }
    }
  }
  
  private async callEnricher(enricher: any, service: any, leadData: LeadData, currentData: any): Promise<any> {
    // Route to appropriate enricher based on service
    switch (service.name) {
      case 'Perplexity Web Search':
        return await enricher.searchCompanyInfo(leadData.businessName, leadData.website);
        
      case 'OpenAI GPT-4':
        return await enricher.analyzeAndEnrich(currentData);
        
      case 'Hunter.io':
        if (leadData.email) {
          return await enricher.verifyEmail(leadData.email);
        }
        break;
        
      case 'Numverify':
        if (leadData.phone) {
          return await enricher.verifyPhone(leadData.phone);
        }
        break;
        
      case 'Proxycurl':
        return await enricher.enrichCompany(leadData.businessName, leadData.website);
        
      case 'AbstractAPI':
        return await enricher.enrichCompany(leadData.website || leadData.businessName);
        
      case 'Clearbit':
        return await enricher.enrichCompany(leadData.email || leadData.website);
        
      case 'PeopleDataLabs':
        return await enricher.enrichPerson(leadData.contactName, leadData.email);
    }
    
    return null;
  }
  
  private mergeData(existing: any, newData: any): any {
    const merged = { ...existing };
    
    for (const [key, value] of Object.entries(newData)) {
      if (value && (!merged[key] || this.isHigherQuality(value, merged[key]))) {
        merged[key] = value;
      }
    }
    
    return merged;
  }
  
  private isHigherQuality(newValue: any, existingValue: any): boolean {
    // Prefer verified data
    if (typeof newValue === 'object' && newValue.verified === true) return true;
    if (typeof existingValue === 'object' && existingValue.verified === true) return false;
    
    // Prefer longer, more detailed strings
    if (typeof newValue === 'string' && typeof existingValue === 'string') {
      return newValue.length > existingValue.length;
    }
    
    // Prefer non-null values
    return newValue !== null && existingValue === null;
  }
  
  private calculateCompleteness(data: any): number {
    const requiredFields = [
      'businessName', 'contactName', 'email', 'phone', 'website',
      'address', 'industry', 'company_size', 'revenue', 'founded'
    ];
    
    const filledFields = requiredFields.filter(field => 
      data[field] && data[field] !== '' && data[field] !== null
    );
    
    return filledFields.length / requiredFields.length;
  }
  
  private getMaxCostForLead(leadValue: number): number {
    // Spend up to 1% of lead value on enrichment
    return leadValue * 0.01;
  }
  
  // Get service status and availability
  getServiceStatus(): Record<string, { enabled: boolean; available: boolean; tier: number; cost: number }> {
    const status: any = {};
    
    Object.entries(enrichmentServices).forEach(([key, service]) => {
      status[key] = {
        enabled: service.enabled,
        available: !!this.enrichers[key],
        tier: service.tier,
        cost: service.costPerRequest,
        monthlyBase: service.monthlyBaseCost
      };
    });
    
    return status;
  }
  
  // Enable/disable services dynamically
  toggleService(serviceKey: string, enabled: boolean) {
    if (enrichmentServices[serviceKey]) {
      enrichmentServices[serviceKey].enabled = enabled;
      this.initializeEnrichers();
    }
  }
}