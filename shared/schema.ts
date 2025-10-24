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
  
  // MCA-specific fields
  dailyBankDeposits: boolean("daily_bank_deposits").default(false),
  previousMCAHistory: text("previous_mca_history").default("none"), // 'none', 'current', 'previous_paid', 'multiple'
  urgencyLevel: text("urgency_level").default("exploring"), // 'immediate', 'this_week', 'this_month', 'exploring'
  stateCode: text("state_code"), // For geographic pricing
  leadAge: integer("lead_age").default(0), // Days since lead generated
  exclusivityStatus: text("exclusivity_status").default("non_exclusive"), // 'exclusive', 'semi_exclusive', 'non_exclusive'
  
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

// Allocations table - tracks which leads have been sold to which users
export const allocations = pgTable("allocations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  purchaseId: varchar("purchase_id").references(() => purchases.id).notNull(),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  leadHash: text("lead_hash").notNull(), // MD5 hash of email + phone for deduplication
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Pricing strategies for dynamic pricing
export const pricingStrategies = pgTable("pricing_strategies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(), // Base price per lead
  exclusiveMultiplier: decimal("exclusive_multiplier", { precision: 3, scale: 1 }).notNull().default("2.5"),
  volumeDiscounts: jsonb("volume_discounts"), // Tiered volume discounts
  industryPremiums: jsonb("industry_premiums"), // Industry-specific pricing
  geographicPremiums: jsonb("geographic_premiums"), // State/city pricing
  ageDiscounts: jsonb("age_discounts"), // Discounts for aged leads
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Subscription plans for recurring revenue
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tier: text("tier").notNull().unique(), // 'starter', 'professional', 'enterprise', 'custom'
  monthlyPrice: integer("monthly_price").notNull(), // in cents
  monthlyLeads: integer("monthly_leads").notNull(),
  pricePerAdditionalLead: decimal("price_per_additional_lead", { precision: 10, scale: 2 }),
  features: text("features").array().notNull(),
  minQualityScore: integer("min_quality_score").notNull().default(60),
  maxQualityScore: integer("max_quality_score").notNull().default(100),
  active: boolean("active").notNull().default(true),
  recommended: boolean("recommended").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Credits system for flexible purchasing
export const credits = pgTable("credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0"),
  lifetimePurchased: decimal("lifetime_purchased", { precision: 10, scale: 2 }).notNull().default("0"),
  lifetimeUsed: decimal("lifetime_used", { precision: 10, scale: 2 }).notNull().default("0"),
  lastPurchaseAt: timestamp("last_purchase_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Credit transactions for audit trail
export const creditTransactions = pgTable("credit_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'purchase', 'usage', 'refund', 'bonus'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  referenceId: text("reference_id"), // purchaseId, leadId, etc.
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Contact form submissions
export const contactSubmissions = pgTable("contact_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"), // 'new', 'read', 'responded'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Verification sessions for lead uploads
export const verificationSessions = pgTable("verification_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  uploadedBy: varchar("uploaded_by").references(() => users.id).notNull(),
  filename: text("filename").notNull(),
  fileBuffer: text("file_buffer"), // Base64 encoded file content for re-processing
  totalLeads: integer("total_leads").notNull().default(0),
  verifiedCount: integer("verified_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'imported', 'expired'
  strictnessLevel: text("strictness_level").notNull().default("moderate"), // 'strict', 'moderate', 'lenient'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Detailed verification results for each lead in a session
export const verificationResults = pgTable("verification_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => verificationSessions.id).notNull(),
  
  // Lead data
  rowNumber: integer("row_number").notNull(),
  leadData: jsonb("lead_data").notNull(), // Original lead data from CSV/Excel
  
  // Verification status
  status: text("status").notNull(), // 'verified', 'warning', 'failed'
  verificationScore: integer("verification_score").notNull().default(0), // 0-100
  
  // Detailed validation results
  phoneValidation: jsonb("phone_validation"), // {valid: boolean, issues: string[], formatted: string}
  emailValidation: jsonb("email_validation"), // {valid: boolean, issues: string[], domain: string}
  businessNameValidation: jsonb("business_name_validation"), // {valid: boolean, issues: string[]}
  ownerNameValidation: jsonb("owner_name_validation"), // {valid: boolean, issues: string[]}
  addressValidation: jsonb("address_validation"), // {valid: boolean, issues: string[], fields: {}}
  
  // Duplicate detection
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  duplicateType: text("duplicate_type"), // 'phone', 'business', 'both'
  duplicateLeadId: varchar("duplicate_lead_id").references(() => leads.id),
  
  // Issue summary
  issues: text("issues").array().notNull().default(sql`ARRAY[]::text[]`),
  warnings: text("warnings").array().notNull().default(sql`ARRAY[]::text[]`),
  
  // Selection status for import
  selectedForImport: boolean("selected_for_import").notNull().default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const insertAllocationSchema = createInsertSchema(allocations).omit({
  id: true,
  createdAt: true,
});

export const insertContactSubmissionSchema = createInsertSchema(contactSubmissions).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email(),
  status: z.enum(["new", "read", "responded"]).default("new"),
});

export const insertVerificationSessionSchema = createInsertSchema(verificationSessions).omit({
  id: true,
  createdAt: true,
}).extend({
  status: z.enum(["pending", "completed", "imported", "expired"]).default("pending"),
  strictnessLevel: z.enum(["strict", "moderate", "lenient"]).default("moderate"),
});

export const insertVerificationResultSchema = createInsertSchema(verificationResults).omit({
  id: true,
  createdAt: true,
}).extend({
  status: z.enum(["verified", "warning", "failed"]),
  verificationScore: z.number().min(0).max(100),
});

export const insertPricingStrategySchema = createInsertSchema(pricingStrategies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  exclusiveMultiplier: z.string().regex(/^\d+(\.\d{1})?$/),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tier: z.string().min(1),
  monthlyPrice: z.number().int().min(0),
  monthlyLeads: z.number().int().min(0),
  minQualityScore: z.number().int().min(0).max(100),
  maxQualityScore: z.number().int().min(0).max(100),
  features: z.array(z.string()),
});

export const insertCreditSchema = createInsertSchema(credits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).omit({
  id: true,
  createdAt: true,
}).extend({
  type: z.enum(["purchase", "usage", "refund", "bonus"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  balanceBefore: z.string().regex(/^\d+(\.\d{1,2})?$/),
  balanceAfter: z.string().regex(/^\d+(\.\d{1,2})?$/),
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

export type InsertAllocation = z.infer<typeof insertAllocationSchema>;
export type Allocation = typeof allocations.$inferSelect;

export type InsertContactSubmission = z.infer<typeof insertContactSubmissionSchema>;
export type ContactSubmission = typeof contactSubmissions.$inferSelect;

export type InsertPricingStrategy = z.infer<typeof insertPricingStrategySchema>;
export type PricingStrategy = typeof pricingStrategies.$inferSelect;

export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export type InsertCredit = z.infer<typeof insertCreditSchema>;
export type Credit = typeof credits.$inferSelect;

export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;
export type CreditTransaction = typeof creditTransactions.$inferSelect;

export type InsertVerificationSession = z.infer<typeof insertVerificationSessionSchema>;
export type VerificationSession = typeof verificationSessions.$inferSelect;

export type InsertVerificationResult = z.infer<typeof insertVerificationResultSchema>;
export type VerificationResult = typeof verificationResults.$inferSelect;
