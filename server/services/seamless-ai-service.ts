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
  /** Estimated SeamlessAI-style usage for this operation (actual billing may vary by plan) */
  creditUsage?: SeamlessCreditUsage;
}

/** What we count so you can track spend; Seamless may bill differently per plan */
export interface SeamlessCreditUsage {
  contactSearches: number;
  researchRequests: number;
  /** Typical model: 1 per search + 1 per researched contact */
  estimatedCredits: number;
  note: string;
}

const CREDITS_NOTE =
  "Estimated credits: each contact search counts as 1; each phone/email research request counts as 1. Your SeamlessAI plan may differ—check your dashboard.";

/** True for CEO / owner / founder / President / Chair / C-suite only—not managers or ICs */
export function isOwnerOrCLevelTitle(title?: string | null, seniority?: string | null): boolean {
  const s = (seniority || "").toLowerCase();
  if (s.includes("c_suite") || s === "owner") return true;
  const t = (title || "").trim();
  if (!t) return false;
  const tl = t.toLowerCase();
  if (/\b(assistant|intern|coordinator|specialist|analyst|associate)\b/i.test(tl) && !/\bchief\b/i.test(tl))
    return false;
  if (/\b(vp|vice president|director|manager|head of)\b/i.test(tl) && !/\b(chief|president|founder|owner)\b/i.test(tl))
    return false;
  const patterns = [
    /\bceo\b|\bchief executive\b/,
    /\bcfo\b|\bchief financial\b/,
    /\bcoo\b|\bchief operating\b/,
    /\bcto\b|\bchief technology\b|\bchief technical\b/,
    /\bcmo\b|\bchief marketing\b/,
    /\bcio\b|\bchief information\b/,
    /\bcro\b|\bchief revenue\b/,
    /\bcpo\b|\bchief product\b/,
    /\bcdo\b|\bchief data\b/,
    /\bchief\b/,
    /\bpresident\b/,
    /\bfounder\b|\bco-founder\b|\bcofounder\b/,
    /\bowner\b/,
    /\bchair(man|woman|person)?\b|\bexecutive chair\b/,
    /\bmanaging director\b/,
    /\bgeneral partner\b/,
  ];
  return patterns.some((p) => p.test(tl));
}

function sortContactsByOwnerPriority(contacts: SeamlessContact[]): SeamlessContact[] {
  const rank = (c: SeamlessContact): number => {
    const t = ((c.title || "") + " " + (c.seniority || "")).toLowerCase();
    if (/\bceo\b|\bchief executive\b/.test(t)) return 0;
    if (/\bowner\b|\bfounder\b|\bco-founder\b/.test(t)) return 1;
    if (/\bpresident\b/.test(t)) return 2;
    if (/\bchair/.test(t)) return 3;
    if (/\bchief\b/.test(t)) return 4;
    return 5;
  };
  return [...contacts].sort((a, b) => rank(a) - rank(b));
}

function filterOwnerOrCLevelContacts(contacts: SeamlessContact[]): SeamlessContact[] {
  return contacts.filter((c) => isOwnerOrCLevelTitle(c.title, c.seniority));
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
   * Enrich a single company — owners / C-level only by default (fewer credits than pulling all roles).
   */
  async enrichCompany(
    companyName: string,
    domain?: string,
    options?: {
      /** If true (default), only CEO / founder / owner / President / Chair / C-suite */
      ownerOnly?: boolean;
      /** Cap contact search size (lower = fewer credits, may miss rare titles) */
      maxSearchResults?: number;
      /** Max owner/C-level rows returned */
      maxExecutives?: number;
    }
  ): Promise<CompanyEnrichmentResult | null> {
    if (!this.apiKey) {
      console.log('[SeamlessAI] API not configured, returning null');
      return null;
    }

    const ownerOnly = options?.ownerOnly !== false;
    const maxSearch = Math.min(Math.max(options?.maxSearchResults ?? 15, 5), 50);
    const maxExec = Math.min(Math.max(options?.maxExecutives ?? 5, 1), 15);

    try {
      const contactData = await this.searchContactsByCompany(companyName, maxSearch);

      const creditUsage: SeamlessCreditUsage = {
        contactSearches: 1,
        researchRequests: 0,
        estimatedCredits: 1,
        note: CREDITS_NOTE,
      };

      if (!contactData.data || contactData.data.length === 0) {
        console.log(`[SeamlessAI] No data found for: ${companyName}`);
        return null;
      }

      const pool = ownerOnly
        ? filterOwnerOrCLevelContacts(contactData.data)
        : contactData.data;
      const ranked = sortContactsByOwnerPriority(pool.length ? pool : contactData.data);
      const firstContact = ranked[0] || contactData.data[0];

      const executives = ranked.slice(0, maxExec).map((c) => ({
        name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        title: c.title || "Executive",
        email: c.email,
        phone: c.phone,
        linkedin: c.liUrl,
      }));

      const primary = executives[0];
      const employeeRange = firstContact.employeeSizeRange || "";
      const employeeCount = this.parseEmployeeCount(employeeRange);

      const result: CompanyEnrichmentResult = {
        businessName: firstContact.company || companyName,
        ownerName: primary?.name,
        email: primary?.email,
        phone: primary?.phone,
        industry: firstContact.industries?.join(", "),
        website: firstContact.domain ? `https://${firstContact.domain}` : undefined,
        city: firstContact.companyCity,
        state: firstContact.companyState,
        employeeCount,
        founded: firstContact.companyFoundedOn ? parseInt(firstContact.companyFoundedOn, 10) : undefined,
        linkedinUrl: firstContact.companyLIProfileUrl,
        description: `${firstContact.company} - ${firstContact.industries?.join(", ") || "Company"}`,
        confidence: 95,
        sources: ownerOnly ? ["SeamlessAI", "owners-c-suite-only"] : ["SeamlessAI", "LiveData"],
        executives,
        socialMedia: {
          linkedin: firstContact.companyLIProfileUrl,
        },
        creditUsage,
      };

      console.log(
        `[SeamlessAI] ✅ Enriched: ${result.businessName} (${executives.length} owner/C-level) ~${creditUsage.estimatedCredits} est. credits`
      );

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
   * Full research flow: Search → Research → Poll → Get contacts with phone numbers.
   * When ownersOnly (default true), only C-suite / owners are researched — saves credits vs researching every contact.
   */
  async researchContactsWithPhones(
    companyName: string,
    limit: number = 10,
    options?: { ownersOnly?: boolean; maxResearchContacts?: number }
  ): Promise<{ contacts: SeamlessContact[]; creditUsage: SeamlessCreditUsage }> {
    if (!this.apiKey) {
      throw new Error("SeamlessAI API key not configured");
    }

    const ownersOnly = options?.ownersOnly !== false;
    const maxResearch = Math.min(Math.max(options?.maxResearchContacts ?? 3, 1), 10);

    console.log(`[SeamlessAI] 🔍 Research flow for: ${companyName} (ownersOnly=${ownersOnly}, maxResearch=${maxResearch})`);

    const searchResponse = await this.searchContactsByCompany(companyName, limit);

    let pool = searchResponse.data || [];
    if (ownersOnly) {
      const filtered = filterOwnerOrCLevelContacts(pool);
      if (filtered.length > 0) pool = sortContactsByOwnerPriority(filtered);
    } else {
      pool = sortContactsByOwnerPriority([...pool]);
    }

    if (pool.length === 0) {
      console.log(`[SeamlessAI] ❌ No contacts found for: ${companyName}`);
      return {
        contacts: [],
        creditUsage: {
          contactSearches: 1,
          researchRequests: 0,
          estimatedCredits: 1,
          note: CREDITS_NOTE,
        },
      };
    }

    const withIds = pool
      .map((item) => ({ item, id: (item as any).searchResultId as string | undefined }))
      .filter((x): x is { item: SeamlessContact; id: string } => !!x.id)
      .slice(0, maxResearch);

    const searchResultIds = withIds.map((x) => x.id);

    if (searchResultIds.length === 0) {
      console.warn(`[SeamlessAI] ⚠️ No search result IDs (need searchResultId on contacts)`);
      return {
        contacts: [],
        creditUsage: {
          contactSearches: 1,
          researchRequests: 0,
          estimatedCredits: 1,
          note: CREDITS_NOTE,
        },
      };
    }

    console.log(`[SeamlessAI] ✅ Researching ${searchResultIds.length} owner/C-level contact(s) (not ${searchResponse.data?.length ?? 0} total)`);

    const researchIds = await this.createResearchRequests(searchResultIds);
    const contacts =
      researchIds.length > 0 ? await this.pollResearchResults(researchIds) : [];

    const creditUsage: SeamlessCreditUsage = {
      contactSearches: 1,
      researchRequests: researchIds.length,
      estimatedCredits: 1 + researchIds.length,
      note: CREDITS_NOTE,
    };

    console.log(
      `[SeamlessAI] 📦 ${contacts.length} contacts with research data ~${creditUsage.estimatedCredits} est. credits`
    );

    return { contacts, creditUsage };
  }
}

// Export singleton instance
export const seamlessAI = new SeamlessAIService();

