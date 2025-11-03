// Proxycurl LinkedIn & Professional Data Enrichment Service
import axios from 'axios';

export class ProxycurlEnricher {
  private apiKey: string;
  private baseUrl = 'https://nubela.co/proxycurl/api/v2';
  
  constructor() {
    this.apiKey = process.env.PROXYCURL_API_KEY || '';
  }
  
  async enrichCompany(companyName: string, website?: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Proxycurl API key not configured');
    }
    
    try {
      // First, try to find company LinkedIn URL
      const linkedinUrl = await this.findCompanyLinkedIn(companyName, website);
      if (!linkedinUrl) return null;
      
      // Get company profile data
      const response = await axios.get(`${this.baseUrl}/linkedin/company`, {
        params: { url: linkedinUrl },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      return {
        linkedin_url: linkedinUrl,
        company_size: response.data.company_size,
        employee_count: response.data.employee_count,
        founded_year: response.data.founded_year,
        headquarters: response.data.locations?.[0],
        specialties: response.data.specialities,
        industry: response.data.industry,
        company_type: response.data.company_type,
        tagline: response.data.tagline,
        universal_name: response.data.universal_name,
        follower_count: response.data.follower_count,
        funding_data: response.data.funding_data,
        acquisitions: response.data.acquisitions,
        exit_data: response.data.exit_data
      };
    } catch (error: any) {
      console.error('Proxycurl company enrichment error:', error.message);
      return null;
    }
  }
  
  async enrichPerson(name: string, email?: string, companyName?: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Proxycurl API key not configured');
    }
    
    try {
      // Find person's LinkedIn profile
      const searchResponse = await axios.get(`${this.baseUrl}/linkedin/person/lookup`, {
        params: {
          email: email,
          company_domain: companyName,
          similarity_checks: 'include'
        },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      if (!searchResponse.data.url) return null;
      
      // Get full profile
      const profileResponse = await axios.get(`${this.baseUrl}/linkedin/person`, {
        params: { 
          url: searchResponse.data.url,
          use_cache: 'if-present'
        },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      return {
        linkedin_url: searchResponse.data.url,
        full_name: profileResponse.data.full_name,
        job_title: profileResponse.data.occupation,
        headline: profileResponse.data.headline,
        summary: profileResponse.data.summary,
        location: profileResponse.data.country_full_name,
        experiences: profileResponse.data.experiences,
        education: profileResponse.data.education,
        skills: profileResponse.data.skills,
        languages: profileResponse.data.languages,
        certifications: profileResponse.data.certifications
      };
    } catch (error: any) {
      console.error('Proxycurl person enrichment error:', error.message);
      return null;
    }
  }
  
  private async findCompanyLinkedIn(companyName: string, website?: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/linkedin/company/resolve`, {
        params: {
          company_name: companyName,
          company_domain: website
        },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      return response.data.url;
    } catch (error) {
      return null;
    }
  }
}