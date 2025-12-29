import { db } from "../db";
import { leads, purchases } from "@shared/schema";
import type { Lead, Purchase } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import Papa from "papaparse";

export interface ExportOptions {
  format: 'csv' | 'salesforce' | 'hubspot' | 'json';
  includeEnrichment: boolean;
  includeVerification: boolean;
  includeUccData: boolean;
  includeScoring: boolean;
  includeInsights: boolean;
}

export interface ExportResult {
  format: string;
  data: string | object;
  fileName: string;
  mimeType: string;
  recordCount: number;
}

export class CrmExportService {
  /**
   * Export leads in specified format
   */
  async exportLeads(leadIds: string[], options: ExportOptions): Promise<ExportResult> {
    // Fetch leads from database
    const leadList = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, leadIds));

    if (leadList.length === 0) {
      throw new Error('No leads found to export');
    }

    // Transform leads based on format
    switch (options.format) {
      case 'csv':
        return this.exportAsCsv(leadList, options);
      case 'salesforce':
        return this.exportForSalesforce(leadList, options);
      case 'hubspot':
        return this.exportForHubspot(leadList, options);
      case 'json':
        return this.exportAsJson(leadList, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export as CSV
   */
  private async exportAsCsv(leadList: Lead[], options: ExportOptions): Promise<ExportResult> {
    const records = leadList.map(lead => this.transformLeadForCsv(lead, options));
    
    const csv = Papa.unparse(records, {
      header: true,
      skipEmptyLines: true
    });

    return {
      format: 'csv',
      data: csv,
      fileName: `leads_export_${Date.now()}.csv`,
      mimeType: 'text/csv',
      recordCount: leadList.length
    };
  }

  /**
   * Export for Salesforce
   */
  private async exportForSalesforce(leadList: Lead[], options: ExportOptions): Promise<ExportResult> {
    const records = leadList.map(lead => this.transformLeadForSalesforce(lead, options));
    
    const csv = Papa.unparse(records, {
      header: true,
      skipEmptyLines: true
    });

    return {
      format: 'salesforce',
      data: csv,
      fileName: `salesforce_leads_${Date.now()}.csv`,
      mimeType: 'text/csv',
      recordCount: leadList.length
    };
  }

  /**
   * Export for HubSpot
   */
  private async exportForHubspot(leadList: Lead[], options: ExportOptions): Promise<ExportResult> {
    const records = leadList.map(lead => this.transformLeadForHubspot(lead, options));
    
    const csv = Papa.unparse(records, {
      header: true,
      skipEmptyLines: true
    });

    return {
      format: 'hubspot',
      data: csv,
      fileName: `hubspot_contacts_${Date.now()}.csv`,
      mimeType: 'text/csv',
      recordCount: leadList.length
    };
  }

  /**
   * Export as JSON
   */
  private async exportAsJson(leadList: Lead[], options: ExportOptions): Promise<ExportResult> {
    const records = leadList.map(lead => this.transformLeadForJson(lead, options));
    
    return {
      format: 'json',
      data: JSON.stringify(records, null, 2),
      fileName: `leads_export_${Date.now()}.json`,
      mimeType: 'application/json',
      recordCount: leadList.length
    };
  }

  /**
   * Transform lead for CSV export
   */
  private transformLeadForCsv(lead: Lead, options: ExportOptions): any {
    const record: any = {
      'Lead ID': lead.id,
      'Business Name': lead.businessName,
      'Owner Name': lead.ownerName,
      'Email': lead.email,
      'Phone': lead.phone,
      'Secondary Phone': lead.secondaryPhone || '',
      'Industry': lead.industry || '',
      'Annual Revenue': lead.annualRevenue || '',
      'Requested Amount': lead.requestedAmount || '',
      'Time in Business': lead.timeInBusiness || '',
      'Credit Score': lead.creditScore || '',
      'State': lead.stateCode || '',
      'City': lead.city || '',
      'Address': lead.fullAddress || '',
      'Urgency Level': lead.urgencyLevel || '',
      'Previous MCA History': lead.previousMCAHistory || '',
      'Created Date': lead.createdAt ? new Date(lead.createdAt).toISOString() : ''
    };

    if (options.includeEnrichment) {
      record['Website'] = lead.websiteUrl || '';
      record['LinkedIn'] = lead.linkedinUrl || '';
      record['Company Size'] = lead.companySize || '';
      record['Employee Count'] = lead.employeeCount || '';
      record['Year Founded'] = lead.yearFounded || '';
      record['Business Description'] = lead.businessDescription || '';
      record['NAICS Code'] = lead.naicsCode || '';
      record['Estimated Revenue'] = lead.estimatedRevenue || '';
      record['Revenue Confidence'] = lead.revenueConfidence || '';
    }

    if (options.includeVerification) {
      record['Email Verification Score'] = lead.emailVerificationScore || 0;
      record['Phone Verification Score'] = lead.phoneVerificationScore || 0;
      record['Name Verification Score'] = lead.nameVerificationScore || 0;
      record['Overall Verification Score'] = lead.overallVerificationScore || 0;
      record['Verification Status'] = lead.verificationStatus || 'unverified';
    }

    if (options.includeUccData) {
      record['Total UCC Debt'] = lead.totalUccDebt ? Number(lead.totalUccDebt) : 0;
      record['Active UCC Count'] = lead.activeUccCount || 0;
      record['UCC Risk Level'] = lead.uccRiskLevel || '';
      record['Last UCC Filing Date'] = lead.lastUccFilingDate ? new Date(lead.lastUccFilingDate).toISOString() : '';
      record['UCC Match Confidence'] = lead.uccMatchConfidence || 0;
    }

    if (options.includeScoring) {
      record['Unified Lead Score'] = lead.unifiedLeadScore || 0;
      record['Lead Score Category'] = lead.leadScoreCategory || '';
      record['Quality Score'] = lead.qualityScore || 0;
      record['Freshness Score'] = lead.freshnessScore || 0;
      record['ML Quality Score'] = lead.mlQualityScore || 0;
      record['Conversion Probability'] = lead.conversionProbability ? Number(lead.conversionProbability) : 0;
      record['Expected Deal Size'] = lead.expectedDealSize ? Number(lead.expectedDealSize) : 0;
    }

    if (options.includeInsights) {
      const insights = lead.leadInsights as any[];
      if (insights && insights.length > 0) {
        record['Top Insights'] = insights.slice(0, 3).map(i => i.label).join('; ');
        record['Insight Tags'] = lead.insightTags ? lead.insightTags.join('; ') : '';
      }
    }

    return record;
  }

  /**
   * Transform lead for Salesforce
   */
  private transformLeadForSalesforce(lead: Lead, options: ExportOptions): any {
    const record: any = {
      'FirstName': this.extractFirstName(lead.ownerName),
      'LastName': this.extractLastName(lead.ownerName),
      'Company': lead.businessName,
      'Email': lead.email,
      'Phone': lead.phone,
      'MobilePhone': lead.secondaryPhone || '',
      'Industry': lead.industry || '',
      'AnnualRevenue': this.parseRevenueNumber(lead.annualRevenue),
      'NumberOfEmployees': lead.employeeCount || '',
      'Website': lead.websiteUrl || '',
      'Street': lead.fullAddress || '',
      'City': lead.city || '',
      'State': lead.stateCode || '',
      'LeadSource': 'MCA Lead Import',
      'Status': this.getSalesforceStatus(lead),
      'Rating': this.getSalesforceRating(lead),
      'Description': this.generateSalesforceDescription(lead, options)
    };

    // Add custom fields for additional data
    if (options.includeScoring) {
      record['Lead_Score__c'] = lead.unifiedLeadScore || 0;
      record['Verification_Score__c'] = lead.overallVerificationScore || 0;
      record['Conversion_Probability__c'] = lead.conversionProbability ? Number(lead.conversionProbability) * 100 : 0;
    }

    if (options.includeUccData) {
      record['UCC_Risk_Level__c'] = lead.uccRiskLevel || '';
      record['Active_UCC_Count__c'] = lead.activeUccCount || 0;
      record['Total_UCC_Debt__c'] = lead.totalUccDebt ? Number(lead.totalUccDebt) : 0;
    }

    return record;
  }

  /**
   * Transform lead for HubSpot
   */
  private transformLeadForHubspot(lead: Lead, options: ExportOptions): any {
    const record: any = {
      'First Name': this.extractFirstName(lead.ownerName),
      'Last Name': this.extractLastName(lead.ownerName),
      'Email': lead.email,
      'Phone Number': lead.phone,
      'Mobile Phone Number': lead.secondaryPhone || '',
      'Company Name': lead.businessName,
      'Industry': lead.industry || '',
      'Annual Revenue': this.parseRevenueNumber(lead.annualRevenue),
      'Number of Employees': lead.employeeCount || '',
      'Website URL': lead.websiteUrl || '',
      'Street Address': lead.fullAddress || '',
      'City': lead.city || '',
      'State/Region': lead.stateCode || '',
      'Lead Status': this.getHubspotStatus(lead),
      'Lifecycle Stage': 'lead',
      'Contact Owner': 'MCA Import',
      'Create Date': lead.createdAt ? new Date(lead.createdAt).toISOString() : ''
    };

    // Add custom properties
    if (options.includeScoring) {
      record['lead_score'] = lead.unifiedLeadScore || 0;
      record['verification_score'] = lead.overallVerificationScore || 0;
      record['quality_score'] = lead.qualityScore || 0;
    }

    if (options.includeUccData) {
      record['ucc_risk_level'] = lead.uccRiskLevel || '';
      record['active_ucc_filings'] = lead.activeUccCount || 0;
    }

    if (options.includeInsights) {
      const insights = lead.leadInsights as any[];
      if (insights && insights.length > 0) {
        record['lead_insights'] = insights.slice(0, 3).map(i => i.label).join('; ');
      }
    }

    return record;
  }

  /**
   * Transform lead for JSON export
   */
  private transformLeadForJson(lead: Lead, options: ExportOptions): any {
    const record: any = {
      id: lead.id,
      business: {
        name: lead.businessName,
        industry: lead.industry,
        yearFounded: lead.yearFounded,
        timeInBusiness: lead.timeInBusiness,
        employeeCount: lead.employeeCount,
        companySize: lead.companySize,
        description: lead.businessDescription,
        naicsCode: lead.naicsCode
      },
      contact: {
        ownerName: lead.ownerName,
        email: lead.email,
        phone: lead.phone,
        secondaryPhone: lead.secondaryPhone,
        website: lead.websiteUrl,
        linkedin: lead.linkedinUrl
      },
      location: {
        address: lead.fullAddress,
        city: lead.city,
        state: lead.stateCode
      },
      financial: {
        annualRevenue: lead.annualRevenue,
        estimatedRevenue: lead.estimatedRevenue,
        revenueConfidence: lead.revenueConfidence,
        requestedAmount: lead.requestedAmount,
        creditScore: lead.creditScore
      },
      mca: {
        urgencyLevel: lead.urgencyLevel,
        previousHistory: lead.previousMCAHistory,
        dailyBankDeposits: lead.dailyBankDeposits
      },
      metadata: {
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        leadAge: lead.leadAge,
        freshnessScore: lead.freshnessScore
      }
    };

    if (options.includeVerification) {
      record.verification = {
        email: lead.emailVerificationScore,
        phone: lead.phoneVerificationScore,
        businessName: lead.nameVerificationScore,
        overall: lead.overallVerificationScore,
        status: lead.verificationStatus
      };
    }

    if (options.includeUccData) {
      record.ucc = {
        totalDebt: lead.totalUccDebt ? Number(lead.totalUccDebt) : null,
        activeCount: lead.activeUccCount,
        riskLevel: lead.uccRiskLevel,
        lastFilingDate: lead.lastUccFilingDate,
        matchConfidence: lead.uccMatchConfidence
      };
    }

    if (options.includeScoring) {
      record.scoring = {
        unifiedScore: lead.unifiedLeadScore,
        category: lead.leadScoreCategory,
        qualityScore: lead.qualityScore,
        mlQualityScore: lead.mlQualityScore,
        conversionProbability: lead.conversionProbability ? Number(lead.conversionProbability) : null,
        expectedDealSize: lead.expectedDealSize ? Number(lead.expectedDealSize) : null
      };
    }

    if (options.includeInsights) {
      record.insights = lead.leadInsights || [];
      record.tags = lead.insightTags || [];
    }

    return record;
  }

  // Helper methods
  private extractFirstName(fullName: string): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts[0] || '';
  }

  private extractLastName(fullName: string): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    return parts.slice(1).join(' ') || parts[0] || '';
  }

  private parseRevenueNumber(revenue: string | null): number | null {
    if (!revenue) return null;
    const cleaned = revenue.replace(/[^0-9.]/g, '');
    const value = parseFloat(cleaned);
    
    if (revenue.toLowerCase().includes('k')) {
      return value * 1000;
    }
    if (revenue.toLowerCase().includes('m')) {
      return value * 1000000;
    }
    
    return value || null;
  }

  private getSalesforceStatus(lead: Lead): string {
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 80) {
      return 'Working - Contacted';
    }
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 60) {
      return 'Open - Not Contacted';
    }
    return 'New';
  }

  private getSalesforceRating(lead: Lead): string {
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 80) {
      return 'Hot';
    }
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 60) {
      return 'Warm';
    }
    return 'Cold';
  }

  private getHubspotStatus(lead: Lead): string {
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 80) {
      return 'In Progress';
    }
    if (lead.unifiedLeadScore && lead.unifiedLeadScore >= 60) {
      return 'Open';
    }
    return 'New';
  }

  private generateSalesforceDescription(lead: Lead, options: ExportOptions): string {
    const parts: string[] = ['MCA lead imported from platform.'];
    
    if (lead.urgencyLevel) {
      parts.push(`Urgency: ${lead.urgencyLevel}.`);
    }
    
    if (lead.previousMCAHistory && lead.previousMCAHistory !== 'none') {
      parts.push(`Previous MCA history: ${lead.previousMCAHistory}.`);
    }
    
    if (options.includeInsights && lead.leadInsights) {
      const insights = lead.leadInsights as any[];
      if (insights && insights.length > 0) {
        const topInsights = insights.slice(0, 3).map(i => i.label);
        parts.push(`Key insights: ${topInsights.join(', ')}.`);
      }
    }
    
    return parts.join(' ');
  }

  /**
   * Track export in database
   */
  async trackExport(userId: string, leadIds: string[], format: string): Promise<void> {
    // Update lead export tracking
    await db
      .update(leads)
      .set({
        crmExportCount: sql`${leads.crmExportCount} + 1`,
        lastCrmExportAt: new Date(),
        crmExportHistory: sql`
          COALESCE(${leads.crmExportHistory}, '[]'::jsonb) || 
          jsonb_build_array(jsonb_build_object(
            'userId', ${userId},
            'format', ${format},
            'exportedAt', ${new Date().toISOString()},
            'leadCount', ${leadIds.length}
          ))
        `,
        updatedAt: new Date()
      })
      .where(inArray(leads.id, leadIds));
  }
}

export const crmExportService = new CrmExportService();