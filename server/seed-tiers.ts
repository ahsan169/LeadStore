import { db } from "./db";
import { productTiers } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedTiers() {
  console.log("🌱 Seeding product tiers...");

  const tiers = [
    {
      name: "Starter",
      tier: "starter",
      price: 99700, // $997 in cents
      leadCount: 100,
      minQuality: 70,
      maxQuality: 100,
      features: [
        "100 high-quality leads (Intelligence Score 70+)",
        "Lead Activation Hub access",
        "Lead enrichment & data validation",
        "Email campaign tools",
        "CRM export functionality",
        "Smart Search with basic filters",
        "Email support",
        "CSV & Excel download",
        "30-day download window",
        "Perfect for small teams just starting with MCA leads"
      ],
      active: true,
      recommended: false,
    },
    {
      name: "Pro",
      tier: "pro",
      price: 299700, // $2,997 in cents
      leadCount: 500,
      minQuality: 80,
      maxQuality: 100,
      features: [
        "500 premium leads (Intelligence Score 80+)",
        "Everything in Starter, plus:",
        "Advanced Smart Search with saved searches",
        "API access for automation",
        "Priority support with dedicated success manager",
        "Custom CRM field mapping",
        "Bulk operations and volume discounts",
        "Lead quality guarantee with replacements",
        "Unlimited downloads",
        "Real-time lead delivery",
        "AI-powered insights & scoring",
        "Custom industry targeting",
        "Perfect for growing teams and enterprise customers"
      ],
      active: true,
      recommended: true, // Most popular
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