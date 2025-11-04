import { db } from "../db";
import { leads } from "@shared/schema";
import type { Lead } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hunterService } from "./enrichment/hunter-service";
import { numverifyService } from "../numverify-service";

export interface VerificationResult {
  emailScore: number;
  phoneScore: number;
  nameScore: number;
  overallScore: number;
  status: 'verified' | 'partial' | 'unverified' | 'failed';
  details: {
    email: {
      valid: boolean;
      score: number;
      status: string;
      reason?: string;
    };
    phone: {
      valid: boolean;
      score: number;
      lineType?: string;
      carrier?: string;
      reason?: string;
    };
    businessName: {
      valid: boolean;
      score: number;
      issues?: string[];
    };
  };
}

export class AutoVerificationService {
  /**
   * Verify all aspects of a lead
   */
  async verifyLead(lead: Lead): Promise<VerificationResult> {
    // Run all verifications in parallel
    const [emailResult, phoneResult, nameResult] = await Promise.all([
      this.verifyEmail(lead.email),
      this.verifyPhone(lead.phone, lead.stateCode),
      this.verifyBusinessName(lead.businessName)
    ]);

    // Calculate overall score
    const overallScore = Math.round((emailResult.score + phoneResult.score + nameResult.score) / 3);

    // Determine status
    let status: 'verified' | 'partial' | 'unverified' | 'failed';
    if (overallScore >= 80) {
      status = 'verified';
    } else if (overallScore >= 50) {
      status = 'partial';
    } else if (overallScore > 0) {
      status = 'unverified';
    } else {
      status = 'failed';
    }

    return {
      emailScore: emailResult.score,
      phoneScore: phoneResult.score,
      nameScore: nameResult.score,
      overallScore,
      status,
      details: {
        email: emailResult,
        phone: phoneResult,
        businessName: nameResult
      }
    };
  }

  /**
   * Verify email address using Hunter.io or fallback logic
   */
  private async verifyEmail(email: string): Promise<{ valid: boolean; score: number; status: string; reason?: string }> {
    if (!email || email.trim() === '') {
      return { valid: false, score: 0, status: 'missing', reason: 'No email provided' };
    }

    try {
      // Try Hunter.io verification first
      const verification = await hunterService.verifyEmail(email);
      
      if (verification) {
        // Map Hunter.io result to our score
        let score = 0;
        let status = 'unknown';
        
        switch (verification.result) {
          case 'deliverable':
            score = 100;
            status = 'deliverable';
            break;
          case 'risky':
            score = 50;
            status = 'risky';
            break;
          case 'undeliverable':
            score = 10;
            status = 'undeliverable';
            break;
          default:
            score = 30;
            status = 'unknown';
        }

        // Adjust score based on other factors
        if (verification.disposable) {
          score = Math.max(score - 30, 10);
        }
        if (!verification.mx_records) {
          score = Math.max(score - 20, 10);
        }

        return { valid: score >= 50, score, status };
      }
    } catch (error) {
      console.error('Hunter.io verification failed:', error);
    }

    // Fallback to basic email validation
    return this.basicEmailValidation(email);
  }

  /**
   * Basic email validation fallback
   */
  private basicEmailValidation(email: string): { valid: boolean; score: number; status: string; reason?: string } {
    // Basic regex for email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(email)) {
      return { valid: false, score: 10, status: 'invalid_format', reason: 'Invalid email format' };
    }

    const domain = email.split('@')[1].toLowerCase();
    
    // Check for common webmail providers (usually good)
    const webmailProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com'];
    if (webmailProviders.includes(domain)) {
      return { valid: true, score: 75, status: 'webmail' };
    }

    // Check for disposable email domains (bad)
    const disposableDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com', 'mailinator.com'];
    if (disposableDomains.some(d => domain.includes(d))) {
      return { valid: false, score: 20, status: 'disposable', reason: 'Disposable email domain' };
    }

    // Check for business domain patterns
    if (domain.includes('.edu') || domain.includes('.gov') || domain.includes('.org')) {
      return { valid: true, score: 85, status: 'institutional' };
    }

    // Default: assume valid but with medium confidence
    return { valid: true, score: 60, status: 'unverified' };
  }

  /**
   * Verify phone number using Numverify or fallback logic
   */
  private async verifyPhone(phone: string, stateCode?: string | null): Promise<{ valid: boolean; score: number; lineType?: string; carrier?: string; reason?: string }> {
    if (!phone || phone.trim() === '') {
      return { valid: false, score: 0, reason: 'No phone provided' };
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (cleanPhone.length < 10) {
      return { valid: false, score: 10, reason: 'Phone number too short' };
    }

    try {
      // Try Numverify service first
      const validation = await numverifyService.validatePhone(cleanPhone, 'US');
      
      if (validation.isValid) {
        // Calculate score based on line type and risk score
        let score = 100;
        
        // Adjust based on risk score (lower risk = higher score)
        if (validation.riskScore <= 20) {
          score = 90;
        } else if (validation.riskScore <= 40) {
          score = 70;
        } else if (validation.riskScore <= 60) {
          score = 50;
        } else {
          score = 30;
        }

        return {
          valid: validation.isValid,
          score,
          lineType: validation.lineType,
          carrier: validation.carrier || undefined
        };
      } else {
        return { valid: false, score: 20, reason: 'Invalid phone number' };
      }
    } catch (error) {
      console.error('Numverify validation failed:', error);
    }

    // Fallback to basic phone validation
    return this.basicPhoneValidation(cleanPhone);
  }

  /**
   * Basic phone validation fallback
   */
  private basicPhoneValidation(phone: string): { valid: boolean; score: number; lineType?: string; reason?: string } {
    // Check for US phone number format (10 digits)
    if (phone.length === 10) {
      // Check for invalid patterns
      const invalidPatterns = [
        /^555/, // Hollywood numbers
        /^800/, // Toll-free (might be legitimate but needs verification)
        /^900/, // Premium rate
        /^976/, // Premium rate
        /^(\d)\1{9}$/, // All same digit
        /^1234567890$/, // Sequential
      ];

      for (const pattern of invalidPatterns) {
        if (pattern.test(phone)) {
          return { valid: false, score: 20, reason: 'Suspicious phone pattern' };
        }
      }

      // Check area code validity (simplified)
      const areaCode = phone.substring(0, 3);
      const validAreaCodes = ['201', '202', '203', '205', '206', '207', '208', '209', '210', '212', '213', '214', '215', '216', '217', '218', '219', '224', '225', '228', '229', '231', '234', '239', '240', '248', '251', '252', '253', '254', '256', '260', '262', '267', '269', '270', '272', '276', '281', '301', '302', '303', '304', '305', '307', '308', '309', '310', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '323', '325', '330', '331', '334', '336', '337', '339', '340', '346', '347', '351', '352', '360', '361', '364', '380', '385', '386', '401', '402', '404', '405', '406', '407', '408', '409', '410', '412', '413', '414', '415', '417', '419', '423', '424', '425', '430', '432', '434', '435', '440', '442', '443', '445', '458', '463', '469', '470', '475', '478', '479', '480', '484', '501', '502', '503', '504', '505', '507', '508', '509', '510', '512', '513', '515', '516', '517', '518', '520', '530', '534', '539', '540', '541', '551', '559', '561', '562', '563', '567', '570', '571', '573', '574', '575', '580', '585', '586', '601', '602', '603', '605', '606', '607', '608', '609', '610', '612', '614', '615', '616', '617', '618', '619', '620', '623', '626', '628', '629', '630', '631', '636', '640', '641', '646', '650', '651', '657', '659', '660', '661', '662', '667', '669', '678', '680', '681', '682', '684', '701', '702', '703', '704', '706', '707', '708', '712', '713', '714', '715', '716', '717', '718', '719', '720', '724', '725', '726', '727', '731', '732', '734', '737', '740', '743', '747', '754', '757', '760', '762', '763', '765', '769', '770', '772', '773', '774', '775', '779', '781', '785', '786', '787', '801', '802', '803', '804', '805', '806', '808', '810', '812', '813', '814', '815', '816', '817', '818', '828', '830', '831', '832', '838', '839', '840', '843', '845', '847', '848', '850', '854', '856', '857', '858', '859', '860', '862', '863', '864', '865', '870', '872', '878', '901', '903', '904', '906', '907', '908', '909', '910', '912', '913', '914', '915', '916', '917', '918', '919', '920', '925', '928', '929', '930', '931', '934', '936', '937', '938', '939', '940', '941', '947', '949', '951', '952', '954', '956', '959', '970', '971', '972', '973', '978', '979', '980', '984', '985', '986', '989'];

      if (!validAreaCodes.includes(areaCode)) {
        return { valid: false, score: 30, reason: 'Invalid area code' };
      }

      // Passes basic validation
      return { valid: true, score: 60, lineType: 'unknown' };
    } else if (phone.length === 11 && phone.startsWith('1')) {
      // US number with country code
      return this.basicPhoneValidation(phone.substring(1));
    }

    return { valid: false, score: 10, reason: 'Invalid phone format' };
  }

  /**
   * Verify business name for common invalid patterns
   */
  private async verifyBusinessName(businessName: string): Promise<{ valid: boolean; score: number; issues?: string[] }> {
    const issues: string[] = [];
    
    if (!businessName || businessName.trim() === '') {
      return { valid: false, score: 0, issues: ['No business name provided'] };
    }

    const name = businessName.trim().toLowerCase();

    // Check for test/fake patterns
    const testPatterns = [
      /^test/i,
      /^demo/i,
      /^sample/i,
      /^example/i,
      /^asdf/i,
      /^xxx/i,
      /^abc(123)?$/i,
      /^fake/i,
      /^dummy/i,
      /^placeholder/i,
    ];

    for (const pattern of testPatterns) {
      if (pattern.test(name)) {
        issues.push('Business name appears to be a test/placeholder');
        return { valid: false, score: 10, issues };
      }
    }

    // Check for suspicious patterns
    if (name.length < 2) {
      issues.push('Business name too short');
      return { valid: false, score: 20, issues };
    }

    if (!/[a-zA-Z]/.test(name)) {
      issues.push('Business name contains no letters');
      return { valid: false, score: 20, issues };
    }

    // Check for all caps (often indicates poor data quality)
    if (businessName === businessName.toUpperCase() && businessName.length > 3) {
      issues.push('Business name is all capitals');
    }

    // Check for suspicious repetition
    if (/(.)\1{4,}/.test(name)) {
      issues.push('Business name has suspicious character repetition');
      return { valid: false, score: 25, issues };
    }

    // Check for common invalid entries
    const invalidNames = ['n/a', 'na', 'none', 'null', 'undefined', 'unknown', 'not available', 'no name'];
    if (invalidNames.includes(name)) {
      issues.push('Invalid business name entry');
      return { valid: false, score: 10, issues };
    }

    // Check for proper business entity indicators (positive signal)
    const entityIndicators = ['llc', 'inc', 'corp', 'corporation', 'ltd', 'limited', 'co', 'company', 'group', 'partners', 'partnership', 'associates', 'enterprises', 'holdings', 'services'];
    const hasEntityIndicator = entityIndicators.some(indicator => name.includes(indicator));

    // Calculate score
    let score = 70; // Base score for passing basic checks

    if (hasEntityIndicator) {
      score += 20; // Bonus for proper entity indicator
    }

    if (businessName.length > 5 && businessName.length < 100) {
      score += 10; // Bonus for reasonable length
    }

    if (issues.length > 0) {
      score -= issues.length * 10;
    }

    score = Math.max(10, Math.min(100, score)); // Clamp between 10-100

    return { valid: score >= 50, score, issues: issues.length > 0 ? issues : undefined };
  }

  /**
   * Update lead with verification results
   */
  async updateLeadVerification(leadId: string): Promise<Lead | null> {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, leadId))
      .limit(1);

    if (!lead) return null;

    const verification = await this.verifyLead(lead);

    // Update lead with verification scores
    const [updated] = await db
      .update(leads)
      .set({
        emailVerificationScore: verification.emailScore,
        phoneVerificationScore: verification.phoneScore,
        nameVerificationScore: verification.nameScore,
        overallVerificationScore: verification.overallScore,
        verificationStatus: verification.status,
        lastVerifiedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    return updated;
  }

  /**
   * Batch verify leads
   */
  async batchVerifyLeads(leadIds: string[]): Promise<void> {
    // Process in batches to avoid overwhelming services
    const batchSize = 10;
    for (let i = 0; i < leadIds.length; i += batchSize) {
      const batch = leadIds.slice(i, i + batchSize);
      await Promise.all(batch.map(id => this.updateLeadVerification(id)));
    }
  }
}

export const autoVerificationService = new AutoVerificationService();