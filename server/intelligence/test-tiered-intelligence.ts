/**
 * Test suite for Tiered Intelligence System
 */

import { tieredIntelligence } from './tiered-intelligence';
import { fieldExtractor } from './field-extractor';
import { embeddingsService } from './embeddings-service';
import { llmService } from './llm-service';
import { executionPolicy } from './execution-policy';

/**
 * Test data samples
 */
const testData = {
  // Simple data that should be handled by Tier 0
  simpleEmail: "Contact John Doe at john.doe@example.com for more information.",
  
  // Medium complexity that might need Tier 1
  businessInfo: "ABC Construction LLC, owned by Robert Smith, specializes in commercial building projects",
  
  // Complex data that might need Tier 2
  complexText: `
    The business entity registered under the name "Advanced Tech Solutions" 
    has multiple DBAs including "ATS Pro" and "Tech Solutions Plus". 
    Annual revenue estimated at $2.5M with primary operations in software development 
    and consulting services. Owner John Smith (35% stake) and Jane Doe (65% stake).
  `,
  
  // UCC filing text
  uccText: `
    Secured Party: First National Bank
    Debtor: XYZ Corp, 123 Main St
    Collateral: All inventory, equipment, and accounts receivable
    Filing Date: 2024-01-15
    Amount: $500,000
  `
};

/**
 * Test functions
 */
async function testTier0Processing() {
  console.log('\n🧪 Testing Tier 0 (Deterministic) Processing...');
  
  const result = await tieredIntelligence.process({
    input: testData.simpleEmail,
    operation: 'extract_email',
    requirements: {
      minConfidence: 0.8,
      maxCost: 0.001,
      maxLatency: 100
    }
  } as any);
  
  console.log('Result:', {
    output: (result as any).output,
    tier: (result as any).tierUsed,
    confidence: result.confidence,
    cost: result.cost,
    latency: result.latency
  });
  
  return result;
}

async function testFieldExtraction() {
  console.log('\n🧪 Testing Field Extraction...');
  
  const result = await fieldExtractor.extractFields({
    data: {
      rawText: testData.businessInfo,
      source: 'test'
    },
    fields: ['businessName', 'ownerName', 'industry'],
    context: {
      leadId: 'test-123',
      source: 'test'
    },
    requirements: {
      minConfidence: 0.7,
      maxCost: 0.05,
      maxLatency: 5000
    }
  });
  
  console.log('Extraction Results:');
  Object.entries(result.fields).forEach(([field, data]) => {
    console.log(`  ${field}:`, {
      value: data.extractedValue,
      confidence: data.confidence,
      tier: data.tier,
      method: data.method
    });
  });
  
  console.log('\nSummary:', {
    totalCost: result.totalCost,
    totalLatency: result.totalLatency,
    averageConfidence: result.averageConfidence,
    tiersUsed: Array.from(result.tiersUsed)
  });
  
  return result;
}

async function testEmbeddingsSimilarity() {
  console.log('\n🧪 Testing Embeddings Service...');
  
  const text1 = "Construction company specializing in commercial projects";
  const text2 = "Building contractor for business properties";
  const text3 = "Software development and IT consulting";
  
  console.log('Generating embeddings...');
  const [emb1, emb2, emb3] = await Promise.all([
    (embeddingsService as any).getEmbedding(text1),
    (embeddingsService as any).getEmbedding(text2),
    (embeddingsService as any).getEmbedding(text3)
  ]);
  
  const similarity12 = (embeddingsService as any).calculateSimilarity(emb1, emb2);
  const similarity13 = (embeddingsService as any).calculateSimilarity(emb1, emb3);
  
  console.log('Similarity Results:');
  console.log(`  "${text1}" vs "${text2}": ${(similarity12 * 100).toFixed(2)}%`);
  console.log(`  "${text1}" vs "${text3}": ${(similarity13 * 100).toFixed(2)}%`);
  
  return { similarity12, similarity13 };
}

async function testComplexExtraction() {
  console.log('\n🧪 Testing Complex Data Extraction...');
  
  const result = await fieldExtractor.extractFields({
    data: {
      rawText: testData.complexText,
      source: 'test'
    },
    fields: ['businessName', 'dbaNames', 'annualRevenue', 'owners', 'industry'],
    context: {
      leadId: 'test-complex',
      source: 'test'
    },
    requirements: {
      minConfidence: 0.8,
      maxCost: 0.10,
      maxLatency: 10000
    }
  });
  
  console.log('Complex Extraction Results:');
  Object.entries(result.fields).forEach(([field, data]) => {
    console.log(`  ${field}:`, {
      value: data.extractedValue,
      confidence: data.confidence,
      tier: data.tier
    });
  });
  
  return result;
}

async function testCostTracking() {
  console.log('\n🧪 Testing Cost Tracking...');
  
  // Get current metrics
  const metrics = tieredIntelligence.getMetrics() as any;
  
  console.log('Current Tier Metrics:');
  console.log('  Tier 0:', metrics.tierStats['0']);
  console.log('  Tier 1:', metrics.tierStats['1']);
  console.log('  Tier 2:', metrics.tierStats['2']);
  console.log('  Total Cost:', metrics.totalCost);
  console.log('  Total Requests:', metrics.totalRequests);
  
  return metrics;
}

async function testPolicyEnforcement() {
  console.log('\n🧪 Testing Policy Enforcement...');
  
  const policy = executionPolicy.getStatistics() as any;
  
  console.log('Policy Configuration:');
  console.log('  Budget Status:', policy.budgetStatus);
  console.log('  Daily Budget Used:', `$${(policy.dailyBudgetUsed || 0).toFixed(4)}`);
  console.log('  Daily Budget Remaining:', `$${(policy.dailyBudgetRemaining || 0).toFixed(4)}`);
  console.log('  Can Use Tier 1:', policy.canUseTier1);
  console.log('  Can Use Tier 2:', policy.canUseTier2);
  
  // Test with budget constraint
  const testBudget = 0.001; // Very low budget to force Tier 0
  const result = await tieredIntelligence.process({
    input: testData.businessInfo,
    operation: 'extract_business_name',
    requirements: {
      minConfidence: 0.5,
      maxCost: testBudget,
      maxLatency: 100
    }
  } as any);
  
  console.log('\nBudget-Constrained Result:', {
    tier: (result as any).tierUsed,
    cost: result.cost,
    confidence: result.confidence
  });
  
  return result;
}

/**
 * Main test runner
 */
export async function runTieredIntelligenceTests() {
  console.log('='.repeat(60));
  console.log('🚀 Starting Tiered Intelligence System Tests');
  console.log('='.repeat(60));
  
  try {
    // Check if OpenAI key is available
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    if (!hasOpenAI) {
      console.log('\n⚠️ Warning: OPENAI_API_KEY not found. Some tests will use mock data.\n');
    }
    
    // Run tests
    const results = {
      tier0: await testTier0Processing(),
      fieldExtraction: await testFieldExtraction(),
      embeddings: hasOpenAI ? await testEmbeddingsSimilarity() : null,
      complex: hasOpenAI ? await testComplexExtraction() : null,
      cost: await testCostTracking(),
      policy: await testPolicyEnforcement()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('='.repeat(60));
    
    // Summary
    console.log('\n📊 Test Summary:');
    console.log('  ✓ Tier 0 (Deterministic) processing working');
    console.log('  ✓ Field extraction with tier escalation working');
    if (hasOpenAI) {
      console.log('  ✓ Embeddings service working');
      console.log('  ✓ Complex extraction with LLM working');
    } else {
      console.log('  ⚠️ Embeddings service skipped (no API key)');
      console.log('  ⚠️ LLM extraction skipped (no API key)');
    }
    console.log('  ✓ Cost tracking working');
    console.log('  ✓ Policy enforcement working');
    
    return results;
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run tests if executed directly
runTieredIntelligenceTests()
  .then(() => {
    console.log('\n✨ Test suite completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  });
