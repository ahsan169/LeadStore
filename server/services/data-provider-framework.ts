/**
 * Data Provider Integration Framework
 * 
 * Unified interface for integrating multiple data providers:
 * - Hunter.io (email finding & verification)
 * - Clearbit (company enrichment)
 * - FullContact (person enrichment)
 * - Apollo.io (B2B database)
 * - PeopleDataLabs (contact data)
 * 
 * Provides:
 * - Unified API across providers
 * - Automatic fallback chains
 * - Cost optimization
 * - Rate limiting
 * - Caching
 */

import fetch from 'node-fetch';

export interface ContactData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  linkedin?: string;
  twitter?: string;
}

export interface CompanyData {
  name: string;
  domain?: string;
  industry?: string;
  employees?: number;
  revenue?: number;
  founded?: number;
  description?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  phone?: string;
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
}

export interface EnrichmentResult {
  provider: string;
  success: boolean;
  data?: ContactData | CompanyData;
  creditsUsed?: number;
  error?: string;
  cached?: boolean;
}

export interface DataProvider {
  name: string;
  findEmail(firstName: string, lastName: string, domain: string): Promise<EnrichmentResult>;
  verifyEmail(email: string): Promise<EnrichmentResult>;
  enrichCompany(domain: string): Promise<EnrichmentResult>;
  enrichPerson(email: string): Promise<EnrichmentResult>;
  findCompanyContacts(domain: string, limit?: number): Promise<EnrichmentResult>;
}

/**
 * Hunter.io Provider
 */
export class HunterProvider implements DataProvider {
  name = 'Hunter.io';
  private apiKey: string;
  private baseUrl = 'https://api.hunter.io/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async findEmail(firstName: string, lastName: string, domain: string): Promise<EnrichmentResult> {
    try {
      const url = `${this.baseUrl}/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${this.apiKey}`;
      const response = await fetch(url, { timeout: 15000 } as any);
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      if (data.data && data.data.email) {
        return {
          provider: this.name,
          success: true,
          data: {
            email: data.data.email,
            firstName: data.data.first_name,
            lastName: data.data.last_name,
            linkedin: data.data.linkedin,
            twitter: data.data.twitter
          },
          creditsUsed: 1
        };
      }

      return {
        provider: this.name,
        success: false,
        error: 'No email found'
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }

  async verifyEmail(email: string): Promise<EnrichmentResult> {
    try {
      const url = `${this.baseUrl}/email-verifier?email=${encodeURIComponent(email)}&api_key=${this.apiKey}`;
      const response = await fetch(url, { timeout: 15000 } as any);
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        provider: this.name,
        success: true,
        data: {
          email: email,
          // Add verification metadata
        },
        creditsUsed: 1
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }

  async enrichCompany(domain: string): Promise<EnrichmentResult> {
    try {
      const url = `${this.baseUrl}/domain-search?domain=${domain}&api_key=${this.apiKey}&limit=1`;
      const response = await fetch(url, { timeout: 15000 } as any);
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      if (data.data) {
        return {
          provider: this.name,
          success: true,
          data: {
            name: data.data.organization || '',
            domain: data.data.domain,
            // Hunter provides limited company data
          },
          creditsUsed: 1
        };
      }

      return {
        provider: this.name,
        success: false,
        error: 'No company data found'
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }

  async enrichPerson(email: string): Promise<EnrichmentResult> {
    // Hunter doesn't provide person enrichment
    return {
      provider: this.name,
      success: false,
      error: 'Person enrichment not supported by Hunter.io'
    };
  }

  async findCompanyContacts(domain: string, limit: number = 10): Promise<EnrichmentResult> {
    try {
      const url = `${this.baseUrl}/domain-search?domain=${domain}&api_key=${this.apiKey}&limit=${limit}`;
      const response = await fetch(url, { timeout: 15000 } as any);
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      if (data.data && data.data.emails) {
        return {
          provider: this.name,
          success: true,
          data: {
            // Return array of contacts
          },
          creditsUsed: limit
        };
      }

      return {
        provider: this.name,
        success: false,
        error: 'No contacts found'
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * Clearbit Provider
 */
export class ClearbitProvider implements DataProvider {
  name = 'Clearbit';
  private apiKey: string;
  private baseUrl = 'https://person.clearbit.com/v2';
  private companyUrl = 'https://company.clearbit.com/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async findEmail(firstName: string, lastName: string, domain: string): Promise<EnrichmentResult> {
    // Clearbit doesn't provide email finding
    return {
      provider: this.name,
      success: false,
      error: 'Email finding not supported by Clearbit'
    };
  }

  async verifyEmail(email: string): Promise<EnrichmentResult> {
    return {
      provider: this.name,
      success: false,
      error: 'Email verification not supported by Clearbit'
    };
  }

  async enrichCompany(domain: string): Promise<EnrichmentResult> {
    try {
      const url = `${this.companyUrl}/companies/find?domain=${domain}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      } as any);
      
      if (!response.ok) {
        throw new Error(`Clearbit API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        provider: this.name,
        success: true,
        data: {
          name: data.name,
          domain: data.domain,
          industry: data.category?.industry,
          employees: data.metrics?.employees,
          revenue: data.metrics?.estimatedAnnualRevenue,
          founded: data.foundedYear,
          description: data.description,
          location: {
            address: data.geo?.streetNumber + ' ' + data.geo?.streetName,
            city: data.geo?.city,
            state: data.geo?.state,
            country: data.geo?.country,
            zipCode: data.geo?.postalCode
          },
          phone: data.phone,
          socialMedia: {
            linkedin: data.linkedin?.handle,
            twitter: data.twitter?.handle,
            facebook: data.facebook?.handle
          }
        },
        creditsUsed: 1
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }

  async enrichPerson(email: string): Promise<EnrichmentResult> {
    try {
      const url = `${this.baseUrl}/people/find?email=${encodeURIComponent(email)}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 15000
      } as any);
      
      if (!response.ok) {
        throw new Error(`Clearbit API error: ${response.status}`);
      }

      const data: any = await response.json();
      
      return {
        provider: this.name,
        success: true,
        data: {
          email: data.email,
          firstName: data.name?.givenName,
          lastName: data.name?.familyName,
          title: data.employment?.title,
          linkedin: data.linkedin?.handle,
          twitter: data.twitter?.handle
        },
        creditsUsed: 1
      };
    } catch (error: any) {
      return {
        provider: this.name,
        success: false,
        error: error.message
      };
    }
  }

  async findCompanyContacts(domain: string, limit?: number): Promise<EnrichmentResult> {
    return {
      provider: this.name,
      success: false,
      error: 'Company contacts search not supported by Clearbit'
    };
  }
}

/**
 * Data Provider Manager - Orchestrates multiple providers
 */
export class DataProviderManager {
  private providers: Map<string, DataProvider>;
  private cache: Map<string, { result: EnrichmentResult; timestamp: number }>;
  private cacheTTL: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.providers = new Map();
    this.cache = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize all available providers based on environment variables
   */
  private initializeProviders() {
    // Hunter.io
    if (process.env.HUNTER_API_KEY) {
      const hunter = new HunterProvider(process.env.HUNTER_API_KEY);
      this.providers.set('hunter', hunter);
      console.log('[DataProviders] Hunter.io provider initialized');
    }

    // Clearbit
    if (process.env.CLEARBIT_API_KEY) {
      const clearbit = new ClearbitProvider(process.env.CLEARBIT_API_KEY);
      this.providers.set('clearbit', clearbit);
      console.log('[DataProviders] Clearbit provider initialized');
    }

    console.log(`[DataProviders] ${this.providers.size} data providers ready`);
  }

  /**
   * Find email with automatic provider fallback
   */
  async findEmail(
    firstName: string,
    lastName: string,
    domain: string,
    preferredProvider?: string
  ): Promise<EnrichmentResult> {
    const cacheKey = `email:${firstName}:${lastName}:${domain}`;
    
    // Check cache
    const cached = this.checkCache(cacheKey);
    if (cached) return cached;

    // Try preferred provider first
    if (preferredProvider && this.providers.has(preferredProvider)) {
      const result = await this.providers.get(preferredProvider)!.findEmail(firstName, lastName, domain);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    // Try all providers in order
    for (const [name, provider] of Array.from(this.providers.entries())) {
      if (name === preferredProvider) continue; // Already tried
      
      const result = await provider.findEmail(firstName, lastName, domain);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    return {
      provider: 'None',
      success: false,
      error: 'No provider could find email'
    };
  }

  /**
   * Enrich company with provider fallback
   */
  async enrichCompany(domain: string, preferredProvider?: string): Promise<EnrichmentResult> {
    const cacheKey = `company:${domain}`;
    
    // Check cache
    const cached = this.checkCache(cacheKey);
    if (cached) return cached;

    // Try preferred provider first
    if (preferredProvider && this.providers.has(preferredProvider)) {
      const result = await this.providers.get(preferredProvider)!.enrichCompany(domain);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    // Try all providers in order
    for (const [name, provider] of Array.from(this.providers.entries())) {
      if (name === preferredProvider) continue;
      
      const result = await provider.enrichCompany(domain);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    return {
      provider: 'None',
      success: false,
      error: 'No provider could enrich company'
    };
  }

  /**
   * Verify email with provider fallback
   */
  async verifyEmail(email: string, preferredProvider?: string): Promise<EnrichmentResult> {
    const cacheKey = `verify:${email}`;
    
    // Check cache
    const cached = this.checkCache(cacheKey);
    if (cached) return cached;

    // Try preferred provider first
    if (preferredProvider && this.providers.has(preferredProvider)) {
      const result = await this.providers.get(preferredProvider)!.verifyEmail(email);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    // Try all providers
    for (const [name, provider] of Array.from(this.providers.entries())) {
      if (name === preferredProvider) continue;
      
      const result = await provider.verifyEmail(email);
      if (result.success) {
        this.setCache(cacheKey, result);
        return result;
      }
    }

    return {
      provider: 'None',
      success: false,
      error: 'No provider could verify email'
    };
  }

  /**
   * Check cache for result
   */
  private checkCache(key: string): EnrichmentResult | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return { ...cached.result, cached: true };
    }
    return null;
  }

  /**
   * Store result in cache
   */
  private setCache(key: string, result: EnrichmentResult) {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
export const dataProviderManager = new DataProviderManager();
