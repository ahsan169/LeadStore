/**
 * Lead Discovery Engine
 * 
 * Automatically discovers and generates new leads from legal public sources:
 * - SEC filings (IPOs, acquisitions, executive changes)
 * - Business registrations (new businesses)
 * - News sources (funding announcements, expansions)
 * - Industry directories
 * - Public job postings (company growth signals)
 * 
 * Runs continuously in background, adding quality leads to the database
 */

import { publicDataAggregator } from './public-data-aggregator';
import { advancedVerification } from './advanced-verification';
import { enhancedLeadScoring } from './enhanced-lead-scoring';
import { dataProviderManager } from './data-provider-framework';
import { storage } from '../storage';
import type { InsertLead } from '../../shared/schema';

export interface DiscoverySource {
  name: string;
  type: 'sec_filings' | 'business_registry' | 'news' | 'directory' | 'job_postings';
  enabled: boolean;
  lastRun?: Date;
  totalDiscovered: number;
}

export interface DiscoveryResult {
  source: string;
  companiesFound: number;
  leadsCreated: number;
  errors: number;
  duration: number;
  timestamp: Date;
}

export class LeadDiscoveryEngine {
  private isRunning: boolean = false;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private sources: Map<string, DiscoverySource>;
  private discoveryHistory: DiscoveryResult[] = [];

  constructor() {
    this.sources = new Map();
    this.initializeSources();
  }

  /**
   * Initialize discovery sources
   */
  private initializeSources() {
    this.sources.set('sec_filings', {
      name: 'SEC Filings',
      type: 'sec_filings',
      enabled: true,
      totalDiscovered: 0
    });

    this.sources.set('business_registry', {
      name: 'Business Registries',
      type: 'business_registry',
      enabled: false, // Requires state-specific APIs
      totalDiscovered: 0
    });

    this.sources.set('news', {
      name: 'Business News',
      type: 'news',
      enabled: false, // Requires news API key
      totalDiscovered: 0
    });

    console.log('[LeadDiscovery] Discovery sources initialized');
  }

  /**
   * Start automatic lead discovery
   */
  start(intervalMinutes: number = 60) {
    if (this.isRunning) {
      console.log('[LeadDiscovery] Already running');
      return;
    }

    console.log(`[LeadDiscovery] Starting automatic discovery (every ${intervalMinutes} minutes)`);
    this.isRunning = true;

    // Run immediately
    this.discoverLeads();

    // Schedule periodic discovery
    this.discoveryInterval = setInterval(() => {
      this.discoverLeads();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop automatic discovery
   */
  stop() {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.isRunning = false;
    console.log('[LeadDiscovery] Stopped automatic discovery');
  }

  /**
   * Discover leads from all enabled sources
   */
  async discoverLeads(): Promise<DiscoveryResult[]> {
    console.log('[LeadDiscovery] Starting discovery cycle...');
    const startTime = Date.now();
    const results: DiscoveryResult[] = [];

    // Run each enabled source
    for (const [key, source] of Array.from(this.sources.entries())) {
      if (!source.enabled) continue;

      try {
        const result = await this.discoverFromSource(source);
        results.push(result);
        this.discoveryHistory.push(result);
        
        // Update source stats
        source.lastRun = new Date();
        source.totalDiscovered += result.companiesFound;

      } catch (error: any) {
        console.error(`[LeadDiscovery] Error in ${source.name}:`, error.message);
        results.push({
          source: source.name,
          companiesFound: 0,
          leadsCreated: 0,
          errors: 1,
          duration: 0,
          timestamp: new Date()
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const totalCompanies = results.reduce((sum, r) => sum + r.companiesFound, 0);
    const totalLeads = results.reduce((sum, r) => sum + r.leadsCreated, 0);

    console.log(`[LeadDiscovery] Discovery cycle complete: ${totalCompanies} companies, ${totalLeads} leads created in ${totalDuration}ms`);

    // Trim history to last 100 entries
    if (this.discoveryHistory.length > 100) {
      this.discoveryHistory = this.discoveryHistory.slice(-100);
    }

    return results;
  }

  /**
   * Discover leads from a specific source
   */
  private async discoverFromSource(source: DiscoverySource): Promise<DiscoveryResult> {
    const startTime = Date.now();
    let companiesFound = 0;
    let leadsCreated = 0;
    let errors = 0;

    try {
      switch (source.type) {
        case 'sec_filings':
          ({ companiesFound, leadsCreated } = await this.discoverFromSecFilings());
          break;
        
        case 'business_registry':
          ({ companiesFound, leadsCreated } = await this.discoverFromBusinessRegistries());
          break;
        
        case 'news':
          ({ companiesFound, leadsCreated } = await this.discoverFromNews());
          break;
        
        default:
          console.warn(`[LeadDiscovery] Unknown source type: ${source.type}`);
      }
    } catch (error: any) {
      console.error(`[LeadDiscovery] Error discovering from ${source.name}:`, error.message);
      errors++;
    }

    return {
      source: source.name,
      companiesFound,
      leadsCreated,
      errors,
      duration: Date.now() - startTime,
      timestamp: new Date()
    };
  }

  /**
   * Discover companies from SEC filings
   */
  private async discoverFromSecFilings(): Promise<{ companiesFound: number; leadsCreated: number }> {
    console.log('[LeadDiscovery] Searching SEC filings for new companies...');

    // In production, this would query SEC EDGAR for recent filings
    // For now, return placeholder
    
    // Example: Find companies with recent IPO filings, S-1 forms, etc.
    const recentFilings = await this.fetchRecentSecFilings();
    
    let companiesFound = recentFilings.length;
    let leadsCreated = 0;

    for (const filing of recentFilings) {
      try {
        // Check if company already exists
        const existingLeads = await (storage as any).searchLeads({ companyName: filing.companyName });
        if (existingLeads && existingLeads.length > 0) {
          console.log(`[LeadDiscovery] Company already exists: ${filing.companyName}`);
          continue;
        }

        // Aggregate data from public sources
        const companyData = await publicDataAggregator.aggregateCompanyData(filing.companyName);
        
        if (companyData.confidence < 50) {
          console.log(`[LeadDiscovery] Low confidence data for ${filing.companyName}, skipping`);
          continue;
        }

        // Create lead
        const lead = await this.createLeadFromDiscovery({
          companyName: filing.companyName,
          website: companyData.website,
          phone: companyData.phone,
          email: companyData.email,
          industry: companyData.industry,
          revenue: companyData.revenue ? parseInt(companyData.revenue) : undefined,
          discoverySource: 'SEC Filing',
          publicData: companyData
        });

        if (lead) {
          leadsCreated++;
        }

      } catch (error: any) {
        console.error(`[LeadDiscovery] Error processing ${filing.companyName}:`, error.message);
      }
    }

    console.log(`[LeadDiscovery] SEC Filings: ${companiesFound} found, ${leadsCreated} leads created`);
    return { companiesFound, leadsCreated };
  }

  /**
   * Discover companies from business registries
   */
  private async discoverFromBusinessRegistries(): Promise<{ companiesFound: number; leadsCreated: number }> {
    console.log('[LeadDiscovery] Searching business registries...');
    
    // This would integrate with state business registry APIs
    // For now, return placeholder
    
    return { companiesFound: 0, leadsCreated: 0 };
  }

  /**
   * Discover companies from business news
   */
  private async discoverFromNews(): Promise<{ companiesFound: number; leadsCreated: number }> {
    console.log('[LeadDiscovery] Searching business news...');
    
    // This would integrate with news APIs (NewsAPI, etc.)
    // Look for funding announcements, expansions, new businesses
    
    return { companiesFound: 0, leadsCreated: 0 };
  }

  /**
   * Fetch recent SEC filings
   */
  private async fetchRecentSecFilings(): Promise<Array<{ companyName: string; filingType: string }>> {
    // In production, query SEC EDGAR API for recent filings
    // For now, return empty array
    return [];
  }

  /**
   * Create a lead from discovered company data
   */
  private async createLeadFromDiscovery(data: {
    companyName: string;
    website?: string;
    phone?: string;
    email?: string;
    industry?: string;
    revenue?: number;
    discoverySource: string;
    publicData?: any;
  }): Promise<boolean> {
    try {
      // Score the lead
      const scoring = await enhancedLeadScoring.calculateEnhancedScore({
        industry: data.industry,
        revenue: data.revenue,
        emailVerified: false,
        phoneVerified: false,
        dataCompleteness: this.calculateDataCompleteness(data)
      });

      // Only create leads with minimum quality score
      if (scoring.totalScore < 40) {
        console.log(`[LeadDiscovery] Lead score too low (${scoring.totalScore}), skipping`);
        return false;
      }

      // Create the lead
      const lead: InsertLead = {
        businessName: data.companyName,
        ownerName: data.companyName,
        website: data.website,
        phone: data.phone || '',
        email: data.email || '',
        industry: data.industry,
        annualRevenue: data.revenue ? String(data.revenue) : undefined,
        qualityScore: scoring.totalScore,
        source: `Auto-discovered: ${data.discoverySource}`,
        verificationStatus: 'pending'
      } as any;

      await storage.createLead(lead);
      
      console.log(`[LeadDiscovery] Created lead: ${data.companyName} (Score: ${scoring.totalScore})`);
      return true;

    } catch (error: any) {
      console.error(`[LeadDiscovery] Error creating lead:`, error.message);
      return false;
    }
  }

  /**
   * Calculate data completeness percentage
   */
  private calculateDataCompleteness(data: any): number {
    const fields = ['companyName', 'website', 'phone', 'email', 'industry', 'revenue'];
    const filled = fields.filter(field => data[field]).length;
    return Math.round((filled / fields.length) * 100);
  }

  /**
   * Get discovery statistics
   */
  getStatistics() {
    return {
      isRunning: this.isRunning,
      sources: Array.from(this.sources.values()),
      totalDiscovered: Array.from(this.sources.values()).reduce((sum, s) => sum + s.totalDiscovered, 0),
      recentHistory: this.discoveryHistory.slice(-10)
    };
  }

  /**
   * Enable/disable a discovery source
   */
  toggleSource(sourceKey: string, enabled: boolean) {
    const source = this.sources.get(sourceKey);
    if (source) {
      source.enabled = enabled;
      console.log(`[LeadDiscovery] ${source.name} ${enabled ? 'enabled' : 'disabled'}`);
    }
  }
}

// Singleton instance
export const leadDiscoveryEngine = new LeadDiscoveryEngine();

// Optionally auto-start discovery (disabled by default - admin can enable)
// leadDiscoveryEngine.start(60); // Run every 60 minutes
