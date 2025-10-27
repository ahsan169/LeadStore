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
  
  // Freshness tracking fields
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  lastViewedAt: timestamp("last_viewed_at"),
  viewCount: integer("view_count").notNull().default(0),
  freshnessScore: integer("freshness_score").notNull().default(100), // 0-100
  
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
  
  // Enrichment fields
  isEnriched: boolean("is_enriched").notNull().default(false),
  linkedinUrl: text("linkedin_url"),
  websiteUrl: text("website_url"),
  companySize: text("company_size"), // e.g., "1-10", "11-50", "51-200", "201-500", "500+"
  yearFounded: integer("year_founded"),
  naicsCode: text("naics_code"), // NAICS industry classification code
  
  // ML scoring fields
  mlQualityScore: integer("ml_quality_score").default(0), // 0-100
  conversionProbability: decimal("conversion_probability", { precision: 5, scale: 4 }), // 0.0000-1.0000
  expectedDealSize: decimal("expected_deal_size", { precision: 12, scale: 2 }),
  scoringFactors: jsonb("scoring_factors"), // Detailed breakdown of scoring factors
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead aging tracking for freshness analytics
export const leadAging = pgTable("lead_aging", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadBatchId: varchar("lead_batch_id").references(() => leadBatches.id).notNull(),
  ageInDays: integer("age_in_days").notNull(),
  freshnessCategory: text("freshness_category").notNull(), // 'new', 'fresh', 'aging', 'stale'
  leadCount: integer("lead_count").notNull().default(0),
  averageFreshnessScore: decimal("average_freshness_score", { precision: 5, scale: 2 }),
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
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
  
  // Analytics fields
  totalContacted: integer("total_contacted").notNull().default(0),
  totalQualified: integer("total_qualified").notNull().default(0),
  totalClosed: integer("total_closed").notNull().default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  roi: decimal("roi", { precision: 10, scale: 2 }), // ROI percentage
  
  // Quality guarantee fields
  guaranteeExpiresAt: timestamp("guarantee_expires_at"), // 30 days from purchase
  totalReplacements: integer("total_replacements").notNull().default(0),
  replacementCredits: integer("replacement_credits").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead Performance tracking for ROI and conversion analytics
export const leadPerformance = pgTable("lead_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseId: varchar("purchase_id").references(() => purchases.id).notNull(),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  
  // Status tracking
  status: text("status").notNull().default("new"), // 'new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'
  
  // Timestamps for conversion funnel
  contactedAt: timestamp("contacted_at"),
  qualifiedAt: timestamp("qualified_at"),
  closedAt: timestamp("closed_at"),
  
  // Deal information
  dealAmount: decimal("deal_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  
  // Metadata
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

// CRM Integrations for lead export
export const crmIntegrations = pgTable("crm_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  crmType: text("crm_type").notNull(), // 'salesforce', 'hubspot', 'pipedrive', 'custom_api'
  apiKey: text("api_key").notNull(), // encrypted
  apiUrl: text("api_url"),
  mappingConfig: jsonb("mapping_config"), // JSON for field mappings
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// CRM Sync Log for tracking exports
export const crmSyncLog = pgTable("crm_sync_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").references(() => crmIntegrations.id).notNull(),
  purchaseId: varchar("purchase_id").references(() => purchases.id),
  leadIds: text("lead_ids").array(), // array of lead IDs
  status: text("status").notNull().default("pending"), // 'pending', 'success', 'failed'
  errorMessage: text("error_message"),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

// Lead alerts - smart matching system
export const leadAlerts = pgTable("lead_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  alertName: text("alert_name").notNull(),
  criteria: jsonb("criteria").notNull(), // {industries: [], states: [], minRevenue, maxRevenue, minQuality, maxQuality, etc.}
  isActive: boolean("is_active").notNull().default(true),
  emailNotifications: boolean("email_notifications").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastTriggeredAt: timestamp("last_triggered_at"),
});

// Alert history - tracks when alerts triggered
export const alertHistory = pgTable("alert_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id").references(() => leadAlerts.id).notNull(),
  leadBatchId: varchar("lead_batch_id").references(() => leadBatches.id).notNull(),
  matchedLeads: integer("matched_leads").notNull().default(0),
  leadIds: text("lead_ids").array(), // array of matched lead IDs
  notificationSent: boolean("notification_sent").notNull().default(false),
  viewedAt: timestamp("viewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead Enrichment - stores enriched business data
export const leadEnrichment = pgTable("lead_enrichment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull().unique(),
  
  // Enriched data
  enrichedData: jsonb("enriched_data").notNull(), // Full enrichment data including social profiles, company details, etc.
  
  // Enrichment metadata
  enrichmentSource: text("enrichment_source").notNull().default("mock"), // 'clearbit', 'hunter', 'manual', 'mock'
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(), // 0.00-100.00
  
  // Specific enriched fields for quick access
  socialProfiles: jsonb("social_profiles"), // { linkedin, twitter, facebook, etc. }
  companyDetails: jsonb("company_details"), // { description, employees, funding, technologies, etc. }
  industryDetails: jsonb("industry_details"), // { classification, verticals, keywords, etc. }
  contactInfo: jsonb("contact_info"), // { additional emails, phones, executives, etc. }
  
  enrichedAt: timestamp("enriched_at").notNull().defaultNow(),
});

// Saved searches for advanced lead filtering
export const savedSearches = pgTable("saved_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  searchName: text("search_name").notNull(),
  filters: jsonb("filters").notNull(), // All filter criteria as JSON
  isDefault: boolean("is_default").notNull().default(false),
  sortBy: text("sort_by"),
  sortOrder: text("sort_order"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

// Quality Guarantee table for lead replacement system
export const qualityGuarantee = pgTable("quality_guarantee", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseId: varchar("purchase_id").references(() => purchases.id).notNull(),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Issue details
  issueType: text("issue_type").notNull(), // 'disconnected', 'wrong_number', 'duplicate', 'poor_quality'
  issueDescription: text("issue_description").notNull(),
  evidenceData: jsonb("evidence_data"), // Optional evidence files/screenshots
  
  // Status tracking
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'rejected', 'replaced'
  
  // Resolution details
  replacementLeadId: varchar("replacement_lead_id").references(() => leads.id),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolutionNotes: text("resolution_notes"),
  
  // Timestamps
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Bulk discount tiers for volume pricing
export const bulkDiscounts = pgTable("bulk_discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tierName: text("tier_name").notNull(),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity"), // null for unlimited (5000+)
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bulk orders for large-scale purchases
export const bulkOrders = pgTable("bulk_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  totalLeads: integer("total_leads").notNull(),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }).notNull(),
  discountApplied: decimal("discount_applied", { precision: 5, scale: 2 }).notNull(),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'approved', 'processing', 'completed', 'cancelled'
  
  // Additional fields for bulk order management
  criteria: jsonb("criteria"), // Lead selection criteria
  leadIds: text("lead_ids").array(), // Selected lead IDs
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paymentStatus: text("payment_status").notNull().default("pending"), // 'pending', 'succeeded', 'failed'
  notes: text("notes"), // Internal notes or custom quote details
  
  // Timestamps
  approvedAt: timestamp("approved_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Campaign Templates table for email/SMS templates
export const campaignTemplates = pgTable("campaign_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // null for system templates
  templateName: text("template_name").notNull(),
  templateType: text("template_type").notNull(), // 'email', 'sms'
  subject: text("subject"), // For email templates
  content: text("content").notNull(),
  variables: jsonb("variables"), // JSON array of placeholders like ['businessName', 'ownerName', 'amount']
  category: text("category").notNull(), // 'intro', 'follow_up', 'offer', 'reminder'
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Campaigns table for tracking email/SMS campaigns
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  purchaseId: varchar("purchase_id").references(() => purchases.id).notNull(),
  campaignName: text("campaign_name").notNull(),
  templateId: varchar("template_id").references(() => campaignTemplates.id).notNull(),
  recipientCount: integer("recipient_count").notNull().default(0),
  status: text("status").notNull().default("draft"), // 'draft', 'scheduled', 'sent', 'cancelled'
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  // Analytics fields
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  responseCount: integer("response_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead Scoring Models table for ML model tracking
export const leadScoringModels = pgTable("lead_scoring_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelName: text("model_name").notNull(),
  modelVersion: text("model_version").notNull(),
  features: jsonb("features").notNull(), // JSON array of features used in the model
  accuracy: decimal("accuracy", { precision: 5, scale: 2 }), // Model accuracy percentage
  trainedAt: timestamp("trained_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(false), // Only one model should be active at a time
  
  // Model performance metrics
  precision: decimal("precision", { precision: 5, scale: 2 }),
  recall: decimal("recall", { precision: 5, scale: 2 }),
  f1Score: decimal("f1_score", { precision: 5, scale: 2 }),
  
  // Model metadata
  trainingDataSize: integer("training_data_size"),
  modelParameters: jsonb("model_parameters"), // Hyperparameters and configuration
  performanceMetrics: jsonb("performance_metrics"), // Detailed performance by tier/industry
  
  createdBy: varchar("created_by").references(() => users.id),
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
  uploadedAt: true,
  freshnessScore: true,
  viewCount: true,
}).extend({
  qualityScore: z.number().min(0).max(100),
  tier: z.enum(["gold", "platinum", "diamond", "elite"]).optional(),
});

export const insertLeadAgingSchema = createInsertSchema(leadAging).omit({
  id: true,
  calculatedAt: true,
}).extend({
  freshnessCategory: z.enum(["new", "fresh", "aging", "stale"]),
  ageInDays: z.number().min(0),
  leadCount: z.number().min(0),
  averageFreshnessScore: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

export const insertPurchaseSchema = createInsertSchema(purchases).omit({
  id: true,
  createdAt: true,
}).extend({
  tier: z.enum(["gold", "platinum", "diamond", "elite"]),
  paymentStatus: z.enum(["pending", "succeeded", "failed"]).default("pending"),
});

export const insertLeadPerformanceSchema = createInsertSchema(leadPerformance).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["new", "contacted", "qualified", "proposal", "closed_won", "closed_lost"]).default("new"),
  dealAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
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

export const insertCrmIntegrationSchema = createInsertSchema(crmIntegrations).omit({
  id: true,
  createdAt: true,
}).extend({
  crmType: z.enum(["salesforce", "hubspot", "pipedrive", "custom_api"]),
});

export const insertCrmSyncLogSchema = createInsertSchema(crmSyncLog).omit({
  id: true,
  syncedAt: true,
}).extend({
  status: z.enum(["pending", "success", "failed"]).default("pending"),
  leadIds: z.array(z.string()).optional(),
});

export const insertLeadAlertSchema = createInsertSchema(leadAlerts).omit({
  id: true,
  createdAt: true,
  lastTriggeredAt: true,
}).extend({
  alertName: z.string().min(1).max(100),
  criteria: z.object({
    industries: z.array(z.string()).optional(),
    states: z.array(z.string()).optional(),
    minRevenue: z.number().optional(),
    maxRevenue: z.number().optional(),
    minQuality: z.number().min(0).max(100).optional(),
    maxQuality: z.number().min(0).max(100).optional(),
    minTimeInBusiness: z.number().optional(),
    minCreditScore: z.number().optional(),
    maxCreditScore: z.number().optional(),
    exclusivityStatus: z.array(z.string()).optional(),
    previousMCAHistory: z.array(z.string()).optional(),
    urgencyLevel: z.array(z.string()).optional(),
  }),
  isActive: z.boolean().default(true),
  emailNotifications: z.boolean().default(true),
});

export const insertAlertHistorySchema = createInsertSchema(alertHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  matchedLeads: z.number().int().min(0),
  notificationSent: z.boolean().default(false),
});

export const insertQualityGuaranteeSchema = createInsertSchema(qualityGuarantee).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reportedAt: true,
}).extend({
  issueType: z.enum(["disconnected", "wrong_number", "duplicate", "poor_quality"]),
  status: z.enum(["pending", "approved", "rejected", "replaced"]).default("pending"),
  issueDescription: z.string().min(10).max(1000),
});

export const insertLeadEnrichmentSchema = createInsertSchema(leadEnrichment).omit({
  id: true,
  enrichedAt: true,
}).extend({
  enrichmentSource: z.enum(["clearbit", "hunter", "manual", "mock"]).default("mock"),
  confidenceScore: z.string().regex(/^\d+(\.\d{1,2})?$/).transform((val) => val),
  enrichedData: z.object({}).passthrough(),
  socialProfiles: z.object({}).passthrough().optional(),
  companyDetails: z.object({}).passthrough().optional(),
  industryDetails: z.object({}).passthrough().optional(),
  contactInfo: z.object({}).passthrough().optional(),
});

export const insertSavedSearchSchema = createInsertSchema(savedSearches).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
}).extend({
  searchName: z.string().min(1).max(100),
  filters: z.object({
    // Basic filters
    industry: z.array(z.string()).optional(),
    stateCode: z.array(z.string()).optional(),
    city: z.array(z.string()).optional(),
    minQualityScore: z.number().min(0).max(100).optional(),
    maxQualityScore: z.number().min(0).max(100).optional(),
    
    // Financial filters
    minRevenue: z.number().optional(),
    maxRevenue: z.number().optional(),
    fundingStatus: z.array(z.string()).optional(),
    minCreditScore: z.number().optional(),
    maxCreditScore: z.number().optional(),
    
    // Business filters
    minTimeInBusiness: z.number().optional(),
    maxTimeInBusiness: z.number().optional(),
    employeeCount: z.array(z.string()).optional(),
    businessType: z.array(z.string()).optional(),
    yearFounded: z.object({ min: z.number(), max: z.number() }).optional(),
    
    // Contact filters
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    ownerName: z.string().optional(),
    
    // Status filters
    exclusivityStatus: z.array(z.string()).optional(),
    previousMCAHistory: z.array(z.string()).optional(),
    urgencyLevel: z.array(z.string()).optional(),
    leadAge: z.object({ min: z.number(), max: z.number() }).optional(),
    isEnriched: z.boolean().optional(),
    sold: z.boolean().optional(),
    
    // Advanced filters
    naicsCode: z.array(z.string()).optional(),
    sicCode: z.array(z.string()).optional(),
    dailyBankDeposits: z.boolean().optional(),
    websiteUrl: z.boolean().optional(),
    
    // Logic operators
    logicOperator: z.enum(["AND", "OR"]).default("AND"),
  }),
  isDefault: z.boolean().default(false),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const insertBulkDiscountSchema = createInsertSchema(bulkDiscounts).omit({
  id: true,
  createdAt: true,
}).extend({
  tierName: z.string().min(1),
  minQuantity: z.number().min(1),
  maxQuantity: z.number().min(1).nullable(),
  discountPercentage: z.string().regex(/^\d+(\.\d{1,2})?$/), // Decimal string
  isActive: z.boolean().default(true),
});

export const insertBulkOrderSchema = createInsertSchema(bulkOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  totalLeads: z.number().min(1),
  originalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/), // Decimal string
  discountApplied: z.string().regex(/^\d+(\.\d{1,2})?$/), // Decimal string
  finalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/), // Decimal string
  status: z.enum(["pending", "approved", "processing", "completed", "cancelled"]).default("pending"),
  paymentStatus: z.enum(["pending", "succeeded", "failed"]).default("pending"),
  criteria: z.object({}).optional(),
  leadIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const insertCampaignTemplateSchema = createInsertSchema(campaignTemplates).omit({
  id: true,
  createdAt: true,
}).extend({
  templateName: z.string().min(1),
  templateType: z.enum(["email", "sms"]),
  subject: z.string().optional(),
  content: z.string().min(1),
  variables: z.array(z.string()).optional(),
  category: z.enum(["intro", "follow_up", "offer", "reminder"]),
  isPublic: z.boolean().default(false),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  createdAt: true,
  openCount: true,
  clickCount: true,
  responseCount: true,
}).extend({
  campaignName: z.string().min(1),
  status: z.enum(["draft", "scheduled", "sent", "cancelled"]).default("draft"),
  recipientCount: z.number().min(0).default(0),
});

// API Keys table for enterprise API access
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  keyName: text("key_name").notNull(),
  keyHash: text("key_hash").notNull(), // Hashed API key for security
  permissions: jsonb("permissions").notNull().default({}), // JSON array of allowed endpoints
  rateLimit: integer("rate_limit").notNull().default(100), // Requests per minute
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Webhooks table for event notifications
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  url: text("url").notNull(),
  events: text("events").array().notNull(), // Array of event types to subscribe to
  secret: text("secret").notNull(), // Secret for webhook signature verification
  isActive: boolean("is_active").notNull().default(true),
  failureCount: integer("failure_count").notNull().default(0),
  lastDeliveryAt: timestamp("last_delivery_at"),
  lastDeliveryStatus: text("last_delivery_status"), // 'success', 'failed', 'pending'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// API Usage tracking for analytics
export const apiUsage = pgTable("api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").references(() => apiKeys.id).notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  responseTime: integer("response_time"), // in milliseconds
  requestBody: jsonb("request_body"), // Optionally store request payload
  responseSize: integer("response_size"), // in bytes
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Zod schemas for API entities
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  keyHash: true,
  lastUsedAt: true,
}).extend({
  keyName: z.string().min(1).max(100),
  permissions: z.object({
    endpoints: z.array(z.string()).default([]),
    scopes: z.array(z.enum(["read:leads", "write:leads", "read:purchases", "write:purchases", "read:analytics", "manage:webhooks"])).default([]),
  }),
  rateLimit: z.number().int().min(10).max(10000).default(100),
  expiresAt: z.string().datetime().optional(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  secret: true,
  failureCount: true,
  lastDeliveryAt: true,
  lastDeliveryStatus: true,
}).extend({
  url: z.string().url(),
  events: z.array(z.enum([
    "lead.created",
    "lead.updated",
    "lead.sold",
    "purchase.completed",
    "purchase.failed", 
    "credit.added",
    "credit.used",
    "batch.uploaded",
    "batch.processed",
    "alert.triggered",
    "quality.reported",
    "quality.resolved"
  ])).min(1),
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).omit({
  id: true,
  timestamp: true,
}).extend({
  endpoint: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  statusCode: z.number().int().min(100).max(599),
  responseTime: z.number().int().min(0).optional(),
  responseSize: z.number().int().min(0).optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
});

export const insertLeadScoringModelSchema = createInsertSchema(leadScoringModels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  trainedAt: true,
}).extend({
  modelName: z.string().min(1).max(100),
  modelVersion: z.string().min(1).max(50),
  features: z.array(z.string()).min(1),
  accuracy: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  precision: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  recall: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  f1Score: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  isActive: z.boolean().default(false),
  trainingDataSize: z.number().int().min(0).optional(),
  modelParameters: z.record(z.any()).optional(),
  performanceMetrics: z.record(z.any()).optional(),
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

export type InsertLeadAging = z.infer<typeof insertLeadAgingSchema>;
export type LeadAging = typeof leadAging.$inferSelect;

export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

export type InsertLeadPerformance = z.infer<typeof insertLeadPerformanceSchema>;
export type LeadPerformance = typeof leadPerformance.$inferSelect;

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

export type InsertCrmIntegration = z.infer<typeof insertCrmIntegrationSchema>;
export type CrmIntegration = typeof crmIntegrations.$inferSelect;

export type InsertCrmSyncLog = z.infer<typeof insertCrmSyncLogSchema>;
export type CrmSyncLog = typeof crmSyncLog.$inferSelect;

export type InsertLeadAlert = z.infer<typeof insertLeadAlertSchema>;
export type LeadAlert = typeof leadAlerts.$inferSelect;

export type InsertAlertHistory = z.infer<typeof insertAlertHistorySchema>;
export type AlertHistory = typeof alertHistory.$inferSelect;

export type InsertLeadEnrichment = z.infer<typeof insertLeadEnrichmentSchema>;
export type LeadEnrichment = typeof leadEnrichment.$inferSelect;

export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearches.$inferSelect;

export type InsertQualityGuarantee = z.infer<typeof insertQualityGuaranteeSchema>;
export type QualityGuarantee = typeof qualityGuarantee.$inferSelect;

export type InsertBulkDiscount = z.infer<typeof insertBulkDiscountSchema>;
export type BulkDiscount = typeof bulkDiscounts.$inferSelect;

export type InsertBulkOrder = z.infer<typeof insertBulkOrderSchema>;
export type BulkOrder = typeof bulkOrders.$inferSelect;

export type InsertCampaignTemplate = z.infer<typeof insertCampaignTemplateSchema>;
export type CampaignTemplate = typeof campaignTemplates.$inferSelect;

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

export type InsertApiUsage = z.infer<typeof insertApiUsageSchema>;
export type ApiUsage = typeof apiUsage.$inferSelect;

export type InsertLeadScoringModel = z.infer<typeof insertLeadScoringModelSchema>;
export type LeadScoringModel = typeof leadScoringModels.$inferSelect;
