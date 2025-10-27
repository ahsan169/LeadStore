import { storage } from "../storage";
import type { Lead, Purchase, CampaignTemplate, Campaign, InsertCampaignTemplate, InsertCampaign } from "@shared/schema";

export interface CampaignVariable {
  name: string;
  description: string;
  example: string;
}

export interface TemplatePreview {
  subject?: string;
  content: string;
  variables: string[];
  missingVariables: string[];
}

export interface CampaignPreviewData {
  template: CampaignTemplate;
  recipients: Lead[];
  previews: {
    leadId: string;
    businessName: string;
    subject?: string;
    content: string;
  }[];
}

export class CampaignService {
  // Available variables for templates
  static readonly AVAILABLE_VARIABLES: CampaignVariable[] = [
    { name: "businessName", description: "Business name", example: "ABC Corp" },
    { name: "ownerName", description: "Owner's name", example: "John Doe" },
    { name: "industry", description: "Business industry", example: "Restaurant" },
    { name: "annualRevenue", description: "Annual revenue", example: "$500,000" },
    { name: "requestedAmount", description: "Funding amount requested", example: "$50,000" },
    { name: "timeInBusiness", description: "Years in business", example: "5 years" },
    { name: "creditScore", description: "Credit score range", example: "700-750" },
    { name: "stateCode", description: "State code", example: "NY" },
    { name: "urgencyLevel", description: "Funding urgency", example: "Immediate" },
    { name: "phone", description: "Phone number", example: "(555) 123-4567" },
    { name: "email", description: "Email address", example: "contact@business.com" },
  ];

  // Pre-built MCA templates
  static readonly DEFAULT_TEMPLATES: Partial<InsertCampaignTemplate>[] = [
    // Initial Outreach Templates
    {
      templateName: "MCA Introduction - Professional",
      templateType: "email",
      subject: "Quick Funding Available for {{businessName}}",
      content: `Dear {{ownerName}},

I noticed that {{businessName}} has been successfully operating for {{timeInBusiness}} in the {{industry}} industry. Congratulations on building such a strong business!

Many businesses like yours are taking advantage of Merchant Cash Advances to:
• Expand operations without diluting ownership
• Take advantage of time-sensitive opportunities
• Smooth out cash flow during seasonal changes

With your business generating {{annualRevenue}} annually, you could qualify for up to {{requestedAmount}} in funding with:
✓ Approval in 24 hours
✓ Funding in 2-3 business days
✓ No collateral required
✓ Flexible repayment based on your sales

Would you like to discuss how we can help {{businessName}} reach its next milestone?

Best regards,
[Your Name]
[Your Company]`,
      variables: ["businessName", "ownerName", "timeInBusiness", "industry", "annualRevenue", "requestedAmount"],
      category: "intro",
      isPublic: true
    },
    {
      templateName: "MCA Introduction - Casual",
      templateType: "sms",
      content: `Hi {{ownerName}}, saw {{businessName}} might need {{requestedAmount}} in funding. We can approve in 24hrs with your {{creditScore}} credit. Interested? Reply YES for details.`,
      variables: ["ownerName", "businessName", "requestedAmount", "creditScore"],
      category: "intro",
      isPublic: true
    },
    
    // Follow-up Templates
    {
      templateName: "First Follow-up - Value Focus",
      templateType: "email",
      subject: "{{ownerName}}, here's how {{requestedAmount}} could transform {{businessName}}",
      content: `Hi {{ownerName}},

I wanted to follow up on my previous message about funding for {{businessName}}.

I've worked with many {{industry}} businesses in {{stateCode}}, and I've seen firsthand how the right funding at the right time can accelerate growth.

Here's what {{requestedAmount}} in working capital could mean for {{businessName}}:
• Bulk inventory purchases at discount rates
• Equipment upgrades to increase efficiency
• Marketing campaigns to attract new customers
• Hiring key staff to support expansion

The best part? With your {{creditScore}} credit score and {{annualRevenue}} in revenue, you're already pre-qualified.

Can we schedule a quick 10-minute call to discuss your specific needs?

Best regards,
[Your Name]`,
      variables: ["ownerName", "requestedAmount", "businessName", "industry", "stateCode", "creditScore", "annualRevenue"],
      category: "follow_up",
      isPublic: true
    },
    {
      templateName: "Second Follow-up - Urgency",
      templateType: "email",
      subject: "Limited time: Special rates for {{industry}} businesses",
      content: `{{ownerName}},

Quick update - we have special rates this month for {{industry}} businesses in {{stateCode}}.

Given that {{businessName}} has been operating for {{timeInBusiness}} with strong revenue, you qualify for our preferred rates:
• Reduced factor rates
• Extended repayment terms
• No application fees

This offer expires at the end of the month. With your {{urgencyLevel}} funding timeline, this could be perfect timing.

Ready to move forward? The application takes just 5 minutes.

[Your Name]
[Your Phone]`,
      variables: ["ownerName", "industry", "stateCode", "businessName", "timeInBusiness", "urgencyLevel"],
      category: "follow_up",
      isPublic: true
    },
    
    // Special Offer Templates
    {
      templateName: "Exclusive Offer - VIP Rates",
      templateType: "email",
      subject: "VIP Funding Offer for {{businessName}} - Act Fast",
      content: `Dear {{ownerName}},

Based on {{businessName}}'s strong profile, you've been selected for our VIP funding program.

EXCLUSIVE BENEFITS:
★ Funding up to {{requestedAmount}}
★ Lowest factor rates (starting at 1.09)
★ Same-day approval
★ Dedicated account manager
★ No personal guarantee under $50K

This VIP offer is only available to businesses with:
✓ {{timeInBusiness}}+ in business (You qualify!)
✓ {{annualRevenue}}+ in revenue (You qualify!)
✓ {{creditScore}}+ credit score (You qualify!)

This exclusive rate expires in 48 hours.

Claim your VIP status now: [Application Link]

Questions? Call me directly at [Your Phone]

[Your Name]
Senior Funding Advisor`,
      variables: ["ownerName", "businessName", "requestedAmount", "timeInBusiness", "annualRevenue", "creditScore"],
      category: "offer",
      isPublic: true
    },
    {
      templateName: "Seasonal Offer",
      templateType: "sms",
      content: `{{ownerName}}, special seasonal rates for {{industry}} businesses! Get {{requestedAmount}} with NO fees this month. {{businessName}} pre-approved. Reply NOW to claim.`,
      variables: ["ownerName", "industry", "requestedAmount", "businessName"],
      category: "offer",
      isPublic: true
    },
    
    // Payment Reminder Templates
    {
      templateName: "Funding Approval Reminder",
      templateType: "email",
      subject: "{{businessName}}'s Pre-Approval Expires Soon",
      content: `Hi {{ownerName}},

Just a quick reminder that {{businessName}}'s pre-approval for {{requestedAmount}} expires in 3 days.

You've already done the hard part - you're approved! All that's left is to:
1. Review and sign the agreement
2. Provide a recent bank statement
3. Receive your funds

Don't let this opportunity pass by. Your pre-approved terms are locked in at our best rates for {{industry}} businesses.

Complete your funding: [Link]

Need help? I'm here to answer any questions.

[Your Name]
[Your Phone]`,
      variables: ["ownerName", "businessName", "requestedAmount", "industry"],
      category: "reminder",
      isPublic: true
    },
    {
      templateName: "Last Chance Reminder",
      templateType: "sms",
      content: `{{ownerName}}, last chance! {{businessName}}'s {{requestedAmount}} pre-approval expires tomorrow. Don't lose your locked rate. Complete now: [Link]`,
      variables: ["ownerName", "businessName", "requestedAmount"],
      category: "reminder",
      isPublic: true
    }
  ];

  // Initialize default templates
  async initializeDefaultTemplates() {
    const existingTemplates = await storage.getCampaignTemplates();
    
    if (existingTemplates.length === 0) {
      console.log("[CampaignService] Initializing default templates...");
      for (const template of CampaignService.DEFAULT_TEMPLATES) {
        await storage.createCampaignTemplate(template as InsertCampaignTemplate);
      }
      console.log(`[CampaignService] Created ${CampaignService.DEFAULT_TEMPLATES.length} default templates`);
    }
  }

  // Extract variables from template content
  extractVariables(content: string, subject?: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables = new Set<string>();
    
    // Extract from content
    let match;
    while ((match = regex.exec(content)) !== null) {
      variables.add(match[1]);
    }
    
    // Extract from subject if email
    if (subject) {
      regex.lastIndex = 0;
      while ((match = regex.exec(subject)) !== null) {
        variables.add(match[1]);
      }
    }
    
    return Array.from(variables);
  }

  // Replace variables in template with lead data
  replaceVariables(template: string, lead: Lead): string {
    let result = template;
    
    // Create a map of variable names to values
    const variables: Record<string, string> = {
      businessName: lead.businessName || "Your Business",
      ownerName: lead.ownerName || "Business Owner",
      industry: lead.industry || "your industry",
      annualRevenue: lead.annualRevenue || "N/A",
      requestedAmount: lead.requestedAmount || "$50,000",
      timeInBusiness: lead.timeInBusiness || "N/A",
      creditScore: lead.creditScore || "N/A",
      stateCode: lead.stateCode || "N/A",
      urgencyLevel: lead.urgencyLevel || "standard",
      phone: lead.phone || "N/A",
      email: lead.email || "N/A"
    };
    
    // Replace each variable
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    }
    
    return result;
  }

  // Preview template with sample data
  async previewTemplate(templateId: string, leadIds: string[]): Promise<CampaignPreviewData> {
    const template = await storage.getCampaignTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Get leads for preview
    const leads = await Promise.all(
      leadIds.slice(0, 5).map(id => storage.getLead(id))
    );
    
    const validLeads = leads.filter(lead => lead !== undefined) as Lead[];
    
    const previews = validLeads.map(lead => ({
      leadId: lead.id,
      businessName: lead.businessName,
      subject: template.subject ? this.replaceVariables(template.subject, lead) : undefined,
      content: this.replaceVariables(template.content, lead)
    }));
    
    return {
      template,
      recipients: validLeads,
      previews
    };
  }

  // Create and send campaign
  async createCampaign(
    userId: string,
    purchaseId: string,
    templateId: string,
    campaignName: string,
    scheduledAt?: Date
  ): Promise<Campaign> {
    // Get purchase details
    const purchase = await storage.getPurchase(purchaseId);
    if (!purchase) {
      throw new Error("Purchase not found");
    }
    
    if (purchase.userId !== userId) {
      throw new Error("Unauthorized");
    }
    
    // Get template
    const template = await storage.getCampaignTemplate(templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Create campaign
    const campaign = await storage.createCampaign({
      userId,
      purchaseId,
      campaignName,
      templateId,
      recipientCount: purchase.leadIds?.length || 0,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt
    });
    
    // If sending immediately, process the campaign
    if (!scheduledAt) {
      await this.processCampaign(campaign.id);
    }
    
    return campaign;
  }

  // Process campaign (mock sending)
  async processCampaign(campaignId: string): Promise<void> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error("Campaign not found");
    }
    
    const template = await storage.getCampaignTemplate(campaign.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    const purchase = await storage.getPurchase(campaign.purchaseId);
    if (!purchase || !purchase.leadIds) {
      throw new Error("Purchase or leads not found");
    }
    
    // Mock sending to each lead
    console.log(`[CampaignService] Processing campaign: ${campaign.campaignName}`);
    console.log(`[CampaignService] Template: ${template.templateName} (${template.templateType})`);
    console.log(`[CampaignService] Recipients: ${purchase.leadIds.length} leads`);
    
    // In a real implementation, this would:
    // 1. Get all leads from purchase
    // 2. Replace variables for each lead
    // 3. Send via SendGrid (email) or Twilio (SMS)
    // 4. Track delivery status
    // 5. Update campaign metrics
    
    // Update campaign status
    await storage.sendCampaign(campaignId);
    
    console.log(`[CampaignService] Campaign sent successfully`);
  }

  // Get campaign statistics
  async getCampaignStats(userId: string): Promise<{
    totalCampaigns: number;
    sentCampaigns: number;
    scheduledCampaigns: number;
    draftCampaigns: number;
    totalRecipients: number;
    averageOpenRate: number;
    averageClickRate: number;
  }> {
    const campaigns = await storage.getCampaignsByUserId(userId);
    
    const stats = {
      totalCampaigns: campaigns.length,
      sentCampaigns: campaigns.filter(c => c.status === 'sent').length,
      scheduledCampaigns: campaigns.filter(c => c.status === 'scheduled').length,
      draftCampaigns: campaigns.filter(c => c.status === 'draft').length,
      totalRecipients: campaigns.reduce((sum, c) => sum + c.recipientCount, 0),
      averageOpenRate: 0,
      averageClickRate: 0
    };
    
    // Calculate average rates for sent campaigns
    const sentCampaigns = campaigns.filter(c => c.status === 'sent');
    if (sentCampaigns.length > 0) {
      stats.averageOpenRate = sentCampaigns.reduce((sum, c) => 
        sum + (c.recipientCount > 0 ? (c.openCount / c.recipientCount) * 100 : 0), 0
      ) / sentCampaigns.length;
      
      stats.averageClickRate = sentCampaigns.reduce((sum, c) => 
        sum + (c.recipientCount > 0 ? (c.clickCount / c.recipientCount) * 100 : 0), 0
      ) / sentCampaigns.length;
    }
    
    return stats;
  }

  // Schedule campaign check (would be called by a cron job)
  async processScheduledCampaigns(): Promise<void> {
    const campaigns = await storage.getCampaignsByUserId(''); // Would need a method to get all scheduled campaigns
    const now = new Date();
    
    for (const campaign of campaigns) {
      if (campaign.status === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt <= now) {
        await this.processCampaign(campaign.id);
      }
    }
  }
}

// Export singleton instance
export const campaignService = new CampaignService();