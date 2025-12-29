import { db } from "../db";
import { leads, uccFilings } from "@shared/schema";
import type { Lead, UccFiling } from "@shared/schema";
import { eq, and, or, ilike, sql, isNull } from "drizzle-orm";

export interface UccMatchResult {
  leadId: string;
  filingId: string;
  confidenceScore: number; // 0-100
  matchType: 'exact' | 'fuzzy_name' | 'address' | 'ein' | 'owner' | 'combined';
  matchDetails: {
    nameMatch?: { score: number; details: string };
    addressMatch?: { score: number; details: string };
    einMatch?: { score: number; details: string };
    ownerMatch?: { score: number; details: string };
  };
  suggestedAction: 'auto_link' | 'manual_review' | 'no_action';
}

export class EnhancedUccMatchingService {
  /**
   * Match a UCC filing to leads with confidence scoring
   */
  async matchUccToLeads(filing: UccFiling): Promise<UccMatchResult[]> {
    const matches: UccMatchResult[] = [];

    // Get all potential leads
    const potentialLeads = await db.select().from(leads);

    for (const lead of potentialLeads) {
      const matchResult = this.calculateMatch(filing, lead);
      if (matchResult.confidenceScore > 30) { // Minimum threshold
        matches.push(matchResult);
      }
    }

    // Sort by confidence score
    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Calculate match between a filing and a lead
   */
  private calculateMatch(filing: UccFiling, lead: Lead): UccMatchResult {
    const matchDetails: UccMatchResult['matchDetails'] = {};
    let totalScore = 0;
    let matchCount = 0;

    // 1. Fuzzy name matching
    const nameScore = this.fuzzyNameMatch(filing.debtorName, lead.businessName);
    if (nameScore > 0) {
      matchDetails.nameMatch = {
        score: nameScore,
        details: `Name similarity: ${nameScore}%`
      };
      totalScore += nameScore * 0.5; // 50% weight
      matchCount++;
    }

    // 2. Address matching (if available)
    if (lead.fullAddress && filing.collateralDescription) {
      const addressScore = this.addressMatch(filing.collateralDescription, lead.fullAddress);
      if (addressScore > 0) {
        matchDetails.addressMatch = {
          score: addressScore,
          details: `Address components matched`
        };
        totalScore += addressScore * 0.2; // 20% weight
        matchCount++;
      }
    }

    // 3. Owner name matching
    if (lead.ownerName) {
      const ownerScore = this.fuzzyNameMatch(filing.debtorName, lead.ownerName);
      if (ownerScore > 50) {
        matchDetails.ownerMatch = {
          score: ownerScore,
          details: `Owner name similarity: ${ownerScore}%`
        };
        totalScore += ownerScore * 0.3; // 30% weight
        matchCount++;
      }
    }

    // Determine match type
    let matchType: UccMatchResult['matchType'] = 'combined';
    if (nameScore >= 90) {
      matchType = 'exact';
    } else if (nameScore >= 70) {
      matchType = 'fuzzy_name';
    } else if (matchDetails.addressMatch && matchDetails.addressMatch.score >= 70) {
      matchType = 'address';
    } else if (matchDetails.ownerMatch && matchDetails.ownerMatch.score >= 70) {
      matchType = 'owner';
    }

    // Determine suggested action
    let suggestedAction: UccMatchResult['suggestedAction'] = 'no_action';
    if (totalScore >= 80) {
      suggestedAction = 'auto_link';
    } else if (totalScore >= 50) {
      suggestedAction = 'manual_review';
    }

    return {
      leadId: lead.id,
      filingId: filing.id,
      confidenceScore: Math.round(totalScore),
      matchType,
      matchDetails,
      suggestedAction
    };
  }

  /**
   * Fuzzy string matching for business names
   */
  private fuzzyNameMatch(name1: string, name2: string): number {
    if (!name1 || !name2) return 0;

    // Normalize names
    const norm1 = this.normalizeBusinessName(name1);
    const norm2 = this.normalizeBusinessName(name2);

    // Exact match after normalization
    if (norm1 === norm2) return 100;

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    const similarity = ((maxLength - distance) / maxLength) * 100;

    // Check for common variations
    if (this.areNamesVariations(norm1, norm2)) {
      return Math.max(similarity, 85);
    }

    return Math.round(similarity);
  }

  /**
   * Normalize business name by removing common suffixes and punctuation
   */
  private normalizeBusinessName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(llc|inc|corp|corporation|co|company|ltd|limited|group|enterprises?|services?|solutions?|partners?|partnership|associates?|holdings?|ventures?|capital)\b/gi, '')
      .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Check if two names are likely variations of each other
   */
  private areNamesVariations(name1: string, name2: string): boolean {
    // Check if one contains the other
    if (name1.includes(name2) || name2.includes(name1)) {
      return true;
    }

    // Check for DBA patterns
    const dbaPattern = /\bdba\b/;
    if (dbaPattern.test(name1) || dbaPattern.test(name2)) {
      const cleanName1 = name1.replace(dbaPattern, '').trim();
      const cleanName2 = name2.replace(dbaPattern, '').trim();
      if (cleanName1.includes(cleanName2) || cleanName2.includes(cleanName1)) {
        return true;
      }
    }

    // Check for common abbreviations
    const abbreviations = [
      ['&', 'and'],
      ['n', 'and'],
      ['intl', 'international'],
      ['mgmt', 'management'],
      ['svcs', 'services'],
      ['tech', 'technology'],
      ['mfg', 'manufacturing'],
      ['dist', 'distribution'],
    ];

    let expanded1 = name1;
    let expanded2 = name2;
    
    for (const [abbr, full] of abbreviations) {
      expanded1 = expanded1.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
      expanded2 = expanded2.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
    }

    return expanded1 === expanded2;
  }

  /**
   * Calculate Levenshtein distance between two strings
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
            matrix[i - 1][j - 1] + 1, // Substitution
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j] + 1      // Deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Match addresses
   */
  private addressMatch(address1: string, address2: string): number {
    if (!address1 || !address2) return 0;

    const norm1 = this.normalizeAddress(address1);
    const norm2 = this.normalizeAddress(address2);

    // Extract key components
    const components1 = this.extractAddressComponents(norm1);
    const components2 = this.extractAddressComponents(norm2);

    let score = 0;
    let componentCount = 0;

    // Compare street numbers
    if (components1.streetNumber && components2.streetNumber) {
      if (components1.streetNumber === components2.streetNumber) {
        score += 25;
      }
      componentCount++;
    }

    // Compare street names
    if (components1.streetName && components2.streetName) {
      const streetSimilarity = this.fuzzyNameMatch(components1.streetName, components2.streetName);
      score += (streetSimilarity / 100) * 35;
      componentCount++;
    }

    // Compare city
    if (components1.city && components2.city) {
      if (components1.city === components2.city) {
        score += 20;
      }
      componentCount++;
    }

    // Compare state
    if (components1.state && components2.state) {
      if (components1.state === components2.state) {
        score += 10;
      }
      componentCount++;
    }

    // Compare ZIP
    if (components1.zip && components2.zip) {
      if (components1.zip === components2.zip) {
        score += 10;
      } else if (components1.zip.substring(0, 3) === components2.zip.substring(0, 3)) {
        score += 5;
      }
      componentCount++;
    }

    // Adjust score if we had few components to compare
    if (componentCount < 3) {
      score = score * 0.7;
    }

    return Math.round(score);
  }

  /**
   * Normalize address
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl|circle|cir|square|sq)\b/g, '')
      .replace(/\b(north|n|south|s|east|e|west|w|northeast|ne|northwest|nw|southeast|se|southwest|sw)\b/g, '')
      .replace(/\b(apartment|apt|suite|ste|unit|#)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract address components
   */
  private extractAddressComponents(address: string): {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    state?: string;
    zip?: string;
  } {
    const components: any = {};

    // Extract street number
    const streetNumberMatch = address.match(/^\d+/);
    if (streetNumberMatch) {
      components.streetNumber = streetNumberMatch[0];
    }

    // Extract ZIP code
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    if (zipMatch) {
      components.zip = zipMatch[0].substring(0, 5);
    }

    // Extract state (2-letter abbreviation)
    const stateMatch = address.match(/\b[a-z]{2}\b/);
    if (stateMatch) {
      components.state = stateMatch[0];
    }

    // Extract city (simplified - words before state/zip)
    const cityPattern = /\b([a-z]+(?:\s+[a-z]+)*)\s+[a-z]{2}\s+\d{5}/;
    const cityMatch = address.match(cityPattern);
    if (cityMatch) {
      components.city = cityMatch[1];
    }

    // Extract street name (words after street number, before city)
    if (components.streetNumber) {
      const afterNumber = address.substring(address.indexOf(components.streetNumber) + components.streetNumber.length).trim();
      const streetWords = afterNumber.split(' ').slice(0, 3).join(' ');
      if (streetWords) {
        components.streetName = streetWords;
      }
    }

    return components;
  }

  /**
   * Update lead with UCC match confidence
   */
  async updateLeadUccConfidence(leadId: string, confidenceScore: number): Promise<Lead | null> {
    const [updated] = await db
      .update(leads)
      .set({
        uccMatchConfidence: confidenceScore,
        updatedAt: new Date()
      })
      .where(eq(leads.id, leadId))
      .returning();

    return updated;
  }

  /**
   * Link UCC filing to lead
   */
  async linkUccToLead(filingId: string, leadId: string, confidenceScore: number): Promise<void> {
    // Update the UCC filing with the lead ID
    await db
      .update(uccFilings)
      .set({ leadId })
      .where(eq(uccFilings.id, filingId));

    // Update the lead with UCC information
    const [filing] = await db
      .select()
      .from(uccFilings)
      .where(eq(uccFilings.id, filingId))
      .limit(1);

    if (filing) {
      await db
        .update(leads)
        .set({
          uccMatchConfidence: confidenceScore,
          lastUccFilingDate: filing.filingDate,
          activeUccCount: sql`${leads.activeUccCount} + 1`,
          updatedAt: new Date()
        })
        .where(eq(leads.id, leadId));
    }
  }

  /**
   * Unlink UCC filing from lead
   */
  async unlinkUccFromLead(filingId: string): Promise<void> {
    const [filing] = await db
      .select()
      .from(uccFilings)
      .where(eq(uccFilings.id, filingId))
      .limit(1);

    if (filing && filing.leadId) {
      // Remove lead ID from filing
      await db
        .update(uccFilings)
        .set({ leadId: null })
        .where(eq(uccFilings.id, filingId));

      // Update lead's UCC count
      await db
        .update(leads)
        .set({
          activeUccCount: sql`GREATEST(${leads.activeUccCount} - 1, 0)`,
          updatedAt: new Date()
        })
        .where(eq(leads.id, filing.leadId));
    }
  }

  /**
   * Auto-link high confidence matches
   */
  async autoLinkHighConfidenceMatches(threshold: number = 80): Promise<number> {
    const allFilings = await db
      .select()
      .from(uccFilings)
      .where(isNull(uccFilings.leadId)); // Only unlinked filings

    let linkedCount = 0;

    for (const filing of allFilings) {
      const matches = await this.matchUccToLeads(filing);
      const bestMatch = matches[0];

      if (bestMatch && bestMatch.confidenceScore >= threshold && bestMatch.suggestedAction === 'auto_link') {
        await this.linkUccToLead(filing.id, bestMatch.leadId, bestMatch.confidenceScore);
        linkedCount++;
      }
    }

    return linkedCount;
  }
}

export const enhancedUccMatchingService = new EnhancedUccMatchingService();