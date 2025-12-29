import { db } from "../db";
import { leads, enhancedVerification } from "@shared/schema";
import type { Lead } from "@shared/schema";
import { eq, and, gte, desc, inArray } from "drizzle-orm";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";
import { cacheManager } from "./cache-manager";
import { eventBus } from "./event-bus";
import type { HunterEmailVerification } from "./enrichment/hunter-service";
import type { PhoneValidationResult } from "../numverify-service";

/**
 * Multi-Source Verification Engine
 * Combines data from multiple verification sources to provide comprehensive lead verification
 * with advanced confidence scoring and intelligent fallback mechanisms
 */

export interface VerificationSource {
  name: string;
  type: 'email' | 'phone' | 'business' | 'address' | 'social';
  confidence: number; // 0-100
  data: any;
  timestamp: Date;
  error?: string;
}

export interface MultiSourceConfidence {
  overall: number;           // 0-100
  email: number;             // 0-100
  phone: number;             // 0-100
  business: number;          // 0-100
  address: number;           // 0-100
  social: number;            // 0-100
  sources: VerificationSource[];
}

export interface VerificationDecision {
  status: 'verified' | 'partially_verified' | 'risky' | 'unverified' | 'failed';
  confidence: MultiSourceConfidence;
  riskFactors: string[];
  positiveSignals: string[];
  recommendations: string[];
  shouldEnrichFurther: boolean;
  estimatedQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface VerificationConfig {
  sources: {
    email: boolean;
    phone: boolean;
    business: boolean;
    address: boolean;
    social: boolean;
  };
  thresholds: {
    verified: number;        // Min confidence for "verified" (default: 80)
    partial: number;         // Min confidence for "partially_verified" (default: 50)
    risky: number;          // Min confidence for "risky" (default: 30)
  };
  weights: {
    email: number;          // Weight for email verification (default: 0.35)
    phone: number;          // Weight for phone verification (default: 0.35)
    business: number;       // Weight for business verification (default: 0.20)
    address: number;        // Weight for address verification (default: 0.05)
    social: number;         // Weight for social verification (default: 0.05)
  };
  cacheHours: number;       // How long to cache results (default: 72)
  retryAttempts: number;    // Max retry attempts per source (default: 3)
  parallelLimit: number;    // Max parallel verifications (default: 5)
}

export class MultiSourceVerificationEngine {
  private readonly defaultConfig: VerificationConfig = {
    sources: {
      email: true,
      phone: true,
      business: true,
      address: false, // Can be enabled when address API is available
      social: false   // Can be enabled when social API is available
    },
    thresholds: {
      verified: 80,
      partial: 50,
      risky: 30
    },
    weights: {
      email: 0.35,
      phone: 0.35,
      business: 0.20,
      address: 0.05,
      social: 0.05
    },
    cacheHours: 72,
    retryAttempts: 3,
    parallelLimit: 5
  };

  private config: VerificationConfig;
  private verificationQueue: Map<string, Promise<VerificationDecision>> = new Map();

  constructor(config?: Partial<VerificationConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    
    // Normalize weights to ensure they sum to 1
    const totalWeight = Object.values(this.config.weights).reduce((sum, w) => sum + w, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      Object.keys(this.config.weights).forEach(key => {
        this.config.weights[key as keyof typeof this.config.weights] /= totalWeight;
      });
    }
  }

  /**
   * Perform comprehensive multi-source verification
   */
  async verifyLead(leadId: string, forceRefresh: boolean = false): Promise<VerificationDecision> {
    // Check if verification is already in progress
    const inProgress = this.verificationQueue.get(leadId);
    if (inProgress && !forceRefresh) {
      return inProgress;
    }

    // Create new verification promise
    const verificationPromise = this.performVerification(leadId, forceRefresh);
    this.verificationQueue.set(leadId, verificationPromise);

    try {
      const result = await verificationPromise;
      return result;
    } finally {
      // Clean up queue
      this.verificationQueue.delete(leadId);
    }
  }

  /**
   * Batch verify multiple leads with rate limiting
   */
  async batchVerify(
    leadIds: string[],
    forceRefresh: boolean = false
  ): Promise<Map<string, VerificationDecision>> {
    const results = new Map<string, VerificationDecision>();
    
    // Process in chunks to respect parallelLimit
    for (let i = 0; i < leadIds.length; i += this.config.parallelLimit) {
      const chunk = leadIds.slice(i, i + this.config.parallelLimit);
      const chunkResults = await Promise.allSettled(
        chunk.map(id => this.verifyLead(id, forceRefresh))
      );
      
      chunk.forEach((leadId, index) => {
        const result = chunkResults[index];
        if (result.status === 'fulfilled') {
          results.set(leadId, result.value);
        } else {
          // Create failed result
          results.set(leadId, this.createFailedDecision(result.reason));
        }
      });
      
      // Add delay between chunks to avoid rate limiting
      if (i + this.config.parallelLimit < leadIds.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }

  /**
   * Perform the actual verification with all sources
   */
  private async performVerification(leadId: string, forceRefresh: boolean): Promise<VerificationDecision> {
    // Check cache first
    if (!forceRefresh) {
      const cached = await this.getCachedVerification(leadId);
      if (cached) {
        return cached;
      }
    }

    // Fetch lead data
    const lead = await this.fetchLead(leadId);
    if (!lead) {
      return this.createFailedDecision('Lead not found');
    }

    // Collect verification from all sources in parallel
    const sources: VerificationSource[] = [];
    const verificationTasks: Promise<void>[] = [];

    // Email verification
    if (this.config.sources.email && lead.email) {
      verificationTasks.push(
        this.verifyEmail(lead.email).then(result => {
          if (result) sources.push(result);
        })
      );
    }

    // Phone verification
    if (this.config.sources.phone && lead.phone) {
      verificationTasks.push(
        this.verifyPhone(lead.phone, lead.stateCode).then(result => {
          if (result) sources.push(result);
        })
      );
    }

    // Business verification
    if (this.config.sources.business && lead.businessName) {
      verificationTasks.push(
        this.verifyBusiness(lead).then(result => {
          if (result) sources.push(result);
        })
      );
    }

    // Address verification (placeholder for future implementation)
    if (this.config.sources.address && ((lead as any).address || lead.city)) {
      verificationTasks.push(
        this.verifyAddress(lead).then(result => {
          if (result) sources.push(result);
        })
      );
    }

    // Social verification (placeholder for future implementation)
    if (this.config.sources.social) {
      verificationTasks.push(
        this.verifySocial(lead).then(result => {
          if (result) sources.push(result);
        })
      );
    }

    // Wait for all verifications to complete
    await Promise.allSettled(verificationTasks);

    // Calculate confidence scores
    const confidence = this.calculateMultiSourceConfidence(sources);

    // Generate decision
    const decision = this.generateVerificationDecision(confidence, lead);

    // Cache the result
    await this.cacheVerification(leadId, decision);

    // Store in database
    await this.storeVerificationResult(leadId, decision);

    // Emit event
    eventBus.emit('verification:completed', { leadId, decision });

    return decision;
  }

  /**
   * Verify email from multiple sources
   */
  private async verifyEmail(email: string): Promise<VerificationSource | null> {
    try {
      // Try Hunter.io first
      const hunterResult = await this.retryOperation(() => hunterService.verifyEmail(email));
      
      if (hunterResult) {
        let confidence = 0;
        
        // Calculate confidence based on Hunter.io result
        switch (hunterResult.result) {
          case 'deliverable':
            confidence = 95;
            break;
          case 'risky':
            confidence = 50;
            break;
          case 'undeliverable':
            confidence = 10;
            break;
          default:
            confidence = 30;
        }

        // Adjust for other factors
        if (hunterResult.disposable) confidence = Math.max(confidence - 30, 10);
        if (!hunterResult.mx_records) confidence = Math.max(confidence - 20, 10);
        if (hunterResult.gibberish) confidence = Math.max(confidence - 15, 10);
        if (hunterResult.accept_all) confidence = Math.max(confidence - 10, 10);

        return {
          name: 'Hunter.io',
          type: 'email',
          confidence,
          data: hunterResult,
          timestamp: new Date()
        };
      }
    } catch (error) {
      console.error('[MultiSourceVerification] Email verification failed:', error);
    }

    // Fallback to basic validation
    return this.basicEmailValidation(email);
  }

  /**
   * Verify phone from multiple sources
   */
  private async verifyPhone(phone: string, stateCode?: string | null): Promise<VerificationSource | null> {
    try {
      // Clean phone number
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Try Numverify
      const numverifyResult = await this.retryOperation(() => 
        numverifyService.validatePhone(cleanPhone, stateCode || 'US')
      );
      
      if (numverifyResult) {
        let confidence = numverifyResult.isValid ? 80 : 20;
        
        // Adjust based on risk score
        if (numverifyResult.isValid) {
          if (numverifyResult.riskScore <= 30) {
            confidence = 90;
          } else if (numverifyResult.riskScore <= 50) {
            confidence = 70;
          } else if (numverifyResult.riskScore <= 70) {
            confidence = 50;
          } else {
            confidence = 30;
          }

          // Adjust for line type
          if (numverifyResult.lineType === 'mobile' || numverifyResult.lineType === 'landline') {
            confidence += 5;
          } else if (numverifyResult.lineType === 'voip') {
            confidence -= 10;
          }
        }

        return {
          name: 'Numverify',
          type: 'phone',
          confidence: Math.max(0, Math.min(100, confidence)),
          data: numverifyResult,
          timestamp: new Date()
        };
      }
    } catch (error) {
      console.error('[MultiSourceVerification] Phone verification failed:', error);
    }

    // Fallback to basic validation
    return this.basicPhoneValidation(phone);
  }

  /**
   * Verify business information
   */
  private async verifyBusiness(lead: Lead): Promise<VerificationSource | null> {
    const issues: string[] = [];
    let confidence = 50; // Start at neutral

    // Check business name validity
    const businessName = lead.businessName?.trim().toLowerCase() || '';
    
    if (!businessName) {
      return {
        name: 'Business Validation',
        type: 'business',
        confidence: 0,
        data: { valid: false, issues: ['No business name'] },
        timestamp: new Date()
      };
    }

    // Check for test/fake patterns
    const testPatterns = [
      /^test/i, /^demo/i, /^sample/i, /^example/i,
      /^fake/i, /^dummy/i, /^placeholder/i
    ];

    if (testPatterns.some(pattern => pattern.test(businessName))) {
      issues.push('Business name appears to be test data');
      confidence = 10;
    }

    // Check for proper business indicators
    const entityIndicators = [
      'llc', 'inc', 'corp', 'corporation', 'ltd', 'limited',
      'co', 'company', 'group', 'partners', 'partnership',
      'associates', 'enterprises', 'holdings', 'services'
    ];
    
    const hasEntityIndicator = entityIndicators.some(indicator => businessName.includes(indicator));
    if (hasEntityIndicator) {
      confidence += 20;
    }

    // Check business data completeness
    if (lead.industry) confidence += 10;
    const revenueValue = lead.annualRevenue ? parseInt(lead.annualRevenue.replace(/\D/g, ''), 10) : 0;
    if (revenueValue > 0) confidence += 15;
    if (lead.yearFounded) {
      const age = new Date().getFullYear() - lead.yearFounded;
      if (age > 0 && age < 100) confidence += 10;
    }
    if (lead.employeeCount && lead.employeeCount > 0) confidence += 10;

    // Check for business email domain match
    if (lead.email && !lead.email.includes('@gmail') && !lead.email.includes('@yahoo') && 
        !lead.email.includes('@hotmail') && !lead.email.includes('@outlook')) {
      confidence += 10; // Business email domain
    }

    return {
      name: 'Business Validation',
      type: 'business',
      confidence: Math.max(0, Math.min(100, confidence)),
      data: {
        valid: confidence >= 50,
        issues,
        hasEntityIndicator,
        dataCompleteness: {
          industry: !!lead.industry,
          revenue: !!lead.annualRevenue,
          established: !!lead.yearFounded,
          employees: !!lead.employeeCount
        }
      },
      timestamp: new Date()
    };
  }

  /**
   * Verify address (placeholder for future implementation)
   */
  private async verifyAddress(lead: Lead): Promise<VerificationSource | null> {
    // Basic address validation for now
    let confidence = 0;
    const issues: string[] = [];
    const leadAny = lead as any;

    if (leadAny.address || lead.fullAddress) confidence += 30;
    if (lead.city) confidence += 20;
    if (lead.stateCode) confidence += 20;
    if (leadAny.zipCode && /^\d{5}(-\d{4})?$/.test(leadAny.zipCode)) confidence += 30;

    if (!leadAny.address && !lead.fullAddress && !lead.city) {
      issues.push('No address information');
    }

    return {
      name: 'Address Validation',
      type: 'address',
      confidence,
      data: {
        valid: confidence >= 50,
        issues,
        completeness: {
          address: !!(leadAny.address || lead.fullAddress),
          city: !!lead.city,
          state: !!lead.stateCode,
          zip: !!leadAny.zipCode
        }
      },
      timestamp: new Date()
    };
  }

  /**
   * Verify social media presence (placeholder for future implementation)
   */
  private async verifySocial(lead: Lead): Promise<VerificationSource | null> {
    // Placeholder for social media verification
    // Could integrate with social media APIs in the future
    return null;
  }

  /**
   * Basic email validation fallback
   */
  private basicEmailValidation(email: string): VerificationSource {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let confidence = 0;
    const issues: string[] = [];

    if (!emailRegex.test(email)) {
      issues.push('Invalid email format');
      confidence = 10;
    } else {
      confidence = 40; // Basic format is valid
      
      const domain = email.split('@')[1].toLowerCase();
      
      // Check for webmail
      const webmail = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
      if (webmail.includes(domain)) {
        confidence = 50;
      }
      
      // Check for disposable
      const disposable = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
      if (disposable.some(d => domain.includes(d))) {
        confidence = 15;
        issues.push('Disposable email domain');
      }
    }

    return {
      name: 'Basic Email Validation',
      type: 'email',
      confidence,
      data: { valid: confidence >= 40, issues },
      timestamp: new Date()
    };
  }

  /**
   * Basic phone validation fallback
   */
  private basicPhoneValidation(phone: string): VerificationSource {
    const cleanPhone = phone.replace(/\D/g, '');
    let confidence = 0;
    const issues: string[] = [];

    if (cleanPhone.length === 10 || (cleanPhone.length === 11 && cleanPhone.startsWith('1'))) {
      confidence = 50; // Basic format is valid
      
      // Check for invalid patterns
      if (/^(\d)\1{9,10}$/.test(cleanPhone)) {
        confidence = 10;
        issues.push('Invalid pattern: repeated digits');
      } else if (/^1234567890/.test(cleanPhone)) {
        confidence = 10;
        issues.push('Invalid pattern: sequential digits');
      }
    } else {
      confidence = 10;
      issues.push('Invalid phone number length');
    }

    return {
      name: 'Basic Phone Validation',
      type: 'phone',
      confidence,
      data: { valid: confidence >= 40, issues },
      timestamp: new Date()
    };
  }

  /**
   * Calculate multi-source confidence scores
   */
  private calculateMultiSourceConfidence(sources: VerificationSource[]): MultiSourceConfidence {
    const confidence: MultiSourceConfidence = {
      overall: 0,
      email: 0,
      phone: 0,
      business: 0,
      address: 0,
      social: 0,
      sources
    };

    // Group sources by type and take the highest confidence for each type
    const sourcesByType = new Map<string, VerificationSource[]>();
    sources.forEach(source => {
      const existing = sourcesByType.get(source.type) || [];
      existing.push(source);
      sourcesByType.set(source.type, existing);
    });

    // Calculate confidence for each type
    sourcesByType.forEach((typeSources, type) => {
      const maxConfidence = Math.max(...typeSources.map(s => s.confidence));
      confidence[type as keyof Omit<MultiSourceConfidence, 'overall' | 'sources'>] = maxConfidence;
    });

    // Calculate overall weighted confidence
    confidence.overall = Math.round(
      confidence.email * this.config.weights.email +
      confidence.phone * this.config.weights.phone +
      confidence.business * this.config.weights.business +
      confidence.address * this.config.weights.address +
      confidence.social * this.config.weights.social
    );

    return confidence;
  }

  /**
   * Generate verification decision based on confidence
   */
  private generateVerificationDecision(
    confidence: MultiSourceConfidence,
    lead: Lead
  ): VerificationDecision {
    const riskFactors: string[] = [];
    const positiveSignals: string[] = [];
    const recommendations: string[] = [];

    // Analyze email confidence
    if (confidence.email >= 80) {
      positiveSignals.push('✅ Email verified as deliverable');
    } else if (confidence.email >= 50) {
      positiveSignals.push('✓ Email appears valid');
    } else if (confidence.email > 0) {
      riskFactors.push('⚠️ Email verification uncertain');
      recommendations.push('Consider manual email verification');
    } else {
      riskFactors.push('❌ No email provided');
      recommendations.push('Obtain email address for better verification');
    }

    // Analyze phone confidence
    if (confidence.phone >= 80) {
      positiveSignals.push('✅ Phone verified and low risk');
    } else if (confidence.phone >= 50) {
      positiveSignals.push('✓ Phone appears valid');
    } else if (confidence.phone > 0) {
      riskFactors.push('⚠️ Phone verification uncertain');
      recommendations.push('Consider SMS verification');
    } else {
      riskFactors.push('❌ No phone provided');
      recommendations.push('Obtain phone number for better verification');
    }

    // Analyze business confidence
    if (confidence.business >= 70) {
      positiveSignals.push('✅ Business data complete and valid');
    } else if (confidence.business >= 50) {
      positiveSignals.push('✓ Basic business information present');
    } else {
      riskFactors.push('⚠️ Limited business information');
      recommendations.push('Enrich business data from external sources');
    }

    // Determine status
    let status: VerificationDecision['status'];
    if (confidence.overall >= this.config.thresholds.verified) {
      status = 'verified';
    } else if (confidence.overall >= this.config.thresholds.partial) {
      status = 'partially_verified';
    } else if (confidence.overall >= this.config.thresholds.risky) {
      status = 'risky';
    } else {
      status = 'unverified';
    }

    // Determine quality estimate
    let estimatedQuality: VerificationDecision['estimatedQuality'];
    if (confidence.overall >= 85) {
      estimatedQuality = 'excellent';
    } else if (confidence.overall >= 70) {
      estimatedQuality = 'good';
    } else if (confidence.overall >= 50) {
      estimatedQuality = 'fair';
    } else {
      estimatedQuality = 'poor';
    }

    // Determine if further enrichment would help
    const shouldEnrichFurther = 
      status === 'risky' || 
      status === 'unverified' ||
      (status === 'partially_verified' && confidence.overall < 70);

    if (shouldEnrichFurther) {
      recommendations.push('Additional enrichment recommended to improve verification confidence');
    }

    return {
      status,
      confidence,
      riskFactors,
      positiveSignals,
      recommendations,
      shouldEnrichFurther,
      estimatedQuality
    };
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    attempts: number = this.config.retryAttempts
  ): Promise<T | null> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        return await operation();
      } catch (error: any) {
        console.error(`[MultiSourceVerification] Attempt ${attempt}/${attempts} failed:`, error.message);
        if (attempt === attempts) {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Fetch lead from database
   */
  private async fetchLead(leadId: string): Promise<Lead | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);
    
    return lead || null;
  }

  /**
   * Cache verification result
   */
  private async cacheVerification(leadId: string, decision: VerificationDecision): Promise<void> {
    const cacheKey = `verification:${leadId}`;
    const ttl = this.config.cacheHours * 60 * 60 * 1000; // Convert hours to milliseconds
    
    await cacheManager.set('multi-source-verification', cacheKey, decision, { ttl });
  }

  /**
   * Get cached verification
   */
  private async getCachedVerification(leadId: string): Promise<VerificationDecision | null> {
    const cacheKey = `verification:${leadId}`;
    return await cacheManager.get<VerificationDecision>('multi-source-verification', cacheKey);
  }

  /**
   * Store verification result in database
   */
  private async storeVerificationResult(leadId: string, decision: VerificationDecision): Promise<void> {
    try {
      // Update lead with verification scores
      await db
        .update(leads)
        .set({
          overallVerificationScore: decision.confidence.overall,
          emailVerificationScore: decision.confidence.email,
          phoneVerificationScore: decision.confidence.phone,
          nameVerificationScore: decision.confidence.business,
          verificationStatus: decision.status,
          lastVerifiedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));

      // Store detailed verification in enhancedVerification table
      await db.insert(enhancedVerification).values({
        leadId,
        emailScore: decision.confidence.email,
        emailStatus: decision.confidence.email >= 80 ? 'deliverable' : decision.confidence.email >= 50 ? 'risky' : 'unknown',
        overallConfidenceScore: String(decision.confidence.overall),
        verificationStatus: decision.status,
        mxRecords: decision.confidence.email >= 40,
        smtpCheck: decision.confidence.email >= 60,
        emailDisposable: false,
        phoneValid: decision.confidence.phone >= 50,
        phoneRiskScore: 100 - decision.confidence.phone,
        confidenceBreakdown: {
          email: decision.confidence.email,
          phone: decision.confidence.phone,
          business: decision.confidence.business,
          address: decision.confidence.address,
          social: decision.confidence.social,
          positiveSignals: decision.positiveSignals,
          riskFactors: decision.riskFactors,
          recommendations: decision.recommendations
        },
        cachedUntil: new Date(Date.now() + this.config.cacheHours * 60 * 60 * 1000),
        verifiedAt: new Date()
      } as any);
    } catch (error) {
      console.error('[MultiSourceVerification] Failed to store verification result:', error);
      // Don't throw - verification still succeeded even if storage failed
    }
  }

  /**
   * Create a failed decision
   */
  private createFailedDecision(reason: string): VerificationDecision {
    return {
      status: 'failed',
      confidence: {
        overall: 0,
        email: 0,
        phone: 0,
        business: 0,
        address: 0,
        social: 0,
        sources: []
      },
      riskFactors: [`Verification failed: ${reason}`],
      positiveSignals: [],
      recommendations: ['Manual verification required'],
      shouldEnrichFurther: false,
      estimatedQuality: 'poor'
    };
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats(hours: number = 24): Promise<{
    total: number;
    verified: number;
    partial: number;
    risky: number;
    unverified: number;
    failed: number;
    averageConfidence: number;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const results = await db
      .select({
        verificationStatus: enhancedVerification.verificationStatus,
        overallConfidenceScore: enhancedVerification.overallConfidenceScore
      })
      .from(enhancedVerification)
      .where(gte(enhancedVerification.verifiedAt, since));

    const stats = {
      total: results.length,
      verified: 0,
      partial: 0,
      risky: 0,
      unverified: 0,
      failed: 0,
      averageConfidence: 0
    };

    let totalConfidence = 0;
    results.forEach(r => {
      switch (r.verificationStatus) {
        case 'verified':
          stats.verified++;
          break;
        case 'partial':
          stats.partial++;
          break;
        case 'unverified':
          stats.unverified++;
          break;
        case 'failed':
          stats.failed++;
          break;
        default:
          const score = r.overallConfidenceScore ? parseFloat(r.overallConfidenceScore) : 0;
          if (score >= 30 && score < 50) {
            stats.risky++;
          }
      }
      totalConfidence += r.overallConfidenceScore ? parseFloat(r.overallConfidenceScore) : 0;
    });

    stats.averageConfidence = stats.total > 0 ? Math.round(totalConfidence / stats.total) : 0;

    return stats;
  }
}

// Export singleton instance
export const multiSourceVerificationEngine = new MultiSourceVerificationEngine();