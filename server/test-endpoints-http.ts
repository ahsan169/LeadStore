import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

interface LoginResponse {
  id: string;
  username: string;
  email: string;
  role: string;
}

async function testAdminEndpoints() {
  console.log('🔐 Testing Admin API Endpoints...\n');
  
  // First, login as admin to get session
  console.log('1️⃣ Logging in as admin...');
  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'admin',
      password: 'admin123',
    }),
    credentials: 'include',
  });

  if (!loginResponse.ok) {
    console.error('❌ Login failed:', loginResponse.status, await loginResponse.text());
    return;
  }

  const userData = await loginResponse.json() as LoginResponse;
  console.log('✅ Logged in successfully as:', userData.username, '(role:', userData.role, ')\n');
  
  // Get cookies from login response
  const cookies = loginResponse.headers.get('set-cookie');
  const headers = {
    'Cookie': cookies || '',
  };

  // Test each endpoint
  const endpoints = [
    '/api/admin/analytics/detailed',
    '/api/admin/users/detailed',
    '/api/admin/leads/all',
    '/api/admin/settings',
  ];

  for (const endpoint of endpoints) {
    console.log(`\n🔍 Testing ${endpoint}...`);
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      const statusEmoji = response.ok ? '✅' : '❌';
      console.log(`${statusEmoji} Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📦 Response structure:');
        
        // Show structure of response
        const showStructure = (obj: any, indent = '  ') => {
          if (Array.isArray(obj)) {
            console.log(`${indent}Array[${obj.length}]`);
            if (obj.length > 0) {
              console.log(`${indent}  First item keys:`, Object.keys(obj[0]).join(', '));
            }
          } else if (typeof obj === 'object' && obj !== null) {
            for (const [key, value] of Object.entries(obj)) {
              if (Array.isArray(value)) {
                console.log(`${indent}${key}: Array[${value.length}]`);
              } else if (typeof value === 'object' && value !== null) {
                console.log(`${indent}${key}: Object`);
              } else {
                console.log(`${indent}${key}: ${typeof value}`);
              }
            }
          }
        };
        
        showStructure(data);
      } else {
        const errorText = await response.text();
        console.log('❌ Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Request failed:', error);
    }
  }

  console.log('\n\n✨ All endpoint tests completed!');
}

// Run the test
testAdminEndpoints().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});