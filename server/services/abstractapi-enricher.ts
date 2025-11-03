// AbstractAPI Company Enrichment Service
import axios from 'axios';

export class AbstractAPIEnricher {
  private apiKey: string;
  private baseUrl = 'https://companyenrichment.abstractapi.com/v1';
  
  constructor() {
    this.apiKey = process.env.ABSTRACTAPI_KEY || '';
  }
  
  async enrichCompany(domainOrName: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('AbstractAPI key not configured');
    }
    
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          api_key: this.apiKey,
          domain: this.extractDomain(domainOrName) || domainOrName
        }
      });
      
      if (!response.data) return null;
      
      return {
        company_name: response.data.name,
        company_domain: response.data.domain,
        company_logo: response.data.logo,
        company_description: response.data.description,
        year_founded: response.data.year_founded,
        employees_range: response.data.employees_range,
        employees_count: response.data.employees_count,
        annual_revenue: response.data.annual_revenue,
        industry: response.data.industry,
        locality: response.data.locality,
        country: response.data.country,
        linkedin_url: response.data.linkedin_url
      };
    } catch (error: any) {
      console.error('AbstractAPI enrichment error:', error.message);
      return null;
    }
  }
  
  private extractDomain(input: string): string | null {
    // Extract domain from URL or email
    const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    if (urlMatch) return urlMatch[1];
    
    const emailMatch = input.match(/@(.+)$/);
    if (emailMatch) return emailMatch[1];
    
    return null;
  }
}