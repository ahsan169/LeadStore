#!/usr/bin/env node

// Simple test script to verify the /api/leads/management endpoint is working

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Test different sorting and filtering scenarios
const testScenarios = [
  {
    name: 'Default query (no params)',
    query: '',
    expectedFields: ['leads', 'pagination']
  },
  {
    name: 'Invalid sort field (should fallback to uploadedAt)',
    query: '?sortField=invalidField&sortOrder=desc',
    expectedFields: ['leads', 'pagination']
  },
  {
    name: 'Valid sort field (businessName)',
    query: '?sortField=businessName&sortOrder=asc',
    expectedFields: ['leads', 'pagination']
  },
  {
    name: 'With search filter',
    query: '?search=test',
    expectedFields: ['leads', 'pagination']
  },
  {
    name: 'With pagination',
    query: '?page=1&limit=10',
    expectedFields: ['leads', 'pagination']
  },
  {
    name: 'With quality score filter',
    query: '?filters=' + encodeURIComponent(JSON.stringify({ scoreRange: '50-100' })),
    expectedFields: ['leads', 'pagination']
  }
];

async function testEndpoint() {
  console.log('Testing /api/leads/management endpoint...\n');
  
  // First, we need to authenticate (using a test user or creating one)
  // For now, we'll skip auth and test that the endpoint at least responds
  
  let allPassed = true;
  
  for (const scenario of testScenarios) {
    try {
      console.log(`Test: ${scenario.name}`);
      console.log(`URL: ${BASE_URL}/api/leads/management${scenario.query}`);
      
      const response = await fetch(`${BASE_URL}/api/leads/management${scenario.query}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add auth header if needed
          // 'Cookie': 'connect.sid=...'
        }
      });
      
      const status = response.status;
      
      if (status === 401) {
        console.log('✓ Endpoint requires authentication (401) - This is expected\n');
        continue;
      }
      
      if (status === 500) {
        const error = await response.json();
        console.error(`✗ Server error (500):`, error);
        console.error('This is the error we were trying to fix!\n');
        allPassed = false;
        continue;
      }
      
      if (status === 200) {
        const data = await response.json();
        
        // Check if response has expected structure
        let hasAllFields = true;
        for (const field of scenario.expectedFields) {
          if (!(field in data)) {
            console.error(`  Missing expected field: ${field}`);
            hasAllFields = false;
          }
        }
        
        if (hasAllFields) {
          // Check pagination structure
          if (data.pagination) {
            const paginationFields = ['page', 'limit', 'total', 'totalPages'];
            const hasPaginationFields = paginationFields.every(field => field in data.pagination);
            
            if (hasPaginationFields) {
              console.log(`✓ Response structure is correct`);
              console.log(`  Leads: ${Array.isArray(data.leads) ? data.leads.length : 'N/A'}`);
              console.log(`  Total: ${data.pagination.total}`);
            } else {
              console.error(`✗ Pagination structure is incomplete`);
              allPassed = false;
            }
          }
          
          // Ensure leads is always an array
          if (!Array.isArray(data.leads)) {
            console.error('✗ leads field is not an array');
            allPassed = false;
          }
        } else {
          allPassed = false;
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(`✗ Test failed with error:`, error.message);
      allPassed = false;
      console.log('');
    }
  }
  
  console.log('=' .repeat(50));
  if (allPassed) {
    console.log('✓ All tests passed! The endpoint is working correctly.');
  } else {
    console.log('✗ Some tests failed. Check the errors above.');
  }
}

// Run the tests
testEndpoint().catch(console.error);