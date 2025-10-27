import crypto from "crypto";
import { storage } from "../storage";
import type { Lead, CrmIntegration, CrmSyncLog } from "@shared/schema";

// Encryption utility functions
// Generate a stable key for development if not provided
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (
  process.env.NODE_ENV === 'development' 
    ? 'dev-key-32-bytes-long-1234567890' // Fixed 32-byte key for development
    : (() => { throw new Error('ENCRYPTION_KEY environment variable is required for CRM integrations in production'); })()
);
const ALGORITHM = 'aes-256-cbc';

export function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(apiKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decryptApiKey(encryptedKey: string): string {
  const parts = encryptedKey.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Field mapping configuration types
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: (value: any) => any;
}

export interface CrmConfig {
  apiKey: string;
  apiUrl?: string;
  mappingConfig?: FieldMapping[];
}

export interface ExportResult {
  success: boolean;
  exportedCount: number;
  failedCount: number;
  errors?: string[];
  crmRecordIds?: string[];
}

// Base CRM Adapter interface
export abstract class CrmAdapter {
  protected config: CrmConfig;
  protected integration: CrmIntegration;

  constructor(integration: CrmIntegration) {
    this.integration = integration;
    this.config = {
      apiKey: decryptApiKey(integration.apiKey),
      apiUrl: integration.apiUrl || undefined,
      mappingConfig: integration.mappingConfig as FieldMapping[] || this.getDefaultMapping()
    };
  }

  abstract validateConnection(): Promise<boolean>;
  abstract exportLeads(leads: Lead[]): Promise<ExportResult>;
  abstract getDefaultMapping(): FieldMapping[];

  protected transformLeadData(lead: Lead): any {
    const mappings = this.config.mappingConfig || this.getDefaultMapping();
    const transformed: any = {};

    for (const mapping of mappings) {
      const sourceValue = (lead as any)[mapping.sourceField];
      if (sourceValue !== undefined) {
        transformed[mapping.targetField] = mapping.transform 
          ? mapping.transform(sourceValue)
          : sourceValue;
      }
    }

    return transformed;
  }

  protected async makeApiRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }
}

// Salesforce Adapter
export class SalesforceAdapter extends CrmAdapter {
  private accessToken?: string;
  private instanceUrl?: string;

  async validateConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      console.error('Salesforce connection validation failed:', error);
      return false;
    }
  }

  private async authenticate(): Promise<void> {
    const tokenUrl = this.config.apiUrl || 'https://login.salesforce.com/services/oauth2/token';
    const [clientId, clientSecret, refreshToken] = this.config.apiKey.split(':');

    const response = await this.makeApiRequest(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      throw new Error(`Salesforce auth failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.instanceUrl = data.instance_url;
  }

  async exportLeads(leads: Lead[]): Promise<ExportResult> {
    if (!this.accessToken) {
      await this.authenticate();
    }

    const result: ExportResult = {
      success: false,
      exportedCount: 0,
      failedCount: 0,
      errors: [],
      crmRecordIds: []
    };

    // Batch process leads (Salesforce allows up to 200 records per batch)
    const batchSize = 200;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const records = batch.map(lead => ({
        ...this.transformLeadData(lead),
        attributes: { type: 'Lead' }
      }));

      try {
        const response = await this.makeApiRequest(
          `${this.instanceUrl}/services/data/v58.0/composite/sobjects`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ records })
          }
        );

        if (response.ok) {
          const results = await response.json();
          for (const res of results) {
            if (res.success) {
              result.exportedCount++;
              result.crmRecordIds?.push(res.id);
            } else {
              result.failedCount++;
              result.errors?.push(res.errors?.join(', ') || 'Unknown error');
            }
          }
        } else {
          result.failedCount += batch.length;
          result.errors?.push(`Batch failed: ${response.statusText}`);
        }
      } catch (error: any) {
        result.failedCount += batch.length;
        result.errors?.push(error.message);
      }
    }

    result.success = result.exportedCount > 0;
    return result;
  }

  getDefaultMapping(): FieldMapping[] {
    return [
      { sourceField: 'businessName', targetField: 'Company' },
      { sourceField: 'ownerName', targetField: 'LastName' },
      { sourceField: 'email', targetField: 'Email' },
      { sourceField: 'phone', targetField: 'Phone' },
      { sourceField: 'industry', targetField: 'Industry' },
      { sourceField: 'annualRevenue', targetField: 'AnnualRevenue', 
        transform: (val) => parseFloat(val?.replace(/[^0-9.]/g, '') || '0') },
      { sourceField: 'stateCode', targetField: 'State' }
    ];
  }
}

// HubSpot Adapter
export class HubSpotAdapter extends CrmAdapter {
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.makeApiRequest(
        'https://api.hubapi.com/crm/v3/objects/contacts?limit=1',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      return response.ok;
    } catch (error) {
      console.error('HubSpot connection validation failed:', error);
      return false;
    }
  }

  async exportLeads(leads: Lead[]): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      exportedCount: 0,
      failedCount: 0,
      errors: [],
      crmRecordIds: []
    };

    // HubSpot batch API allows up to 100 records
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const inputs = batch.map(lead => ({
        properties: this.transformLeadData(lead)
      }));

      try {
        const response = await this.makeApiRequest(
          'https://api.hubapi.com/crm/v3/objects/contacts/batch/create',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inputs })
          }
        );

        if (response.ok) {
          const data = await response.json();
          result.exportedCount += data.results?.length || 0;
          data.results?.forEach((r: any) => result.crmRecordIds?.push(r.id));
        } else {
          const error = await response.text();
          result.failedCount += batch.length;
          result.errors?.push(`HubSpot batch failed: ${error}`);
        }
      } catch (error: any) {
        result.failedCount += batch.length;
        result.errors?.push(error.message);
      }
    }

    result.success = result.exportedCount > 0;
    return result;
  }

  getDefaultMapping(): FieldMapping[] {
    return [
      { sourceField: 'businessName', targetField: 'company' },
      { sourceField: 'ownerName', targetField: 'lastname' },
      { sourceField: 'email', targetField: 'email' },
      { sourceField: 'phone', targetField: 'phone' },
      { sourceField: 'industry', targetField: 'industry' },
      { sourceField: 'annualRevenue', targetField: 'annualrevenue' },
      { sourceField: 'stateCode', targetField: 'state' }
    ];
  }
}

// Pipedrive Adapter
export class PipedriveAdapter extends CrmAdapter {
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.makeApiRequest(
        `${this.config.apiUrl || 'https://api.pipedrive.com'}/v1/persons?api_token=${this.config.apiKey}&limit=1`,
        { method: 'GET' }
      );
      return response.ok;
    } catch (error) {
      console.error('Pipedrive connection validation failed:', error);
      return false;
    }
  }

  async exportLeads(leads: Lead[]): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      exportedCount: 0,
      failedCount: 0,
      errors: [],
      crmRecordIds: []
    };

    // Pipedrive doesn't have a batch API, so we need to create one at a time
    for (const lead of leads) {
      try {
        const personData = this.transformLeadData(lead);
        
        // First create the person
        const personResponse = await this.makeApiRequest(
          `${this.config.apiUrl || 'https://api.pipedrive.com'}/v1/persons?api_token=${this.config.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(personData)
          }
        );

        if (personResponse.ok) {
          const personResult = await personResponse.json();
          if (personResult.success) {
            result.exportedCount++;
            result.crmRecordIds?.push(personResult.data.id);

            // Create organization if company name exists
            if (lead.businessName) {
              await this.makeApiRequest(
                `${this.config.apiUrl || 'https://api.pipedrive.com'}/v1/organizations?api_token=${this.config.apiKey}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: lead.businessName,
                    owner_id: personResult.data.id
                  })
                }
              );
            }
          } else {
            result.failedCount++;
            result.errors?.push(personResult.error || 'Unknown error');
          }
        } else {
          result.failedCount++;
          result.errors?.push(`Failed to create person: ${personResponse.statusText}`);
        }
      } catch (error: any) {
        result.failedCount++;
        result.errors?.push(error.message);
      }
    }

    result.success = result.exportedCount > 0;
    return result;
  }

  getDefaultMapping(): FieldMapping[] {
    return [
      { sourceField: 'ownerName', targetField: 'name' },
      { sourceField: 'email', targetField: 'email' },
      { sourceField: 'phone', targetField: 'phone' },
      { sourceField: 'businessName', targetField: 'org_name' }
    ];
  }
}

// Custom API Adapter (Generic webhook)
export class CustomApiAdapter extends CrmAdapter {
  async validateConnection(): Promise<boolean> {
    if (!this.config.apiUrl) return false;
    
    try {
      const response = await this.makeApiRequest(
        this.config.apiUrl,
        {
          method: 'HEAD',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );
      return response.ok || response.status === 405; // Some APIs don't support HEAD
    } catch (error) {
      console.error('Custom API connection validation failed:', error);
      return false;
    }
  }

  async exportLeads(leads: Lead[]): Promise<ExportResult> {
    const result: ExportResult = {
      success: false,
      exportedCount: 0,
      failedCount: 0,
      errors: []
    };

    if (!this.config.apiUrl) {
      result.errors?.push('API URL not configured');
      return result;
    }

    const transformedLeads = leads.map(lead => this.transformLeadData(lead));

    try {
      const response = await this.makeApiRequest(
        this.config.apiUrl,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ leads: transformedLeads })
        }
      );

      if (response.ok) {
        result.success = true;
        result.exportedCount = leads.length;
      } else {
        const error = await response.text();
        result.failedCount = leads.length;
        result.errors?.push(`API request failed: ${error}`);
      }
    } catch (error: any) {
      result.failedCount = leads.length;
      result.errors?.push(error.message);
    }

    return result;
  }

  getDefaultMapping(): FieldMapping[] {
    // Return all fields as-is for custom API
    return [
      { sourceField: 'businessName', targetField: 'businessName' },
      { sourceField: 'ownerName', targetField: 'ownerName' },
      { sourceField: 'email', targetField: 'email' },
      { sourceField: 'phone', targetField: 'phone' },
      { sourceField: 'industry', targetField: 'industry' },
      { sourceField: 'annualRevenue', targetField: 'annualRevenue' },
      { sourceField: 'requestedAmount', targetField: 'requestedAmount' },
      { sourceField: 'timeInBusiness', targetField: 'timeInBusiness' },
      { sourceField: 'creditScore', targetField: 'creditScore' },
      { sourceField: 'stateCode', targetField: 'stateCode' }
    ];
  }
}

// CRM Integration Service
export class CrmIntegrationService {
  static createAdapter(integration: CrmIntegration): CrmAdapter {
    switch (integration.crmType) {
      case 'salesforce':
        return new SalesforceAdapter(integration);
      case 'hubspot':
        return new HubSpotAdapter(integration);
      case 'pipedrive':
        return new PipedriveAdapter(integration);
      case 'custom_api':
        return new CustomApiAdapter(integration);
      default:
        throw new Error(`Unsupported CRM type: ${integration.crmType}`);
    }
  }

  static async exportLeadsToCrm(
    integrationId: string,
    leads: Lead[],
    purchaseId?: string
  ): Promise<ExportResult> {
    const integration = await storage.getCrmIntegration(integrationId);
    if (!integration) {
      throw new Error('Integration not found');
    }

    if (!integration.isActive) {
      throw new Error('Integration is not active');
    }

    // Create sync log entry
    const syncLog = await storage.createCrmSyncLog({
      integrationId,
      purchaseId: purchaseId || null,
      leadIds: leads.map(l => l.id),
      status: 'pending'
    });

    try {
      const adapter = this.createAdapter(integration);
      const result = await adapter.exportLeads(leads);

      // Update sync log
      await storage.updateCrmSyncLogStatus(
        syncLog.id,
        result.success ? 'success' : 'failed',
        result.errors?.join(', ')
      );

      // Update integration last sync time
      await storage.updateCrmIntegration(integrationId, {
        lastSyncAt: new Date()
      });

      return result;
    } catch (error: any) {
      await storage.updateCrmSyncLogStatus(
        syncLog.id,
        'failed',
        error.message
      );
      throw error;
    }
  }

  static async testConnection(integration: CrmIntegration): Promise<boolean> {
    const adapter = this.createAdapter(integration);
    return adapter.validateConnection();
  }
}

export default CrmIntegrationService;