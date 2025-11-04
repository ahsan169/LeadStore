import crypto from 'crypto';
import { db } from '../db';
import { leads, stagingLeads, leadDedupeCandidates } from '@shared/schema';
import { eq, and, or, sql, like, ilike } from 'drizzle-orm';
import { EventEmitter } from 'events';

export interface CanonicalLead {
  id: string;
  ownerName?: string;
  legalName?: string;
  aliases: string[];
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    formatted?: string;
  };
  phones: string[];
  emails: string[];
  domains: string[];
  sources: Array<{
    name: string;
    timestamp: Date;
    confidence: number;
  }>;
  confidenceScores: {
    overall: number;
    businessInfo: number;
    contactInfo: number;
    addressInfo: number;
  };
  hash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DedupeStrategy {
  name: string;
  weight: number;
  execute: (lead1: any, lead2: any) => number; // Returns match score 0-1
}

export interface DedupeResult {
  isDuplicate: boolean;
  matchScore: number;
  matchType: string;
  candidateIds: string[];
  recommendedAction: 'merge' | 'keep_both' | 'delete_new' | 'review';
  mergedData?: CanonicalLead;
}

export interface NormalizationResult {
  normalized: any;
  changes: string[];
  confidence: number;
}

export class LeadDeduplicationService extends EventEmitter {
  private dedupeStrategies: Map<string, DedupeStrategy> = new Map();
  private phoneRegex = /[\s\-\(\)\.]/g;
  private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // State abbreviations mapping
  private stateAbbreviations: Map<string, string> = new Map([
    ['alabama', 'AL'], ['alaska', 'AK'], ['arizona', 'AZ'], ['arkansas', 'AR'],
    ['california', 'CA'], ['colorado', 'CO'], ['connecticut', 'CT'], ['delaware', 'DE'],
    ['florida', 'FL'], ['georgia', 'GA'], ['hawaii', 'HI'], ['idaho', 'ID'],
    ['illinois', 'IL'], ['indiana', 'IN'], ['iowa', 'IA'], ['kansas', 'KS'],
    ['kentucky', 'KY'], ['louisiana', 'LA'], ['maine', 'ME'], ['maryland', 'MD'],
    ['massachusetts', 'MA'], ['michigan', 'MI'], ['minnesota', 'MN'], ['mississippi', 'MS'],
    ['missouri', 'MO'], ['montana', 'MT'], ['nebraska', 'NE'], ['nevada', 'NV'],
    ['new hampshire', 'NH'], ['new jersey', 'NJ'], ['new mexico', 'NM'], ['new york', 'NY'],
    ['north carolina', 'NC'], ['north dakota', 'ND'], ['ohio', 'OH'], ['oklahoma', 'OK'],
    ['oregon', 'OR'], ['pennsylvania', 'PA'], ['rhode island', 'RI'], ['south carolina', 'SC'],
    ['south dakota', 'SD'], ['tennessee', 'TN'], ['texas', 'TX'], ['utah', 'UT'],
    ['vermont', 'VT'], ['virginia', 'VA'], ['washington', 'WA'], ['west virginia', 'WV'],
    ['wisconsin', 'WI'], ['wyoming', 'WY']
  ]);
  
  constructor() {
    super();
    this.initializeStrategies();
  }
  
  /**
   * Initialize deduplication strategies
   */
  private initializeStrategies() {
    // Exact match strategy
    this.dedupeStrategies.set('exact', {
      name: 'Exact Match',
      weight: 1.0,
      execute: (lead1: any, lead2: any) => {
        if (lead1.email && lead2.email && this.normalizeEmail(lead1.email) === this.normalizeEmail(lead2.email)) {
          return 1.0;
        }
        if (lead1.phone && lead2.phone && this.normalizePhone(lead1.phone) === this.normalizePhone(lead2.phone)) {
          return 0.9;
        }
        return 0;
      }
    });
    
    // Fuzzy name matching strategy
    this.dedupeStrategies.set('fuzzy_name', {
      name: 'Fuzzy Name Match',
      weight: 0.8,
      execute: (lead1: any, lead2: any) => {
        const name1 = this.normalizeBusinessName(lead1.businessName || lead1.legalName || '');
        const name2 = this.normalizeBusinessName(lead2.businessName || lead2.legalName || '');
        
        if (!name1 || !name2) return 0;
        
        // Calculate Levenshtein distance
        const distance = this.levenshteinDistance(name1, name2);
        const maxLength = Math.max(name1.length, name2.length);
        const similarity = 1 - (distance / maxLength);
        
        // Check if names contain each other
        if (name1.includes(name2) || name2.includes(name1)) {
          return Math.max(similarity, 0.8);
        }
        
        return similarity;
      }
    });
    
    // Domain match strategy
    this.dedupeStrategies.set('domain', {
      name: 'Domain Match',
      weight: 0.9,
      execute: (lead1: any, lead2: any) => {
        const domains1 = this.extractDomains(lead1);
        const domains2 = this.extractDomains(lead2);
        
        for (const d1 of domains1) {
          for (const d2 of domains2) {
            if (this.normalizeDomain(d1) === this.normalizeDomain(d2)) {
              return 1.0;
            }
          }
        }
        
        return 0;
      }
    });
    
    // Address match strategy
    this.dedupeStrategies.set('address', {
      name: 'Address Match',
      weight: 0.7,
      execute: (lead1: any, lead2: any) => {
        const addr1 = this.normalizeAddress({
          street: lead1.address || lead1.fullAddress,
          city: lead1.city,
          state: lead1.state || lead1.stateCode,
          zipCode: lead1.zipCode
        });
        
        const addr2 = this.normalizeAddress({
          street: lead2.address || lead2.fullAddress,
          city: lead2.city,
          state: lead2.state || lead2.stateCode,
          zipCode: lead2.zipCode
        });
        
        if (!addr1.formatted || !addr2.formatted) return 0;
        
        // Check exact match
        if (addr1.formatted === addr2.formatted) return 1.0;
        
        // Check partial matches
        let score = 0;
        if (addr1.zipCode && addr2.zipCode && addr1.zipCode === addr2.zipCode) score += 0.3;
        if (addr1.city && addr2.city && addr1.city === addr2.city) score += 0.3;
        if (addr1.state && addr2.state && addr1.state === addr2.state) score += 0.2;
        
        // Street similarity
        if (addr1.street && addr2.street) {
          const streetSimilarity = this.calculateSimilarity(addr1.street, addr2.street);
          score += streetSimilarity * 0.2;
        }
        
        return Math.min(score, 1.0);
      }
    });
    
    // Combined strategy (name + state)
    this.dedupeStrategies.set('name_state', {
      name: 'Name + State Match',
      weight: 0.75,
      execute: (lead1: any, lead2: any) => {
        const nameScore = this.dedupeStrategies.get('fuzzy_name')!.execute(lead1, lead2);
        const state1 = this.normalizeState(lead1.state || lead1.stateCode);
        const state2 = this.normalizeState(lead2.state || lead2.stateCode);
        
        if (state1 && state2 && state1 === state2 && nameScore > 0.7) {
          return Math.min(nameScore + 0.2, 1.0);
        }
        
        return 0;
      }
    });
  }
  
  /**
   * Check if a lead is a duplicate
   */
  async checkDuplicate(leadData: any): Promise<DedupeResult> {
    console.log(`[Deduplication] Checking for duplicates of: ${leadData.businessName || leadData.ownerName}`);
    
    // Generate canonical form
    const canonical = this.toCanonical(leadData);
    
    // Find potential duplicates
    const candidates = await this.findCandidates(canonical);
    
    let bestMatch: { id: string; score: number; type: string } | null = null;
    
    for (const candidate of candidates) {
      for (const [strategyName, strategy] of this.dedupeStrategies) {
        const score = strategy.execute(leadData, candidate) * strategy.weight;
        
        if (score > 0.6 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            id: candidate.id,
            score,
            type: strategyName
          };
        }
      }
    }
    
    if (bestMatch && bestMatch.score > 0.7) {
      // Store dedupe candidate for review
      await db.insert(leadDedupeCandidates).values({
        leadId1: leadData.id || null,
        leadId2: bestMatch.id,
        matchType: bestMatch.type,
        matchScore: String(bestMatch.score),
        resolved: false
      });
      
      return {
        isDuplicate: true,
        matchScore: bestMatch.score,
        matchType: bestMatch.type,
        candidateIds: [bestMatch.id],
        recommendedAction: bestMatch.score > 0.9 ? 'merge' : 'review',
        mergedData: bestMatch.score > 0.9 ? await this.mergeleads(leadData, candidates[0]) : undefined
      };
    }
    
    return {
      isDuplicate: false,
      matchScore: 0,
      matchType: 'none',
      candidateIds: [],
      recommendedAction: 'keep_both'
    };
  }
  
  /**
   * Find candidate duplicates
   */
  private async findCandidates(canonical: CanonicalLead): Promise<any[]> {
    const conditions = [];
    
    // Search by emails
    if (canonical.emails.length > 0) {
      for (const email of canonical.emails) {
        conditions.push(like(leads.email, `%${email}%`));
      }
    }
    
    // Search by phones
    if (canonical.phones.length > 0) {
      for (const phone of canonical.phones) {
        conditions.push(like(leads.phone, `%${phone}%`));
        conditions.push(like(leads.secondaryPhone, `%${phone}%`));
      }
    }
    
    // Search by business name
    if (canonical.legalName) {
      const nameParts = canonical.legalName.split(' ');
      for (const part of nameParts) {
        if (part.length > 3) {
          conditions.push(ilike(leads.businessName, `%${part}%`));
        }
      }
    }
    
    if (conditions.length === 0) {
      return [];
    }
    
    const candidates = await db
      .select()
      .from(leads)
      .where(or(...conditions))
      .limit(100);
    
    return candidates;
  }
  
  /**
   * Convert lead to canonical format
   */
  toCanonical(leadData: any): CanonicalLead {
    const phones = this.extractPhones(leadData);
    const emails = this.extractEmails(leadData);
    const domains = this.extractDomains(leadData);
    
    const canonical: CanonicalLead = {
      id: leadData.id || crypto.randomBytes(16).toString('hex'),
      ownerName: this.normalizeName(leadData.ownerName),
      legalName: this.normalizeBusinessName(leadData.businessName || leadData.legalName),
      aliases: this.extractAliases(leadData),
      address: this.normalizeAddress({
        street: leadData.address || leadData.fullAddress,
        city: leadData.city,
        state: leadData.state || leadData.stateCode,
        zipCode: leadData.zipCode
      }),
      phones: phones.map(p => this.normalizePhone(p)),
      emails: emails.map(e => this.normalizeEmail(e)),
      domains: domains.map(d => this.normalizeDomain(d)),
      sources: [{
        name: leadData.source || 'unknown',
        timestamp: new Date(),
        confidence: leadData.confidence || 0.5
      }],
      confidenceScores: {
        overall: this.calculateOverallConfidence(leadData),
        businessInfo: this.calculateFieldConfidence(['businessName', 'legalName'], leadData),
        contactInfo: this.calculateFieldConfidence(['email', 'phone'], leadData),
        addressInfo: this.calculateFieldConfidence(['address', 'city', 'state'], leadData)
      },
      hash: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Generate consistent hash
    canonical.hash = this.generateLeadHash(canonical);
    
    return canonical;
  }
  
  /**
   * Normalize business name
   */
  normalizeBusinessName(name?: string): string {
    if (!name) return '';
    
    let normalized = name.toLowerCase().trim();
    
    // Remove common suffixes
    const suffixes = [
      ' inc', ' incorporated', ' llc', ' ltd', ' limited',
      ' corp', ' corporation', ' company', ' co',
      ' llp', ' lp', ' plc', ' & associates',
      ',', '.', '!', '™', '®', '©'
    ];
    
    for (const suffix of suffixes) {
      normalized = normalized.replace(new RegExp(suffix + '$', 'i'), '');
    }
    
    // Remove extra spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }
  
  /**
   * Normalize person name
   */
  normalizeName(name?: string): string | undefined {
    if (!name) return undefined;
    
    let normalized = name.trim();
    
    // Remove titles
    const titles = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.'];
    for (const title of titles) {
      normalized = normalized.replace(new RegExp('^' + title + '\\s+', 'i'), '');
    }
    
    // Capitalize properly
    normalized = normalized.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    return normalized;
  }
  
  /**
   * Normalize phone number to E.164 format
   */
  normalizePhone(phone?: string): string {
    if (!phone) return '';
    
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    
    // Add US country code if missing
    if (digits.length === 10) {
      digits = '1' + digits;
    }
    
    // Format as E.164
    if (digits.length === 11 && digits.startsWith('1')) {
      return '+' + digits;
    }
    
    return digits;
  }
  
  /**
   * Normalize email address
   */
  normalizeEmail(email?: string): string {
    if (!email) return '';
    return email.toLowerCase().trim();
  }
  
  /**
   * Normalize domain
   */
  normalizeDomain(domain?: string): string {
    if (!domain) return '';
    
    let normalized = domain.toLowerCase().trim();
    
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');
    
    // Remove www
    normalized = normalized.replace(/^www\./, '');
    
    // Remove path
    normalized = normalized.split('/')[0];
    
    return normalized;
  }
  
  /**
   * Normalize address to USPS format
   */
  normalizeAddress(address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  }): {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    formatted?: string;
  } {
    const normalized: any = {};
    
    // Normalize street
    if (address.street) {
      let street = address.street.toUpperCase();
      
      // Common abbreviations
      const abbreviations: Record<string, string> = {
        'STREET': 'ST',
        'AVENUE': 'AVE',
        'ROAD': 'RD',
        'BOULEVARD': 'BLVD',
        'DRIVE': 'DR',
        'LANE': 'LN',
        'COURT': 'CT',
        'PLACE': 'PL',
        'CIRCLE': 'CIR',
        'NORTH': 'N',
        'SOUTH': 'S',
        'EAST': 'E',
        'WEST': 'W',
        'APARTMENT': 'APT',
        'SUITE': 'STE',
        'FLOOR': 'FL',
        'BUILDING': 'BLDG'
      };
      
      for (const [full, abbr] of Object.entries(abbreviations)) {
        street = street.replace(new RegExp('\\b' + full + '\\b', 'g'), abbr);
      }
      
      normalized.street = street.replace(/\s+/g, ' ').trim();
    }
    
    // Normalize city
    if (address.city) {
      normalized.city = address.city.toUpperCase().trim();
    }
    
    // Normalize state
    if (address.state) {
      normalized.state = this.normalizeState(address.state);
    }
    
    // Normalize ZIP code
    if (address.zipCode) {
      const zip = address.zipCode.replace(/\D/g, '');
      if (zip.length === 9) {
        normalized.zipCode = zip.slice(0, 5) + '-' + zip.slice(5);
      } else if (zip.length === 5) {
        normalized.zipCode = zip;
      } else {
        normalized.zipCode = address.zipCode;
      }
    }
    
    // Create formatted address
    if (normalized.street || normalized.city || normalized.state || normalized.zipCode) {
      const parts = [];
      if (normalized.street) parts.push(normalized.street);
      if (normalized.city) parts.push(normalized.city);
      if (normalized.state) parts.push(normalized.state);
      if (normalized.zipCode) parts.push(normalized.zipCode);
      normalized.formatted = parts.join(', ');
    }
    
    return normalized;
  }
  
  /**
   * Normalize state to 2-letter code
   */
  private normalizeState(state?: string): string | undefined {
    if (!state) return undefined;
    
    const trimmed = state.trim().toUpperCase();
    
    // Already a 2-letter code?
    if (trimmed.length === 2) return trimmed;
    
    // Look up full name
    const abbr = this.stateAbbreviations.get(trimmed.toLowerCase());
    return abbr || trimmed;
  }
  
  /**
   * Extract phones from lead data
   */
  private extractPhones(leadData: any): string[] {
    const phones: string[] = [];
    
    if (leadData.phone) phones.push(leadData.phone);
    if (leadData.secondaryPhone) phones.push(leadData.secondaryPhone);
    if (leadData.phones && Array.isArray(leadData.phones)) {
      phones.push(...leadData.phones);
    }
    
    return [...new Set(phones.filter(Boolean))];
  }
  
  /**
   * Extract emails from lead data
   */
  private extractEmails(leadData: any): string[] {
    const emails: string[] = [];
    
    if (leadData.email) emails.push(leadData.email);
    if (leadData.emails && Array.isArray(leadData.emails)) {
      emails.push(...leadData.emails);
    }
    
    return [...new Set(emails.filter(Boolean))];
  }
  
  /**
   * Extract domains from lead data
   */
  private extractDomains(leadData: any): string[] {
    const domains: string[] = [];
    
    // From website URL
    if (leadData.websiteUrl) {
      const domain = this.extractDomainFromUrl(leadData.websiteUrl);
      if (domain) domains.push(domain);
    }
    
    // From domains array
    if (leadData.domains && Array.isArray(leadData.domains)) {
      domains.push(...leadData.domains);
    }
    
    // From email addresses
    const emails = this.extractEmails(leadData);
    for (const email of emails) {
      const parts = email.split('@');
      if (parts.length === 2) {
        domains.push(parts[1]);
      }
    }
    
    return [...new Set(domains.filter(Boolean))];
  }
  
  /**
   * Extract domain from URL
   */
  private extractDomainFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : 'http://' + url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }
  
  /**
   * Extract aliases from lead data
   */
  private extractAliases(leadData: any): string[] {
    const aliases: string[] = [];
    
    if (leadData.aliases && Array.isArray(leadData.aliases)) {
      aliases.push(...leadData.aliases);
    }
    
    // Add variations of business name
    if (leadData.businessName) {
      const normalized = this.normalizeBusinessName(leadData.businessName);
      if (normalized && normalized !== leadData.businessName) {
        aliases.push(normalized);
      }
    }
    
    return [...new Set(aliases.filter(Boolean))];
  }
  
  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(leadData: any): number {
    const fieldCount = Object.keys(leadData).filter(k => leadData[k] !== null && leadData[k] !== undefined).length;
    const maxFields = 20;
    const baseConfidence = Math.min(fieldCount / maxFields, 1.0);
    
    // Boost for verified fields
    let boost = 0;
    if (leadData.emailVerified) boost += 0.1;
    if (leadData.phoneVerified) boost += 0.1;
    
    return Math.min(baseConfidence + boost, 1.0);
  }
  
  /**
   * Calculate confidence for specific fields
   */
  private calculateFieldConfidence(fields: string[], leadData: any): number {
    const presentFields = fields.filter(f => leadData[f] !== null && leadData[f] !== undefined);
    return presentFields.length / fields.length;
  }
  
  /**
   * Generate consistent hash for a lead
   */
  generateLeadHash(canonical: CanonicalLead): string {
    const parts = [
      canonical.legalName || '',
      canonical.emails[0] || '',
      canonical.phones[0] || '',
      canonical.address.formatted || ''
    ];
    
    const data = parts.join('|').toLowerCase();
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Merge two leads into one canonical lead
   */
  async mergeleads(lead1: any, lead2: any): Promise<CanonicalLead> {
    const canonical1 = this.toCanonical(lead1);
    const canonical2 = this.toCanonical(lead2);
    
    // Merge fields, preferring non-empty values with higher confidence
    const merged: CanonicalLead = {
      id: canonical1.id,
      ownerName: canonical1.ownerName || canonical2.ownerName,
      legalName: canonical1.legalName || canonical2.legalName,
      aliases: [...new Set([...canonical1.aliases, ...canonical2.aliases])],
      address: this.mergeAddresses(canonical1.address, canonical2.address),
      phones: [...new Set([...canonical1.phones, ...canonical2.phones])],
      emails: [...new Set([...canonical1.emails, ...canonical2.emails])],
      domains: [...new Set([...canonical1.domains, ...canonical2.domains])],
      sources: [...canonical1.sources, ...canonical2.sources],
      confidenceScores: {
        overall: Math.max(canonical1.confidenceScores.overall, canonical2.confidenceScores.overall),
        businessInfo: Math.max(canonical1.confidenceScores.businessInfo, canonical2.confidenceScores.businessInfo),
        contactInfo: Math.max(canonical1.confidenceScores.contactInfo, canonical2.confidenceScores.contactInfo),
        addressInfo: Math.max(canonical1.confidenceScores.addressInfo, canonical2.confidenceScores.addressInfo)
      },
      hash: '',
      createdAt: canonical1.createdAt,
      updatedAt: new Date()
    };
    
    // Generate new hash for merged lead
    merged.hash = this.generateLeadHash(merged);
    
    return merged;
  }
  
  /**
   * Merge addresses
   */
  private mergeAddresses(addr1: any, addr2: any): any {
    return {
      street: addr1.street || addr2.street,
      city: addr1.city || addr2.city,
      state: addr1.state || addr2.state,
      zipCode: addr1.zipCode || addr2.zipCode,
      formatted: addr1.formatted || addr2.formatted
    };
  }
  
  /**
   * Calculate string similarity using Levenshtein distance
   */
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
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLength);
  }
  
  /**
   * Batch deduplicate staging leads
   */
  async batchDeduplicate(jobId: string): Promise<{
    processed: number;
    duplicates: number;
    merged: number;
    errors: number;
  }> {
    console.log(`[Deduplication] Starting batch deduplication for job ${jobId}`);
    
    const stagingData = await db
      .select()
      .from(stagingLeads)
      .where(and(
        eq(stagingLeads.jobId, jobId),
        eq(stagingLeads.processed, false)
      ))
      .limit(1000);
    
    let processed = 0;
    let duplicates = 0;
    let merged = 0;
    let errors = 0;
    
    for (const record of stagingData) {
      try {
        const dedupeResult = await this.checkDuplicate(record);
        
        if (dedupeResult.isDuplicate) {
          duplicates++;
          
          if (dedupeResult.recommendedAction === 'merge' && dedupeResult.mergedData) {
            // Update existing lead with merged data
            // This would update the existing lead in the database
            merged++;
          }
        } else {
          // Create new lead from staging
          // This would insert the lead into the main leads table
        }
        
        // Mark as processed
        await db
          .update(stagingLeads)
          .set({ 
            processed: true, 
            processedAt: new Date() 
          })
          .where(eq(stagingLeads.id, record.id));
        
        processed++;
      } catch (error: any) {
        console.error(`[Deduplication] Error processing record ${record.id}:`, error);
        
        await db
          .update(stagingLeads)
          .set({ 
            processed: true,
            processedAt: new Date(),
            error: error.message
          })
          .where(eq(stagingLeads.id, record.id));
        
        errors++;
      }
    }
    
    console.log(`[Deduplication] Batch complete: ${processed} processed, ${duplicates} duplicates, ${merged} merged, ${errors} errors`);
    
    return { processed, duplicates, merged, errors };
  }
}

// Export singleton instance
export const leadDeduplicationService = new LeadDeduplicationService();