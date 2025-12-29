import { storage } from "../storage";
import { Lead, CrmIntegration, CampaignTemplate, LeadEnrichment } from "@shared/schema";
import { leadEnrichmentService } from "./lead-enrichment";
import { campaignService } from "./campaign-tools";
import { 
  CrmAdapter, 
  SalesforceAdapter, 
  HubSpotAdapter, 
  PipedriveAdapter, 
  CustomApiAdapter 
} from "./crm-integration";
import { numverifyService } from "../numverify-service";

export interface ActivationStep {
  name: string;
  status: "pending" | "processing" | "completed" | "failed" | "skipped";
  message?: string;
  data?: any;
  startedAt?: Date;
  completedAt?: Date;
}

export interface LeadActivationRequest {
  leadIds: string[];
  actions: {
    enrich?: boolean;
    sendCampaign?: boolean;
    exportToCrm?: boolean;
  };
  options?: {
    templateId?: string;
    crmIntegrationId?: string;
    campaignName?: string;
    quickMessage?: string;
  };
}

export interface LeadActivationResult {
  id: string;
  leadIds: string[];
  steps: ActivationStep[];
  overallStatus: "pending" | "processing" | "completed" | "failed";
  enrichmentResults?: any[];
  campaignId?: string;
  crmExportResults?: any;
  createdAt: Date;
  completedAt?: Date;
}

export interface QuickAction {
  id: string;
  name: string;
  description: string;
  icon: string;
  actions: {
    enrich: boolean;
    sendCampaign: boolean;
    exportToCrm: boolean;
  };
  requiresTemplate?: boolean;
  requiresCrmIntegration?: boolean;
}

export class LeadActivationHub {
  private activationHistory: Map<string, LeadActivationResult> = new Map();
  
  // Pre-defined quick actions
  static readonly QUICK_ACTIONS: QuickAction[] = [
    {
      id: "enrich-export",
      name: "Enrich & Export to CRM",
      description: "Enrich lead data and export directly to your CRM",
      icon: "database-export",
      actions: {
        enrich: true,
        sendCampaign: false,
        exportToCrm: true
      },
      requiresCrmIntegration: true
    },
    {
      id: "enrich-campaign",
      name: "Enrich & Send Campaign",
      description: "Enrich lead data and send personalized campaign",
      icon: "mail-plus",
      actions: {
        enrich: true,
        sendCampaign: true,
        exportToCrm: false
      },
      requiresTemplate: true
    },
    {
      id: "full-activation",
      name: "Full Activation",
      description: "Complete pipeline: Enrich → Campaign → CRM Export",
      icon: "workflow",
      actions: {
        enrich: true,
        sendCampaign: true,
        exportToCrm: true
      },
      requiresTemplate: true,
      requiresCrmIntegration: true
    },
    {
      id: "quick-export",
      name: "Quick Export",
      description: "Export leads directly to CRM without enrichment",
      icon: "upload",
      actions: {
        enrich: false,
        sendCampaign: false,
        exportToCrm: true
      },
      requiresCrmIntegration: true
    },
    {
      id: "quick-campaign",
      name: "Quick Campaign",
      description: "Send campaign without enrichment",
      icon: "send",
      actions: {
        enrich: false,
        sendCampaign: true,
        exportToCrm: false
      },
      requiresTemplate: true
    }
  ];

  /**
   * Execute a lead activation workflow with specified actions
   */
  async activateLeads(request: LeadActivationRequest): Promise<LeadActivationResult> {
    const activationId = this.generateActivationId();
    const result: LeadActivationResult = {
      id: activationId,
      leadIds: request.leadIds,
      steps: [],
      overallStatus: "processing",
      createdAt: new Date()
    };

    // Store the initial state
    this.activationHistory.set(activationId, result);

    try {
      // Step 1: Enrich leads if requested
      if (request.actions.enrich) {
        const enrichStep = await this.executeEnrichment(request.leadIds);
        result.steps.push(enrichStep);
        if (enrichStep.status === "completed") {
          result.enrichmentResults = enrichStep.data;
        }
      }

      // Step 2: Send campaign if requested
      if (request.actions.sendCampaign) {
        const campaignStep = await this.executeCampaign(
          request.leadIds,
          request.options?.templateId,
          request.options?.campaignName,
          request.options?.quickMessage
        );
        result.steps.push(campaignStep);
        if (campaignStep.status === "completed") {
          result.campaignId = campaignStep.data?.campaignId;
        }
      }

      // Step 3: Export to CRM if requested
      if (request.actions.exportToCrm) {
        const crmStep = await this.executeCrmExport(
          request.leadIds,
          request.options?.crmIntegrationId
        );
        result.steps.push(crmStep);
        if (crmStep.status === "completed") {
          result.crmExportResults = crmStep.data;
        }
      }

      // Determine overall status
      const hasFailure = result.steps.some(step => step.status === "failed");
      result.overallStatus = hasFailure ? "failed" : "completed";
      result.completedAt = new Date();

      // Update history
      this.activationHistory.set(activationId, result);
      
      // Save to database
      await this.saveActivationHistory(result);

      return result;
    } catch (error: any) {
      result.overallStatus = "failed";
      result.steps.push({
        name: "System Error",
        status: "failed",
        message: error.message,
        startedAt: new Date(),
        completedAt: new Date()
      });
      this.activationHistory.set(activationId, result);
      throw error;
    }
  }

  /**
   * Execute quick action by ID
   */
  async executeQuickAction(
    actionId: string,
    leadIds: string[],
    options?: any
  ): Promise<LeadActivationResult> {
    const action = LeadActivationHub.QUICK_ACTIONS.find(a => a.id === actionId);
    if (!action) {
      throw new Error(`Quick action '${actionId}' not found`);
    }

    // Validate requirements
    if (action.requiresTemplate && !options?.templateId) {
      throw new Error("This action requires a campaign template");
    }
    if (action.requiresCrmIntegration && !options?.crmIntegrationId) {
      throw new Error("This action requires a CRM integration");
    }

    return this.activateLeads({
      leadIds,
      actions: action.actions,
      options
    });
  }

  /**
   * Execute enrichment step
   */
  private async executeEnrichment(leadIds: string[]): Promise<ActivationStep> {
    const step: ActivationStep = {
      name: "Lead Enrichment",
      status: "processing",
      startedAt: new Date()
    };

    try {
      const enrichmentPromises = leadIds.map(async (leadId) => {
        const lead = await storage.getLead(leadId);
        if (!lead) {
          return { leadId, error: "Lead not found" };
        }

        // Check if already enriched recently (within 7 days)
        const existingEnrichment = await storage.getLeadEnrichment(leadId);
        if (existingEnrichment && this.isRecentEnrichment((existingEnrichment as any).createdAt || existingEnrichment.enrichedAt)) {
          return { leadId, data: existingEnrichment, cached: true };
        }

        // Perform enrichment
        const enrichmentData = await leadEnrichmentService.generateMockEnrichment(lead);
        
        // Validate phone if present
        if (lead.phone) {
          try {
            const phoneValidation = await numverifyService.validatePhone(lead.phone);
            if (phoneValidation.isValid) {
              enrichmentData.contactInfo = {
                ...enrichmentData.contactInfo,
                phoneValidation
              };
            }
          } catch (error) {
            // Phone validation is optional, continue without it
            console.warn("Phone validation failed:", error);
          }
        }

        // Save enrichment
        const saved = await storage.createLeadEnrichment(enrichmentData as any);
        
        // Update lead with enrichment status
        await storage.updateLead(leadId, { 
          isEnriched: true,
          lastEnrichedAt: new Date()
        });

        return { leadId, data: saved };
      });

      const results = await Promise.all(enrichmentPromises);
      const successCount = results.filter(r => r.data).length;

      step.status = successCount > 0 ? "completed" : "failed";
      step.message = `Enriched ${successCount} out of ${leadIds.length} leads`;
      step.data = results;
      step.completedAt = new Date();
    } catch (error: any) {
      step.status = "failed";
      step.message = error.message;
      step.completedAt = new Date();
    }

    return step;
  }

  /**
   * Execute campaign step
   */
  private async executeCampaign(
    leadIds: string[],
    templateId?: string,
    campaignName?: string,
    quickMessage?: string
  ): Promise<ActivationStep> {
    const step: ActivationStep = {
      name: "Campaign Execution",
      status: "processing",
      startedAt: new Date()
    };

    try {
      // Get leads
      const leads = await Promise.all(
        leadIds.map(id => storage.getLead(id))
      );
      const validLeads = leads.filter(lead => lead !== null) as Lead[];

      if (validLeads.length === 0) {
        throw new Error("No valid leads found");
      }

      // Create or use quick template
      let template: CampaignTemplate;
      if (quickMessage) {
        // Create a temporary quick template
        template = {
          id: "quick-template",
          templateName: "Quick Message",
          templateType: "email",
          content: quickMessage,
          category: "quick",
          variables: campaignService.extractVariables(quickMessage),
          isPublic: false,
          createdAt: new Date()
        } as CampaignTemplate;
      } else if (templateId) {
        const existingTemplate = await storage.getCampaignTemplate(templateId);
        if (!existingTemplate) {
          throw new Error("Template not found");
        }
        template = existingTemplate;
      } else {
        throw new Error("No template or quick message provided");
      }

      // Create campaign
      const campaign = await storage.createCampaign({
        campaignName: campaignName || `Activation Campaign - ${new Date().toLocaleDateString()}`,
        templateId: template.id,
        recipientCount: validLeads.length,
        status: "draft",
        userId: "system", // This would be the actual user ID in production
        purchaseId: "",
      } as any);

      // Process campaign
      await campaignService.processCampaign(campaign.id);

      step.status = "completed";
      step.message = `Campaign sent to ${validLeads.length} leads`;
      step.data = { campaignId: campaign.id, recipientCount: validLeads.length };
      step.completedAt = new Date();
    } catch (error: any) {
      step.status = "failed";
      step.message = error.message;
      step.completedAt = new Date();
    }

    return step;
  }

  /**
   * Execute CRM export step
   */
  private async executeCrmExport(
    leadIds: string[],
    integrationId?: string
  ): Promise<ActivationStep> {
    const step: ActivationStep = {
      name: "CRM Export",
      status: "processing",
      startedAt: new Date()
    };

    try {
      if (!integrationId) {
        // Try to find active integration
        const integrations = await storage.getCrmIntegrations();
        const activeIntegration = integrations.find(i => i.isActive);
        if (!activeIntegration) {
          throw new Error("No CRM integration configured");
        }
        integrationId = activeIntegration.id;
      }

      const integration = await storage.getCrmIntegration(integrationId);
      if (!integration) {
        throw new Error("CRM integration not found");
      }

      // Get leads
      const leads = await Promise.all(
        leadIds.map(id => storage.getLead(id))
      );
      const validLeads = leads.filter(lead => lead !== null) as Lead[];

      // Create appropriate adapter
      let adapter: CrmAdapter;
      switch (integration.crmType) {
        case "salesforce":
          adapter = new SalesforceAdapter(integration);
          break;
        case "hubspot":
          adapter = new HubSpotAdapter(integration);
          break;
        case "pipedrive":
          adapter = new PipedriveAdapter(integration);
          break;
        case "custom_api":
          adapter = new CustomApiAdapter(integration);
          break;
        default:
          throw new Error(`Unsupported CRM type: ${integration.crmType}`);
      }

      // Export leads
      const exportResult = await adapter.exportLeads(validLeads);

      // Log sync
      await storage.createCrmSyncLog({
        integrationId: integration.id,
        leadIds: leadIds,
        status: exportResult.success ? "success" : "failed",
        errorMessage: exportResult.errors?.join("; ") || null,
      } as any);

      // Update integration last sync
      await storage.updateCrmIntegration(integration.id, {
        lastSyncAt: new Date()
      });

      step.status = exportResult.success ? "completed" : "failed";
      step.message = `Exported ${exportResult.exportedCount} of ${validLeads.length} leads`;
      step.data = exportResult;
      step.completedAt = new Date();
    } catch (error: any) {
      step.status = "failed";
      step.message = error.message;
      step.completedAt = new Date();
    }

    return step;
  }

  /**
   * Get activation history for a user
   */
  async getActivationHistory(userId?: string, limit: number = 50): Promise<LeadActivationResult[]> {
    // In production, this would query from database
    const history = Array.from(this.activationHistory.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return history;
  }

  /**
   * Get activation status by ID
   */
  getActivationStatus(activationId: string): LeadActivationResult | undefined {
    return this.activationHistory.get(activationId);
  }

  /**
   * Get lead activation history
   */
  async getLeadActivationHistory(leadId: string): Promise<any[]> {
    const history = await storage.getLeadActivationHistory(leadId);
    return history;
  }

  /**
   * Preview activation workflow
   */
  async previewActivation(request: LeadActivationRequest): Promise<{
    steps: { name: string; description: string; enabled: boolean }[];
    estimatedLeads: number;
    warnings: string[];
  }> {
    const steps = [];
    const warnings = [];

    // Check enrichment
    if (request.actions.enrich) {
      steps.push({
        name: "Lead Enrichment",
        description: "Enrich lead data with company details, social profiles, and phone validation",
        enabled: true
      });
    }

    // Check campaign
    if (request.actions.sendCampaign) {
      steps.push({
        name: "Campaign Execution",
        description: request.options?.quickMessage 
          ? "Send quick message to leads"
          : "Send campaign using selected template",
        enabled: true
      });

      if (!request.options?.templateId && !request.options?.quickMessage) {
        warnings.push("No template or message selected for campaign");
      }
    }

    // Check CRM export
    if (request.actions.exportToCrm) {
      steps.push({
        name: "CRM Export",
        description: "Export leads to configured CRM system",
        enabled: true
      });

      const integrations = await storage.getCrmIntegrations();
      if (integrations.length === 0) {
        warnings.push("No CRM integration configured");
      }
    }

    return {
      steps,
      estimatedLeads: request.leadIds.length,
      warnings
    };
  }

  /**
   * Helper: Generate unique activation ID
   */
  private generateActivationId(): string {
    return `activation_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Helper: Check if enrichment is recent
   */
  private isRecentEnrichment(date: Date | string): boolean {
    const enrichmentDate = typeof date === "string" ? new Date(date) : date;
    const daysSince = (Date.now() - enrichmentDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince < 7;
  }

  /**
   * Helper: Save activation history to database
   */
  private async saveActivationHistory(result: LeadActivationResult): Promise<void> {
    // Save main activation record
    await storage.createLeadActivationHistory({
      activationId: result.id,
      leadIds: result.leadIds,
      steps: result.steps,
      overallStatus: result.overallStatus,
      enrichmentResults: result.enrichmentResults,
      campaignId: result.campaignId,
      crmExportResults: result.crmExportResults,
      createdAt: result.createdAt,
      completedAt: result.completedAt
    });

    // Update individual lead records
    for (const leadId of result.leadIds) {
      await storage.updateLead(leadId, {
        lastActivatedAt: result.completedAt || result.createdAt
      });
    }
  }
}

// Export singleton instance
export const leadActivationHub = new LeadActivationHub();