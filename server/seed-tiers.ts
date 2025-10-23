import { db } from "./db";
import { productTiers } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedTiers() {
  console.log("🌱 Seeding product tiers...");

  const tiers = [
    {
      name: "Gold",
      tier: "gold",
      price: 50000, // $500 in cents
      leadCount: 50,
      minQuality: 60,
      maxQuality: 75,
      features: [
        "50 verified MCA leads",
        "60-75 quality score",
        "Basic industry filtering",
        "Email support",
        "CSV download",
        "7-day download window"
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
      maxQuality: 85,
      features: [
        "200 verified MCA leads",
        "70-85 quality score",
        "Advanced filtering options",
        "Priority email support",
        "CSV + Excel download",
        "30-day download window",
        "Lead freshness guarantee"
      ],
      active: true,
      recommended: true, // Most popular
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
        "80-100 quality score",
        "Custom filtering options",
        "Dedicated account manager",
        "Multiple format exports",
        "90-day download window",
        "Lead replacement guarantee",
        "AI-powered insights"
      ],
      active: true,
      recommended: false,
    },
    {
      name: "Elite",
      tier: "elite",
      price: 0, // Contact for pricing
      leadCount: 0,
      minQuality: 85,
      maxQuality: 100,
      features: [
        "Custom lead volume",
        "85+ quality score only",
        "Exclusive leads available",
        "White-glove service",
        "Custom integrations",
        "Unlimited downloads",
        "Lead quality guarantee",
        "Real-time lead delivery"
      ],
      active: true,
      recommended: false,
    },
  ];

  for (const tier of tiers) {
    // Check if tier already exists
    const existing = await db.select()
      .from(productTiers)
      .where(eq(productTiers.tier, tier.tier))
      .limit(1);

    if (existing.length === 0) {
      // Insert new tier
      await db.insert(productTiers).values(tier);
      console.log(`✅ Created tier: ${tier.name}`);
    } else {
      // Update existing tier
      await db.update(productTiers)
        .set(tier)
        .where(eq(productTiers.tier, tier.tier));
      console.log(`✅ Updated tier: ${tier.name}`);
    }
  }

  console.log("🎉 Product tiers seeded successfully!");
  process.exit(0);
}

seedTiers().catch((error) => {
  console.error("❌ Error seeding tiers:", error);
  process.exit(1);
});