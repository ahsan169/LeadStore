import { storage } from "../storage";
import { eventBus } from "./event-bus";
import type { Lead } from "@shared/schema";
import fetch from 'node-fetch';
import OpenAI from 'openai';
import memoizee from 'memoizee';

interface BusinessEntity {
  id: string;
  businessName: string;
  alternateNames?: string[];
  ownerName?: string;
  executives?: Array<{
    name: string;
    title: string;
    linkedin?: string;
    email?: string;
  }>;
  phone?: string;
  alternatePhones?: string[];
  email?: string;
  alternateEmails?: string[];
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  industry?: string;
  naicsCode?: string;
  sicCode?: string;
  annualRevenue?: number;
  revenueRange?: string;
  employeeCount?: number;
  timeInBusiness?: number;
  foundedYear?: number;
  businessType?: string;
  taxId?: string;
  dunsNumber?: string;
  socialProfiles?: {
    linkedin?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
  };
  uccFilings?: Array<{
    filingNumber: string;
    filingDate: Date;
    securedParty: string;
    amount?: number;
    type: string;
    status: string;
  }>;
  courtRecords?: Array<{
    caseNumber: string;
    court: string;
    filingDate: Date;
    caseType: string;
    status: string;
  }>;
  licenses?: Array<{
    licenseNumber: string;
    type: string;
    issuingAuthority: string;
    issueDate: Date;
    expiryDate?: Date;
    status: string;
  }>;
  creditData?: {
    score?: number;
    rating?: string;
    paymentHistory?: string;
    bankruptcies?: number;
    liens?: number;
    judgments?: number;
  };
  fundingHistory?: Array<{
    date: Date;
    amount: number;
    type: string;
    provider?: string;
  }>;
  competitorInfo?: Array<{
    name: string;
    relationship: string;
    sharedMarkets?: string[];
  }>;
  newsAndMedia?: Array<{
    date: Date;
    source: string;
    title: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    url?: string;
  }>;
  dataQuality: {
    completeness: number;
    accuracy: number;
    lastVerified: Date;
    sources: string[];
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastEnriched?: Date;
    enrichmentCount: number;
    manuallyVerified: boolean;
  };
}

interface SearchQuery {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  industry?: string;
  uccNumber?: string;
  dunsNumber?: string;
}

interface SearchResult {
  entity: BusinessEntity;
  relevanceScore: number;
  matchedFields: string[];
  completeness: number;
}

interface CrawlTask {
  source: string;
  query: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttempt?: Date;
  results?: any;
  error?: string;
}

export class MasterDatabaseService {
  private database: Map<string, BusinessEntity> = new Map();
  private phoneIndex: Map<string, Set<string>> = new Map();
  private emailIndex: Map<string, Set<string>> = new Map();
  private nameIndex: Map<string, Set<string>> = new Map();
  private uccIndex: Map<string, Set<string>> = new Map();
  private crawlQueue: CrawlTask[] = [];
  private isProcessingQueue = false;
  private openai: OpenAI | null = null;

  // Cache for search results
  private searchCache = memoizee(
    (query: string) => this.performSearch(JSON.parse(query)),
    { maxAge: 600000, promise: true } // 10 minute cache
  );

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    this.initialize();
  }

  private async initialize() {
    // Load existing data from storage
    await this.loadFromStorage();
    
    // Start background crawling
    this.startCrawlProcessor();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Schedule periodic data refresh
    setInterval(() => this.refreshStaleData(), 3600000); // Every hour
  }

  private async loadFromStorage() {
    try {
      // Load cached master database from storage
      const cachedData = await storage.getMasterDatabaseCache();
      if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        console.log(`[MasterDatabase] Loading ${cachedData.length} entities from storage`);
        cachedData.forEach((cacheEntry: any) => {
          // Extract entity from businessData JSONB column
          const entity = cacheEntry.businessData as BusinessEntity;
          if (entity) {
            entity.id = cacheEntry.entityId || entity.id;
            this.database.set(entity.id, entity);
            this.updateIndexes(entity);
          }
        });
        console.log(`[MasterDatabase] Loaded ${this.database.size} entities into memory`);
      } else {
        console.log('[MasterDatabase] No cached data found, starting with empty database');
      }
    } catch (error) {
      console.error('[MasterDatabase] Error loading from storage:', error);
    }
  }

  private setupEventListeners() {
    eventBus.on('lead:created', this.handleNewLead.bind(this));
    eventBus.on('enrichment:completed', this.handleEnrichmentData.bind(this));
    eventBus.on('ucc:processed', this.handleUccData.bind(this));
  }

  async search(query: SearchQuery): Promise<SearchResult | null> {
    const cacheKey = JSON.stringify(query);
    return this.searchCache(cacheKey);
  }

  private async performSearch(query: SearchQuery): Promise<SearchResult | null> {
    const results: SearchResult[] = [];
    
    // First, try to search in the database (storage)
    const dbResults = await storage.searchMasterDatabase(query);
    if (dbResults && dbResults.length > 0) {
      // Add database results to our in-memory cache
      for (const dbResult of dbResults) {
        const entity = dbResult.businessData as BusinessEntity;
        if (entity) {
          entity.id = dbResult.entityId || entity.id;
          // Add to in-memory database if not already there
          if (!this.database.has(entity.id)) {
            this.database.set(entity.id, entity);
            this.updateIndexes(entity);
          }
          results.push(this.createSearchResult(entity, query));
        }
      }
    }
    
    // Also search in memory cache
    if (query.businessName) {
      const normalized = this.normalizeString(query.businessName);
      const entities = this.nameIndex.get(normalized) || new Set();
      
      for (const entityId of Array.from(entities)) {
        const entity = this.database.get(entityId);
        if (entity) {
          // Check if not already in results
          if (!results.some(r => r.entity.id === entity.id)) {
            results.push(this.createSearchResult(entity, query));
          }
        }
      }
    }
    
    // Search by phone
    if (query.phone && results.length === 0) {
      const normalizedPhone = this.normalizePhone(query.phone);
      const entities = this.phoneIndex.get(normalizedPhone) || new Set();
      
      for (const entityId of Array.from(entities)) {
        const entity = this.database.get(entityId);
        if (entity) {
          results.push(this.createSearchResult(entity, query));
        }
      }
    }
    
    // Search by email
    if (query.email && results.length === 0) {
      const normalizedEmail = query.email.toLowerCase();
      const entities = this.emailIndex.get(normalizedEmail) || new Set();
      
      for (const entityId of Array.from(entities)) {
        const entity = this.database.get(entityId);
        if (entity) {
          results.push(this.createSearchResult(entity, query));
        }
      }
    }
    
    // Search by UCC number
    if (query.uccNumber && results.length === 0) {
      const entities = this.uccIndex.get(query.uccNumber) || new Set();
      
      for (const entityId of Array.from(entities)) {
        const entity = this.database.get(entityId);
        if (entity) {
          results.push(this.createSearchResult(entity, query));
        }
      }
    }
    
    // Sort by relevance score and return best match
    if (results.length > 0) {
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);
      return results[0];
    }
    
    // If no match found, initiate a crawl task
    if (query.businessName || query.ownerName) {
      this.addCrawlTask({
        source: 'web',
        query: query.businessName || query.ownerName || '',
        priority: 5,
        status: 'pending',
        attempts: 0
      });
    }
    
    return null;
  }

  private createSearchResult(entity: BusinessEntity, query: SearchQuery): SearchResult {
    const matchedFields: string[] = [];
    let relevanceScore = 0;
    
    // Check each field for matches
    if (query.businessName && entity.businessName) {
      const similarity = this.calculateSimilarity(query.businessName, entity.businessName);
      if (similarity > 0.7) {
        matchedFields.push('businessName');
        relevanceScore += similarity * 30;
      }
    }
    
    if (query.ownerName && entity.ownerName) {
      const similarity = this.calculateSimilarity(query.ownerName, entity.ownerName);
      if (similarity > 0.7) {
        matchedFields.push('ownerName');
        relevanceScore += similarity * 25;
      }
    }
    
    if (query.phone && entity.phone) {
      if (this.normalizePhone(query.phone) === this.normalizePhone(entity.phone)) {
        matchedFields.push('phone');
        relevanceScore += 20;
      }
    }
    
    if (query.email && entity.email) {
      if (query.email.toLowerCase() === entity.email.toLowerCase()) {
        matchedFields.push('email');
        relevanceScore += 20;
      }
    }
    
    if (query.state && entity.state) {
      if (query.state === entity.state) {
        matchedFields.push('state');
        relevanceScore += 5;
      }
    }
    
    // Calculate data completeness
    const completeness = this.calculateCompleteness(entity);
    
    return {
      entity,
      relevanceScore,
      matchedFields,
      completeness
    };
  }

  private calculateCompleteness(entity: BusinessEntity): number {
    const importantFields = [
      'businessName', 'ownerName', 'phone', 'email', 'address',
      'city', 'state', 'industry', 'annualRevenue', 'timeInBusiness',
      'website', 'taxId', 'uccFilings', 'creditData'
    ];
    
    const filledFields = importantFields.filter(field => {
      const value = entity[field as keyof BusinessEntity];
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });
    
    return filledFields.length / importantFields.length;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Implement Levenshtein distance or similar algorithm
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s2.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s1.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(j - 1) !== s2.charAt(i - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s1.length] = lastValue;
    }
    return costs[s1.length];
  }

  async addToDatabase(entity: BusinessEntity): Promise<void> {
    // Check if entity already exists and merge if needed
    const existing = await this.findExistingEntity(entity);
    
    if (existing) {
      // Merge new data with existing
      const merged = this.mergeEntities(existing, entity);
      this.database.set(merged.id, merged);
      this.updateIndexes(merged);
    } else {
      // Add new entity
      if (!entity.id) {
        entity.id = this.generateEntityId(entity);
      }
      this.database.set(entity.id, entity);
      this.updateIndexes(entity);
    }
    
    // Persist to storage
    await this.persistToStorage();
  }

  private async findExistingEntity(entity: BusinessEntity): Promise<BusinessEntity | null> {
    // Try to find by various identifiers
    if (entity.taxId) {
      for (const [, existing] of Array.from(this.database)) {
        if (existing.taxId === entity.taxId) return existing;
      }
    }
    
    if (entity.dunsNumber) {
      for (const [, existing] of Array.from(this.database)) {
        if (existing.dunsNumber === entity.dunsNumber) return existing;
      }
    }
    
    // Check by business name and location
    if (entity.businessName && entity.state) {
      const normalized = this.normalizeString(entity.businessName);
      const candidates = this.nameIndex.get(normalized) || new Set();
      
      for (const candidateId of Array.from(candidates)) {
        const candidate = this.database.get(candidateId);
        if (candidate && candidate.state === entity.state) {
          // Additional verification
          if (this.isSameEntity(candidate, entity)) {
            return candidate;
          }
        }
      }
    }
    
    return null;
  }

  private isSameEntity(entity1: BusinessEntity, entity2: BusinessEntity): boolean {
    // Multiple criteria to determine if entities are the same
    let matchScore = 0;
    
    if (entity1.businessName && entity2.businessName) {
      const similarity = this.calculateSimilarity(entity1.businessName, entity2.businessName);
      if (similarity > 0.85) matchScore += 3;
      else if (similarity > 0.7) matchScore += 1;
    }
    
    if (entity1.phone && entity2.phone) {
      if (this.normalizePhone(entity1.phone) === this.normalizePhone(entity2.phone)) {
        matchScore += 3;
      }
    }
    
    if (entity1.email && entity2.email) {
      if (entity1.email.toLowerCase() === entity2.email.toLowerCase()) {
        matchScore += 3;
      }
    }
    
    if (entity1.address && entity2.address) {
      const similarity = this.calculateSimilarity(entity1.address, entity2.address);
      if (similarity > 0.8) matchScore += 2;
    }
    
    if (entity1.ownerName && entity2.ownerName) {
      const similarity = this.calculateSimilarity(entity1.ownerName, entity2.ownerName);
      if (similarity > 0.85) matchScore += 2;
    }
    
    return matchScore >= 5;
  }

  private mergeEntities(existing: BusinessEntity, newData: BusinessEntity): BusinessEntity {
    const merged: BusinessEntity = { ...existing };
    
    // Merge fields, preferring non-empty values
    Object.keys(newData).forEach(key => {
      const newValue = newData[key as keyof BusinessEntity];
      const existingValue = existing[key as keyof BusinessEntity];
      
      if (newValue !== undefined && newValue !== null) {
        if (Array.isArray(newValue) && Array.isArray(existingValue)) {
          // Merge arrays without duplicates
          (merged as any)[key] = this.mergeArrays(existingValue, newValue);
        } else if (typeof newValue === 'object' && typeof existingValue === 'object') {
          // Merge objects
          (merged as any)[key] = { ...existingValue, ...newValue };
        } else if (!existingValue || (typeof newValue === 'string' && newValue.length > 0)) {
          // Replace empty or missing values
          (merged as any)[key] = newValue;
        }
      }
    });
    
    // Update metadata
    merged.metadata.updatedAt = new Date();
    merged.metadata.enrichmentCount = (merged.metadata.enrichmentCount || 0) + 1;
    merged.metadata.lastEnriched = new Date();
    
    // Recalculate data quality
    merged.dataQuality.completeness = this.calculateCompleteness(merged);
    merged.dataQuality.lastVerified = new Date();
    
    return merged;
  }

  private mergeArrays(arr1: any[], arr2: any[]): any[] {
    const merged = [...arr1];
    
    arr2.forEach(item => {
      const isDuplicate = merged.some(existing => {
        if (typeof item === 'object' && typeof existing === 'object') {
          return JSON.stringify(item) === JSON.stringify(existing);
        }
        return item === existing;
      });
      
      if (!isDuplicate) {
        merged.push(item);
      }
    });
    
    return merged;
  }

  private updateIndexes(entity: BusinessEntity) {
    // Update name index
    if (entity.businessName) {
      const normalized = this.normalizeString(entity.businessName);
      if (!this.nameIndex.has(normalized)) {
        this.nameIndex.set(normalized, new Set());
      }
      this.nameIndex.get(normalized)!.add(entity.id);
      
      // Also index alternate names
      if (entity.alternateNames) {
        entity.alternateNames.forEach(name => {
          const normalizedAlt = this.normalizeString(name);
          if (!this.nameIndex.has(normalizedAlt)) {
            this.nameIndex.set(normalizedAlt, new Set());
          }
          this.nameIndex.get(normalizedAlt)!.add(entity.id);
        });
      }
    }
    
    // Update phone index
    if (entity.phone) {
      const normalized = this.normalizePhone(entity.phone);
      if (!this.phoneIndex.has(normalized)) {
        this.phoneIndex.set(normalized, new Set());
      }
      this.phoneIndex.get(normalized)!.add(entity.id);
      
      // Also index alternate phones
      if (entity.alternatePhones) {
        entity.alternatePhones.forEach(phone => {
          const normalizedAlt = this.normalizePhone(phone);
          if (!this.phoneIndex.has(normalizedAlt)) {
            this.phoneIndex.set(normalizedAlt, new Set());
          }
          this.phoneIndex.get(normalizedAlt)!.add(entity.id);
        });
      }
    }
    
    // Update email index
    if (entity.email) {
      const normalized = entity.email.toLowerCase();
      if (!this.emailIndex.has(normalized)) {
        this.emailIndex.set(normalized, new Set());
      }
      this.emailIndex.get(normalized)!.add(entity.id);
      
      // Also index alternate emails
      if (entity.alternateEmails) {
        entity.alternateEmails.forEach(email => {
          const normalizedAlt = email.toLowerCase();
          if (!this.emailIndex.has(normalizedAlt)) {
            this.emailIndex.set(normalizedAlt, new Set());
          }
          this.emailIndex.get(normalizedAlt)!.add(entity.id);
        });
      }
    }
    
    // Update UCC index
    if (entity.uccFilings) {
      entity.uccFilings.forEach(filing => {
        if (!this.uccIndex.has(filing.filingNumber)) {
          this.uccIndex.set(filing.filingNumber, new Set());
        }
        this.uccIndex.get(filing.filingNumber)!.add(entity.id);
      });
    }
  }

  private normalizeString(str: string): string {
    return str.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private generateEntityId(entity: BusinessEntity): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const nameHash = entity.businessName ? 
      this.normalizeString(entity.businessName).substring(0, 5) : 
      'unknown';
    return `entity_${nameHash}_${timestamp}_${random}`;
  }

  async updateFromEnrichment(leadId: string, enrichmentData: any): Promise<void> {
    // Convert enrichment data to business entity format
    const entity = this.convertToEntity(enrichmentData);
    await this.addToDatabase(entity);
  }

  private convertToEntity(data: any): BusinessEntity {
    const now = new Date();
    
    return {
      id: data.id || '',
      businessName: data.businessName || data.company?.name,
      alternateNames: data.alternateNames,
      ownerName: data.ownerName || data.owner?.name,
      executives: data.executives,
      phone: data.phone,
      alternatePhones: data.alternatePhones,
      email: data.email,
      alternateEmails: data.alternateEmails,
      website: data.website || data.domain,
      address: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      country: data.country || 'USA',
      industry: data.industry,
      naicsCode: data.naicsCode,
      sicCode: data.sicCode,
      annualRevenue: data.annualRevenue,
      revenueRange: data.revenueRange,
      employeeCount: data.employeeCount,
      timeInBusiness: data.timeInBusiness,
      foundedYear: data.foundedYear,
      businessType: data.businessType,
      taxId: data.taxId,
      dunsNumber: data.dunsNumber,
      socialProfiles: data.socialProfiles,
      uccFilings: data.uccFilings,
      courtRecords: data.courtRecords,
      licenses: data.licenses,
      creditData: data.creditData,
      fundingHistory: data.fundingHistory,
      competitorInfo: data.competitorInfo,
      newsAndMedia: data.newsAndMedia,
      dataQuality: {
        completeness: 0,
        accuracy: 0.9,
        lastVerified: now,
        sources: data.sources || []
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        lastEnriched: now,
        enrichmentCount: 1,
        manuallyVerified: false
      }
    };
  }

  private async persistToStorage() {
    try {
      const entities = Array.from(this.database.values());
      console.log(`[MasterDatabase] Persisting ${entities.length} entities to storage`);
      
      // Use the existing saveMasterDatabaseCache method which handles batch upserts
      await storage.saveMasterDatabaseCache(entities);
      
      console.log(`[MasterDatabase] Successfully persisted ${entities.length} entities`);
    } catch (error) {
      console.error('[MasterDatabase] Error persisting to storage:', error);
    }
  }

  async crawlPublicSources(query: string): Promise<any> {
    const tasks: CrawlTask[] = [
      {
        source: 'secretary_of_state',
        query,
        priority: 10,
        status: 'pending',
        attempts: 0
      },
      {
        source: 'ucc_filings',
        query,
        priority: 9,
        status: 'pending',
        attempts: 0
      },
      {
        source: 'business_registrations',
        query,
        priority: 8,
        status: 'pending',
        attempts: 0
      },
      {
        source: 'court_records',
        query,
        priority: 7,
        status: 'pending',
        attempts: 0
      },
      {
        source: 'professional_licenses',
        query,
        priority: 6,
        status: 'pending',
        attempts: 0
      }
    ];
    
    tasks.forEach(task => this.addCrawlTask(task));
    
    // Start processing if not already running
    if (!this.isProcessingQueue) {
      this.processCrawlQueue();
    }
  }

  private addCrawlTask(task: CrawlTask) {
    // Check if similar task already exists
    const exists = this.crawlQueue.some(existing => 
      existing.source === task.source && 
      existing.query === task.query &&
      existing.status !== 'failed'
    );
    
    if (!exists) {
      this.crawlQueue.push(task);
      this.crawlQueue.sort((a, b) => b.priority - a.priority);
    }
  }

  private async processCrawlQueue() {
    if (this.isProcessingQueue || this.crawlQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.crawlQueue.length > 0) {
      const task = this.crawlQueue.find(t => t.status === 'pending');
      if (!task) break;
      
      task.status = 'processing';
      task.lastAttempt = new Date();
      task.attempts++;
      
      try {
        const result = await this.executeCrawlTask(task);
        task.status = 'completed';
        task.results = result;
        
        // Process and store results
        if (result) {
          await this.processCrawlResults(result);
        }
      } catch (error) {
        console.error(`Crawl task failed for ${task.source}:`, error);
        task.status = 'failed';
        task.error = (error as Error).message;
        
        // Retry if attempts < 3
        if (task.attempts < 3) {
          task.status = 'pending';
        }
      }
      
      // Remove completed or permanently failed tasks
      if (task.status === 'completed' || (task.status === 'failed' && task.attempts >= 3)) {
        const index = this.crawlQueue.indexOf(task);
        this.crawlQueue.splice(index, 1);
      }
      
      // Rate limiting
      await this.delay(1000);
    }
    
    this.isProcessingQueue = false;
  }

  private async executeCrawlTask(task: CrawlTask): Promise<any> {
    // This would implement actual web scraping/API calls to public sources
    // For now, returning simulated data structure
    
    switch (task.source) {
      case 'secretary_of_state':
        return this.crawlSecretaryOfState(task.query);
      case 'ucc_filings':
        return this.crawlUccFilings(task.query);
      case 'business_registrations':
        return this.crawlBusinessRegistrations(task.query);
      case 'court_records':
        return this.crawlCourtRecords(task.query);
      case 'professional_licenses':
        return this.crawlProfessionalLicenses(task.query);
      default:
        return null;
    }
  }

  private async crawlSecretaryOfState(query: string): Promise<any> {
    // Simulate crawling Secretary of State records
    // In production, this would use actual web scraping or API calls
    
    return {
      businessName: query,
      registrationNumber: `REG${Math.random().toString(36).substring(2, 9)}`,
      registrationDate: new Date(2020, 0, 1),
      status: 'Active',
      type: 'LLC',
      registeredAgent: 'John Doe',
      registeredAddress: '123 Business St, City, ST 12345'
    };
  }

  private async crawlUccFilings(query: string): Promise<any> {
    // Simulate crawling UCC filing records
    return {
      filings: [
        {
          filingNumber: `UCC${Math.random().toString(36).substring(2, 9)}`,
          filingDate: new Date(2023, 5, 15),
          securedParty: 'Business Lending Corp',
          amount: 50000,
          type: 'UCC-1',
          status: 'Active'
        }
      ]
    };
  }

  private async crawlBusinessRegistrations(query: string): Promise<any> {
    // Simulate crawling business registration databases
    return {
      licenses: [
        {
          licenseNumber: `LIC${Math.random().toString(36).substring(2, 9)}`,
          type: 'Business License',
          issuingAuthority: 'City Business Department',
          issueDate: new Date(2021, 3, 1),
          expiryDate: new Date(2024, 3, 1),
          status: 'Active'
        }
      ]
    };
  }

  private async crawlCourtRecords(query: string): Promise<any> {
    // Simulate crawling court records
    return {
      records: []  // No court records found
    };
  }

  private async crawlProfessionalLicenses(query: string): Promise<any> {
    // Simulate crawling professional license databases
    return {
      licenses: []
    };
  }

  private async processCrawlResults(results: any) {
    // Convert crawl results to BusinessEntity and add to database
    const entity = this.convertCrawlResultsToEntity(results);
    if (entity) {
      await this.addToDatabase(entity);
    }
  }

  private convertCrawlResultsToEntity(results: any): BusinessEntity | null {
    if (!results) return null;
    
    const now = new Date();
    
    return {
      id: '',
      businessName: results.businessName,
      address: results.registeredAddress,
      businessType: results.type,
      uccFilings: results.filings,
      courtRecords: results.records,
      licenses: results.licenses,
      dataQuality: {
        completeness: 0.3,
        accuracy: 0.8,
        lastVerified: now,
        sources: ['public_records']
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        enrichmentCount: 0,
        manuallyVerified: false
      }
    };
  }

  private startCrawlProcessor() {
    // Process crawl queue every 30 seconds
    setInterval(() => {
      if (!this.isProcessingQueue && this.crawlQueue.length > 0) {
        this.processCrawlQueue();
      }
    }, 30000);
  }

  private async refreshStaleData() {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
    
    for (const [, entity] of Array.from(this.database)) {
      if (entity.dataQuality.lastVerified < staleThreshold) {
        // Add to crawl queue for refresh
        this.addCrawlTask({
          source: 'business_registrations',
          query: entity.businessName,
          priority: 3,
          status: 'pending',
          attempts: 0
        });
      }
    }
  }

  private async handleNewLead(data: { lead: Lead }) {
    // Check if we have data for this lead
    const result = await this.search({
      businessName: data.lead.businessName,
      ownerName: data.lead.ownerName,
      phone: data.lead.phone,
      email: data.lead.email
    });
    
    if (!result) {
      // Initiate crawl for new lead
      await this.crawlPublicSources(data.lead.businessName || data.lead.ownerName || '');
    }
  }

  private async handleEnrichmentData(data: { leadId: string, results: any }) {
    // Update master database with enrichment results
    await this.updateFromEnrichment(data.leadId, data.results);
  }

  private async handleUccData(data: { businessName: string, uccData: any }) {
    // Update master database with UCC data
    const entity = this.convertToEntity({
      businessName: data.businessName,
      uccFilings: data.uccData.filings
    });
    await this.addToDatabase(entity);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getStatistics(): Promise<any> {
    const totalEntities = this.database.size;
    const completenessScores: number[] = [];
    const industries = new Map<string, number>();
    const states = new Map<string, number>();
    
    for (const [, entity] of Array.from(this.database)) {
      completenessScores.push(entity.dataQuality.completeness);
      
      if (entity.industry) {
        industries.set(entity.industry, (industries.get(entity.industry) || 0) + 1);
      }
      
      if (entity.state) {
        states.set(entity.state, (states.get(entity.state) || 0) + 1);
      }
    }
    
    const avgCompleteness = completenessScores.length > 0
      ? completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length
      : 0;
    
    return {
      totalEntities,
      avgCompleteness,
      topIndustries: Array.from(industries.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      topStates: Array.from(states.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      crawlQueueSize: this.crawlQueue.length,
      indexSizes: {
        names: this.nameIndex.size,
        phones: this.phoneIndex.size,
        emails: this.emailIndex.size,
        ucc: this.uccIndex.size
      }
    };
  }

  async exportDatabase(): Promise<BusinessEntity[]> {
    return Array.from(this.database.values());
  }

  async importDatabase(entities: BusinessEntity[]): Promise<void> {
    for (const entity of entities) {
      await this.addToDatabase(entity);
    }
  }
}

// Export singleton instance
export const masterDatabase = new MasterDatabaseService();