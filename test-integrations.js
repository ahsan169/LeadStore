// Integration Test Script
import * as dotenv from 'dotenv';
dotenv.config();

console.log('=== INTEGRATION STATUS CHECK ===\n');

// 1. Database Integration
console.log('1. DATABASE INTEGRATION:');
console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured');
console.log('   PGHOST:', process.env.PGHOST ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', (process.env.DATABASE_URL || process.env.PGHOST) ? '✅ Database appears configured' : '⚠️ Needs setup');
console.log();

// 2. Object Storage
console.log('2. OBJECT STORAGE INTEGRATION:');
console.log('   DEFAULT_OBJECT_STORAGE_BUCKET_ID:', process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? '✅ Configured' : '❌ Not configured');
console.log('   PUBLIC_OBJECT_SEARCH_PATHS:', process.env.PUBLIC_OBJECT_SEARCH_PATHS ? '✅ Configured' : '❌ Not configured');
console.log('   PRIVATE_OBJECT_DIR:', process.env.PRIVATE_OBJECT_DIR ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ? '✅ Object Storage configured' : '⚠️ Needs setup');
console.log();

// 3. Stripe Integration
console.log('3. STRIPE PAYMENT INTEGRATION:');
console.log('   STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.STRIPE_SECRET_KEY ? '⚠️ Partially configured (webhook secret missing)' : '❌ Needs setup');
console.log();

// 4. OpenAI Integration
console.log('4. OPENAI INTEGRATION:');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   OPENAI_API_BASE_URL:', process.env.OPENAI_API_BASE_URL || '(Using default OpenAI endpoint)');
console.log('   Status:', process.env.OPENAI_API_KEY ? '✅ OpenAI configured' : '❌ Needs setup');
console.log();

// 5. Replit Authentication
console.log('5. REPLIT AUTHENTICATION:');
console.log('   SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Configured' : '❌ Not configured');
console.log('   REPL_ID:', process.env.REPL_ID ? '✅ Present' : '❌ Not in Replit environment');
console.log('   REPLIT_DOMAINS:', process.env.REPLIT_DOMAINS ? '✅ Present' : '❌ Not in Replit environment');
console.log('   Status:', process.env.SESSION_SECRET ? '✅ Session auth configured' : '⚠️ Using default session secret');
console.log();

// 6. Perplexity Integration
console.log('6. PERPLEXITY AI INTEGRATION:');
console.log('   PERPLEXITY_API_KEY:', process.env.PERPLEXITY_API_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.PERPLEXITY_API_KEY ? '✅ Perplexity configured' : '❌ Needs setup');
console.log();

// 7. Google Drive Integration
console.log('7. GOOGLE DRIVE INTEGRATION:');
console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Configured' : '❌ Not configured');
console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Configured' : '❌ Not configured');
console.log('   GOOGLE_DRIVE_API_KEY:', process.env.GOOGLE_DRIVE_API_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.GOOGLE_CLIENT_ID ? '✅ Google Drive configured' : '❌ Needs setup');
console.log();

// 8. Email Service (Resend)
console.log('8. EMAIL SERVICE (RESEND):');
console.log('   RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.RESEND_API_KEY ? '✅ Email service configured' : '⚠️ Email functionality disabled');
console.log();

// 9. Phone Verification (Numverify)
console.log('9. PHONE VERIFICATION (NUMVERIFY):');
console.log('   NUMVERIFY_API_KEY:', process.env.NUMVERIFY_API_KEY ? '✅ Configured' : '❌ Not configured');
console.log('   Status:', process.env.NUMVERIFY_API_KEY ? '✅ Phone verification configured' : '⚠️ Phone verification disabled');
console.log();

// Summary
console.log('=== SUMMARY ===');
const configured = [];
const needsSetup = [];
const partial = [];

// Check each integration
if (process.env.DATABASE_URL || process.env.PGHOST) configured.push('Database');
else needsSetup.push('Database');

if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) configured.push('Object Storage');
else needsSetup.push('Object Storage');

if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) configured.push('Stripe');
else if (process.env.STRIPE_SECRET_KEY) partial.push('Stripe (missing webhook secret)');
else needsSetup.push('Stripe');

if (process.env.OPENAI_API_KEY) configured.push('OpenAI');
else needsSetup.push('OpenAI');

if (process.env.SESSION_SECRET) configured.push('Authentication');
else partial.push('Authentication (using default secret)');

if (process.env.PERPLEXITY_API_KEY) configured.push('Perplexity');
else needsSetup.push('Perplexity');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) configured.push('Google Drive');
else needsSetup.push('Google Drive');

if (process.env.RESEND_API_KEY) configured.push('Email (Resend)');
else partial.push('Email (disabled)');

if (process.env.NUMVERIFY_API_KEY) configured.push('Phone Verification');
else partial.push('Phone Verification (disabled)');

console.log('\n✅ Fully Configured:', configured.length > 0 ? configured.join(', ') : 'None');
console.log('⚠️ Partially Configured:', partial.length > 0 ? partial.join(', ') : 'None');
console.log('❌ Needs Setup:', needsSetup.length > 0 ? needsSetup.join(', ') : 'None');

// Test actual connections
console.log('\n=== CONNECTION TESTS ===');

// Test Stripe
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const account = await stripe.accounts.retrieve();
    console.log('✅ Stripe: Connected successfully');
  } catch (error) {
    console.log('❌ Stripe: Connection failed -', error.message);
  }
}

// Test OpenAI
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE_URL
    });
    const models = await openai.models.list();
    console.log('✅ OpenAI: Connected successfully');
  } catch (error) {
    console.log('❌ OpenAI: Connection failed -', error.message);
  }
}

// Test Database
if (process.env.DATABASE_URL || process.env.PGHOST) {
  try {
    const { db } = await import('./server/db.js');
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log('✅ Database: Connected successfully');
  } catch (error) {
    console.log('❌ Database: Connection failed -', error.message);
  }
}

console.log('\nTest complete!');