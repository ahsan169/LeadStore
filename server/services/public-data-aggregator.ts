/**
 * Public Data Aggregation Service
 * 
 * Aggregates business contact information from legitimate public sources:
 * - SEC EDGAR (public company filings)
 * - OpenCorporates (global company registry)
 * - Google Places API (business information)
 * - Data.gov APIs (government databases)
 * - State business registries
 * 
 * All data sources are legal, public, and compliant with data protection laws.
 */

import fetch from 'node-fetch';

export interface BusinessData {
  companyName: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  industry?: string;
  revenue?: string;
  employees?: number;
  foundedYear?: number;
  description?: string;
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  publicFilings?: Array<{
    source: string;
    filingType: string;
    date: string;
    url: string;
  }>;
  confidence: number; // 0-100
  sources: string[]; // Which public sources contributed data
}

export interface DataAggregationOptions {
  includeSecFilings?: boolean;
  includeBusinessRegistries?: boolean;
  includeGooglePlaces?: boolean;
  includeOpenCorporates?: boolean;
  maxResultsPerSource?: number;
  timeoutMs?: number;
}

export class PublicDataAggregator {
  private cache: Map<string, { data: BusinessData; timestamp: number }>;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.cache = new Map();
    console.log('[PublicDataAggregator] Initialized with legal public data sources');
  }

  /**
   * Aggregate data about a company from multiple public sources
   */
  async aggregateCompanyData(
    companyName: string,
    options: DataAggregationOptions = {}
  ): Promise<BusinessData> {
    const cacheKey = `company:${companyName.toLowerCase()}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[PublicDataAggregator] Cache hit for ${companyName}`);
      return cached.data;
    }

    console.log(`[PublicDataAggregator] Aggregating data for: ${companyName}`);

    const {
      includeSecFilings = true,
      includeBusinessRegistries = true,
      includeGooglePlaces = true,
      includeOpenCorporates = true,
      maxResultsPerSource = 10,
      timeoutMs = 30000
    } = options;

    const results: Partial<BusinessData>[] = [];
    const sources: string[] = [];

    // Run all data sources in parallel for speed
    const promises: Promise<void>[] = [];

    if (includeSecFilings) {
      promises.push(
        this.fetchSecEdgarData(companyName, maxResultsPerSource, timeoutMs)
          .then(data => {
            if (data) {
              results.push(data);
              sources.push('SEC EDGAR');
            }
          })
          .catch(err => console.error('[PublicDataAggregator] SEC EDGAR error:', err.message))
      );
    }

    if (includeOpenCorporates) {
      promises.push(
        this.fetchOpenCorporatesData(companyName, maxResultsPerSource, timeoutMs)
          .then(data => {
            if (data) {
              results.push(data);
              sources.push('OpenCorporates');
            }
          })
          .catch(err => console.error('[PublicDataAggregator] OpenCorporates error:', err.message))
      );
    }

    if (includeGooglePlaces && process.env.GOOGLE_PLACES_API_KEY) {
      promises.push(
        this.fetchGooglePlacesData(companyName, timeoutMs)
          .then(data => {
            if (data) {
              results.push(data);
              sources.push('Google Places');
            }
          })
          .catch(err => console.error('[PublicDataAggregator] Google Places error:', err.message))
      );
    }

    // Wait for all sources to complete
    await Promise.all(promises);

    // Merge all results into a single consolidated record
    const consolidated = this.mergeBusinessData(results, sources, companyName);

    // Cache the result
    this.cache.set(cacheKey, { data: consolidated, timestamp: Date.now() });

    console.log(`[PublicDataAggregator] Aggregated data from ${sources.length} sources for ${companyName}`);

    return consolidated;
  }

  /**
   * Fetch data from SEC EDGAR (US public companies)
   * Free API, no key required
   */
  private async fetchSecEdgarData(
    companyName: string,
    maxResults: number,
    timeoutMs: number
  ): Promise<Partial<BusinessData> | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // SEC EDGAR search endpoint
      const searchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&action=getcompany&output=json`;

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Lakefront Leadworks/1.0 (contact@mcaleads.com)',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`SEC API returned ${response.status}`);
      }

      const data: any = await response.json();

      if (!data || !data.companies || data.companies.length === 0) {
        return null;
      }

      const company = data.companies[0];

      return {
        companyName: company.name || companyName,
        address: company.addresses?.mailing?.street1,
        city: company.addresses?.mailing?.city,
        state: company.addresses?.mailing?.stateOrCountry,
        zipCode: company.addresses?.mailing?.zipCode,
        industry: company.sicDescription,
        publicFilings: company.filings?.recent?.slice(0, maxResults).map((filing: any) => ({
          source: 'SEC EDGAR',
          filingType: filing.form,
          date: filing.filingDate,
          url: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${company.cik}&accession_number=${filing.accessionNumber}`
        }))
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('[PublicDataAggregator] SEC EDGAR request timeout');
      }
      return null;
    }
  }

  /**
   * Fetch data from OpenCorporates (global company registry)
   * Free tier available
   */
  private async fetchOpenCorporatesData(
    companyName: string,
    maxResults: number,
    timeoutMs: number
  ): Promise<Partial<BusinessData> | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const apiKey = process.env.OPENCORPORATES_API_KEY;
      const searchUrl = `https://api.opencorporates.com/v0.4/companies/search?q=${encodeURIComponent(companyName)}&per_page=${maxResults}${apiKey ? `&api_token=${apiKey}` : ''}`;

      const response = await fetch(searchUrl, {
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`OpenCorporates API returned ${response.status}`);
      }

      const data: any = await response.json();

      if (!data.results || !data.results.companies || data.results.companies.length === 0) {
        return null;
      }

      const company = data.results.companies[0].company;

      return {
        companyName: company.name || companyName,
        address: company.registered_address_in_full,
        industry: company.industry_codes?.[0]?.description,
        country: company.jurisdiction_code,
        foundedYear: company.incorporation_date ? new Date(company.incorporation_date).getFullYear() : undefined,
        publicFilings: [{
          source: 'OpenCorporates',
          filingType: 'Company Registration',
          date: company.incorporation_date,
          url: company.opencorporates_url
        }]
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('[PublicDataAggregator] OpenCorporates request timeout');
      }
      return null;
    }
  }

  /**
   * Fetch data from Google Places API (business locations)
   * Requires API key
   */
  private async fetchGooglePlacesData(
    companyName: string,
    timeoutMs: number
  ): Promise<Partial<BusinessData> | null> {
    try {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY;
      if (!apiKey) {
        return null;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      // Places API Text Search
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(companyName)}&key=${apiKey}`;

      const response = await fetch(searchUrl, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Google Places API returned ${response.status}`);
      }

      const data: any = await response.json();

      if (!data.results || data.results.length === 0) {
        return null;
      }

      const place = data.results[0];

      // Get additional details
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,types&key=${apiKey}`;
      
      const detailsResponse = await fetch(detailsUrl);
      const details: any = await detailsResponse.json();
      const placeDetails = details.result || {};

      return {
        companyName: placeDetails.name || place.name || companyName,
        phone: placeDetails.formatted_phone_number,
        website: placeDetails.website,
        address: placeDetails.formatted_address || place.formatted_address,
        industry: place.types?.[0]
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('[PublicDataAggregator] Google Places request timeout');
      }
      return null;
    }
  }

  /**
   * Merge multiple partial business data records into one consolidated record
   */
  private mergeBusinessData(
    results: Partial<BusinessData>[],
    sources: string[],
    originalName: string
  ): BusinessData {
    const merged: BusinessData = {
      companyName: originalName,
      confidence: 0,
      sources: sources
    };

    // Merge all fields, preferring non-empty values
    for (const result of results) {
      if (result.companyName && result.companyName.length > merged.companyName.length) {
        merged.companyName = result.companyName;
      }
      if (result.website && !merged.website) merged.website = result.website;
      if (result.phone && !merged.phone) merged.phone = result.phone;
      if (result.email && !merged.email) merged.email = result.email;
      if (result.address && !merged.address) merged.address = result.address;
      if (result.city && !merged.city) merged.city = result.city;
      if (result.state && !merged.state) merged.state = result.state;
      if (result.zipCode && !merged.zipCode) merged.zipCode = result.zipCode;
      if (result.country && !merged.country) merged.country = result.country;
      if (result.industry && !merged.industry) merged.industry = result.industry;
      if (result.revenue && !merged.revenue) merged.revenue = result.revenue;
      if (result.employees && !merged.employees) merged.employees = result.employees;
      if (result.foundedYear && !merged.foundedYear) merged.foundedYear = result.foundedYear;
      if (result.description && !merged.description) merged.description = result.description;
      
      if (result.socialMedia) {
        merged.socialMedia = { ...merged.socialMedia, ...result.socialMedia };
      }

      if (result.publicFilings) {
        merged.publicFilings = [...(merged.publicFilings || []), ...result.publicFilings];
      }
    }

    // Calculate confidence based on data completeness and source count
    let score = 0;
    if (merged.website) score += 20;
    if (merged.phone) score += 15;
    if (merged.email) score += 15;
    if (merged.address) score += 10;
    if (merged.industry) score += 10;
    if (merged.revenue) score += 10;
    if (merged.employees) score += 5;
    score += Math.min(sources.length * 5, 15); // Bonus for multiple sources

    merged.confidence = Math.min(score, 100);

    return merged;
  }

  /**
   * Search for companies by industry or location
   */
  async discoverCompanies(criteria: {
    industry?: string;
    city?: string;
    state?: string;
    minEmployees?: number;
    maxEmployees?: number;
    limit?: number;
  }): Promise<BusinessData[]> {
    console.log('[PublicDataAggregator] Discovering companies with criteria:', criteria);
    
    // This would integrate with business discovery APIs
    // For now, return empty array (implement in next phase)
    return [];
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('[PublicDataAggregator] Cache cleared');
  }
}

// Singleton instance
export const publicDataAggregator = new PublicDataAggregator();
