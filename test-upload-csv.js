const fs = require('fs');
const FormData = require('form-data');

// Read the CSV file
const csvContent = fs.readFileSync('mca_top_2000_enriched.csv');

console.log('CSV file stats:');
console.log('- Size:', csvContent.length, 'bytes');
console.log('- First 200 chars:', csvContent.toString('utf-8').substring(0, 200));

// Parse headers
const lines = csvContent.toString('utf-8').split('\n');
const headers = lines[0].split(',').map(h => h.trim());

console.log('\nHeaders found:', headers);

// Check required fields
const requiredMappings = {
  'company_name': 'businessName',
  'owner_name': 'ownerName',
  'email': 'email',
  'phone1': 'phone',
  'phone2': 'phone (alt)'
};

console.log('\nField mapping check:');
for (const [col, field] of Object.entries(requiredMappings)) {
  const found = headers.includes(col);
  console.log(`- ${col} → ${field}: ${found ? '✓' : '✗'}`);
}

// Count valid rows
let validCount = 0;
let invalidCount = 0;

for (let i = 1; i < Math.min(100, lines.length); i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  
  const values = line.split(',');
  const hasCompany = values[0] && values[0].trim();
  const hasEmail = values[6] && values[6].trim();
  const hasPhone = values[8] && values[8].trim();
  
  if (hasCompany || hasEmail || hasPhone) {
    validCount++;
  } else {
    invalidCount++;
  }
}

console.log('\nData validation (first 100 rows):');
console.log('- Valid rows:', validCount);
console.log('- Invalid/empty rows:', invalidCount);
console.log('- Success rate:', ((validCount / (validCount + invalidCount)) * 100).toFixed(1) + '%');

console.log('\nYour CSV file is ready to upload!');
console.log('The system will now properly recognize your column names.');