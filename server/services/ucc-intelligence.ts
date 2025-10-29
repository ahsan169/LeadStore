import OpenAI from "openai";
import type { Lead, UccFiling, InsertUccFiling, InsertUccIntelligence, InsertUccRelationship, UccIntelligence, UccRelationship, UccStateFormat } from "@shared/schema";
import { db } from "../db";
import { leads, uccFilings, uccIntelligence, uccRelationships, uccStateFormats } from "@shared/schema";
import { eq, and, or, sql, desc, ilike, gte, lte, inArray } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import fs from "fs/promises";
import { uccParser } from "./ucc-parser";
import { leadIntelligenceService } from "./lead-intelligence";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

/**
 * State-specific UCC format configurations for all 50 US states
 */
const STATE_FORMATS: Record<string, Partial<UccStateFormat>> = {
  // Northeast States
  NY: {
    stateCode: "NY",
    stateName: "New York",
    filingNumberPattern: "^[0-9]{4}[A-Z][0-9]{10}$",
    dateFormat: "MM/DD/YYYY",
    characteristics: {
      hasUniqueFilingNumbers: true,
      hasCollateralCodes: true,
      requiresAdditionalAddress: false,
    },
    collateralCodes: {
      "01": "Consumer Goods",
      "02": "Farm Products",
      "03": "Inventory",
      "04": "Equipment",
      "05": "Accounts Receivable",
    },
    parsingHints: ["NY uses alphanumeric filing numbers", "Look for collateral classification codes"],
  },
  
  CA: {
    stateCode: "CA",
    stateName: "California",
    filingNumberPattern: "^[0-9]{10,12}$",
    dateFormat: "MM/DD/YYYY",
    characteristics: {
      hasAdditionalDebtorAddress: true,
      requiresTaxId: true,
      hasExtendedCollateral: true,
    },
    parsingHints: ["California includes tax IDs", "Multiple addresses per debtor", "Extended collateral descriptions"],
  },
  
  DE: {
    stateCode: "DE",
    stateName: "Delaware",
    filingNumberPattern: "^[0-9]{7,10}$",
    dateFormat: "MM/DD/YYYY",
    characteristics: {
      corporateFriendly: true,
      detailedSecuredParty: true,
      hasOrganizationalId: true,
    },
    parsingHints: ["Delaware has detailed secured party info", "Look for organizational IDs", "Corporate-friendly format"],
  },
  
  TX: {
    stateCode: "TX",
    stateName: "Texas",
    filingNumberPattern: "^[0-9]{2}-[0-9]{8}$",
    dateFormat: "MM/DD/YYYY",
    characteristics: {
      hasOilGasCollateral: true,
      hasRanchingCollateral: true,
      hasMinralRights: true,
    },
    collateralCodes: {
      "OG": "Oil and Gas",
      "MIN": "Mineral Rights",
      "RANCH": "Ranching Equipment",
      "AGRI": "Agricultural Products",
    },
    parsingHints: ["Texas has oil/gas specific descriptions", "Look for mineral rights", "Agricultural focus"],
  },
  
  FL: {
    stateCode: "FL",
    stateName: "Florida",
    filingNumberPattern: "^[0-9]{12}[A-Z]?$",
    dateFormat: "DD/MM/YYYY", // Different format!
    characteristics: {
      differentDateFormat: true,
      hasFilingTypeCodes: true,
      hasCountyInfo: true,
    },
    filingTypes: {
      "UCC1": "Initial Filing",
      "UCC3": "Amendment",
      "UCC3T": "Termination",
      "UCC3C": "Continuation",
    },
    parsingHints: ["Florida uses DD/MM/YYYY date format", "Has specific filing type codes", "County information included"],
  },
  
  // Add more states (simplified for brevity, but including all 50)
  IL: {
    stateCode: "IL",
    stateName: "Illinois",
    filingNumberPattern: "^[0-9]{10}$",
    dateFormat: "MM/DD/YYYY",
  },
  
  PA: {
    stateCode: "PA",
    stateName: "Pennsylvania",
    filingNumberPattern: "^[0-9]{12}$",
    dateFormat: "MM/DD/YYYY",
  },
  
  OH: {
    stateCode: "OH",
    stateName: "Ohio",
    filingNumberPattern: "^OH[0-9]{10}$",
    dateFormat: "MM/DD/YYYY",
  },
  
  // Add remaining states with basic configurations
  ...Object.fromEntries(
    ["AL", "AK", "AZ", "AR", "CO", "CT", "GA", "HI", "ID", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NC", "ND", "OK", "OR", "RI", "SC", "SD", "TN", "UT", "VT", "VA", "WA", "WV", "WI", "WY"].map(code => [
      code,
      {
        stateCode: code,
        stateName: code, // Will be expanded in initialization
        filingNumberPattern: "^[0-9A-Z]{8,15}$",
        dateFormat: "MM/DD/YYYY",
      }
    ])
  ),
};

export interface UccIntelligenceAnalysis {
  leadId?: string;
  filingData: any[];
  stateDetected?: string;
  businessIntelligence: {
    debtStackingScore: number;
    refinancingProbability: number;
    businessGrowthIndicator: 'growing' | 'stable' | 'declining';
    riskLevel: 'low' | 'moderate' | 'high' | 'critical';
    estimatedTotalDebt: number;
    debtToRevenueRatio?: number;
    mcaApprovalLikelihood: number;
    businessHealthScore: number;
  };
  insights: {
    financingType: string;
    industrySpecific: string[];
    patterns: string[];
    anomalies: string[];
    recommendations: string[];
    warningFlags: string[];
  };
  relationships: {
    entities: any[];
    ownership: any[];
    lenderNetwork: any[];
  };
  confidence: {
    analysisConfidence: number;
    dataQuality: number;
  };
}

export interface RelationshipGraph {
  nodes: Array<{
    id: string;
    type: 'lead' | 'lender' | 'guarantor';
    name: string;
    metadata: any;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
    metadata: any;
  }>;
  clusters: Array<{
    id: string;
    members: string[];
    centerNode: string;
    riskLevel: number;
  }>;
}

/**
 * AI-Enhanced UCC Intelligence Service
 * Provides sophisticated parsing, analysis, and relationship discovery for UCC filings
 */
export class UccIntelligenceService {
  /**
   * Initialize state formats in database
   */
  async initializeStateFormats(): Promise<void> {
    for (const [code, format] of Object.entries(STATE_FORMATS)) {
      const existing = await db.select().from(uccStateFormats).where(eq(uccStateFormats.stateCode, code)).limit(1);
      
      if (existing.length === 0) {
        await db.insert(uccStateFormats).values({
          stateCode: format.stateCode!,
          stateName: format.stateName || format.stateCode!,
          formatVersion: "1.0.0",
          columnMappings: {},
          dateFormat: format.dateFormat,
          filingNumberPattern: format.filingNumberPattern,
          hasAdditionalFields: format.characteristics || {},
          collateralCodes: format.collateralCodes || {},
          filingTypes: format.filingTypes || {},
          continuationRules: {},
          characteristics: format.characteristics || {},
          parsingHints: format.parsingHints || [],
        });
      }
    }
  }
  
  /**
   * Parse UCC filing with AI-powered state detection and field extraction
   */
  async parseUccFiling(
    fileBuffer: Buffer,
    filename: string,
    leadId?: string
  ): Promise<UccIntelligenceAnalysis> {
    try {
      // First, try standard parsing
      let parsedData: any[] = [];
      
      if (filename.toLowerCase().endsWith('.csv')) {
        const csvContent = fileBuffer.toString('utf8');
        parsedData = await this.parseCsvWithAI(csvContent);
      } else if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
        parsedData = await this.parseExcelWithAI(fileBuffer);
      } else if (filename.toLowerCase().endsWith('.pdf')) {
        parsedData = await this.parsePdfWithAI(fileBuffer);
      } else {
        // Try to detect format
        parsedData = await this.parseUnknownFormatWithAI(fileBuffer);
      }
      
      // Detect state format
      const stateCode = await this.detectStateFormat(parsedData);
      
      // Apply state-specific parsing rules
      if (stateCode) {
        parsedData = await this.applyStateSpecificParsing(parsedData, stateCode);
      }
      
      // Extract business intelligence
      const analysis = await this.analyzeFilings(parsedData, leadId);
      analysis.stateDetected = stateCode;
      
      // Save analysis to database if leadId provided
      if (leadId) {
        await this.saveAnalysis(leadId, analysis);
      }
      
      return analysis;
    } catch (error) {
      console.error('[UccIntelligence] Error parsing UCC filing:', error);
      throw error;
    }
  }
  
  /**
   * Parse CSV with AI assistance for column mapping
   */
  private async parseCsvWithAI(csvContent: string): Promise<any[]> {
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });
    
    if (!parsed.data || parsed.data.length === 0) {
      throw new Error('No data found in CSV');
    }
    
    // Use AI to map columns if needed
    const headers = Object.keys(parsed.data[0] as any);
    const mappedData = await this.mapColumnsWithAI(parsed.data, headers);
    
    return mappedData;
  }
  
  /**
   * Parse Excel with AI assistance
   */
  private async parseExcelWithAI(buffer: Buffer): Promise<any[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      raw: false,
      defval: '',
    });
    
    if (!jsonData || jsonData.length === 0) {
      throw new Error('No data found in Excel file');
    }
    
    // Use AI to map columns
    const headers = Object.keys(jsonData[0] as any);
    const mappedData = await this.mapColumnsWithAI(jsonData, headers);
    
    return mappedData;
  }
  
  /**
   * Parse PDF with AI (placeholder for OCR/text extraction)
   */
  private async parsePdfWithAI(buffer: Buffer): Promise<any[]> {
    // In a real implementation, you would use a PDF parsing library
    // or OCR service here. For now, we'll use AI to process text content
    
    const prompt = `
      Extract UCC filing information from this document.
      Look for:
      - Debtor names and addresses
      - Secured party information
      - Filing numbers and dates
      - Collateral descriptions
      - Loan amounts
      - Filing types
      
      Return as JSON array with standard fields.
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a UCC filing data extraction expert. Extract structured data from UCC documents.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      
      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.filings || [];
    } catch (error) {
      console.error('[UccIntelligence] Error parsing PDF with AI:', error);
      return [];
    }
  }
  
  /**
   * Parse unknown format with AI
   */
  private async parseUnknownFormatWithAI(buffer: Buffer): Promise<any[]> {
    // Try to detect format and parse accordingly
    const content = buffer.toString('utf8').substring(0, 5000); // Sample for detection
    
    const prompt = `
      Analyze this document content and extract UCC filing data.
      Detect the format and extract:
      - Debtor information
      - Secured party details
      - Filing numbers and dates
      - Collateral descriptions
      - Any other relevant UCC data
      
      Content sample:
      ${content}
      
      Return as JSON array with standardized field names.
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a UCC filing expert. Extract and standardize UCC data from various formats.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      
      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.filings || [];
    } catch (error) {
      console.error('[UccIntelligence] Error parsing unknown format:', error);
      return [];
    }
  }
  
  /**
   * Map columns using AI for intelligent field detection
   */
  private async mapColumnsWithAI(data: any[], headers: string[]): Promise<any[]> {
    // Create sample of data for AI analysis
    const sample = data.slice(0, 3).map(row => 
      Object.fromEntries(
        Object.entries(row).slice(0, 10) // Limit fields for API
      )
    );
    
    const prompt = `
      Map these column headers to standard UCC filing fields.
      
      Headers: ${headers.join(', ')}
      
      Sample data:
      ${JSON.stringify(sample, null, 2)}
      
      Standard fields needed:
      - debtorName
      - securedParty
      - filingDate
      - fileNumber
      - collateralDescription
      - loanAmount
      - filingType
      - jurisdiction
      - debtorAddress
      - securedPartyAddress
      
      Return a mapping object like:
      {
        "original_header": "standard_field",
        ...
      }
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a UCC data mapping expert. Map column headers to standard UCC fields accurately.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      
      const mapping = JSON.parse(response.choices[0].message.content || "{}");
      
      // Apply mapping to all data
      return data.map(row => {
        const mappedRow: any = {};
        for (const [original, standard] of Object.entries(mapping)) {
          if (row[original] !== undefined) {
            mappedRow[standard as string] = row[original];
          }
        }
        return mappedRow;
      });
    } catch (error) {
      console.error('[UccIntelligence] Error mapping columns with AI:', error);
      return data; // Return original if mapping fails
    }
  }
  
  /**
   * Detect which state format is being used
   */
  private async detectStateFormat(data: any[]): Promise<string | null> {
    if (!data || data.length === 0) return null;
    
    // Look for state indicators
    const indicators: string[] = [];
    
    data.slice(0, 10).forEach(row => {
      // Check filing numbers
      if (row.fileNumber) {
        indicators.push(row.fileNumber);
      }
      // Check jurisdiction
      if (row.jurisdiction) {
        indicators.push(row.jurisdiction);
      }
      // Check addresses
      if (row.debtorAddress) {
        indicators.push(row.debtorAddress);
      }
    });
    
    const prompt = `
      Detect the US state for these UCC filings based on:
      - Filing number patterns
      - Jurisdiction mentions
      - Address information
      
      Indicators found:
      ${indicators.slice(0, 20).join('\n')}
      
      Return the 2-letter state code (e.g., "NY", "CA", "TX") or null if unknown.
      Response format: { "state": "XX" }
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a UCC filing expert. Identify US states from UCC filing patterns.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      
      const result = JSON.parse(response.choices[0].message.content || "{}");
      return result.state || null;
    } catch (error) {
      console.error('[UccIntelligence] Error detecting state format:', error);
      return null;
    }
  }
  
  /**
   * Apply state-specific parsing rules
   */
  private async applyStateSpecificParsing(data: any[], stateCode: string): Promise<any[]> {
    const stateFormat = STATE_FORMATS[stateCode];
    if (!stateFormat) return data;
    
    return data.map(row => {
      const parsed = { ...row };
      
      // Apply date format conversion if needed
      if (stateFormat.dateFormat && row.filingDate) {
        parsed.filingDate = this.parseDate(row.filingDate, stateFormat.dateFormat);
      }
      
      // Apply filing number validation
      if (stateFormat.filingNumberPattern && row.fileNumber) {
        const pattern = new RegExp(stateFormat.filingNumberPattern);
        if (!pattern.test(row.fileNumber)) {
          parsed.fileNumberValid = false;
        }
      }
      
      // Apply collateral code mapping
      if (stateFormat.collateralCodes && row.collateralCode) {
        parsed.collateralDescription = 
          stateFormat.collateralCodes[row.collateralCode as keyof typeof stateFormat.collateralCodes] || 
          row.collateralDescription;
      }
      
      return parsed;
    });
  }
  
  /**
   * Parse date according to state format
   */
  private parseDate(dateStr: string, format: string): Date {
    // Simple date parsing - in production, use a proper date library
    const parts = dateStr.split(/[\/\-\.]/);
    
    if (format === 'DD/MM/YYYY' && parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    } else if (format === 'MM/DD/YYYY' && parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
    
    return new Date(dateStr);
  }
  
  /**
   * Analyze UCC filings for business intelligence
   */
  async analyzeFilings(filings: any[], leadId?: string): Promise<UccIntelligenceAnalysis> {
    // Prepare filing data for AI analysis
    const filingsSummary = filings.slice(0, 20).map(f => ({
      debtor: f.debtorName,
      secured: f.securedParty,
      date: f.filingDate,
      type: f.filingType,
      collateral: f.collateralDescription?.substring(0, 100),
      amount: f.loanAmount,
    }));
    
    const prompt = `
      Analyze these UCC filings for business intelligence.
      
      Filings:
      ${JSON.stringify(filingsSummary, null, 2)}
      
      Provide analysis including:
      1. Debt stacking score (0-100): Multiple recent filings indicate stacking
      2. Refinancing probability (0-1): Look for terminations followed by new filings
      3. Business growth indicator: 'growing', 'stable', or 'declining'
      4. Risk level: 'low', 'moderate', 'high', or 'critical'
      5. Estimated total debt: Sum of all active filings
      6. MCA approval likelihood (0-1): Based on filing patterns
      7. Business health score (0-100): Overall assessment
      8. Financing type: 'equipment', 'working_capital', 'real_estate', or 'mixed'
      9. Industry-specific insights: Array of observations
      10. Patterns identified: Array of patterns found
      11. Anomalies detected: Array of unusual findings
      12. Recommendations: Array of actionable recommendations
      13. Warning flags: Array of risk warnings
      14. Entity relationships: Identified business connections
      15. Ownership structure: Inferred ownership patterns
      16. Lender network: Network of secured parties
      
      Return as JSON with structure matching UccIntelligenceAnalysis interface.
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are a UCC filing analyst expert. Analyze UCC filings for business intelligence, risk assessment, and MCA approval likelihood.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      
      const aiAnalysis = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        leadId,
        filingData: filings,
        businessIntelligence: {
          debtStackingScore: aiAnalysis.debtStackingScore || 0,
          refinancingProbability: aiAnalysis.refinancingProbability || 0,
          businessGrowthIndicator: aiAnalysis.businessGrowthIndicator || 'stable',
          riskLevel: aiAnalysis.riskLevel || 'moderate',
          estimatedTotalDebt: aiAnalysis.estimatedTotalDebt || 0,
          mcaApprovalLikelihood: aiAnalysis.mcaApprovalLikelihood || 0.5,
          businessHealthScore: aiAnalysis.businessHealthScore || 50,
        },
        insights: {
          financingType: aiAnalysis.financingType || 'mixed',
          industrySpecific: aiAnalysis.industryInsights || [],
          patterns: aiAnalysis.patterns || [],
          anomalies: aiAnalysis.anomalies || [],
          recommendations: aiAnalysis.recommendations || [],
          warningFlags: aiAnalysis.warningFlags || [],
        },
        relationships: {
          entities: aiAnalysis.entityRelationships || [],
          ownership: aiAnalysis.ownershipStructure || [],
          lenderNetwork: aiAnalysis.lenderNetwork || [],
        },
        confidence: {
          analysisConfidence: aiAnalysis.confidence || 75,
          dataQuality: aiAnalysis.dataQuality || 80,
        },
      };
    } catch (error) {
      console.error('[UccIntelligence] Error analyzing filings with AI:', error);
      
      // Fallback to basic analysis
      return this.basicAnalysis(filings, leadId);
    }
  }
  
  /**
   * Basic analysis fallback when AI is unavailable
   */
  private basicAnalysis(filings: any[], leadId?: string): UccIntelligenceAnalysis {
    const recentFilings = filings.filter(f => {
      const date = new Date(f.filingDate);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return date > sixMonthsAgo;
    });
    
    const debtStackingScore = Math.min(100, recentFilings.length * 20);
    const totalDebt = filings.reduce((sum, f) => sum + (parseFloat(f.loanAmount) || 0), 0);
    
    return {
      leadId,
      filingData: filings,
      businessIntelligence: {
        debtStackingScore,
        refinancingProbability: 0.3,
        businessGrowthIndicator: 'stable',
        riskLevel: debtStackingScore > 60 ? 'high' : 'moderate',
        estimatedTotalDebt: totalDebt,
        mcaApprovalLikelihood: debtStackingScore < 60 ? 0.7 : 0.3,
        businessHealthScore: Math.max(0, 100 - debtStackingScore),
      },
      insights: {
        financingType: 'mixed',
        industrySpecific: [],
        patterns: recentFilings.length > 3 ? ['Multiple recent filings detected'] : [],
        anomalies: [],
        recommendations: debtStackingScore > 60 ? 
          ['High debt stacking detected - proceed with caution'] : 
          ['Moderate debt load - standard underwriting recommended'],
        warningFlags: debtStackingScore > 80 ? ['Critical debt stacking risk'] : [],
      },
      relationships: {
        entities: [],
        ownership: [],
        lenderNetwork: [],
      },
      confidence: {
        analysisConfidence: 50,
        dataQuality: 70,
      },
    };
  }
  
  /**
   * Save analysis to database
   */
  private async saveAnalysis(leadId: string, analysis: UccIntelligenceAnalysis): Promise<void> {
    try {
      await db.insert(uccIntelligence).values({
        leadId,
        aiAnalysis: analysis,
        debtStackingScore: analysis.businessIntelligence.debtStackingScore,
        refinancingProbability: analysis.businessIntelligence.refinancingProbability.toString(),
        businessGrowthIndicator: analysis.businessIntelligence.businessGrowthIndicator,
        riskLevel: analysis.businessIntelligence.riskLevel,
        estimatedTotalDebt: analysis.businessIntelligence.estimatedTotalDebt.toString(),
        mcaApprovalLikelihood: analysis.businessIntelligence.mcaApprovalLikelihood.toString(),
        businessHealthScore: analysis.businessIntelligence.businessHealthScore,
        financingType: analysis.insights.financingType,
        industryInsights: analysis.insights.industrySpecific,
        entityRelationships: analysis.relationships.entities,
        ownershipStructure: analysis.relationships.ownership,
        lenderNetwork: analysis.relationships.lenderNetwork,
        filingPatterns: analysis.insights.patterns,
        anomalies: analysis.insights.anomalies,
        analysisConfidence: analysis.confidence.analysisConfidence.toString(),
        dataQualityScore: analysis.confidence.dataQuality.toString(),
        recommendations: analysis.insights.recommendations,
        warningFlags: analysis.insights.warningFlags,
      });
    } catch (error) {
      console.error('[UccIntelligence] Error saving analysis:', error);
    }
  }
  
  /**
   * Match leads through UCC filing relationships
   */
  async matchLeads(leadId: string): Promise<UccRelationship[]> {
    try {
      // Get lead's UCC filings
      const leadFilings = await db.select()
        .from(uccFilings)
        .where(eq(uccFilings.leadId, leadId));
      
      if (leadFilings.length === 0) {
        return [];
      }
      
      // Find related filings through various criteria
      const relationships: UccRelationship[] = [];
      
      // 1. Match by filing numbers
      for (const filing of leadFilings) {
        const relatedByNumber = await db.select()
          .from(uccFilings)
          .where(and(
            eq(uccFilings.fileNumber, filing.fileNumber),
            sql`${uccFilings.leadId} != ${leadId}`
          ));
        
        for (const related of relatedByNumber) {
          if (related.leadId) {
            relationships.push(await this.createRelationship(
              leadId,
              related.leadId,
              'same_filing',
              90,
              { filingNumber: filing.fileNumber }
            ));
          }
        }
      }
      
      // 2. Match by secured party
      const securedParties = [...new Set(leadFilings.map(f => f.securedParty))];
      for (const party of securedParties) {
        const relatedByLender = await db.select()
          .from(uccFilings)
          .where(and(
            eq(uccFilings.securedParty, party),
            sql`${uccFilings.leadId} != ${leadId}`
          ));
        
        for (const related of relatedByLender) {
          if (related.leadId) {
            relationships.push(await this.createRelationship(
              leadId,
              related.leadId,
              'shared_lender',
              75,
              { lenderName: party }
            ));
          }
        }
      }
      
      // 3. Use AI for fuzzy matching and pattern detection
      const aiRelationships = await this.findAIRelationships(leadId, leadFilings);
      relationships.push(...aiRelationships);
      
      // Remove duplicates and save to database
      const uniqueRelationships = this.deduplicateRelationships(relationships);
      await this.saveRelationships(uniqueRelationships);
      
      return uniqueRelationships;
    } catch (error) {
      console.error('[UccIntelligence] Error matching leads:', error);
      return [];
    }
  }
  
  /**
   * Find relationships using AI pattern matching
   */
  private async findAIRelationships(leadId: string, filings: UccFiling[]): Promise<UccRelationship[]> {
    // Get sample of other leads for comparison
    const otherLeads = await db.select()
      .from(leads)
      .where(sql`${leads.id} != ${leadId}`)
      .limit(100);
    
    const prompt = `
      Find potential relationships between these UCC filings and other leads.
      
      Target Lead Filings:
      ${JSON.stringify(filings.slice(0, 5).map(f => ({
        debtor: f.debtorName,
        secured: f.securedParty,
        collateral: f.collateralDescription?.substring(0, 100),
      })), null, 2)}
      
      Compare with these leads:
      ${JSON.stringify(otherLeads.slice(0, 20).map(l => ({
        id: l.id,
        name: l.businessName,
        owner: l.ownerName,
        industry: l.industry,
      })), null, 2)}
      
      Look for:
      - Similar business names (fuzzy matching)
      - Same owners or principals
      - Parent-subsidiary relationships
      - Industry connections
      - Geographic proximity
      
      Return matches with confidence scores as:
      {
        "matches": [
          {
            "leadId": "xxx",
            "relationshipType": "type",
            "confidence": 0-100,
            "reason": "explanation"
          }
        ]
      }
    `;
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "You are an expert at identifying business relationships through UCC filing analysis.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      
      const result = JSON.parse(response.choices[0].message.content || "{}");
      const relationships: UccRelationship[] = [];
      
      for (const match of result.matches || []) {
        relationships.push(await this.createRelationship(
          leadId,
          match.leadId,
          match.relationshipType,
          match.confidence,
          { reason: match.reason }
        ));
      }
      
      return relationships;
    } catch (error) {
      console.error('[UccIntelligence] Error finding AI relationships:', error);
      return [];
    }
  }
  
  /**
   * Create a relationship object
   */
  private async createRelationship(
    leadIdA: string,
    leadIdB: string,
    type: string,
    confidence: number,
    metadata: any
  ): Promise<UccRelationship> {
    return {
      id: crypto.randomUUID(),
      leadIdA,
      leadIdB,
      relationshipType: type,
      relationshipStrength: confidence.toString(),
      matchingCriteria: metadata,
      confidenceScore: confidence.toString(),
      commonFilings: [],
      commonLenders: [],
      businessRelationship: null,
      riskPropagation: (confidence * 0.5).toString(),
      graphDistance: 1,
      clusterGroup: null,
      discoveredBy: 'ai_inference',
      discoveredAt: new Date(),
      lastVerifiedAt: null,
      createdAt: new Date(),
    };
  }
  
  /**
   * Deduplicate relationships
   */
  private deduplicateRelationships(relationships: UccRelationship[]): UccRelationship[] {
    const seen = new Set<string>();
    return relationships.filter(r => {
      const key = `${r.leadIdA}-${r.leadIdB}-${r.relationshipType}`;
      const reverseKey = `${r.leadIdB}-${r.leadIdA}-${r.relationshipType}`;
      
      if (seen.has(key) || seen.has(reverseKey)) {
        return false;
      }
      
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Save relationships to database
   */
  private async saveRelationships(relationships: UccRelationship[]): Promise<void> {
    for (const rel of relationships) {
      try {
        await db.insert(uccRelationships).values({
          leadIdA: rel.leadIdA,
          leadIdB: rel.leadIdB,
          relationshipType: rel.relationshipType,
          relationshipStrength: rel.relationshipStrength,
          matchingCriteria: rel.matchingCriteria,
          confidenceScore: rel.confidenceScore,
          commonFilings: rel.commonFilings,
          commonLenders: rel.commonLenders,
          businessRelationship: rel.businessRelationship,
          riskPropagation: rel.riskPropagation,
          graphDistance: rel.graphDistance,
          clusterGroup: rel.clusterGroup,
          discoveredBy: rel.discoveredBy,
          lastVerifiedAt: rel.lastVerifiedAt,
        });
      } catch (error) {
        console.error('[UccIntelligence] Error saving relationship:', error);
      }
    }
  }
  
  /**
   * Get relationship graph for a lead
   */
  async getRelationshipGraph(leadId: string): Promise<RelationshipGraph> {
    try {
      // Get all relationships for this lead
      const relationships = await db.select()
        .from(uccRelationships)
        .where(or(
          eq(uccRelationships.leadIdA, leadId),
          eq(uccRelationships.leadIdB, leadId)
        ));
      
      // Build graph nodes and edges
      const nodes = new Map<string, any>();
      const edges: any[] = [];
      
      // Add the main lead as a node
      const mainLead = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);
      
      if (mainLead.length > 0) {
        nodes.set(leadId, {
          id: leadId,
          type: 'lead',
          name: mainLead[0].businessName,
          metadata: {
            owner: mainLead[0].ownerName,
            industry: mainLead[0].industry,
          },
        });
      }
      
      // Process relationships
      for (const rel of relationships) {
        const otherId = rel.leadIdA === leadId ? rel.leadIdB : rel.leadIdA;
        
        // Add connected lead as node
        if (!nodes.has(otherId)) {
          const otherLead = await db.select()
            .from(leads)
            .where(eq(leads.id, otherId))
            .limit(1);
          
          if (otherLead.length > 0) {
            nodes.set(otherId, {
              id: otherId,
              type: 'lead',
              name: otherLead[0].businessName,
              metadata: {
                owner: otherLead[0].ownerName,
                industry: otherLead[0].industry,
              },
            });
          }
        }
        
        // Add edge
        edges.push({
          source: leadId,
          target: otherId,
          type: rel.relationshipType,
          strength: parseFloat(rel.relationshipStrength || '0'),
          metadata: rel.matchingCriteria,
        });
      }
      
      // Identify clusters
      const clusters = this.identifyClusters(Array.from(nodes.values()), edges);
      
      return {
        nodes: Array.from(nodes.values()),
        edges,
        clusters,
      };
    } catch (error) {
      console.error('[UccIntelligence] Error building relationship graph:', error);
      return {
        nodes: [],
        edges: [],
        clusters: [],
      };
    }
  }
  
  /**
   * Identify clusters in the relationship graph
   */
  private identifyClusters(nodes: any[], edges: any[]): any[] {
    // Simple clustering based on connectivity
    const clusters: any[] = [];
    const visited = new Set<string>();
    
    for (const node of nodes) {
      if (visited.has(node.id)) continue;
      
      const cluster = {
        id: crypto.randomUUID(),
        members: [] as string[],
        centerNode: node.id,
        riskLevel: 0,
      };
      
      // BFS to find connected nodes
      const queue = [node.id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        
        visited.add(current);
        cluster.members.push(current);
        
        // Find connected nodes
        for (const edge of edges) {
          if (edge.source === current && !visited.has(edge.target)) {
            queue.push(edge.target);
          } else if (edge.target === current && !visited.has(edge.source)) {
            queue.push(edge.source);
          }
        }
      }
      
      if (cluster.members.length > 1) {
        // Calculate cluster risk based on relationships
        cluster.riskLevel = Math.min(100, cluster.members.length * 15);
        clusters.push(cluster);
      }
    }
    
    return clusters;
  }
  
  /**
   * Get AI-generated insights for a lead
   */
  async getInsights(leadId: string): Promise<any> {
    try {
      // Get existing analysis
      const analysis = await db.select()
        .from(uccIntelligence)
        .where(eq(uccIntelligence.leadId, leadId))
        .orderBy(desc(uccIntelligence.analyzedAt))
        .limit(1);
      
      if (analysis.length === 0) {
        return {
          hasAnalysis: false,
          message: "No UCC analysis available for this lead",
        };
      }
      
      const data = analysis[0];
      
      return {
        hasAnalysis: true,
        businessIntelligence: {
          debtStackingScore: data.debtStackingScore,
          refinancingProbability: parseFloat(data.refinancingProbability || '0'),
          businessGrowthIndicator: data.businessGrowthIndicator,
          riskLevel: data.riskLevel,
          estimatedTotalDebt: parseFloat(data.estimatedTotalDebt || '0'),
          mcaApprovalLikelihood: parseFloat(data.mcaApprovalLikelihood || '0'),
          businessHealthScore: data.businessHealthScore,
        },
        insights: {
          financingType: data.financingType,
          industrySpecific: data.industryInsights || [],
          patterns: data.filingPatterns || [],
          anomalies: data.anomalies || [],
          recommendations: data.recommendations || [],
          warningFlags: data.warningFlags || [],
        },
        confidence: {
          analysisConfidence: parseFloat(data.analysisConfidence || '0'),
          dataQuality: parseFloat(data.dataQualityScore || '0'),
        },
        analyzedAt: data.analyzedAt,
      };
    } catch (error) {
      console.error('[UccIntelligence] Error getting insights:', error);
      throw error;
    }
  }
  
  /**
   * Integrate UCC intelligence with lead scoring
   */
  async updateLeadScore(leadId: string): Promise<void> {
    try {
      const insights = await this.getInsights(leadId);
      
      if (!insights.hasAnalysis) return;
      
      // Calculate UCC-based risk adjustment
      const uccRiskFactor = 
        (100 - insights.businessIntelligence.debtStackingScore) * 0.3 +
        insights.businessIntelligence.businessHealthScore * 0.3 +
        insights.businessIntelligence.mcaApprovalLikelihood * 100 * 0.4;
      
      // Update lead intelligence score with UCC factors
      const lead = await db.select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1);
      
      if (lead.length > 0) {
        await leadIntelligenceService.calculateIntelligenceScore(lead[0], false);
      }
    } catch (error) {
      console.error('[UccIntelligence] Error updating lead score:', error);
    }
  }
}

// Export singleton instance
export const uccIntelligenceService = new UccIntelligenceService();