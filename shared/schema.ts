import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ========================================
// FUNDING PRODUCTS SYSTEM
// ========================================

// Funding products table - configurable funding types (MCA, SBA, Equipment, Factoring, etc.)
export const fundingProducts = pgTable("funding_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Display name (e.g., "Merchant Cash Advance", "SBA Loan")
  slug: text("slug").notNull().unique(), // URL-friendly (e.g., "mca", "sba-loan", "equipment-financing")
  description: text("description"), // Brief description of the funding type
  icon: text("icon"), // Icon name for UI display
  color: text("color").default("#2d6a4f"), // Brand color for the funding type
  
  // Configuration
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false), // Default funding product
  displayOrder: integer("display_order").notNull().default(0), // Sort order
  
  // Scoring configuration - weights for AI Brain scoring per funding type
  scoringWeights: jsonb("scoring_weights").default(sql`'{
    "recencyWeight": 0.3,
    "sourceWeight": 0.2,
    "financialWeight": 0.25,
    "riskWeight": 0.25
  }'::jsonb`),
  
  // Eligibility criteria - what makes a lead good for this funding type
  eligibilityCriteria: jsonb("eligibility_criteria").default(sql`'{
    "minTimeInBusiness": 6,
    "minAnnualRevenue": 100000,
    "minCreditScore": 500,
    "requiredDocuments": []
  }'::jsonb`),
  
  // Custom fields for this funding type
  customFields: jsonb("custom_fields").default(sql`'[]'::jsonb`), // Array of custom field definitions
  
  // Pricing tiers for this funding type
  pricingTiers: jsonb("pricing_tiers").default(sql`'[]'::jsonb`), // Array of tier configs
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ========================================
// MULTI-TENANT COMPANY SYSTEM
// ========================================

// Companies table for multi-tenant architecture
export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly identifier
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan").notNull().default("starter"), // 'starter', 'professional', 'enterprise'
  leadCreditBalance: integer("lead_credit_balance").notNull().default(0),
  
  // Company settings
  settings: jsonb("settings").default(sql`'{}'::jsonb`), // Flexible settings object
  
  // AI Brain settings
  aiBrainEnabled: boolean("ai_brain_enabled").notNull().default(true),
  aiBrainSettings: jsonb("ai_brain_settings").default(sql`'{
    "recencyWeight": 0.3,
    "sourceWeight": 0.2,
    "attemptWeight": 0.2,
    "outcomeWeight": 0.3,
    "maxAttempts": 10,
    "followUpDelayHours": 24
  }'::jsonb`),
  
  // Status and metadata
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Users table with role-based access and company relationship
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id), // null for super_admin
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  name: text("name"), // Full display name
  role: text("role").notNull().default("agent"), // 'super_admin', 'company_admin', 'agent'
  isActive: boolean("is_active").notNull().default(true),
  
  // User preferences
  preferences: jsonb("preferences").default(sql`'{}'::jsonb`),
  lastLoginAt: timestamp("last_login_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  companyId: varchar("company_id").references(() => companies.id), // Multi-tenant company scope
  batchId: varchar("batch_id").references(() => leadBatches.id),
  fundingProductId: varchar("funding_product_id").references(() => fundingProducts.id), // Which funding type this lead is for
  
  // Lead data fields
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  contactName: text("contact_name"), // Primary contact name
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  secondaryPhone: text("secondary_phone"), // Additional phone number if present
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
  
  // Revenue discovery fields
  estimatedRevenue: integer("estimated_revenue"),
  revenueConfidence: text("revenue_confidence"), // 'high', 'medium', 'low'
  employeeCount: integer("employee_count"),
  yearsInBusiness: integer("years_in_business"),
  ownerBackground: text("owner_background"),
  researchInsights: jsonb("research_insights"),
  lastEnrichedAt: timestamp("last_enriched_at"),
  
  // Enrichment tracking fields
  enrichmentConfidence: integer("enrichment_confidence").default(0), // 0-100 confidence score
  enrichmentSources: jsonb("enrichment_sources"), // Array of data sources used
  enrichmentStatus: text("enrichment_status").default("pending"), // 'pending', 'processing', 'completed', 'failed'
  fullAddress: text("full_address"), // Complete address from enrichment
  businessDescription: text("business_description"), // Company description from enrichment
  city: text("city"), // City from enrichment
  
  // ML scoring fields
  mlQualityScore: integer("ml_quality_score").default(0), // 0-100
  conversionProbability: decimal("conversion_probability", { precision: 5, scale: 4 }), // 0.0000-1.0000
  expectedDealSize: decimal("expected_deal_size", { precision: 12, scale: 2 }),
  scoringFactors: jsonb("scoring_factors"), // Detailed breakdown of scoring factors
  
  // Unified Lead Intelligence Score fields
  intelligenceScore: integer("intelligence_score").default(0), // 0-100 overall unified score
  qualitySubScore: integer("quality_sub_score").default(0), // 0-100 data quality and completeness
  freshnessSubScore: integer("freshness_sub_score").default(0), // 0-100 how recent and relevant
  riskSubScore: integer("risk_sub_score").default(0), // 0-100 (lower is better)
  opportunitySubScore: integer("opportunity_sub_score").default(0), // 0-100 potential value
  confidenceSubScore: integer("confidence_sub_score").default(0), // 0-100 verification confidence
  intelligenceMetadata: jsonb("intelligence_metadata"), // Detailed breakdown and explanations
  intelligenceCalculatedAt: timestamp("intelligence_calculated_at"),
  
  // Lead activation tracking
  lastActivatedAt: timestamp("last_activated_at"),
  activationCount: integer("activation_count").notNull().default(0),
  
  // Master Enrichment Orchestration fields
  masterEnrichmentScore: integer("master_enrichment_score").default(0), // 0-100 unified score from all systems
  dataCompleteness: jsonb("data_completeness"), // { overall, businessInfo, contactInfo, financialInfo, uccInfo, verificationInfo }
  enrichmentCascadeDepth: integer("enrichment_cascade_depth").default(0), // How many cascade steps were performed
  dataLineage: jsonb("data_lineage"), // Track which source provided which data
  lastMasterEnrichmentAt: timestamp("last_master_enrichment_at"),
  
  // UCC Intelligence fields
  uccNumber: text("ucc_number"),
  filingDate: timestamp("filing_date"),
  filingType: text("filing_type"),
  expireDate: timestamp("expire_date"),
  amendDate: timestamp("amend_date"),
  securedParties: text("secured_parties"),
  lenderCount: integer("lender_count"),
  filingCount: integer("filing_count"),
  primaryLenderType: text("primary_lender_type"), // 'mca', 'traditional', 'mixed', 'unknown'
  hasMultipleMcaPositions: boolean("has_multiple_mca").default(false),
  activePositions: integer("active_positions"),
  terminatedPositions: integer("terminated_positions"),
  lastFilingDate: timestamp("last_filing_date"),
  filingSpanDays: integer("filing_span_days"),
  stackingRisk: text("stacking_risk"), // 'high', 'medium', 'low'
  businessMaturity: text("business_maturity"), // 'new', 'growing', 'established', 'mature'
  uccIntelligence: jsonb("ucc_intelligence"), // Full intelligence object
  
  // Simplified UCC fields for quick access
  totalUccDebt: decimal("total_ucc_debt", { precision: 15, scale: 2 }),
  activeUccCount: integer("active_ucc_count").default(0),
  lastUccFilingDate: timestamp("last_ucc_filing_date"),
  uccRiskLevel: text("ucc_risk_level"), // 'low', 'medium', 'high'
  uccMatchConfidence: integer("ucc_match_confidence").default(0), // 0-100 confidence score for UCC match
  
  // Auto-Verification System Fields
  emailVerificationScore: integer("email_verification_score").default(0), // 0-100
  phoneVerificationScore: integer("phone_verification_score").default(0), // 0-100
  nameVerificationScore: integer("name_verification_score").default(0), // 0-100
  overallVerificationScore: integer("overall_verification_score").default(0), // 0-100 average
  verificationStatus: text("verification_status").default("unverified"), // 'verified', 'partial', 'unverified', 'failed'
  lastVerifiedAt: timestamp("last_verified_at"),
  
  // Simplified Lead Scoring System
  unifiedLeadScore: integer("unified_lead_score").default(0), // 0-100 unified score
  
  // Colorado MCA Enrichment Methodology Fields
  mcaScore: decimal("mca_score", { precision: 5, scale: 1 }), // MCA suitability score from Colorado methodology
  mcaQualityTier: text("mca_quality_tier"), // 'excellent', 'good', 'fair', 'poor'
  hasBank: boolean("has_bank").default(false), // Secured party includes bank
  hasEquipment: boolean("has_equipment").default(false), // Secured party includes equipment lender
  hasIRS: boolean("has_irs").default(false), // Has IRS lien (negative signal)
  hasSBA: boolean("has_sba").default(false), // Has SBA lien (negative signal)
  mcaSector: text("mca_sector"), // Sector classification for MCA (e.g., "Heavy Civil/Construction")
  whyGoodForMCA: text("why_good_for_mca"), // Explanation of MCA suitability
  mcaInsights: jsonb("mca_insights"), // Array of insights/badges for MCA suitability
  isGovernmentEntity: boolean("is_government_entity").default(false), // Excluded from MCA
  mcaRecencyScore: integer("mca_recency_score").default(0), // 0-10 score for filing recency
  lastMCAEnrichmentAt: timestamp("last_mca_enrichment_at"), // When MCA methodology was last applied
  dataCompletenessScore: integer("data_completeness_score").default(0), // 0-100
  leadScoreCategory: text("lead_score_category"), // 'excellent', 'good', 'fair', 'poor'
  
  // Practical Insights
  leadInsights: jsonb("lead_insights"), // Array of insight objects
  insightTags: text("insight_tags").array(), // Quick tags for filtering
  
  // CRM Export Tracking
  crmExportCount: integer("crm_export_count").default(0),
  lastCrmExportAt: timestamp("last_crm_export_at"),
  crmExportHistory: jsonb("crm_export_history"), // Array of export records
  
  // CRM Pipeline & Status Fields
  pipelineStageId: varchar("pipeline_stage_id"), // References pipelineStages.id
  leadStatus: text("lead_status").default("new"), // 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
  assignedTo: varchar("assigned_to").references(() => users.id),
  lastContactedAt: timestamp("last_contacted_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  tags: text("tags").array(), // Custom tags for categorization
  priority: text("priority").default("medium"), // 'low', 'medium', 'high', 'urgent'
  source: text("lead_source"), // Where the lead came from
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }), // Deal value
  probability: integer("probability").default(0), // Win probability 0-100
  lostReason: text("lost_reason"), // Why lead was lost
  wonDate: timestamp("won_date"),
  lostDate: timestamp("lost_date"),
  
  // AI Brain & Call Tracking Fields
  hotScore: integer("hot_score").notNull().default(50), // 0-100 AI-calculated priority score
  attemptCount: integer("attempt_count").notNull().default(0), // Number of contact attempts
  lastCallAt: timestamp("last_call_at"), // Last call timestamp
  lastOutcome: text("last_outcome"), // Last call outcome
  nextActionAt: timestamp("next_action_at"), // When next action is due
  nextActionType: text("next_action_type"), // 'call', 'email', 'follow_up', 'meeting'
  e164Phone: text("e164_phone"), // Normalized E.164 phone format
  rawPhone: text("raw_phone"), // Original phone format
  sourceType: text("source_type").default("manual"), // 'manual', 'import', 'web', 'referral', 'paid'
  
  // AI Brain feedback-driven scoring
  aiScore: integer("ai_score").notNull().default(50), // 0-100 AI-calculated score based on buyer feedback
  conversionLabel: text("conversion_label").default("unknown"), // 'unknown', 'funded', 'contacted', 'no_response', 'bad'
  lastOutcomeAt: timestamp("last_outcome_at"), // When buyer last reported an outcome
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ========================================
// CRM TABLES
// ========================================

// Pipeline stages for Kanban board
export const pipelineStages = pgTable("pipeline_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id), // Multi-tenant scope
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3B82F6"), // Hex color for stage
  order: integer("order").notNull().default(0), // Display order
  isDefault: boolean("is_default").notNull().default(false), // Default stage for new leads
  isWonStage: boolean("is_won_stage").notNull().default(false), // Marks deal as won
  isLostStage: boolean("is_lost_stage").notNull().default(false), // Marks deal as lost
  probability: integer("probability").default(0), // Default win probability for this stage
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tasks for lead follow-up and activities
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id), // Multi-tenant scope
  leadId: varchar("lead_id").references(() => leads.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default("follow_up"), // 'call', 'email', 'meeting', 'follow_up', 'proposal', 'other'
  priority: text("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'urgent'
  status: text("status").notNull().default("pending"), // 'pending', 'in_progress', 'completed', 'cancelled'
  
  dueAt: timestamp("due_at"), // Renamed for consistency with spec
  dueDate: timestamp("due_date"),
  dueTime: text("due_time"), // Time of day for the task
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id),
  
  reminderAt: timestamp("reminder_at"), // When to send reminder
  reminderSent: boolean("reminder_sent").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Notes for leads - rich text notes and comments
export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  
  content: text("content").notNull(),
  isPinned: boolean("is_pinned").notNull().default(false),
  noteType: text("note_type").default("general"), // 'general', 'call_summary', 'meeting_notes', 'important'
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Reminders for follow-ups
export const reminders = pgTable("reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  taskId: varchar("task_id").references(() => tasks.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  title: text("title").notNull(),
  description: text("description"),
  reminderAt: timestamp("reminder_at").notNull(),
  
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringPattern: text("recurring_pattern"), // 'daily', 'weekly', 'monthly', 'custom'
  recurringEndDate: timestamp("recurring_end_date"),
  
  status: text("status").notNull().default("pending"), // 'pending', 'sent', 'snoozed', 'dismissed'
  sentAt: timestamp("sent_at"),
  snoozedUntil: timestamp("snoozed_until"),
  
  notificationChannels: text("notification_channels").array().default(sql`ARRAY['in_app']::text[]`), // 'in_app', 'email', 'sms'
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Activity timeline for leads
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  userId: varchar("user_id").references(() => users.id),
  
  activityType: text("activity_type").notNull(), // 'call', 'email_sent', 'email_received', 'meeting', 'note_added', 'status_change', 'stage_change', 'task_completed', 'document_sent', 'sms', 'linkedin_message'
  title: text("title").notNull(),
  description: text("description"),
  
  // Activity details
  outcome: text("outcome"), // For calls: 'connected', 'voicemail', 'no_answer', 'busy', 'wrong_number'
  duration: integer("duration"), // Duration in seconds for calls/meetings
  direction: text("direction"), // 'inbound', 'outbound' for calls/emails
  
  // Related entities
  relatedTaskId: varchar("related_task_id").references(() => tasks.id),
  relatedNoteId: varchar("related_note_id").references(() => notes.id),
  
  // Metadata
  metadata: jsonb("metadata"), // Additional activity-specific data
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Additional contacts for a lead/company
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  title: text("title"), // Job title
  role: text("role"), // 'decision_maker', 'influencer', 'champion', 'blocker', 'end_user'
  department: text("department"),
  
  email: text("email"),
  phone: text("phone"),
  mobilePhone: text("mobile_phone"),
  linkedinUrl: text("linkedin_url"),
  
  isPrimary: boolean("is_primary").notNull().default(false),
  isOptedOut: boolean("is_opted_out").notNull().default(false), // Opted out of communications
  
  notes: text("notes"),
  lastContactedAt: timestamp("last_contacted_at"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Email tracking for sent emails
export const emailTracking = pgTable("email_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  subject: text("subject").notNull(),
  body: text("body"),
  toEmail: text("to_email").notNull(),
  fromEmail: text("from_email"),
  
  status: text("status").notNull().default("sent"), // 'draft', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  
  templateId: varchar("template_id"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Call logs for phone calls
export const callLogs = pgTable("call_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id), // Multi-tenant scope
  leadId: varchar("lead_id").references(() => leads.id),
  contactId: varchar("contact_id").references(() => contacts.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  phoneDialed: text("phone_dialed").notNull(), // Phone number called
  phoneNumber: text("phone_number").notNull(),
  direction: text("direction").notNull().default("outbound"), // 'inbound', 'outbound'
  outcome: text("outcome").notNull(), // 'connected', 'voicemail', 'no_answer', 'busy', 'wrong_number', 'callback_requested', 'follow_up', 'funded', 'not_interested'
  
  durationSec: integer("duration_sec"), // Duration in seconds (spec naming)
  duration: integer("duration"), // Duration in seconds (legacy)
  recordingUrl: text("recording_url"),
  
  notes: text("notes"), // Call notes (spec naming)
  summary: text("summary"), // Call summary/notes (legacy)
  nextSteps: text("next_steps"),
  
  scheduledAt: timestamp("scheduled_at"), // If it was a scheduled call
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Document attachments for leads
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  
  name: text("name").notNull(),
  description: text("description"),
  fileType: text("file_type").notNull(), // 'pdf', 'doc', 'xlsx', 'image', 'other'
  fileSize: integer("file_size"), // Size in bytes
  storageKey: text("storage_key").notNull(), // Object storage path
  
  category: text("category"), // 'proposal', 'contract', 'invoice', 'application', 'other'
  version: integer("version").notNull().default(1),
  
  uploadedBy: varchar("uploaded_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tags for organizing leads
export const leadTags = pgTable("lead_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6B7280"), // Hex color
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// UCC filings table for tracking business financing history
export const uccFilings = pgTable("ucc_filings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  debtorName: text("debtor_name").notNull(),
  securedParty: text("secured_party").notNull(),
  filingDate: timestamp("filing_date").notNull(),
  fileNumber: text("file_number").notNull(),
  collateralDescription: text("collateral_description"),
  loanAmount: integer("loan_amount"), // in cents if available
  filingType: text("filing_type"), // 'original', 'amendment', 'termination'
  jurisdiction: text("jurisdiction"), // State where filed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// UCC monitoring alerts for tracking significant events
export const uccMonitoringAlerts = pgTable("ucc_monitoring_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  alertType: text("alert_type").notNull(), // 'new_filing', 'multiple_filings', 'stacking_detected', etc.
  severity: text("severity").notNull(), // 'info', 'warning', 'critical'
  title: text("title").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata"), // Additional alert data
  actionRequired: text("action_required").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Master Database Cache for comprehensive business intelligence
export const masterDatabaseCache = pgTable("master_database_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: text("entity_id").notNull().unique(), // Unique business entity identifier
  businessData: jsonb("business_data").notNull(), // Complete BusinessEntity object
  searchIndexes: jsonb("search_indexes"), // Pre-computed search indexes
  completeness: decimal("completeness", { precision: 5, scale: 4 }).notNull(), // 0.0000-1.0000
  dataQuality: decimal("data_quality", { precision: 5, scale: 4 }).notNull(), // 0.0000-1.0000
  lastVerified: timestamp("last_verified").notNull(),
  sources: text("sources").array(), // Data sources used
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Intelligence Brain Decision Logs
export const intelligenceDecisions = pgTable("intelligence_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  strategy: text("strategy").notNull(), // 'minimal', 'standard', 'comprehensive', 'maximum'
  priority: integer("priority").notNull(), // 1-10
  services: text("services").array(), // Services selected for enrichment
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 4 }).notNull(),
  actualCost: decimal("actual_cost", { precision: 10, scale: 4 }),
  confidence: decimal("confidence", { precision: 5, scale: 4 }).notNull(), // 0.0000-1.0000
  reasoning: text("reasoning").notNull(),
  skipReasons: text("skip_reasons").array(),
  executionTime: integer("execution_time"), // milliseconds
  success: boolean("success"),
  errorMessage: text("error_message"),
  resultMetrics: jsonb("result_metrics"), // Detailed metrics about the decision outcome
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Saved searches for smart lead matching
export const savedSearches = pgTable("saved_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  searchCriteria: jsonb("search_criteria").notNull(), // Stores all search filters
  
  // Notification preferences
  emailNotifications: boolean("email_notifications").notNull().default(true),
  inAppNotifications: boolean("in_app_notifications").notNull().default(true),
  notificationFrequency: text("notification_frequency").default("daily"), // 'instant', 'daily', 'weekly'
  
  // Matching stats
  lastMatchedAt: timestamp("last_matched_at"),
  matchCount: integer("match_count").notNull().default(0),
  newMatchCount: integer("new_match_count").notNull().default(0), // Unread matches
  
  // Metadata
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Lead matches for saved searches
export const savedSearchMatches = pgTable("saved_search_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  savedSearchId: varchar("saved_search_id").references(() => savedSearches.id).notNull(),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  matchScore: integer("match_score").notNull(), // 0-100 how well the lead matches
  isRead: boolean("is_read").notNull().default(false),
  notificationSent: boolean("notification_sent").notNull().default(false),
  matchedAt: timestamp("matched_at").notNull().defaultNow(),
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

// Lead activation history for unified workflow tracking
export const leadActivationHistory = pgTable("lead_activation_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activationId: text("activation_id").notNull().unique(),
  leadIds: text("lead_ids").array().notNull(),
  userId: varchar("user_id").references(() => users.id),
  
  // Activation workflow steps
  steps: jsonb("steps").notNull(), // Array of ActivationStep objects
  overallStatus: text("overall_status").notNull(), // 'pending', 'processing', 'completed', 'failed'
  
  // Results from each step
  enrichmentResults: jsonb("enrichment_results"),
  campaignId: varchar("campaign_id"),
  crmExportResults: jsonb("crm_export_results"),
  
  // Metadata
  quickActionId: text("quick_action_id"), // If triggered by quick action
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  executionTimeMs: integer("execution_time_ms"),
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
  
  // Timestamps
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(), // When the purchase was made
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

// ========================================
// LEAD ASSIGNMENT & BUYER FEEDBACK SYSTEM
// ========================================

// Lead assignments - tracks which leads are assigned to which buyers after purchase
export const leadAssignments = pgTable("lead_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  buyerId: varchar("buyer_id").references(() => users.id).notNull(),
  companyId: varchar("company_id").references(() => companies.id), // For multi-tenant isolation
  batchId: varchar("batch_id").references(() => leadBatches.id),
  purchaseId: varchar("purchase_id").references(() => purchases.id),
  
  // Pricing info
  pricePaidCents: integer("price_paid_cents").notNull().default(0),
  
  // Status tracking
  status: text("status").notNull().default("new"), // 'new', 'working', 'contacted', 'funded', 'bad_lead', 'no_response'
  currentConversionLabel: text("current_conversion_label").default("unknown"), // mirrors lead conversion
  
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead activities - lightweight CRM history for buyer feedback
export const leadActivities = pgTable("lead_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  buyerId: varchar("buyer_id").references(() => users.id).notNull(),
  companyId: varchar("company_id").references(() => companies.id), // For multi-tenant isolation
  assignmentId: varchar("assignment_id").references(() => leadAssignments.id),
  
  // Activity type and details
  type: text("type").notNull(), // 'status_change', 'note', 'funded', 'bad_lead', 'contacted', 'no_response'
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  note: text("note"),
  
  // For funded leads
  dealAmount: decimal("deal_amount", { precision: 12, scale: 2 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Brain configuration - global settings for AI scoring system
export const brainConfig = pgTable("brain_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Tier thresholds (minimum ai_score to qualify for each tier)
  goldMinScore: integer("gold_min_score").notNull().default(0),
  platinumMinScore: integer("platinum_min_score").notNull().default(30),
  diamondMinScore: integer("diamond_min_score").notNull().default(60),
  eliteMinScore: integer("elite_min_score").notNull().default(80),
  
  // Max sales per lead
  maxSalesPerLead: integer("max_sales_per_lead").notNull().default(3),
  
  // Scoring weights
  recencyWeight: decimal("recency_weight", { precision: 3, scale: 2 }).notNull().default("0.20"),
  sourceTypeWeight: decimal("source_type_weight", { precision: 3, scale: 2 }).notNull().default("0.15"),
  lenderCountWeight: decimal("lender_count_weight", { precision: 3, scale: 2 }).notNull().default("0.15"),
  feedbackWeight: decimal("feedback_weight", { precision: 3, scale: 2 }).notNull().default("0.50"),
  
  // Auto-scoring settings
  autoRecomputeEnabled: boolean("auto_recompute_enabled").notNull().default(true),
  recomputeIntervalHours: integer("recompute_interval_hours").notNull().default(24),
  lastRecomputeAt: timestamp("last_recompute_at"),
  
  // Active configuration marker
  isActive: boolean("is_active").notNull().default(true),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Source stats - aggregated stats per source/state for brain insights
export const sourceStats = pgTable("source_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Grouping dimensions
  sourceType: text("source_type").notNull(), // 'manual', 'import', 'web', 'referral', 'paid'
  stateCode: text("state_code"), // Optional state grouping
  
  // Aggregated metrics
  totalLeads: integer("total_leads").notNull().default(0),
  totalAssigned: integer("total_assigned").notNull().default(0),
  totalWithFeedback: integer("total_with_feedback").notNull().default(0),
  totalFunded: integer("total_funded").notNull().default(0),
  totalBadLeads: integer("total_bad_leads").notNull().default(0),
  totalContacted: integer("total_contacted").notNull().default(0),
  totalNoResponse: integer("total_no_response").notNull().default(0),
  
  // Calculated rates
  fundRate: decimal("fund_rate", { precision: 5, scale: 4 }), // 0.0000-1.0000
  badLeadRate: decimal("bad_lead_rate", { precision: 5, scale: 4 }),
  contactRate: decimal("contact_rate", { precision: 5, scale: 4 }),
  
  // Revenue attribution
  totalRevenueGenerated: decimal("total_revenue_generated", { precision: 15, scale: 2 }).notNull().default("0"),
  
  // Brain suggestions
  suggestedAction: text("suggested_action"), // 'kill', 'upgrade', 'downgrade', 'none'
  actionReason: text("action_reason"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  
  lastUpdatedAt: timestamp("last_updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

// Staging table for bulk data ingestion
export const stagingLeads = pgTable("staging_leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull(),
  source: text("source").notNull(),
  rawId: text("raw_id").notNull(),
  
  // Business information
  businessName: text("business_name"),
  ownerName: text("owner_name"),
  legalName: text("legal_name"),
  aliases: text("aliases").array(),
  
  // Location
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  
  // Contact information
  phones: text("phones").array(),
  emails: text("emails").array(),
  domains: text("domains").array(),
  
  // Metadata
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull().default("0.5"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processed: boolean("processed").notNull().default(false),
  processedAt: timestamp("processed_at"),
  error: text("error"),
});

// Raw data dumps for audit trail
export const rawDataDumps = pgTable("raw_data_dumps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: text("job_id").notNull(),
  source: text("source").notNull(),
  path: text("path").notNull(), // S3 or local path
  recordCount: integer("record_count").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Data ingestion jobs
export const dataIngestionJobs = pgTable("data_ingestion_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: text("source").notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  recordsProcessed: integer("records_processed").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),
  totalCost: decimal("total_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Enrichment job queue for async processing
export const enrichmentJobs = pgTable("enrichment_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  batchId: text("batch_id"),
  priority: text("priority").notNull().default("medium"), // high, medium, low
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  
  // Job configuration
  enrichmentOptions: jsonb("enrichment_options"),
  source: text("source").notNull(), // upload, view, manual, scheduled, api
  userId: varchar("user_id").references(() => users.id),
  
  // Results
  result: jsonb("result"),
  error: text("error"),
  apiCallCount: integer("api_call_count").notNull().default(0),
  totalCost: decimal("total_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
});

// Enrichment cost tracking
export const enrichmentCosts = pgTable("enrichment_costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => enrichmentJobs.id),
  service: text("service").notNull(),
  apiCall: text("api_call").notNull(),
  cost: decimal("cost", { precision: 10, scale: 6 }).notNull(),
  response: jsonb("response"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Lead deduplication tracking
export const leadDedupeCandidates = pgTable("lead_dedupe_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId1: varchar("lead_id_1").references(() => leads.id),
  leadId2: varchar("lead_id_2").references(() => leads.id),
  matchType: text("match_type").notNull(), // exact, fuzzy_name, domain, phone, address
  matchScore: decimal("match_score", { precision: 3, scale: 2 }).notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolution: text("resolution"), // merge, keep_both, delete_1, delete_2
  resolvedBy: varchar("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

// Enhanced Verification - stores detailed real-time verification results
export const enhancedVerification = pgTable("enhanced_verification", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  
  // Hunter.io email verification results
  emailVerification: jsonb("email_verification"), // Full Hunter.io response
  emailScore: integer("email_score"), // 0-100 Hunter.io confidence score
  emailStatus: text("email_status"), // 'deliverable', 'undeliverable', 'risky', 'unknown'
  domainStatus: text("domain_status"), // Domain reputation status
  mxRecords: boolean("mx_records"), // Has valid MX records
  smtpCheck: boolean("smtp_check"), // SMTP server check passed
  emailDisposable: boolean("email_disposable"), // Is disposable email
  emailWebmail: boolean("email_webmail"), // Is webmail (gmail, yahoo, etc)
  emailAcceptAll: boolean("email_accept_all"), // Domain accepts all emails
  
  // Numverify phone verification results  
  phoneVerification: jsonb("phone_verification"), // Full Numverify response
  phoneValid: boolean("phone_valid"), // Is valid phone number
  phoneLineType: text("phone_line_type"), // 'mobile', 'landline', 'voip', 'toll_free'
  phoneCarrier: text("phone_carrier"), // Carrier name
  phoneLocation: text("phone_location"), // Location of phone
  phoneCountryCode: text("phone_country_code"), // Country code
  phoneLocationData: jsonb("phone_location_data"), // Detailed location data
  phoneRiskScore: integer("phone_risk_score"), // 0-100 risk score (lower is better)
  
  // Combined confidence scoring
  overallConfidenceScore: decimal("overall_confidence_score", { precision: 5, scale: 2 }), // 0-100
  confidenceBreakdown: jsonb("confidence_breakdown"), // Detailed breakdown of score factors
  verificationStatus: text("verification_status"), // 'verified', 'partial', 'unverified', 'failed'
  
  // Caching and timestamps
  cachedUntil: timestamp("cached_until"), // When to refresh verification
  verifiedAt: timestamp("verified_at").notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at"),
  attemptCount: integer("attempt_count").notNull().default(1),
  
  // API metadata
  hunterCreditsUsed: integer("hunter_credits_used").default(0),
  numverifyCreditsUsed: integer("numverify_credits_used").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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

// Smart Search - Unified search system
export const smartSearches = pgTable("smart_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  searchName: text("search_name"),
  searchQuery: text("search_query"), // Natural language query
  filters: jsonb("filters").notNull(), // Parsed filter criteria
  searchMode: text("search_mode").notNull(), // 'instant' or 'alert'
  resultCount: integer("result_count").default(0),
  isActive: boolean("is_active").notNull().default(true), // For alerts
  emailNotifications: boolean("email_notifications").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  deletedAt: timestamp("deleted_at"),
});

// Search history for tracking user searches
export const searchHistory = pgTable("search_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  searchId: varchar("search_id").references(() => smartSearches.id),
  searchQuery: text("search_query").notNull(),
  filters: jsonb("filters").notNull(),
  resultCount: integer("result_count").notNull().default(0),
  executionTime: integer("execution_time"), // milliseconds
  searchType: text("search_type").notNull(), // 'natural_language' or 'filters'
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Popular searches tracking
export const popularSearches = pgTable("popular_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  searchQuery: text("search_query").notNull().unique(),
  filters: jsonb("filters").notNull(),
  searchCount: integer("search_count").notNull().default(1),
  lastSearchedAt: timestamp("last_searched_at").notNull().defaultNow(),
  weeklyCount: integer("weekly_count").notNull().default(1),
  monthlyCount: integer("monthly_count").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// AI search suggestions for personalized recommendations
export const searchSuggestions = pgTable("search_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  suggestionText: text("suggestion_text").notNull(),
  suggestionReason: text("suggestion_reason"), // Why this was suggested
  filters: jsonb("filters").notNull(),
  score: decimal("score", { precision: 5, scale: 2 }), // Relevance score
  dismissed: boolean("dismissed").notNull().default(false),
  clicked: boolean("clicked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
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

// Note: savedSearches table is already defined at line 215 with additional notification fields

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

// Embeddings table for cached text embeddings
export const embeddings = pgTable("embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cacheKey: text("cache_key").notNull().unique(),
  text: text("text").notNull(),
  embedding: jsonb("embedding").notNull(), // Vector array
  model: text("model").notNull().default("text-embedding-ada-002"),
  tokens: integer("tokens"),
  category: text("category").notNull().default("general"), // 'general', 'business', 'industry', etc.
  metadata: jsonb("metadata"), // Additional metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// LLM Cache table for LLM response caching
export const llmCache = pgTable("llm_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cacheKey: text("cache_key").notNull().unique(),
  prompt: text("prompt").notNull(),
  response: jsonb("response").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cost: decimal("cost", { precision: 10, scale: 6 }),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata"), // Additional context
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Intelligence Metrics table for tracking usage
export const intelligenceMetrics = pgTable("intelligence_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("session_id").notNull(),
  leadId: varchar("lead_id").references(() => leads.id),
  userId: varchar("user_id").references(() => users.id),
  
  // Tier usage
  tierUsage: jsonb("tier_usage").notNull(), // { tier0: count, tier1: count, tier2: count }
  
  // Cost tracking
  totalCost: decimal("total_cost", { precision: 10, scale: 6 }).notNull().default("0"),
  costByTier: jsonb("cost_by_tier"), // { tier0: 0, tier1: 0.05, tier2: 0.10 }
  
  // Performance metrics
  totalLatency: integer("total_latency"), // Total processing time in ms
  latencyByTier: jsonb("latency_by_tier"), // { tier0: 10ms, tier1: 500ms, tier2: 2000ms }
  
  // Success metrics
  fieldsExtracted: integer("fields_extracted").notNull().default(0),
  fieldsWithHighConfidence: integer("fields_high_confidence").notNull().default(0),
  averageConfidence: decimal("average_confidence", { precision: 5, scale: 2 }),
  
  // Escalation metrics
  escalations: integer("escalations").notNull().default(0),
  shortCircuits: integer("short_circuits").notNull().default(0),
  
  // Cost efficiency
  avgCostPerField: decimal("avg_cost_per_field", { precision: 10, scale: 6 }),
  avgCostPerLead: decimal("avg_cost_per_lead", { precision: 10, scale: 6 }),
  
  // Cache performance
  cacheHits: integer("cache_hits").notNull().default(0),
  cacheMisses: integer("cache_misses").notNull().default(0),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Lead Processing History for audit trail
export const leadProcessingHistory = pgTable("lead_processing_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  sessionId: text("session_id").notNull(),
  batchId: text("batch_id"),
  userId: varchar("user_id").references(() => users.id),
  
  // Processing stages
  stages: jsonb("stages").notNull(), // Array of stage results
  
  // Results
  finalScore: decimal("final_score", { precision: 5, scale: 2 }),
  finalConfidence: decimal("final_confidence", { precision: 5, scale: 2 }),
  enrichmentData: jsonb("enrichment_data"),
  uccData: jsonb("ucc_data"),
  
  // Audit
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  duration: integer("duration"), // milliseconds
  errors: jsonb("errors"),
  flags: text("flags").array(),
  source: text("source"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Processing Metrics for aggregated statistics
export const processingMetrics = pgTable("processing_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  period: text("period").notNull(), // 'hourly', 'daily', 'weekly', 'monthly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Volume metrics
  totalLeadsProcessed: integer("total_leads_processed").notNull().default(0),
  successfulProcessing: integer("successful_processing").notNull().default(0),
  failedProcessing: integer("failed_processing").notNull().default(0),
  
  // Cost metrics
  totalCost: decimal("total_cost", { precision: 12, scale: 6 }).notNull().default("0"),
  avgCostPerLead: decimal("avg_cost_per_lead", { precision: 10, scale: 6 }),
  costBySource: jsonb("cost_by_source"), // { openai: 0.50, perplexity: 0.10, etc. }
  
  // Performance metrics
  avgProcessingTime: integer("avg_processing_time"), // milliseconds
  p95ProcessingTime: integer("p95_processing_time"),
  p99ProcessingTime: integer("p99_processing_time"),
  
  // Intelligence metrics
  tierDistribution: jsonb("tier_distribution"), // { tier0: %, tier1: %, tier2: % }
  avgConfidenceScore: decimal("avg_confidence_score", { precision: 5, scale: 2 }),
  enrichmentRate: decimal("enrichment_rate", { precision: 5, scale: 2 }), // % of fields enriched
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Legacy Rule Executions for tracking rule engine activity
export const legacyRuleExecutions = pgTable("legacy_rule_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  sessionId: text("session_id"),
  ruleSetId: text("rule_set_id"),
  
  // Rule details
  rulesExecuted: jsonb("rules_executed").notNull(), // Array of executed rules
  matchedRules: jsonb("matched_rules"), // Rules that matched
  failedRules: jsonb("failed_rules"), // Rules that failed
  
  // Results
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }),
  riskFlags: text("risk_flags").array(),
  recommendations: text("recommendations").array(),
  
  // Performance
  executionTime: integer("execution_time"), // milliseconds
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas with validation

// Funding product insert schema
export const insertFundingProductSchema = createInsertSchema(fundingProducts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#2d6a4f"),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
});

// Company insert schema
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  timezone: z.string().default("America/New_York"),
  plan: z.enum(["starter", "professional", "enterprise"]).default("starter"),
  leadCreditBalance: z.number().int().min(0).default(0),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email(),
  role: z.enum(["super_admin", "company_admin", "agent", "admin", "buyer"]).default("agent"),
  companyId: z.string().optional(),
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

export const insertUccFilingSchema = createInsertSchema(uccFilings).omit({
  id: true,
  createdAt: true,
}).extend({
  filingDate: z.string().datetime(),
  loanAmount: z.number().optional(),
  filingType: z.enum(["original", "amendment", "termination"]).optional(),
});

// ========================================
// CRM INSERT SCHEMAS
// ========================================

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
  order: z.number().int().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  reminderSent: true,
}).extend({
  title: z.string().min(1).max(200),
  taskType: z.enum(["call", "email", "meeting", "follow_up", "proposal", "other"]).default("follow_up"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
  dueDate: z.string().datetime().optional(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  content: z.string().min(1),
  noteType: z.enum(["general", "call_summary", "meeting_notes", "important"]).default("general"),
  isPinned: z.boolean().default(false),
});

export const insertReminderSchema = createInsertSchema(reminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentAt: true,
}).extend({
  title: z.string().min(1).max(200),
  reminderAt: z.string().datetime(),
  status: z.enum(["pending", "sent", "snoozed", "dismissed"]).default("pending"),
  recurringPattern: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
}).extend({
  activityType: z.enum([
    "call", "email_sent", "email_received", "meeting", "note_added",
    "status_change", "stage_change", "task_completed", "document_sent", "sms", "linkedin_message"
  ]),
  title: z.string().min(1).max(200),
  outcome: z.enum(["connected", "voicemail", "no_answer", "busy", "wrong_number"]).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["decision_maker", "influencer", "champion", "blocker", "end_user"]).optional(),
});

export const insertEmailTrackingSchema = createInsertSchema(emailTracking).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  deliveredAt: true,
  openedAt: true,
  clickedAt: true,
  openCount: true,
  clickCount: true,
}).extend({
  subject: z.string().min(1).max(500),
  toEmail: z.string().email(),
  status: z.enum(["draft", "sent", "delivered", "opened", "clicked", "bounced", "failed"]).default("sent"),
});

export const insertCallLogSchema = createInsertSchema(callLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  phoneNumber: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  outcome: z.enum(["connected", "voicemail", "no_answer", "busy", "wrong_number", "callback_requested"]),
  duration: z.number().int().min(0).optional(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1).max(255),
  fileType: z.enum(["pdf", "doc", "xlsx", "image", "other"]),
  storageKey: z.string().min(1),
  category: z.enum(["proposal", "contract", "invoice", "application", "other"]).optional(),
});

export const insertLeadTagSchema = createInsertSchema(leadTags).omit({
  id: true,
  createdAt: true,
}).extend({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#6B7280"),
});

export const insertUccMonitoringAlertsSchema = createInsertSchema(uccMonitoringAlerts).omit({
  id: true,
  createdAt: true,
}).extend({
  alertType: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  acknowledged: z.boolean().default(false),
  acknowledgedAt: z.string().datetime().optional(),
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

// Lead Assignment & Buyer Feedback Insert Schemas
export const insertLeadAssignmentSchema = createInsertSchema(leadAssignments).omit({
  id: true,
  createdAt: true,
  assignedAt: true,
}).extend({
  status: z.enum(["new", "working", "contacted", "funded", "bad_lead", "no_response"]).default("new"),
  currentConversionLabel: z.enum(["unknown", "funded", "contacted", "no_response", "bad"]).default("unknown"),
  pricePaidCents: z.number().int().min(0).default(0),
});

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({
  id: true,
  createdAt: true,
}).extend({
  type: z.enum(["status_change", "note", "funded", "bad_lead", "contacted", "no_response"]),
  dealAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

export const insertBrainConfigSchema = createInsertSchema(brainConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRecomputeAt: true,
}).extend({
  goldMinScore: z.number().int().min(0).max(100).default(0),
  platinumMinScore: z.number().int().min(0).max(100).default(30),
  diamondMinScore: z.number().int().min(0).max(100).default(60),
  eliteMinScore: z.number().int().min(0).max(100).default(80),
  maxSalesPerLead: z.number().int().min(1).max(100).default(3),
});

export const insertSourceStatsSchema = createInsertSchema(sourceStats).omit({
  id: true,
  createdAt: true,
  lastUpdatedAt: true,
}).extend({
  sourceType: z.enum(["manual", "import", "web", "referral", "paid"]),
  suggestedAction: z.enum(["kill", "upgrade", "downgrade", "none"]).optional(),
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

export const insertEnhancedVerificationSchema = createInsertSchema(enhancedVerification).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
}).extend({
  verificationStatus: z.enum(["verified", "partial", "unverified", "failed"]).default("unverified"),
  overallConfidenceScore: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
});

// Master Database Cache schema
export const insertMasterDatabaseCacheSchema = createInsertSchema(masterDatabaseCache).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  completeness: z.string().regex(/^\d+(\.\d{1,4})?$/),
  dataQuality: z.string().regex(/^\d+(\.\d{1,4})?$/),
  lastVerified: z.date(),
});

// Intelligence Decision schema
export const insertIntelligenceDecisionSchema = createInsertSchema(intelligenceDecisions).omit({
  id: true,
  createdAt: true,
}).extend({
  strategy: z.enum(['minimal', 'standard', 'comprehensive', 'maximum']),
  priority: z.number().min(1).max(10),
  services: z.array(z.string()).optional(),
  estimatedCost: z.string().regex(/^\d+(\.\d{1,4})?$/),
  actualCost: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  confidence: z.string().regex(/^\d+(\.\d{1,4})?$/),
  skipReasons: z.array(z.string()).optional(),
  executionTime: z.number().optional(),
  success: z.boolean().optional(),
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

export const insertSmartSearchSchema = createInsertSchema(smartSearches).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
  deletedAt: true,
}).extend({
  searchName: z.string().optional(),
  searchQuery: z.string().optional(),
  filters: z.object({}).passthrough(),
  searchMode: z.enum(["instant", "alert"]),
  resultCount: z.number().default(0),
  isActive: z.boolean().default(true),
  emailNotifications: z.boolean().default(false),
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory).omit({
  id: true,
  createdAt: true,
}).extend({
  searchQuery: z.string(),
  filters: z.object({}).passthrough(),
  resultCount: z.number().default(0),
  executionTime: z.number().optional(),
  searchType: z.enum(["natural_language", "filters"]),
});

export const insertPopularSearchSchema = createInsertSchema(popularSearches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  searchQuery: z.string(),
  filters: z.object({}).passthrough(),
  searchCount: z.number().default(1),
  weeklyCount: z.number().default(1),
  monthlyCount: z.number().default(1),
});

export const insertSearchSuggestionSchema = createInsertSchema(searchSuggestions).omit({
  id: true,
  createdAt: true,
}).extend({
  suggestionText: z.string(),
  suggestionReason: z.string().optional(),
  filters: z.object({}).passthrough(),
  score: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  dismissed: z.boolean().default(false),
  clicked: z.boolean().default(false),
  expiresAt: z.date().optional(),
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

// Market Insights table for storing analysis results
export const marketInsights = pgTable("market_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  insightType: text("insight_type").notNull(), // 'industry_trend', 'seasonal', 'geographic', 'competition', 'market_saturation'
  
  // Analysis data
  industry: text("industry"),
  region: text("region"),
  timeframe: text("timeframe"), // 'daily', 'weekly', 'monthly', 'quarterly'
  
  // Trend metrics
  trendDirection: text("trend_direction"), // 'up', 'down', 'stable'
  trendStrength: decimal("trend_strength", { precision: 5, scale: 2 }), // 0-100
  demandIndex: decimal("demand_index", { precision: 5, scale: 2 }), // 0-100
  supplyIndex: decimal("supply_index", { precision: 5, scale: 2 }), // 0-100
  competitionDensity: decimal("competition_density", { precision: 5, scale: 2 }), // 0-100
  saturationLevel: decimal("saturation_level", { precision: 5, scale: 2 }), // 0-100
  
  // Predictions
  forecastedDemand: jsonb("forecasted_demand"), // Next 30/60/90 days
  seasonalFactors: jsonb("seasonal_factors"), // Monthly seasonal multipliers
  optimalTimeWindows: jsonb("optimal_time_windows"), // Best times to engage
  
  // Geographic analysis
  geographicHotspots: jsonb("geographic_hotspots"), // Top performing regions
  regionalOpportunities: jsonb("regional_opportunities"), // Emerging markets
  
  // Historical context
  historicalData: jsonb("historical_data"), // Past trends for comparison
  benchmarks: jsonb("benchmarks"), // Industry benchmarks
  
  // Metadata
  confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-100
  dataPoints: integer("data_points"), // Number of data points analyzed
  analysisMetadata: jsonb("analysis_metadata"), // Detailed analysis info
  
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Lead Predictions table for individual lead predictions
export const leadPredictions = pgTable("lead_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id).notNull(),
  
  // Time predictions
  timeToClosePrediction: integer("time_to_close_prediction"), // Days
  timeToCloseConfidence: decimal("time_to_close_confidence", { precision: 5, scale: 2 }), // 0-100
  optimalContactTime: jsonb("optimal_contact_time"), // Best days/times to contact
  
  // Deal predictions
  dealSizePrediction: decimal("deal_size_prediction", { precision: 12, scale: 2 }),
  dealSizeRange: jsonb("deal_size_range"), // {min, max, median}
  dealSizeConfidence: decimal("deal_size_confidence", { precision: 5, scale: 2 }), // 0-100
  
  // Success predictions
  successProbability: decimal("success_probability", { precision: 5, scale: 4 }), // 0-1
  fundingLikelihood: decimal("funding_likelihood", { precision: 5, scale: 4 }), // 0-1
  defaultRisk: decimal("default_risk", { precision: 5, scale: 4 }), // 0-1
  
  // ROI predictions
  expectedROI: decimal("expected_roi", { precision: 10, scale: 2 }), // Percentage
  riskAdjustedROI: decimal("risk_adjusted_roi", { precision: 10, scale: 2 }), // Percentage
  paybackPeriod: integer("payback_period"), // Days
  
  // Lifecycle predictions
  lifecycleStage: text("lifecycle_stage"), // 'awareness', 'consideration', 'decision', 'purchase', 'retention'
  stageTransitionProbability: jsonb("stage_transition_probability"), // Probability to move to next stage
  churnRisk: decimal("churn_risk", { precision: 5, scale: 4 }), // 0-1
  
  // Next best actions
  nextBestActions: jsonb("next_best_actions"), // Array of recommended actions with priorities
  recommendedChannels: jsonb("recommended_channels"), // Best communication channels
  recommendedOffers: jsonb("recommended_offers"), // Personalized offer recommendations
  
  // Market context
  marketPosition: jsonb("market_position"), // How this lead compares to market
  competitiveAnalysis: jsonb("competitive_analysis"), // Competitor presence/activity
  marketTiming: text("market_timing"), // 'early', 'optimal', 'late', 'missed'
  
  // Prediction metadata
  modelVersion: text("model_version"),
  confidence: decimal("overall_confidence", { precision: 5, scale: 2 }), // 0-100
  factorsAnalyzed: jsonb("factors_analyzed"), // What went into the prediction
  
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insight Alerts table for automated alerts
export const insightAlerts = pgTable("insight_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  alertType: text("alert_type").notNull(), // 'market_opportunity', 'risk_warning', 'trend_change', 'anomaly', 'threshold'
  severity: text("severity").notNull(), // 'info', 'warning', 'critical'
  
  // Alert details
  title: text("title").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"), // Detailed alert information
  
  // Context
  industry: text("industry"),
  region: text("region"),
  affectedLeads: jsonb("affected_leads"), // Array of lead IDs
  affectedCount: integer("affected_count"),
  
  // Thresholds and triggers
  triggerCondition: jsonb("trigger_condition"), // What triggered this alert
  thresholdValue: decimal("threshold_value", { precision: 10, scale: 2 }),
  actualValue: decimal("actual_value", { precision: 10, scale: 2 }),
  
  // Recommendations
  recommendations: jsonb("recommendations"), // What to do about this alert
  actionRequired: boolean("action_required").notNull().default(false),
  
  // Status
  status: text("status").notNull().default("active"), // 'active', 'acknowledged', 'resolved', 'expired'
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  
  // Expiry
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Market Benchmarks table for comparison data
export const marketBenchmarks = pgTable("market_benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  benchmarkType: text("benchmark_type").notNull(), // 'industry', 'regional', 'seasonal', 'size'
  category: text("category").notNull(), // Specific category (e.g., 'restaurant', 'CA', 'Q1', 'small_business')
  
  // Benchmark metrics
  avgConversionRate: decimal("avg_conversion_rate", { precision: 5, scale: 4 }), // 0-1
  avgDealSize: decimal("avg_deal_size", { precision: 12, scale: 2 }),
  avgTimeToClose: integer("avg_time_to_close"), // Days
  avgCreditScore: integer("avg_credit_score"),
  avgAnnualRevenue: decimal("avg_annual_revenue", { precision: 12, scale: 2 }),
  
  // Performance quartiles
  topQuartileConversion: decimal("top_quartile_conversion", { precision: 5, scale: 4 }),
  topQuartileDealSize: decimal("top_quartile_deal_size", { precision: 12, scale: 2 }),
  bottomQuartileConversion: decimal("bottom_quartile_conversion", { precision: 5, scale: 4 }),
  bottomQuartileDealSize: decimal("bottom_quartile_deal_size", { precision: 12, scale: 2 }),
  
  // Risk metrics
  avgDefaultRate: decimal("avg_default_rate", { precision: 5, scale: 4 }), // 0-1
  avgPaybackPeriod: integer("avg_payback_period"), // Days
  riskProfile: jsonb("risk_profile"), // Detailed risk breakdown
  
  // Market conditions
  marketMaturity: text("market_maturity"), // 'emerging', 'growing', 'mature', 'declining'
  competitionLevel: text("competition_level"), // 'low', 'moderate', 'high', 'saturated'
  growthRate: decimal("growth_rate", { precision: 5, scale: 2 }), // YoY percentage
  
  // Historical trends
  historicalTrends: jsonb("historical_trends"), // Past 12 months of data
  seasonalPatterns: jsonb("seasonal_patterns"), // Monthly patterns
  
  // Sample size and confidence
  sampleSize: integer("sample_size"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-100
  lastUpdated: timestamp("last_updated").notNull(),
  
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insight Reports table for caching generated insights and reports
export const insightReports = pgTable("insight_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Report identification
  reportType: text("report_type").notNull(), // 'daily_insights', 'portfolio_analysis', 'market_timing', 'anomaly_detection', 'daily_brief'
  cacheKey: text("cache_key"), // Optional cache key for quick lookups
  
  // Report content
  executiveSummary: text("executive_summary"),
  keyInsights: jsonb("key_insights"), // Array of key insights
  metrics: jsonb("metrics"), // Key metrics and statistics
  recommendations: jsonb("recommendations"), // Array of recommendations
  
  // Report metadata
  period: text("period"), // 'daily', 'weekly', 'monthly', 'quarterly', 'custom'
  dateRange: jsonb("date_range"), // {start: date, end: date}
  filters: jsonb("filters"), // Applied filters when generating report
  
  // Report data
  data: jsonb("data"), // Full report data
  charts: jsonb("charts"), // Chart configurations and data
  tables: jsonb("tables"), // Tabular data
  
  // Status and tracking
  reportStatus: text("report_status").notNull().default("draft"), // 'draft', 'generating', 'final', 'expired'
  generatedBy: text("generated_by").notNull(), // 'system', 'user', 'api', or user ID
  generatedFor: varchar("generated_for").references(() => users.id), // Optional user ID if generated for specific user
  
  // Performance and caching
  generationTimeMs: integer("generation_time_ms"), // Time taken to generate
  accessCount: integer("access_count").notNull().default(0), // Number of times accessed
  lastAccessedAt: timestamp("last_accessed_at"),
  
  // Timestamps
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // When this report expires and should be regenerated
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schema for Insight Reports
export const insertInsightReportSchema = createInsertSchema(insightReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  generatedAt: true,
  lastAccessedAt: true,
  accessCount: true,
}).extend({
  reportType: z.enum(['daily_insights', 'portfolio_analysis', 'market_timing', 'anomaly_detection', 'daily_brief']),
  cacheKey: z.string().optional(),
  executiveSummary: z.string().optional(),
  keyInsights: z.any().optional(),
  metrics: z.any().optional(),
  recommendations: z.any().optional(),
  period: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'custom']).optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string()
  }).optional(),
  filters: z.any().optional(),
  data: z.any().optional(),
  charts: z.any().optional(),
  tables: z.any().optional(),
  reportStatus: z.enum(['draft', 'generating', 'final', 'expired']).default('draft'),
  generatedBy: z.string(),
  generatedFor: z.string().optional(),
  generationTimeMs: z.number().optional(),
  expiresAt: z.date().or(z.string())
});

// UCC State Formats table for storing state-specific parsing templates
export const uccStateFormats = pgTable("ucc_state_formats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stateCode: text("state_code").notNull().unique(), // 'NY', 'CA', 'TX', etc.
  stateName: text("state_name").notNull(),
  
  // Format configuration
  formatVersion: text("format_version").notNull().default("1.0.0"),
  columnMappings: jsonb("column_mappings").notNull(), // Map of standard fields to state-specific column names
  dateFormat: text("date_format"), // Date format pattern used by this state
  
  // State-specific rules and patterns
  filingNumberPattern: text("filing_number_pattern"), // Regex pattern for filing numbers
  hasAdditionalFields: jsonb("additional_fields"), // State-specific fields not in standard format
  collateralCodes: jsonb("collateral_codes"), // State-specific collateral classification codes
  
  // Filing type variations
  filingTypes: jsonb("filing_types"), // State-specific filing type nomenclature
  continuationRules: jsonb("continuation_rules"), // How continuations are handled
  
  // Special characteristics
  characteristics: jsonb("characteristics"), // Array of special characteristics for this state
  parsingHints: jsonb("parsing_hints"), // AI hints for parsing this state's format
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// UCC Intelligence table for AI analysis results
export const uccIntelligence = pgTable("ucc_intelligence", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  filingId: varchar("filing_id").references(() => uccFilings.id),
  
  // AI Analysis Results
  aiAnalysis: jsonb("ai_analysis").notNull(), // Full AI analysis with all insights
  
  // Business Intelligence Metrics
  debtStackingScore: integer("debt_stacking_score"), // 0-100: Higher = more stacking
  refinancingProbability: decimal("refinancing_probability", { precision: 5, scale: 4 }), // 0-1
  businessGrowthIndicator: text("business_growth_indicator"), // 'growing', 'stable', 'declining'
  riskLevel: text("risk_level"), // 'low', 'moderate', 'high', 'critical'
  
  // Inferred Business Intelligence
  estimatedTotalDebt: decimal("estimated_total_debt", { precision: 12, scale: 2 }),
  debtToRevenueRatio: decimal("debt_to_revenue_ratio", { precision: 5, scale: 2 }),
  mcaApprovalLikelihood: decimal("mca_approval_likelihood", { precision: 5, scale: 4 }), // 0-1
  businessHealthScore: integer("business_health_score"), // 0-100
  
  // Industry-Specific Insights
  financingType: text("financing_type"), // 'equipment', 'working_capital', 'real_estate', 'mixed'
  industryInsights: jsonb("industry_insights"), // Industry-specific patterns and insights
  
  // Relationship Intelligence
  entityRelationships: jsonb("entity_relationships"), // Discovered business relationships
  ownershipStructure: jsonb("ownership_structure"), // Inferred ownership patterns
  lenderNetwork: jsonb("lender_network"), // Network of secured parties
  
  // Pattern Recognition
  filingPatterns: jsonb("filing_patterns"), // Identified patterns in filing history
  anomalies: jsonb("anomalies"), // Unusual patterns or red flags
  
  // Confidence Scores
  analysisConfidence: decimal("analysis_confidence", { precision: 5, scale: 2 }), // 0-100
  dataQualityScore: decimal("data_quality_score", { precision: 5, scale: 2 }), // 0-100
  
  // Recommendations
  recommendations: jsonb("recommendations"), // AI-generated recommendations
  warningFlags: jsonb("warning_flags"), // Risk warnings and red flags
  
  analyzedAt: timestamp("analyzed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// UCC Relationships table for lead-to-lead connections
export const uccRelationships = pgTable("ucc_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Relationship endpoints
  leadIdA: varchar("lead_id_a").references(() => leads.id).notNull(),
  leadIdB: varchar("lead_id_b").references(() => leads.id).notNull(),
  
  // Relationship details
  relationshipType: text("relationship_type").notNull(), // 'same_filing', 'shared_lender', 'parent_subsidiary', 'cross_collateral', 'guarantor'
  relationshipStrength: decimal("relationship_strength", { precision: 5, scale: 2 }), // 0-100
  
  // Evidence and matching
  matchingCriteria: jsonb("matching_criteria"), // What criteria matched (filing numbers, addresses, etc.)
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }), // 0-100
  
  // Filing details that connect them
  commonFilings: jsonb("common_filings"), // Array of filing IDs/numbers that connect them
  commonLenders: jsonb("common_lenders"), // Shared secured parties
  
  // Business relationship details
  businessRelationship: text("business_relationship"), // 'competitor', 'supplier', 'customer', 'affiliate', 'parent', 'subsidiary'
  riskPropagation: decimal("risk_propagation", { precision: 5, scale: 2 }), // 0-100: How much risk transfers
  
  // Graph metadata
  graphDistance: integer("graph_distance"), // Degrees of separation in the network
  clusterGroup: text("cluster_group"), // Identifier for business clusters
  
  // Discovery metadata
  discoveredBy: text("discovered_by"), // 'filing_match', 'name_match', 'address_match', 'ai_inference'
  discoveredAt: timestamp("discovered_at").notNull().defaultNow(),
  lastVerifiedAt: timestamp("last_verified_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Rules engine tables
export const rules = pgTable("rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'validation', 'scoring', 'transformation', 'enrichment', 'alert'
  precedence: integer("precedence").notNull().default(30), // 10-50
  priority: integer("priority").notNull().default(50), // 0-100 within precedence level
  enabled: boolean("enabled").notNull().default(true),
  
  // Rule definition
  condition: jsonb("condition").notNull(), // Nested condition structure
  actions: jsonb("actions").notNull(), // Array of actions
  
  // Metadata
  tags: jsonb("tags"), // Array of tags for filtering
  metadata: jsonb("metadata"), // Additional metadata
  
  // Tracking
  createdBy: varchar("created_by").references(() => users.id),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Rule execution history
export const ruleExecutions = pgTable("rule_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").references(() => rules.id).notNull(),
  leadId: varchar("lead_id").references(() => leads.id),
  batchId: varchar("batch_id"),
  
  // Execution details
  matched: boolean("matched").notNull(),
  executionTime: integer("execution_time").notNull(), // milliseconds
  actionsExecuted: jsonb("actions_executed"),
  
  // Context and results
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  transformations: jsonb("transformations"),
  scores: jsonb("scores"),
  alerts: jsonb("alerts"),
  
  // Error tracking
  errors: jsonb("errors"),
  warnings: jsonb("warnings"),
  
  executedAt: timestamp("executed_at").notNull().defaultNow(),
});

// Rule versioning
export const ruleVersions = pgTable("rule_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ruleId: varchar("rule_id").references(() => rules.id).notNull(),
  version: integer("version").notNull(),
  data: jsonb("data").notNull(), // Full rule definition at this version
  changedBy: varchar("changed_by").references(() => users.id),
  changeDescription: text("change_description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Scorecard configuration history
export const scorecardConfigs = pgTable("scorecard_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: integer("version").notNull(),
  
  // Configuration
  weights: jsonb("weights").notNull(),
  thresholds: jsonb("thresholds").notNull(),
  marketAdjustments: jsonb("market_adjustments"),
  
  // Metadata
  description: text("description"),
  effectiveDate: timestamp("effective_date").notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Entity resolution tables
export const entityMatches = pgTable("entity_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entity1Id: varchar("entity1_id").references(() => leads.id).notNull(),
  entity2Id: varchar("entity2_id").references(() => leads.id).notNull(),
  matchConfidence: integer("match_confidence").notNull(), // 0-100
  matchType: text("match_type").notNull(), // 'exact', 'fuzzy', 'phonetic', 'token', 'business_variant', 'composite'
  matchDetails: jsonb("match_details").notNull(), // Field-level scores and details
  status: text("status").notNull().default("pending"), // 'pending', 'confirmed', 'rejected'
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const entityGroups = pgTable("entity_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  masterEntityId: varchar("master_entity_id").references(() => leads.id).notNull(),
  memberCount: integer("member_count").notNull().default(1),
  groupType: text("group_type").notNull().default("duplicate"), // 'duplicate', 'family', 'network'
  confidence: integer("confidence").notNull().default(0), // Average confidence of group
  metadata: jsonb("metadata"), // Additional group metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const entityRelationships = pgTable("entity_relationships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentEntityId: varchar("parent_entity_id").references(() => leads.id).notNull(),
  childEntityId: varchar("child_entity_id").references(() => leads.id).notNull(),
  relationshipType: text("relationship_type").notNull(), // 'parent', 'subsidiary', 'affiliate', 'branch', 'franchise', 'partner', 'vendor', 'customer'
  confidence: integer("confidence").notNull().default(0), // 0-100
  source: text("source").notNull(), // 'user_defined', 'auto_detected', 'ucc_filing', 'entity_resolution', 'enrichment'
  evidence: jsonb("evidence"), // Evidence supporting the relationship
  bidirectional: boolean("bidirectional").notNull().default(false),
  strength: integer("strength").notNull().default(0), // 0-100 relationship strength
  establishedAt: timestamp("established_at"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas for Entity Resolution tables
export const insertEntityMatchSchema = createInsertSchema(entityMatches).omit({
  id: true,
  createdAt: true,
});

export const insertEntityGroupSchema = createInsertSchema(entityGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEntityRelationshipSchema = createInsertSchema(entityRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ==================== FEEDBACK AND LEARNING SYSTEM TABLES ====================

// Feedback collection table for operator corrections and improvements
export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: varchar("lead_id").references(() => leads.id),
  
  // Feedback type and details
  feedbackType: text("feedback_type").notNull(), // 'correction', 'validation', 'suggestion', 'entity_resolution', 'classification', 'score_adjustment'
  fieldName: text("field_name"), // Field being corrected
  originalValue: text("original_value"), // Original value
  correctedValue: text("corrected_value"), // Corrected value
  explanation: text("explanation"), // Why the correction was made
  
  // Confidence and priority
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull().default("50.00"), // 0-100
  priority: integer("priority").notNull().default(50), // 0-100
  impact: text("impact"), // 'low', 'medium', 'high', 'critical'
  
  // Status tracking
  status: text("status").notNull().default("pending"), // 'pending', 'applied', 'rejected', 'testing'
  appliedAt: timestamp("applied_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  
  // Operator information
  operatorId: varchar("operator_id").references(() => users.id).notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  
  // Metadata and context
  context: jsonb("context"), // Additional context about the feedback
  affectedLeads: jsonb("affected_leads"), // IDs of other leads affected by this pattern
  metadata: jsonb("metadata"), // Additional metadata
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Learned patterns table for storing patterns discovered from feedback
export const learnedPatterns = pgTable("learned_patterns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Pattern identification
  patternType: text("pattern_type").notNull(), // 'field_mapping', 'synonym', 'entity_alias', 'extraction_rule', 'classification_rule', 'threshold'
  patternCategory: text("pattern_category"), // 'business_name', 'phone', 'email', 'industry', etc.
  patternValue: jsonb("pattern_value").notNull(), // The actual pattern (could be regex, mapping, rule, etc.)
  
  // Pattern details
  description: text("description"),
  examples: jsonb("examples"), // Examples of where this pattern was observed
  
  // Statistics and confidence
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull().default("0.00"), // 0-100
  occurrences: integer("occurrences").notNull().default(1), // Times this pattern has been seen
  successRate: decimal("success_rate", { precision: 5, scale: 4 }), // 0-1 success rate when applied
  
  // Source tracking
  sourceType: text("source_type").notNull(), // 'feedback', 'ml_model', 'heuristic', 'manual'
  sourceFeedbackIds: jsonb("source_feedback_ids"), // IDs of feedback that contributed to this pattern
  
  // Status and lifecycle
  status: text("status").notNull().default("discovered"), // 'discovered', 'testing', 'active', 'deprecated', 'rejected'
  activatedAt: timestamp("activated_at"),
  deactivatedAt: timestamp("deactivated_at"),
  
  // Performance metrics
  applicationsCount: integer("applications_count").notNull().default(0),
  successfulApplications: integer("successful_applications").notNull().default(0),
  failedApplications: integer("failed_applications").notNull().default(0),
  
  // Testing and validation
  abTestId: varchar("ab_test_id"), // Link to A/B test if pattern is being tested
  validationResults: jsonb("validation_results"), // Results from validation tests
  
  // Timestamps
  firstSeen: timestamp("first_seen").notNull().defaultNow(),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Improvement suggestions table for system improvement recommendations
export const improvementSuggestions = pgTable("improvement_suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Suggestion details
  suggestionType: text("suggestion_type").notNull(), // 'new_rule', 'threshold_adjustment', 'weight_change', 'field_addition', 'process_improvement'
  title: text("title").notNull(),
  description: text("description").notNull(),
  
  // Impact analysis
  impactScore: integer("impact_score").notNull(), // 0-100
  affectedLeadsCount: integer("affected_leads_count").notNull().default(0),
  estimatedImprovement: decimal("estimated_improvement", { precision: 5, scale: 2 }), // Percentage improvement expected
  
  // Supporting evidence
  evidence: jsonb("evidence"), // Data supporting this suggestion
  relatedPatterns: jsonb("related_patterns"), // IDs of related learned patterns
  relatedFeedback: jsonb("related_feedback"), // IDs of related feedback items
  
  // Implementation details
  implementation: jsonb("implementation"), // How to implement this suggestion
  rollbackPlan: jsonb("rollback_plan"), // How to rollback if needed
  testingPlan: jsonb("testing_plan"), // How to test this change
  
  // Status and review
  status: text("status").notNull().default("pending"), // 'pending', 'under_review', 'approved', 'implemented', 'rejected'
  priority: text("priority").notNull().default("medium"), // 'low', 'medium', 'high', 'critical'
  
  // Review process
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Implementation tracking
  implementedBy: varchar("implemented_by").references(() => users.id),
  implementedAt: timestamp("implemented_at"),
  implementationNotes: text("implementation_notes"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Feedback metrics table for tracking system improvement over time
export const feedbackMetrics = pgTable("feedback_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Time period
  periodType: text("period_type").notNull(), // 'daily', 'weekly', 'monthly'
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Feedback statistics
  totalFeedback: integer("total_feedback").notNull().default(0),
  appliedFeedback: integer("applied_feedback").notNull().default(0),
  rejectedFeedback: integer("rejected_feedback").notNull().default(0),
  pendingFeedback: integer("pending_feedback").notNull().default(0),
  
  // Pattern statistics
  patternsDiscovered: integer("patterns_discovered").notNull().default(0),
  patternsActivated: integer("patterns_activated").notNull().default(0),
  patternsDeprecated: integer("patterns_deprecated").notNull().default(0),
  
  // Accuracy metrics
  accuracyBefore: decimal("accuracy_before", { precision: 5, scale: 4 }), // 0-1
  accuracyAfter: decimal("accuracy_after", { precision: 5, scale: 4 }), // 0-1
  improvementRate: decimal("improvement_rate", { precision: 5, scale: 4 }), // -1 to 1
  
  // Performance metrics
  avgProcessingTime: integer("avg_processing_time"), // milliseconds
  errorRate: decimal("error_rate", { precision: 5, scale: 4 }), // 0-1
  
  // Field-specific improvements
  fieldImprovements: jsonb("field_improvements"), // Improvements by field
  categoryImprovements: jsonb("category_improvements"), // Improvements by category
  
  // System health
  systemHealth: jsonb("system_health"), // Overall system health metrics
  regressions: jsonb("regressions"), // Any detected regressions
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// A/B testing table for testing improvements
export const abTests = pgTable("ab_tests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Test identification
  testName: text("test_name").notNull(),
  testDescription: text("test_description"),
  testType: text("test_type").notNull(), // 'pattern', 'threshold', 'weight', 'rule', 'model'
  
  // Test configuration
  variantA: jsonb("variant_a").notNull(), // Control variant
  variantB: jsonb("variant_b").notNull(), // Test variant
  
  // Test parameters
  sampleSize: integer("sample_size").notNull(),
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 4 }).notNull().default("0.95"), // 0-1
  minimumDetectableEffect: decimal("minimum_detectable_effect", { precision: 5, scale: 4 }), // 0-1
  
  // Test status
  status: text("status").notNull().default("draft"), // 'draft', 'running', 'paused', 'completed', 'cancelled'
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  
  // Results
  variantAMetrics: jsonb("variant_a_metrics"), // Performance metrics for variant A
  variantBMetrics: jsonb("variant_b_metrics"), // Performance metrics for variant B
  winner: text("winner"), // 'a', 'b', 'no_difference'
  statisticalSignificance: decimal("statistical_significance", { precision: 5, scale: 4 }), // p-value
  
  // Decision
  decision: text("decision"), // 'adopt_b', 'keep_a', 'continue_testing', 'abandon'
  decisionReason: text("decision_reason"),
  decidedBy: varchar("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  
  // Metadata
  relatedPatternId: varchar("related_pattern_id").references(() => learnedPatterns.id),
  relatedSuggestionId: varchar("related_suggestion_id").references(() => improvementSuggestions.id),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas for Feedback tables
export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  appliedAt: true,
  rejectedAt: true,
});

export const insertLearnedPatternSchema = createInsertSchema(learnedPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  firstSeen: true,
  lastSeen: true,
  activatedAt: true,
  deactivatedAt: true,
});

export const insertImprovementSuggestionSchema = createInsertSchema(improvementSuggestions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
  implementedAt: true,
});

export const insertFeedbackMetricsSchema = createInsertSchema(feedbackMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertAbTestSchema = createInsertSchema(abTests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  endedAt: true,
  decidedAt: true,
});

// Insert schemas for UCC Intelligence tables
export const insertUccStateFormatSchema = createInsertSchema(uccStateFormats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUccIntelligenceSchema = createInsertSchema(uccIntelligence).omit({
  id: true,
  createdAt: true,
  analyzedAt: true,
});

export const insertUccRelationshipSchema = createInsertSchema(uccRelationships).omit({
  id: true,
  createdAt: true,
  discoveredAt: true,
});

// Type exports

// Funding product types
export type InsertFundingProduct = z.infer<typeof insertFundingProductSchema>;
export type FundingProduct = typeof fundingProducts.$inferSelect;

// Company types
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export type InsertLeadBatch = z.infer<typeof insertLeadBatchSchema>;
export type LeadBatch = typeof leadBatches.$inferSelect;

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export type InsertUccFiling = z.infer<typeof insertUccFilingSchema>;
export type UccFiling = typeof uccFilings.$inferSelect;

export type InsertUccMonitoringAlerts = z.infer<typeof insertUccMonitoringAlertsSchema>;
export type UccMonitoringAlerts = typeof uccMonitoringAlerts.$inferSelect;

export type InsertLeadAging = z.infer<typeof insertLeadAgingSchema>;
export type LeadAging = typeof leadAging.$inferSelect;

export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchases.$inferSelect;

export type InsertLeadPerformance = z.infer<typeof insertLeadPerformanceSchema>;
export type LeadPerformance = typeof leadPerformance.$inferSelect;

export type InsertDownloadHistory = z.infer<typeof insertDownloadHistorySchema>;
export type DownloadHistory = typeof downloadHistory.$inferSelect;

// Lead Assignment & Buyer Feedback Type Exports
export type InsertLeadAssignment = z.infer<typeof insertLeadAssignmentSchema>;
export type LeadAssignment = typeof leadAssignments.$inferSelect;

export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;
export type LeadActivity = typeof leadActivities.$inferSelect;

export type InsertBrainConfig = z.infer<typeof insertBrainConfigSchema>;
export type BrainConfig = typeof brainConfig.$inferSelect;

export type InsertSourceStats = z.infer<typeof insertSourceStatsSchema>;
export type SourceStats = typeof sourceStats.$inferSelect;

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

export type InsertEnhancedVerification = z.infer<typeof insertEnhancedVerificationSchema>;
export type EnhancedVerification = typeof enhancedVerification.$inferSelect;

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

export type MarketInsight = typeof marketInsights.$inferSelect;
export type LeadPrediction = typeof leadPredictions.$inferSelect;
export type InsightAlert = typeof insightAlerts.$inferSelect;
export type MarketBenchmark = typeof marketBenchmarks.$inferSelect;

export type InsertInsightReport = z.infer<typeof insertInsightReportSchema>;
export type InsightReport = typeof insightReports.$inferSelect;

export type InsertSmartSearch = z.infer<typeof insertSmartSearchSchema>;
export type SmartSearch = typeof smartSearches.$inferSelect;

export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;

// Feedback system type exports
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export type InsertLearnedPattern = z.infer<typeof insertLearnedPatternSchema>;
export type LearnedPattern = typeof learnedPatterns.$inferSelect;

export type InsertImprovementSuggestion = z.infer<typeof insertImprovementSuggestionSchema>;
export type ImprovementSuggestion = typeof improvementSuggestions.$inferSelect;

export type InsertFeedbackMetrics = z.infer<typeof insertFeedbackMetricsSchema>;
export type FeedbackMetrics = typeof feedbackMetrics.$inferSelect;

export type InsertAbTest = z.infer<typeof insertAbTestSchema>;
export type AbTest = typeof abTests.$inferSelect;

export type InsertPopularSearch = z.infer<typeof insertPopularSearchSchema>;
export type PopularSearch = typeof popularSearches.$inferSelect;

export type InsertSearchSuggestion = z.infer<typeof insertSearchSuggestionSchema>;
export type SearchSuggestion = typeof searchSuggestions.$inferSelect;

export type InsertUccStateFormat = z.infer<typeof insertUccStateFormatSchema>;
export type UccStateFormat = typeof uccStateFormats.$inferSelect;

export type InsertUccIntelligence = z.infer<typeof insertUccIntelligenceSchema>;
export type UccIntelligence = typeof uccIntelligence.$inferSelect;

export type InsertUccRelationship = z.infer<typeof insertUccRelationshipSchema>;
export type UccRelationship = typeof uccRelationships.$inferSelect;

// Master Database and Intelligence Brain type exports
export type InsertMasterDatabaseCache = z.infer<typeof insertMasterDatabaseCacheSchema>;
export type MasterDatabaseCache = typeof masterDatabaseCache.$inferSelect;

export type InsertIntelligenceDecision = z.infer<typeof insertIntelligenceDecisionSchema>;
export type IntelligenceDecision = typeof intelligenceDecisions.$inferSelect;

export type InsertEntityMatch = z.infer<typeof insertEntityMatchSchema>;
export type EntityMatch = typeof entityMatches.$inferSelect;

export type InsertEntityGroup = z.infer<typeof insertEntityGroupSchema>;
export type EntityGroup = typeof entityGroups.$inferSelect;

export type InsertEntityRelationship = z.infer<typeof insertEntityRelationshipSchema>;
export type EntityRelationship = typeof entityRelationships.$inferSelect;

// ========================================
// CRM TYPE EXPORTS
// ========================================

export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;
export type PipelineStage = typeof pipelineStages.$inferSelect;

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

export type InsertReminder = z.infer<typeof insertReminderSchema>;
export type Reminder = typeof reminders.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export type InsertEmailTracking = z.infer<typeof insertEmailTrackingSchema>;
export type EmailTracking = typeof emailTracking.$inferSelect;

export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
export type CallLog = typeof callLogs.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertLeadTag = z.infer<typeof insertLeadTagSchema>;
export type LeadTag = typeof leadTags.$inferSelect;
