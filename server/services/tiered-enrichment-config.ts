// Tiered Enrichment Configuration
// Cost-efficient approach: Try free/cheap services first, premium only when needed

export interface EnrichmentService {
  name: string;
  tier: number;
  costPerRequest: number;
  monthlyBaseCost: number;
  fields: string[];
  requiresApiKey: boolean;
  enabled: boolean;
  rateLimit: number; // requests per second
}

export const enrichmentServices: Record<string, EnrichmentService> = {
  // Tier 1: Free/Low-Cost (Try First)
  perplexity: {
    name: 'Perplexity Web Search',
    tier: 1,
    costPerRequest: 0.002, // ~$0.002 per search
    monthlyBaseCost: 0,
    fields: ['company_info', 'industry', 'recent_news', 'website', 'social_media'],
    requiresApiKey: true,
    enabled: true,
    rateLimit: 10
  },
  
  openai: {
    name: 'OpenAI GPT-4',
    tier: 1,
    costPerRequest: 0.01, // ~$0.01 per enrichment
    monthlyBaseCost: 0,
    fields: ['insights', 'lead_quality', 'recommendations', 'risk_analysis'],
    requiresApiKey: true,
    enabled: true,
    rateLimit: 50
  },
  
  hunter: {
    name: 'Hunter.io',
    tier: 1,
    costPerRequest: 0.005, // ~$0.005 per verification
    monthlyBaseCost: 34, // Starter plan
    fields: ['email', 'email_verified', 'email_confidence'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 10
  },
  
  numverify: {
    name: 'Numverify',
    tier: 1,
    costPerRequest: 0, // Free tier: 250/month
    monthlyBaseCost: 0,
    fields: ['phone', 'phone_verified', 'phone_type', 'phone_carrier'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 1
  },
  
  // Tier 2: Mid-Cost (When Tier 1 Incomplete)
  proxycurl: {
    name: 'Proxycurl',
    tier: 2,
    costPerRequest: 0.01, // ~$0.01 per profile
    monthlyBaseCost: 49,
    fields: ['linkedin_url', 'job_title', 'company_size', 'employee_count', 'founding_date', 'headquarters', 'specialties'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 10
  },
  
  abstractapi: {
    name: 'AbstractAPI',
    tier: 2,
    costPerRequest: 0.001, // Very cheap
    monthlyBaseCost: 9,
    fields: ['company_domain', 'company_logo', 'company_description', 'year_founded', 'employees_range'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 50
  },
  
  // Tier 3: Premium (High-Value Leads Only)
  clearbit: {
    name: 'Clearbit',
    tier: 3,
    costPerRequest: 0.75, // ~$0.75 per enrichment
    monthlyBaseCost: 0, // Pay-as-you-go
    fields: ['full_company_data', 'technographics', 'firmographics', 'person_data', 'tags', 'tech_stack'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 10
  },
  
  peopledatalabs: {
    name: 'PeopleDataLabs',
    tier: 3,
    costPerRequest: 0.05, // ~$0.05 per match
    monthlyBaseCost: 0, // Pay-per-request
    fields: ['full_person_profile', 'work_history', 'education', 'skills', 'certifications'],
    requiresApiKey: true,
    enabled: false, // Need API key
    rateLimit: 100
  }
};

// Cost thresholds for automatic tier escalation
export const costThresholds = {
  maxTier1CostPerLead: 0.02, // Max $0.02 for Tier 1
  maxTier2CostPerLead: 0.10, // Max $0.10 for Tier 2
  minLeadValueForTier3: 100, // Only use Tier 3 for leads worth $100+
};

// Data completeness thresholds
export const completenessThresholds = {
  tier1Minimum: 0.5, // 50% data completeness from Tier 1
  tier2Minimum: 0.75, // 75% data completeness from Tier 2
  tier3Target: 0.95, // 95% target from Tier 3
};

// Get enabled services by tier
export function getEnabledServicesByTier(tier: number): EnrichmentService[] {
  return Object.values(enrichmentServices)
    .filter(s => s.enabled && s.tier === tier)
    .sort((a, b) => a.costPerRequest - b.costPerRequest);
}

// Calculate enrichment cost for a lead
export function calculateEnrichmentCost(servicesUsed: string[]): number {
  return servicesUsed.reduce((total, serviceId) => {
    const service = enrichmentServices[serviceId];
    return total + (service?.costPerRequest || 0);
  }, 0);
}

// Estimate monthly costs based on volume
export function estimateMonthlyCosts(leadsPerMonth: number): {
  fixed: number;
  variable: number;
  total: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let fixed = 0;
  let variable = 0;
  
  Object.entries(enrichmentServices).forEach(([id, service]) => {
    if (service.enabled) {
      fixed += service.monthlyBaseCost;
      const estimatedUsage = leadsPerMonth * (service.tier === 1 ? 1 : service.tier === 2 ? 0.3 : 0.05);
      const variableCost = estimatedUsage * service.costPerRequest;
      variable += variableCost;
      breakdown[id] = service.monthlyBaseCost + variableCost;
    }
  });
  
  return { fixed, variable, total: fixed + variable, breakdown };
}