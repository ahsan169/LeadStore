import OpenAI from "openai";
import type { InsertVerificationResult } from "@shared/schema";
import { storage } from "./storage";
import * as levenshtein from 'fast-levenshtein';
import { numverifyService } from "./numverify-service";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

// Enhanced validation interfaces
interface AIValidationResult {
  valid: boolean;
  confidence: number; // 0-100
  issues: string[];
  warnings: string[];
  suggestions: string[];
  aiInsights: string;
  correctedValue?: string;
}

interface AILeadVerificationResult {
  rowNumber: number;
  leadData: any;
  status: 'verified' | 'warning' | 'failed';
  verificationScore: number;
  confidenceScore: number;
  
  // Field validations with AI insights
  businessVerification: AIValidationResult;
  phoneVerification: AIValidationResult;
  emailVerification: AIValidationResult;
  nameVerification: AIValidationResult;
  addressVerification: AIValidationResult;
  
  // AI-powered analysis
  industryClassification: {
    industry: string;
    confidence: number;
    subIndustry?: string;
  };
  
  businessLegitimacyScore: number;
  riskAssessment: {
    score: number; // 0-100 (0 = low risk, 100 = high risk)
    factors: string[];
    explanation: string;
  };
  
  // Duplicate detection
  isDuplicate: boolean;
  duplicateAnalysis?: {
    type: string;
    similarity: number;
    matchedLeadId?: string;
  };
  
  // Overall
  issues: string[];
  warnings: string[];
  suggestions: string[];
  aiRecommendation: string;
  selectedForImport: boolean;
}

// Enhanced phone number validation data
const TOLL_FREE_PREFIXES = ['800', '888', '877', '866', '855', '844', '833', '822'];
const PREMIUM_PREFIXES = ['900', '976'];
const VOIP_AREA_CODES = [917, 929, 332, 646, 347]; // Common VoIP areas

// More comprehensive disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'maildrop.cc', 'sharklasers.com', 'spam4.me',
  'trashmail.com', 'yopmail.com', 'temp-mail.org', 'getnada.com',
  'disposablemail.com', 'mintemail.com', 'mailnesia.com', 'throwawaymail.com',
  'fakeinbox.com', 'emailondeck.com', 'tempinbox.com', 'binkmail.com',
  'bobmail.info', 'courriel.fr.nf', 'teleworm.us', 'jetable.org',
  'nospam.ze.tc', 'mytrashmail.com', 'mailexpire.com', 'mailzilla.com'
]);

// Role-based email prefixes
const ROLE_BASED_PREFIXES = [
  'info', 'admin', 'support', 'sales', 'contact', 'hello', 'help',
  'noreply', 'no-reply', 'donotreply', 'marketing', 'webmaster',
  'postmaster', 'accounts', 'billing', 'legal', 'office'
];

export class AIVerificationEngine {
  private strictnessLevel: 'strict' | 'moderate' | 'lenient';
  private existingLeads: Map<string, any> = new Map();
  
  constructor(strictnessLevel: 'strict' | 'moderate' | 'lenient' = 'moderate') {
    this.strictnessLevel = strictnessLevel;
  }

  /**
   * Verify a single lead with AI-powered analysis
   */
  async verifyLeadWithAI(leadData: any, rowNumber: number): Promise<AILeadVerificationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Parallel AI verification of all fields
    const [
      businessVerification,
      phoneVerification,
      emailVerification,
      nameVerification,
      addressVerification,
      industryClass,
      legitimacyAnalysis
    ] = await Promise.all([
      this.verifyBusinessWithAI(leadData.businessName, leadData.industry),
      this.verifyPhoneWithIntelligence(leadData.phone, leadData.stateCode),
      this.verifyEmailAdvanced(leadData.email, leadData.businessName),
      this.verifyNameWithAI(leadData.ownerName, leadData.businessName),
      this.verifyAddressComplete(leadData),
      this.classifyIndustry(leadData.businessName, leadData.industry),
      this.assessBusinessLegitimacy(leadData)
    ]);

    // Duplicate detection with fuzzy matching
    const duplicateAnalysis = await this.detectDuplicatesIntelligent(leadData);
    
    // Calculate risk score
    const riskAssessment = await this.calculateRiskScore({
      ...leadData,
      businessVerification,
      phoneVerification,
      emailVerification,
      nameVerification,
      addressVerification,
      industryClass,
      legitimacyAnalysis
    });

    // Compile issues and warnings
    if (!businessVerification.valid) issues.push(...businessVerification.issues);
    else warnings.push(...businessVerification.warnings);
    
    if (!phoneVerification.valid) issues.push(...phoneVerification.issues);
    else warnings.push(...phoneVerification.warnings);
    
    if (!emailVerification.valid) issues.push(...emailVerification.issues);
    else warnings.push(...emailVerification.warnings);
    
    if (!nameVerification.valid) issues.push(...nameVerification.issues);
    else warnings.push(...nameVerification.warnings);
    
    if (!addressVerification.valid) issues.push(...addressVerification.issues);
    else warnings.push(...addressVerification.warnings);

    // Compile suggestions
    suggestions.push(...businessVerification.suggestions);
    suggestions.push(...phoneVerification.suggestions);
    suggestions.push(...emailVerification.suggestions);
    suggestions.push(...nameVerification.suggestions);
    suggestions.push(...addressVerification.suggestions);

    // Calculate overall scores
    const verificationScore = this.calculateVerificationScore({
      businessVerification,
      phoneVerification,
      emailVerification,
      nameVerification,
      addressVerification,
      duplicateAnalysis
    });

    const confidenceScore = this.calculateConfidenceScore({
      businessVerification,
      phoneVerification,
      emailVerification,
      nameVerification,
      addressVerification,
      industryClass
    });

    // Determine status
    let status: 'verified' | 'warning' | 'failed';
    if (verificationScore >= 80 && issues.length === 0) {
      status = 'verified';
    } else if (verificationScore >= 60 && issues.length <= 2) {
      status = 'warning';
    } else {
      status = 'failed';
    }

    // Generate AI recommendation
    const aiRecommendation = await this.generateRecommendation({
      status,
      verificationScore,
      confidenceScore,
      riskAssessment,
      duplicateAnalysis,
      issues,
      warnings
    });

    // Auto-select for import based on strictness
    let selectedForImport = false;
    if (this.strictnessLevel === 'strict') {
      selectedForImport = status === 'verified' && !duplicateAnalysis.isDuplicate && riskAssessment.score < 30;
    } else if (this.strictnessLevel === 'moderate') {
      selectedForImport = (status === 'verified' || status === 'warning') && 
                          !duplicateAnalysis.isDuplicate && 
                          riskAssessment.score < 50;
    } else {
      selectedForImport = status !== 'failed' && riskAssessment.score < 70;
    }

    return {
      rowNumber,
      leadData,
      status,
      verificationScore,
      confidenceScore,
      businessVerification,
      phoneVerification,
      emailVerification,
      nameVerification,
      addressVerification,
      industryClassification: industryClass,
      businessLegitimacyScore: legitimacyAnalysis,
      riskAssessment,
      isDuplicate: duplicateAnalysis.isDuplicate,
      duplicateAnalysis: duplicateAnalysis.isDuplicate ? duplicateAnalysis : undefined,
      issues,
      warnings,
      suggestions,
      aiRecommendation,
      selectedForImport
    };
  }

  /**
   * AI-powered business name verification
   */
  private async verifyBusinessWithAI(businessName: string | undefined, industry?: string): Promise<AIValidationResult> {
    if (!businessName || businessName.trim().length === 0) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Business name is missing'],
        warnings: [],
        suggestions: [],
        aiInsights: 'No business name provided'
      };
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at verifying business names. Analyze the business name and determine if it's legitimate or test data.
Return a JSON object with:
{
  "isLegitimate": boolean,
  "confidence": number (0-100),
  "issues": string[],
  "warnings": string[],
  "suggestions": string[],
  "insights": string,
  "standardizedName": string,
  "isTestData": boolean,
  "industryMatch": boolean
}`
          },
          {
            role: "user",
            content: `Analyze this business name: "${businessName}"${industry ? `, Industry: ${industry}` : ''}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        valid: result.isLegitimate && !result.isTestData,
        confidence: result.confidence || 0,
        issues: result.isLegitimate ? [] : result.issues || ['Business name appears invalid'],
        warnings: result.warnings || [],
        suggestions: result.suggestions || [],
        aiInsights: result.insights || '',
        correctedValue: result.standardizedName !== businessName ? result.standardizedName : undefined
      };
    } catch (error) {
      // Fallback to basic validation
      return this.basicBusinessValidation(businessName);
    }
  }

  /**
   * Enhanced phone number verification with AI
   */
  private async verifyPhoneWithIntelligence(phone: string | undefined, stateCode?: string): Promise<AIValidationResult> {
    if (!phone) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Phone number is missing'],
        warnings: [],
        suggestions: [],
        aiInsights: 'No phone number provided'
      };
    }

    const cleanPhone = phone.replace(/\D/g, '');
    
    // Basic validation
    if (cleanPhone.length !== 10) {
      return {
        valid: false,
        confidence: 100,
        issues: [`Invalid phone length: ${cleanPhone.length} digits`],
        warnings: [],
        suggestions: ['Phone number must be exactly 10 digits'],
        aiInsights: 'Phone number has incorrect number of digits'
      };
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Try Numverify first for real carrier data
    try {
      const numverifyResult = await numverifyService.validatePhone(cleanPhone, 'US');
      
      if (!numverifyResult.isValid) {
        return {
          valid: false,
          confidence: 100,
          issues: ['Phone number is invalid according to carrier verification'],
          warnings: [],
          suggestions: ['Please provide a valid phone number'],
          aiInsights: 'Numverify confirms this number is invalid',
          correctedValue: numverifyResult.formattedLocal
        };
      }
      
      // Build insights from real carrier data
      const aiInsights = `Verified ${numverifyResult.lineType} number${numverifyResult.carrier ? ` from ${numverifyResult.carrier}` : ''}${numverifyResult.location ? ` in ${numverifyResult.location}` : ''}`;
      
      // Add risk-based warnings
      if (numverifyResult.riskScore > 60) {
        issues.push(...numverifyResult.riskFactors);
      } else if (numverifyResult.riskScore > 30) {
        warnings.push(...numverifyResult.riskFactors);
      }
      
      // Additional checks for MCA-specific risks
      if (numverifyResult.lineType === 'voip') {
        warnings.push('VoIP numbers have higher fraud risk for MCA');
        suggestions.push('Request additional verification for VoIP numbers');
      } else if (numverifyResult.lineType === 'toll_free') {
        warnings.push('Toll-free number may not be direct business line');
      }
      
      const confidence = 100 - numverifyResult.riskScore;
      
      return {
        valid: issues.length === 0,
        confidence,
        issues,
        warnings,
        suggestions,
        aiInsights,
        correctedValue: numverifyResult.formattedLocal || numverifyResult.formattedInternational
      };
      
    } catch (numverifyError) {
      console.log('[AI Verification] Numverify unavailable, using AI fallback');
    }

    // Fallback to AI if Numverify fails
    const areaCode = cleanPhone.substring(0, 3);
    
    // Check for toll-free
    if (TOLL_FREE_PREFIXES.includes(areaCode)) {
      warnings.push('Toll-free number detected');
    }
    
    // Check for premium
    if (PREMIUM_PREFIXES.includes(areaCode)) {
      issues.push('Premium rate number detected');
    }
    
    // Check for VoIP
    if (VOIP_AREA_CODES.includes(parseInt(areaCode))) {
      warnings.push('Possible VoIP number');
    }
    
    // Check for invalid patterns
    if (/^(\d)\1{9}$/.test(cleanPhone)) {
      issues.push('Invalid: all same digits');
    }
    
    if (cleanPhone === '1234567890' || cleanPhone === '0123456789') {
      issues.push('Test phone number pattern');
    }

    // Format phone
    const formatted = `(${areaCode}) ${cleanPhone.substring(3, 6)}-${cleanPhone.substring(6)}`;

    // Use AI for advanced analysis
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze this US phone number and provide insights.
Return JSON: {
  "isValid": boolean,
  "confidence": number,
  "phoneType": "mobile" | "landline" | "voip" | "toll-free" | "unknown",
  "carrierRegion": string,
  "riskLevel": "low" | "medium" | "high",
  "insights": string
}`
          },
          {
            role: "user",
            content: `Phone: ${formatted}, Area Code: ${areaCode}${stateCode ? `, State: ${stateCode}` : ''}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!aiResult.isValid) {
        issues.push('AI detected invalid phone number');
      }
      
      if (aiResult.riskLevel === 'high') {
        warnings.push(`High risk number: ${aiResult.insights}`);
      }

      return {
        valid: issues.length === 0,
        confidence: aiResult.confidence || 75,
        issues,
        warnings,
        suggestions,
        aiInsights: aiResult.insights || '',
        correctedValue: formatted
      };
    } catch (error) {
      // Fallback without AI
      return {
        valid: issues.length === 0,
        confidence: 70,
        issues,
        warnings,
        suggestions,
        aiInsights: 'Basic validation performed',
        correctedValue: formatted
      };
    }
  }

  /**
   * Advanced email verification
   */
  private async verifyEmailAdvanced(email: string | undefined, businessName?: string): Promise<AIValidationResult> {
    if (!email) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Email is missing'],
        warnings: [],
        suggestions: [],
        aiInsights: 'No email provided'
      };
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        confidence: 100,
        issues: ['Invalid email format'],
        warnings: [],
        suggestions: ['Email must be in format: user@domain.com'],
        aiInsights: 'Email format is invalid'
      };
    }

    const [localPart, domain] = email.split('@');
    const domainLower = domain.toLowerCase();
    
    // Check disposable
    if (DISPOSABLE_EMAIL_DOMAINS.has(domainLower)) {
      issues.push('Disposable/temporary email domain');
    }
    
    // Check role-based
    const localLower = localPart.toLowerCase();
    if (ROLE_BASED_PREFIXES.some(prefix => localLower === prefix || localLower.startsWith(prefix + '.'))) {
      if (this.strictnessLevel === 'strict') {
        issues.push('Role-based email address');
      } else {
        warnings.push('Role-based email (info@, admin@, etc.)');
      }
    }
    
    // Free email providers
    const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
    if (freeProviders.includes(domainLower)) {
      if (this.strictnessLevel === 'strict') {
        warnings.push('Free email provider used for business');
        suggestions.push('Consider using a business domain email');
      }
    }

    // AI analysis
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze this business email for legitimacy.
Return JSON: {
  "isLegitimate": boolean,
  "confidence": number,
  "emailQuality": "high" | "medium" | "low",
  "domainReputation": "good" | "neutral" | "poor",
  "matchesBusinessName": boolean,
  "insights": string
}`
          },
          {
            role: "user",
            content: `Email: ${email}${businessName ? `, Business: ${businessName}` : ''}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!aiResult.isLegitimate) {
        issues.push('Email appears illegitimate');
      }
      
      if (aiResult.emailQuality === 'low') {
        warnings.push('Low quality email address');
      }
      
      if (businessName && !aiResult.matchesBusinessName) {
        warnings.push('Email domain doesn\'t match business name');
      }

      return {
        valid: issues.length === 0,
        confidence: aiResult.confidence || 75,
        issues,
        warnings,
        suggestions,
        aiInsights: aiResult.insights || ''
      };
    } catch (error) {
      return {
        valid: issues.length === 0,
        confidence: 60,
        issues,
        warnings,
        suggestions,
        aiInsights: 'Basic email validation performed'
      };
    }
  }

  /**
   * AI-powered name verification
   */
  private async verifyNameWithAI(name: string | undefined, businessName?: string): Promise<AIValidationResult> {
    if (!name || name.trim().length === 0) {
      return {
        valid: false,
        confidence: 0,
        issues: ['Owner name is missing'],
        warnings: [],
        suggestions: [],
        aiInsights: 'No name provided'
      };
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Analyze this person's name for legitimacy. Detect test data, fake names, and parse the name structure.
Return JSON: {
  "isLegitimate": boolean,
  "confidence": number,
  "isTestData": boolean,
  "parsedName": {
    "title": string | null,
    "firstName": string,
    "middleName": string | null,
    "lastName": string,
    "suffix": string | null
  },
  "issues": string[],
  "warnings": string[],
  "insights": string
}`
          },
          {
            role: "user",
            content: `Name: ${name}${businessName ? `, Business: ${businessName}` : ''}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      const issues = result.isTestData ? ['Test name detected'] : result.issues || [];
      const parsedFullName = [
        result.parsedName?.title,
        result.parsedName?.firstName,
        result.parsedName?.middleName,
        result.parsedName?.lastName,
        result.parsedName?.suffix
      ].filter(Boolean).join(' ');

      return {
        valid: result.isLegitimate && !result.isTestData,
        confidence: result.confidence || 0,
        issues,
        warnings: result.warnings || [],
        suggestions: [],
        aiInsights: result.insights || '',
        correctedValue: parsedFullName !== name ? parsedFullName : undefined
      };
    } catch (error) {
      return this.basicNameValidation(name);
    }
  }

  /**
   * Complete address verification
   */
  private async verifyAddressComplete(leadData: any): Promise<AIValidationResult> {
    const addressParts = {
      street: leadData.street || leadData.address || leadData.streetAddress,
      city: leadData.city,
      state: leadData.state || leadData.stateCode,
      zip: leadData.zip || leadData.zipCode || leadData.postalCode
    };

    // If no address at all, return valid but with low confidence
    if (!addressParts.street && !addressParts.city && !addressParts.state && !addressParts.zip) {
      return {
        valid: true,
        confidence: 0,
        issues: [],
        warnings: ['No address information provided'],
        suggestions: ['Adding address improves lead quality'],
        aiInsights: 'No address data to verify'
      };
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    
    // Check for PO Box
    if (addressParts.street && /p\.?o\.?\s*box/i.test(addressParts.street)) {
      warnings.push('PO Box address');
    }
    
    // Validate state
    if (addressParts.state) {
      const state = addressParts.state.toUpperCase();
      if (state.length !== 2) {
        suggestions.push('Use 2-letter state abbreviation');
      }
    }
    
    // Validate ZIP
    if (addressParts.zip) {
      const zip = addressParts.zip.toString();
      if (!/^\d{5}(-\d{4})?$/.test(zip)) {
        issues.push('Invalid ZIP code format');
      }
    }

    // AI verification for completeness and consistency
    try {
      const addressString = Object.values(addressParts).filter(Boolean).join(', ');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Verify and standardize this US address.
Return JSON: {
  "isValid": boolean,
  "confidence": number,
  "isPOBox": boolean,
  "isBusinessAddress": boolean,
  "standardized": {
    "street": string,
    "city": string,
    "state": string,
    "zip": string
  },
  "issues": string[],
  "insights": string
}`
          },
          {
            role: "user",
            content: `Address: ${addressString}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!result.isValid) {
        issues.push(...(result.issues || ['Invalid address']));
      }
      
      if (result.isPOBox && this.strictnessLevel === 'strict') {
        warnings.push('PO Box address may not be suitable for MCA');
      }

      const standardizedAddress = result.standardized ? 
        `${result.standardized.street}, ${result.standardized.city}, ${result.standardized.state} ${result.standardized.zip}` : 
        undefined;

      return {
        valid: issues.length === 0,
        confidence: result.confidence || 50,
        issues,
        warnings,
        suggestions,
        aiInsights: result.insights || '',
        correctedValue: standardizedAddress
      };
    } catch (error) {
      return {
        valid: issues.length === 0,
        confidence: 40,
        issues,
        warnings,
        suggestions,
        aiInsights: 'Basic address validation performed'
      };
    }
  }

  /**
   * Industry classification using AI
   */
  private async classifyIndustry(businessName: string, providedIndustry?: string): Promise<{
    industry: string;
    confidence: number;
    subIndustry?: string;
  }> {
    if (!businessName) {
      return {
        industry: providedIndustry || 'Unknown',
        confidence: 0
      };
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Classify the business industry based on the business name.
Return JSON: {
  "industry": string,
  "subIndustry": string | null,
  "confidence": number (0-100),
  "isHighRiskForMCA": boolean
}`
          },
          {
            role: "user",
            content: `Business Name: ${businessName}${providedIndustry ? `, Stated Industry: ${providedIndustry}` : ''}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        industry: result.industry || providedIndustry || 'Unknown',
        confidence: result.confidence || 0,
        subIndustry: result.subIndustry
      };
    } catch (error) {
      return {
        industry: providedIndustry || 'Unknown',
        confidence: 30
      };
    }
  }

  /**
   * Assess business legitimacy
   */
  private async assessBusinessLegitimacy(leadData: any): Promise<number> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Assess the legitimacy of this business based on all available data.
Return JSON: {
  "legitimacyScore": number (0-100, where 100 is definitely legitimate),
  "redFlags": string[],
  "positiveIndicators": string[]
}`
          },
          {
            role: "user",
            content: JSON.stringify({
              businessName: leadData.businessName,
              ownerName: leadData.ownerName,
              email: leadData.email,
              phone: leadData.phone,
              industry: leadData.industry,
              annualRevenue: leadData.annualRevenue,
              timeInBusiness: leadData.timeInBusiness
            })
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.legitimacyScore || 50;
    } catch (error) {
      // Basic scoring without AI
      let score = 50;
      if (leadData.businessName) score += 10;
      if (leadData.email && !leadData.email.includes('test')) score += 10;
      if (leadData.phone && leadData.phone.length >= 10) score += 10;
      if (leadData.annualRevenue && parseInt(leadData.annualRevenue) > 50000) score += 10;
      if (leadData.timeInBusiness && parseInt(leadData.timeInBusiness) > 12) score += 10;
      return Math.min(100, score);
    }
  }

  /**
   * Calculate risk score
   */
  private async calculateRiskScore(data: any): Promise<{
    score: number;
    factors: string[];
    explanation: string;
  }> {
    const factors: string[] = [];
    let riskScore = 0;

    // Check various risk factors
    if (!data.businessVerification.valid) {
      factors.push('Invalid business name');
      riskScore += 25;
    }
    
    if (!data.phoneVerification.valid) {
      factors.push('Invalid phone number');
      riskScore += 20;
    }
    
    if (!data.emailVerification.valid) {
      factors.push('Invalid email');
      riskScore += 20;
    }
    
    if (data.emailVerification.warnings?.includes('Disposable/temporary email domain')) {
      factors.push('Disposable email');
      riskScore += 15;
    }
    
    if (data.legitimacyAnalysis < 40) {
      factors.push('Low business legitimacy score');
      riskScore += 25;
    }
    
    if (data.annualRevenue && parseInt(data.annualRevenue) < 50000) {
      factors.push('Low annual revenue');
      riskScore += 10;
    }
    
    if (data.timeInBusiness && parseInt(data.timeInBusiness) < 12) {
      factors.push('Business less than 1 year old');
      riskScore += 15;
    }
    
    if (data.creditScore && parseInt(data.creditScore) < 500) {
      factors.push('Very low credit score');
      riskScore += 20;
    }

    // Use AI for holistic risk assessment
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Provide a risk assessment for this MCA lead.
Return JSON: {
  "riskScore": number (0-100),
  "explanation": string,
  "additionalFactors": string[]
}`
          },
          {
            role: "user",
            content: JSON.stringify({
              businessName: data.businessName,
              industry: data.industryClass?.industry,
              annualRevenue: data.annualRevenue,
              creditScore: data.creditScore,
              timeInBusiness: data.timeInBusiness,
              validationIssues: factors
            })
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      });

      const aiResult = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        score: Math.min(100, Math.max(0, aiResult.riskScore || riskScore)),
        factors: [...factors, ...(aiResult.additionalFactors || [])],
        explanation: aiResult.explanation || 'Risk assessment based on data quality and business indicators'
      };
    } catch (error) {
      return {
        score: Math.min(100, riskScore),
        factors,
        explanation: 'Risk assessment based on data validation results'
      };
    }
  }

  /**
   * Intelligent duplicate detection with fuzzy matching
   */
  private async detectDuplicatesIntelligent(leadData: any): Promise<{
    isDuplicate: boolean;
    type?: string;
    similarity?: number;
    matchedLeadId?: string;
  }> {
    // Check exact phone match
    if (leadData.phone) {
      const phoneDup = await storage.checkPhoneDuplicate(leadData.phone);
      if (phoneDup) {
        return {
          isDuplicate: true,
          type: 'phone',
          similarity: 100,
          matchedLeadId: phoneDup.id
        };
      }
    }

    // Check business name with fuzzy matching
    if (leadData.businessName) {
      const businessDup = await storage.checkBusinessNameDuplicate(leadData.businessName);
      if (businessDup) {
        return {
          isDuplicate: true,
          type: 'business',
          similarity: 100,
          matchedLeadId: businessDup.id
        };
      }

      // Check fuzzy matches in existing leads
      for (const [key, existingLead] of this.existingLeads) {
        const similarity = this.calculateSimilarity(
          leadData.businessName.toLowerCase(),
          existingLead.businessName?.toLowerCase() || ''
        );
        
        if (similarity > 85) {
          return {
            isDuplicate: true,
            type: 'business_fuzzy',
            similarity,
            matchedLeadId: existingLead.id
          };
        }
      }
    }

    // Check email domain for same company
    if (leadData.email) {
      const domain = leadData.email.split('@')[1];
      for (const [key, existingLead] of this.existingLeads) {
        if (existingLead.email && existingLead.email.includes(domain)) {
          // Same domain, check if names are similar
          const nameSimilarity = this.calculateSimilarity(
            leadData.ownerName?.toLowerCase() || '',
            existingLead.ownerName?.toLowerCase() || ''
          );
          
          if (nameSimilarity > 70) {
            return {
              isDuplicate: true,
              type: 'email_domain',
              similarity: nameSimilarity,
              matchedLeadId: existingLead.id
            };
          }
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    const distance = levenshtein.get(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return Math.round((1 - distance / maxLength) * 100);
  }

  /**
   * Calculate overall verification score
   */
  private calculateVerificationScore(data: any): number {
    let score = 100;
    
    if (!data.businessVerification.valid) score -= 25;
    else if (data.businessVerification.confidence < 50) score -= 10;
    
    if (!data.phoneVerification.valid) score -= 20;
    else if (data.phoneVerification.confidence < 50) score -= 8;
    
    if (!data.emailVerification.valid) score -= 20;
    else if (data.emailVerification.confidence < 50) score -= 8;
    
    if (!data.nameVerification.valid) score -= 15;
    else if (data.nameVerification.confidence < 50) score -= 5;
    
    if (!data.addressVerification.valid) score -= 10;
    else if (data.addressVerification.confidence < 50) score -= 5;
    
    if (data.duplicateAnalysis?.isDuplicate) score -= 30;
    
    return Math.max(0, score);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidenceScore(data: any): number {
    const scores = [
      data.businessVerification.confidence,
      data.phoneVerification.confidence,
      data.emailVerification.confidence,
      data.nameVerification.confidence,
      data.addressVerification.confidence,
      data.industryClass?.confidence || 50
    ];
    
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Generate AI recommendation
   */
  private async generateRecommendation(data: any): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Generate a brief, actionable recommendation for this lead based on the verification results. Be concise and specific."
          },
          {
            role: "user",
            content: JSON.stringify({
              status: data.status,
              verificationScore: data.verificationScore,
              confidenceScore: data.confidenceScore,
              riskScore: data.riskAssessment.score,
              isDuplicate: data.duplicateAnalysis?.isDuplicate,
              issueCount: data.issues.length,
              warningCount: data.warnings.length
            })
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      return response.choices[0].message.content || this.getDefaultRecommendation(data);
    } catch (error) {
      return this.getDefaultRecommendation(data);
    }
  }

  /**
   * Default recommendation when AI is unavailable
   */
  private getDefaultRecommendation(data: any): string {
    if (data.status === 'verified' && !data.duplicateAnalysis?.isDuplicate) {
      return 'Lead verified and ready for import. High quality lead with good conversion potential.';
    } else if (data.status === 'warning') {
      return 'Lead has minor issues but may still be valuable. Review warnings before importing.';
    } else if (data.duplicateAnalysis?.isDuplicate) {
      return 'Duplicate lead detected. Consider skipping to avoid redundancy.';
    } else {
      return 'Lead has significant quality issues. Manual review recommended before importing.';
    }
  }

  /**
   * Basic validations as fallback
   */
  private basicBusinessValidation(businessName: string): AIValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (businessName.length < 3) {
      issues.push('Business name too short');
    }
    
    if (/test|demo|sample|fake/i.test(businessName)) {
      issues.push('Test data detected');
    }
    
    return {
      valid: issues.length === 0,
      confidence: 50,
      issues,
      warnings,
      suggestions: [],
      aiInsights: 'Basic validation performed'
    };
  }

  private basicNameValidation(name: string): AIValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    if (name.split(' ').length < 2) {
      warnings.push('Name appears incomplete');
    }
    
    if (/test|fake|demo/i.test(name)) {
      issues.push('Test name detected');
    }
    
    return {
      valid: issues.length === 0,
      confidence: 50,
      issues,
      warnings,
      suggestions: [],
      aiInsights: 'Basic validation performed'
    };
  }

  /**
   * Batch verification with AI
   */
  async verifyBatchWithAI(leads: any[], sessionId: string): Promise<InsertVerificationResult[]> {
    const results: InsertVerificationResult[] = [];
    
    // Load existing leads for duplicate detection
    this.existingLeads.clear();
    const { leads: existingLeadsData } = await storage.getFilteredLeads({ limit: 10000 });
    existingLeadsData.forEach(lead => {
      this.existingLeads.set(lead.id, lead);
    });
    
    // Process in batches of 10 for efficiency
    const batchSize = 10;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map((lead, index) => this.verifyLeadWithAI(lead, i + index + 1))
      );
      
      for (const aiResult of batchResults) {
        // Convert AI result to database format
        const result: InsertVerificationResult = {
          sessionId,
          rowNumber: aiResult.rowNumber,
          leadData: aiResult.leadData,
          status: aiResult.status,
          verificationScore: aiResult.verificationScore,
          phoneValidation: {
            valid: aiResult.phoneVerification.valid,
            issues: aiResult.phoneVerification.issues,
            warnings: aiResult.phoneVerification.warnings,
            formatted: aiResult.phoneVerification.correctedValue
          },
          emailValidation: {
            valid: aiResult.emailVerification.valid,
            issues: aiResult.emailVerification.issues,
            warnings: aiResult.emailVerification.warnings
          },
          businessNameValidation: {
            valid: aiResult.businessVerification.valid,
            issues: aiResult.businessVerification.issues,
            warnings: aiResult.businessVerification.warnings
          },
          ownerNameValidation: {
            valid: aiResult.nameVerification.valid,
            issues: aiResult.nameVerification.issues,
            warnings: aiResult.nameVerification.warnings
          },
          addressValidation: {
            valid: aiResult.addressVerification.valid,
            issues: aiResult.addressVerification.issues,
            warnings: aiResult.addressVerification.warnings
          },
          isDuplicate: aiResult.isDuplicate,
          duplicateType: aiResult.duplicateAnalysis?.type,
          duplicateLeadId: aiResult.duplicateAnalysis?.matchedLeadId,
          issues: aiResult.issues,
          warnings: aiResult.warnings,
          selectedForImport: aiResult.selectedForImport
        };
        
        // Store additional AI insights in leadData for display
        result.leadData.aiInsights = {
          confidenceScore: aiResult.confidenceScore,
          industryClassification: aiResult.industryClassification,
          businessLegitimacyScore: aiResult.businessLegitimacyScore,
          riskAssessment: aiResult.riskAssessment,
          suggestions: aiResult.suggestions,
          aiRecommendation: aiResult.aiRecommendation,
          correctedValues: {
            businessName: aiResult.businessVerification.correctedValue,
            phone: aiResult.phoneVerification.correctedValue,
            ownerName: aiResult.nameVerification.correctedValue,
            address: aiResult.addressVerification.correctedValue
          }
        };
        
        results.push(result);
      }
    }
    
    return results;
  }
}

// Helper function to get Levenshtein distance (simple implementation)
const levenshtein = {
  get: function(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
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

    return matrix[b.length][a.length];
  }
};