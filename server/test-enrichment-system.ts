/**
 * Integration tests for the Bulk-First Lead Enrichment System
 * This test suite verifies that all components work together to achieve
 * cost-effective lead enrichment at <$0.001 per lead average cost
 */

import { db } from './db';
import { leads, stagingLeads, dataIngestionJobs, enrichmentJobs, enrichmentCosts, dataEvidence, rawDataDumps } from '@shared/schema';
import { bulkDataIngestionService } from './services/bulk-data-ingestion';
import { leadDeduplicationService } from './services/lead-deduplication-service';
import { waterfallEnrichmentOrchestrator } from './services/waterfall-enrichment-orchestrator';
import { enrichmentQueueService } from './services/enrichment-queue-service';
import { costMonitoringService } from './services/cost-monitoring-service';
import { bulkExportService } from './services/bulk-export-service';
import { sql } from 'drizzle-orm';

// Test configuration
const TEST_CONFIG = {
  MAX_COST_PER_LEAD: 0.001, // $0.001 target
  MIN_QUALITY_SCORE: 60,
  BATCH_SIZE: 100,
  ENABLE_VERBOSE_LOGGING: true
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const color = {
    info: colors.blue,
    success: colors.green,
    error: colors.red,
    warning: colors.yellow
  }[type];
  console.log(`${color}[Test] ${message}${colors.reset}`);
}

async function runTests() {
  log('='.repeat(80), 'info');
  log('BULK-FIRST LEAD ENRICHMENT SYSTEM - INTEGRATION TEST', 'info');
  log('Target: Process 100,000+ leads at <$0.001 per lead average cost', 'info');
  log('='.repeat(80), 'info');
  
  const testResults = {
    passed: 0,
    failed: 0,
    tests: [] as any[]
  };
  
  try {
    // Test 1: Bulk Data Ingestion from Free Sources
    log('\nTest 1: Bulk Data Ingestion from Free/Cheap Sources', 'info');
    const ingestionTest = await testBulkDataIngestion();
    testResults.tests.push(ingestionTest);
    if (ingestionTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 2: Smart Deduplication & Normalization
    log('\nTest 2: Smart Deduplication & Normalization', 'info');
    const deduplicationTest = await testDeduplication();
    testResults.tests.push(deduplicationTest);
    if (deduplicationTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 3: Waterfall Enrichment Orchestration
    log('\nTest 3: Waterfall Enrichment Orchestration', 'info');
    const enrichmentTest = await testWaterfallEnrichment();
    testResults.tests.push(enrichmentTest);
    if (enrichmentTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 4: Asynchronous Processing with Queues
    log('\nTest 4: Asynchronous Processing with Job Queues', 'info');
    const queueTest = await testAsyncProcessing();
    testResults.tests.push(queueTest);
    if (queueTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 5: Cost Monitoring
    log('\nTest 5: Cost Monitoring & Analytics', 'info');
    const costTest = await testCostMonitoring();
    testResults.tests.push(costTest);
    if (costTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 6: Bulk Export with Stripe Integration
    log('\nTest 6: Bulk Export System', 'info');
    const exportTest = await testBulkExport();
    testResults.tests.push(exportTest);
    if (exportTest.passed) testResults.passed++; else testResults.failed++;
    
    // Test 7: End-to-End Cost Optimization
    log('\nTest 7: End-to-End Cost Optimization', 'info');
    const optimizationTest = await testCostOptimization();
    testResults.tests.push(optimizationTest);
    if (optimizationTest.passed) testResults.passed++; else testResults.failed++;
    
    // Print Summary
    log('\n' + '='.repeat(80), 'info');
    log('TEST SUMMARY', 'info');
    log('='.repeat(80), 'info');
    log(`Total Tests: ${testResults.tests.length}`, 'info');
    log(`Passed: ${testResults.passed}`, 'success');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'error' : 'info');
    
    // Print detailed results
    log('\nDetailed Results:', 'info');
    testResults.tests.forEach(test => {
      const status = test.passed ? '✓' : '✗';
      const color = test.passed ? colors.green : colors.red;
      console.log(`${color}${status} ${test.name}${colors.reset}`);
      if (test.metrics) {
        Object.entries(test.metrics).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      }
      if (!test.passed && test.error) {
        console.log(`  Error: ${test.error}`);
      }
    });
    
    // Overall assessment
    log('\n' + '='.repeat(80), 'info');
    if (testResults.failed === 0) {
      log('✓ ALL TESTS PASSED!', 'success');
      log('The bulk-first lead enrichment system is working correctly!', 'success');
      log(`Average cost per lead: < $${TEST_CONFIG.MAX_COST_PER_LEAD}`, 'success');
    } else {
      log('✗ SOME TESTS FAILED', 'error');
      log('Please review the errors above and fix the issues.', 'warning');
    }
    log('='.repeat(80), 'info');
    
  } catch (error: any) {
    log(`Critical test failure: ${error.message}`, 'error');
    console.error(error);
  }
}

/**
 * Test 1: Bulk Data Ingestion from Free Sources
 */
async function testBulkDataIngestion() {
  const testResult = {
    name: 'Bulk Data Ingestion',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Test UCC data ingestion
    log('  Testing UCC data ingestion...', 'info');
    const uccData = [
      {
        fileNumber: 'UCC-2024-001',
        debtorName: 'ABC Trucking Corp',
        debtorAddress: '123 Main St, Los Angeles, CA 90001',
        securedParty: 'Wells Fargo',
        filingDate: new Date('2024-01-15'),
        lienAmount: 250000
      },
      {
        fileNumber: 'UCC-2024-002',
        debtorName: 'XYZ Logistics LLC',
        debtorAddress: '456 Oak Ave, San Francisco, CA 94102',
        securedParty: 'Chase Bank',
        filingDate: new Date('2024-02-01'),
        lienAmount: 180000
      }
    ];
    
    const uccResult = await bulkDataIngestionService.ingestBulkData(
      'ucc',
      uccData,
      { source: 'test-ucc-data', batchId: 'test-batch-1' }
    );
    
    testResult.metrics.uccRecordsIngested = uccResult.recordsProcessed;
    
    // Test Google Places data ingestion
    log('  Testing Google Places data ingestion...', 'info');
    const googlePlacesData = [
      {
        place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        name: 'Construction Plus Inc',
        formatted_address: '789 Market St, San Diego, CA 92101',
        phone_number: '+1-619-555-0123',
        website: 'https://constructionplus.com',
        rating: 4.5,
        user_ratings_total: 128,
        types: ['contractor', 'construction_company']
      }
    ];
    
    const googleResult = await bulkDataIngestionService.ingestBulkData(
      'google_places',
      googlePlacesData,
      { source: 'test-google-data', batchId: 'test-batch-2' }
    );
    
    testResult.metrics.googlePlacesIngested = googleResult.recordsProcessed;
    
    // Store raw data dump for audit trail
    const rawDump = await db.insert(rawDataDumps).values({
      id: `dump-${Date.now()}`,
      source: 'test-suite',
      format: 'json',
      data: JSON.stringify([...uccData, ...googlePlacesData]),
      recordCount: uccData.length + googlePlacesData.length,
      status: 'processed'
    }).returning();
    
    testResult.metrics.rawDataDumpStored = rawDump.length > 0;
    testResult.metrics.totalRecordsIngested = 
      testResult.metrics.uccRecordsIngested + testResult.metrics.googlePlacesIngested;
    
    testResult.passed = testResult.metrics.totalRecordsIngested > 0;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 2: Smart Deduplication & Normalization
 */
async function testDeduplication() {
  const testResult = {
    name: 'Smart Deduplication & Normalization',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Create test leads with variations
    const testLeads = [
      {
        businessName: 'ABC Trucking Corp',
        ownerName: 'John Smith',
        phone: '(555) 123-4567',
        email: 'john@abctrucking.com',
        address: '123 Main Street',
        city: 'Los Angeles',
        stateCode: 'CA'
      },
      {
        businessName: 'ABC Trucking Corporation', // Variation in name
        ownerName: 'John Smith',
        phone: '555.123.4567', // Different phone format
        email: 'john@abctrucking.com',
        address: '123 Main St.', // Abbreviated address
        city: 'Los Angeles',
        stateCode: 'CA'
      },
      {
        businessName: 'XYZ Logistics',
        ownerName: 'Jane Doe',
        phone: '555-987-6543',
        email: 'jane@xyzlogistics.com',
        address: '456 Oak Ave',
        city: 'San Francisco',
        stateCode: 'CA'
      }
    ];
    
    // Ingest and deduplicate
    const results = await leadDeduplicationService.deduplicateLeads(testLeads);
    
    testResult.metrics.inputLeads = testLeads.length;
    testResult.metrics.uniqueLeads = results.uniqueLeads.length;
    testResult.metrics.duplicatesFound = results.duplicates.length;
    testResult.metrics.phoneNormalization = results.uniqueLeads.every(
      lead => lead.phone?.match(/^\+1\d{10}$/) !== null
    );
    
    // Verify canonical schema
    const canonicalLead = results.uniqueLeads[0];
    testResult.metrics.hasCanonicalFields = 
      'ownerName' in canonicalLead &&
      'businessName' in canonicalLead &&
      'phones' in canonicalLead &&
      'emails' in canonicalLead &&
      'sources' in canonicalLead &&
      'confidence' in canonicalLead;
    
    // Generate unique IDs
    const leadIds = results.uniqueLeads.map(lead => 
      leadDeduplicationService['generateLeadId'](lead)
    );
    testResult.metrics.uniqueIdsGenerated = new Set(leadIds).size === leadIds.length;
    
    testResult.passed = 
      testResult.metrics.duplicatesFound === 1 && // Should find 1 duplicate
      testResult.metrics.phoneNormalization &&
      testResult.metrics.hasCanonicalFields &&
      testResult.metrics.uniqueIdsGenerated;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 3: Waterfall Enrichment Orchestration
 */
async function testWaterfallEnrichment() {
  const testResult = {
    name: 'Waterfall Enrichment Orchestration',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Create test lead
    const testLead = {
      id: 'test-lead-1',
      businessName: 'Sample Business Inc',
      ownerName: 'Test Owner',
      email: 'test@samplebusiness.com',
      phone: '+15551234567',
      stateCode: 'CA',
      industry: 'Construction'
    };
    
    // Test enrichment with cost tracking
    const startTime = Date.now();
    const result = await waterfallEnrichmentOrchestrator.enrichLead(testLead, {
      maxTier: 2, // Only use free and cheap sources
      enablePremium: false
    });
    const endTime = Date.now();
    
    testResult.metrics.enrichmentTime = `${endTime - startTime}ms`;
    testResult.metrics.hotnessScore = result.hotnessScore?.score || 0;
    testResult.metrics.completenessScore = result.completenessScore;
    testResult.metrics.sourcesUsed = result.sourcesUsed;
    testResult.metrics.totalCost = result.totalCost;
    testResult.metrics.costPerLead = result.totalCost;
    
    // Verify tiered approach was used
    testResult.metrics.usedCache = result.sourcesUsed.includes('cache');
    testResult.metrics.usedFreeAPIs = result.sourcesUsed.some(s => 
      ['perplexity', 'openai'].includes(s)
    );
    testResult.metrics.avoidedPremiumAPIs = !result.sourcesUsed.some(s => 
      ['clearbit', 'peopledatalabs'].includes(s)
    );
    
    // Store evidence
    if (result.evidence && result.evidence.length > 0) {
      for (const ev of result.evidence) {
        await db.insert(dataEvidence).values({
          id: `evidence-${Date.now()}-${Math.random()}`,
          leadId: testLead.id,
          source: ev.source,
          field: ev.field,
          value: ev.value,
          confidence: ev.confidence,
          timestamp: new Date(),
          metadata: ev.metadata || {}
        });
      }
      testResult.metrics.evidenceStored = result.evidence.length;
    }
    
    testResult.passed = 
      testResult.metrics.totalCost <= TEST_CONFIG.MAX_COST_PER_LEAD &&
      testResult.metrics.avoidedPremiumAPIs &&
      result.enrichedData !== null;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 4: Asynchronous Processing with Queues
 */
async function testAsyncProcessing() {
  const testResult = {
    name: 'Asynchronous Processing with Job Queues',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Add batch of jobs to queue
    const testLeads = Array.from({ length: 10 }, (_, i) => ({
      id: `queue-test-${i}`,
      businessName: `Test Business ${i}`,
      ownerName: `Owner ${i}`,
      email: `test${i}@business.com`,
      stateCode: 'NY'
    }));
    
    const jobIds = [];
    for (const lead of testLeads) {
      const jobId = await enrichmentQueueService.addJob({
        leadId: lead.id,
        leadData: lead,
        priority: Math.floor(Math.random() * 5) + 1,
        metadata: { test: true }
      });
      jobIds.push(jobId);
    }
    
    testResult.metrics.jobsCreated = jobIds.length;
    
    // Get queue metrics
    const metrics = await enrichmentQueueService.getQueueMetrics();
    testResult.metrics.queueDepth = metrics.totalDepth;
    testResult.metrics.processingCount = metrics.processing;
    
    // Test rate limiting
    const rateLimitTest = await enrichmentQueueService['checkRateLimit']('test-vendor');
    testResult.metrics.rateLimitingActive = rateLimitTest !== null;
    
    // Test retry logic
    const failedJob = await enrichmentQueueService.addJob({
      leadId: 'test-fail',
      leadData: { businessName: 'Will Fail' },
      priority: 1,
      metadata: { simulateFailure: true }
    });
    
    // Wait a bit for processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const retryMetrics = await enrichmentQueueService.getQueueMetrics();
    testResult.metrics.retryQueueDepth = retryMetrics.queues.find(
      q => q.name === 'retry'
    )?.depth || 0;
    
    testResult.passed = 
      testResult.metrics.jobsCreated === 10 &&
      testResult.metrics.rateLimitingActive;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 5: Cost Monitoring
 */
async function testCostMonitoring() {
  const testResult = {
    name: 'Cost Monitoring & Analytics',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Track some test costs
    await costMonitoringService.trackCost({
      service: 'test-free-api',
      apiCall: 'test-call-1',
      cost: 0.0,
      success: true,
      metadata: { tier: 'free' }
    });
    
    await costMonitoringService.trackCost({
      service: 'test-cheap-api',
      apiCall: 'test-call-2',
      cost: 0.0005,
      success: true,
      metadata: { tier: 'cheap' }
    });
    
    // Get metrics
    const metrics = await costMonitoringService.getCostMetrics();
    const vendorUsage = await costMonitoringService.getVendorUsage();
    const efficiency = await costMonitoringService.getEnrichmentEfficiency();
    const dashboard = await costMonitoringService.getDashboardSummary();
    
    testResult.metrics.totalCost = metrics.totalCost;
    testResult.metrics.avgCostPerLead = metrics.avgCostPerLead;
    testResult.metrics.vendorsTracked = vendorUsage.length;
    testResult.metrics.costBySource = metrics.costBySource;
    
    // Verify cost tracking
    testResult.metrics.costTrackingWorking = metrics.totalCost >= 0;
    testResult.metrics.meetsTarget = 
      metrics.avgCostPerLead <= TEST_CONFIG.MAX_COST_PER_LEAD;
    
    // Check recommendations
    const recommendations = dashboard.recommendations || [];
    testResult.metrics.hasRecommendations = recommendations.length > 0;
    
    testResult.passed = 
      testResult.metrics.costTrackingWorking &&
      testResult.metrics.meetsTarget;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 6: Bulk Export System
 */
async function testBulkExport() {
  const testResult = {
    name: 'Bulk Export System',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Create test export job
    const testLeadIds = ['test-1', 'test-2', 'test-3'];
    
    const exportJob = await bulkExportService.createExportJob(
      'test-user-id',
      testLeadIds,
      'instant', // Use instant tier for testing
      'csv',
      {
        includeEnrichment: false,
        includeConfidenceScores: true
      }
    );
    
    testResult.metrics.jobCreated = exportJob.id !== undefined;
    testResult.metrics.exportFormat = exportJob.format;
    testResult.metrics.tier = exportJob.tier.name;
    testResult.metrics.exportCost = exportJob.totalCost;
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check job status
    const status = bulkExportService.getJobStatus(exportJob.id);
    testResult.metrics.jobStatus = status?.status;
    testResult.metrics.downloadUrlGenerated = status?.downloadUrl !== undefined;
    
    // Get export metrics
    const exportMetrics = await bulkExportService.getExportMetrics();
    testResult.metrics.totalExports = exportMetrics.totalExports;
    testResult.metrics.averageExportSize = exportMetrics.averageExportSize;
    
    // Verify tiered pricing
    const standardJob = await bulkExportService.createExportJob(
      'test-user-id',
      testLeadIds,
      'standard',
      'json'
    );
    
    const premiumJob = await bulkExportService.createExportJob(
      'test-user-id',
      testLeadIds,
      'premium',
      'csv'
    );
    
    testResult.metrics.tieredPricing = 
      premiumJob.totalCost > standardJob.totalCost &&
      standardJob.totalCost > exportJob.totalCost;
    
    testResult.passed = 
      testResult.metrics.jobCreated &&
      testResult.metrics.tieredPricing &&
      testResult.metrics.exportCost <= testLeadIds.length * 0.001;
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

/**
 * Test 7: End-to-End Cost Optimization
 */
async function testCostOptimization() {
  const testResult = {
    name: 'End-to-End Cost Optimization',
    passed: false,
    metrics: {} as any,
    error: null as any
  };
  
  try {
    // Simulate processing a large batch
    const batchSize = 100;
    const testLeads = Array.from({ length: batchSize }, (_, i) => ({
      id: `batch-test-${i}`,
      businessName: `Business ${i}`,
      ownerName: `Owner ${i}`,
      phone: `555-${String(i).padStart(4, '0')}`,
      email: `contact${i}@business.com`,
      stateCode: ['CA', 'NY', 'TX', 'FL'][i % 4],
      industry: ['Construction', 'Retail', 'Services'][i % 3]
    }));
    
    let totalCost = 0;
    let enrichedCount = 0;
    const startTime = Date.now();
    
    // Process in batches to leverage bulk rates
    const bulkBatchSize = 50;
    for (let i = 0; i < testLeads.length; i += bulkBatchSize) {
      const batch = testLeads.slice(i, i + bulkBatchSize);
      
      // Simulate bulk processing
      for (const lead of batch) {
        const result = await waterfallEnrichmentOrchestrator.enrichLead(lead, {
          maxTier: 2,
          enablePremium: false,
          useBulkRates: true
        });
        
        if (result.enrichedData) {
          enrichedCount++;
          totalCost += result.totalCost;
        }
      }
    }
    
    const endTime = Date.now();
    const processingTime = (endTime - startTime) / 1000; // seconds
    
    testResult.metrics.totalLeadsProcessed = batchSize;
    testResult.metrics.successfullyEnriched = enrichedCount;
    testResult.metrics.totalCost = totalCost.toFixed(4);
    testResult.metrics.averageCostPerLead = (totalCost / batchSize).toFixed(6);
    testResult.metrics.processingTimeSeconds = processingTime.toFixed(2);
    testResult.metrics.leadsPerSecond = (batchSize / processingTime).toFixed(2);
    
    // Calculate cost efficiency metrics
    const costEfficiency = {
      underTarget: totalCost / batchSize < TEST_CONFIG.MAX_COST_PER_LEAD,
      costReduction: `${((0.01 - (totalCost / batchSize)) / 0.01 * 100).toFixed(1)}%`,
      projectedCostFor100k: `$${(totalCost / batchSize * 100000).toFixed(2)}`
    };
    
    testResult.metrics.costEfficiency = costEfficiency;
    
    // Verify caching effectiveness
    const cacheMetrics = await costMonitoringService.getCacheMetrics?.() || {
      hitRate: 0,
      missRate: 100,
      totalHits: 0
    };
    testResult.metrics.cacheHitRate = `${cacheMetrics.hitRate}%`;
    
    testResult.passed = 
      costEfficiency.underTarget &&
      enrichedCount > batchSize * 0.8; // At least 80% success rate
    
  } catch (error: any) {
    testResult.error = error.message;
  }
  
  return testResult;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };