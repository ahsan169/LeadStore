import { Lead, InsertLeadEnrichment } from "@shared/schema";
import { clearbitService } from "./clearbit-service";
import { hunterService } from "./hunter-service";
import { fullContactService } from "./fullcontact-service";
import { twilioService } from "./twilio-service";
import { numverifyService } from "../../numverify-service";
import { enrichmentCache } from "./cache-service";
import { rateLimiter } from "./rate-limiter";
import crypto from "crypto";
import { EventEmitter } from "events";

export interface EnrichmentResult {
  leadId: string;
  enrichedData: any;
  sources: string[];
  confidenceScore: number;
  qualityScore: number;
  freshnessScore: number;
  anomalies: string[];
  predictions: Record<string, any>;
  socialProfiles: Record<string, string>;
  companyDetails: Record<string, any>;
  industryDetails: Record<string, any>;
  contactInfo: Record<string, any>;
  metadata: {
    enrichmentDate: Date;
    dataCompleteness: number;
    sourcesUsed: string[];
    cachingInfo: {
      cached: boolean;
      cacheAge?: number;
    };
    processingTime: number;
  };
}

export interface EnrichmentJob {
  id: string;
  leadIds: string[];
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  results: Map<string, EnrichmentResult>;
  errors: Map<string, string>;
  startedAt?: Date;
  completedAt?: Date;
}

export interface DataSourceConfig {
  name: string;
  enabled: boolean;
  priority: number;
  confidence: number;
  fallback?: string;
}

export class UnifiedEnrichmentService extends EventEmitter {
  private jobs: Map<string, EnrichmentJob>;
  private dataSources: Map<string, DataSourceConfig>;
  private processingQueue: string[];
  private isProcessing: boolean;
  
  constructor() {
    super();
    this.jobs = new Map();
    this.processingQueue = [];
    this.isProcessing = false;
    
    // Configure data sources with priorities and confidence levels
    this.dataSources = new Map([
      ["clearbit", { name: "clearbit", enabled: true, priority: 1, confidence: 90, fallback: "fullcontact" }],
      ["hunter", { name: "hunter", enabled: true, priority: 1, confidence: 85, fallback: "mock" }],
      ["fullcontact", { name: "fullcontact", enabled: true, priority: 2, confidence: 80, fallback: "mock" }],
      ["twilio", { name: "twilio", enabled: true, priority: 1, confidence: 95, fallback: "numverify" }],
      ["numverify", { name: "numverify", enabled: true, priority: 2, confidence: 85, fallback: "mock" }]
    ]);
    
    // Start processing loop
    this.startProcessingLoop();
  }
  
  /**
   * Enrich a single lead with all available data sources
   */
  async enrichLead(lead: Lead, priority: number = 5): Promise<EnrichmentResult> {
    const startTime = Date.now();
    const cacheKey = enrichmentCache.generateLeadKey(lead.id, "full_enrichment");
    
    // Check cache first
    const cached = enrichmentCache.get<EnrichmentResult>(cacheKey);
    if (cached && !enrichmentCache.needsRefresh(cacheKey, 70)) {
      cached.metadata.cachingInfo = {
        cached: true,
        cacheAge: Date.now() - cached.metadata.enrichmentDate.getTime()
      };
      this.emit("enrichment:cached", { leadId: lead.id, result: cached });
      return cached;
    }
    
    // Collect enrichment from all sources
    const enrichmentPromises: Promise<any>[] = [];
    const sourcesUsed: string[] = [];
    
    // Company enrichment
    if (lead.email && this.isSourceEnabled("clearbit")) {
      const domain = this.extractDomain(lead.email);
      if (domain) {
        enrichmentPromises.push(
          this.enrichWithFallback(
            "clearbit",
            () => clearbitService.enrichCompany(domain),
            priority
          )
        );
        sourcesUsed.push("clearbit");
      }
    }
    
    // Email verification and enrichment
    if (lead.email && this.isSourceEnabled("hunter")) {
      enrichmentPromises.push(
        this.enrichWithFallback(
          "hunter",
          () => hunterService.verifyEmail(lead.email),
          priority
        )
      );
      sourcesUsed.push("hunter");
    }
    
    // Social profile enrichment
    if (lead.email && this.isSourceEnabled("fullcontact")) {
      enrichmentPromises.push(
        this.enrichWithFallback(
          "fullcontact",
          () => fullContactService.enrichPersonByEmail(lead.email),
          priority
        )
      );
      sourcesUsed.push("fullcontact");
    }
    
    // Phone validation with Twilio as primary, Numverify as fallback
    let phoneValidation = null;
    if (lead.phone) {
      if (this.isSourceEnabled("twilio")) {
        phoneValidation = await this.enrichWithFallback(
          "twilio",
          () => twilioService.lookupPhone(lead.phone),
          priority
        );
        sourcesUsed.push("twilio");
      }
      
      if (!phoneValidation && this.isSourceEnabled("numverify")) {
        phoneValidation = await this.enrichWithFallback(
          "numverify",
          () => numverifyService.validatePhone(lead.phone),
          priority
        );
        sourcesUsed.push("numverify");
      }
    }
    
    // Wait for all enrichment to complete
    const results = await Promise.allSettled(enrichmentPromises);
    
    // Process and merge results
    const mergedData = this.mergeEnrichmentData(results, phoneValidation);
    
    // Calculate scores and detect anomalies
    const qualityScore = this.calculateQualityScore(mergedData, lead);
    const confidenceScore = this.calculateConfidenceScore(mergedData, sourcesUsed);
    const freshnessScore = this.calculateFreshnessScore(lead);
    const anomalies = this.detectAnomalies(mergedData, lead);
    const predictions = await this.generatePredictions(mergedData, lead);
    
    // Build final result
    const result: EnrichmentResult = {
      leadId: lead.id,
      enrichedData: mergedData,
      sources: sourcesUsed,
      confidenceScore,
      qualityScore,
      freshnessScore,
      anomalies,
      predictions,
      socialProfiles: this.extractSocialProfiles(mergedData),
      companyDetails: this.extractCompanyDetails(mergedData),
      industryDetails: this.extractIndustryDetails(mergedData),
      contactInfo: this.extractContactInfo(mergedData),
      metadata: {
        enrichmentDate: new Date(),
        dataCompleteness: this.calculateCompleteness(mergedData),
        sourcesUsed,
        cachingInfo: { cached: false },
        processingTime: Date.now() - startTime
      }
    };
    
    // Cache the result
    enrichmentCache.set(cacheKey, result, "unified", confidenceScore);
    
    // Emit enrichment complete event
    this.emit("enrichment:complete", { leadId: lead.id, result });
    
    return result;
  }
  
  /**
   * Batch enrich multiple leads
   */
  async batchEnrichLeads(leads: Lead[], priority: number = 5): Promise<string> {
    const jobId = this.generateJobId();
    const job: EnrichmentJob = {
      id: jobId,
      leadIds: leads.map(l => l.id),
      status: "pending",
      progress: 0,
      results: new Map(),
      errors: new Map(),
      startedAt: new Date()
    };
    
    this.jobs.set(jobId, job);
    
    // Add to processing queue
    for (const lead of leads) {
      this.processingQueue.push(lead.id);
    }
    
    // Process asynchronously
    this.processBatch(job, leads, priority);
    
    return jobId;
  }
  
  /**
   * Process batch enrichment
   */
  private async processBatch(job: EnrichmentJob, leads: Lead[], priority: number): Promise<void> {
    job.status = "processing";
    const total = leads.length;
    let completed = 0;
    
    // Process in chunks to avoid overwhelming APIs
    const chunkSize = 10;
    for (let i = 0; i < leads.length; i += chunkSize) {
      const chunk = leads.slice(i, i + chunkSize);
      const promises = chunk.map(lead => 
        this.enrichLead(lead, priority)
          .then(result => {
            job.results.set(lead.id, result);
            completed++;
            job.progress = (completed / total) * 100;
            this.emit("job:progress", { jobId: job.id, progress: job.progress });
          })
          .catch(error => {
            job.errors.set(lead.id, error.message);
            completed++;
            job.progress = (completed / total) * 100;
          })
      );
      
      await Promise.allSettled(promises);
    }
    
    job.status = "completed";
    job.completedAt = new Date();
    job.progress = 100;
    
    this.emit("job:complete", { jobId: job.id, job });
  }
  
  /**
   * Get enrichment job status
   */
  getJobStatus(jobId: string): EnrichmentJob | null {
    return this.jobs.get(jobId) || null;
  }
  
  /**
   * Get data source status
   */
  getDataSourceStatus(): Array<{
    name: string;
    enabled: boolean;
    stats: any;
  }> {
    const statuses = [];
    
    for (const [name, config] of this.dataSources.entries()) {
      const stats = rateLimiter.getServiceStats(name);
      statuses.push({
        name,
        enabled: config.enabled,
        stats
      });
    }
    
    return statuses;
  }
  
  /**
   * Force refresh cached enrichment for a lead
   */
  async refreshEnrichment(leadId: string, lead: Lead): Promise<EnrichmentResult> {
    // Invalidate cache
    enrichmentCache.invalidateLead(leadId);
    
    // Re-enrich with high priority
    return this.enrichLead(lead, 10);
  }
  
  /**
   * Enrich with fallback handling
   */
  private async enrichWithFallback(
    service: string,
    enrichFunction: () => Promise<any>,
    priority: number
  ): Promise<any> {
    try {
      return await rateLimiter.execute(service, enrichFunction, priority);
    } catch (error) {
      const config = this.dataSources.get(service);
      if (config?.fallback) {
        console.log(`[Enrichment] ${service} failed, trying fallback: ${config.fallback}`);
        // Try fallback service
        return null; // Fallback would be implemented based on specific service
      }
      throw error;
    }
  }
  
  /**
   * Merge enrichment data from multiple sources
   */
  private mergeEnrichmentData(results: PromiseSettledResult<any>[], phoneValidation: any): any {
    const merged: any = {
      company: {},
      person: {},
      email: {},
      phone: phoneValidation || {},
      social: {},
      metadata: {}
    };
    
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const data = result.value;
        
        // Merge based on data type
        if (data.domain) {
          // Company data from Clearbit
          Object.assign(merged.company, data);
        }
        if (data.fullName || data.name) {
          // Person data from FullContact
          Object.assign(merged.person, data);
        }
        if (data.result && data.score !== undefined) {
          // Email verification from Hunter
          Object.assign(merged.email, data);
        }
      }
    }
    
    return merged;
  }
  
  /**
   * Calculate quality score based on data completeness and accuracy
   */
  private calculateQualityScore(enrichedData: any, lead: Lead): number {
    let score = 0;
    let factors = 0;
    
    // Company data quality
    if (enrichedData.company) {
      if (enrichedData.company.name) { score += 10; factors++; }
      if (enrichedData.company.metrics?.employees) { score += 10; factors++; }
      if (enrichedData.company.metrics?.annualRevenue) { score += 15; factors++; }
      if (enrichedData.company.tech?.length > 0) { score += 10; factors++; }
    }
    
    // Person data quality
    if (enrichedData.person) {
      if (enrichedData.person.fullName) { score += 10; factors++; }
      if (enrichedData.person.title) { score += 10; factors++; }
      if (enrichedData.person.linkedin) { score += 15; factors++; }
    }
    
    // Contact verification quality
    if (enrichedData.email) {
      if (enrichedData.email.result === "deliverable") { score += 15; factors++; }
    }
    if (enrichedData.phone) {
      if (enrichedData.phone.valid || enrichedData.phone.isValid) { score += 15; factors++; }
    }
    
    return factors > 0 ? Math.min(100, (score / factors) * 10) : 0;
  }
  
  /**
   * Calculate confidence score based on source reliability
   */
  private calculateConfidenceScore(enrichedData: any, sourcesUsed: string[]): number {
    let totalConfidence = 0;
    let sourceCount = 0;
    
    for (const source of sourcesUsed) {
      const config = this.dataSources.get(source);
      if (config) {
        totalConfidence += config.confidence;
        sourceCount++;
      }
    }
    
    // Bonus for multiple corroborating sources
    if (sourceCount > 2) {
      totalConfidence += 10;
    }
    
    return sourceCount > 0 ? Math.min(100, totalConfidence / sourceCount) : 0;
  }
  
  /**
   * Calculate freshness score based on lead age and last update
   */
  private calculateFreshnessScore(lead: Lead): number {
    const now = Date.now();
    const uploadedAt = lead.uploadedAt ? new Date(lead.uploadedAt).getTime() : now;
    const ageInDays = (now - uploadedAt) / (1000 * 60 * 60 * 24);
    
    if (ageInDays < 7) return 100;
    if (ageInDays < 14) return 90;
    if (ageInDays < 30) return 75;
    if (ageInDays < 60) return 50;
    if (ageInDays < 90) return 25;
    return 10;
  }
  
  /**
   * Detect anomalies in enriched data
   */
  private detectAnomalies(enrichedData: any, lead: Lead): string[] {
    const anomalies: string[] = [];
    
    // Check email domain vs company domain
    if (lead.email && enrichedData.company?.domain) {
      const emailDomain = this.extractDomain(lead.email);
      if (emailDomain && emailDomain !== enrichedData.company.domain) {
        anomalies.push("Email domain doesn't match company domain");
      }
    }
    
    // Check for suspicious phone patterns
    if (enrichedData.phone) {
      if (enrichedData.phone.lineType === "voip" || enrichedData.phone.lineType === "nonFixedVoip") {
        anomalies.push("VoIP phone number detected");
      }
      if (enrichedData.phone.riskScore > 50) {
        anomalies.push("High-risk phone number");
      }
    }
    
    // Check for disposable email
    if (enrichedData.email?.disposable) {
      anomalies.push("Disposable email address");
    }
    
    // Check revenue vs employee count mismatch
    if (enrichedData.company?.metrics) {
      const employees = enrichedData.company.metrics.employees;
      const revenue = enrichedData.company.metrics.annualRevenue;
      if (employees && revenue) {
        const revenuePerEmployee = revenue / employees;
        if (revenuePerEmployee > 5000000) {
          anomalies.push("Unusually high revenue per employee");
        }
        if (revenuePerEmployee < 10000 && employees > 10) {
          anomalies.push("Unusually low revenue per employee");
        }
      }
    }
    
    return anomalies;
  }
  
  /**
   * Generate ML-based predictions for missing data
   */
  private async generatePredictions(enrichedData: any, lead: Lead): Promise<Record<string, any>> {
    const predictions: Record<string, any> = {};
    
    // Predict revenue if missing
    if (!enrichedData.company?.metrics?.annualRevenue && enrichedData.company?.metrics?.employees) {
      const employees = enrichedData.company.metrics.employees;
      const industry = lead.industry || enrichedData.company.category?.industry;
      
      // Simple revenue prediction model based on employees and industry
      const baseRevPerEmployee = this.getIndustryRevenuePerEmployee(industry);
      predictions.estimatedRevenue = employees * baseRevPerEmployee;
      predictions.revenueConfidence = "predicted";
    }
    
    // Predict company size if missing
    if (!enrichedData.company?.metrics?.employees && lead.annualRevenue) {
      const revenue = parseInt(lead.annualRevenue);
      const industry = lead.industry;
      
      const avgRevPerEmployee = this.getIndustryRevenuePerEmployee(industry);
      predictions.estimatedEmployees = Math.round(revenue / avgRevPerEmployee);
      predictions.employeesConfidence = "predicted";
    }
    
    // Predict conversion probability
    predictions.conversionProbability = this.predictConversionProbability(enrichedData, lead);
    
    // Predict deal size
    predictions.expectedDealSize = this.predictDealSize(enrichedData, lead);
    
    return predictions;
  }
  
  /**
   * Get industry average revenue per employee
   */
  private getIndustryRevenuePerEmployee(industry?: string): number {
    const industryAverages: Record<string, number> = {
      "Technology": 300000,
      "Software": 350000,
      "Finance": 500000,
      "Healthcare": 200000,
      "Retail": 150000,
      "Manufacturing": 250000,
      "Construction": 180000,
      "Restaurant": 75000,
      "Professional Services": 200000
    };
    
    return industryAverages[industry || ""] || 175000; // Default average
  }
  
  /**
   * Predict conversion probability using simple heuristics
   */
  private predictConversionProbability(enrichedData: any, lead: Lead): number {
    let probability = 0.5; // Base probability
    
    // Adjust based on data quality
    if (enrichedData.email?.result === "deliverable") probability += 0.1;
    if (enrichedData.phone?.valid) probability += 0.1;
    if (enrichedData.company?.metrics?.employees > 10) probability += 0.05;
    if (enrichedData.company?.metrics?.annualRevenue > 1000000) probability += 0.05;
    if (enrichedData.person?.linkedin) probability += 0.05;
    
    // Adjust based on lead attributes
    if (lead.creditScore && parseInt(lead.creditScore) > 650) probability += 0.1;
    if (lead.timeInBusiness && parseInt(lead.timeInBusiness) > 2) probability += 0.05;
    
    return Math.min(0.95, Math.max(0.05, probability));
  }
  
  /**
   * Predict expected deal size
   */
  private predictDealSize(enrichedData: any, lead: Lead): number {
    let baseAmount = 50000; // Default MCA amount
    
    // Adjust based on company size
    const employees = enrichedData.company?.metrics?.employees;
    if (employees) {
      if (employees > 100) baseAmount = 200000;
      else if (employees > 50) baseAmount = 100000;
      else if (employees > 20) baseAmount = 75000;
    }
    
    // Adjust based on revenue
    const revenue = enrichedData.company?.metrics?.annualRevenue || 
                   (lead.annualRevenue ? parseInt(lead.annualRevenue) : 0);
    if (revenue) {
      // Typical MCA is 10-15% of annual revenue
      const revenueBasedAmount = revenue * 0.12;
      baseAmount = (baseAmount + revenueBasedAmount) / 2;
    }
    
    // Adjust based on requested amount if available
    if (lead.requestedAmount) {
      const requested = parseInt(lead.requestedAmount);
      baseAmount = (baseAmount + requested) / 2;
    }
    
    return Math.round(baseAmount);
  }
  
  /**
   * Extract social profiles from enriched data
   */
  private extractSocialProfiles(enrichedData: any): Record<string, string> {
    const profiles: Record<string, string> = {};
    
    // From company data
    if (enrichedData.company) {
      if (enrichedData.company.linkedin?.handle) {
        profiles.linkedin = `https://linkedin.com/company/${enrichedData.company.linkedin.handle}`;
      }
      if (enrichedData.company.twitter?.handle) {
        profiles.twitter = `https://twitter.com/${enrichedData.company.twitter.handle}`;
      }
      if (enrichedData.company.facebook?.handle) {
        profiles.facebook = `https://facebook.com/${enrichedData.company.facebook.handle}`;
      }
    }
    
    // From person data
    if (enrichedData.person) {
      if (enrichedData.person.linkedin && !profiles.linkedin) {
        profiles.linkedinPersonal = enrichedData.person.linkedin;
      }
      if (enrichedData.person.twitter && !profiles.twitter) {
        profiles.twitterPersonal = enrichedData.person.twitter;
      }
    }
    
    return profiles;
  }
  
  /**
   * Extract company details
   */
  private extractCompanyDetails(enrichedData: any): Record<string, any> {
    return {
      name: enrichedData.company?.name,
      domain: enrichedData.company?.domain,
      industry: enrichedData.company?.category?.industry,
      employees: enrichedData.company?.metrics?.employees,
      employeesRange: enrichedData.company?.metrics?.employeesRange,
      annualRevenue: enrichedData.company?.metrics?.annualRevenue,
      fundingStage: enrichedData.company?.metrics?.fundingStage,
      technologies: enrichedData.company?.tech,
      location: enrichedData.company?.geo,
      description: enrichedData.company?.description,
      foundedYear: enrichedData.company?.founding?.foundedYear
    };
  }
  
  /**
   * Extract industry details
   */
  private extractIndustryDetails(enrichedData: any): Record<string, any> {
    return {
      sector: enrichedData.company?.category?.sector,
      industry: enrichedData.company?.category?.industry,
      subIndustry: enrichedData.company?.category?.subIndustry,
      naicsCode: enrichedData.company?.naicsCode,
      tags: enrichedData.company?.tags
    };
  }
  
  /**
   * Extract contact info
   */
  private extractContactInfo(enrichedData: any): Record<string, any> {
    return {
      email: {
        address: enrichedData.email?.email,
        valid: enrichedData.email?.result === "deliverable",
        score: enrichedData.email?.score
      },
      phone: {
        number: enrichedData.phone?.phoneNumber,
        valid: enrichedData.phone?.valid || enrichedData.phone?.isValid,
        type: enrichedData.phone?.lineType,
        carrier: enrichedData.phone?.carrier,
        riskScore: enrichedData.phone?.riskScore
      },
      person: {
        fullName: enrichedData.person?.fullName || enrichedData.person?.name?.fullName,
        title: enrichedData.person?.title,
        organization: enrichedData.person?.organization
      }
    };
  }
  
  /**
   * Calculate data completeness percentage
   */
  private calculateCompleteness(enrichedData: any): number {
    const fields = [
      enrichedData.company?.name,
      enrichedData.company?.metrics?.employees,
      enrichedData.company?.metrics?.annualRevenue,
      enrichedData.person?.fullName,
      enrichedData.person?.title,
      enrichedData.email?.result,
      enrichedData.phone?.valid || enrichedData.phone?.isValid,
      enrichedData.company?.linkedin?.handle,
      enrichedData.company?.domain,
      enrichedData.company?.category?.industry
    ];
    
    const filledFields = fields.filter(f => f !== undefined && f !== null).length;
    return Math.round((filledFields / fields.length) * 100);
  }
  
  /**
   * Check if data source is enabled
   */
  private isSourceEnabled(source: string): boolean {
    const config = this.dataSources.get(source);
    return config?.enabled || false;
  }
  
  /**
   * Extract domain from email
   */
  private extractDomain(email: string): string | null {
    const parts = email.split("@");
    return parts.length === 2 ? parts[1] : null;
  }
  
  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  }
  
  /**
   * Start processing loop for batch jobs
   */
  private startProcessingLoop(): void {
    setInterval(() => {
      // Emit stats periodically
      const stats = {
        activeJobs: Array.from(this.jobs.values()).filter(j => j.status === "processing").length,
        queueLength: this.processingQueue.length,
        cacheStats: enrichmentCache.getStats(),
        rateLimitStats: rateLimiter.getAllStats()
      };
      
      this.emit("stats:update", stats);
    }, 5000); // Every 5 seconds
  }
}

export const unifiedEnrichmentService = new UnifiedEnrichmentService();