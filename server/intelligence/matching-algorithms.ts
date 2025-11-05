/**
 * Advanced Matching Algorithms Service
 * String similarity functions and business-specific normalizations
 */

/**
 * Calculate Levenshtein distance between two strings
 */
export function calculateLevenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Create a 2D array for dynamic programming
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  
  // Initialize base cases
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],    // Deletion
          dp[i][j - 1],    // Insertion
          dp[i - 1][j - 1] // Substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate normalized Levenshtein similarity (0-1)
 */
export function calculateLevenshtein(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  
  const distance = calculateLevenshteinDistance(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Calculate Jaro similarity
 */
function calculateJaro(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (matches2[j] || str1[i] !== str2[j]) continue;
      matches1[i] = true;
      matches2[j] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!matches1[i]) continue;
    while (!matches2[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }
  
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Calculate Jaro-Winkler similarity
 */
export function calculateJaroWinkler(str1: string, str2: string): number {
  const jaroSim = calculateJaro(str1, str2);
  
  // Find common prefix length (up to 4 characters)
  let prefixLen = 0;
  for (let i = 0; i < Math.min(str1.length, str2.length, 4); i++) {
    if (str1[i] === str2[i]) {
      prefixLen++;
    } else {
      break;
    }
  }
  
  // Winkler modification
  const p = 0.1; // Scaling factor
  return jaroSim + (prefixLen * p * (1 - jaroSim));
}

/**
 * Calculate N-gram similarity
 */
export function calculateNGramSimilarity(str1: string, str2: string, n: number = 2): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  if (str1.length < n || str2.length < n) return 0;
  
  const getNGrams = (str: string): Set<string> => {
    const ngrams = new Set<string>();
    for (let i = 0; i <= str.length - n; i++) {
      ngrams.add(str.substring(i, i + n));
    }
    return ngrams;
  };
  
  const ngrams1 = getNGrams(str1);
  const ngrams2 = getNGrams(str2);
  
  const intersection = new Set([...ngrams1].filter(x => ngrams2.has(x)));
  const union = new Set([...ngrams1, ...ngrams2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Calculate Longest Common Subsequence length
 */
export function calculateLCS(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate token-based similarity (simplified TF-IDF)
 */
export function calculateTokenSimilarity(str1: string, str2: string): number {
  const tokenize = (str: string): string[] => {
    return str.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(token => token.length > 0);
  };
  
  const tokens1 = tokenize(str1);
  const tokens2 = tokenize(str2);
  
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  // Jaccard similarity
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  
  // Consider token order (simplified)
  let orderBonus = 0;
  const minLen = Math.min(tokens1.length, tokens2.length);
  for (let i = 0; i < minLen; i++) {
    if (tokens1[i] === tokens2[i]) {
      orderBonus += 1 / minLen;
    }
  }
  
  return (jaccard * 0.7 + orderBonus * 0.3);
}

/**
 * Soundex algorithm for phonetic matching
 */
export function soundex(str: string): string {
  if (!str) return '';
  
  const s = str.toUpperCase();
  const soundexMap: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };
  
  let result = s[0];
  let prevCode = soundexMap[s[0]] || '0';
  
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = soundexMap[s[i]] || '0';
    if (code !== '0' && code !== prevCode) {
      result += code;
      prevCode = code;
    } else if (code === '0') {
      prevCode = '0';
    }
  }
  
  return result.padEnd(4, '0');
}

/**
 * Metaphone algorithm for phonetic matching
 */
export function metaphone(str: string): string {
  if (!str) return '';
  
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '';
  
  let result = '';
  let i = 0;
  
  // Handle initial letters
  if (s.startsWith('KN') || s.startsWith('GN') || s.startsWith('PN') || 
      s.startsWith('AE') || s.startsWith('WR')) {
    i = 1;
  }
  if (s[0] === 'X') {
    result = 'S';
    i = 1;
  }
  if (s.startsWith('WH')) {
    result = 'W';
    i = 2;
  }
  
  // Process rest of string
  while (i < s.length && result.length < 4) {
    const char = s[i];
    const next = s[i + 1] || '';
    
    switch (char) {
      case 'A': case 'E': case 'I': case 'O': case 'U':
        if (i === 0) result += char;
        break;
      case 'B':
        if (i !== s.length - 1 || s[i - 1] !== 'M') result += 'B';
        break;
      case 'C':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' || next === 'E' || next === 'Y') {
          result += 'S';
        } else {
          result += 'K';
        }
        break;
      case 'D':
        if (next === 'G' && (s[i + 2] === 'E' || s[i + 2] === 'Y' || s[i + 2] === 'I')) {
          result += 'J';
          i += 2;
        } else {
          result += 'T';
        }
        break;
      case 'F': case 'J': case 'L': case 'M': case 'N': case 'R':
        result += char;
        break;
      case 'G':
        if (next === 'H' && s[i + 2] !== 'T') {
          i++;
        } else if (next === 'N' && i === s.length - 2) {
          i++;
        } else if (next !== 'G') {
          result += 'K';
        }
        break;
      case 'H':
        if (i > 0 && 'AEIOU'.includes(s[i - 1]) && !('AEIOU'.includes(next))) {
          // Silent H
        } else if (i === 0 || 'AEIOU'.includes(s[i - 1])) {
          result += 'H';
        }
        break;
      case 'K':
        if (i === 0 || s[i - 1] !== 'C') result += 'K';
        break;
      case 'P':
        result += next === 'H' ? 'F' : 'P';
        if (next === 'H') i++;
        break;
      case 'Q':
        result += 'K';
        break;
      case 'S':
        if (next === 'H') {
          result += 'X';
          i++;
        } else if (next === 'I' && (s[i + 2] === 'O' || s[i + 2] === 'A')) {
          result += 'X';
        } else {
          result += 'S';
        }
        break;
      case 'T':
        if (next === 'H') {
          result += '0';
          i++;
        } else if (next === 'I' && (s[i + 2] === 'O' || s[i + 2] === 'A')) {
          result += 'X';
        } else {
          result += 'T';
        }
        break;
      case 'V':
        result += 'F';
        break;
      case 'W':
      case 'Y':
        if ('AEIOU'.includes(next)) result += char;
        break;
      case 'X':
        result += 'KS';
        break;
      case 'Z':
        result += 'S';
        break;
    }
    i++;
  }
  
  return result;
}

/**
 * Business name normalization
 */
export function normalizeBusinessName(name: string): string {
  if (!name) return '';
  
  let normalized = name.toUpperCase().trim();
  
  // Remove common business suffixes
  const suffixes = [
    ' LLC', ' L.L.C.', ' L L C',
    ' INC', ' INC.', ' INCORPORATED',
    ' CORP', ' CORP.', ' CORPORATION',
    ' LTD', ' LTD.', ' LIMITED',
    ' CO', ' CO.',
    ' COMPANY',
    ' GROUP',
    ' PARTNERS',
    ' PARTNERSHIP',
    ' LP', ' L.P.',
    ' LLP', ' L.L.P.',
    ' PC', ' P.C.',
    ' PA', ' P.A.',
    ' PLLC', ' P.L.L.C.'
  ];
  
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.substring(0, normalized.length - suffix.length);
      break;
    }
  }
  
  // Handle DBA (Doing Business As)
  normalized = normalized.replace(/ DBA /, ' ');
  normalized = normalized.replace(/ D\/B\/A /, ' ');
  normalized = normalized.replace(/ D\.B\.A\. /, ' ');
  
  // Remove special characters but keep spaces
  normalized = normalized.replace(/[^\w\s]/g, ' ');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Remove common words that don't add value
  const stopWords = ['THE', 'AND', 'OF', 'FOR', 'A', 'AN'];
  const words = normalized.split(' ');
  normalized = words.filter(word => !stopWords.includes(word)).join(' ');
  
  return normalized;
}

/**
 * Phone number normalization
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');
  
  // Remove country code if present (assuming US numbers)
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.substring(1);
  }
  
  // Ensure 10 digits for US numbers
  if (normalized.length === 10) {
    return normalized;
  }
  
  // Handle extensions (keep only main number)
  if (normalized.length > 10) {
    return normalized.substring(0, 10);
  }
  
  // Return as-is if less than 10 digits (might be partial)
  return normalized;
}

/**
 * Email normalization
 */
export function normalizeEmail(email: string): string {
  if (!email) return '';
  
  // Convert to lowercase and trim
  let normalized = email.toLowerCase().trim();
  
  // Remove dots from Gmail addresses (before @)
  if (normalized.includes('@gmail.com')) {
    const [localPart, domain] = normalized.split('@');
    const cleanLocal = localPart.replace(/\./g, '');
    // Remove everything after + (Gmail aliases)
    const finalLocal = cleanLocal.split('+')[0];
    normalized = finalLocal + '@' + domain;
  }
  
  // Handle other common email providers similarly
  const providers = ['outlook.com', 'hotmail.com', 'yahoo.com'];
  for (const provider of providers) {
    if (normalized.includes(`@${provider}`)) {
      const [localPart, domain] = normalized.split('@');
      // Remove everything after + (aliases)
      const finalLocal = localPart.split('+')[0];
      normalized = finalLocal + '@' + domain;
      break;
    }
  }
  
  return normalized;
}

/**
 * Address normalization
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';
  
  let normalized = address.toUpperCase().trim();
  
  // Street abbreviations
  const streetAbbreviations: Record<string, string> = {
    'STREET': 'ST',
    'AVENUE': 'AVE',
    'ROAD': 'RD',
    'BOULEVARD': 'BLVD',
    'DRIVE': 'DR',
    'LANE': 'LN',
    'COURT': 'CT',
    'PLACE': 'PL',
    'SQUARE': 'SQ',
    'CIRCLE': 'CIR',
    'TRAIL': 'TRL',
    'PARKWAY': 'PKWY',
    'HIGHWAY': 'HWY',
    'SUITE': 'STE',
    'APARTMENT': 'APT',
    'BUILDING': 'BLDG',
    'FLOOR': 'FL',
    'UNIT': 'UNIT',
    'NORTH': 'N',
    'SOUTH': 'S',
    'EAST': 'E',
    'WEST': 'W',
    'NORTHEAST': 'NE',
    'NORTHWEST': 'NW',
    'SOUTHEAST': 'SE',
    'SOUTHWEST': 'SW'
  };
  
  // Replace full words with abbreviations
  for (const [full, abbrev] of Object.entries(streetAbbreviations)) {
    const regex = new RegExp(`\\b${full}\\b`, 'g');
    normalized = normalized.replace(regex, abbrev);
  }
  
  // Remove apartment/suite numbers for matching (they often differ)
  normalized = normalized.replace(/\b(APT|STE|UNIT|#)\s*\w+\b/g, '');
  
  // Remove periods and commas
  normalized = normalized.replace(/[.,]/g, '');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Extract and normalize ZIP code
 */
export function extractZipCode(address: string): string | null {
  if (!address) return null;
  
  // Match 5-digit or 9-digit ZIP codes
  const zipMatch = address.match(/\b(\d{5})(?:-(\d{4}))?\b/);
  
  if (zipMatch) {
    return zipMatch[1]; // Return 5-digit ZIP
  }
  
  return null;
}

/**
 * City/State extraction and normalization
 */
export function extractCityState(address: string): { city: string | null; state: string | null } {
  if (!address) return { city: null, state: null };
  
  // Common state abbreviations
  const stateAbbreviations = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];
  
  // Try to match city, state pattern
  const stateRegex = new RegExp(`\\b(${stateAbbreviations.join('|')})\\b`);
  const stateMatch = address.match(stateRegex);
  
  if (stateMatch) {
    const state = stateMatch[1];
    // Extract city (usually comes before state)
    const beforeState = address.substring(0, stateMatch.index).trim();
    const parts = beforeState.split(/[,\s]+/);
    const city = parts[parts.length - 1] || null;
    
    return { city, state };
  }
  
  return { city: null, state: null };
}

/**
 * Calculate composite address similarity
 */
export function calculateAddressSimilarity(addr1: string, addr2: string): number {
  const norm1 = normalizeAddress(addr1);
  const norm2 = normalizeAddress(addr2);
  
  // If normalized addresses are identical
  if (norm1 === norm2) return 1.0;
  
  // Compare ZIP codes
  const zip1 = extractZipCode(addr1);
  const zip2 = extractZipCode(addr2);
  let zipScore = 0;
  if (zip1 && zip2) {
    zipScore = zip1 === zip2 ? 1.0 : 0;
  }
  
  // Compare city/state
  const cs1 = extractCityState(addr1);
  const cs2 = extractCityState(addr2);
  let cityStateScore = 0;
  if (cs1.city && cs2.city && cs1.state && cs2.state) {
    const cityMatch = cs1.city.toUpperCase() === cs2.city.toUpperCase();
    const stateMatch = cs1.state === cs2.state;
    cityStateScore = (cityMatch ? 0.5 : 0) + (stateMatch ? 0.5 : 0);
  }
  
  // Street-level similarity
  const streetScore = calculateJaroWinkler(norm1, norm2);
  
  // Weighted combination
  return (streetScore * 0.5 + zipScore * 0.3 + cityStateScore * 0.2);
}

/**
 * Business entity type detection
 */
export function detectBusinessType(name: string): string | null {
  const upperName = name.toUpperCase();
  
  if (upperName.includes('LLC') || upperName.includes('L.L.C.')) return 'LLC';
  if (upperName.includes('INC') || upperName.includes('INCORPORATED')) return 'Corporation';
  if (upperName.includes('CORP') || upperName.includes('CORPORATION')) return 'Corporation';
  if (upperName.includes('LTD') || upperName.includes('LIMITED')) return 'Limited';
  if (upperName.includes('LLP') || upperName.includes('L.L.P.')) return 'LLP';
  if (upperName.includes('LP') || upperName.includes('L.P.')) return 'LP';
  if (upperName.includes('PC') || upperName.includes('P.C.')) return 'PC';
  if (upperName.includes('PA') || upperName.includes('P.A.')) return 'PA';
  if (upperName.includes('PLLC') || upperName.includes('P.L.L.C.')) return 'PLLC';
  
  return null;
}