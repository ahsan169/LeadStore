import { storage } from "../storage";
import { InsertLead, InsertUccFiling } from "../../shared/schema";
import { uccIntelligenceExtractor } from "./ucc-intelligence-extractor";

interface UccLeadMatch {
  leadId: string;
  uccNumber: string;
  businessName: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'partial';
}

interface UccEnrichmentResult {
  leadId: string;
  fieldsUpdated: string[];
  newData: any;
  confidence: number;
}

export class UccLeadConnector {
  
  /**
   * Process a UCC filing and connect it to matching leads
   */
  async processUccFiling(uccData: any): Promise<{
    filing: InsertUccFiling,
    matches: UccLeadMatch[],
    enrichments: UccEnrichmentResult[]
  }> {
    console.log('[UccLeadConnector] Processing UCC filing:', {
      uccNumber: uccData.ucc_number,
      debtorName: uccData.debtor_name
    });
    
    // Extract intelligence from UCC data
    const intelligence = uccIntelligenceExtractor.extractIntelligence(uccData);
    
    // Create UCC filing record
    const filing: InsertUccFiling = {
      debtorName: uccData.debtor_name || uccData.businessName || '',
      securedParty: uccData.secured_parties || '',
      filingDate: this.parseDate(uccData.filing_date) || new Date(),
      fileNumber: uccData.ucc_number || uccData.file_number || '',
      collateralDescription: uccData.collateral_description || uccData.notes || '',
      loanAmount: this.parseLoanAmount(uccData.loan_amount || uccData.suggested_price),
      filingType: uccData.filing_type || uccData.amend_type || 'original',
      jurisdiction: uccData.state || uccData.jurisdiction || ''
    };
    
    // Find matching leads
    const matches = await this.findMatchingLeads(uccData, intelligence);
    
    // Enrich matching leads with UCC intelligence
    const enrichments = await this.enrichMatchingLeads(matches, uccData, intelligence);
    
    // Store the UCC filing
    const createdFiling = await storage.createUccFiling(filing);
    
    // Link UCC filing to matched leads
    for (const match of matches) {
      await storage.linkUccFilingToLead(createdFiling.id, match.leadId);
    }
    
    console.log(`[UccLeadConnector] Processed UCC filing. Found ${matches.length} matches, enriched ${enrichments.length} leads`);
    
    return {
      filing: createdFiling,
      matches,
      enrichments
    };
  }
  
  /**
   * Find leads that match the UCC filing
   */
  private async findMatchingLeads(uccData: any, intelligence: any): Promise<UccLeadMatch[]> {
    const matches: UccLeadMatch[] = [];
    
    // Strategy 1: Match by UCC number (exact match)
    if (uccData.ucc_number) {
      const exactMatches = await storage.findLeadsByUccNumber(uccData.ucc_number);
      for (const lead of exactMatches) {
        matches.push({
          leadId: lead.id,
          uccNumber: uccData.ucc_number,
          businessName: lead.businessName,
          confidence: 100,
          matchType: 'exact'
        });
      }
    }
    
    // Strategy 2: Match by business name (fuzzy match)
    const debtorName = uccData.debtor_name || uccData.businessName;
    if (debtorName && matches.length === 0) {
      const nameMatches = await this.findLeadsByBusinessName(debtorName);
      for (const lead of nameMatches) {
        const similarity = this.calculateNameSimilarity(debtorName, lead.businessName);
        if (similarity > 80) {
          matches.push({
            leadId: lead.id,
            uccNumber: uccData.ucc_number || '',
            businessName: lead.businessName,
            confidence: similarity,
            matchType: 'fuzzy'
          });
        }
      }
    }
    
    // Strategy 3: Match by owner name + location
    if (intelligence.ownerName && uccData.state && matches.length === 0) {
      const ownerMatches = await this.findLeadsByOwnerAndState(
        intelligence.ownerName,
        uccData.state
      );
      for (const lead of ownerMatches) {
        matches.push({
          leadId: lead.id,
          uccNumber: uccData.ucc_number || '',
          businessName: lead.businessName,
          confidence: 70,
          matchType: 'partial'
        });
      }
    }
    
    // Strategy 4: Match by address + industry
    if (uccData.full_address && uccData.industry && matches.length === 0) {
      const addressMatches = await this.findLeadsByAddressAndIndustry(
        uccData.full_address,
        uccData.industry
      );
      for (const lead of addressMatches) {
        matches.push({
          leadId: lead.id,
          uccNumber: uccData.ucc_number || '',
          businessName: lead.businessName,
          confidence: 60,
          matchType: 'partial'
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Enrich leads with UCC intelligence
   */
  private async enrichMatchingLeads(
    matches: UccLeadMatch[],
    uccData: any,
    intelligence: any
  ): Promise<UccEnrichmentResult[]> {
    const enrichments: UccEnrichmentResult[] = [];
    
    for (const match of matches) {
      const lead = await storage.getLeadById(match.leadId);
      if (!lead) continue;
      
      const updatedFields: string[] = [];
      const updateData: any = {};
      
      // Update UCC number if not present
      if (!lead.uccNumber && uccData.ucc_number) {
        updateData.uccNumber = uccData.ucc_number;
        updatedFields.push('uccNumber');
      }
      
      // Update owner name if extracted with high confidence
      if (!lead.ownerName && intelligence.ownerName && intelligence.ownerNameConfidence !== 'low') {
        updateData.ownerName = intelligence.ownerName;
        updatedFields.push('ownerName');
      }
      
      // Update or enhance revenue estimate
      if (intelligence.estimatedAnnualRevenue) {
        if (!lead.annualRevenue || !lead.estimatedRevenue) {
          updateData.annualRevenue = String(intelligence.estimatedAnnualRevenue);
          updateData.estimatedRevenue = intelligence.estimatedAnnualRevenue;
          updateData.revenueConfidence = `UCC Analysis: ${intelligence.revenueConfidenceScore}%`;
          updatedFields.push('annualRevenue', 'estimatedRevenue', 'revenueConfidence');
        }
      }
      
      // Update UCC-specific fields
      updateData.securedParties = uccData.secured_parties;
      updateData.lenderCount = parseInt(uccData.lender_count || intelligence.securedParties?.length || '0');
      updateData.filingCount = parseInt(uccData.filing_count || '1');
      updateData.filingDate = this.parseDate(uccData.filing_date);
      updateData.filingType = uccData.filing_type;
      updateData.expireDate = this.parseDate(uccData.expire_date);
      updateData.amendDate = this.parseDate(uccData.amend_date);
      updateData.primaryLenderType = intelligence.primaryLenderType;
      updateData.hasMultipleMcaPositions = intelligence.hasMultipleMcaPositions;
      updateData.activePositions = intelligence.activePositions;
      updateData.terminatedPositions = intelligence.terminatedPositions;
      updateData.lastFilingDate = intelligence.lastFilingDate;
      updateData.filingSpanDays = intelligence.filingSpanDays;
      updateData.stackingRisk = intelligence.stackingRisk;
      updateData.businessMaturity = intelligence.businessMaturity;
      
      // Merge UCC intelligence into existing intelligence metadata
      const existingIntelligence = lead.uccIntelligence || {};
      updateData.uccIntelligence = {
        ...existingIntelligence,
        ...uccIntelligenceExtractor.formatIntelligence(intelligence),
        lastUpdated: new Date().toISOString(),
        dataSource: 'UCC Filing',
        confidence: match.confidence
      };
      
      // Update quality score based on UCC data completeness and risk
      const qualityBoost = this.calculateQualityBoost(intelligence, uccData);
      if (qualityBoost > 0) {
        updateData.qualityScore = Math.min(100, (lead.qualityScore || 0) + qualityBoost);
        updatedFields.push('qualityScore');
      }
      
      // Update the lead
      await storage.updateLead(match.leadId, updateData);
      
      enrichments.push({
        leadId: match.leadId,
        fieldsUpdated: updatedFields,
        newData: updateData,
        confidence: match.confidence
      });
    }
    
    return enrichments;
  }
  
  /**
   * Find leads by business name (fuzzy search)
   */
  private async findLeadsByBusinessName(businessName: string): Promise<any[]> {
    const normalizedName = this.normalizeBusinessName(businessName);
    return await storage.searchLeadsByBusinessName(normalizedName);
  }
  
  /**
   * Find leads by owner name and state
   */
  private async findLeadsByOwnerAndState(ownerName: string, state: string): Promise<any[]> {
    return await storage.searchLeadsByOwnerAndState(ownerName, state);
  }
  
  /**
   * Find leads by address and industry
   */
  private async findLeadsByAddressAndIndustry(address: string, industry: string): Promise<any[]> {
    // Extract key address components
    const addressParts = this.parseAddress(address);
    return await storage.searchLeadsByLocationAndIndustry(
      addressParts.city,
      addressParts.state,
      industry
    );
  }
  
  /**
   * Calculate similarity between two business names
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = this.normalizeBusinessName(name1);
    const n2 = this.normalizeBusinessName(name2);
    
    // Exact match
    if (n1 === n2) return 100;
    
    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return 85;
    
    // Levenshtein distance calculation
    const distance = this.levenshteinDistance(n1, n2);
    const maxLength = Math.max(n1.length, n2.length);
    const similarity = (1 - distance / maxLength) * 100;
    
    return Math.round(similarity);
  }
  
  /**
   * Normalize business name for comparison
   */
  private normalizeBusinessName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(llc|inc|corp|corporation|company|co|ltd|limited|group|enterprises?|services?|dba)\b/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
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
    
    return matrix[s2.length][s1.length];
  }
  
  /**
   * Parse address string into components
   */
  private parseAddress(address: string): { city: string, state: string, zip: string } {
    const parts = address.split(',').map(s => s.trim());
    
    // Assume format: "Street, City, State ZIP"
    if (parts.length >= 3) {
      const stateZip = parts[parts.length - 1].trim();
      const stateZipMatch = stateZip.match(/^([A-Z]{2}),?\s*(\d{5}(-\d{4})?)?$/);
      
      if (stateZipMatch) {
        return {
          city: parts[parts.length - 2].trim(),
          state: stateZipMatch[1],
          zip: stateZipMatch[2] || ''
        };
      }
    }
    
    return { city: '', state: '', zip: '' };
  }
  
  /**
   * Calculate quality score boost based on UCC data
   */
  private calculateQualityBoost(intelligence: any, uccData: any): number {
    let boost = 0;
    
    // Boost for having UCC data
    boost += 5;
    
    // Boost for owner name extraction
    if (intelligence.ownerName && intelligence.ownerNameConfidence !== 'low') {
      boost += 3;
    }
    
    // Boost for revenue estimation
    if (intelligence.estimatedAnnualRevenue && intelligence.revenueConfidenceScore > 60) {
      boost += 5;
    }
    
    // Boost for business maturity
    if (intelligence.businessMaturity === 'established' || intelligence.businessMaturity === 'mature') {
      boost += 3;
    }
    
    // Penalty for high risk
    if (intelligence.stackingRisk === 'high') {
      boost -= 5;
    } else if (intelligence.stackingRisk === 'medium') {
      boost -= 2;
    }
    
    // Penalty for multiple MCA positions
    if (intelligence.hasMultipleMcaPositions) {
      boost -= 3;
    }
    
    return Math.max(0, boost);
  }
  
  /**
   * Parse date string
   */
  private parseDate(dateStr: string | undefined): Date | null {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  /**
   * Parse loan amount from string
   */
  private parseLoanAmount(amountStr: string | undefined): number | null {
    if (!amountStr) return null;
    const amount = parseFloat(String(amountStr).replace(/[^0-9.]/g, ''));
    return isNaN(amount) ? null : Math.round(amount * 100); // Convert to cents
  }
  
  /**
   * Batch process multiple UCC filings
   */
  async processBatchUccFilings(uccFilings: any[]): Promise<{
    processed: number,
    matched: number,
    enriched: number,
    errors: string[]
  }> {
    let processed = 0;
    let matched = 0;
    let enriched = 0;
    const errors: string[] = [];
    
    for (const filing of uccFilings) {
      try {
        const result = await this.processUccFiling(filing);
        processed++;
        matched += result.matches.length;
        enriched += result.enrichments.length;
      } catch (error: any) {
        errors.push(`Error processing UCC ${filing.ucc_number}: ${error.message}`);
      }
    }
    
    return { processed, matched, enriched, errors };
  }
}

// Export singleton instance
export const uccLeadConnector = new UccLeadConnector();