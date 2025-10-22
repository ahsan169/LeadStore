import bcrypt from "bcrypt";
import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  const adminPassword = await bcrypt.hash("admin123", 10);
  try {
    const admin = await storage.createUser({
      username: "admin",
      email: "admin@mcaleads.com",
      password: adminPassword,
      role: "admin",
    });
    console.log("✓ Created admin user:", admin.username);
  } catch (error) {
    console.log("Admin user may already exist");
  }

  // Create test buyer user
  const buyerPassword = await bcrypt.hash("buyer123", 10);
  try {
    const buyer = await storage.createUser({
      username: "buyer",
      email: "buyer@example.com",
      password: buyerPassword,
      role: "buyer",
    });
    console.log("✓ Created buyer user:", buyer.username);
  } catch (error) {
    console.log("Buyer user may already exist");
  }

  // Seed product tiers
  const tiers = [
    {
      name: "Gold",
      tier: "gold",
      price: 50000, // $500 in cents
      leadCount: 50,
      minQuality: 60,
      maxQuality: 79,
      features: [
        "50 verified MCA leads",
        "Quality scores 60-79",
        "Basic deduplication",
        "24-hour delivery",
        "Email support",
      ],
      active: true,
      recommended: false,
    },
    {
      name: "Platinum",
      tier: "platinum",
      price: 150000, // $1500 in cents
      leadCount: 200,
      minQuality: 70,
      maxQuality: 89,
      features: [
        "200 verified MCA leads",
        "Quality scores 70-89",
        "Advanced deduplication",
        "Instant delivery",
        "Priority support",
        "Industry segmentation",
      ],
      active: true,
      recommended: true,
    },
    {
      name: "Diamond",
      tier: "diamond",
      price: 400000, // $4000 in cents
      leadCount: 600,
      minQuality: 80,
      maxQuality: 100,
      features: [
        "600 premium MCA leads",
        "Quality scores 80-100",
        "Advanced deduplication",
        "Instant delivery",
        "Priority support",
        "AI insights included",
        "Replace guarantee",
      ],
      active: true,
      recommended: false,
    },
    {
      name: "Elite",
      tier: "elite",
      price: 0, // Contact for pricing
      leadCount: 0, // Custom
      minQuality: 85,
      maxQuality: 100,
      features: [
        "Custom lead volume",
        "Highest quality scores (85-100)",
        "Dedicated account manager",
        "Custom industry targeting",
        "API access",
        "White-label options",
        "Custom SLA",
      ],
      active: true,
      recommended: false,
    },
  ];

  for (const tierData of tiers) {
    try {
      const existing = await storage.getProductTierByTier(tierData.tier);
      if (!existing) {
        const tier = await storage.createProductTier(tierData);
        console.log(`✓ Created ${tier.name} tier`);
      } else {
        console.log(`${tierData.name} tier already exists`);
      }
    } catch (error) {
      console.log(`Failed to create ${tierData.name} tier:`, error);
    }
  }

  // Seed realistic MCA leads
  const mcaLeads = [
    // Restaurant - High Quality
    {
      businessName: "Tony's Italian Bistro",
      contactName: "Tony Marcelli",
      email: "tony@tonysbistro.com",
      phone: "(212) 555-0142",
      annualRevenue: 850000,
      monthlyRevenue: 70833,
      industry: "restaurant",
      timeInBusiness: 48,
      creditScore: 680,
      requestedAmount: 75000,
      fundingPurpose: "Equipment upgrade and renovation",
      businessType: "LLC",
      yearsInBusiness: 4,
      personalCreditScore: 680,
      businessCreditScore: 72,
      existingDebt: 25000,
      collateralAvailable: true,
      bankruptcyHistory: false,
      previousMCAHistory: "previous_paid",
      dailyBankDeposits: true,
      urgencyLevel: "this_week",
      stateCode: "NY",
      exclusivityStatus: "exclusive",
      qualityScore: 92,
    },
    // Trucking Company - High Quality
    {
      businessName: "FastTrack Logistics LLC",
      contactName: "Mike Johnson",
      email: "mjohnson@fasttrackllc.com",
      phone: "(469) 555-0178",
      annualRevenue: 1450000,
      monthlyRevenue: 120833,
      industry: "trucking",
      timeInBusiness: 36,
      creditScore: 650,
      requestedAmount: 150000,
      fundingPurpose: "Fleet expansion",
      businessType: "LLC",
      yearsInBusiness: 3,
      personalCreditScore: 650,
      businessCreditScore: 68,
      existingDebt: 75000,
      collateralAvailable: true,
      bankruptcyHistory: false,
      previousMCAHistory: "current",
      dailyBankDeposits: true,
      urgencyLevel: "immediate",
      stateCode: "TX",
      exclusivityStatus: "semi_exclusive",
      qualityScore: 88,
    },
    // Retail Store - Medium Quality
    {
      businessName: "Fashion Forward Boutique",
      contactName: "Sarah Chen",
      email: "sarah@fashionforwardboutique.net",
      phone: "(415) 555-0198",
      annualRevenue: 420000,
      monthlyRevenue: 35000,
      industry: "retail",
      timeInBusiness: 30,
      creditScore: 620,
      requestedAmount: 40000,
      fundingPurpose: "Inventory for holiday season",
      businessType: "Corporation",
      yearsInBusiness: 2.5,
      personalCreditScore: 620,
      businessCreditScore: 65,
      existingDebt: 15000,
      collateralAvailable: false,
      bankruptcyHistory: false,
      previousMCAHistory: "none",
      dailyBankDeposits: true,
      urgencyLevel: "this_month",
      stateCode: "CA",
      exclusivityStatus: "non_exclusive",
      qualityScore: 75,
    },
    // Healthcare - High Quality
    {
      businessName: "Advanced Dental Care",
      contactName: "Dr. Robert Smith",
      email: "admin@advanceddentalcare.com",
      phone: "(312) 555-0165",
      annualRevenue: 1800000,
      monthlyRevenue: 150000,
      industry: "healthcare",
      timeInBusiness: 72,
      creditScore: 720,
      requestedAmount: 200000,
      fundingPurpose: "New medical equipment",
      businessType: "Professional Corporation",
      yearsInBusiness: 6,
      personalCreditScore: 720,
      businessCreditScore: 78,
      existingDebt: 50000,
      collateralAvailable: true,
      bankruptcyHistory: false,
      previousMCAHistory: "previous_paid",
      dailyBankDeposits: true,
      urgencyLevel: "exploring",
      stateCode: "IL",
      exclusivityStatus: "exclusive",
      qualityScore: 95,
    },
    // Construction - Medium Quality
    {
      businessName: "BuildRight Construction Co",
      contactName: "James Wilson",
      email: "jwilson@buildrightco.com",
      phone: "(602) 555-0134",
      annualRevenue: 680000,
      monthlyRevenue: 56667,
      industry: "construction",
      timeInBusiness: 18,
      creditScore: 590,
      requestedAmount: 60000,
      fundingPurpose: "Project financing",
      businessType: "LLC",
      yearsInBusiness: 1.5,
      personalCreditScore: 590,
      businessCreditScore: 58,
      existingDebt: 35000,
      collateralAvailable: true,
      bankruptcyHistory: false,
      previousMCAHistory: "current",
      dailyBankDeposits: false,
      urgencyLevel: "immediate",
      stateCode: "AZ",
      exclusivityStatus: "non_exclusive",
      qualityScore: 68,
    },
  ];

  // Insert MCA leads
  for (const leadData of mcaLeads) {
    try {
      const lead = await storage.createLead({
        ...leadData,
        tcpaCompliant: true,
        createdAt: new Date(),
        leadAge: Math.floor(Math.random() * 30), // 0-30 days old
      });
      console.log(`✓ Created MCA lead: ${lead.businessName} (Score: ${lead.qualityScore})`);
    } catch (error) {
      console.log(`Failed to create lead for ${leadData.businessName}:`, error);
    }
  }

  // Seed subscription plans
  const subscriptionPlans = [
    {
      name: "Starter",
      description: "Perfect for small businesses getting started with MCA leads",
      price: 50000, // $500
      credits: 600,
      leadCount: 50,
      features: ["50 leads/month", "Basic filtering", "Email support", "CSV export"],
      billingCycle: "monthly",
      active: true,
    },
    {
      name: "Professional",
      description: "Ideal for growing MCA businesses",
      price: 200000, // $2000
      credits: 2500,
      leadCount: 250,
      features: ["250 leads/month", "Advanced filtering", "Priority support", "API access", "Custom reports"],
      billingCycle: "monthly",
      active: true,
    },
    {
      name: "Enterprise",
      description: "For high-volume MCA operations",
      price: 500000, // $5000
      credits: 6500,
      leadCount: 750,
      features: ["750 leads/month", "All filters", "Dedicated support", "API access", "White-label options", "Custom integrations"],
      billingCycle: "monthly",
      active: true,
    },
  ];

  for (const planData of subscriptionPlans) {
    try {
      const plan = await storage.createSubscriptionPlan(planData);
      console.log(`✓ Created subscription plan: ${plan.name}`);
    } catch (error) {
      console.log(`Failed to create subscription plan ${planData.name}:`, error);
    }
  }

  // Seed pricing strategies
  const pricingStrategies = [
    {
      name: "Standard Pricing",
      description: "Base pricing for non-exclusive leads",
      basePrice: 2500, // $25 base
      exclusiveMultiplier: 2.5,
      volumeDiscounts: {
        "100": 0.9,
        "500": 0.8,
        "1000": 0.7
      },
      industryPremiums: {
        "restaurant": 1.3,
        "healthcare": 1.3,
        "trucking": 1.2
      },
      geographicPremiums: {
        "NY": 1.2,
        "CA": 1.2,
        "TX": 1.1
      },
      ageDiscounts: {
        "30": 0.7,
        "60": 0.5,
        "90": 0.3
      },
      active: true,
    },
  ];

  for (const strategyData of pricingStrategies) {
    try {
      const strategy = await storage.createPricingStrategy(strategyData);
      console.log(`✓ Created pricing strategy: ${strategy.name}`);
    } catch (error) {
      console.log(`Failed to create pricing strategy ${strategyData.name}:`, error);
    }
  }

  console.log("\nTest Credentials:");
  console.log("Admin: username=admin, password=admin123");
  console.log("Buyer: username=buyer, password=buyer123");
  
  console.log("\n✓ Database seeded successfully");
  process.exit(0);
}

seed().catch(console.error);
