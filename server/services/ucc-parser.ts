import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import type { InsertUccFiling, UccFiling, Lead } from "@shared/schema";
import { storage } from "../storage";

interface UccRecord {
  debtorName: string;
  securedParty: string;
  filingDate: Date;
  fileNumber: string;
  collateralDescription?: string;
  loanAmount?: number;
  filingType?: 'original' | 'amendment' | 'termination';
  jurisdiction?: string;
}

interface UccParseResult {
  success: boolean;
  records: UccRecord[];
  errors: string[];
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    matchedLeads: number;
    unmatchedRecords: number;
    uniqueDebtors: number;
    uniqueSecuredParties: number;
    averageLoanAmount?: number;
    dateRange?: { earliest: Date; latest: Date };
  };
}

interface McaEligibilitySignal {
  signal: 'positive' | 'negative' | 'neutral';
  reason: string;
  score: number; // -100 to +100
}

interface DebtorProfile {
  debtorName: string;
  businessMatch?: Lead;
  filings: UccRecord[];
  totalDebtLoad: number;
  activeFilings: number;
  terminatedFilings: number;
  lastFilingDate: Date;
  daysSinceLastFiling: number;
  stackingIndicator: boolean;
  refinancingPattern: boolean;
  growthIndicator: 'growing' | 'stable' | 'declining';
  mcaReadinessScore: number;
  riskScore: number;
  insights: string[];
}

class UccParserService {
  /**
   * Common UCC column mappings
   */
  private columnMappings = {
    debtorName: [
      'debtor', 'debtor name', 'debtor_name', 'business', 'business name',
      'company', 'company name', 'borrower', 'borrower name'
    ],
    securedParty: [
      'secured party', 'secured_party', 'lender', 'lender name', 'creditor',
      'secured creditor', 'financing party', 'bank', 'finance company'
    ],
    filingDate: [
      'filing date', 'filing_date', 'date filed', 'date_filed', 'file date',
      'effective date', 'filed on', 'filing timestamp'
    ],
    fileNumber: [
      'file number', 'file_number', 'filing number', 'filing_number',
      'document number', 'doc number', 'reference', 'filing id', 'ucc number'
    ],
    collateralDescription: [
      'collateral', 'collateral description', 'collateral_description',
      'security', 'security interest', 'assets', 'description'
    ],
    loanAmount: [
      'amount', 'loan amount', 'loan_amount', 'principal', 'financing amount',
      'secured amount', 'debt amount', 'obligation'
    ],
    filingType: [
      'filing type', 'filing_type', 'type', 'document type', 'doc_type',
      'transaction type', 'ucc type'
    ],
    jurisdiction: [
      'state', 'jurisdiction', 'filing state', 'filing_state', 'location'
    ]
  };

  /**
   * Process multiple UCC files and merge results intelligently
   */
  async processMultipleFiles(
    files: { path: string; name: string }[]
  ): Promise<{
    allRecords: UccRecord[];
    mergedRecords: UccRecord[];
    debtorProfiles: Map<string, DebtorProfile>;
    summary: {
      filesProcessed: number;
      totalRecords: number;
      uniqueRecords: number;
      duplicatesRemoved: number;
      uniqueDebtors: number;
      uniqueSecuredParties: number;
      totalDebtLoad: number;
      averageLoanAmount: number;
      dateRange: { earliest: Date; latest: Date };
    };
    insights: string[];
  }> {
    const allRecords: UccRecord[] = [];
    const processedFileNumbers = new Set<string>();
    const insights: string[] = [];
    let filesProcessed = 0;
    
    // Process each file
    for (const file of files) {
      try {
        let parseResult: UccParseResult;
        
        // Read file and parse based on type
        const fileBuffer = await fs.readFile(file.path);
        
        if (file.name.toLowerCase().endsWith('.csv')) {
          const csvContent = fileBuffer.toString('utf8');
          parseResult = await this.parseUccCsv(csvContent);
        } else if (file.name.toLowerCase().endsWith('.xlsx') || 
                   file.name.toLowerCase().endsWith('.xls')) {
          parseResult = await this.parseUccExcel(fileBuffer);
        } else {
          console.log(`Skipping unsupported file: ${file.name}`);
          continue;
        }
        
        if (parseResult.success) {
          allRecords.push(...parseResult.records);
          filesProcessed++;
          console.log(`Processed ${file.name}: ${parseResult.records.length} records`);
        } else {
          console.error(`Failed to process ${file.name}: ${parseResult.errors.join(', ')}`);
        }
      } catch (error: any) {
        console.error(`Error processing ${file.name}: ${error.message}`);
      }
    }
    
    // Deduplicate and merge records
    const mergedRecords = this.deduplicateAndMerge(allRecords);
    const duplicatesRemoved = allRecords.length - mergedRecords.length;
    
    // Calculate statistics
    const uniqueDebtors = new Set(mergedRecords.map(r => 
      this.cleanBusinessName(r.debtorName).toLowerCase()
    )).size;
    
    const uniqueSecuredParties = new Set(mergedRecords.map(r => r.securedParty)).size;
    
    const totalDebtLoad = mergedRecords.reduce((sum, r) => 
      sum + (r.loanAmount || 0), 0
    );
    
    const recordsWithAmount = mergedRecords.filter(r => r.loanAmount);
    const averageLoanAmount = recordsWithAmount.length > 0 
      ? totalDebtLoad / recordsWithAmount.length 
      : 0;
    
    // Find date range
    const dates = mergedRecords.map(r => r.filingDate);
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())));
    const latest = new Date(Math.max(...dates.map(d => d.getTime())));
    
    // Match to leads and create debtor profiles
    const leadMatches = await this.matchToLeads(mergedRecords);
    const debtorProfiles = this.createDebtorProfiles(mergedRecords, leadMatches);
    
    // Generate portfolio insights
    insights.push(`📁 Processed ${filesProcessed} files with ${allRecords.length} total records`);
    insights.push(`🔍 Found ${uniqueDebtors} unique businesses across all files`);
    insights.push(`💰 Total debt load: $${(totalDebtLoad / 100).toLocaleString()}`);
    insights.push(`📊 Average loan amount: $${(averageLoanAmount / 100).toLocaleString()}`);
    
    // Analyze portfolio patterns
    const stackingBusinesses = Array.from(debtorProfiles.values())
      .filter(p => p.stackingIndicator).length;
    
    if (stackingBusinesses > 0) {
      insights.push(`⚠️ ${stackingBusinesses} businesses show stacking behavior`);
    }
    
    const highRiskBusinesses = Array.from(debtorProfiles.values())
      .filter(p => p.riskScore > 70).length;
      
    if (highRiskBusinesses > 0) {
      insights.push(`🚨 ${highRiskBusinesses} high-risk businesses identified`);
    }
    
    const primeOpportunities = Array.from(debtorProfiles.values())
      .filter(p => p.mcaReadinessScore > 70).length;
      
    if (primeOpportunities > 0) {
      insights.push(`🎯 ${primeOpportunities} prime MCA opportunities identified`);
    }
    
    return {
      allRecords,
      mergedRecords,
      debtorProfiles,
      summary: {
        filesProcessed,
        totalRecords: allRecords.length,
        uniqueRecords: mergedRecords.length,
        duplicatesRemoved,
        uniqueDebtors,
        uniqueSecuredParties,
        totalDebtLoad,
        averageLoanAmount,
        dateRange: { earliest, latest }
      },
      insights
    };
  }

  /**
   * Deduplicate and merge UCC records
   */
  private deduplicateAndMerge(records: UccRecord[]): UccRecord[] {
    const recordMap = new Map<string, UccRecord>();
    
    for (const record of records) {
      const key = `${record.fileNumber}_${record.filingDate.toISOString()}`;
      
      if (!recordMap.has(key)) {
        recordMap.set(key, record);
      } else {
        // Merge records - prefer the one with more complete data
        const existing = recordMap.get(key)!;
        const merged: UccRecord = {
          ...existing,
          collateralDescription: existing.collateralDescription || record.collateralDescription,
          loanAmount: existing.loanAmount || record.loanAmount,
          filingType: existing.filingType || record.filingType,
          jurisdiction: existing.jurisdiction || record.jurisdiction
        };
        recordMap.set(key, merged);
      }
    }
    
    return Array.from(recordMap.values());
  }

  /**
   * Parse CSV file containing UCC data
   */
  async parseUccCsv(csvContent: string): Promise<UccParseResult> {
    return new Promise((resolve) => {
      const result: UccParseResult = {
        success: false,
        records: [],
        errors: [],
        summary: {
          totalRecords: 0,
          validRecords: 0,
          invalidRecords: 0,
          matchedLeads: 0,
          unmatchedRecords: 0,
          uniqueDebtors: 0,
          uniqueSecuredParties: 0
        }
      };

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: async (parseResult) => {
          result.summary.totalRecords = parseResult.data.length;
          
          for (const row of parseResult.data as any[]) {
            const record = this.extractUccRecord(row);
            if (record) {
              result.records.push(record);
              result.summary.validRecords++;
            } else {
              result.summary.invalidRecords++;
              result.errors.push(`Invalid record: ${JSON.stringify(row).substring(0, 100)}`);
            }
          }
          
          result.success = result.records.length > 0;
          resolve(result);
        },
        error: (error) => {
          result.errors.push(error.message);
          resolve(result);
        }
      });
    });
  }

  /**
   * Parse Excel file containing UCC data
   */
  async parseUccExcel(buffer: Buffer): Promise<UccParseResult> {
    const result: UccParseResult = {
      success: false,
      records: [],
      errors: [],
      summary: {
        totalRecords: 0,
        validRecords: 0,
        invalidRecords: 0,
        matchedLeads: 0,
        unmatchedRecords: 0
      }
    };

    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      result.summary.totalRecords = jsonData.length;
      
      for (const row of jsonData) {
        const record = this.extractUccRecord(row as any);
        if (record) {
          result.records.push(record);
          result.summary.validRecords++;
        } else {
          result.summary.invalidRecords++;
          result.errors.push(`Invalid record at row ${result.summary.validRecords + result.summary.invalidRecords}`);
        }
      }
      
      result.success = result.records.length > 0;
    } catch (error: any) {
      result.errors.push(`Excel parse error: ${error.message}`);
    }

    return result;
  }

  /**
   * Extract UCC record from row data
   */
  private extractUccRecord(row: Record<string, any>): UccRecord | null {
    const record: Partial<UccRecord> = {};
    
    // Find and extract debtor name
    record.debtorName = this.findFieldValue(row, this.columnMappings.debtorName);
    if (!record.debtorName) return null;
    
    // Find and extract secured party
    record.securedParty = this.findFieldValue(row, this.columnMappings.securedParty);
    if (!record.securedParty) return null;
    
    // Find and extract filing date
    const dateStr = this.findFieldValue(row, this.columnMappings.filingDate);
    if (dateStr) {
      record.filingDate = this.parseDate(dateStr);
      if (!record.filingDate) return null;
    } else {
      return null;
    }
    
    // Find and extract file number
    record.fileNumber = this.findFieldValue(row, this.columnMappings.fileNumber);
    if (!record.fileNumber) return null;
    
    // Optional fields
    record.collateralDescription = this.findFieldValue(row, this.columnMappings.collateralDescription);
    
    const amountStr = this.findFieldValue(row, this.columnMappings.loanAmount);
    if (amountStr) {
      record.loanAmount = this.parseAmount(amountStr);
    }
    
    const typeStr = this.findFieldValue(row, this.columnMappings.filingType);
    if (typeStr) {
      record.filingType = this.parseFilingType(typeStr);
    }
    
    record.jurisdiction = this.findFieldValue(row, this.columnMappings.jurisdiction);
    
    return record as UccRecord;
  }

  /**
   * Find field value from row using multiple possible column names
   */
  private findFieldValue(row: Record<string, any>, possibleNames: string[]): string | undefined {
    for (const name of possibleNames) {
      // Try exact match
      if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
        return String(row[name]).trim();
      }
      
      // Try case-insensitive match
      for (const key of Object.keys(row)) {
        if (key.toLowerCase() === name.toLowerCase() && 
            row[key] !== undefined && 
            row[key] !== null && 
            row[key] !== '') {
          return String(row[key]).trim();
        }
      }
    }
    return undefined;
  }

  /**
   * Parse date string to Date object
   */
  private parseDate(dateStr: string): Date | null {
    // Try various date formats
    const formats = [
      /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/, // MM/DD/YYYY or MM-DD-YYYY
      /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/, // YYYY-MM-DD
      /(\d{1,2})\/(\d{1,2})\/(\d{2})/ // MM/DD/YY
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        let year, month, day;
        
        // Determine order based on format
        if (match[0].startsWith('20') || match[0].startsWith('19')) {
          // YYYY-MM-DD format
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          // MM/DD/YYYY format
          month = parseInt(match[1]);
          day = parseInt(match[2]);
          year = parseInt(match[3]);
          
          // Handle 2-digit year
          if (year < 100) {
            year += year < 50 ? 2000 : 1900;
          }
        }
        
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
    
    // Try native Date parsing as fallback
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Parse amount string to number
   */
  private parseAmount(amountStr: string): number | undefined {
    // Remove currency symbols and commas
    const cleaned = amountStr.replace(/[$,]/g, '').trim();
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? undefined : Math.floor(amount * 100); // Store in cents
  }

  /**
   * Parse filing type
   */
  private parseFilingType(typeStr: string): 'original' | 'amendment' | 'termination' | undefined {
    const lower = typeStr.toLowerCase();
    if (lower.includes('original') || lower.includes('initial')) return 'original';
    if (lower.includes('amendment') || lower.includes('amend')) return 'amendment';
    if (lower.includes('termination') || lower.includes('terminate')) return 'termination';
    return 'original'; // Default to original if unclear
  }

  /**
   * Match UCC records to existing leads
   */
  async matchToLeads(records: UccRecord[]): Promise<Map<UccRecord, Lead | null>> {
    const matches = new Map<UccRecord, Lead | null>();
    
    for (const record of records) {
      // Try to find matching lead
      const matchedLead = await this.findMatchingLead(record.debtorName);
      matches.set(record, matchedLead);
    }
    
    return matches;
  }

  /**
   * Find a lead matching the debtor name
   */
  private async findMatchingLead(debtorName: string): Promise<Lead | null> {
    // Clean and prepare debtor name for matching
    const cleanDebtor = this.cleanBusinessName(debtorName);
    const debtorParts = cleanDebtor.toLowerCase().split(/\s+/);
    
    // Get potential matches
    const { leads } = await storage.getFilteredLeads({ limit: 1000 });
    
    for (const lead of leads) {
      const cleanLeadName = this.cleanBusinessName(lead.businessName);
      const leadNameLower = cleanLeadName.toLowerCase();
      
      // Check for exact match
      if (leadNameLower === cleanDebtor.toLowerCase()) {
        return lead;
      }
      
      // Check for fuzzy match (at least 70% of words match)
      const matchCount = debtorParts.filter(part => 
        part.length > 2 && leadNameLower.includes(part)
      ).length;
      
      if (matchCount >= Math.ceil(debtorParts.length * 0.7)) {
        return lead;
      }
    }
    
    return null;
  }

  /**
   * Clean business name for matching
   */
  private cleanBusinessName(name: string): string {
    // Remove common business suffixes
    return name
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|enterprises|group)\b\.?/gi, '')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Create comprehensive debtor profiles from UCC records
   */
  createDebtorProfiles(records: UccRecord[], leadMatches: Map<UccRecord, Lead | null>): Map<string, DebtorProfile> {
    const profilesMap = new Map<string, DebtorProfile>();
    
    // Group records by debtor
    const recordsByDebtor = new Map<string, UccRecord[]>();
    for (const record of records) {
      const key = this.cleanBusinessName(record.debtorName).toLowerCase();
      if (!recordsByDebtor.has(key)) {
        recordsByDebtor.set(key, []);
      }
      recordsByDebtor.get(key)!.push(record);
    }
    
    // Create profile for each debtor
    for (const [debtorKey, debtorRecords] of recordsByDebtor.entries()) {
      const profile = this.analyzeDebtorFilings(debtorRecords, leadMatches);
      profilesMap.set(debtorKey, profile);
    }
    
    return profilesMap;
  }

  /**
   * Analyze filings for a single debtor
   */
  private analyzeDebtorFilings(records: UccRecord[], leadMatches: Map<UccRecord, Lead | null>): DebtorProfile {
    const now = new Date();
    const insights: string[] = [];
    
    // Sort records by date
    const sortedRecords = [...records].sort((a, b) => 
      a.filingDate.getTime() - b.filingDate.getTime()
    );
    
    // Find matched lead
    const businessMatch = leadMatches.get(records[0]) || undefined;
    
    // Calculate metrics
    const activeFilings = records.filter(r => r.filingType !== 'termination');
    const terminatedFilings = records.filter(r => r.filingType === 'termination');
    const lastFiling = sortedRecords[sortedRecords.length - 1];
    const daysSinceLastFiling = Math.floor((now.getTime() - lastFiling.filingDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate total debt load
    const totalDebtLoad = records.reduce((sum, r) => {
      if (r.loanAmount && r.filingType !== 'termination') {
        return sum + r.loanAmount;
      }
      return sum;
    }, 0);
    
    // Check for stacking (multiple filings within 90 days)
    const stackingIndicator = this.detectStacking(sortedRecords);
    
    // Check for refinancing patterns
    const refinancingPattern = this.detectRefinancing(sortedRecords);
    
    // Analyze growth trend from collateral descriptions
    const growthIndicator = this.analyzeGrowthTrend(sortedRecords);
    
    // Calculate MCA readiness score (0-100)
    const mcaReadinessScore = this.calculateMcaReadinessScore(
      activeFilings.length,
      terminatedFilings.length,
      daysSinceLastFiling,
      stackingIndicator,
      refinancingPattern
    );
    
    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(
      activeFilings.length,
      stackingIndicator,
      daysSinceLastFiling,
      growthIndicator
    );
    
    // Generate insights
    if (stackingIndicator) {
      insights.push('⚠️ Multiple fundings detected within 90 days - potential stacking behavior');
    }
    
    if (refinancingPattern) {
      insights.push('🔄 Refinancing pattern detected - business actively manages debt');
    }
    
    if (terminatedFilings.length > 0) {
      insights.push(`✅ ${terminatedFilings.length} successfully paid off financing(s)`);
    }
    
    if (daysSinceLastFiling < 90) {
      insights.push('📅 Recent UCC filing - may have existing MCA obligations');
    } else if (daysSinceLastFiling > 180) {
      insights.push('💚 No recent filings - good timing for new MCA offer');
    }
    
    if (growthIndicator === 'growing') {
      insights.push('📈 Business shows growth based on collateral expansion');
    } else if (growthIndicator === 'declining') {
      insights.push('📉 Potential business contraction based on collateral changes');
    }
    
    return {
      debtorName: records[0].debtorName,
      businessMatch,
      filings: sortedRecords,
      totalDebtLoad,
      activeFilings: activeFilings.length,
      terminatedFilings: terminatedFilings.length,
      lastFilingDate: lastFiling.filingDate,
      daysSinceLastFiling,
      stackingIndicator,
      refinancingPattern,
      growthIndicator,
      mcaReadinessScore,
      riskScore,
      insights
    };
  }

  /**
   * Detect stacking behavior
   */
  private detectStacking(sortedRecords: UccRecord[]): boolean {
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    
    for (let i = 0; i < sortedRecords.length - 1; i++) {
      const current = sortedRecords[i];
      const next = sortedRecords[i + 1];
      
      if (current.filingType !== 'termination' && next.filingType !== 'termination') {
        const timeDiff = next.filingDate.getTime() - current.filingDate.getTime();
        if (timeDiff <= ninetyDaysMs && 
            current.securedParty !== next.securedParty) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Detect refinancing patterns
   */
  private detectRefinancing(sortedRecords: UccRecord[]): boolean {
    // Look for termination followed by new filing within 30 days
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    for (let i = 0; i < sortedRecords.length - 1; i++) {
      const current = sortedRecords[i];
      const next = sortedRecords[i + 1];
      
      if (current.filingType === 'termination' && next.filingType === 'original') {
        const timeDiff = next.filingDate.getTime() - current.filingDate.getTime();
        if (timeDiff <= thirtyDaysMs) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Analyze growth trend from collateral descriptions
   */
  private analyzeGrowthTrend(sortedRecords: UccRecord[]): 'growing' | 'stable' | 'declining' {
    const withCollateral = sortedRecords.filter(r => r.collateralDescription);
    
    if (withCollateral.length < 2) return 'stable';
    
    // Simple heuristic: check if collateral descriptions are getting longer/more complex
    const firstCollateral = withCollateral[0].collateralDescription || '';
    const lastCollateral = withCollateral[withCollateral.length - 1].collateralDescription || '';
    
    // Check for keywords indicating growth or decline
    const growthKeywords = ['additional', 'expanded', 'new', 'increased', 'more'];
    const declineKeywords = ['reduced', 'limited', 'partial', 'specific'];
    
    const lastHasGrowth = growthKeywords.some(kw => lastCollateral.toLowerCase().includes(kw));
    const lastHasDecline = declineKeywords.some(kw => lastCollateral.toLowerCase().includes(kw));
    
    if (lastHasGrowth) return 'growing';
    if (lastHasDecline) return 'declining';
    
    // Compare length/complexity as a proxy for business size
    if (lastCollateral.length > firstCollateral.length * 1.2) return 'growing';
    if (lastCollateral.length < firstCollateral.length * 0.8) return 'declining';
    
    return 'stable';
  }

  /**
   * Calculate MCA readiness score
   */
  private calculateMcaReadinessScore(
    activeFilings: number,
    terminatedFilings: number,
    daysSinceLastFiling: number,
    hasStacking: boolean,
    hasRefinancing: boolean
  ): number {
    let score = 50; // Base score
    
    // Positive factors
    if (daysSinceLastFiling > 180) score += 20;
    else if (daysSinceLastFiling > 90) score += 10;
    else score -= 20;
    
    if (terminatedFilings > 0) score += 15 * Math.min(terminatedFilings, 2);
    if (hasRefinancing) score += 10; // Shows good debt management
    
    // Negative factors
    if (activeFilings > 2) score -= 10 * (activeFilings - 2);
    if (hasStacking) score -= 25;
    if (daysSinceLastFiling < 30) score -= 15;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate risk score
   */
  private calculateRiskScore(
    activeFilings: number,
    hasStacking: boolean,
    daysSinceLastFiling: number,
    growthIndicator: string
  ): number {
    let score = 30; // Base risk
    
    // Risk factors
    score += activeFilings * 15;
    if (hasStacking) score += 30;
    if (daysSinceLastFiling < 60) score += 20;
    if (growthIndicator === 'declining') score += 15;
    
    // Risk mitigation
    if (daysSinceLastFiling > 180) score -= 10;
    if (growthIndicator === 'growing') score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate MCA eligibility signals based on UCC filings
   */
  calculateMcaSignals(filings: UccFiling[]): McaEligibilitySignal[] {
    const signals: McaEligibilitySignal[] = [];
    const now = new Date();
    
    // Sort filings by date
    const sortedFilings = [...filings].sort((a, b) => 
      b.filingDate.getTime() - a.filingDate.getTime()
    );
    
    // Check for recent filings (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const recentFilings = sortedFilings.filter(f => 
      f.filingDate >= sixMonthsAgo && f.filingType !== 'termination'
    );
    
    if (recentFilings.length > 0) {
      signals.push({
        signal: 'negative',
        reason: `${recentFilings.length} recent UCC filing(s) in last 6 months - likely has existing MCA`,
        score: -50 - (recentFilings.length - 1) * 10
      });
    }
    
    // Check for multiple active filings
    const activeFilings = sortedFilings.filter(f => f.filingType !== 'termination');
    if (activeFilings.length >= 3) {
      signals.push({
        signal: 'negative',
        reason: `${activeFilings.length} active UCC filings - high existing debt load`,
        score: -30 - (activeFilings.length - 3) * 5
      });
    }
    
    // Check for old filings (>12 months) that might need refinancing
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const oldFilings = sortedFilings.filter(f => 
      f.filingDate < oneYearAgo && f.filingType !== 'termination'
    );
    
    if (oldFilings.length > 0 && recentFilings.length === 0) {
      signals.push({
        signal: 'positive',
        reason: 'Has older UCC filings (>12 months) - may need refinancing',
        score: 30
      });
    }
    
    // Check for terminations (positive signal)
    const terminations = sortedFilings.filter(f => f.filingType === 'termination');
    if (terminations.length > 0) {
      signals.push({
        signal: 'positive',
        reason: `${terminations.length} terminated UCC filing(s) - has paid off previous financing`,
        score: 20 * terminations.length
      });
    }
    
    // Check filing patterns
    if (activeFilings.length === 1 && activeFilings[0].filingDate < sixMonthsAgo) {
      signals.push({
        signal: 'neutral',
        reason: 'Single older UCC filing - moderate debt load',
        score: 0
      });
    }
    
    // No filings at all
    if (filings.length === 0) {
      signals.push({
        signal: 'positive',
        reason: 'No UCC filings found - clean financing slate',
        score: 40
      });
    }
    
    return signals;
  }

  /**
   * Store UCC filings in database
   */
  async storeFilings(records: UccRecord[], leadMatches: Map<UccRecord, Lead | null>): Promise<UccFiling[]> {
    const filings: InsertUccFiling[] = [];
    
    for (const [record, lead] of leadMatches.entries()) {
      filings.push({
        leadId: lead?.id,
        debtorName: record.debtorName,
        securedParty: record.securedParty,
        filingDate: record.filingDate.toISOString(),
        fileNumber: record.fileNumber,
        collateralDescription: record.collateralDescription,
        loanAmount: record.loanAmount,
        filingType: record.filingType,
        jurisdiction: record.jurisdiction
      });
    }
    
    return await storage.createUccFilings(filings);
  }

  /**
   * Process UCC file upload
   */
  async processUccUpload(fileBuffer: Buffer, fileType: 'csv' | 'excel'): Promise<{
    success: boolean;
    message: string;
    summary: UccParseResult['summary'];
    signals?: Map<string, McaEligibilitySignal[]>;
  }> {
    // Parse the file
    const parseResult = fileType === 'csv' 
      ? await this.parseUccCsv(fileBuffer.toString())
      : await this.parseUccExcel(fileBuffer);
    
    if (!parseResult.success) {
      return {
        success: false,
        message: `Failed to parse file: ${parseResult.errors.join(', ')}`,
        summary: parseResult.summary
      };
    }
    
    // Match to leads
    const matches = await this.matchToLeads(parseResult.records);
    
    // Count matched vs unmatched
    let matchedCount = 0;
    for (const lead of matches.values()) {
      if (lead) matchedCount++;
    }
    
    parseResult.summary.matchedLeads = matchedCount;
    parseResult.summary.unmatchedRecords = parseResult.records.length - matchedCount;
    
    // Store in database
    const storedFilings = await this.storeFilings(parseResult.records, matches);
    
    // Calculate signals for matched leads
    const signalsByLead = new Map<string, McaEligibilitySignal[]>();
    const leadFilings = new Map<string, UccFiling[]>();
    
    // Group filings by lead
    for (const filing of storedFilings) {
      if (filing.leadId) {
        if (!leadFilings.has(filing.leadId)) {
          leadFilings.set(filing.leadId, []);
        }
        leadFilings.get(filing.leadId)!.push(filing);
      }
    }
    
    // Calculate signals for each lead
    for (const [leadId, filings] of leadFilings.entries()) {
      const signals = this.calculateMcaSignals(filings);
      signalsByLead.set(leadId, signals);
    }
    
    return {
      success: true,
      message: `Successfully processed ${parseResult.records.length} UCC records`,
      summary: parseResult.summary,
      signals: signalsByLead
    };
  }
}

export const uccParser = new UccParserService();