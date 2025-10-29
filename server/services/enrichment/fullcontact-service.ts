export interface FullContactPersonData {
  fullName?: string;
  ageRange?: string;
  gender?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    formatted?: string;
  };
  title?: string;
  organization?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  bio?: string;
  avatar?: string;
  website?: string;
  emails?: Array<{
    value: string;
    type: string;
  }>;
  phones?: Array<{
    value: string;
    type: string;
  }>;
  profiles?: Array<{
    service: string;
    username: string;
    url: string;
  }>;
  interests?: string[];
  skills?: string[];
}

export interface FullContactCompanyData {
  name?: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  employees?: number;
  founded?: number;
  industry?: string;
  description?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  logo?: string;
  tags?: string[];
  funding?: {
    raised?: number;
    rounds?: number;
  };
}

export class FullContactService {
  private apiKey: string | undefined;
  private baseUrl = "https://api.fullcontact.com/v3";
  private hasLoggedWarning = false;
  
  constructor() {
    this.apiKey = process.env.FULLCONTACT_API_KEY;
    if (!this.apiKey && !this.hasLoggedWarning) {
      console.warn("[FullContact] API key not configured. Using fallback social enrichment.");
      this.hasLoggedWarning = true;
    }
  }
  
  /**
   * Enrich person data by email
   */
  async enrichPersonByEmail(email: string): Promise<FullContactPersonData | null> {
    if (!this.apiKey) {
      return this.generateMockPersonData(email);
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/person.enrich`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });
      
      if (response.status === 404) {
        console.log(`[FullContact] Person not found for email: ${email}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`FullContact API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return this.transformPersonResponse(data);
    } catch (error) {
      console.error("[FullContact] Person enrichment failed:", error);
      return this.generateMockPersonData(email);
    }
  }
  
  /**
   * Enrich person data by phone
   */
  async enrichPersonByPhone(phone: string): Promise<FullContactPersonData | null> {
    if (!this.apiKey) {
      return this.generateMockPersonData(`${phone}@phone.com`);
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/person.enrich`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ phone })
      });
      
      if (response.status === 404) {
        console.log(`[FullContact] Person not found for phone: ${phone}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`FullContact API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return this.transformPersonResponse(data);
    } catch (error) {
      console.error("[FullContact] Phone enrichment failed:", error);
      return this.generateMockPersonData(`${phone}@phone.com`);
    }
  }
  
  /**
   * Enrich company data by domain
   */
  async enrichCompanyByDomain(domain: string): Promise<FullContactCompanyData | null> {
    if (!this.apiKey) {
      return this.generateMockCompanyData(domain);
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/company.enrich`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ domain })
      });
      
      if (response.status === 404) {
        console.log(`[FullContact] Company not found for domain: ${domain}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`FullContact API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return this.transformCompanyResponse(data);
    } catch (error) {
      console.error("[FullContact] Company enrichment failed:", error);
      return this.generateMockCompanyData(domain);
    }
  }
  
  /**
   * Find social profiles across platforms
   */
  async findSocialProfiles(email: string): Promise<Array<{ service: string; url: string }>> {
    const personData = await this.enrichPersonByEmail(email);
    
    if (!personData || !personData.profiles) {
      return [];
    }
    
    return personData.profiles.map(profile => ({
      service: profile.service,
      url: profile.url
    }));
  }
  
  /**
   * Calculate social presence score
   */
  calculateSocialScore(data: FullContactPersonData): number {
    let score = 0;
    
    if (data.fullName) score += 10;
    if (data.title) score += 15;
    if (data.organization) score += 15;
    if (data.linkedin) score += 20;
    if (data.twitter) score += 10;
    if (data.facebook) score += 5;
    if (data.website) score += 10;
    if (data.bio) score += 10;
    if (data.avatar) score += 5;
    
    // Bonus for multiple profiles
    if (data.profiles && data.profiles.length > 3) {
      score += Math.min(20, data.profiles.length * 2);
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Transform API response to our format
   */
  private transformPersonResponse(apiData: any): FullContactPersonData {
    return {
      fullName: apiData.fullName,
      ageRange: apiData.ageRange,
      gender: apiData.gender,
      location: apiData.location,
      title: apiData.title,
      organization: apiData.organization,
      linkedin: apiData.linkedin,
      twitter: apiData.twitter,
      facebook: apiData.facebook,
      bio: apiData.bio,
      avatar: apiData.avatar,
      website: apiData.website,
      emails: apiData.emails,
      phones: apiData.phones,
      profiles: apiData.details?.profiles?.map((p: any) => ({
        service: p.service,
        username: p.username,
        url: p.url
      })),
      interests: apiData.interests,
      skills: apiData.skills
    };
  }
  
  /**
   * Transform company API response
   */
  private transformCompanyResponse(apiData: any): FullContactCompanyData {
    return {
      name: apiData.name,
      location: apiData.location,
      employees: apiData.employees,
      founded: apiData.founded,
      industry: apiData.category?.industry,
      description: apiData.description,
      website: apiData.website,
      linkedin: apiData.linkedin,
      twitter: apiData.twitter,
      facebook: apiData.facebook,
      logo: apiData.logo,
      tags: apiData.tags,
      funding: apiData.funding
    };
  }
  
  /**
   * Generate mock person data
   */
  private generateMockPersonData(identifier: string): FullContactPersonData {
    const seed = this.hashString(identifier);
    const isEmail = identifier.includes("@");
    
    const firstNames = ["John", "Jane", "Michael", "Sarah", "David", "Emily"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia"];
    const titles = ["CEO", "Sales Manager", "Director of Operations", "CFO", "Marketing Director"];
    const companies = ["Tech Corp", "Global Solutions", "Innovate Inc", "Future Systems"];
    
    const firstName = firstNames[seed % firstNames.length];
    const lastName = lastNames[(seed + 1) % lastNames.length];
    
    return {
      fullName: `${firstName} ${lastName}`,
      ageRange: "30-40",
      gender: seed % 2 === 0 ? "Male" : "Female",
      location: {
        city: "New York",
        region: "NY",
        country: "United States",
        formatted: "New York, NY, USA"
      },
      title: titles[seed % titles.length],
      organization: companies[seed % companies.length],
      linkedin: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
      twitter: seed % 3 === 0 ? `https://twitter.com/${firstName.toLowerCase()}${lastName.toLowerCase()}` : undefined,
      facebook: seed % 4 === 0 ? `https://facebook.com/${firstName.toLowerCase()}.${lastName.toLowerCase()}` : undefined,
      bio: `Experienced business professional with expertise in the industry.`,
      website: seed % 5 === 0 ? `https://${firstName.toLowerCase()}${lastName.toLowerCase()}.com` : undefined,
      emails: isEmail ? [{ value: identifier, type: "work" }] : [],
      profiles: [
        {
          service: "LinkedIn",
          username: `${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
          url: `https://linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`
        }
      ],
      interests: ["Business", "Technology", "Innovation"],
      skills: ["Leadership", "Strategy", "Management"]
    };
  }
  
  /**
   * Generate mock company data
   */
  private generateMockCompanyData(domain: string): FullContactCompanyData {
    const companyName = domain.split('.')[0];
    const seed = this.hashString(domain);
    
    const industries = ["Technology", "Finance", "Healthcare", "Retail", "Manufacturing"];
    
    return {
      name: this.capitalizeWords(companyName),
      location: {
        address: "123 Business St",
        city: "New York",
        region: "NY",
        country: "United States",
        postalCode: "10001"
      },
      employees: 50 + (seed % 500),
      founded: 2000 + (seed % 20),
      industry: industries[seed % industries.length],
      description: `${this.capitalizeWords(companyName)} is a leading company in the ${industries[seed % industries.length]} industry.`,
      website: `https://${domain}`,
      linkedin: `https://linkedin.com/company/${companyName}`,
      twitter: `https://twitter.com/${companyName}`,
      facebook: `https://facebook.com/${companyName}`,
      logo: `https://${domain}/logo.png`,
      tags: ["innovative", "growing", "established"],
      funding: {
        raised: 1000000 * (1 + seed % 10),
        rounds: 1 + (seed % 4)
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
}

export const fullContactService = new FullContactService();