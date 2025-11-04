import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '../db';
import { stagingLeads, rawDataDumps, dataIngestionJobs } from '@shared/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { cacheManager } from './cache-manager';
import { s3Client } from '../object-storage';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface DataSource {
  id: string;
  name: string;
  type: 'api' | 'file' | 'scraper' | 'manual';
  cost: number; // Cost per 1000 records
  rateLimit?: number; // Requests per minute
  bulkCapable: boolean;
  requiresAuth: boolean;
}

export interface IngestionJob {
  id: string;
  source: DataSource;
  status: 'pending' | 'running' | 'completed' | 'failed';
  recordsProcessed: number;
  recordsFailed: number;
  totalCost: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  rawDataPath?: string;
  metadata?: Record<string, any>;
}

export interface ParsedRecord {
  rawId: string;
  businessName?: string;
  ownerName?: string;
  legalName?: string;
  aliases?: string[];
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phones?: string[];
  emails?: string[];
  domains?: string[];
  filingDate?: Date;
  filingType?: string;
  securedParties?: string[];
  amount?: number;
  confidence: number;
  rawData: any;
  source: string;
}

// Data Source Configurations
export const DATA_SOURCES: Record<string, DataSource> = {
  UCC_FILINGS: {
    id: 'ucc_filings',
    name: 'UCC Filings Database',
    type: 'file',
    cost: 0, // Free public records
    bulkCapable: true,
    requiresAuth: false
  },
  SECRETARY_OF_STATE: {
    id: 'secretary_of_state',
    name: 'Secretary of State Registries',
    type: 'api',
    cost: 0, // Free public records
    rateLimit: 60,
    bulkCapable: false,
    requiresAuth: false
  },
  OPEN_CORPORATES: {
    id: 'open_corporates',
    name: 'OpenCorporates API',
    type: 'api',
    cost: 0, // Free tier
    rateLimit: 200, // Free tier limit
    bulkCapable: false,
    requiresAuth: false
  },
  GOOGLE_PLACES: {
    id: 'google_places',
    name: 'Google Places API',
    type: 'api',
    cost: 0.002, // $2 per 1000 after free tier
    rateLimit: 100,
    bulkCapable: false,
    requiresAuth: true
  },
  PUBLIC_BUSINESS_DATA: {
    id: 'public_business_data',
    name: 'Public Business Databases',
    type: 'scraper',
    cost: 0,
    bulkCapable: true,
    requiresAuth: false
  },
  BULK_CSV_UPLOAD: {
    id: 'bulk_csv',
    name: 'Bulk CSV Upload',
    type: 'file',
    cost: 0,
    bulkCapable: true,
    requiresAuth: false
  }
};

export class BulkDataIngestionService extends EventEmitter {
  private activeJobs: Map<string, IngestionJob> = new Map();
  private processingQueue: IngestionJob[] = [];
  private isProcessing: boolean = false;
  
  // Parsers for different data formats
  private parsers: Map<string, (data: any) => ParsedRecord[]> = new Map();
  
  constructor() {
    super();
    this.initializeParsers();
    this.startQueueProcessor();
  }
  
  /**
   * Initialize parsers for different data formats
   */
  private initializeParsers() {
    // UCC Filing Parser
    this.parsers.set('ucc_filings', (data: any) => {
      const records: ParsedRecord[] = [];
      
      // Parse UCC filing format
      if (Array.isArray(data)) {
        for (const item of data) {
          const record: ParsedRecord = {
            rawId: crypto.randomBytes(16).toString('hex'),
            businessName: item['Debtor Name'] || item['business_name'],
            ownerName: item['Individual Name'] || item['owner_name'],
            legalName: item['Legal Name'] || item['legal_name'],
            address: item['Address'] || item['address'],
            city: item['City'] || item['city'],
            state: item['State'] || item['state'],
            zipCode: item['Zip'] || item['zip_code'],
            phones: this.extractPhones(item),
            filingDate: this.parseDate(item['Filing Date'] || item['filing_date']),
            filingType: item['Filing Type'] || 'UCC',
            securedParties: this.extractSecuredParties(item),
            amount: this.parseAmount(item['Amount'] || item['secured_amount']),
            confidence: 0.9, // High confidence for official records
            rawData: item,
            source: 'ucc_filings'
          };
          
          records.push(record);
        }
      }
      
      return records;
    });
    
    // Secretary of State Parser
    this.parsers.set('secretary_of_state', (data: any) => {
      const records: ParsedRecord[] = [];
      
      if (Array.isArray(data)) {
        for (const item of data) {
          const record: ParsedRecord = {
            rawId: item['entity_id'] || crypto.randomBytes(16).toString('hex'),
            businessName: item['entity_name'],
            legalName: item['legal_name'],
            address: item['registered_address'],
            city: item['city'],
            state: item['state'],
            zipCode: item['zip'],
            domains: item['website'] ? [item['website']] : [],
            filingDate: this.parseDate(item['formation_date']),
            filingType: item['entity_type'],
            confidence: 0.95, // Very high confidence for official state records
            rawData: item,
            source: 'secretary_of_state'
          };
          
          records.push(record);
        }
      }
      
      return records;
    });
    
    // OpenCorporates Parser
    this.parsers.set('open_corporates', (data: any) => {
      const records: ParsedRecord[] = [];
      
      const companies = data?.results?.companies || [];
      for (const item of companies) {
        const company = item.company;
        const record: ParsedRecord = {
          rawId: company.company_number || crypto.randomBytes(16).toString('hex'),
          businessName: company.name,
          legalName: company.name,
          address: company.registered_address_in_full,
          city: company.registered_address?.locality,
          state: company.registered_address?.region,
          zipCode: company.registered_address?.postal_code,
          domains: company.url ? [company.url] : [],
          filingDate: this.parseDate(company.incorporation_date),
          filingType: company.company_type,
          confidence: 0.85, // Good confidence for OpenCorporates data
          rawData: company,
          source: 'open_corporates'
        };
        
        records.push(record);
      }
      
      return records;
    });
    
    // Generic CSV Parser
    this.parsers.set('csv', (data: any) => {
      const records: ParsedRecord[] = [];
      
      if (Array.isArray(data)) {
        for (const item of data) {
          const record: ParsedRecord = {
            rawId: item['id'] || crypto.randomBytes(16).toString('hex'),
            businessName: this.findField(item, ['business_name', 'company', 'business', 'name']),
            ownerName: this.findField(item, ['owner_name', 'owner', 'contact_name', 'contact']),
            legalName: this.findField(item, ['legal_name', 'registered_name']),
            address: this.findField(item, ['address', 'street', 'street_address']),
            city: this.findField(item, ['city', 'town']),
            state: this.findField(item, ['state', 'province', 'region']),
            zipCode: this.findField(item, ['zip', 'zip_code', 'postal_code']),
            phones: this.extractPhones(item),
            emails: this.extractEmails(item),
            domains: this.extractDomains(item),
            confidence: 0.7, // Medium confidence for generic CSV data
            rawData: item,
            source: 'csv_upload'
          };
          
          records.push(record);
        }
      }
      
      return records;
    });
  }
  
  /**
   * Ingest data from a specific source
   */
  async ingestFromSource(
    sourceId: string,
    config?: {
      filePath?: string;
      apiParams?: Record<string, any>;
      batchSize?: number;
      startOffset?: number;
    }
  ): Promise<IngestionJob> {
    const source = DATA_SOURCES[sourceId];
    if (!source) {
      throw new Error(`Unknown data source: ${sourceId}`);
    }
    
    console.log(`[BulkIngestion] Starting ingestion from ${source.name}`);
    
    // Create ingestion job
    const job: IngestionJob = {
      id: `ingest-${sourceId}-${Date.now()}`,
      source,
      status: 'pending',
      recordsProcessed: 0,
      recordsFailed: 0,
      totalCost: 0,
      metadata: config
    };
    
    this.activeJobs.set(job.id, job);
    this.processingQueue.push(job);
    this.emit('job-created', job);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }
    
    return job;
  }
  
  /**
   * Process the next job in queue
   */
  private async processNextJob() {
    if (this.processingQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    const job = this.processingQueue.shift()!;
    
    try {
      job.status = 'running';
      job.startedAt = new Date();
      this.emit('job-started', job);
      
      // Process based on source type
      let rawData: any;
      
      switch (job.source.type) {
        case 'file':
          rawData = await this.processFileSource(job);
          break;
        case 'api':
          rawData = await this.processApiSource(job);
          break;
        case 'scraper':
          rawData = await this.processScraperSource(job);
          break;
        default:
          throw new Error(`Unsupported source type: ${job.source.type}`);
      }
      
      // Store raw data for audit trail
      const rawDataPath = await this.storeRawData(job, rawData);
      job.rawDataPath = rawDataPath;
      
      // Parse the data
      const parser = this.parsers.get(job.source.id) || this.parsers.get('csv');
      const parsedRecords = parser(rawData);
      
      // Store in staging table
      await this.storeInStaging(parsedRecords, job);
      
      // Calculate costs
      job.recordsProcessed = parsedRecords.length;
      job.totalCost = (job.recordsProcessed / 1000) * job.source.cost;
      
      job.status = 'completed';
      job.completedAt = new Date();
      this.emit('job-completed', job);
      
      console.log(`[BulkIngestion] Completed ingestion job ${job.id}: ${job.recordsProcessed} records processed`);
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message;
      job.completedAt = new Date();
      this.emit('job-failed', job);
      
      console.error(`[BulkIngestion] Failed job ${job.id}:`, error);
    } finally {
      // Process next job
      setTimeout(() => this.processNextJob(), 1000);
    }
  }
  
  /**
   * Process file-based data source
   */
  private async processFileSource(job: IngestionJob): Promise<any> {
    const filePath = job.metadata?.filePath;
    if (!filePath) {
      throw new Error('File path required for file source');
    }
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const extension = path.extname(filePath).toLowerCase();
    
    let data: any;
    
    switch (extension) {
      case '.csv':
        const parseResult = Papa.parse(fileContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true
        });
        data = parseResult.data;
        break;
        
      case '.xlsx':
      case '.xls':
        const workbook = XLSX.read(fileContent, { type: 'string' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(firstSheet);
        break;
        
      case '.json':
        data = JSON.parse(fileContent);
        break;
        
      default:
        throw new Error(`Unsupported file format: ${extension}`);
    }
    
    return data;
  }
  
  /**
   * Process API-based data source
   */
  private async processApiSource(job: IngestionJob): Promise<any> {
    const source = job.source;
    const params = job.metadata?.apiParams || {};
    const batchSize = job.metadata?.batchSize || 100;
    
    let allData: any[] = [];
    let offset = job.metadata?.startOffset || 0;
    let hasMore = true;
    
    // Rate limiting
    const delayBetweenRequests = source.rateLimit ? 60000 / source.rateLimit : 0;
    
    while (hasMore && allData.length < 10000) { // Max 10k records per job
      try {
        // Build API URL based on source
        let apiUrl = '';
        let response: any;
        
        switch (source.id) {
          case 'open_corporates':
            apiUrl = `https://api.opencorporates.com/v0.4/companies/search`;
            const ocParams = new URLSearchParams({
              ...params,
              per_page: String(batchSize),
              page: String(Math.floor(offset / batchSize) + 1)
            });
            response = await fetch(`${apiUrl}?${ocParams}`);
            const ocData = await response.json();
            allData.push(...(ocData?.results?.companies || []));
            hasMore = ocData?.results?.total_pages > ocData?.results?.page;
            break;
            
          case 'google_places':
            // Google Places API implementation
            if (!process.env.GOOGLE_PLACES_API_KEY) {
              throw new Error('Google Places API key not configured');
            }
            // Implementation would go here
            hasMore = false;
            break;
            
          default:
            hasMore = false;
        }
        
        offset += batchSize;
        
        // Rate limiting delay
        if (delayBetweenRequests > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
        }
      } catch (error) {
        console.error(`[BulkIngestion] API request failed:`, error);
        hasMore = false;
      }
    }
    
    return allData;
  }
  
  /**
   * Process scraper-based data source
   */
  private async processScraperSource(job: IngestionJob): Promise<any> {
    // Placeholder for scraper implementation
    // Would use puppeteer or playwright for actual scraping
    console.log('[BulkIngestion] Scraper source not yet implemented');
    return [];
  }
  
  /**
   * Store raw data for audit trail
   */
  private async storeRawData(job: IngestionJob, data: any): Promise<string> {
    const timestamp = new Date().toISOString();
    const filename = `raw-data/${job.source.id}/${timestamp}-${job.id}.json`;
    
    try {
      // Store in S3 if configured
      if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
        const command = new PutObjectCommand({
          Bucket: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
          Key: filename,
          Body: JSON.stringify({
            job,
            data,
            timestamp
          }),
          ContentType: 'application/json'
        });
        
        await s3Client.send(command);
        console.log(`[BulkIngestion] Raw data stored in S3: ${filename}`);
      } else {
        // Store locally as fallback
        const localPath = path.join('data', 'raw', `${job.id}.json`);
        await fs.mkdir(path.dirname(localPath), { recursive: true });
        await fs.writeFile(localPath, JSON.stringify({ job, data, timestamp }, null, 2));
        console.log(`[BulkIngestion] Raw data stored locally: ${localPath}`);
      }
      
      // Store reference in database
      await db.insert(rawDataDumps).values({
        jobId: job.id,
        source: job.source.id,
        path: filename,
        recordCount: Array.isArray(data) ? data.length : 1,
        sizeBytes: JSON.stringify(data).length,
        createdAt: new Date()
      });
      
      return filename;
    } catch (error) {
      console.error('[BulkIngestion] Failed to store raw data:', error);
      return '';
    }
  }
  
  /**
   * Store parsed records in staging table
   */
  private async storeInStaging(records: ParsedRecord[], job: IngestionJob): Promise<void> {
    const batchSize = 100;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const stagingRecords = batch.map(record => ({
        jobId: job.id,
        source: record.source,
        rawId: record.rawId,
        businessName: record.businessName,
        ownerName: record.ownerName,
        legalName: record.legalName,
        aliases: record.aliases || [],
        address: record.address,
        city: record.city,
        state: record.state,
        zipCode: record.zipCode,
        phones: record.phones || [],
        emails: record.emails || [],
        domains: record.domains || [],
        confidence: record.confidence,
        rawData: record.rawData,
        createdAt: new Date(),
        processed: false
      }));
      
      await db.insert(stagingLeads).values(stagingRecords);
    }
    
    console.log(`[BulkIngestion] Stored ${records.length} records in staging table`);
  }
  
  /**
   * Helper: Extract phone numbers from various fields
   */
  private extractPhones(item: any): string[] {
    const phones: string[] = [];
    const phoneFields = ['phone', 'phone_number', 'telephone', 'mobile', 'cell', 'contact_phone'];
    
    for (const field of phoneFields) {
      if (item[field]) {
        const phone = String(item[field]).replace(/\D/g, '');
        if (phone.length >= 10) {
          phones.push(phone);
        }
      }
    }
    
    return [...new Set(phones)]; // Remove duplicates
  }
  
  /**
   * Helper: Extract email addresses
   */
  private extractEmails(item: any): string[] {
    const emails: string[] = [];
    const emailFields = ['email', 'email_address', 'contact_email'];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    
    for (const field of emailFields) {
      if (item[field]) {
        const matches = String(item[field]).match(emailRegex);
        if (matches) {
          emails.push(...matches);
        }
      }
    }
    
    return [...new Set(emails.map(e => e.toLowerCase()))];
  }
  
  /**
   * Helper: Extract domains
   */
  private extractDomains(item: any): string[] {
    const domains: string[] = [];
    const domainFields = ['website', 'url', 'domain', 'web'];
    const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
    
    for (const field of domainFields) {
      if (item[field]) {
        const matches = String(item[field]).matchAll(domainRegex);
        for (const match of matches) {
          domains.push(match[1]);
        }
      }
    }
    
    // Also extract from email addresses
    const emails = this.extractEmails(item);
    for (const email of emails) {
      const domain = email.split('@')[1];
      if (domain) {
        domains.push(domain);
      }
    }
    
    return [...new Set(domains.map(d => d.toLowerCase()))];
  }
  
  /**
   * Helper: Extract secured parties
   */
  private extractSecuredParties(item: any): string[] {
    const parties: string[] = [];
    
    if (item['Secured Party'] || item['secured_party']) {
      const partyString = item['Secured Party'] || item['secured_party'];
      // Split by common delimiters
      const splitParties = partyString.split(/[;,\n]/);
      parties.push(...splitParties.map((p: string) => p.trim()).filter(Boolean));
    }
    
    return parties;
  }
  
  /**
   * Helper: Parse date strings
   */
  private parseDate(dateString: any): Date | undefined {
    if (!dateString) return undefined;
    
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? undefined : date;
  }
  
  /**
   * Helper: Parse amount strings
   */
  private parseAmount(amountString: any): number | undefined {
    if (!amountString) return undefined;
    
    const cleanAmount = String(amountString).replace(/[^0-9.]/g, '');
    const amount = parseFloat(cleanAmount);
    
    return isNaN(amount) ? undefined : amount;
  }
  
  /**
   * Helper: Find field by possible names
   */
  private findField(item: any, possibleNames: string[]): string | undefined {
    for (const name of possibleNames) {
      if (item[name]) {
        return String(item[name]);
      }
      // Also check case-insensitive
      const key = Object.keys(item).find(k => k.toLowerCase() === name.toLowerCase());
      if (key && item[key]) {
        return String(item[key]);
      }
    }
    return undefined;
  }
  
  /**
   * Get job status
   */
  getJob(jobId: string): IngestionJob | undefined {
    return this.activeJobs.get(jobId);
  }
  
  /**
   * Get all jobs
   */
  getAllJobs(): IngestionJob[] {
    return Array.from(this.activeJobs.values());
  }
  
  /**
   * Start queue processor
   */
  private startQueueProcessor() {
    // Process queue every 5 seconds
    setInterval(() => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.processNextJob();
      }
    }, 5000);
  }
}

// Export singleton instance
export const bulkDataIngestionService = new BulkDataIngestionService();