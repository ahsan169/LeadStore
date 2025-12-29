import OpenAI from 'openai';
import { CanonicalField } from '../intelligence/ontology';

interface FieldUnderstandingRequest {
  fieldName: string;
  sampleValues: string[];
  context?: string;
}

interface FieldUnderstandingResponse {
  canonicalField: CanonicalField | null;
  confidence: number;
  explanation: string;
  isCompound?: boolean;
  compoundFields?: {
    field: CanonicalField;
    extractionPattern?: string;
  }[];
  dataType?: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'phone' | 'email';
  format?: string;
}

export class OpenAIService {
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  private isEnabled(): boolean {
    return this.openai !== null;
  }

  /**
   * Use AI to understand ambiguous field names
   */
  async understandField(request: FieldUnderstandingRequest): Promise<FieldUnderstandingResponse> {
    if (!this.isEnabled()) {
      return {
        canonicalField: null,
        confidence: 0,
        explanation: 'OpenAI service not configured'
      };
    }

    try {
      // Prepare sample values for analysis
      const valueSamples = request.sampleValues
        .filter(v => v && v.trim())
        .slice(0, 5)
        .join(', ');

      const prompt = `Analyze this CSV field and map it to the correct field type for a MCA/business lead system.

Field Name: ${request.fieldName}
Sample Values: ${valueSamples}
${request.context ? `Context: ${request.context}` : ''}

Available canonical fields:
- businessName: Company/business name
- ownerName: Owner/contact full name
- firstName: First name only
- lastName: Last name only
- email: Email address
- phone: Primary phone number
- secondaryPhone: Additional phone
- industry: Business industry/sector
- annualRevenue: Yearly revenue
- monthlyRevenue: Monthly revenue
- requestedAmount: Funding amount requested
- creditScore: FICO/credit score
- yearFounded: Year business was established
- yearsInBusiness: How long in business
- timeInBusiness: Duration in business
- street: Street address
- city: City name
- state: State code
- zipCode: ZIP/postal code
- websiteUrl: Website URL
- linkedinUrl: LinkedIn profile
- uccNumber: UCC filing number
- filingDate: Date of filing
- securedParty: Lender/creditor name
- ein: Tax ID/EIN
- naicsCode: NAICS industry code
- sicCode: SIC industry code
- dailyBankDeposits: Daily deposit amount
- urgencyLevel: Funding urgency
- fundingPurpose: Why funding is needed
- businessDescription: Company description
- leadSource: Where lead came from

Respond in JSON format:
{
  "canonicalField": "field name or null if no match",
  "confidence": 0.0-1.0,
  "explanation": "why this mapping",
  "isCompound": true/false,
  "compoundFields": [{"field": "fieldName"}] if compound,
  "dataType": "string/number/date/boolean/currency/phone/email",
  "format": "detected format pattern if applicable"
}`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing CSV fields and mapping them to canonical database fields for business lead systems. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Map the canonical field string to the enum
      let canonicalField: CanonicalField | null = null;
      if (result.canonicalField) {
        canonicalField = Object.values(CanonicalField).find(
          field => field === result.canonicalField
        ) || null;
      }

      return {
        canonicalField,
        confidence: result.confidence || 0,
        explanation: result.explanation || '',
        isCompound: result.isCompound || false,
        compoundFields: result.compoundFields?.map((cf: any) => ({
          field: Object.values(CanonicalField).find(f => f === cf.field) || CanonicalField.BUSINESS_NAME,
          extractionPattern: cf.extractionPattern
        })),
        dataType: result.dataType,
        format: result.format
      };

    } catch (error) {
      console.error('Error understanding field with AI:', error);
      return {
        canonicalField: null,
        confidence: 0,
        explanation: 'Error analyzing field with AI'
      };
    }
  }

  /**
   * Extract structured data from unstructured text
   */
  async extractLeadFromText(text: string): Promise<Record<string, any>> {
    if (!this.isEnabled()) {
      return {};
    }

    try {
      const prompt = `Extract business lead information from this text and return as JSON.
Look for: business name, owner name, phone, email, address, city, state, ZIP, industry, revenue, funding needs, etc.

Text:
${text}

Return a JSON object with any found fields. Use these exact field names:
businessName, ownerName, firstName, lastName, email, phone, street, city, state, zipCode, 
industry, annualRevenue, monthlyRevenue, requestedAmount, creditScore, yearFounded, 
websiteUrl, linkedinUrl, urgencyLevel, businessDescription

Only include fields that have clear values in the text.`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at extracting structured business lead data from unstructured text. Return only valid JSON with extracted fields.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{}');

    } catch (error) {
      console.error('Error extracting lead data with AI:', error);
      return {};
    }
  }

  /**
   * Understand compound fields and how to split them
   */
  async understandCompoundField(fieldName: string, sampleValues: string[]): Promise<{
    fields: { field: CanonicalField; extractionLogic: string }[];
    confidence: number;
  }> {
    if (!this.isEnabled()) {
      return { fields: [], confidence: 0 };
    }

    try {
      const valueSamples = sampleValues.filter(v => v && v.trim()).slice(0, 5);

      const prompt = `This field appears to contain multiple pieces of information. Analyze how to split it.

Field Name: ${fieldName}
Sample Values:
${valueSamples.map(v => `"${v}"`).join('\n')}

Common patterns:
- "John Smith" → firstName: "John", lastName: "Smith"
- "123 Main St, New York, NY 10001" → street: "123 Main St", city: "New York", state: "NY", zipCode: "10001"
- "ABC Corp (Founded 2010)" → businessName: "ABC Corp", yearFounded: 2010
- "555-1234 ext 567" → phone: "555-1234", extension: "567"

Analyze the pattern and provide extraction logic. Return JSON:
{
  "fields": [
    {
      "field": "canonicalFieldName",
      "extractionLogic": "how to extract this part (e.g., 'split by space, take first part')"
    }
  ],
  "confidence": 0.0-1.0,
  "pattern": "detected pattern description"
}`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at parsing compound fields in CSV data. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Map field strings to enums
      const fields = (result.fields || []).map((f: any) => ({
        field: Object.values(CanonicalField).find(cf => cf === f.field) || CanonicalField.BUSINESS_NAME,
        extractionLogic: f.extractionLogic
      }));

      return {
        fields,
        confidence: result.confidence || 0
      };

    } catch (error) {
      console.error('Error understanding compound field with AI:', error);
      return { fields: [], confidence: 0 };
    }
  }

  /**
   * Validate and fix data using AI understanding
   */
  async validateAndFixData(field: CanonicalField, value: string): Promise<{
    valid: boolean;
    fixedValue?: string;
    confidence: number;
    issue?: string;
  }> {
    if (!this.isEnabled() || !value) {
      return { valid: true, confidence: 0 };
    }

    try {
      const fieldContext = {
        [CanonicalField.PHONE]: 'US phone number (10 digits)',
        [CanonicalField.EMAIL]: 'Valid email address',
        [CanonicalField.ZIP_CODE]: 'US ZIP code (5 or 9 digits)',
        [CanonicalField.STATE]: 'US state code (2 letters)',
        [CanonicalField.CREDIT_SCORE]: 'FICO credit score (300-850)',
        [CanonicalField.EIN]: 'Federal EIN (XX-XXXXXXX format)',
        [CanonicalField.ANNUAL_REVENUE]: 'Annual revenue in dollars'
      };

      const context = (fieldContext as any)[field] || 'business data field';

      const prompt = `Validate and potentially fix this ${context}.

Field type: ${field}
Value: "${value}"

If the value is valid, return as-is.
If it can be fixed (e.g., formatting), provide the corrected version.
If it's invalid and can't be fixed, explain why.

Respond in JSON:
{
  "valid": true/false,
  "fixedValue": "corrected value if applicable",
  "confidence": 0.0-1.0,
  "issue": "description of any issues found"
}`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at validating and correcting business data fields. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' }
      });

      return JSON.parse(response.choices[0].message.content || '{"valid": false, "confidence": 0}');

    } catch (error) {
      console.error('Error validating data with AI:', error);
      return { valid: true, confidence: 0 };
    }
  }
}

// Export singleton instance
export const openAIService = new OpenAIService();