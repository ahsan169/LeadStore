/**
 * SeamlessAI Real API Integration
 * Based on official SeamlessAI API documentation
 */

interface SeamlessContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  seniority?: string;
  department?: string;
  email?: string;
  phone?: string;
  // Phone numbers from research (these are the actual fields from SeamlessAI research API)
  contactPhone1?: string;
  contactPhone1TotalAI?: string;
  contactPhone2?: string;
  contactPhone3?: string;
  companyPhone1?: string;
  companyPhone2?: string;
  companyPhone3?: string;
  company?: string;
  companyCity?: string;
  companyState?: string;
  companyFoundedOn?: string;
  domain?: string;
  companyLIProfileUrl?: string;
  employeeSizeRange?: string;
  industries?: string[];
  liUrl?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  lastModifiedAt?: string;
  // Additional fields from research results
  [key: string]: any;
}

interface SeamlessSearchResponse {
  data: SeamlessContact[];
  nextToken?: string;
  total?: number;
}

interface CompanyEnrichmentResult {
  businessName: string;
  ownerName?: string;
  email?: string;
  phone?: string;
  industry?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  employeeCount?: number;
  annualRevenue?: number;
  description?: string;
  founded?: number;
  linkedinUrl?: string;
  socialMedia?: {
    twitter?: string;
    facebook?: string;
    linkedin?: string;
  };
  confidence: number;
  sources: string[];
  executives?: Array<{
    name: string;
    title: string;
    email?: string;
    phone?: string;
    linkedin?: string;
  }>;
}

export class SeamlessAIService {
  private baseUrl = 'https://api.seamless.ai/api/client/v1';
  private apiKey: string;

  constructor(apiKey?: string) {
    // Get API key from parameter or environment variable
    this.apiKey = apiKey || process.env.SEAMLESS_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('[SeamlessAI] ⚠️  No API key configured. Set SEAMLESS_API_KEY environment variable.');
    } else {
      console.log('[SeamlessAI] ✅ API key configured');
    }
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Search for contacts by company name
   */
  async searchContactsByCompany(companyName: string, limit: number = 50): Promise<SeamlessSearchResponse> {
    if (!this.apiKey) {
      throw new Error('SeamlessAI API key not configured');
    }

    const url = `${this.baseUrl}/search/contacts`;
    const payload = {
      companyName: [companyName],
      limit,
      page: 1,
    };

    console.log(`[SeamlessAI] Searching contacts for: ${companyName}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Token': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SeamlessAI] API Error (${response.status}):`, errorText);
        throw new Error(`SeamlessAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[SeamlessAI] Found ${data.data?.length || 0} contacts`);
      
      return data;
    } catch (error: any) {
      console.error('[SeamlessAI] Error:', error.message);
      throw error;
    }
  }

  /**
   * Search for companies
   */
  async searchCompanies(companyName: string, filters?: {
    industry?: string;
    location?: string;
  }): Promise<CompanyEnrichmentResult[]> {
    if (!this.apiKey) {
      throw new Error('SeamlessAI API key not configured');
    }

    const url = `${this.baseUrl}/search/companies`;
    const payload: any = {
      companyName: [companyName],
      limit: 20,
      page: 1,
    };

    // Add filters if provided
    if (filters?.industry) {
      payload.industries = [filters.industry];
    }
    if (filters?.location) {
      payload.companyCity = [filters.location];
    }

    console.log(`[SeamlessAI] Searching companies for: ${companyName}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Token': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SeamlessAI] API Error (${response.status}):`, errorText);
        throw new Error(`SeamlessAI API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[SeamlessAI] Found ${data.data?.length || 0} companies`);

      // Convert to our format
      return this.convertCompaniesToEnrichmentResults(data.data || []);
    } catch (error: any) {
      console.error('[SeamlessAI] Error:', error.message);
      throw error;
    }
  }

  /**
   * Enrich a single company with full details
   */
  async enrichCompany(companyName: string, domain?: string): Promise<CompanyEnrichmentResult | null> {
    if (!this.apiKey) {
      console.log('[SeamlessAI] API not configured, returning null');
      return null;
    }

    try {
      // Search for contacts at this company to get detailed info
      const contactData = await this.searchContactsByCompany(companyName, 50);

      if (!contactData.data || contactData.data.length === 0) {
        console.log(`[SeamlessAI] No data found for: ${companyName}`);
        return null;
      }

      // Extract company and executive information
      const firstContact = contactData.data[0];
      
      // Log first contact to see what data is available
      console.log(`[SeamlessAI] Sample contact data:`, {
        name: firstContact.name,
        email: firstContact.email,
        phone: firstContact.phone,
        hasEmail: !!firstContact.email,
        hasPhone: !!firstContact.phone,
      });
      
      const executives = contactData.data
        .filter(c => c.title && (
          c.title.toLowerCase().includes('ceo') ||
          c.title.toLowerCase().includes('president') ||
          c.title.toLowerCase().includes('founder') ||
          c.title.toLowerCase().includes('owner') ||
          c.title.toLowerCase().includes('chief') ||
          c.seniority === 'c_suite'
        ))
        .map(c => ({
          name: c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim(),
          title: c.title || 'Executive',
          email: c.email,
          phone: c.phone,
          linkedin: c.liUrl,
        }));
      
      console.log(`[SeamlessAI] Executives with email/phone:`, 
        executives.filter(e => e.email || e.phone).length + '/' + executives.length);

      // Parse employee range
      const employeeRange = firstContact.employeeSizeRange || '';
      const employeeCount = this.parseEmployeeCount(employeeRange);

      const result: CompanyEnrichmentResult = {
        businessName: firstContact.company || companyName,
        ownerName: executives[0]?.name,
        email: executives[0]?.email || contactData.data[0]?.email,
        phone: contactData.data[0]?.phone,
        industry: firstContact.industries?.join(', '),
        website: firstContact.domain ? `https://${firstContact.domain}` : undefined,
        city: firstContact.companyCity,
        state: firstContact.companyState,
        employeeCount,
        founded: firstContact.companyFoundedOn ? parseInt(firstContact.companyFoundedOn) : undefined,
        linkedinUrl: firstContact.companyLIProfileUrl,
        description: `${firstContact.company} - ${firstContact.industries?.join(', ') || 'Company'}`,
        confidence: 95, // High confidence from real API
        sources: ['SeamlessAI', 'LiveData'],
        executives: executives.slice(0, 5), // Top 5 executives
        socialMedia: {
          linkedin: firstContact.companyLIProfileUrl,
        },
      };

      console.log(`[SeamlessAI] ✅ Enriched: ${result.businessName} (${executives.length} executives found)`);
      
      return result;
    } catch (error: any) {
      console.error(`[SeamlessAI] Error enriching ${companyName}:`, error.message);
      return null;
    }
  }

  /**
   * Convert SeamlessAI company data to our format
   */
  private convertCompaniesToEnrichmentResults(companies: any[]): CompanyEnrichmentResult[] {
    return companies.map(company => ({
      businessName: company.name || company.company || 'Unknown',
      ownerName: company.ceoName,
      email: company.email,
      phone: company.phone || company.phones,
      industry: Array.isArray(company.industries) ? company.industries.join(', ') : company.industries,
      website: company.domain ? `https://${company.domain}` : undefined,
      city: company.city || company.location?.city,
      state: company.state || company.location?.state,
      employeeCount: this.parseEmployeeCount(company.employeeSizeRange || company.staffCountRange),
      annualRevenue: this.parseRevenue(company.annualRevenue || company.revenueRange),
      founded: company.foundedOn ? parseInt(company.foundedOn) : undefined,
      linkedinUrl: company.linkedInProfileUrl,
      description: company.description,
      confidence: 90,
      sources: ['SeamlessAI'],
    }));
  }

  /**
   * Parse employee count from range string
   */
  private parseEmployeeCount(range: string): number | undefined {
    if (!range) return undefined;
    
    // Examples: "1-10", "51-200", "1000+"
    const match = range.match(/(\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }

  /**
   * Parse revenue from string
   */
  private parseRevenue(revenue: string | number): number | undefined {
    if (typeof revenue === 'number') return revenue;
    if (!revenue) return undefined;

    // Examples: "$1M-$10M", "1000000"
    const cleaned = revenue.replace(/[$,\s]/g, '');
    const match = cleaned.match(/(\d+)([MBK]?)/i);
    
    if (match) {
      let value = parseInt(match[1]);
      const unit = match[2]?.toUpperCase();
      
      if (unit === 'K') value *= 1000;
      else if (unit === 'M') value *= 1000000;
      else if (unit === 'B') value *= 1000000000;
      
      return value;
    }
    
    return undefined;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(data: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += size) {
      chunks.push(data.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Create research requests for search result IDs
   * This is the step that initiates phone number research
   */
  async createResearchRequests(searchResultIds: string[]): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error('SeamlessAI API key not configured');
    }

    const url = `${this.baseUrl}/contacts/research`;
    const researchIds: string[] = [];

    // Process in chunks of 10
    const chunks = this.chunkArray(searchResultIds, 10);

    console.log(`[SeamlessAI] Creating research requests for ${searchResultIds.length} IDs in ${chunks.length} chunks`);

    for (const chunk of chunks) {
      try {
        const payload = { searchResultIds: chunk };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Token': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status !== 202) {
          const errorText = await response.text();
          console.error(`[SeamlessAI] Research request failed (${response.status}):`, errorText);
          continue;
        }

        const result = await response.json();

        if (result.requestIds && Array.isArray(result.requestIds)) {
          researchIds.push(...result.requestIds);
          console.log(`[SeamlessAI] ✅ Research IDs received: ${result.requestIds.length}`);
        } else {
          console.warn(`[SeamlessAI] ⚠️ Unexpected research response:`, JSON.stringify(result, null, 2));
        }

        // Rate limiting - wait 5 seconds between chunks
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error: any) {
        console.error(`[SeamlessAI] Error creating research for chunk:`, error.message);
        continue;
      }
    }

    return researchIds;
  }

  /**
   * Poll research results until contacts are ready (with phone numbers)
   */
  async pollResearchResults(
    researchIds: string[],
    interval: number = 5000,
    maxAttempts: number = 20
  ): Promise<SeamlessContact[]> {
    if (!this.apiKey) {
      throw new Error('SeamlessAI API key not configured');
    }

    const url = `${this.baseUrl}/contacts/research/poll`;
    const remainingIds = new Set(researchIds);
    const completedResults: SeamlessContact[] = [];
    let attempt = 0;

    console.log(`[SeamlessAI] Polling ${researchIds.length} research requests...`);

    while (remainingIds.size > 0 && attempt < maxAttempts) {
      attempt++;
      console.log(`[SeamlessAI] ⏳ Poll attempt ${attempt} - Remaining: ${remainingIds.size}`);

      try {
        // Send remaining IDs as comma-separated query string
        const queryString = Array.from(remainingIds).join(',');
        const pollUrl = `${url}?requestIds=${queryString}`;

        const response = await fetch(pollUrl, {
          method: 'GET',
          headers: {
            'Token': this.apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (response.status !== 200) {
          const errorText = await response.text();
          console.error(`[SeamlessAI] Poll failed (${response.status}):`, errorText);
          break;
        }

        const result = await response.json();

        if (!result.success) {
          console.error(`[SeamlessAI] Poll response unsuccessful:`, JSON.stringify(result, null, 2));
          break;
        }

        // Process each item in the response
        for (const item of result.data || []) {
          const requestId = item.requestId;
          const status = (item.status || '').toLowerCase();
          const contact = item.contact;

          // Case 1: Error occurred
          if (status.includes('error')) {
            console.error(`[SeamlessAI] ❌ Error for ${requestId}: ${item.message || 'Unknown error'}`);
            remainingIds.delete(requestId);
            continue;
          }

          // Case 2: Duplicate - try to get initial request ID
          if (status.includes('duplicate')) {
            remainingIds.delete(requestId);
            const additionalData = item.additionalData || {};
            const initialRequestId = additionalData.initialRequestId;
            
            if (initialRequestId) {
              console.log(`[SeamlessAI] 🔄 Duplicate for ${requestId}, polling for initial request ID: ${initialRequestId}`);
              remainingIds.add(initialRequestId);
            } else {
              console.warn(`[SeamlessAI] ⚠️ Duplicate for ${requestId}:`, additionalData);
            }
            continue;
          }

          // Case 3: Completed successfully - contact is ready with phone number
          if (contact) {
            console.log(`[SeamlessAI] ✅ Completed: ${requestId}`);
            completedResults.push(contact);
            remainingIds.delete(requestId);
            continue;
          }

          // Case 4: Still processing
          console.log(`[SeamlessAI] ⌛ Still processing: ${requestId} (status: ${status})`);
        }

        // Wait before next poll if there are remaining IDs
        if (remainingIds.size > 0) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error: any) {
        console.error(`[SeamlessAI] Error polling:`, error.message);
        break;
      }
    }

    if (remainingIds.size > 0) {
      console.warn(`[SeamlessAI] ⚠️ Polling stopped before all jobs completed. Remaining: ${remainingIds.size}`);
    }

    console.log(`[SeamlessAI] 🎉 Completed ${completedResults.length} research results`);
    return completedResults;
  }

  /**
   * Full research flow: Search → Research → Poll → Get contacts with phone numbers
   * This is the complete flow from the Python script
   */
  async researchContactsWithPhones(companyName: string, limit: number = 10): Promise<SeamlessContact[]> {
    if (!this.apiKey) {
      throw new Error('SeamlessAI API key not configured');
    }

    console.log(`[SeamlessAI] 🔍 Starting full research flow for: ${companyName}`);

    // Step 1: Search contacts
    const searchResponse = await this.searchContactsByCompany(companyName, limit);
    
    if (!searchResponse.data || searchResponse.data.length === 0) {
      console.log(`[SeamlessAI] ❌ No contacts found for: ${companyName}`);
      return [];
    }

    // Extract search result IDs
    const searchResultIds = searchResponse.data
      .map(item => (item as any).searchResultId)
      .filter((id): id is string => !!id);

    if (searchResultIds.length === 0) {
      console.warn(`[SeamlessAI] ⚠️ No search result IDs found`);
      return [];
    }

    console.log(`[SeamlessAI] ✅ Found ${searchResultIds.length} search result IDs`);

    // Step 2: Create research requests
    const researchIds = await this.createResearchRequests(searchResultIds);

    if (researchIds.length === 0) {
      console.warn(`[SeamlessAI] ⚠️ No research IDs created`);
      return [];
    }

    console.log(`[SeamlessAI] 🚀 Research jobs created: ${researchIds.length}`);

    // Step 3: Poll for results (this is where phone numbers come from)
    const contacts = await this.pollResearchResults(researchIds);

    console.log(`[SeamlessAI] 📦 Final results: ${contacts.length} contacts with phone numbers`);

    return contacts;
  }
}

// Export singleton instance
export const seamlessAI = new SeamlessAIService();

