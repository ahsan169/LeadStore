import Papa from "papaparse";
import * as XLSX from "xlsx";
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
  };
}

interface McaEligibilitySignal {
  signal: 'positive' | 'negative' | 'neutral';
  reason: string;
  score: number; // -100 to +100
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
          unmatchedRecords: 0
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