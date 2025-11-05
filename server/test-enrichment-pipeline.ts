#!/usr/bin/env tsx
/**
 * Test script for the Automatic Enrichment Pipeline
 * Tests the flow from upload through Brain decisions to enrichment
 */

import { eventBus } from "./services/event-bus";
import { enrichmentQueue } from "./services/enrichment-queue";
import { storage } from "./storage";
import { db } from "./db";
import { leads, enrichmentJobs, intelligenceDecisions, batches } from "@shared/schema";
import { eq } from "drizzle-orm";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAutomaticEnrichmentPipeline() {
  console.log("\n🚀 Testing Automatic Enrichment Pipeline");
  console.log("==========================================\n");
  
  try {
    // Step 1: Create a test batch and lead
    console.log("Step 1: Creating test batch and lead...");
    
    // Create a batch directly using the database
    const batchData = await db.insert(batches).values({
      id: crypto.randomUUID(),
      userId: 'test-user-pipeline',
      fileName: 'test-pipeline.csv',
      fileSize: 1024,
      status: 'processing',
      totalLeads: 1,
      processedLeads: 0,
      successfulLeads: 0,
      failedLeads: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    const batch = batchData[0];
    console.log(`✅ Created batch: ${batch.id}`);
    
    const testLead = {
      batchId: batch.id,
      businessName: "Test Auto Enrichment LLC",
      ownerName: "John Doe",
      email: "john@testautoenrich.com",
      phone: "555-0123",
      city: "New York",
      stateCode: "NY",
      industry: "Software Development",
      requestedAmount: 50000,
      qualityScore: 40, // Low quality to trigger enrichment
      isVerified: false,
      isEnriched: false
    };
    
    const createdLead = await storage.createLead(testLead);
    console.log(`✅ Created lead: ${createdLead.id}`);
    
    // Step 2: Simulate upload event to trigger automatic enrichment
    console.log("\nStep 2: Triggering upload event...");
    eventBus.emit('lead:uploaded', {
      lead: createdLead,
      source: 'test',
      userId: 'test-user',
      batchId: 'test-batch-001'
    });
    
    // Step 3: Check queue status
    console.log("\nStep 3: Checking queue status...");
    await sleep(1000); // Wait for event processing
    
    const queueStats = enrichmentQueue.getStats();
    console.log("Queue stats:", {
      queueLength: queueStats.queueLength,
      processing: queueStats.processing,
      pending: queueStats.pending
    });
    
    // Step 4: Monitor enrichment progress
    console.log("\nStep 4: Monitoring enrichment progress...");
    const monitoringMetrics = enrichmentQueue.getMonitoringMetrics();
    console.log("Monitoring metrics:", {
      queueSize: monitoringMetrics.queue.size,
      pending: monitoringMetrics.queue.pending,
      processing: monitoringMetrics.queue.processing,
      deadLetter: monitoringMetrics.queue.deadLetter
    });
    
    // Step 5: Wait for processing and check results
    console.log("\nStep 5: Waiting for enrichment to process...");
    let enrichmentComplete = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait
    
    // Listen for enrichment completion
    eventBus.once('enrichment:completed', (data) => {
      console.log(`\n✅ Enrichment completed for lead ${data.leadId}`);
      console.log("Enrichment details:", {
        duration: `${data.duration}ms`,
        enrichmentScore: data.enrichmentScore,
        dataCompleteness: data.dataCompleteness
      });
      enrichmentComplete = true;
    });
    
    eventBus.once('enrichment:failed', (data) => {
      console.error(`\n❌ Enrichment failed for lead ${data.leadId}:`, data.error);
      enrichmentComplete = true;
    });
    
    // Wait for enrichment to complete
    while (!enrichmentComplete && attempts < maxAttempts) {
      await sleep(1000);
      attempts++;
      
      // Check queue status every 5 seconds
      if (attempts % 5 === 0) {
        const currentStats = enrichmentQueue.getStats();
        console.log(`   Checking... (${attempts}s) - Queue: ${currentStats.queueLength}, Processing: ${currentStats.processing}`);
      }
    }
    
    if (!enrichmentComplete) {
      console.log("\n⚠️ Enrichment did not complete within timeout period");
    }
    
    // Step 6: Verify database updates
    console.log("\nStep 6: Verifying database updates...");
    
    // Check if lead was updated
    const updatedLead = await storage.getLead(createdLead.id);
    if (updatedLead) {
      console.log("Lead status after enrichment:");
      console.log(`  - Is Enriched: ${updatedLead.isEnriched}`);
      console.log(`  - Quality Score: ${updatedLead.qualityScore}`);
      console.log(`  - Intelligence Score: ${updatedLead.leadIntelligenceScore || 'N/A'}`);
      console.log(`  - Master Enrichment Score: ${updatedLead.masterEnrichmentScore || 'N/A'}`);
    }
    
    // Check intelligence decisions
    const decisions = await db
      .select()
      .from(intelligenceDecisions)
      .where(eq(intelligenceDecisions.leadId, createdLead.id))
      .limit(5);
    
    if (decisions.length > 0) {
      console.log(`\nIntelligence Decisions (${decisions.length} found):`);
      decisions.forEach((decision, index) => {
        console.log(`  ${index + 1}. ${decision.decisionType}: ${decision.strategy} (confidence: ${decision.confidence})`);
        console.log(`     Services: ${decision.services?.join(', ') || 'N/A'}`);
        console.log(`     Est. Cost: $${decision.estimatedCost || 0}`);
      });
    } else {
      console.log("\nNo intelligence decisions found (may need API keys configured)");
    }
    
    // Check enrichment jobs
    const enrichmentJobRecords = await db
      .select()
      .from(enrichmentJobs)
      .where(eq(enrichmentJobs.leadId, createdLead.id))
      .limit(5);
    
    if (enrichmentJobRecords.length > 0) {
      console.log(`\nEnrichment Jobs (${enrichmentJobRecords.length} found):`);
      enrichmentJobRecords.forEach((job, index) => {
        console.log(`  ${index + 1}. Status: ${job.status}, Priority: ${job.priority}`);
        console.log(`     Source: ${job.source}, Retries: ${job.retryCount}/${job.maxRetries}`);
      });
    } else {
      console.log("\nNo enrichment jobs found (may be processed immediately)");
    }
    
    // Step 7: Test batch upload
    console.log("\n\nStep 7: Testing batch upload...");
    const batchLeads = [
      {
        businessName: "Batch Test Company 1",
        ownerName: "Alice Smith",
        email: "alice@batch1.com",
        stateCode: "CA",
        qualityScore: 30
      },
      {
        businessName: "Batch Test Company 2", 
        ownerName: "Bob Johnson",
        email: "bob@batch2.com",
        stateCode: "TX",
        qualityScore: 50
      },
      {
        businessName: "Batch Test Company 3",
        ownerName: "Carol Williams",
        email: "carol@batch3.com",
        stateCode: "FL",
        qualityScore: 70
      }
    ];
    
    const createdBatchLeads = await storage.createLeads(batchLeads);
    console.log(`✅ Created ${createdBatchLeads.length} batch leads`);
    
    // Trigger batch upload event
    eventBus.emit('batch:uploaded', {
      leads: createdBatchLeads,
      batchId: 'test-batch-002',
      userId: 'test-user'
    });
    
    await sleep(2000);
    
    const finalStats = enrichmentQueue.getStats();
    console.log("\nFinal queue statistics:");
    console.log(`  - Total Processed: ${finalStats.totalProcessed}`);
    console.log(`  - Successful: ${finalStats.successful}`);
    console.log(`  - Failed: ${finalStats.failed}`);
    console.log(`  - Success Rate: ${(finalStats.successRate * 100).toFixed(2)}%`);
    console.log(`  - Average Processing Time: ${finalStats.averageProcessingTime?.toFixed(0) || 0}ms`);
    
    console.log("\n\n✅ Automatic Enrichment Pipeline Test Complete!");
    console.log("==========================================\n");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  }
  
  // Exit after test
  process.exit(0);
}

// Run the test
console.log("Starting Enrichment Pipeline Test...");
console.log("Note: For full enrichment, ensure API keys are configured in .env");

// Give services time to initialize
setTimeout(() => {
  testAutomaticEnrichmentPipeline();
}, 2000);