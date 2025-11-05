/**
 * MCA/UCC Lead Intelligence Ontology
 * Central repository for field definitions, synonyms, validators, and normalizers
 */

import { z } from 'zod';

/**
 * Canonical field names - the standardized field names we use internally
 */
export enum CanonicalField {
  // Business fields
  BUSINESS_NAME = 'businessName',
  BUSINESS_TYPE = 'businessType',
  INDUSTRY = 'industry',
  NAICS_CODE = 'naicsCode',
  SIC_CODE = 'sicCode',
  EIN = 'ein',
  YEAR_FOUNDED = 'yearFounded',
  YEARS_IN_BUSINESS = 'yearsInBusiness',
  TIME_IN_BUSINESS = 'timeInBusiness',
  
  // Contact fields
  OWNER_NAME = 'ownerName',
  CONTACT_NAME = 'contactName',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  EMAIL = 'email',
  PHONE = 'phone',
  SECONDARY_PHONE = 'secondaryPhone',
  MOBILE_PHONE = 'mobilePhone',
  WORK_PHONE = 'workPhone',
  
  // Address fields
  FULL_ADDRESS = 'fullAddress',
  STREET = 'street',
  CITY = 'city',
  STATE = 'state',
  ZIP_CODE = 'zipCode',
  COUNTRY = 'country',
  
  // Financial fields
  ANNUAL_REVENUE = 'annualRevenue',
  MONTHLY_REVENUE = 'monthlyRevenue',
  GROSS_SALES = 'grossSales',
  REQUESTED_AMOUNT = 'requestedAmount',
  CREDIT_SCORE = 'creditScore',
  DAILY_BANK_DEPOSITS = 'dailyBankDeposits',
  AVERAGE_DAILY_BALANCE = 'averageDailyBalance',
  
  // UCC fields
  UCC_NUMBER = 'uccNumber',
  FILING_NUMBER = 'filingNumber',
  FILING_DATE = 'filingDate',
  FILING_TYPE = 'filingType',
  EXPIRY_DATE = 'expiryDate',
  SECURED_PARTY = 'securedParty',
  COLLATERAL_TYPE = 'collateralType',
  LENDER_NAME = 'lenderName',
  FILING_STATE = 'filingState',
  DEBTOR_NAME = 'debtorName',
  JURISDICTION = 'jurisdiction',
  
  // MCA specific fields
  PREVIOUS_MCA = 'previousMca',
  CURRENT_POSITIONS = 'currentPositions',
  URGENCY_LEVEL = 'urgencyLevel',
  FUNDING_PURPOSE = 'fundingPurpose',
  STACKING_RISK = 'stackingRisk',
  
  // Meta fields
  LEAD_SOURCE = 'leadSource',
  LEAD_AGE = 'leadAge',
  LAST_CONTACT_DATE = 'lastContactDate',
  QUALITY_SCORE = 'qualityScore'
}

/**
 * Field synonym mappings - all variations that map to canonical fields
 */
export const FIELD_SYNONYMS: Record<CanonicalField, string[]> = {
  [CanonicalField.BUSINESS_NAME]: [
    'businessname', 'business name', 'business_name', 'business-name',
    'company name', 'companyname', 'company_name', 'company-name', 
    'company', 'business', 'dba', 'legal name', 'legal_name',
    'firm name', 'firm_name', 'organization', 'corp', 'corporation',
    'enterprise', 'establishment', 'vendor', 'merchant', 'merchant name',
    'debtor', 'debtor name', 'debtor_name', 'debtor-name', 'entity',
    'business entity', 'corporate name', 'trade name', 'operating as'
  ],
  
  [CanonicalField.BUSINESS_TYPE]: [
    'business type', 'businesstype', 'business_type', 'entity type',
    'entity_type', 'entitytype', 'organization type', 'org_type',
    'company type', 'companytype', 'company_type', 'structure',
    'business structure', 'legal structure', 'incorporation type'
  ],
  
  [CanonicalField.INDUSTRY]: [
    'industry', 'business type', 'businesstype', 'business_type',
    'sector', 'category', 'vertical', 'business category', 
    'business_category', 'type', 'sic', 'naics', 'trade',
    'line of business', 'business sector', 'industry type',
    'industry vertical', 'market sector', 'business vertical'
  ],
  
  [CanonicalField.NAICS_CODE]: [
    'naics', 'naics code', 'naics_code', 'naics-code', 'naicscode'
  ],
  
  [CanonicalField.SIC_CODE]: [
    'sic', 'sic code', 'sic_code', 'sic-code', 'siccode'
  ],
  
  [CanonicalField.EIN]: [
    'ein', 'tax id', 'taxid', 'tax_id', 'tax-id', 'fein',
    'federal ein', 'federal_ein', 'employer id', 'employer_id',
    'tax identification', 'tax number', 'federal tax id'
  ],
  
  [CanonicalField.OWNER_NAME]: [
    'ownername', 'owner name', 'owner_name', 'owner-name',
    'contact name', 'contactname', 'contact_name', 'contact-name',
    'owner', 'contact', 'name', 'full name', 'full_name',
    'contact person', 'primary contact', 'principal', 'proprietor',
    'first name last name', 'firstname lastname', 'representative',
    'manager', 'ceo', 'president', 'director', 'lead name',
    'business owner', 'business_owner', 'guarantor', 'personal guarantor'
  ],
  
  [CanonicalField.FIRST_NAME]: [
    'first name', 'firstname', 'first_name', 'first-name',
    'fname', 'given name', 'given_name', 'forename'
  ],
  
  [CanonicalField.LAST_NAME]: [
    'last name', 'lastname', 'last_name', 'last-name',
    'lname', 'surname', 'family name', 'family_name'
  ],
  
  [CanonicalField.EMAIL]: [
    'email', 'e-mail', 'e_mail', 'email address', 'emailaddress',
    'email_address', 'contact email', 'contactemail', 'contact_email',
    'business email', 'businessemail', 'business_email', 'email id',
    'emailid', 'mail', 'electronic mail', 'primary email',
    'owner email', 'owner_email', 'contact email address'
  ],
  
  [CanonicalField.PHONE]: [
    'phone', 'phone number', 'phonenumber', 'phone_number', 'phone-number',
    'telephone', 'tel', 'mobile', 'cell', 'cell phone', 'cellphone',
    'mobile number', 'mobile_number', 'contact number', 'contactnumber',
    'contact_number', 'business phone', 'businessphone', 'business_phone',
    'primary phone', 'main phone', 'office phone', 'work phone',
    'contact phone', 'contactphone', 'tel no', 'tel_no', 'phone no',
    'phone1', 'phone 1', 'phone_1', 'primary_phone'
  ],
  
  [CanonicalField.SECONDARY_PHONE]: [
    'secondary phone', 'secondaryphone', 'secondary_phone', 'secondary-phone',
    'phone2', 'phone 2', 'phone_2', 'alternate phone', 'alternatephone',
    'alternate_phone', 'other phone', 'otherphone', 'other_phone',
    'backup phone', 'backupphone', 'backup_phone', 'additional phone'
  ],
  
  [CanonicalField.ANNUAL_REVENUE]: [
    'annualrevenue', 'annual revenue', 'annual_revenue', 'annual-revenue',
    'revenue', 'yearly revenue', 'yearlyrevenue', 'yearly_revenue',
    'annual sales', 'annualsales', 'annual_sales', 'sales',
    'gross revenue', 'grossrevenue', 'gross_revenue', 'gross sales',
    'total revenue', 'annual income', 'yearly income', 'business revenue',
    'annual gross', 'yearly sales', 'annual receipts', 'total sales'
  ],
  
  [CanonicalField.MONTHLY_REVENUE]: [
    'monthly revenue', 'monthlyrevenue', 'monthly_revenue', 'monthly-revenue',
    'monthly sales', 'monthlysales', 'monthly_sales', 'monthly gross',
    'average monthly revenue', 'avg monthly revenue', 'monthly receipts'
  ],
  
  [CanonicalField.REQUESTED_AMOUNT]: [
    'requestedamount', 'requested amount', 'requested_amount', 'requested-amount',
    'amount', 'funding amount', 'fundingamount', 'funding_amount',
    'loan amount', 'loanamount', 'loan_amount', 'amount requested',
    'amountrequested', 'amount_requested', 'advance amount', 'advanceamount',
    'advance_amount', 'amount needed', 'amountneeded', 'amount_needed',
    'funding requested', 'capital needed', 'financing amount', 'desired amount',
    'funding need', 'capital requirement', 'mca amount'
  ],
  
  [CanonicalField.CREDIT_SCORE]: [
    'creditscore', 'credit score', 'credit_score', 'credit-score',
    'fico', 'fico score', 'ficoscore', 'fico_score', 'credit rating',
    'creditrating', 'credit_rating', 'score', 'personal credit',
    'personal credit score', 'personalcreditscore', 'personal_credit_score',
    'credit', 'fico rating', 'credit points', 'owner credit score',
    'personal fico', 'business credit score', 'credit report score'
  ],
  
  [CanonicalField.UCC_NUMBER]: [
    'ucc_number', 'ucc number', 'uccnumber', 'ucc-number', 'filing number',
    'filing_number', 'filingnumber', 'file number', 'file_number', 
    'document number', 'doc_number', 'reference number', 'filing #',
    'file no', 'file no.', 'filing no', 'filing no.', 'ucc filing number',
    'ucc id', 'ucc_id', 'filing id', 'filing_id', 'document id'
  ],
  
  [CanonicalField.FILING_DATE]: [
    'filing_date', 'filing date', 'filingdate', 'filing-date',
    'date filed', 'date_filed', 'filed date', 'filed_date',
    'file date', 'file_date', 'effective date', 'effective_date',
    'filing effective date', 'initial filing date', 'original filing date'
  ],
  
  [CanonicalField.SECURED_PARTY]: [
    'secured party', 'securedparty', 'secured_party', 'secured-party',
    'lender', 'creditor', 'lender name', 'lender_name', 'secured creditor',
    'secured_creditor', 'assignee', 'beneficiary', 'lienholder',
    'financing party', 'financing_party', 'mca funder', 'mca_funder'
  ],
  
  [CanonicalField.STATE]: [
    'state', 'st', 'state code', 'state_code', 'statecode', 'province',
    'region', 'state abbreviation', 'state_abbreviation', 'filing state',
    'filing_state', 'jurisdiction state', 'business state'
  ],
  
  [CanonicalField.YEARS_IN_BUSINESS]: [
    'years in business', 'yearsinbusiness', 'years_in_business',
    'business age', 'businessage', 'business_age', 'years operating',
    'years_operating', 'yearsoperating', 'years established',
    'yearsestablished', 'years_established', 'company age',
    'time in business', 'timeinbusiness', 'time_in_business'
  ],
  
  // Add remaining fields...
  [CanonicalField.CONTACT_NAME]: ['contact_name', 'contact name', 'contactname'],
  [CanonicalField.MOBILE_PHONE]: ['mobile_phone', 'mobile phone', 'mobilephone', 'cell_phone'],
  [CanonicalField.WORK_PHONE]: ['work_phone', 'work phone', 'workphone', 'office_phone'],
  [CanonicalField.FULL_ADDRESS]: ['full_address', 'full address', 'fulladdress', 'complete_address', 'address'],
  [CanonicalField.STREET]: ['street', 'street address', 'street_address', 'address1', 'address_1'],
  [CanonicalField.CITY]: ['city', 'town', 'municipality', 'locality'],
  [CanonicalField.ZIP_CODE]: ['zip', 'zipcode', 'zip_code', 'zip-code', 'postal code', 'postalcode', 'postal_code'],
  [CanonicalField.COUNTRY]: ['country', 'nation', 'country code', 'country_code'],
  [CanonicalField.GROSS_SALES]: ['gross_sales', 'gross sales', 'grosssales', 'total_sales'],
  [CanonicalField.DAILY_BANK_DEPOSITS]: ['daily_bank_deposits', 'daily bank deposits', 'dailybankdeposits', 'daily_deposits'],
  [CanonicalField.AVERAGE_DAILY_BALANCE]: ['average_daily_balance', 'average daily balance', 'avgdailybalance', 'adb'],
  [CanonicalField.FILING_NUMBER]: ['filing_number', 'filing number', 'filingnumber'],
  [CanonicalField.FILING_TYPE]: ['filing_type', 'filing type', 'filingtype', 'ucc_type'],
  [CanonicalField.EXPIRY_DATE]: ['expiry_date', 'expiry date', 'expirydate', 'expire_date', 'expiration_date'],
  [CanonicalField.COLLATERAL_TYPE]: ['collateral_type', 'collateral type', 'collateraltype', 'collateral'],
  [CanonicalField.LENDER_NAME]: ['lender_name', 'lender name', 'lendername', 'funder'],
  [CanonicalField.FILING_STATE]: ['filing_state', 'filing state', 'filingstate'],
  [CanonicalField.DEBTOR_NAME]: ['debtor_name', 'debtor name', 'debtorname', 'borrower'],
  [CanonicalField.JURISDICTION]: ['jurisdiction', 'filing_jurisdiction', 'filing jurisdiction'],
  [CanonicalField.PREVIOUS_MCA]: ['previous_mca', 'previous mca', 'previousmca', 'prior_mca'],
  [CanonicalField.CURRENT_POSITIONS]: ['current_positions', 'current positions', 'currentpositions', 'active_positions'],
  [CanonicalField.URGENCY_LEVEL]: ['urgency_level', 'urgency level', 'urgencylevel', 'urgency'],
  [CanonicalField.FUNDING_PURPOSE]: ['funding_purpose', 'funding purpose', 'fundingpurpose', 'use_of_funds'],
  [CanonicalField.STACKING_RISK]: ['stacking_risk', 'stacking risk', 'stackingrisk', 'stack_risk'],
  [CanonicalField.LEAD_SOURCE]: ['lead_source', 'lead source', 'leadsource', 'source'],
  [CanonicalField.LEAD_AGE]: ['lead_age', 'lead age', 'leadage', 'days_old'],
  [CanonicalField.LAST_CONTACT_DATE]: ['last_contact_date', 'last contact date', 'lastcontactdate', 'last_contact'],
  [CanonicalField.QUALITY_SCORE]: ['quality_score', 'quality score', 'qualityscore', 'score'],
  [CanonicalField.YEAR_FOUNDED]: ['year_founded', 'year founded', 'yearfounded', 'founded', 'established_year'],
  [CanonicalField.TIME_IN_BUSINESS]: ['time_in_business', 'time in business', 'timeinbusiness']
};

/**
 * Field validators - regex patterns and validation functions
 */
export const FIELD_VALIDATORS = {
  // Phone validation patterns
  phone: {
    patterns: [
      /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/, // US phone
      /^\+?[1-9]\d{1,14}$/, // E.164 international
      /^[0-9]{10}$/, // Simple 10 digit
      /^\([0-9]{3}\)\s?[0-9]{3}-[0-9]{4}$/, // (XXX) XXX-XXXX
      /^[0-9]{3}-[0-9]{3}-[0-9]{4}$/, // XXX-XXX-XXXX
      /^[0-9]{3}\.[0-9]{3}\.[0-9]{4}$/, // XXX.XXX.XXXX
    ],
    normalize: (phone: string): string => {
      // Remove all non-numeric characters
      const cleaned = phone.replace(/\D/g, '');
      
      // Handle US numbers
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      }
      
      // Return with + if not already present
      return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    },
    validate: (phone: string): boolean => {
      const cleaned = phone.replace(/\D/g, '');
      return cleaned.length >= 10 && cleaned.length <= 15;
    }
  },
  
  // Email validation
  email: {
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    normalize: (email: string): string => email.toLowerCase().trim(),
    validate: (email: string): boolean => {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return emailRegex.test(email);
    }
  },
  
  // EIN validation (XX-XXXXXXX)
  ein: {
    patterns: [
      /^\d{2}-\d{7}$/, // Standard format
      /^\d{9}$/ // Without hyphen
    ],
    normalize: (ein: string): string => {
      const cleaned = ein.replace(/\D/g, '');
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
      }
      return ein;
    },
    validate: (ein: string): boolean => {
      const cleaned = ein.replace(/\D/g, '');
      return cleaned.length === 9;
    }
  },
  
  // Zip code validation
  zipCode: {
    patterns: [
      /^\d{5}$/, // 5 digit
      /^\d{5}-\d{4}$/ // ZIP+4
    ],
    normalize: (zip: string): string => {
      const cleaned = zip.replace(/\D/g, '');
      if (cleaned.length === 9) {
        return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
      }
      return cleaned.slice(0, 5);
    },
    validate: (zip: string): boolean => {
      const cleaned = zip.replace(/\D/g, '');
      return cleaned.length === 5 || cleaned.length === 9;
    }
  },
  
  // State code validation
  state: {
    validStates: [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
    ],
    normalize: (state: string): string => state.toUpperCase().trim(),
    validate: (state: string): boolean => {
      return FIELD_VALIDATORS.state.validStates.includes(state.toUpperCase().trim());
    }
  },
  
  // Credit score validation
  creditScore: {
    min: 300,
    max: 850,
    validate: (score: string | number): boolean => {
      const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
      return !isNaN(numScore) && numScore >= 300 && numScore <= 850;
    },
    normalize: (score: string | number): number => {
      const numScore = typeof score === 'string' ? parseInt(score, 10) : score;
      return Math.max(300, Math.min(850, numScore));
    }
  },
  
  // Currency/amount validation
  currency: {
    patterns: [
      /^\$?[\d,]+(\.\d{2})?$/, // $X,XXX.XX or X,XXX.XX
      /^[\d]+$/ // Simple number
    ],
    normalize: (amount: string): number => {
      const cleaned = amount.replace(/[$,]/g, '');
      return parseFloat(cleaned) || 0;
    },
    validate: (amount: string): boolean => {
      const cleaned = amount.replace(/[$,]/g, '');
      return !isNaN(parseFloat(cleaned));
    }
  },
  
  // UCC filing number validation
  uccNumber: {
    patterns: [
      /^[A-Z0-9]{8,20}$/, // Alphanumeric
      /^\d{4}[A-Z]\d{10}$/, // NY format
      /^\d{10,12}$/, // CA format
      /^[A-Z]{2}\d{10}$/ // State prefix format
    ],
    normalize: (ucc: string): string => {
      return ucc.toUpperCase().replace(/[\s-]/g, '');
    },
    validate: (ucc: string): boolean => {
      const cleaned = ucc.replace(/[\s-]/g, '');
      return cleaned.length >= 8 && cleaned.length <= 20;
    }
  },
  
  // Date validation
  date: {
    patterns: [
      /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // MM/DD/YYYY or M/D/YY
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{1,2}-\d{1,2}-\d{2,4}$/ // MM-DD-YYYY
    ],
    normalize: (date: string): Date | null => {
      // Try multiple date formats
      const formats = [
        { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: ['month', 'day', 'year'] },
        { regex: /^(\d{4})-(\d{2})-(\d{2})$/, order: ['year', 'month', 'day'] },
        { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: ['month', 'day', 'year'] }
      ];
      
      for (const format of formats) {
        const match = date.match(format.regex);
        if (match) {
          const values: any = {};
          format.order.forEach((key, index) => {
            values[key] = parseInt(match[index + 1], 10);
          });
          
          const parsedDate = new Date(values.year, values.month - 1, values.day);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate;
          }
        }
      }
      
      return null;
    },
    validate: (date: string): boolean => {
      return FIELD_VALIDATORS.date.normalize(date) !== null;
    }
  },
  
  // Business name validation
  businessName: {
    minLength: 2,
    maxLength: 200,
    normalize: (name: string): string => {
      return name.trim()
        .replace(/\s+/g, ' ') // Remove multiple spaces
        .replace(/^(the|a|an)\s+/i, ''); // Remove common articles
    },
    validate: (name: string): boolean => {
      const cleaned = name.trim();
      return cleaned.length >= 2 && cleaned.length <= 200;
    }
  },
  
  // Person name validation
  personName: {
    patterns: [
      /^[A-Za-z\s\-'\.]+$/, // Letters, spaces, hyphens, apostrophes, periods
    ],
    normalize: (name: string): string => {
      return name.trim()
        .replace(/\s+/g, ' ') // Remove multiple spaces
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    },
    validate: (name: string): boolean => {
      const cleaned = name.trim();
      return cleaned.length >= 2 && /^[A-Za-z\s\-'\.]+$/.test(cleaned);
    }
  }
};

/**
 * Business entity type normalizer
 */
export const BUSINESS_ENTITY_NORMALIZER = {
  mappings: {
    'LLC': ['llc', 'l.l.c.', 'l.l.c', 'limited liability company', 'limited liability co', 'limited liability'],
    'INC': ['inc', 'inc.', 'incorporated', 'incorporation'],
    'CORP': ['corp', 'corp.', 'corporation'],
    'LTD': ['ltd', 'ltd.', 'limited'],
    'LP': ['lp', 'l.p.', 'l.p', 'limited partnership'],
    'LLP': ['llp', 'l.l.p.', 'l.l.p', 'limited liability partnership'],
    'PC': ['pc', 'p.c.', 'p.c', 'professional corporation', 'prof corp'],
    'PA': ['pa', 'p.a.', 'p.a', 'professional association', 'prof assoc'],
    'PLLC': ['pllc', 'p.l.l.c.', 'p.l.l.c', 'professional limited liability company'],
    'DBA': ['dba', 'd.b.a.', 'd.b.a', 'doing business as', 'trading as', 't/a'],
    'SOLE PROP': ['sole proprietorship', 'sole proprietor', 'sp'],
    'PARTNERSHIP': ['partnership', 'general partnership', 'gp'],
    'CO': ['co', 'co.', 'company'],
    'TRUST': ['trust', 'family trust', 'living trust'],
    'ESTATE': ['estate', 'estate of']
  },
  
  normalize: function(entityType: string): string {
    const lower = entityType.toLowerCase().trim();
    
    for (const [normalized, variations] of Object.entries(this.mappings)) {
      if (variations.includes(lower)) {
        return normalized;
      }
    }
    
    // Check if the entity type contains any of the variations
    for (const [normalized, variations] of Object.entries(this.mappings)) {
      for (const variation of variations) {
        if (lower.includes(variation)) {
          return normalized;
        }
      }
    }
    
    return entityType.toUpperCase();
  },
  
  extract: function(businessName: string): { name: string; entityType: string | null } {
    const lower = businessName.toLowerCase().trim();
    
    for (const [normalized, variations] of Object.entries(this.mappings)) {
      for (const variation of variations) {
        const regex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lower)) {
          const cleanName = businessName.replace(regex, '').trim();
          return { name: cleanName, entityType: normalized };
        }
      }
    }
    
    return { name: businessName, entityType: null };
  }
};

/**
 * Field type definitions using Zod for validation
 */
export const FieldSchemas = {
  businessName: z.string()
    .min(2, 'Business name too short')
    .max(200, 'Business name too long')
    .transform(val => FIELD_VALIDATORS.businessName.normalize(val)),
  
  ownerName: z.string()
    .min(2, 'Owner name too short')
    .max(100, 'Owner name too long')
    .transform(val => FIELD_VALIDATORS.personName.normalize(val)),
  
  email: z.string()
    .email('Invalid email format')
    .transform(val => FIELD_VALIDATORS.email.normalize(val)),
  
  phone: z.string()
    .refine(val => FIELD_VALIDATORS.phone.validate(val), 'Invalid phone number')
    .transform(val => FIELD_VALIDATORS.phone.normalize(val)),
  
  ein: z.string()
    .optional()
    .refine(val => !val || FIELD_VALIDATORS.ein.validate(val), 'Invalid EIN format')
    .transform(val => val ? FIELD_VALIDATORS.ein.normalize(val) : undefined),
  
  creditScore: z.union([z.string(), z.number()])
    .refine(val => FIELD_VALIDATORS.creditScore.validate(val), 'Invalid credit score')
    .transform(val => FIELD_VALIDATORS.creditScore.normalize(val)),
  
  annualRevenue: z.union([z.string(), z.number()])
    .refine(val => FIELD_VALIDATORS.currency.validate(val.toString()), 'Invalid revenue format')
    .transform(val => FIELD_VALIDATORS.currency.normalize(val.toString())),
  
  requestedAmount: z.union([z.string(), z.number()])
    .refine(val => FIELD_VALIDATORS.currency.validate(val.toString()), 'Invalid amount format')
    .transform(val => FIELD_VALIDATORS.currency.normalize(val.toString())),
  
  state: z.string()
    .refine(val => FIELD_VALIDATORS.state.validate(val), 'Invalid state code')
    .transform(val => FIELD_VALIDATORS.state.normalize(val)),
  
  zipCode: z.string()
    .refine(val => FIELD_VALIDATORS.zipCode.validate(val), 'Invalid zip code')
    .transform(val => FIELD_VALIDATORS.zipCode.normalize(val)),
  
  uccNumber: z.string()
    .optional()
    .refine(val => !val || FIELD_VALIDATORS.uccNumber.validate(val), 'Invalid UCC number')
    .transform(val => val ? FIELD_VALIDATORS.uccNumber.normalize(val) : undefined),
  
  filingDate: z.string()
    .optional()
    .refine(val => !val || FIELD_VALIDATORS.date.validate(val), 'Invalid date format')
    .transform(val => val ? FIELD_VALIDATORS.date.normalize(val) : undefined)
};

/**
 * Complete lead schema combining all fields
 */
export const CompleteLeadSchema = z.object({
  businessName: FieldSchemas.businessName,
  ownerName: FieldSchemas.ownerName,
  email: FieldSchemas.email,
  phone: FieldSchemas.phone,
  secondaryPhone: FieldSchemas.phone.optional(),
  ein: FieldSchemas.ein,
  creditScore: FieldSchemas.creditScore.optional(),
  annualRevenue: FieldSchemas.annualRevenue.optional(),
  monthlyRevenue: FieldSchemas.annualRevenue.optional(),
  requestedAmount: FieldSchemas.requestedAmount.optional(),
  state: FieldSchemas.state.optional(),
  city: z.string().optional(),
  zipCode: FieldSchemas.zipCode.optional(),
  street: z.string().optional(),
  fullAddress: z.string().optional(),
  industry: z.string().optional(),
  yearsInBusiness: z.number().optional(),
  timeInBusiness: z.string().optional(),
  yearFounded: z.number().optional(),
  uccNumber: FieldSchemas.uccNumber,
  filingDate: FieldSchemas.filingDate,
  securedParty: z.string().optional(),
  filingState: FieldSchemas.state.optional(),
  previousMca: z.enum(['none', 'current', 'previous_paid', 'multiple']).optional(),
  urgencyLevel: z.enum(['immediate', 'this_week', 'this_month', 'exploring']).optional(),
  leadSource: z.string().optional(),
  qualityScore: z.number().min(0).max(100).optional()
});

export type CompleteLeadType = z.infer<typeof CompleteLeadSchema>;

/**
 * Field mapper - maps raw field names to canonical fields
 */
export class FieldMapper {
  private synonymMap: Map<string, CanonicalField>;
  
  constructor() {
    this.synonymMap = new Map();
    
    // Build reverse mapping for quick lookups
    for (const [canonical, synonyms] of Object.entries(FIELD_SYNONYMS)) {
      for (const synonym of synonyms) {
        this.synonymMap.set(synonym.toLowerCase(), canonical as CanonicalField);
      }
      // Also map the canonical name itself
      this.synonymMap.set(canonical.toLowerCase(), canonical as CanonicalField);
    }
  }
  
  /**
   * Map a raw field name to its canonical field
   */
  mapToCanonical(rawFieldName: string): CanonicalField | null {
    const normalized = rawFieldName.toLowerCase().trim().replace(/[_\-\s]+/g, ' ');
    
    // Direct lookup
    const direct = this.synonymMap.get(normalized);
    if (direct) return direct;
    
    // Try without spaces
    const noSpaces = normalized.replace(/\s/g, '');
    const withoutSpaces = this.synonymMap.get(noSpaces);
    if (withoutSpaces) return withoutSpaces;
    
    // Try with underscores
    const withUnderscores = normalized.replace(/\s/g, '_');
    const underscored = this.synonymMap.get(withUnderscores);
    if (underscored) return underscored;
    
    // Fuzzy matching - find best match
    let bestMatch: CanonicalField | null = null;
    let bestScore = 0;
    
    for (const [synonym, canonical] of this.synonymMap.entries()) {
      const score = this.calculateSimilarity(normalized, synonym);
      if (score > bestScore && score > 0.7) { // 70% similarity threshold
        bestScore = score;
        bestMatch = canonical;
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Calculate similarity between two strings (Levenshtein-based)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Map an entire object with raw field names to canonical fields
   */
  mapObject(rawObject: Record<string, any>): Record<string, any> {
    const mapped: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(rawObject)) {
      const canonical = this.mapToCanonical(key);
      if (canonical) {
        // Apply field-specific normalization
        mapped[canonical] = this.normalizeValue(canonical, value);
      } else {
        // Keep unrecognized fields as-is
        mapped[key] = value;
      }
    }
    
    return mapped;
  }
  
  /**
   * Normalize a value based on its field type
   */
  private normalizeValue(field: CanonicalField, value: any): any {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    
    switch (field) {
      case CanonicalField.PHONE:
      case CanonicalField.SECONDARY_PHONE:
      case CanonicalField.MOBILE_PHONE:
      case CanonicalField.WORK_PHONE:
        return FIELD_VALIDATORS.phone.normalize(value.toString());
      
      case CanonicalField.EMAIL:
        return FIELD_VALIDATORS.email.normalize(value.toString());
      
      case CanonicalField.EIN:
        return FIELD_VALIDATORS.ein.normalize(value.toString());
      
      case CanonicalField.STATE:
      case CanonicalField.FILING_STATE:
        return FIELD_VALIDATORS.state.normalize(value.toString());
      
      case CanonicalField.ZIP_CODE:
        return FIELD_VALIDATORS.zipCode.normalize(value.toString());
      
      case CanonicalField.CREDIT_SCORE:
        return FIELD_VALIDATORS.creditScore.normalize(value);
      
      case CanonicalField.ANNUAL_REVENUE:
      case CanonicalField.MONTHLY_REVENUE:
      case CanonicalField.GROSS_SALES:
      case CanonicalField.REQUESTED_AMOUNT:
        return FIELD_VALIDATORS.currency.normalize(value.toString());
      
      case CanonicalField.UCC_NUMBER:
      case CanonicalField.FILING_NUMBER:
        return FIELD_VALIDATORS.uccNumber.normalize(value.toString());
      
      case CanonicalField.BUSINESS_NAME:
        return FIELD_VALIDATORS.businessName.normalize(value.toString());
      
      case CanonicalField.OWNER_NAME:
      case CanonicalField.CONTACT_NAME:
      case CanonicalField.FIRST_NAME:
      case CanonicalField.LAST_NAME:
        return FIELD_VALIDATORS.personName.normalize(value.toString());
      
      case CanonicalField.FILING_DATE:
      case CanonicalField.EXPIRY_DATE:
      case CanonicalField.LAST_CONTACT_DATE:
        return FIELD_VALIDATORS.date.normalize(value.toString());
      
      default:
        return value;
    }
  }
  
  /**
   * Validate a field value
   */
  validateField(field: CanonicalField, value: any): { valid: boolean; error?: string } {
    if (value === null || value === undefined || value === '') {
      return { valid: true }; // Empty values are valid (not required)
    }
    
    try {
      switch (field) {
        case CanonicalField.PHONE:
        case CanonicalField.SECONDARY_PHONE:
        case CanonicalField.MOBILE_PHONE:
        case CanonicalField.WORK_PHONE:
          return { 
            valid: FIELD_VALIDATORS.phone.validate(value.toString()),
            error: 'Invalid phone number format'
          };
        
        case CanonicalField.EMAIL:
          return { 
            valid: FIELD_VALIDATORS.email.validate(value.toString()),
            error: 'Invalid email format'
          };
        
        case CanonicalField.EIN:
          return { 
            valid: FIELD_VALIDATORS.ein.validate(value.toString()),
            error: 'Invalid EIN format (should be XX-XXXXXXX)'
          };
        
        case CanonicalField.STATE:
        case CanonicalField.FILING_STATE:
          return { 
            valid: FIELD_VALIDATORS.state.validate(value.toString()),
            error: 'Invalid state code'
          };
        
        case CanonicalField.ZIP_CODE:
          return { 
            valid: FIELD_VALIDATORS.zipCode.validate(value.toString()),
            error: 'Invalid zip code format'
          };
        
        case CanonicalField.CREDIT_SCORE:
          return { 
            valid: FIELD_VALIDATORS.creditScore.validate(value),
            error: 'Credit score must be between 300 and 850'
          };
        
        case CanonicalField.UCC_NUMBER:
        case CanonicalField.FILING_NUMBER:
          return { 
            valid: FIELD_VALIDATORS.uccNumber.validate(value.toString()),
            error: 'Invalid UCC filing number format'
          };
        
        case CanonicalField.BUSINESS_NAME:
          return { 
            valid: FIELD_VALIDATORS.businessName.validate(value.toString()),
            error: 'Business name must be between 2 and 200 characters'
          };
        
        case CanonicalField.OWNER_NAME:
        case CanonicalField.CONTACT_NAME:
        case CanonicalField.FIRST_NAME:
        case CanonicalField.LAST_NAME:
          return { 
            valid: FIELD_VALIDATORS.personName.validate(value.toString()),
            error: 'Invalid name format'
          };
        
        default:
          return { valid: true };
      }
    } catch (error) {
      return { valid: false, error: 'Validation error' };
    }
  }
}

// Export singleton instance
export const fieldMapper = new FieldMapper();