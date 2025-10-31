import { db } from "../db";
import { enhancedVerification, leads } from "@shared/schema";
import type { Lead, EnhancedVerification } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";
import type { HunterEmailVerification } from "./enrichment/hunter-service";
import type { PhoneValidationResult } from "../numverify-service";
import { cacheManager } from "./cache-manager";

export interface VerificationConfidenceFactors {
  emailDeliverable: boolean;
  emailDomainValid: boolean;
  emailNotDisposable: boolean;
  emailSmtpValid: boolean;
  emailMxRecordsValid: boolean;
  phoneValid: boolean;
  phoneCorrectLineType: boolean;
  phoneCorrectLocation: boolean;
  phoneLowRisk: boolean;
  phoneCarrierKnown: boolean;
}

export interface ConfidenceBreakdown {
  emailConfidence: number;
  phoneConfidence: number;
  domainConfidence: number;
  dataQualityConfidence: number;
  factors: VerificationConfidenceFactors;
  explanations: string[];
}

export interface EnhancedVerificationResult {
  leadId: string;
  verificationStatus: "verified" | "partial" | "unverified" | "failed";
  overallConfidenceScore: number;
  confidenceBreakdown: ConfidenceBreakdown;
  emailVerification?: HunterEmailVerification;
  phoneVerification?: PhoneValidationResult;
  cachedUntil: Date;
  recommendations: string[];
}

export class EnhancedVerificationService {
  private readonly CACHE_DURATION_HOURS = 72; // Cache verification for 3 days
  private readonly MIN_CONFIDENCE_THRESHOLD = 60; // Minimum confidence for "verified" status
  private readonly PARTIAL_CONFIDENCE_THRESHOLD = 30; // Minimum for "partial" status
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly RATE_LIMIT_DELAY_MS = 100; // 100ms between API calls
  
  /**
   * Perform comprehensive real-time verification of a lead
   */
  async verifyLead(leadId: string, forceRefresh: boolean = false): Promise<EnhancedVerificationResult> {
    // Check for cached verification first
    if (!forceRefresh) {
      const cached = await this.getCachedVerification(leadId);
      if (cached) {
        return this.formatCachedResult(cached);
      }
    }
    
    // Fetch the lead data
    const lead = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    
    if (!lead.length) {
      throw new Error(`Lead not found: ${leadId}`);
    }
    
    const leadData = lead[0];
    
    // Perform parallel verification of email and phone
    const [emailResult, phoneResult] = await Promise.allSettled([
      this.verifyEmail(leadData.email),
      this.verifyPhone(leadData.phone, leadData.stateCode || 'US')
    ]);
    
    // Process results
    const emailVerification = emailResult.status === 'fulfilled' ? emailResult.value : null;
    const phoneVerification = phoneResult.status === 'fulfilled' ? phoneResult.value : null;
    
    // Calculate confidence scores and breakdown
    const confidenceBreakdown = this.calculateConfidenceBreakdown(
      emailVerification,
      phoneVerification,
      leadData
    );
    
    const overallConfidenceScore = this.calculateOverallConfidence(confidenceBreakdown);
    
    // Determine verification status
    const verificationStatus = this.determineVerificationStatus(overallConfidenceScore);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      confidenceBreakdown,
      verificationStatus,
      leadData
    );
    
    // Calculate cache expiration
    const cachedUntil = new Date(Date.now() + this.CACHE_DURATION_HOURS * 60 * 60 * 1000);
    
    // Store verification results in database
    await this.storeVerificationResults({
      leadId,
      emailVerification,
      phoneVerification,
      overallConfidenceScore,
      confidenceBreakdown,
      verificationStatus,
      cachedUntil
    });
    
    return {
      leadId,
      verificationStatus,
      overallConfidenceScore,
      confidenceBreakdown,
      emailVerification: emailVerification || undefined,
      phoneVerification: phoneVerification || undefined,
      cachedUntil,
      recommendations
    };
  }
  
  /**
   * Batch verify multiple leads efficiently
   */
  async batchVerifyLeads(
    leadIds: string[],
    forceRefresh: boolean = false
  ): Promise<Map<string, EnhancedVerificationResult>> {
    const results = new Map<string, EnhancedVerificationResult>();
    
    // Process in batches to avoid overwhelming APIs
    const batchSize = 5;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.verifyLead(id, forceRefresh))
      );
      
      batch.forEach((leadId, index) => {
        const result = batchResults[index];
        if (result.status === 'fulfilled') {
          results.set(leadId, result.value);
        } else {
          // Create a failed verification result
          results.set(leadId, {
            leadId,
            verificationStatus: 'failed',
            overallConfidenceScore: 0,
            confidenceBreakdown: this.getEmptyConfidenceBreakdown(),
            cachedUntil: new Date(Date.now() + 60 * 60 * 1000), // 1 hour cache for failures
            recommendations: ['Verification failed. Please try again later.']
          });
        }
      });
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < leadIds.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return results;
  }
  
  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        // Add rate limiting delay between attempts
        if (attempt > 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        return await fn();
      } catch (error: any) {
        lastError = error;
        console.warn(`[EnhancedVerification] ${operationName} attempt ${attempt}/${this.MAX_RETRIES} failed:`, error.message);
        
        // Don't retry on certain errors
        if (error.message?.includes('Invalid API key') || 
            error.message?.includes('Rate limit exceeded')) {
          break;
        }
      }
    }
    
    console.error(`[EnhancedVerification] ${operationName} failed after ${this.MAX_RETRIES} attempts:`, lastError);
    return null;
  }

  /**
   * Verify email using Hunter.io API with retry logic and caching
   */
  private async verifyEmail(email: string): Promise<HunterEmailVerification | null> {
    if (!email || !email.includes('@')) {
      return null;
    }
    
    // Check cache first
    const cacheKey = `email:${email}`;
    const cached = await cacheManager.get<HunterEmailVerification>(
      'hunter-verification',
      cacheKey
    );
    
    if (cached) {
      console.log(`[EnhancedVerification] Using cached email verification for ${email}`);
      return cached;
    }
    
    // Verify with retry logic
    const result = await this.retryWithBackoff(
      () => hunterService.verifyEmail(email),
      `Email verification for ${email}`
    );
    
    // Cache successful verification
    if (result) {
      await cacheManager.set('hunter-verification', cacheKey, result);
    }
    
    return result;
  }
  
  /**
   * Verify phone using Numverify API with retry logic and caching
   */
  private async verifyPhone(phone: string, countryCode: string = 'US'): Promise<PhoneValidationResult | null> {
    if (!phone || phone.length < 10) {
      return null;
    }
    
    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check cache first
    const cacheKey = `phone:${cleanPhone}:${countryCode}`;
    const cached = await cacheManager.get<PhoneValidationResult>(
      'numverify-validation',
      cacheKey
    );
    
    if (cached) {
      console.log(`[EnhancedVerification] Using cached phone validation for ${cleanPhone}`);
      return cached;
    }
    
    // Verify with retry logic
    const result = await this.retryWithBackoff(
      () => numverifyService.validatePhone(cleanPhone, countryCode),
      `Phone verification for ${cleanPhone}`
    );
    
    // Cache successful validation
    if (result) {
      await cacheManager.set('numverify-validation', cacheKey, result);
    }
    
    return result;
  }
  
  /**
   * Calculate detailed confidence breakdown
   */
  private calculateConfidenceBreakdown(
    emailVerification: HunterEmailVerification | null,
    phoneVerification: PhoneValidationResult | null,
    leadData: Lead
  ): ConfidenceBreakdown {
    const explanations: string[] = [];
    
    // Calculate email confidence (0-100)
    let emailConfidence = 0;
    let emailFactors = {
      emailDeliverable: false,
      emailDomainValid: false,
      emailNotDisposable: false,
      emailSmtpValid: false,
      emailMxRecordsValid: false
    };
    
    if (emailVerification) {
      // Base score from Hunter.io result
      if (emailVerification.result === 'deliverable') {
        emailConfidence = 90;
        emailFactors.emailDeliverable = true;
        explanations.push('✅ Email is deliverable');
      } else if (emailVerification.result === 'risky') {
        emailConfidence = 50;
        explanations.push('⚠️ Email is risky');
      } else if (emailVerification.result === 'unknown') {
        emailConfidence = 30;
        explanations.push('❓ Email deliverability unknown');
      } else {
        emailConfidence = 10;
        explanations.push('❌ Email is undeliverable');
      }
      
      // Adjust based on specific factors
      if (emailVerification.mx_records) {
        emailConfidence += 5;
        emailFactors.emailMxRecordsValid = true;
        explanations.push('✅ Valid MX records');
      } else {
        explanations.push('❌ No MX records found');
      }
      
      if (emailVerification.smtp_check) {
        emailConfidence += 5;
        emailFactors.emailSmtpValid = true;
        explanations.push('✅ SMTP check passed');
      }
      
      if (!emailVerification.disposable) {
        emailFactors.emailNotDisposable = true;
        explanations.push('✅ Not a disposable email');
      } else {
        emailConfidence -= 20;
        explanations.push('⚠️ Disposable email detected');
      }
      
      if (!emailVerification.gibberish) {
        emailFactors.emailDomainValid = true;
      } else {
        emailConfidence -= 10;
        explanations.push('⚠️ Email appears to be gibberish');
      }
      
      emailConfidence = Math.max(0, Math.min(100, emailConfidence));
    } else {
      explanations.push('⚠️ Email verification unavailable');
    }
    
    // Calculate phone confidence (0-100)
    let phoneConfidence = 0;
    let phoneFactors = {
      phoneValid: false,
      phoneCorrectLineType: false,
      phoneCorrectLocation: false,
      phoneLowRisk: false,
      phoneCarrierKnown: false
    };
    
    if (phoneVerification) {
      if (phoneVerification.isValid) {
        phoneConfidence = 80;
        phoneFactors.phoneValid = true;
        explanations.push('✅ Phone number is valid');
        
        // Adjust based on line type
        const goodLineTypes = ['mobile', 'landline'];
        if (phoneVerification.lineType && goodLineTypes.includes(phoneVerification.lineType)) {
          phoneConfidence += 10;
          phoneFactors.phoneCorrectLineType = true;
          explanations.push(`✅ ${phoneVerification.lineType === 'mobile' ? 'Mobile' : 'Landline'} number`);
        } else if (phoneVerification.lineType === 'voip') {
          phoneConfidence -= 10;
          explanations.push('⚠️ VoIP number (higher fraud risk)');
        }
        
        // Adjust based on risk score
        if (phoneVerification.riskScore <= 30) {
          phoneConfidence += 10;
          phoneFactors.phoneLowRisk = true;
          explanations.push('✅ Low risk phone number');
        } else if (phoneVerification.riskScore >= 70) {
          phoneConfidence -= 20;
          explanations.push('❌ High risk phone number');
        }
        
        // Carrier information
        if (phoneVerification.carrier && phoneVerification.carrier !== 'unknown') {
          phoneFactors.phoneCarrierKnown = true;
          explanations.push(`✅ Carrier: ${phoneVerification.carrier}`);
        }
        
        // Location verification
        if (phoneVerification.location) {
          phoneFactors.phoneCorrectLocation = true;
          explanations.push(`📍 Location: ${phoneVerification.location}`);
        }
      } else {
        phoneConfidence = 10;
        explanations.push('❌ Invalid phone number');
      }
      
      phoneConfidence = Math.max(0, Math.min(100, phoneConfidence));
    } else {
      explanations.push('⚠️ Phone verification unavailable');
    }
    
    // Calculate domain confidence (0-100)
    let domainConfidence = 50; // Start neutral
    if (emailVerification && leadData.email) {
      const domain = leadData.email.split('@')[1];
      if (domain) {
        // Well-known business domains get higher confidence
        const businessDomains = ['.com', '.net', '.org', '.biz', '.co'];
        if (businessDomains.some(ext => domain.endsWith(ext))) {
          domainConfidence += 20;
        }
        
        // Webmail domains get lower confidence for business leads
        if (emailVerification.webmail) {
          domainConfidence -= 10;
          explanations.push('⚠️ Using personal webmail for business');
        }
        
        // Accept-all domains are risky
        if (emailVerification.accept_all) {
          domainConfidence -= 10;
          explanations.push('⚠️ Domain accepts all email addresses');
        }
      }
    }
    
    // Calculate data quality confidence based on lead completeness
    let dataQualityConfidence = 0;
    if (leadData.businessName) dataQualityConfidence += 15;
    if (leadData.ownerName) dataQualityConfidence += 15;
    if (leadData.email) dataQualityConfidence += 15;
    if (leadData.phone) dataQualityConfidence += 15;
    if (leadData.industry) dataQualityConfidence += 10;
    if (leadData.annualRevenue) dataQualityConfidence += 10;
    if (leadData.creditScore) dataQualityConfidence += 10;
    if (leadData.stateCode) dataQualityConfidence += 10;
    
    const factors: VerificationConfidenceFactors = {
      ...emailFactors,
      ...phoneFactors
    };
    
    return {
      emailConfidence,
      phoneConfidence,
      domainConfidence,
      dataQualityConfidence,
      factors,
      explanations
    };
  }
  
  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(breakdown: ConfidenceBreakdown): number {
    // Weighted average of all confidence factors
    const weights = {
      email: 0.35,      // 35% weight for email
      phone: 0.35,      // 35% weight for phone
      domain: 0.15,     // 15% weight for domain
      dataQuality: 0.15 // 15% weight for data quality
    };
    
    const score = 
      breakdown.emailConfidence * weights.email +
      breakdown.phoneConfidence * weights.phone +
      breakdown.domainConfidence * weights.domain +
      breakdown.dataQualityConfidence * weights.dataQuality;
    
    return Math.round(score);
  }
  
  /**
   * Determine verification status based on confidence score
   */
  private determineVerificationStatus(
    confidenceScore: number
  ): "verified" | "partial" | "unverified" | "failed" {
    if (confidenceScore >= this.MIN_CONFIDENCE_THRESHOLD) {
      return "verified";
    } else if (confidenceScore >= this.PARTIAL_CONFIDENCE_THRESHOLD) {
      return "partial";
    } else if (confidenceScore > 0) {
      return "unverified";
    } else {
      return "failed";
    }
  }
  
  /**
   * Generate actionable recommendations based on verification results
   */
  private generateRecommendations(
    breakdown: ConfidenceBreakdown,
    status: string,
    leadData: Lead
  ): string[] {
    const recommendations: string[] = [];
    
    if (status === 'verified') {
      recommendations.push('✅ This lead has been verified and is ready for outreach');
    } else if (status === 'partial') {
      recommendations.push('⚠️ This lead has partial verification. Consider additional validation before high-value offers');
    } else {
      recommendations.push('❌ This lead requires manual review before proceeding');
    }
    
    // Email-specific recommendations
    if (breakdown.emailConfidence < 50) {
      if (!breakdown.factors.emailDeliverable) {
        recommendations.push('📧 Verify email address manually or request an updated email');
      }
      if (!breakdown.factors.emailNotDisposable) {
        recommendations.push('📧 Request a permanent business email address');
      }
    }
    
    // Phone-specific recommendations
    if (breakdown.phoneConfidence < 50) {
      if (!breakdown.factors.phoneValid) {
        recommendations.push('📞 Request a valid phone number');
      }
      if (!breakdown.factors.phoneCorrectLineType) {
        recommendations.push('📞 Verify if this is the correct business phone number');
      }
    }
    
    // Data quality recommendations
    if (breakdown.dataQualityConfidence < 50) {
      const missingFields: string[] = [];
      if (!leadData.businessName) missingFields.push('business name');
      if (!leadData.ownerName) missingFields.push('owner name');
      if (!leadData.industry) missingFields.push('industry');
      if (!leadData.annualRevenue) missingFields.push('annual revenue');
      
      if (missingFields.length > 0) {
        recommendations.push(`📝 Complete missing fields: ${missingFields.join(', ')}`);
      }
    }
    
    // Risk-based recommendations
    if (breakdown.factors.phoneValid && breakdown.phoneConfidence < 30) {
      recommendations.push('⚠️ High-risk indicators detected. Proceed with caution');
    }
    
    return recommendations;
  }
  
  /**
   * Store verification results in database
   */
  private async storeVerificationResults(data: {
    leadId: string;
    emailVerification: HunterEmailVerification | null;
    phoneVerification: PhoneValidationResult | null;
    overallConfidenceScore: number;
    confidenceBreakdown: ConfidenceBreakdown;
    verificationStatus: string;
    cachedUntil: Date;
  }): Promise<void> {
    try {
      // Check if a record exists
      const existing = await db
        .select()
        .from(enhancedVerification)
        .where(eq(enhancedVerification.leadId, data.leadId))
        .limit(1);
      
      const verificationData = {
        leadId: data.leadId,
        emailVerification: data.emailVerification as any,
        emailScore: data.emailVerification ? hunterService.calculateEmailScore(data.emailVerification) : null,
        emailStatus: data.emailVerification?.result || null,
        domainStatus: data.emailVerification && !data.emailVerification.disposable ? 'clean' : 'risky',
        mxRecords: data.emailVerification?.mx_records || false,
        smtpCheck: data.emailVerification?.smtp_check || false,
        emailDisposable: data.emailVerification?.disposable || false,
        emailWebmail: data.emailVerification?.webmail || false,
        emailAcceptAll: data.emailVerification?.accept_all || false,
        phoneVerification: data.phoneVerification as any,
        phoneValid: data.phoneVerification?.isValid || false,
        phoneLineType: data.phoneVerification?.lineType || null,
        phoneCarrier: data.phoneVerification?.carrier || null,
        phoneLocation: data.phoneVerification?.location || null,
        phoneCountryCode: data.phoneVerification?.countryCode || null,
        phoneLocationData: data.phoneVerification?.enrichmentData || null,
        phoneRiskScore: data.phoneVerification?.riskScore || null,
        overallConfidenceScore: data.overallConfidenceScore.toString(),
        confidenceBreakdown: data.confidenceBreakdown as any,
        verificationStatus: data.verificationStatus,
        cachedUntil: data.cachedUntil,
        lastAttemptAt: new Date(),
        hunterCreditsUsed: data.emailVerification ? 1 : 0,
        numverifyCreditsUsed: data.phoneVerification ? 1 : 0
      };
      
      if (existing.length > 0) {
        // Update existing record
        await db
          .update(enhancedVerification)
          .set({
            ...verificationData,
            attemptCount: existing[0].attemptCount + 1,
            updatedAt: new Date()
          })
          .where(eq(enhancedVerification.id, existing[0].id));
      } else {
        // Insert new record
        await db
          .insert(enhancedVerification)
          .values(verificationData);
      }
    } catch (error) {
      console.error('[EnhancedVerification] Failed to store verification results:', error);
    }
  }
  
  /**
   * Get cached verification if available and not expired
   */
  private async getCachedVerification(leadId: string): Promise<EnhancedVerification | null> {
    try {
      const cached = await db
        .select()
        .from(enhancedVerification)
        .where(
          and(
            eq(enhancedVerification.leadId, leadId),
            gte(enhancedVerification.cachedUntil, new Date())
          )
        )
        .limit(1);
      
      return cached.length > 0 ? cached[0] : null;
    } catch (error) {
      console.error('[EnhancedVerification] Failed to get cached verification:', error);
      return null;
    }
  }
  
  /**
   * Format cached result for response
   */
  private formatCachedResult(cached: EnhancedVerification): EnhancedVerificationResult {
    return {
      leadId: cached.leadId,
      verificationStatus: cached.verificationStatus as any,
      overallConfidenceScore: parseFloat(cached.overallConfidenceScore || '0'),
      confidenceBreakdown: cached.confidenceBreakdown as any,
      emailVerification: cached.emailVerification as any,
      phoneVerification: cached.phoneVerification as any,
      cachedUntil: cached.cachedUntil || new Date(),
      recommendations: this.generateRecommendations(
        cached.confidenceBreakdown as any,
        cached.verificationStatus,
        {} as Lead // We don't have lead data here, but recommendations will still work
      )
    };
  }
  
  /**
   * Get empty confidence breakdown for failed verifications
   */
  private getEmptyConfidenceBreakdown(): ConfidenceBreakdown {
    return {
      emailConfidence: 0,
      phoneConfidence: 0,
      domainConfidence: 0,
      dataQualityConfidence: 0,
      factors: {
        emailDeliverable: false,
        emailDomainValid: false,
        emailNotDisposable: false,
        emailSmtpValid: false,
        emailMxRecordsValid: false,
        phoneValid: false,
        phoneCorrectLineType: false,
        phoneCorrectLocation: false,
        phoneLowRisk: false,
        phoneCarrierKnown: false
      },
      explanations: ['Verification could not be completed']
    };
  }
  
  /**
   * Get verification status summary for a lead
   */
  async getVerificationStatus(leadId: string): Promise<{
    status: string;
    lastVerified: Date | null;
    confidenceScore: number;
    nextVerification: Date | null;
    attemptCount: number;
  }> {
    try {
      const verification = await db
        .select()
        .from(enhancedVerification)
        .where(eq(enhancedVerification.leadId, leadId))
        .orderBy(desc(enhancedVerification.verifiedAt))
        .limit(1);
      
      if (verification.length === 0) {
        return {
          status: 'never_verified',
          lastVerified: null,
          confidenceScore: 0,
          nextVerification: new Date(),
          attemptCount: 0
        };
      }
      
      const v = verification[0];
      return {
        status: v.verificationStatus,
        lastVerified: v.verifiedAt,
        confidenceScore: parseFloat(v.overallConfidenceScore || '0'),
        nextVerification: v.cachedUntil,
        attemptCount: v.attemptCount
      };
    } catch (error) {
      console.error('[EnhancedVerification] Failed to get verification status:', error);
      return {
        status: 'error',
        lastVerified: null,
        confidenceScore: 0,
        nextVerification: null,
        attemptCount: 0
      };
    }
  }
}

// Export singleton instance
export const enhancedVerificationService = new EnhancedVerificationService();