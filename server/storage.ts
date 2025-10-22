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
  users,
  subscriptions,
  leadBatches,
  leads,
  purchases,
  downloadHistory,
  aiInsights,
  productTiers,
  allocations,
  pricingStrategies,
  subscriptionPlans,
  credits,
  creditTransactions,
  contactSubmissions,
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
  
  // Download history operations
  createDownloadHistory(history: InsertDownloadHistory): Promise<DownloadHistory>;
  getDownloadHistoryByPurchaseId(purchaseId: string): Promise<DownloadHistory[]>;
  
  // AI insights operations
  getAiInsight(id: string): Promise<AiInsight | undefined>;
  getAiInsightByBatchId(batchId: string): Promise<AiInsight | undefined>;
  createAiInsight(insight: InsertAiInsight): Promise<AiInsight>;
  
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
    return db.select().from(leads)
      .where(and(
        eq(leads.sold, false),
        eq(leads.tier, tier)
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
}

export const storage = new DbStorage();
