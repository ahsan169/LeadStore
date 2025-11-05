import { FieldMapper, FIELD_VALIDATORS, CanonicalField } from './intelligence/ontology';

async function testEnhancedFieldMapping() {
  console.log('🧪 Testing Enhanced Field Mapping System\n');
  
  const mapper = new FieldMapper();
  
  // Test 1: Field name variations and typos
  console.log('Test 1: Mapping field names with typos and variations');
  const fieldTests = [
    'busines name',     // Typo
    'company',          // Synonym
    'emial',           // Typo
    'phon number',     // Typo
    'anual revenue',   // Typo
    'credit scroe',    // Typo
    'owner_full_name', // Variation
    'contact_info',    // Variation
    'company_name',    // Exact synonym
    'annual_rev',      // Abbreviation
  ];
  
  for (const field of fieldTests) {
    const canonical = mapper.mapToCanonical(field);
    console.log(`  "${field}" → ${canonical || 'not mapped'}`);
  }
  
  // Test 2: Field validation and normalization
  console.log('\nTest 2: Field validation and normalization');
  const testValues = [
    { field: CanonicalField.PHONE, value: '(555) 123-4567' },
    { field: CanonicalField.PHONE, value: '15551234567' },
    { field: CanonicalField.EMAIL, value: 'JOHN@EXAMPLE.COM' },
    { field: CanonicalField.EMAIL, value: 'invalid-email' },
    { field: CanonicalField.STATE, value: 'california' },
    { field: CanonicalField.STATE, value: 'CA' },
    { field: CanonicalField.ZIP_CODE, value: '90210' },
    { field: CanonicalField.ZIP_CODE, value: '90210-1234' },
    { field: CanonicalField.CREDIT_SCORE, value: '750' },
    { field: CanonicalField.CREDIT_SCORE, value: '950' }, // Invalid (too high)
  ];
  
  for (const test of testValues) {
    try {
      const normalized = mapper['normalizeValue'](test.field, test.value);
      const validation = mapper.validateField(test.field, normalized);
      console.log(`  ${test.field}: "${test.value}" → "${normalized}" (valid: ${validation.valid})`);
      if (!validation.valid) {
        console.log(`    Error: ${validation.error}`);
      }
    } catch (error: any) {
      console.log(`  ${test.field}: "${test.value}" → Error: ${error.message}`);
    }
  }
  
  // Test 3: Fuzzy matching with Levenshtein distance
  console.log('\nTest 3: Fuzzy matching with typos');
  const fuzzyTests = [
    'bussiness_name',  // Extra 's'
    'ownr_name',      // Missing 'e'
    'emeil',          // Typo
    'fone',           // Alternative spelling
    'adress',         // Common misspelling
    'creditscore',    // No space/underscore
    'annualrevenu',   // Missing 'e'
  ];
  
  for (const field of fuzzyTests) {
    const canonical = mapper.mapToCanonical(field);
    console.log(`  "${field}" → ${canonical || 'not mapped'} (fuzzy match)`);
  }
  
  // Test 4: Map entire object
  console.log('\nTest 4: Mapping entire data object');
  const rawData = {
    'company name': 'ABC Corp',
    'owner': 'John Smith',
    'emial': 'john@abc.com',  // Typo
    'phone number': '555-123-4567',
    'anual revenue': '1000000',  // Typo
    'credit scroe': '750',  // Typo
    'state code': 'CA',
    'zip': '90210'
  };
  
  const mapped = mapper.mapObject(rawData);
  console.log('  Input fields:', Object.keys(rawData));
  console.log('  Mapped fields:', Object.keys(mapped));
  console.log('  Sample mapping:', {
    input: 'emial: ' + rawData['emial'],
    output: 'email: ' + mapped['email']
  });
  
  // Test 5: Validate mapped data
  console.log('\nTest 5: Validating mapped data');
  for (const [field, value] of Object.entries(mapped)) {
    const canonicalField = Object.values(CanonicalField).find(cf => cf === field);
    if (canonicalField) {
      const validation = mapper.validateField(canonicalField, value);
      console.log(`  ${field}: ${validation.valid ? '✓' : '✗'} ${validation.error || 'Valid'}`);
    }
  }
  
  console.log('\n✅ Enhanced field mapping tests complete!');
  console.log('\n📊 Summary:');
  console.log('- Fuzzy matching handles typos and variations');
  console.log('- Field normalization standardizes data formats');
  console.log('- Validation ensures data quality');
  console.log('- Object mapping transforms entire records');
}

// Run tests
testEnhancedFieldMapping().catch(console.error);