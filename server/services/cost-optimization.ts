import { storage } from "../storage";
import { eventBus } from "./event-bus";
import type { Lead, ApiKey, ApiUsage } from "@shared/schema";
import memoizee from 'memoizee';

interface ServiceCost {
  service: string;
  costPerCall: number;
  monthlyLimit?: number;
  currentUsage: number;
  remainingCredits: number;
  efficiency: number; // 0-1 score of how efficiently this service provides data
}

interface EnrichmentPlan {
  leadId: string;
  services: string[];
  totalCost: number;
  expectedDataGain: number; // 0-100 percentage
  creditEfficiency: number; // value per credit spent
  alternativePlan?: EnrichmentPlan;
}

interface CostMetrics {
  dailySpend: number;
  monthlySpend: number;
  averageCostPerLead: number;
  creditUtilization: number; // percentage of available credits used
  efficiencyScore: number; // 0-100 overall efficiency
  savingsFromOptimization: number;
}

export class CostOptimizationService {
  private serviceCosts: Map<string, ServiceCost> = new Map();
  private dailyBudget = 100; // Default daily budget in dollars
  private monthlyBudget = 2000; // Default monthly budget in dollars
  private currentDailySpend = 0;
  private currentMonthlySpend = 0;

  // Cache for cost calculations
  private costCache = memoizee(
    (services: string[]) => this.calculateCombinedCost(services),
    { maxAge: 300000 } // 5 minute cache
  );

  constructor() {
    this.initializeServiceCosts();
    this.loadCurrentUsage();
    this.setupEventListeners();
  }

  private initializeServiceCosts() {
    // Initialize service costs and efficiency ratings
    this.serviceCosts.set('numverify', {
      service: 'numverify',
      costPerCall: 0.01,
      monthlyLimit: 10000,
      currentUsage: 0,
      remainingCredits: 10000,
      efficiency: 0.95 // Very efficient for phone verification
    });

    this.serviceCosts.set('hunter', {
      service: 'hunter',
      costPerCall: 0.02,
      monthlyLimit: 5000,
      currentUsage: 0,
      remainingCredits: 5000,
      efficiency: 0.85 // Good for email finding
    });

    this.serviceCosts.set('clearbit', {
      service: 'clearbit',
      costPerCall: 0.05,
      monthlyLimit: 2000,
      currentUsage: 0,
      remainingCredits: 2000,
      efficiency: 0.90 // Excellent for company data
    });

    this.serviceCosts.set('proxycurl', {
      service: 'proxycurl',
      costPerCall: 0.03,
      monthlyLimit: 3000,
      currentUsage: 0,
      remainingCredits: 3000,
      efficiency: 0.80 // Good for social profiles
    });

    this.serviceCosts.set('abstractapi', {
      service: 'abstractapi',
      costPerCall: 0.02,
      monthlyLimit: 5000,
      currentUsage: 0,
      remainingCredits: 5000,
      efficiency: 0.75 // Good for general verification
    });

    this.serviceCosts.set('peopledatalabs', {
      service: 'peopledatalabs',
      costPerCall: 0.10,
      monthlyLimit: 1000,
      currentUsage: 0,
      remainingCredits: 1000,
      efficiency: 0.95 // Excellent but expensive
    });

    this.serviceCosts.set('perplexity', {
      service: 'perplexity',
      costPerCall: 0.03,
      monthlyLimit: 3000,
      currentUsage: 0,
      remainingCredits: 3000,
      efficiency: 0.70 // Good for research
    });

    this.serviceCosts.set('openai', {
      service: 'openai',
      costPerCall: 0.05,
      monthlyLimit: 2000,
      currentUsage: 0,
      remainingCredits: 2000,
      efficiency: 0.85 // Versatile AI analysis
    });

    this.serviceCosts.set('web_scraping', {
      service: 'web_scraping',
      costPerCall: 0.001, // Very cheap - our own infrastructure
      monthlyLimit: 100000,
      currentUsage: 0,
      remainingCredits: 100000,
      efficiency: 0.60 // Variable efficiency
    });

    this.serviceCosts.set('master_database', {
      service: 'master_database',
      costPerCall: 0.0001, // Almost free - internal lookup
      monthlyLimit: 1000000,
      currentUsage: 0,
      remainingCredits: 1000000,
      efficiency: 0.99 // Highest efficiency when data exists
    });
  }

  private async loadCurrentUsage() {
    try {
      // Load current API usage from database
      const usage = await storage.getCurrentApiUsage();
      
      if (usage) {
        this.currentDailySpend = usage.dailySpend || 0;
        this.currentMonthlySpend = usage.monthlySpend || 0;
        
        // Update service-specific usage
        for (const [service, stats] of Object.entries(usage.serviceUsage || {})) {
          const serviceCost = this.serviceCosts.get(service);
          if (serviceCost && typeof stats === 'object' && stats !== null) {
            serviceCost.currentUsage = (stats as any).count || 0;
            serviceCost.remainingCredits = (serviceCost.monthlyLimit || 0) - serviceCost.currentUsage;
          }
        }
      }
    } catch (error) {
      console.error('Error loading API usage:', error);
    }
  }

  private setupEventListeners() {
    eventBus.on('enrichment:started', this.handleEnrichmentStarted.bind(this));
    eventBus.on('enrichment:completed', this.handleEnrichmentCompleted.bind(this));
    
    // Reset daily/monthly counters
    setInterval(() => this.resetDailyCounters(), 24 * 60 * 60 * 1000); // Daily
    setInterval(() => this.resetMonthlyCounters(), 30 * 24 * 60 * 60 * 1000); // Monthly
  }

  async optimizeEnrichmentPlan(lead: Lead, requestedServices: string[]): Promise<EnrichmentPlan> {
    // Check if we can use master database first (almost free)
    const masterDbData = await this.checkMasterDatabase(lead);
    if (masterDbData && masterDbData.completeness > 0.8) {
      return {
        leadId: lead.id,
        services: ['master_database'],
        totalCost: 0.0001,
        expectedDataGain: masterDbData.completeness * 100,
        creditEfficiency: 1000, // Extremely efficient
        alternativePlan: undefined
      };
    }

    // Filter services by available credits and budget
    const availableServices = this.filterByBudget(requestedServices);
    
    // Calculate optimal combination
    const optimalPlan = this.findOptimalServiceCombination(lead, availableServices);
    
    // Generate alternative cheaper plan
    const alternativePlan = this.generateAlternativePlan(lead, availableServices, optimalPlan.totalCost * 0.5);
    
    return {
      ...optimalPlan,
      alternativePlan
    };
  }

  private filterByBudget(services: string[]): string[] {
    const remainingDailyBudget = this.dailyBudget - this.currentDailySpend;
    const remainingMonthlyBudget = this.monthlyBudget - this.currentMonthlySpend;
    
    return services.filter(service => {
      const cost = this.serviceCosts.get(service);
      if (!cost) return false;
      
      // Check if we have credits and budget
      return cost.remainingCredits > 0 &&
             cost.costPerCall <= remainingDailyBudget &&
             cost.costPerCall <= remainingMonthlyBudget;
    });
  }

  private findOptimalServiceCombination(lead: Lead, services: string[]): EnrichmentPlan {
    // Dynamic programming approach to find optimal service combination
    const combinations = this.generateServiceCombinations(services);
    let bestPlan: EnrichmentPlan | null = null;
    let bestEfficiency = 0;
    
    for (const combination of combinations) {
      const cost = this.calculateCombinedCost(combination);
      const dataGain = this.estimateDataGain(lead, combination);
      const efficiency = dataGain / cost; // Data gain per dollar
      
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestPlan = {
          leadId: lead.id,
          services: combination,
          totalCost: cost,
          expectedDataGain: dataGain,
          creditEfficiency: efficiency
        };
      }
    }
    
    return bestPlan || {
      leadId: lead.id,
      services: [],
      totalCost: 0,
      expectedDataGain: 0,
      creditEfficiency: 0
    };
  }

  private generateServiceCombinations(services: string[]): string[][] {
    const combinations: string[][] = [[]];
    
    for (const service of services) {
      const newCombinations = combinations.map(combo => [...combo, service]);
      combinations.push(...newCombinations);
    }
    
    // Filter out empty and overly expensive combinations
    return combinations.filter(combo => {
      if (combo.length === 0) return false;
      const cost = this.calculateCombinedCost(combo);
      return cost <= this.dailyBudget - this.currentDailySpend;
    });
  }

  private calculateCombinedCost(services: string[]): number {
    return services.reduce((total, service) => {
      const cost = this.serviceCosts.get(service);
      return total + (cost ? cost.costPerCall : 0);
    }, 0);
  }

  private estimateDataGain(lead: Lead, services: string[]): number {
    let totalGain = 0;
    const currentCompleteness = this.calculateLeadCompleteness(lead);
    
    for (const service of services) {
      const serviceCost = this.serviceCosts.get(service);
      if (!serviceCost) continue;
      
      // Estimate how much data this service will add
      const serviceGain = this.estimateServiceDataGain(lead, service);
      totalGain += serviceGain * serviceCost.efficiency;
    }
    
    // Account for diminishing returns
    const diminishingFactor = Math.max(0.5, 1 - (currentCompleteness / 100));
    
    return Math.min(100, currentCompleteness + (totalGain * diminishingFactor));
  }

  private calculateLeadCompleteness(lead: Lead): number {
    const fields = [
      'businessName', 'ownerName', 'phone', 'email', 'address',
      'city', 'state', 'industry', 'annualRevenue', 'timeInBusiness',
      'creditScore', 'websiteUrl', 'linkedinUrl', 'yearFounded',
      'employeeCount', 'businessDescription'
    ];
    
    const filledFields = fields.filter(field => {
      const value = lead[field as keyof Lead];
      return value !== null && value !== undefined && value !== '';
    });
    
    return (filledFields.length / fields.length) * 100;
  }

  private estimateServiceDataGain(lead: Lead, service: string): number {
    // Estimate how much data each service typically adds
    const gains: Record<string, Record<string, number>> = {
      'numverify': {
        phone: 20,
        phoneVerified: 10
      },
      'hunter': {
        email: 25,
        ownerName: 15
      },
      'clearbit': {
        industry: 20,
        annualRevenue: 20,
        employeeCount: 15,
        websiteUrl: 10,
        businessDescription: 15
      },
      'proxycurl': {
        linkedinUrl: 20,
        socialProfiles: 15,
        ownerBackground: 15
      },
      'abstractapi': {
        address: 15,
        city: 10,
        state: 10
      },
      'peopledatalabs': {
        ownerName: 20,
        email: 20,
        phone: 15,
        socialProfiles: 20,
        ownerBackground: 20
      },
      'perplexity': {
        businessDescription: 20,
        industry: 15,
        newsAndMedia: 20
      },
      'openai': {
        businessInsights: 25,
        riskAssessment: 20,
        opportunityScore: 20
      }
    };
    
    const serviceGains = gains[service] || {};
    let totalGain = 0;
    
    for (const [field, gain] of Object.entries(serviceGains)) {
      const fieldValue = lead[field as keyof Lead];
      if (!fieldValue || fieldValue === '') {
        totalGain += gain;
      }
    }
    
    return totalGain;
  }

  private generateAlternativePlan(lead: Lead, services: string[], maxCost: number): EnrichmentPlan | undefined {
    // Generate a cheaper alternative plan
    const cheapServices = services
      .filter(s => {
        const cost = this.serviceCosts.get(s);
        return cost && cost.costPerCall <= maxCost;
      })
      .sort((a, b) => {
        const costA = this.serviceCosts.get(a)!;
        const costB = this.serviceCosts.get(b)!;
        return (costB.efficiency / costB.costPerCall) - (costA.efficiency / costA.costPerCall);
      });
    
    const alternativeServices: string[] = [];
    let totalCost = 0;
    
    for (const service of cheapServices) {
      const cost = this.serviceCosts.get(service)!;
      if (totalCost + cost.costPerCall <= maxCost) {
        alternativeServices.push(service);
        totalCost += cost.costPerCall;
      }
    }
    
    if (alternativeServices.length === 0) return undefined;
    
    return {
      leadId: lead.id,
      services: alternativeServices,
      totalCost,
      expectedDataGain: this.estimateDataGain(lead, alternativeServices),
      creditEfficiency: this.estimateDataGain(lead, alternativeServices) / totalCost
    };
  }

  private async checkMasterDatabase(lead: Lead): Promise<any> {
    // Check if we have data in master database (nearly free)
    try {
      const result = await storage.searchMasterDatabase({
        businessName: lead.businessName,
        ownerName: lead.ownerName,
        phone: lead.phone,
        email: lead.email
      });
      
      return result;
    } catch (error) {
      console.error('Error checking master database:', error);
      return null;
    }
  }

  async trackServiceUsage(service: string, cost: number, success: boolean) {
    const serviceCost = this.serviceCosts.get(service);
    if (serviceCost) {
      serviceCost.currentUsage++;
      serviceCost.remainingCredits = Math.max(0, serviceCost.remainingCredits - 1);
      
      // Update efficiency based on success rate
      if (success) {
        serviceCost.efficiency = serviceCost.efficiency * 0.95 + 0.05;
      } else {
        serviceCost.efficiency = serviceCost.efficiency * 0.95;
      }
    }
    
    // Update spending
    this.currentDailySpend += cost;
    this.currentMonthlySpend += cost;
    
    // Persist to database
    await storage.trackApiUsage({
      service,
      cost,
      success,
      dailySpend: this.currentDailySpend,
      monthlySpend: this.currentMonthlySpend
    });
    
    // Emit event for monitoring
    eventBus.emit('cost:tracked', {
      service,
      cost,
      remainingDaily: this.dailyBudget - this.currentDailySpend,
      remainingMonthly: this.monthlyBudget - this.currentMonthlySpend
    });
  }

  getServiceStatus(service: string): ServiceCost | undefined {
    return this.serviceCosts.get(service);
  }

  getAllServiceStatuses(): ServiceCost[] {
    return Array.from(this.serviceCosts.values());
  }

  getCostMetrics(): CostMetrics {
    const totalLeads = 1000; // This would come from database
    const optimizedLeads = 800; // Leads processed with optimization
    
    return {
      dailySpend: this.currentDailySpend,
      monthlySpend: this.currentMonthlySpend,
      averageCostPerLead: this.currentMonthlySpend / totalLeads,
      creditUtilization: (this.currentMonthlySpend / this.monthlyBudget) * 100,
      efficiencyScore: this.calculateOverallEfficiency(),
      savingsFromOptimization: this.calculateSavings(optimizedLeads)
    };
  }

  private calculateOverallEfficiency(): number {
    const efficiencies = Array.from(this.serviceCosts.values())
      .map(s => s.efficiency);
    
    if (efficiencies.length === 0) return 0;
    
    return (efficiencies.reduce((sum, e) => sum + e, 0) / efficiencies.length) * 100;
  }

  private calculateSavings(optimizedLeads: number): number {
    // Calculate how much we saved by using optimization
    const avgCostWithoutOptimization = 0.28; // Cost if we used all services
    const avgCostWithOptimization = this.currentMonthlySpend / optimizedLeads;
    
    return (avgCostWithoutOptimization - avgCostWithOptimization) * optimizedLeads;
  }

  async suggestCostReductions(): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Analyze service usage patterns
    for (const [service, cost] of this.serviceCosts) {
      // Suggest dropping low-efficiency services
      if (cost.efficiency < 0.5 && cost.currentUsage > 10) {
        suggestions.push(`Consider reducing usage of ${service} (efficiency: ${(cost.efficiency * 100).toFixed(1)}%)`);
      }
      
      // Suggest alternatives for expensive services
      if (cost.costPerCall > 0.05 && cost.currentUsage > 100) {
        suggestions.push(`${service} is expensive ($${cost.costPerCall}/call). Consider using cheaper alternatives first.`);
      }
      
      // Warn about approaching limits
      if (cost.remainingCredits < (cost.monthlyLimit || 0) * 0.1) {
        suggestions.push(`Warning: ${service} has only ${cost.remainingCredits} credits remaining this month`);
      }
    }
    
    // Suggest using master database more
    if (this.serviceCosts.get('master_database')!.currentUsage < 100) {
      suggestions.push('Increase master database usage for nearly-free lookups');
    }
    
    // Suggest batch processing for better rates
    if (this.currentDailySpend > this.dailyBudget * 0.8) {
      suggestions.push('Consider batch processing leads during off-peak hours for better rates');
    }
    
    return suggestions;
  }

  setBudgets(daily: number, monthly: number) {
    this.dailyBudget = daily;
    this.monthlyBudget = monthly;
  }

  private async handleEnrichmentStarted(data: { leadId: string, services: string[] }) {
    // Pre-allocate budget for enrichment
    const estimatedCost = this.calculateCombinedCost(data.services);
    
    if (estimatedCost > this.dailyBudget - this.currentDailySpend) {
      console.warn(`Enrichment may exceed daily budget. Estimated: $${estimatedCost}, Remaining: $${this.dailyBudget - this.currentDailySpend}`);
    }
  }

  private async handleEnrichmentCompleted(data: { leadId: string, services: string[], actualCost: number }) {
    // Track actual costs vs estimated
    const estimatedCost = this.calculateCombinedCost(data.services);
    const variance = data.actualCost - estimatedCost;
    
    if (Math.abs(variance) > estimatedCost * 0.1) {
      console.log(`Cost variance detected for lead ${data.leadId}: Estimated $${estimatedCost}, Actual $${data.actualCost}`);
    }
  }

  private resetDailyCounters() {
    this.currentDailySpend = 0;
    console.log('Daily spending counters reset');
  }

  private resetMonthlyCounters() {
    this.currentMonthlySpend = 0;
    
    // Reset service counters
    for (const service of this.serviceCosts.values()) {
      service.currentUsage = 0;
      service.remainingCredits = service.monthlyLimit || 0;
    }
    
    console.log('Monthly spending counters reset');
  }

  async optimizeBatchEnrichment(leads: Lead[]): Promise<Map<string, EnrichmentPlan>> {
    const plans = new Map<string, EnrichmentPlan>();
    
    // Sort leads by potential value
    const sortedLeads = leads.sort((a, b) => {
      const valueA = this.estimateLeadValue(a);
      const valueB = this.estimateLeadValue(b);
      return valueB - valueA;
    });
    
    let remainingBudget = this.dailyBudget - this.currentDailySpend;
    
    for (const lead of sortedLeads) {
      if (remainingBudget <= 0) break;
      
      // Get optimal plan within remaining budget
      const plan = await this.optimizeEnrichmentPlan(lead, this.getDefaultServices());
      
      if (plan.totalCost <= remainingBudget) {
        plans.set(lead.id, plan);
        remainingBudget -= plan.totalCost;
      } else if (plan.alternativePlan && plan.alternativePlan.totalCost <= remainingBudget) {
        plans.set(lead.id, plan.alternativePlan);
        remainingBudget -= plan.alternativePlan.totalCost;
      }
    }
    
    return plans;
  }

  private estimateLeadValue(lead: Lead): number {
    let value = 0;
    
    // Higher value for leads with revenue data
    if (lead.annualRevenue) {
      value += parseFloat(lead.annualRevenue) / 10000;
    }
    
    // Higher value for urgent leads
    if (lead.urgencyLevel === 'Immediate') value += 50;
    else if (lead.urgencyLevel === 'This Week') value += 30;
    else if (lead.urgencyLevel === 'This Month') value += 20;
    
    // Higher value for leads with UCC data
    if (lead.uccNumber) value += 40;
    
    // Quality score contribution
    if (lead.qualityScore) value += lead.qualityScore / 2;
    
    return value;
  }

  private getDefaultServices(): string[] {
    return ['master_database', 'numverify', 'hunter', 'clearbit', 'proxycurl'];
  }
}

// Export singleton instance
export const costOptimization = new CostOptimizationService();