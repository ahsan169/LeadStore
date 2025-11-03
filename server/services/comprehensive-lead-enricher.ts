import { Lead, InsertLead } from "@shared/schema";
import { storage } from "../storage";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";
import OpenAI from "openai";
import fetch from "node-fetch";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

// Perplexity API configuration
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

export interface EnrichmentResult {
  leadId?: string;
  businessName: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  secondaryPhone?: string;
  industry?: string;
  annualRevenue?: string;
  estimatedRevenue?: number;
  revenueConfidence?: string;
  requestedAmount?: string;
  timeInBusiness?: string;
  yearsInBusiness?: number;
  creditScore?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  companySize?: string;
  employeeCount?: number;
  yearFounded?: number;
  naicsCode?: string;
  stateCode?: string;
  city?: string;
  fullAddress?: string;
  socialProfiles?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  fundingHistory?: {
    totalFunding?: string;
    lastRound?: string;
    investors?: string[];
  };
  marketPosition?: string;
  competitiveAdvantages?: string[];
  ownerBackground?: string;
  businessDescription?: string;
  uccNumber?: string;
  filingDate?: Date;
  securedParties?: string;
  confidenceScores?: {
    overall: number;
    businessInfo: number;
    contactInfo: number;
    financialInfo: number;
    verificationStatus: number;
  };
  enrichmentMetadata?: {
    sources: string[];
    enrichedAt: Date;
    fieldsEnriched: string[];
    dataQuality: 'high' | 'medium' | 'low';
  };
  researchInsights?: any;
  intelligenceScore?: number;
}

export interface EnrichmentOptions {
  skipPerplexity?: boolean;
  skipHunter?: boolean;
  skipNumverify?: boolean;
  skipOpenAI?: boolean;
  maxRetries?: number;
  timeout?: number;
}

export class ComprehensiveLeadEnricher {
  private readonly DEFAULT_OPTIONS: EnrichmentOptions = {
    skipPerplexity: false,
    skipHunter: false,
    skipNumverify: false,
    skipOpenAI: false,
    maxRetries: 2,
    timeout: 30000
  };

  /**
   * Enrich a single lead with data from multiple sources
   */
  async enrichSingleLead(
    leadData: Partial<Lead | InsertLead>,
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    
    console.log(`[ComprehensiveEnricher] Starting enrichment for: ${leadData.businessName || leadData.ownerName || 'Unknown'}`);
    
    // Initialize result with existing data
    const result: EnrichmentResult = {
      businessName: leadData.businessName || '',
      ownerName: leadData.ownerName,
      email: leadData.email,
      phone: leadData.phone,
      secondaryPhone: leadData.secondaryPhone,
      industry: leadData.industry,
      annualRevenue: leadData.annualRevenue,
      estimatedRevenue: leadData.estimatedRevenue,
      requestedAmount: leadData.requestedAmount,
      timeInBusiness: leadData.timeInBusiness,
      creditScore: leadData.creditScore,
      websiteUrl: leadData.websiteUrl,
      linkedinUrl: leadData.linkedinUrl,
      companySize: leadData.companySize,
      employeeCount: leadData.employeeCount,
      yearFounded: leadData.yearFounded,
      naicsCode: leadData.naicsCode,
      stateCode: leadData.stateCode,
      uccNumber: leadData.uccNumber,
      confidenceScores: {
        overall: 0,
        businessInfo: 0,
        contactInfo: 0,
        financialInfo: 0,
        verificationStatus: 0
      },
      enrichmentMetadata: {
        sources: [],
        enrichedAt: new Date(),
        fieldsEnriched: [],
        dataQuality: 'low'
      }
    };

    const fieldsBeforeEnrichment = new Set(Object.keys(result).filter(k => result[k as keyof EnrichmentResult]));
    const enrichmentPromises: Promise<void>[] = [];

    // Step 1: Use Perplexity to gather business information
    if (!opts.skipPerplexity && (result.businessName || result.ownerName)) {
      enrichmentPromises.push(this.enrichWithPerplexity(result));
    }

    // Step 2: Use Hunter.io for email discovery and verification
    if (!opts.skipHunter && (result.businessName || result.websiteUrl)) {
      enrichmentPromises.push(this.enrichWithHunter(result));
    }

    // Step 3: Use Numverify for phone verification
    if (!opts.skipNumverify && result.phone) {
      enrichmentPromises.push(this.enrichWithNumverify(result));
    }

    // Run initial enrichment tasks in parallel
    await Promise.allSettled(enrichmentPromises);

    // Step 4: Use OpenAI to extract and analyze gathered information
    if (!opts.skipOpenAI) {
      await this.analyzeWithOpenAI(result);
    }

    // Calculate confidence scores
    this.calculateConfidenceScores(result);

    // Track fields that were enriched
    const fieldsAfterEnrichment = new Set(Object.keys(result).filter(k => result[k as keyof EnrichmentResult]));
    result.enrichmentMetadata!.fieldsEnriched = Array.from(fieldsAfterEnrichment)
      .filter(field => !fieldsBeforeEnrichment.has(field));

    // Determine data quality
    const enrichmentRatio = result.enrichmentMetadata!.fieldsEnriched.length / 20; // Assuming ~20 key fields
    result.enrichmentMetadata!.dataQuality = 
      enrichmentRatio > 0.7 ? 'high' : 
      enrichmentRatio > 0.4 ? 'medium' : 'low';

    const duration = Date.now() - startTime;
    console.log(`[ComprehensiveEnricher] Enrichment completed in ${duration}ms. Quality: ${result.enrichmentMetadata!.dataQuality}`);

    return result;
  }

  /**
   * Use Perplexity API to search for business information
   */
  private async enrichWithPerplexity(result: EnrichmentResult): Promise<void> {
    if (!PERPLEXITY_API_KEY) {
      console.warn("[ComprehensiveEnricher] Perplexity API key not configured");
      return;
    }

    try {
      const searchQuery = this.buildPerplexitySearchQuery(result);
      console.log(`[ComprehensiveEnricher] Perplexity search: ${searchQuery}`);

      const response = await fetch(PERPLEXITY_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-sonar-small-128k-online",
          messages: [
            {
              role: "system",
              content: "You are a business research assistant. Extract factual business information from search results. Be precise and include specific details when available. Focus on: company details, owner/founder names, contact information, revenue estimates, employee count, industry, location, and recent news."
            },
            {
              role: "user",
              content: searchQuery
            }
          ],
          temperature: 0.2,
          top_p: 0.9,
          stream: false,
          return_citations: true,
          search_recency_filter: "year"
        })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";
      const citations = data.citations || [];

      // Parse the response and update result
      await this.parsePerplexityResponse(content, citations, result);
      
      result.enrichmentMetadata!.sources.push('perplexity');
      
    } catch (error) {
      console.error("[ComprehensiveEnricher] Perplexity enrichment failed:", error);
    }
  }

  /**
   * Build an optimized search query for Perplexity
   */
  private buildPerplexitySearchQuery(result: EnrichmentResult): string {
    const parts: string[] = [];
    
    // Primary search target
    if (result.businessName) {
      parts.push(`Find detailed information about the business "${result.businessName}"`);
      if (result.stateCode || result.city) {
        parts.push(`located in ${result.city || ''} ${result.stateCode || ''}`);
      }
    } else if (result.ownerName) {
      parts.push(`Find business information for owner/founder "${result.ownerName}"`);
    }

    // Specific information requests
    parts.push("Include: owner/founder name, business address, phone number, email, website, annual revenue estimate, number of employees, year founded, industry, social media profiles, recent news or updates, UCC filings if any, funding history");

    // Industry context if available
    if (result.industry) {
      parts.push(`The business operates in the ${result.industry} industry`);
    }

    return parts.join(". ");
  }

  /**
   * Parse Perplexity response and extract structured data
   */
  private async parsePerplexityResponse(content: string, citations: string[], result: EnrichmentResult): Promise<void> {
    // Use OpenAI to extract structured data from the Perplexity response
    try {
      const extraction = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Extract business information from the text. Return a JSON object with the following fields (use null for missing data): ownerName, address, city, state, phone, email, website, annualRevenue, employeeCount, yearFounded, industry, linkedin, twitter, facebook, instagram, fundingTotal, lastFundingRound, investors (array), businessDescription, uccNumber"
          },
          {
            role: "user",
            content: content
          }
        ],
        temperature: 0,
        response_format: { type: "json_object" }
      });

      const extracted = JSON.parse(extraction.choices[0]?.message?.content || "{}");

      // Update result with extracted data (only if not already present)
      if (extracted.ownerName && !result.ownerName) {
        result.ownerName = extracted.ownerName;
      }
      if (extracted.address) {
        result.fullAddress = extracted.address;
      }
      if (extracted.city && !result.city) {
        result.city = extracted.city;
      }
      if (extracted.state && !result.stateCode) {
        result.stateCode = extracted.state;
      }
      if (extracted.phone && !result.phone) {
        result.phone = extracted.phone;
      }
      if (extracted.email && !result.email) {
        result.email = extracted.email;
      }
      if (extracted.website && !result.websiteUrl) {
        result.websiteUrl = extracted.website;
      }
      if (extracted.annualRevenue) {
        const revenueNum = this.parseRevenue(extracted.annualRevenue);
        if (revenueNum && !result.estimatedRevenue) {
          result.estimatedRevenue = revenueNum;
          result.annualRevenue = extracted.annualRevenue;
          result.revenueConfidence = 'Perplexity Search: High';
        }
      }
      if (extracted.employeeCount && !result.employeeCount) {
        result.employeeCount = parseInt(extracted.employeeCount) || undefined;
      }
      if (extracted.yearFounded && !result.yearFounded) {
        result.yearFounded = parseInt(extracted.yearFounded) || undefined;
      }
      if (extracted.industry && !result.industry) {
        result.industry = extracted.industry;
      }
      if (extracted.businessDescription) {
        result.businessDescription = extracted.businessDescription;
      }
      if (extracted.uccNumber && !result.uccNumber) {
        result.uccNumber = extracted.uccNumber;
      }

      // Social profiles
      if (!result.socialProfiles) {
        result.socialProfiles = {};
      }
      if (extracted.linkedin) result.socialProfiles.linkedin = extracted.linkedin;
      if (extracted.twitter) result.socialProfiles.twitter = extracted.twitter;
      if (extracted.facebook) result.socialProfiles.facebook = extracted.facebook;
      if (extracted.instagram) result.socialProfiles.instagram = extracted.instagram;

      // Funding information
      if (extracted.fundingTotal || extracted.lastFundingRound || extracted.investors) {
        result.fundingHistory = {
          totalFunding: extracted.fundingTotal,
          lastRound: extracted.lastFundingRound,
          investors: extracted.investors || []
        };
      }

      // Store citations as part of research insights
      if (citations.length > 0) {
        result.researchInsights = {
          ...result.researchInsights,
          sources: citations,
          perplexityContent: content
        };
      }

    } catch (error) {
      console.error("[ComprehensiveEnricher] Failed to parse Perplexity response:", error);
    }
  }

  /**
   * Use Hunter.io for email discovery and verification
   */
  private async enrichWithHunter(result: EnrichmentResult): Promise<void> {
    try {
      let domain: string | undefined;
      
      // Extract domain from website or email
      if (result.websiteUrl) {
        domain = new URL(result.websiteUrl).hostname.replace('www.', '');
      } else if (result.email) {
        domain = result.email.split('@')[1];
      } else if (result.businessName) {
        // Try to guess domain from business name
        domain = result.businessName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
      }

      if (domain) {
        // Search for emails by domain
        const domainSearch = await hunterService.searchDomain(domain);
        if (domainSearch) {
          // Update company information
          if (!result.industry && domainSearch.industry) {
            result.industry = domainSearch.industry;
          }
          if (!result.companySize && domainSearch.headcount) {
            result.companySize = domainSearch.headcount;
          }
          if (!result.businessDescription && domainSearch.description) {
            result.businessDescription = domainSearch.description;
          }
          
          // Update social profiles
          if (!result.socialProfiles) {
            result.socialProfiles = {};
          }
          if (domainSearch.linkedin) result.socialProfiles.linkedin = domainSearch.linkedin;
          if (domainSearch.twitter) result.socialProfiles.twitter = domainSearch.twitter;
          if (domainSearch.facebook) result.socialProfiles.facebook = domainSearch.facebook;
          if (domainSearch.instagram) result.socialProfiles.instagram = domainSearch.instagram;
          if (domainSearch.youtube) result.socialProfiles.youtube = domainSearch.youtube;

          // Find the best email
          if (domainSearch.emails && domainSearch.emails.length > 0 && !result.email) {
            // Prefer executive emails
            const executiveEmail = domainSearch.emails.find(e => 
              e.seniority === 'executive' || e.position?.toLowerCase().includes('ceo') || 
              e.position?.toLowerCase().includes('owner') || e.position?.toLowerCase().includes('founder')
            );
            const bestEmail = executiveEmail || domainSearch.emails[0];
            
            result.email = bestEmail.value;
            
            // Update owner name if we found an executive
            if (executiveEmail && !result.ownerName) {
              result.ownerName = `${executiveEmail.first_name} ${executiveEmail.last_name}`;
            }
          }
        }

        // If we have an owner name but no email, try to find it
        if (result.ownerName && !result.email) {
          const nameParts = result.ownerName.split(' ');
          if (nameParts.length >= 2) {
            const emailFinder = await hunterService.findEmail(
              nameParts[0],
              nameParts[nameParts.length - 1],
              domain
            );
            if (emailFinder && emailFinder.email) {
              result.email = emailFinder.email;
            }
          }
        }
      }

      // Verify existing email
      if (result.email) {
        const verification = await hunterService.verifyEmail(result.email);
        const emailScore = hunterService.calculateEmailScore(verification);
        
        // Store verification result
        if (!result.researchInsights) {
          result.researchInsights = {};
        }
        result.researchInsights.emailVerification = {
          result: verification.result,
          score: emailScore,
          isDeliverable: verification.result === 'deliverable',
          isRisky: verification.result === 'risky'
        };

        // Update confidence based on email verification
        if (result.confidenceScores) {
          result.confidenceScores.contactInfo = Math.max(
            result.confidenceScores.contactInfo,
            emailScore
          );
        }
      }

      result.enrichmentMetadata!.sources.push('hunter');
      
    } catch (error) {
      console.error("[ComprehensiveEnricher] Hunter enrichment failed:", error);
    }
  }

  /**
   * Use Numverify for phone verification and enrichment
   */
  private async enrichWithNumverify(result: EnrichmentResult): Promise<void> {
    try {
      if (result.phone) {
        const phoneEnrichment = await numverifyService.enrichPhone(result.phone);
        
        // Update phone with formatted version
        if (phoneEnrichment.formattedInternational) {
          result.phone = phoneEnrichment.formattedInternational;
        }
        
        // Update location if not already present
        if (!result.city && phoneEnrichment.location) {
          result.city = phoneEnrichment.location;
        }
        
        // Store phone verification details
        if (!result.researchInsights) {
          result.researchInsights = {};
        }
        result.researchInsights.phoneVerification = {
          isValid: phoneEnrichment.isValid,
          carrier: phoneEnrichment.carrier,
          lineType: phoneEnrichment.lineType,
          riskScore: phoneEnrichment.riskScore,
          isBusinessLine: phoneEnrichment.qualityIndicators?.isBusinessLine || false
        };

        // Update confidence based on phone verification
        if (result.confidenceScores && phoneEnrichment.isValid) {
          result.confidenceScores.contactInfo = Math.max(
            result.confidenceScores.contactInfo,
            100 - (phoneEnrichment.riskScore || 0)
          );
        }
      }

      result.enrichmentMetadata!.sources.push('numverify');
      
    } catch (error) {
      console.error("[ComprehensiveEnricher] Numverify enrichment failed:", error);
    }
  }

  /**
   * Use OpenAI to analyze and extract additional insights
   */
  private async analyzeWithOpenAI(result: EnrichmentResult): Promise<void> {
    try {
      const prompt = this.buildOpenAIAnalysisPrompt(result);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a business analyst specializing in lead qualification and data enrichment. Analyze the provided business information and extract additional insights, patterns, and recommendations. Focus on identifying business health indicators, growth potential, and MCA suitability."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(completion.choices[0]?.message?.content || "{}");

      // Update result with AI insights
      if (analysis.estimatedRevenue && !result.estimatedRevenue) {
        result.estimatedRevenue = analysis.estimatedRevenue;
        result.revenueConfidence = 'AI Analysis: Medium';
      }
      
      if (analysis.yearsInBusiness && !result.yearsInBusiness) {
        result.yearsInBusiness = analysis.yearsInBusiness;
        result.timeInBusiness = `${analysis.yearsInBusiness} years`;
      }
      
      if (analysis.employeeCount && !result.employeeCount) {
        result.employeeCount = analysis.employeeCount;
      }
      
      if (analysis.marketPosition) {
        result.marketPosition = analysis.marketPosition;
      }
      
      if (analysis.competitiveAdvantages) {
        result.competitiveAdvantages = analysis.competitiveAdvantages;
      }
      
      if (analysis.ownerBackground && !result.ownerBackground) {
        result.ownerBackground = analysis.ownerBackground;
      }

      // Calculate intelligence score based on all available data
      if (analysis.intelligenceScore) {
        result.intelligenceScore = analysis.intelligenceScore;
      }

      // Store complete AI analysis
      if (!result.researchInsights) {
        result.researchInsights = {};
      }
      result.researchInsights.aiAnalysis = analysis;

      result.enrichmentMetadata!.sources.push('openai');
      
    } catch (error) {
      console.error("[ComprehensiveEnricher] OpenAI analysis failed:", error);
    }
  }

  /**
   * Build analysis prompt for OpenAI
   */
  private buildOpenAIAnalysisPrompt(result: EnrichmentResult): string {
    const data = {
      businessName: result.businessName,
      ownerName: result.ownerName,
      industry: result.industry,
      location: `${result.city || ''} ${result.stateCode || ''}`.trim(),
      website: result.websiteUrl,
      socialProfiles: result.socialProfiles,
      fundingHistory: result.fundingHistory,
      yearFounded: result.yearFounded,
      currentRevenue: result.annualRevenue,
      employeeCount: result.employeeCount,
      businessDescription: result.businessDescription
    };

    return `Analyze this business data and provide insights in JSON format:
${JSON.stringify(data, null, 2)}

Return a JSON object with:
- estimatedRevenue: number (best estimate of annual revenue in dollars)
- yearsInBusiness: number
- employeeCount: number (best estimate if not provided)
- marketPosition: string (leader/challenger/niche/emerging)
- competitiveAdvantages: array of strings (3-5 key advantages)
- ownerBackground: string (brief background if information available)
- mcaSuitability: object with {score: 0-100, reasons: array of strings}
- growthIndicators: array of strings
- riskFactors: array of strings
- recommendations: array of strings (for further research or outreach)
- intelligenceScore: number (0-100 overall lead quality score)
- confidenceLevel: string (high/medium/low)`;
  }

  /**
   * Calculate confidence scores based on available data
   */
  private calculateConfidenceScores(result: EnrichmentResult): void {
    let businessInfoScore = 0;
    let contactInfoScore = 0;
    let financialInfoScore = 0;
    let verificationScore = 0;

    // Business Information Score
    if (result.businessName) businessInfoScore += 20;
    if (result.industry) businessInfoScore += 15;
    if (result.websiteUrl) businessInfoScore += 15;
    if (result.yearFounded) businessInfoScore += 10;
    if (result.businessDescription) businessInfoScore += 10;
    if (result.fullAddress || (result.city && result.stateCode)) businessInfoScore += 10;
    if (result.socialProfiles && Object.keys(result.socialProfiles).length > 0) businessInfoScore += 10;
    if (result.naicsCode) businessInfoScore += 10;

    // Contact Information Score
    if (result.ownerName) contactInfoScore += 30;
    if (result.email) contactInfoScore += 30;
    if (result.phone) contactInfoScore += 25;
    if (result.secondaryPhone) contactInfoScore += 15;

    // Financial Information Score
    if (result.annualRevenue || result.estimatedRevenue) financialInfoScore += 30;
    if (result.employeeCount) financialInfoScore += 20;
    if (result.fundingHistory) financialInfoScore += 20;
    if (result.creditScore) financialInfoScore += 15;
    if (result.requestedAmount) financialInfoScore += 15;

    // Verification Score
    const phoneVerified = result.researchInsights?.phoneVerification?.isValid;
    const emailVerified = result.researchInsights?.emailVerification?.isDeliverable;
    
    if (phoneVerified) verificationScore += 40;
    if (emailVerified) verificationScore += 40;
    if (result.enrichmentMetadata!.sources.length >= 3) verificationScore += 20;

    // Calculate overall score
    const overall = (
      businessInfoScore * 0.25 +
      contactInfoScore * 0.30 +
      financialInfoScore * 0.25 +
      verificationScore * 0.20
    );

    result.confidenceScores = {
      overall: Math.round(overall),
      businessInfo: Math.round(businessInfoScore),
      contactInfo: Math.round(contactInfoScore),
      financialInfo: Math.round(financialInfoScore),
      verificationStatus: Math.round(verificationScore)
    };
  }

  /**
   * Parse revenue string to number
   */
  private parseRevenue(revenueStr: string): number | undefined {
    if (!revenueStr) return undefined;
    
    // Remove currency symbols and spaces
    const cleaned = revenueStr.replace(/[$,\s]/g, '');
    
    // Handle ranges (e.g., "1M-5M")
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-');
      const lower = this.parseRevenueValue(parts[0]);
      const upper = this.parseRevenueValue(parts[1]);
      return (lower + upper) / 2; // Return average
    }
    
    return this.parseRevenueValue(cleaned);
  }

  /**
   * Parse single revenue value
   */
  private parseRevenueValue(value: string): number {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    
    if (value.toLowerCase().includes('k')) {
      return num * 1000;
    } else if (value.toLowerCase().includes('m')) {
      return num * 1000000;
    } else if (value.toLowerCase().includes('b')) {
      return num * 1000000000;
    }
    
    return num;
  }

  /**
   * Bulk enrich multiple leads
   */
  async enrichBulkLeads(
    leads: Array<Partial<Lead | InsertLead>>,
    options: EnrichmentOptions = {}
  ): Promise<EnrichmentResult[]> {
    console.log(`[ComprehensiveEnricher] Starting bulk enrichment for ${leads.length} leads`);
    
    const results: EnrichmentResult[] = [];
    const batchSize = 5; // Process 5 leads at a time to avoid rate limits
    
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const batchPromises = batch.map(lead => this.enrichSingleLead(lead, options));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            console.error(`[ComprehensiveEnricher] Lead enrichment failed:`, result.reason);
            // Add a minimal result for failed enrichment
            results.push({
              businessName: batch[results.length % batchSize].businessName || 'Unknown',
              confidenceScores: {
                overall: 0,
                businessInfo: 0,
                contactInfo: 0,
                financialInfo: 0,
                verificationStatus: 0
              },
              enrichmentMetadata: {
                sources: [],
                enrichedAt: new Date(),
                fieldsEnriched: [],
                dataQuality: 'low'
              }
            });
          }
        }
        
        // Rate limiting between batches
        if (i + batchSize < leads.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`[ComprehensiveEnricher] Batch enrichment failed:`, error);
      }
      
      console.log(`[ComprehensiveEnricher] Processed ${Math.min(i + batchSize, leads.length)}/${leads.length} leads`);
    }
    
    return results;
  }

  /**
   * Find and enrich all incomplete leads in the database
   */
  async enrichAllIncompleteLeads(options: EnrichmentOptions = {}): Promise<{
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: EnrichmentResult[];
  }> {
    console.log("[ComprehensiveEnricher] Finding incomplete leads for enrichment");
    
    // Get incomplete leads from storage
    const incompleteLeads = await storage.getIncompleteLeads();
    
    if (incompleteLeads.length === 0) {
      console.log("[ComprehensiveEnricher] No incomplete leads found");
      return {
        totalProcessed: 0,
        successCount: 0,
        failureCount: 0,
        results: []
      };
    }
    
    console.log(`[ComprehensiveEnricher] Found ${incompleteLeads.length} incomplete leads`);
    
    // Enrich leads in batches
    const enrichmentResults = await this.enrichBulkLeads(incompleteLeads, options);
    
    // Update leads in database with enriched data
    const updatePromises = enrichmentResults.map(async (enrichedData) => {
      if (enrichedData.leadId) {
        try {
          await storage.updateLeadWithEnrichment(enrichedData.leadId, enrichedData);
          return true;
        } catch (error) {
          console.error(`[ComprehensiveEnricher] Failed to update lead ${enrichedData.leadId}:`, error);
          return false;
        }
      }
      return false;
    });
    
    const updateResults = await Promise.all(updatePromises);
    const successCount = updateResults.filter(r => r).length;
    
    return {
      totalProcessed: incompleteLeads.length,
      successCount,
      failureCount: incompleteLeads.length - successCount,
      results: enrichmentResults
    };
  }

  /**
   * Calculate lead quality score based on enriched data
   */
  calculateLeadQualityScore(enrichedData: EnrichmentResult): number {
    let score = 0;
    const weights = {
      hasBusinessName: 10,
      hasOwnerName: 15,
      hasVerifiedEmail: 20,
      hasVerifiedPhone: 15,
      hasRevenue: 10,
      hasEmployeeCount: 5,
      hasWebsite: 10,
      hasSocialProfiles: 5,
      hasIndustry: 5,
      hasLocation: 5
    };

    if (enrichedData.businessName) score += weights.hasBusinessName;
    if (enrichedData.ownerName) score += weights.hasOwnerName;
    if (enrichedData.email && enrichedData.researchInsights?.emailVerification?.isDeliverable) {
      score += weights.hasVerifiedEmail;
    }
    if (enrichedData.phone && enrichedData.researchInsights?.phoneVerification?.isValid) {
      score += weights.hasVerifiedPhone;
    }
    if (enrichedData.estimatedRevenue || enrichedData.annualRevenue) score += weights.hasRevenue;
    if (enrichedData.employeeCount) score += weights.hasEmployeeCount;
    if (enrichedData.websiteUrl) score += weights.hasWebsite;
    if (enrichedData.socialProfiles && Object.keys(enrichedData.socialProfiles).length > 0) {
      score += weights.hasSocialProfiles;
    }
    if (enrichedData.industry) score += weights.hasIndustry;
    if (enrichedData.city || enrichedData.stateCode) score += weights.hasLocation;

    return Math.min(100, score);
  }
}

// Export singleton instance
export const comprehensiveLeadEnricher = new ComprehensiveLeadEnricher();