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
    
    // Configure batch size dynamically based on total lead count (moved up for scope)
    // Start with smaller batches if we've had issues
    let BATCH_SIZE: number;
    let errorCount = 0;
    const MAX_ERRORS_BEFORE_REDUCTION = 2;
    
    if (leads.length < 100) {
      BATCH_SIZE = 5;  // Small batch for few leads
    } else if (leads.length < 500) {
      BATCH_SIZE = 10; // Medium batch for moderate count
    } else if (leads.length < 1000) {
      BATCH_SIZE = 15; // Reduced from 20 for better reliability
    } else {
      BATCH_SIZE = 20; // Reduced from 30 for better reliability
    }
    
    const totalBatches = Math.ceil(leads.length / BATCH_SIZE);
    
    // Load existing leads for duplicate detection
    console.log('Loading existing leads for duplicate detection...');
    this.existingLeads.clear();
    const { leads: existingLeadsData } = await storage.getFilteredLeads({ limit: 10000 });
    existingLeadsData.forEach(lead => {
      this.existingLeads.set(lead.id, lead);
    });
    
    console.log(`[AI Verification] Using batch size of ${BATCH_SIZE} for ${leads.length} leads`);
    
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

    // Set up timeout with clearer error message
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        this.abortController.abort();
        const timeoutMinutes = Math.round(timeoutMs / 60000);
        const processedPercentage = Math.round((this.processedCount / leads.length) * 100);
        reject(new Error(
          `Verification timeout after ${timeoutMinutes} minutes. ` +
          `Processed ${this.processedCount} of ${leads.length} leads (${processedPercentage}%). ` +
          `Consider using smaller batch sizes or increasing the timeout for large datasets.`
        ));
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
        let usedFallback = false;
        try {
          // Verify batch with timeout
          batchResults = await Promise.race([
            this.verifyBatchWithSingleCall(batch, startIdx),
            timeoutPromise
          ]);
          
          console.log(`[AI Verification] ✅ Batch ${batchIndex + 1} completed successfully`);
        } catch (batchError: any) {
          console.error(`[AI Verification] ❌ Error in batch ${batchIndex + 1}:`, batchError.message);
          
          // Provide more detailed error information
          const batchLeadsInfo = batch.slice(0, 3).map(l => l.businessName || 'Unknown').join(', ');
          const errorMessage = batchError.message || 'Unknown error';
          
          // Check for specific error types that should stop the entire process
          if (errorMessage.includes('API key') || errorMessage.includes('authentication')) {
            throw new Error(
              `OpenAI API authentication failed. Please check your API key configuration.`
            );
          } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
            throw new Error(
              `API rate limit reached at batch ${batchIndex + 1}. ` +
              `Please wait a few minutes and try again with smaller batch sizes.`
            );
          }
          
          // For other errors, track and potentially reduce batch size
          errorCount++;
          console.warn(`[AI Verification] ⚠️  Using fallback verification for batch ${batchIndex + 1} (error count: ${errorCount})`);
          console.warn(`[AI Verification] Affected leads: ${batchLeadsInfo}...`);
          
          // If we're getting too many errors, suggest reducing batch size
          if (errorCount >= MAX_ERRORS_BEFORE_REDUCTION && BATCH_SIZE > 5) {
            console.warn(`[AI Verification] ⚠️  Consider reducing batch size from ${BATCH_SIZE} to improve reliability`);
          }
          
          batchResults = batch.map((_, idx) => this.getDefaultVerification(startIdx + idx + 1));
          usedFallback = true;
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
              valid: !aiResult.issues.some((i: string) => i.includes('phone')),
              issues: aiResult.issues.filter((i: string) => i.includes('phone')),
              warnings: aiResult.warnings.filter((w: string) => w.includes('phone')),
              formatted: aiResult.correctedData?.phone
            },
            emailValidation: {
              valid: !aiResult.issues.some((i: string) => i.includes('email')),
              issues: aiResult.issues.filter((i: string) => i.includes('email')),
              warnings: aiResult.warnings.filter((w: string) => w.includes('email'))
            },
            businessNameValidation: {
              valid: !aiResult.issues.some((i: string) => i.includes('business')),
              issues: aiResult.issues.filter((i: string) => i.includes('business')),
              warnings: aiResult.warnings.filter((w: string) => w.includes('business'))
            },
            ownerNameValidation: {
              valid: !aiResult.issues.some((i: string) => i.includes('owner') || i.includes('name')),
              issues: aiResult.issues.filter((i: string) => i.includes('owner') || i.includes('name')),
              warnings: aiResult.warnings.filter((w: string) => w.includes('owner') || w.includes('name'))
            },
            addressValidation: {
              valid: !aiResult.issues.some((i: string) => i.includes('address')),
              issues: aiResult.issues.filter((i: string) => i.includes('address')),
              warnings: aiResult.warnings.filter((w: string) => w.includes('address'))
            },
            isDuplicate: duplicateCheck.isDuplicate || aiResult.isDuplicate,
            duplicateType: duplicateCheck.type || aiResult.duplicateType,
            duplicateLeadId: duplicateCheck.matchedLeadId,
            issues: aiResult.issues,
            warnings: aiResult.warnings,
            selectedForImport: this.shouldImport(aiResult, duplicateCheck.isDuplicate)
          };
          
          // Store AI insights in leadData for display
          if (result.leadData && typeof result.leadData === 'object') {
            (result.leadData as any).aiInsights = {
              confidenceScore: aiResult.confidenceScore,
              riskLevel: aiResult.aiInsights.riskLevel,
              dataQuality: aiResult.aiInsights.dataQuality,
              recommendation: aiResult.aiInsights.recommendation,
              suggestions: aiResult.suggestions
            };
          }
          
          results.push(result);
        }
        
        this.processedCount = endIdx;
        
        // Send updated progress after batch completion with more accurate percentage
        const actualPercentage = Math.round((endIdx / leads.length) * 100);
        const newElapsedTime = (Date.now() - this.startTime) / 1000;
        const newAvgTimePerBatch = newElapsedTime / (batchIndex + 1);
        const newRemainingBatches = totalBatches - batchIndex - 1;
        const newEstimatedTimeRemaining = Math.round(newAvgTimePerBatch * newRemainingBatches);
        
        this.sendProgress({
          totalLeads: leads.length,
          processedLeads: endIdx,
          percentage: actualPercentage,
          currentBatch: batchIndex + 1,
          totalBatches,
          estimatedTimeRemaining: newEstimatedTimeRemaining,
          status: 'processing',
          message: `Completed batch ${batchIndex + 1} of ${totalBatches} (${actualPercentage}% done, ${batch.length} leads verified)`
        });
        
        console.log(`[AI Verification] Progress: ${actualPercentage}% (${endIdx}/${leads.length} leads processed)`);
        
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
      
      // Provide more helpful error message based on error type
      let userFriendlyMessage = error.message || 'Verification failed';
      
      // Add context about what was successfully processed
      if (this.processedCount > 0) {
        userFriendlyMessage += ` (Successfully processed ${this.processedCount} of ${leads.length} leads before error)`;
      }
      
      // Send error progress with detailed message
      this.sendProgress({
        totalLeads: leads.length,
        processedLeads: this.processedCount,
        percentage: Math.round((this.processedCount / leads.length) * 100),
        currentBatch: Math.ceil(this.processedCount / BATCH_SIZE),
        totalBatches,
        estimatedTimeRemaining: 0,
        status: 'error',
        message: userFriendlyMessage
      });
      
      // Log additional debugging information
      console.error(`[AI Verification] Error details:`, {
        totalLeads: leads.length,
        processedLeads: this.processedCount,
        batchSize: BATCH_SIZE,
        totalBatches,
        elapsedTime: `${(Date.now() - this.startTime) / 1000}s`,
        errorMessage: error.message
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

IMPORTANT: You must return a JSON object with a single key "results" containing an array of verification objects.
The response must follow this exact structure:

{
  "results": [
    {
      "rowNumber": number,
      "status": "verified" | "warning" | "failed",
      "verificationScore": number (0-100),
      "confidenceScore": number (0-100),
      "issues": [], // Array of strings - Critical problems that should prevent import
      "warnings": [], // Array of strings - Minor issues that don't prevent import
      "suggestions": [], // Array of strings - Improvements that could be made
      "isDuplicate": false,
      "duplicateType": null,
      "aiInsights": {
        "businessLegitimacy": true,
        "dataQuality": "high",
        "riskLevel": "low",
        "recommendation": "string"
      },
      "correctedData": {
        "businessName": null,
        "phone": null,
        "email": null,
        "ownerName": null,
        "address": null
      }
    }
  ]
}

CRITICAL: The response MUST include ALL ${batch.length} leads from the input. Each lead must have a corresponding verification object in the results array.`
          },
          {
            role: "user",
            content: JSON.stringify(batchRequest)
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 16000 // Increased to handle large batches (30 leads × ~500 tokens = 15000 tokens)
      });

      const apiTime = Date.now() - apiStartTime;
      console.log(`[AI API] OpenAI API call completed in ${apiTime}ms`);
      console.log(`[AI API] Tokens used - Prompt: ${response.usage?.prompt_tokens}, Completion: ${response.usage?.completion_tokens}, Total: ${response.usage?.total_tokens}`);
      
      // Check if we hit the token limit
      const completionTokens = response.usage?.completion_tokens || 0;
      if (completionTokens >= 15900) { // Close to 16000 limit
        console.warn(`[AI API] WARNING: Approaching max_tokens limit (${completionTokens}/16000). Response may be truncated.`);
      }
      
      let result;
      try {
        const rawContent = response.choices[0].message.content || '{}';
        result = JSON.parse(rawContent);
        
        // Log the actual structure received
        console.log(`[AI API] Response structure type: ${typeof result}, isArray: ${Array.isArray(result)}`);
        if (typeof result === 'object' && !Array.isArray(result)) {
          console.log(`[AI API] Response keys: ${Object.keys(result).join(', ')}`);
          // If it has a single key that might contain the array
          const keys = Object.keys(result);
          if (keys.length === 1) {
            console.log(`[AI API] Single key found: "${keys[0]}", value isArray: ${Array.isArray(result[keys[0]])}`);
          }
        }
      } catch (parseError: any) {
        console.error(`[AI API] JSON parsing failed: ${parseError.message}`);
        console.error(`[AI API] Response was likely truncated due to token limit`);
        console.error(`[AI API] Completion tokens: ${completionTokens}, Max allowed: 16000`);
        throw new Error(`AI response parsing failed (likely token limit exceeded): ${parseError.message}`);
      }
      
      // Try multiple possible structures
      let results;
      if (Array.isArray(result)) {
        results = result;
      } else if (result.results && Array.isArray(result.results)) {
        results = result.results;
      } else if (result.leads && Array.isArray(result.leads)) {
        results = result.leads;
      } else if (result.verifications && Array.isArray(result.verifications)) {
        results = result.verifications;
      } else {
        // Check if there's a single key containing an array
        const keys = Object.keys(result);
        if (keys.length === 1 && Array.isArray(result[keys[0]])) {
          results = result[keys[0]];
          console.log(`[AI API] Found results in key "${keys[0]}"`);
        } else {
          results = [];
        }
      }
      
      console.log(`[AI API] Received verification results for ${results.length} leads`);
      
      // If we didn't get enough results, this is an error
      if (results.length < batch.length) {
        const errorMsg = `Expected ${batch.length} results but got ${results.length}. Response may be incomplete.`;
        console.error(`[AI API] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      return results;
      
    } catch (error: any) {
      console.error('[AI API] OpenAI API error:', error.message);
      console.error('[AI API] Error details:', {
        type: error.type,
        code: error.code,
        status: error.status
      });
      
      // Re-throw the error instead of silently using fallback data
      throw error;
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
      for (const [id, existingLead] of Array.from(this.existingLeads)) {
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
      for (const [id, existingLead] of Array.from(this.existingLeads)) {
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
      for (const [id, existingLead] of Array.from(this.existingLeads)) {
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