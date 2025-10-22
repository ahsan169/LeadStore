import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table with role-based access
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("buyer"), // 'admin' or 'buyer'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Subscription tiers (Gold, Platinum, Diamond, Elite)
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tier: text("tier").notNull(), // 'gold', 'platinum', 'diamond', 'elite'
  status: text("status").notNull().default("active"), // 'active', 'cancelled', 'expired'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Lead batches uploaded by admin
export const leadBatches = pgTable("lead_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  uploadedBy: varchar("uploaded_by").references(() => users.id).notNull(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(), // Object storage path
  totalLeads: integer("total_leads").notNull().default(0),
  averageQualityScore: decimal("average_quality_score", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("processing"), // 'processing', 'ready', 'published'
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// Individual leads from CSV files
export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").references(() => leadBatches.id).notNull(),
  
  // Lead data fields
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  industry: text("industry"),
  annualRevenue: text("annual_revenue"),
  requestedAmount: text("requested_amount"),
  timeInBusiness: text("time_in_business"),
  creditScore: text("credit_score"),
  
  // Quality and assignment
  qualityScore: integer("quality_score").notNull().default(0), // 0-100
  tier: text("tier"), // 'gold', 'platinum', 'diamond', 'elite' - which tier can access this lead
  sold: boolean("sold").notNull().default(false),
  soldTo: varchar("sold_to").references(() => users.id),
  soldAt: timestamp("sold_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Purchase transactions
export const purchases = pgTable("purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  tier: text("tier").notNull(), // purchased tier
  leadCount: integer("lead_count").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Stripe payment details
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  paymentStatus: text("payment_status").notNull().default("pending"), // 'pending', 'succeeded', 'failed'
  
  // Lead delivery
  leadIds: text("lead_ids").array(), // Array of lead IDs included in this purchase
  downloadUrl: text("download_url"), // Presigned URL for CSV download
  downloadUrlExpiry: timestamp("download_url_expiry"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Download history for audit trail
export const downloadHistory = pgTable("download_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseId: varchar("purchase_id").references(() => purchases.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  downloadedAt: timestamp("downloaded_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
});

// AI-generated insights for lead batches
export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchId: varchar("batch_id").references(() => leadBatches.id).notNull(),
  
  // AI analysis results
  executiveSummary: text("executive_summary"),
  segments: jsonb("segments"), // Array of segment analysis
  riskFlags: jsonb("risk_flags"), // Array of identified risks
  outreachAngles: jsonb("outreach_angles"), // Array of recommended angles
  
  // Metadata
  generatedBy: text("generated_by").notNull().default("openai"), // AI model used
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

// Product tiers for dynamic pricing management
export const productTiers = pgTable("product_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Gold", "Platinum", etc.
  tier: text("tier").notNull().unique(), // "gold", "platinum" for internal reference
  price: integer("price").notNull(), // price in cents
  leadCount: integer("lead_count").notNull(), // number of leads per purchase
  minQuality: integer("min_quality").notNull(), // minimum quality score threshold
  maxQuality: integer("max_quality").notNull(), // maximum quality score threshold
  features: text("features").array().notNull(), // list of features
  active: boolean("active").notNull().default(true), // whether tier is active/published
  recommended: boolean("recommended").notNull().default(false), // whether to show "Most Popular" badge
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas with validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email(),
  role: z.enum(["admin", "buyer"]).default("buyer"),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tier: z.enum(["gold", "platinum", "diamond", "elite"]),
  status: z.enum(["active", "cancelled", "expired"]).default("active"),
});

export const insertLeadBatchSchema = createInsertSchema(leadBatches).omit({
  id: true,
  uploadedAt: true,
}).extend({
  status: z.enum(["processing", "ready", "published"]).default("processing"),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
}).extend({
  qualityScore: z.number().min(0).max(100),
  tier: z.enum(["gold", "platinum", "diamond", "elite"]).optional(),
});

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  createdAt: true,
}).extend({
  tier: z.enum(["gold", "platinum", "diamond", "elite"]),
  paymentStatus: z.enum(["pending", "succeeded", "failed"]).default("pending"),
});

export const insertDownloadHistorySchema = createInsertSchema(downloadHistory).omit({
  id: true,
  downloadedAt: true,
});

export const insertAiInsightSchema = createInsertSchema(aiInsights).omit({
  id: true,
  generatedAt: true,
});

export const insertProductTierSchema = createInsertSchema(productTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tier: z.string().min(1),
  price: z.number().int().min(0),
  leadCount: z.number().int().min(0),
  minQuality: z.number().int().min(0).max(100),
  maxQuality: z.number().int().min(0).max(100),
  features: z.array(z.string()),
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export type InsertLeadBatch = z.infer<typeof insertLeadBatchSchema>;
export type LeadBatch = typeof leadBatches.$inferSelect;

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

export type InsertDownloadHistory = z.infer<typeof insertDownloadHistorySchema>;
export type DownloadHistory = typeof downloadHistory.$inferSelect;

export type InsertAiInsight = z.infer<typeof insertAiInsightSchema>;
export type AiInsight = typeof aiInsights.$inferSelect;

export type InsertProductTier = z.infer<typeof insertProductTierSchema>;
export type ProductTier = typeof productTiers.$inferSelect;
