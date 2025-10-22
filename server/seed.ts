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

  console.log("\nTest Credentials:");
  console.log("Admin: username=admin, password=admin123");
  console.log("Buyer: username=buyer, password=buyer123");
  
  process.exit(0);
}

seed().catch(console.error);
