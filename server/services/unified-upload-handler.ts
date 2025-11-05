import { storage } from "../storage";
import { IntelligenceBrain, intelligenceBrain } from "./intelligence-brain";
import { MasterDatabaseService } from "./master-database";
import { costOptimization } from "./cost-optimization";
import { eventBus } from "./event-bus";
import type { Lead, InsertLead, LeadBatch } from "@shared/schema";
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { z } from "zod";
import crypto from 'crypto';
import { FieldMapper, CanonicalField, FIELD_VALIDATORS, fieldMapper } from '../intelligence/ontology';
import { openAIService } from './openai-service';
import { DataCompletenessAnalyzer, type AnalysisReport, type BatchAnalysisReport } from './data-completeness-analyzer';
import type { EnrichmentDecision } from "./intelligence-brain";

interface UploadResult {
  batchId: string;
  totalProcessed: number;
  successfulImports: number;
  enrichedCount: number;
  failedCount: number;
  duplicatesSkipped: number;
  validationErrors: Array<{
    row: number;
    field: string;
    error: string;
  }>;
  intelligenceDecisions: Array<{
    leadId: string;
    strategy: string;
    confidence: number;
  }>;
  estimatedCost: number;
  processingTime: number;
  // Data completeness analysis
  analysisReport?: BatchAnalysisReport;
  dataQualityMetrics?: {
    avgCompletenessScore: number;
    avgQualityScore: number;
    avgFreshnessScore: number;
    leadsNeedingEnrichment: number;
    leadsReadyToSell: number;
  };
  enrichmentOpportunities?: {
    totalEstimatedCost: number;
    expectedQualityGain: number;
    priorityBreakdown: Record<string, number>;
  };
  // Intelligence Brain analysis
  brainAnalysis?: {
    totalDecisions: number;
    estimatedTotalCost: number;
    expectedQualityGain: number;
    groupedStrategies: Record<string, string[]>;
    costOptimizations: string[];
    priorityOrder: string[];
    enrichmentJobs: Array<{
      leadId: string;
      priority: number;
      estimatedTime: number;
    }>;
  };
  // Automatic enrichment summary
  automaticEnrichmentSummary?: {
    totalQueued: number;
    totalSkipped: number;
    totalFailed: number;
    estimatedCompletionTime: number;
  };
}

interface FileFormat {
  type: 'csv' | 'xlsx' | 'json' | 'api' | 'text' | 'ucc';
  headers?: string[];
  delimiter?: string;
  encoding?: string;
}

interface ParsedLead {
  rawData: Record<string, any>;
  mappedData: Partial<InsertLead>;
  confidence: number;
  detectedFormat?: string;
}

// Flexible field mapping patterns
const FIELD_MAPPINGS = {
  businessName: [
    'business_name', 'company', 'company_name', 'business', 'name', 
    'organization', 'org', 'vendor', 'client', 'customer', 'firm',
    'business_entity', 'dba', 'trade_name', 'legal_name'
  ],
  ownerName: [
    'owner_name', 'owner', 'contact', 'contact_name', 'person', 
    'representative', 'manager', 'ceo', 'founder', 'proprietor',
    'principal', 'contact_person', 'full_name', 'name'
  ],
  phone: [
    'phone', 'telephone', 'tel', 'mobile', 'cell', 'contact_number',
    'phone_number', 'business_phone', 'office_phone', 'main_phone'
  ],
  email: [
    'email', 'email_address', 'mail', 'e-mail', 'contact_email',
    'business_email', 'owner_email', 'primary_email'
  ],
  address: [
    'address', 'street', 'street_address', 'location', 'business_address',
    'mailing_address', 'physical_address', 'address_line_1', 'address1'
  ],
  city: [
    'city', 'town', 'municipality', 'locality', 'business_city'
  ],
  state: [
    'state', 'province', 'region', 'state_code', 'st', 'business_state'
  ],
  zipCode: [
    'zip', 'zip_code', 'zipcode', 'postal_code', 'postcode', 'postal'
  ],
  industry: [
    'industry', 'sector', 'business_type', 'category', 'vertical',
    'line_of_business', 'sic', 'naics', 'business_category'
  ],
  annualRevenue: [
    'annual_revenue', 'revenue', 'yearly_revenue', 'sales', 
    'annual_sales', 'gross_revenue', 'income', 'turnover'
  ],
  employeeCount: [
    'employee_count', 'employees', 'staff', 'headcount', 'team_size',
    'number_of_employees', 'staff_count', 'company_size'
  ],
  yearFounded: [
    'year_founded', 'founded', 'established', 'inception', 'since',
    'establishment_year', 'founding_year', 'year_established'
  ],
  timeInBusiness: [
    'time_in_business', 'years_in_business', 'business_age', 'tenure',
    'years_operating', 'operating_years'
  ],
  creditScore: [
    'credit_score', 'credit', 'score', 'credit_rating', 'fico',
    'business_credit_score', 'creditworthiness'
  ],
  websiteUrl: [
    'website', 'website_url', 'url', 'web', 'homepage', 'site',
    'web_address', 'domain', 'company_website'
  ],
  linkedinUrl: [
    'linkedin', 'linkedin_url', 'linkedin_profile', 'social_linkedin'
  ],
  uccNumber: [
    'ucc_number', 'ucc', 'filing_number', 'ucc_filing', 'lien_number',
    'security_interest', 'ucc_id', 'filing_id'
  ],
  businessDescription: [
    'description', 'business_description', 'summary', 'about', 
    'company_description', 'overview', 'profile'
  ],
  tags: [
    'tags', 'labels', 'categories', 'keywords', 'segments'
  ],
  source: [
    'source', 'lead_source', 'origin', 'channel', 'referral',
    'acquired_from', 'data_source'
  ],
  urgencyLevel: [
    'urgency', 'urgency_level', 'priority', 'importance', 'timeline',
    'needs_funding', 'funding_urgency'
  ]
};

export class UnifiedUploadHandler {
  private intelligenceBrain: IntelligenceBrain;
  private masterDatabase: MasterDatabaseService;
  private dataAnalyzer: DataCompletenessAnalyzer;
  
  constructor() {
    // Use singleton instance to ensure consistent state across the application
    this.intelligenceBrain = intelligenceBrain;
    this.masterDatabase = new MasterDatabaseService();
    this.dataAnalyzer = new DataCompletenessAnalyzer();
  }

  async processUpload(
    file: Buffer | string,
    fileName: string,
    userId: string,
    options: {
      autoEnrich?: boolean;
      validateDuplicates?: boolean;
      sourceName?: string;
      batchTags?: string[];
      intelligentProcessing?: boolean;
    } = {}
  ): Promise<UploadResult> {
    const startTime = Date.now();
    const batchId = `batch-${crypto.randomUUID()}`;
    
    // Detect file format
    const format = this.detectFileFormat(fileName, file);
    
    // Parse file into leads
    const parsedLeads = await this.parseFile(file, format);
    
    // Create batch record
    const batch = await this.createBatch(batchId, userId, fileName, parsedLeads.length, options);
    
    // Process leads with intelligence
    const result = await this.processLeadsIntelligently(
      parsedLeads, 
      batch, 
      userId, 
      options
    );
    
    // Calculate processing time
    result.processingTime = Date.now() - startTime;
    
    // Emit completion event
    eventBus.emit('upload:completed', result);
    
    return result;
  }

  private detectFileFormat(fileName: string, content: Buffer | string): FileFormat {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'csv':
        return { 
          type: 'csv',
          delimiter: this.detectCsvDelimiter(content.toString())
        };
      case 'xlsx':
      case 'xls':
        return { type: 'xlsx' };
      case 'json':
        return { type: 'json' };
      case 'txt':
        return { 
          type: 'text',
          delimiter: this.detectTextDelimiter(content.toString())
        };
      default:
        // Try to auto-detect format
        return this.autoDetectFormat(content);
    }
  }

  private detectCsvDelimiter(content: string): string {
    const firstLine = content.split('\n')[0];
    const delimiters = [',', '\t', '|', ';'];
    
    let maxCount = 0;
    let bestDelimiter = ',';
    
    for (const delimiter of delimiters) {
      const count = (firstLine.match(new RegExp(delimiter, 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        bestDelimiter = delimiter;
      }
    }
    
    return bestDelimiter;
  }

  private detectTextDelimiter(content: string): string {
    // Similar to CSV but for text files
    return this.detectCsvDelimiter(content);
  }

  private autoDetectFormat(content: Buffer | string): FileFormat {
    const str = content.toString().trim();
    
    // Check if JSON
    if (str.startsWith('[') || str.startsWith('{')) {
      try {
        JSON.parse(str);
        return { type: 'json' };
      } catch {}
    }
    
    // Check if structured text (CSV-like)
    if (str.includes(',') || str.includes('\t') || str.includes('|')) {
      return {
        type: 'csv',
        delimiter: this.detectCsvDelimiter(str)
      };
    }
    
    // Default to text
    return { type: 'text' };
  }

  private async parseFile(content: Buffer | string, format: FileFormat): Promise<ParsedLead[]> {
    switch (format.type) {
      case 'csv':
        return this.parseCsv(content.toString(), format.delimiter);
      case 'xlsx':
        return this.parseExcel(content as Buffer);
      case 'json':
        return this.parseJson(content.toString());
      case 'text':
        return this.parseText(content.toString(), format.delimiter);
      case 'ucc':
        return this.parseUccFile(content.toString());
      default:
        throw new Error(`Unsupported file format: ${format.type}`);
    }
  }

  private async parseCsv(content: string, delimiter = ','): Promise<ParsedLead[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(content, {
        delimiter,
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),  // Keep original header for better mapping
        complete: async (results) => {
          const leads = await Promise.all(
            results.data.map(row => this.mapFieldsIntelligently(row))
          );
          resolve(leads);
        },
        error: reject
      });
    });
  }

  private async parseExcel(buffer: Buffer): Promise<ParsedLead[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    
    // Convert to JSON with headers
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: 'yyyy-mm-dd'
    });
    
    return await Promise.all(jsonData.map(row => this.mapFieldsIntelligently(row)));
  }

  private async parseJson(content: string): Promise<ParsedLead[]> {
    try {
      const data = JSON.parse(content);
      const array = Array.isArray(data) ? data : [data];
      return await Promise.all(array.map(row => this.mapFieldsIntelligently(row)));
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error}`);
    }
  }

  private async parseText(content: string, delimiter?: string): Promise<ParsedLead[]> {
    // Parse delimited text or unstructured text
    if (delimiter) {
      const lines = content.split('\n').filter(line => line.trim());
      const headers = lines[0].split(delimiter).map(h => h.trim());
      
      const rows = await Promise.all(lines.slice(1).map(async line => {
        const values = line.split(delimiter);
        const row: Record<string, any> = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim() || '';
        });
        return this.mapFieldsIntelligently(row);
      }));
      
      return rows;
    } else {
      // Attempt to extract structured data from unstructured text
      return this.parseUnstructuredText(content);
    }
  }

  private async parseUnstructuredText(content: string): Promise<ParsedLead[]> {
    const leads: ParsedLead[] = [];
    const blocks = content.split(/\n\n+/);
    
    for (const block of blocks) {
      // First try AI extraction for better results
      let extractedData = await openAIService.extractLeadFromText(block);
      
      // If AI didn't find much, try pattern matching
      if (Object.keys(extractedData).length < 3) {
        extractedData = { ...this.extractDataFromText(block), ...extractedData };
      }
      
      if (Object.keys(extractedData).length > 2) {
        // Map the extracted data through our intelligent mapper
        const mapped = await this.mapFieldsIntelligently(extractedData);
        leads.push(mapped);
      }
    }
    
    return leads;
  }

  private extractDataFromText(text: string): Partial<InsertLead> {
    const extracted: Partial<InsertLead> = {};
    
    // Phone number patterns
    const phoneMatch = text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
    if (phoneMatch) extracted.phone = phoneMatch[0];
    
    // Email patterns
    const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) extracted.email = emailMatch[0];
    
    // Website patterns
    const urlMatch = text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b/);
    if (urlMatch) extracted.websiteUrl = urlMatch[0];
    
    // State patterns
    const stateMatch = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i);
    if (stateMatch) extracted.state = stateMatch[0].toUpperCase();
    
    // ZIP code patterns
    const zipMatch = text.match(/\b\d{5}(-\d{4})?\b/);
    if (zipMatch) extracted.zipCode = zipMatch[0];
    
    // Try to extract business name (typically at the beginning or in caps)
    const lines = text.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      if (firstLine.length > 3 && firstLine.length < 100) {
        extracted.businessName = firstLine;
      }
    }
    
    return extracted;
  }

  private async parseUccFile(content: string): Promise<ParsedLead[]> {
    // Special parsing for UCC filing data
    const leads: ParsedLead[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.includes('UCC') || line.includes('Filing')) {
        const uccData = this.extractUccData(line);
        if (uccData.businessName || uccData.ownerName) {
          leads.push({
            rawData: { uccLine: line },
            mappedData: uccData,
            confidence: 0.8
          });
        }
      }
    }
    
    return leads;
  }

  private extractUccData(line: string): Partial<InsertLead> {
    const data: Partial<InsertLead> = {};
    
    // Extract UCC number
    const uccMatch = line.match(/\b\d{4}-?\d{8}-?\d{1}\b/);
    if (uccMatch) data.uccNumber = uccMatch[0];
    
    // Extract state from UCC format
    const stateMatch = line.match(/\b[A-Z]{2}\b/);
    if (stateMatch) data.state = stateMatch[0];
    
    // Extract business name (typically after "Debtor:" or similar)
    const businessMatch = line.match(/(?:Debtor|Business|Company):\s*([^,;]+)/i);
    if (businessMatch) data.businessName = businessMatch[1].trim();
    
    return data;
  }

  private async mapFieldsIntelligently(rawData: Record<string, any>): Promise<ParsedLead> {
    const mapper = new FieldMapper();
    const mapped: Partial<InsertLead> = {};
    const unmapped: Record<string, any> = {};
    const fieldMappingConfidence: Record<string, number> = {};
    let overallConfidence = 0;
    let matchedFields = 0;
    const totalFields = Object.keys(rawData).length;
    
    // First pass: Use FieldMapper from ontology
    for (const [key, value] of Object.entries(rawData)) {
      if (value === null || value === undefined || value === '') continue;
      
      const canonicalField = mapper.mapToCanonical(key);
      
      if (canonicalField) {
        // Map canonical field to InsertLead field name
        const leadFieldName = this.canonicalToLeadField(canonicalField);
        if (leadFieldName) {
          // Apply validation and normalization from ontology
          const normalized = mapper.normalizeValue(canonicalField, value);
          const validation = mapper.validateField(canonicalField, normalized);
          
          if (validation.valid) {
            mapped[leadFieldName] = normalized;
            fieldMappingConfidence[leadFieldName] = 1.0;
            matchedFields++;
          } else {
            // Try to fix invalid data
            const fixed = await this.attemptDataFix(canonicalField, value);
            if (fixed.success) {
              mapped[leadFieldName] = fixed.value;
              fieldMappingConfidence[leadFieldName] = fixed.confidence;
              matchedFields++;
            } else {
              unmapped[key] = value;
            }
          }
        }
      } else {
        unmapped[key] = value;
      }
    }
    
    // Second pass: Handle compound fields
    const compoundResults = await this.detectAndSplitCompoundFields(unmapped);
    for (const result of compoundResults) {
      if (result.fields) {
        for (const field of result.fields) {
          const leadFieldName = this.canonicalToLeadField(field.field);
          if (leadFieldName && !mapped[leadFieldName]) {
            mapped[leadFieldName] = field.value;
            fieldMappingConfidence[leadFieldName] = result.confidence;
            matchedFields++;
            delete unmapped[result.originalKey];
          }
        }
      }
    }
    
    // Third pass: Use AI for remaining unmapped fields with low confidence
    if (Object.keys(unmapped).length > 0) {
      const aiMappings = await this.mapFieldsWithAI(unmapped, mapped);
      for (const aiMapping of aiMappings) {
        const leadFieldName = this.canonicalToLeadField(aiMapping.field);
        if (leadFieldName && !mapped[leadFieldName]) {
          mapped[leadFieldName] = aiMapping.value;
          fieldMappingConfidence[leadFieldName] = aiMapping.confidence;
          if (aiMapping.confidence > 0.5) {
            matchedFields++;
          }
          delete unmapped[aiMapping.originalKey];
        }
      }
    }
    
    // Calculate overall confidence
    const avgFieldConfidence = Object.values(fieldMappingConfidence).reduce((a, b) => a + b, 0) / 
                               (Object.keys(fieldMappingConfidence).length || 1);
    const coverageScore = matchedFields / totalFields;
    overallConfidence = (avgFieldConfidence * 0.7) + (coverageScore * 0.3);
    
    return {
      rawData,
      mappedData: mapped,
      confidence: overallConfidence
    };
  }

  private sanitizeValue(value: any, fieldName: string): any {
    if (value === null || value === undefined) return null;
    
    // Convert to string and trim
    let sanitized = String(value).trim();
    
    // Field-specific sanitization
    switch (fieldName) {
      case 'phone':
        // Remove non-numeric characters
        sanitized = sanitized.replace(/\D/g, '');
        // Format as XXX-XXX-XXXX if 10 digits
        if (sanitized.length === 10) {
          sanitized = `${sanitized.slice(0,3)}-${sanitized.slice(3,6)}-${sanitized.slice(6)}`;
        }
        break;
      
      case 'email':
        sanitized = sanitized.toLowerCase();
        break;
      
      case 'state':
        // Convert to uppercase, handle full state names
        sanitized = this.normalizeState(sanitized);
        break;
      
      case 'annualRevenue':
      case 'creditScore':
      case 'employeeCount':
      case 'yearFounded':
        // Extract numeric value
        const numeric = parseFloat(sanitized.replace(/[^0-9.-]/g, ''));
        return isNaN(numeric) ? null : numeric;
      
      case 'tags':
        // Convert to array if string
        if (typeof sanitized === 'string') {
          return sanitized.split(/[,;]/).map(t => t.trim()).filter(t => t);
        }
        break;
      
      case 'websiteUrl':
      case 'linkedinUrl':
        // Add protocol if missing
        if (!sanitized.startsWith('http')) {
          sanitized = 'https://' + sanitized;
        }
        break;
    }
    
    return sanitized;
  }

  private normalizeState(state: string): string {
    const stateMap: Record<string, string> = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    const normalized = state.trim().toLowerCase();
    
    // Return if already a state code
    if (normalized.length === 2) {
      return normalized.toUpperCase();
    }
    
    // Look up full state name
    return stateMap[normalized] || state.toUpperCase().slice(0, 2);
  }

  /**
   * Map canonical field to InsertLead field name
   */
  private canonicalToLeadField(canonical: CanonicalField): keyof InsertLead | null {
    const mapping: Partial<Record<CanonicalField, keyof InsertLead>> = {
      [CanonicalField.BUSINESS_NAME]: 'businessName',
      [CanonicalField.OWNER_NAME]: 'ownerName',
      [CanonicalField.FIRST_NAME]: 'ownerName', // Will combine with lastName
      [CanonicalField.LAST_NAME]: 'ownerName', // Will combine with firstName
      [CanonicalField.EMAIL]: 'email',
      [CanonicalField.PHONE]: 'phone',
      [CanonicalField.SECONDARY_PHONE]: 'secondaryPhone',
      [CanonicalField.INDUSTRY]: 'industry',
      [CanonicalField.ANNUAL_REVENUE]: 'annualRevenue',
      [CanonicalField.MONTHLY_REVENUE]: 'annualRevenue', // Will convert
      [CanonicalField.REQUESTED_AMOUNT]: 'requestedAmount',
      [CanonicalField.CREDIT_SCORE]: 'creditScore',
      [CanonicalField.YEAR_FOUNDED]: 'yearFounded',
      [CanonicalField.YEARS_IN_BUSINESS]: 'yearsInBusiness',
      [CanonicalField.TIME_IN_BUSINESS]: 'timeInBusiness',
      [CanonicalField.STREET]: 'fullAddress',
      [CanonicalField.CITY]: 'city',
      [CanonicalField.STATE]: 'stateCode',
      [CanonicalField.ZIP_CODE]: 'zipCode',
      [CanonicalField.UCC_NUMBER]: 'uccNumber',
      [CanonicalField.FILING_DATE]: 'filingDate',
      [CanonicalField.SECURED_PARTY]: 'securedParties',
      [CanonicalField.EIN]: 'ein',
      [CanonicalField.NAICS_CODE]: 'naicsCode',
      [CanonicalField.SIC_CODE]: 'sicCode',
      [CanonicalField.DAILY_BANK_DEPOSITS]: 'dailyBankDeposits',
      [CanonicalField.URGENCY_LEVEL]: 'urgencyLevel',
      [CanonicalField.FUNDING_PURPOSE]: 'fundingPurpose',
      [CanonicalField.LEAD_SOURCE]: 'leadSource',
      [CanonicalField.BUSINESS_TYPE]: 'businessType',
      [CanonicalField.BUSINESS_DESCRIPTION]: 'businessDescription'
    };
    
    return mapping[canonical] || null;
  }

  /**
   * Attempt to fix invalid data using AI and validation rules
   */
  private async attemptDataFix(field: CanonicalField, value: any): Promise<{
    success: boolean;
    value?: any;
    confidence: number;
  }> {
    // First try rule-based fixes
    const ruleFixed = this.applyRuleBasedFixes(field, value);
    if (ruleFixed.success) {
      return ruleFixed;
    }
    
    // If rules fail, try AI-based fixes
    const aiFixed = await openAIService.validateAndFixData(field, String(value));
    if (aiFixed.valid && aiFixed.fixedValue) {
      return {
        success: true,
        value: aiFixed.fixedValue,
        confidence: aiFixed.confidence
      };
    }
    
    return { success: false, confidence: 0 };
  }

  /**
   * Apply rule-based fixes for common data issues
   */
  private applyRuleBasedFixes(field: CanonicalField, value: any): {
    success: boolean;
    value?: any;
    confidence: number;
  } {
    const stringValue = String(value).trim();
    
    switch (field) {
      case CanonicalField.PHONE:
        // Try to extract phone number from text
        const phoneDigits = stringValue.replace(/\D/g, '');
        if (phoneDigits.length === 10) {
          return {
            success: true,
            value: FIELD_VALIDATORS.phone.normalize(phoneDigits),
            confidence: 0.9
          };
        } else if (phoneDigits.length === 11 && phoneDigits.startsWith('1')) {
          return {
            success: true,
            value: FIELD_VALIDATORS.phone.normalize(phoneDigits.substring(1)),
            confidence: 0.9
          };
        }
        break;
      
      case CanonicalField.EMAIL:
        // Fix common email typos
        const emailFix = stringValue
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/\[at\]/g, '@')
          .replace(/\[dot\]/g, '.');
        if (FIELD_VALIDATORS.email.validate(emailFix)) {
          return {
            success: true,
            value: emailFix,
            confidence: 0.8
          };
        }
        break;
      
      case CanonicalField.STATE:
        // Try to normalize state
        const normalized = FIELD_VALIDATORS.state.normalize(stringValue);
        if (FIELD_VALIDATORS.state.validate(normalized)) {
          return {
            success: true,
            value: normalized,
            confidence: 1.0
          };
        }
        break;
      
      case CanonicalField.ZIP_CODE:
        // Extract ZIP from address-like strings
        const zipMatch = stringValue.match(/\b(\d{5}(-\d{4})?)\b/);
        if (zipMatch && FIELD_VALIDATORS.zipCode.validate(zipMatch[1])) {
          return {
            success: true,
            value: zipMatch[1],
            confidence: 0.9
          };
        }
        break;
    }
    
    return { success: false, confidence: 0 };
  }

  /**
   * Detect and split compound fields
   */
  private async detectAndSplitCompoundFields(unmapped: Record<string, any>): Promise<Array<{
    originalKey: string;
    confidence: number;
    fields?: Array<{ field: CanonicalField; value: any }>;
  }>> {
    const results = [];
    
    for (const [key, value] of Object.entries(unmapped)) {
      if (!value || typeof value !== 'string') continue;
      
      // Check for common compound patterns
      const compoundResult = this.checkCommonCompoundPatterns(key, value);
      if (compoundResult.fields) {
        results.push({
          originalKey: key,
          confidence: compoundResult.confidence,
          fields: compoundResult.fields
        });
        continue;
      }
      
      // If no pattern matches, try AI understanding
      const aiResult = await openAIService.understandCompoundField(key, [value]);
      if (aiResult.fields && aiResult.fields.length > 0) {
        const extractedFields = this.extractFieldsFromCompound(value, aiResult.fields);
        if (extractedFields.length > 0) {
          results.push({
            originalKey: key,
            confidence: aiResult.confidence,
            fields: extractedFields
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Check for common compound field patterns
   */
  private checkCommonCompoundPatterns(key: string, value: string): {
    fields?: Array<{ field: CanonicalField; value: any }>;
    confidence: number;
  } {
    const lowerKey = key.toLowerCase();
    
    // Full name pattern
    if (lowerKey.includes('name') && !lowerKey.includes('business') && !lowerKey.includes('company')) {
      const nameParts = value.trim().split(/\s+/);
      if (nameParts.length === 2) {
        return {
          fields: [
            { field: CanonicalField.FIRST_NAME, value: nameParts[0] },
            { field: CanonicalField.LAST_NAME, value: nameParts[1] }
          ],
          confidence: 0.9
        };
      } else if (nameParts.length === 3) {
        return {
          fields: [
            { field: CanonicalField.FIRST_NAME, value: nameParts[0] },
            { field: CanonicalField.LAST_NAME, value: nameParts[2] }
          ],
          confidence: 0.8
        };
      }
    }
    
    // Full address pattern
    if (lowerKey.includes('address') && value.includes(',')) {
      const parts = value.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        const fields = [];
        const stateZipMatch = parts[parts.length - 1].match(/([A-Z]{2})\s+(\d{5}(-\d{4})?)/);
        
        if (stateZipMatch) {
          fields.push({ field: CanonicalField.STATE, value: stateZipMatch[1] });
          fields.push({ field: CanonicalField.ZIP_CODE, value: stateZipMatch[2] });
          fields.push({ field: CanonicalField.CITY, value: parts[parts.length - 2] });
          fields.push({ field: CanonicalField.STREET, value: parts.slice(0, -2).join(', ') });
          
          return { fields, confidence: 0.85 };
        }
      }
    }
    
    // City, State ZIP pattern
    if (lowerKey.includes('location') || lowerKey.includes('city')) {
      const cityStateZip = value.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(-\d{4})?)$/);
      if (cityStateZip) {
        return {
          fields: [
            { field: CanonicalField.CITY, value: cityStateZip[1] },
            { field: CanonicalField.STATE, value: cityStateZip[2] },
            { field: CanonicalField.ZIP_CODE, value: cityStateZip[3] }
          ],
          confidence: 0.9
        };
      }
    }
    
    return { confidence: 0 };
  }

  /**
   * Extract fields from compound value based on AI understanding
   */
  private extractFieldsFromCompound(
    value: string,
    fieldDefinitions: Array<{ field: CanonicalField; extractionLogic: string }>
  ): Array<{ field: CanonicalField; value: any }> {
    const extracted = [];
    
    for (const def of fieldDefinitions) {
      let extractedValue: any = null;
      
      // Apply extraction logic
      if (def.extractionLogic.includes('split')) {
        const delimiter = def.extractionLogic.match(/split by (.+)/)?.[1] || ' ';
        const parts = value.split(delimiter);
        const partIndex = def.extractionLogic.match(/take (\w+) part/)?.[1];
        
        if (partIndex === 'first') extractedValue = parts[0];
        else if (partIndex === 'last') extractedValue = parts[parts.length - 1];
        else if (partIndex === 'second') extractedValue = parts[1];
      } else if (def.extractionLogic.includes('regex')) {
        // Handle regex extraction
        const pattern = def.extractionLogic.match(/regex: (.+)/)?.[1];
        if (pattern) {
          const match = value.match(new RegExp(pattern));
          if (match) extractedValue = match[1] || match[0];
        }
      }
      
      if (extractedValue) {
        extracted.push({ field: def.field, value: extractedValue.trim() });
      }
    }
    
    return extracted;
  }

  /**
   * Use AI to map unmapped fields
   */
  private async mapFieldsWithAI(
    unmapped: Record<string, any>,
    alreadyMapped: Partial<InsertLead>
  ): Promise<Array<{
    field: CanonicalField;
    value: any;
    originalKey: string;
    confidence: number;
  }>> {
    const mappings = [];
    
    for (const [key, value] of Object.entries(unmapped)) {
      if (!value) continue;
      
      // Get sample values for better understanding
      const sampleValues = Array.isArray(value) ? value : [value];
      
      // Use AI to understand the field
      const understanding = await openAIService.understandField({
        fieldName: key,
        sampleValues: sampleValues.map(v => String(v)).slice(0, 5),
        context: `Processing MCA/business lead data. Already mapped fields: ${Object.keys(alreadyMapped).join(', ')}`
      });
      
      if (understanding.canonicalField && understanding.confidence > 0.4) {
        mappings.push({
          field: understanding.canonicalField,
          value: value,
          originalKey: key,
          confidence: understanding.confidence
        });
      }
    }
    
    return mappings;
  }

  /**
   * Analyze data completeness for a lead
   */
  async analyzeDataCompleteness(lead: Partial<InsertLead>): Promise<{
    overallScore: number;
    criticalFieldsScore: number;
    enrichmentOpportunities: string[];
    missingCriticalFields: string[];
    dataQualityIssues: string[];
    fieldCompleteness: Record<string, boolean>;
  }> {
    const criticalFields = ['businessName', 'ownerName', 'phone', 'email'];
    const importantFields = ['industry', 'annualRevenue', 'city', 'stateCode', 'creditScore'];
    const enrichableFields = ['websiteUrl', 'linkedinUrl', 'yearFounded', 'employeeCount', 'businessDescription'];
    
    const fieldCompleteness: Record<string, boolean> = {};
    const missingCriticalFields: string[] = [];
    const dataQualityIssues: string[] = [];
    const enrichmentOpportunities: string[] = [];
    
    // Check critical fields
    let criticalComplete = 0;
    for (const field of criticalFields) {
      const value = lead[field as keyof InsertLead];
      if (value && String(value).trim()) {
        fieldCompleteness[field] = true;
        criticalComplete++;
        
        // Validate data quality
        if (field === 'email' && !FIELD_VALIDATORS.email.validate(String(value))) {
          dataQualityIssues.push(`Invalid email format: ${value}`);
        } else if (field === 'phone' && !FIELD_VALIDATORS.phone.validate(String(value))) {
          dataQualityIssues.push(`Invalid phone format: ${value}`);
        }
      } else {
        fieldCompleteness[field] = false;
        missingCriticalFields.push(field);
      }
    }
    
    // Check important fields
    let importantComplete = 0;
    for (const field of importantFields) {
      const value = lead[field as keyof InsertLead];
      if (value && String(value).trim()) {
        fieldCompleteness[field] = true;
        importantComplete++;
      } else {
        fieldCompleteness[field] = false;
      }
    }
    
    // Check enrichable fields
    for (const field of enrichableFields) {
      const value = lead[field as keyof InsertLead];
      if (!value || !String(value).trim()) {
        fieldCompleteness[field] = false;
        enrichmentOpportunities.push(field);
      } else {
        fieldCompleteness[field] = true;
      }
    }
    
    // Calculate scores
    const criticalFieldsScore = (criticalComplete / criticalFields.length) * 100;
    const importantFieldsScore = (importantComplete / importantFields.length) * 100;
    const enrichableFieldsScore = 
      ((enrichableFields.length - enrichmentOpportunities.length) / enrichableFields.length) * 100;
    
    // Overall score weighted by importance
    const overallScore = 
      (criticalFieldsScore * 0.5) + 
      (importantFieldsScore * 0.3) + 
      (enrichableFieldsScore * 0.2);
    
    return {
      overallScore,
      criticalFieldsScore,
      enrichmentOpportunities,
      missingCriticalFields,
      dataQualityIssues,
      fieldCompleteness
    };
  }

  private async createBatch(
    batchId: string,
    userId: string,
    fileName: string,
    totalLeads: number,
    options: any
  ): Promise<LeadBatch> {
    return await storage.createLeadBatch({
      id: batchId,
      uploadedBy: userId,
      fileName,
      totalLeads,
      processedLeads: 0,
      status: 'processing',
      source: options.sourceName || 'upload',
      tags: options.batchTags || []
    });
  }

  private async processLeadsIntelligently(
    parsedLeads: ParsedLead[],
    batch: LeadBatch,
    userId: string,
    options: any
  ): Promise<UploadResult> {
    const result: UploadResult = {
      batchId: batch.id,
      totalProcessed: parsedLeads.length,
      successfulImports: 0,
      enrichedCount: 0,
      failedCount: 0,
      duplicatesSkipped: 0,
      validationErrors: [],
      intelligenceDecisions: [],
      estimatedCost: 0,
      processingTime: 0
    };
    
    // Store all processed leads for analysis
    const processedLeads: Array<Partial<InsertLead>> = [];
    
    // Process leads in batches for efficiency
    const batchSize = 50;
    for (let i = 0; i < parsedLeads.length; i += batchSize) {
      const batch = parsedLeads.slice(i, i + batchSize);
      const batchLeads = await this.processBatch(batch, result, userId, options);
      processedLeads.push(...batchLeads);
      
      // Update batch status periodically
      if (i % 100 === 0) {
        await storage.updateLeadBatch(result.batchId, {
          processedLeads: result.successfulImports,
          status: 'processing'
        });
      }
    }
    
    // Perform comprehensive data completeness analysis
    console.log(`[UnifiedUploadHandler] Analyzing ${processedLeads.length} leads for completeness...`);
    const analysisReport = await this.dataAnalyzer.batchAnalyze(processedLeads, result.batchId);
    
    // Add analysis report to result
    result.analysisReport = analysisReport;
    result.dataQualityMetrics = {
      avgCompletenessScore: analysisReport.overallStats.avgCompletenessScore,
      avgQualityScore: analysisReport.overallStats.avgQualityScore,
      avgFreshnessScore: analysisReport.overallStats.avgFreshnessScore,
      leadsNeedingEnrichment: analysisReport.overallStats.leadsNeedingEnrichment,
      leadsReadyToSell: analysisReport.overallStats.leadsReadyToSell
    };
    result.enrichmentOpportunities = {
      totalEstimatedCost: analysisReport.enrichmentOpportunities.totalEstimatedCost,
      expectedQualityGain: analysisReport.enrichmentOpportunities.expectedQualityGain,
      priorityBreakdown: analysisReport.enrichmentOpportunities.priorityBreakdown
    };
    
    // Update leads with analysis results
    for (let i = 0; i < processedLeads.length; i++) {
      const lead = processedLeads[i];
      const analysis = analysisReport.leadAnalyses[i];
      
      if (lead.id && analysis) {
        // Update lead with quality scores and enrichment plan
        await storage.updateLead(lead.id, {
          dataCompleteness: {
            overall: analysis.qualityMetrics.completenessScore,
            businessInfo: analysis.qualityMetrics.categoryCoverage.business,
            contactInfo: analysis.qualityMetrics.categoryCoverage.contact,
            financialInfo: analysis.qualityMetrics.categoryCoverage.financial,
            uccInfo: analysis.qualityMetrics.categoryCoverage.ucc,
            verificationInfo: analysis.qualityMetrics.confidenceScore
          },
          qualityScore: analysis.qualityMetrics.overallQualityScore,
          intelligenceScore: analysis.leadValue.currentValue,
          enrichmentStatus: analysis.enrichmentPlan.priority === 'none' ? 'completed' : 'pending',
          masterEnrichmentScore: analysis.leadValue.potentialValue
        });
        
        // Store lead temporarily for batch processing
        result.successfulImports++;
      }
    }
    
    // INTELLIGENCE BRAIN BATCH PROCESSING
    console.log(`[UnifiedUploadHandler] Sending ${processedLeads.length} leads to Intelligence Brain for batch decision making...`);
    
    // Prepare leads with analysis for Brain evaluation  
    const leadsWithAnalysis: Array<{ lead: Partial<Lead>; analysis?: AnalysisReport }> = [];
    for (let i = 0; i < processedLeads.length; i++) {
      const lead = processedLeads[i];
      const analysis = analysisReport.leadAnalyses[i];
      if (lead && analysis) {
        leadsWithAnalysis.push({ lead: lead as Partial<Lead>, analysis });
      }
    }
    
    // Get batch enrichment decisions from Intelligence Brain
    const brainDecisions = await this.intelligenceBrain.evaluateBatch(
      leadsWithAnalysis,
      {
        totalBudget: options.enrichmentBudget || 10.0, // Default $10 budget for batch
        strategy: options.enrichmentStrategy || 'balanced',
        groupSimilar: true,
        batchId: result.batchId
      }
    );
    
    // Store Brain decisions in result
    result.intelligenceDecisions = brainDecisions.decisions
      .filter(d => d.leadId && !d.leadId.startsWith('temp-'))
      .map(d => ({
        leadId: d.leadId,
        strategy: d.strategy,
        confidence: d.confidence
      }));
    
    // Add Brain analysis to result
    result.brainAnalysis = {
      totalDecisions: brainDecisions.decisions.length,
      estimatedTotalCost: brainDecisions.batchPlan.totalEstimatedCost,
      expectedQualityGain: brainDecisions.batchPlan.expectedQualityGain,
      groupedStrategies: Object.fromEntries(brainDecisions.batchPlan.groupedStrategies),
      costOptimizations: brainDecisions.batchPlan.costOptimizations,
      priorityOrder: brainDecisions.batchPlan.priorityOrder.slice(0, 10), // Top 10
      enrichmentJobs: brainDecisions.batchPlan.enrichmentJobs.slice(0, 10) // Top 10
    };
    
    // Update enrichment opportunities with Brain's enhanced analysis
    result.enrichmentOpportunities = {
      totalEstimatedCost: brainDecisions.batchPlan.totalEstimatedCost,
      expectedQualityGain: brainDecisions.batchPlan.expectedQualityGain,
      priorityBreakdown: analysisReport.enrichmentOpportunities.priorityBreakdown
    };
    
    // Update each lead with its Brain decision
    for (const decision of brainDecisions.decisions) {
      if (decision.leadId && !decision.leadId.startsWith('temp-')) {
        const lead = processedLeads.find(l => l.id === decision.leadId);
        if (lead && lead.id) {
          await storage.updateLead(lead.id, {
            enrichmentPlan: {
              strategy: decision.strategy,
              services: decision.services,
              estimatedCost: decision.estimatedCost,
              priority: decision.priority,
              decisionReasoning: decision.reasoning,
              confidence: decision.confidence
            },
            intelligenceScore: Math.round(decision.confidence * 100)
          });
        }
      }
    }
    
    // AUTO-ENRICHMENT: Trigger automatic enrichment if enabled
    if (options.autoEnrich && options.intelligentProcessing) {
      console.log(`[UnifiedUploadHandler] Triggering automatic enrichment for high-priority leads...`);
      
      // Filter decisions that should be enriched
      const enrichmentDecisions = brainDecisions.decisions.filter(d => 
        d.services.length > 0 && 
        d.confidence > 0.5 &&
        !d.skipReasons?.length
      );
      
      // Process batch enrichment through the Brain
      const enrichmentResults = await this.intelligenceBrain.processBatchEnrichment(
        enrichmentDecisions
      );
      
      result.enrichedCount = enrichmentResults.success;
      result.estimatedCost = brainDecisions.batchPlan.totalEstimatedCost;
      
      // Add automatic enrichment summary
      result.automaticEnrichmentSummary = {
        totalQueued: enrichmentResults.success,
        totalSkipped: enrichmentResults.skipped,
        totalFailed: enrichmentResults.failed,
        estimatedCompletionTime: brainDecisions.batchPlan.enrichmentJobs
          .reduce((sum, job) => sum + job.estimatedTime, 0)
      };
      
      console.log(`[UnifiedUploadHandler] Automatic enrichment summary:
        - Queued: ${enrichmentResults.success} leads
        - Skipped: ${enrichmentResults.skipped} leads
        - Failed: ${enrichmentResults.failed} leads
        - Estimated completion time: ${result.automaticEnrichmentSummary.estimatedCompletionTime}s
      `);
    }
    
    // Log enhanced analysis summary
    console.log(`[UnifiedUploadHandler] Analysis complete with Intelligence Brain:`);
    console.log(`  - Average Quality Score: ${result.dataQualityMetrics?.avgQualityScore}%`);
    console.log(`  - Leads Ready to Sell: ${result.dataQualityMetrics?.leadsReadyToSell}`);
    console.log(`  - Needs Enrichment: ${result.dataQualityMetrics?.leadsNeedingEnrichment}`);
    console.log(`  - Brain Decisions: ${result.intelligenceDecisions.length}`);
    console.log(`  - Estimated Total Cost: $${result.brainAnalysis?.estimatedTotalCost.toFixed(2)}`);
    console.log(`  - Expected Quality Gain: ${result.brainAnalysis?.expectedQualityGain.toFixed(1)}%`);
    console.log(`  - Cost Optimizations: ${result.brainAnalysis?.costOptimizations.length} opportunities`);
    
    // Finalize batch with enhanced metadata
    await storage.updateLeadBatch(result.batchId, {
      processedLeads: result.successfulImports,
      averageQualityScore: result.dataQualityMetrics?.avgQualityScore,
      metadata: {
        brainAnalysis: result.brainAnalysis,
        dataQualityMetrics: result.dataQualityMetrics,
        enrichmentOpportunities: result.enrichmentOpportunities,
        automaticEnrichmentSummary: result.automaticEnrichmentSummary,
        intelligenceDecisionCount: result.intelligenceDecisions.length
      },
      status: 'completed'
    });
    
    // Emit event for monitoring and downstream processing
    eventBus.emit('upload:batch:intelligent:complete', {
      batchId: result.batchId,
      leadCount: result.successfulImports,
      brainDecisions: result.intelligenceDecisions.length,
      enrichmentQueued: result.enrichedCount,
      totalCost: result.estimatedCost,
      expectedQualityGain: result.brainAnalysis?.expectedQualityGain
    });
    
    return result;
  }

  private async processBatch(
    leads: ParsedLead[],
    result: UploadResult,
    userId: string,
    options: any
  ): Promise<Array<Partial<InsertLead>>> {
    const leadsToCreate: InsertLead[] = [];
    const processedLeads: Array<Partial<InsertLead>> = [];
    
    for (const [index, parsedLead] of leads.entries()) {
      try {
        // Validate required fields
        const validation = this.validateLead(parsedLead.mappedData, index);
        if (!validation.success) {
          result.validationErrors.push(...validation.errors);
          result.failedCount++;
          continue;
        }
        
        // Check for duplicates
        if (options.validateDuplicates) {
          const isDuplicate = await this.checkDuplicate(parsedLead.mappedData);
          if (isDuplicate) {
            result.duplicatesSkipped++;
            continue;
          }
        }
        
        // Check master database first
        const masterData = await this.masterDatabase.searchEntity({
          businessName: parsedLead.mappedData.businessName,
          phone: parsedLead.mappedData.phone,
          email: parsedLead.mappedData.email
        });
        
        // Merge with master data if found
        if (masterData && masterData.completeness > 0.5) {
          Object.assign(parsedLead.mappedData, masterData.data);
        }
        
        // Prepare lead for creation
        const leadId = `lead-${crypto.randomUUID()}`;
        const leadData: InsertLead = {
          id: leadId,
          batchId: result.batchId,
          userId,
          ...parsedLead.mappedData,
          tier: 'standard',
          status: 'new',
          qualityScore: 0,
          verificationStatus: 'pending'
        };
        
        leadsToCreate.push(leadData);
        processedLeads.push(leadData);
        
        // Get intelligence decision for enrichment
        if (options.autoEnrich || options.intelligentProcessing) {
          const decision = await this.intelligenceBrain.analyzeAndDecide({
            id: leadId,
            ...leadData
          } as Lead);
          
          result.intelligenceDecisions.push({
            leadId,
            strategy: decision.strategy,
            confidence: decision.confidence
          });
          
          result.estimatedCost += decision.estimatedCost;
          
          // Queue for enrichment if high priority
          if (decision.priority > 0.7) {
            result.enrichedCount++;
            eventBus.emit('enrichment:queue', {
              leadId,
              services: decision.services,
              priority: decision.priority
            });
          }
        }
        
      } catch (error) {
        console.error(`Error processing lead ${index}:`, error);
        result.failedCount++;
      }
    }
    
    // Bulk create leads
    if (leadsToCreate.length > 0) {
      try {
        await storage.createLeads(leadsToCreate);
        result.successfulImports += leadsToCreate.length;
      } catch (error) {
        console.error('Error bulk creating leads:', error);
        result.failedCount += leadsToCreate.length;
      }
    }
    
    return processedLeads;
  }

  private validateLead(lead: Partial<InsertLead>, rowIndex: number): { 
    success: boolean; 
    errors: Array<{ row: number; field: string; error: string }> 
  } {
    const errors: Array<{ row: number; field: string; error: string }> = [];
    
    // At minimum, need business name or owner name
    if (!lead.businessName && !lead.ownerName) {
      errors.push({
        row: rowIndex,
        field: 'businessName/ownerName',
        error: 'Either business name or owner name is required'
      });
    }
    
    // Need at least one contact method
    if (!lead.phone && !lead.email) {
      errors.push({
        row: rowIndex,
        field: 'phone/email',
        error: 'At least one contact method (phone or email) is required'
      });
    }
    
    // Validate email format if provided
    if (lead.email && !this.isValidEmail(lead.email)) {
      errors.push({
        row: rowIndex,
        field: 'email',
        error: 'Invalid email format'
      });
    }
    
    // Validate phone format if provided
    if (lead.phone && !this.isValidPhone(lead.phone)) {
      errors.push({
        row: rowIndex,
        field: 'phone',
        error: 'Invalid phone format'
      });
    }
    
    // Validate state code if provided
    if (lead.state && lead.state.length !== 2) {
      errors.push({
        row: rowIndex,
        field: 'state',
        error: 'State must be a 2-letter code'
      });
    }
    
    return {
      success: errors.length === 0,
      errors
    };
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 11;
  }

  private async checkDuplicate(lead: Partial<InsertLead>): Promise<boolean> {
    if (lead.phone) {
      const existing = await storage.checkPhoneDuplicate(lead.phone);
      if (existing) return true;
    }
    
    if (lead.businessName) {
      const existing = await storage.checkBusinessNameDuplicate(lead.businessName);
      if (existing) return true;
    }
    
    return false;
  }

  async processApiData(
    data: any[],
    userId: string,
    source: string
  ): Promise<UploadResult> {
    // Special handler for API data uploads
    const parsedLeads = data.map(item => this.mapFieldsIntelligently(item));
    
    const batch = await this.createBatch(
      `api-${uuidv4()}`,
      userId,
      `API Import from ${source}`,
      parsedLeads.length,
      { sourceName: source, intelligentProcessing: true }
    );
    
    return this.processLeadsIntelligently(
      parsedLeads,
      batch,
      userId,
      { autoEnrich: true, intelligentProcessing: true }
    );
  }

  async getUploadStatus(batchId: string): Promise<{
    status: string;
    processed: number;
    total: number;
    errors: any[];
  }> {
    const batch = await storage.getLeadBatch(batchId);
    if (!batch) {
      throw new Error('Batch not found');
    }
    
    return {
      status: batch.status,
      processed: batch.processedLeads,
      total: batch.totalLeads,
      errors: [] // Could fetch from a separate errors table
    };
  }
}

// Export singleton instance
export const unifiedUploadHandler = new UnifiedUploadHandler();