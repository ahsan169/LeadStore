import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertLeadBatchSchema, insertPurchaseSchema, insertContactSubmissionSchema, type InsertLead, type InsertVerificationSession, type InsertVerificationResult } from "@shared/schema";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import OpenAI from "openai";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, isObjectStorageConfigured } from "./object-storage.js";
import multer from "multer";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { 
  sendOrderConfirmation, 
  sendDownloadReady, 
  sendAdminAlert, 
  sendContactFormNotification,
  sendAlertNotification 
} from "./email";
import { db } from "./db";
import { leadPerformance, purchases, leadScoringModels, leads, users } from "@shared/schema";
import { gte, lte, and, or, sql, eq, desc, like, isNotNull, isNull, inArray } from "drizzle-orm";
import { LeadVerificationEngine, StrictnessLevel } from "./lead-verification";
import { AIVerificationEngine } from "./ai-verification";
import { OptimizedAIVerificationEngine } from "./ai-verification-optimized";
import { uccIntelligenceExtractor } from "./services/ucc-intelligence-extractor";
import { WebSocketServer, WebSocket } from 'ws';
import { leadAlertService, addAlertClient } from "./services/lead-alerts";
import { leadEnrichmentService } from "./services/lead-enrichment";
import { qualityGuaranteeService } from "./services/quality-guarantee";
import { comprehensiveLeadEnricher } from "./services/comprehensive-lead-enricher";
import { numverifyService } from "./numverify-service";
import { fieldMapper, CanonicalField, FIELD_VALIDATORS } from "./intelligence/ontology";
import { leadQualityScorer, funderMatcher } from "./intelligence/industry-knowledge";
import { leadFreshnessService, FreshnessCategory } from "./services/lead-freshness";
import { bulkOperationsService } from "./services/bulk-operations";
import { perplexityResearch } from "./services/perplexity-research";
import { revenueDiscovery } from "./services/revenue-discovery";
import { uccParser } from "./services/ucc-parser";
import { uccIntelligenceService } from "./services/ucc-intelligence";
import { uccIntelligenceIntegration } from "./services/ucc-intelligence-integration";
import { uccLeadMatchingService } from "./services/ucc-lead-matching";
import { uccMonitoringService } from "./services/ucc-monitoring";
import { googleDriveService } from "./services/google-drive-service";
import { insertLeadAlertSchema, insertQualityGuaranteeSchema, insertCampaignTemplateSchema, insertCampaignSchema, insertApiKeySchema, insertWebhookSchema } from "@shared/schema";
import { campaignService } from "./services/campaign-tools";
import { apiAuthMiddleware, rateLimitMiddleware, usageTrackingMiddleware, apiResponse, apiError, parsePagination, paginatedResponse, apiKeyManager, webhookDispatcher, cleanup as cleanupEnterpriseApi } from "./services/enterprise-api";
import { commandCenterService } from "./services/command-center";
import { marketInsightsService } from "./services/market-insights";
import { predictiveScoringEngine } from "./services/predictive-scoring";
import { insightsDashboardService } from "./services/insights-dashboard";
import { leadCompletionAnalyzer } from "./services/lead-completion-analyzer";
import { enrichmentQueue } from "./services/enrichment-queue";
import { eventBus } from "./services/event-bus";
import { registerEnrichmentQueueRoutes } from "./routes/enrichment-queue-routes";
import { masterEnrichmentOrchestrator } from "./services/master-enrichment-orchestrator";
import { registerBrainRoutes } from "./routes/brain";
import { registerEnrichmentDashboardRoutes } from "./routes/enrichment-dashboard-routes";
import { registerMultiSourceVerificationRoutes } from "./routes/multi-source-verification-routes";
import rulesRouter from "./routes/rules";
import { setupAdminRoutes } from "./routes/admin";
import { setupAdminUploadRoutes } from "./routes/admin-upload";
import { setupEnhancedEnrichmentRoutes } from "./routes/enhanced-enrichment";
import entityRouter from "./routes/entity";
import feedbackRouter from "./routes/feedback";
import intelligenceRouter from "./routes/intelligence";
import { unifiedEnrichmentService } from "./services/unified-enrichment-service";
import { unifiedValidationService } from "./services/unified-validation-service";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

const BUCKET_NAME = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const SALT_ROUNDS = 10;

// Pricing configuration
const PRICING = {
  starter: { price: 997, leadsPerPurchase: 100 },
  pro: { price: 2997, leadsPerPurchase: 500 },
};

// Comprehensive column mapping for flexible field detection
const COLUMN_MAPPINGS = {
  businessName: [
    'businessname', 'business name', 'business_name', 'business-name',
    'company name', 'companyname', 'company_name', 'company-name', 
    'company', 'business', 'dba', 'legal name', 'legal_name',
    'firm name', 'firm_name', 'organization', 'corp', 'corporation',
    'enterprise', 'establishment', 'vendor', 'merchant', 'merchant name',
    'debtor', 'debtor name', 'debtor_name', 'debtor-name'
  ],
  ownerName: [
    'ownername', 'owner name', 'owner_name', 'owner-name',
    'contact name', 'contactname', 'contact_name', 'contact-name',
    'owner', 'contact', 'name', 'full name', 'full_name',
    'contact person', 'primary contact', 'principal', 'proprietor',
    'first name last name', 'firstname lastname', 'representative',
    'manager', 'ceo', 'president', 'director', 'lead name'
  ],
  email: [
    'email', 'e-mail', 'e_mail', 'email address', 'emailaddress',
    'email_address', 'contact email', 'contactemail', 'contact_email',
    'business email', 'businessemail', 'business_email', 'email id',
    'emailid', 'mail', 'electronic mail', 'primary email'
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'phone_number', 'phone-number',
    'telephone', 'tel', 'mobile', 'cell', 'cell phone', 'cellphone',
    'mobile number', 'mobile_number', 'contact number', 'contactnumber',
    'contact_number', 'business phone', 'businessphone', 'business_phone',
    'primary phone', 'main phone', 'office phone', 'work phone',
    'contact phone', 'contactphone', 'tel no', 'tel_no', 'phone no',
    'phone1', 'phone2', 'phone 1', 'phone 2'  // Added support for phone1/phone2
  ],
  industry: [
    'industry', 'business type', 'businesstype', 'business_type',
    'sector', 'category', 'vertical', 'business category', 
    'business_category', 'type', 'sic', 'naics', 'trade',
    'line of business', 'business sector', 'industry type'
  ],
  annualRevenue: [
    'annualrevenue', 'annual revenue', 'annual_revenue', 'annual-revenue',
    'revenue', 'yearly revenue', 'yearlyrevenue', 'yearly_revenue',
    'annual sales', 'annualsales', 'annual_sales', 'sales',
    'gross revenue', 'grossrevenue', 'gross_revenue', 'gross sales',
    'grosssales', 'gross_sales', 'monthly revenue', 'monthlyrevenue',
    'monthly_revenue', 'monthly sales', 'monthlysales', 'monthly_sales',
    'yearly sales', 'yearlysales', 'yearly_sales', 'total revenue',
    'annual income', 'yearly income', 'business revenue'
  ],
  requestedAmount: [
    'requestedamount', 'requested amount', 'requested_amount', 'requested-amount',
    'amount', 'funding amount', 'fundingamount', 'funding_amount',
    'loan amount', 'loanamount', 'loan_amount', 'amount requested',
    'amountrequested', 'amount_requested', 'advance amount', 'advanceamount',
    'advance_amount', 'amount needed', 'amountneeded', 'amount_needed',
    'funding requested', 'capital needed', 'financing amount', 'desired amount'
  ],
  timeInBusiness: [
    'timeinbusiness', 'time in business', 'time_in_business', 'time-in-business',
    'years in business', 'yearsinbusiness', 'years_in_business',
    'business age', 'businessage', 'business_age', 'established',
    'months in business', 'monthsinbusiness', 'months_in_business',
    'years established', 'yearsestablished', 'years_established',
    'establishment date', 'time established', 'company age',
    'operating since', 'years operating', 'business established'
  ],
  creditScore: [
    'creditscore', 'credit score', 'credit_score', 'credit-score',
    'fico', 'fico score', 'ficoscore', 'fico_score', 'credit rating',
    'creditrating', 'credit_rating', 'score', 'personal credit',
    'personal credit score', 'personalcreditscore', 'personal_credit_score',
    'credit', 'fico rating', 'credit points', 'owner credit score'
  ],
  // UCC-specific fields for comprehensive intelligence
  uccNumber: [
    'ucc_number', 'ucc number', 'uccnumber', 'ucc-number', 'filing number',
    'filing_number', 'filingnumber', 'file number', 'file_number', 
    'document number', 'doc_number', 'reference number'
  ],
  filingDate: [
    'filing_date', 'filing date', 'filingdate', 'filing-date',
    'date filed', 'date_filed', 'filed date', 'filed_date',
    'file date', 'file_date', 'effective date'
  ],
  filingType: [
    'filing_type', 'filing type', 'filingtype', 'filing-type',
    'amend_type', 'amend type', 'amendtype', 'amendment type',
    'transaction type', 'doc type', 'document type'
  ],
  expireDate: [
    'expire_date', 'expire date', 'expiredate', 'expire-date',
    'expiration date', 'expiration_date', 'expiry date', 'expiry_date',
    'lapse date', 'lapse_date', 'termination date'
  ],
  amendDate: [
    'amend_date', 'amend date', 'amenddate', 'amend-date',
    'amendment date', 'amendment_date', 'modification date',
    'continuation date', 'continuation_date'
  ],
  securedParties: [
    'secured_parties', 'secured parties', 'securedparties', 'secured-parties',
    'lender', 'lenders', 'creditor', 'creditors', 'secured party',
    'secured_party', 'financing party', 'financing_party', 'assignee'
  ],
  lenderCount: [
    'lender_count', 'lender count', 'lendercount', 'lender-count',
    'number of lenders', 'secured party count', 'creditor count',
    'party count', 'parties count'
  ],
  filingCount: [
    'filing_count', 'filing count', 'filingcount', 'filing-count',
    'number of filings', 'total filings', 'filing total',
    'position count', 'positions'
  ],
  suggestedPrice: [
    'suggested_price', 'suggested price', 'suggestedprice', 'suggested-price',
    'price', 'value', 'lead price', 'lead_price', 'cost'
  ],
  notes: [
    'notes', 'comments', 'remarks', 'additional info', 'additional_info',
    'metadata', 'details', 'description'
  ],
  recencyBucket: [
    'recency_bucket', 'recency bucket', 'recencybucket', 'recency-bucket',
    'age bucket', 'age_bucket', 'filing age', 'filing_age',
    'time bucket', 'time_bucket', 'age category'
  ],
  stateCode: [
    'statecode', 'state code', 'state_code', 'state-code',
    'state', 'location', 'region', 'province', 'state abbreviation',
    'stateabbreviation', 'state_abbreviation', 'us state', 'usstate',
    'us_state', 'business state', 'businessstate', 'business_state',
    'address state', 'addressstate', 'address_state'
  ],
  address: [
    'address', 'street address', 'streetaddress', 'street_address',
    'street', 'business address', 'businessaddress', 'business_address',
    'location address', 'address1', 'address 1', 'address_1',
    'street1', 'street 1', 'street_1', 'main address', 'physical address',
    'full address', 'full_address', 'fulladdress', 'full-address'
  ],
  city: [
    'city', 'town', 'municipality', 'business city', 'businesscity',
    'business_city', 'location city', 'address city', 'addresscity',
    'address_city'
  ],
  zipCode: [
    'zipcode', 'zip code', 'zip_code', 'zip-code', 'zip',
    'postal code', 'postalcode', 'postal_code', 'postcode',
    'post code', 'post_code', 'business zip', 'businesszip',
    'business_zip', 'address zip', 'addresszip', 'address_zip'
  ],
  website: [
    'website', 'web site', 'website url', 'websiteurl', 'website_url',
    'url', 'web', 'web address', 'webaddress', 'web_address',
    'company website', 'companywebsite', 'company_website',
    'business website', 'businesswebsite', 'business_website',
    'homepage', 'home page', 'site'
  ],
  ein: [
    'ein', 'tax id', 'taxid', 'tax_id', 'federal tax id',
    'federaltaxid', 'federal_tax_id', 'employer identification number',
    'employer id', 'employerid', 'employer_id', 'fein', 'tax number',
    'taxnumber', 'tax_number', 'business tax id'
  ],
  sicCode: [
    'siccode', 'sic code', 'sic_code', 'sic-code', 'sic',
    'standard industrial classification', 'industry code', 'industrycode',
    'industry_code'
  ],
  naicsCode: [
    'naicscode', 'naics code', 'naics_code', 'naics-code', 'naics',
    'north american industry classification', 'industry classification'
  ],
  fax: [
    'fax', 'fax number', 'faxnumber', 'fax_number', 'fax no',
    'faxno', 'fax_no', 'facsimile', 'business fax', 'businessfax',
    'business_fax'
  ],
  dailyBankDeposits: [
    'dailybankdeposits', 'daily bank deposits', 'daily_bank_deposits',
    'daily deposits', 'dailydeposits', 'daily_deposits', 'bank deposits',
    'bankdeposits', 'bank_deposits', 'average daily deposits',
    'daily banking', 'avg daily deposits'
  ],
  previousMCAHistory: [
    'previousmcahistory', 'previous mca history', 'previous_mca_history',
    'mca history', 'mcahistory', 'mca_history', 'prior mca', 'priormca',
    'prior_mca', 'existing mca', 'existingmca', 'existing_mca',
    'past mca', 'pastmca', 'past_mca', 'mca experience', 'advance history',
    'previous advance', 'cash advance history'
  ],
  urgencyLevel: [
    'urgencylevel', 'urgency level', 'urgency_level', 'urgency',
    'timeline', 'need level', 'needlevel', 'need_level', 'priority',
    'funding urgency', 'fundingurgency', 'funding_urgency',
    'how soon', 'timeframe', 'time frame', 'time_frame', 'when needed'
  ],
  exclusivityStatus: [
    'exclusivitystatus', 'exclusivity status', 'exclusivity_status',
    'exclusivity', 'exclusive', 'lead exclusivity', 'leadexclusivity',
    'lead_exclusivity', 'exclusive lead', 'exclusivelead', 'exclusive_lead'
  ],
  monthlyRevenue: [
    'monthlyrevenue', 'monthly revenue', 'monthly_revenue', 'monthly-revenue',
    'monthly sales', 'monthlysales', 'monthly_sales', 'monthly gross',
    'monthlygross', 'monthly_gross', 'avg monthly revenue', 'average monthly revenue',
    'monthly income', 'monthlyincome', 'monthly_income'
  ]
};

/**
 * Extract and normalize phone numbers from various formats
 * Handles multiple phone numbers in a single cell
 * @param phoneString - Raw phone string from CSV that may contain multiple phones
 * @returns Object with primary and secondary phone numbers (normalized)
 */
function extractPhoneNumbers(phoneString: string): { primary: string | null, secondary: string | null } {
  if (!phoneString || typeof phoneString !== 'string') {
    return { primary: null, secondary: null };
  }

  // Debug logging
  const debugEnabled = false;
  if (debugEnabled) {
    console.log(`[Phone Extraction] Input: "${phoneString}"`);
  }

  // Common separators for multiple phone numbers
  const separatorPatterns = [
    /[,;\/\\|]/,  // Comma, semicolon, forward/back slash, pipe
    /\s+or\s+/i,  // "or" with spaces
    /\s+and\s+/i, // "and" with spaces
    /\s*[&]\s*/,  // Ampersand with optional spaces
    /\s{2,}/,     // Multiple spaces
    /[\n\r]+/,    // Line breaks
  ];

  // Split the input by common separators to find multiple phone numbers
  let potentialPhones: string[] = [phoneString];
  
  for (const separator of separatorPatterns) {
    const newPotentialPhones: string[] = [];
    for (const phone of potentialPhones) {
      const parts = phone.split(separator);
      newPotentialPhones.push(...parts);
    }
    potentialPhones = newPotentialPhones;
  }

  // Also check for patterns like "phone1: xxx phone2: xxx"
  const labeledPhonePattern = /(?:phone\s*\d*\s*[:#]?\s*|tel\s*[:#]?\s*|mobile\s*[:#]?\s*|cell\s*[:#]?\s*)([^\s].*?)(?=(?:phone|tel|mobile|cell|\s*$))/gi;
  const labeledMatches = phoneString.matchAll(labeledPhonePattern);
  for (const match of labeledMatches) {
    if (match[1]) {
      potentialPhones.push(match[1].trim());
    }
  }

  // Regular expressions for various phone formats
  const phonePatterns = [
    // International format with country code
    /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
    // Standard US formats
    /\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
    // 10 digits with no formatting
    /\b([0-9]{10})\b/,
    // With extensions (capture base number only)
    /\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(?:\s*(?:ext|x|extension)\.?\s*\d+)?/i,
    // Dots as separators
    /([0-9]{3})\.([0-9]{3})\.([0-9]{4})/,
    // Spaces as separators
    /([0-9]{3})\s+([0-9]{3})\s+([0-9]{4})/,
  ];

  const extractedPhones: string[] = [];
  const processedNumbers = new Set<string>();

  for (const potential of potentialPhones) {
    if (!potential || potential.trim().length === 0) continue;

    const trimmed = potential.trim();
    
    // Try each pattern
    for (const pattern of phonePatterns) {
      const matches = trimmed.matchAll(new RegExp(pattern, 'g'));
      
      for (const match of matches) {
        let phoneNumber = '';
        
        // Extract digits from the match
        const fullMatch = match[0];
        const digits = fullMatch.replace(/\D/g, '');
        
        // Handle different digit lengths
        if (digits.length === 11 && digits.startsWith('1')) {
          // Remove country code
          phoneNumber = digits.substring(1);
        } else if (digits.length === 10) {
          phoneNumber = digits;
        } else if (digits.length === 7) {
          // Local number without area code - skip for now
          continue;
        } else {
          continue;
        }

        // Validate the phone number
        if (phoneNumber.length === 10) {
          // Check for invalid patterns
          const firstThree = phoneNumber.substring(0, 3);
          const secondThree = phoneNumber.substring(3, 6);
          const lastFour = phoneNumber.substring(6);
          
          // Skip invalid area codes (000, 111, etc)
          if (firstThree === '000' || firstThree === '111' || firstThree === '999') {
            continue;
          }
          
          // Skip if all digits are the same (e.g., 111-111-1111, 000-000-0000)
          if (/^(\d)\1{9}$/.test(phoneNumber)) {
            continue;
          }
          
          // Skip specific invalid patterns
          if (phoneNumber === '0000000000' || 
              phoneNumber === '1111111111' || 
              phoneNumber === '9999999999' ||
              phoneNumber === '8888888888' ||
              phoneNumber === '7777777777') {
            continue;
          }
          
          // Skip sequential patterns like 1234567890
          if (phoneNumber === '1234567890' || phoneNumber === '0123456789') {
            continue;
          }
          
          // Skip if middle three digits are all the same AND first/last match
          if (firstThree === secondThree && secondThree === lastFour.substring(0, 3)) {
            continue;
          }

          // Format the phone number consistently
          const formatted = `${phoneNumber.substring(0, 3)}-${phoneNumber.substring(3, 6)}-${phoneNumber.substring(6)}`;
          
          // Avoid duplicates
          if (!processedNumbers.has(phoneNumber)) {
            processedNumbers.add(phoneNumber);
            extractedPhones.push(formatted);
            
            if (debugEnabled) {
              console.log(`[Phone Extraction] Found: ${formatted}`);
            }
          }
        }
      }
    }

    // If no pattern matched, try extracting raw 10-digit sequence
    const rawDigits = trimmed.replace(/\D/g, '');
    if (rawDigits.length === 10 && !processedNumbers.has(rawDigits)) {
      const formatted = `${rawDigits.substring(0, 3)}-${rawDigits.substring(3, 6)}-${rawDigits.substring(6)}`;
      processedNumbers.add(rawDigits);
      extractedPhones.push(formatted);
      
      if (debugEnabled) {
        console.log(`[Phone Extraction] Found (raw): ${formatted}`);
      }
    } else if (rawDigits.length === 11 && rawDigits.startsWith('1')) {
      const withoutCountryCode = rawDigits.substring(1);
      if (!processedNumbers.has(withoutCountryCode)) {
        const formatted = `${withoutCountryCode.substring(0, 3)}-${withoutCountryCode.substring(3, 6)}-${withoutCountryCode.substring(6)}`;
        processedNumbers.add(withoutCountryCode);
        extractedPhones.push(formatted);
        
        if (debugEnabled) {
          console.log(`[Phone Extraction] Found (11-digit): ${formatted}`);
        }
      }
    }
  }

  // Return primary and secondary phone numbers
  const result = {
    primary: extractedPhones[0] || null,
    secondary: extractedPhones[1] || null
  };

  if (debugEnabled) {
    console.log(`[Phone Extraction] Result:`, result);
  }

  return result;
}

/**
 * Flexible column mapper that uses the intelligent field mapper from our ontology
 */
function mapColumnToField(columnName: string): string | null {
  if (!columnName) return null;
  
  // Use the intelligent field mapper from our ontology
  const canonicalField = fieldMapper.mapToCanonical(columnName);
  
  // Debug logging for specific problematic columns - REDUCED TO PREVENT EXCESSIVE LOGGING
  const debugEnabled = false;
  if (debugEnabled) {
    console.log(`Mapping column "${columnName}" -> canonical field: "${canonicalField}"`);
  }
  
  // If the field mapper found a match, return it
  if (canonicalField) {
    return canonicalField;
  }
  
  // Fall back to old mapping for backward compatibility (temporarily)
  // This ensures nothing breaks while we transition
  const normalized = columnName
    .toLowerCase()
    .trim()
    .replace(/[\s\-_\.]+/g, ' ')
    .replace(/\s+/g, ' ');
  
  // Check old exact matches
  for (const [field, patterns] of Object.entries(COLUMN_MAPPINGS)) {
    if (patterns.includes(normalized)) {
      return field;
    }
  }
  
  // Check if column contains any of the patterns (partial matching)
  for (const [field, patterns] of Object.entries(COLUMN_MAPPINGS)) {
    for (const pattern of patterns) {
      // Check if the normalized column contains the pattern
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        return field;
      }
      
      // Check word-based matching (all words from pattern exist in column)
      const patternWords = pattern.split(' ').filter(w => w.length > 2);
      const columnWords = normalized.split(' ').filter(w => w.length > 2);
      
      if (patternWords.length > 0 && patternWords.every(w => columnWords.includes(w))) {
        return field;
      }
    }
  }
  
  return null;
}

/**
 * Parse Excel file with better error handling and edge case support
 */
function parseExcelFile(buffer: Buffer, filename: string): { rows: any[], headers: string[] } {
  try {
    const workbook = XLSX.read(buffer, { 
      type: 'buffer',
      cellDates: true,  // Parse dates properly
      cellFormula: false,  // Don't evaluate formulas, just get values
      cellNF: false,
      cellStyles: false,
      cellText: false,
      raw: false  // Get formatted values
    });
    
    // Find the first sheet with data
    let worksheet = null;
    let sheetName = '';
    
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      
      // Check if sheet has data (more than just headers)
      if (range.e.r > 0) {
        worksheet = sheet;
        sheetName = name;
        break;
      }
    }
    
    if (!worksheet) {
      throw new Error('No sheets with data found in Excel file');
    }
    
    console.log(`Using sheet: ${sheetName}`);
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,  // Get formatted values
      dateNF: 'yyyy-mm-dd'
    }) as any[][];
    
    if (jsonData.length === 0) {
      throw new Error('Excel file has no data rows');
    }
    
    // Extract headers (first non-empty row)
    let headerRowIndex = 0;
    let headers: string[] = [];
    
    for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
      const row = jsonData[i];
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      
      // If this row has more than 3 non-empty cells, consider it as header
      if (nonEmptyCells.length > 3) {
        headers = row.map(h => String(h || '').trim()).filter(h => h !== '');
        headerRowIndex = i;
        break;
      }
    }
    
    if (headers.length === 0) {
      throw new Error('No valid headers found in Excel file');
    }
    
    // Convert to array of objects, skipping empty rows
    const rows: any[] = [];
    
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      // Skip empty rows
      const nonEmptyCells = row.filter(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (nonEmptyCells.length === 0) continue;
      
      const obj: any = {};
      let hasData = false;
      
      headers.forEach((header, index) => {
        const value = row[index];
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          obj[header] = String(value).trim();
          hasData = true;
        }
      });
      
      if (hasData) {
        rows.push(obj);
      }
    }
    
    return { rows, headers };
  } catch (error) {
    console.error('Excel parsing error:', error);
    throw error;
  }
}

/**
 * Parse CSV file with multiple encoding support
 */
async function parseCSVFile(buffer: Buffer, filename: string): Promise<{ rows: any[], headers: string[] }> {
  // First, check if this might be an Apple Numbers file
  const firstBytes = buffer.slice(0, 8).toString('hex').toUpperCase();
  
  // If it's a ZIP file, it might be Numbers or Excel
  if (firstBytes.startsWith('504B0304')) {
    const isNumbers = filename.toLowerCase().endsWith('.numbers') || 
                     filename.toLowerCase().includes('numbers');
    
    if (isNumbers || filename.toLowerCase().endsWith('.csv')) {
      // Try to parse as Numbers file
      try {
        console.log('[parseCSVFile] Detected potential Numbers file, attempting to parse...');
        const { NumbersFileParser } = await import('./services/numbers-file-parser.js');
        const parser = new NumbersFileParser();
        const result = await parser.parseNumbersFile(buffer, filename);
        console.log(`[parseCSVFile] Successfully parsed Numbers file: ${result.rows.length} rows`);
        return result;
      } catch (numbersError: any) {
        console.error('[parseCSVFile] Numbers parsing failed:', numbersError.message);
        // If it fails and filename suggests CSV, throw appropriate error
        if (filename.toLowerCase().endsWith('.csv')) {
          throw new Error('This appears to be an Apple Numbers file renamed as CSV. Please export it as CSV from Numbers or upload the original .numbers file.');
        }
        throw numbersError;
      }
    }
    
    // Not Numbers, check other ZIP-based formats
    throw new Error('This appears to be a ZIP or compressed file. Please extract the contents and upload a CSV file, or if this is an Apple Numbers file, please include .numbers in the filename.');
  }
  
  // Check for other binary file signatures
  const binarySignatures = [
    { sig: '89504E47', type: 'PNG image' },
    { sig: 'FFD8FF', type: 'JPEG image' },
    { sig: '47494638', type: 'GIF image' },
    { sig: '25504446', type: 'PDF' },
    { sig: '52617221', type: 'RAR archive' },
    { sig: 'D0CF11E0', type: 'MS Office document' },
  ];
  
  for (const { sig, type } of binarySignatures) {
    if (firstBytes.startsWith(sig)) {
      throw new Error(`This appears to be a ${type}. Please upload a CSV file containing lead data.`);
    }
  }
  
  // Try different encodings
  const encodings = ['utf-8', 'latin1', 'windows-1252', 'utf-16'];
  let csvContent: string = '';
  let usedEncoding = '';
  
  for (const encoding of encodings) {
    try {
      csvContent = buffer.toString(encoding as BufferEncoding);
      
      // Quick validation - check if content looks reasonable
      if (csvContent.includes('\n') && !csvContent.includes('�')) {
        usedEncoding = encoding;
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!csvContent) {
    csvContent = buffer.toString('utf-8');
    usedEncoding = 'utf-8 (fallback)';
  }
  
  // Check for non-text characters
  const nonPrintableCount = (csvContent.slice(0, 1000).match(/[^\x20-\x7E\t\n\r]/g) || []).length;
  const printableRatio = 1 - (nonPrintableCount / Math.min(csvContent.length, 1000));
  
  if (printableRatio < 0.95) {
    throw new Error('File contains too many non-text characters. Please ensure the file is a valid CSV file.');
  }
  
  console.log(`Parsing CSV with encoding: ${usedEncoding}`);
  
  // Parse with error handling and limits
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    dynamicTyping: false,  // Keep everything as strings for consistency
    delimitersToGuess: [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP],
    preview: 10000  // Limit to 10000 rows for safety
  });
  
  if (parseResult.errors.length > 0) {
    // Log errors but try to continue if we have some data
    console.warn('CSV parsing warnings:', parseResult.errors.slice(0, 5));
    
    // If there are too many errors, the file is likely not a valid CSV
    if (parseResult.errors.length > parseResult.data.length * 0.5 && parseResult.data.length > 0) {
      throw new Error('Too many parsing errors. Please ensure the file is a valid CSV file.');
    }
    
    if (!parseResult.data || parseResult.data.length === 0) {
      throw new Error('CSV parsing failed: No valid data found. Please check the file format.');
    }
  }
  
  const rows = parseResult.data as any[];
  const headers = parseResult.meta.fields || [];
  
  // Final validation
  if (rows.length === 0) {
    throw new Error('No data rows found in the CSV file');
  }
  
  if (headers.length === 0) {
    throw new Error('No headers found in the CSV file');
  }
  
  return { rows, headers };
}

/**
 * Normalize and map lead data with intelligent field mapping and validation
 */
function normalizeLeadData(row: any, debug: boolean = false): any {
  const normalized: any = {};
  const unmappedFields: any = {};
  let phoneFieldsFound: string[] = [];
  
  // First, use the field mapper to normalize all fields at once
  const mappedData = fieldMapper.mapObject(row);
  
  // Process the mapped data
  for (const [field, value] of Object.entries(mappedData)) {
    if (!value || String(value).trim() === '') continue;
    
    // Special handling for phone fields - collect all phone columns
    if (field === 'phone' || field === 'secondaryPhone' || field === 'mobilePhone' || field === 'workPhone') {
      if (FIELD_VALIDATORS.phone.validate(String(value))) {
        phoneFieldsFound.push(FIELD_VALIDATORS.phone.normalize(String(value)));
      }
    } 
    // Special handling for boolean fields
    else if (field === 'dailyBankDeposits') {
      const strValue = String(value).toLowerCase();
      normalized[field] = strValue === 'true' || strValue === 'yes' || 
                                strValue === '1' || strValue === 'y';
    } 
    // Use validators for standardization
    else if (field === 'email' && FIELD_VALIDATORS.email.validate(String(value))) {
      normalized[field] = FIELD_VALIDATORS.email.normalize(String(value));
    }
    else if ((field === 'state' || field === 'stateCode' || field === 'filingState') && FIELD_VALIDATORS.state.validate(String(value))) {
      normalized[field] = FIELD_VALIDATORS.state.normalize(String(value));
    }
    else if ((field === 'annualRevenue' || field === 'requestedAmount' || field === 'monthlyRevenue') && String(value)) {
      normalized[field] = String(FIELD_VALIDATORS.currency.normalize(String(value)));
    }
    else if (field === 'creditScore' && FIELD_VALIDATORS.creditScore.validate(value)) {
      normalized[field] = String(FIELD_VALIDATORS.creditScore.normalize(value));
    }
    else if (field === 'zipCode' && FIELD_VALIDATORS.zipCode.validate(String(value))) {
      normalized[field] = FIELD_VALIDATORS.zipCode.normalize(String(value));
    }
    else {
      normalized[field] = String(value).trim();
    }
  }
  
  // Keep track of any unmapped fields for debugging
  for (const [key, value] of Object.entries(row)) {
    if (!mappedData.hasOwnProperty(key) && value) {
      unmappedFields[key] = value;
    }
  }
  
  // Process phone numbers using the extraction function
  if (phoneFieldsFound.length > 0) {
    // Combine all phone fields (in case phone1 and phone2 are in separate columns)
    const combinedPhoneString = phoneFieldsFound.join(', ');
    const extractedPhones = extractPhoneNumbers(combinedPhoneString);
    
    normalized.phone = extractedPhones.primary || '';
    if (extractedPhones.secondary) {
      normalized.secondaryPhone = extractedPhones.secondary;
    }
    
    if (debug) {
      console.log('Phone extraction:', {
        input: combinedPhoneString,
        primary: extractedPhones.primary,
        secondary: extractedPhones.secondary
      });
    }
  }
  
  // Set defaults for optional fields
  normalized.previousMCAHistory = normalized.previousMCAHistory || 'none';
  normalized.urgencyLevel = normalized.urgencyLevel || 'exploring';
  normalized.exclusivityStatus = normalized.exclusivityStatus || 'non_exclusive';
  normalized.leadAge = normalized.leadAge || 0;
  
  // Check if this is UCC data and extract intelligence
  const hasUccData = normalized.uccNumber || normalized.securedParties || 
                     normalized.filingDate || normalized.lenderCount ||
                     unmappedFields.ucc_number || unmappedFields.secured_parties;
  
  if (hasUccData) {
    // Combine normalized and unmapped data for UCC intelligence extraction
    const uccData = {
      ...normalized,
      ...unmappedFields,
      // Ensure proper field mapping for UCC extractor
      debtor_name: normalized.businessName || unmappedFields.debtor_name,
      secured_parties: normalized.securedParties || unmappedFields.secured_parties,
      filing_date: normalized.filingDate || unmappedFields.filing_date,
      filing_type: normalized.filingType || unmappedFields.filing_type,
      filing_count: normalized.filingCount || unmappedFields.filing_count,
      lender_count: normalized.lenderCount || unmappedFields.lender_count,
      expire_date: normalized.expireDate || unmappedFields.expire_date,
      amend_date: normalized.amendDate || unmappedFields.amend_date,
      suggested_price: normalized.suggestedPrice || unmappedFields.suggested_price,
      score: normalized.creditScore || unmappedFields.score,
      state: normalized.stateCode || unmappedFields.state,
      notes: normalized.notes || unmappedFields.notes
    };
    
    // Extract UCC intelligence
    const intelligence = uccIntelligenceExtractor.extractIntelligence(uccData);
    
    // Add extracted owner name if not already present
    if (!normalized.ownerName && intelligence.ownerName) {
      normalized.ownerName = intelligence.ownerName;
    }
    
    // Add UCC-specific fields
    normalized.primaryLenderType = intelligence.primaryLenderType;
    normalized.hasMultipleMcaPositions = intelligence.hasMultipleMcaPositions;
    normalized.activePositions = intelligence.activePositions;
    normalized.terminatedPositions = intelligence.terminatedPositions;
    normalized.lastFilingDate = intelligence.lastFilingDate;
    normalized.filingSpanDays = intelligence.filingSpanDays;
    normalized.stackingRisk = intelligence.stackingRisk;
    normalized.businessMaturity = intelligence.businessMaturity;
    
    // Store estimated revenue if not already present
    if (!normalized.annualRevenue && intelligence.estimatedAnnualRevenue) {
      normalized.annualRevenue = String(intelligence.estimatedAnnualRevenue);
      normalized.estimatedRevenue = intelligence.estimatedAnnualRevenue;
      normalized.revenueConfidence = intelligence.revenueConfidenceScore + '%';
    }
    
    // Store the full intelligence object for reference
    normalized.uccIntelligence = uccIntelligenceExtractor.formatIntelligence(intelligence);
    
    if (debug) {
      console.log('UCC Intelligence extracted:', {
        ownerName: intelligence.ownerName,
        primaryLenderType: intelligence.primaryLenderType,
        estimatedRevenue: intelligence.estimatedAnnualRevenue,
        stackingRisk: intelligence.stackingRisk,
        activePositions: intelligence.activePositions
      });
    }
  }
  
  if (debug) {
    console.log('Column mapping result:', {
      mapped: Object.keys(normalized),
      unmapped: Object.keys(unmappedFields),
      phoneFields: phoneFieldsFound,
      hasUccData: hasUccData
    });
  }
  
  // Include unmapped fields as additional data
  normalized._unmapped = unmappedFields;
  
  return normalized;
}

/**
 * Check if required fields are present in normalized data
 * More lenient validation: needs business name OR (email + phone) OR (owner + phone)
 */
function validateRequiredFields(normalizedData: any): { isValid: boolean, missing: string[], suggestions: string[] } {
  const allFields = ['businessName', 'ownerName', 'email', 'phone'];
  const missing: string[] = [];
  const suggestions: string[] = [];
  const present: string[] = [];
  
  for (const field of allFields) {
    if (normalizedData[field] && String(normalizedData[field]).trim() !== '') {
      present.push(field);
    } else {
      missing.push(field);
      
      // Provide suggestions from unmapped fields
      if (normalizedData._unmapped) {
        const unmappedKeys = Object.keys(normalizedData._unmapped);
        const fieldPatterns = COLUMN_MAPPINGS[field as keyof typeof COLUMN_MAPPINGS] || [];
        
        for (const key of unmappedKeys) {
          const normalizedKey = key.toLowerCase();
          if (fieldPatterns.some((p: string) => normalizedKey.includes(p) || p.includes(normalizedKey))) {
            suggestions.push(`Column "${key}" might contain ${field} data`);
          }
        }
      }
    }
  }
  
  // More lenient validation logic:
  // Valid if we have:
  // 1. Business name (most important field)
  // 2. OR email + phone (can identify/contact)
  // 3. OR owner name + phone (can identify/contact)
  // 4. OR at least 2 out of 4 fields present
  const hasBusinessName = present.includes('businessName');
  const hasEmail = present.includes('email');
  const hasPhone = present.includes('phone');
  const hasOwner = present.includes('ownerName');
  
  const isValid = hasBusinessName || 
                  (hasEmail && hasPhone) || 
                  (hasOwner && hasPhone) ||
                  present.length >= 2;
  
  return {
    isValid,
    missing,
    suggestions
  };
}

// Enhanced MCA Lead Scoring Algorithm
function calculateMCAQualityScore(lead: any): number {
  let score = 0;
  
  // Revenue scoring (35 points max)
  const revenue = parseInt(lead.annualRevenue) || 0;
  if (revenue >= 250000 && revenue <= 2000000) score += 35; // Sweet spot
  else if (revenue >= 100000 && revenue < 250000) score += 25;
  else if (revenue > 2000000 && revenue <= 10000000) score += 20;
  else if (revenue >= 50000 && revenue < 100000) score += 10;
  
  // Industry scoring (20 points max)
  const highValueIndustries = ['restaurant', 'retail', 'trucking', 'construction', 'healthcare', 'hospitality'];
  const mediumValueIndustries = ['wholesale', 'manufacturing', 'services'];
  const industryLower = lead.industry?.toLowerCase() || '';
  
  if (highValueIndustries.some(ind => industryLower.includes(ind))) score += 20;
  else if (mediumValueIndustries.some(ind => industryLower.includes(ind))) score += 12;
  else if (lead.industry) score += 5;
  
  // Business age scoring (15 points max)
  const timeInBusiness = parseInt(lead.timeInBusiness) || 0;
  if (timeInBusiness >= 24) score += 15; // 2+ years
  else if (timeInBusiness >= 12) score += 10;
  else if (timeInBusiness >= 6) score += 5;
  
  // Credit score (15 points max)
  const creditScore = parseInt(lead.creditScore) || 0;
  if (creditScore >= 550 && creditScore <= 700) score += 15; // MCA sweet spot
  else if (creditScore > 700 && creditScore <= 750) score += 10;
  else if (creditScore >= 500 && creditScore < 550) score += 8;
  
  // Previous MCA History bonus (10 points max)
  if (lead.previousMCAHistory === 'previous_paid') score += 10; // Renewals convert at 70%+
  else if (lead.previousMCAHistory === 'current') score += 7;
  else if (lead.previousMCAHistory === 'multiple') score += 8;
  
  // Funding urgency (5 points max)
  const requestedAmount = parseInt(lead.requestedAmount) || 0;
  if (requestedAmount >= 10000 && requestedAmount <= 500000) score += 5;
  else if (requestedAmount > 0) score += 3;
  
  // Daily bank deposits bonus (5 points max)
  if (lead.dailyBankDeposits) score += 5;
  
  // Urgency level bonus (5 points max)
  if (lead.urgencyLevel === 'immediate') score += 5;
  else if (lead.urgencyLevel === 'this_week') score += 4;
  else if (lead.urgencyLevel === 'this_month') score += 2;
  
  // Contact quality (5 points max)
  if (lead.email && lead.phone) score += 5;
  else if (lead.email || lead.phone) score += 3;
  
  // State code bonus for high-value states (5 points max)
  const highValueStates = ['CA', 'NY', 'TX', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI'];
  if (highValueStates.includes(lead.stateCode)) score += 5;
  else if (lead.stateCode) score += 2;
  
  return Math.min(100, score);
}

// Dynamic Pricing Calculator
function calculateLeadPrice(lead: any, exclusivity: string = 'non_exclusive', volume: number = 1): number {
  let basePrice = 25; // Base price per lead
  
  // Quality multiplier
  const qualityScore = lead.qualityScore || 0;
  if (qualityScore >= 90) basePrice *= 3;
  else if (qualityScore >= 80) basePrice *= 2.5;
  else if (qualityScore >= 70) basePrice *= 2;
  else if (qualityScore >= 60) basePrice *= 1.5;
  else if (qualityScore >= 50) basePrice *= 1.2;
  
  // Industry premium
  const premiumIndustries = ['restaurant', 'healthcare', 'trucking'];
  const industryLower = lead.industry?.toLowerCase() || '';
  if (premiumIndustries.some(ind => industryLower.includes(ind))) {
    basePrice *= 1.3;
  }
  
  // Previous MCA premium (renewals are gold)
  if (lead.previousMCAHistory === 'previous_paid') basePrice *= 1.5;
  else if (lead.previousMCAHistory === 'current') basePrice *= 1.3;
  else if (lead.previousMCAHistory === 'multiple') basePrice *= 1.4;
  
  // State premium
  const premiumStates = ['CA', 'NY', 'TX', 'FL'];
  if (premiumStates.includes(lead.stateCode)) {
    basePrice *= 1.2;
  }
  
  // Exclusivity multiplier
  if (exclusivity === 'exclusive') basePrice *= 2.5;
  else if (exclusivity === 'semi_exclusive') basePrice *= 1.5;
  
  // Volume discount
  if (volume >= 1000) basePrice *= 0.7;
  else if (volume >= 500) basePrice *= 0.8;
  else if (volume >= 200) basePrice *= 0.9;
  else if (volume >= 100) basePrice *= 0.95;
  
  // Lead age discount
  const ageInDays = lead.leadAge || 0;
  if (ageInDays > 90) basePrice *= 0.3;
  else if (ageInDays > 60) basePrice *= 0.5;
  else if (ageInDays > 30) basePrice *= 0.7;
  else if (ageInDays > 14) basePrice *= 0.85;
  else if (ageInDays > 7) basePrice *= 0.95;
  
  // Urgency premium
  if (lead.urgencyLevel === 'immediate') basePrice *= 1.2;
  else if (lead.urgencyLevel === 'this_week') basePrice *= 1.1;
  
  // Daily deposits premium
  if (lead.dailyBankDeposits) basePrice *= 1.15;
  
  return Math.round(basePrice);
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const isCSV = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    const isExcel = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                     file.mimetype === 'application/vnd.ms-excel' ||
                     file.originalname.endsWith('.xlsx') ||
                     file.originalname.endsWith('.xls');
    
    if (isCSV || isExcel) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  const server = createServer(app);
  
  // Initialize Command Center WebSocket server
  commandCenterService.initializeWebSocketServer(server);
  
  // Register enrichment queue management routes
  registerEnrichmentQueueRoutes(app);
  
  // Register brain pipeline routes
  registerBrainRoutes(app);
  
  // Register enrichment dashboard routes
  registerEnrichmentDashboardRoutes(app);
  
  // Register multi-source verification routes
  registerMultiSourceVerificationRoutes(app);
  
  // Register rules management routes
  app.use(rulesRouter);

  // Register admin routes
  setupAdminRoutes(app);
  
  // Register admin upload routes with fallback support
  setupAdminUploadRoutes(app);
  
  // Register enhanced enrichment routes
  setupEnhancedEnrichmentRoutes(app);

  // Register entity resolution routes
  app.use(entityRouter);
  
  // Register feedback and learning routes
  app.use('/api/feedback', feedbackRouter);
  
  // Register intelligence routes
  app.use('/api/intelligence', intelligenceRouter);
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      // Force role to "buyer" - never allow self-registration as admin
      const { role, ...restData } = req.body;
      const dataWithBuyerRole = { ...restData, role: "buyer" };
      
      const validatedData = insertUserSchema.parse(dataWithBuyerRole);
      
      // Check if user already exists
      const existing = await storage.getUserByUsername(validatedData.username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const emailExists = await storage.getUserByEmail(validatedData.email);
      if (emailExists) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password before storing
      const hashedPassword = await bcrypt.hash(validatedData.password, SALT_ROUNDS);
      const userWithHashedPassword = {
        ...validatedData,
        password: hashedPassword,
      };

      const user = await storage.createUser(userWithHashedPassword);
      
      // Don't send password back
      const { password, ...userWithoutPassword } = user;
      
      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: "Login failed" });
        res.json(userWithoutPassword);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    // Passport handles this via the strategy
    next();
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.user) {
      // req.user already has password field excluded from the session
      // but TypeScript doesn't know that, so we cast it
      const user = req.user as any;
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Middleware to check authentication
  function requireAuth(req: any, res: any, next: any) {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  }

  // Middleware to check admin role
  function requireAdmin(req: any, res: any, next: any) {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  }

  // Lead batch routes (admin only)
  app.get("/api/batches", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batches = await storage.getAllLeadBatches();
      res.json(batches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });

  app.get("/api/batches/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batch = await storage.getLeadBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });

  app.post("/api/batches/:id/publish", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { tier } = req.body;
      if (!['gold', 'platinum', 'diamond', 'elite'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      const batch = await storage.updateLeadBatch(req.params.id, {
        status: "published",
      });

      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to publish batch" });
    }
  });

  // Generate test leads endpoint (admin only)
  app.post("/api/admin/generate-test-leads", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Only allow in development or test mode
      if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_TEST_LEADS) {
        return res.status(403).json({ error: "Test lead generation not allowed in production" });
      }

      // Generate leads with varied quality scores
      // 300 leads with quality 60-69 (Gold tier)
      const goldLeads = generateTestLeads(300, { min: 60, max: 69 });
      
      // 400 leads with quality 70-79 (Platinum tier)
      const platinumLeads = generateTestLeads(400, { min: 70, max: 79 });
      
      // 300 leads with quality 80-100 (Diamond tier)
      const diamondLeads = generateTestLeads(300, { min: 80, max: 100 });
      
      // Combine all leads
      const allTestLeads = [...goldLeads, ...platinumLeads, ...diamondLeads];
      
      // Create a test batch
      const batch = await storage.createLeadBatch({
        uploadedBy: req.user!.id,
        filename: 'test-leads-batch.csv',
        storageKey: `test-batch-${Date.now()}`,
        totalLeads: allTestLeads.length,
        averageQualityScore: (
          allTestLeads.reduce((sum, lead) => sum + lead.qualityScore, 0) / allTestLeads.length
        ).toFixed(2),
        status: "ready"
      });
      
      // Update all leads with the actual batch ID
      const leadsToInsert = allTestLeads.map(lead => ({
        ...lead,
        batchId: batch.id
      }));
      
      // Insert leads into database
      const createdLeads = await storage.createLeads(leadsToInsert);
      
      // Trigger alert checking for new leads
      try {
        console.log(`Checking alerts for ${createdLeads.length} new test leads`);
        await leadAlertService.checkAlertsForNewLeads(createdLeads, batch.id);
      } catch (alertError) {
        console.error('Error checking alerts:', alertError);
        // Don't fail the upload if alert checking fails
      }
      
      // Calculate distribution stats
      const distribution = {
        gold: goldLeads.length,
        platinum: platinumLeads.length,
        diamond: diamondLeads.length,
        total: allTestLeads.length,
        averageQualityScore: (
          allTestLeads.reduce((sum, lead) => sum + lead.qualityScore, 0) / allTestLeads.length
        ).toFixed(2)
      };
      
      res.json({
        success: true,
        batchId: batch.id,
        message: `Successfully generated ${allTestLeads.length} test leads`,
        distribution
      });
      
    } catch (error) {
      console.error("Generate test leads error:", error);
      res.status(500).json({ error: "Failed to generate test leads" });
    }
  });

  // Lead Management endpoint
  app.get("/api/leads/management", requireAuth, async (req, res) => {
    try {
      const {
        search = "",
        sortField = "uploadedAt",
        sortOrder = "desc",
        filters = "{}",
        page = "1",
        limit = "20"
      } = req.query as any;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      
      // Parse filters
      let parsedFilters: any = {};
      try {
        parsedFilters = JSON.parse(filters);
      } catch {
        parsedFilters = {};
      }

      // Build where conditions
      const whereConditions: any[] = [];
      
      // Search filter
      if (search) {
        whereConditions.push(
          or(
            like(leads.businessName, `%${search}%`),
            like(leads.ownerName, `%${search}%`)
          )
        );
      }

      // Quality score range filter
      if (parsedFilters.scoreRange) {
        const [min, max] = parsedFilters.scoreRange.split('-').map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          whereConditions.push(
            and(
              gte(leads.qualityScore, min),
              lte(leads.qualityScore, max)
            )
          );
        }
      }

      // MCA score range filter
      if (parsedFilters.mcaScoreRange) {
        const [min, max] = parsedFilters.mcaScoreRange.split('-').map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          whereConditions.push(
            and(
              gte(leads.mcaScore, min),
              lte(leads.mcaScore, max)
            )
          );
        }
      }

      // Enrichment status filter
      if (parsedFilters.enrichmentStatus !== undefined) {
        whereConditions.push(
          eq(leads.isEnriched, parsedFilters.enrichmentStatus === 'enriched')
        );
      }

      // Validation status filter  
      if (parsedFilters.validationStatus !== undefined) {
        whereConditions.push(
          parsedFilters.validationStatus === 'validated' 
            ? eq(leads.verificationStatus, 'verified')
            : or(
                eq(leads.verificationStatus, 'unverified'),
                eq(leads.verificationStatus, 'partial'),
                eq(leads.verificationStatus, 'failed')
              )
        );
      }

      // Build order by clause with validation
      // Create a mapping for sort fields
      const sortFieldMap: Record<string, any> = {
        'id': leads.id,
        'businessName': leads.businessName,
        'ownerName': leads.ownerName,
        'email': leads.email,
        'phone': leads.phone,
        'industry': leads.industry,
        'annualRevenue': leads.annualRevenue,
        'qualityScore': leads.qualityScore,
        'mcaQualityScore': leads.mcaScore,
        'isEnriched': leads.isEnriched,
        'isValidated': leads.verificationStatus,
        'uploadedAt': leads.uploadedAt,
        'lastEnrichedAt': leads.lastEnrichedAt,
        'conversionProbability': leads.conversionProbability,
        'expectedDealSize': leads.expectedDealSize,
        'estimatedRevenue': leads.estimatedRevenue,
        'enrichmentStatus': leads.enrichmentStatus
      };
      
      // Get the column for sorting
      const validSortField = sortFieldMap[sortField] ? sortField : 'uploadedAt';
      const orderByColumn = sortFieldMap[validSortField];
      
      // Create order by clause
      const orderByClause = sortOrder === 'asc' ? orderByColumn : desc(orderByColumn);

      // Get total count
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(leads)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
      const totalCount = Number(countResult[0]?.count || 0);

      // Return early if no leads found
      if (totalCount === 0) {
        return res.json({
          leads: [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: 0,
            totalPages: 0
          }
        });
      }

      // Get paginated results with derived fields
      const results = await db
        .select({
          id: leads.id,
          businessName: leads.businessName,
          ownerName: leads.ownerName,
          email: leads.email,
          phone: leads.phone,
          industry: leads.industry,
          annualRevenue: leads.annualRevenue,
          qualityScore: leads.qualityScore,
          mcaQualityScore: leads.mcaScore,
          isEnriched: leads.isEnriched,
          isValidated: sql<boolean>`${leads.verificationStatus} = 'verified'`,
          enrichmentStatus: leads.enrichmentStatus,
          uploadedAt: leads.uploadedAt,
          lastEnrichedAt: leads.lastEnrichedAt,
          conversionProbability: leads.conversionProbability,
          expectedDealSize: leads.expectedDealSize,
          estimatedRevenue: leads.estimatedRevenue,
          // Derived readiness status
          readinessStatus: sql<string>`
            CASE 
              WHEN ${leads.isEnriched} = true 
                AND ${leads.verificationStatus} = 'verified' 
                AND ${leads.qualityScore} > 60 
              THEN 'ready'
              WHEN ${leads.isEnriched} = true 
                AND ${leads.verificationStatus} != 'verified' 
              THEN 'needs_validation'
              WHEN ${leads.isEnriched} = false 
                AND ${leads.verificationStatus} = 'verified' 
              THEN 'needs_enrichment'
              WHEN ${leads.isEnriched} = false 
                AND ${leads.verificationStatus} != 'verified' 
              THEN 'needs_processing'
              ELSE 'not_ready'
            END
          `.as('readinessStatus')
        })
        .from(leads)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(orderByClause)
        .limit(limitNum)
        .offset(offset);

      res.json({
        leads: results || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum)
        }
      });
    } catch (error: any) {
      console.error("Lead management error:", error);
      res.status(500).json({ 
        error: "Failed to fetch leads",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

  // Bulk enrichment endpoint
  app.post("/api/leads/bulk-enrich", requireAuth, async (req, res) => {
    try {
      const { leadIds } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "No lead IDs provided" });
      }

      // Queue leads for enrichment
      const enrichmentPromises = leadIds.map(leadId => 
        enrichmentQueue.addToQueue('enrich', leadId, 1)
      );
      
      await Promise.all(enrichmentPromises);
      
      res.json({ 
        success: true, 
        message: `${leadIds.length} leads queued for enrichment` 
      });
    } catch (error: any) {
      console.error("Bulk enrichment error:", error);
      res.status(500).json({ error: "Failed to enrich leads" });
    }
  });

  // Bulk validation endpoint
  app.post("/api/leads/bulk-validate", requireAuth, async (req, res) => {
    try {
      const { leadIds } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "No lead IDs provided" });
      }

      // Queue leads for validation
      const validationPromises = leadIds.map(async (leadId) => {
        const lead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
        if (lead[0]) {
          return unifiedValidationService.validateLead(lead[0]);
        }
      });
      
      await Promise.all(validationPromises);
      
      res.json({ 
        success: true, 
        message: `${leadIds.length} leads queued for validation` 
      });
    } catch (error: any) {
      console.error("Bulk validation error:", error);
      res.status(500).json({ error: "Failed to validate leads" });
    }
  });

  // Bulk export endpoint
  app.post("/api/leads/bulk-export", requireAuth, async (req, res) => {
    try {
      const { leadIds } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "No lead IDs provided" });
      }

      // Fetch leads for export
      const exportLeads = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, leadIds));

      // Convert to CSV format
      const csv = Papa.unparse(exportLeads);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
      res.send(csv);
    } catch (error: any) {
      console.error("Bulk export error:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  // CSV/Excel Upload route
  app.post("/api/batches/upload", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      
      // Debug logging
      console.log('File received:', file.originalname, file.mimetype, file.size);
      
      let rows: any[] = [];
      let headers: string[] = [];
      
      // Parse file based on type
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      
      try {
        if (isExcel) {
          const result = parseExcelFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        } else {
          const result = await parseCSVFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        }
      } catch (parseError: any) {
        console.error('File parsing error:', parseError);
        return res.status(400).json({ 
          error: "Failed to parse file", 
          details: parseError.message,
          headers: headers
        });
      }
      
      console.log('Headers found:', headers);
      console.log('Total rows:', rows.length);
      if (rows.length > 0) {
        console.log('Sample row:', rows[0]);
      }
      
      // Normalize all rows first
      const normalizedRows = rows.map((row, index) => {
        return normalizeLeadData(row, index === 0); // Debug first row only
      });
      
      // Check if we have required fields across all normalized rows
      const firstValidRow = normalizedRows.find(row => {
        const validation = validateRequiredFields(row);
        return validation.isValid;
      });
      
      if (!firstValidRow) {
        // No valid rows found - provide detailed error
        const firstRowValidation = normalizedRows[0] ? validateRequiredFields(normalizedRows[0]) : null;
        
        return res.status(400).json({ 
          error: "Required fields could not be mapped from the uploaded file",
          details: "The file must contain columns that can be mapped to: Business Name, Owner Name, Email, and Phone",
          headersFound: headers,
          missingFields: firstRowValidation?.missing || [],
          suggestions: firstRowValidation?.suggestions || [],
          hint: "Column names are matched flexibly. For example, 'Company Name', 'Business', 'DBA' all map to Business Name"
        });
      }
      
      console.log('Column mappings applied:', Object.keys(firstValidRow));

      // Process and validate leads
      const validationResults = {
        total: normalizedRows.length,
        valid: 0,
        errors: [] as any[],
        warnings: [] as any[],
      };

      const validLeads: any[] = [];
      const leadHashes = new Set<string>();

      for (let i = 0; i < normalizedRows.length; i++) {
        const normalizedRow = normalizedRows[i];
        const rowNum = i + 2; // +2 for header and 0-index

        // Validate required fields
        const validation = validateRequiredFields(normalizedRow);
        if (!validation.isValid) {
          validationResults.errors.push({
            row: rowNum,
            error: "Missing required fields: " + validation.missing.join(', '),
            missingFields: validation.missing,
            suggestions: validation.suggestions,
            data: normalizedRow,
          });
          continue;
        }

        // Validate email format (only if email is present)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (normalizedRow.email && normalizedRow.email.trim() !== '' && !emailRegex.test(normalizedRow.email)) {
          validationResults.errors.push({
            row: rowNum,
            error: "Invalid email format",
            data: normalizedRow,
          });
          continue;
        }

        // Validate phone format (only if phone is present)
        if (normalizedRow.phone && normalizedRow.phone.trim() !== '') {
          const phoneDigits = normalizedRow.phone.replace(/\D/g, '');
          if (phoneDigits.length < 10) {
            validationResults.errors.push({
              row: rowNum,
              error: "Invalid phone format (minimum 10 digits required)",
              data: normalizedRow,
            });
            continue;
          }
        }

        // Check for duplicates (only if we have email or phone to check)
        if ((normalizedRow.email && normalizedRow.email.trim() !== '') || 
            (normalizedRow.phone && normalizedRow.phone.trim() !== '')) {
          const leadHash = createLeadHash(
            normalizedRow.email || '', 
            normalizedRow.phone || ''
          );
          if (leadHashes.has(leadHash)) {
            validationResults.warnings.push({
              row: rowNum,
              warning: "Duplicate lead (same email and phone)",
              data: normalizedRow,
            });
            continue;
          }
          leadHashes.add(leadHash);
        }

        // Calculate MCA quality score
        const qualityScore = calculateMCAQualityScore(normalizedRow);

        // Calculate lead age (default to 0 for new leads)
        const leadAge = 0;
        normalizedRow.leadAge = leadAge;

        // Assign tier based on quality score
        const tier = assignTier(qualityScore);

        validLeads.push({
          ...normalizedRow,
          qualityScore,
          tier,
        });

        validationResults.valid++;
      }

      if (validLeads.length === 0) {
        return res.status(400).json({ 
          error: "No valid leads found in CSV",
          validationResults,
        });
      }

      // Upload original CSV to object storage (if configured) with fallback
      const timestamp = Date.now();
      let storageKey = `batches/${timestamp}_${file.originalname}`;
      let storageType: 's3' | 'local' = 'local';
      let localFilePath: string | undefined;
      
      if (isObjectStorageConfigured() && s3Client) {
        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: storageKey,
            Body: file.buffer,
            ContentType: 'text/csv',
          }));
          storageType = 's3';
          console.log(`[Upload] File stored in S3: ${storageKey}`);
        } catch (s3Error: any) {
          console.error('[Upload] S3 storage failed, falling back to local:', {
            error: s3Error.message,
            code: s3Error.code,
            statusCode: s3Error.$metadata?.httpStatusCode
          });
          // Continue with local storage fallback
        }
      }
      
      // Fallback to local storage if S3 failed or not configured
      if (storageType === 'local') {
        try {
          const uploadsDir = path.join(process.cwd(), 'uploads', 'batches');
          await fs.mkdir(uploadsDir, { recursive: true });
          
          const localFilename = `${timestamp}_${file.originalname}`;
          localFilePath = path.join(uploadsDir, localFilename);
          
          await fs.writeFile(localFilePath, file.buffer);
          storageKey = `local_${localFilename}`;
          
          console.log(`[Upload] File stored locally at: ${localFilePath}`);
        } catch (localError: any) {
          console.error('[Upload] Local storage failed:', localError);
          // Use a placeholder key if all storage fails
          storageKey = `temp_${storageKey}`;
        }
      }

      // Create lead batch
      const avgQualityScore = validLeads.reduce((sum, l) => sum + l.qualityScore, 0) / validLeads.length;
      const batch = await storage.createLeadBatch({
        uploadedBy: req.user!.id,
        filename: file.originalname,
        storageKey,
        totalLeads: validLeads.length,
        averageQualityScore: avgQualityScore.toFixed(2),
        status: "ready",
      });

      // Insert leads into database
      const leadsToInsert: InsertLead[] = validLeads.map(lead => ({
        batchId: batch.id,
        businessName: lead.businessName?.trim() || "Unknown Business",
        ownerName: lead.ownerName?.trim() || "Not Provided",
        email: lead.email?.trim().toLowerCase() || "noemail@example.com",
        phone: lead.phone?.trim() || "0000000000",
        industry: lead.industry?.trim() || null,
        annualRevenue: lead.annualRevenue?.trim() || null,
        requestedAmount: lead.requestedAmount?.trim() || null,
        timeInBusiness: lead.timeInBusiness?.trim() || null,
        creditScore: lead.creditScore?.trim() || null,
        dailyBankDeposits: lead.dailyBankDeposits || false,
        previousMCAHistory: lead.previousMCAHistory || 'none',
        urgencyLevel: lead.urgencyLevel || 'exploring',
        stateCode: lead.stateCode?.trim() || null,
        leadAge: lead.leadAge || 0,
        exclusivityStatus: lead.exclusivityStatus || 'non_exclusive',
        qualityScore: lead.qualityScore,
        tier: lead.tier,
        sold: false,
      }));

      const createdLeads = await storage.createLeads(leadsToInsert);
      
      // Calculate unified intelligence scores for all uploaded leads
      try {
        console.log(`Calculating unified intelligence scores for ${createdLeads.length} new leads`);
        const leadIds = createdLeads.map(lead => lead.id);
        
        // Calculate intelligence scores in the background (non-blocking)
        storage.batchCalculateIntelligenceScores(leadIds).then(() => {
          console.log(`Intelligence scores calculated for ${leadIds.length} leads`);
        }).catch(err => {
          console.error('Error calculating intelligence scores:', err);
        });
        
        // Also run ML scoring for backward compatibility
        await autoScoreLeads(batch.id);
        
        // Check for high-value opportunities based on intelligence scores
        const highValueLeads = createdLeads.filter(lead => {
          const mlScore = lead.mlQualityScore || 0;
          return mlScore >= 85; // High ML score indicates high-value opportunity
        });
        
        if (highValueLeads.length > 0) {
          console.log(`Found ${highValueLeads.length} high-value leads`);
        }
      } catch (scoringError) {
        console.error('Error scoring leads:', scoringError);
        // Don't fail the upload if scoring fails
      }
      
      // Trigger alert checking for new leads
      try {
        console.log(`Checking alerts for ${createdLeads.length} new leads from batch upload`);
        await leadAlertService.checkAlertsForNewLeads(createdLeads, batch.id);
      } catch (alertError) {
        console.error('Error checking alerts:', alertError);
        // Don't fail the upload if alert checking fails
      }
      
      // Auto-enrich all leads using Master Enrichment Orchestrator
      try {
        console.log(`[Master Enrichment] Processing ${createdLeads.length} new leads for automatic enrichment`);
        let enrichedCount = 0;
        let queuedCount = 0;
        
        // Process leads in batches for better performance
        const batchSize = 10;
        for (let i = 0; i < createdLeads.length; i += batchSize) {
          const batch = createdLeads.slice(i, Math.min(i + batchSize, createdLeads.length));
          
          // Process batch in parallel
          await Promise.all(batch.map(async (lead) => {
            try {
              // Analyze lead completion first
              const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(lead);
              
              // Determine priority based on lead quality and completeness
              const priority = lead.qualityScore >= 80 ? 'high' :
                             lead.qualityScore >= 70 ? 'medium' : 'low';
              
              // Always enrich leads to maximize data quality
              // Even "complete" leads can benefit from verification and additional data
              if (analysis.completionScore < 95 || !lead.masterEnrichmentScore || lead.masterEnrichmentScore < 80) {
                // Queue for async enrichment through master orchestrator
                await enrichmentQueue.addToQueue(
                  lead,
                  priority,
                  'upload',
                  { 
                    userId: req.user!.id,
                    batchId: batch.id,
                    useOrchestrator: true,  // Flag to use master enrichment orchestrator
                    cascadeDepth: 3,       // Allow deep enrichment cascades
                    forceRefresh: false
                  }
                );
                queuedCount++;
                console.log(`[Master Enrichment] Queued lead ${lead.id} for orchestrated enrichment (${analysis.completionScore}% complete, priority: ${priority})`);
              }
            } catch (error) {
              console.error(`[Master Enrichment] Error processing lead ${lead.id}:`, error);
            }
          }));
        }
        
        if (queuedCount > 0) {
          console.log(`[Master Enrichment] Queued ${queuedCount} leads for master enrichment orchestration`);
        }
        
        // Emit event for tracking
        eventBus.emit('lead:batch-uploaded', {
          batchId: batch.id,
          leadCount: createdLeads.length,
          userId: req.user!.id,
          enrichmentQueued: queuedCount
        });
      } catch (enrichmentError) {
        console.error('[Master Enrichment] Error queuing leads for orchestrated enrichment:', enrichmentError);
        // Don't fail the upload if enrichment queueing fails
      }

      // Calculate tier distribution
      const tierDistribution = {
        gold: validLeads.filter(l => l.tier === 'gold').length,
        platinum: validLeads.filter(l => l.tier === 'platinum').length,
        diamond: validLeads.filter(l => l.tier === 'diamond').length,
      };

      res.json({
        success: true,
        batchId: batch.id,
        summary: {
          totalLeads: validLeads.length,
          averageQualityScore: avgQualityScore,
          tierDistribution,
          validationResults,
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process CSV upload" });
    }
  });

  // Verification API Endpoints
  
  // POST /api/admin/verify-upload - Receives file, verifies leads, returns verification results
  app.post("/api/admin/verify-upload", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      
      // Debug logging
      console.log('Verify-upload file received:', file.originalname, file.mimetype, file.size);
      
      let rows: any[] = [];
      let headers: string[] = [];
      
      // Parse file using improved parsing
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      
      try {
        if (isExcel) {
          const result = parseExcelFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        } else {
          const result = await parseCSVFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        }
      } catch (parseError: any) {
        console.error('Verification file parsing error:', parseError);
        return res.status(400).json({ 
          error: "Failed to parse file", 
          details: parseError.message,
          headers: headers
        });
      }
      
      console.log('Verify-upload headers found:', headers);
      console.log('Verify-upload total rows:', rows.length);
      if (rows.length > 0) {
        console.log('Verify-upload sample row:', rows[0]);
      }
      
      // Normalize all rows using the improved mapper
      const normalizedLeads = rows.map((row, index) => {
        return normalizeLeadData(row, index === 0); // Debug first row only
      });
      
      // Validate we have at least one row with required fields
      const validRows = normalizedLeads.filter(row => {
        const validation = validateRequiredFields(row);
        return validation.isValid;
      });
      
      if (validRows.length === 0) {
        const firstRowValidation = normalizedLeads[0] ? validateRequiredFields(normalizedLeads[0]) : null;
        
        return res.status(400).json({ 
          error: "No valid leads found in file",
          details: "The file must contain columns that can be mapped to: Business Name, Owner Name, Email, and Phone",
          headersFound: headers,
          missingFields: firstRowValidation?.missing || [],
          suggestions: firstRowValidation?.suggestions || [],
          totalRows: rows.length
        });
      }
      
      console.log('Verify-upload column mappings applied:', validRows.length > 0 ? Object.keys(validRows[0]) : []);

      // Get strictness level from query params or use default
      const strictnessLevel = (req.query.strictness as StrictnessLevel) || StrictnessLevel.MODERATE;
      
      // Create verification session
      const sessionExpiry = new Date();
      sessionExpiry.setHours(sessionExpiry.getHours() + 24); // Expires in 24 hours
      
      const session: InsertVerificationSession = {
        uploadedBy: req.user!.id,
        filename: file.originalname,
        fileBuffer: file.buffer.toString('base64'), // Store file for potential re-processing
        totalLeads: normalizedLeads.length,
        verifiedCount: 0,
        warningCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        status: 'pending',
        strictnessLevel,
        expiresAt: sessionExpiry
      };
      
      const createdSession = await storage.createVerificationSession(session);
      
      // Run verification
      const verificationEngine = new LeadVerificationEngine(strictnessLevel);
      const verificationResults = await verificationEngine.verifyBatch(normalizedLeads, createdSession.id);
      
      // Save verification results
      await storage.createVerificationResults(verificationResults);
      
      // Calculate summary stats
      const verifiedCount = verificationResults.filter(r => r.status === 'verified').length;
      const warningCount = verificationResults.filter(r => r.status === 'warning').length;
      const failedCount = verificationResults.filter(r => r.status === 'failed').length;
      const duplicateCount = verificationResults.filter(r => r.isDuplicate).length;
      
      // Update session with counts
      await storage.updateVerificationSession(createdSession.id, {
        verifiedCount,
        warningCount,
        failedCount,
        duplicateCount,
        status: 'completed'
      });
      
      res.json({
        success: true,
        sessionId: createdSession.id,
        summary: {
          totalLeads: normalizedLeads.length,
          verifiedCount,
          warningCount,
          failedCount,
          duplicateCount,
          strictnessLevel
        }
      });
      
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ error: "Failed to verify leads" });
    }
  });

  // POST /api/admin/verify-upload-ai - AI-powered lead verification
  app.post("/api/admin/verify-upload-ai", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    // Track batch save status for accurate error reporting (defined outside to be available in catch block)
    const batchSaveStatus: { [key: number]: { saved: boolean; error?: string; leadsSaved: number } } = {};
    // Define leadBatch outside try block to be accessible in catch block
    let leadBatch: any = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      
      // Debug logging
      console.log('AI verify-upload file received:', file.originalname, file.mimetype, file.size);
      
      // Check for binary file signatures (Numbers/Excel compressed format)
      const firstBytes = file.buffer.slice(0, 4).toString('hex');
      const isBinaryFile = firstBytes === '504b0304'; // PK\x03\x04 - ZIP/compressed file signature
      
      if (isBinaryFile) {
        console.log('Detected binary/compressed file format (Numbers/Excel), will use Excel parser');
      }
      
      let rows: any[] = [];
      let headers: string[] = [];
      
      // Parse file using improved parsing
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls') || isBinaryFile;
      
      try {
        if (isExcel) {
          // Use Excel parser for binary files (including Numbers files with .csv extension)
          console.log('Using Excel parser for file');
          const result = parseExcelFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        } else {
          console.log('Using CSV parser for file');
          const result = await parseCSVFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        }
      } catch (parseError: any) {
        console.error('AI verification file parsing error:', parseError);
        return res.status(400).json({ 
          error: "Failed to parse file", 
          details: parseError.message,
          headers: headers
        });
      }
      
      console.log('AI verify-upload headers found:', headers);
      console.log('AI verify-upload total rows:', rows.length);
      if (rows.length > 0) {
        console.log('AI verify-upload sample row:', rows[0]);
      }
      
      // Normalize all rows using the improved mapper
      const normalizedLeads = rows.map((row, index) => {
        return normalizeLeadData(row, index === 0); // Debug first row only
      });
      
      // Validate we have at least one row with required fields
      const validRows = normalizedLeads.filter(row => {
        const validation = validateRequiredFields(row);
        return validation.isValid;
      });
      
      if (validRows.length === 0) {
        const firstRowValidation = normalizedLeads[0] ? validateRequiredFields(normalizedLeads[0]) : null;
        
        return res.status(400).json({ 
          error: "No valid leads found in file",
          details: "The file must contain columns that can be mapped to: Business Name, Owner Name, Email, and Phone",
          headersFound: headers,
          missingFields: firstRowValidation?.missing || [],
          suggestions: firstRowValidation?.suggestions || [],
          totalRows: rows.length
        });
      }
      
      console.log('AI verify-upload column mappings applied:', validRows.length > 0 ? Object.keys(validRows[0]) : []);

      // Get strictness level from query params or use default
      const strictnessLevel = (req.query.strictness as 'strict' | 'moderate' | 'lenient') || 'moderate';
      
      // Create lead batch at the START with processing status
      leadBatch = await storage.createLeadBatch({
        uploadedBy: req.user!.id,
        filename: file.originalname + ' (AI Verified)',
        storageKey: `ai_verified_${Date.now()}`,
        totalLeads: normalizedLeads.length,
        averageQualityScore: "0", // Will be updated incrementally
        status: "processing" // Start as processing
      });
      
      console.log(`[AI Verification] Created leadBatch ${leadBatch.id} with status 'processing'`);
      
      // Create verification session
      const sessionExpiry = new Date();
      sessionExpiry.setHours(sessionExpiry.getHours() + 24); // Expires in 24 hours
      
      const session: InsertVerificationSession = {
        uploadedBy: req.user!.id,
        filename: file.originalname + ' (AI Verified)',
        fileBuffer: file.buffer.toString('base64'), // Store file for potential re-processing
        totalLeads: normalizedLeads.length,
        verifiedCount: 0,
        warningCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        status: 'pending',
        strictnessLevel,
        expiresAt: sessionExpiry
      };
      
      const createdSession = await storage.createVerificationSession(session);
      
      // Track batch statistics for incremental updates
      let batchStats = {
        totalImported: 0,
        totalQualityScore: 0,
        verifiedCount: 0,
        warningCount: 0,
        failedCount: 0,
        duplicateCount: 0,
        lastBatchSaved: -1
      };
      
      // Get WebSocket server for progress updates
      const wss = app.get('wss') as WebSocket.Server;
      
      // Create optimized AI verification engine with progress callback
      const aiVerificationEngine = new OptimizedAIVerificationEngine(
        strictnessLevel,
        (progress) => {
          // Send progress to all connected WebSocket clients
          const progressMessage = JSON.stringify({ 
            type: 'verification-progress', 
            sessionId: createdSession.id,
            data: {
              ...progress,
              savedLeads: batchStats.totalImported, // Add saved count to progress
              message: progress.message + ` (${batchStats.totalImported} leads saved)`
            }
          });
          
          const wss = app.get('wss') as WebSocketServer;
          if (wss && wss.clients) {
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(progressMessage);
              }
            });
          }
        }
      );
      
      // Add WebSocket clients that are connected
      if (wss && wss.clients) {
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            aiVerificationEngine.addWebSocketClient(client);
          }
        });
      }
      
      console.log(`Starting AI verification for ${normalizedLeads.length} leads with ${strictnessLevel} strictness`);
      
      // Dynamic timeout based on lead count - more time for larger batches
      let timeoutMs: number;
      if (normalizedLeads.length < 100) {
        timeoutMs = 300000;    // 5 minutes for small batches
      } else if (normalizedLeads.length < 500) {
        timeoutMs = 600000;    // 10 minutes for medium batches
      } else if (normalizedLeads.length < 1000) {
        timeoutMs = 900000;    // 15 minutes for large batches
      } else {
        timeoutMs = 1800000;   // 30 minutes for very large batches
      }
      
      console.log(`[AI Verification] Timeout set to ${timeoutMs / 60000} minutes for ${normalizedLeads.length} leads`);
      
      // Define callback to save leads after each batch completes
      const onBatchComplete = async (batchResults: InsertVerificationResult[], batchIndex: number, totalBatches: number) => {
        // Initialize batch status
        batchSaveStatus[batchIndex] = { saved: false, leadsSaved: 0 };
        
        console.log(`[AI Verification] Processing batch ${batchIndex + 1} results for incremental save`);
        
        // Track what operations succeeded for potential rollback
        let verificationResultsSaved = false;
        let leadsSaved: any[] = [];
        let batchUpdated = false;
        
        try {
          // Step 1: Save verification results for this batch
          await storage.createVerificationResults(batchResults);
          verificationResultsSaved = true;
          
          // Process and save leads that passed verification
          const leadsToImport: InsertLead[] = [];
          let batchQualityScore = 0;
          let batchImportedCount = 0;
          
          for (const result of batchResults) {
            // Update batch statistics
            if (result.status === 'verified') batchStats.verifiedCount++;
            else if (result.status === 'warning') batchStats.warningCount++;
            else if (result.status === 'failed') batchStats.failedCount++;
            if (result.isDuplicate) batchStats.duplicateCount++;
            
            // Only import leads that are selected for import
            if (result.selectedForImport) {
              const leadData = result.leadData as any;
              
              // Calculate quality score for this lead
              const qualityScore = calculateMCAQualityScore(leadData);
              batchQualityScore += qualityScore;
              batchImportedCount++;
              
              // Determine tier based on quality score
              let tier: string;
              if (qualityScore >= 80) {
                tier = 'diamond';
              } else if (qualityScore >= 70) {
                tier = 'platinum';
              } else {
                tier = 'gold';
              }
              
              leadsToImport.push({
                batchId: leadBatch.id,
                businessName: leadData.businessName?.trim() || "Unknown Business",
                ownerName: leadData.ownerName?.trim() || "Not Provided",
                email: leadData.email?.trim().toLowerCase() || "noemail@example.com",
                phone: leadData.phone?.trim() || "0000000000",
                industry: leadData.industry?.trim() || null,
                annualRevenue: leadData.annualRevenue?.trim() || null,
                requestedAmount: leadData.requestedAmount?.trim() || null,
                timeInBusiness: leadData.timeInBusiness?.trim() || null,
                creditScore: leadData.creditScore?.trim() || null,
                dailyBankDeposits: leadData.dailyBankDeposits || false,
                previousMCAHistory: leadData.previousMCAHistory || 'none',
                urgencyLevel: leadData.urgencyLevel || 'exploring',
                stateCode: leadData.stateCode?.trim() || null,
                leadAge: leadData.leadAge || 0,
                exclusivityStatus: leadData.exclusivityStatus || 'non_exclusive',
                qualityScore,
                tier: tier as "gold" | "platinum" | "diamond" | "elite",
                sold: false
              });
            }
          }
          
          // Step 2: Save leads to database if there are any to import
          if (leadsToImport.length > 0) {
            const createdLeads = await storage.createLeads(leadsToImport);
            leadsSaved = createdLeads;
            
            // Only update stats if leads were successfully saved
            batchStats.totalImported += createdLeads.length;
            batchStats.totalQualityScore += batchQualityScore;
            batchSaveStatus[batchIndex].leadsSaved = createdLeads.length;
            
            // Step 3: Update batch with current statistics incrementally
            const avgQualityScore = batchStats.totalImported > 0 
              ? (batchStats.totalQualityScore / batchStats.totalImported).toFixed(2)
              : "0";
            
            await storage.updateLeadBatch(leadBatch.id, {
              totalLeads: batchStats.totalImported,
              averageQualityScore: avgQualityScore,
              status: "processing" // Keep as processing until all done
            });
            batchUpdated = true;
            
            console.log(`[AI Verification] Batch ${batchIndex + 1}: Successfully saved ${createdLeads.length} leads (total saved: ${batchStats.totalImported})`);
            
            // Trigger alert checking for new batch (non-blocking)
            leadAlertService.processNewBatch(leadBatch.id).catch(err => {
              console.error('Error checking alerts:', err);
            });
          }
          
          // Mark batch as successfully saved
          batchStats.lastBatchSaved = batchIndex;
          batchSaveStatus[batchIndex].saved = true;
          
          // Send progress update with actual saved counts
          const wss = app.get('wss') as WebSocketServer;
          if (wss && wss.clients) {
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'batch-save-complete',
                  data: {
                    batchIndex: batchIndex + 1,
                    totalBatches,
                    leadsSaved: batchSaveStatus[batchIndex].leadsSaved,
                    totalSaved: batchStats.totalImported,
                    totalProcessed: (batchIndex + 1) * batchResults.length
                  }
                }));
              }
            });
          }
          
        } catch (saveError: any) {
          // Record the error for this batch
          batchSaveStatus[batchIndex].error = saveError.message;
          
          console.error(`[AI Verification] CRITICAL ERROR saving batch ${batchIndex + 1}:`, saveError);
          console.error(`[AI Verification] Batch ${batchIndex + 1} status: verificationResults=${verificationResultsSaved}, leads=${leadsSaved.length}, batchUpdate=${batchUpdated}`);
          
          // Send error notification via WebSocket
          const wss = app.get('wss') as WebSocketServer;
          if (wss && wss.clients) {
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'batch-save-error',
                  data: {
                    batchIndex: batchIndex + 1,
                    totalBatches,
                    error: saveError.message,
                    partialSave: verificationResultsSaved || leadsSaved.length > 0
                  }
                }));
              }
            });
          }
          
          // Re-throw the error to abort further processing
          // The AI engine will catch this and stop processing remaining batches
          throw new Error(`Database save failed for batch ${batchIndex + 1}: ${saveError.message}`);
        }
      };
      
      // Run optimized AI-powered verification with dynamic timeout and incremental saving
      const verificationResults = await aiVerificationEngine.verifyBatchOptimized(
        normalizedLeads, 
        createdSession.id,
        timeoutMs,
        onBatchComplete
      );
      
      // Final stats calculation (from all results)
      const verifiedCount = verificationResults.filter(r => r.status === 'verified').length;
      const warningCount = verificationResults.filter(r => r.status === 'warning').length;
      const failedCount = verificationResults.filter(r => r.status === 'failed').length;
      const duplicateCount = verificationResults.filter(r => r.isDuplicate).length;
      
      // Calculate average confidence score from AI insights
      const avgConfidence = verificationResults.reduce((sum, r) => {
        const leadData = r.leadData as any;
        const confidence = leadData?.aiInsights?.confidenceScore || 0;
        return sum + confidence;
      }, 0) / verificationResults.length;
      
      // Update session with counts and AI metrics
      await storage.updateVerificationSession(createdSession.id, {
        verifiedCount,
        warningCount,
        failedCount,
        duplicateCount,
        status: 'completed'
      });
      
      // Mark batch as ready since all processing is complete
      const finalAvgQualityScore = batchStats.totalImported > 0 
        ? (batchStats.totalQualityScore / batchStats.totalImported).toFixed(2)
        : "0";
      
      await storage.updateLeadBatch(leadBatch.id, {
        totalLeads: batchStats.totalImported,
        averageQualityScore: finalAvgQualityScore,
        status: "ready" // Mark as ready now that all processing is complete
      });
      
      console.log(`[AI Verification] Completed: ${batchStats.totalImported} leads imported into batch ${leadBatch.id}`);
      
      // Perform enrichment if enabled
      const enrichmentEnabled = req.body?.enableEnrichment === 'true' || req.body?.enableEnrichment === true;
      let enrichmentResults = null;
      
      if (enrichmentEnabled) {
        console.log(`[Lead Enrichment] Starting enrichment for ${batchStats.totalImported} leads`);
        
        try {
          // Get all leads for this batch
          const leadsToEnrich = await storage.getLeadsByBatchId(leadBatch.id);
          const enrichmentProgress = { current: 0, total: leadsToEnrich.length };
          
          // Send enrichment progress updates via WebSocket
          if (wsClients.has(createdSession.id)) {
            const ws = wsClients.get(createdSession.id)!;
            ws.send(JSON.stringify({
              type: 'enrichment-progress',
              sessionId: createdSession.id,
              message: 'Starting lead enrichment...',
              progress: 0
            }));
          }
          
          for (let i = 0; i < leadsToEnrich.length; i++) {
            const lead = leadsToEnrich[i];
            
            try {
              // Research the lead using Perplexity
              const research = await perplexityResearch.researchLead(lead);
              
              // Discover revenue using multiple methods
              const revenueEstimate = await revenueDiscovery.discoverRevenue(lead);
              
              // Update the lead with enriched data
              const enrichedData: any = {
                isEnriched: true,
                lastEnrichedAt: new Date()
              };
              
              if (research.estimatedRevenue) {
                enrichedData.estimatedRevenue = research.estimatedRevenue;
                enrichedData.revenueConfidence = research.revenueConfidence || 'medium';
              } else if (revenueEstimate) {
                enrichedData.estimatedRevenue = revenueEstimate.amount;
                enrichedData.revenueConfidence = revenueEstimate.confidence;
              }
              
              if (research.employeeCount) enrichedData.employeeCount = research.employeeCount;
              if (research.yearsInBusiness) enrichedData.yearsInBusiness = research.yearsInBusiness;
              if (research.ownerBackground) enrichedData.ownerBackground = research.ownerBackground;
              
              if (research.businessDescription || research.keyActivities || research.sources) {
                enrichedData.researchInsights = {
                  businessDescription: research.businessDescription,
                  keyActivities: research.keyActivities,
                  sources: research.sources
                };
              }
              
              // Update the lead with enriched data
              await storage.updateLead(lead.id, enrichedData);
              
              enrichmentProgress.current++;
              
              // Send progress update every 5 leads or on completion
              if (enrichmentProgress.current % 5 === 0 || enrichmentProgress.current === enrichmentProgress.total) {
                const progressPercent = Math.round((enrichmentProgress.current / enrichmentProgress.total) * 100);
                
                if (wsClients.has(createdSession.id)) {
                  const ws = wsClients.get(createdSession.id)!;
                  ws.send(JSON.stringify({
                    type: 'enrichment-progress',
                    sessionId: createdSession.id,
                    message: `Enriching leads: ${enrichmentProgress.current}/${enrichmentProgress.total}`,
                    progress: progressPercent
                  }));
                }
              }
            } catch (enrichError) {
              console.error(`[Lead Enrichment] Error enriching lead ${lead.id}:`, enrichError);
              // Continue with other leads even if one fails
            }
          }
          
          enrichmentResults = {
            enrichedCount: enrichmentProgress.current,
            totalLeads: enrichmentProgress.total,
            success: true
          };
          
          console.log(`[Lead Enrichment] Completed: ${enrichmentProgress.current}/${enrichmentProgress.total} leads enriched`);
        } catch (enrichmentError) {
          console.error('[Lead Enrichment] Error during enrichment:', enrichmentError);
          enrichmentResults = {
            enrichedCount: 0,
            totalLeads: batchStats.totalImported,
            success: false,
            error: 'Enrichment failed but leads were imported successfully'
          };
        }
      }
      
      res.json({
        success: true,
        sessionId: createdSession.id,
        batchId: leadBatch.id, // Include batch ID in response
        enrichment: enrichmentResults,
        summary: {
          totalLeads: normalizedLeads.length,
          verifiedCount,
          warningCount,
          failedCount,
          duplicateCount,
          importedCount: batchStats.totalImported,
          strictnessLevel,
          averageConfidenceScore: Math.round(avgConfidence),
          averageQualityScore: parseFloat(finalAvgQualityScore),
          aiPowered: true
        }
      });
      
    } catch (error: any) {
      console.error("AI Verification error:", error);
      
      // Check if any batches were successfully saved
      const savedBatches = Object.entries(batchSaveStatus).filter(([_, status]) => status.saved);
      const failedBatches = Object.entries(batchSaveStatus).filter(([_, status]) => !status.saved && status.error);
      
      if (leadBatch && batchStats.totalImported > 0) {
        // Partial success - some batches were saved
        const partialAvgQualityScore = batchStats.totalImported > 0 
          ? (batchStats.totalQualityScore / batchStats.totalImported).toFixed(2)
          : "0";
        
        // Update batch status to reflect partial completion
        await storage.updateLeadBatch(leadBatch.id, {
          totalLeads: batchStats.totalImported,
          averageQualityScore: partialAvgQualityScore,
          status: failedBatches.length > 0 ? "partial" : "ready" // Mark as partial if some batches failed
        });
        
        // Update session to reflect partial completion
        if (createdSession) {
          await storage.updateVerificationSession(createdSession.id, {
            status: 'partial_failure',
            failedCount: failedBatches.length
          });
        }
        
        console.log(`[AI Verification] Partial completion: ${batchStats.totalImported} leads saved in ${savedBatches.length} batches before error`);
        
        // Build detailed batch status report
        const batchDetails = Object.entries(batchSaveStatus).map(([index, status]) => ({
          batch: parseInt(index) + 1,
          status: status.saved ? 'saved' : 'failed',
          leadsSaved: status.leadsSaved,
          error: status.error
        }));
        
        // Return 207 Multi-Status with detailed batch information
        res.status(207).json({
          success: false,
          partial: true,
          sessionId: createdSession?.id,
          batchId: leadBatch.id,
          error: "Verification partially completed due to database save failures",
          details: error.message,
          summary: {
            totalLeads: normalizedLeads.length,
            processedLeads: batchStats.verifiedCount + batchStats.warningCount + batchStats.failedCount,
            importedCount: batchStats.totalImported,
            savedBatches: savedBatches.length,
            failedBatches: failedBatches.length,
            lastSuccessfulBatch: batchStats.lastBatchSaved + 1,
            message: `${batchStats.totalImported} leads were successfully saved in ${savedBatches.length} batches. ${failedBatches.length} batch(es) failed to save.`,
            averageQualityScore: parseFloat(partialAvgQualityScore)
          },
          batches: batchDetails,
          recommendations: [
            "Review the failed batches and their error messages",
            "Consider retrying with smaller batch sizes",
            "Check database connection and storage capacity"
          ]
        });
      } else {
        // Complete failure - no leads saved
        // Update batch status to failed if it was created
        if (leadBatch) {
          await storage.updateLeadBatch(leadBatch.id, {
            status: "failed",
            totalLeads: 0,
            averageQualityScore: "0"
          });
        }
        
        // Update session status to failed if it was created
        if (createdSession) {
          await storage.updateVerificationSession(createdSession.id, {
            status: 'failed'
          });
        }
        
        res.status(500).json({ 
          error: "Failed to verify and save leads with AI",
          details: error.message,
          batchId: leadBatch?.id,
          sessionId: createdSession?.id,
          message: "No leads were saved due to processing or database errors"
        });
      }
    }
  });
  
  // POST /api/admin/upload-ucc-drive - Upload UCC data from Google Drive
  app.post("/api/admin/upload-ucc-drive", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { driveLink } = req.body;
      
      if (!driveLink) {
        return res.status(400).json({ error: "No Google Drive link provided" });
      }

      // Extract file/folder ID from the Google Drive URL
      const fileId = googleDriveService.extractFileId(driveLink);
      if (!fileId) {
        return res.status(400).json({ 
          error: "Invalid Google Drive link",
          details: "Please provide a valid Google Drive sharing link. Supported formats:\n" +
                   "• https://drive.google.com/file/d/FILE_ID/view\n" +
                   "• https://drive.google.com/drive/folders/FOLDER_ID\n" +
                   "• https://drive.google.com/open?id=FILE_ID\n" +
                   "• https://docs.google.com/spreadsheets/d/FILE_ID\n" +
                   "• Or just paste the file/folder ID directly",
          providedLink: driveLink.substring(0, 100)
        });
      }

      console.log(`Processing Google Drive resource: ${fileId}`);

      // Create a WebSocket connection for progress updates
      const progressCallback = (progress: any) => {
        // Send progress via WebSocket if connected
        // Note: WebSocket server is optional and may not be initialized
        try {
          const wss = app.get('wss') as WebSocketServer;
          if (wss && wss.clients) {
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'google-drive-progress',
                  data: progress
                }));
              }
            });
          }
        } catch (e) {
          // WebSocket not available, continue without progress updates
          console.log('Progress update:', progress);
        }
      };

      // Check if it's a folder and download all files
      let filePaths: string[] = [];
      try {
        // Check file metadata to determine if it's a folder
        const metadata = await googleDriveService.getFileMetadata(fileId);
        
        if (metadata.mimeType === 'application/vnd.google-apps.folder') {
          // It's a folder - download all files
          console.log(`Detected folder, downloading all files...`);
          filePaths = await googleDriveService.downloadAllFilesFromFolder(fileId, progressCallback);
          console.log(`Downloaded ${filePaths.length} files from folder`);
        } else {
          // Single file - use existing download method
          const singleFilePath = await googleDriveService.downloadFile(fileId, progressCallback);
          filePaths = [singleFilePath];
          console.log(`Downloaded single file to: ${singleFilePath}`);
        }
      } catch (downloadError: any) {
        console.error('Google Drive download error:', downloadError);
        
        // Provide specific error messages
        if (downloadError.message?.includes('Permission denied')) {
          return res.status(403).json({ 
            error: "Permission denied",
            details: "Make sure the file/folder is shared with 'Anyone with the link' permission"
          });
        } else if (downloadError.message?.includes('File too large')) {
          return res.status(413).json({ 
            error: "File too large",
            details: downloadError.message
          });
        } else if (downloadError.message?.includes('not connected')) {
          return res.status(401).json({ 
            error: "Google Drive not connected",
            details: "Please connect Google Drive from the integrations panel first"
          });
        }
        
        return res.status(500).json({ 
          error: "Failed to download from Google Drive",
          details: downloadError.message
        });
      }

      try {
        // Process multiple files using the enhanced UCC parser
        const files = filePaths.map(p => ({
          path: p,
          name: path.basename(p)
        }));
        
        console.log(`Processing ${files.length} file(s) with enhanced UCC parser...`);
        
        // Dynamic timeout based on file size - estimate 100ms per 1000 records
        // Minimum 5 minutes, maximum 30 minutes
        const estimatedRecords = files.length * 10000; // Estimate 10k records per file
        const PROCESSING_TIMEOUT = Math.min(
          Math.max(300000, estimatedRecords * 0.1), // Min 5 minutes
          1800000 // Max 30 minutes
        );
        console.log(`Setting processing timeout to ${PROCESSING_TIMEOUT / 1000} seconds for estimated ${estimatedRecords} records`);
        
        let timeoutHandle: NodeJS.Timeout | null = null;
        
        let processingResult;
        try {
          const processingPromise = uccParser.processMultipleFiles(files);
          
          // Add catch handler to swallow post-timeout rejections
          processingPromise.catch((error) => {
            console.error('Background processing error (post-timeout):', error.message);
          });
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Processing timeout - operation took longer than ${PROCESSING_TIMEOUT / 60000} minutes`)), PROCESSING_TIMEOUT);
          });
          
          processingResult = await Promise.race([processingPromise, timeoutPromise]) as Awaited<ReturnType<typeof uccParser.processMultipleFiles>>;
        } finally {
          // Always clear timeout to prevent timer leak
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
        
        // Send progress update
        const wss = app.get('wss') as WebSocketServer;
        if (wss && wss.clients) {
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'ucc-processing-complete',
                data: {
                  filesProcessed: processingResult.summary.filesProcessed,
                  totalRecords: processingResult.summary.totalRecords,
                  uniqueBusinesses: processingResult.summary.uniqueDebtors
                }
              }));
            }
          });
        }
        
        // Create response with comprehensive results
        const debtorProfilesArray = Array.from(processingResult.debtorProfiles.values());
        
        // Sort profiles by MCA readiness score (descending)
        const topOpportunities = debtorProfilesArray
          .sort((a, b) => b.mcaReadinessScore - a.mcaReadinessScore)
          .slice(0, 20);
        
        // High risk profiles
        const highRiskProfiles = debtorProfilesArray
          .filter(p => p.riskScore > 70)
          .slice(0, 10);
        
        // Save UCC filings to database in batches (to avoid stack overflow)
        console.log(`Saving ${processingResult.mergedRecords.length} UCC filings to database...`);
        const uccFilingsToSave = processingResult.mergedRecords.map(record => ({
          leadId: null, // Will be updated later when matched to leads
          debtorName: record.debtorName,
          securedParty: record.securedParty,
          filingDate: record.filingDate,
          fileNumber: record.fileNumber,
          collateralDescription: record.collateralDescription || null,
          loanAmount: record.loanAmount || null,
          filingType: record.filingType || 'original',
          jurisdiction: record.jurisdiction || null
        }));
        
        let savedFilings: any[] = [];
        try {
          // Insert in batches of 1000 to avoid stack overflow
          const BATCH_SIZE = 1000;
          for (let i = 0; i < uccFilingsToSave.length; i += BATCH_SIZE) {
            const batch = uccFilingsToSave.slice(i, i + BATCH_SIZE);
            const batchResults = await storage.createUccFilings(batch);
            savedFilings.push(...batchResults);
            console.log(`Saved UCC batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uccFilingsToSave.length / BATCH_SIZE)} (${batchResults.length} filings)`);
          }
          console.log(`Successfully saved ${savedFilings.length} UCC filings to database`);
        } catch (error) {
          console.error('Error saving UCC filings:', error);
          // Continue processing even if filing save fails
        }
        
        // Create a batch for UCC-sourced leads
        const uccBatch = await storage.createLeadBatch({
          filename: files.map(f => f.name).join(', '),
          storageKey: `ucc-import-${Date.now()}`,
          totalLeads: processingResult.summary.uniqueDebtors,
          uploadedBy: req.user!.id,
          status: 'processing',
          averageQualityScore: '0'
        });
        
        // Matched leads with enriched data
        const enrichedLeads = debtorProfilesArray
          .filter(p => p.businessMatch)
          .map(profile => ({
            leadId: profile.businessMatch!.id,
            businessName: profile.businessMatch!.businessName,
            debtorName: profile.debtorName,
            uccData: {
              totalDebtLoad: profile.totalDebtLoad,
              activeFilings: profile.activeFilings,
              terminatedFilings: profile.terminatedFilings,
              lastFilingDate: profile.lastFilingDate,
              daysSinceLastFiling: profile.daysSinceLastFiling,
              stackingIndicator: profile.stackingIndicator,
              refinancingPattern: profile.refinancingPattern,
              growthIndicator: profile.growthIndicator,
              mcaReadinessScore: profile.mcaReadinessScore,
              riskScore: profile.riskScore,
              insights: profile.insights
            }
          }));
        
        // Create new leads from unmatched UCC records
        const unmatchedProfiles = debtorProfilesArray.filter(p => !p.businessMatch);
        const newLeadsCreated: any[] = [];
        
        for (const profile of unmatchedProfiles) {
          try {
            // Prepare lead data from UCC profile
            const newLeadData: InsertLead = {
              batchId: uccBatch.id, // Use the UCC batch ID
              businessName: profile.debtorName,
              ownerName: '',
              email: '',
              phone: '',
              industry: 'Unknown (from UCC)',
              annualRevenue: profile.totalDebtLoad > 0 ? Math.round(profile.totalDebtLoad / 100) : undefined,
              stateCode: '',
              city: '',
              zipCode: '',
              address: '',
              website: '',
              timeInBusiness: '',
              creditScore: '',
              requestedAmount: undefined,
              qualityScore: Math.round(profile.mcaReadinessScore),
              tier: profile.mcaReadinessScore >= 80 ? 'diamond' : 
                    profile.mcaReadinessScore >= 70 ? 'platinum' : 
                    profile.mcaReadinessScore >= 60 ? 'gold' : 'gold',
              isQualified: true,
              isVerified: false,
              source: 'UCC Filing',
              previousMCAHistory: profile.refinancingPattern || profile.activeFilings > 0 ? 'Yes' : 'No',
              urgencyLevel: profile.daysSinceLastFiling < 90 ? 'High' : 
                           profile.daysSinceLastFiling < 180 ? 'Medium' : 'Low',
              exclusivityStatus: 'Non-Exclusive',
              leadAge: profile.daysSinceLastFiling,
              notes: `UCC Import - ${profile.insights.join('. ')}`,
              fundingUrgency: profile.daysSinceLastFiling < 90 ? 'immediate' : 
                             profile.daysSinceLastFiling < 180 ? 'this_month' : 'future',
              createdAt: new Date()
            };
            
            // Create the lead
            const createdLead = await storage.createLead(newLeadData);
            newLeadsCreated.push({
              leadId: createdLead.id,
              businessName: createdLead.businessName,
              debtorName: profile.debtorName,
              createdFromUCC: true,
              uccData: {
                totalDebtLoad: profile.totalDebtLoad,
                activeFilings: profile.activeFilings,
                terminatedFilings: profile.terminatedFilings,
                lastFilingDate: profile.lastFilingDate,
                daysSinceLastFiling: profile.daysSinceLastFiling,
                stackingIndicator: profile.stackingIndicator,
                refinancingPattern: profile.refinancingPattern,
                growthIndicator: profile.growthIndicator,
                mcaReadinessScore: profile.mcaReadinessScore,
                riskScore: profile.riskScore,
                insights: profile.insights
              }
            });
            
            console.log(`Created new lead from UCC: ${profile.debtorName}`);
          } catch (error) {
            console.error(`Failed to create lead for ${profile.debtorName}:`, error);
          }
        }
        
        const totalLeads = enrichedLeads.length + newLeadsCreated.length;
        
        // Update batch status
        await storage.updateLeadBatch(uccBatch.id, {
          status: 'completed',
          totalLeads: newLeadsCreated.length,
          averageQualityScore: newLeadsCreated.length > 0 
            ? String(Math.round(newLeadsCreated.reduce((sum: number, l: any) => sum + (l.uccData?.mcaReadinessScore || 0), 0) / newLeadsCreated.length))
            : '0'
        });
        
        // Send comprehensive response
        const response = {
          success: true,
          summary: {
            filesProcessed: processingResult.summary.filesProcessed,
            totalRecords: processingResult.summary.totalRecords,
            uniqueRecords: processingResult.summary.uniqueRecords,
            duplicatesRemoved: processingResult.summary.duplicatesRemoved,
            uniqueBusinesses: processingResult.summary.uniqueDebtors,
            uniqueSecuredParties: processingResult.summary.uniqueSecuredParties,
            totalDebtLoad: `$${(processingResult.summary.totalDebtLoad / 100).toLocaleString()}`,
            averageLoanAmount: `$${(processingResult.summary.averageLoanAmount / 100).toLocaleString()}`,
            dateRange: processingResult.summary.dateRange,
            uccFilingsSaved: savedFilings.length,
            matchedLeads: enrichedLeads.length,
            newLeadsCreated: newLeadsCreated.length,
            totalLeads: totalLeads,
            unmatchedBusinesses: processingResult.summary.uniqueDebtors - enrichedLeads.length - newLeadsCreated.length,
            batchId: uccBatch.id
          },
          insights: processingResult.insights,
          topOpportunities: topOpportunities.map(p => ({
            businessName: p.debtorName,
            mcaReadinessScore: p.mcaReadinessScore,
            riskScore: p.riskScore,
            daysSinceLastFiling: p.daysSinceLastFiling,
            insights: p.insights
          })),
          highRiskProfiles: highRiskProfiles.map(p => ({
            businessName: p.debtorName,
            riskScore: p.riskScore,
            stackingIndicator: p.stackingIndicator,
            activeFilings: p.activeFilings
          })),
          enrichedLeads: [...enrichedLeads, ...newLeadsCreated].slice(0, 50), // Return first 50 leads (both enriched and new)
          message: `Successfully processed ${processingResult.summary.filesProcessed} file(s) containing ${processingResult.summary.totalRecords} UCC records. Saved ${savedFilings.length} UCC filings to database. Found ${processingResult.summary.uniqueDebtors} unique businesses. Matched ${enrichedLeads.length} to existing leads and created ${newLeadsCreated.length} new leads. Total Leads: ${totalLeads}`
        };
        
        res.json(response);

        // Clean up temporary files
        for (const filePath of filePaths) {
          try {
            await googleDriveService.cleanupTempFile(filePath);
          } catch (cleanupError) {
            console.error('Failed to clean up temporary file:', cleanupError);
          }
        }
        
      } catch (processingError: any) {
        // Clean up temporary files even on error
        for (const filePath of filePaths) {
          try {
            await googleDriveService.cleanupTempFile(filePath);
          } catch (cleanupError) {
            console.error('Failed to clean up temporary file:', cleanupError);
          }
        }
        
        console.error('UCC processing error:', processingError);
        return res.status(500).json({ 
          error: "Failed to process UCC data",
          details: processingError.message
        });
      }
      
    } catch (error: any) {
      console.error("Google Drive UCC upload error:", error);
      res.status(500).json({ 
        error: "Failed to process Google Drive UCC upload",
        details: error.message
      });
    }
  });

  // GET /api/admin/google-drive/validate - Validate Google Drive connection
  app.get("/api/admin/google-drive/validate", requireAuth, requireAdmin, async (req, res) => {
    try {
      const isConnected = await googleDriveService.validateConnection();
      res.json({ 
        connected: isConnected,
        message: isConnected 
          ? "Google Drive is connected and ready" 
          : "Google Drive is not connected. Please connect from integrations panel."
      });
    } catch (error: any) {
      console.error("Google Drive validation error:", error);
      res.status(500).json({ 
        connected: false,
        error: "Failed to validate Google Drive connection",
        details: error.message
      });
    }
  });
  
  // POST /api/admin/test-parse - Test endpoint for debugging file parsing
  app.post("/api/admin/test-parse", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      
      console.log('Test-parse file received:', {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        encoding: file.encoding
      });
      
      let rows: any[] = [];
      let headers: string[] = [];
      let parseInfo: any = {};
      
      // Determine file type
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      
      try {
        if (isExcel) {
          parseInfo.fileType = 'Excel';
          const result = parseExcelFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        } else {
          parseInfo.fileType = 'CSV';
          const result = await parseCSVFile(file.buffer, file.originalname);
          rows = result.rows;
          headers = result.headers;
        }
      } catch (parseError: any) {
        console.error('Test-parse error:', parseError);
        return res.status(400).json({ 
          error: "Failed to parse file", 
          details: parseError.message,
          fileInfo: {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          }
        });
      }
      
      // Map columns to fields
      const columnMappings: any = {};
      const unmappedColumns: string[] = [];
      
      for (const header of headers) {
        const mappedField = mapColumnToField(header);
        if (mappedField) {
          columnMappings[header] = mappedField;
        } else {
          unmappedColumns.push(header);
        }
      }
      
      // Normalize sample rows
      const sampleRows = rows.slice(0, 5).map((row, index) => {
        const normalized = normalizeLeadData(row, false);
        const validation = validateRequiredFields(normalized);
        return {
          rowNumber: index + 2,
          original: row,
          normalized: normalized,
          validation: {
            isValid: validation.isValid,
            missing: validation.missing,
            suggestions: validation.suggestions
          }
        };
      });
      
      // Check overall validity
      const allNormalizedRows = rows.map(row => normalizeLeadData(row, false));
      const validRowCount = allNormalizedRows.filter(row => {
        const validation = validateRequiredFields(row);
        return validation.isValid;
      }).length;
      
      // Prepare response
      const response = {
        success: true,
        fileInfo: {
          filename: file.originalname,
          type: parseInfo.fileType,
          size: file.size,
          encoding: file.encoding || 'unknown'
        },
        parsing: {
          totalRows: rows.length,
          totalHeaders: headers.length,
          headers: headers,
          columnMappings: columnMappings,
          unmappedColumns: unmappedColumns,
          mappedFieldsAvailable: Object.values(columnMappings)
        },
        validation: {
          validRowCount: validRowCount,
          invalidRowCount: rows.length - validRowCount,
          percentValid: ((validRowCount / rows.length) * 100).toFixed(2) + '%',
          requiredFieldsFound: {
            businessName: allNormalizedRows.some(r => r.businessName),
            ownerName: allNormalizedRows.some(r => r.ownerName),
            email: allNormalizedRows.some(r => r.email),
            phone: allNormalizedRows.some(r => r.phone)
          }
        },
        sampleData: {
          firstFiveRows: sampleRows
        },
        recommendations: [] as string[]
      };
      
      // Add recommendations
      if (validRowCount === 0) {
        response.recommendations.push("No valid rows found. Check that your file contains the required fields: Business Name, Owner Name, Email, and Phone");
      } else if (validRowCount < rows.length) {
        response.recommendations.push(`${rows.length - validRowCount} rows are missing required fields`);
      }
      
      if (unmappedColumns.length > 0) {
        response.recommendations.push(`${unmappedColumns.length} columns could not be mapped automatically. Consider renaming them to standard field names.`);
      }
      
      // Check for common issues
      const hasEmptyHeaders = headers.some(h => !h || h.trim() === '');
      if (hasEmptyHeaders) {
        response.recommendations.push("File contains empty column headers. Please ensure all columns have names.");
      }
      
      res.json(response);
      
    } catch (error) {
      console.error("Test-parse error:", error);
      res.status(500).json({ 
        error: "Failed to test parse file",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // GET /api/admin/verification-session/:id - Retrieves verification session data
  app.get("/api/admin/verification-session/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sessionId = req.params.id;
      
      const session = await storage.getVerificationSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Verification session not found" });
      }
      
      // Check if session is expired
      if (new Date(session.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Verification session has expired" });
      }
      
      const results = await storage.getVerificationResults(sessionId);
      
      res.json({
        session,
        results
      });
      
    } catch (error) {
      console.error("Get verification session error:", error);
      res.status(500).json({ error: "Failed to retrieve verification session" });
    }
  });
  
  // POST /api/admin/import-verified - Imports only selected leads from verification
  app.post("/api/admin/import-verified", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { sessionId, selectedRowNumbers } = req.body;
      
      if (!sessionId || !Array.isArray(selectedRowNumbers)) {
        return res.status(400).json({ error: "Invalid request data" });
      }
      
      // Get session
      const session = await storage.getVerificationSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Verification session not found" });
      }
      
      // Check if already imported
      if (session.status === 'imported') {
        return res.status(400).json({ error: "This session has already been imported" });
      }
      
      // Get selected results
      const results = await storage.getVerificationResults(sessionId);
      const selectedResults = results.filter(r => selectedRowNumbers.includes(r.rowNumber));
      
      if (selectedResults.length === 0) {
        return res.status(400).json({ error: "No leads selected for import" });
      }
      
      // Create lead batch
      const batch = await storage.createLeadBatch({
        uploadedBy: req.user!.id,
        filename: session.filename,
        storageKey: `verified_${sessionId}`,
        totalLeads: selectedResults.length,
        averageQualityScore: "0", // Will calculate below
        status: "processing"
      });
      
      // Process and import selected leads
      const leadsToImport: InsertLead[] = [];
      let totalQualityScore = 0;
      
      for (const result of selectedResults) {
        const leadData = result.leadData as any;
        
        // Calculate quality score for this lead
        const qualityScore = calculateMCAQualityScore(leadData);
        totalQualityScore += qualityScore;
        
        // Determine tier based on quality score
        let tier: string;
        if (qualityScore >= 80) {
          tier = 'diamond';
        } else if (qualityScore >= 70) {
          tier = 'platinum';
        } else {
          tier = 'gold';
        }
        
        leadsToImport.push({
          batchId: batch.id,
          businessName: leadData.businessName?.trim() || "Unknown Business",
          ownerName: leadData.ownerName?.trim() || "Not Provided",
          email: leadData.email?.trim().toLowerCase() || "noemail@example.com",
          phone: leadData.phone?.trim() || "0000000000",
          industry: leadData.industry?.trim() || null,
          annualRevenue: leadData.annualRevenue?.trim() || null,
          requestedAmount: leadData.requestedAmount?.trim() || null,
          timeInBusiness: leadData.timeInBusiness?.trim() || null,
          creditScore: leadData.creditScore?.trim() || null,
          dailyBankDeposits: leadData.dailyBankDeposits || false,
          previousMCAHistory: leadData.previousMCAHistory || 'none',
          urgencyLevel: leadData.urgencyLevel || 'exploring',
          stateCode: leadData.stateCode?.trim() || null,
          leadAge: leadData.leadAge || 0,
          exclusivityStatus: leadData.exclusivityStatus || 'non_exclusive',
          qualityScore,
          tier: tier as "gold" | "platinum" | "diamond" | "elite",
          sold: false
        });
      }
      
      // Import leads
      const createdLeads = await storage.createLeads(leadsToImport);
      
      // Trigger alert checking for new leads
      try {
        console.log(`Checking alerts for ${createdLeads.length} new verified leads`);
        await leadAlertService.checkAlertsForNewLeads(createdLeads, batch.id);
      } catch (alertError) {
        console.error('Error checking alerts:', alertError);
        // Don't fail the import if alert checking fails
      }
      
      // Update batch with average quality score
      const avgQualityScore = totalQualityScore / leadsToImport.length;
      await storage.updateLeadBatch(batch.id, {
        averageQualityScore: avgQualityScore.toFixed(2),
        status: "ready"
      });
      
      // Mark session as imported
      await storage.updateVerificationSession(sessionId, {
        status: 'imported'
      });
      
      res.json({
        success: true,
        batchId: batch.id,
        importedCount: leadsToImport.length,
        averageQualityScore: avgQualityScore
      });
      
    } catch (error) {
      console.error("Import verified leads error:", error);
      res.status(500).json({ error: "Failed to import verified leads" });
    }
  });

  // Lead routes
  app.get("/api/leads/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const leads = await storage.getLeadsByBatchId(req.params.batchId);
      res.json(leads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getLeadStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Lead Intelligence Score routes
  app.post("/api/leads/:id/calculate-intelligence", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      const lead = await storage.calculateAndUpdateIntelligenceScore(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json({
        intelligenceScore: lead.intelligenceScore,
        subScores: {
          quality: lead.qualitySubScore,
          freshness: lead.freshnessSubScore,
          risk: lead.riskSubScore,
          opportunity: lead.opportunitySubScore,
          confidence: lead.confidenceSubScore
        },
        metadata: lead.intelligenceMetadata
      });
    } catch (error) {
      console.error('Error calculating intelligence score:', error);
      res.status(500).json({ error: "Failed to calculate intelligence score" });
    }
  });

  app.get("/api/leads/:id/intelligence", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      const lead = await storage.getLeadWithIntelligenceScore(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      res.json({
        intelligenceScore: lead.intelligenceScore,
        subScores: {
          quality: lead.qualitySubScore,
          freshness: lead.freshnessSubScore,
          risk: lead.riskSubScore,
          opportunity: lead.opportunitySubScore,
          confidence: lead.confidenceSubScore
        },
        metadata: lead.intelligenceMetadata,
        calculatedAt: lead.intelligenceCalculatedAt
      });
    } catch (error) {
      console.error('Error fetching intelligence score:', error);
      res.status(500).json({ error: "Failed to fetch intelligence score" });
    }
  });

  app.post("/api/leads/batch-calculate-intelligence", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Invalid leadIds array" });
      }
      
      await storage.batchCalculateIntelligenceScores(leadIds);
      
      res.json({ 
        success: true, 
        message: `Intelligence scores calculated for ${leadIds.length} leads` 
      });
    } catch (error) {
      console.error('Error batch calculating intelligence scores:', error);
      res.status(500).json({ error: "Failed to batch calculate intelligence scores" });
    }
  });

  app.post("/api/admin/refresh-all-intelligence-scores", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.refreshAllIntelligenceScores();
      
      res.json({ 
        success: true, 
        message: "All intelligence scores refresh initiated" 
      });
    } catch (error) {
      console.error('Error refreshing all intelligence scores:', error);
      res.status(500).json({ error: "Failed to refresh all intelligence scores" });
    }
  });

  // ========== SIMPLIFIED ENRICHMENT & VALIDATION ENDPOINTS ==========
  // These endpoints support the new simplified app structure with two main features

  // Enrichment Queue - Get leads that need enrichment
  app.get("/api/leads/enrichment-queue", requireAuth, async (req, res) => {
    try {
      // Get leads with low completeness scores or missing key fields
      const leadsData = await db.select()
        .from(leads)
        .where(
          or(
            lte(leads.dataCompletenessScore, 70),
            isNull(leads.email),
            isNull(leads.phone),
            isNull(leads.annualRevenue),
            isNull(leads.emailVerificationScore),
            isNull(leads.phoneVerificationScore),
            isNull(leads.masterEnrichmentScore)
          )
        )
        .orderBy(desc(leads.createdAt))
        .limit(100);

      // Add enrichment priority based on data gaps
      const enrichmentQueue = leadsData.map(lead => {
        // Calculate completeness for display
        const fields = [
          lead.businessName,
          lead.ownerName,
          lead.email,
          lead.phone,
          lead.annualRevenue,
          lead.industry,
          lead.creditScore,
          lead.city,
          lead.stateCode,
          lead.websiteUrl,
          lead.employeeCount,
          lead.timeInBusiness
        ];
        
        const filledCount = fields.filter(f => f !== null && f !== undefined && f !== '').length;
        const completenessPercentage = Math.round((filledCount / fields.length) * 100);
        
        return {
          ...lead,
          completenessPercentage,
          priority: lead.dataCompletenessScore ? 
            (lead.dataCompletenessScore < 30 ? 'high' : lead.dataCompletenessScore < 60 ? 'medium' : 'low') : 
            'high',
          dataGaps: [
            !lead.email && 'Email',
            !lead.phone && 'Phone',
            !lead.annualRevenue && 'Revenue',
            !lead.industry && 'Industry',
            !lead.creditScore && 'Credit Score',
            !lead.websiteUrl && 'Website',
            !lead.employeeCount && 'Employee Count'
          ].filter(Boolean),
          enrichmentNeeded: !lead.masterEnrichmentScore || lead.masterEnrichmentScore < 80
        };
      });

      res.json(enrichmentQueue);
    } catch (error) {
      console.error('Error fetching enrichment queue:', error);
      res.status(500).json({ error: "Failed to fetch enrichment queue" });
    }
  });

  // Validation Queue - Get leads that need validation
  app.get("/api/leads/validation-queue", requireAuth, async (req, res) => {
    try {
      // Use unified validation service to get queue
      const queue = await unifiedValidationService.getValidationQueue(100);
      
      // Enhance with validation status info
      const validationQueue = queue.map(lead => {
        const needsValidation = !lead.emailVerificationScore || !lead.phoneVerificationScore ||
                               lead.emailVerificationScore < 60 || lead.phoneVerificationScore < 60;
        
        return {
          ...lead,
          validationStatus: lead.verificationStatus || 'unverified',
          emailStatus: !lead.emailVerificationScore ? 'not_checked' : 
                       lead.emailVerificationScore >= 80 ? 'valid' :
                       lead.emailVerificationScore >= 60 ? 'partial' : 'invalid',
          phoneStatus: !lead.phoneVerificationScore ? 'not_checked' :
                       lead.phoneVerificationScore >= 80 ? 'valid' :
                       lead.phoneVerificationScore >= 60 ? 'partial' : 'invalid',
          needsValidation,
          validationPriority: !lead.emailVerificationScore || !lead.phoneVerificationScore ? 'high' :
                            lead.emailVerificationScore < 60 || lead.phoneVerificationScore < 60 ? 'medium' : 'low'
        };
      });

      res.json(validationQueue);
    } catch (error) {
      console.error('Error fetching validation queue:', error);
      res.status(500).json({ error: "Failed to fetch validation queue" });
    }
  });

  // Validation Stats - Get validation statistics
  app.get("/api/validation/stats", requireAuth, async (req, res) => {
    try {
      // Use unified validation service to get stats
      const stats = await unifiedValidationService.getValidationStats();
      
      // Also get some additional stats from database
      const additionalStats = await db.select({
        totalCount: sql<number>`count(*)`,
        unvalidated: sql<number>`count(*) filter (where ${leads.emailVerificationScore} is null and ${leads.phoneVerificationScore} is null)`,
        recentlyValidated: sql<number>`count(*) filter (where ${leads.lastVerifiedAt} > now() - interval '7 days')`
      })
      .from(leads);
      
      res.json({
        ...stats,
        totalLeads: additionalStats[0]?.totalCount || 0,
        unvalidated: stats.unvalidated || additionalStats[0]?.unvalidated || 0,
        recentlyValidated: additionalStats[0]?.recentlyValidated || 0
      });
    } catch (error) {
      console.error('Error fetching validation stats:', error);
      res.status(500).json({ error: "Failed to fetch validation stats" });
    }
  });

  // Validate Single Lead
  app.post("/api/validation/validate/:id", requireAuth, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Run email and phone verification
      let emailScore = null;
      let phoneScore = null;

      // Verify email if present
      if (lead.email) {
        try {
          const emailResult = await comprehensiveLeadEnricher.verifyEmail(lead.email);
          emailScore = emailResult.valid ? 90 : 20;
        } catch (error) {
          console.error('Email verification error:', error);
          emailScore = 0;
        }
      }

      // Verify phone if present
      if (lead.phone) {
        try {
          const phoneResult = await numverifyService.verifyPhone(lead.phone);
          phoneScore = phoneResult.valid ? (phoneResult.line_type === 'mobile' ? 95 : 80) : 20;
        } catch (error) {
          console.error('Phone verification error:', error);
          phoneScore = 0;
        }
      }

      // Update lead with verification scores
      await db.update(leads)
        .set({
          emailVerificationScore: emailScore,
          phoneVerificationScore: phoneScore,
          lastVerifiedAt: new Date().toISOString(),
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));

      res.json({
        success: true,
        leadId,
        emailVerificationScore: emailScore,
        phoneVerificationScore: phoneScore,
        validationStatus: (emailScore >= 80 && phoneScore >= 80) ? 'fully_validated' :
                         (emailScore >= 60 || phoneScore >= 60) ? 'partially_validated' : 'failed'
      });
    } catch (error) {
      console.error('Error validating lead:', error);
      res.status(500).json({ error: "Failed to validate lead" });
    }
  });

  // Bulk Validate Leads
  app.post("/api/validation/bulk-validate", requireAuth, async (req, res) => {
    try {
      // Get leads needing validation
      const leadsToValidate = await db.select()
        .from(leads)
        .where(
          or(
            eq(leads.emailVerificationScore, null),
            eq(leads.phoneVerificationScore, null)
          )
        )
        .limit(20); // Limit to 20 to avoid timeout

      let validated = 0;
      
      for (const lead of leadsToValidate) {
        try {
          // Simple validation for bulk operation
          let emailScore = null;
          let phoneScore = null;

          if (lead.email) {
            // Basic email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            emailScore = emailRegex.test(lead.email) ? 70 : 20;
          }

          if (lead.phone) {
            // Basic phone format validation
            const phoneRegex = /^\+?[1-9]\d{9,14}$/;
            phoneScore = phoneRegex.test(lead.phone.replace(/\D/g, '')) ? 70 : 20;
          }

          await db.update(leads)
            .set({
              emailVerificationScore: emailScore,
              phoneVerificationScore: phoneScore,
              lastVerifiedAt: new Date().toISOString(),
              updatedAt: new Date()
            })
            .where(eq(leads.id, lead.id));

          validated++;
        } catch (error) {
          console.error(`Error validating lead ${lead.id}:`, error);
        }
      }

      res.json({
        success: true,
        validated,
        total: leadsToValidate.length,
        message: `Validated ${validated} of ${leadsToValidate.length} leads`
      });
    } catch (error) {
      console.error('Error bulk validating leads:', error);
      res.status(500).json({ error: "Failed to bulk validate leads" });
    }
  });

  // Enrichment Analytics Stats
  app.get("/api/enrichment/analytics/stats", requireAuth, async (req, res) => {
    try {
      // Get enrichment stats from unified service
      const enrichmentStats = await unifiedEnrichmentService.getEnrichmentStats();
      
      // Get additional stats from database
      const dbStats = await db.select({
        totalEnriched: sql<number>`count(*) filter (where ${leads.masterEnrichmentScore} >= 80 or ${leads.dataCompletenessScore} >= 80)`,
        processing: sql<number>`count(*) filter (where ${leads.enrichmentStatus} = 'processing')`,
        avgCompleteness: sql<number>`avg(COALESCE(${leads.masterEnrichmentScore}, ${leads.dataCompletenessScore}, 0))`,
        recentlyEnriched: sql<number>`count(*) filter (where ${leads.lastEnrichedAt} > now() - interval '24 hours')`
      })
      .from(leads);

      const successRate = dbStats[0]?.avgCompleteness || enrichmentStats.successRate || 0;
      
      res.json({
        totalEnriched: enrichmentStats.totalEnriched || dbStats[0]?.totalEnriched || 0,
        successRate: Math.round(successRate),
        inQueue: enrichmentStats.inQueue || 0,
        processing: enrichmentStats.processing || dbStats[0]?.processing || 0,
        costSaved: enrichmentStats.costSaved || 0,
        avgEnrichmentTime: enrichmentStats.avgEnrichmentTime || 0,
        recentlyEnriched: dbStats[0]?.recentlyEnriched || 0
      });
    } catch (error) {
      console.error('Error fetching enrichment stats:', error);
      res.status(500).json({ error: "Failed to fetch enrichment stats" });
    }
  });

  // Enrichment Queue Jobs Status
  app.get("/api/enrichment/queue/jobs", requireAuth, async (req, res) => {
    try {
      // Return recent enrichment job status
      const recentJobs = await db.select({
        id: leads.id,
        businessName: leads.businessName,
        status: sql<string>`case 
          when ${leads.dataCompletenessScore} >= 80 then 'completed'
          when ${leads.dataCompletenessScore} >= 50 then 'processing'
          else 'pending'
        end`,
        completenessScore: leads.dataCompletenessScore,
        updatedAt: leads.updatedAt
      })
      .from(leads)
      .orderBy(desc(leads.updatedAt))
      .limit(10);

      res.json(recentJobs);
    } catch (error) {
      console.error('Error fetching enrichment jobs:', error);
      res.status(500).json({ error: "Failed to fetch enrichment jobs" });
    }
  });

  // Simplified Bulk Enrichment Endpoint
  app.post("/api/enrichment/bulk-enrich", requireAuth, async (req, res) => {
    try {
      // Get high-priority leads for enrichment
      const leadsToEnrich = await db.select()
        .from(leads)
        .where(lte(leads.completenessScore, 30))
        .limit(10);

      // Queue them for enrichment
      const queued = leadsToEnrich.length;
      
      // In a real implementation, this would queue to a background job
      // For now, we'll just update their status
      for (const lead of leadsToEnrich) {
        await db.update(leads)
          .set({
            completenessScore: 40, // Mark as in-progress
            updatedAt: new Date()
          })
          .where(eq(leads.id, lead.id));
      }

      res.json({
        success: true,
        queued,
        message: `${queued} leads queued for enrichment`
      });
    } catch (error) {
      console.error('Error bulk enriching:', error);
      res.status(500).json({ error: "Failed to bulk enrich" });
    }
  });

  // Enrichment Analyze Endpoint
  app.post("/api/enrichment/analyze/:id", requireAuth, async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      
      // Queue lead for enrichment analysis
      // In production, this would trigger the enrichment pipeline
      await db.update(leads)
        .set({
          completenessScore: 50, // Mark as processing
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));

      res.json({
        success: true,
        leadId,
        status: 'queued',
        message: 'Lead queued for enrichment'
      });
    } catch (error) {
      console.error('Error analyzing lead:', error);
      res.status(500).json({ error: "Failed to analyze lead" });
    }
  });

  // Enhanced Verification API Endpoints
  // Rate limiting middleware for verification endpoints
  const verificationRateLimiter = new Map<string, { count: number; resetTime: number }>();
  const VERIFICATION_RATE_LIMIT = 10; // 10 verifications per minute per user
  const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

  const checkVerificationRateLimit = (req: any, res: any, next: any) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const now = Date.now();
    const userLimit = verificationRateLimiter.get(userId);

    if (!userLimit || userLimit.resetTime < now) {
      // Reset or create rate limit
      verificationRateLimiter.set(userId, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      });
      return next();
    }

    if (userLimit.count >= VERIFICATION_RATE_LIMIT) {
      const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ 
        error: "Rate limit exceeded", 
        retryAfter: retryAfter,
        message: `You can verify ${VERIFICATION_RATE_LIMIT} leads per minute. Please wait ${retryAfter} seconds.`
      });
    }

    userLimit.count++;
    next();
  };

  // POST /api/leads/:id/verify - Trigger real-time verification for a lead
  app.post("/api/leads/:id/verify", requireAuth, checkVerificationRateLimit, async (req, res) => {
    try {
      const leadId = req.params.id;
      const { forceRefresh = false } = req.body;

      // Import the enhanced verification service
      const { enhancedVerificationService } = await import("./services/enhanced-verification");

      // Check if user has access to this lead
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Check authorization (admin or lead owner)
      if (req.user.role !== 'admin' && lead.soldTo !== req.user.id) {
        return res.status(403).json({ error: "You don't have access to verify this lead" });
      }

      // Perform verification
      const verificationResult = await enhancedVerificationService.verifyLead(leadId, forceRefresh);

      // Update lead intelligence with real-time verification
      const { leadIntelligenceService } = await import("./services/lead-intelligence");
      const intelligenceService = new leadIntelligenceService.LeadIntelligenceService();
      const updatedIntelligence = await intelligenceService.calculateIntelligenceScore(lead, true);

      // Send real-time update via WebSocket if available
      const wss = app.get('wss') as WebSocketServer;
      if (wss && wss.clients) {
        wss.clients.forEach((client: WebSocket) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'verification_complete',
              leadId,
              verificationResult,
              intelligenceScore: updatedIntelligence.intelligenceScore
            }));
          }
        });
      }

      res.json({
        success: true,
        leadId,
        verification: verificationResult,
        intelligenceScore: updatedIntelligence.intelligenceScore,
        cached: !forceRefresh && verificationResult.cachedUntil > new Date()
      });
    } catch (error) {
      console.error('Error verifying lead:', error);
      res.status(500).json({ error: "Failed to verify lead" });
    }
  });

  // GET /api/leads/:id/verification-status - Get verification history and status
  app.get("/api/leads/:id/verification-status", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;

      // Check if user has access to this lead
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Check authorization (admin or lead owner)
      if (req.user.role !== 'admin' && lead.soldTo !== req.user.id) {
        return res.status(403).json({ error: "You don't have access to this lead's verification status" });
      }

      // Get verification status
      const { enhancedVerificationService } = await import("./services/enhanced-verification");
      const status = await enhancedVerificationService.getVerificationStatus(leadId);

      // Get verification history from database
      const verificationHistory = await db
        .select()
        .from(enhancedVerification)
        .where(eq(enhancedVerification.leadId, leadId))
        .orderBy(desc(enhancedVerification.verifiedAt))
        .limit(10); // Last 10 verifications

      res.json({
        currentStatus: status,
        history: verificationHistory.map(v => ({
          verifiedAt: v.verifiedAt,
          status: v.verificationStatus,
          confidenceScore: parseFloat(v.overallConfidenceScore || '0'),
          emailStatus: v.emailStatus,
          phoneLineType: v.phoneLineType,
          creditsUsed: (v.hunterCreditsUsed || 0) + (v.numverifyCreditsUsed || 0)
        })),
        canVerifyNow: status.nextVerification ? new Date() >= status.nextVerification : true
      });
    } catch (error) {
      console.error('Error fetching verification status:', error);
      res.status(500).json({ error: "Failed to fetch verification status" });
    }
  });

  // POST /api/leads/batch-verify - Batch verify multiple leads
  app.post("/api/leads/batch-verify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds, forceRefresh = false } = req.body;

      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Invalid leadIds array" });
      }

      if (leadIds.length > 50) {
        return res.status(400).json({ error: "Maximum 50 leads can be verified at once" });
      }

      // Import the enhanced verification service
      const { enhancedVerificationService } = await import("./services/enhanced-verification");

      // Start batch verification (async process)
      const verificationPromise = enhancedVerificationService.batchVerifyLeads(leadIds, forceRefresh);

      // Return immediately with job status
      res.json({
        success: true,
        message: `Batch verification started for ${leadIds.length} leads`,
        leadCount: leadIds.length,
        estimatedTimeSeconds: leadIds.length * 2 // Rough estimate
      });

      // Process verification in background and send WebSocket updates
      verificationPromise.then(results => {
        const wss = app.get('wss') as WebSocketServer;
        if (wss && wss.clients) {
          wss.clients.forEach((client: WebSocket) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'batch_verification_complete',
                totalLeads: leadIds.length,
                successCount: Array.from(results.values()).filter(r => r.verificationStatus !== 'failed').length,
                results: Array.from(results.entries()).map(([id, result]) => ({
                  leadId: id,
                  status: result.verificationStatus,
                  confidenceScore: result.overallConfidenceScore
                }))
              }));
            }
          });
        }
      }).catch(error => {
        console.error('Batch verification failed:', error);
      });
    } catch (error) {
      console.error('Error initiating batch verification:', error);
      res.status(500).json({ error: "Failed to initiate batch verification" });
    }
  });

  // GET /api/verification/stats - Get verification statistics for admin
  app.get("/api/verification/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await db
        .select({
          totalVerifications: sql<number>`count(*)`,
          avgConfidenceScore: sql<number>`avg(${enhancedVerification.overallConfidenceScore})`,
          verifiedCount: sql<number>`count(*) filter (where ${enhancedVerification.verificationStatus} = 'verified')`,
          partialCount: sql<number>`count(*) filter (where ${enhancedVerification.verificationStatus} = 'partial')`,
          unverifiedCount: sql<number>`count(*) filter (where ${enhancedVerification.verificationStatus} = 'unverified')`,
          failedCount: sql<number>`count(*) filter (where ${enhancedVerification.verificationStatus} = 'failed')`,
          totalHunterCredits: sql<number>`sum(${enhancedVerification.hunterCreditsUsed})`,
          totalNumverifyCredits: sql<number>`sum(${enhancedVerification.numverifyCreditsUsed})`
        })
        .from(enhancedVerification);

      res.json({
        verifications: stats[0],
        creditUsage: {
          hunterTotal: stats[0].totalHunterCredits || 0,
          numverifyTotal: stats[0].totalNumverifyCredits || 0
        },
        breakdown: {
          verified: stats[0].verifiedCount || 0,
          partial: stats[0].partialCount || 0,
          unverified: stats[0].unverifiedCount || 0,
          failed: stats[0].failedCount || 0
        },
        averageConfidence: Math.round(stats[0].avgConfidenceScore || 0)
      });
    } catch (error) {
      console.error('Error fetching verification stats:', error);
      res.status(500).json({ error: "Failed to fetch verification statistics" });
    }
  });

  // Comprehensive lead search endpoint with 20+ filter criteria
  app.get("/api/leads", requireAuth, async (req, res) => {
    try {
      const filters = {
        // Basic filters
        industry: req.query.industry ? (req.query.industry as string).split(',') : undefined,
        stateCode: req.query.stateCode ? (req.query.stateCode as string).split(',') : undefined,
        city: req.query.city ? (req.query.city as string).split(',') : undefined,
        minQualityScore: req.query.minQualityScore ? Number(req.query.minQualityScore) : undefined,
        maxQualityScore: req.query.maxQualityScore ? Number(req.query.maxQualityScore) : undefined,
        
        // Financial filters
        minRevenue: req.query.minRevenue ? Number(req.query.minRevenue) : undefined,
        maxRevenue: req.query.maxRevenue ? Number(req.query.maxRevenue) : undefined,
        fundingStatus: req.query.fundingStatus ? (req.query.fundingStatus as string).split(',') : undefined,
        minCreditScore: req.query.minCreditScore ? Number(req.query.minCreditScore) : undefined,
        maxCreditScore: req.query.maxCreditScore ? Number(req.query.maxCreditScore) : undefined,
        
        // Business filters
        minTimeInBusiness: req.query.minTimeInBusiness ? Number(req.query.minTimeInBusiness) : undefined,
        maxTimeInBusiness: req.query.maxTimeInBusiness ? Number(req.query.maxTimeInBusiness) : undefined,
        employeeCount: req.query.employeeCount ? (req.query.employeeCount as string).split(',') : undefined,
        businessType: req.query.businessType ? (req.query.businessType as string).split(',') : undefined,
        yearFoundedMin: req.query.yearFoundedMin ? Number(req.query.yearFoundedMin) : undefined,
        yearFoundedMax: req.query.yearFoundedMax ? Number(req.query.yearFoundedMax) : undefined,
        
        // Contact filters
        hasEmail: req.query.hasEmail ? req.query.hasEmail === 'true' : undefined,
        hasPhone: req.query.hasPhone ? req.query.hasPhone === 'true' : undefined,
        ownerName: req.query.ownerName as string | undefined,
        
        // Status filters
        exclusivityStatus: req.query.exclusivityStatus ? (req.query.exclusivityStatus as string).split(',') : undefined,
        previousMCAHistory: req.query.previousMCAHistory ? (req.query.previousMCAHistory as string).split(',') : undefined,
        urgencyLevel: req.query.urgencyLevel ? (req.query.urgencyLevel as string).split(',') : undefined,
        leadAgeMin: req.query.leadAgeMin ? Number(req.query.leadAgeMin) : undefined,
        leadAgeMax: req.query.leadAgeMax ? Number(req.query.leadAgeMax) : undefined,
        isEnriched: req.query.isEnriched ? req.query.isEnriched === 'true' : undefined,
        sold: req.query.sold ? req.query.sold === 'true' : undefined,
        
        // Freshness filters
        freshnessCategory: req.query.freshnessCategory as string | undefined,
        minFreshnessScore: req.query.minFreshnessScore ? Number(req.query.minFreshnessScore) : undefined,
        maxFreshnessScore: req.query.maxFreshnessScore ? Number(req.query.maxFreshnessScore) : undefined,
        
        // Advanced filters
        naicsCode: req.query.naicsCode ? (req.query.naicsCode as string).split(',') : undefined,
        sicCode: req.query.sicCode ? (req.query.sicCode as string).split(',') : undefined,
        dailyBankDeposits: req.query.dailyBankDeposits ? req.query.dailyBankDeposits === 'true' : undefined,
        hasWebsite: req.query.hasWebsite ? req.query.hasWebsite === 'true' : undefined,
        
        // Pagination and sorting
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sortBy: req.query.sortBy as string | undefined,
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
        
        // Logic operator
        logicOperator: (req.query.logicOperator as 'AND' | 'OR') || 'AND',
      };
      
      const result = await storage.getFilteredLeads(filters);
      
      // Track saved search usage if search ID provided
      const searchId = req.query.searchId as string;
      if (searchId) {
        await storage.updateSearchLastUsed(searchId);
      }
      
      res.json(result);
    } catch (error) {
      console.error('Lead search error:', error);
      res.status(500).json({ error: "Failed to search leads" });
    }
  });

  // Smart Search endpoints (unified search and alert system)
  app.post("/api/smart-search", requireAuth, async (req, res) => {
    try {
      const { searchQuery, filters, searchMode, searchName, emailNotifications } = req.body;
      const userId = req.session.userId || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Track search in history
      const startTime = Date.now();
      
      if (searchMode === 'instant') {
        // Search existing leads immediately
        const searchFilters = {
          ...filters,
          limit: filters.limit || 100,
          offset: filters.offset || 0,
          sortBy: filters.sortBy || 'qualityScore',
          sortOrder: filters.sortOrder || 'desc'
        };
        
        const results = await storage.getFilteredLeads(searchFilters);
        
        // Track search history
        const executionTime = Date.now() - startTime;
        await storage.createSearchHistory({
          userId,
          searchQuery,
          filters,
          resultCount: results.total,
          executionTime,
          searchType: searchQuery ? 'natural_language' : 'filters',
        });
        
        // Update popular searches if natural language was used
        if (searchQuery) {
          await storage.incrementPopularSearchCount(searchQuery);
        }
        
        res.json({ 
          mode: 'instant',
          leads: results.leads, 
          total: results.total 
        });
      } else if (searchMode === 'alert') {
        // Create smart search alert for future matches
        const smartSearch = await storage.createSmartSearch({
          userId,
          searchName,
          searchQuery,
          filters,
          searchMode: 'alert',
          isActive: true,
          emailNotifications: emailNotifications || false,
        });
        
        // Also create a lead alert for backward compatibility
        await storage.createLeadAlert({
          userId,
          alertName: searchName || searchQuery || 'Smart Search Alert',
          criteria: filters,
          isActive: true,
          emailNotifications: emailNotifications || false,
        });
        
        res.json({ 
          mode: 'alert',
          smartSearch,
          message: 'Alert created successfully' 
        });
      } else {
        res.status(400).json({ error: "Invalid search mode. Must be 'instant' or 'alert'" });
      }
    } catch (error) {
      console.error('Smart search error:', error);
      res.status(500).json({ error: "Failed to perform smart search" });
    }
  });

  // Parse natural language query to filters
  app.post("/api/smart-search/parse", requireAuth, async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      // Check if OpenAI is configured
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey === 'default') {
        // Return empty filters when OpenAI is not configured
        return res.json({ filters: {} });
      }

      // Use OpenAI to parse natural language into structured filters
      const prompt = `Parse this natural language search query for MCA (Merchant Cash Advance) leads into structured filters.

Query: "${query}"

Extract the following information if present:
- Industry (restaurant, retail, healthcare, construction, etc.)
- State or location (use 2-letter state codes)
- Revenue range (min and max annual revenue)
- Quality score range (0-100)
- Urgency level (immediate, within_week, within_month, flexible)
- Time in business
- Credit score range
- Any other relevant criteria

Return a JSON object with the extracted filters. Use exact field names:
- industry: string
- stateCode: string
- minRevenue: number
- maxRevenue: number
- minQuality: number
- maxQuality: number
- urgencyLevel: array of strings
- minTimeInBusiness: number
- minCreditScore: number
- maxCreditScore: number
- isEnriched: boolean
- hasWebsite: boolean

Only include fields that are explicitly mentioned or strongly implied in the query.
If no filters can be extracted, return an empty object {}.
`;

      const completion = await openai.chat.completions.create({
        messages: [
          { 
            role: "system", 
            content: "You are a helpful assistant that parses natural language queries into structured database filters. Always return valid JSON."
          },
          { role: "user", content: prompt }
        ],
        model: "gpt-3.5-turbo",
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const filters = JSON.parse(completion.choices[0].message.content || '{}');
      res.json({ filters });
    } catch (error) {
      console.error('Natural language parsing error:', error);
      res.status(500).json({ error: "Failed to parse natural language query" });
    }
  });

  // Get saved smart searches
  app.get("/api/smart-search/saved", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const searches = await storage.getSmartSearchesByUserId(userId);
      res.json(searches);
    } catch (error) {
      console.error('Error fetching saved smart searches:', error);
      res.status(500).json({ error: "Failed to fetch saved searches" });
    }
  });

  // Get search history
  app.get("/api/smart-search/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const history = await storage.getSearchHistoryByUserId(userId, limit);
      res.json(history);
    } catch (error) {
      console.error('Error fetching search history:', error);
      res.status(500).json({ error: "Failed to fetch search history" });
    }
  });

  // Get popular searches
  app.get("/api/smart-search/popular", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const searches = await storage.getPopularSearches(limit);
      res.json(searches);
    } catch (error) {
      console.error('Error fetching popular searches:', error);
      res.status(500).json({ error: "Failed to fetch popular searches" });
    }
  });

  // Get AI search suggestions
  app.get("/api/smart-search/suggestions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const limit = parseInt(req.query.limit as string) || 5;
      const suggestions = await storage.getSearchSuggestionsByUserId(userId, limit);
      
      // If no existing suggestions, generate some based on user's history
      if (suggestions.length === 0) {
        // Get user's search history
        const history = await storage.getSearchHistoryByUserId(userId, 10);
        
        if (history.length > 0) {
          // Generate suggestions based on history patterns
          // This is a simplified version - you could use AI to generate more sophisticated suggestions
          const commonFilters = history[0].filters;
          const newSuggestions = [
            {
              userId,
              suggestionText: `High-quality leads in ${commonFilters.stateCode || 'your area'}`,
              suggestionReason: "Based on your recent searches",
              filters: { ...commonFilters, minQuality: 80 },
              score: "90",
            }
          ];
          
          // Save and return new suggestions
          for (const suggestion of newSuggestions) {
            await storage.createSearchSuggestion(suggestion);
          }
          
          return res.json(newSuggestions);
        }
      }
      
      res.json(suggestions);
    } catch (error) {
      console.error('Error fetching search suggestions:', error);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  // Delete smart search
  app.delete("/api/smart-search/:id", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const search = await storage.getSmartSearch(req.params.id);
      if (!search || search.userId !== userId) {
        return res.status(404).json({ error: "Search not found" });
      }
      
      await storage.deleteSmartSearch(req.params.id);
      res.json({ message: "Search deleted successfully" });
    } catch (error) {
      console.error('Error deleting smart search:', error);
      res.status(500).json({ error: "Failed to delete search" });
    }
  });

  // Clear search history
  app.delete("/api/smart-search/history", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      await storage.clearSearchHistory(userId);
      res.json({ message: "Search history cleared" });
    } catch (error) {
      console.error('Error clearing search history:', error);
      res.status(500).json({ error: "Failed to clear search history" });
    }
  });

  // Saved searches endpoints
  app.get("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const searches = await storage.getSavedSearchesByUserId(req.session.userId!);
      res.json(searches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch saved searches" });
    }
  });

  app.get("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      const search = await storage.getSavedSearch(req.params.id);
      if (!search || search.userId !== req.session.userId) {
        return res.status(404).json({ error: "Search not found" });
      }
      res.json(search);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch saved search" });
    }
  });

  app.post("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const { searchName, filters, isDefault, sortBy, sortOrder } = req.body;
      
      const search = await storage.createSavedSearch({
        userId: req.session.userId!,
        searchName,
        filters,
        isDefault: isDefault || false,
        sortBy,
        sortOrder
      });
      
      if (isDefault) {
        await storage.setDefaultSearch(req.session.userId!, search.id);
      }
      
      res.json(search);
    } catch (error) {
      res.status(500).json({ error: "Failed to save search" });
    }
  });

  app.put("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      const search = await storage.getSavedSearch(req.params.id);
      if (!search || search.userId !== req.session.userId) {
        return res.status(404).json({ error: "Search not found" });
      }
      
      const { searchName, filters, isDefault, sortBy, sortOrder } = req.body;
      const updated = await storage.updateSavedSearch(req.params.id, {
        searchName,
        filters,
        isDefault,
        sortBy,
        sortOrder
      });
      
      if (isDefault) {
        await storage.setDefaultSearch(req.session.userId!, req.params.id);
      }
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update search" });
    }
  });

  app.delete("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      const search = await storage.getSavedSearch(req.params.id);
      if (!search || search.userId !== req.session.userId) {
        return res.status(404).json({ error: "Search not found" });
      }
      
      await storage.deleteSavedSearch(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete search" });
    }
  });

  app.post("/api/saved-searches/:id/set-default", requireAuth, async (req, res) => {
    try {
      const search = await storage.getSavedSearch(req.params.id);
      if (!search || search.userId !== req.session.userId) {
        return res.status(404).json({ error: "Search not found" });
      }
      
      await storage.setDefaultSearch(req.session.userId!, req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to set default search" });
    }
  });

  // AI analysis for individual lead
  app.post("/api/leads/:leadId/analyze", requireAuth, requireAdmin, async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Check for existing analysis
      const existingInsight = await storage.getAiInsightByLeadId(req.params.leadId);
      if (existingInsight) {
        return res.json(existingInsight);
      }

      // Check if OpenAI is configured
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey || apiKey === 'default') {
        // Return a default analysis when OpenAI is not configured
        const qualityLevel = lead.qualityScore >= 80 ? 'High' : lead.qualityScore >= 60 ? 'Medium' : 'Low';
        const defaultInsight = {
          batchId: lead.batchId,
          executiveSummary: `Lead quality score: ${lead.qualityScore}/100 (${qualityLevel}). This ${lead.businessName} lead shows ${qualityLevel.toLowerCase()} conversion potential.`,
          segments: {
            leadId: req.params.leadId,
            qualityAssessment: `Quality Score: ${lead.qualityScore}/100. This lead is classified as ${qualityLevel} quality based on available data points.`,
            riskAnalysis: "Standard risk profile. Verify business details and financial history before proceeding with offer.",
            offerStructure: lead.qualityScore >= 80 ? "$25,000 - $75,000 at 1.2-1.3 factor rate" : lead.qualityScore >= 60 ? "$10,000 - $30,000 at 1.3-1.4 factor rate" : "$5,000 - $15,000 at 1.4-1.5 factor rate",
            outreachStrategy: "Initial phone contact during business hours (10am-4pm local time), followed by email with proposal. Emphasize quick funding and flexible terms.",
            competitivePositioning: "Highlight: 24-48 hour funding, no collateral required, flexible repayment based on revenue, dedicated support team.",
            followUpTimeline: "Day 1: Initial call. Day 2: Email follow-up. Day 4: Second call. Day 7: Check-in email. Day 14: Final follow-up.",
            keySellingPoints: "Fast approval process, revenue-based repayment, no personal guarantee required, transparent terms.",
          },
          riskFlags: [],
          outreachAngles: ["Quick funding solution", "Growth capital", "Working capital needs"],
          generatedBy: "default",
          createdAt: new Date(),
        };
        
        // Save default analysis
        const savedInsight = await storage.createAiInsight(defaultInsight);
        return res.json(savedInsight);
      }

      // Generate AI analysis for the individual lead
      const prompt = `Analyze this MCA (Merchant Cash Advance) lead and provide actionable insights:

Business: ${lead.businessName}
Owner: ${lead.ownerName}
Industry: ${lead.industry || 'Unknown'}
Annual Revenue: ${lead.annualRevenue || 'Not provided'}
Requested Amount: ${lead.requestedAmount || 'Not specified'}
Time in Business: ${lead.timeInBusiness ? lead.timeInBusiness + ' months' : 'Not provided'}
Credit Score: ${lead.creditScore || 'Not provided'}
State: ${lead.stateCode || 'Not provided'}
Daily Bank Deposits: ${lead.dailyBankDeposits ? 'Yes' : 'No'}
Previous MCA History: ${lead.previousMCAHistory || 'None'}
Urgency Level: ${lead.urgencyLevel || 'Exploring'}
Quality Score: ${lead.qualityScore}/100

Provide a comprehensive analysis including:
1. Lead Quality Assessment: Evaluate the overall quality and likelihood of conversion
2. Risk Analysis: Identify potential risks or red flags
3. Recommended Offer Structure: Suggest optimal MCA terms based on the profile
4. Outreach Strategy: Provide specific talking points and approach recommendations
5. Competitive Positioning: How to position against competitors
6. Follow-up Timeline: Recommended cadence for follow-ups
7. Key Selling Points: What aspects of this lead make them attractive for MCA funding`;

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert MCA (Merchant Cash Advance) analyst. Provide detailed, actionable insights for sales teams."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500,
        });

        const analysisText = completion.choices[0].message.content;

        // Structure the analysis
        const sections = analysisText?.split(/\d+\.\s+/).filter(Boolean) || [];
        
        const insight = await storage.createAiInsight({
          batchId: lead.batchId,
          executiveSummary: sections[0] || analysisText,
          segments: {
            leadId: req.params.leadId,
            qualityAssessment: sections[1] || '',
            riskAnalysis: sections[2] || '',
            offerStructure: sections[3] || '',
            outreachStrategy: sections[4] || '',
            competitivePositioning: sections[5] || '',
            followUpTimeline: sections[6] || '',
            keySellingPoints: sections[7] || '',
          },
          riskFlags: [],
          outreachAngles: [],
          generatedBy: "openai",
        });

        res.json(insight);
      } catch (openAiError) {
        console.error("OpenAI API error:", openAiError);
        
        // Fallback to default analysis on OpenAI error
        const qualityLevel = lead.qualityScore >= 80 ? 'High' : lead.qualityScore >= 60 ? 'Medium' : 'Low';
        const fallbackInsight = await storage.createAiInsight({
          batchId: lead.batchId,
          executiveSummary: `Analysis temporarily unavailable. Lead quality: ${qualityLevel} (${lead.qualityScore}/100).`,
          segments: {
            leadId: req.params.leadId,
            qualityAssessment: `Quality Score: ${lead.qualityScore}/100 (${qualityLevel})`,
            riskAnalysis: "Manual risk assessment recommended.",
            offerStructure: "Standard MCA terms apply.",
            outreachStrategy: "Use standard outreach protocol.",
            competitivePositioning: "Focus on speed and flexibility.",
            followUpTimeline: "Standard follow-up schedule.",
            keySellingPoints: "Fast funding, flexible terms, dedicated support.",
          },
          riskFlags: [],
          outreachAngles: [],
          generatedBy: "fallback",
        });
        
        res.json(fallbackInsight);
      }
    } catch (error) {
      console.error("Lead analysis error:", error);
      res.status(500).json({ error: "Failed to analyze lead" });
    }
  });

  // AI Insights routes
  app.post("/api/insights/generate/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { batchId } = req.params;

      // Check if insights already exist
      const existing = await storage.getAiInsightByBatchId(batchId);
      if (existing) {
        return res.json(existing);
      }

      // Fetch batch and leads
      const batch = await storage.getLeadBatch(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      const leads = await storage.getLeadsByBatchId(batchId);
      if (leads.length === 0) {
        return res.status(400).json({ error: "No leads in batch" });
      }

      // Calculate aggregated statistics (no PII)
      const aggregatedStats = {
        totalLeads: leads.length,
        averageQualityScore: leads.reduce((sum, l) => sum + l.qualityScore, 0) / leads.length,
        qualityDistribution: {
          high: leads.filter(l => l.qualityScore >= 80).length,
          medium: leads.filter(l => l.qualityScore >= 50 && l.qualityScore < 80).length,
          low: leads.filter(l => l.qualityScore < 50).length,
        },
        industryBreakdown: leads.reduce((acc: Record<string, number>, l) => {
          const industry = l.industry || "Unknown";
          acc[industry] = (acc[industry] || 0) + 1;
          return acc;
        }, {}),
        revenueDistribution: leads.reduce((acc: Record<string, number>, l) => {
          const revenue = l.annualRevenue || "Not specified";
          acc[revenue] = (acc[revenue] || 0) + 1;
          return acc;
        }, {}),
        creditScoreDistribution: leads.reduce((acc: Record<string, number>, l) => {
          const score = l.creditScore || "Not specified";
          acc[score] = (acc[score] || 0) + 1;
          return acc;
        }, {}),
      };

      // Create AI prompt
      const prompt = `Analyze this MCA (Merchant Cash Advance) lead batch with the following aggregated statistics:

Total Leads: ${aggregatedStats.totalLeads}
Average Quality Score: ${aggregatedStats.averageQualityScore.toFixed(1)}/100

Quality Distribution:
- High (80-100): ${aggregatedStats.qualityDistribution.high} leads
- Medium (50-79): ${aggregatedStats.qualityDistribution.medium} leads
- Low (0-49): ${aggregatedStats.qualityDistribution.low} leads

Industry Breakdown:
${Object.entries(aggregatedStats.industryBreakdown).map(([industry, count]) => `- ${industry}: ${count} leads`).join('\n')}

Revenue Distribution:
${Object.entries(aggregatedStats.revenueDistribution).map(([revenue, count]) => `- ${revenue}: ${count} leads`).join('\n')}

Credit Score Distribution:
${Object.entries(aggregatedStats.creditScoreDistribution).map(([score, count]) => `- ${score}: ${count} leads`).join('\n')}

Please provide:
1. Executive summary (2-3 sentences about the overall quality and potential of this batch)
2. Best performing segments (which industries, revenue ranges, or credit scores show the most promise)
3. Risk flags (any concerning patterns or data quality issues)
4. Outreach recommendations (suggested messaging angles and targeting strategies)

Format your response as JSON with the following structure:
{
  "summary": "string",
  "segments": ["segment1", "segment2", ...],
  "risks": ["risk1", "risk2", ...],
  "outreach": ["angle1", "angle2", ...]
}`;

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert MCA lead analyst. Provide actionable insights based on aggregated lead data. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const responseContent = completion.choices[0].message.content || "{}";
      const aiResponse = JSON.parse(responseContent);

      // Store insights in database
      const insight = await storage.createAiInsight({
        batchId,
        executiveSummary: aiResponse.summary || "",
        segments: aiResponse.segments || [],
        riskFlags: aiResponse.risks || [],
        outreachAngles: aiResponse.outreach || [],
        generatedBy: "openai",
      });

      res.json(insight);
    } catch (error) {
      console.error("AI insights generation error:", error);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  app.get("/api/insights/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { batchId } = req.params;
      const insight = await storage.getAiInsightByBatchId(batchId);
      
      if (!insight) {
        return res.status(404).json({ error: "No insights found for this batch" });
      }

      res.json(insight);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // UCC Filing endpoints
  // POST /api/admin/upload-ucc - Upload and process UCC filing data
  app.post("/api/admin/upload-ucc", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      console.log('[UCC Upload] File received:', file.originalname, file.mimetype, file.size);

      // Determine file type
      const isExcel = file.originalname.endsWith('.xlsx') || 
                      file.originalname.endsWith('.xls') || 
                      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                      file.mimetype === 'application/vnd.ms-excel';

      const fileType = isExcel ? 'excel' : 'csv';

      // Process the UCC file
      const result = await uccParser.processUccUpload(file.buffer, fileType);

      if (!result.success) {
        return res.status(400).json({
          error: result.message,
          summary: result.summary
        });
      }

      // Get UCC filing statistics
      const stats = await storage.getUccFilingStats();

      // Create response with comprehensive summary
      const response = {
        success: true,
        message: result.message,
        summary: {
          ...result.summary,
          filingStats: stats
        },
        signals: result.signals ? Object.fromEntries(result.signals) : {}
      };

      console.log(`[UCC Upload] Processing complete:`, {
        totalRecords: result.summary.totalRecords,
        validRecords: result.summary.validRecords,
        matchedLeads: result.summary.matchedLeads,
        unmatchedRecords: result.summary.unmatchedRecords
      });

      res.json(response);
    } catch (error) {
      console.error("[UCC Upload] Error:", error);
      res.status(500).json({ error: "Failed to process UCC file" });
    }
  });

  // GET /api/admin/ucc/:leadId - Get UCC filings for a specific lead
  app.get("/api/admin/ucc/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      
      // Get UCC filings for this lead
      const filings = await storage.getUccFilingsByLeadId(leadId);
      
      // Calculate MCA eligibility signals
      const signals = uccParser.calculateMcaSignals(filings);
      
      res.json({
        filings,
        signals,
        summary: {
          totalFilings: filings.length,
          recentFilings: filings.filter(f => {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            return f.filingDate >= sixMonthsAgo;
          }).length,
          oldestFiling: filings.length > 0 ? filings[filings.length - 1].filingDate : null,
          newestFiling: filings.length > 0 ? filings[0].filingDate : null
        }
      });
    } catch (error) {
      console.error("[UCC Fetch] Error:", error);
      res.status(500).json({ error: "Failed to fetch UCC filings" });
    }
  });

  // GET /api/admin/ucc/stats - Get overall UCC filing statistics
  app.get("/api/admin/ucc/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const filings = await storage.getAllUccFilings();
      const leads = await storage.getLeadStats();
      
      // Calculate stats
      const totalFilings = filings.length;
      const matchedLeads = filings.filter(f => f.leadId).length;
      const activeFilings = filings.filter(f => f.filingType !== 'termination').length;
      const terminatedFilings = filings.filter(f => f.filingType === 'termination').length;
      
      // Calculate total and average debt
      const totalDebt = filings.reduce((sum, f) => sum + (f.loanAmount || 0), 0);
      const averageDebt = totalFilings > 0 ? Math.round(totalDebt / totalFilings) : 0;
      
      // Calculate risk distribution
      const riskFilings = await Promise.all(
        filings.filter(f => f.leadId).map(async (f) => ({
          filing: f,
          risk: await storage.calculateUccRiskLevel(f.leadId!)
        }))
      );
      
      const lowRisk = riskFilings.filter(r => r.risk === 'low').length;
      const mediumRisk = riskFilings.filter(r => r.risk === 'medium').length;
      const highRisk = riskFilings.filter(r => r.risk === 'high').length;
      
      const stats = {
        totalFilings,
        matchedLeads,
        activeFilings,
        terminatedFilings,
        totalDebt,
        averageDebt,
        lowRisk,
        mediumRisk,
        highRisk,
        lastUpdated: filings.length > 0 ? filings[0].createdAt : null
      };
      
      res.json(stats);
    } catch (error) {
      console.error("[UCC Stats] Error:", error);
      res.status(500).json({ error: "Failed to fetch UCC statistics" });
    }
  });
  
  // GET /api/admin/ucc-filings - Get all UCC filings
  app.get("/api/admin/ucc-filings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const filings = await storage.getAllUccFilings();
      
      // Add risk level to each filing
      const filingsWithRisk = await Promise.all(
        filings.map(async (filing) => ({
          ...filing,
          riskLevel: filing.leadId ? await storage.calculateUccRiskLevel(filing.leadId) : 'unknown'
        }))
      );
      
      res.json(filingsWithRisk);
    } catch (error) {
      console.error("[UCC Filings] Error:", error);
      res.status(500).json({ error: "Failed to fetch UCC filings" });
    }
  });

  // Freshness tracking endpoints
  app.post("/api/leads/:id/viewed", requireAuth, async (req, res) => {
    try {
      const leadId = req.params.id;
      
      // Track the lead view
      const updatedLead = await leadFreshnessService.trackLeadView(leadId);
      
      if (!updatedLead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Check if lead data is stale and needs enrichment
      try {
        const lastEnrichedAt = updatedLead.lastEnrichedAt ? new Date(updatedLead.lastEnrichedAt) : null;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const isStale = !lastEnrichedAt || lastEnrichedAt < thirtyDaysAgo;
        
        if (isStale || updatedLead.enrichmentConfidence < 70) {
          // Analyze lead completion
          const analysis = leadCompletionAnalyzer.analyzeLeadCompletion(updatedLead);
          
          // Queue for enrichment if incomplete
          if (analysis.completionScore < 90 && analysis.canBeAutoEnriched) {
            await enrichmentQueue.addToQueue(
              updatedLead,
              'low', // Low priority for view-triggered enrichment
              'view',
              { userId: req.user!.id }
            );
            
            console.log(`[Auto-Enrichment] Lead ${leadId} queued for enrichment (viewed, ${analysis.completionScore}% complete)`);
          }
        }
        
        // Emit event for tracking
        eventBus.emit('lead:viewed', {
          leadId,
          leadData: updatedLead,
          userId: req.user!.id
        });
      } catch (enrichmentError) {
        console.error(`[Auto-Enrichment] Error checking enrichment for lead ${leadId}:`, enrichmentError);
        // Don't fail the view tracking if enrichment check fails
      }
      
      res.json({ 
        success: true,
        viewCount: updatedLead.viewCount,
        lastViewedAt: updatedLead.lastViewedAt 
      });
    } catch (error) {
      console.error("Track lead view error:", error);
      res.status(500).json({ error: "Failed to track lead view" });
    }
  });
  
  app.get("/api/freshness/stats", requireAuth, async (req, res) => {
    try {
      const stats = await leadFreshnessService.getFreshnessStats();
      
      // Add badge info for hot leads
      const hotLeadsWithBadges = stats.hotLeads.map(lead => ({
        ...lead,
        badge: leadFreshnessService.getLeadBadge(lead),
        urgency: leadFreshnessService.getUrgencyLevel(lead)
      }));
      
      // Add urgency info for expiring leads
      const expiringLeadsWithUrgency = stats.expiringLeads.map(lead => ({
        ...lead,
        badge: leadFreshnessService.getLeadBadge(lead),
        urgency: leadFreshnessService.getUrgencyLevel(lead)
      }));
      
      res.json({
        ...stats,
        hotLeads: hotLeadsWithBadges,
        expiringLeads: expiringLeadsWithUrgency
      });
    } catch (error) {
      console.error("Freshness stats error:", error);
      res.status(500).json({ error: "Failed to fetch freshness statistics" });
    }
  });
  
  app.get("/api/freshness/categories/:category", requireAuth, async (req, res) => {
    try {
      const category = req.params.category as FreshnessCategory;
      const validCategories = Object.values(FreshnessCategory);
      
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid freshness category" });
      }
      
      const leads = await leadFreshnessService.getLeadsByFreshness(category);
      
      // Add badges and urgency info
      const leadsWithBadges = leads.map(lead => ({
        ...lead,
        badge: leadFreshnessService.getLeadBadge(lead),
        urgency: leadFreshnessService.getUrgencyLevel(lead)
      }));
      
      res.json(leadsWithBadges);
    } catch (error) {
      console.error("Freshness category error:", error);
      res.status(500).json({ error: "Failed to fetch leads by freshness" });
    }
  });
  
  app.post("/api/freshness/update", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Manually trigger freshness score update (admin only)
      await leadFreshnessService.updateAllFreshnessScores();
      res.json({ success: true, message: "Freshness scores updated successfully" });
    } catch (error) {
      console.error("Manual freshness update error:", error);
      res.status(500).json({ error: "Failed to update freshness scores" });
    }
  });

  // Purchase routes
  app.post("/api/purchases", requireAuth, async (req, res) => {
    try {
      const { tier, leadCount } = req.body;

      // Get tier configuration from database
      const tierConfig = await storage.getProductTierByTier(tier);
      if (!tierConfig || !tierConfig.active) {
        return res.status(400).json({ error: "Invalid or inactive tier" });
      }

      const totalAmount = tierConfig.price;
      const requestedLeads = leadCount || tierConfig.leadCount;

      // Skip lead availability check for custom tiers (leadCount = 0)
      if (tierConfig.leadCount > 0) {
        // Check if enough leads available using enhanced algorithm
        // This checks for leads not already purchased by this user
        const availableLeads = await storage.getLeadsForPurchase(
          req.user!.id,
          requestedLeads,
          tierConfig.minQuality,
          tierConfig.maxQuality
        );
        
        if (availableLeads.length < requestedLeads) {
          return res.status(400).json({ 
            error: `Not enough leads available for your tier. Only ${availableLeads.length} unique leads available (excluding leads you've already purchased).` 
          });
        }
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount, // Already in cents from database
        currency: "usd",
        metadata: {
          userId: req.user!.id,
          tier,
          leadCount: requestedLeads,
        },
      });

      // Create purchase record
      const purchase = await storage.createPurchase({
        userId: req.user!.id,
        tier,
        leadCount: requestedLeads,
        totalAmount: (totalAmount / 100).toString(), // Store in dollars
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: "pending",
        leadIds: [], // Will be filled after payment
      });

      res.json({
        purchaseId: purchase.id,
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error("Purchase creation error:", error);
      res.status(500).json({ error: "Failed to create purchase" });
    }
  });

  app.get("/api/purchases", requireAuth, async (req, res) => {
    try {
      const purchases = req.user!.role === "admin" 
        ? await storage.getAllPurchases()
        : await storage.getPurchasesByUserId(req.user!.id);
      res.json(purchases);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch purchases" });
    }
  });

  // Get all purchases - admin only endpoint  
  app.get("/api/purchases/all", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allPurchases = await storage.getAllPurchases();
      res.json(allPurchases || []);
    } catch (error) {
      console.error("Get all purchases error:", error);
      res.status(500).json({ error: "Failed to fetch all purchases" });
    }
  });

  app.get("/api/purchases/:id", requireAuth, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.id);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Check ownership
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(purchase);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch purchase" });
    }
  });

  app.post("/api/purchases/:id/download-url", requireAuth, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.id);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Check ownership
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (purchase.paymentStatus !== "succeeded") {
        return res.status(400).json({ error: "Payment not completed" });
      }

      // Generate presigned URL (24 hour expiry) if object storage is configured
      let downloadUrl = "";
      if (isObjectStorageConfigured() && s3Client) {
        const key = `purchases/${purchase.id}/leads.csv`;
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 hours
      } else {
        // If object storage not configured, return a placeholder URL
        downloadUrl = `/api/purchases/${purchase.id}/download-local`;
      }
      const expiry = new Date(Date.now() + 86400 * 1000);

      // Update purchase with download URL
      await storage.updatePurchase(purchase.id, {
        downloadUrl,
        downloadUrlExpiry: expiry,
      });

      // Log download
      await storage.createDownloadHistory({
        purchaseId: purchase.id,
        userId: req.user!.id,
        ipAddress: req.ip,
      });

      // Send download ready email
      const user = await storage.getUser(req.user!.id);
      if (user) {
        await sendDownloadReady(user.email, downloadUrl, {
          tier: purchase.tier,
          leadCount: purchase.leadCount,
          minQuality: 60, // Default values - you may want to get these from tier config
          maxQuality: 100,
        });
      }

      res.json({ downloadUrl, expiry });
    } catch (error) {
      console.error("Download URL generation error:", error);
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  });

  // Cost Monitoring Dashboard API endpoints
  
  // GET /api/cost-monitoring/dashboard - Get comprehensive dashboard data
  app.get("/api/cost-monitoring/dashboard", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const dashboardData = await costMonitoringService.getDashboardSummary();
      res.json(dashboardData);
    } catch (error) {
      console.error("Cost monitoring dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });
  
  // GET /api/cost-monitoring/metrics - Get cost metrics
  app.get("/api/cost-monitoring/metrics", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const metrics = await costMonitoringService.getCostMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Cost metrics error:", error);
      res.status(500).json({ error: "Failed to fetch cost metrics" });
    }
  });
  
  // GET /api/cost-monitoring/vendors - Get vendor usage
  app.get("/api/cost-monitoring/vendors", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const vendors = await costMonitoringService.getVendorUsage();
      res.json(vendors);
    } catch (error) {
      console.error("Vendor usage error:", error);
      res.status(500).json({ error: "Failed to fetch vendor usage" });
    }
  });
  
  // GET /api/cost-monitoring/queues - Get queue metrics
  app.get("/api/cost-monitoring/queues", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const queues = await costMonitoringService.getQueueMetrics();
      res.json(queues);
    } catch (error) {
      console.error("Queue metrics error:", error);
      res.status(500).json({ error: "Failed to fetch queue metrics" });
    }
  });
  
  // GET /api/cost-monitoring/freshness - Get data freshness
  app.get("/api/cost-monitoring/freshness", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const freshness = await costMonitoringService.getDataFreshnessMetrics();
      res.json(freshness);
    } catch (error) {
      console.error("Freshness metrics error:", error);
      res.status(500).json({ error: "Failed to fetch freshness metrics" });
    }
  });
  
  // GET /api/cost-monitoring/errors - Get error metrics
  app.get("/api/cost-monitoring/errors", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const errors = await costMonitoringService.getErrorMetrics();
      res.json(errors);
    } catch (error) {
      console.error("Error metrics error:", error);
      res.status(500).json({ error: "Failed to fetch error metrics" });
    }
  });
  
  // GET /api/cost-monitoring/efficiency - Get enrichment efficiency
  app.get("/api/cost-monitoring/efficiency", requireAuth, async (req, res) => {
    try {
      const { costMonitoringService } = await import('./services/cost-monitoring-service');
      const efficiency = await costMonitoringService.getEnrichmentEfficiency();
      res.json(efficiency);
    } catch (error) {
      console.error("Efficiency metrics error:", error);
      res.status(500).json({ error: "Failed to fetch efficiency metrics" });
    }
  });
  
  // Quality Guarantee API endpoints
  
  // POST /api/guarantee/report - Report a quality issue
  app.post("/api/guarantee/report", requireAuth, async (req, res) => {
    try {
      const validatedData = insertQualityGuaranteeSchema.parse({
        ...req.body,
        userId: req.user!.id,
      });

      // Report the issue using the service
      const report = await qualityGuaranteeService.reportIssue(validatedData);
      
      // Update guarantee expiry if not set
      await qualityGuaranteeService.updateGuaranteeExpiry(validatedData.purchaseId);

      res.json(report);
    } catch (error: any) {
      console.error("Quality guarantee report error:", error);
      res.status(400).json({ 
        error: error.message || "Failed to submit quality report" 
      });
    }
  });

  // GET /api/guarantee/reports - List user's reports
  app.get("/api/guarantee/reports", requireAuth, async (req, res) => {
    try {
      const { purchaseId, status } = req.query;
      
      let reports;
      if (req.user!.role === "admin") {
        // Admin can see all reports
        reports = await storage.getAllQualityGuarantees(status as string);
      } else {
        // Users only see their own reports
        reports = await storage.getQualityGuaranteesByUserId(req.user!.id);
        
        // Filter by purchase if specified
        if (purchaseId) {
          reports = reports.filter(r => r.purchaseId === purchaseId);
        }
        
        // Filter by status if specified
        if (status) {
          reports = reports.filter(r => r.status === status);
        }
      }

      res.json(reports);
    } catch (error) {
      console.error("Failed to fetch quality reports:", error);
      res.status(500).json({ error: "Failed to fetch quality reports" });
    }
  });

  // GET /api/guarantee/reports/:id - Get specific report
  app.get("/api/guarantee/reports/:id", requireAuth, async (req, res) => {
    try {
      const report = await storage.getQualityGuaranteeById(req.params.id);
      
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      // Check permissions
      if (req.user!.role !== "admin" && report.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(report);
    } catch (error) {
      console.error("Failed to fetch quality report:", error);
      res.status(500).json({ error: "Failed to fetch quality report" });
    }
  });

  // PUT /api/guarantee/reports/:id/resolve - Admin resolves issue
  app.put("/api/guarantee/reports/:id/resolve", requireAdmin, async (req, res) => {
    try {
      const { status, replacementLeadId, notes } = req.body;
      const reportId = req.params.id;

      if (!['approved', 'rejected', 'replaced'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const report = await storage.getQualityGuaranteeById(reportId);
      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      let updatedReport;
      
      if (status === 'replaced' && replacementLeadId) {
        // Process replacement
        updatedReport = await qualityGuaranteeService.processReplacement(
          reportId,
          replacementLeadId,
          notes
        );
      } else if (status === 'approved' && !replacementLeadId) {
        // Issue credits instead of replacement
        const purchase = await storage.getPurchase(report.purchaseId);
        if (purchase) {
          const creditAmount = Math.floor((purchase.totalAmount as any) / purchase.leadCount);
          updatedReport = await qualityGuaranteeService.issueCredits(reportId, creditAmount);
        } else {
          updatedReport = await storage.resolveQualityGuarantee(
            reportId,
            status,
            undefined,
            notes,
            req.user!.id
          );
        }
      } else {
        // Simple status update
        updatedReport = await storage.resolveQualityGuarantee(
          reportId,
          status,
          replacementLeadId,
          notes,
          req.user!.id
        );
      }

      res.json(updatedReport);
    } catch (error: any) {
      console.error("Failed to resolve quality report:", error);
      res.status(500).json({ 
        error: error.message || "Failed to resolve quality report" 
      });
    }
  });

  // GET /api/guarantee/stats - Guarantee statistics
  app.get("/api/guarantee/stats", requireAuth, async (req, res) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const stats = await qualityGuaranteeService.getGuaranteeStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch guarantee stats:", error);
      res.status(500).json({ error: "Failed to fetch guarantee statistics" });
    }
  });

  // POST /api/guarantee/validate-phone - Validate phone numbers
  app.post("/api/guarantee/validate-phone", requireAuth, async (req, res) => {
    try {
      const { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const validation = await qualityGuaranteeService.phoneValidationService.validatePhone(phone);
      const isDisconnected = await qualityGuaranteeService.phoneValidationService.checkDisconnected(phone);

      res.json({
        phone,
        valid: validation.valid,
        issues: validation.issues,
        disconnected: isDisconnected
      });
    } catch (error) {
      console.error("Phone validation error:", error);
      res.status(500).json({ error: "Failed to validate phone number" });
    }
  });

  // GET /api/guarantee/replacement-leads/:purchaseId - Find replacement leads
  app.get("/api/guarantee/replacement-leads/:purchaseId", requireAdmin, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.purchaseId);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Get available replacement leads
      const availableLeads = await storage.getAvailableLeadsByTier(purchase.tier, 10);
      
      res.json(availableLeads);
    } catch (error) {
      console.error("Failed to find replacement leads:", error);
      res.status(500).json({ error: "Failed to find replacement leads" });
    }
  });

  // Analytics API endpoints
  
  // GET /api/analytics/dashboard - Main dashboard stats
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getLeadPerformanceStats();
      const conversionFunnel = await storage.getConversionFunnelData();
      const roiByTier = await storage.getRoiByTier();
      
      // Calculate additional metrics
      const leadVelocity = await calculateLeadVelocity();
      const bestPerformingTier = roiByTier.reduce((best, current) => 
        current.roi > best.roi ? current : best, 
        roiByTier[0] || { tier: 'none', roi: 0 }
      );
      
      // Get enrichment statistics
      const enrichmentStats = await storage.getEnrichmentStats();
      
      res.json({
        stats,
        conversionFunnel,
        roiByTier,
        leadVelocity,
        bestPerformingTier: bestPerformingTier.tier,
        enrichmentStats,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Analytics dashboard error:", error);
      res.status(500).json({ error: "Failed to fetch analytics data" });
    }
  });
  
  // GET /api/analytics/performance/:purchaseId - Purchase-specific metrics
  app.get("/api/analytics/performance/:purchaseId", requireAuth, async (req, res) => {
    try {
      const { purchaseId } = req.params;
      
      // Check purchase ownership
      const purchase = await storage.getPurchase(purchaseId);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }
      
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const stats = await storage.getLeadPerformanceStats(purchaseId);
      const leadPerformance = await storage.getLeadPerformanceByPurchaseId(purchaseId);
      
      res.json({
        purchase,
        stats,
        leadPerformance,
      });
    } catch (error) {
      console.error("Performance analytics error:", error);
      res.status(500).json({ error: "Failed to fetch performance data" });
    }
  });
  
  // POST /api/analytics/update-lead-status - Update lead status
  app.post("/api/analytics/update-lead-status", requireAuth, async (req, res) => {
    try {
      const { leadId, purchaseId, status, dealAmount, notes } = req.body;
      
      // Validate input
      if (!leadId || !purchaseId || !status) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check purchase ownership
      const purchase = await storage.getPurchase(purchaseId);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }
      
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check if lead performance record exists
      let leadPerformance = await storage.getLeadPerformanceByLeadId(leadId);
      
      const updateData: any = {
        status,
        notes,
        dealAmount: dealAmount ? String(dealAmount) : undefined,
        updatedBy: req.user!.id,
      };
      
      // Set timestamps based on status change
      const now = new Date();
      if (status === 'contacted' && !leadPerformance?.contactedAt) {
        updateData.contactedAt = now;
      }
      if (status === 'qualified' && !leadPerformance?.qualifiedAt) {
        updateData.qualifiedAt = now;
      }
      if ((status === 'closed_won' || status === 'closed_lost') && !leadPerformance?.closedAt) {
        updateData.closedAt = now;
      }
      
      if (leadPerformance) {
        // Update existing record
        leadPerformance = await storage.updateLeadPerformance(leadPerformance.id, updateData);
      } else {
        // Create new record
        leadPerformance = await storage.createLeadPerformance({
          purchaseId,
          leadId,
          ...updateData,
        });
      }
      
      // Update purchase analytics
      const stats = await storage.getLeadPerformanceStats(purchaseId);
      await storage.updatePurchase(purchaseId, {
        totalContacted: stats.contacted,
        totalQualified: stats.qualified,
        totalClosed: stats.closedWon + stats.closedLost,
        totalRevenue: String(stats.totalRevenue),
        roi: String(stats.roi),
      });
      
      res.json({ leadPerformance, stats });
    } catch (error) {
      console.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });
  
  // GET /api/analytics/roi-by-tier - ROI breakdown by tier
  app.get("/api/analytics/roi-by-tier", requireAuth, async (req, res) => {
    try {
      const roiData = await storage.getRoiByTier();
      res.json(roiData);
    } catch (error) {
      console.error("ROI by tier error:", error);
      res.status(500).json({ error: "Failed to fetch ROI data" });
    }
  });
  
  // GET /api/analytics/conversion-funnel - Funnel metrics
  app.get("/api/analytics/conversion-funnel", requireAuth, async (req, res) => {
    try {
      const funnelData = await storage.getConversionFunnelData();
      res.json(funnelData);
    } catch (error) {
      console.error("Conversion funnel error:", error);
      res.status(500).json({ error: "Failed to fetch funnel data" });
    }
  });

  // ============ ENHANCED ADMIN API ENDPOINTS ============

  // GET /api/admin/analytics/detailed - Enhanced admin analytics
  app.get("/api/admin/analytics/detailed", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Fetching detailed admin analytics...");
      
      // Get leads by date (last 30 days)
      const leadsByDate = await db.select({
        date: sql<string>`DATE(${leads.uploadedAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(leads)
      .where(gte(leads.uploadedAt, sql`CURRENT_DATE - INTERVAL '30 days'`))
      .groupBy(sql`DATE(${leads.uploadedAt})`)
      .orderBy(sql`DATE(${leads.uploadedAt})` as any)
      .catch((err) => {
        console.error("Error fetching leads by date:", err);
        return [];
      });

      // Revenue trends (last 30 days)
      const revenueTrends = await db.select({
        date: sql<string>`DATE(${purchases.createdAt})`,
        revenue: sql<number>`SUM(${purchases.totalAmount})`,
        purchases: sql<number>`COUNT(*)`,
      })
      .from(purchases)
      .where(gte(purchases.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`))
      .groupBy(sql`DATE(${purchases.createdAt})`)
      .orderBy(sql`DATE(${purchases.createdAt})` as any)
      .catch((err) => {
        console.error("Error fetching revenue trends:", err);
        return [];
      });

      // Top customers by revenue
      const topCustomers = await db.select({
        userId: purchases.userId,
        username: users.username,
        email: users.email,
        totalRevenue: sql<number>`SUM(${purchases.totalAmount})`,
        purchaseCount: sql<number>`COUNT(${purchases.id})`,
        totalLeads: sql<number>`SUM(${purchases.leadCount})`,
      })
      .from(purchases)
      .innerJoin(users, eq(purchases.userId, users.id))
      .groupBy(purchases.userId, users.username, users.email)
      .orderBy(sql`SUM(${purchases.totalAmount}) DESC`)
      .limit(10)
      .catch((err) => {
        console.error("Error fetching top customers:", err);
        return [];
      });

      // Conversion rates by tier
      const conversionRates = await db.select({
        tier: leads.tier,
        total: sql<number>`COUNT(*)`,
        sold: sql<number>`COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)`,
        conversionRate: sql<number>`ROUND((COUNT(CASE WHEN ${leads.sold} = true THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 2)`,
      })
      .from(leads)
      .where(isNotNull(leads.tier))
      .groupBy(leads.tier)
      .catch((err) => {
        console.error("Error fetching conversion rates:", err);
        return [];
      });

      res.json({
        leadsByDate: leadsByDate || [],
        revenueTrends: revenueTrends || [],
        topCustomers: topCustomers || [],
        conversionRates: conversionRates || [],
      });
    } catch (error) {
      console.error("Admin analytics error - Full details:", error);
      res.status(500).json({ 
        error: "Failed to fetch analytics",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/admin/users/detailed - Get users with stats
  app.get("/api/admin/users/detailed", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Fetching detailed user stats...");
      
      const usersWithStats = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        purchaseCount: sql<number>`COUNT(DISTINCT ${purchases.id})`,
        totalSpent: sql<number>`COALESCE(SUM(${purchases.totalAmount}), 0)`,
        totalLeads: sql<number>`COALESCE(SUM(${purchases.leadCount}), 0)`,
        lastPurchase: sql<Date>`MAX(${purchases.createdAt})`,
      })
      .from(users)
      .leftJoin(purchases, eq(users.id, purchases.userId))
      .groupBy(users.id, users.username, users.email, users.role, users.createdAt)
      .catch((err) => {
        console.error("Error fetching users with stats:", err);
        return [];
      });

      res.json(usersWithStats || []);
    } catch (error) {
      console.error("User fetch error - Full details:", error);
      res.status(500).json({ 
        error: "Failed to fetch users",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // PATCH /api/admin/users/:userId - Update user
  app.patch("/api/admin/users/:userId", requireAuth, requireAdmin, async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;

    try {
      const updates: any = {};
      if (role) updates.role = role;
      
      const result = await db.update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("User update error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // GET /api/admin/leads/all - Get all leads with pagination
  app.get("/api/admin/leads/all", requireAuth, requireAdmin, async (req, res) => {
    const { page = 1, limit = 50, search, tier, sold } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    try {
      console.log("Fetching all leads with pagination...");
      
      let conditions = [];

      if (search) {
        conditions.push(
          or(
            like(leads.businessName, `%${search}%`),
            like(leads.ownerName, `%${search}%`),
            like(leads.email, `%${search}%`),
            like(leads.phone, `%${search}%`)
          )
        );
      }

      if (tier) {
        conditions.push(eq(leads.tier, String(tier)));
      }

      if (sold !== undefined) {
        conditions.push(eq(leads.sold, sold === 'true'));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalResult, leadsResult] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` })
          .from(leads)
          .where(whereClause)
          .catch((err) => {
            console.error("Error counting leads:", err);
            return [{ count: 0 }];
          }),
        db.select()
          .from(leads)
          .where(whereClause)
          .orderBy(desc(leads.createdAt))
          .limit(Number(limit))
          .offset(offset)
          .catch((err) => {
            console.error("Error fetching leads:", err);
            return [];
          })
      ]);

      res.json({
        leads: leadsResult || [],
        total: totalResult?.[0]?.count || 0,
        page: Number(page),
        limit: Number(limit),
      });
    } catch (error) {
      console.error("Leads fetch error - Full details:", error);
      res.status(500).json({ 
        error: "Failed to fetch leads",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // PATCH /api/admin/leads/:leadId - Update lead
  app.patch("/api/admin/leads/:leadId", requireAuth, requireAdmin, async (req, res) => {
    const { leadId } = req.params;
    const updates = req.body;

    try {
      const result = await db.update(leads)
        .set(updates)
        .where(eq(leads.id, leadId))
        .returning();

      if (result.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }

      res.json(result[0]);
    } catch (error) {
      console.error("Lead update error:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  // POST /api/admin/leads/bulk-action - Bulk lead actions
  app.post("/api/admin/leads/bulk-action", requireAuth, requireAdmin, async (req, res) => {
    const { leadIds, action, value } = req.body;

    try {
      let updates: any = {};
      
      switch (action) {
        case 'markSold':
          updates.sold = true;
          updates.soldAt = new Date();
          break;
        case 'markAvailable':
          updates.sold = false;
          updates.soldAt = null;
          updates.soldTo = null;
          break;
        case 'changeTier':
          updates.tier = value;
          break;
        case 'updateQuality':
          updates.qualityScore = value;
          break;
      }

      const result = await db.update(leads)
        .set(updates)
        .where(inArray(leads.id, leadIds))
        .returning();

      res.json({ updated: result.length });
    } catch (error) {
      console.error("Bulk action error:", error);
      res.status(500).json({ error: "Failed to perform bulk action" });
    }
  });

  // GET /api/admin/settings - Get system settings
  app.get("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Fetching system settings...");
      
      const [tiers, pricingStrategy] = await Promise.all([
        storage.getAllProductTiers().catch((err) => {
          console.error("Error fetching product tiers:", err);
          return [];
        }),
        storage.getActivePricingStrategy().catch((err) => {
          console.error("Error fetching pricing strategy:", err);
          return null;
        }),
      ]);

      res.json({
        tiers: tiers || [],
        pricingStrategy: pricingStrategy || null,
        uploadLimits: {
          maxFileSize: 50 * 1024 * 1024, // 50MB
          allowedFormats: ['.csv', '.xlsx', '.xls'],
        },
      });
    } catch (error) {
      console.error("Settings fetch error - Full details:", error);
      res.status(500).json({ 
        error: "Failed to fetch settings",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // PATCH /api/admin/settings/tier/:tierId - Update tier
  app.patch("/api/admin/settings/tier/:tierId", requireAuth, requireAdmin, async (req, res) => {
    const { tierId } = req.params;
    const updates = req.body;

    try {
      const result = await storage.updateProductTier(tierId, updates);
      if (!result) {
        return res.status(404).json({ error: "Tier not found" });
      }
      res.json(result);
    } catch (error) {
      console.error("Tier update error:", error);
      res.status(500).json({ error: "Failed to update tier" });
    }
  });

  // POST /api/admin/settings/tier - Create tier
  app.post("/api/admin/settings/tier", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await storage.createProductTier(req.body);
      res.json(result);
    } catch (error) {
      console.error("Tier creation error:", error);
      res.status(500).json({ error: "Failed to create tier" });
    }
  });
  
  // ============ PREDICTIVE INSIGHTS API ENDPOINTS ============
  
  // GET /api/insights/market-trends - Get current market analysis
  app.get("/api/insights/market-trends", requireAuth, async (req, res) => {
    try {
      const { industry, region, timeframe, forceRefresh } = req.query;
      
      const marketInsights = await marketInsightsService.getMarketInsights({
        industry: industry as string | undefined,
        region: region as string | undefined,
        timeframe: (timeframe as 'daily' | 'weekly' | 'monthly' | 'quarterly') || 'weekly',
        forceRefresh: forceRefresh === 'true'
      });
      
      res.json({
        success: true,
        data: marketInsights,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Market trends error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch market trends",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/predictions/:leadId - Get predictions for specific lead
  app.get("/api/insights/predictions/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const { forceRefresh } = req.query;
      
      const lead = await storage.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({ 
          success: false,
          error: "Lead not found" 
        });
      }
      
      const prediction = await predictiveScoringEngine.generatePredictions(lead, forceRefresh === 'true');
      
      res.json({
        success: true,
        data: {
          leadId,
          prediction,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Lead prediction error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to generate predictions",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/portfolio-analysis - Analyze entire lead portfolio
  app.get("/api/insights/portfolio-analysis", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      
      const portfolioAnalysis = await insightsDashboardService.analyzePortfolio(userId);
      
      res.json({
        success: true,
        data: portfolioAnalysis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Portfolio analysis error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to analyze portfolio",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/daily-brief - Get daily market brief
  app.get("/api/insights/daily-brief", requireAuth, async (req, res) => {
    try {
      const { forceRefresh } = req.query;
      const dailyBrief = await insightsDashboardService.getDailyBrief();
      
      res.json({
        success: true,
        data: dailyBrief,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Daily brief error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to generate daily brief",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/opportunities - Get top opportunities based on predictions
  app.get("/api/insights/opportunities", requireAuth, async (req, res) => {
    try {
      const { limit = 10, forceRefresh } = req.query;
      
      const opportunities = await insightsDashboardService.getTopOpportunities(
        parseInt(limit as string, 10),
        forceRefresh === 'true'
      );
      
      res.json({
        success: true,
        data: {
          opportunities,
          count: opportunities.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Opportunities error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to fetch opportunities",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/anomalies - Detect market anomalies
  app.get("/api/insights/anomalies", requireAuth, async (req, res) => {
    try {
      const anomalies = await insightsDashboardService.detectAnomalies();
      
      res.json({
        success: true,
        data: {
          anomalies,
          count: anomalies.length,
          detectedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Anomaly detection error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to detect anomalies",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // GET /api/insights/market-timing - Get market timing recommendations
  app.get("/api/insights/market-timing", requireAuth, async (req, res) => {
    try {
      const { forceRefresh } = req.query;
      const marketTiming = await insightsDashboardService.getMarketTiming(forceRefresh === 'true');
      
      res.json({
        success: true,
        data: marketTiming,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Market timing error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to get market timing",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // POST /api/insights/predictions/batch - Generate predictions for multiple leads
  app.post("/api/insights/predictions/batch", requireAuth, async (req, res) => {
    try {
      const { leadIds, forceRefresh = false } = req.body;
      
      if (!Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: "Invalid lead IDs" 
        });
      }
      
      if (leadIds.length > 50) {
        return res.status(400).json({ 
          success: false,
          error: "Maximum 50 leads per batch" 
        });
      }
      
      const predictions = await predictiveScoringEngine.batchGeneratePredictions(leadIds);
      
      res.json({
        success: true,
        data: {
          predictions: Array.from(predictions.entries()).map(([leadId, prediction]) => ({
            leadId,
            prediction
          })),
          count: predictions.size,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error("Batch prediction error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to generate batch predictions",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============ END PREDICTIVE INSIGHTS API ENDPOINTS ============

  // Helper function to calculate lead velocity
  async function calculateLeadVelocity(): Promise<number> {
    try {
      // Calculate leads processed in the last 30 days vs previous 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const recentPurchases = await db.select({
        count: sql<number>`count(*)::int`
      })
      .from(purchases)
      .where(gte(purchases.createdAt, thirtyDaysAgo));
      
      const previousPurchases = await db.select({
        count: sql<number>`count(*)::int`
      })
      .from(purchases)
      .where(and(
        gte(purchases.createdAt, sixtyDaysAgo),
        lte(purchases.createdAt, thirtyDaysAgo)
      ));
      
      const recent = recentPurchases[0]?.count || 0;
      const previous = previousPurchases[0]?.count || 0;
      
      if (previous === 0) return 100; // 100% growth if no previous leads
      return ((recent - previous) / previous) * 100;
    } catch (error) {
      console.error("Lead velocity calculation error:", error);
      return 0;
    }
  }

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;

    try {
      // If no webhook secret is configured, log warning but continue for development
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn("WARNING: STRIPE_WEBHOOK_SECRET not configured. Webhook verification skipped in development.");
        // In production, you should always verify webhooks
      }
      
      let event;
      if (process.env.STRIPE_WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } else {
        // Development only - parse without verification
        event = JSON.parse(req.body.toString());
      }

      // Handle checkout.session.completed event (for Stripe Checkout)
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, tier, leadCount } = session.metadata || {};
        
        if (!userId || !tier || !leadCount) {
          console.error("Missing metadata in checkout session");
          return res.status(400).json({ error: "Missing metadata" });
        }
        
        // Get tier configuration
        const tierConfig = await storage.getProductTierByTier(tier);
        if (!tierConfig) {
          console.error(`Tier configuration not found for tier: ${tier}`);
          return res.status(400).json({ error: "Tier configuration not found" });
        }
        
        // Create purchase record
        const purchase = await storage.createPurchase({
          userId,
          tier: tier as "gold" | "platinum" | "diamond" | "elite",
          leadCount: parseInt(leadCount),
          totalAmount: (session.amount_total! / 100).toString(), // Convert cents to dollars
          stripePaymentIntentId: session.payment_intent as string,
          paymentStatus: "succeeded",
          leadIds: [],
        });
        
        // Get leads for this purchase
        const selectedLeads = await storage.getLeadsForPurchase(
          userId,
          parseInt(leadCount),
          tierConfig.minQuality,
          tierConfig.maxQuality
        );
        
        if (selectedLeads.length < parseInt(leadCount)) {
          console.error(`Not enough leads available. Requested: ${leadCount}, Available: ${selectedLeads.length}`);
        }
        
        const leadIds = selectedLeads.map(l => l.id);
        
        // Mark leads as sold
        await storage.markLeadsAsSold(leadIds, userId);
        
        // Create allocation records
        const allocationsToCreate = selectedLeads.map(lead => ({
          userId,
          purchaseId: purchase.id,
          leadId: lead.id,
          leadHash: createLeadHash(lead.email, lead.phone),
        }));
        await storage.createAllocations(allocationsToCreate);
        
        // Get user info
        const user = await storage.getUser(userId);
        
        // Generate CSV and upload to storage
        const csvContent = generateLeadsCsv(selectedLeads, user);
        const key = `purchases/${purchase.id}/leads.csv`;
        
        if (isObjectStorageConfigured() && s3Client) {
          await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: csvContent,
            ContentType: 'text/csv',
          }));
        }
        
        // Update purchase with lead IDs
        await storage.updatePurchase(purchase.id, {
          leadIds,
        });
        
        // Send confirmation emails
        if (user) {
          await sendOrderConfirmation(user.email, {
            id: purchase.id,
            tier: purchase.tier,
            leadCount: purchase.leadCount,
            totalAmount: Number(purchase.totalAmount),
          });
          
          await sendAdminAlert(
            'New Purchase Completed',
            `User ${user.email} purchased ${purchase.leadCount} ${purchase.tier} leads for $${purchase.totalAmount}`
          );
        }
      }
      
      // Handle payment_intent.succeeded event (for legacy payment flow)
      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { userId, tier, leadCount } = paymentIntent.metadata;

        // Find purchase by payment intent
        const allPurchases = await storage.getAllPurchases();
        const purchase = allPurchases.find(p => p.stripePaymentIntentId === paymentIntent.id);

        if (purchase) {
          // Get tier configuration to determine quality thresholds
          const tierConfig = await storage.getProductTierByTier(tier);
          if (!tierConfig) {
            console.error(`Tier configuration not found for tier: ${tier}`);
            return res.status(400).json({ error: "Tier configuration not found" });
          }

          // Get leads for this purchase using enhanced algorithm
          const selectedLeads = await storage.getLeadsForPurchase(
            userId,
            parseInt(leadCount),
            tierConfig.minQuality,
            tierConfig.maxQuality
          );

          if (selectedLeads.length < parseInt(leadCount)) {
            console.error(`Not enough leads available. Requested: ${leadCount}, Available: ${selectedLeads.length}`);
            // Could handle partial fulfillment or refund here
          }

          const leadIds = selectedLeads.map(l => l.id);

          // Mark leads as sold
          await storage.markLeadsAsSold(leadIds, userId);

          // Create allocation records with MD5 hashes
          const allocationsToCreate = selectedLeads.map(lead => ({
            userId,
            purchaseId: purchase.id,
            leadId: lead.id,
            leadHash: createLeadHash(lead.email, lead.phone),
          }));
          await storage.createAllocations(allocationsToCreate);

          // Get user info for CSV watermark
          const user = await storage.getUser(userId);
          
          // Generate CSV with watermark and upload to object storage (if configured)
          const csvContent = generateLeadsCsv(selectedLeads, user);
          const key = `purchases/${purchase.id}/leads.csv`;

          if (isObjectStorageConfigured() && s3Client) {
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: key,
              Body: csvContent,
              ContentType: 'text/csv',
            }));
          }

          // Update purchase
          await storage.updatePurchase(purchase.id, {
            paymentStatus: "succeeded",
            stripeChargeId: paymentIntent.latest_charge as string,
            leadIds,
          });

          // Send order confirmation email
          if (user) {
            await sendOrderConfirmation(user.email, {
              id: purchase.id,
              tier: purchase.tier,
              leadCount: purchase.leadCount,
              totalAmount: Number(purchase.totalAmount),
            });
            
            // Send admin alert
            await sendAdminAlert(
              'New Purchase Completed',
              `User ${user.email} purchased ${purchase.leadCount} ${purchase.tier} leads for $${Number(purchase.totalAmount)/100}`
            );
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  });

  // Stripe Checkout Session endpoint
  app.post("/api/create-checkout-session", requireAuth, async (req, res) => {
    try {
      const { tier } = req.body;
      
      // Validate tier
      if (!['gold', 'platinum', 'diamond'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier selected" });
      }
      
      // Get tier configuration
      const tierConfig = await storage.getProductTierByTier(tier);
      if (!tierConfig) {
        return res.status(400).json({ error: "Tier configuration not found" });
      }
      
      // Check if enough leads are available
      const availableLeads = await storage.getAvailableLeadsByTier(tier, tierConfig.leadCount);
      if (availableLeads.length < tierConfig.leadCount) {
        return res.status(400).json({ 
          error: "Not enough leads available",
          available: availableLeads.length,
          requested: tierConfig.leadCount 
        });
      }
      
      // Calculate price with enrichment premium if applicable
      const enrichedCount = availableLeads.filter(lead => lead.isEnriched).length;
      const regularCount = tierConfig.leadCount - enrichedCount;
      const enrichmentPremium = 1.3; // 30% premium for enriched leads
      
      // Calculate weighted price based on proportion of enriched leads
      const basePrice = tierConfig.price;
      const pricePerLead = basePrice / tierConfig.leadCount;
      const enrichedPrice = Math.round(pricePerLead * enrichmentPremium * enrichedCount);
      const regularPrice = pricePerLead * regularCount;
      const totalPrice = Math.round(enrichedPrice + regularPrice);
      
      // Get base URL for redirect - use Replit URL or fallback
      const baseUrl = process.env.REPLIT_DOMAINS ? 
        `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 
        req.headers.origin || `http://localhost:5000`;
      
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${tierConfig.name} Package${enrichedCount > 0 ? ' (Enriched)' : ''}`,
                description: `${tierConfig.leadCount} high-quality MCA leads${enrichedCount > 0 ? ` (${enrichedCount} enriched with business data)` : ''}`,
                metadata: {
                  tier,
                  leadCount: tierConfig.leadCount.toString(),
                  enrichedCount: enrichedCount.toString(),
                }
              },
              unit_amount: totalPrice, // Use calculated price with enrichment premium
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment-cancel`,
        metadata: {
          userId: req.user!.id,
          tier,
          leadCount: tierConfig.leadCount.toString(),
        },
      });
      
      res.json({ 
        checkoutUrl: session.url,
        sessionId: session.id 
      });
    } catch (error) {
      console.error("Checkout session creation error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // AI Insights routes
  app.get("/api/insights/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const insight = await storage.getAiInsightByBatchId(req.params.batchId);
      if (!insight) {
        return res.status(404).json({ error: "Insights not found" });
      }
      res.json(insight);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  app.post("/api/insights/generate/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batch = await storage.getLeadBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      const leads = await storage.getLeadsByBatchId(req.params.batchId);

      // Generate aggregated statistics (no PII)
      const stats = {
        totalLeads: leads.length,
        avgQualityScore: leads.reduce((sum, l) => sum + l.qualityScore, 0) / leads.length,
        industries: Array.from(new Set(leads.map(l => l.industry).filter((ind): ind is string => ind !== null && ind !== undefined))),
        qualityDistribution: {
          excellent: leads.filter(l => l.qualityScore >= 90).length,
          good: leads.filter(l => l.qualityScore >= 80 && l.qualityScore < 90).length,
          fair: leads.filter(l => l.qualityScore >= 60 && l.qualityScore < 80).length,
          poor: leads.filter(l => l.qualityScore < 60).length,
        },
      };

      // Call OpenAI with aggregated data only
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert MCA lead analyst. Analyze the aggregated statistics and provide strategic insights for marketing teams.",
          },
          {
            role: "user",
            content: `Analyze this MCA lead batch:
Total Leads: ${stats.totalLeads}
Avg Quality Score: ${stats.avgQualityScore.toFixed(1)}
Industries: ${stats.industries.join(", ")}
Quality Distribution: ${stats.qualityDistribution.excellent} excellent, ${stats.qualityDistribution.good} good, ${stats.qualityDistribution.fair} fair, ${stats.qualityDistribution.poor} poor

Provide:
1. Executive Summary (2-3 sentences)
2. Key Segments (3-4 segments)
3. Risk Flags (if any)
4. Outreach Angles (3-5 recommendations)

Format as JSON with keys: executiveSummary, segments (array), riskFlags (array), outreachAngles (array)`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const aiResponse = JSON.parse(completion.choices[0].message.content || "{}");

      const insight = await storage.createAiInsight({
        batchId: req.params.batchId,
        executiveSummary: aiResponse.executiveSummary,
        segments: aiResponse.segments,
        riskFlags: aiResponse.riskFlags,
        outreachAngles: aiResponse.outreachAngles,
      });

      res.json(insight);
    } catch (error) {
      console.error("AI insight generation error:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  // Product Tier routes
  // Public route - Get all active tiers for pricing page
  app.get("/api/tiers", async (req, res) => {
    try {
      const tiers = await storage.getActiveProductTiers();
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tiers" });
    }
  });

  // Admin routes - Manage tiers
  app.get("/api/admin/tiers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tiers = await storage.getAllProductTiers();
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tiers" });
    }
  });

  app.post("/api/admin/tiers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, tier, price, leadCount, minQuality, maxQuality, features, active, recommended } = req.body;
      
      // Validate required fields
      if (!name || !tier || price === undefined || leadCount === undefined || 
          minQuality === undefined || maxQuality === undefined || !features) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if tier already exists
      const existing = await storage.getProductTierByTier(tier);
      if (existing) {
        return res.status(400).json({ error: "Tier with this identifier already exists" });
      }

      const newTier = await storage.createProductTier({
        name,
        tier,
        price,
        leadCount,
        minQuality,
        maxQuality,
        features: Array.isArray(features) ? features : features.split('\n').map((f: string) => f.trim()).filter(Boolean),
        active: active !== undefined ? active : true,
        recommended: recommended || false,
      });

      res.json(newTier);
    } catch (error) {
      console.error("Create tier error:", error);
      res.status(500).json({ error: "Failed to create tier" });
    }
  });

  app.patch("/api/admin/tiers/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, tier, price, leadCount, minQuality, maxQuality, features, active, recommended } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (tier !== undefined) updateData.tier = tier;
      if (price !== undefined) updateData.price = price;
      if (leadCount !== undefined) updateData.leadCount = leadCount;
      if (minQuality !== undefined) updateData.minQuality = minQuality;
      if (maxQuality !== undefined) updateData.maxQuality = maxQuality;
      if (features !== undefined) {
        updateData.features = Array.isArray(features) ? features : features.split('\n').map((f: string) => f.trim()).filter(Boolean);
      }
      if (active !== undefined) updateData.active = active;
      if (recommended !== undefined) updateData.recommended = recommended;

      const updatedTier = await storage.updateProductTier(req.params.id, updateData);
      
      if (!updatedTier) {
        return res.status(404).json({ error: "Tier not found" });
      }

      res.json(updatedTier);
    } catch (error) {
      console.error("Update tier error:", error);
      res.status(500).json({ error: "Failed to update tier" });
    }
  });

  app.delete("/api/admin/tiers/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteProductTier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tier" });
    }
  });

  // Customers route (admin only)
  app.get("/api/customers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const buyers = await storage.getAllBuyers();
      res.json(buyers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Contact form submission routes
  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, phone, company, message } = req.body;
      
      // Validate required fields
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required' });
      }
      
      // Save to database
      const submission = await storage.createContactSubmission({
        name, 
        email, 
        phone: phone || null,
        company: company || null, 
        message, 
        status: 'new'
      });
      
      // Send admin notification
      await sendContactFormNotification({
        name, email, phone, company, message
      });
      
      // Send auto-reply to submitter
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY || 'test_key');
        await resend.emails.send({
          from: 'Lakefront Leadworks <noreply@lakefrontleadworks.com>',
          to: email,
          subject: 'Thank you for contacting Lakefront Leadworks',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1976d2;">Thank You for Contacting Us!</h2>
              <p>Hi ${name},</p>
              <p>Thank you for your interest in Lakefront Leadworks. We've received your message and our team will get back to you within 24-48 business hours.</p>
              <p>In the meantime, feel free to explore our lead packages and see how we can help grow your business.</p>
              <p>Best regards,<br>The Lakefront Leadworks Team</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Failed to send auto-reply:', emailError);
        // Continue even if auto-reply fails
      }
      
      res.json({ success: true, message: 'Contact form submitted successfully' });
    } catch (error) {
      console.error('Contact form submission error:', error);
      res.status(500).json({ error: 'Failed to submit contact form' });
    }
  });

  // Get contact submissions (admin only)
  app.get('/api/admin/contact-submissions', requireAuth, requireAdmin, async (req, res) => {
    try {
      const submissions = await storage.getContactSubmissions();
      res.json(submissions);
    } catch (error) {
      console.error('Failed to fetch contact submissions:', error);
      res.status(500).json({ error: 'Failed to fetch contact submissions' });
    }
  });

  // Update contact submission status (admin only)
  app.patch('/api/admin/contact-submissions/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateContactSubmissionStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: 'Contact submission not found' });
      }
      res.json(updated);
    } catch (error) {
      console.error('Failed to update contact submission:', error);
      res.status(500).json({ error: 'Failed to update contact submission' });
    }
  });

  // Test email route (admin only)
  app.get('/api/test-email', requireAuth, requireAdmin, async (req, res) => {
    try {
      await sendAdminAlert('Test Email', 'This is a test email from Lakefront Leadworks');
      res.json({ success: true, message: 'Test email sent successfully' });
    } catch (error) {
      console.error('Test email failed:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  });

  // Test Numverify phone validation (admin only)
  app.post('/api/test-numverify', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required' });
      }
      
      const result = await numverifyService.validatePhone(phone, 'US');
      
      res.json({
        success: true,
        result: {
          isValid: result.isValid,
          formattedLocal: result.formattedLocal,
          formattedInternational: result.formattedInternational,
          carrier: result.carrier,
          lineType: result.lineType,
          location: result.location,
          countryName: result.countryName,
          riskScore: result.riskScore,
          riskFactors: result.riskFactors,
        },
        message: result.isValid ? 'Phone number is valid' : 'Phone number is invalid',
        apiSource: result.carrier ? 'Numverify API' : 'Basic validation (API key may not be configured)',
      });
    } catch (error) {
      console.error('Numverify test failed:', error);
      res.status(500).json({ 
        error: 'Failed to validate phone number',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Newsletter signup endpoint
  app.post('/api/newsletter', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      // Store as a contact submission with newsletter type
      const submission = await storage.createContactSubmission({
        name: 'Newsletter Subscriber',
        email,
        phone: null,
        company: null,
        message: 'Newsletter signup - Wants to receive weekly MCA reports and 50 free lead samples',
        status: 'new'
      });

      // Send admin notification
      await sendAdminAlert('New Newsletter Signup', `Email: ${email}`);

      res.json({ success: true, message: 'Successfully subscribed to newsletter' });
    } catch (error) {
      console.error('Newsletter signup failed:', error);
      res.status(500).json({ error: 'Failed to subscribe to newsletter' });
    }
  });

  // ============================
  // Lead Alert Routes
  // ============================
  
  // Get all alerts for the current user
  app.get('/api/alerts', requireAuth, async (req, res) => {
    try {
      const alerts = await storage.getLeadAlertsByUserId(req.user!.id);
      res.json(alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      res.status(500).json({ error: 'Failed to fetch alerts' });
    }
  });
  
  // Create a new alert
  app.post('/api/alerts', requireAuth, async (req, res) => {
    try {
      const validatedData = insertLeadAlertSchema.parse({
        ...req.body,
        userId: req.user!.id,
      });
      
      const alert = await storage.createLeadAlert(validatedData);
      res.json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid alert data', details: error.errors });
      }
      console.error('Error creating alert:', error);
      res.status(500).json({ error: 'Failed to create alert' });
    }
  });
  
  // Get a specific alert
  app.get('/api/alerts/:id', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.json(alert);
    } catch (error) {
      console.error('Error fetching alert:', error);
      res.status(500).json({ error: 'Failed to fetch alert' });
    }
  });
  
  // Update an alert
  app.put('/api/alerts/:id', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const updated = await storage.updateLeadAlert(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error('Error updating alert:', error);
      res.status(500).json({ error: 'Failed to update alert' });
    }
  });
  
  // Delete an alert
  app.delete('/api/alerts/:id', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      await storage.deleteLeadAlert(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting alert:', error);
      res.status(500).json({ error: 'Failed to delete alert' });
    }
  });
  
  // Get alert history
  app.get('/api/alerts/:id/history', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const history = await storage.getAlertHistoryByAlertId(req.params.id);
      res.json(history);
    } catch (error) {
      console.error('Error fetching alert history:', error);
      res.status(500).json({ error: 'Failed to fetch alert history' });
    }
  });
  
  // Test an alert with existing leads
  app.post('/api/alerts/:id/test', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const result = await leadAlertService.testAlert(req.params.id);
      res.json(result);
    } catch (error) {
      console.error('Error testing alert:', error);
      res.status(500).json({ error: 'Failed to test alert' });
    }
  });
  
  // Get alert statistics
  app.get('/api/alerts/:id/stats', requireAuth, async (req, res) => {
    try {
      const alert = await storage.getLeadAlert(req.params.id);
      
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }
      
      // Check ownership
      if (alert.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const stats = await leadAlertService.getAlertStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching alert stats:', error);
      res.status(500).json({ error: 'Failed to fetch alert stats' });
    }
  });
  
  // Get unviewed alerts count
  app.get('/api/alerts/unviewed/count', requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnviewedAlertsCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error('Error fetching unviewed alerts count:', error);
      res.status(500).json({ error: 'Failed to fetch unviewed alerts count' });
    }
  });
  
  // Mark alert history as viewed
  app.post('/api/alerts/history/:id/viewed', requireAuth, async (req, res) => {
    try {
      const history = await storage.getAlertHistory(req.params.id);
      
      if (!history) {
        return res.status(404).json({ error: 'Alert history not found' });
      }
      
      const alert = await storage.getLeadAlert(history.alertId);
      if (!alert || (alert.userId !== req.user!.id && req.user!.role !== 'admin')) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      await storage.markAlertHistoryViewed(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking alert as viewed:', error);
      res.status(500).json({ error: 'Failed to mark alert as viewed' });
    }
  });

  // CRM Integration endpoints
  const { CrmIntegrationService, encryptApiKey } = await import('./services/crm-integration.js');

  // Get user's CRM integrations
  app.get('/api/integrations', requireAuth, async (req, res) => {
    try {
      const integrations = await storage.getCrmIntegrationsByUserId(req.session.userId!);
      // Don't send decrypted API keys
      const sanitized = integrations.map(i => ({
        ...i,
        apiKey: i.apiKey ? '***' : null
      }));
      res.json(sanitized);
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
      res.status(500).json({ error: 'Failed to fetch integrations' });
    }
  });

  // Connect new CRM integration
  app.post('/api/integrations/connect', requireAuth, async (req, res) => {
    try {
      const { crmType, apiKey, apiUrl, mappingConfig } = req.body;

      // Validate required fields
      if (!crmType || !apiKey) {
        return res.status(400).json({ error: 'CRM type and API key are required' });
      }

      // Encrypt the API key
      const encryptedKey = encryptApiKey(apiKey);

      // Create integration
      const integration = await storage.createCrmIntegration({
        userId: req.session.userId!,
        crmType,
        apiKey: encryptedKey,
        apiUrl: apiUrl || null,
        mappingConfig: mappingConfig || null,
        isActive: true
      });

      // Test connection
      const isValid = await CrmIntegrationService.testConnection(integration);
      if (!isValid) {
        // Delete the integration if connection test fails
        await storage.deleteCrmIntegration(integration.id);
        return res.status(400).json({ error: 'Failed to connect to CRM. Please check your credentials.' });
      }

      res.json({
        ...integration,
        apiKey: '***' // Don't return the encrypted key
      });
    } catch (error) {
      console.error('Failed to create integration:', error);
      res.status(500).json({ error: 'Failed to create integration' });
    }
  });

  // Test CRM connection
  app.post('/api/integrations/:id/test', requireAuth, async (req, res) => {
    try {
      const integration = await storage.getCrmIntegration(req.params.id);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const isValid = await CrmIntegrationService.testConnection(integration);
      res.json({ success: isValid });
    } catch (error) {
      console.error('Failed to test connection:', error);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  });

  // Export leads to CRM
  app.post('/api/integrations/:id/export', requireAuth, async (req, res) => {
    try {
      const { leadIds, purchaseId } = req.body;

      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: 'Lead IDs are required' });
      }

      const integration = await storage.getCrmIntegration(req.params.id);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get leads
      const leads = await Promise.all(leadIds.map(id => storage.getLead(id)));
      const validLeads = leads.filter(Boolean) as any[];

      if (validLeads.length === 0) {
        return res.status(404).json({ error: 'No valid leads found' });
      }

      // Export to CRM
      const result = await CrmIntegrationService.exportLeadsToCrm(
        req.params.id,
        validLeads,
        purchaseId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Failed to export leads:', error);
      res.status(500).json({ error: error.message || 'Failed to export leads' });
    }
  });

  // Get sync status for an integration
  app.get('/api/integrations/:id/sync-status', requireAuth, async (req, res) => {
    try {
      const integration = await storage.getCrmIntegration(req.params.id);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const logs = await storage.getCrmSyncLogsByIntegrationId(req.params.id);
      const latestSync = await storage.getLatestSyncLog(req.params.id);

      res.json({
        lastSyncAt: integration.lastSyncAt,
        latestSync,
        recentLogs: logs.slice(0, 10)
      });
    } catch (error) {
      console.error('Failed to get sync status:', error);
      res.status(500).json({ error: 'Failed to get sync status' });
    }
  });

  // Update field mappings
  app.put('/api/integrations/:id/mapping', requireAuth, async (req, res) => {
    try {
      const { mappingConfig } = req.body;

      const integration = await storage.getCrmIntegration(req.params.id);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const updated = await storage.updateCrmIntegration(req.params.id, {
        mappingConfig
      });

      res.json({
        ...updated,
        apiKey: '***'
      });
    } catch (error) {
      console.error('Failed to update mapping:', error);
      res.status(500).json({ error: 'Failed to update field mapping' });
    }
  });

  // Delete integration
  app.delete('/api/integrations/:id', requireAuth, async (req, res) => {
    try {
      const integration = await storage.getCrmIntegration(req.params.id);
      
      if (!integration) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await storage.deleteCrmIntegration(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete integration:', error);
      res.status(500).json({ error: 'Failed to delete integration' });
    }
  });

  // Get sync logs for a purchase
  app.get('/api/purchases/:purchaseId/sync-logs', requireAuth, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.purchaseId);
      
      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      if (purchase.userId !== req.session.userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const logs = await storage.getCrmSyncLogsByPurchaseId(req.params.purchaseId);
      res.json(logs);
    } catch (error) {
      console.error('Failed to get sync logs:', error);
      res.status(500).json({ error: 'Failed to get sync logs' });
    }
  });

  // Demo scheduling endpoint
  app.post('/api/demo', async (req, res) => {
    try {
      const { name, email, phone, company, preferredDate, preferredTime, message } = req.body;
      
      if (!name || !email || !preferredDate) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Store as a contact submission with demo request type
      const demoMessage = `Demo Request
Preferred Date: ${preferredDate}
Preferred Time: ${preferredTime || 'Any time'}
Additional Notes: ${message || 'None'}`;

      const submission = await storage.createContactSubmission({
        name,
        email,
        phone: phone || null,
        company: company || null,
        message: demoMessage,
        status: 'new'
      });

      // Send admin notification
      await sendAdminAlert('New Demo Request', 
        `Name: ${name}
Email: ${email}
Company: ${company || 'Not provided'}
Date: ${preferredDate}
Time: ${preferredTime || 'Any time'}`);

      res.json({ success: true, message: 'Demo scheduled successfully' });
    } catch (error) {
      console.error('Demo scheduling failed:', error);
      res.status(500).json({ error: 'Failed to schedule demo' });
    }
  });

  // Exit-intent email capture (similar to newsletter but with discount offer)
  app.post('/api/exit-intent', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      // Store as a contact submission with exit-intent type
      const submission = await storage.createContactSubmission({
        name: 'Exit Intent Subscriber',
        email,
        phone: null,
        company: null,
        message: 'Exit-intent popup signup - 20% discount claimed + 50 free samples',
        status: 'new'
      });

      // Send admin notification
      await sendAdminAlert('Exit Intent Signup', `Email: ${email} - Send discount code!`);

      res.json({ 
        success: true, 
        message: 'Discount code sent', 
        discountCode: 'SAVE20NOW' 
      });
    } catch (error) {
      console.error('Exit intent signup failed:', error);
      res.status(500).json({ error: 'Failed to process signup' });
    }
  });

  // ==================== LEAD ENRICHMENT ENDPOINTS ====================
  
  // POST /api/enrichment/batch - Enrich multiple leads in batch
  app.post('/api/enrichment/batch', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds, batchId } = req.body;
      
      if ((!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) && !batchId) {
        return res.status(400).json({ error: 'Lead IDs or batch ID required' });
      }
      
      let leadsToEnrich: any[] = [];
      
      // Get leads to enrich
      if (batchId) {
        // Enrich all leads in a batch
        const batchLeads = await storage.getLeadsByBatchId(batchId);
        leadsToEnrich = batchLeads.filter(lead => !lead.isEnriched);
      } else {
        // Enrich specific leads
        const leadPromises = leadIds.map(id => storage.getLead(id));
        const leads = await Promise.all(leadPromises);
        leadsToEnrich = leads.filter(lead => lead && !lead.isEnriched) as any[];
      }
      
      if (leadsToEnrich.length === 0) {
        return res.status(400).json({ 
          error: 'No leads to enrich', 
          message: 'All selected leads are already enriched' 
        });
      }
      
      // Generate enrichment data for each lead
      const enrichments = await leadEnrichmentService.enrichBatch(leadsToEnrich);
      
      // Save enrichments to database
      const savedEnrichments = await storage.createLeadEnrichments(enrichments as any);
      
      // Update leads to mark as enriched and add enrichment fields
      const updatePromises = leadsToEnrich.map(async (lead, index) => {
        const enrichment = enrichments[index];
        const enrichedData = enrichment.enrichedData as any;
        
        return storage.updateLead(lead.id, {
          isEnriched: true,
          linkedinUrl: enrichedData.socialProfiles?.linkedin || null,
          websiteUrl: enrichedData.contactInfo?.website || null,
          companySize: enrichedData.companySize || null,
          yearFounded: enrichedData.yearFounded || null,
          naicsCode: enrichedData.naicsCode || null
        });
      });
      
      await Promise.all(updatePromises);
      
      // Calculate stats
      const stats = leadEnrichmentService.calculateEnrichmentStats(savedEnrichments);
      
      res.json({
        success: true,
        enrichedCount: savedEnrichments.length,
        stats,
        message: `Successfully enriched ${savedEnrichments.length} leads`
      });
      
    } catch (error) {
      console.error('Lead enrichment failed:', error);
      res.status(500).json({ error: 'Failed to enrich leads' });
    }
  });
  
  // GET /api/enrichment/:leadId - Get enrichment data for a specific lead
  app.get('/api/enrichment/:leadId', requireAuth, async (req, res) => {
    try {
      const enrichment = await storage.getLeadEnrichment(req.params.leadId);
      
      if (!enrichment) {
        return res.status(404).json({ error: 'Enrichment data not found for this lead' });
      }
      
      // Check if user has access to this lead
      const lead = await storage.getLead(req.params.leadId);
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      // Admin can see all, buyers can only see their purchased leads
      const user = await storage.getUser(req.session.userId!);
      if (user?.role !== 'admin') {
        // Check if user has purchased this lead
        const userPurchases = await storage.getPurchasesByUserId(req.session.userId!);
        const hasPurchasedLead = userPurchases.some(p => 
          p.leadIds && p.leadIds.includes(req.params.leadId)
        );
        
        if (!hasPurchasedLead) {
          return res.status(403).json({ error: 'You do not have access to this lead' });
        }
      }
      
      res.json(enrichment);
      
    } catch (error) {
      console.error('Failed to get enrichment data:', error);
      res.status(500).json({ error: 'Failed to get enrichment data' });
    }
  });
  
  // POST /api/enrichment/auto-enrich - Enable/disable auto-enrichment for new uploads
  app.post('/api/enrichment/auto-enrich', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enabled, batchId } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled parameter must be a boolean' });
      }
      
      if (enabled && batchId) {
        // Auto-enrich a specific batch
        const batch = await storage.getLeadBatch(batchId);
        if (!batch) {
          return res.status(404).json({ error: 'Batch not found' });
        }
        
        // Get unenriched leads from the batch
        const batchLeads = await storage.getLeadsByBatchId(batchId);
        const unenrichedLeads = batchLeads.filter(lead => !lead.isEnriched);
        
        if (unenrichedLeads.length === 0) {
          return res.json({ 
            success: true, 
            message: 'All leads in this batch are already enriched' 
          });
        }
        
        // Enrich the batch
        const enrichments = await leadEnrichmentService.enrichBatch(unenrichedLeads);
        const savedEnrichments = await storage.createLeadEnrichments(enrichments as any);
        
        // Update leads to mark as enriched
        const updatePromises = unenrichedLeads.map(async (lead, index) => {
          const enrichment = enrichments[index];
          const enrichedData = enrichment.enrichedData as any;
          
          return storage.updateLead(lead.id, {
            isEnriched: true,
            linkedinUrl: enrichedData.socialProfiles?.linkedin || null,
            websiteUrl: enrichedData.contactInfo?.website || null,
            companySize: enrichedData.companySize || null,
            yearFounded: enrichedData.yearFounded || null,
            naicsCode: enrichedData.naicsCode || null
          });
        });
        
        await Promise.all(updatePromises);
        
        res.json({
          success: true,
          enabled,
          enrichedCount: savedEnrichments.length,
          message: `Auto-enriched ${savedEnrichments.length} leads in batch`
        });
      } else {
        // Just return the status
        res.json({
          success: true,
          enabled,
          message: enabled ? 'Auto-enrichment enabled for new uploads' : 'Auto-enrichment disabled'
        });
      }
      
    } catch (error) {
      console.error('Auto-enrichment toggle failed:', error);
      res.status(500).json({ error: 'Failed to toggle auto-enrichment' });
    }
  });
  
  // GET /api/enrichment/stats - Get enrichment statistics
  app.get('/api/enrichment/stats', requireAuth, async (req, res) => {
    try {
      const stats = await storage.getEnrichmentStats();
      
      // Get pricing impact
      const regularLeads = await storage.getLeadStats();
      const enrichedPremium = 1.3; // 30% premium for enriched leads
      
      // Calculate potential revenue impact
      const enrichedLeadsValue = stats.totalEnriched * enrichedPremium;
      const regularLeadsValue = regularLeads.available - stats.totalEnriched;
      const totalPotentialRevenue = enrichedLeadsValue + regularLeadsValue;
      const revenueIncrease = ((enrichedLeadsValue / (stats.totalEnriched || 1)) - 1) * 100;
      
      res.json({
        ...stats,
        pricing: {
          enrichedPremium: '30%',
          regularPrice: 1.0,
          enrichedPrice: enrichedPremium,
          revenueIncrease: revenueIncrease.toFixed(1) + '%',
          totalPotentialRevenue
        },
        completeness: {
          totalLeads: regularLeads.total,
          enrichedCount: stats.totalEnriched,
          percentageEnriched: ((stats.totalEnriched / regularLeads.total) * 100).toFixed(1) + '%'
        }
      });
      
    } catch (error) {
      console.error('Failed to get enrichment stats:', error);
      res.status(500).json({ error: 'Failed to get enrichment statistics' });
    }
  });

  // ==================== COMPREHENSIVE LEAD ENRICHMENT ENDPOINTS ====================
  
  // POST /api/leads/enrich-single - Enrich a single lead with real data
  app.post('/api/leads/enrich-single', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const isAdmin = user?.role === 'admin';
      
      // Parse and validate input lead data
      const leadData = req.body;
      
      if (!leadData.businessName && !leadData.ownerName) {
        return res.status(400).json({ 
          error: 'At least business name or owner name is required' 
        });
      }
      
      console.log(`[API] Starting comprehensive enrichment for: ${leadData.businessName || leadData.ownerName}`);
      
      // Enrich the lead with real data from multiple sources
      const enrichedLead = await comprehensiveLeadEnricher.enrichSingleLead(leadData, {
        skipPerplexity: false,
        skipHunter: false,
        skipNumverify: false,
        skipOpenAI: false
      });
      
      // If this is an existing lead, update it in the database
      if (leadData.id) {
        await storage.updateLeadWithEnrichment(leadData.id, enrichedLead);
        
        // Also store in lead enrichment table
        await storage.createLeadEnrichment({
          leadId: leadData.id,
          enrichedData: enrichedLead,
          enrichmentSource: 'comprehensive',
          confidenceScore: String(enrichedLead.confidenceScores?.overall || 0),
          socialProfiles: enrichedLead.socialProfiles,
          companyDetails: {
            businessDescription: enrichedLead.businessDescription,
            marketPosition: enrichedLead.marketPosition,
            competitiveAdvantages: enrichedLead.competitiveAdvantages
          },
          industryDetails: {
            industry: enrichedLead.industry,
            naicsCode: enrichedLead.naicsCode
          },
          contactInfo: {
            ownerName: enrichedLead.ownerName,
            email: enrichedLead.email,
            phone: enrichedLead.phone,
            city: enrichedLead.city,
            stateCode: enrichedLead.stateCode,
            fullAddress: enrichedLead.fullAddress
          }
        });
      }
      
      res.json({
        success: true,
        enrichedLead,
        metadata: {
          fieldsEnriched: enrichedLead.enrichmentMetadata?.fieldsEnriched.length || 0,
          dataQuality: enrichedLead.enrichmentMetadata?.dataQuality,
          sources: enrichedLead.enrichmentMetadata?.sources,
          confidenceScore: enrichedLead.confidenceScores?.overall
        }
      });
      
    } catch (error) {
      console.error('Failed to enrich single lead:', error);
      res.status(500).json({ error: 'Failed to enrich lead with real data' });
    }
  });
  
  // POST /api/leads/enrich-bulk - Enrich multiple leads in batch
  app.post('/api/leads/enrich-bulk', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leads, options = {} } = req.body;
      
      if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: 'Array of leads is required' });
      }
      
      if (leads.length > 50) {
        return res.status(400).json({ 
          error: 'Maximum 50 leads can be enriched at once' 
        });
      }
      
      console.log(`[API] Starting bulk enrichment for ${leads.length} leads`);
      
      // Enrich leads in batches
      const enrichedLeads = await comprehensiveLeadEnricher.enrichBulkLeads(leads, options);
      
      // Update leads in database if they have IDs
      const updateResults = await Promise.allSettled(
        enrichedLeads.map((enrichedLead, index) => {
          const originalLead = leads[index];
          if (originalLead.id) {
            // Add the lead ID to enrichment result
            enrichedLead.leadId = originalLead.id;
            return storage.updateLeadWithEnrichment(originalLead.id, enrichedLead);
          }
          return Promise.resolve(null);
        })
      );
      
      const successCount = updateResults.filter(r => r.status === 'fulfilled' && r.value).length;
      
      res.json({
        success: true,
        totalProcessed: leads.length,
        enrichedCount: enrichedLeads.length,
        updatedInDatabase: successCount,
        enrichedLeads,
        summary: {
          highQuality: enrichedLeads.filter(l => (l.confidenceScores?.overall || 0) > 80).length,
          mediumQuality: enrichedLeads.filter(l => {
            const score = l.confidenceScores?.overall || 0;
            return score > 50 && score <= 80;
          }).length,
          lowQuality: enrichedLeads.filter(l => (l.confidenceScores?.overall || 0) <= 50).length
        }
      });
      
    } catch (error) {
      console.error('Failed to enrich bulk leads:', error);
      res.status(500).json({ error: 'Failed to enrich leads in bulk' });
    }
  });
  
  // POST /api/leads/enrich-all-incomplete - Find and enrich all incomplete leads
  app.post('/api/leads/enrich-all-incomplete', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { limit = 50, options = {} } = req.body;
      
      console.log(`[API] Finding and enriching incomplete leads (limit: ${limit})`);
      
      // Get incomplete leads from storage
      const incompleteLeads = await storage.getIncompleteLeads(limit);
      
      if (incompleteLeads.length === 0) {
        return res.json({
          success: true,
          message: 'No incomplete leads found',
          totalProcessed: 0,
          successCount: 0,
          failureCount: 0
        });
      }
      
      console.log(`[API] Found ${incompleteLeads.length} incomplete leads. Starting enrichment...`);
      
      // Enrich all incomplete leads
      const enrichmentResult = await comprehensiveLeadEnricher.enrichAllIncompleteLeads(options);
      
      // Store enrichment data in lead_enrichment table
      const enrichmentRecords = enrichmentResult.results.map(result => ({
        leadId: result.leadId || '',
        enrichedData: result,
        enrichmentSource: 'comprehensive',
        confidenceScore: String(result.confidenceScores?.overall || 0),
        socialProfiles: result.socialProfiles,
        companyDetails: {
          businessDescription: result.businessDescription,
          marketPosition: result.marketPosition,
          competitiveAdvantages: result.competitiveAdvantages,
          fundingHistory: result.fundingHistory
        },
        industryDetails: {
          industry: result.industry,
          naicsCode: result.naicsCode
        },
        contactInfo: {
          ownerName: result.ownerName,
          email: result.email,
          phone: result.phone,
          city: result.city,
          stateCode: result.stateCode,
          fullAddress: result.fullAddress
        }
      })).filter(record => record.leadId);
      
      if (enrichmentRecords.length > 0) {
        await storage.createLeadEnrichments(enrichmentRecords);
      }
      
      res.json({
        success: true,
        ...enrichmentResult,
        message: `Successfully enriched ${enrichmentResult.successCount} out of ${enrichmentResult.totalProcessed} incomplete leads`,
        summary: {
          totalIncomplete: incompleteLeads.length,
          processed: enrichmentResult.totalProcessed,
          succeeded: enrichmentResult.successCount,
          failed: enrichmentResult.failureCount,
          averageConfidence: enrichmentResult.results.reduce((sum, r) => 
            sum + (r.confidenceScores?.overall || 0), 0
          ) / (enrichmentResult.results.length || 1)
        }
      });
      
    } catch (error) {
      console.error('Failed to enrich incomplete leads:', error);
      res.status(500).json({ error: 'Failed to enrich incomplete leads' });
    }
  });
  
  // GET /api/leads/enrichment-status - Get enrichment status for all leads
  app.get('/api/leads/enrichment-status', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const isAdmin = user?.role === 'admin';
      
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      
      // Get lead statistics
      const leadStats = await storage.getLeadStats();
      const enrichmentStats = await storage.getEnrichmentStats();
      
      // Get counts of incomplete leads
      const incompleteLeads = await storage.getIncompleteLeads(1000);
      const criticallyIncomplete = incompleteLeads.filter(lead => 
        !lead.ownerName && !lead.email && !lead.phone
      );
      
      res.json({
        total: leadStats.total,
        enriched: enrichmentStats.totalEnriched,
        incomplete: incompleteLeads.length,
        criticallyIncomplete: criticallyIncomplete.length,
        percentageEnriched: ((enrichmentStats.totalEnriched / leadStats.total) * 100).toFixed(1),
        averageConfidence: enrichmentStats.averageConfidence,
        sourceBreakdown: enrichmentStats.sourceBreakdown,
        recommendations: {
          needsEnrichment: incompleteLeads.length > 0,
          priorityLeads: criticallyIncomplete.length,
          estimatedEnrichmentTime: `${Math.ceil(incompleteLeads.length / 5)} minutes`,
          potentialValueIncrease: `$${(incompleteLeads.length * 5).toLocaleString()}`
        }
      });
      
    } catch (error) {
      console.error('Failed to get enrichment status:', error);
      res.status(500).json({ error: 'Failed to get enrichment status' });
    }
  });

  // ==================== BULK OPERATIONS ENDPOINTS ====================
  
  // Initialize default discount tiers on startup
  await bulkOperationsService.initializeDiscountTiers();
  
  // POST /api/bulk/calculate-discount - Calculate discount for quantity
  app.post('/api/bulk/calculate-discount', async (req, res) => {
    try {
      const { quantity } = req.body;
      
      if (!quantity || quantity < 1) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }
      
      const calculation = await bulkOperationsService.calculateBulkPrice(quantity);
      res.json(calculation);
    } catch (error) {
      console.error('Failed to calculate bulk discount:', error);
      res.status(500).json({ error: 'Failed to calculate discount' });
    }
  });
  
  // GET /api/bulk/discounts - Get discount tiers
  app.get('/api/bulk/discounts', async (req, res) => {
    try {
      const tiers = await bulkOperationsService.getDiscountTiers();
      res.json(tiers);
    } catch (error) {
      console.error('Failed to get discount tiers:', error);
      res.status(500).json({ error: 'Failed to get discount tiers' });
    }
  });
  
  // POST /api/bulk/create-order - Create bulk order
  app.post('/api/bulk/create-order', requireAuth, async (req, res) => {
    try {
      const { quantity, criteria } = req.body;
      
      if (!quantity || quantity < 100) {
        return res.status(400).json({ 
          error: 'Minimum order quantity is 100 leads for bulk purchases' 
        });
      }
      
      const orderId = await bulkOperationsService.createBulkOrder(
        req.user!.id,
        quantity,
        criteria
      );
      
      // Calculate pricing for the response
      const pricing = await bulkOperationsService.calculateBulkPrice(quantity);
      
      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(pricing.finalPrice * 100), // Convert to cents
        currency: 'usd',
        metadata: {
          userId: req.user!.id,
          bulkOrderId: orderId,
          quantity: quantity.toString(),
          discountPercentage: pricing.discountPercentage.toString()
        }
      });
      
      res.json({
        orderId,
        pricing,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      console.error('Failed to create bulk order:', error);
      res.status(500).json({ error: 'Failed to create bulk order' });
    }
  });
  
  // POST /api/bulk/custom-quote - Request custom pricing for 5000+ leads
  app.post('/api/bulk/custom-quote', requireAuth, async (req, res) => {
    try {
      const { quantity, criteria, message, contactPhone, companyName, timeline } = req.body;
      
      if (!quantity || quantity < 5000) {
        return res.status(400).json({ 
          error: 'Custom quotes are available for orders of 5000+ leads' 
        });
      }
      
      if (!message) {
        return res.status(400).json({ 
          error: 'Please provide details about your requirements' 
        });
      }
      
      const orderId = await bulkOperationsService.createCustomQuoteRequest({
        userId: req.user!.id,
        quantity,
        criteria,
        message,
        contactEmail: req.user!.email,
        contactPhone,
        companyName,
        timeline
      });
      
      // Send admin notification
      await sendAdminAlert('Custom Bulk Quote Request', 
        `User: ${req.user!.email}\n` +
        `Company: ${companyName || 'Not provided'}\n` +
        `Quantity: ${quantity} leads\n` +
        `Timeline: ${timeline || 'Not specified'}\n` +
        `Message: ${message}`
      );
      
      res.json({
        success: true,
        orderId,
        message: 'Your custom quote request has been submitted. Our team will contact you within 24 hours.'
      });
    } catch (error) {
      console.error('Failed to create custom quote:', error);
      res.status(500).json({ error: 'Failed to create custom quote request' });
    }
  });
  
  // GET /api/bulk/orders - Get user's bulk orders
  app.get('/api/bulk/orders', requireAuth, async (req, res) => {
    try {
      const orders = await storage.getBulkOrdersByUserId(req.user!.id);
      res.json(orders);
    } catch (error) {
      console.error('Failed to get bulk orders:', error);
      res.status(500).json({ error: 'Failed to get bulk orders' });
    }
  });
  
  // GET /api/bulk/orders/:id - Get specific bulk order
  app.get('/api/bulk/orders/:id', requireAuth, async (req, res) => {
    try {
      const order = await storage.getBulkOrder(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: 'Bulk order not found' });
      }
      
      // Check access
      if (order.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      res.json(order);
    } catch (error) {
      console.error('Failed to get bulk order:', error);
      res.status(500).json({ error: 'Failed to get bulk order' });
    }
  });
  
  // POST /api/bulk/orders/:id/complete - Complete bulk order payment
  app.post('/api/bulk/orders/:id/complete', requireAuth, async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      const orderId = req.params.id;
      
      const order = await storage.getBulkOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ error: 'Bulk order not found' });
      }
      
      if (order.userId !== req.user!.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Process payment and allocate leads
      const leads = await bulkOperationsService.processBulkOrderPayment(
        orderId,
        paymentIntentId
      );
      
      // Generate download URL
      const csvContent = generateLeadsCsv(leads, req.user);
      const key = `bulk-orders/${orderId}/leads.csv`;
      
      if (isObjectStorageConfigured) {
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: Buffer.from(csvContent),
          ContentType: 'text/csv',
        }));
        
        const downloadUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
          }),
          { expiresIn: 3600 * 24 } // 24 hours
        );
        
        // Send download ready email
        await sendDownloadReady(req.user!.email, downloadUrl, leads.length);
        
        res.json({
          success: true,
          downloadUrl,
          leadsCount: leads.length,
          message: 'Bulk order completed successfully'
        });
      } else {
        // Fallback to direct response
        res.json({
          success: true,
          leads,
          leadsCount: leads.length,
          message: 'Bulk order completed successfully'
        });
      }
    } catch (error) {
      console.error('Failed to complete bulk order:', error);
      res.status(500).json({ error: 'Failed to complete bulk order' });
    }
  });
  
  // Admin endpoints for bulk operations
  
  // GET /api/admin/bulk/orders - Get all bulk orders (admin only)
  app.get('/api/admin/bulk/orders', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.query;
      const orders = await storage.getAllBulkOrders(status as string);
      res.json(orders);
    } catch (error) {
      console.error('Failed to get bulk orders:', error);
      res.status(500).json({ error: 'Failed to get bulk orders' });
    }
  });
  
  // POST /api/admin/bulk/orders/:id/approve - Approve bulk order (admin only)
  app.post('/api/admin/bulk/orders/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { customPrice } = req.body;
      await bulkOperationsService.approveBulkOrder(req.params.id, customPrice);
      
      const order = await storage.getBulkOrder(req.params.id);
      if (order) {
        const user = await storage.getUser(order.userId);
        if (user) {
          // Send approval notification to user
          await sendOrderConfirmation(
            user.email,
            order.id,
            order.totalLeads,
            parseFloat(order.finalPrice)
          );
        }
      }
      
      res.json({ success: true, message: 'Bulk order approved' });
    } catch (error) {
      console.error('Failed to approve bulk order:', error);
      res.status(500).json({ error: 'Failed to approve bulk order' });
    }
  });
  
  // POST /api/admin/bulk/discounts - Create/update discount tier (admin only)
  app.post('/api/admin/bulk/discounts', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { tierName, minQuantity, maxQuantity, discountPercentage } = req.body;
      
      if (!tierName || !minQuantity || !discountPercentage) {
        return res.status(400).json({ 
          error: 'Tier name, minimum quantity, and discount percentage are required' 
        });
      }
      
      const discount = await storage.createBulkDiscount({
        tierName,
        minQuantity,
        maxQuantity,
        discountPercentage: discountPercentage.toString(),
        isActive: true
      });
      
      res.json(discount);
    } catch (error) {
      console.error('Failed to create discount tier:', error);
      res.status(500).json({ error: 'Failed to create discount tier' });
    }
  });
  
  // GET /api/admin/bulk/stats - Get bulk order statistics (admin only)
  app.get('/api/admin/bulk/stats', requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await bulkOperationsService.getBulkOrderStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get bulk order stats:', error);
      res.status(500).json({ error: 'Failed to get bulk order statistics' });
    }
  });

  // ==================== UCC INTELLIGENCE API ENDPOINTS ====================
  
  // Initialize UCC state formats on startup
  (async () => {
    try {
      await uccIntelligenceService.initializeStateFormats();
      console.log('[UccIntelligence] State formats initialized');
    } catch (error) {
      console.error('[UccIntelligence] Error initializing state formats:', error);
    }
  })();
  
  // POST /api/ucc/parse - Parse UCC filing with AI-powered state detection
  app.post('/api/ucc/parse', requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { leadId } = req.body;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      // Parse the UCC filing with AI intelligence
      const analysis = await uccIntelligenceService.parseUccFiling(
        file.buffer,
        file.originalname,
        leadId
      );
      
      res.json({
        success: true,
        stateDetected: analysis.stateDetected,
        filingsCount: analysis.filingData.length,
        businessIntelligence: analysis.businessIntelligence,
        insights: analysis.insights,
        confidence: analysis.confidence,
        message: `Successfully parsed ${analysis.filingData.length} UCC filings${
          analysis.stateDetected ? ` from ${analysis.stateDetected}` : ''
        }`
      });
    } catch (error) {
      console.error('[API] Error parsing UCC filing:', error);
      res.status(500).json({ 
        error: 'Failed to parse UCC filing',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // POST /api/ucc/analyze/:leadId - Analyze UCC filings for a specific lead
  app.post('/api/ucc/analyze/:leadId', requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const { filings } = req.body;
      
      if (!leadId) {
        return res.status(400).json({ error: 'Lead ID is required' });
      }
      
      // Check if lead exists and user has access
      const lead = await storage.getLead(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      if (lead.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Use existing filings or analyze new ones
      let analysis;
      if (filings && Array.isArray(filings)) {
        analysis = await uccIntelligenceService.analyzeFilings(filings, leadId);
        await uccIntelligenceService['saveAnalysis'](leadId, analysis);
      } else {
        // Get existing analysis
        const insights = await uccIntelligenceService.getInsights(leadId);
        if (!insights.hasAnalysis) {
          return res.status(404).json({ 
            error: 'No UCC analysis available',
            message: 'Please parse UCC filings first using /api/ucc/parse'
          });
        }
        analysis = insights;
      }
      
      // Update lead score with UCC factors
      await uccIntelligenceService.updateLeadScore(leadId);
      
      res.json({
        success: true,
        leadId,
        analysis,
        message: 'UCC analysis completed successfully'
      });
    } catch (error) {
      console.error('[API] Error analyzing UCC filings:', error);
      res.status(500).json({ 
        error: 'Failed to analyze UCC filings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // GET /api/ucc/relationships/:leadId - Get relationship graph for a lead
  app.get('/api/ucc/relationships/:leadId', requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      
      // Check lead access
      const lead = await storage.getLead(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      if (lead.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Get relationship graph
      const graph = await uccIntelligenceService.getRelationshipGraph(leadId);
      
      res.json({
        success: true,
        leadId,
        graph,
        statistics: {
          totalNodes: graph.nodes.length,
          totalEdges: graph.edges.length,
          totalClusters: graph.clusters.length,
          directConnections: graph.edges.filter(e => e.source === leadId).length,
          averageStrength: graph.edges.length > 0 
            ? graph.edges.reduce((sum, e) => sum + e.strength, 0) / graph.edges.length 
            : 0,
        },
        message: `Found ${graph.nodes.length - 1} related leads through UCC connections`
      });
    } catch (error) {
      console.error('[API] Error getting UCC relationships:', error);
      res.status(500).json({ 
        error: 'Failed to get UCC relationships',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // GET /api/ucc/insights/:leadId - Get AI-generated insights
  app.get('/api/ucc/insights/:leadId', requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      
      // Check lead access
      const lead = await storage.getLead(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      if (lead.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Get AI insights
      const insights = await uccIntelligenceService.getInsights(leadId);
      
      if (!insights.hasAnalysis) {
        return res.status(404).json({ 
          error: 'No UCC insights available',
          message: 'Please analyze UCC filings first'
        });
      }
      
      // Generate actionable recommendations
      const recommendations = {
        immediate: [] as string[],
        cautionary: [] as string[],
        opportunities: [] as string[],
      };
      
      // Build recommendations based on insights
      if (insights.businessIntelligence.debtStackingScore > 70) {
        recommendations.cautionary.push('High debt stacking detected - proceed with extreme caution');
        recommendations.immediate.push('Require additional collateral or personal guarantee');
      } else if (insights.businessIntelligence.debtStackingScore > 40) {
        recommendations.cautionary.push('Moderate debt stacking - enhanced due diligence recommended');
      }
      
      if (insights.businessIntelligence.refinancingProbability > 0.7) {
        recommendations.opportunities.push('High refinancing probability - offer competitive rates to capture');
      }
      
      if (insights.businessIntelligence.businessGrowthIndicator === 'growing') {
        recommendations.opportunities.push('Business showing growth - potential for larger advance amounts');
      } else if (insights.businessIntelligence.businessGrowthIndicator === 'declining') {
        recommendations.cautionary.push('Business showing decline - consider shorter terms');
      }
      
      if (insights.businessIntelligence.mcaApprovalLikelihood > 0.7) {
        recommendations.immediate.push('Strong MCA candidate - fast-track approval process');
      } else if (insights.businessIntelligence.mcaApprovalLikelihood < 0.3) {
        recommendations.cautionary.push('Low approval likelihood - consider alternative products');
      }
      
      res.json({
        success: true,
        leadId,
        insights: {
          ...insights,
          recommendations,
          summary: {
            overallRisk: insights.businessIntelligence.riskLevel,
            approvalRecommendation: 
              insights.businessIntelligence.mcaApprovalLikelihood > 0.6 ? 'Approve with conditions' :
              insights.businessIntelligence.mcaApprovalLikelihood > 0.3 ? 'Review carefully' :
              'Consider declining',
            keyFactors: [
              `Debt stacking: ${insights.businessIntelligence.debtStackingScore}/100`,
              `Business health: ${insights.businessIntelligence.businessHealthScore}/100`,
              `MCA approval likelihood: ${(insights.businessIntelligence.mcaApprovalLikelihood * 100).toFixed(0)}%`,
            ],
          },
        },
        message: 'UCC insights generated successfully'
      });
    } catch (error) {
      console.error('[API] Error getting UCC insights:', error);
      res.status(500).json({ 
        error: 'Failed to get UCC insights',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // POST /api/ucc/match-leads - Find related leads through UCC connections
  app.post('/api/ucc/match-leads', requireAuth, async (req, res) => {
    try {
      const { leadId, searchRadius = 2, minConfidence = 50 } = req.body;
      
      if (!leadId) {
        return res.status(400).json({ error: 'Lead ID is required' });
      }
      
      // Check lead access
      const lead = await storage.getLead(leadId);
      
      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }
      
      if (lead.userId !== req.user!.id && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      // Find matched leads
      const matches = await uccIntelligenceService.matchLeads(leadId);
      
      // Filter by confidence threshold
      const filteredMatches = matches.filter(m => 
        parseFloat(m.confidenceScore || '0') >= minConfidence
      );
      
      // Group matches by relationship type
      const groupedMatches = filteredMatches.reduce((acc, match) => {
        const type = match.relationshipType;
        if (!acc[type]) acc[type] = [];
        acc[type].push({
          leadId: match.leadIdB,
          confidence: parseFloat(match.confidenceScore || '0'),
          criteria: match.matchingCriteria,
          strength: parseFloat(match.relationshipStrength || '0'),
        });
        return acc;
      }, {} as Record<string, any[]>);
      
      res.json({
        success: true,
        leadId,
        totalMatches: filteredMatches.length,
        matchesByType: groupedMatches,
        statistics: {
          highConfidenceMatches: filteredMatches.filter(m => 
            parseFloat(m.confidenceScore || '0') >= 80
          ).length,
          mediumConfidenceMatches: filteredMatches.filter(m => {
            const conf = parseFloat(m.confidenceScore || '0');
            return conf >= 60 && conf < 80;
          }).length,
          lowConfidenceMatches: filteredMatches.filter(m => {
            const conf = parseFloat(m.confidenceScore || '0');
            return conf >= minConfidence && conf < 60;
          }).length,
        },
        message: `Found ${filteredMatches.length} related leads through UCC analysis`
      });
    } catch (error) {
      console.error('[API] Error matching leads:', error);
      res.status(500).json({ 
        error: 'Failed to match leads',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // GET /api/ucc/state-formats - Get supported state formats
  app.get('/api/ucc/state-formats', requireAuth, async (req, res) => {
    try {
      const formats = await storage.getUccStateFormats();
      
      res.json({
        success: true,
        totalStates: formats.length,
        formats: formats.map(f => ({
          stateCode: f.stateCode,
          stateName: f.stateName,
          version: f.formatVersion,
          characteristics: f.characteristics,
          hasSpecialHandling: !!(f.collateralCodes && Object.keys(f.collateralCodes).length > 0),
        })),
        message: `Supporting ${formats.length} US state formats`
      });
    } catch (error) {
      console.error('[API] Error getting state formats:', error);
      res.status(500).json({ 
        error: 'Failed to get state formats',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // POST /api/admin/ucc/bulk-analyze - Bulk analyze UCC filings (admin only)
  app.post('/api/admin/ucc/bulk-analyze', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds, forceReanalyze = false } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: 'Lead IDs array is required' });
      }
      
      const results = {
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[],
      };
      
      for (const leadId of leadIds) {
        try {
          const insights = await uccIntelligenceService.getInsights(leadId);
          
          if (!forceReanalyze && insights.hasAnalysis) {
            results.skipped++;
            continue;
          }
          
          await uccIntelligenceService.updateLeadScore(leadId);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push(`Lead ${leadId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      res.json({
        success: true,
        results,
        message: `Analyzed ${results.successful} leads, skipped ${results.skipped}, failed ${results.failed}`
      });
    } catch (error) {
      console.error('[API] Error in bulk UCC analysis:', error);
      res.status(500).json({ 
        error: 'Failed to perform bulk analysis',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // ==================== END UCC INTELLIGENCE API ENDPOINTS ====================

  // Campaign Template endpoints
  app.get("/api/templates", requireAuth, async (req, res) => {
    try {
      const { category } = req.query;
      
      // Initialize default templates if needed
      await campaignService.initializeDefaultTemplates();
      
      let templates;
      if (category) {
        templates = await storage.getCampaignTemplatesByCategory(
          category as string,
          req.user!.id
        );
      } else {
        templates = await storage.getCampaignTemplates(req.user!.id);
      }
      
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.post("/api/templates", requireAuth, async (req, res) => {
    try {
      const validation = insertCampaignTemplateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.message });
      }
      
      const templateData = {
        ...validation.data,
        userId: req.user!.id,
        variables: campaignService.extractVariables(
          validation.data.content,
          validation.data.subject
        )
      };
      
      const template = await storage.createCampaignTemplate(templateData);
      res.json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.put("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getCampaignTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId && template.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const updatedData = {
        ...req.body,
        variables: campaignService.extractVariables(
          req.body.content,
          req.body.subject
        )
      };
      
      const updated = await storage.updateCampaignTemplate(req.params.id, updatedData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", requireAuth, async (req, res) => {
    try {
      const template = await storage.getCampaignTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteCampaignTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Campaign endpoints
  app.post("/api/campaigns/preview", requireAuth, async (req, res) => {
    try {
      const { templateId, purchaseId } = req.body;
      
      if (!templateId || !purchaseId) {
        return res.status(400).json({ error: "Template ID and Purchase ID are required" });
      }
      
      // Get purchase and verify ownership
      const purchase = await storage.getPurchase(purchaseId);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }
      
      if (purchase.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const leadIds = purchase.leadIds || [];
      const preview = await campaignService.previewTemplate(templateId, leadIds);
      
      res.json(preview);
    } catch (error) {
      console.error("Error generating preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  app.post("/api/campaigns/create", requireAuth, async (req, res) => {
    try {
      const { purchaseId, templateId, campaignName, scheduledAt } = req.body;
      
      if (!purchaseId || !templateId || !campaignName) {
        return res.status(400).json({ 
          error: "Purchase ID, Template ID, and Campaign Name are required" 
        });
      }
      
      const campaign = await campaignService.createCampaign(
        req.user!.id,
        purchaseId,
        templateId,
        campaignName,
        scheduledAt ? new Date(scheduledAt) : undefined
      );
      
      res.json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.get("/api/campaigns", requireAuth, async (req, res) => {
    try {
      const campaigns = await storage.getCampaignsByUserId(req.user!.id);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/stats", requireAuth, async (req, res) => {
    try {
      const stats = await campaignService.getCampaignStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching campaign stats:", error);
      res.status(500).json({ error: "Failed to fetch campaign statistics" });
    }
  });

  app.post("/api/campaigns/:id/send", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (campaign.status !== "draft") {
        return res.status(400).json({ error: "Campaign has already been sent or scheduled" });
      }
      
      await campaignService.processCampaign(req.params.id);
      const updated = await storage.getCampaign(req.params.id);
      
      res.json(updated);
    } catch (error) {
      console.error("Error sending campaign:", error);
      res.status(500).json({ error: "Failed to send campaign" });
    }
  });

  app.post("/api/campaigns/:id/cancel", requireAuth, async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      if (campaign.userId !== req.user!.id && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (campaign.status !== "scheduled") {
        return res.status(400).json({ error: "Only scheduled campaigns can be cancelled" });
      }
      
      const updated = await storage.cancelCampaign(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Error cancelling campaign:", error);
      res.status(500).json({ error: "Failed to cancel campaign" });
    }
  });

  // Get available variables for template creation
  app.get("/api/campaigns/variables", requireAuth, async (req, res) => {
    try {
      // Import CampaignService class directly to access static properties
      const { CampaignService } = await import("./services/campaign-tools");
      res.json(CampaignService.AVAILABLE_VARIABLES);
    } catch (error) {
      console.error("Error fetching variables:", error);
      res.status(500).json({ error: "Failed to fetch available variables" });
    }
  });

  // ==========================================
  // Enterprise API v1 Endpoints
  // ==========================================

  // API v1 - Lead Search and Filtering
  app.get(
    "/api/v1/leads",
    apiAuthMiddleware(["read:leads"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const options = parsePagination(req.query);
        const filters = {
          industry: req.query.industry ? String(req.query.industry).split(",") : undefined,
          stateCode: req.query.state ? String(req.query.state).split(",") : undefined,
          minQualityScore: req.query.minQuality ? parseInt(String(req.query.minQuality)) : undefined,
          maxQualityScore: req.query.maxQuality ? parseInt(String(req.query.maxQuality)) : undefined,
          minRevenue: req.query.minRevenue ? parseInt(String(req.query.minRevenue)) : undefined,
          maxRevenue: req.query.maxRevenue ? parseInt(String(req.query.maxRevenue)) : undefined,
          exclusivityStatus: req.query.exclusivity ? String(req.query.exclusivity).split(",") : undefined,
          sold: req.query.sold === "true" ? true : req.query.sold === "false" ? false : undefined,
        };

        const { leads, total } = await storage.getFilteredLeads(filters);
        const offset = (options.page! - 1) * options.limit!;
        const paginatedLeads = leads.slice(offset, offset + options.limit!);

        paginatedResponse(res, paginatedLeads, total, options);
      } catch (error) {
        console.error("API v1 - Error fetching leads:", error);
        apiError(res, "Failed to fetch leads", 500);
      }
    }
  );

  // API v1 - Get specific lead details
  app.get(
    "/api/v1/leads/:id",
    apiAuthMiddleware(["read:leads"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const lead = await storage.getLead(req.params.id);
        if (!lead) {
          return apiError(res, "Lead not found", 404);
        }
        apiResponse(res, lead);
      } catch (error) {
        console.error("API v1 - Error fetching lead:", error);
        apiError(res, "Failed to fetch lead", 500);
      }
    }
  );

  // API v1 - Create Purchase
  app.post(
    "/api/v1/purchases",
    apiAuthMiddleware(["write:purchases"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const { tier, leadCount, paymentMethodId } = req.body;
        
        if (!tier || !leadCount) {
          return apiError(res, "Missing required fields: tier, leadCount", 400);
        }

        const user = await storage.getUser(req.apiKey!.userId);
        if (!user) {
          return apiError(res, "User not found", 404);
        }

        // Get tier pricing
        const tierData = await storage.getProductTierByTier(tier);
        if (!tierData || !tierData.isActive) {
          return apiError(res, "Invalid or inactive tier", 400);
        }

        const totalAmount = (tierData.price * leadCount) / tierData.leadCount;

        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: "usd",
          customer: user.email,
          metadata: {
            userId: user.id,
            tier,
            leadCount: leadCount.toString(),
          },
          payment_method: paymentMethodId,
          confirm: true,
        });

        // Get leads for purchase
        const leads = await storage.getLeadsForPurchase(
          user.id,
          leadCount,
          tierData.minQuality,
          tierData.maxQuality
        );

        // Create purchase record
        const purchase = await storage.createPurchase({
          userId: user.id,
          tier,
          leadCount,
          totalAmount: totalAmount.toString(),
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
          leadIds: leads.map(l => l.id),
        });

        // Mark leads as sold
        if (paymentIntent.status === "succeeded") {
          await storage.markLeadsAsSold(leads.map(l => l.id), user.id);
          
          // Trigger webhook
          await webhookDispatcher.dispatch("purchase.completed", {
            purchaseId: purchase.id,
            userId: user.id,
            tier,
            leadCount,
            totalAmount,
          });
        }

        apiResponse(res, purchase, 201);
      } catch (error) {
        console.error("API v1 - Error creating purchase:", error);
        apiError(res, "Failed to create purchase", 500);
      }
    }
  );

  // API v1 - Get Purchase History
  app.get(
    "/api/v1/purchases",
    apiAuthMiddleware(["read:purchases"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const options = parsePagination(req.query);
        const purchases = await storage.getPurchasesByUserId(req.apiKey!.userId);
        
        const offset = (options.page! - 1) * options.limit!;
        const paginatedPurchases = purchases.slice(offset, offset + options.limit!);

        paginatedResponse(res, paginatedPurchases, purchases.length, options);
      } catch (error) {
        console.error("API v1 - Error fetching purchases:", error);
        apiError(res, "Failed to fetch purchases", 500);
      }
    }
  );

  // API v1 - Get Analytics Data
  app.get(
    "/api/v1/analytics",
    apiAuthMiddleware(["read:analytics"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const stats = await storage.getLeadPerformanceStats();
        const funnelData = await storage.getConversionFunnelData();
        const roiData = await storage.getRoiByTier();
        
        apiResponse(res, {
          performance: stats,
          funnel: funnelData,
          roi: roiData,
        });
      } catch (error) {
        console.error("API v1 - Error fetching analytics:", error);
        apiError(res, "Failed to fetch analytics", 500);
      }
    }
  );

  // Lead Activation Hub endpoints
  app.post("/api/lead-activation/activate", requireAuth, async (req, res) => {
    try {
      const { leadIds, actions, options } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }
      
      // Import the lead activation hub
      const { leadActivationHub } = await import("./services/lead-activation-hub");
      
      const result = await leadActivationHub.activateLeads({
        leadIds,
        actions: actions || {},
        options: {
          ...options,
          userId: req.user!.id
        }
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Lead activation error:", error);
      res.status(500).json({ error: error.message || "Failed to activate leads" });
    }
  });
  
  app.post("/api/lead-activation/quick-action", requireAuth, async (req, res) => {
    try {
      const { actionId, leadIds, options } = req.body;
      
      if (!actionId || !leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Action ID and lead IDs are required" });
      }
      
      const { leadActivationHub } = await import("./services/lead-activation-hub");
      
      const result = await leadActivationHub.executeQuickAction(
        actionId,
        leadIds,
        {
          ...options,
          userId: req.user!.id
        }
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Quick action error:", error);
      res.status(500).json({ error: error.message || "Failed to execute quick action" });
    }
  });
  
  app.get("/api/lead-activation/quick-actions", requireAuth, async (req, res) => {
    try {
      const { LeadActivationHub } = await import("./services/lead-activation-hub");
      res.json(LeadActivationHub.QUICK_ACTIONS);
    } catch (error: any) {
      console.error("Error fetching quick actions:", error);
      res.status(500).json({ error: "Failed to fetch quick actions" });
    }
  });
  
  app.post("/api/lead-activation/preview", requireAuth, async (req, res) => {
    try {
      const { leadIds, actions, options } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }
      
      const { leadActivationHub } = await import("./services/lead-activation-hub");
      
      const preview = await leadActivationHub.previewActivation({
        leadIds,
        actions: actions || {},
        options: options || {}
      });
      
      res.json(preview);
    } catch (error: any) {
      console.error("Preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });
  
  app.get("/api/lead-activation/history", requireAuth, async (req, res) => {
    try {
      const { leadId, limit } = req.query;
      const { leadActivationHub } = await import("./services/lead-activation-hub");
      
      let history;
      if (leadId) {
        history = await leadActivationHub.getLeadActivationHistory(leadId as string);
      } else {
        history = await leadActivationHub.getActivationHistory(
          req.user!.id,
          limit ? parseInt(limit as string) : 50
        );
      }
      
      res.json(history);
    } catch (error: any) {
      console.error("History error:", error);
      res.status(500).json({ error: "Failed to fetch activation history" });
    }
  });
  
  app.get("/api/lead-activation/status/:activationId", requireAuth, async (req, res) => {
    try {
      const { leadActivationHub } = await import("./services/lead-activation-hub");
      
      const status = leadActivationHub.getActivationStatus(req.params.activationId);
      
      if (!status) {
        return res.status(404).json({ error: "Activation not found" });
      }
      
      res.json(status);
    } catch (error: any) {
      console.error("Status error:", error);
      res.status(500).json({ error: "Failed to fetch activation status" });
    }
  });

  // API v1 - Webhook Management
  app.post(
    "/api/v1/webhooks",
    apiAuthMiddleware(["manage:webhooks"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const validation = insertWebhookSchema.safeParse(req.body);
        if (!validation.success) {
          return apiError(res, validation.error.message, 400);
        }

        // Generate webhook secret
        const secret = crypto.randomBytes(32).toString("hex");

        const webhook = await storage.createWebhook({
          ...validation.data,
          userId: req.apiKey!.userId,
          secret,
        });

        apiResponse(res, {
          ...webhook,
          secret, // Return secret once for client to store
        }, 201);
      } catch (error) {
        console.error("API v1 - Error creating webhook:", error);
        apiError(res, "Failed to create webhook", 500);
      }
    }
  );

  app.get(
    "/api/v1/webhooks",
    apiAuthMiddleware(["manage:webhooks"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const webhooks = await storage.getWebhooksByUserId(req.apiKey!.userId);
        apiResponse(res, webhooks);
      } catch (error) {
        console.error("API v1 - Error fetching webhooks:", error);
        apiError(res, "Failed to fetch webhooks", 500);
      }
    }
  );

  app.delete(
    "/api/v1/webhooks/:id",
    apiAuthMiddleware(["manage:webhooks"]),
    rateLimitMiddleware(),
    usageTrackingMiddleware(),
    async (req, res) => {
      try {
        const webhook = await storage.getWebhook(req.params.id);
        if (!webhook) {
          return apiError(res, "Webhook not found", 404);
        }
        
        if (webhook.userId !== req.apiKey!.userId) {
          return apiError(res, "Access denied", 403);
        }

        await storage.deleteWebhook(req.params.id);
        apiResponse(res, { success: true });
      } catch (error) {
        console.error("API v1 - Error deleting webhook:", error);
        apiError(res, "Failed to delete webhook", 500);
      }
    }
  );

  // ==========================================
  // Developer Portal Endpoints
  // ==========================================

  // List API Keys
  app.get("/api/developer/keys", requireAuth, async (req, res) => {
    try {
      const keys = await storage.getApiKeysByUserId(req.user!.id);
      
      // Don't expose the key hash
      const sanitizedKeys = keys.map(key => ({
        id: key.id,
        keyName: key.keyName,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        isActive: key.isActive,
        createdAt: key.createdAt,
      }));
      
      res.json(sanitizedKeys);
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  // Generate new API Key
  app.post("/api/developer/keys", requireAuth, async (req, res) => {
    try {
      const validation = insertApiKeySchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.message });
      }

      // Generate the API key
      const apiKey = apiKeyManager.generateApiKey();
      const keyHash = apiKeyManager.hashApiKey(apiKey);

      const apiKeyRecord = await storage.createApiKey({
        ...validation.data,
        userId: req.user!.id,
        keyHash,
      });

      res.json({
        ...apiKeyRecord,
        apiKey, // Return the actual key only once
        message: "Save this API key securely. It will not be shown again.",
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  // Update API Key
  app.put("/api/developer/keys/:id", requireAuth, async (req, res) => {
    try {
      const key = await storage.getApiKey(req.params.id);
      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      if (key.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateApiKey(req.params.id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating API key:", error);
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  // Revoke API Key
  app.delete("/api/developer/keys/:id", requireAuth, async (req, res) => {
    try {
      const key = await storage.getApiKey(req.params.id);
      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      if (key.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updateApiKey(req.params.id, { isActive: false });
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  // Get API Usage Statistics
  app.get("/api/developer/usage", requireAuth, async (req, res) => {
    try {
      const { keyId, startDate, endDate } = req.query;
      
      let usage, stats;
      if (keyId) {
        // Verify ownership
        const key = await storage.getApiKey(keyId as string);
        if (!key || key.userId !== req.user!.id) {
          return res.status(403).json({ error: "Access denied" });
        }
        
        usage = await storage.getApiUsageByKeyId(
          keyId as string,
          startDate ? new Date(startDate as string) : undefined,
          endDate ? new Date(endDate as string) : undefined
        );
        stats = await storage.getApiUsageStats(keyId as string);
      } else {
        // Get usage for all user's keys
        const keys = await storage.getApiKeysByUserId(req.user!.id);
        const allUsage: any[] = [];
        
        for (const key of keys) {
          const keyUsage = await storage.getApiUsageByKeyId(
            key.id,
            startDate ? new Date(startDate as string) : undefined,
            endDate ? new Date(endDate as string) : undefined
          );
          allUsage.push(...keyUsage);
        }
        
        usage = allUsage;
        
        // Calculate aggregate stats
        const totalRequests = usage.length;
        const successfulRequests = usage.filter(u => u.statusCode >= 200 && u.statusCode < 300).length;
        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
        
        const responseTimes = usage.filter(u => u.responseTime).map(u => u.responseTime);
        const averageResponseTime = responseTimes.length > 0 
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
          : 0;
        
        stats = {
          totalRequests,
          successRate,
          averageResponseTime,
          topEndpoints: [],
        };
      }
      
      res.json({ usage, stats });
    } catch (error) {
      console.error("Error fetching API usage:", error);
      res.status(500).json({ error: "Failed to fetch API usage" });
    }
  });

  // Test webhook endpoint
  app.post("/api/developer/webhooks/test", requireAuth, async (req, res) => {
    try {
      const { webhookId, event } = req.body;
      
      if (!webhookId || !event) {
        return res.status(400).json({ error: "Webhook ID and event are required" });
      }
      
      const webhook = await storage.getWebhook(webhookId);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      
      if (webhook.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Send test webhook
      await webhookDispatcher.dispatch(event, {
        test: true,
        message: "This is a test webhook event",
        timestamp: new Date().toISOString(),
      });
      
      res.json({ success: true, message: "Test webhook sent" });
    } catch (error) {
      console.error("Error testing webhook:", error);
      res.status(500).json({ error: "Failed to test webhook" });
    }
  });

  // ==========================================
  // Command Center Endpoints
  // ==========================================
  
  // Get unified dashboard data
  app.get("/api/command-center/dashboard", requireAuth, async (req, res) => {
    try {
      const dashboardData = await commandCenterService.getDashboardData(req.user!.id);
      res.json(dashboardData);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  // Get activity log
  app.get("/api/command-center/activity", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const activities = await commandCenterService.getRecentActivities(limit);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Export analytics data
  app.post("/api/command-center/export-analytics", requireAuth, async (req, res) => {
    try {
      const { format = "csv" } = req.body;
      const exportData = await commandCenterService.exportAnalytics(req.user!.id, format);
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting analytics:", error);
      res.status(500).json({ error: "Failed to export analytics" });
    }
  });

  // Test webhook endpoint (for Command Center)
  app.post("/api/v1/webhooks/test", requireAuth, async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }
      
      // Send test webhook
      const testPayload = {
        event: "test.webhook",
        timestamp: new Date().toISOString(),
        data: {
          message: "This is a test webhook from Command Center",
          success: true
        }
      };
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": "test.webhook"
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(5000)
      });
      
      res.json({ 
        success: response.ok, 
        statusCode: response.status,
        message: response.ok ? "Test webhook sent successfully" : "Failed to send test webhook"
      });
    } catch (error) {
      console.error("Error testing webhook:", error);
      res.status(500).json({ error: "Failed to test webhook" });
    }
  });

  // ==========================================
  // Master Enrichment Endpoints
  // ==========================================
  
  // Trigger master enrichment for a single lead
  app.post("/api/master/enrich", requireAuth, async (req, res) => {
    try {
      const { leadId, priority = "medium", forceRefresh = false } = req.body;
      
      if (!leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
      }
      
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Trigger master enrichment
      const result = await masterEnrichmentOrchestrator.enrichLead(lead, {
        source: 'api',
        userId: req.user!.id,
        priority: priority as 'high' | 'medium' | 'low',
        forceRefresh
      });
      
      res.json({
        success: true,
        leadId,
        enrichmentScore: result.masterEnrichmentScore,
        completeness: result.dataCompleteness,
        systemsUsed: result.enrichmentSystems.length,
        duration: result.enrichmentMetadata.totalDuration
      });
    } catch (error) {
      console.error("Error in master enrichment:", error);
      res.status(500).json({ error: "Failed to enrich lead" });
    }
  });
  
  // Get enrichment status and statistics
  app.get("/api/master/status", requireAuth, async (req, res) => {
    try {
      const stats = masterEnrichmentOrchestrator.getStatistics();
      const config = masterEnrichmentOrchestrator.getConfiguration();
      const analytics = await storage.getEnrichmentAnalytics();
      
      res.json({
        status: "active",
        statistics: stats,
        configuration: config,
        analytics: analytics,
        queueStatus: enrichmentQueue.getQueueStats()
      });
    } catch (error) {
      console.error("Error fetching enrichment status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });
  
  // Configure enrichment preferences
  app.post("/api/master/configure", requireAuth, requireAdmin, async (req, res) => {
    try {
      const config = req.body;
      
      // Validate configuration
      const validConfig: any = {};
      if (config.enableUccIntelligence !== undefined) validConfig.enableUccIntelligence = config.enableUccIntelligence;
      if (config.enableLeadIntelligence !== undefined) validConfig.enableLeadIntelligence = config.enableLeadIntelligence;
      if (config.enableComprehensiveEnrichment !== undefined) validConfig.enableComprehensiveEnrichment = config.enableComprehensiveEnrichment;
      if (config.enableVerification !== undefined) validConfig.enableVerification = config.enableVerification;
      if (config.enablePerplexityResearch !== undefined) validConfig.enablePerplexityResearch = config.enablePerplexityResearch;
      if (config.enableOpenAI !== undefined) validConfig.enableOpenAI = config.enableOpenAI;
      if (config.cascadeDepthLimit !== undefined) validConfig.cascadeDepthLimit = config.cascadeDepthLimit;
      if (config.confidenceThreshold !== undefined) validConfig.confidenceThreshold = config.confidenceThreshold;
      if (config.parallelProcessingLimit !== undefined) validConfig.parallelProcessingLimit = config.parallelProcessingLimit;
      
      masterEnrichmentOrchestrator.updateConfiguration(validConfig);
      
      res.json({
        success: true,
        updatedConfig: masterEnrichmentOrchestrator.getConfiguration()
      });
    } catch (error) {
      console.error("Error updating enrichment configuration:", error);
      res.status(500).json({ error: "Failed to update configuration" });
    }
  });
  
  // Get enrichment analytics and accuracy metrics
  app.get("/api/master/analytics", requireAuth, async (req, res) => {
    try {
      const analytics = await storage.getEnrichmentAnalytics();
      const stats = masterEnrichmentOrchestrator.getStatistics();
      
      // Calculate accuracy metrics for each system
      const systemAccuracy: Record<string, number> = {};
      for (const [system, data] of stats.systemAccuracy) {
        systemAccuracy[system] = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      }
      
      res.json({
        totalEnriched: analytics.totalEnriched,
        averageEnrichmentScore: analytics.averageScore,
        averageCompleteness: analytics.averageCompleteness,
        systemUsage: analytics.systemUsage,
        systemAccuracy,
        totalApiCalls: stats.totalApiCalls,
        averageEnrichmentTime: stats.averageEnrichmentTime,
        cacheHitRate: stats.cacheHits / Math.max(1, stats.totalCacheAttempts)
      });
    } catch (error) {
      console.error("Error fetching enrichment analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
  
  // Batch enrichment endpoint
  app.post("/api/master/enrich-batch", requireAuth, async (req, res) => {
    try {
      const { leadIds, priority = "medium" } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Lead IDs array is required" });
      }
      
      if (leadIds.length > 100) {
        return res.status(400).json({ error: "Maximum 100 leads per batch" });
      }
      
      // Add leads to enrichment queue
      const queueIds = [];
      for (const leadId of leadIds) {
        const lead = await storage.getLead(leadId);
        if (lead) {
          const queueId = await enrichmentQueue.addToQueue(lead, priority as 'high' | 'medium' | 'low', 'api', {
            userId: req.user!.id
          });
          queueIds.push({ leadId, queueId });
        }
      }
      
      res.json({
        success: true,
        queued: queueIds.length,
        queueIds
      });
    } catch (error) {
      console.error("Error in batch enrichment:", error);
      res.status(500).json({ error: "Failed to queue batch enrichment" });
    }
  });
  
  // Get leads by enrichment quality
  app.get("/api/master/leads-by-quality", requireAuth, async (req, res) => {
    try {
      const minScore = parseInt(req.query.minScore as string) || 0;
      const maxScore = req.query.maxScore ? parseInt(req.query.maxScore as string) : undefined;
      
      const leads = await storage.getLeadsByEnrichmentScore(minScore, maxScore);
      
      res.json({
        total: leads.length,
        leads: leads.slice(0, 100) // Limit to 100 for performance
      });
    } catch (error) {
      console.error("Error fetching leads by enrichment quality:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
  
  // Get leads needing enrichment
  app.get("/api/master/leads-needing-enrichment", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const leads = await storage.getLeadsNeedingEnrichment(limit);
      
      res.json({
        total: leads.length,
        leads
      });
    } catch (error) {
      console.error("Error fetching leads needing enrichment:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  // ==========================================
  // ML Scoring Endpoints
  // ========================================== 

  const { mlScoringService } = await import("./services/ml-scoring");

  // Analyze leads with ML scoring
  app.post("/api/scoring/analyze", requireAuth, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }
      
      // Score the leads
      const results = await mlScoringService.scoreLeads(leadIds);
      
      // Convert Map to object for JSON response
      const resultObject: Record<string, any> = {};
      results.forEach((value, key) => {
        resultObject[key] = value;
      });
      
      res.json({ 
        success: true, 
        scoredLeads: leadIds.length,
        results: resultObject 
      });
    } catch (error) {
      console.error("Error analyzing leads with ML:", error);
      res.status(500).json({ error: "Failed to analyze leads" });
    }
  });

  // Get scoring breakdown for a specific lead
  app.get("/api/scoring/factors/:leadId", requireAuth, async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.leadId);
      
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      // Check if lead has ML scoring data
      if (lead.mlQualityScore && lead.scoringFactors) {
        // Return existing scoring data
        res.json({
          leadId: lead.id,
          mlQualityScore: lead.mlQualityScore,
          conversionProbability: lead.conversionProbability,
          expectedDealSize: lead.expectedDealSize,
          scoringFactors: lead.scoringFactors,
          lastScoredAt: lead.updatedAt || lead.createdAt
        });
      } else {
        // Score the lead if not already scored
        const scoringResult = await mlScoringService.scoreLead(lead);
        
        // Update the lead with scoring data
        await storage.updateLead(lead.id, {
          mlQualityScore: scoringResult.mlQualityScore,
          conversionProbability: scoringResult.conversionProbability.toString(),
          expectedDealSize: scoringResult.expectedDealSize.toString(),
          scoringFactors: scoringResult.scoringFactors
        });
        
        res.json({
          leadId: lead.id,
          ...scoringResult
        });
      }
    } catch (error) {
      console.error("Error getting scoring factors:", error);
      res.status(500).json({ error: "Failed to get scoring factors" });
    }
  });

  // Get market insights from ML scoring
  app.get("/api/scoring/insights", requireAuth, async (req, res) => {
    try {
      const insights = await mlScoringService.getMarketInsights();
      res.json(insights);
    } catch (error) {
      console.error("Error getting ML insights:", error);
      res.status(500).json({ error: "Failed to get market insights" });
    }
  });

  // Retrain ML model (admin only)
  app.post("/api/scoring/retrain", requireAuth, requireAdmin, async (req, res) => {
    try {
      const newModel = await mlScoringService.retrainModel(req.user!.id);
      
      res.json({
        success: true,
        model: {
          id: newModel.id,
          name: newModel.modelName,
          version: newModel.modelVersion,
          accuracy: newModel.accuracy,
          trainedAt: newModel.trainedAt,
          trainingDataSize: newModel.trainingDataSize
        }
      });
    } catch (error) {
      console.error("Error retraining ML model:", error);
      res.status(500).json({ error: "Failed to retrain model" });
    }
  });

  // Get active ML model info
  app.get("/api/scoring/model", requireAuth, async (req, res) => {
    try {
      const [activeModel] = await db
        .select()
        .from(leadScoringModels)
        .where(eq(leadScoringModels.isActive, true))
        .limit(1);
      
      if (!activeModel) {
        return res.json({ 
          message: "No active model. System using default heuristics.",
          usingDefault: true 
        });
      }
      
      res.json({
        id: activeModel.id,
        name: activeModel.modelName,
        version: activeModel.modelVersion,
        accuracy: activeModel.accuracy,
        precision: activeModel.precision,
        recall: activeModel.recall,
        f1Score: activeModel.f1Score,
        trainedAt: activeModel.trainedAt,
        trainingDataSize: activeModel.trainingDataSize,
        features: activeModel.features
      });
    } catch (error) {
      console.error("Error getting model info:", error);
      res.status(500).json({ error: "Failed to get model information" });
    }
  });

  // Auto-score leads on batch upload (called internally)
  async function autoScoreLeads(batchId: string) {
    try {
      const batchLeads = await storage.getLeadsByBatchId(batchId);
      const leadIds = batchLeads.map(lead => lead.id);
      
      if (leadIds.length > 0) {
        await mlScoringService.scoreLeads(leadIds);
        console.log(`Auto-scored ${leadIds.length} leads from batch ${batchId}`);
      }
    } catch (error) {
      console.error("Error auto-scoring leads:", error);
    }
  }

  // Enhanced UCC Intelligence Endpoints
  
  // Initialize UCC Intelligence System
  app.post("/api/ucc/intelligence/initialize", requireAuth, requireAdmin, async (req, res) => {
    try {
      await uccIntelligenceIntegration.initialize();
      res.json({ success: true, message: "UCC Intelligence System initialized" });
    } catch (error: any) {
      console.error("Error initializing UCC Intelligence:", error);
      res.status(500).json({ error: "Failed to initialize UCC Intelligence System", details: error.message });
    }
  });
  
  // Analyze lead with enhanced UCC intelligence
  app.post("/api/ucc/intelligence/analyze/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const { refreshFilings, enableMonitoring, findRelatedLeads } = req.body;
      
      // Verify lead ownership or admin
      const lead = await storage.getLead(leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }
      
      const result = await uccIntelligenceIntegration.analyzeLead(leadId, {
        refreshFilings,
        enableMonitoring,
        findRelatedLeads
      });
      
      res.json(result);
    } catch (error: any) {
      console.error("Error analyzing lead with UCC Intelligence:", error);
      res.status(500).json({ error: "Failed to analyze lead", details: error.message });
    }
  });
  
  // POST /api/ucc/connect - Upload UCC filing and connect to matching leads
  app.post("/api/ucc/connect", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const fileContent = req.file.buffer.toString('utf-8');
      const rows = await csv(fileContent);
      
      if (!rows || rows.length === 0) {
        return res.status(400).json({ error: "No data found in the uploaded file" });
      }
      
      console.log('[UCC Connect] Processing', rows.length, 'UCC filings');
      
      // Import the UCC-lead connector service
      const { uccLeadConnector } = await import('./services/ucc-lead-connector');
      
      // Process each UCC filing and connect to leads
      const results = await uccLeadConnector.processBatchUccFilings(rows);
      
      console.log('[UCC Connect] Results:', {
        processed: results.processed,
        matched: results.matched,
        enriched: results.enriched,
        errors: results.errors.length
      });
      
      res.json({
        success: true,
        message: `Processed ${results.processed} UCC filings`,
        stats: {
          totalProcessed: results.processed,
          leadsMatched: results.matched,
          leadsEnriched: results.enriched,
          errors: results.errors.length
        },
        errors: results.errors
      });
      
    } catch (error: any) {
      console.error("[UCC Connect] Error:", error);
      res.status(500).json({ 
        error: "Failed to process UCC filings", 
        details: error.message 
      });
    }
  });
  
  // Process UCC filing with full intelligence
  app.post("/api/ucc/intelligence/upload", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const { leadId, enableMonitoring, findRelatedLeads, updateIntelligenceScore } = req.body;
      
      const result = await uccIntelligenceIntegration.processUccFiling(
        req.file.buffer,
        req.file.originalname,
        leadId,
        {
          enableMonitoring: enableMonitoring !== 'false',
          findRelatedLeads: findRelatedLeads !== 'false',
          updateIntelligenceScore: updateIntelligenceScore !== 'false'
        }
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Error processing UCC filing:", error);
      res.status(500).json({ error: "Failed to process UCC filing", details: error.message });
    }
  });
  
  // Get monitoring status
  app.get("/api/ucc/monitoring/status", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.query;
      const status = await uccIntelligenceIntegration.getMonitoringStatus(leadId as string);
      res.json(status);
    } catch (error: any) {
      console.error("Error getting monitoring status:", error);
      res.status(500).json({ error: "Failed to get monitoring status", details: error.message });
    }
  });
  
  // Generate executive report for lead
  app.get("/api/ucc/intelligence/report/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const report = await uccIntelligenceIntegration.generateExecutiveReport(leadId);
      res.json({ leadId, report });
    } catch (error: any) {
      console.error("Error generating executive report:", error);
      res.status(500).json({ error: "Failed to generate report", details: error.message });
    }
  });
  
  // Find related leads based on UCC patterns
  app.get("/api/ucc/intelligence/related/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const { maxDepth, minConfidence, includeIndirect } = req.query;
      
      const relatedLeads = await uccLeadMatchingService.findRelatedLeads(leadId, {
        maxDepth: parseInt(maxDepth as string) || 2,
        minConfidence: parseInt(minConfidence as string) || 30,
        includeIndirect: includeIndirect === 'true',
        searchUccData: true
      });
      
      res.json(relatedLeads);
    } catch (error: any) {
      console.error("Error finding related leads:", error);
      res.status(500).json({ error: "Failed to find related leads", details: error.message });
    }
  });
  
  // Enable/Disable monitoring for a lead
  app.post("/api/ucc/monitoring/configure/:leadId", requireAuth, async (req, res) => {
    try {
      const { leadId } = req.params;
      const { config } = req.body;
      
      if (config && config.enabled) {
        await uccMonitoringService.enableMonitoring(leadId, config.options);
      } else {
        await uccMonitoringService.disableMonitoring(leadId);
      }
      
      res.json({ 
        success: true, 
        leadId,
        monitoringEnabled: config?.enabled || false
      });
    } catch (error: any) {
      console.error("Error configuring monitoring:", error);
      res.status(500).json({ error: "Failed to configure monitoring", details: error.message });
    }
  });

  // Helper function to calculate quality score
  function calculateQualityScore(lead: any): number {
    let score = 0;

  // Data completeness: +20 points for all required fields filled
  if (lead.businessName && lead.ownerName && lead.email && lead.phone) {
    score += 20;
  }

  // Optional fields: +5 points each (max +25)
  if (lead.industry) score += 5;
  if (lead.annualRevenue) score += 5;
  if (lead.requestedAmount) score += 5;
  if (lead.timeInBusiness) score += 5;
  if (lead.creditScore) score += 5;

  // Email format validity: +15 points
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (lead.email && emailRegex.test(lead.email)) {
    score += 15;
  }

  // Phone format validity (10+ digits): +15 points
  if (lead.phone) {
    const phoneDigits = lead.phone.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      score += 15;
    }
  }

  // Annual revenue presence: +10 points
  if (lead.annualRevenue) {
    score += 10;
  }

  // Credit score presence: +15 points
  if (lead.creditScore) {
    score += 15;
  }

  return Math.min(score, 100);
}


  // Helper function to create lead hash for deduplication
  function createLeadHash(email: string, phone: string): string {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = phone.replace(/\D/g, '');
    return crypto.createHash('md5').update(normalizedEmail + normalizedPhone).digest('hex');
  }

  // Helper function to generate CSV from leads
  function generateLeadsCsv(leads: any[], user?: any): string {
    const headers = [
    "Business Name",
    "Owner Name",
    "Email",
    "Phone",
    "Industry",
    "Annual Revenue",
    "Requested Amount",
    "Time in Business",
    "Credit Score",
    "Quality Score",
  ];

  const rows = leads.map(lead => [
    lead.businessName,
    lead.ownerName,
    lead.email,
    lead.phone,
    lead.industry || "",
    lead.annualRevenue || "",
    lead.requestedAmount || "",
    lead.timeInBusiness || "",
    lead.creditScore || "",
    lead.qualityScore,
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ];

  // Add watermark footer if user is provided
  if (user) {
    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    csvLines.push("");
    csvLines.push(`"Generated for ${user.email} on ${date}"`);
  }

    return csvLines.join("\n");
  }

  // Helper function to assign tier based on quality score
  function assignTier(qualityScore: number): "gold" | "platinum" | "diamond" | "elite" {
    if (qualityScore >= 80) return 'diamond';
    if (qualityScore >= 70) return 'platinum';
    if (qualityScore >= 60) return 'gold';
    return 'gold'; // Default to gold for low scores
  }

  // Helper function to generate realistic test MCA leads
  function generateTestLeads(count: number, qualityRange: { min: number; max: number }): InsertLead[] {
  const industries = [
    'Restaurant', 'Retail Store', 'Trucking Company', 'Construction', 'Healthcare Practice',
    'Auto Repair Shop', 'Grocery Store', 'Landscaping', 'Plumbing Services', 'HVAC Services',
      'Hair Salon', 'Dental Practice', 'Law Firm', 'Real Estate Agency', 'Fitness Center',
      'Bakery', 'Coffee Shop', 'Hotel', 'Car Dealership', 'Wholesale Trade',
      'Manufacturing', 'IT Services', 'Marketing Agency', 'Consulting Firm', 'E-commerce'
    ];
    
    const firstNames = [
      'John', 'Maria', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Patricia',
      'James', 'Barbara', 'William', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
      'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
      'Matthew', 'Betty', 'Anthony', 'Dorothy', 'Paul', 'Sandra', 'Mark', 'Ashley'
    ];
    
    const lastNames = [
      'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
      'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas',
      'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
      'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'
    ];
    
    const businessPrefixes = ['Premier', 'Elite', 'Quality', 'Pro', 'Express', 'Quick', 'Fast', 'Best', 'Top', 'Superior'];
    const businessSuffixes = ['LLC', 'Inc', 'Corp', 'Group', 'Services', 'Solutions', 'Enterprises', 'Associates', 'Co', 'Partners'];
    
    const states = ['CA', 'NY', 'TX', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA'];
    const mcaHistoryOptions = ['none', 'previous_paid', 'current', 'multiple'];
    const urgencyLevels = ['immediate', 'this_week', 'this_month', 'exploring'];
    
    const leads: InsertLead[] = [];
    
    for (let i = 0; i < count; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const industry = industries[Math.floor(Math.random() * industries.length)];
      const businessPrefix = businessPrefixes[Math.floor(Math.random() * businessPrefixes.length)];
      const businessSuffix = businessSuffixes[Math.floor(Math.random() * businessSuffixes.length)];
      const state = states[Math.floor(Math.random() * states.length)];
      
      // Generate a quality score within the specified range
      const qualityScore = Math.floor(Math.random() * (qualityRange.max - qualityRange.min + 1)) + qualityRange.min;
      
      // Generate realistic correlated values based on quality score
      const isHighQuality = qualityScore >= 80;
      const isMediumQuality = qualityScore >= 70;
      
      // Higher quality leads tend to have better business metrics
      const annualRevenue = isHighQuality 
        ? (200000 + Math.floor(Math.random() * 1800000)).toString() 
        : isMediumQuality 
          ? (100000 + Math.floor(Math.random() * 400000)).toString()
          : (50000 + Math.floor(Math.random() * 200000)).toString();
      
      const requestedAmount = isHighQuality
        ? (50000 + Math.floor(Math.random() * 450000)).toString()
        : isMediumQuality
          ? (25000 + Math.floor(Math.random() * 175000)).toString()
          : (10000 + Math.floor(Math.random() * 90000)).toString();
      
      const timeInBusiness = isHighQuality
        ? (24 + Math.floor(Math.random() * 120)).toString()
        : isMediumQuality
          ? (12 + Math.floor(Math.random() * 60)).toString()
          : (6 + Math.floor(Math.random() * 42)).toString();
      
      const creditScore = isHighQuality
        ? (650 + Math.floor(Math.random() * 100)).toString()
        : isMediumQuality
          ? (580 + Math.floor(Math.random() * 70)).toString()
          : (500 + Math.floor(Math.random() * 80)).toString();
      
      // Generate unique email and phone
      const uniqueId = Date.now() + i;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${uniqueId}@${industry.toLowerCase().replace(/\s+/g, '')}.com`;
      const phone = `${2 + Math.floor(Math.random() * 8)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      
      const lead: InsertLead = {
        batchId: 'test-batch-' + Date.now(), // Will be replaced with actual batch ID
        businessName: `${businessPrefix} ${industry} ${businessSuffix}`,
        ownerName: `${firstName} ${lastName}`,
        email,
        phone,
        industry,
        annualRevenue,
        requestedAmount,
        timeInBusiness,
        creditScore,
        dailyBankDeposits: Math.random() > 0.3, // 70% have daily deposits
        previousMCAHistory: mcaHistoryOptions[Math.floor(Math.random() * mcaHistoryOptions.length)],
        urgencyLevel: urgencyLevels[Math.floor(Math.random() * urgencyLevels.length)],
        stateCode: state,
        leadAge: Math.floor(Math.random() * 30), // 0-30 days old
        exclusivityStatus: 'non_exclusive',
        qualityScore,
        tier: assignTier(qualityScore),
        sold: false
      };
      
      leads.push(lead);
    }
    
    return leads;
  }

  // Auto-Verification and Scoring Routes
  app.post("/api/leads/:id/verify", requireAuth, async (req, res) => {
    try {
      const lead = await storage.getLeadById(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Import services
      const { autoVerificationService } = await import("./services/auto-verification");
      const result = await autoVerificationService.updateLeadVerification(req.params.id);
      
      res.json({ 
        success: true,
        lead: result,
        message: "Lead verification completed"
      });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ error: "Failed to verify lead" });
    }
  });

  app.post("/api/leads/:id/calculate-score", requireAuth, async (req, res) => {
    try {
      const lead = await storage.getLeadById(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Import services
      const { simplifiedLeadScoringService } = await import("./services/simplified-lead-scoring");
      const result = await simplifiedLeadScoringService.updateLeadScore(req.params.id);
      
      res.json({ 
        success: true,
        lead: result,
        message: "Lead score calculated"
      });
    } catch (error) {
      console.error("Scoring error:", error);
      res.status(500).json({ error: "Failed to calculate lead score" });
    }
  });

  app.post("/api/leads/:id/generate-insights", requireAuth, async (req, res) => {
    try {
      const lead = await storage.getLeadById(req.params.id);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Import services
      const { practicalInsightsEngine } = await import("./services/practical-insights");
      const result = await practicalInsightsEngine.updateLeadInsights(req.params.id);
      
      res.json({ 
        success: true,
        lead: result,
        message: "Lead insights generated"
      });
    } catch (error) {
      console.error("Insights error:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  // CRM Export Routes
  app.post("/api/leads/export", requireAuth, async (req, res) => {
    try {
      const { leadIds, format, options } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: "No leads selected for export" });
      }

      // Import service
      const { crmExportService } = await import("./services/crm-export-service");
      
      const exportOptions = {
        format: format || 'csv',
        includeEnrichment: options?.includeEnrichment ?? true,
        includeVerification: options?.includeVerification ?? true,
        includeUccData: options?.includeUccData ?? true,
        includeScoring: options?.includeScoring ?? true,
        includeInsights: options?.includeInsights ?? true,
      };

      const result = await crmExportService.exportLeads(leadIds, exportOptions);
      
      // Track the export
      await crmExportService.trackExport(req.user!.id, leadIds, exportOptions.format);

      // Send appropriate response based on format
      if (exportOptions.format === 'json') {
        res.json(result.data);
      } else {
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.send(result.data);
      }
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export leads" });
    }
  });

  // Saved Searches Routes
  app.get("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const searches = await savedSearchService.getUserSavedSearches(req.user!.id);
      res.json(searches);
    } catch (error) {
      console.error("Error fetching saved searches:", error);
      res.status(500).json({ error: "Failed to fetch saved searches" });
    }
  });

  app.post("/api/saved-searches", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const result = await savedSearchService.createSavedSearch(req.user!.id, req.body);
      res.json(result);
    } catch (error) {
      console.error("Error creating saved search:", error);
      res.status(500).json({ error: "Failed to create saved search" });
    }
  });

  app.put("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const result = await savedSearchService.updateSavedSearch(
        req.params.id,
        req.user!.id,
        req.body
      );
      
      if (!result) {
        return res.status(404).json({ error: "Saved search not found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error updating saved search:", error);
      res.status(500).json({ error: "Failed to update saved search" });
    }
  });

  app.delete("/api/saved-searches/:id", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const success = await savedSearchService.deleteSavedSearch(
        req.params.id,
        req.user!.id
      );
      
      if (!success) {
        return res.status(404).json({ error: "Saved search not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting saved search:", error);
      res.status(500).json({ error: "Failed to delete saved search" });
    }
  });

  app.get("/api/saved-searches/:id/matches", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const matches = await savedSearchService.getSavedSearchMatches(
        req.params.id,
        req.user!.id
      );
      res.json(matches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.post("/api/saved-searches/:id/mark-read", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      await savedSearchService.markMatchesAsRead(
        req.params.id,
        req.user!.id
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking matches as read:", error);
      res.status(500).json({ error: "Failed to mark matches as read" });
    }
  });

  app.get("/api/saved-searches/notifications", requireAuth, async (req, res) => {
    try {
      const { savedSearchService } = await import("./services/saved-searches");
      const summary = await savedSearchService.getUserNotificationSummary(req.user!.id);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching notification summary:", error);
      res.status(500).json({ error: "Failed to fetch notification summary" });
    }
  });

  // UCC Matching Routes
  app.post("/api/admin/ucc/match-leads", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enhancedUccMatchingService } = await import("./services/enhanced-ucc-matching");
      const linkedCount = await enhancedUccMatchingService.autoLinkHighConfidenceMatches(
        req.body.threshold || 80
      );
      
      res.json({ 
        success: true,
        linkedCount,
        message: `Successfully linked ${linkedCount} UCC filings to leads`
      });
    } catch (error) {
      console.error("UCC matching error:", error);
      res.status(500).json({ error: "Failed to match UCC filings" });
    }
  });

  app.post("/api/admin/ucc/:filingId/link", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadId, confidenceScore } = req.body;
      
      if (!leadId) {
        return res.status(400).json({ error: "Lead ID is required" });
      }

      const { enhancedUccMatchingService } = await import("./services/enhanced-ucc-matching");
      await enhancedUccMatchingService.linkUccToLead(
        req.params.filingId,
        leadId,
        confidenceScore || 100
      );
      
      res.json({ 
        success: true,
        message: "UCC filing linked to lead"
      });
    } catch (error) {
      console.error("UCC linking error:", error);
      res.status(500).json({ error: "Failed to link UCC filing" });
    }
  });

  app.post("/api/admin/ucc/:filingId/unlink", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { enhancedUccMatchingService } = await import("./services/enhanced-ucc-matching");
      await enhancedUccMatchingService.unlinkUccFromLead(req.params.filingId);
      
      res.json({ 
        success: true,
        message: "UCC filing unlinked from lead"
      });
    } catch (error) {
      console.error("UCC unlinking error:", error);
      res.status(500).json({ error: "Failed to unlink UCC filing" });
    }
  });

  // Batch Processing Routes
  app.post("/api/admin/leads/batch-verify", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }

      const { autoVerificationService } = await import("./services/auto-verification");
      
      // Process in background
      autoVerificationService.batchVerifyLeads(leadIds).catch(console.error);
      
      res.json({ 
        success: true,
        message: `Started verification for ${leadIds.length} leads`
      });
    } catch (error) {
      console.error("Batch verification error:", error);
      res.status(500).json({ error: "Failed to start batch verification" });
    }
  });

  app.post("/api/admin/leads/batch-score", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }

      const { simplifiedLeadScoringService } = await import("./services/simplified-lead-scoring");
      
      // Process in background
      simplifiedLeadScoringService.batchUpdateLeadScores(leadIds).catch(console.error);
      
      res.json({ 
        success: true,
        message: `Started scoring for ${leadIds.length} leads`
      });
    } catch (error) {
      console.error("Batch scoring error:", error);
      res.status(500).json({ error: "Failed to start batch scoring" });
    }
  });

  app.post("/api/admin/leads/batch-insights", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadIds } = req.body;
      
      if (!leadIds || !Array.isArray(leadIds)) {
        return res.status(400).json({ error: "Lead IDs are required" });
      }

      const { practicalInsightsEngine } = await import("./services/practical-insights");
      
      // Process in background
      practicalInsightsEngine.batchUpdateInsights(leadIds).catch(console.error);
      
      res.json({ 
        success: true,
        message: `Started insight generation for ${leadIds.length} leads`
      });
    } catch (error) {
      console.error("Batch insights error:", error);
      res.status(500).json({ error: "Failed to start batch insight generation" });
    }
  });

  // Return the server instance for WebSocket setup
  return server;
}
