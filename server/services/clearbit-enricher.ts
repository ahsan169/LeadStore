// Clearbit Premium Data Enrichment Service
const axios = require('axios') as any;

export class ClearbitEnricher {
  private apiKey: string;
  private baseUrl = 'https://company.clearbit.com/v2';
  
  constructor() {
    this.apiKey = process.env.CLEARBIT_API_KEY || '';
  }
  
  async enrichCompany(emailOrDomain: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Clearbit API key not configured');
    }
    
    try {
      const domain = this.extractDomain(emailOrDomain);
      if (!domain) return null;
      
      const response = await axios.get(`${this.baseUrl}/companies/find`, {
        params: { domain },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      if (!response.data) return null;
      
      return {
        // Company identifiers
        company_name: response.data.name,
        legal_name: response.data.legalName,
        domain: response.data.domain,
        domain_aliases: response.data.domainAliases,
        
        // Company details  
        description: response.data.description,
        category: response.data.category,
        industry: response.data.industry,
        industry_group: response.data.industryGroup,
        sub_industry: response.data.subIndustry,
        tags: response.data.tags,
        
        // Company metrics
        employees: response.data.metrics?.employees,
        employees_range: response.data.metrics?.employeesRange,
        estimated_annual_revenue: response.data.metrics?.estimatedAnnualRevenue,
        fiscal_year_end: response.data.metrics?.fiscalYearEnd,
        market_cap: response.data.metrics?.marketCap,
        raised: response.data.metrics?.raised,
        
        // Location
        location: response.data.location,
        geo: response.data.geo,
        time_zone: response.data.timeZone,
        utc_offset: response.data.utcOffset,
        
        // Tech stack
        tech_stack: response.data.tech,
        tech_categories: response.data.techCategories,
        
        // Company structure
        parent_domain: response.data.parent?.domain,
        ultimate_parent: response.data.ultimateParent?.domain,
        
        // Social & web presence
        logo: response.data.logo,
        facebook_handle: response.data.facebook?.handle,
        linkedin_handle: response.data.linkedin?.handle,
        twitter_handle: response.data.twitter?.handle,
        twitter_followers: response.data.twitter?.followers,
        
        // Additional data
        phone: response.data.phone,
        indexed_at: response.data.indexedAt,
        clearbit_id: response.data.id
      };
    } catch (error: any) {
      console.error('Clearbit enrichment error:', error.message);
      return null;
    }
  }
  
  async enrichPerson(email: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Clearbit API key not configured');
    }
    
    try {
      const response = await axios.get('https://person.clearbit.com/v2/people/find', {
        params: { email },
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      if (!response.data) return null;
      
      return {
        // Personal info
        full_name: response.data.name?.fullName,
        given_name: response.data.name?.givenName,
        family_name: response.data.name?.familyName,
        
        // Professional info
        email: response.data.email,
        email_verified: true,
        role: response.data.employment?.role,
        seniority: response.data.employment?.seniority,
        title: response.data.employment?.title,
        company_name: response.data.employment?.name,
        company_domain: response.data.employment?.domain,
        
        // Location
        location: response.data.location,
        time_zone: response.data.timeZone,
        city: response.data.geo?.city,
        state: response.data.geo?.state,
        country: response.data.geo?.country,
        
        // Social profiles
        linkedin_url: response.data.linkedin?.handle ? `https://linkedin.com/in/${response.data.linkedin.handle}` : null,
        twitter_handle: response.data.twitter?.handle,
        github_handle: response.data.github?.handle,
        facebook_handle: response.data.facebook?.handle,
        
        // Additional
        bio: response.data.bio,
        avatar: response.data.avatar,
        clearbit_person_id: response.data.id
      };
    } catch (error: any) {
      console.error('Clearbit person enrichment error:', error.message);
      return null;
    }
  }
  
  private extractDomain(input: string): string | null {
    // Extract domain from email
    if (input.includes('@')) {
      return input.split('@')[1];
    }
    
    // Extract domain from URL
    const urlMatch = input.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    if (urlMatch) return urlMatch[1];
    
    // Assume it's already a domain
    return input;
  }
}