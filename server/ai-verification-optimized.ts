import OpenAI from "openai";
import type { InsertVerificationResult } from "@shared/schema";
import { storage } from "./storage";
import { WebSocket } from "ws";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

// Progress tracking interface
interface VerificationProgress {
  totalLeads: number;
  processedLeads: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
  estimatedTimeRemaining: number; // in seconds
  status: 'initializing' | 'processing' | 'completing' | 'done' | 'error';
  message: string;
}

// Optimized lead verification result
interface OptimizedLeadResult {
  rowNumber: number;
  status: 'verified' | 'warning' | 'failed';
  verificationScore: number;
  confidenceScore: number;
  issues: string[];
  warnings: string[];
  suggestions: string[];
  isDuplicate: boolean;
  duplicateType?: string;
  aiInsights: {
    businessLegitimacy: boolean;
    dataQuality: 'high' | 'medium' | 'low';
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: string;
  };
  correctedData?: {
    businessName?: string;
    phone?: string;
    email?: string;
    ownerName?: string;
    address?: string;
  };
}

// Batch verification request
interface BatchVerificationRequest {
  leads: Array<{
    rowNumber: number;
    businessName?: string;
    ownerName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    industry?: string;
    annualRevenue?: string;
    creditScore?: string;
  }>;
}

export class OptimizedAIVerificationEngine {
  private strictnessLevel: 'strict' | 'moderate' | 'lenient';
  private progressCallback?: (progress: VerificationProgress) => void;
  private wsClients: Set<WebSocket> = new Set();
  private existingLeads: Map<string, any> = new Map();
  private abortController: AbortController;
  private startTime: number = 0;
  private processedCount: number = 0;
  
  constructor(
    strictnessLevel: 'strict' | 'moderate' | 'lenient' = 'moderate',
    progressCallback?: (progress: VerificationProgress) => void
  ) {
    this.strictnessLevel = strictnessLevel;
    this.progressCallback = progressCallback;
    this.abortController = new AbortController();
  }

  /**
   * Add WebSocket client for real-time updates
   */
  addWebSocketClient(ws: WebSocket) {
    this.wsClients.add(ws);
    ws.on('close', () => this.wsClients.delete(ws));
  }

  /**
   * Send progress update to all connected clients
   */
  private sendProgress(progress: VerificationProgress) {
    // Call the callback if provided
    if (this.progressCallback) {
      this.progressCallback(progress);
    }

    // Send to all WebSocket clients
    const message = JSON.stringify({ type: 'verification-progress', data: progress });
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Optimized batch verification - processes multiple leads in a single API call
   */
  async verifyBatchOptimized(
    leads: any[],
    sessionId: string,
    timeoutMs: number = 300000 // 5 minute timeout
  ): Promise<InsertVerificationResult[]> {
    this.startTime = Date.now();
    this.processedCount = 0;
    const results: InsertVerificationResult[] = [];
    
    // Load existing leads for duplicate detection
    console.log('Loading existing leads for duplicate detection...');
    this.existingLeads.clear();
    const existingLeadsData = await storage.getFilteredLeads({ limit: 10000 });
    existingLeadsData.forEach(lead => {
      this.existingLeads.set(lead.id, lead);
    });
    
    // Configure batch size based on lead count and API limits
    const BATCH_SIZE = Math.min(10, Math.max(5, Math.floor(100 / leads.length))); // Dynamic batch size
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);
    
    console.log(`Processing ${leads.length} leads in ${totalBatches} batches of up to ${BATCH_SIZE} leads each`);
    
    // Send initial progress
    this.sendProgress({
      totalLeads: leads.length,
      processedLeads: 0,
      percentage: 0,
      currentBatch: 0,
      totalBatches,
      estimatedTimeRemaining: 0,
      status: 'initializing',
      message: 'Starting AI verification...'
    });

    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.abortController.abort();
        reject(new Error(`Verification timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      console.log(`[AI Verification] Starting verification with ${totalBatches} batches`);
      console.log(`[AI Verification] Strictness level: ${this.strictnessLevel}`);
      console.log(`[AI Verification] Timeout: ${timeoutMs}ms`);
      
      // Process in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check if aborted
        if (this.abortController.signal.aborted) {
          console.warn(`[AI Verification] Process aborted at batch ${batchIndex + 1}`);
          throw new Error('Verification aborted');
        }

        const startIdx = batchIndex * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, leads.length);
        const batch = leads.slice(startIdx, endIdx);
        
        // Calculate estimated time remaining
        const elapsedTime = (Date.now() - this.startTime) / 1000;
        const avgTimePerBatch = elapsedTime / Math.max(1, batchIndex);
        const remainingBatches = totalBatches - batchIndex - 1;
        const estimatedTimeRemaining = Math.round(avgTimePerBatch * remainingBatches);
        
        // Send progress update
        this.sendProgress({
          totalLeads: leads.length,
          processedLeads: startIdx,
          percentage: Math.round((startIdx / leads.length) * 100),
          currentBatch: batchIndex + 1,
          totalBatches,
          estimatedTimeRemaining,
          status: 'processing',
          message: `Processing batch ${batchIndex + 1} of ${totalBatches}...`
        });
        
        console.log(`[AI Verification] Processing batch ${batchIndex + 1}/${totalBatches} (leads ${startIdx + 1}-${endIdx})`);
        console.log(`[AI Verification] ETA: ${estimatedTimeRemaining}s, Elapsed: ${elapsedTime.toFixed(1)}s`);
        
        let batchResults: any[];
        try {
          // Verify batch with timeout
          batchResults = await Promise.race([
            this.verifyBatchWithSingleCall(batch, startIdx),
            timeoutPromise
          ]);
          
          console.log(`[AI Verification] Batch ${batchIndex + 1} completed successfully`);
        } catch (batchError: any) {
          console.error(`[AI Verification] Error in batch ${batchIndex + 1}:`, batchError.message);
          throw batchError;
        }
        
        // Convert to database format and add to results
        for (let i = 0; i < batchResults.length; i++) {
          const leadData = batch[i];
          const aiResult = batchResults[i];
          
          // Check for duplicates
          const duplicateCheck = this.checkForDuplicates(leadData);
          
          const result: InsertVerificationResult = {
            sessionId,
            rowNumber: startIdx + i + 1,
            leadData: {
              ...leadData,
              // Apply any corrections from AI
              businessName: aiResult.correctedData?.businessName || leadData.businessName,
              phone: aiResult.correctedData?.phone || leadData.phone,
              email: aiResult.correctedData?.email || leadData.email,
              ownerName: aiResult.correctedData?.ownerName || leadData.ownerName,
            },
            status: aiResult.status,
            verificationScore: aiResult.verificationScore,
            phoneValidation: {
              valid: !aiResult.issues.some(i => i.includes('phone')),
              issues: aiResult.issues.filter(i => i.includes('phone')),
              warnings: aiResult.warnings.filter(w => w.includes('phone')),
              formatted: aiResult.correctedData?.phone
            },
            emailValidation: {
              valid: !aiResult.issues.some(i => i.includes('email')),
              issues: aiResult.issues.filter(i => i.includes('email')),
              warnings: aiResult.warnings.filter(w => w.includes('email'))
            },
            businessNameValidation: {
              valid: !aiResult.issues.some(i => i.includes('business')),
              issues: aiResult.issues.filter(i => i.includes('business')),
              warnings: aiResult.warnings.filter(w => w.includes('business'))
            },
            ownerNameValidation: {
              valid: !aiResult.issues.some(i => i.includes('owner') || i.includes('name')),
              issues: aiResult.issues.filter(i => i.includes('owner') || i.includes('name')),
              warnings: aiResult.warnings.filter(w => w.includes('owner') || w.includes('name'))
            },
            addressValidation: {
              valid: !aiResult.issues.some(i => i.includes('address')),
              issues: aiResult.issues.filter(i => i.includes('address')),
              warnings: aiResult.warnings.filter(w => w.includes('address'))
            },
            isDuplicate: duplicateCheck.isDuplicate || aiResult.isDuplicate,
            duplicateType: duplicateCheck.type || aiResult.duplicateType,
            duplicateLeadId: duplicateCheck.matchedLeadId,
            issues: aiResult.issues,
            warnings: aiResult.warnings,
            selectedForImport: this.shouldImport(aiResult, duplicateCheck.isDuplicate)
          };
          
          // Store AI insights in leadData for display
          result.leadData.aiInsights = {
            confidenceScore: aiResult.confidenceScore,
            riskLevel: aiResult.aiInsights.riskLevel,
            dataQuality: aiResult.aiInsights.dataQuality,
            recommendation: aiResult.aiInsights.recommendation,
            suggestions: aiResult.suggestions
          };
          
          results.push(result);
        }
        
        this.processedCount = endIdx;
        
        // Add a small delay between batches to avoid rate limiting
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Send completion progress
      this.sendProgress({
        totalLeads: leads.length,
        processedLeads: leads.length,
        percentage: 100,
        currentBatch: totalBatches,
        totalBatches,
        estimatedTimeRemaining: 0,
        status: 'done',
        message: 'Verification complete!'
      });
      
      console.log(`Verification complete. Processed ${results.length} leads in ${(Date.now() - this.startTime) / 1000}s`);
      
      return results;
      
    } catch (error: any) {
      console.error('Verification error:', error);
      
      // Send error progress
      this.sendProgress({
        totalLeads: leads.length,
        processedLeads: this.processedCount,
        percentage: Math.round((this.processedCount / leads.length) * 100),
        currentBatch: 0,
        totalBatches,
        estimatedTimeRemaining: 0,
        status: 'error',
        message: error.message || 'Verification failed'
      });
      
      throw error;
    }
  }

  /**
   * Verify a batch of leads with a single OpenAI API call
   */
  private async verifyBatchWithSingleCall(
    batch: any[],
    startIdx: number
  ): Promise<OptimizedLeadResult[]> {
    try {
      // Prepare the batch for verification
      const batchRequest: BatchVerificationRequest = {
        leads: batch.map((lead, idx) => ({
          rowNumber: startIdx + idx + 1,
          businessName: lead.businessName,
          ownerName: lead.ownerName,
          email: lead.email,
          phone: lead.phone,
          address: lead.address || lead.street,
          city: lead.city,
          state: lead.state || lead.stateCode,
          zipCode: lead.zipCode || lead.zip,
          industry: lead.industry,
          annualRevenue: lead.annualRevenue,
          creditScore: lead.creditScore
        }))
      };

      console.log(`[AI API] Making OpenAI API call for ${batch.length} leads`);
      const apiStartTime = Date.now();
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert lead verification system. Analyze the batch of MCA (Merchant Cash Advance) leads and provide comprehensive verification for each.

For each lead, evaluate:
1. Business legitimacy (not test data, realistic business name)
2. Contact information validity (phone format, email format, address completeness)
3. Data quality and completeness
4. Risk assessment for MCA lending
5. Potential corrections for obvious typos or formatting issues

Strictness level: ${this.strictnessLevel}

Return a JSON array with one object per lead:
{
  "rowNumber": number,
  "status": "verified" | "warning" | "failed",
  "verificationScore": number (0-100),
  "confidenceScore": number (0-100),
  "issues": string[], // Critical problems that should prevent import
  "warnings": string[], // Minor issues that don't prevent import
  "suggestions": string[], // Improvements that could be made
  "isDuplicate": boolean, // If similar to another lead in batch
  "duplicateType": string | null,
  "aiInsights": {
    "businessLegitimacy": boolean,
    "dataQuality": "high" | "medium" | "low",
    "riskLevel": "low" | "medium" | "high",
    "recommendation": string // Brief recommendation for this lead
  },
  "correctedData": { // Only include fields that need correction
    "businessName": string | null,
    "phone": string | null, // Format as (XXX) XXX-XXXX
    "email": string | null,
    "ownerName": string | null,
    "address": string | null
  }
}`
          },
          {
            role: "user",
            content: JSON.stringify(batchRequest)
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 4000 // Enough for detailed batch response
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`[AI API] OpenAI API call completed in ${apiTime}ms`);
      console.log(`[AI API] Tokens used - Prompt: ${response.usage?.prompt_tokens}, Completion: ${response.usage?.completion_tokens}, Total: ${response.usage?.total_tokens}`);
      
      const result = JSON.parse(response.choices[0].message.content || '{}');
      console.log(`[AI API] Received verification results for ${Array.isArray(result) ? result.length : (result.results?.length || 0)} leads`);
      
      // Ensure we have an array of results
      const results = Array.isArray(result) ? result : result.results || [];
      
      // If we didn't get enough results, fill in with defaults
      if (results.length < batch.length) {
        console.warn(`[AI API] Expected ${batch.length} results but got ${results.length}, filling with defaults`);
        while (results.length < batch.length) {
          results.push(this.getDefaultVerification(startIdx + results.length + 1));
        }
      }
      
      return results;
      
    } catch (error: any) {
      console.error('[AI API] OpenAI API error:', error.message);
      console.error('[AI API] Error details:', {
        type: error.type,
        code: error.code,
        status: error.status
      });
      
      // Return fallback verification for all leads in batch
      return batch.map((_, idx) => this.getDefaultVerification(startIdx + idx + 1));
    }
  }

  /**
   * Check for duplicates in existing leads
   */
  private checkForDuplicates(leadData: any): { 
    isDuplicate: boolean; 
    type?: string; 
    matchedLeadId?: string 
  } {
    // Check phone number duplicates
    if (leadData.phone) {
      const cleanPhone = leadData.phone.replace(/\D/g, '');
      for (const [id, existingLead] of this.existingLeads) {
        const existingPhone = existingLead.phone?.replace(/\D/g, '');
        if (existingPhone === cleanPhone) {
          return {
            isDuplicate: true,
            type: 'phone',
            matchedLeadId: id
          };
        }
      }
    }

    // Check email duplicates
    if (leadData.email) {
      const emailLower = leadData.email.toLowerCase();
      for (const [id, existingLead] of this.existingLeads) {
        if (existingLead.email?.toLowerCase() === emailLower) {
          return {
            isDuplicate: true,
            type: 'email',
            matchedLeadId: id
          };
        }
      }
    }

    // Check business name similarity (fuzzy match)
    if (leadData.businessName) {
      const businessLower = leadData.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const [id, existingLead] of this.existingLeads) {
        const existingBusiness = existingLead.businessName?.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (existingBusiness && businessLower.length > 5 && existingBusiness.length > 5) {
          // Simple similarity check
          if (businessLower === existingBusiness || 
              businessLower.includes(existingBusiness) || 
              existingBusiness.includes(businessLower)) {
            return {
              isDuplicate: true,
              type: 'business_name',
              matchedLeadId: id
            };
          }
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Determine if lead should be imported based on verification results
   */
  private shouldImport(result: OptimizedLeadResult, isDuplicate: boolean): boolean {
    if (isDuplicate) return false;
    
    switch (this.strictnessLevel) {
      case 'strict':
        return result.status === 'verified' && 
               result.verificationScore >= 80 &&
               result.aiInsights.riskLevel === 'low';
      case 'moderate':
        return (result.status === 'verified' || result.status === 'warning') &&
               result.verificationScore >= 60 &&
               result.aiInsights.riskLevel !== 'high';
      case 'lenient':
        return result.status !== 'failed' &&
               result.verificationScore >= 40;
      default:
        return false;
    }
  }

  /**
   * Get default verification when AI fails
   */
  private getDefaultVerification(rowNumber: number): OptimizedLeadResult {
    return {
      rowNumber,
      status: 'warning',
      verificationScore: 50,
      confidenceScore: 0,
      issues: [],
      warnings: ['Verification could not be completed with AI'],
      suggestions: ['Manual review recommended'],
      isDuplicate: false,
      aiInsights: {
        businessLegitimacy: true,
        dataQuality: 'medium',
        riskLevel: 'medium',
        recommendation: 'Manual review recommended due to AI verification failure'
      }
    };
  }

  /**
   * Abort the verification process
   */
  abort() {
    this.abortController.abort();
  }
}