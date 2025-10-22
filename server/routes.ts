import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertUserSchema, insertLeadBatchSchema, insertPurchaseSchema } from "@shared/schema";
import bcrypt from "bcrypt";
import Stripe from "stripe";
import OpenAI from "openai";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "./object-storage";

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
      const { password, ...userWithoutPassword } = req.user;
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

  // Purchase routes
  app.post("/api/purchases", requireAuth, async (req, res) => {
    try {
      const { tier, leadCount } = req.body;

      if (!['gold', 'platinum', 'diamond'].includes(tier)) {
        return res.status(400).json({ error: "Invalid tier" });
      }

      const pricing = PRICING[tier as keyof typeof PRICING];
      const totalAmount = pricing.price;
      const requestedLeads = leadCount || pricing.leadsPerPurchase;

      // Check if enough leads available
      const availableLeads = await storage.getAvailableLeadsByTier(tier, requestedLeads);
      if (availableLeads.length < requestedLeads) {
        return res.status(400).json({ 
          error: `Not enough leads available. Only ${availableLeads.length} leads available.` 
        });
      }

      // Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalAmount * 100), // Convert to cents
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
        totalAmount: totalAmount.toString(),
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

      // Generate presigned URL (24 hour expiry)
      const key = `purchases/${purchase.id}/leads.csv`;
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 86400 }); // 24 hours
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
          // Get leads for this tier
          const selectedLeads = await storage.getAvailableLeadsByTier(tier, parseInt(leadCount));
          const leadIds = selectedLeads.map(l => l.id);

          // Mark leads as sold
          await storage.markLeadsAsSold(leadIds, userId);

          // Generate CSV and upload to object storage
          const csvContent = generateLeadsCsv(selectedLeads);
          const key = `purchases/${purchase.id}/leads.csv`;

          await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: csvContent,
            ContentType: 'text/csv',
          }));

          // Update purchase
          await storage.updatePurchase(purchase.id, {
            paymentStatus: "succeeded",
            stripeChargeId: paymentIntent.latest_charge as string,
            leadIds,
          });
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
        industries: [...new Set(leads.map(l => l.industry).filter(Boolean))],
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

  // Customers route (admin only)
  app.get("/api/customers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const buyers = await storage.getAllBuyers();
      res.json(buyers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to generate CSV from leads
function generateLeadsCsv(leads: any[]): string {
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

  return csvLines.join("\n");
}
