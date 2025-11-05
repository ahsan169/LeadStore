/**
 * Test script for the Data Completeness Analyzer
 */

import { DataCompletenessAnalyzer } from './services/data-completeness-analyzer';
import { UnifiedUploadHandler } from './services/unified-upload-handler';
import type { InsertLead } from '@shared/schema';

// Test leads with varying completeness
const testLeads: Array<Partial<InsertLead>> = [
  {
    // Complete lead
    businessName: 'ABC Corporation',
    ownerName: 'John Smith',
    email: 'john@abccorp.com',
    phone: '555-123-4567',
    industry: 'Technology',
    annualRevenue: '5000000',
    creditScore: '720',
    stateCode: 'CA',
    city: 'San Francisco',
    urgencyLevel: 'Immediate'
  },
  {
    // Partial lead - missing critical fields
    businessName: 'XYZ Limited',
    phone: '555-987-6543',
    industry: 'Retail',
    stateCode: 'NY'
  },
  {
    // Minimal lead
    ownerName: 'Jane Doe',
    email: 'jane.doe@gmail.com'
  },
  {
    // Invalid data lead
    businessName: 'Test Company',
    email: 'invalid-email',
    phone: '123',
    creditScore: '999',
    stateCode: 'ZZ'
  },
  {
    // UCC lead
    businessName: 'Capital Ventures LLC',
    ownerName: 'Robert Johnson',
    phone: '555-555-5555',
    uccNumber: 'UCC-2024-001234',
    filingDate: new Date('2024-01-15'),
    securedParties: 'First National Bank',
    stackingRisk: 'medium',
    activePositions: 2
  }
];

async function testAnalyzer() {
  console.log('=== Testing Data Completeness Analyzer ===\n');
  
  const analyzer = new DataCompletenessAnalyzer();
  
  // Test individual lead analysis
  console.log('--- Individual Lead Analysis ---');
  for (let i = 0; i < testLeads.length; i++) {
    const lead = testLeads[i];
    console.log(`\nAnalyzing Lead ${i + 1}: ${lead.businessName || lead.ownerName || 'Unknown'}`);
    
    const report = analyzer.analyzeLead(lead);
    
    console.log(`  Quality Metrics:`);
    console.log(`    - Completeness Score: ${report.qualityMetrics.completenessScore}%`);
    console.log(`    - Validity Score: ${report.qualityMetrics.validityScore}%`);
    console.log(`    - Freshness Score: ${report.qualityMetrics.freshnessScore}%`);
    console.log(`    - Confidence Score: ${report.qualityMetrics.confidenceScore}%`);
    console.log(`    - Overall Quality: ${report.qualityMetrics.overallQualityScore}%`);
    
    console.log(`  Category Coverage:`);
    console.log(`    - Business: ${report.qualityMetrics.categoryCoverage.business}%`);
    console.log(`    - Contact: ${report.qualityMetrics.categoryCoverage.contact}%`);
    console.log(`    - Financial: ${report.qualityMetrics.categoryCoverage.financial}%`);
    console.log(`    - Location: ${report.qualityMetrics.categoryCoverage.location}%`);
    console.log(`    - UCC: ${report.qualityMetrics.categoryCoverage.ucc}%`);
    
    console.log(`  Enrichment Plan:`);
    console.log(`    - Priority: ${report.enrichmentPlan.priority}`);
    console.log(`    - Estimated Cost: $${report.enrichmentPlan.totalEstimatedCost.toFixed(2)}`);
    console.log(`    - Expected Quality Gain: +${report.enrichmentPlan.expectedQualityImprovement}%`);
    console.log(`    - ROI: ${report.enrichmentPlan.roi.toFixed(1)}x`);
    
    if (report.enrichmentPlan.recommendedServices.length > 0) {
      console.log(`    - Recommended Services:`);
      for (const service of report.enrichmentPlan.recommendedServices.slice(0, 3)) {
        console.log(`      • ${service.service}: ${service.justification}`);
      }
    }
    
    console.log(`  Lead Value:`);
    console.log(`    - Current Value: ${report.leadValue.currentValue}/100`);
    console.log(`    - Potential Value: ${report.leadValue.potentialValue}/100`);
    console.log(`    - Category: ${report.leadValue.valueCategory}`);
    
    if (report.missingCriticalFields.length > 0) {
      console.log(`  Missing Critical Fields:`);
      for (const field of report.missingCriticalFields.slice(0, 3)) {
        console.log(`    - ${field.field} (importance: ${field.importance})`);
      }
    }
    
    if (report.invalidFields.length > 0) {
      console.log(`  Invalid Fields:`);
      for (const field of report.invalidFields) {
        console.log(`    - ${field.field}: ${field.validationErrors?.join(', ')}`);
      }
    }
    
    if (report.recommendations.length > 0) {
      console.log(`  Top Recommendations:`);
      for (const rec of report.recommendations.slice(0, 2)) {
        console.log(`    - ${rec}`);
      }
    }
  }
  
  // Test batch analysis
  console.log('\n\n--- Batch Analysis ---');
  const batchReport = await analyzer.batchAnalyze(testLeads, 'test-batch-001');
  
  console.log('\nBatch Statistics:');
  console.log(`  - Total Leads: ${batchReport.totalLeads}`);
  console.log(`  - Average Completeness: ${batchReport.overallStats.avgCompletenessScore}%`);
  console.log(`  - Average Quality: ${batchReport.overallStats.avgQualityScore}%`);
  console.log(`  - Average Freshness: ${batchReport.overallStats.avgFreshnessScore}%`);
  console.log(`  - Leads Ready to Sell: ${batchReport.overallStats.leadsReadyToSell}`);
  console.log(`  - Leads Needing Enrichment: ${batchReport.overallStats.leadsNeedingEnrichment}`);
  console.log(`  - Poor Quality Leads: ${batchReport.overallStats.leadsPoorQuality}`);
  
  console.log('\nQuality Distribution:');
  console.log(`  - Premium: ${batchReport.qualityDistribution.premium}`);
  console.log(`  - Standard: ${batchReport.qualityDistribution.standard}`);
  console.log(`  - Basic: ${batchReport.qualityDistribution.basic}`);
  console.log(`  - Poor: ${batchReport.qualityDistribution.poor}`);
  
  console.log('\nEnrichment Opportunities:');
  console.log(`  - Total Estimated Cost: $${batchReport.enrichmentOpportunities.totalEstimatedCost.toFixed(2)}`);
  console.log(`  - Expected Quality Gain: +${batchReport.enrichmentOpportunities.expectedQualityGain}%`);
  console.log(`  - Priority Breakdown:`);
  for (const [priority, count] of Object.entries(batchReport.enrichmentOpportunities.priorityBreakdown)) {
    console.log(`    - ${priority}: ${count} leads`);
  }
  
  console.log('\nTop Services Needed:');
  for (const service of batchReport.enrichmentOpportunities.topServicesNeeded) {
    console.log(`  - ${service.service}: ${service.count} leads ($${service.totalCost.toFixed(2)} total)`);
  }
  
  console.log('\nField Coverage Report (Top Fields):');
  const topFields = Object.entries(batchReport.fieldCoverageReport)
    .sort((a, b) => b[1].percentage - a[1].percentage)
    .slice(0, 10);
  
  for (const [field, stats] of topFields) {
    console.log(`  - ${field}: ${stats.percentage}% filled (${stats.filled}/${batchReport.totalLeads}), ${stats.valid} valid`);
  }
  
  console.log('\n=== Test Complete ===');
}

// Test CSV upload simulation
async function testUploadIntegration() {
  console.log('\n\n=== Testing Upload Handler Integration ===\n');
  
  // Create CSV content
  const csvContent = `Business Name,Owner Name,Email,Phone,Industry,Annual Revenue,Credit Score,State
ABC Corporation,John Smith,john@abccorp.com,555-123-4567,Technology,5000000,720,CA
XYZ Limited,,,555-987-6543,Retail,,,NY
,Jane Doe,jane.doe@gmail.com,,,,
Test Company,,invalid-email,123,,,999,ZZ
Capital Ventures LLC,Robert Johnson,,555-555-5555,Finance,2000000,680,TX`;
  
  const uploadHandler = new UnifiedUploadHandler();
  
  console.log('Simulating CSV upload...');
  const result = await uploadHandler.processUpload(
    Buffer.from(csvContent),
    'test_leads.csv',
    'test-user-123',
    {
      autoEnrich: false,
      validateDuplicates: true,
      sourceName: 'Test Upload',
      intelligentProcessing: true
    }
  );
  
  console.log('\nUpload Result:');
  console.log(`  - Batch ID: ${result.batchId}`);
  console.log(`  - Total Processed: ${result.totalProcessed}`);
  console.log(`  - Successful Imports: ${result.successfulImports}`);
  console.log(`  - Failed: ${result.failedCount}`);
  console.log(`  - Duplicates Skipped: ${result.duplicatesSkipped}`);
  
  if (result.dataQualityMetrics) {
    console.log('\nData Quality Metrics:');
    console.log(`  - Average Completeness: ${result.dataQualityMetrics.avgCompletenessScore}%`);
    console.log(`  - Average Quality: ${result.dataQualityMetrics.avgQualityScore}%`);
    console.log(`  - Average Freshness: ${result.dataQualityMetrics.avgFreshnessScore}%`);
    console.log(`  - Leads Ready to Sell: ${result.dataQualityMetrics.leadsReadyToSell}`);
    console.log(`  - Needs Enrichment: ${result.dataQualityMetrics.leadsNeedingEnrichment}`);
  }
  
  if (result.enrichmentOpportunities) {
    console.log('\nEnrichment Opportunities:');
    console.log(`  - Total Cost: $${result.enrichmentOpportunities.totalEstimatedCost.toFixed(2)}`);
    console.log(`  - Expected Quality Gain: +${result.enrichmentOpportunities.expectedQualityGain}%`);
    console.log(`  - Priority Breakdown:`, result.enrichmentOpportunities.priorityBreakdown);
  }
  
  if (result.analysisReport) {
    console.log('\n✅ Analysis Report Generated Successfully');
    console.log(`  - ${result.analysisReport.leadAnalyses.length} leads analyzed`);
  }
  
  console.log('\n=== Integration Test Complete ===');
}

// Run tests
async function runAllTests() {
  try {
    await testAnalyzer();
    // Note: Upload integration test requires database connection
    // await testUploadIntegration();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests immediately
runAllTests();

export { testAnalyzer, testUploadIntegration };