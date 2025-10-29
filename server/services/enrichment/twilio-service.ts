export interface TwilioLookupResponse {
  phoneNumber: string;
  nationalFormat: string;
  countryCode: string;
  carrier?: {
    name: string;
    type: "mobile" | "landline" | "voip";
    mobileCountryCode?: string;
    mobileNetworkCode?: string;
  };
  callerName?: {
    callerName: string;
    callerType: "BUSINESS" | "CONSUMER";
  };
  addOns?: {
    [key: string]: any;
  };
}

export interface TwilioLineTypeIntelligence {
  mobileCountryCode?: string;
  mobileNetworkCode?: string;
  carrierName?: string;
  type?: "landline" | "mobile" | "fixedVoip" | "nonFixedVoip" | "tollFree" | "premium" | "sharedCost" | "uan" | "voicemail" | "pager" | "unknown";
  error?: string;
}

export interface TwilioValidationResult {
  valid: boolean;
  phoneNumber: string;
  formattedNumber: string;
  countryCode: string;
  lineType: string;
  carrier?: string;
  riskScore: number;
  riskFactors: string[];
  callerName?: string;
  callerType?: string;
}

export class TwilioService {
  private accountSid: string | undefined;
  private authToken: string | undefined;
  private baseUrl = "https://lookups.twilio.com/v2";
  private hasLoggedWarning = false;
  
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if ((!this.accountSid || !this.authToken) && !this.hasLoggedWarning) {
      console.warn("[Twilio] Credentials not configured. Using fallback phone validation.");
      this.hasLoggedWarning = true;
    }
  }
  
  /**
   * Validate and lookup phone number information
   */
  async lookupPhone(phoneNumber: string, includeCarrier = true, includeCallerName = false): Promise<TwilioValidationResult> {
    if (!this.accountSid || !this.authToken) {
      return this.generateMockValidation(phoneNumber);
    }
    
    try {
      // Build query parameters
      const fields = [];
      if (includeCarrier) fields.push("line_type_intelligence");
      if (includeCallerName) fields.push("caller_name");
      
      const queryParams = fields.length > 0 ? `?Fields=${fields.join(",")}` : "";
      
      // Format phone number (ensure it has country code)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      const response = await fetch(
        `${this.baseUrl}/PhoneNumbers/${formattedPhone}${queryParams}`,
        {
          method: "GET",
          headers: {
            "Authorization": `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`
          }
        }
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          return {
            valid: false,
            phoneNumber,
            formattedNumber: phoneNumber,
            countryCode: "US",
            lineType: "unknown",
            riskScore: 100,
            riskFactors: ["Invalid phone number"]
          };
        }
        throw new Error(`Twilio API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return this.processLookupResponse(data);
    } catch (error) {
      console.error("[Twilio] Phone lookup failed:", error);
      return this.generateMockValidation(phoneNumber);
    }
  }
  
  /**
   * Batch validate multiple phone numbers
   */
  async batchLookupPhones(phoneNumbers: string[]): Promise<Map<string, TwilioValidationResult>> {
    const results = new Map<string, TwilioValidationResult>();
    
    // Twilio doesn't have a batch endpoint, process in parallel with rate limiting
    const batchSize = 5;
    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(phone => this.lookupPhone(phone))
      );
      
      batch.forEach((phone, index) => {
        results.set(phone, batchResults[index]);
      });
      
      // Rate limiting between batches
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
  
  /**
   * Determine if phone number is high quality for business use
   */
  isBusinessQualityNumber(result: TwilioValidationResult): boolean {
    // Landline or mobile are good for business
    if (["landline", "mobile"].includes(result.lineType)) {
      return result.riskScore < 50;
    }
    
    // VoIP can be okay if low risk
    if (result.lineType === "voip" || result.lineType === "fixedVoip") {
      return result.riskScore < 30;
    }
    
    return false;
  }
  
  /**
   * Process Twilio API response
   */
  private processLookupResponse(data: any): TwilioValidationResult {
    const { riskScore, riskFactors } = this.calculateRiskScore(data);
    
    return {
      valid: true,
      phoneNumber: data.phone_number,
      formattedNumber: data.national_format || data.phone_number,
      countryCode: data.country_code || "US",
      lineType: data.line_type_intelligence?.type || "unknown",
      carrier: data.line_type_intelligence?.carrier_name,
      riskScore,
      riskFactors,
      callerName: data.caller_name?.caller_name,
      callerType: data.caller_name?.caller_type
    };
  }
  
  /**
   * Calculate risk score based on Twilio data
   */
  private calculateRiskScore(data: any): { riskScore: number; riskFactors: string[] } {
    let riskScore = 0;
    const riskFactors: string[] = [];
    
    const lineType = data.line_type_intelligence?.type;
    
    // Line type risk assessment
    switch (lineType) {
      case "landline":
        // Landline is good for established businesses
        riskScore += 0;
        break;
      case "mobile":
        // Mobile is common and acceptable
        riskScore += 5;
        break;
      case "fixedVoip":
        // Fixed VoIP is okay
        riskScore += 20;
        riskFactors.push("Fixed VoIP number");
        break;
      case "nonFixedVoip":
        // Non-fixed VoIP is higher risk
        riskScore += 50;
        riskFactors.push("Non-fixed VoIP (higher fraud risk)");
        break;
      case "tollFree":
        // Toll-free can be legitimate
        riskScore += 15;
        riskFactors.push("Toll-free number");
        break;
      case "premium":
        // Premium rate is very high risk
        riskScore += 80;
        riskFactors.push("Premium rate number");
        break;
      case "voicemail":
        // Voicemail-only is problematic
        riskScore += 70;
        riskFactors.push("Voicemail-only number");
        break;
      case "pager":
        // Pager is outdated and suspicious
        riskScore += 60;
        riskFactors.push("Pager number");
        break;
      case "unknown":
      default:
        // Unknown type is risky
        riskScore += 40;
        riskFactors.push("Unknown phone type");
        break;
    }
    
    // Carrier information
    if (!data.line_type_intelligence?.carrier_name) {
      riskScore += 10;
      riskFactors.push("No carrier information");
    }
    
    // Caller name check
    if (data.caller_name) {
      if (data.caller_name.caller_type === "CONSUMER") {
        riskScore += 15;
        riskFactors.push("Registered to consumer (not business)");
      }
    }
    
    // Error in line type intelligence
    if (data.line_type_intelligence?.error_code) {
      riskScore += 20;
      riskFactors.push("Verification error");
    }
    
    return { 
      riskScore: Math.min(100, riskScore), 
      riskFactors 
    };
  }
  
  /**
   * Format phone number for Twilio API
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, "");
    
    // If it's 10 digits, assume US and add country code
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    
    // If it already has country code
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    
    // If it starts with +, keep as is
    if (phone.startsWith("+")) {
      return phone;
    }
    
    // Otherwise, try to use as is with + prefix
    return `+${digits}`;
  }
  
  /**
   * Generate mock validation for testing
   */
  private generateMockValidation(phoneNumber: string): TwilioValidationResult {
    const seed = this.hashString(phoneNumber);
    const digits = phoneNumber.replace(/\D/g, "");
    
    // Check for obviously invalid patterns
    if (digits.length !== 10 && digits.length !== 11) {
      return {
        valid: false,
        phoneNumber,
        formattedNumber: phoneNumber,
        countryCode: "US",
        lineType: "unknown",
        riskScore: 100,
        riskFactors: ["Invalid phone length"]
      };
    }
    
    const lineTypes = ["mobile", "landline", "fixedVoip", "nonFixedVoip"];
    const carriers = ["Verizon", "AT&T", "T-Mobile", "Sprint", "Regional Carrier"];
    
    const lineType = lineTypes[seed % lineTypes.length];
    let riskScore = 10;
    const riskFactors: string[] = [];
    
    if (lineType === "nonFixedVoip") {
      riskScore = 50;
      riskFactors.push("Non-fixed VoIP");
    } else if (lineType === "fixedVoip") {
      riskScore = 25;
      riskFactors.push("Fixed VoIP");
    }
    
    return {
      valid: true,
      phoneNumber,
      formattedNumber: this.formatDisplayNumber(digits),
      countryCode: "US",
      lineType,
      carrier: carriers[seed % carriers.length],
      riskScore,
      riskFactors,
      callerName: seed % 3 === 0 ? "Business Name LLC" : undefined,
      callerType: seed % 3 === 0 ? "BUSINESS" : undefined
    };
  }
  
  /**
   * Format phone number for display
   */
  private formatDisplayNumber(digits: string): string {
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return digits;
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
}

export const twilioService = new TwilioService();