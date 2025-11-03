// PeopleDataLabs Premium Person & Company Enrichment Service
import axios from 'axios';

export class PeopleDataLabsEnricher {
  private apiKey: string;
  private baseUrl = 'https://api.peopledatalabs.com/v5';
  
  constructor() {
    this.apiKey = process.env.PEOPLEDATALABS_API_KEY || '';
  }
  
  async enrichPerson(name?: string, email?: string, phone?: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('PeopleDataLabs API key not configured');
    }
    
    try {
      const params: any = {};
      if (email) params.email = email;
      if (name) params.name = name;
      if (phone) params.phone = phone;
      
      const response = await axios.get(`${this.baseUrl}/person/enrich`, {
        params,
        headers: { 'X-Api-Key': this.apiKey }
      });
      
      if (!response.data?.data) return null;
      const person = response.data.data;
      
      return {
        // Identity
        full_name: person.full_name,
        first_name: person.first_name,
        last_name: person.last_name,
        middle_name: person.middle_name,
        
        // Contact info
        emails: person.emails,
        phone_numbers: person.phone_numbers,
        
        // Professional
        job_title: person.job_title,
        job_title_role: person.job_title_role,
        job_title_levels: person.job_title_levels,
        job_company_name: person.job_company_name,
        job_company_website: person.job_company_website,
        job_company_industry: person.job_company_industry,
        job_company_size: person.job_company_size,
        job_start_date: person.job_start_date,
        
        // Work history
        experience: person.experience?.map((exp: any) => ({
          company: exp.company?.name,
          title: exp.title?.name,
          start_date: exp.start_date,
          end_date: exp.end_date,
          is_current: exp.is_current
        })),
        
        // Education
        education: person.education?.map((edu: any) => ({
          school: edu.school?.name,
          degree: edu.degrees?.join(', '),
          field_of_study: edu.majors?.join(', '),
          start_date: edu.start_date,
          end_date: edu.end_date
        })),
        
        // Skills & interests
        skills: person.skills,
        interests: person.interests,
        
        // Location
        location: person.location_name,
        location_country: person.location_country,
        location_continent: person.location_continent,
        location_street_address: person.location_street_address,
        location_postal_code: person.location_postal_code,
        
        // Social profiles
        linkedin_url: person.linkedin_url,
        linkedin_id: person.linkedin_id,
        facebook_url: person.facebook_url,
        twitter_url: person.twitter_url,
        github_url: person.github_url,
        
        // Additional metadata
        pdl_id: person.id,
        likelihood: response.data.likelihood
      };
    } catch (error: any) {
      console.error('PeopleDataLabs person enrichment error:', error.message);
      return null;
    }
  }
  
  async enrichCompany(name?: string, website?: string, location?: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('PeopleDataLabs API key not configured');
    }
    
    try {
      const params: any = {};
      if (name) params.name = name;
      if (website) params.website = website;
      if (location) params.location = location;
      
      const response = await axios.get(`${this.baseUrl}/company/enrich`, {
        params,
        headers: { 'X-Api-Key': this.apiKey }
      });
      
      if (!response.data) return null;
      const company = response.data;
      
      return {
        // Company info
        name: company.name,
        website: company.website,
        display_name: company.display_name,
        
        // Company details
        size: company.size,
        employee_count: company.employee_count,
        industry: company.industry,
        naics: company.naics,
        sic: company.sic,
        
        // Description & summary
        summary: company.summary,
        tags: company.tags,
        
        // Founded info
        founded: company.founded,
        
        // Location
        location: {
          name: company.location?.name,
          locality: company.location?.locality,
          region: company.location?.region,
          metro: company.location?.metro,
          country: company.location?.country,
          continent: company.location?.continent,
          street_address: company.location?.street_address,
          address_line_2: company.location?.address_line_2,
          postal_code: company.location?.postal_code
        },
        
        // Social profiles
        linkedin_url: company.linkedin_url,
        linkedin_id: company.linkedin_id,
        facebook_url: company.facebook_url,
        twitter_url: company.twitter_url,
        
        // Contact
        profiles: company.profiles,
        
        // Funding
        total_funding_raised: company.total_funding_raised,
        latest_funding_stage: company.latest_funding_stage,
        latest_funding_date: company.latest_funding_date,
        number_funding_rounds: company.number_funding_rounds,
        
        // Additional
        pdl_id: company.id,
        ticker: company.ticker,
        type: company.type,
        likelihood: company.likelihood
      };
    } catch (error: any) {
      console.error('PeopleDataLabs company enrichment error:', error.message);
      return null;
    }
  }
  
  async searchCompanies(query: string, size: number = 10): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('PeopleDataLabs API key not configured');
    }
    
    try {
      const response = await axios.post(`${this.baseUrl}/company/search`, 
        {
          query: { query_string: { query } },
          size
        },
        {
          headers: { 
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data?.data || [];
    } catch (error: any) {
      console.error('PeopleDataLabs search error:', error.message);
      return [];
    }
  }
}