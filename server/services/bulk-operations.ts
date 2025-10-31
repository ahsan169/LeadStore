import { storage } from "../storage";
import { db } from "../db";
import { leads, bulkDiscounts, bulkOrders } from "@shared/schema";
import type { InsertBulkOrder, InsertBulkDiscount, Lead } from "@shared/schema";
import { and, eq, gte, lte, isNull, notInArray, inArray, sql } from "drizzle-orm";

export interface BulkDiscountTier {
  tierName: string;
  minQuantity: number;
  maxQuantity: number | null;
  discountPercentage: number;
  description: string;
}

export interface BulkPriceCalculation {
  quantity: number;
  basePrice: number;
  originalPrice: number;
  discountPercentage: number;
  discountAmount: number;
  finalPrice: number;
  pricePerLead: number;
  discountTier: string;
  savings: number;
}

export interface BulkOrderCriteria {
  industries?: string[];
  states?: string[];
  minQualityScore?: number;
  maxQualityScore?: number;
  minRevenue?: string;
  maxRevenue?: string;
  minRequestedAmount?: string;
  maxRequestedAmount?: string;
  creditScoreMin?: string;
  creditScoreMax?: string;
  urgencyLevel?: string[];
  exclusivityStatus?: string[];
  isEnriched?: boolean;
  freshnessCategory?: string[];
}

export interface CustomQuoteRequest {
  userId: string;
  quantity: number;
  criteria?: BulkOrderCriteria;
  message: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  timeline?: string;
}

export class BulkOperationsService {
  private defaultDiscountTiers: BulkDiscountTier[] = [
    {
      tierName: "Starter Volume",
      minQuantity: 100,
      maxQuantity: 499,
      discountPercentage: 30,
      description: "30% off for 100-499 leads - $7 per lead"
    },
    {
      tierName: "Growth Package",
      minQuantity: 500,
      maxQuantity: 999,
      discountPercentage: 50,
      description: "50% off for 500-999 leads - $5 per lead"
    },
    {
      tierName: "Scale Package",
      minQuantity: 1000,
      maxQuantity: 2499,
      discountPercentage: 70,
      description: "70% off for 1,000-2,499 leads - $3 per lead"
    },
    {
      tierName: "Enterprise Package",
      minQuantity: 2500,
      maxQuantity: 4999,
      discountPercentage: 80,
      description: "80% off for 2,500-4,999 leads - $2 per lead"
    },
    {
      tierName: "Custom Enterprise",
      minQuantity: 5000,
      maxQuantity: null,
      discountPercentage: 90,
      description: "90% off for 5,000+ leads - $1 per lead"
    }
  ];

  // Base pricing per lead (now affordable with aggressive bulk discounts)
  private basePricePerLead = 10; // $10 base price, but heavy discounts bring it down to $1-10 average

  constructor() {}

  /**
   * Initialize default discount tiers in the database
   */
  async initializeDiscountTiers(): Promise<void> {
    try {
      // Check if discount tiers already exist
      const existingTiers = await storage.getActiveBulkDiscounts();
      
      if (existingTiers.length === 0) {
        // Create default discount tiers
        for (const tier of this.defaultDiscountTiers) {
          await storage.createBulkDiscount({
            tierName: tier.tierName,
            minQuantity: tier.minQuantity,
            maxQuantity: tier.maxQuantity,
            discountPercentage: tier.discountPercentage.toString(),
            isActive: true
          });
        }
        console.log("[BulkOperations] Default discount tiers initialized");
      }
    } catch (error) {
      console.error("[BulkOperations] Error initializing discount tiers:", error);
    }
  }

  /**
   * Calculate bulk pricing with automatic discounts
   */
  async calculateBulkPrice(quantity: number): Promise<BulkPriceCalculation> {
    // Ensure quantity is at least 1
    const validQuantity = Math.max(1, quantity);
    
    // Calculate base pricing
    const basePrice = this.basePricePerLead;
    const originalPrice = validQuantity * basePrice;
    
    // Get applicable discount
    const discount = await storage.getBulkDiscountByQuantity(validQuantity);
    
    let discountPercentage = 0;
    let discountTier = "Standard Pricing";
    
    if (discount) {
      discountPercentage = parseFloat(discount.discountPercentage);
      discountTier = discount.tierName;
    }
    
    // Calculate final pricing
    const discountAmount = originalPrice * (discountPercentage / 100);
    const finalPrice = originalPrice - discountAmount;
    const pricePerLead = finalPrice / validQuantity;
    const savings = discountAmount;
    
    return {
      quantity: validQuantity,
      basePrice,
      originalPrice,
      discountPercentage,
      discountAmount,
      finalPrice,
      pricePerLead,
      discountTier,
      savings
    };
  }

  /**
   * Get all active discount tiers
   */
  async getDiscountTiers(): Promise<BulkDiscountTier[]> {
    const tiers = await storage.getActiveBulkDiscounts();
    
    return tiers.map(tier => ({
      tierName: tier.tierName,
      minQuantity: tier.minQuantity,
      maxQuantity: tier.maxQuantity,
      discountPercentage: parseFloat(tier.discountPercentage),
      description: `${parseFloat(tier.discountPercentage)}% off for ${
        tier.minQuantity
      }${tier.maxQuantity ? `-${tier.maxQuantity}` : '+'} leads`
    }));
  }

  /**
   * Create a bulk order
   */
  async createBulkOrder(
    userId: string,
    quantity: number,
    criteria?: BulkOrderCriteria
  ): Promise<string> {
    // Calculate pricing
    const pricing = await this.calculateBulkPrice(quantity);
    
    // Create bulk order
    const order = await storage.createBulkOrder({
      userId,
      totalLeads: quantity,
      originalPrice: pricing.originalPrice.toString(),
      discountApplied: pricing.discountPercentage.toString(),
      finalPrice: pricing.finalPrice.toString(),
      status: quantity >= 5000 ? "pending" : "approved", // Auto-approve under 5000
      criteria: criteria || {},
      paymentStatus: "pending"
    });
    
    // For orders under 5000, automatically proceed to processing
    if (quantity < 5000) {
      await storage.approveBulkOrder(order.id);
    }
    
    return order.id;
  }

  /**
   * Select leads for bulk order based on criteria
   */
  async selectBulkLeads(
    quantity: number,
    criteria?: BulkOrderCriteria
  ): Promise<Lead[]> {
    let query = db.select().from(leads)
      .where(and(
        eq(leads.sold, false),
        // Add more criteria filters here
      ))
      .limit(quantity);
    
    // Apply criteria filters
    const conditions: any[] = [eq(leads.sold, false)];
    
    if (criteria?.industries?.length) {
      conditions.push(inArray(leads.industry, criteria.industries));
    }
    
    if (criteria?.states?.length) {
      conditions.push(inArray(leads.stateCode, criteria.states));
    }
    
    if (criteria?.minQualityScore !== undefined) {
      conditions.push(gte(leads.qualityScore, criteria.minQualityScore));
    }
    
    if (criteria?.maxQualityScore !== undefined) {
      conditions.push(lte(leads.qualityScore, criteria.maxQualityScore));
    }
    
    if (criteria?.isEnriched !== undefined) {
      conditions.push(eq(leads.isEnriched, criteria.isEnriched));
    }
    
    if (criteria?.urgencyLevel?.length) {
      conditions.push(inArray(leads.urgencyLevel, criteria.urgencyLevel));
    }
    
    if (criteria?.exclusivityStatus?.length) {
      conditions.push(inArray(leads.exclusivityStatus, criteria.exclusivityStatus));
    }
    
    const selectedLeads = await db.select().from(leads)
      .where(and(...conditions))
      .limit(quantity);
    
    return selectedLeads;
  }

  /**
   * Process custom quote request for 5000+ leads
   */
  async createCustomQuoteRequest(request: CustomQuoteRequest): Promise<string> {
    // Calculate base pricing with max discount
    const pricing = await this.calculateBulkPrice(request.quantity);
    
    // Create bulk order with pending status
    const order = await storage.createBulkOrder({
      userId: request.userId,
      totalLeads: request.quantity,
      originalPrice: pricing.originalPrice.toString(),
      discountApplied: pricing.discountPercentage.toString(),
      finalPrice: pricing.finalPrice.toString(),
      status: "pending",
      criteria: request.criteria || {},
      paymentStatus: "pending",
      notes: `Custom Quote Request\n` +
        `Company: ${request.companyName || 'Not provided'}\n` +
        `Email: ${request.contactEmail}\n` +
        `Phone: ${request.contactPhone || 'Not provided'}\n` +
        `Timeline: ${request.timeline || 'Not specified'}\n` +
        `Message: ${request.message}`
    });
    
    // Send notification to admin (implement email notification)
    // await sendAdminNotification('custom_quote', order);
    
    return order.id;
  }

  /**
   * Approve bulk order (admin function)
   */
  async approveBulkOrder(orderId: string, customPrice?: number): Promise<void> {
    const order = await storage.getBulkOrder(orderId);
    
    if (!order) {
      throw new Error("Bulk order not found");
    }
    
    // Update order with custom price if provided
    if (customPrice) {
      const originalPrice = parseFloat(order.originalPrice);
      const discountAmount = originalPrice - customPrice;
      const discountPercentage = (discountAmount / originalPrice) * 100;
      
      await storage.updateBulkOrder(orderId, {
        finalPrice: customPrice.toString(),
        discountApplied: discountPercentage.toString()
      });
    }
    
    // Approve the order
    await storage.approveBulkOrder(orderId);
  }

  /**
   * Process bulk order payment and allocate leads
   */
  async processBulkOrderPayment(
    orderId: string,
    paymentIntentId: string
  ): Promise<Lead[]> {
    const order = await storage.getBulkOrder(orderId);
    
    if (!order) {
      throw new Error("Bulk order not found");
    }
    
    // Update payment status
    await storage.updateBulkOrder(orderId, {
      stripePaymentIntentId: paymentIntentId,
      paymentStatus: "succeeded"
    });
    
    // Select leads based on criteria
    const selectedLeads = await this.selectBulkLeads(
      order.totalLeads,
      order.criteria as BulkOrderCriteria
    );
    
    // Mark leads as sold
    const leadIds = selectedLeads.map(lead => lead.id);
    await storage.markLeadsAsSold(leadIds, order.userId);
    
    // Update order with lead IDs
    await storage.updateBulkOrder(orderId, {
      leadIds: leadIds
    });
    
    // Complete the order
    await storage.completeBulkOrder(orderId);
    
    return selectedLeads;
  }

  /**
   * Get bulk order statistics
   */
  async getBulkOrderStats(): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderSize: number;
    totalLeadsSold: number;
    pendingOrders: number;
    topDiscountTier: string;
  }> {
    const allOrders = await storage.getAllBulkOrders();
    const completedOrders = allOrders.filter(o => o.status === 'completed');
    const pendingOrders = allOrders.filter(o => o.status === 'pending');
    
    const totalRevenue = completedOrders.reduce(
      (sum, order) => sum + parseFloat(order.finalPrice),
      0
    );
    
    const totalLeadsSold = completedOrders.reduce(
      (sum, order) => sum + order.totalLeads,
      0
    );
    
    const averageOrderSize = completedOrders.length > 0
      ? totalLeadsSold / completedOrders.length
      : 0;
    
    // Find most used discount tier
    const tierCounts = new Map<string, number>();
    for (const order of completedOrders) {
      const discount = await storage.getBulkDiscountByQuantity(order.totalLeads);
      if (discount) {
        tierCounts.set(
          discount.tierName,
          (tierCounts.get(discount.tierName) || 0) + 1
        );
      }
    }
    
    let topDiscountTier = "None";
    let maxCount = 0;
    for (const [tier, count] of tierCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topDiscountTier = tier;
      }
    }
    
    return {
      totalOrders: allOrders.length,
      totalRevenue,
      averageOrderSize,
      totalLeadsSold,
      pendingOrders: pendingOrders.length,
      topDiscountTier
    };
  }
}

// Export singleton instance
export const bulkOperationsService = new BulkOperationsService();