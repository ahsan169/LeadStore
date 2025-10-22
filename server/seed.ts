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

  console.log("\nTest Credentials:");
  console.log("Admin: username=admin, password=admin123");
  console.log("Buyer: username=buyer, password=buyer123");
  
  process.exit(0);
}

seed().catch(console.error);
