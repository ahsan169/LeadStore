import { db } from "../db";
import { leads, uccFilings, uccRelationships } from "@shared/schema";
import type { Lead, UccFiling } from "@shared/schema";
import { eq, and, or, ilike, sql, ne } from "drizzle-orm";

/**
 * Match confidence levels
 */
export interface MatchConfidence {
  type: 'exact' | 'fuzzy' | 'address' | 'phone' | 'email' | 'owner' | 'related';
  score: number; // 0-100
  evidence: string[];
  metadata?: any;
}

/**
 * Relationship types between entities
 */
export interface EntityRelationship {
  type: 'owner' | 'subsidiary' | 'partner' | 'supplier' | 'customer' | 'guarantor' | 'affiliate';
  strength: number; // 0-100
  bidirectional: boolean;
  confidence: number; // 0-100
  evidence: string[];
  riskTransmission: number; // 0-100 how much risk transmits through this relationship
}

/**
 * Lead matching result
 */
export interface LeadMatchResult {
  leadId: string;
  matchedLeads: Array<{
    lead: Lead;
    matches: MatchConfidence[];
    overallConfidence: number;
    relationships: EntityRelationship[];
    commonLenders?: string[];
    sharedFilings?: number;
  }>;
  relationshipGraph: {
    nodes: Array<{
      id: string;
      type: 'lead' | 'owner' | 'lender' | 'address';
      label: string;
      risk: number;
      metadata: any;
    }>;
    edges: Array<{
      source: string;
      target: string;
      relationship: EntityRelationship;
    }>;
  };
  scoring: {
    relationshipStrength: number; // 0-100
    riskContagion: number; // 0-100
    opportunityScore: number; // 0-100
    crossSellPotential: string[];
    portfolioValue: number;
  };
  insights: {
    keyFindings: string[];
    riskWarnings: string[];
    opportunities: string[];
    hiddenConnections: string[];
  };
}

/**
 * Supply chain relationship
 */
export interface SupplyChainRelationship {
  type: 'supplier' | 'customer' | 'distributor' | 'manufacturer';
  confidence: number;
  evidence: string[];
  volumeEstimate?: number;
  criticalityScore: number; // How critical is this relationship
}

/**
 * Enhanced UCC Lead Matching Service
 * Advanced matching algorithms for identifying relationships between leads
 */
export class UccLeadMatchingService {
  /**
   * Find all related leads using multiple matching strategies
   */
  async findRelatedLeads(
    leadId: string,
    options: {
      maxDepth?: number; // How many degrees of separation to search
      minConfidence?: number; // Minimum confidence threshold
      includeIndirect?: boolean; // Include indirect relationships
      searchUccData?: boolean; // Search through UCC filings
    } = {}
  ): Promise<LeadMatchResult> {
    const {
      maxDepth = 2,
      minConfidence = 30,
      includeIndirect = true,
      searchUccData = true
    } = options;
    
    // Get the source lead
    const sourceLead = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    if (!sourceLead[0]) throw new Error('Lead not found');
    
    const lead = sourceLead[0];
    const matchedLeads: LeadMatchResult['matchedLeads'] = [];
    const processedIds = new Set<string>([leadId]);
    
    // Perform parallel matching strategies
    const [
      fuzzyMatches,
      phoneMatches,
      emailMatches,
      addressMatches,
      ownerMatches,
      uccMatches
    ] = await Promise.all([
      this.findFuzzyNameMatches(lead),
      this.findPhoneMatches(lead),
      this.findEmailMatches(lead),
      this.findAddressMatches(lead),
      this.findOwnerMatches(lead),
      searchUccData ? this.findUccRelatedLeads(lead) : Promise.resolve([])
    ]);
    
    // Combine and deduplicate matches
    const allMatches = new Map<string, {
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }>();
    
    // Process each match type
    [fuzzyMatches, phoneMatches, emailMatches, addressMatches, ownerMatches, uccMatches].forEach(matches => {
      matches.forEach(match => {
        if (match.lead.id === leadId) return; // Skip self
        
        const existing = allMatches.get(match.lead.id);
        if (existing) {
          // Merge match types
          existing.matches.push(...match.matches);
          existing.relationships.push(...(match.relationships || []));
        } else {
          allMatches.set(match.lead.id, match);
        }
        processedIds.add(match.lead.id);
      });
    });
    
    // Calculate overall confidence and filter by threshold
    for (const [matchLeadId, match] of Array.from(allMatches.entries())) {
      const overallConfidence = this.calculateOverallConfidence(match.matches);
      if (overallConfidence >= minConfidence) {
        // Check for common lenders if UCC data available
        const commonLenders = searchUccData ? 
          await this.findCommonLenders(lead, match.lead) : [];
        
        matchedLeads.push({
          lead: match.lead,
          matches: match.matches,
          overallConfidence,
          relationships: match.relationships,
          commonLenders: commonLenders,
          sharedFilings: commonLenders.length
        });
      }
    }
    
    // Search indirect relationships if requested
    if (includeIndirect && maxDepth > 1) {
      const indirectMatches = await this.findIndirectRelationships(
        lead,
        matchedLeads.map(m => m.lead),
        maxDepth - 1,
        minConfidence
      );
      matchedLeads.push(...indirectMatches);
    }
    
    // Build relationship graph
    const relationshipGraph = this.buildRelationshipGraph(lead, matchedLeads);
    
    // Calculate scoring
    const scoring = this.calculateScoring(lead, matchedLeads);
    
    // Generate insights
    const insights = this.generateInsights(lead, matchedLeads, scoring);
    
    // Save relationships to database
    await this.saveRelationships(leadId, matchedLeads);
    
    return {
      leadId,
      matchedLeads,
      relationshipGraph,
      scoring,
      insights
    };
  }

  /**
   * Find fuzzy name matches
   */
  private async findFuzzyNameMatches(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    const results: Array<{
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }> = [];
    
    // Generate name variations
    const nameVariations = this.generateBusinessNameVariations(lead.businessName);
    
    // Search for each variation
    const searchPromises = nameVariations.map(variation => 
      db.select()
        .from(leads)
        .where(
          and(
            ne(leads.id, lead.id),
            ilike(leads.businessName, `%${variation}%`)
          )
        )
        .limit(10)
    );
    
    const searchResults = await Promise.all(searchPromises);
    const uniqueMatches = new Map<string, Lead>();
    
    searchResults.flat().forEach(match => {
      if (!uniqueMatches.has(match.id)) {
        uniqueMatches.set(match.id, match);
      }
    });
    
    // Calculate similarity scores
    uniqueMatches.forEach(matchedLead => {
      const similarity = this.calculateNameSimilarity(
        lead.businessName.toLowerCase(),
        matchedLead.businessName.toLowerCase()
      );
      
      if (similarity >= 0.5) {
        const confidence = Math.round(similarity * 100);
        const matchType: MatchConfidence['type'] = similarity >= 0.9 ? 'exact' : 'fuzzy';
        
        // Determine relationship type
        const relationships: EntityRelationship[] = [];
        if (similarity >= 0.8) {
          // Check for subsidiary patterns
          const isSubsidiary = this.detectSubsidiaryPattern(lead.businessName, matchedLead.businessName);
          const isParent = this.detectSubsidiaryPattern(matchedLead.businessName, lead.businessName);
          
          if (isSubsidiary) {
            relationships.push({
              type: 'subsidiary',
              strength: confidence,
              bidirectional: false,
              confidence,
              evidence: [`Name pattern suggests ${matchedLead.businessName} is subsidiary`],
              riskTransmission: 70
            });
          } else if (isParent) {
            relationships.push({
              type: 'subsidiary',
              strength: confidence,
              bidirectional: false,
              confidence,
              evidence: [`Name pattern suggests ${lead.businessName} is subsidiary`],
              riskTransmission: 70
            });
          } else {
            relationships.push({
              type: 'affiliate',
              strength: confidence,
              bidirectional: true,
              confidence,
              evidence: [`High name similarity (${confidence}%)`],
              riskTransmission: 50
            });
          }
        }
        
        results.push({
          lead: matchedLead,
          matches: [{
            type: matchType,
            score: confidence,
            evidence: [`Business name similarity: ${confidence}%`],
            metadata: { similarity, variations: nameVariations }
          }],
          relationships
        });
      }
    });
    
    return results;
  }

  /**
   * Find phone number matches
   */
  private async findPhoneMatches(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    const results: Array<{
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }> = [];
    
    // Normalize phone numbers
    const phones = [
      this.normalizePhone(lead.phone),
      lead.secondaryPhone ? this.normalizePhone(lead.secondaryPhone) : null
    ].filter(p => p);
    
    if (phones.length === 0) return results;
    
    // Search for matches
    const matches = await db.select()
      .from(leads)
      .where(
        and(
          ne(leads.id, lead.id),
          or(
            ...phones.map(phone => 
              or(
                eq(sql`REGEXP_REPLACE(${leads.phone}, '[^0-9]', '', 'g')`, phone!),
                eq(sql`REGEXP_REPLACE(${leads.secondaryPhone}, '[^0-9]', '', 'g')`, phone!)
              )
            )
          )
        )
      )
      .limit(20);
    
    matches.forEach(matchedLead => {
      const matchedPhones = [
        this.normalizePhone(matchedLead.phone),
        matchedLead.secondaryPhone ? this.normalizePhone(matchedLead.secondaryPhone) : null
      ].filter(p => p);
      
      const sharedPhones = phones.filter(p => matchedPhones.includes(p));
      
      if (sharedPhones.length > 0) {
        results.push({
          lead: matchedLead,
          matches: [{
            type: 'phone',
            score: 95, // High confidence for phone matches
            evidence: [`Shared phone number(s): ${sharedPhones.join(', ')}`],
            metadata: { sharedPhones }
          }],
          relationships: [{
            type: 'owner', // Same phone often means same owner
            strength: 90,
            bidirectional: true,
            confidence: 95,
            evidence: ['Shared phone number indicates common ownership'],
            riskTransmission: 85
          }]
        });
      }
    });
    
    return results;
  }

  /**
   * Find email matches
   */
  private async findEmailMatches(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    const results: Array<{
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }> = [];
    
    if (!lead.email) return results;
    
    const emailDomain = lead.email.split('@')[1];
    
    // Exact email matches
    const exactMatches = await db.select()
      .from(leads)
      .where(
        and(
          ne(leads.id, lead.id),
          eq(leads.email, lead.email)
        )
      )
      .limit(10);
    
    exactMatches.forEach(matchedLead => {
      results.push({
        lead: matchedLead,
        matches: [{
          type: 'email',
          score: 98,
          evidence: [`Exact email match: ${lead.email}`],
          metadata: { email: lead.email }
        }],
        relationships: [{
          type: 'owner',
          strength: 95,
          bidirectional: true,
          confidence: 98,
          evidence: ['Same email address indicates common ownership'],
          riskTransmission: 90
        }]
      });
    });
    
    // Domain matches (potential affiliates)
    if (!['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(emailDomain)) {
      const domainMatches = await db.select()
        .from(leads)
        .where(
          and(
            ne(leads.id, lead.id),
            ilike(leads.email, `%@${emailDomain}`)
          )
        )
        .limit(20);
      
      domainMatches.forEach(matchedLead => {
        if (!exactMatches.some(m => m.id === matchedLead.id)) {
          results.push({
            lead: matchedLead,
            matches: [{
              type: 'email',
              score: 60,
              evidence: [`Same email domain: @${emailDomain}`],
              metadata: { domain: emailDomain }
            }],
            relationships: [{
              type: 'affiliate',
              strength: 60,
              bidirectional: true,
              confidence: 60,
              evidence: ['Same corporate email domain'],
              riskTransmission: 40
            }]
          });
        }
      });
    }
    
    return results;
  }

  /**
   * Find address matches (placeholder - would need address field in schema)
   */
  private async findAddressMatches(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    // Note: This would require address fields in the leads table
    // For now, we can look for address patterns in UCC filings
    return [];
  }

  /**
   * Find owner name matches
   */
  private async findOwnerMatches(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    const results: Array<{
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }> = [];
    
    if (!lead.ownerName) return results;
    
    // Normalize owner name
    const ownerNameNormalized = this.normalizePersonName(lead.ownerName);
    const ownerNameParts = ownerNameNormalized.split(' ');
    
    // Search for exact and partial matches
    const matches = await db.select()
      .from(leads)
      .where(
        and(
          ne(leads.id, lead.id),
          or(
            eq(leads.ownerName, lead.ownerName),
            ilike(leads.ownerName, `%${ownerNameNormalized}%`),
            ...ownerNameParts.map(part => 
              ilike(leads.ownerName, `%${part}%`)
            )
          )
        )
      )
      .limit(30);
    
    matches.forEach(matchedLead => {
      const matchedOwnerNormalized = this.normalizePersonName(matchedLead.ownerName);
      const similarity = this.calculateNameSimilarity(ownerNameNormalized, matchedOwnerNormalized);
      
      if (similarity >= 0.7) {
        const confidence = Math.round(similarity * 100);
        
        results.push({
          lead: matchedLead,
          matches: [{
            type: 'owner',
            score: confidence,
            evidence: [`Owner name similarity: ${confidence}% (${lead.ownerName} ≈ ${matchedLead.ownerName})`],
            metadata: { ownerSimilarity: similarity }
          }],
          relationships: [{
            type: 'owner',
            strength: confidence,
            bidirectional: true,
            confidence,
            evidence: [`Same beneficial owner: ${lead.ownerName}`],
            riskTransmission: 80
          }]
        });
      }
    });
    
    return results;
  }

  /**
   * Find UCC-related leads
   */
  private async findUccRelatedLeads(lead: Lead): Promise<Array<{
    lead: Lead;
    matches: MatchConfidence[];
    relationships: EntityRelationship[];
  }>> {
    const results: Array<{
      lead: Lead;
      matches: MatchConfidence[];
      relationships: EntityRelationship[];
    }> = [];
    
    // Get UCC filings for this lead
    const leadFilings = await db.select()
      .from(uccFilings)
      .where(
        or(
          eq(uccFilings.leadId, lead.id),
          ilike(uccFilings.debtorName, `%${lead.businessName}%`)
        )
      );
    
    if (leadFilings.length === 0) return results;
    
    // Find other leads with same lenders
    const lenders = Array.from(new Set(leadFilings.map(f => f.securedParty)));
    
    const relatedFilings = await db.select()
      .from(uccFilings)
      .where(
        and(
          ne(uccFilings.leadId, lead.id),
          or(...lenders.map(lender => eq(uccFilings.securedParty, lender)))
        )
      );
    
    // Group by lead
    const leadIdToFilings = new Map<string, typeof relatedFilings>();
    relatedFilings.forEach(filing => {
      if (filing.leadId) {
        const existing = leadIdToFilings.get(filing.leadId) || [];
        existing.push(filing);
        leadIdToFilings.set(filing.leadId, existing);
      }
    });
    
    // Fetch related leads
    if (leadIdToFilings.size > 0) {
      const relatedLeads = await db.select()
        .from(leads)
        .where(inArray(leads.id, Array.from(leadIdToFilings.keys())));
      
      relatedLeads.forEach(relatedLead => {
        const sharedLenders = this.findSharedLenders(
          leadFilings,
          leadIdToFilings.get(relatedLead.id) || []
        );
        
        if (sharedLenders.length > 0) {
          // Check for supply chain patterns
          const supplyChain = this.detectSupplyChainRelationship(
            lead,
            relatedLead,
            leadFilings,
            leadIdToFilings.get(relatedLead.id) || []
          );
          
          const relationships: EntityRelationship[] = [];
          
          if (supplyChain) {
            relationships.push({
              type: supplyChain.type === 'supplier' ? 'supplier' : 'customer',
              strength: supplyChain.confidence,
              bidirectional: false,
              confidence: supplyChain.confidence,
              evidence: supplyChain.evidence,
              riskTransmission: supplyChain.criticalityScore
            });
          } else {
            // Default to partner relationship for shared lenders
            relationships.push({
              type: 'partner',
              strength: Math.min(100, sharedLenders.length * 20),
              bidirectional: true,
              confidence: Math.min(100, sharedLenders.length * 25),
              evidence: [`Shared lenders: ${sharedLenders.join(', ')}`],
              riskTransmission: 30
            });
          }
          
          results.push({
            lead: relatedLead,
            matches: [{
              type: 'related',
              score: Math.min(100, sharedLenders.length * 30),
              evidence: [`${sharedLenders.length} shared lender(s)`],
              metadata: { sharedLenders }
            }],
            relationships
          });
        }
      });
    }
    
    return results;
  }

  /**
   * Find indirect relationships (second-degree connections)
   */
  private async findIndirectRelationships(
    sourceLead: Lead,
    directMatches: Lead[],
    remainingDepth: number,
    minConfidence: number
  ): Promise<LeadMatchResult['matchedLeads']> {
    if (remainingDepth <= 0 || directMatches.length === 0) return [];
    
    const indirectMatches: LeadMatchResult['matchedLeads'] = [];
    const processedIds = new Set<string>([sourceLead.id, ...directMatches.map(l => l.id)]);
    
    // Search one level deeper for each direct match
    for (const directMatch of directMatches.slice(0, 5)) { // Limit to prevent explosion
      const secondDegree = await this.findRelatedLeads(directMatch.id, {
        maxDepth: 1,
        minConfidence,
        includeIndirect: false,
        searchUccData: true
      });
      
      secondDegree.matchedLeads.forEach(match => {
        if (!processedIds.has(match.lead.id)) {
          // Reduce confidence for indirect matches
          const adjustedConfidence = match.overallConfidence * 0.6;
          if (adjustedConfidence >= minConfidence) {
            indirectMatches.push({
              ...match,
              overallConfidence: adjustedConfidence,
              matches: match.matches.map(m => ({
                ...m,
                score: Math.round(m.score * 0.6),
                evidence: [...m.evidence, `Indirect connection via ${directMatch.businessName}`]
              }))
            });
            processedIds.add(match.lead.id);
          }
        }
      });
    }
    
    return indirectMatches;
  }

  /**
   * Helper: Generate business name variations
   */
  private generateBusinessNameVariations(name: string): string[] {
    const variations: string[] = [];
    const normalized = name.toLowerCase().trim();
    
    // Base name without common suffixes
    const suffixes = ['llc', 'inc', 'corp', 'corporation', 'company', 'co', 'ltd', 'limited', 'group', 'holdings'];
    let baseName = normalized;
    suffixes.forEach(suffix => {
      const pattern = new RegExp(`\\s+${suffix}\\.?$`, 'i');
      if (pattern.test(baseName)) {
        baseName = baseName.replace(pattern, '').trim();
      }
    });
    
    variations.push(baseName);
    
    // Add common abbreviations
    const abbreviations: Record<string, string[]> = {
      'international': ['intl', "int'l"],
      'incorporated': ['inc'],
      'corporation': ['corp'],
      'company': ['co'],
      'limited': ['ltd'],
      'associates': ['assoc'],
      'brothers': ['bros'],
      'management': ['mgmt'],
      'development': ['dev'],
      'technologies': ['tech'],
      'enterprises': ['ent']
    };
    
    Object.entries(abbreviations).forEach(([full, abbrs]) => {
      if (baseName.includes(full)) {
        abbrs.forEach(abbr => {
          variations.push(baseName.replace(full, abbr));
        });
      }
      // Also check reverse
      abbrs.forEach(abbr => {
        if (baseName.includes(abbr)) {
          variations.push(baseName.replace(abbr, full));
        }
      });
    });
    
    // Handle DBA names
    if (normalized.includes(' dba ')) {
      const parts = normalized.split(' dba ');
      variations.push(parts[0].trim(), parts[1].trim());
    }
    
    // Handle "The" prefix
    if (baseName.startsWith('the ')) {
      variations.push(baseName.substring(4));
    } else {
      variations.push(`the ${baseName}`);
    }
    
    // Handle ampersands and "and"
    if (baseName.includes(' & ')) {
      variations.push(baseName.replace(' & ', ' and '));
    } else if (baseName.includes(' and ')) {
      variations.push(baseName.replace(' and ', ' & '));
    }
    
    // Remove duplicates and filter valid variations
    return Array.from(new Set(variations)).filter(v => v.length > 2);
  }

  /**
   * Helper: Normalize phone number
   */
  private normalizePhone(phone: string): string | null {
    if (!phone) return null;
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    // Handle US phone numbers (remove leading 1 if 11 digits)
    if (digits.length === 11 && digits.startsWith('1')) {
      return digits.substring(1);
    }
    if (digits.length === 10) {
      return digits;
    }
    return null;
  }

  /**
   * Helper: Normalize person name
   */
  private normalizePersonName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove non-letters
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Helper: Calculate name similarity using Jaro-Winkler distance
   */
  private calculateNameSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;
    
    // Jaro similarity
    const len1 = str1.length;
    const len2 = str2.length;
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    
    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || str1[i] !== str2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
    
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    
    // Jaro-Winkler modification
    let commonPrefixLen = 0;
    for (let i = 0; i < Math.min(len1, len2, 4); i++) {
      if (str1[i] === str2[i]) commonPrefixLen++;
      else break;
    }
    
    return jaro + commonPrefixLen * 0.1 * (1 - jaro);
  }

  /**
   * Helper: Detect subsidiary pattern
   */
  private detectSubsidiaryPattern(parentName: string, childName: string): boolean {
    const parent = parentName.toLowerCase();
    const child = childName.toLowerCase();
    
    // Check for common subsidiary patterns
    const patterns = [
      () => child.startsWith(parent) && child.length > parent.length,
      () => child.includes(`${parent} -`),
      () => child.includes(`${parent} (`),
      () => child.endsWith(`of ${parent}`),
      () => child.includes(`${parent} division`),
      () => child.includes(`${parent} subsidiary`)
    ];
    
    return patterns.some(pattern => pattern());
  }

  /**
   * Helper: Find shared lenders between filings
   */
  private findSharedLenders(filings1: UccFiling[], filings2: UccFiling[]): string[] {
    const lenders1 = new Set(filings1.map(f => f.securedParty));
    const lenders2 = new Set(filings2.map(f => f.securedParty));
    
    const shared: string[] = [];
    lenders1.forEach(lender => {
      if (lenders2.has(lender)) {
        shared.push(lender);
      }
    });
    
    return shared;
  }

  /**
   * Helper: Find common lenders (async version)
   */
  private async findCommonLenders(lead1: Lead, lead2: Lead): Promise<string[]> {
    const [filings1, filings2] = await Promise.all([
      db.select().from(uccFilings).where(eq(uccFilings.leadId, lead1.id)),
      db.select().from(uccFilings).where(eq(uccFilings.leadId, lead2.id))
    ]);
    
    return this.findSharedLenders(filings1, filings2);
  }

  /**
   * Helper: Detect supply chain relationship
   */
  private detectSupplyChainRelationship(
    lead1: Lead,
    lead2: Lead,
    filings1: UccFiling[],
    filings2: UccFiling[]
  ): SupplyChainRelationship | null {
    const evidence: string[] = [];
    let type: SupplyChainRelationship['type'] = 'supplier';
    let confidence = 0;
    
    // Check industry relationships
    const industry1 = lead1.industry?.toLowerCase() || '';
    const industry2 = lead2.industry?.toLowerCase() || '';
    
    const supplyChainPairs: Record<string, string[]> = {
      'restaurant': ['food', 'beverage', 'supplier', 'distributor'],
      'retail': ['wholesale', 'manufacturer', 'distributor'],
      'construction': ['materials', 'equipment', 'supplier'],
      'manufacturing': ['raw materials', 'components', 'supplier']
    };
    
    // Check if industries suggest supply chain
    Object.entries(supplyChainPairs).forEach(([buyer, suppliers]) => {
      if (industry1.includes(buyer)) {
        suppliers.forEach(supplier => {
          if (industry2.includes(supplier)) {
            type = 'supplier';
            confidence += 40;
            evidence.push(`Industry relationship: ${industry2} supplies ${industry1}`);
          }
        });
      }
      if (industry2.includes(buyer)) {
        suppliers.forEach(supplier => {
          if (industry1.includes(supplier)) {
            type = 'customer';
            confidence += 40;
            evidence.push(`Industry relationship: ${industry1} supplies ${industry2}`);
          }
        });
      }
    });
    
    // Check collateral patterns
    const hasInventoryFinancing1 = filings1.some(f => 
      f.collateralDescription?.toLowerCase().includes('inventory')
    );
    const hasInventoryFinancing2 = filings2.some(f => 
      f.collateralDescription?.toLowerCase().includes('inventory')
    );
    
    if (hasInventoryFinancing1 && !hasInventoryFinancing2) {
      confidence += 20;
      evidence.push('Buyer has inventory financing, supplier does not');
    }
    
    // Check financing timing patterns
    const avgDate1 = filings1.reduce((sum, f) => 
      sum + new Date(f.filingDate).getTime(), 0
    ) / filings1.length;
    const avgDate2 = filings2.reduce((sum, f) => 
      sum + new Date(f.filingDate).getTime(), 0
    ) / filings2.length;
    
    const daysDiff = Math.abs(avgDate1 - avgDate2) / (1000 * 60 * 60 * 24);
    if (daysDiff < 60) {
      confidence += 15;
      evidence.push('Synchronized financing suggests business relationship');
    }
    
    if (confidence < 50) return null;
    
    return {
      type,
      confidence: Math.min(100, confidence),
      evidence,
      criticalityScore: confidence > 70 ? 80 : 50
    };
  }

  /**
   * Calculate overall confidence from multiple match types
   */
  private calculateOverallConfidence(matches: MatchConfidence[]): number {
    if (matches.length === 0) return 0;
    
    // Weight different match types
    const weights: Record<MatchConfidence['type'], number> = {
      'exact': 1.0,
      'phone': 0.95,
      'email': 0.93,
      'owner': 0.90,
      'fuzzy': 0.70,
      'address': 0.85,
      'related': 0.60
    };
    
    // Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;
    
    matches.forEach(match => {
      const weight = weights[match.type];
      weightedSum += match.score * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Build relationship graph for visualization
   */
  private buildRelationshipGraph(
    sourceLead: Lead,
    matchedLeads: LeadMatchResult['matchedLeads']
  ): LeadMatchResult['relationshipGraph'] {
    const nodes: LeadMatchResult['relationshipGraph']['nodes'] = [];
    const edges: LeadMatchResult['relationshipGraph']['edges'] = [];
    const nodeMap = new Map<string, any>();
    
    // Add source lead node
    const sourceNode = {
      id: sourceLead.id,
      type: 'lead' as const,
      label: sourceLead.businessName,
      risk: 50, // Default, would be calculated
      metadata: { lead: sourceLead }
    };
    nodes.push(sourceNode);
    nodeMap.set(sourceLead.id, sourceNode);
    
    // Add matched leads and relationships
    matchedLeads.forEach(match => {
      // Add lead node if not exists
      if (!nodeMap.has(match.lead.id)) {
        const node = {
          id: match.lead.id,
          type: 'lead' as const,
          label: match.lead.businessName,
          risk: 50, // Would be calculated
          metadata: { lead: match.lead }
        };
        nodes.push(node);
        nodeMap.set(match.lead.id, node);
      }
      
      // Add edges for each relationship
      match.relationships.forEach(rel => {
        edges.push({
          source: sourceLead.id,
          target: match.lead.id,
          relationship: rel
        });
      });
      
      // Add owner nodes if detected
      if (match.matches.some(m => m.type === 'owner')) {
        const ownerId = `owner-${sourceLead.ownerName}`;
        if (!nodeMap.has(ownerId)) {
          const ownerNode = {
            id: ownerId,
            type: 'owner' as const,
            label: sourceLead.ownerName,
            risk: 30,
            metadata: { name: sourceLead.ownerName }
          };
          nodes.push(ownerNode);
          nodeMap.set(ownerId, ownerNode);
        }
        
        // Connect owner to both businesses
        edges.push({
          source: ownerId,
          target: sourceLead.id,
          relationship: {
            type: 'owner' as const,
            strength: 100,
            bidirectional: false,
            confidence: 100,
            evidence: ['Beneficial owner'],
            riskTransmission: 90
          }
        });
        edges.push({
          source: ownerId,
          target: match.lead.id,
          relationship: {
            type: 'owner' as const,
            strength: 100,
            bidirectional: false,
            confidence: 100,
            evidence: ['Beneficial owner'],
            riskTransmission: 90
          }
        });
      }
    });
    
    return { nodes, edges };
  }

  /**
   * Calculate scoring metrics
   */
  private calculateScoring(
    sourceLead: Lead,
    matchedLeads: LeadMatchResult['matchedLeads']
  ): LeadMatchResult['scoring'] {
    // Relationship strength (average of all relationship strengths)
    const allStrengths = matchedLeads.flatMap(m => 
      m.relationships.map(r => r.strength)
    );
    const relationshipStrength = allStrengths.length > 0
      ? Math.round(allStrengths.reduce((a, b) => a + b, 0) / allStrengths.length)
      : 0;
    
    // Risk contagion (maximum risk transmission)
    const maxRiskTransmission = matchedLeads.reduce((max, match) => {
      const matchMax = match.relationships.reduce((m, r) => 
        Math.max(m, r.riskTransmission), 0
      );
      return Math.max(max, matchMax);
    }, 0);
    
    // Opportunity score
    let opportunityScore = 0;
    const crossSellPotential: string[] = [];
    
    // Check for portfolio opportunities
    if (matchedLeads.length >= 3) {
      opportunityScore += 30;
      crossSellPotential.push('Portfolio financing opportunity');
    }
    
    // Check for consolidation opportunities
    const hasMultipleOwned = matchedLeads.filter(m => 
      m.relationships.some(r => r.type === 'owner')
    ).length >= 2;
    
    if (hasMultipleOwned) {
      opportunityScore += 40;
      crossSellPotential.push('Multi-business consolidation');
    }
    
    // Check for supply chain financing
    const hasSupplyChain = matchedLeads.some(m => 
      m.relationships.some(r => r.type === 'supplier' || r.type === 'customer')
    );
    
    if (hasSupplyChain) {
      opportunityScore += 30;
      crossSellPotential.push('Supply chain financing');
    }
    
    // Calculate portfolio value
    const portfolioValue = matchedLeads.reduce((sum, match) => {
      const revenue = parseInt(match.lead.annualRevenue || '0');
      const requested = parseInt(match.lead.requestedAmount || '0');
      return sum + Math.max(revenue * 0.1, requested); // Rough estimate
    }, parseInt(sourceLead.requestedAmount || '0'));
    
    return {
      relationshipStrength,
      riskContagion: maxRiskTransmission,
      opportunityScore: Math.min(100, opportunityScore),
      crossSellPotential,
      portfolioValue
    };
  }

  /**
   * Generate insights from matching results
   */
  private generateInsights(
    sourceLead: Lead,
    matchedLeads: LeadMatchResult['matchedLeads'],
    scoring: LeadMatchResult['scoring']
  ): LeadMatchResult['insights'] {
    const keyFindings: string[] = [];
    const riskWarnings: string[] = [];
    const opportunities: string[] = [];
    const hiddenConnections: string[] = [];
    
    // Key findings
    if (matchedLeads.length > 0) {
      keyFindings.push(`Connected to ${matchedLeads.length} related businesses`);
    }
    
    const ownerConnections = matchedLeads.filter(m => 
      m.matches.some(match => match.type === 'owner')
    );
    if (ownerConnections.length > 0) {
      keyFindings.push(`Same owner operates ${ownerConnections.length + 1} businesses`);
      hiddenConnections.push(`Beneficial owner: ${sourceLead.ownerName}`);
    }
    
    // Risk warnings
    if (scoring.riskContagion >= 70) {
      riskWarnings.push('High risk contagion potential across portfolio');
    }
    
    const highRiskRelationships = matchedLeads.filter(m => 
      m.relationships.some(r => r.riskTransmission >= 70)
    );
    if (highRiskRelationships.length > 0) {
      riskWarnings.push(`${highRiskRelationships.length} high-risk relationships detected`);
    }
    
    // Opportunities
    scoring.crossSellPotential.forEach(opp => opportunities.push(opp));
    
    if (scoring.portfolioValue > 500000) {
      opportunities.push(`Large portfolio opportunity: $${(scoring.portfolioValue / 1000).toFixed(0)}k total value`);
    }
    
    // Hidden connections
    const fuzzyMatches = matchedLeads.filter(m => 
      m.matches.some(match => match.type === 'fuzzy')
    );
    if (fuzzyMatches.length > 0) {
      hiddenConnections.push(`${fuzzyMatches.length} businesses with similar names (possible affiliates)`);
    }
    
    const phoneMatches = matchedLeads.filter(m => 
      m.matches.some(match => match.type === 'phone')
    );
    if (phoneMatches.length > 0) {
      hiddenConnections.push(`${phoneMatches.length} businesses share phone numbers`);
    }
    
    return {
      keyFindings,
      riskWarnings,
      opportunities,
      hiddenConnections
    };
  }

  /**
   * Save relationships to database
   */
  private async saveRelationships(
    leadId: string,
    matchedLeads: LeadMatchResult['matchedLeads']
  ): Promise<void> {
    try {
      for (const match of matchedLeads) {
        for (const relationship of match.relationships) {
          await db.insert(uccRelationships).values({
            leadIdA: leadId,
            leadIdB: match.lead.id,
            relationshipType: relationship.type,
            confidenceScore: String(relationship.confidence),
            relationshipStrength: String(relationship.strength),
            matchingCriteria: {
              bidirectional: relationship.bidirectional,
              evidence: relationship.evidence,
              riskTransmission: relationship.riskTransmission,
              matchTypes: match.matches.map(m => m.type),
              overallConfidence: match.overallConfidence
            }
          } as any).onConflictDoNothing();
        }
      }
    } catch (error) {
      console.error('[UccLeadMatching] Error saving relationships:', error);
    }
  }
}

// Helper function to import inArray if needed
function inArray<T>(column: any, values: T[]) {
  return sql`${column} = ANY(${values})`;
}

// Export singleton instance
export const uccLeadMatchingService = new UccLeadMatchingService();