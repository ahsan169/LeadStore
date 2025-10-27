import { eq, desc, and, or, sql, inArray, notInArray, gte, lte, like, asc, ne, isNotNull, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  type User,
  type InsertUser,
  type Subscription,
  type InsertSubscription,
  type LeadBatch,
  type InsertLeadBatch,
  type Lead,
  type InsertLead,
  type Purchase,
  type InsertPurchase,
  type LeadPerformance,
  type InsertLeadPerformance,
  type DownloadHistory,
  type InsertDownloadHistory,
  type AiInsight,
  type InsertAiInsight,
  type ProductTier,
  type InsertProductTier,
  type Allocation,
  type InsertAllocation,
  type PricingStrategy,
  type InsertPricingStrategy,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type Credit,
  type InsertCredit,
  type CreditTransaction,
  type InsertCreditTransaction,
  type ContactSubmission,
  type InsertContactSubmission,
  type VerificationSession,
  type InsertVerificationSession,
  type VerificationResult,
  type InsertVerificationResult,
  type CrmIntegration,
  type InsertCrmIntegration,
  type CrmSyncLog,
  type InsertCrmSyncLog,
  type LeadAlert,
  type InsertLeadAlert,
  type AlertHistory,
  type InsertAlertHistory,
  type LeadEnrichment,
  type InsertLeadEnrichment,
  type SavedSearch,
  type InsertSavedSearch,
  type QualityGuarantee,
  type InsertQualityGuarantee,
  users,
  subscriptions,
  leadBatches,
  leads,
  purchases,
  leadPerformance,
  downloadHistory,
  aiInsights,
  productTiers,
  allocations,
  pricingStrategies,
  subscriptionPlans,
  credits,
  creditTransactions,
  contactSubmissions,
  verificationSessions,
  verificationResults,
  crmIntegrations,
  crmSyncLog,
  leadAlerts,
  alertHistory,
  leadEnrichment,
  savedSearches,
  qualityGuarantee,
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllBuyers(): Promise<User[]>;
  
  // Subscription operations
  getSubscription(id: string): Promise<Subscription | undefined>;
  getSubscriptionByUserId(userId: string): Promise<Subscription | undefined>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  
  // Lead batch operations
  getLeadBatch(id: string): Promise<LeadBatch | undefined>;
  getAllLeadBatches(): Promise<LeadBatch[]>;
  createLeadBatch(batch: InsertLeadBatch): Promise<LeadBatch>;
  updateLeadBatch(id: string, data: Partial<InsertLeadBatch>): Promise<LeadBatch | undefined>;
  
  // Lead operations
  getLead(id: string): Promise<Lead | undefined>;
  getLeadsByBatchId(batchId: string): Promise<Lead[]>;
  getAvailableLeadsByTier(tier: string, limit: number): Promise<Lead[]>;
  createLead(lead: InsertLead): Promise<Lead>;
  createLeads(leads: InsertLead[]): Promise<Lead[]>;
  updateLead(id: string, data: Partial<InsertLead>): Promise<Lead | undefined>;
  markLeadsAsSold(leadIds: string[], userId: string): Promise<void>;
  getLeadStats(): Promise<{
    total: number;
    sold: number;
    available: number;
    avgQualityScore: number;
  }>;
  
  // Purchase operations
  getPurchase(id: string): Promise<Purchase | undefined>;
  getPurchasesByUserId(userId: string): Promise<Purchase[]>;
  getAllPurchases(): Promise<Purchase[]>;
  createPurchase(purchase: InsertPurchase): Promise<Purchase>;
  updatePurchase(id: string, data: Partial<InsertPurchase>): Promise<Purchase | undefined>;
  
  // Lead Performance operations
  createLeadPerformance(performance: InsertLeadPerformance): Promise<LeadPerformance>;
  updateLeadPerformance(id: string, data: Partial<InsertLeadPerformance>): Promise<LeadPerformance | undefined>;
  getLeadPerformanceByPurchaseId(purchaseId: string): Promise<LeadPerformance[]>;
  getLeadPerformanceByLeadId(leadId: string): Promise<LeadPerformance | undefined>;
  getLeadPerformanceStats(purchaseId?: string): Promise<{
    totalLeads: number;
    contacted: number;
    qualified: number;
    closedWon: number;
    closedLost: number;
    totalRevenue: number;
    averageConversionRate: number;
    roi: number;
  }>;
  getConversionFunnelData(): Promise<{
    stage: string;
    count: number;
    conversionRate: number;
  }[]>;
  getRoiByTier(): Promise<{
    tier: string;
    totalSpent: number;
    totalRevenue: number;
    roi: number;
    leadCount: number;
  }[]>;
  
  // Download history operations
  createDownloadHistory(history: InsertDownloadHistory): Promise<DownloadHistory>;
  getDownloadHistoryByPurchaseId(purchaseId: string): Promise<DownloadHistory[]>;
  
  // AI insights operations
  getAiInsight(id: string): Promise<AiInsight | undefined>;
  getAiInsightByBatchId(batchId: string): Promise<AiInsight | undefined>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  getAiInsightByLeadId(leadId: string): Promise<AiInsight | undefined>;
  
  // Product tier operations
  getProductTier(id: string): Promise<ProductTier | undefined>;
  getProductTierByTier(tier: string): Promise<ProductTier | undefined>;
  getAllProductTiers(): Promise<ProductTier[]>;
  getActiveProductTiers(): Promise<ProductTier[]>;
  createProductTier(tier: InsertProductTier): Promise<ProductTier>;
  updateProductTier(id: string, data: Partial<InsertProductTier>): Promise<ProductTier | undefined>;
  deleteProductTier(id: string): Promise<void>;
  
  // Allocation operations
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;
  createAllocations(allocs: InsertAllocation[]): Promise<Allocation[]>;
  getUserLeadIds(userId: string): Promise<string[]>;
  getLeadsForPurchase(userId: string, leadCount: number, minQuality: number, maxQuality: number): Promise<Lead[]>;
  
  // Pricing strategy operations
  getPricingStrategy(id: string): Promise<PricingStrategy | undefined>;
  getActivePricingStrategy(): Promise<PricingStrategy | undefined>;
  createPricingStrategy(strategy: InsertPricingStrategy): Promise<PricingStrategy>;
  updatePricingStrategy(id: string, data: Partial<InsertPricingStrategy>): Promise<PricingStrategy | undefined>;
  
  // Subscription plan operations
  getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined>;
  getSubscriptionPlanByTier(tier: string): Promise<SubscriptionPlan | undefined>;
  getAllSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  getActiveSubscriptionPlans(): Promise<SubscriptionPlan[]>;
  createSubscriptionPlan(plan: InsertSubscriptionPlan): Promise<SubscriptionPlan>;
  updateSubscriptionPlan(id: string, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan | undefined>;
  
  // Credit operations
  getUserCredits(userId: string): Promise<Credit | undefined>;
  createUserCredits(credit: InsertCredit): Promise<Credit>;
  updateUserCredits(userId: string, data: Partial<InsertCredit>): Promise<Credit | undefined>;
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getUserCreditTransactions(userId: string): Promise<CreditTransaction[]>;
  
  // Advanced lead queries - 20+ filter criteria
  getFilteredLeads(filters: {
    // Basic filters
    industry?: string[];
    stateCode?: string[];
    city?: string[];
    minQualityScore?: number;
    maxQualityScore?: number;
    
    // Financial filters
    minRevenue?: number;
    maxRevenue?: number;
    fundingStatus?: string[];
    minCreditScore?: number;
    maxCreditScore?: number;
    
    // Business filters
    minTimeInBusiness?: number;
    maxTimeInBusiness?: number;
    employeeCount?: string[];
    businessType?: string[];
    yearFoundedMin?: number;
    yearFoundedMax?: number;
    
    // Contact filters
    hasEmail?: boolean;
    hasPhone?: boolean;
    ownerName?: string;
    
    // Status filters
    exclusivityStatus?: string[];
    previousMCAHistory?: string[];
    urgencyLevel?: string[];
    leadAgeMin?: number;
    leadAgeMax?: number;
    isEnriched?: boolean;
    sold?: boolean;
    
    // Advanced filters
    naicsCode?: string[];
    sicCode?: string[];
    dailyBankDeposits?: boolean;
    hasWebsite?: boolean;
    
    // Pagination and sorting
    limit: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    
    // Logic operator
    logicOperator?: 'AND' | 'OR';
  }): Promise<{ leads: Lead[]; total: number }>;
  
  // Saved searches operations
  createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch>;
  getSavedSearch(id: string): Promise<SavedSearch | undefined>;
  getSavedSearchesByUserId(userId: string): Promise<SavedSearch[]>;
  updateSavedSearch(id: string, data: Partial<InsertSavedSearch>): Promise<SavedSearch | undefined>;
  deleteSavedSearch(id: string): Promise<void>;
  setDefaultSearch(userId: string, searchId: string): Promise<void>;
  updateSearchLastUsed(id: string): Promise<void>;
  
  // Contact submission operations
  createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission>;
  getContactSubmissions(): Promise<ContactSubmission[]>;
  updateContactSubmissionStatus(id: string, status: string): Promise<ContactSubmission | undefined>;
  
  // Quality Guarantee operations
  createQualityGuarantee(guarantee: InsertQualityGuarantee): Promise<QualityGuarantee>;
  getQualityGuaranteeById(id: string): Promise<QualityGuarantee | undefined>;
  getQualityGuaranteesByPurchaseId(purchaseId: string): Promise<QualityGuarantee[]>;
  getQualityGuaranteesByUserId(userId: string): Promise<QualityGuarantee[]>;
  getAllQualityGuarantees(status?: string): Promise<QualityGuarantee[]>;
  updateQualityGuarantee(id: string, data: Partial<InsertQualityGuarantee>): Promise<QualityGuarantee | undefined>;
  resolveQualityGuarantee(id: string, status: string, replacementLeadId?: string, notes?: string, resolvedBy?: string): Promise<QualityGuarantee | undefined>;
  getQualityGuaranteeStats(): Promise<{
    totalReports: number;
    pendingReports: number;
    approvedReports: number;
    rejectedReports: number;
    replacedReports: number;
    averageResolutionTime: number;
  }>;
  
  // Verification session operations
  createVerificationSession(session: InsertVerificationSession): Promise<VerificationSession>;
  getVerificationSession(id: string): Promise<VerificationSession | undefined>;
  updateVerificationSession(id: string, data: Partial<InsertVerificationSession>): Promise<VerificationSession | undefined>;
  deleteExpiredSessions(): Promise<void>;
  
  // Verification result operations
  createVerificationResult(result: InsertVerificationResult): Promise<VerificationResult>;
  createVerificationResults(results: InsertVerificationResult[]): Promise<VerificationResult[]>;
  getVerificationResults(sessionId: string): Promise<VerificationResult[]>;
  updateVerificationResult(id: string, data: Partial<InsertVerificationResult>): Promise<VerificationResult | undefined>;
  updateSelectedForImport(sessionId: string, rowNumbers: number[]): Promise<void>;
  
  // Duplicate detection
  checkPhoneDuplicate(phone: string): Promise<Lead | undefined>;
  checkBusinessNameDuplicate(businessName: string): Promise<Lead | undefined>;
  
  // CRM Integration operations
  getCrmIntegration(id: string): Promise<CrmIntegration | undefined>;
  getCrmIntegrationsByUserId(userId: string): Promise<CrmIntegration[]>;
  createCrmIntegration(integration: InsertCrmIntegration): Promise<CrmIntegration>;
  updateCrmIntegration(id: string, data: Partial<InsertCrmIntegration>): Promise<CrmIntegration | undefined>;
  deleteCrmIntegration(id: string): Promise<void>;
  
  // CRM Sync Log operations
  createCrmSyncLog(log: InsertCrmSyncLog): Promise<CrmSyncLog>;
  getCrmSyncLogsByIntegrationId(integrationId: string): Promise<CrmSyncLog[]>;
  getCrmSyncLogsByPurchaseId(purchaseId: string): Promise<CrmSyncLog[]>;
  updateCrmSyncLogStatus(id: string, status: string, errorMessage?: string): Promise<CrmSyncLog | undefined>;
  getLatestSyncLog(integrationId: string): Promise<CrmSyncLog | undefined>;
  
  // Lead Alert operations
  createLeadAlert(alert: InsertLeadAlert): Promise<LeadAlert>;
  getLeadAlert(id: string): Promise<LeadAlert | undefined>;
  getLeadAlertsByUserId(userId: string): Promise<LeadAlert[]>;
  updateLeadAlert(id: string, data: Partial<InsertLeadAlert>): Promise<LeadAlert | undefined>;
  deleteLeadAlert(id: string): Promise<void>;
  getActiveAlerts(): Promise<LeadAlert[]>;
  
  // Alert History operations
  createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory>;
  getAlertHistory(id: string): Promise<AlertHistory | undefined>;
  getAlertHistoryByAlertId(alertId: string): Promise<AlertHistory[]>;
  getAlertHistoryByBatchId(batchId: string): Promise<AlertHistory[]>;
  markAlertHistoryViewed(id: string): Promise<void>;
  getUnviewedAlertsCount(userId: string): Promise<number>;
  
  // Lead Enrichment operations
  createLeadEnrichment(enrichment: InsertLeadEnrichment): Promise<LeadEnrichment>;
  createLeadEnrichments(enrichments: InsertLeadEnrichment[]): Promise<LeadEnrichment[]>;
  getLeadEnrichment(leadId: string): Promise<LeadEnrichment | undefined>;
  getLeadEnrichmentsByBatchId(batchId: string): Promise<LeadEnrichment[]>;
  updateLeadEnrichment(leadId: string, data: Partial<InsertLeadEnrichment>): Promise<LeadEnrichment | undefined>;
  deleteLeadEnrichment(leadId: string): Promise<void>;
  getEnrichmentStats(): Promise<{
    totalEnriched: number;
    averageConfidence: number;
    sourceBreakdown: Record<string, number>;
  }>;
}

export class DbStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async getAllBuyers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, "buyer"));
  }

  // Subscription operations
  async getSubscription(id: string): Promise<Subscription | undefined> {
    const result = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    return result[0];
  }

  async getSubscriptionByUserId(userId: string): Promise<Subscription | undefined> {
    const result = await db.select().from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return result[0];
  }

  async createSubscription(subscription: InsertSubscription): Promise<Subscription> {
    const result = await db.insert(subscriptions).values(subscription).returning();
    return result[0];
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const result = await db.update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return result[0];
  }

  // Lead batch operations
  async getLeadBatch(id: string): Promise<LeadBatch | undefined> {
    const result = await db.select().from(leadBatches).where(eq(leadBatches.id, id)).limit(1);
    return result[0];
  }

  async getAllLeadBatches(): Promise<LeadBatch[]> {
    return db.select().from(leadBatches).orderBy(desc(leadBatches.uploadedAt));
  }

  async createLeadBatch(batch: InsertLeadBatch): Promise<LeadBatch> {
    const result = await db.insert(leadBatches).values(batch).returning();
    return result[0];
  }

  async updateLeadBatch(id: string, data: Partial<InsertLeadBatch>): Promise<LeadBatch | undefined> {
    const result = await db.update(leadBatches)
      .set(data)
      .where(eq(leadBatches.id, id))
      .returning();
    return result[0];
  }

  // Lead operations
  async getLead(id: string): Promise<Lead | undefined> {
    const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return result[0];
  }

  async getLeadsByBatchId(batchId: string): Promise<Lead[]> {
    return db.select().from(leads).where(eq(leads.batchId, batchId));
  }

  async getAvailableLeadsByTier(tier: string, limit: number): Promise<Lead[]> {
    // Map tier to quality score ranges
    let minQuality: number;
    let maxQuality: number;
    
    switch(tier) {
      case 'gold':
        minQuality = 60;
        maxQuality = 69;
        break;
      case 'platinum':
        minQuality = 70;
        maxQuality = 79;
        break;
      case 'diamond':
        minQuality = 80;
        maxQuality = 100;
        break;
      default:
        // If tier is not recognized, fallback to exact tier match
        return db.select().from(leads)
          .where(and(
            eq(leads.sold, false),
            eq(leads.tier, tier)
          ))
          .orderBy(desc(leads.qualityScore))
          .limit(limit);
    }
    
    // Filter by quality score range and availability
    return db.select().from(leads)
      .where(and(
        eq(leads.sold, false),
        gte(leads.qualityScore, minQuality),
        lte(leads.qualityScore, maxQuality)
      ))
      .orderBy(desc(leads.qualityScore))
      .limit(limit);
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    const result = await db.insert(leads).values(lead).returning();
    return result[0];
  }

  async createLeads(leadsData: InsertLead[]): Promise<Lead[]> {
    if (leadsData.length === 0) return [];
    const result = await db.insert(leads).values(leadsData).returning();
    return result;
  }

  async updateLead(id: string, data: Partial<InsertLead>): Promise<Lead | undefined> {
    const result = await db.update(leads)
      .set(data)
      .where(eq(leads.id, id))
      .returning();
    return result[0];
  }

  async markLeadsAsSold(leadIds: string[], userId: string): Promise<void> {
    await db.update(leads)
      .set({
        sold: true,
        soldTo: userId,
        soldAt: new Date(),
      })
      .where(inArray(leads.id, leadIds));
  }

  async getLeadStats(): Promise<{
    total: number;
    sold: number;
    available: number;
    avgQualityScore: number;
  }> {
    const result = await db.select({
      total: sql<number>`count(*)::int`,
      sold: sql<number>`count(*) filter (where ${leads.sold} = true)::int`,
      available: sql<number>`count(*) filter (where ${leads.sold} = false)::int`,
      avgQualityScore: sql<number>`avg(${leads.qualityScore})::numeric`,
    }).from(leads);

    return {
      total: result[0]?.total || 0,
      sold: result[0]?.sold || 0,
      available: result[0]?.available || 0,
      avgQualityScore: Number(result[0]?.avgQualityScore || 0),
    };
  }

  // Purchase operations
  async getPurchase(id: string): Promise<Purchase | undefined> {
    const result = await db.select().from(purchases).where(eq(purchases.id, id)).limit(1);
    return result[0];
  }

  async getPurchasesByUserId(userId: string): Promise<Purchase[]> {
    return db.select().from(purchases)
      .where(eq(purchases.userId, userId))
      .orderBy(desc(purchases.createdAt));
  }

  async getAllPurchases(): Promise<Purchase[]> {
    return db.select().from(purchases).orderBy(desc(purchases.createdAt));
  }

  async createPurchase(purchase: InsertPurchase): Promise<Purchase> {
    const result = await db.insert(purchases).values(purchase).returning();
    return result[0];
  }

  async updatePurchase(id: string, data: Partial<InsertPurchase>): Promise<Purchase | undefined> {
    const result = await db.update(purchases)
      .set(data)
      .where(eq(purchases.id, id))
      .returning();
    return result[0];
  }

  // Lead Performance operations
  async createLeadPerformance(performance: InsertLeadPerformance): Promise<LeadPerformance> {
    const result = await db.insert(leadPerformance).values(performance).returning();
    return result[0];
  }

  async updateLeadPerformance(id: string, data: Partial<InsertLeadPerformance>): Promise<LeadPerformance | undefined> {
    const result = await db.update(leadPerformance)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(leadPerformance.id, id))
      .returning();
    return result[0];
  }

  async getLeadPerformanceByPurchaseId(purchaseId: string): Promise<LeadPerformance[]> {
    return db.select().from(leadPerformance)
      .where(eq(leadPerformance.purchaseId, purchaseId))
      .orderBy(desc(leadPerformance.createdAt));
  }

  async getLeadPerformanceByLeadId(leadId: string): Promise<LeadPerformance | undefined> {
    const result = await db.select().from(leadPerformance)
      .where(eq(leadPerformance.leadId, leadId))
      .limit(1);
    return result[0];
  }

  async getLeadPerformanceStats(purchaseId?: string): Promise<{
    totalLeads: number;
    contacted: number;
    qualified: number;
    closedWon: number;
    closedLost: number;
    totalRevenue: number;
    averageConversionRate: number;
    roi: number;
  }> {
    let query = db.select({
      totalLeads: sql<number>`count(distinct ${leadPerformance.leadId})::int`,
      contacted: sql<number>`count(*) filter (where ${leadPerformance.status} in ('contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'))::int`,
      qualified: sql<number>`count(*) filter (where ${leadPerformance.status} in ('qualified', 'proposal', 'closed_won', 'closed_lost'))::int`,
      closedWon: sql<number>`count(*) filter (where ${leadPerformance.status} = 'closed_won')::int`,
      closedLost: sql<number>`count(*) filter (where ${leadPerformance.status} = 'closed_lost')::int`,
      totalRevenue: sql<number>`COALESCE(sum(${leadPerformance.dealAmount}), 0)::numeric`,
    }).from(leadPerformance);

    if (purchaseId) {
      query = query.where(eq(leadPerformance.purchaseId, purchaseId));
    }

    const [stats] = await query;
    const conversionRate = stats.totalLeads > 0 
      ? (stats.closedWon / stats.totalLeads) * 100 
      : 0;

    // Get total spent for ROI calculation
    let totalSpent = 0;
    if (purchaseId) {
      const purchase = await this.getPurchase(purchaseId);
      totalSpent = Number(purchase?.totalAmount || 0);
    } else {
      const purchaseData = await db.select({
        totalSpent: sql<number>`sum(${purchases.totalAmount})::numeric`
      }).from(purchases);
      totalSpent = Number(purchaseData[0]?.totalSpent || 0);
    }

    const roi = totalSpent > 0 
      ? ((Number(stats.totalRevenue) - totalSpent) / totalSpent) * 100 
      : 0;

    return {
      totalLeads: stats.totalLeads || 0,
      contacted: stats.contacted || 0,
      qualified: stats.qualified || 0,
      closedWon: stats.closedWon || 0,
      closedLost: stats.closedLost || 0,
      totalRevenue: Number(stats.totalRevenue || 0),
      averageConversionRate: conversionRate,
      roi: roi
    };
  }

  async getConversionFunnelData(): Promise<{
    stage: string;
    count: number;
    conversionRate: number;
  }[]> {
    const stages = [
      { name: 'Total Leads', status: ['new', 'contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'] },
      { name: 'Contacted', status: ['contacted', 'qualified', 'proposal', 'closed_won', 'closed_lost'] },
      { name: 'Qualified', status: ['qualified', 'proposal', 'closed_won', 'closed_lost'] },
      { name: 'Proposal', status: ['proposal', 'closed_won', 'closed_lost'] },
      { name: 'Closed Won', status: ['closed_won'] },
    ];

    const results = [];
    let totalLeads = 0;

    for (const stage of stages) {
      const [count] = await db.select({
        count: sql<number>`count(distinct ${leadPerformance.leadId})::int`
      })
      .from(leadPerformance)
      .where(inArray(leadPerformance.status, stage.status));

      if (stage.name === 'Total Leads') {
        totalLeads = count.count;
      }

      results.push({
        stage: stage.name,
        count: count.count,
        conversionRate: totalLeads > 0 ? (count.count / totalLeads) * 100 : 0
      });
    }

    return results;
  }

  async getRoiByTier(): Promise<{
    tier: string;
    totalSpent: number;
    totalRevenue: number;
    roi: number;
    leadCount: number;
  }[]> {
    const results = await db.select({
      tier: purchases.tier,
      totalSpent: sql<number>`sum(${purchases.totalAmount})::numeric`,
      totalRevenue: sql<number>`COALESCE(sum(${leadPerformance.dealAmount}), 0)::numeric`,
      leadCount: sql<number>`count(distinct ${leadPerformance.leadId})::int`,
    })
    .from(purchases)
    .leftJoin(leadPerformance, eq(leadPerformance.purchaseId, purchases.id))
    .groupBy(purchases.tier);

    return results.map(row => ({
      tier: row.tier,
      totalSpent: Number(row.totalSpent || 0),
      totalRevenue: Number(row.totalRevenue || 0),
      roi: Number(row.totalSpent || 0) > 0 
        ? ((Number(row.totalRevenue || 0) - Number(row.totalSpent || 0)) / Number(row.totalSpent || 0)) * 100 
        : 0,
      leadCount: row.leadCount || 0
    }));
  }

  // Download history operations
  async createDownloadHistory(history: InsertDownloadHistory): Promise<DownloadHistory> {
    const result = await db.insert(downloadHistory).values(history).returning();
    return result[0];
  }

  async getDownloadHistoryByPurchaseId(purchaseId: string): Promise<DownloadHistory[]> {
    return db.select().from(downloadHistory)
      .where(eq(downloadHistory.purchaseId, purchaseId))
      .orderBy(desc(downloadHistory.downloadedAt));
  }

  // AI insights operations
  async getAiInsight(id: string): Promise<AiInsight | undefined> {
    const result = await db.select().from(aiInsights).where(eq(aiInsights.id, id)).limit(1);
    return result[0];
  }

  async getAiInsightByBatchId(batchId: string): Promise<AiInsight | undefined> {
    const result = await db.select().from(aiInsights)
      .where(eq(aiInsights.batchId, batchId))
      .orderBy(desc(aiInsights.generatedAt))
      .limit(1);
    return result[0];
  }

  async createAiInsight(insight: InsertAiInsight): Promise<AiInsight> {
    const result = await db.insert(aiInsights).values(insight).returning();
    return result[0];
  }

  async getAiInsightByLeadId(leadId: string): Promise<AiInsight | undefined> {
    // For lead-specific insights, we'll store the leadId in the referenceId field of the insight
    const result = await db.select().from(aiInsights)
      .where(sql`${aiInsights.segments}->>'leadId' = ${leadId}`)
      .orderBy(desc(aiInsights.generatedAt))
      .limit(1);
    return result[0];
  }

  // Product tier operations
  async getProductTier(id: string): Promise<ProductTier | undefined> {
    const result = await db.select().from(productTiers).where(eq(productTiers.id, id)).limit(1);
    return result[0];
  }

  async getProductTierByTier(tier: string): Promise<ProductTier | undefined> {
    const result = await db.select().from(productTiers).where(eq(productTiers.tier, tier)).limit(1);
    return result[0];
  }

  async getAllProductTiers(): Promise<ProductTier[]> {
    return db.select().from(productTiers).orderBy(productTiers.price);
  }

  async getActiveProductTiers(): Promise<ProductTier[]> {
    return db.select().from(productTiers)
      .where(eq(productTiers.active, true))
      .orderBy(productTiers.price);
  }

  async createProductTier(tier: InsertProductTier): Promise<ProductTier> {
    const result = await db.insert(productTiers).values(tier).returning();
    return result[0];
  }

  async updateProductTier(id: string, data: Partial<InsertProductTier>): Promise<ProductTier | undefined> {
    const result = await db.update(productTiers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productTiers.id, id))
      .returning();
    return result[0];
  }

  async deleteProductTier(id: string): Promise<void> {
    await db.update(productTiers)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(productTiers.id, id));
  }

  // Allocation operations
  async createAllocation(allocation: InsertAllocation): Promise<Allocation> {
    const result = await db.insert(allocations).values(allocation).returning();
    return result[0];
  }

  async createAllocations(allocs: InsertAllocation[]): Promise<Allocation[]> {
    if (allocs.length === 0) return [];
    const result = await db.insert(allocations).values(allocs).returning();
    return result;
  }

  async getUserLeadIds(userId: string): Promise<string[]> {
    const result = await db.select({ leadId: allocations.leadId })
      .from(allocations)
      .where(eq(allocations.userId, userId));
    return result.map(r => r.leadId);
  }

  async getLeadsForPurchase(
    userId: string,
    leadCount: number,
    minQuality: number,
    maxQuality: number
  ): Promise<Lead[]> {
    // Get lead IDs already purchased by this user
    const userLeadIds = await this.getUserLeadIds(userId);

    // Build query conditions
    const conditions = [
      eq(leads.sold, false),
      gte(leads.qualityScore, minQuality),
      lte(leads.qualityScore, maxQuality),
    ];

    // Exclude leads already purchased by this user
    if (userLeadIds.length > 0) {
      conditions.push(notInArray(leads.id, userLeadIds));
    }

    // Query for available leads
    const availableLeads = await db.select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.qualityScore))
      .limit(leadCount);

    return availableLeads;
  }

  // Advanced lead queries - 20+ filter criteria
  async getFilteredLeads(filters: {
    // Basic filters
    industry?: string[];
    stateCode?: string[];
    city?: string[];
    minQualityScore?: number;
    maxQualityScore?: number;
    
    // Financial filters
    minRevenue?: number;
    maxRevenue?: number;
    fundingStatus?: string[];
    minCreditScore?: number;
    maxCreditScore?: number;
    
    // Business filters
    minTimeInBusiness?: number;
    maxTimeInBusiness?: number;
    employeeCount?: string[];
    businessType?: string[];
    yearFoundedMin?: number;
    yearFoundedMax?: number;
    
    // Contact filters
    hasEmail?: boolean;
    hasPhone?: boolean;
    ownerName?: string;
    
    // Status filters
    exclusivityStatus?: string[];
    previousMCAHistory?: string[];
    urgencyLevel?: string[];
    leadAgeMin?: number;
    leadAgeMax?: number;
    isEnriched?: boolean;
    sold?: boolean;
    
    // Advanced filters
    naicsCode?: string[];
    sicCode?: string[];
    dailyBankDeposits?: boolean;
    hasWebsite?: boolean;
    
    // Pagination and sorting
    limit: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    
    // Logic operator
    logicOperator?: 'AND' | 'OR';
  }): Promise<{ leads: Lead[]; total: number }> {
    const conditions = [];
    
    // Basic filters
    if (filters.industry?.length) {
      conditions.push(inArray(leads.industry, filters.industry));
    }
    if (filters.stateCode?.length) {
      conditions.push(inArray(leads.stateCode, filters.stateCode));
    }
    if (filters.city?.length) {
      // Use LIKE for city filtering to be case-insensitive
      const cityConditions = filters.city.map(city => 
        like(leads.address, `%${city}%`)
      );
      conditions.push(or(...cityConditions));
    }
    if (filters.minQualityScore !== undefined) {
      conditions.push(gte(leads.qualityScore, filters.minQualityScore));
    }
    if (filters.maxQualityScore !== undefined) {
      conditions.push(lte(leads.qualityScore, filters.maxQualityScore));
    }
    
    // Financial filters
    if (filters.minRevenue !== undefined) {
      conditions.push(gte(leads.annualRevenue, filters.minRevenue.toString()));
    }
    if (filters.maxRevenue !== undefined) {
      conditions.push(lte(leads.annualRevenue, filters.maxRevenue.toString()));
    }
    if (filters.minCreditScore !== undefined) {
      conditions.push(gte(leads.creditScore, filters.minCreditScore.toString()));
    }
    if (filters.maxCreditScore !== undefined) {
      conditions.push(lte(leads.creditScore, filters.maxCreditScore.toString()));
    }
    
    // Business filters
    if (filters.minTimeInBusiness !== undefined) {
      conditions.push(gte(leads.timeInBusiness, filters.minTimeInBusiness.toString()));
    }
    if (filters.maxTimeInBusiness !== undefined) {
      conditions.push(lte(leads.timeInBusiness, filters.maxTimeInBusiness.toString()));
    }
    if (filters.employeeCount?.length) {
      conditions.push(inArray(leads.companySize, filters.employeeCount));
    }
    if (filters.yearFoundedMin !== undefined) {
      conditions.push(gte(leads.yearFounded, filters.yearFoundedMin));
    }
    if (filters.yearFoundedMax !== undefined) {
      conditions.push(lte(leads.yearFounded, filters.yearFoundedMax));
    }
    
    // Contact filters
    if (filters.hasEmail === true) {
      conditions.push(and(isNotNull(leads.email), ne(leads.email, '')));
    } else if (filters.hasEmail === false) {
      conditions.push(or(isNull(leads.email), eq(leads.email, '')));
    }
    if (filters.hasPhone === true) {
      conditions.push(and(isNotNull(leads.phone), ne(leads.phone, '')));
    } else if (filters.hasPhone === false) {
      conditions.push(or(isNull(leads.phone), eq(leads.phone, '')));
    }
    if (filters.ownerName) {
      conditions.push(like(leads.ownerName, `%${filters.ownerName}%`));
    }
    
    // Status filters
    if (filters.exclusivityStatus?.length) {
      conditions.push(inArray(leads.exclusivityStatus, filters.exclusivityStatus));
    }
    if (filters.previousMCAHistory?.length) {
      conditions.push(inArray(leads.previousMCAHistory, filters.previousMCAHistory));
    }
    if (filters.urgencyLevel?.length) {
      conditions.push(inArray(leads.urgencyLevel, filters.urgencyLevel));
    }
    if (filters.leadAgeMin !== undefined) {
      conditions.push(gte(leads.leadAge, filters.leadAgeMin));
    }
    if (filters.leadAgeMax !== undefined) {
      conditions.push(lte(leads.leadAge, filters.leadAgeMax));
    }
    if (filters.isEnriched !== undefined) {
      conditions.push(eq(leads.isEnriched, filters.isEnriched));
    }
    if (filters.sold !== undefined) {
      conditions.push(eq(leads.sold, filters.sold));
    }
    
    // Advanced filters
    if (filters.naicsCode?.length) {
      conditions.push(inArray(leads.naicsCode, filters.naicsCode));
    }
    if (filters.dailyBankDeposits !== undefined) {
      conditions.push(eq(leads.dailyBankDeposits, filters.dailyBankDeposits));
    }
    if (filters.hasWebsite === true) {
      conditions.push(and(isNotNull(leads.websiteUrl), ne(leads.websiteUrl, '')));
    } else if (filters.hasWebsite === false) {
      conditions.push(or(isNull(leads.websiteUrl), eq(leads.websiteUrl, '')));
    }
    
    // Build where clause with AND/OR logic
    const whereClause = conditions.length > 0 
      ? (filters.logicOperator === 'OR' ? or(...conditions) : and(...conditions))
      : undefined;
    
    // Build sort order
    const sortColumn = filters.sortBy ? (leads as any)[filters.sortBy] : leads.createdAt;
    const sortDirection = filters.sortOrder === 'asc' ? asc : desc;
    
    // Get total count
    const countQuery = await db.select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(whereClause);
    const total = countQuery[0]?.count || 0;
    
    // Get paginated results
    let query = db.select().from(leads).where(whereClause);
    
    query = query.orderBy(sortDirection(sortColumn));
    query = query.limit(filters.limit);
    
    if (filters.offset !== undefined) {
      query = query.offset(filters.offset);
    }
    
    const leadsResult = await query;
    
    return { leads: leadsResult, total };
  }
  
  // Saved searches operations
  async createSavedSearch(search: InsertSavedSearch): Promise<SavedSearch> {
    const result = await db.insert(savedSearches).values(search).returning();
    return result[0];
  }
  
  async getSavedSearch(id: string): Promise<SavedSearch | undefined> {
    const result = await db.select().from(savedSearches).where(eq(savedSearches.id, id)).limit(1);
    return result[0];
  }
  
  async getSavedSearchesByUserId(userId: string): Promise<SavedSearch[]> {
    return db.select().from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.lastUsedAt), desc(savedSearches.createdAt));
  }
  
  async updateSavedSearch(id: string, data: Partial<InsertSavedSearch>): Promise<SavedSearch | undefined> {
    const result = await db.update(savedSearches)
      .set(data)
      .where(eq(savedSearches.id, id))
      .returning();
    return result[0];
  }
  
  async deleteSavedSearch(id: string): Promise<void> {
    await db.delete(savedSearches).where(eq(savedSearches.id, id));
  }
  
  async setDefaultSearch(userId: string, searchId: string): Promise<void> {
    // First, unset all defaults for this user
    await db.update(savedSearches)
      .set({ isDefault: false })
      .where(eq(savedSearches.userId, userId));
    
    // Then set the new default
    await db.update(savedSearches)
      .set({ isDefault: true })
      .where(and(
        eq(savedSearches.id, searchId),
        eq(savedSearches.userId, userId)
      ));
  }
  
  async updateSearchLastUsed(id: string): Promise<void> {
    await db.update(savedSearches)
      .set({ lastUsedAt: new Date() })
      .where(eq(savedSearches.id, id));
  }

  // Contact submission operations
  async createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission> {
    const result = await db.insert(contactSubmissions).values(submission).returning();
    return result[0];
  }

  async getContactSubmissions(): Promise<ContactSubmission[]> {
    return db.select().from(contactSubmissions).orderBy(desc(contactSubmissions.createdAt));
  }

  async updateContactSubmissionStatus(id: string, status: string): Promise<ContactSubmission | undefined> {
    const result = await db.update(contactSubmissions)
      .set({ status })
      .where(eq(contactSubmissions.id, id))
      .returning();
    return result[0];
  }

  // Quality Guarantee operations
  async createQualityGuarantee(guarantee: InsertQualityGuarantee): Promise<QualityGuarantee> {
    const result = await db.insert(qualityGuarantee).values(guarantee).returning();
    return result[0];
  }

  async getQualityGuaranteeById(id: string): Promise<QualityGuarantee | undefined> {
    const result = await db.select().from(qualityGuarantee).where(eq(qualityGuarantee.id, id)).limit(1);
    return result[0];
  }

  async getQualityGuaranteesByPurchaseId(purchaseId: string): Promise<QualityGuarantee[]> {
    return db.select().from(qualityGuarantee)
      .where(eq(qualityGuarantee.purchaseId, purchaseId))
      .orderBy(desc(qualityGuarantee.reportedAt));
  }

  async getQualityGuaranteesByUserId(userId: string): Promise<QualityGuarantee[]> {
    return db.select().from(qualityGuarantee)
      .where(eq(qualityGuarantee.userId, userId))
      .orderBy(desc(qualityGuarantee.reportedAt));
  }

  async getAllQualityGuarantees(status?: string): Promise<QualityGuarantee[]> {
    if (status) {
      return db.select().from(qualityGuarantee)
        .where(eq(qualityGuarantee.status, status))
        .orderBy(desc(qualityGuarantee.reportedAt));
    }
    return db.select().from(qualityGuarantee)
      .orderBy(desc(qualityGuarantee.reportedAt));
  }

  async updateQualityGuarantee(id: string, data: Partial<InsertQualityGuarantee>): Promise<QualityGuarantee | undefined> {
    const result = await db.update(qualityGuarantee)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(qualityGuarantee.id, id))
      .returning();
    return result[0];
  }

  async resolveQualityGuarantee(
    id: string, 
    status: string, 
    replacementLeadId?: string, 
    notes?: string, 
    resolvedBy?: string
  ): Promise<QualityGuarantee | undefined> {
    const updateData: any = {
      status,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    };
    if (replacementLeadId) updateData.replacementLeadId = replacementLeadId;
    if (notes) updateData.resolutionNotes = notes;
    if (resolvedBy) updateData.resolvedBy = resolvedBy;

    const result = await db.update(qualityGuarantee)
      .set(updateData)
      .where(eq(qualityGuarantee.id, id))
      .returning();
    return result[0];
  }

  async getQualityGuaranteeStats(): Promise<{
    totalReports: number;
    pendingReports: number;
    approvedReports: number;
    rejectedReports: number;
    replacedReports: number;
    averageResolutionTime: number;
  }> {
    const reports = await db.select().from(qualityGuarantee);
    const pendingReports = reports.filter(r => r.status === 'pending').length;
    const approvedReports = reports.filter(r => r.status === 'approved').length;
    const rejectedReports = reports.filter(r => r.status === 'rejected').length;
    const replacedReports = reports.filter(r => r.status === 'replaced').length;

    // Calculate average resolution time for resolved reports
    const resolvedReports = reports.filter(r => r.resolvedAt && r.reportedAt);
    let averageResolutionTime = 0;
    if (resolvedReports.length > 0) {
      const totalTime = resolvedReports.reduce((sum, report) => {
        const timeDiff = new Date(report.resolvedAt!).getTime() - new Date(report.reportedAt).getTime();
        return sum + timeDiff;
      }, 0);
      averageResolutionTime = totalTime / resolvedReports.length / (1000 * 60 * 60); // Convert to hours
    }

    return {
      totalReports: reports.length,
      pendingReports,
      approvedReports,
      rejectedReports,
      replacedReports,
      averageResolutionTime,
    };
  }

  // Verification session operations
  async createVerificationSession(session: InsertVerificationSession): Promise<VerificationSession> {
    const result = await db.insert(verificationSessions).values(session).returning();
    return result[0];
  }

  async getVerificationSession(id: string): Promise<VerificationSession | undefined> {
    const result = await db.select().from(verificationSessions).where(eq(verificationSessions.id, id)).limit(1);
    return result[0];
  }

  async updateVerificationSession(id: string, data: Partial<InsertVerificationSession>): Promise<VerificationSession | undefined> {
    const result = await db.update(verificationSessions)
      .set(data)
      .where(eq(verificationSessions.id, id))
      .returning();
    return result[0];
  }

  async deleteExpiredSessions(): Promise<void> {
    await db.delete(verificationSessions)
      .where(lte(verificationSessions.expiresAt, new Date()));
  }

  // Verification result operations
  async createVerificationResult(result: InsertVerificationResult): Promise<VerificationResult> {
    const [created] = await db.insert(verificationResults).values(result).returning();
    return created;
  }

  async createVerificationResults(results: InsertVerificationResult[]): Promise<VerificationResult[]> {
    if (results.length === 0) return [];
    const created = await db.insert(verificationResults).values(results).returning();
    return created;
  }

  async getVerificationResults(sessionId: string): Promise<VerificationResult[]> {
    return db.select().from(verificationResults)
      .where(eq(verificationResults.sessionId, sessionId))
      .orderBy(verificationResults.rowNumber);
  }

  async updateVerificationResult(id: string, data: Partial<InsertVerificationResult>): Promise<VerificationResult | undefined> {
    const result = await db.update(verificationResults)
      .set(data)
      .where(eq(verificationResults.id, id))
      .returning();
    return result[0];
  }

  async updateSelectedForImport(sessionId: string, rowNumbers: number[]): Promise<void> {
    // First set all to false
    await db.update(verificationResults)
      .set({ selectedForImport: false })
      .where(eq(verificationResults.sessionId, sessionId));
    
    // Then set selected ones to true
    if (rowNumbers.length > 0) {
      await db.update(verificationResults)
        .set({ selectedForImport: true })
        .where(and(
          eq(verificationResults.sessionId, sessionId),
          inArray(verificationResults.rowNumber, rowNumbers)
        ));
    }
  }

  // Duplicate detection
  async checkPhoneDuplicate(phone: string): Promise<Lead | undefined> {
    const cleanPhone = phone.replace(/\D/g, ''); // Remove non-digits
    const result = await db.select().from(leads)
      .where(sql`replace(${leads.phone}, '[^0-9]', '') = ${cleanPhone}`)
      .limit(1);
    return result[0];
  }

  async checkBusinessNameDuplicate(businessName: string): Promise<Lead | undefined> {
    const normalizedName = businessName.toLowerCase().trim();
    const result = await db.select().from(leads)
      .where(sql`lower(trim(${leads.businessName})) = ${normalizedName}`)
      .limit(1);
    return result[0];
  }

  // CRM Integration operations
  async getCrmIntegration(id: string): Promise<CrmIntegration | undefined> {
    const result = await db.select().from(crmIntegrations)
      .where(eq(crmIntegrations.id, id))
      .limit(1);
    return result[0];
  }

  async getCrmIntegrationsByUserId(userId: string): Promise<CrmIntegration[]> {
    return db.select().from(crmIntegrations)
      .where(eq(crmIntegrations.userId, userId))
      .orderBy(desc(crmIntegrations.createdAt));
  }

  async createCrmIntegration(integration: InsertCrmIntegration): Promise<CrmIntegration> {
    const [created] = await db.insert(crmIntegrations).values(integration).returning();
    return created;
  }

  async updateCrmIntegration(id: string, data: Partial<InsertCrmIntegration>): Promise<CrmIntegration | undefined> {
    const result = await db.update(crmIntegrations)
      .set(data)
      .where(eq(crmIntegrations.id, id))
      .returning();
    return result[0];
  }

  async deleteCrmIntegration(id: string): Promise<void> {
    await db.delete(crmIntegrations).where(eq(crmIntegrations.id, id));
  }

  // CRM Sync Log operations
  async createCrmSyncLog(log: InsertCrmSyncLog): Promise<CrmSyncLog> {
    const [created] = await db.insert(crmSyncLog).values(log).returning();
    return created;
  }

  async getCrmSyncLogsByIntegrationId(integrationId: string): Promise<CrmSyncLog[]> {
    return db.select().from(crmSyncLog)
      .where(eq(crmSyncLog.integrationId, integrationId))
      .orderBy(desc(crmSyncLog.syncedAt));
  }

  async getCrmSyncLogsByPurchaseId(purchaseId: string): Promise<CrmSyncLog[]> {
    return db.select().from(crmSyncLog)
      .where(eq(crmSyncLog.purchaseId, purchaseId))
      .orderBy(desc(crmSyncLog.syncedAt));
  }

  async updateCrmSyncLogStatus(id: string, status: string, errorMessage?: string): Promise<CrmSyncLog | undefined> {
    const data: any = { status };
    if (errorMessage) data.errorMessage = errorMessage;
    
    const result = await db.update(crmSyncLog)
      .set(data)
      .where(eq(crmSyncLog.id, id))
      .returning();
    return result[0];
  }

  async getLatestSyncLog(integrationId: string): Promise<CrmSyncLog | undefined> {
    const result = await db.select().from(crmSyncLog)
      .where(eq(crmSyncLog.integrationId, integrationId))
      .orderBy(desc(crmSyncLog.syncedAt))
      .limit(1);
    return result[0];
  }
  
  // Lead Alert operations
  async createLeadAlert(alert: InsertLeadAlert): Promise<LeadAlert> {
    const result = await db.insert(leadAlerts).values(alert).returning();
    return result[0];
  }
  
  async getLeadAlert(id: string): Promise<LeadAlert | undefined> {
    const result = await db.select().from(leadAlerts).where(eq(leadAlerts.id, id)).limit(1);
    return result[0];
  }
  
  async getLeadAlertsByUserId(userId: string): Promise<LeadAlert[]> {
    return db.select().from(leadAlerts)
      .where(eq(leadAlerts.userId, userId))
      .orderBy(desc(leadAlerts.createdAt));
  }
  
  async updateLeadAlert(id: string, data: Partial<InsertLeadAlert>): Promise<LeadAlert | undefined> {
    const result = await db.update(leadAlerts)
      .set(data)
      .where(eq(leadAlerts.id, id))
      .returning();
    return result[0];
  }
  
  async deleteLeadAlert(id: string): Promise<void> {
    await db.delete(leadAlerts).where(eq(leadAlerts.id, id));
  }
  
  async getActiveAlerts(): Promise<LeadAlert[]> {
    return db.select().from(leadAlerts)
      .where(eq(leadAlerts.isActive, true))
      .orderBy(desc(leadAlerts.createdAt));
  }
  
  // Alert History operations
  async createAlertHistory(history: InsertAlertHistory): Promise<AlertHistory> {
    const result = await db.insert(alertHistory).values(history).returning();
    return result[0];
  }
  
  async getAlertHistory(id: string): Promise<AlertHistory | undefined> {
    const result = await db.select().from(alertHistory).where(eq(alertHistory.id, id)).limit(1);
    return result[0];
  }
  
  async getAlertHistoryByAlertId(alertId: string): Promise<AlertHistory[]> {
    return db.select().from(alertHistory)
      .where(eq(alertHistory.alertId, alertId))
      .orderBy(desc(alertHistory.createdAt));
  }
  
  async getAlertHistoryByBatchId(batchId: string): Promise<AlertHistory[]> {
    return db.select().from(alertHistory)
      .where(eq(alertHistory.leadBatchId, batchId))
      .orderBy(desc(alertHistory.createdAt));
  }
  
  async markAlertHistoryViewed(id: string): Promise<void> {
    await db.update(alertHistory)
      .set({ viewedAt: new Date() })
      .where(eq(alertHistory.id, id));
  }
  
  async getUnviewedAlertsCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(alertHistory)
      .innerJoin(leadAlerts, eq(alertHistory.alertId, leadAlerts.id))
      .where(and(
        eq(leadAlerts.userId, userId),
        sql`${alertHistory.viewedAt} IS NULL`
      ));
    return Number(result[0]?.count || 0);
  }
  
  // Lead Enrichment operations
  async createLeadEnrichment(enrichment: InsertLeadEnrichment): Promise<LeadEnrichment> {
    const result = await db.insert(leadEnrichment).values(enrichment).returning();
    return result[0];
  }
  
  async createLeadEnrichments(enrichments: InsertLeadEnrichment[]): Promise<LeadEnrichment[]> {
    if (enrichments.length === 0) return [];
    const result = await db.insert(leadEnrichment).values(enrichments).returning();
    return result;
  }
  
  async getLeadEnrichment(leadId: string): Promise<LeadEnrichment | undefined> {
    const result = await db.select().from(leadEnrichment)
      .where(eq(leadEnrichment.leadId, leadId))
      .limit(1);
    return result[0];
  }
  
  async getLeadEnrichmentsByBatchId(batchId: string): Promise<LeadEnrichment[]> {
    return db.select()
      .from(leadEnrichment)
      .innerJoin(leads, eq(leadEnrichment.leadId, leads.id))
      .where(eq(leads.batchId, batchId));
  }
  
  async updateLeadEnrichment(leadId: string, data: Partial<InsertLeadEnrichment>): Promise<LeadEnrichment | undefined> {
    const result = await db.update(leadEnrichment)
      .set(data)
      .where(eq(leadEnrichment.leadId, leadId))
      .returning();
    return result[0];
  }
  
  async deleteLeadEnrichment(leadId: string): Promise<void> {
    await db.delete(leadEnrichment).where(eq(leadEnrichment.leadId, leadId));
  }
  
  async getEnrichmentStats(): Promise<{
    totalEnriched: number;
    averageConfidence: number;
    sourceBreakdown: Record<string, number>;
  }> {
    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(leadEnrichment);
    const totalEnriched = Number(totalResult[0]?.count || 0);
    
    if (totalEnriched === 0) {
      return {
        totalEnriched: 0,
        averageConfidence: 0,
        sourceBreakdown: {}
      };
    }
    
    const avgResult = await db.select({ 
      avgConfidence: sql<number>`avg(${leadEnrichment.confidenceScore})` 
    }).from(leadEnrichment);
    
    const sourceResult = await db.select({
      source: leadEnrichment.enrichmentSource,
      count: sql<number>`count(*)`
    })
    .from(leadEnrichment)
    .groupBy(leadEnrichment.enrichmentSource);
    
    const sourceBreakdown = sourceResult.reduce((acc, row) => {
      acc[row.source] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalEnriched,
      averageConfidence: Number(avgResult[0]?.avgConfidence || 0),
      sourceBreakdown
    };
  }
}

export const storage = new DbStorage();
