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
import { 
  sendOrderConfirmation, 
  sendDownloadReady, 
  sendAdminAlert, 
  sendContactFormNotification 
} from "./email";
import { LeadVerificationEngine, StrictnessLevel } from "./lead-verification";
import { AIVerificationEngine } from "./ai-verification";

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
  gold: { price: 500, leadsPerPurchase: 50 },
  platinum: { price: 1500, leadsPerPurchase: 200 },
  diamond: { price: 4000, leadsPerPurchase: 600 },
  elite: { price: 0, leadsPerPurchase: 0 }, // Contact sales
};

// Comprehensive column mapping for flexible field detection
const COLUMN_MAPPINGS = {
  businessName: [
    'businessname', 'business name', 'business_name', 'business-name',
    'company name', 'companyname', 'company_name', 'company-name', 
    'company', 'business', 'dba', 'legal name', 'legal_name',
    'firm name', 'firm_name', 'organization', 'corp', 'corporation',
    'enterprise', 'establishment', 'vendor', 'merchant', 'merchant name'
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
    'street1', 'street 1', 'street_1', 'main address', 'physical address'
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
 * Flexible column mapper that handles case-insensitive matching,
 * partial matching, and various formats
 */
function mapColumnToField(columnName: string): string | null {
  if (!columnName) return null;
  
  // Normalize the column name: lowercase, remove extra spaces, replace separators
  const normalized = columnName
    .toLowerCase()
    .trim()
    .replace(/[\s\-_\.]+/g, ' ')  // Replace separators with space
    .replace(/\s+/g, ' ');  // Remove multiple spaces
  
  // Debug logging for specific problematic columns
  if (columnName.toLowerCase().includes('company') || columnName.toLowerCase().includes('owner')) {
    console.log(`Mapping column "${columnName}" -> normalized: "${normalized}"`);
  }
  
  // DIRECT MAPPING for user's exact column names
  const directMap: Record<string, string> = {
    'company name': 'businessName',
    'owner name': 'ownerName',
    'phone1': 'phone',
    'phone2': 'phone'
  };
  
  if (directMap[normalized]) {
    console.log(`  -> Direct mapping: "${normalized}" to "${directMap[normalized]}"`);
    return directMap[normalized];
  }
  
  // Check exact matches first
  for (const [field, patterns] of Object.entries(COLUMN_MAPPINGS)) {
    if (patterns.includes(normalized)) {
      if (columnName.toLowerCase().includes('company') || columnName.toLowerCase().includes('owner')) {
        console.log(`  -> Matched to field: ${field}`);
      }
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
function parseCSVFile(buffer: Buffer, filename: string): { rows: any[], headers: string[] } {
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
  
  console.log(`Parsing CSV with encoding: ${usedEncoding}`);
  
  const parseResult = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
    dynamicTyping: false,  // Keep everything as strings for consistency
    delimitersToGuess: [',', '\t', '|', ';', Papa.RECORD_SEP, Papa.UNIT_SEP]
  });
  
  if (parseResult.errors.length > 0) {
    // Log errors but try to continue if we have some data
    console.warn('CSV parsing warnings:', parseResult.errors);
    
    if (!parseResult.data || parseResult.data.length === 0) {
      throw new Error('CSV parsing failed: ' + parseResult.errors.map(e => e.message).join(', '));
    }
  }
  
  const rows = parseResult.data as any[];
  const headers = parseResult.meta.fields || [];
  
  return { rows, headers };
}

/**
 * Normalize and map lead data with flexible column detection
 */
function normalizeLeadData(row: any, debug: boolean = false): any {
  const normalized: any = {};
  const unmappedFields: any = {};
  
  for (const [originalKey, value] of Object.entries(row)) {
    if (!value || String(value).trim() === '') continue;
    
    const mappedField = mapColumnToField(originalKey);
    
    if (mappedField) {
      // Special handling for boolean fields
      if (mappedField === 'dailyBankDeposits') {
        const strValue = String(value).toLowerCase();
        normalized[mappedField] = strValue === 'true' || strValue === 'yes' || 
                                  strValue === '1' || strValue === 'y';
      } else {
        normalized[mappedField] = String(value).trim();
      }
    } else {
      // Keep unmapped fields for potential use
      unmappedFields[originalKey] = value;
    }
  }
  
  // Set defaults for optional fields
  normalized.previousMCAHistory = normalized.previousMCAHistory || 'none';
  normalized.urgencyLevel = normalized.urgencyLevel || 'exploring';
  normalized.exclusivityStatus = normalized.exclusivityStatus || 'non_exclusive';
  normalized.leadAge = normalized.leadAge || 0;
  
  if (debug) {
    console.log('Column mapping result:', {
      mapped: Object.keys(normalized),
      unmapped: Object.keys(unmappedFields)
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
        const fieldPatterns = COLUMN_MAPPINGS[field] || [];
        
        for (const key of unmappedKeys) {
          const normalizedKey = key.toLowerCase();
          if (fieldPatterns.some(p => normalizedKey.includes(p) || p.includes(normalizedKey))) {
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
      await storage.createLeads(leadsToInsert);
      
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
          const result = parseCSVFile(file.buffer, file.originalname);
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

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedRow.email)) {
          validationResults.errors.push({
            row: rowNum,
            error: "Invalid email format",
            data: normalizedRow,
          });
          continue;
        }

        // Validate phone format (at least 10 digits)
        const phoneDigits = normalizedRow.phone.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
          validationResults.errors.push({
            row: rowNum,
            error: "Invalid phone format (minimum 10 digits required)",
            data: normalizedRow,
          });
          continue;
        }

        // Check for duplicates
        const leadHash = createLeadHash(normalizedRow.email, normalizedRow.phone);
        if (leadHashes.has(leadHash)) {
          validationResults.warnings.push({
            row: rowNum,
            warning: "Duplicate lead (same email and phone)",
            data: normalizedRow,
          });
          continue;
        }
        leadHashes.add(leadHash);

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

      // Upload original CSV to object storage (if configured)
      let storageKey = `batches/${Date.now()}_${file.originalname}`;
      if (isObjectStorageConfigured() && s3Client) {
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey,
          Body: file.buffer,
          ContentType: 'text/csv',
        }));
      } else {
        // If object storage not configured, just use a placeholder key
        storageKey = `local_${storageKey}`;
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
        businessName: lead.businessName?.trim(),
        ownerName: lead.ownerName?.trim(),
        email: lead.email?.trim().toLowerCase(),
        phone: lead.phone?.trim(),
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

      await storage.createLeads(leadsToInsert);

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
          const result = parseCSVFile(file.buffer, file.originalname);
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
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      
      // Debug logging
      console.log('AI verify-upload file received:', file.originalname, file.mimetype, file.size);
      
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
          const result = parseCSVFile(file.buffer, file.originalname);
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
      
      // Run AI-powered verification
      const aiVerificationEngine = new AIVerificationEngine(strictnessLevel);
      const verificationResults = await aiVerificationEngine.verifyBatchWithAI(normalizedLeads, createdSession.id);
      
      // Save verification results
      await storage.createVerificationResults(verificationResults);
      
      // Calculate summary stats including AI insights
      const verifiedCount = verificationResults.filter(r => r.status === 'verified').length;
      const warningCount = verificationResults.filter(r => r.status === 'warning').length;
      const failedCount = verificationResults.filter(r => r.status === 'failed').length;
      const duplicateCount = verificationResults.filter(r => r.isDuplicate).length;
      
      // Calculate average confidence score from AI insights
      const avgConfidence = verificationResults.reduce((sum, r) => {
        const confidence = r.leadData?.aiInsights?.confidenceScore || 0;
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
      
      res.json({
        success: true,
        sessionId: createdSession.id,
        summary: {
          totalLeads: normalizedLeads.length,
          verifiedCount,
          warningCount,
          failedCount,
          duplicateCount,
          strictnessLevel,
          averageConfidenceScore: Math.round(avgConfidence),
          aiPowered: true
        }
      });
      
    } catch (error) {
      console.error("AI Verification error:", error);
      res.status(500).json({ error: "Failed to verify leads with AI" });
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
          const result = parseCSVFile(file.buffer, file.originalname);
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
        recommendations: []
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
          businessName: leadData.businessName?.trim(),
          ownerName: leadData.ownerName?.trim(),
          email: leadData.email?.trim().toLowerCase(),
          phone: result.phoneValidation?.formatted || leadData.phone?.trim(),
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
          tier,
          sold: false
        });
      }
      
      // Import leads
      await storage.createLeads(leadsToImport);
      
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
          tier,
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
      
      // Get base URL for redirect - use Replit URL or fallback
      const baseUrl = process.env.REPLIT_DOMAINS ? 
        `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 
        req.headers.origin || `http://localhost:${PORT}`;
      
      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${tierConfig.name} Package`,
                description: `${tierConfig.leadCount} high-quality MCA leads`,
                metadata: {
                  tier,
                  leadCount: tierConfig.leadCount.toString(),
                }
              },
              unit_amount: tierConfig.price, // Price is already in cents
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

  const httpServer = createServer(app);
  return httpServer;
}

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

// Helper function to assign tier based on quality score
// 60-69 = gold, 70-79 = platinum, 80-100 = diamond
function assignTier(qualityScore: number): string {
  if (qualityScore >= 80) return 'diamond';
  if (qualityScore >= 70) return 'platinum';
  if (qualityScore >= 60) return 'gold';
  return 'gold'; // Default to gold for scores below 60
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
