import type { Lead, VerificationResult, InsertVerificationResult } from "@shared/schema";
import { storage } from "./storage";

// Strictness levels
export enum StrictnessLevel {
  STRICT = "strict",
  MODERATE = "moderate",
  LENIENT = "lenient"
}

// Verification status
export enum VerificationStatus {
  VERIFIED = "verified",
  WARNING = "warning",
  FAILED = "failed"
}

// Issue types for categorization
export enum IssueType {
  INVALID_PHONE = "invalid_phone",
  INVALID_EMAIL = "invalid_email",
  INVALID_BUSINESS = "invalid_business",
  INVALID_OWNER = "invalid_owner",
  INVALID_ADDRESS = "invalid_address",
  DUPLICATE = "duplicate",
  TEST_DATA = "test_data",
  MISSING_FIELD = "missing_field"
}

// US State abbreviations
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

// Valid US area codes (simplified list - includes most common)
const VALID_AREA_CODES = [
  201, 202, 203, 205, 206, 207, 208, 209, 210, 212, 213, 214, 215, 216, 217, 218, 219,
  224, 225, 228, 229, 231, 234, 239, 240, 248, 251, 252, 253, 254, 256, 260, 262, 267, 269, 270,
  276, 281, 301, 302, 303, 304, 305, 307, 308, 309, 310, 312, 313, 314, 315, 316, 317, 318, 319, 320,
  321, 323, 325, 330, 331, 334, 336, 337, 339, 340, 347, 351, 352, 360, 361, 364, 369, 380, 385, 386,
  401, 402, 404, 405, 406, 407, 408, 409, 410, 412, 413, 414, 415, 417, 419, 423, 424, 425, 430, 432,
  434, 435, 440, 442, 443, 445, 458, 463, 469, 470, 475, 478, 479, 480, 484, 501, 502, 503, 504, 505,
  507, 508, 509, 510, 512, 513, 515, 516, 517, 518, 520, 530, 531, 534, 539, 540, 541, 551, 559, 561,
  562, 563, 564, 567, 570, 571, 573, 574, 575, 580, 585, 586, 601, 602, 603, 605, 606, 607, 608, 609,
  610, 612, 614, 615, 616, 617, 618, 619, 620, 623, 626, 628, 629, 630, 631, 636, 641, 646, 650, 651,
  657, 659, 660, 661, 662, 667, 669, 678, 681, 682, 684, 689, 701, 702, 703, 704, 706, 707, 708, 712,
  713, 714, 715, 716, 717, 718, 719, 720, 724, 725, 727, 731, 732, 734, 737, 740, 743, 747, 754, 757,
  760, 762, 763, 765, 769, 770, 772, 773, 774, 775, 779, 781, 785, 786, 801, 802, 803, 804, 805, 806,
  808, 810, 812, 813, 814, 815, 816, 817, 818, 828, 830, 831, 832, 843, 845, 847, 848, 850, 854, 856,
  857, 858, 859, 860, 862, 863, 864, 865, 870, 872, 878, 901, 903, 904, 906, 907, 908, 909, 910, 912,
  913, 914, 915, 916, 917, 918, 919, 920, 925, 928, 929, 930, 931, 936, 937, 938, 940, 941, 947, 949,
  951, 952, 954, 956, 959, 970, 971, 972, 973, 978, 979, 980, 984, 985, 989
];

// Disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'maildrop.cc', 'sharklasers.com', 'spam4.me',
  'trashmail.com', 'yopmail.com', 'temp-mail.org', 'getnada.com'
];

// Test data patterns
const TEST_PATTERNS = {
  names: ['test', 'demo', 'sample', 'example', 'fake', 'dummy', 'xxx', 'abc', '123'],
  businessNames: ['test company', 'test business', 'demo corp', 'sample llc', 'n/a', 'none', 'unknown', 'tbd'],
  ownerNames: ['john doe', 'jane doe', 'test user', 'admin', 'test test', 'first last']
};

interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  formatted?: string;
}

interface LeadValidationResult {
  rowNumber: number;
  leadData: any;
  status: VerificationStatus;
  verificationScore: number;
  phoneValidation: ValidationResult;
  emailValidation: ValidationResult;
  businessNameValidation: ValidationResult;
  ownerNameValidation: ValidationResult;
  addressValidation: ValidationResult;
  isDuplicate: boolean;
  duplicateType?: string;
  duplicateLeadId?: string;
  issues: string[];
  warnings: string[];
  selectedForImport: boolean;
}

export class LeadVerificationEngine {
  private strictnessLevel: StrictnessLevel;

  constructor(strictnessLevel: StrictnessLevel = StrictnessLevel.MODERATE) {
    this.strictnessLevel = strictnessLevel;
  }

  // Main verification method
  async verifyLead(leadData: any, rowNumber: number): Promise<LeadValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    let verificationScore = 100;

    // Validate phone
    const phoneValidation = this.validatePhone(leadData.phone);
    if (!phoneValidation.valid) {
      issues.push(...phoneValidation.issues);
      verificationScore -= 20;
    } else if (phoneValidation.warnings.length > 0) {
      warnings.push(...phoneValidation.warnings);
      verificationScore -= 5;
    }

    // Validate email
    const emailValidation = this.validateEmail(leadData.email);
    if (!emailValidation.valid) {
      issues.push(...emailValidation.issues);
      verificationScore -= 20;
    } else if (emailValidation.warnings.length > 0) {
      warnings.push(...emailValidation.warnings);
      verificationScore -= 5;
    }

    // Validate business name
    const businessNameValidation = this.validateBusinessName(leadData.businessName);
    if (!businessNameValidation.valid) {
      issues.push(...businessNameValidation.issues);
      verificationScore -= 25;
    } else if (businessNameValidation.warnings.length > 0) {
      warnings.push(...businessNameValidation.warnings);
      verificationScore -= 5;
    }

    // Validate owner name
    const ownerNameValidation = this.validateOwnerName(leadData.ownerName);
    if (!ownerNameValidation.valid) {
      issues.push(...ownerNameValidation.issues);
      verificationScore -= 20;
    } else if (ownerNameValidation.warnings.length > 0) {
      warnings.push(...ownerNameValidation.warnings);
      verificationScore -= 5;
    }

    // Validate address
    const addressValidation = this.validateAddress(leadData);
    if (!addressValidation.valid) {
      issues.push(...addressValidation.issues);
      verificationScore -= 15;
    } else if (addressValidation.warnings.length > 0) {
      warnings.push(...addressValidation.warnings);
      verificationScore -= 5;
    }

    // Check for duplicates
    const duplicateCheck = await this.checkDuplicates(leadData);
    const isDuplicate = duplicateCheck.isDuplicate;
    let duplicateType = duplicateCheck.type;
    let duplicateLeadId = duplicateCheck.leadId;
    
    if (isDuplicate) {
      warnings.push(`Duplicate detected: ${duplicateCheck.reason}`);
      verificationScore -= 30;
    }

    // Determine overall status
    let status: VerificationStatus;
    if (verificationScore >= 80 && issues.length === 0) {
      status = VerificationStatus.VERIFIED;
    } else if (verificationScore >= 50 && issues.length === 0) {
      status = VerificationStatus.WARNING;
    } else {
      status = VerificationStatus.FAILED;
    }

    // Auto-select for import based on status and strictness
    let selectedForImport = false;
    if (this.strictnessLevel === StrictnessLevel.STRICT) {
      selectedForImport = status === VerificationStatus.VERIFIED && !isDuplicate;
    } else if (this.strictnessLevel === StrictnessLevel.MODERATE) {
      selectedForImport = (status === VerificationStatus.VERIFIED || status === VerificationStatus.WARNING) && !isDuplicate;
    } else {
      selectedForImport = status !== VerificationStatus.FAILED;
    }

    return {
      rowNumber,
      leadData,
      status,
      verificationScore: Math.max(0, verificationScore),
      phoneValidation,
      emailValidation,
      businessNameValidation,
      ownerNameValidation,
      addressValidation,
      isDuplicate,
      duplicateType,
      duplicateLeadId,
      issues,
      warnings,
      selectedForImport
    };
  }

  // Phone validation
  private validatePhone(phone: string | undefined): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!phone) {
      return { valid: false, issues: ['Phone number is missing'], warnings };
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check length
    if (cleanPhone.length !== 10) {
      issues.push(`Invalid phone length: ${cleanPhone.length} digits (should be 10)`);
      return { valid: false, issues, warnings };
    }

    // Extract area code
    const areaCode = parseInt(cleanPhone.substring(0, 3));
    
    // Check valid area code
    if (!VALID_AREA_CODES.includes(areaCode)) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push(`Invalid area code: ${areaCode}`);
      } else {
        warnings.push(`Unusual area code: ${areaCode}`);
      }
    }

    // Check for invalid patterns
    // 555-01XX are invalid
    if (cleanPhone.substring(3, 6) === '555' && 
        parseInt(cleanPhone.substring(6, 8)) >= 1 && 
        parseInt(cleanPhone.substring(6, 8)) <= 99) {
      issues.push('Invalid phone number: 555-01XX pattern');
      return { valid: false, issues, warnings };
    }

    // Check for all same digits
    if (/^(\d)\1{9}$/.test(cleanPhone)) {
      issues.push('Invalid phone number: all same digits');
      return { valid: false, issues, warnings };
    }

    // Check for sequential patterns
    if (cleanPhone === '1234567890' || cleanPhone === '0123456789') {
      issues.push('Invalid phone number: sequential pattern');
      return { valid: false, issues, warnings };
    }

    // Format phone number
    const formatted = `(${cleanPhone.substring(0, 3)}) ${cleanPhone.substring(3, 6)}-${cleanPhone.substring(6)}`;

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      formatted
    };
  }

  // Email validation
  private validateEmail(email: string | undefined): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!email) {
      return { valid: false, issues: ['Email is missing'], warnings };
    }

    // Basic regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      issues.push('Invalid email format');
      return { valid: false, issues, warnings };
    }

    const domain = email.split('@')[1].toLowerCase();
    
    // Check for test emails
    if (domain === 'example.com' || domain === 'test.com' || domain === 'email.com') {
      issues.push(`Test email detected: @${domain}`);
      return { valid: false, issues, warnings };
    }

    // Check for disposable email domains
    if (DISPOSABLE_EMAIL_DOMAINS.some(d => domain.includes(d))) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push(`Disposable email domain: ${domain}`);
      } else {
        warnings.push(`Disposable email domain: ${domain}`);
      }
    }

    // Check for free email providers (warning only)
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    if (freeProviders.includes(domain)) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        warnings.push(`Free email provider: ${domain}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  // Business name validation
  private validateBusinessName(businessName: string | undefined): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!businessName || businessName.trim().length === 0) {
      return { valid: false, issues: ['Business name is missing'], warnings };
    }

    const trimmed = businessName.trim();
    const lower = trimmed.toLowerCase();

    // Check minimum length
    if (trimmed.length < 3) {
      issues.push(`Business name too short: ${trimmed.length} characters`);
      return { valid: false, issues, warnings };
    }

    // Check for test patterns
    if (TEST_PATTERNS.businessNames.some(pattern => lower === pattern)) {
      issues.push(`Test data detected: "${businessName}"`);
      return { valid: false, issues, warnings };
    }

    // Check for placeholder patterns
    if (lower === 'n/a' || lower === 'na' || lower === 'none' || lower === 'unknown') {
      issues.push(`Placeholder business name: "${businessName}"`);
      return { valid: false, issues, warnings };
    }

    // Check if contains test patterns
    if (TEST_PATTERNS.names.some(pattern => lower.includes(pattern))) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push(`Business name contains test pattern: "${businessName}"`);
      } else {
        warnings.push(`Business name may contain test data: "${businessName}"`);
      }
    }

    // Check for all caps (warning)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
      warnings.push('Business name is all caps');
    }

    // Check for excessive special characters
    const specialCount = (trimmed.match(/[^a-zA-Z0-9\s\-&.,]/g) || []).length;
    if (specialCount > trimmed.length * 0.3) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push('Business name has excessive special characters');
      } else {
        warnings.push('Business name has many special characters');
      }
    }

    // Check for numbers only
    if (/^\d+$/.test(trimmed)) {
      issues.push('Business name cannot be only numbers');
      return { valid: false, issues, warnings };
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  // Owner name validation
  private validateOwnerName(ownerName: string | undefined): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (!ownerName || ownerName.trim().length === 0) {
      return { valid: false, issues: ['Owner name is missing'], warnings };
    }

    const trimmed = ownerName.trim();
    const lower = trimmed.toLowerCase();

    // Check for test names
    if (TEST_PATTERNS.ownerNames.some(pattern => lower === pattern)) {
      issues.push(`Test name detected: "${ownerName}"`);
      return { valid: false, issues, warnings };
    }

    // Check if has at least two parts (first and last name)
    const nameParts = trimmed.split(/\s+/);
    if (nameParts.length < 2) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push('Owner name should include first and last name');
      } else {
        warnings.push('Owner name appears to be incomplete');
      }
    }

    // Check for single character names
    if (nameParts.some(part => part.length === 1 && part !== '&')) {
      warnings.push('Owner name contains single character parts');
    }

    // Check proper capitalization
    const isProperCase = nameParts.every(part => {
      if (part.length === 0) return true;
      return part[0] === part[0].toUpperCase() && part.substring(1) === part.substring(1).toLowerCase();
    });

    if (!isProperCase && this.strictnessLevel !== StrictnessLevel.LENIENT) {
      warnings.push('Owner name may not be properly capitalized');
    }

    // Check for numbers in name
    if (/\d/.test(trimmed)) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        issues.push('Owner name contains numbers');
      } else {
        warnings.push('Owner name contains numbers');
      }
    }

    // Check for excessive special characters
    if (/[^a-zA-Z\s\-'.&]/.test(trimmed)) {
      warnings.push('Owner name contains unusual characters');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  // Address validation
  private validateAddress(leadData: any): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check if we have any address fields
    const hasStreet = leadData.street || leadData.address || leadData.streetAddress;
    const hasCity = leadData.city;
    const hasState = leadData.state || leadData.stateCode;
    const hasZip = leadData.zip || leadData.zipCode || leadData.postalCode;

    // If no address fields at all, it's okay for MCA leads
    if (!hasStreet && !hasCity && !hasState && !hasZip) {
      if (this.strictnessLevel === StrictnessLevel.STRICT) {
        warnings.push('No address information provided');
      }
      return { valid: true, issues, warnings };
    }

    // If partial address, check what's missing
    if (hasStreet || hasCity || hasState || hasZip) {
      if (!hasStreet && this.strictnessLevel !== StrictnessLevel.LENIENT) {
        warnings.push('Street address is missing');
      }
      if (!hasCity && this.strictnessLevel !== StrictnessLevel.LENIENT) {
        warnings.push('City is missing');
      }
      if (!hasState) {
        if (this.strictnessLevel === StrictnessLevel.STRICT) {
          issues.push('State is missing');
        } else {
          warnings.push('State is missing');
        }
      }
      if (!hasZip && this.strictnessLevel === StrictnessLevel.STRICT) {
        warnings.push('ZIP code is missing');
      }
    }

    // Validate state if present
    if (hasState) {
      const state = (leadData.state || leadData.stateCode || '').toUpperCase().trim();
      if (state.length === 2 && !US_STATES.includes(state)) {
        issues.push(`Invalid state abbreviation: ${state}`);
      } else if (state.length > 2 && this.strictnessLevel !== StrictnessLevel.LENIENT) {
        warnings.push('State should be 2-letter abbreviation');
      }
    }

    // Validate ZIP if present
    if (hasZip) {
      const zip = (leadData.zip || leadData.zipCode || leadData.postalCode || '').toString().trim();
      const zipRegex = /^\d{5}(-\d{4})?$/;
      if (!zipRegex.test(zip)) {
        if (this.strictnessLevel === StrictnessLevel.STRICT) {
          issues.push(`Invalid ZIP code format: ${zip}`);
        } else {
          warnings.push(`ZIP code format may be invalid: ${zip}`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  // Check for duplicates
  private async checkDuplicates(leadData: any): Promise<{
    isDuplicate: boolean;
    type?: string;
    leadId?: string;
    reason?: string;
  }> {
    // Check phone duplicate
    if (leadData.phone) {
      const phoneDup = await storage.checkPhoneDuplicate(leadData.phone);
      if (phoneDup) {
        return {
          isDuplicate: true,
          type: 'phone',
          leadId: phoneDup.id,
          reason: `Phone number already exists in database`
        };
      }
    }

    // Check business name duplicate (only in strict mode)
    if (this.strictnessLevel === StrictnessLevel.STRICT && leadData.businessName) {
      const businessDup = await storage.checkBusinessNameDuplicate(leadData.businessName);
      if (businessDup) {
        return {
          isDuplicate: true,
          type: 'business',
          leadId: businessDup.id,
          reason: `Business name already exists in database`
        };
      }
    }

    return { isDuplicate: false };
  }

  // Batch verification
  async verifyBatch(leads: any[], sessionId: string): Promise<InsertVerificationResult[]> {
    const results: InsertVerificationResult[] = [];
    
    for (let i = 0; i < leads.length; i++) {
      const validationResult = await this.verifyLead(leads[i], i + 1);
      
      const result: InsertVerificationResult = {
        sessionId,
        rowNumber: validationResult.rowNumber,
        leadData: validationResult.leadData,
        status: validationResult.status,
        verificationScore: validationResult.verificationScore,
        phoneValidation: validationResult.phoneValidation,
        emailValidation: validationResult.emailValidation,
        businessNameValidation: validationResult.businessNameValidation,
        ownerNameValidation: validationResult.ownerNameValidation,
        addressValidation: validationResult.addressValidation,
        isDuplicate: validationResult.isDuplicate,
        duplicateType: validationResult.duplicateType,
        duplicateLeadId: validationResult.duplicateLeadId,
        issues: validationResult.issues,
        warnings: validationResult.warnings,
        selectedForImport: validationResult.selectedForImport
      };
      
      results.push(result);
    }
    
    return results;
  }
}