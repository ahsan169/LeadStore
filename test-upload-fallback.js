#!/usr/bin/env node

// Test script to verify upload fallback mechanism
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Generate test CSV data
function generateTestCSV() {
  const headers = [
    'Business Name', 'Owner Name', 'Email', 'Phone', 
    'Industry', 'Annual Revenue', 'City', 'State'
  ];
  
  const rows = [
    headers.join(','),
    'Test Company 1,John Doe,john@test.com,555-1234,Retail,1000000,New York,NY',
    'Test Company 2,Jane Smith,jane@test.com,555-5678,Technology,2000000,San Francisco,CA',
    'Test Company 3,Bob Johnson,bob@test.com,555-9012,Manufacturing,1500000,Chicago,IL'
  ];
  
  return rows.join('\n');
}

// Create test CSV file
async function createTestFile() {
  const csvContent = generateTestCSV();
  const filename = `test_upload_${Date.now()}.csv`;
  const filepath = path.join('/tmp', filename);
  
  fs.writeFileSync(filepath, csvContent);
  console.log(`[Test] Created test file: ${filepath}`);
  
  return { filepath, filename };
}

// Test upload with authentication
async function testUpload() {
  try {
    console.log('\n=== Testing Upload with Fallback Mechanism ===\n');
    
    // First, we need to authenticate as admin
    console.log('[Test] Authenticating as admin...');
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'admin123'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('[Test] Login failed. Creating admin user...');
      
      // Try to register admin user
      const registerResponse = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'admin123',
          role: 'admin'
        })
      });
      
      if (!registerResponse.ok) {
        console.error('[Test] Failed to create admin user');
        return;
      }
    }
    
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('[Test] Authentication successful');
    
    // Create test file
    const { filepath, filename } = await createTestFile();
    
    // Test 1: Test standard upload route
    console.log('\n[Test 1] Testing standard /api/batches/upload route...');
    const form1 = new FormData();
    form1.append('file', fs.createReadStream(filepath), filename);
    
    const uploadResponse1 = await fetch('http://localhost:5000/api/batches/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookies || ''
      },
      body: form1
    });
    
    const result1 = await uploadResponse1.json();
    console.log('[Test 1] Standard upload response:', {
      status: uploadResponse1.status,
      success: uploadResponse1.ok,
      storageType: result1.storageInfo ? result1.storageInfo.storageType : 'unknown'
    });
    
    // Test 2: Test new admin upload route
    console.log('\n[Test 2] Testing new /api/admin/upload route with fallback...');
    const form2 = new FormData();
    form2.append('file', fs.createReadStream(filepath), filename);
    
    const uploadResponse2 = await fetch('http://localhost:5000/api/admin/upload', {
      method: 'POST',
      headers: {
        'Cookie': cookies || ''
      },
      body: form2
    });
    
    if (uploadResponse2.ok) {
      const result2 = await uploadResponse2.json();
      console.log('[Test 2] Admin upload successful:', {
        success: result2.success,
        storageType: result2.result?.storage?.type,
        fallbackUsed: result2.result?.storage?.fallbackUsed,
        totalProcessed: result2.result?.totalProcessed,
        successfulImports: result2.result?.successfulImports
      });
      
      // Check if local storage was used
      if (result2.result?.storage?.type === 'local') {
        console.log('[Test] ✅ Local storage fallback working correctly!');
        console.log('[Test] Local file path:', result2.result.storage.localPath);
      } else if (result2.result?.storage?.type === 's3') {
        console.log('[Test] ✅ S3 storage working (no fallback needed)');
      }
    } else {
      const error = await uploadResponse2.json();
      console.log('[Test 2] Upload failed:', error);
    }
    
    // Clean up test file
    fs.unlinkSync(filepath);
    console.log('\n[Test] Cleanup completed');
    
    // Check if uploads directory was created
    const uploadsDir = path.join(process.cwd(), 'uploads', 'batches');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      console.log(`\n[Test] ✅ Uploads directory created with ${files.length} file(s)`);
      if (files.length > 0) {
        console.log('[Test] Files in uploads directory:', files);
      }
    } else {
      console.log('\n[Test] ℹ️ No uploads directory found (might be using S3)');
    }
    
    console.log('\n=== Upload Fallback Test Completed ===\n');
    
  } catch (error) {
    console.error('[Test] Error during testing:', error);
  }
}

// Run the test
testUpload().catch(console.error);