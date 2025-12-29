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
  filingType?: 'original' | 'amendment' | 'termination' | 'continuation';
  jurisdiction?: string;
  originalFilingNumber?: string; // For linking continuations to originals
  continuationCount?: number; // Track number of continuations
}

interface ContinuationRecord {
  originalFilingNumber: string;  // UCC1_NUM
  continuationFilingNumber: string;  // UCC3_NUM
  amendmentType: string;
  filingDate?: Date;
  debtorName?: string;
  jurisdiction?: string;
}

interface UccParseResult {
  success: boolean;
  records: UccRecord[];
  continuationRecords: ContinuationRecord[];
  linkedContinuations: number;
  errors: string[];
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    continuationRecords: number;
    linkedContinuations: number;
    orphanedContinuations: number;
    matchedLeads: number;
    unmatchedRecords: number;
    uniqueDebtors: number;
    uniqueSecuredParties: number;
    averageLoanAmount?: number;
    dateRange?: { earliest: Date; latest: Date };
    activeFinancingRelationships: number;
    recentFinancingActivity: number;
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
    ],
    // Continuation record specific mappings
    originalFilingNumber: [
      'ucc1_num', 'ucc1 num', 'original filing', 'original filing number',
      'original ucc', 'initial filing number', 'parent filing'
    ],
    continuationFilingNumber: [
      'ucc3_num', 'ucc3 num', 'continuation filing', 'continuation number',
      'continuation filing number', 'amendment filing number'
    ],
    amendmentType: [
      'amendment_type', 'amendment type', 'modification type', 'filing action',
      'transaction type', 'amendment'
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
    const allContinuations: ContinuationRecord[] = [];
    const processedFileNumbers = new Set<string>();
    const insights: string[] = [];
    let filesProcessed = 0;
    
    // Add limits to prevent memory/stack overflow
    const MAX_RECORDS_PER_FILE = 50000;
    const MAX_TOTAL_RECORDS = 100000;
    
    // Process each file - collect ALL records and continuations BEFORE linking
    for (const file of files) {
      try {
        let parseResult: UccParseResult;
        
        // Read file and parse based on type
        const fileBuffer = await fs.readFile(file.path);
        
        if (file.name.toLowerCase().endsWith('.csv')) {
          const csvContent = fileBuffer.toString('utf8');
          // Parse without linking continuations yet
          parseResult = await this.parseUccCsvRaw(csvContent);
        } else if (file.name.toLowerCase().endsWith('.xlsx') || 
                   file.name.toLowerCase().endsWith('.xls')) {
          parseResult = await this.parseUccExcelRaw(fileBuffer);
        } else {
          console.log(`Skipping unsupported file: ${file.name}`);
          continue;
        }
        
        if (parseResult.success) {
          // Calculate remaining budget to enforce total limit
          const remainingBudget = MAX_TOTAL_RECORDS - allRecords.length;
          
          // Limit records per file and respect total budget
          let recordsToAdd = parseResult.records.slice(0, Math.min(MAX_RECORDS_PER_FILE, remainingBudget));
          
          if (parseResult.records.length > recordsToAdd.length) {
            const reason = remainingBudget < MAX_RECORDS_PER_FILE 
              ? `total limit (${MAX_TOTAL_RECORDS} records)`
              : `per-file limit (${MAX_RECORDS_PER_FILE} records)`;
            console.log(`File ${file.name} truncated to ${recordsToAdd.length} records due to ${reason} (original: ${parseResult.records.length})`);
            insights.push(`⚠️ File ${file.name} truncated to ${recordsToAdd.length} records (${parseResult.records.length} total)`);
          }
          
          allRecords.push(...recordsToAdd);
          // Also collect continuation records separately
          allContinuations.push(...parseResult.continuationRecords);
          filesProcessed++;
          console.log(`Processed ${file.name}: ${recordsToAdd.length} regular records, ${parseResult.continuationRecords.length} continuations (total: ${allRecords.length} regular, ${allContinuations.length} continuations)`);
          
          // Stop processing more files if we've reached the limit
          if (allRecords.length >= MAX_TOTAL_RECORDS) {
            console.log(`Reached maximum total record limit (${MAX_TOTAL_RECORDS}). Stopping file processing.`);
            insights.push(`⚠️ Processing stopped after ${filesProcessed} file(s) - reached ${MAX_TOTAL_RECORDS} records limit`);
            break;
          }
        } else {
          console.error(`Failed to process ${file.name}: ${parseResult.errors.join(', ')}`);
        }
      } catch (error: any) {
        console.error(`Error processing ${file.name}: ${error.message}`);
        insights.push(`❌ Error processing ${file.name}: ${error.message}`);
        // Continue processing other files instead of failing completely
      }
    }
    
    // NOW link continuations across ALL files
    console.log(`Linking ${allContinuations.length} continuation records to ${allRecords.length} original filings across all files...`);
    const linkingResult = this.linkContinuationsToOriginals(allRecords, allContinuations);
    const enrichedRecords = linkingResult.enrichedRecords;
    console.log(`Successfully linked ${linkingResult.linkedCount} continuations. Orphaned: ${allContinuations.length - linkingResult.linkedCount}`);
    
    // Deduplicate and merge records (with batching to prevent stack overflow)
    const mergedRecords = this.deduplicateAndMerge(enrichedRecords);
    const duplicatesRemoved = enrichedRecords.length - mergedRecords.length;
    
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
    
    // Match to leads and create debtor profiles (with batching for large datasets)
    console.log(`Matching ${mergedRecords.length} records to leads...`);
    const leadMatches = await this.matchToLeadsBatched(mergedRecords);
    console.log(`Creating debtor profiles...`);
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
   * Parse CSV file containing UCC data (without linking continuations)
   */
  async parseUccCsvRaw(csvContent: string): Promise<UccParseResult> {
    return new Promise((resolve) => {
      const result: UccParseResult = {
        success: false,
        records: [],
        continuationRecords: [],
        linkedContinuations: 0,
        errors: [],
        summary: {
          totalRecords: 0,
          validRecords: 0,
          invalidRecords: 0,
          continuationRecords: 0,
          linkedContinuations: 0,
          orphanedContinuations: 0,
          matchedLeads: 0,
          unmatchedRecords: 0,
          uniqueDebtors: 0,
          uniqueSecuredParties: 0,
          activeFinancingRelationships: 0,
          recentFinancingActivity: 0
        }
      };

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: async (parseResult) => {
          // Limit to prevent stack overflow with very large files
          const MAX_ROWS_TO_PROCESS = 50000;
          const dataToProcess = (parseResult.data as any[]).slice(0, MAX_ROWS_TO_PROCESS);
          result.summary.totalRecords = dataToProcess.length;
          
          if ((parseResult.data as any[]).length > MAX_ROWS_TO_PROCESS) {
            console.log(`CSV truncated to ${MAX_ROWS_TO_PROCESS} rows (original: ${(parseResult.data as any[]).length} rows)`);
            result.errors.push(`File truncated to ${MAX_ROWS_TO_PROCESS} rows to prevent memory issues`);
          }
          
          for (const row of dataToProcess) {
            const recordType = this.detectRecordType(row);
            
            if (recordType === 'regular') {
              const record = this.extractUccRecord(row);
              if (record) {
                result.records.push(record);
                result.summary.validRecords++;
              } else {
                result.summary.invalidRecords++;
                result.errors.push(`Invalid regular record: ${JSON.stringify(row).substring(0, 100)}`);
              }
            } else if (recordType === 'continuation') {
              const continuationRecord = this.extractContinuationRecord(row);
              if (continuationRecord) {
                result.continuationRecords.push(continuationRecord);
                result.summary.continuationRecords++;
                // Log as valuable continuation instead of invalid
                console.log(`Found continuation amendment: ${continuationRecord.originalFilingNumber} -> ${continuationRecord.continuationFilingNumber}`);
              } else {
                result.summary.invalidRecords++;
                result.errors.push(`Invalid continuation record: ${JSON.stringify(row).substring(0, 100)}`);
              }
            } else {
              result.summary.invalidRecords++;
              result.errors.push(`Unknown record type: ${JSON.stringify(row).substring(0, 100)}`);
            }
          }
          
          // Don't link continuations here - will be done across all files later
          result.summary.continuationRecords = result.continuationRecords.length;
          
          result.success = (result.records.length > 0 || result.continuationRecords.length > 0);
          resolve(result);
        },
        error: (error: any) => {
          result.errors.push(error.message);
          resolve(result);
        }
      });
    });
  }

  /**
   * Parse Excel file containing UCC data (without linking continuations)
   */
  async parseUccExcelRaw(buffer: Buffer): Promise<UccParseResult> {
    const result: UccParseResult = {
      success: false,
      records: [],
      continuationRecords: [],
      linkedContinuations: 0,
      errors: [],
      summary: {
        totalRecords: 0,
        validRecords: 0,
        invalidRecords: 0,
        continuationRecords: 0,
        linkedContinuations: 0,
        orphanedContinuations: 0,
        matchedLeads: 0,
        unmatchedRecords: 0,
        uniqueDebtors: 0,
        uniqueSecuredParties: 0,
        activeFinancingRelationships: 0,
        recentFinancingActivity: 0
      }
    };

    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      // Limit to prevent stack overflow with very large files
      const MAX_ROWS_TO_PROCESS = 50000;
      const dataToProcess = jsonData.slice(0, MAX_ROWS_TO_PROCESS);
      result.summary.totalRecords = dataToProcess.length;
      
      if (jsonData.length > MAX_ROWS_TO_PROCESS) {
        console.log(`Excel file truncated to ${MAX_ROWS_TO_PROCESS} rows (original: ${jsonData.length} rows)`);
        result.errors.push(`File truncated to ${MAX_ROWS_TO_PROCESS} rows to prevent memory issues`);
      }
      
      for (const row of dataToProcess) {
        const recordType = this.detectRecordType(row as any);
        
        if (recordType === 'regular') {
          const record = this.extractUccRecord(row as any);
          if (record) {
            result.records.push(record);
            result.summary.validRecords++;
          } else {
            result.summary.invalidRecords++;
            result.errors.push(`Invalid regular record at row ${result.summary.validRecords + result.summary.invalidRecords + result.summary.continuationRecords}`);
          }
        } else if (recordType === 'continuation') {
          const continuationRecord = this.extractContinuationRecord(row as any);
          if (continuationRecord) {
            result.continuationRecords.push(continuationRecord);
            result.summary.continuationRecords++;
            console.log(`Found continuation amendment: ${continuationRecord.originalFilingNumber} -> ${continuationRecord.continuationFilingNumber}`);
          } else {
            result.summary.invalidRecords++;
            result.errors.push(`Invalid continuation record at row ${result.summary.validRecords + result.summary.invalidRecords + result.summary.continuationRecords}`);
          }
        } else {
          result.summary.invalidRecords++;
          result.errors.push(`Unknown record type at row ${result.summary.validRecords + result.summary.invalidRecords + result.summary.continuationRecords}`);
        }
      }
      
      // Don't link continuations here - will be done across all files later
      result.summary.continuationRecords = result.continuationRecords.length;
      
      result.success = (result.records.length > 0 || result.continuationRecords.length > 0);
    } catch (error: any) {
      result.errors.push(`Excel parse error: ${error.message}`);
    }

    return result;
  }

  /**
   * Parse CSV file containing UCC data (with continuation linking for single file)
   */
  async parseUccCsv(csvContent: string): Promise<UccParseResult> {
    const result = await this.parseUccCsvRaw(csvContent);
    
    if (result.success && result.records.length > 0) {
      // Link continuations within this file
      const linkingResult = this.linkContinuationsToOriginals(result.records, result.continuationRecords);
      result.records = linkingResult.enrichedRecords;
      result.linkedContinuations = linkingResult.linkedCount;
      result.summary.linkedContinuations = linkingResult.linkedCount;
      result.summary.orphanedContinuations = result.continuationRecords.length - linkingResult.linkedCount;
      
      // Calculate active financing relationships
      result.summary.activeFinancingRelationships = result.records.filter(r => 
        r.continuationCount && r.continuationCount > 0 && r.filingType !== 'termination'
      ).length;
      
      // Calculate recent financing activity (continuations in last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      result.summary.recentFinancingActivity = result.continuationRecords.filter(c => 
        c.filingDate && c.filingDate >= sixMonthsAgo
      ).length;
    }
    
    return result;
  }

  /**
   * Parse Excel file containing UCC data (with continuation linking for single file)
   */
  async parseUccExcel(buffer: Buffer): Promise<UccParseResult> {
    const result = await this.parseUccExcelRaw(buffer);
    
    if (result.success && result.records.length > 0) {
      // Link continuations within this file
      const linkingResult = this.linkContinuationsToOriginals(result.records, result.continuationRecords);
      result.records = linkingResult.enrichedRecords;
      result.linkedContinuations = linkingResult.linkedCount;
      result.summary.linkedContinuations = linkingResult.linkedCount;
      result.summary.orphanedContinuations = result.continuationRecords.length - linkingResult.linkedCount;
      
      // Calculate active financing relationships
      result.summary.activeFinancingRelationships = result.records.filter(r => 
        r.continuationCount && r.continuationCount > 0 && r.filingType !== 'termination'
      ).length;
      
      // Calculate recent financing activity
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      result.summary.recentFinancingActivity = result.continuationRecords.filter(c => 
        c.filingDate && c.filingDate >= sixMonthsAgo
      ).length;
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
      const parsedDate = this.parseDate(dateStr);
      if (!parsedDate) return null;
      record.filingDate = parsedDate;
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
   * Detect the type of UCC record based on available fields
   */
  private detectRecordType(row: Record<string, any>): 'regular' | 'continuation' | 'unknown' {
    // Check for continuation record fields
    const hasUcc1Num = this.findFieldValue(row, this.columnMappings.originalFilingNumber) !== undefined;
    const hasUcc3Num = this.findFieldValue(row, this.columnMappings.continuationFilingNumber) !== undefined;
    const hasAmendmentType = this.findFieldValue(row, this.columnMappings.amendmentType) !== undefined;
    
    if ((hasUcc1Num || hasUcc3Num) && hasAmendmentType) {
      return 'continuation';
    }
    
    // Check for regular record fields
    const hasDebtor = this.findFieldValue(row, this.columnMappings.debtorName) !== undefined;
    const hasSecuredParty = this.findFieldValue(row, this.columnMappings.securedParty) !== undefined;
    
    if (hasDebtor && hasSecuredParty) {
      return 'regular';
    }
    
    return 'unknown';
  }

  /**
   * Extract continuation record from row data
   */
  private extractContinuationRecord(row: Record<string, any>): ContinuationRecord | null {
    const record: Partial<ContinuationRecord> = {};
    
    // Extract required fields
    record.originalFilingNumber = this.findFieldValue(row, this.columnMappings.originalFilingNumber);
    record.continuationFilingNumber = this.findFieldValue(row, this.columnMappings.continuationFilingNumber);
    record.amendmentType = this.findFieldValue(row, this.columnMappings.amendmentType);
    
    // At least need original filing number and amendment type
    if (!record.originalFilingNumber || !record.amendmentType) {
      return null;
    }
    
    // Try to extract optional fields
    const dateStr = this.findFieldValue(row, this.columnMappings.filingDate);
    if (dateStr) {
      record.filingDate = this.parseDate(dateStr) ?? undefined;
    }
    
    record.debtorName = this.findFieldValue(row, this.columnMappings.debtorName);
    record.jurisdiction = this.findFieldValue(row, this.columnMappings.jurisdiction);
    
    // Default continuation filing number if not provided
    if (!record.continuationFilingNumber) {
      record.continuationFilingNumber = 'CONT-' + Date.now();
    }
    
    return record as ContinuationRecord;
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
  private parseFilingType(typeStr: string): 'original' | 'amendment' | 'termination' | 'continuation' | undefined {
    const lower = typeStr.toLowerCase();
    if (lower.includes('original') || lower.includes('initial')) return 'original';
    if (lower.includes('continuation')) return 'continuation';
    if (lower.includes('amendment') || lower.includes('amend')) return 'amendment';
    if (lower.includes('termination') || lower.includes('terminate')) return 'termination';
    return 'original'; // Default to original if unclear
  }

  /**
   * Link continuation records to original filings
   */
  private linkContinuationsToOriginals(
    records: UccRecord[], 
    continuations: ContinuationRecord[]
  ): { enrichedRecords: UccRecord[]; linkedCount: number } {
    let linkedCount = 0;
    const recordsByFileNumber = new Map<string, UccRecord>();
    
    // Index records by file number for quick lookup
    for (const record of records) {
      recordsByFileNumber.set(record.fileNumber, record);
      // Also try without any prefix (in case numbers have different formats)
      const cleanNumber = record.fileNumber.replace(/^[A-Z]+/, '');
      if (cleanNumber !== record.fileNumber) {
        recordsByFileNumber.set(cleanNumber, record);
      }
    }
    
    // Link continuations to originals
    for (const continuation of continuations) {
      let originalRecord = recordsByFileNumber.get(continuation.originalFilingNumber);
      
      if (!originalRecord) {
        // Try to find by partial match
        const cleanOriginal = continuation.originalFilingNumber.replace(/^[A-Z]+/, '');
        originalRecord = recordsByFileNumber.get(cleanOriginal);
      }
      
      if (originalRecord) {
        // Update the original record with continuation info
        originalRecord.continuationCount = (originalRecord.continuationCount || 0) + 1;
        
        // Update filing type if it's a continuation
        if (continuation.amendmentType.toLowerCase().includes('continuation')) {
          originalRecord.filingType = 'continuation';
        }
        
        linkedCount++;
        
        // If continuation has a filing date, check if it's more recent
        if (continuation.filingDate && continuation.filingDate > originalRecord.filingDate) {
          // This indicates an active, recently maintained financing relationship
          originalRecord.filingDate = continuation.filingDate; // Update to most recent activity
        }
      } else {
        // Create a placeholder record for orphaned continuations
        const placeholderRecord: UccRecord = {
          debtorName: continuation.debtorName || 'Unknown (from continuation)',
          securedParty: 'Unknown (from continuation)',
          filingDate: continuation.filingDate || new Date(),
          fileNumber: continuation.continuationFilingNumber,
          originalFilingNumber: continuation.originalFilingNumber,
          filingType: 'continuation',
          continuationCount: 1,
          jurisdiction: continuation.jurisdiction
        };
        records.push(placeholderRecord);
      }
    }
    
    return { enrichedRecords: records, linkedCount };
  }

  /**
   * Match UCC records to existing leads (batched to prevent timeouts)
   */
  async matchToLeadsBatched(records: UccRecord[]): Promise<Map<UccRecord, Lead | null>> {
    const matches = new Map<UccRecord, Lead | null>();
    const BATCH_SIZE = 1000;
    
    // Fetch all leads once to avoid repeated database queries
    const { leads: allLeads } = await storage.getFilteredLeads({ limit: 10000 });
    console.log(`Loaded ${allLeads.length} leads for matching`);
    
    // Process records in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)}`);
      
      for (const record of batch) {
        // Try to find matching lead from cached leads
        const matchedLead = this.findMatchingLeadFromCache(record.debtorName, allLeads);
        matches.set(record, matchedLead);
      }
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setImmediate(resolve));
    }
    
    return matches;
  }
  
  /**
   * Match UCC records to existing leads
   */
  async matchToLeads(records: UccRecord[]): Promise<Map<UccRecord, Lead | null>> {
    return this.matchToLeadsBatched(records);
  }

  /**
   * Find a lead matching the debtor name from cached leads
   */
  private findMatchingLeadFromCache(debtorName: string, leads: Lead[]): Lead | null {
    // Clean and prepare debtor name for matching
    const cleanDebtor = this.cleanBusinessName(debtorName);
    const debtorParts = cleanDebtor.toLowerCase().split(/\s+/);
    
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
    for (const [debtorKey, debtorRecords] of Array.from(recordsByDebtor.entries())) {
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
    
    // Check for recent continuation activity
    const recentContinuation = records.some(r => 
      r.filingType === 'continuation' && 
      r.filingDate && 
      Math.floor((now.getTime() - r.filingDate.getTime()) / (1000 * 60 * 60 * 24)) < 180
    );
    
    // Count total continuations
    const continuationCount = records.reduce((sum, r) => 
      sum + (r.continuationCount || 0), 0
    );
    
    // Calculate MCA readiness score (0-100)
    const mcaReadinessScore = this.calculateMcaReadinessScore(
      activeFilings.length,
      terminatedFilings.length,
      daysSinceLastFiling,
      stackingIndicator,
      refinancingPattern,
      continuationCount,
      recentContinuation
    );
    
    // Calculate risk score (0-100)
    const riskScore = this.calculateRiskScore(
      activeFilings.length,
      stackingIndicator,
      daysSinceLastFiling,
      growthIndicator
    );
    
    // Generate insights
    if (continuationCount > 0) {
      insights.push(`📋 ${continuationCount} continuation filing(s) found - ACTIVE financing relationship`);
      if (recentContinuation) {
        insights.push('🔥 Recent continuation activity - actively maintaining financing (prime MCA opportunity)');
      } else {
        insights.push('📝 Older continuations present - established financing history');
      }
    }
    
    if (stackingIndicator) {
      insights.push('⚠️ Multiple fundings detected within 90 days - potential stacking behavior');
    }
    
    if (refinancingPattern) {
      insights.push('🔄 Refinancing pattern detected - business actively manages debt');
    }
    
    if (terminatedFilings.length > 0) {
      insights.push(`✅ ${terminatedFilings.length} successfully paid off financing(s)`);
    }
    
    if (continuationCount > 2) {
      insights.push('💰 Long-term financing relationship evident - multiple continuations');
    }
    
    if (daysSinceLastFiling < 90 && !recentContinuation) {
      insights.push('📅 Recent UCC filing - may have existing MCA obligations');
    } else if (daysSinceLastFiling > 180 && !recentContinuation) {
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
    hasRefinancing: boolean,
    continuationCount: number = 0,
    recentContinuation: boolean = false
  ): number {
    let score = 50; // Base score
    
    // Positive factors
    if (daysSinceLastFiling > 180 && !recentContinuation) score += 20;
    else if (daysSinceLastFiling > 90 && !recentContinuation) score += 10;
    else score -= 20;
    
    if (terminatedFilings > 0) score += 15 * Math.min(terminatedFilings, 2);
    if (hasRefinancing) score += 10; // Shows good debt management
    
    // Continuation-based factors
    if (continuationCount > 0) {
      if (recentContinuation) {
        // Recent continuation = active financing = may need additional capital
        score += 15; // They're actively managing debt, good MCA candidate
      } else {
        // Has continuations but not recent = established business
        score += 10;
      }
    }
    
    // Boost score for businesses with 1-2 continuations (shows stability)
    if (continuationCount >= 1 && continuationCount <= 2) {
      score += 10; // Stable financing history
    }
    
    // Negative factors
    if (activeFilings > 2) score -= 10 * (activeFilings - 2);
    if (hasStacking) score -= 25;
    if (daysSinceLastFiling < 30 && !recentContinuation) score -= 15;
    
    // Too many continuations might indicate distress
    if (continuationCount > 3) {
      score -= 5 * (continuationCount - 3);
    }
    
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
    
    for (const [record, lead] of Array.from(leadMatches.entries())) {
      filings.push({
        leadId: lead?.id,
        debtorName: record.debtorName,
        securedParty: record.securedParty,
        filingDate: record.filingDate.toISOString(),
        fileNumber: record.fileNumber,
        collateralDescription: record.collateralDescription,
        loanAmount: record.loanAmount,
        filingType: record.filingType as any,
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
    for (const lead of Array.from(matches.values())) {
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
    for (const [leadId, filings] of Array.from(leadFilings.entries())) {
      const signals = this.calculateMcaSignals(filings);
      signalsByLead.set(leadId, signals);
    }
    
    // Generate enhanced message with continuation insights
    let message = `Successfully processed ${parseResult.summary.totalRecords} total records`;
    
    if (parseResult.summary.continuationRecords > 0) {
      message += `\n📋 Found ${parseResult.summary.continuationRecords} continuation amendments (VALUABLE!)`;
      message += `\n✅ Linked ${parseResult.summary.linkedContinuations} continuations to original filings`;
      
      if (parseResult.summary.orphanedContinuations > 0) {
        message += `\n⚠️ ${parseResult.summary.orphanedContinuations} orphaned continuations (no matching original)`;
      }
      
      if (parseResult.summary.activeFinancingRelationships > 0) {
        message += `\n🔥 ${parseResult.summary.activeFinancingRelationships} active financing relationships identified`;
      }
      
      if (parseResult.summary.recentFinancingActivity > 0) {
        message += `\n💰 ${parseResult.summary.recentFinancingActivity} businesses with recent financing activity (last 6 months)`;
      }
    }
    
    message += `\n📊 ${parseResult.summary.validRecords} regular UCC records processed`;
    message += `\n🔗 ${parseResult.summary.matchedLeads} records matched to existing leads`;
    
    return {
      success: true,
      message,
      summary: parseResult.summary,
      signals: signalsByLead
    };
  }
}

export const uccParser = new UccParserService();