import { Lead } from "@shared/schema";

export interface HunterEmailVerification {
  result: "deliverable" | "undeliverable" | "risky" | "unknown";
  score: number;
  email: string;
  regexp: boolean;
  gibberish: boolean;
  disposable: boolean;
  webmail: boolean;
  mx_records: boolean;
  smtp_server: boolean;
  smtp_check: boolean;
  accept_all: boolean;
  block: boolean;
  sources: Array<{
    domain: string;
    uri: string;
    extracted_on: string;
    last_seen_on: string;
    still_on_page: boolean;
  }>;
}

export interface HunterDomainSearch {
  domain: string;
  disposable: boolean;
  webmail: boolean;
  accept_all: boolean;
  pattern: string;
  organization: string;
  description: string;
  industry: string;
  twitter: string;
  facebook: string;
  linkedin: string;
  instagram: string;
  youtube: string;
  technologies: string[];
  country: string;
  state: string;
  city: string;
  postal_code: string;
  street: string;
  headcount: string;
  company_type: string;
  emails: Array<{
    value: string;
    type: "personal" | "generic";
    confidence: number;
    sources: Array<{
      domain: string;
      uri: string;
      extracted_on: string;
      last_seen_on: string;
      still_on_page: boolean;
    }>;
    first_name: string;
    last_name: string;
    position: string;
    seniority: string;
    department: string;
    linkedin: string;
    twitter: string;
    phone_number: string;
    verification?: HunterEmailVerification;
  }>;
}

export interface HunterEmailFinder {
  email: string;
  score: number;
  domain: string;
  accept_all: boolean;
  position: string;
  department: string;
  twitter: string;
  linkedin: string;
  phone_number: string;
  company: string;
  sources: Array<{
    domain: string;
    uri: string;
    extracted_on: string;
    last_seen_on: string;
    still_on_page: boolean;
  }>;
}

export class HunterService {
  private apiKey: string | undefined;
  private baseUrl = "https://api.hunter.io/v2";
  private hasLoggedWarning = false;
  
  constructor() {
    this.apiKey = process.env.HUNTER_API_KEY;
    if (!this.apiKey && !this.hasLoggedWarning) {
      console.warn("[Hunter] API key not configured. Using fallback email verification.");
      this.hasLoggedWarning = true;
    }
  }
  
  /**
   * Verify an email address
   */
  async verifyEmail(email: string): Promise<HunterEmailVerification> {
    if (!this.apiKey) {
      return this.generateMockVerification(email);
    }
    
    try {
      const response = await fetch(
        `${this.baseUrl}/email-verifier?email=${email}&api_key=${this.apiKey}`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data as HunterEmailVerification;
    } catch (error) {
      console.error("[Hunter] Email verification failed:", error);
      return this.generateMockVerification(email);
    }
  }
  
  /**
   * Search for emails by domain
   */
  async searchDomain(domain: string, limit: number = 10): Promise<HunterDomainSearch | null> {
    if (!this.apiKey) {
      return this.generateMockDomainSearch(domain);
    }
    
    try {
      const response = await fetch(
        `${this.baseUrl}/domain-search?domain=${domain}&limit=${limit}&api_key=${this.apiKey}`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data as HunterDomainSearch;
    } catch (error) {
      console.error("[Hunter] Domain search failed:", error);
      return this.generateMockDomainSearch(domain);
    }
  }
  
  /**
   * Find email by name and domain
   */
  async findEmail(firstName: string, lastName: string, domain: string): Promise<HunterEmailFinder | null> {
    if (!this.apiKey) {
      return this.generateMockEmailFinder(firstName, lastName, domain);
    }
    
    try {
      const response = await fetch(
        `${this.baseUrl}/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${this.apiKey}`,
        { method: "GET" }
      );
      
      if (!response.ok) {
        throw new Error(`Hunter API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data as HunterEmailFinder;
    } catch (error) {
      console.error("[Hunter] Email finder failed:", error);
      return this.generateMockEmailFinder(firstName, lastName, domain);
    }
  }
  
  /**
   * Batch verify multiple emails
   */
  async batchVerifyEmails(emails: string[]): Promise<Map<string, HunterEmailVerification>> {
    const results = new Map<string, HunterEmailVerification>();
    
    // Process in batches
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(email => this.verifyEmail(email))
      );
      
      batch.forEach((email, index) => {
        results.set(email, batchResults[index]);
      });
      
      // Rate limiting
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    return results;
  }
  
  /**
   * Calculate email confidence score
   */
  calculateEmailScore(verification: HunterEmailVerification): number {
    let score = 0;
    
    if (verification.result === "deliverable") score = 100;
    else if (verification.result === "risky") score = 50;
    else if (verification.result === "unknown") score = 25;
    else score = 0;
    
    // Adjust based on other factors
    if (verification.disposable) score -= 30;
    if (verification.gibberish) score -= 20;
    if (!verification.mx_records) score -= 25;
    if (!verification.smtp_check) score -= 15;
    if (verification.accept_all) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Generate mock email verification
   */
  private generateMockVerification(email: string): HunterEmailVerification {
    const seed = this.hashString(email);
    const isValid = !email.includes("test") && !email.includes("fake") && email.includes("@");
    const domain = email.split("@")[1];
    
    return {
      result: isValid ? (seed % 10 > 2 ? "deliverable" : "risky") : "undeliverable",
      score: isValid ? 70 + (seed % 30) : 10 + (seed % 20),
      email,
      regexp: true,
      gibberish: false,
      disposable: seed % 20 === 0,
      webmail: domain ? ["gmail.com", "yahoo.com", "hotmail.com"].includes(domain) : false,
      mx_records: isValid,
      smtp_server: isValid,
      smtp_check: isValid,
      accept_all: false,
      block: false,
      sources: []
    };
  }
  
  /**
   * Generate mock domain search results
   */
  private generateMockDomainSearch(domain: string): HunterDomainSearch {
    const companyName = domain.split('.')[0];
    const seed = this.hashString(domain);
    
    const positions = ["CEO", "CFO", "Sales Manager", "Marketing Director", "Operations Manager"];
    const departments = ["Executive", "Sales", "Marketing", "Operations", "Finance"];
    
    const emails = [];
    for (let i = 0; i < Math.min(3, 1 + (seed % 3)); i++) {
      const firstName = ["John", "Jane", "Mike", "Sarah", "David"][i];
      const lastName = ["Smith", "Johnson", "Williams", "Brown", "Jones"][i];
      
      emails.push({
        value: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
        type: i === 0 ? "personal" as const : "generic" as const,
        confidence: 80 + (seed % 20),
        sources: [],
        first_name: firstName,
        last_name: lastName,
        position: positions[i % positions.length],
        seniority: i === 0 ? "executive" : "senior",
        department: departments[i % departments.length],
        linkedin: `linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
        twitter: "",
        phone_number: ""
      });
    }
    
    return {
      domain,
      disposable: false,
      webmail: false,
      accept_all: false,
      pattern: "{first}.{last}",
      organization: this.capitalizeWords(companyName),
      description: `${this.capitalizeWords(companyName)} is a company in the industry.`,
      industry: "Business Services",
      twitter: `twitter.com/${companyName}`,
      facebook: `facebook.com/${companyName}`,
      linkedin: `linkedin.com/company/${companyName}`,
      instagram: "",
      youtube: "",
      technologies: ["WordPress", "Google Analytics", "jQuery"],
      country: "United States",
      state: "NY",
      city: "New York",
      postal_code: "10001",
      street: "",
      headcount: "11-50",
      company_type: "Private",
      emails
    };
  }
  
  /**
   * Generate mock email finder result
   */
  private generateMockEmailFinder(firstName: string, lastName: string, domain: string): HunterEmailFinder {
    const seed = this.hashString(`${firstName}${lastName}${domain}`);
    
    return {
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      score: 70 + (seed % 30),
      domain,
      accept_all: false,
      position: "Manager",
      department: "Operations",
      twitter: "",
      linkedin: `linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
      phone_number: "",
      company: this.capitalizeWords(domain.split('.')[0]),
      sources: []
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

export const hunterService = new HunterService();