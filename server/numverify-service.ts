export interface NumverifyResponse {
  valid: boolean;
  number: string;
  local_format: string;
  international_format: string;
  country_prefix: string;
  country_code: string;
  country_name: string;
  location: string;
  carrier: string;
  line_type: string; // 'mobile', 'landline', 'voip', 'toll_free', 'premium_rate', 'special_services'
}

export interface NumverifyError {
  success: false;
  error: {
    code: number;
    type: string;
    info: string;
  };
}

export interface PhoneValidationResult {
  isValid: boolean;
  phoneNumber: string;
  formattedLocal?: string;
  formattedInternational?: string;
  countryCode?: string;
  countryName?: string;
  location?: string;
  carrier?: string;
  lineType?: string;
  riskScore: number; // 0-100, higher is riskier
  riskFactors: string[];
  enrichmentData?: Record<string, any>;
}

class NumverifyService {
  private baseUrl = 'http://apilayer.net/api/validate';
  private hasLoggedWarning = false;
  
  constructor() {
    // Check API key on first use, not at construction
  }
  
  private getApiKey(): string {
    const apiKey = process.env.NUMVERIFY_API_KEY || '';
    if (!apiKey && !this.hasLoggedWarning) {
      console.warn('[Numverify] API key not configured. Phone verification will use fallback validation.');
      this.hasLoggedWarning = true;
    }
    return apiKey;
  }
  
  /**
   * Validate and enrich a phone number using Numverify API
   */
  async validatePhone(phoneNumber: string, countryCode: string = 'US'): Promise<PhoneValidationResult> {
    // Clean phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Check for API key dynamically
    const apiKey = this.getApiKey();
    
    // If no API key, fall back to basic validation
    if (!apiKey) {
      return this.basicValidation(cleanPhone);
    }
    
    try {
      // Build API request
      const params = new URLSearchParams({
        access_key: apiKey,
        number: cleanPhone,
        country_code: countryCode,
        format: '1'
      });
      
      const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json() as NumverifyResponse | NumverifyError;
      
      // Check for API errors
      if ('error' in data) {
        console.error('[Numverify] API error:', data.error);
        return this.basicValidation(cleanPhone);
      }
      
      // Process successful response
      const result = data as NumverifyResponse;
      
      // Calculate risk score based on line type and validity
      const { riskScore, riskFactors } = this.calculateRiskScore(result);
      
      return {
        isValid: result.valid,
        phoneNumber: result.number,
        formattedLocal: result.local_format,
        formattedInternational: result.international_format,
        countryCode: result.country_code,
        countryName: result.country_name,
        location: result.location,
        carrier: result.carrier,
        lineType: result.line_type,
        riskScore,
        riskFactors,
        enrichmentData: {
          countryPrefix: result.country_prefix,
          rawResponse: result
        }
      };
      
    } catch (error) {
      console.error('[Numverify] Request failed:', error);
      return this.basicValidation(cleanPhone);
    }
  }
  
  /**
   * Batch validate multiple phone numbers
   */
  async validateBatch(phoneNumbers: string[], countryCode: string = 'US'): Promise<PhoneValidationResult[]> {
    // Numverify doesn't have a batch endpoint, so we'll process in parallel with rate limiting
    const batchSize = 5; // Process 5 at a time to avoid rate limits
    const results: PhoneValidationResult[] = [];
    
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(phone => this.validatePhone(phone, countryCode))
      );
      results.push(...batchResults);
      
      // Add small delay between batches to respect rate limits
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
  
  /**
   * Calculate risk score based on phone validation results
   */
  private calculateRiskScore(data: NumverifyResponse): { riskScore: number; riskFactors: string[] } {
    let riskScore = 0;
    const riskFactors: string[] = [];
    
    // Invalid number is highest risk
    if (!data.valid) {
      riskScore = 100;
      riskFactors.push('Invalid phone number');
      return { riskScore, riskFactors };
    }
    
    // Line type risk assessment
    switch (data.line_type) {
      case 'voip':
        riskScore += 40;
        riskFactors.push('VoIP number (higher fraud risk)');
        break;
      case 'toll_free':
        riskScore += 30;
        riskFactors.push('Toll-free number');
        break;
      case 'premium_rate':
        riskScore += 50;
        riskFactors.push('Premium rate number');
        break;
      case 'special_services':
        riskScore += 60;
        riskFactors.push('Special services number');
        break;
      case 'mobile':
        // Mobile is generally good for MCA leads
        riskScore += 5;
        break;
      case 'landline':
        // Landline is also good, indicates established business
        riskScore += 0;
        break;
    }
    
    // No carrier info might indicate issues
    if (!data.carrier || data.carrier === 'unknown') {
      riskScore += 15;
      riskFactors.push('Unknown carrier');
    }
    
    // Location-based risk (if no location, might be problematic)
    if (!data.location) {
      riskScore += 10;
      riskFactors.push('No location data');
    }
    
    return { riskScore: Math.min(riskScore, 100), riskFactors };
  }
  
  /**
   * Basic validation fallback when API is unavailable
   */
  private basicValidation(phone: string): PhoneValidationResult {
    const issues: string[] = [];
    let riskScore = 0;
    
    // Check length
    if (phone.length !== 10) {
      issues.push('Invalid phone length');
      riskScore = 100;
    }
    
    // Check for invalid patterns
    if (/^(\d)\1{9}$/.test(phone)) {
      issues.push('All same digits');
      riskScore = 100;
    }
    
    if (phone === '1234567890' || phone === '0123456789') {
      issues.push('Test number pattern');
      riskScore = 100;
    }
    
    // Check area code
    const areaCode = phone.substring(0, 3);
    const validAreaCodes = [
      '201', '202', '203', '205', '206', '207', '208', '209', '210', '212', '213', '214', '215', '216', '217', '218', '219',
      '224', '225', '228', '229', '231', '234', '239', '240', '248', '251', '252', '253', '254', '256', '260', '262', '267', '269', '270',
      '276', '281', '301', '302', '303', '304', '305', '307', '308', '309', '310', '312', '313', '314', '315', '316', '317', '318', '319', '320',
      '321', '323', '325', '330', '331', '334', '336', '337', '339', '340', '347', '351', '352', '360', '361', '364', '369', '380', '385', '386',
      '401', '402', '404', '405', '406', '407', '408', '409', '410', '412', '413', '414', '415', '417', '419', '423', '424', '425', '430', '432',
      '434', '435', '440', '442', '443', '445', '458', '463', '469', '470', '475', '478', '479', '480', '484', '501', '502', '503', '504', '505',
      '507', '508', '509', '510', '512', '513', '515', '516', '517', '518', '520', '530', '531', '534', '539', '540', '541', '551', '559', '561',
      '562', '563', '564', '567', '570', '571', '573', '574', '575', '580', '585', '586', '601', '602', '603', '605', '606', '607', '608', '609',
      '610', '612', '614', '615', '616', '617', '618', '619', '620', '623', '626', '628', '629', '630', '631', '636', '641', '646', '650', '651',
      '657', '659', '660', '661', '662', '667', '669', '678', '681', '682', '684', '689', '701', '702', '703', '704', '706', '707', '708', '712',
      '713', '714', '715', '716', '717', '718', '719', '720', '724', '725', '727', '731', '732', '734', '737', '740', '743', '747', '754', '757',
      '760', '762', '763', '765', '769', '770', '772', '773', '774', '775', '779', '781', '785', '786', '801', '802', '803', '804', '805', '806',
      '808', '810', '812', '813', '814', '815', '816', '817', '818', '828', '830', '831', '832', '843', '845', '847', '848', '850', '854', '856',
      '857', '858', '859', '860', '862', '863', '864', '865', '870', '872', '878', '901', '903', '904', '906', '907', '908', '909', '910', '912',
      '913', '914', '915', '916', '917', '918', '919', '920', '925', '928', '929', '930', '931', '936', '937', '938', '940', '941', '947', '949',
      '951', '952', '954', '956', '959', '970', '971', '972', '973', '978', '979', '980', '984', '985', '989'
    ];
    
    if (!validAreaCodes.includes(areaCode)) {
      issues.push('Invalid area code');
      riskScore += 30;
    }
    
    // Format phone
    const formatted = phone.length === 10 
      ? `(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`
      : phone;
    
    return {
      isValid: issues.length === 0,
      phoneNumber: phone,
      formattedLocal: formatted,
      riskScore,
      riskFactors: issues
    };
  }
  
  /**
   * Enrich phone data with additional information
   */
  async enrichPhone(phone: string): Promise<Record<string, any>> {
    const validation = await this.validatePhone(phone);
    
    return {
      ...validation,
      enrichedAt: new Date().toISOString(),
      dataSource: this.getApiKey() ? 'numverify' : 'basic',
      qualityIndicators: {
        hasCarrier: !!validation.carrier,
        hasLocation: !!validation.location,
        isBusinessLine: validation.lineType === 'landline',
        isMobile: validation.lineType === 'mobile',
        isHighRisk: validation.riskScore > 60
      }
    };
  }
}

// Export singleton instance
export const numverifyService = new NumverifyService();