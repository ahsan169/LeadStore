// Hunter.io Email Verification Service
const axios = require('axios') as any;

export class HunterVerifier {
  private apiKey: string;
  private baseUrl = 'https://api.hunter.io/v2';
  
  constructor() {
    this.apiKey = process.env.HUNTER_API_KEY || '';
  }
  
  async verifyEmail(email: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Hunter.io API key not configured');
    }
    
    try {
      const response = await axios.get(`${this.baseUrl}/email-verifier`, {
        params: {
          email,
          api_key: this.apiKey
        }
      });
      
      return {
        email_verified: response.data.data.status === 'valid',
        email_confidence: response.data.data.score,
        email_status: response.data.data.status,
        email_accept_all: response.data.data.accept_all,
        email_deliverable: response.data.data.deliverable,
        email_sources: response.data.data.sources?.length || 0
      };
    } catch (error: any) {
      console.error('Hunter.io verification error:', error.message);
      return null;
    }
  }
  
  async findEmail(domain: string, firstName?: string, lastName?: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('Hunter.io API key not configured');
    }
    
    try {
      const response = await axios.get(`${this.baseUrl}/email-finder`, {
        params: {
          domain,
          first_name: firstName,
          last_name: lastName,
          api_key: this.apiKey
        }
      });
      
      return {
        email: response.data.data.email,
        email_confidence: response.data.data.score,
        email_sources: response.data.data.sources
      };
    } catch (error: any) {
      console.error('Hunter.io email finder error:', error.message);
      return null;
    }
  }
}