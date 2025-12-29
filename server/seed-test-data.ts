import bcrypt from 'bcrypt';
import { db } from './db';
import { users, leadBatches, leads } from '@shared/schema';
import type { InsertLead } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Helper function to generate realistic test MCA leads
function generateTestLeads(count: number, qualityRange: { min: number; max: number }): InsertLead[] {
  const industries = [
    'Restaurant', 'Retail Store', 'Trucking Company', 'Construction', 'Healthcare Practice',
    'Auto Repair Shop', 'Grocery Store', 'Landscaping', 'Plumbing Services', 'HVAC Services',
    'Hair Salon', 'Dental Practice', 'Law Firm', 'Real Estate Agency', 'Fitness Center',
    'Bakery', 'Coffee Shop', 'Hotel', 'Car Dealership', 'Wholesale Trade',
    'Manufacturing', 'IT Services', 'Marketing Agency', 'Consulting Firm', 'E-commerce'
  ];
  
  const firstNames = [
    'John', 'Maria', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Patricia',
    'James', 'Barbara', 'William', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Lisa', 'Daniel', 'Nancy',
    'Matthew', 'Betty', 'Anthony', 'Dorothy', 'Paul', 'Sandra', 'Mark', 'Ashley'
  ];
  
  const lastNames = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzales', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
    'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'
  ];
  
  const businessPrefixes = ['Premier', 'Elite', 'Quality', 'Pro', 'Express', 'Quick', 'Fast', 'Best', 'Top', 'Superior'];
  const businessSuffixes = ['LLC', 'Inc', 'Corp', 'Group', 'Services', 'Solutions', 'Enterprises', 'Associates', 'Co', 'Partners'];
  
  const states = ['CA', 'NY', 'TX', 'FL', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA'];
  const mcaHistoryOptions = ['none', 'previous_paid', 'current', 'multiple'];
  const urgencyLevels = ['immediate', 'this_week', 'this_month', 'exploring'];
  
  const testLeads: InsertLead[] = [];
  
  for (let i = 0; i < count; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const industry = industries[Math.floor(Math.random() * industries.length)];
    const businessPrefix = businessPrefixes[Math.floor(Math.random() * businessPrefixes.length)];
    const businessSuffix = businessSuffixes[Math.floor(Math.random() * businessSuffixes.length)];
    const state = states[Math.floor(Math.random() * states.length)];
    
    // Generate a quality score within the specified range
    const qualityScore = Math.floor(Math.random() * (qualityRange.max - qualityRange.min + 1)) + qualityRange.min;
    
    // Generate realistic correlated values based on quality score
    const isHighQuality = qualityScore >= 80;
    const isMediumQuality = qualityScore >= 70;
    
    // Higher quality leads tend to have better business metrics
    const annualRevenue = isHighQuality 
      ? (200000 + Math.floor(Math.random() * 1800000)).toString() 
      : isMediumQuality 
        ? (100000 + Math.floor(Math.random() * 400000)).toString()
        : (50000 + Math.floor(Math.random() * 200000)).toString();
    
    const requestedAmount = isHighQuality
      ? (50000 + Math.floor(Math.random() * 450000)).toString()
      : isMediumQuality
        ? (25000 + Math.floor(Math.random() * 175000)).toString()
        : (10000 + Math.floor(Math.random() * 90000)).toString();
    
    const timeInBusiness = isHighQuality
      ? (24 + Math.floor(Math.random() * 120)).toString()
      : isMediumQuality
        ? (12 + Math.floor(Math.random() * 60)).toString()
        : (6 + Math.floor(Math.random() * 42)).toString();
    
    const creditScore = isHighQuality
      ? (650 + Math.floor(Math.random() * 100)).toString()
      : isMediumQuality
        ? (580 + Math.floor(Math.random() * 70)).toString()
        : (500 + Math.floor(Math.random() * 80)).toString();
    
    // Generate unique email and phone
    const uniqueId = Date.now() + i;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${uniqueId}@${industry.toLowerCase().replace(/\s+/g, '')}.com`;
    const phone = `${2 + Math.floor(Math.random() * 8)}${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    // Assign tier based on quality score
    let tier: string;
    if (qualityScore >= 80) tier = 'diamond';
    else if (qualityScore >= 70) tier = 'platinum';
    else if (qualityScore >= 60) tier = 'gold';
    else tier = 'gold'; // Default to gold for scores below 60
    
    const lead = {
      batchId: 'test-batch-' + Date.now(), // Will be replaced with actual batch ID
      businessName: `${businessPrefix} ${industry} ${businessSuffix}`,
      ownerName: `${firstName} ${lastName}`,
      email,
      phone,
      industry,
      annualRevenue,
      requestedAmount,
      timeInBusiness,
      creditScore,
      dailyBankDeposits: Math.random() > 0.3, // 70% have daily deposits
      previousMCAHistory: mcaHistoryOptions[Math.floor(Math.random() * mcaHistoryOptions.length)],
      urgencyLevel: urgencyLevels[Math.floor(Math.random() * urgencyLevels.length)],
      stateCode: state,
      leadAge: Math.floor(Math.random() * 30), // 0-30 days old
      exclusivityStatus: 'non_exclusive',
      qualityScore,
      tier,
      sold: false
    };
    
    testLeads.push(lead as any);
  }
  
  return testLeads;
}

async function seedTestData() {
  try {
    console.log('Starting test data seeding...');
    
    // 1. Create admin user
    console.log('Creating admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    try {
      const adminUser = await db.insert(users).values({
        username: 'admin',
        password: hashedPassword,
        email: 'admin@landofleads.com',
        role: 'admin'
      }).returning();
      
      console.log('Admin user created:', adminUser[0].username);
      var adminUserId = adminUser[0].id;
    } catch (error: any) {
      if (error.message.includes('duplicate')) {
        console.log('Admin user already exists');
        // Get the existing admin user
        const existingAdmin = await db.select().from(users).where(eq(users.username, 'admin')).limit(1);
        var adminUserId = existingAdmin[0].id;
      } else {
        throw error;
      }
    }
    
    // 2. Generate test leads with varied quality scores
    console.log('Generating test leads...');
    
    // 300 leads with quality 60-69 (Gold tier)
    const goldLeads = generateTestLeads(300, { min: 60, max: 69 });
    
    // 400 leads with quality 70-79 (Platinum tier)
    const platinumLeads = generateTestLeads(400, { min: 70, max: 79 });
    
    // 300 leads with quality 80-100 (Diamond tier)
    const diamondLeads = generateTestLeads(300, { min: 80, max: 100 });
    
    // Combine all leads
    const allTestLeads = [...goldLeads, ...platinumLeads, ...diamondLeads];
    
    // 3. Create a test batch
    console.log('Creating lead batch...');
    const batch = await db.insert(leadBatches).values({
      uploadedBy: adminUserId,
      filename: 'test-leads-batch.csv',
      storageKey: `test-batch-${Date.now()}`,
      totalLeads: allTestLeads.length,
      averageQualityScore: (
        allTestLeads.reduce((sum, lead) => sum + lead.qualityScore, 0) / allTestLeads.length
      ).toFixed(2),
      status: 'ready'
    }).returning();
    
    console.log('Lead batch created:', batch[0].id);
    
    // 4. Update all leads with the actual batch ID
    const leadsToInsert = allTestLeads.map(lead => ({
      ...lead,
      batchId: batch[0].id
    }));
    
    // 5. Insert leads into database
    console.log('Inserting leads into database...');
    await db.insert(leads).values(leadsToInsert);
    
    // 6. Calculate and display distribution stats
    const distribution = {
      gold: goldLeads.length,
      platinum: platinumLeads.length,
      diamond: diamondLeads.length,
      total: allTestLeads.length,
      averageQualityScore: (
        allTestLeads.reduce((sum, lead) => sum + lead.qualityScore, 0) / allTestLeads.length
      ).toFixed(2)
    };
    
    console.log('\n✅ Test data seeding completed successfully!');
    console.log('📊 Lead Distribution:');
    console.log(`   - Gold (60-69): ${distribution.gold} leads`);
    console.log(`   - Platinum (70-79): ${distribution.platinum} leads`);
    console.log(`   - Diamond (80-100): ${distribution.diamond} leads`);
    console.log(`   - Total: ${distribution.total} leads`);
    console.log(`   - Average Quality Score: ${distribution.averageQualityScore}`);
    console.log('\n🔐 Admin credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@landofleads.com');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    process.exit(1);
  }
}

seedTestData();