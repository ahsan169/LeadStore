import { storage } from "../storage";
import { IntelligenceBrainService } from "./intelligence-brain";
import { MasterDatabaseService } from "./master-database";
import { costOptimization } from "./cost-optimization";
import { EventBus } from "./event-bus";
import type { Lead, InsertLead, LeadBatch } from "@shared/schema";
import Papa from 'papaparse';
import XLSX from 'xlsx';
import { z } from "zod";
import { v4 as uuidv4 } from 'crypto';

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
  private intelligenceBrain: IntelligenceBrainService;
  private masterDatabase: MasterDatabaseService;
  private eventBus = EventBus.getInstance();
  
  constructor() {
    this.intelligenceBrain = new IntelligenceBrainService();
    this.masterDatabase = new MasterDatabaseService();
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
    const batchId = `batch-${uuidv4()}`;
    
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
    this.eventBus.emit('upload:completed', result);
    
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
        transformHeader: (header) => header.toLowerCase().replace(/\s+/g, '_'),
        complete: (results) => {
          const leads = results.data.map(row => this.mapFieldsIntelligently(row));
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
    
    return jsonData.map(row => this.mapFieldsIntelligently(row));
  }

  private async parseJson(content: string): Promise<ParsedLead[]> {
    try {
      const data = JSON.parse(content);
      const array = Array.isArray(data) ? data : [data];
      return array.map(row => this.mapFieldsIntelligently(row));
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error}`);
    }
  }

  private async parseText(content: string, delimiter?: string): Promise<ParsedLead[]> {
    // Parse delimited text or unstructured text
    if (delimiter) {
      const lines = content.split('\n').filter(line => line.trim());
      const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
      
      return lines.slice(1).map(line => {
        const values = line.split(delimiter);
        const row: Record<string, any> = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim() || '';
        });
        return this.mapFieldsIntelligently(row);
      });
    } else {
      // Attempt to extract structured data from unstructured text
      return this.parseUnstructuredText(content);
    }
  }

  private async parseUnstructuredText(content: string): Promise<ParsedLead[]> {
    // Use AI to extract lead information from unstructured text
    const blocks = content.split(/\n\n+/);
    const leads: ParsedLead[] = [];
    
    for (const block of blocks) {
      const extractedData = this.extractDataFromText(block);
      if (Object.keys(extractedData).length > 2) {
        leads.push({
          rawData: { text: block },
          mappedData: extractedData,
          confidence: 0.6
        });
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

  private mapFieldsIntelligently(rawData: Record<string, any>): ParsedLead {
    const mapped: Partial<InsertLead> = {};
    const unmapped: Record<string, any> = {};
    let confidence = 0;
    let matchedFields = 0;
    const totalFields = Object.keys(rawData).length;
    
    // Normalize keys
    const normalizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawData)) {
      const normalizedKey = key.toLowerCase().replace(/[\s\-\.]/g, '_');
      normalizedData[normalizedKey] = value;
    }
    
    // Try to map each field
    for (const [targetField, patterns] of Object.entries(FIELD_MAPPINGS)) {
      for (const pattern of patterns) {
        if (normalizedData[pattern] !== undefined && normalizedData[pattern] !== null && normalizedData[pattern] !== '') {
          mapped[targetField as keyof InsertLead] = this.sanitizeValue(normalizedData[pattern], targetField);
          matchedFields++;
          delete normalizedData[pattern];
          break;
        }
      }
    }
    
    // Store unmapped fields for potential AI processing
    for (const [key, value] of Object.entries(normalizedData)) {
      if (value !== undefined && value !== null && value !== '') {
        unmapped[key] = value;
      }
    }
    
    // Calculate confidence based on matched fields
    confidence = matchedFields / Math.min(totalFields, Object.keys(FIELD_MAPPINGS).length);
    
    // Use AI to improve mapping for low confidence
    if (confidence < 0.5 && Object.keys(unmapped).length > 0) {
      const aiMapped = this.useAiForMapping(unmapped);
      Object.assign(mapped, aiMapped);
      confidence = Math.min(0.9, confidence + 0.3);
    }
    
    return {
      rawData,
      mappedData: mapped,
      confidence
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

  private useAiForMapping(unmapped: Record<string, any>): Partial<InsertLead> {
    const mapped: Partial<InsertLead> = {};
    
    // Use pattern matching and heuristics for unmapped fields
    for (const [key, value] of Object.entries(unmapped)) {
      const lowerKey = key.toLowerCase();
      
      // Check for partial matches
      if (lowerKey.includes('name') && !lowerKey.includes('business')) {
        if (!mapped.ownerName) mapped.ownerName = value;
      } else if (lowerKey.includes('company') || lowerKey.includes('business')) {
        if (!mapped.businessName) mapped.businessName = value;
      } else if (lowerKey.includes('revenue') || lowerKey.includes('sales')) {
        if (!mapped.annualRevenue) mapped.annualRevenue = value;
      } else if (lowerKey.includes('employee') || lowerKey.includes('staff')) {
        if (!mapped.employeeCount) mapped.employeeCount = value;
      } else if (lowerKey.includes('industry') || lowerKey.includes('sector')) {
        if (!mapped.industry) mapped.industry = value;
      }
    }
    
    return mapped;
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
    
    // Process leads in batches for efficiency
    const batchSize = 50;
    for (let i = 0; i < parsedLeads.length; i += batchSize) {
      const batch = parsedLeads.slice(i, i + batchSize);
      const processedBatch = await this.processBatch(batch, result, userId, options);
      
      // Update batch status periodically
      if (i % 100 === 0) {
        await storage.updateLeadBatch(result.batchId, {
          processedLeads: result.successfulImports,
          status: 'processing'
        });
      }
    }
    
    // Finalize batch
    await storage.updateLeadBatch(result.batchId, {
      processedLeads: result.successfulImports,
      status: 'completed'
    });
    
    return result;
  }

  private async processBatch(
    leads: ParsedLead[],
    result: UploadResult,
    userId: string,
    options: any
  ): Promise<void> {
    const leadsToCreate: InsertLead[] = [];
    
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
        const leadId = `lead-${uuidv4()}`;
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
            this.eventBus.emit('enrichment:queue', {
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