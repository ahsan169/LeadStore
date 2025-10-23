import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertLeadBatchSchema, insertPurchaseSchema, insertContactSubmissionSchema, type InsertLead } from "@shared/schema";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import OpenAI from "openai";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, isObjectStorageConfigured } from "./object-storage.js";
import multer from "multer";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import crypto from "crypto";
import { 
  sendOrderConfirmation, 
  sendDownloadReady, 
  sendAdminAlert, 
  sendContactFormNotification 
} from "./email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-09-30.clover",
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default",
  baseURL: process.env.OPENAI_API_BASE_URL,
});

const BUCKET_NAME = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
const SALT_ROUNDS = 10;

// Pricing configuration
const PRICING = {
  gold: { price: 500, leadsPerPurchase: 50 },
  platinum: { price: 1500, leadsPerPurchase: 200 },
  diamond: { price: 4000, leadsPerPurchase: 600 },
  elite: { price: 0, leadsPerPurchase: 0 }, // Contact sales
};

// Enhanced MCA Lead Scoring Algorithm
function calculateMCAQualityScore(lead: any): number {
  let score = 0;
  
  // Revenue scoring (35 points max)
  const revenue = parseInt(lead.annualRevenue) || 0;
  if (revenue >= 250000 && revenue <= 2000000) score += 35; // Sweet spot
  else if (revenue >= 100000 && revenue < 250000) score += 25;
  else if (revenue > 2000000 && revenue <= 10000000) score += 20;
  else if (revenue >= 50000 && revenue < 100000) score += 10;
  
  // Industry scoring (20 points max)
  const highValueIndustries = ['restaurant', 'retail', 'trucking', 'construction', 'healthcare', 'hospitality'];
  const mediumValueIndustries = ['wholesale', 'manufacturing', 'services'];
  const industryLower = lead.industry?.toLowerCase() || '';
  
  if (highValueIndustries.some(ind => industryLower.includes(ind))) score += 20;
  else if (mediumValueIndustries.some(ind => industryLower.includes(ind))) score += 12;
  else if (lead.industry) score += 5;
  
  // Business age scoring (15 points max)
  const timeInBusiness = parseInt(lead.timeInBusiness) || 0;
  if (timeInBusiness >= 24) score += 15; // 2+ years
  else if (timeInBusiness >= 12) score += 10;
  else if (timeInBusiness >= 6) score += 5;
  
  // Credit score (15 points max)
  const creditScore = parseInt(lead.creditScore) || 0;
  if (creditScore >= 550 && creditScore <= 700) score += 15; // MCA sweet spot
  else if (creditScore > 700 && creditScore <= 750) score += 10;
  else if (creditScore >= 500 && creditScore < 550) score += 8;
  
  // Previous MCA History bonus (10 points max)
  if (lead.previousMCAHistory === 'previous_paid') score += 10; // Renewals convert at 70%+
  else if (lead.previousMCAHistory === 'current') score += 7;
  else if (lead.previousMCAHistory === 'multiple') score += 8;
  
  // Funding urgency (5 points max)
  const requestedAmount = parseInt(lead.requestedAmount) || 0;
  if (requestedAmount >= 10000 && requestedAmount <= 500000) score += 5;
  else if (requestedAmount > 0) score += 3;
  
  // Daily bank deposits bonus (5 points max)
  if (lead.dailyBankDeposits) score += 5;
  
  // Urgency level bonus (5 points max)
  if (lead.urgencyLevel === 'immediate') score += 5;
  else if (lead.urgencyLevel === 'this_week') score += 4;
  else if (lead.urgencyLevel === 'this_month') score += 2;
  
  // Contact quality (5 points max)
  if (lead.email && lead.phone) score += 5;
  else if (lead.email || lead.phone) score += 3;
  
  // State code bonus for high-value states (5 points max)
  const highValueStates = ['CA', 'NY', 'TX', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI'];
  if (highValueStates.includes(lead.stateCode)) score += 5;
  else if (lead.stateCode) score += 2;
  
  return Math.min(100, score);
}

// Dynamic Pricing Calculator
function calculateLeadPrice(lead: any, exclusivity: string = 'non_exclusive', volume: number = 1): number {
  let basePrice = 25; // Base price per lead
  
  // Quality multiplier
  const qualityScore = lead.qualityScore || 0;
  if (qualityScore >= 90) basePrice *= 3;
  else if (qualityScore >= 80) basePrice *= 2.5;
  else if (qualityScore >= 70) basePrice *= 2;
  else if (qualityScore >= 60) basePrice *= 1.5;
  else if (qualityScore >= 50) basePrice *= 1.2;
  
  // Industry premium
  const premiumIndustries = ['restaurant', 'healthcare', 'trucking'];
  const industryLower = lead.industry?.toLowerCase() || '';
  if (premiumIndustries.some(ind => industryLower.includes(ind))) {
    basePrice *= 1.3;
  }
  
  // Previous MCA premium (renewals are gold)
  if (lead.previousMCAHistory === 'previous_paid') basePrice *= 1.5;
  else if (lead.previousMCAHistory === 'current') basePrice *= 1.3;
  else if (lead.previousMCAHistory === 'multiple') basePrice *= 1.4;
  
  // State premium
  const premiumStates = ['CA', 'NY', 'TX', 'FL'];
  if (premiumStates.includes(lead.stateCode)) {
    basePrice *= 1.2;
  }
  
  // Exclusivity multiplier
  if (exclusivity === 'exclusive') basePrice *= 2.5;
  else if (exclusivity === 'semi_exclusive') basePrice *= 1.5;
  
  // Volume discount
  if (volume >= 1000) basePrice *= 0.7;
  else if (volume >= 500) basePrice *= 0.8;
  else if (volume >= 200) basePrice *= 0.9;
  else if (volume >= 100) basePrice *= 0.95;
  
  // Lead age discount
  const ageInDays = lead.leadAge || 0;
  if (ageInDays > 90) basePrice *= 0.3;
  else if (ageInDays > 60) basePrice *= 0.5;
  else if (ageInDays > 30) basePrice *= 0.7;
  else if (ageInDays > 14) basePrice *= 0.85;
  else if (ageInDays > 7) basePrice *= 0.95;
  
  // Urgency premium
  if (lead.urgencyLevel === 'immediate') basePrice *= 1.2;
  else if (lead.urgencyLevel === 'this_week') basePrice *= 1.1;
  
  // Daily deposits premium
  if (lead.dailyBankDeposits) basePrice *= 1.15;
  
  return Math.round(basePrice);
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const isCSV = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    const isExcel = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                     file.mimetype === 'application/vnd.ms-excel' ||
                     file.originalname.endsWith('.xlsx') ||
                     file.originalname.endsWith('.xls');
    
    if (isCSV || isExcel) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      // Force role to "buyer" - never allow self-registration as admin
      const { role, ...restData } = req.body;
      const dataWithBuyerRole = { ...restData, role: "buyer" };
      
      const validatedData = insertUserSchema.parse(dataWithBuyerRole);
      
      // Check if user already exists
      const existing = await storage.getUserByUsername(validatedData.username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const emailExists = await storage.getUserByEmail(validatedData.email);
      if (emailExists) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password before storing
      const hashedPassword = await bcrypt.hash(validatedData.password, SALT_ROUNDS);
      const userWithHashedPassword = {
        ...validatedData,
        password: hashedPassword,
      };

      const user = await storage.createUser(userWithHashedPassword);
      
      // Don't send password back
      const { password, ...userWithoutPassword } = user;
      
      req.login(user, (err) => {
        if (err) return res.status(500).json({ error: "Login failed" });
        res.json(userWithoutPassword);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    // Passport handles this via the strategy
    next();
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.user) {
      // req.user already has password field excluded from the session
      // but TypeScript doesn't know that, so we cast it
      const user = req.user as any;
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Middleware to check authentication
  function requireAuth(req: any, res: any, next: any) {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  }

  // Middleware to check admin role
  function requireAdmin(req: any, res: any, next: any) {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  }

  // Lead batch routes (admin only)
  app.get("/api/batches", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batches = await storage.getAllLeadBatches();
      res.json(batches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batches" });
    }
  });

  app.get("/api/batches/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batch = await storage.getLeadBatch(req.params.id);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });

  app.post("/api/batches/:id/publish", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { tier } = req.body;
      if (!['gold', 'platinum', 'diamond', 'elite'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      const batch = await storage.updateLeadBatch(req.params.id, {
        status: "published",
      });

      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to publish batch" });
    }
  });

  // CSV/Excel Upload route
  app.post("/api/batches/upload", requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = req.file;
      let rows: any[] = [];
      let headers: string[] = [];
      
      // Check file type and parse accordingly
      const isExcel = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
      
      if (isExcel) {
        // Parse Excel file
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON with header row
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          blankrows: false
        }) as any[][];
        
        if (jsonData.length === 0) {
          return res.status(400).json({ error: "Excel file is empty" });
        }
        
        // Extract headers (first row)
        headers = jsonData[0].map(h => String(h || '').trim());
        
        // Convert to array of objects
        rows = jsonData.slice(1).map(row => {
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] || '';
          });
          return obj;
        });
      } else {
        // Parse CSV
        const csvContent = file.buffer.toString('utf-8');
        const parseResult = Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header: string) => header.trim(),
        });

        if (parseResult.errors.length > 0) {
          return res.status(400).json({ 
            error: "CSV parsing failed", 
            details: parseResult.errors.map(e => e.message) 
          });
        }

        rows = parseResult.data as any[];
        headers = parseResult.meta.fields || [];
      }

      // Validate required columns
      const requiredColumns = ['businessName', 'ownerName', 'email', 'phone'];
      const missingColumns = requiredColumns.filter(col => 
        !headers.some(h => h.toLowerCase() === col.toLowerCase())
      );

      if (missingColumns.length > 0) {
        return res.status(400).json({ 
          error: "Missing required columns", 
          missingColumns 
        });
      }

      // Process and validate leads
      const validationResults = {
        total: rows.length,
        valid: 0,
        errors: [] as any[],
        warnings: [] as any[],
      };

      const validLeads: any[] = [];
      const leadHashes = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 for header and 0-index

        // Normalize column names with flexible mapping
        const normalizedRow: any = {};
        for (const key in row) {
          const lowerKey = key.toLowerCase().replace(/[_\-]/g, ' ').trim();
          const value = row[key];
          
          // Business Name variations
          if (lowerKey === 'businessname' || lowerKey === 'business name' || lowerKey === 'company name' || 
              lowerKey === 'company' || lowerKey === 'dba' || lowerKey === 'business') {
            normalizedRow.businessName = value;
          }
          // Owner Name variations
          else if (lowerKey === 'ownername' || lowerKey === 'owner name' || lowerKey === 'contact name' || 
                   lowerKey === 'owner' || lowerKey === 'contact' || lowerKey === 'name' || lowerKey === 'full name') {
            normalizedRow.ownerName = normalizedRow.ownerName || value;
          }
          // Email variations
          else if (lowerKey === 'email' || lowerKey === 'email address' || lowerKey === 'e mail') {
            normalizedRow.email = value;
          }
          // Phone variations
          else if (lowerKey === 'phone' || lowerKey === 'phone number' || lowerKey === 'telephone' || 
                   lowerKey === 'mobile' || lowerKey === 'cell' || lowerKey === 'contact number') {
            normalizedRow.phone = value;
          }
          // Industry variations
          else if (lowerKey === 'industry' || lowerKey === 'business type' || lowerKey === 'sector' || lowerKey === 'category') {
            normalizedRow.industry = value;
          }
          // Revenue variations
          else if (lowerKey === 'annualrevenue' || lowerKey === 'annual revenue' || lowerKey === 'revenue' || 
                   lowerKey === 'annual sales' || lowerKey === 'yearly revenue' || lowerKey === 'gross revenue') {
            normalizedRow.annualRevenue = value;
          }
          // Requested Amount variations
          else if (lowerKey === 'requestedamount' || lowerKey === 'requested amount' || lowerKey === 'amount' || 
                   lowerKey === 'funding amount' || lowerKey === 'loan amount' || lowerKey === 'amount requested') {
            normalizedRow.requestedAmount = value;
          }
          // Time in Business variations
          else if (lowerKey === 'timeinbusiness' || lowerKey === 'time in business' || lowerKey === 'years in business' || 
                   lowerKey === 'business age' || lowerKey === 'established') {
            normalizedRow.timeInBusiness = value;
          }
          // Credit Score variations
          else if (lowerKey === 'creditscore' || lowerKey === 'credit score' || lowerKey === 'fico' || 
                   lowerKey === 'fico score' || lowerKey === 'credit rating') {
            normalizedRow.creditScore = value;
          }
          // Daily Bank Deposits variations
          else if (lowerKey === 'dailybankdeposits' || lowerKey === 'daily bank deposits' || lowerKey === 'daily deposits' || 
                   lowerKey === 'bank deposits') {
            normalizedRow.dailyBankDeposits = value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes' || value === '1';
          }
          // Previous MCA History variations
          else if (lowerKey === 'previousmcahistory' || lowerKey === 'previous mca history' || lowerKey === 'mca history' || 
                   lowerKey === 'prior mca' || lowerKey === 'existing mca') {
            normalizedRow.previousMCAHistory = value || 'none';
          }
          // Urgency Level variations
          else if (lowerKey === 'urgencylevel' || lowerKey === 'urgency level' || lowerKey === 'urgency' || 
                   lowerKey === 'timeline' || lowerKey === 'need level') {
            normalizedRow.urgencyLevel = value || 'exploring';
          }
          // State variations
          else if (lowerKey === 'statecode' || lowerKey === 'state code' || lowerKey === 'state' || 
                   lowerKey === 'location' || lowerKey === 'region') {
            normalizedRow.stateCode = value;
          }
          // Exclusivity Status variations
          else if (lowerKey === 'exclusivitystatus' || lowerKey === 'exclusivity status' || lowerKey === 'exclusivity' || 
                   lowerKey === 'exclusive') {
            normalizedRow.exclusivityStatus = value || 'non_exclusive';
          }
        }

        // Validate required fields
        if (!normalizedRow.businessName || !normalizedRow.ownerName || !normalizedRow.email || !normalizedRow.phone) {
          validationResults.errors.push({
            row: rowNum,
            error: "Missing required fields",
            data: normalizedRow,
          });
          continue;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedRow.email)) {
          validationResults.errors.push({
            row: rowNum,
            error: "Invalid email format",
            data: normalizedRow,
          });
          continue;
        }

        // Validate phone format (at least 10 digits)
        const phoneDigits = normalizedRow.phone.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
          validationResults.errors.push({
            row: rowNum,
            error: "Invalid phone format (minimum 10 digits required)",
            data: normalizedRow,
          });
          continue;
        }

        // Check for duplicates
        const leadHash = createLeadHash(normalizedRow.email, normalizedRow.phone);
        if (leadHashes.has(leadHash)) {
          validationResults.warnings.push({
            row: rowNum,
            warning: "Duplicate lead (same email and phone)",
            data: normalizedRow,
          });
          continue;
        }
        leadHashes.add(leadHash);

        // Calculate MCA quality score
        const qualityScore = calculateMCAQualityScore(normalizedRow);

        // Calculate lead age (default to 0 for new leads)
        const leadAge = 0;
        normalizedRow.leadAge = leadAge;

        // Assign tier based on quality score
        const tier = assignTier(qualityScore);

        validLeads.push({
          ...normalizedRow,
          qualityScore,
          tier,
        });

        validationResults.valid++;
      }

      if (validLeads.length === 0) {
        return res.status(400).json({ 
          error: "No valid leads found in CSV",
          validationResults,
        });
      }

      // Upload original CSV to object storage (if configured)
      let storageKey = `batches/${Date.now()}_${file.originalname}`;
      if (isObjectStorageConfigured() && s3Client) {
        await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: storageKey,
          Body: file.buffer,
          ContentType: 'text/csv',
        }));
      } else {
        // If object storage not configured, just use a placeholder key
        storageKey = `local_${storageKey}`;
      }

      // Create lead batch
      const avgQualityScore = validLeads.reduce((sum, l) => sum + l.qualityScore, 0) / validLeads.length;
      const batch = await storage.createLeadBatch({
        uploadedBy: req.user!.id,
        filename: file.originalname,
        storageKey,
        totalLeads: validLeads.length,
        averageQualityScore: avgQualityScore.toFixed(2),
        status: "ready",
      });

      // Insert leads into database
      const leadsToInsert: InsertLead[] = validLeads.map(lead => ({
        batchId: batch.id,
        businessName: lead.businessName?.trim(),
        ownerName: lead.ownerName?.trim(),
        email: lead.email?.trim().toLowerCase(),
        phone: lead.phone?.trim(),
        industry: lead.industry?.trim() || null,
        annualRevenue: lead.annualRevenue?.trim() || null,
        requestedAmount: lead.requestedAmount?.trim() || null,
        timeInBusiness: lead.timeInBusiness?.trim() || null,
        creditScore: lead.creditScore?.trim() || null,
        dailyBankDeposits: lead.dailyBankDeposits || false,
        previousMCAHistory: lead.previousMCAHistory || 'none',
        urgencyLevel: lead.urgencyLevel || 'exploring',
        stateCode: lead.stateCode?.trim() || null,
        leadAge: lead.leadAge || 0,
        exclusivityStatus: lead.exclusivityStatus || 'non_exclusive',
        qualityScore: lead.qualityScore,
        tier: lead.tier,
        sold: false,
      }));

      await storage.createLeads(leadsToInsert);

      // Calculate tier distribution
      const tierDistribution = {
        gold: validLeads.filter(l => l.tier === 'gold').length,
        platinum: validLeads.filter(l => l.tier === 'platinum').length,
        diamond: validLeads.filter(l => l.tier === 'diamond').length,
      };

      res.json({
        success: true,
        batchId: batch.id,
        summary: {
          totalLeads: validLeads.length,
          averageQualityScore: avgQualityScore,
          tierDistribution,
          validationResults,
        },
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to process CSV upload" });
    }
  });

  // Lead routes
  app.get("/api/leads/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const leads = await storage.getLeadsByBatchId(req.params.batchId);
      res.json(leads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.get("/api/leads/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getLeadStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // AI analysis for individual lead
  app.post("/api/leads/:leadId/analyze", requireAuth, requireAdmin, async (req, res) => {
    try {
      const lead = await storage.getLead(req.params.leadId);
      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Check for existing analysis
      const existingInsight = await storage.getAiInsightByLeadId(req.params.leadId);
      if (existingInsight) {
        return res.json(existingInsight);
      }

      // Generate AI analysis for the individual lead
      const prompt = `Analyze this MCA (Merchant Cash Advance) lead and provide actionable insights:

Business: ${lead.businessName}
Owner: ${lead.ownerName}
Industry: ${lead.industry || 'Unknown'}
Annual Revenue: ${lead.annualRevenue || 'Not provided'}
Requested Amount: ${lead.requestedAmount || 'Not specified'}
Time in Business: ${lead.timeInBusiness ? lead.timeInBusiness + ' months' : 'Not provided'}
Credit Score: ${lead.creditScore || 'Not provided'}
State: ${lead.stateCode || 'Not provided'}
Daily Bank Deposits: ${lead.dailyBankDeposits ? 'Yes' : 'No'}
Previous MCA History: ${lead.previousMCAHistory || 'None'}
Urgency Level: ${lead.urgencyLevel || 'Exploring'}
Quality Score: ${lead.qualityScore}/100

Provide a comprehensive analysis including:
1. Lead Quality Assessment: Evaluate the overall quality and likelihood of conversion
2. Risk Analysis: Identify potential risks or red flags
3. Recommended Offer Structure: Suggest optimal MCA terms based on the profile
4. Outreach Strategy: Provide specific talking points and approach recommendations
5. Competitive Positioning: How to position against competitors
6. Follow-up Timeline: Recommended cadence for follow-ups
7. Key Selling Points: What aspects of this lead make them attractive for MCA funding`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert MCA (Merchant Cash Advance) analyst. Provide detailed, actionable insights for sales teams."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      const analysisText = completion.choices[0].message.content;

      // Structure the analysis
      const sections = analysisText?.split(/\d+\.\s+/).filter(Boolean) || [];
      
      const insight = await storage.createAiInsight({
        batchId: lead.batchId,
        executiveSummary: sections[0] || analysisText,
        segments: {
          leadId: req.params.leadId,
          qualityAssessment: sections[1] || '',
          riskAnalysis: sections[2] || '',
          offerStructure: sections[3] || '',
          outreachStrategy: sections[4] || '',
          competitivePositioning: sections[5] || '',
          followUpTimeline: sections[6] || '',
          keySellingPoints: sections[7] || '',
        },
        riskFlags: [],
        outreachAngles: [],
        generatedBy: "openai",
      });

      res.json(insight);
    } catch (error) {
      console.error("Lead analysis error:", error);
      res.status(500).json({ error: "Failed to analyze lead" });
    }
  });

  // AI Insights routes
  app.post("/api/insights/generate/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { batchId } = req.params;

      // Check if insights already exist
      const existing = await storage.getAiInsightByBatchId(batchId);
      if (existing) {
        return res.json(existing);
      }

      // Fetch batch and leads
      const batch = await storage.getLeadBatch(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      const leads = await storage.getLeadsByBatchId(batchId);
      if (leads.length === 0) {
        return res.status(400).json({ error: "No leads in batch" });
      }

      // Calculate aggregated statistics (no PII)
      const aggregatedStats = {
        totalLeads: leads.length,
        averageQualityScore: leads.reduce((sum, l) => sum + l.qualityScore, 0) / leads.length,
        qualityDistribution: {
          high: leads.filter(l => l.qualityScore >= 80).length,
          medium: leads.filter(l => l.qualityScore >= 50 && l.qualityScore < 80).length,
          low: leads.filter(l => l.qualityScore < 50).length,
        },
        industryBreakdown: leads.reduce((acc: Record<string, number>, l) => {
          const industry = l.industry || "Unknown";
          acc[industry] = (acc[industry] || 0) + 1;
          return acc;
        }, {}),
        revenueDistribution: leads.reduce((acc: Record<string, number>, l) => {
          const revenue = l.annualRevenue || "Not specified";
          acc[revenue] = (acc[revenue] || 0) + 1;
          return acc;
        }, {}),
        creditScoreDistribution: leads.reduce((acc: Record<string, number>, l) => {
          const score = l.creditScore || "Not specified";
          acc[score] = (acc[score] || 0) + 1;
          return acc;
        }, {}),
      };

      // Create AI prompt
      const prompt = `Analyze this MCA (Merchant Cash Advance) lead batch with the following aggregated statistics:

Total Leads: ${aggregatedStats.totalLeads}
Average Quality Score: ${aggregatedStats.averageQualityScore.toFixed(1)}/100

Quality Distribution:
- High (80-100): ${aggregatedStats.qualityDistribution.high} leads
- Medium (50-79): ${aggregatedStats.qualityDistribution.medium} leads
- Low (0-49): ${aggregatedStats.qualityDistribution.low} leads

Industry Breakdown:
${Object.entries(aggregatedStats.industryBreakdown).map(([industry, count]) => `- ${industry}: ${count} leads`).join('\n')}

Revenue Distribution:
${Object.entries(aggregatedStats.revenueDistribution).map(([revenue, count]) => `- ${revenue}: ${count} leads`).join('\n')}

Credit Score Distribution:
${Object.entries(aggregatedStats.creditScoreDistribution).map(([score, count]) => `- ${score}: ${count} leads`).join('\n')}

Please provide:
1. Executive summary (2-3 sentences about the overall quality and potential of this batch)
2. Best performing segments (which industries, revenue ranges, or credit scores show the most promise)
3. Risk flags (any concerning patterns or data quality issues)
4. Outreach recommendations (suggested messaging angles and targeting strategies)

Format your response as JSON with the following structure:
{
  "summary": "string",
  "segments": ["segment1", "segment2", ...],
  "risks": ["risk1", "risk2", ...],
  "outreach": ["angle1", "angle2", ...]
}`;

      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert MCA lead analyst. Provide actionable insights based on aggregated lead data. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const responseContent = completion.choices[0].message.content || "{}";
      const aiResponse = JSON.parse(responseContent);

      // Store insights in database
      const insight = await storage.createAiInsight({
        batchId,
        executiveSummary: aiResponse.summary || "",
        segments: aiResponse.segments || [],
        riskFlags: aiResponse.risks || [],
        outreachAngles: aiResponse.outreach || [],
        generatedBy: "openai",
      });

      res.json(insight);
    } catch (error) {
      console.error("AI insights generation error:", error);
      res.status(500).json({ error: "Failed to generate AI insights" });
    }
  });

  app.get("/api/insights/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { batchId } = req.params;
      const insight = await storage.getAiInsightByBatchId(batchId);
      
      if (!insight) {
        return res.status(404).json({ error: "No insights found for this batch" });
      }

      res.json(insight);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  // Purchase routes
  app.post("/api/purchases", requireAuth, async (req, res) => {
    try {
      const { tier, leadCount } = req.body;

      // Get tier configuration from database
      const tierConfig = await storage.getProductTierByTier(tier);
      if (!tierConfig || !tierConfig.active) {
        return res.status(400).json({ error: "Invalid or inactive tier" });
      }

      const totalAmount = tierConfig.price;
      const requestedLeads = leadCount || tierConfig.leadCount;

      // Skip lead availability check for custom tiers (leadCount = 0)
      if (tierConfig.leadCount > 0) {
        // Check if enough leads available using enhanced algorithm
        // This checks for leads not already purchased by this user
        const availableLeads = await storage.getLeadsForPurchase(
          req.user!.id,
          requestedLeads,
          tierConfig.minQuality,
          tierConfig.maxQuality
        );
        
        if (availableLeads.length < requestedLeads) {
          return res.status(400).json({ 
            error: `Not enough leads available for your tier. Only ${availableLeads.length} unique leads available (excluding leads you've already purchased).` 
          });
        }
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount, // Already in cents from database
        currency: "usd",
        metadata: {
          userId: req.user!.id,
          tier,
          leadCount: requestedLeads,
        },
      });

      // Create purchase record
      const purchase = await storage.createPurchase({
        userId: req.user!.id,
        tier,
        leadCount: requestedLeads,
        totalAmount: (totalAmount / 100).toString(), // Store in dollars
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: "pending",
        leadIds: [], // Will be filled after payment
      });

      res.json({
        purchaseId: purchase.id,
        clientSecret: paymentIntent.client_secret,
      });
    } catch (error) {
      console.error("Purchase creation error:", error);
      res.status(500).json({ error: "Failed to create purchase" });
    }
  });

  app.get("/api/purchases", requireAuth, async (req, res) => {
    try {
      const purchases = req.user!.role === "admin" 
        ? await storage.getAllPurchases()
        : await storage.getPurchasesByUserId(req.user!.id);
      res.json(purchases);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch purchases" });
    }
  });

  app.get("/api/purchases/:id", requireAuth, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.id);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Check ownership
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(purchase);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch purchase" });
    }
  });

  app.post("/api/purchases/:id/download-url", requireAuth, async (req, res) => {
    try {
      const purchase = await storage.getPurchase(req.params.id);
      if (!purchase) {
        return res.status(404).json({ error: "Purchase not found" });
      }

      // Check ownership
      if (req.user!.role !== "admin" && purchase.userId !== req.user!.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (purchase.paymentStatus !== "succeeded") {
        return res.status(400).json({ error: "Payment not completed" });
      }

      // Generate presigned URL (24 hour expiry) if object storage is configured
      let downloadUrl = "";
      if (isObjectStorageConfigured() && s3Client) {
        const key = `purchases/${purchase.id}/leads.csv`;
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 hours
      } else {
        // If object storage not configured, return a placeholder URL
        downloadUrl = `/api/purchases/${purchase.id}/download-local`;
      }
      const expiry = new Date(Date.now() + 86400 * 1000);

      // Update purchase with download URL
      await storage.updatePurchase(purchase.id, {
        downloadUrl,
        downloadUrlExpiry: expiry,
      });

      // Log download
      await storage.createDownloadHistory({
        purchaseId: purchase.id,
        userId: req.user!.id,
        ipAddress: req.ip,
      });

      // Send download ready email
      const user = await storage.getUser(req.user!.id);
      if (user) {
        await sendDownloadReady(user.email, downloadUrl, {
          tier: purchase.tier,
          leadCount: purchase.leadCount,
          minQuality: 60, // Default values - you may want to get these from tier config
          maxQuality: 100,
        });
      }

      res.json({ downloadUrl, expiry });
    } catch (error) {
      console.error("Download URL generation error:", error);
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  });

  // Stripe webhook handler
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { userId, tier, leadCount } = paymentIntent.metadata;

        // Find purchase by payment intent
        const allPurchases = await storage.getAllPurchases();
        const purchase = allPurchases.find(p => p.stripePaymentIntentId === paymentIntent.id);

        if (purchase) {
          // Get tier configuration to determine quality thresholds
          const tierConfig = await storage.getProductTierByTier(tier);
          if (!tierConfig) {
            console.error(`Tier configuration not found for tier: ${tier}`);
            return res.status(400).json({ error: "Tier configuration not found" });
          }

          // Get leads for this purchase using enhanced algorithm
          const selectedLeads = await storage.getLeadsForPurchase(
            userId,
            parseInt(leadCount),
            tierConfig.minQuality,
            tierConfig.maxQuality
          );

          if (selectedLeads.length < parseInt(leadCount)) {
            console.error(`Not enough leads available. Requested: ${leadCount}, Available: ${selectedLeads.length}`);
            // Could handle partial fulfillment or refund here
          }

          const leadIds = selectedLeads.map(l => l.id);

          // Mark leads as sold
          await storage.markLeadsAsSold(leadIds, userId);

          // Create allocation records with MD5 hashes
          const allocationsToCreate = selectedLeads.map(lead => ({
            userId,
            purchaseId: purchase.id,
            leadId: lead.id,
            leadHash: createLeadHash(lead.email, lead.phone),
          }));
          await storage.createAllocations(allocationsToCreate);

          // Get user info for CSV watermark
          const user = await storage.getUser(userId);
          
          // Generate CSV with watermark and upload to object storage (if configured)
          const csvContent = generateLeadsCsv(selectedLeads, user);
          const key = `purchases/${purchase.id}/leads.csv`;

          if (isObjectStorageConfigured() && s3Client) {
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: key,
              Body: csvContent,
              ContentType: 'text/csv',
            }));
          }

          // Update purchase
          await storage.updatePurchase(purchase.id, {
            paymentStatus: "succeeded",
            stripeChargeId: paymentIntent.latest_charge as string,
            leadIds,
          });

          // Send order confirmation email
          if (user) {
            await sendOrderConfirmation(user.email, {
              id: purchase.id,
              tier: purchase.tier,
              leadCount: purchase.leadCount,
              totalAmount: Number(purchase.totalAmount),
            });
            
            // Send admin alert
            await sendAdminAlert(
              'New Purchase Completed',
              `User ${user.email} purchased ${purchase.leadCount} ${purchase.tier} leads for $${Number(purchase.totalAmount)/100}`
            );
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ error: "Webhook processing failed" });
    }
  });

  // AI Insights routes
  app.get("/api/insights/batch/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const insight = await storage.getAiInsightByBatchId(req.params.batchId);
      if (!insight) {
        return res.status(404).json({ error: "Insights not found" });
      }
      res.json(insight);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  app.post("/api/insights/generate/:batchId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const batch = await storage.getLeadBatch(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      const leads = await storage.getLeadsByBatchId(req.params.batchId);

      // Generate aggregated statistics (no PII)
      const stats = {
        totalLeads: leads.length,
        avgQualityScore: leads.reduce((sum, l) => sum + l.qualityScore, 0) / leads.length,
        industries: Array.from(new Set(leads.map(l => l.industry).filter((ind): ind is string => ind !== null && ind !== undefined))),
        qualityDistribution: {
          excellent: leads.filter(l => l.qualityScore >= 90).length,
          good: leads.filter(l => l.qualityScore >= 80 && l.qualityScore < 90).length,
          fair: leads.filter(l => l.qualityScore >= 60 && l.qualityScore < 80).length,
          poor: leads.filter(l => l.qualityScore < 60).length,
        },
      };

      // Call OpenAI with aggregated data only
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert MCA lead analyst. Analyze the aggregated statistics and provide strategic insights for marketing teams.",
          },
          {
            role: "user",
            content: `Analyze this MCA lead batch:
Total Leads: ${stats.totalLeads}
Avg Quality Score: ${stats.avgQualityScore.toFixed(1)}
Industries: ${stats.industries.join(", ")}
Quality Distribution: ${stats.qualityDistribution.excellent} excellent, ${stats.qualityDistribution.good} good, ${stats.qualityDistribution.fair} fair, ${stats.qualityDistribution.poor} poor

Provide:
1. Executive Summary (2-3 sentences)
2. Key Segments (3-4 segments)
3. Risk Flags (if any)
4. Outreach Angles (3-5 recommendations)

Format as JSON with keys: executiveSummary, segments (array), riskFlags (array), outreachAngles (array)`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const aiResponse = JSON.parse(completion.choices[0].message.content || "{}");

      const insight = await storage.createAiInsight({
        batchId: req.params.batchId,
        executiveSummary: aiResponse.executiveSummary,
        segments: aiResponse.segments,
        riskFlags: aiResponse.riskFlags,
        outreachAngles: aiResponse.outreachAngles,
      });

      res.json(insight);
    } catch (error) {
      console.error("AI insight generation error:", error);
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  // Product Tier routes
  // Public route - Get all active tiers for pricing page
  app.get("/api/tiers", async (req, res) => {
    try {
      const tiers = await storage.getActiveProductTiers();
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tiers" });
    }
  });

  // Admin routes - Manage tiers
  app.get("/api/admin/tiers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tiers = await storage.getAllProductTiers();
      res.json(tiers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tiers" });
    }
  });

  app.post("/api/admin/tiers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, tier, price, leadCount, minQuality, maxQuality, features, active, recommended } = req.body;
      
      // Validate required fields
      if (!name || !tier || price === undefined || leadCount === undefined || 
          minQuality === undefined || maxQuality === undefined || !features) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check if tier already exists
      const existing = await storage.getProductTierByTier(tier);
      if (existing) {
        return res.status(400).json({ error: "Tier with this identifier already exists" });
      }

      const newTier = await storage.createProductTier({
        name,
        tier,
        price,
        leadCount,
        minQuality,
        maxQuality,
        features: Array.isArray(features) ? features : features.split('\n').map((f: string) => f.trim()).filter(Boolean),
        active: active !== undefined ? active : true,
        recommended: recommended || false,
      });

      res.json(newTier);
    } catch (error) {
      console.error("Create tier error:", error);
      res.status(500).json({ error: "Failed to create tier" });
    }
  });

  app.patch("/api/admin/tiers/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, tier, price, leadCount, minQuality, maxQuality, features, active, recommended } = req.body;
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (tier !== undefined) updateData.tier = tier;
      if (price !== undefined) updateData.price = price;
      if (leadCount !== undefined) updateData.leadCount = leadCount;
      if (minQuality !== undefined) updateData.minQuality = minQuality;
      if (maxQuality !== undefined) updateData.maxQuality = maxQuality;
      if (features !== undefined) {
        updateData.features = Array.isArray(features) ? features : features.split('\n').map((f: string) => f.trim()).filter(Boolean);
      }
      if (active !== undefined) updateData.active = active;
      if (recommended !== undefined) updateData.recommended = recommended;

      const updatedTier = await storage.updateProductTier(req.params.id, updateData);
      
      if (!updatedTier) {
        return res.status(404).json({ error: "Tier not found" });
      }

      res.json(updatedTier);
    } catch (error) {
      console.error("Update tier error:", error);
      res.status(500).json({ error: "Failed to update tier" });
    }
  });

  app.delete("/api/admin/tiers/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteProductTier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tier" });
    }
  });

  // Customers route (admin only)
  app.get("/api/customers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const buyers = await storage.getAllBuyers();
      res.json(buyers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  // Contact form submission routes
  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, phone, company, message } = req.body;
      
      // Validate required fields
      if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required' });
      }
      
      // Save to database
      const submission = await storage.createContactSubmission({
        name, 
        email, 
        phone: phone || null,
        company: company || null, 
        message, 
        status: 'new'
      });
      
      // Send admin notification
      await sendContactFormNotification({
        name, email, phone, company, message
      });
      
      // Send auto-reply to submitter
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY || 'test_key');
        await resend.emails.send({
          from: 'Lakefront Leadworks <noreply@lakefrontleadworks.com>',
          to: email,
          subject: 'Thank you for contacting Lakefront Leadworks',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1976d2;">Thank You for Contacting Us!</h2>
              <p>Hi ${name},</p>
              <p>Thank you for your interest in Lakefront Leadworks. We've received your message and our team will get back to you within 24-48 business hours.</p>
              <p>In the meantime, feel free to explore our lead packages and see how we can help grow your business.</p>
              <p>Best regards,<br>The Lakefront Leadworks Team</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Failed to send auto-reply:', emailError);
        // Continue even if auto-reply fails
      }
      
      res.json({ success: true, message: 'Contact form submitted successfully' });
    } catch (error) {
      console.error('Contact form submission error:', error);
      res.status(500).json({ error: 'Failed to submit contact form' });
    }
  });

  // Get contact submissions (admin only)
  app.get('/api/admin/contact-submissions', requireAuth, requireAdmin, async (req, res) => {
    try {
      const submissions = await storage.getContactSubmissions();
      res.json(submissions);
    } catch (error) {
      console.error('Failed to fetch contact submissions:', error);
      res.status(500).json({ error: 'Failed to fetch contact submissions' });
    }
  });

  // Update contact submission status (admin only)
  app.patch('/api/admin/contact-submissions/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateContactSubmissionStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ error: 'Contact submission not found' });
      }
      res.json(updated);
    } catch (error) {
      console.error('Failed to update contact submission:', error);
      res.status(500).json({ error: 'Failed to update contact submission' });
    }
  });

  // Test email route (admin only)
  app.get('/api/test-email', requireAuth, requireAdmin, async (req, res) => {
    try {
      await sendAdminAlert('Test Email', 'This is a test email from Lakefront Leadworks');
      res.json({ success: true, message: 'Test email sent successfully' });
    } catch (error) {
      console.error('Test email failed:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to calculate quality score
function calculateQualityScore(lead: any): number {
  let score = 0;

  // Data completeness: +20 points for all required fields filled
  if (lead.businessName && lead.ownerName && lead.email && lead.phone) {
    score += 20;
  }

  // Optional fields: +5 points each (max +25)
  if (lead.industry) score += 5;
  if (lead.annualRevenue) score += 5;
  if (lead.requestedAmount) score += 5;
  if (lead.timeInBusiness) score += 5;
  if (lead.creditScore) score += 5;

  // Email format validity: +15 points
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (lead.email && emailRegex.test(lead.email)) {
    score += 15;
  }

  // Phone format validity (10+ digits): +15 points
  if (lead.phone) {
    const phoneDigits = lead.phone.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      score += 15;
    }
  }

  // Annual revenue presence: +10 points
  if (lead.annualRevenue) {
    score += 10;
  }

  // Credit score presence: +15 points
  if (lead.creditScore) {
    score += 15;
  }

  return Math.min(score, 100);
}

// Helper function to assign tier based on quality score
// 60-69 = gold, 70-79 = platinum, 80-100 = diamond
function assignTier(qualityScore: number): string {
  if (qualityScore >= 80) return 'diamond';
  if (qualityScore >= 70) return 'platinum';
  if (qualityScore >= 60) return 'gold';
  return 'gold'; // Default to gold for scores below 60
}

// Helper function to create lead hash for deduplication
function createLeadHash(email: string, phone: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = phone.replace(/\D/g, '');
  return crypto.createHash('md5').update(normalizedEmail + normalizedPhone).digest('hex');
}

// Helper function to generate CSV from leads
function generateLeadsCsv(leads: any[], user?: any): string {
  const headers = [
    "Business Name",
    "Owner Name",
    "Email",
    "Phone",
    "Industry",
    "Annual Revenue",
    "Requested Amount",
    "Time in Business",
    "Credit Score",
    "Quality Score",
  ];

  const rows = leads.map(lead => [
    lead.businessName,
    lead.ownerName,
    lead.email,
    lead.phone,
    lead.industry || "",
    lead.annualRevenue || "",
    lead.requestedAmount || "",
    lead.timeInBusiness || "",
    lead.creditScore || "",
    lead.qualityScore,
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ];

  // Add watermark footer if user is provided
  if (user) {
    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    csvLines.push("");
    csvLines.push(`"Generated for ${user.email} on ${date}"`);
  }

  return csvLines.join("\n");
}
