import { db } from "./db";
import { users, productTiers, pricingStrategies } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

const SALT_ROUNDS = 10;

async function setupTestData() {
  console.log("Setting up test data...");
  
  try {
    // Check if admin user exists
    const adminUser = await storage.getUserByUsername("admin");
    
    if (!adminUser) {
      // Create admin user
      const hashedPassword = await bcrypt.hash("admin123", SALT_ROUNDS);
      await storage.createUser({
        username: "admin",
        password: hashedPassword,
        email: "admin@example.com",
        role: "admin"
      });
      console.log("✅ Admin user created (username: admin, password: admin123)");
    } else {
      console.log("✅ Admin user already exists");
    }
    
    // Check if product tiers exist
    const tiers = await storage.getAllProductTiers();
    if (tiers.length === 0) {
      // Create default tiers
      await storage.createProductTier({
        tier: "gold",
        price: "997",
        minLeads: 50,
        maxLeads: 100,
        qualityRange: { min: 70, max: 85 },
        active: true
      });
      
      await storage.createProductTier({
        tier: "platinum",
        price: "1997",
        minLeads: 100,
        maxLeads: 250,
        qualityRange: { min: 75, max: 90 },
        active: true
      });
      
      await storage.createProductTier({
        tier: "diamond",
        price: "2997",
        minLeads: 250,
        maxLeads: 500,
        qualityRange: { min: 80, max: 95 },
        active: true
      });
      
      console.log("✅ Product tiers created");
    } else {
      console.log("✅ Product tiers already exist");
    }
    
    // Check if pricing strategy exists
    const pricingStrategy = await storage.getActivePricingStrategy();
    if (!pricingStrategy) {
      // Create default pricing strategy
      await storage.createPricingStrategy({
        name: "Default Pricing",
        description: "Default pricing strategy for the platform",
        basePrice: "10",
        exclusiveMultiplier: "2.5",
        volumeDiscounts: [
          { minQuantity: 100, discount: 0.1 },
          { minQuantity: 500, discount: 0.2 },
          { minQuantity: 1000, discount: 0.3 }
        ],
        industryPremiums: {},
        geographicPremiums: {},
        ageDiscounts: {},
        active: true
      });
      console.log("✅ Pricing strategy created");
    } else {
      console.log("✅ Pricing strategy already exists");
    }
    
    console.log("\n📝 Test data setup complete!");
    console.log("You can now login with:");
    console.log("  Username: admin");
    console.log("  Password: admin123");
    console.log("\nThe following admin endpoints should now work:");
    console.log("  - GET /api/admin/analytics/detailed");
    console.log("  - GET /api/admin/users/detailed");
    console.log("  - GET /api/admin/leads/all");
    console.log("  - GET /api/admin/settings");
    
  } catch (error) {
    console.error("Error setting up test data:", error);
  }
}

// Run the setup
setupTestData().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});