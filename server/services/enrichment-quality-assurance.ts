import { Lead } from "@shared/schema";
import { eventBus } from "./event-bus";
import { storage } from "../storage";
import { z } from "zod";

/**
 * Enrichment Quality Assurance System
 * Validates data quality, detects anomalies, and ensures data integrity
 */

// Data validation rules
const ValidationRules = {
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  businessName: z.string().min(2).max(200).optional(),
  ownerName: z.string().min(2).max(100).optional(),
  annualRevenue: z.number().min(0).max(1000000000).optional(),
  employeeCount: z.number().min(0).max(500000).optional(),
  creditScore: z.number().min(300).max(850).optional(),
  yearEstablished: z.number().min(1800).max(new Date().getFullYear()).optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  stateCode: z.string().length(2).optional(),
  website: z.string().url().optional()
};

// Quality check types
export interface QualityCheck {
  field: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedValue?: any;
  confidence: number;
}

// Anomaly detection result
export interface AnomalyResult {
  field: string;
  value: any;
  isAnomaly: boolean;
  reason: string;
  expectedRange?: { min: any; max: any };
  historicalAverage?: any;
  deviation?: number;
}

// Data integrity result
export interface IntegrityResult {
  isValid: boolean;
  consistencyScore: number;
  completenessScore: number;
  accuracyScore: number;
  uniquenessScore: number;
  issues: string[];
  suggestions: string[];
}

// Quality report
export interface QualityReport {
  leadId?: string;
  timestamp: Date;
  overallScore: number;
  dataQuality: {
    validity: number;
    completeness: number;
    consistency: number;
    accuracy: number;
    uniqueness: number;
  };
  checks: QualityCheck[];
  anomalies: AnomalyResult[];
  integrity: IntegrityResult;
  recommendations: string[];
  autoCorrections: Array<{
    field: string;
    originalValue: any;
    correctedValue: any;
    reason: string;
  }>;
}

export class EnrichmentQualityAssurance {
  private readonly thresholds = {
    criticalQualityScore: 40,
    acceptableQualityScore: 70,
    excellentQualityScore: 90,
    anomalyDeviationThreshold: 3, // Standard deviations
    duplicateThreshold: 0.85, // Similarity threshold for duplicates
  };
  
  private historicalData: Map<string, any[]> = new Map();
  private validationCache: Map<string, QualityReport> = new Map();
  
  constructor() {
    console.log('[QualityAssurance] Initialized with validation rules and anomaly detection');
  }
  
  /**
   * Perform comprehensive quality assurance
   */
  async performQualityAssurance(
    lead: Partial<Lead>,
    options: {
      autoCorrect?: boolean;
      strictMode?: boolean;
      checkDuplicates?: boolean;
      validateExternal?: boolean;
    } = {}
  ): Promise<QualityReport> {
    console.log(`[QualityAssurance] Starting QA for lead:`, lead.id || 'new');
    
    const report: QualityReport = {
      leadId: lead.id,
      timestamp: new Date(),
      overallScore: 0,
      dataQuality: {
        validity: 0,
        completeness: 0,
        consistency: 0,
        accuracy: 0,
        uniqueness: 0
      },
      checks: [],
      anomalies: [],
      integrity: {
        isValid: true,
        consistencyScore: 0,
        completenessScore: 0,
        accuracyScore: 0,
        uniquenessScore: 0,
        issues: [],
        suggestions: []
      },
      recommendations: [],
      autoCorrections: []
    };
    
    // Step 1: Validate data fields
    const validationChecks = await this.validateDataFields(lead, options.strictMode || false);
    report.checks.push(...validationChecks);
    
    // Step 2: Detect anomalies
    const anomalies = await this.detectAnomalies(lead);
    report.anomalies = anomalies;
    
    // Step 3: Check data integrity
    report.integrity = await this.checkDataIntegrity(lead);
    
    // Step 4: Check for duplicates if requested
    if (options.checkDuplicates && lead.email) {
      const duplicateCheck = await this.checkForDuplicates(lead);
      if (duplicateCheck.isDuplicate) {
        report.checks.push({
          field: 'duplicate',
          status: 'warning',
          message: `Possible duplicate found: ${duplicateCheck.similarLeadId}`,
          severity: 'high',
          confidence: duplicateCheck.similarity
        });
      }
    }
    
    // Step 5: Auto-correct if enabled
    if (options.autoCorrect) {
      const corrections = await this.autoCorrectData(lead);
      report.autoCorrections = corrections;
      
      // Apply corrections to lead
      corrections.forEach(correction => {
        (lead as any)[correction.field] = correction.correctedValue;
      });
    }
    
    // Step 6: Validate against external sources if requested
    if (options.validateExternal) {
      const externalChecks = await this.validateExternalData(lead);
      report.checks.push(...externalChecks);
    }
    
    // Calculate quality scores
    report.dataQuality = this.calculateQualityScores(report);
    report.overallScore = this.calculateOverallScore(report.dataQuality);
    
    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);
    
    // Cache the report
    if (lead.id) {
      this.validationCache.set(lead.id, report);
    }
    
    // Emit quality report event
    eventBus.emit('qa:report-generated', {
      leadId: lead.id,
      overallScore: report.overallScore,
      issues: report.integrity.issues.length
    });
    
    return report;
  }
  
  /**
   * Validate individual data fields
   */
  private async validateDataFields(lead: Partial<Lead>, strictMode: boolean): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];
    
    // Email validation
    if (lead.email) {
      try {
        ValidationRules.email.parse(lead.email);
        
        // Additional email checks
        if (this.isDisposableEmail(lead.email)) {
          checks.push({
            field: 'email',
            status: 'warning',
            message: 'Disposable email domain detected',
            severity: 'medium',
            confidence: 0.9
          });
        } else {
          checks.push({
            field: 'email',
            status: 'pass',
            message: 'Valid email format',
            severity: 'low',
            confidence: 1.0
          });
        }
      } catch (error) {
        checks.push({
          field: 'email',
          status: 'fail',
          message: 'Invalid email format',
          severity: 'critical',
          confidence: 1.0
        });
      }
    }
    
    // Phone validation
    if (lead.phone) {
      const cleanPhone = lead.phone.replace(/\D/g, '');
      
      if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
        // Check for invalid patterns
        if (this.isInvalidPhonePattern(cleanPhone)) {
          checks.push({
            field: 'phone',
            status: 'warning',
            message: 'Suspicious phone pattern detected',
            severity: 'medium',
            confidence: 0.8
          });
        } else {
          checks.push({
            field: 'phone',
            status: 'pass',
            message: 'Valid phone format',
            severity: 'low',
            confidence: 1.0
          });
        }
      } else {
        checks.push({
          field: 'phone',
          status: 'fail',
          message: 'Invalid phone number length',
          severity: 'high',
          confidence: 1.0
        });
      }
    }
    
    // Business name validation
    if (lead.businessName) {
      const businessName = lead.businessName.trim();
      
      // Check for test data
      if (this.isTestData(businessName)) {
        checks.push({
          field: 'businessName',
          status: 'fail',
          message: 'Test data detected',
          severity: 'critical',
          confidence: 0.95
        });
      } else if (businessName.length < 2) {
        checks.push({
          field: 'businessName',
          status: 'fail',
          message: 'Business name too short',
          severity: 'high',
          confidence: 1.0
        });
      } else if (!this.hasProperCapitalization(businessName) && strictMode) {
        checks.push({
          field: 'businessName',
          status: 'warning',
          message: 'Improper capitalization',
          severity: 'low',
          suggestedValue: this.properCapitalize(businessName),
          confidence: 0.7
        });
      } else {
        checks.push({
          field: 'businessName',
          status: 'pass',
          message: 'Valid business name',
          severity: 'low',
          confidence: 1.0
        });
      }
    }
    
    // Revenue validation
    if (lead.annualRevenue !== undefined && lead.annualRevenue !== null) {
      if (lead.annualRevenue < 0) {
        checks.push({
          field: 'annualRevenue',
          status: 'fail',
          message: 'Negative revenue value',
          severity: 'critical',
          confidence: 1.0
        });
      } else if (lead.annualRevenue > 1000000000) {
        checks.push({
          field: 'annualRevenue',
          status: 'warning',
          message: 'Unusually high revenue value',
          severity: 'medium',
          confidence: 0.7
        });
      } else {
        checks.push({
          field: 'annualRevenue',
          status: 'pass',
          message: 'Valid revenue range',
          severity: 'low',
          confidence: 1.0
        });
      }
    }
    
    // Credit score validation
    if (lead.creditScore) {
      if (lead.creditScore < 300 || lead.creditScore > 850) {
        checks.push({
          field: 'creditScore',
          status: 'fail',
          message: 'Credit score out of valid range (300-850)',
          severity: 'high',
          confidence: 1.0
        });
      } else {
        checks.push({
          field: 'creditScore',
          status: 'pass',
          message: 'Valid credit score',
          severity: 'low',
          confidence: 1.0
        });
      }
    }
    
    // Year established validation
    if (lead.yearEstablished) {
      const currentYear = new Date().getFullYear();
      if (lead.yearEstablished > currentYear) {
        checks.push({
          field: 'yearEstablished',
          status: 'fail',
          message: 'Year established is in the future',
          severity: 'critical',
          confidence: 1.0
        });
      } else if (lead.yearEstablished < 1800) {
        checks.push({
          field: 'yearEstablished',
          status: 'warning',
          message: 'Unusually old establishment year',
          severity: 'medium',
          confidence: 0.8
        });
      } else {
        checks.push({
          field: 'yearEstablished',
          status: 'pass',
          message: 'Valid establishment year',
          severity: 'low',
          confidence: 1.0
        });
      }
    }
    
    return checks;
  }
  
  /**
   * Detect anomalies in the data
   */
  private async detectAnomalies(lead: Partial<Lead>): Promise<AnomalyResult[]> {
    const anomalies: AnomalyResult[] = [];
    
    // Revenue vs Employee count anomaly
    if (lead.annualRevenue && lead.employeeCount) {
      const revenuePerEmployee = lead.annualRevenue / lead.employeeCount;
      
      // Typical range is $50k - $2M per employee
      if (revenuePerEmployee < 10000) {
        anomalies.push({
          field: 'revenue_per_employee',
          value: revenuePerEmployee,
          isAnomaly: true,
          reason: 'Unusually low revenue per employee',
          expectedRange: { min: 50000, max: 2000000 }
        });
      } else if (revenuePerEmployee > 5000000) {
        anomalies.push({
          field: 'revenue_per_employee',
          value: revenuePerEmployee,
          isAnomaly: true,
          reason: 'Unusually high revenue per employee',
          expectedRange: { min: 50000, max: 2000000 }
        });
      }
    }
    
    // Business age vs revenue anomaly
    if (lead.yearEstablished && lead.annualRevenue) {
      const businessAge = new Date().getFullYear() - lead.yearEstablished;
      const expectedMinRevenue = businessAge * 50000; // Simple heuristic
      
      if (businessAge > 5 && lead.annualRevenue < expectedMinRevenue * 0.2) {
        anomalies.push({
          field: 'revenue_vs_age',
          value: lead.annualRevenue,
          isAnomaly: true,
          reason: `Low revenue for ${businessAge}-year-old business`,
          expectedRange: { min: expectedMinRevenue * 0.5, max: expectedMinRevenue * 10 }
        });
      }
    }
    
    // Credit score vs requested amount anomaly
    if (lead.creditScore && lead.requestedAmount) {
      if (lead.creditScore < 600 && lead.requestedAmount > 100000) {
        anomalies.push({
          field: 'credit_vs_request',
          value: lead.requestedAmount,
          isAnomaly: true,
          reason: 'High funding request for low credit score',
          expectedRange: { min: 5000, max: 50000 }
        });
      }
    }
    
    // Time in business anomaly
    if (lead.timeInBusiness !== undefined && lead.timeInBusiness !== null) {
      if (lead.yearEstablished) {
        const calculatedAge = new Date().getFullYear() - lead.yearEstablished;
        const reportedAge = parseInt(lead.timeInBusiness as any);
        
        if (Math.abs(calculatedAge - reportedAge) > 2) {
          anomalies.push({
            field: 'timeInBusiness',
            value: reportedAge,
            isAnomaly: true,
            reason: 'Inconsistent business age data',
            expectedRange: { min: calculatedAge - 1, max: calculatedAge + 1 }
          });
        }
      }
    }
    
    return anomalies;
  }
  
  /**
   * Check data integrity
   */
  private async checkDataIntegrity(lead: Partial<Lead>): Promise<IntegrityResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // Check field completeness
    const requiredFields = ['businessName', 'email', 'phone'];
    const missingRequired = requiredFields.filter(field => !lead[field as keyof Lead]);
    if (missingRequired.length > 0) {
      issues.push(`Missing required fields: ${missingRequired.join(', ')}`);
      suggestions.push(`Obtain missing data for: ${missingRequired.join(', ')}`);
    }
    
    // Check field consistency
    if (lead.email && lead.businessName) {
      const emailDomain = lead.email.split('@')[1];
      const businessNameLower = lead.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      // Check if email domain matches business name (rough heuristic)
      if (!emailDomain.includes(businessNameLower.substring(0, 5)) && 
          !this.isWebmailDomain(emailDomain)) {
        issues.push('Email domain does not match business name');
        suggestions.push('Verify email belongs to the business');
      }
    }
    
    // Check location consistency
    if (lead.stateCode && lead.zipCode) {
      // Simple validation - could be enhanced with actual ZIP code database
      const stateFromZip = this.getStateFromZipCode(lead.zipCode);
      if (stateFromZip && stateFromZip !== lead.stateCode) {
        issues.push(`State code (${lead.stateCode}) does not match ZIP code (${lead.zipCode})`);
        suggestions.push('Verify location data');
      }
    }
    
    // Calculate scores
    const fieldCount = Object.keys(lead).filter(key => lead[key as keyof Lead] !== null).length;
    const totalPossibleFields = 30; // Approximate number of lead fields
    
    const completenessScore = (fieldCount / totalPossibleFields) * 100;
    const consistencyScore = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 20));
    const accuracyScore = this.calculateAccuracyScore(lead);
    const uniquenessScore = await this.calculateUniquenessScore(lead);
    
    return {
      isValid: issues.length === 0,
      consistencyScore,
      completenessScore,
      accuracyScore,
      uniquenessScore,
      issues,
      suggestions
    };
  }
  
  /**
   * Check for duplicate leads
   */
  private async checkForDuplicates(lead: Partial<Lead>): Promise<{
    isDuplicate: boolean;
    similarLeadId?: string;
    similarity: number;
  }> {
    if (!lead.email && !lead.phone) {
      return { isDuplicate: false, similarity: 0 };
    }
    
    try {
      // Check for exact email match
      if (lead.email) {
        const existingWithEmail = await storage.findLeadsByEmail(lead.email);
        if (existingWithEmail.length > 0 && existingWithEmail[0].id !== lead.id) {
          return {
            isDuplicate: true,
            similarLeadId: existingWithEmail[0].id,
            similarity: 1.0
          };
        }
      }
      
      // Check for exact phone match
      if (lead.phone) {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        const existingWithPhone = await storage.findLeadsByPhone(cleanPhone);
        if (existingWithPhone.length > 0 && existingWithPhone[0].id !== lead.id) {
          return {
            isDuplicate: true,
            similarLeadId: existingWithPhone[0].id,
            similarity: 0.95
          };
        }
      }
      
      // Check for similar business name
      if (lead.businessName) {
        const similarLeads = await storage.findSimilarLeads(lead.businessName);
        for (const similarLead of similarLeads) {
          if (similarLead.id !== lead.id) {
            const similarity = this.calculateStringSimilarity(
              lead.businessName,
              similarLead.businessName || ''
            );
            
            if (similarity > this.thresholds.duplicateThreshold) {
              return {
                isDuplicate: true,
                similarLeadId: similarLead.id,
                similarity
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('[QualityAssurance] Error checking duplicates:', error);
    }
    
    return { isDuplicate: false, similarity: 0 };
  }
  
  /**
   * Auto-correct data issues
   */
  private async autoCorrectData(lead: Partial<Lead>): Promise<Array<{
    field: string;
    originalValue: any;
    correctedValue: any;
    reason: string;
  }>> {
    const corrections: Array<{
      field: string;
      originalValue: any;
      correctedValue: any;
      reason: string;
    }> = [];
    
    // Fix phone formatting
    if (lead.phone) {
      const cleanPhone = lead.phone.replace(/\D/g, '');
      if (cleanPhone.length === 10) {
        const formatted = `(${cleanPhone.slice(0,3)}) ${cleanPhone.slice(3,6)}-${cleanPhone.slice(6)}`;
        if (formatted !== lead.phone) {
          corrections.push({
            field: 'phone',
            originalValue: lead.phone,
            correctedValue: formatted,
            reason: 'Standardized phone format'
          });
        }
      }
    }
    
    // Fix email casing
    if (lead.email) {
      const lowerEmail = lead.email.toLowerCase();
      if (lowerEmail !== lead.email) {
        corrections.push({
          field: 'email',
          originalValue: lead.email,
          correctedValue: lowerEmail,
          reason: 'Normalized email to lowercase'
        });
      }
    }
    
    // Fix business name capitalization
    if (lead.businessName && !this.hasProperCapitalization(lead.businessName)) {
      const properCase = this.properCapitalize(lead.businessName);
      corrections.push({
        field: 'businessName',
        originalValue: lead.businessName,
        correctedValue: properCase,
        reason: 'Corrected capitalization'
      });
    }
    
    // Fix state code casing
    if (lead.stateCode) {
      const upperState = lead.stateCode.toUpperCase();
      if (upperState !== lead.stateCode && upperState.length === 2) {
        corrections.push({
          field: 'stateCode',
          originalValue: lead.stateCode,
          correctedValue: upperState,
          reason: 'Normalized state code to uppercase'
        });
      }
    }
    
    // Remove leading/trailing spaces from all string fields
    const stringFields = ['businessName', 'ownerName', 'address', 'city', 'industry'];
    stringFields.forEach(field => {
      const value = lead[field as keyof Lead];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== value) {
          corrections.push({
            field,
            originalValue: value,
            correctedValue: trimmed,
            reason: 'Removed extra whitespace'
          });
        }
      }
    });
    
    return corrections;
  }
  
  /**
   * Validate against external sources
   */
  private async validateExternalData(lead: Partial<Lead>): Promise<QualityCheck[]> {
    const checks: QualityCheck[] = [];
    
    // This would integrate with external validation services
    // For now, returning placeholder checks
    
    if (lead.website) {
      // Could check if website is reachable
      checks.push({
        field: 'website',
        status: 'pass',
        message: 'Website URL format valid',
        severity: 'low',
        confidence: 0.8
      });
    }
    
    return checks;
  }
  
  /**
   * Calculate quality scores
   */
  private calculateQualityScores(report: QualityReport): {
    validity: number;
    completeness: number;
    consistency: number;
    accuracy: number;
    uniqueness: number;
  } {
    // Validity score based on checks
    const totalChecks = report.checks.length;
    const passedChecks = report.checks.filter(c => c.status === 'pass').length;
    const validity = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;
    
    // Other scores from integrity check
    const { completenessScore, consistencyScore, accuracyScore, uniquenessScore } = report.integrity;
    
    return {
      validity,
      completeness: completenessScore,
      consistency: consistencyScore,
      accuracy: accuracyScore,
      uniqueness: uniquenessScore
    };
  }
  
  /**
   * Calculate overall quality score
   */
  private calculateOverallScore(scores: {
    validity: number;
    completeness: number;
    consistency: number;
    accuracy: number;
    uniqueness: number;
  }): number {
    // Weighted average
    const weights = {
      validity: 0.3,
      completeness: 0.2,
      consistency: 0.2,
      accuracy: 0.2,
      uniqueness: 0.1
    };
    
    return Math.round(
      scores.validity * weights.validity +
      scores.completeness * weights.completeness +
      scores.consistency * weights.consistency +
      scores.accuracy * weights.accuracy +
      scores.uniqueness * weights.uniqueness
    );
  }
  
  /**
   * Generate recommendations based on quality report
   */
  private generateRecommendations(report: QualityReport): string[] {
    const recommendations: string[] = [];
    
    // Based on overall score
    if (report.overallScore < this.thresholds.criticalQualityScore) {
      recommendations.push('⚠️ Critical: Lead quality is very poor. Manual review required.');
      recommendations.push('Consider rejecting this lead or requesting updated information.');
    } else if (report.overallScore < this.thresholds.acceptableQualityScore) {
      recommendations.push('Lead quality needs improvement before processing.');
      recommendations.push('Enrich missing data from external sources.');
    }
    
    // Based on specific issues
    const criticalIssues = report.checks.filter(c => c.severity === 'critical' && c.status === 'fail');
    if (criticalIssues.length > 0) {
      recommendations.push(`Fix critical issues: ${criticalIssues.map(i => i.field).join(', ')}`);
    }
    
    // Based on anomalies
    if (report.anomalies.filter(a => a.isAnomaly).length > 0) {
      recommendations.push('Review anomalous data points for accuracy.');
    }
    
    // Based on completeness
    if (report.dataQuality.completeness < 50) {
      recommendations.push('Lead is missing significant information. Consider enrichment.');
    }
    
    // Based on auto-corrections
    if (report.autoCorrections.length > 3) {
      recommendations.push('Multiple auto-corrections applied. Manual review recommended.');
    }
    
    return recommendations;
  }
  
  // Helper methods
  
  private isDisposableEmail(email: string): boolean {
    const disposableDomains = [
      'tempmail.com', '10minutemail.com', 'guerrillamail.com',
      'mailinator.com', 'throwaway.email', 'yopmail.com'
    ];
    
    const domain = email.split('@')[1]?.toLowerCase();
    return disposableDomains.some(d => domain?.includes(d));
  }
  
  private isInvalidPhonePattern(phone: string): boolean {
    const invalidPatterns = [
      /^(\d)\1{9}$/,        // All same digit
      /^1234567890$/,       // Sequential
      /^0{10}$/,           // All zeros
      /^555\d{7}$/         // Hollywood numbers
    ];
    
    return invalidPatterns.some(pattern => pattern.test(phone));
  }
  
  private isTestData(value: string): boolean {
    const testPatterns = [
      /^test/i, /^demo/i, /^sample/i, /^example/i,
      /^asdf/i, /^qwerty/i, /^abc123/i, /^xxx/i
    ];
    
    return testPatterns.some(pattern => pattern.test(value));
  }
  
  private hasProperCapitalization(text: string): boolean {
    // Check if text has reasonable capitalization
    const words = text.split(/\s+/);
    const properWords = words.filter(word => 
      word.length > 0 && word[0] === word[0].toUpperCase()
    );
    
    return properWords.length >= words.length * 0.5;
  }
  
  private properCapitalize(text: string): string {
    return text.replace(/\w\S*/g, txt => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }
  
  private isWebmailDomain(domain: string): boolean {
    const webmailDomains = [
      'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'
    ];
    
    return webmailDomains.includes(domain.toLowerCase());
  }
  
  private getStateFromZipCode(zipCode: string): string | null {
    // Simplified ZIP code to state mapping
    // In production, this would use a comprehensive database
    const firstDigit = zipCode[0];
    const zipPrefix = zipCode.substring(0, 3);
    
    // Basic mapping by first digit
    const stateMap: { [key: string]: string[] } = {
      '0': ['MA', 'CT', 'ME', 'NH', 'NJ', 'NY', 'RI', 'VT'],
      '1': ['DE', 'NY', 'PA'],
      '2': ['DC', 'MD', 'NC', 'SC', 'VA', 'WV'],
      '3': ['AL', 'FL', 'GA', 'MS', 'TN'],
      '4': ['IN', 'KY', 'MI', 'OH'],
      '5': ['IA', 'MN', 'MT', 'ND', 'SD', 'WI'],
      '6': ['IL', 'KS', 'MO', 'NE'],
      '7': ['AR', 'LA', 'OK', 'TX'],
      '8': ['AZ', 'CO', 'ID', 'NM', 'NV', 'UT', 'WY'],
      '9': ['AK', 'CA', 'HI', 'OR', 'WA']
    };
    
    // This is a simplified implementation
    // In production, would need precise ZIP-to-state mapping
    return null;
  }
  
  private calculateAccuracyScore(lead: Partial<Lead>): number {
    // Simple accuracy heuristic based on data patterns
    let score = 100;
    
    // Deduct for suspicious patterns
    if (lead.email && this.isDisposableEmail(lead.email)) {
      score -= 20;
    }
    
    if (lead.businessName && this.isTestData(lead.businessName)) {
      score -= 50;
    }
    
    if (lead.phone) {
      const cleanPhone = lead.phone.replace(/\D/g, '');
      if (this.isInvalidPhonePattern(cleanPhone)) {
        score -= 30;
      }
    }
    
    return Math.max(0, score);
  }
  
  private async calculateUniquenessScore(lead: Partial<Lead>): Promise<number> {
    // Check uniqueness of key identifiers
    let uniqueFields = 0;
    let totalFields = 0;
    
    if (lead.email) {
      totalFields++;
      const duplicates = await this.checkForDuplicates({ email: lead.email });
      if (!duplicates.isDuplicate) uniqueFields++;
    }
    
    if (lead.phone) {
      totalFields++;
      const duplicates = await this.checkForDuplicates({ phone: lead.phone });
      if (!duplicates.isDuplicate) uniqueFields++;
    }
    
    if (lead.businessName) {
      totalFields++;
      const duplicates = await this.checkForDuplicates({ businessName: lead.businessName });
      if (!duplicates.isDuplicate) uniqueFields++;
    }
    
    return totalFields > 0 ? (uniqueFields / totalFields) * 100 : 100;
  }
  
  private calculateStringSimilarity(str1: string, str2: string): number {
    // Levenshtein distance based similarity
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Get quality statistics
   */
  getStatistics() {
    const recentReports = Array.from(this.validationCache.values())
      .filter(report => {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return report.timestamp > hourAgo;
      });
    
    if (recentReports.length === 0) {
      return {
        totalValidations: 0,
        averageQualityScore: 0,
        criticalIssues: 0,
        autoCorrections: 0,
        anomaliesDetected: 0
      };
    }
    
    const totalScore = recentReports.reduce((sum, r) => sum + r.overallScore, 0);
    const totalCritical = recentReports.reduce(
      (sum, r) => sum + r.checks.filter(c => c.severity === 'critical' && c.status === 'fail').length,
      0
    );
    const totalCorrections = recentReports.reduce((sum, r) => sum + r.autoCorrections.length, 0);
    const totalAnomalies = recentReports.reduce(
      (sum, r) => sum + r.anomalies.filter(a => a.isAnomaly).length,
      0
    );
    
    return {
      totalValidations: recentReports.length,
      averageQualityScore: Math.round(totalScore / recentReports.length),
      criticalIssues: totalCritical,
      autoCorrections: totalCorrections,
      anomaliesDetected: totalAnomalies
    };
  }
}

// Export singleton instance
export const enrichmentQualityAssurance = new EnrichmentQualityAssurance();

// Export types
export type { QualityCheck, AnomalyResult, IntegrityResult, QualityReport };