/**
 * Unified Validation Service
 * 
 * This service handles all lead validation and verification operations,
 * completely separate from enrichment. It focuses on:
 * - Data completeness checks
 * - Contact information verification
 * - Business identity validation
 * - Quality scoring
 * 
 * This creates a clear separation between enrichment (adding data) and validation (verifying data).
 */

import { db } from '../db';
import { leads } from '@shared/schema';
import { eq, and, isNull, isNotNull, or, sql, lt } from 'drizzle-orm';
import { eventBus } from './event-bus';

export interface ValidationResult {
  leadId: string;
  overallScore: number;
  emailValid: boolean;
  emailScore: number | null;
  phoneValid: boolean;
  phoneScore: number | null;
  businessValid: boolean;
  businessScore: number | null;
  dataCompleteness: number;
  validationStatus: 'fully_validated' | 'partially_validated' | 'validation_failed' | 'unvalidated';
  issues: string[];
  recommendations: string[];
}

export interface ValidationStats {
  fullyValidated: number;
  partiallyValidated: number;
  failedValidation: number;
  unvalidated: number;
  validationRate: number;
  avgValidationScore: number;
}

export class UnifiedValidationService {
  constructor() {
    console.log('[UnifiedValidationService] Initialized');
  }

  /**
   * VALIDATION CORE
   * Validate a single lead
   */
  async validateLead(leadId: string): Promise<ValidationResult> {
    try {
      const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead.length) {
        throw new Error(`Lead ${leadId} not found`);
      }

      const leadData = lead[0];
      const issues: string[] = [];
      const recommendations: string[] = [];

      // 1. Email Validation
      let emailScore: number | null = leadData.emailVerificationScore;
      let emailValid = false;
      
      if (!leadData.email) {
        issues.push('Email is missing');
        recommendations.push('Add email address to improve lead quality');
      } else if (emailScore === null) {
        // Basic email format validation score
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        emailScore = emailRegex.test(leadData.email) ? 70 : 30;
        emailValid = emailScore >= 60;
        
        // Update lead with verification score
        await db.update(leads)
          .set({ emailVerificationScore: emailScore })
          .where(eq(leads.id, leadId));
      } else {
        emailValid = emailScore >= 60;
      }

      if (!emailValid && leadData.email) {
        issues.push(`Email validation failed (score: ${emailScore})`);
        recommendations.push('Verify email address is correct');
      }

      // 2. Phone Validation
      let phoneScore: number | null = leadData.phoneVerificationScore;
      let phoneValid = false;
      
      if (!leadData.phone) {
        issues.push('Phone number is missing');
        recommendations.push('Add phone number for better contact rates');
      } else if (phoneScore === null) {
        // Basic phone format validation score
        const phoneDigits = leadData.phone.replace(/\D/g, '');
        phoneScore = phoneDigits.length >= 10 && phoneDigits.length <= 15 ? 70 : 30;
        phoneValid = phoneScore >= 60;
        
        // Update lead with verification score
        await db.update(leads)
          .set({ phoneVerificationScore: phoneScore })
          .where(eq(leads.id, leadId));
      } else {
        phoneValid = phoneScore >= 60;
      }

      if (!phoneValid && leadData.phone) {
        issues.push(`Phone validation failed (score: ${phoneScore})`);
        recommendations.push('Verify phone number format and validity');
      }

      // 3. Business Validation
      let businessScore: number | null = leadData.nameVerificationScore;
      let businessValid = false;
      
      if (!leadData.businessName) {
        issues.push('Business name is missing');
        recommendations.push('Business name is required for lead validity');
        businessScore = 0;
      } else if (businessScore === null) {
        // Basic business name validation
        businessScore = this.validateBusinessName(leadData.businessName) ? 80 : 40;
        businessValid = businessScore >= 60;
        
        // Update lead with verification score
        await db.update(leads)
          .set({ nameVerificationScore: businessScore })
          .where(eq(leads.id, leadId));
      } else {
        businessValid = businessScore >= 60;
      }

      if (!businessValid && leadData.businessName) {
        issues.push('Business name validation concerns');
        recommendations.push('Verify business name accuracy');
      }

      // 4. Data Completeness
      const dataCompleteness = this.calculateDataCompleteness(leadData);
      
      if (dataCompleteness < 50) {
        issues.push(`Low data completeness (${dataCompleteness}%)`);
        recommendations.push('Enrich lead with additional data points');
      }

      // 5. Calculate Overall Score
      const scores = [emailScore, phoneScore, businessScore].filter(s => s !== null);
      const overallScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b!, 0) / scores.length)
        : 0;

      // 6. Determine Validation Status
      let validationStatus: 'fully_validated' | 'partially_validated' | 'validation_failed' | 'unvalidated';
      
      if (emailValid && phoneValid && businessValid) {
        validationStatus = 'fully_validated';
      } else if (emailValid || phoneValid || businessValid) {
        validationStatus = 'partially_validated';
      } else if (scores.length > 0) {
        validationStatus = 'validation_failed';
      } else {
        validationStatus = 'unvalidated';
      }

      // Update lead quality score based on validation
      const newQualityScore = Math.round((overallScore + dataCompleteness) / 2);
      await db.update(leads)
        .set({ qualityScore: newQualityScore })
        .where(eq(leads.id, leadId));

      // Emit validation complete event
      eventBus.emit('lead:validation-complete', {
        leadId,
        validationStatus,
        overallScore
      });

      return {
        leadId,
        overallScore,
        emailValid,
        emailScore,
        phoneValid,
        phoneScore,
        businessValid,
        businessScore,
        dataCompleteness,
        validationStatus,
        issues,
        recommendations
      };
    } catch (error) {
      console.error('[UnifiedValidationService] Error validating lead:', error);
      throw error;
    }
  }

  /**
   * BULK VALIDATION
   * Validate multiple leads at once
   */
  async bulkValidate(): Promise<{ validated: number; failed: number }> {
    try {
      // Get leads that haven't been validated
      const leadsToValidate = await db.select()
        .from(leads)
        .where(
          or(
            isNull(leads.emailVerificationScore),
            isNull(leads.phoneVerificationScore),
            isNull(leads.nameVerificationScore)
          )
        )
        .limit(100);

      let validated = 0;
      let failed = 0;

      for (const lead of leadsToValidate) {
        try {
          await this.validateLead(lead.id);
          validated++;
        } catch (error) {
          console.error(`Failed to validate lead ${lead.id}:`, error);
          failed++;
        }
      }

      console.log(`[UnifiedValidationService] Bulk validation: ${validated} validated, ${failed} failed`);
      return { validated, failed };
    } catch (error) {
      console.error('[UnifiedValidationService] Error in bulk validation:', error);
      throw error;
    }
  }

  /**
   * VALIDATION STATISTICS
   * Get overall validation statistics
   */
  async getValidationStats(): Promise<ValidationStats> {
    try {
      const stats = await db.select({
        fullyValidated: sql<number>`COUNT(CASE WHEN 
          ${leads.emailVerificationScore} >= 60 AND 
          ${leads.phoneVerificationScore} >= 60 AND 
          ${leads.nameVerificationScore} >= 60 
          THEN 1 END)`,
        partiallyValidated: sql<number>`COUNT(CASE WHEN 
          (${leads.emailVerificationScore} >= 60 OR 
           ${leads.phoneVerificationScore} >= 60 OR 
           ${leads.nameVerificationScore} >= 60) AND NOT (
          ${leads.emailVerificationScore} >= 60 AND 
          ${leads.phoneVerificationScore} >= 60 AND 
          ${leads.nameVerificationScore} >= 60)
          THEN 1 END)`,
        failedValidation: sql<number>`COUNT(CASE WHEN 
          ${leads.emailVerificationScore} < 60 AND 
          ${leads.phoneVerificationScore} < 60 AND 
          ${leads.nameVerificationScore} < 60 AND (
          ${leads.emailVerificationScore} IS NOT NULL OR 
          ${leads.phoneVerificationScore} IS NOT NULL OR 
          ${leads.nameVerificationScore} IS NOT NULL)
          THEN 1 END)`,
        unvalidated: sql<number>`COUNT(CASE WHEN 
          ${leads.emailVerificationScore} IS NULL AND 
          ${leads.phoneVerificationScore} IS NULL AND 
          ${leads.nameVerificationScore} IS NULL 
          THEN 1 END)`,
        totalLeads: sql<number>`COUNT(*)`,
        avgScore: sql<number>`AVG((
          COALESCE(${leads.emailVerificationScore}, 0) + 
          COALESCE(${leads.phoneVerificationScore}, 0) + 
          COALESCE(${leads.nameVerificationScore}, 0)
        ) / 3)`
      })
      .from(leads);

      const result = stats[0];
      const validationRate = result.totalLeads > 0 
        ? Math.round((result.fullyValidated / result.totalLeads) * 100)
        : 0;

      return {
        fullyValidated: result.fullyValidated,
        partiallyValidated: result.partiallyValidated,
        failedValidation: result.failedValidation,
        unvalidated: result.unvalidated,
        validationRate,
        avgValidationScore: Math.round(result.avgScore || 0)
      };
    } catch (error) {
      console.error('[UnifiedValidationService] Error getting stats:', error);
      throw error;
    }
  }

  /**
   * GET VALIDATION QUEUE
   * Get leads that need validation
   */
  async getValidationQueue(limit: number = 50) {
    try {
      return await db.select()
        .from(leads)
        .where(
          or(
            isNull(leads.emailVerificationScore),
            isNull(leads.phoneVerificationScore),
            isNull(leads.nameVerificationScore),
            and(
              isNotNull(leads.emailVerificationScore),
              lt(leads.emailVerificationScore, 60)
            ),
            and(
              isNotNull(leads.phoneVerificationScore),
              lt(leads.phoneVerificationScore, 60)
            )
          )
        )
        .limit(limit);
    } catch (error) {
      console.error('[UnifiedValidationService] Error getting validation queue:', error);
      throw error;
    }
  }

  /**
   * HELPER METHODS
   */
  private validateBusinessName(businessName: string): boolean {
    // Basic business name validation
    if (!businessName || businessName.length < 2) return false;
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /^test/i,
      /^demo/i,
      /^sample/i,
      /^example/i,
      /^xxx/i,
      /^n\/a/i,
      /^none/i,
      /^null/i
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(businessName)) return false;
    }
    
    return true;
  }

  private calculateDataCompleteness(lead: any): number {
    const requiredFields = [
      'businessName', 'ownerName', 'email', 'phone',
      'fullAddress', 'city', 'stateCode'
    ];
    
    const optionalFields = [
      'websiteUrl', 'annualRevenue', 'estimatedRevenue', 'employeeCount', 'industry',
      'requestedAmount', 'timeInBusiness'
    ];

    // Required fields are worth 70% of the score
    const requiredFilled = requiredFields.filter(field => 
      lead[field] !== null && lead[field] !== undefined && lead[field] !== ''
    ).length;
    const requiredScore = (requiredFilled / requiredFields.length) * 70;

    // Optional fields are worth 30% of the score
    const optionalFilled = optionalFields.filter(field => 
      lead[field] !== null && lead[field] !== undefined && lead[field] !== ''
    ).length;
    const optionalScore = (optionalFilled / optionalFields.length) * 30;

    return Math.round(requiredScore + optionalScore);
  }
}

// Export singleton instance
export const unifiedValidationService = new UnifiedValidationService();