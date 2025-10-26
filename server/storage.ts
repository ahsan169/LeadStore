import { eq, desc, and, sql, inArray, notInArray, gte, lte } from "drizzle-orm";
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
  
  // Advanced lead queries
  getFilteredLeads(filters: {
    industry?: string;
    minRevenue?: number;
    maxRevenue?: number;
    stateCode?: string;
    minTimeInBusiness?: number;
    minCreditScore?: number;
    maxCreditScore?: number;
    exclusivityStatus?: string;
    previousMCAHistory?: string;
    urgencyLevel?: string;
    limit: number;
  }): Promise<Lead[]>;
  
  // Contact submission operations
  createContactSubmission(submission: InsertContactSubmission): Promise<ContactSubmission>;
  getContactSubmissions(): Promise<ContactSubmission[]>;
  updateContactSubmissionStatus(id: string, status: string): Promise<ContactSubmission | undefined>;
  
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

  // Advanced lead queries
  async getFilteredLeads(filters: {
    industry?: string;
    minRevenue?: number;
    maxRevenue?: number;
    stateCode?: string;
    minTimeInBusiness?: number;
    minCreditScore?: number;
    maxCreditScore?: number;
    exclusivityStatus?: string;
    previousMCAHistory?: string;
    urgencyLevel?: string;
    limit: number;
  }): Promise<Lead[]> {
    const conditions = [];
    
    if (filters.industry) {
      conditions.push(eq(leads.industry, filters.industry));
    }
    if (filters.minRevenue !== undefined) {
      conditions.push(gte(leads.annualRevenue, filters.minRevenue));
    }
    if (filters.maxRevenue !== undefined) {
      conditions.push(lte(leads.annualRevenue, filters.maxRevenue));
    }
    if (filters.stateCode) {
      conditions.push(eq(leads.stateCode, filters.stateCode));
    }
    if (filters.minCreditScore !== undefined) {
      conditions.push(gte(leads.creditScore, filters.minCreditScore));
    }
    if (filters.maxCreditScore !== undefined) {
      conditions.push(lte(leads.creditScore, filters.maxCreditScore));
    }
    
    const query = conditions.length > 0 
      ? db.select().from(leads).where(and(...conditions)).limit(filters.limit)
      : db.select().from(leads).limit(filters.limit);
    
    return query;
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
}

export const storage = new DbStorage();
