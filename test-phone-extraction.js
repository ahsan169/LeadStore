import Papa from "papaparse";
import fs from "fs";

// Test data with various phone formats and multiple phones per cell
const testData = [
  // Multiple phones with different separators
  { company: "Company A", phones: "(555) 123-4567, 555-987-6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  { company: "Company B", phones: "555.123.4567 / 555.987.6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  { company: "Company C", phones: "5551234567 or 5559876543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  { company: "Company D", phones: "555-123-4567; 555-987-6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  { company: "Company E", phones: "Phone1: 555-123-4567 Phone2: 555-987-6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  
  // Different phone formats (single phone)
  { company: "Company F", phones: "(555) 123-4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company G", phones: "555-123-4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company H", phones: "555.123.4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company I", phones: "5551234567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company J", phones: "+1 555 123 4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company K", phones: "1-555-123-4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company L", phones: "555 123 4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company M", phones: "Tel: (555) 123-4567", expected: { primary: "555-123-4567", secondary: null } },
  
  // Complex cases with mixed text
  { company: "Company N", phones: "Main: 555-123-4567 (ask for John) Alt: 555-987-6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  { company: "Company O", phones: "555-123-4567 ext. 123, Mobile: 555-987-6543", expected: { primary: "555-123-4567", secondary: "555-987-6543" } },
  
  // Edge cases
  { company: "Company P", phones: "", expected: { primary: null, secondary: null } },
  { company: "Company Q", phones: "No phone", expected: { primary: null, secondary: null } },
  { company: "Company R", phones: "1234567890, 0987654321", expected: { primary: "123-456-7890", secondary: "098-765-4321" } },
  
  // Invalid phone numbers that should be skipped
  { company: "Company S", phones: "111-111-1111, 555-123-4567", expected: { primary: "555-123-4567", secondary: null } },
  { company: "Company T", phones: "000-000-0000, 999-999-9999, 555-123-4567", expected: { primary: "555-123-4567", secondary: null } },
];

// Function to extract phone numbers (copied from routes.ts for testing)
function extractPhoneNumbers(phoneString) {
  if (!phoneString || typeof phoneString !== 'string') {
    return { primary: null, secondary: null };
  }

  // Common separators for multiple phone numbers
  const separatorPatterns = [
    /[,;\/\\|]/,  // Comma, semicolon, forward/back slash, pipe
    /\s+or\s+/i,  // "or" with spaces
    /\s+and\s+/i, // "and" with spaces
    /\s*[&]\s*/,  // Ampersand with optional spaces
    /\s{2,}/,     // Multiple spaces
    /[\n\r]+/,    // Line breaks
  ];

  // Split the input by common separators to find multiple phone numbers
  let potentialPhones = [phoneString];
  
  for (const separator of separatorPatterns) {
    const newPotentialPhones = [];
    for (const phone of potentialPhones) {
      const parts = phone.split(separator);
      newPotentialPhones.push(...parts);
    }
    potentialPhones = newPotentialPhones;
  }

  // Also check for patterns like "phone1: xxx phone2: xxx"
  const labeledPhonePattern = /(?:phone\s*\d*\s*[:#]?\s*|tel\s*[:#]?\s*|mobile\s*[:#]?\s*|cell\s*[:#]?\s*|main\s*[:#]?\s*|alt\s*[:#]?\s*)([^\s].*?)(?=(?:phone|tel|mobile|cell|main|alt|\s*$))/gi;
  const labeledMatches = phoneString.matchAll(labeledPhonePattern);
  for (const match of labeledMatches) {
    if (match[1]) {
      potentialPhones.push(match[1].trim());
    }
  }

  // Regular expressions for various phone formats
  const phonePatterns = [
    // International format with country code
    /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
    // Standard US formats
    /\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
    // 10 digits with no formatting
    /\b([0-9]{10})\b/,
    // With extensions (capture base number only)
    /\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})(?:\s*(?:ext|x|extension)\.?\s*\d+)?/i,
    // Dots as separators
    /([0-9]{3})\.([0-9]{3})\.([0-9]{4})/,
    // Spaces as separators
    /([0-9]{3})\s+([0-9]{3})\s+([0-9]{4})/,
  ];

  const extractedPhones = [];
  const processedNumbers = new Set();

  for (const potential of potentialPhones) {
    if (!potential || potential.trim().length === 0) continue;

    const trimmed = potential.trim();
    
    // Try each pattern
    for (const pattern of phonePatterns) {
      const matches = trimmed.matchAll(new RegExp(pattern, 'g'));
      
      for (const match of matches) {
        let phoneNumber = '';
        
        // Extract digits from the match
        const fullMatch = match[0];
        const digits = fullMatch.replace(/\D/g, '');
        
        // Handle different digit lengths
        if (digits.length === 11 && digits.startsWith('1')) {
          // Remove country code
          phoneNumber = digits.substring(1);
        } else if (digits.length === 10) {
          phoneNumber = digits;
        } else if (digits.length === 7) {
          // Local number without area code - skip for now
          continue;
        } else {
          continue;
        }

        // Validate the phone number
        if (phoneNumber.length === 10) {
          // Check for invalid patterns
          const firstThree = phoneNumber.substring(0, 3);
          
          // Skip invalid area codes (000, 111, etc) and test numbers (555)
          if (firstThree === '000' || firstThree === '111' || firstThree === '999') {
            continue;
          }
          
          // Skip if all digits are the same
          if (/^(\d)\1{9}$/.test(phoneNumber)) {
            continue;
          }
          
          // Skip sequential patterns like 1234567890
          if (phoneNumber === '1234567890' || phoneNumber === '0123456789') {
            continue;
          }

          // Format the phone number consistently
          const formatted = `${phoneNumber.substring(0, 3)}-${phoneNumber.substring(3, 6)}-${phoneNumber.substring(6)}`;
          
          // Avoid duplicates
          if (!processedNumbers.has(phoneNumber)) {
            processedNumbers.add(phoneNumber);
            extractedPhones.push(formatted);
          }
        }
      }
    }

    // If no pattern matched, try extracting raw 10-digit sequence
    const rawDigits = trimmed.replace(/\D/g, '');
    if (rawDigits.length === 10 && !processedNumbers.has(rawDigits)) {
      const formatted = `${rawDigits.substring(0, 3)}-${rawDigits.substring(3, 6)}-${rawDigits.substring(6)}`;
      processedNumbers.add(rawDigits);
      extractedPhones.push(formatted);
    } else if (rawDigits.length === 11 && rawDigits.startsWith('1')) {
      const withoutCountryCode = rawDigits.substring(1);
      if (!processedNumbers.has(withoutCountryCode)) {
        const formatted = `${withoutCountryCode.substring(0, 3)}-${withoutCountryCode.substring(3, 6)}-${withoutCountryCode.substring(6)}`;
        processedNumbers.add(withoutCountryCode);
        extractedPhones.push(formatted);
      }
    }
  }

  // Return primary and secondary phone numbers
  return {
    primary: extractedPhones[0] || null,
    secondary: extractedPhones[1] || null
  };
}

// Run tests
console.log("=== Phone Extraction Test Suite ===\n");
let passed = 0;
let failed = 0;

testData.forEach((test, index) => {
  const result = extractPhoneNumbers(test.phones);
  const isCorrect = result.primary === test.expected.primary && result.secondary === test.expected.secondary;
  
  if (isCorrect) {
    console.log(`✓ Test ${index + 1} (${test.company}): PASSED`);
    passed++;
  } else {
    console.log(`✗ Test ${index + 1} (${test.company}): FAILED`);
    console.log(`  Input: "${test.phones}"`);
    console.log(`  Expected: primary="${test.expected.primary}", secondary="${test.expected.secondary}"`);
    console.log(`  Got:      primary="${result.primary}", secondary="${result.secondary}"`);
    failed++;
  }
});

console.log(`\n=== Test Summary ===`);
console.log(`Total: ${testData.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / testData.length) * 100).toFixed(1)}%`);

// Create a test CSV file
const csvData = testData.map(test => ({
  "Company Name": test.company,
  "Phone": test.phones,
  "Owner Name": "Test Owner",
  "Email": `test@${test.company.toLowerCase().replace(/\s/g, '')}.com`
}));

const csv = Papa.unparse(csvData);
fs.writeFileSync('test_phone_formats.csv', csv);
console.log("\n✓ Test CSV file created: test_phone_formats.csv");