import { Lead } from "@shared/schema";

export interface ClearbitCompanyData {
  name: string;
  legalName?: string;
  domain: string;
  domainAliases?: string[];
  category?: {
    sector?: string;
    industryGroup?: string;
    industry?: string;
    subIndustry?: string;
  };
  metrics?: {
    employees?: number;
    employeesRange?: string;
    marketCap?: number;
    raised?: number;
    annualRevenue?: number;
    estimatedAnnualRevenue?: string;
  };
  tech?: string[];
  geo?: {
    streetNumber?: string;
    streetName?: string;
    subPremise?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
    lat?: number;
    lng?: number;
  };
  logo?: string;
  facebook?: {
    handle?: string;
    likes?: number;
  };
  linkedin?: {
    handle?: string;
  };
  twitter?: {
    handle?: string;
    id?: string;
    bio?: string;
    followers?: number;
    following?: number;
    location?: string;
    site?: string;
  };
  crunchbase?: {
    handle?: string;
  };
  founding?: {
    foundedYear?: number;
  };
  tags?: string[];
  description?: string;
}

export interface ClearbitPersonData {
  name?: {
    fullName?: string;
    givenName?: string;
    familyName?: string;
  };
  email?: string;
  location?: string;
  bio?: string;
  site?: string;
  avatar?: string;
  employment?: {
    domain?: string;
    name?: string;
    title?: string;
    role?: string;
    subRole?: string;
    seniority?: string;
  };
  facebook?: {
    handle?: string;
  };
  linkedin?: {
    handle?: string;
  };
  twitter?: {
    handle?: string;
    bio?: string;
    followers?: number;
  };
  github?: {
    handle?: string;
    company?: string;
    blog?: string;
    followers?: number;
    following?: number;
  };
}

export class ClearbitService {
  private apiKey: string | undefined;
  private baseUrl = "https://company.clearbit.com/v2";
  private personUrl = "https://person.clearbit.com/v2";
  private hasLoggedWarning = false;
  
  constructor() {
    this.apiKey = process.env.CLEARBIT_API_KEY;
    if (!this.apiKey && !this.hasLoggedWarning) {
      console.warn("[Clearbit] API key not configured. Using fallback enrichment.");
      this.hasLoggedWarning = true;
    }
  }
  
  /**
   * Enrich company data using Clearbit API
   */
  async enrichCompany(domain: string): Promise<ClearbitCompanyData | null> {
    if (!this.apiKey) {
      return this.generateMockCompanyData(domain);
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/companies/find?domain=${domain}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      
      if (response.status === 404) {
        console.log(`[Clearbit] Company not found for domain: ${domain}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Clearbit API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as ClearbitCompanyData;
    } catch (error) {
      console.error("[Clearbit] Company enrichment failed:", error);
      return this.generateMockCompanyData(domain);
    }
  }
  
  /**
   * Enrich person data using Clearbit API
   */
  async enrichPerson(email: string): Promise<ClearbitPersonData | null> {
    if (!this.apiKey) {
      return this.generateMockPersonData(email);
    }
    
    try {
      const response = await fetch(`${this.personUrl}/people/find?email=${email}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      
      if (response.status === 404) {
        console.log(`[Clearbit] Person not found for email: ${email}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Clearbit API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data as ClearbitPersonData;
    } catch (error) {
      console.error("[Clearbit] Person enrichment failed:", error);
      return this.generateMockPersonData(email);
    }
  }
  
  /**
   * Find company domain from company name
   */
  async findDomain(companyName: string): Promise<string | null> {
    if (!this.apiKey) {
      // Generate a plausible domain from company name
      const cleanName = companyName.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);
      return `${cleanName}.com`;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/companies/find?name=${encodeURIComponent(companyName)}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.domain || null;
      }
      
      return null;
    } catch (error) {
      console.error("[Clearbit] Domain lookup failed:", error);
      return null;
    }
  }
  
  /**
   * Batch enrich multiple companies
   */
  async batchEnrichCompanies(domains: string[]): Promise<Map<string, ClearbitCompanyData | null>> {
    const results = new Map<string, ClearbitCompanyData | null>();
    
    // Clearbit doesn't have a batch endpoint, so we process in parallel with rate limiting
    const batchSize = 5;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(domain => this.enrichCompany(domain))
      );
      
      batch.forEach((domain, index) => {
        results.set(domain, batchResults[index]);
      });
      
      // Rate limiting delay
      if (i + batchSize < domains.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
  
  /**
   * Generate enhanced mock company data when API is unavailable
   */
  private generateMockCompanyData(domain: string): ClearbitCompanyData {
    const companyName = domain.split('.')[0];
    const seed = this.hashString(domain);
    
    const industries = [
      "Software", "Retail", "Healthcare", "Finance", "Manufacturing",
      "Construction", "Transportation", "Professional Services"
    ];
    
    const techs = [
      "Salesforce", "HubSpot", "Microsoft 365", "AWS", "Google Cloud",
      "Slack", "Zoom", "QuickBooks", "Shopify", "WordPress"
    ];
    
    return {
      name: this.capitalizeWords(companyName),
      domain,
      category: {
        industry: industries[seed % industries.length],
        sector: "Private"
      },
      metrics: {
        employees: 10 + (seed % 990),
        employeesRange: this.getEmployeeRange(10 + (seed % 990)),
        annualRevenue: 1000000 + (seed % 50000000),
        estimatedAnnualRevenue: "$1M-$50M"
      },
      tech: this.selectRandomItems(techs, 3 + (seed % 5), seed),
      geo: {
        city: "New York",
        stateCode: "NY",
        countryCode: "US"
      },
      linkedin: {
        handle: companyName.toLowerCase()
      },
      founding: {
        foundedYear: 2010 + (seed % 10)
      },
      description: `${this.capitalizeWords(companyName)} is a leading company in the industry.`
    };
  }
  
  /**
   * Generate enhanced mock person data
   */
  private generateMockPersonData(email: string): ClearbitPersonData {
    const namePart = email.split('@')[0];
    const [firstName, lastName] = this.parseNameFromEmail(namePart);
    const domain = email.split('@')[1];
    
    const roles = ["CEO", "CFO", "CTO", "Director", "Manager", "VP Sales", "VP Marketing"];
    const seed = this.hashString(email);
    
    return {
      name: {
        fullName: `${firstName} ${lastName}`,
        givenName: firstName,
        familyName: lastName
      },
      email,
      location: "United States",
      employment: {
        domain,
        name: this.capitalizeWords(domain.split('.')[0]),
        title: roles[seed % roles.length],
        seniority: "executive"
      },
      linkedin: {
        handle: `${firstName.toLowerCase()}-${lastName.toLowerCase()}`
      }
    };
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  }
  
  private getEmployeeRange(count: number): string {
    if (count < 10) return "1-10";
    if (count < 50) return "11-50";
    if (count < 200) return "51-200";
    if (count < 500) return "201-500";
    if (count < 1000) return "501-1000";
    return "1000+";
  }
  
  private selectRandomItems<T>(arr: T[], count: number, seed: number): T[] {
    const shuffled = [...arr].sort((a, b) => (seed % 2) - 0.5);
    return shuffled.slice(0, Math.min(count, arr.length));
  }
  
  private parseNameFromEmail(emailPart: string): [string, string] {
    const cleanPart = emailPart.replace(/[0-9_.-]/g, ' ').trim();
    const parts = cleanPart.split(' ').filter(p => p.length > 0);
    
    if (parts.length >= 2) {
      return [
        this.capitalizeWords(parts[0]),
        this.capitalizeWords(parts[parts.length - 1])
      ];
    }
    
    return [
      this.capitalizeWords(cleanPart || "John"),
      "Doe"
    ];
  }
}

export const clearbitService = new ClearbitService();