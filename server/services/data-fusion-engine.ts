import { Lead, InsertLead } from "@shared/schema";

export interface DataSource {
  sourceName: string;
  timestamp: Date;
  confidence: number;
  data: any;
  apiCalls?: string[];
}

export interface FieldConflict {
  field: string;
  sources: Array<{
    source: string;
    value: any;
    confidence: number;
    timestamp: Date;
  }>;
  resolutionMethod: string;
  resolvedValue: any;
}

export interface DataLineageItem {
  field: string;
  value: any;
  source: string;
  confidence: number;
  timestamp: Date;
  alternatives?: Array<{
    source: string;
    value: any;
    confidence: number;
  }>;
}

export interface DataFusionResult {
  fusedData: Record<string, any>;
  conflicts: FieldConflict[];
  lineage: DataLineageItem[];
  compositeConfidence: number;
  dataQuality: 'high' | 'medium' | 'low';
  validationIssues: string[];
  deduplicationCount: number;
}

export interface FusionOptions {
  conflictResolution?: 'confidence_weighted' | 'most_recent' | 'majority_vote' | 'source_priority';
  deduplication?: boolean;
  validation?: boolean;
  fuzzyMatching?: boolean;
  sourcePriority?: string[]; // Order of source preference
  confidenceThreshold?: number;
}

interface FuzzyMatchResult {
  score: number;
  isMatch: boolean;
  matchType: 'exact' | 'strong' | 'moderate' | 'weak' | 'none';
}

export class DataFusionEngine {
  private readonly DEFAULT_OPTIONS: FusionOptions = {
    conflictResolution: 'confidence_weighted',
    deduplication: true,
    validation: true,
    fuzzyMatching: true,
    confidenceThreshold: 0.6
  };
  
  // Source reliability weights based on historical accuracy
  private sourceReliability: Map<string, number> = new Map([
    ['HunterVerification', 0.95],
    ['NumverifyVerification', 0.95],
    ['UccIntelligence', 0.9],
    ['ComprehensiveEnricher', 0.85],
    ['LeadIntelligence', 0.8],
    ['PerplexityResearch', 0.75],
    ['OpenAI', 0.7],
    ['UserInput', 1.0], // User input is always trusted
    ['Manual', 0.9]
  ]);
  
  // Field importance weights for conflict resolution
  private fieldImportance: Map<string, number> = new Map([
    ['businessName', 1.0],
    ['ownerName', 0.95],
    ['email', 0.9],
    ['phone', 0.85],
    ['annualRevenue', 0.8],
    ['estimatedRevenue', 0.75],
    ['industry', 0.7],
    ['creditScore', 0.7],
    ['websiteUrl', 0.6],
    ['uccNumber', 0.6],
    ['stateCode', 0.6]
  ]);
  
  /**
   * Main fusion method - intelligently merges data from multiple sources
   */
  async fuseData(
    sources: any[],
    originalData: Partial<Lead | InsertLead>,
    options: FusionOptions = {}
  ): Promise<DataFusionResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    console.log(`[DataFusion] Starting fusion of ${sources.length} data sources`);
    
    // Initialize result
    const result: DataFusionResult = {
      fusedData: { ...originalData },
      conflicts: [],
      lineage: [],
      compositeConfidence: 0,
      dataQuality: 'low',
      validationIssues: [],
      deduplicationCount: 0
    };
    
    // Step 1: Normalize and prepare data sources
    const normalizedSources = this.normalizeSources(sources, originalData);
    
    // Step 2: Deduplicate if enabled
    if (opts.deduplication) {
      const dedupResult = this.deduplicateSources(normalizedSources);
      normalizedSources.length = 0;
      normalizedSources.push(...dedupResult.sources);
      result.deduplicationCount = dedupResult.duplicatesRemoved;
    }
    
    // Step 3: Process each field across all sources
    const allFields = this.extractAllFields(normalizedSources);
    
    for (const field of allFields) {
      const fieldValues = this.extractFieldValues(field, normalizedSources);
      
      if (fieldValues.length === 0) continue;
      
      // Check for conflicts
      if (fieldValues.length > 1 && !this.areValuesConsistent(fieldValues, opts.fuzzyMatching)) {
        // Resolve conflict
        const conflict = await this.resolveConflict(field, fieldValues, opts);
        result.conflicts.push(conflict);
        result.fusedData[field] = conflict.resolvedValue;
        
        // Track lineage
        result.lineage.push({
          field,
          value: conflict.resolvedValue,
          source: conflict.sources[0].source, // Primary source
          confidence: conflict.sources[0].confidence,
          timestamp: new Date(),
          alternatives: fieldValues.slice(1).map(fv => ({
            source: fv.source,
            value: fv.value,
            confidence: fv.confidence
          }))
        });
      } else {
        // No conflict or consistent values
        const bestValue = this.selectBestValue(fieldValues, opts);
        result.fusedData[field] = bestValue.value;
        
        // Track lineage
        result.lineage.push({
          field,
          value: bestValue.value,
          source: bestValue.source,
          confidence: bestValue.confidence,
          timestamp: new Date()
        });
      }
    }
    
    // Step 4: Validate fused data
    if (opts.validation) {
      result.validationIssues = await this.validateFusedData(result.fusedData);
    }
    
    // Step 5: Calculate composite confidence
    result.compositeConfidence = this.calculateCompositeConfidence(result);
    
    // Step 6: Determine data quality
    result.dataQuality = this.assessDataQuality(result);
    
    // Step 7: Apply fuzzy matching for related fields
    if (opts.fuzzyMatching) {
      await this.applyFuzzyEnhancements(result);
    }
    
    console.log(`[DataFusion] Fusion complete. Conflicts: ${result.conflicts.length}, Quality: ${result.dataQuality}`);
    
    return result;
  }
  
  /**
   * Normalize data sources into consistent format
   */
  private normalizeSources(sources: any[], originalData: any): DataSource[] {
    const normalized: DataSource[] = [];
    
    // Add original data as a source with high confidence
    if (originalData && Object.keys(originalData).length > 0) {
      normalized.push({
        sourceName: 'Original',
        timestamp: new Date(),
        confidence: 1.0,
        data: originalData
      });
    }
    
    // Process each source
    for (const source of sources) {
      if (!source) continue;
      
      // Detect source type and normalize
      let sourceName = 'Unknown';
      let confidence = 0.5;
      let data = source;
      
      // Try to detect source type
      if (source.intelligenceScore !== undefined) {
        sourceName = 'LeadIntelligence';
        confidence = (source.intelligenceScore || 0) / 100;
        data = source;
      } else if (source.enrichmentMetadata) {
        sourceName = 'ComprehensiveEnricher';
        confidence = source.confidenceScores?.overall || 0.85;
        data = source;
      } else if (source.verificationStatus !== undefined) {
        sourceName = source.email ? 'HunterVerification' : 'NumverifyVerification';
        confidence = source.verificationStatus === 'valid' ? 0.95 : 0.3;
        data = source;
      } else if (source.researchInsights) {
        sourceName = 'PerplexityResearch';
        confidence = 0.75;
        data = source;
      } else if (source.primaryLenderType) {
        sourceName = 'UccIntelligence';
        confidence = 0.9;
        data = source;
      }
      
      // Apply source reliability weight
      const reliabilityWeight = this.sourceReliability.get(sourceName) || 0.5;
      confidence *= reliabilityWeight;
      
      normalized.push({
        sourceName,
        timestamp: new Date(),
        confidence,
        data: this.flattenObject(data)
      });
    }
    
    return normalized;
  }
  
  /**
   * Deduplicate sources that provide identical information
   */
  private deduplicateSources(sources: DataSource[]): { sources: DataSource[]; duplicatesRemoved: number } {
    const uniqueSources: DataSource[] = [];
    const seen = new Set<string>();
    let duplicatesRemoved = 0;
    
    for (const source of sources) {
      const dataHash = this.hashData(source.data);
      if (!seen.has(dataHash)) {
        seen.add(dataHash);
        uniqueSources.push(source);
      } else {
        duplicatesRemoved++;
        // Merge confidence if duplicate found
        const existing = uniqueSources.find(s => this.hashData(s.data) === dataHash);
        if (existing) {
          existing.confidence = Math.max(existing.confidence, source.confidence);
        }
      }
    }
    
    return { sources: uniqueSources, duplicatesRemoved };
  }
  
  /**
   * Extract all unique fields from sources
   */
  private extractAllFields(sources: DataSource[]): string[] {
    const fields = new Set<string>();
    
    for (const source of sources) {
      if (source.data && typeof source.data === 'object') {
        Object.keys(source.data).forEach(field => fields.add(field));
      }
    }
    
    return Array.from(fields);
  }
  
  /**
   * Extract values for a specific field from all sources
   */
  private extractFieldValues(field: string, sources: DataSource[]): Array<{
    source: string;
    value: any;
    confidence: number;
    timestamp: Date;
  }> {
    const values = [];
    
    for (const source of sources) {
      if (source.data && source.data[field] !== undefined && source.data[field] !== null) {
        values.push({
          source: source.sourceName,
          value: source.data[field],
          confidence: source.confidence,
          timestamp: source.timestamp
        });
      }
    }
    
    // Sort by confidence descending, then by timestamp (most recent first)
    values.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.01) {
        return b.confidence - a.confidence;
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
    
    return values;
  }
  
  /**
   * Check if values are consistent (considering fuzzy matching)
   */
  private areValuesConsistent(values: any[], useFuzzyMatching: boolean = true): boolean {
    if (values.length <= 1) return true;
    
    const firstValue = values[0].value;
    const fieldType = this.detectFieldType(firstValue);
    
    for (let i = 1; i < values.length; i++) {
      const currentValue = values[i].value;
      
      if (fieldType === 'string' && useFuzzyMatching) {
        const match = this.fuzzyMatch(firstValue, currentValue);
        if (!match.isMatch) return false;
      } else if (fieldType === 'number') {
        // Allow 10% variance for numbers
        const variance = Math.abs(firstValue - currentValue) / Math.max(firstValue, currentValue);
        if (variance > 0.1) return false;
      } else {
        // Exact match for other types
        if (firstValue !== currentValue) return false;
      }
    }
    
    return true;
  }
  
  /**
   * Resolve conflicts between different values
   */
  private async resolveConflict(
    field: string,
    values: any[],
    options: FusionOptions
  ): Promise<FieldConflict> {
    let resolvedValue: any;
    let resolutionMethod = options.conflictResolution || 'confidence_weighted';
    
    switch (resolutionMethod) {
      case 'confidence_weighted':
        // Select value with highest confidence
        resolvedValue = values[0].value;
        break;
        
      case 'most_recent':
        // Select most recent value
        const mostRecent = values.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
        resolvedValue = mostRecent.value;
        break;
        
      case 'majority_vote':
        // Find most common value
        resolvedValue = this.majorityVote(values);
        break;
        
      case 'source_priority':
        // Use source priority order
        if (options.sourcePriority) {
          const priorityValue = this.selectBySourcePriority(values, options.sourcePriority);
          resolvedValue = priorityValue?.value || values[0].value;
        } else {
          resolvedValue = values[0].value;
        }
        break;
        
      default:
        resolvedValue = values[0].value;
    }
    
    // Apply field-specific resolution rules
    resolvedValue = await this.applyFieldSpecificRules(field, resolvedValue, values);
    
    return {
      field,
      sources: values,
      resolutionMethod,
      resolvedValue
    };
  }
  
  /**
   * Apply field-specific resolution rules
   */
  private async applyFieldSpecificRules(field: string, currentValue: any, allValues: any[]): Promise<any> {
    switch (field) {
      case 'email':
        // Prefer verified emails
        const verifiedEmail = allValues.find(v => v.source === 'HunterVerification' && v.confidence > 0.9);
        return verifiedEmail?.value || currentValue;
        
      case 'phone':
        // Prefer verified phone numbers
        const verifiedPhone = allValues.find(v => v.source === 'NumverifyVerification' && v.confidence > 0.9);
        return verifiedPhone?.value || currentValue;
        
      case 'annualRevenue':
      case 'estimatedRevenue':
        // Average numeric values if they're close
        const numericValues = allValues.filter(v => typeof v.value === 'number');
        if (numericValues.length > 1) {
          const avg = numericValues.reduce((sum, v) => sum + v.value, 0) / numericValues.length;
          const variance = this.calculateVariance(numericValues.map(v => v.value));
          if (variance < 0.2) { // Low variance, use average
            return Math.round(avg);
          }
        }
        return currentValue;
        
      case 'businessName':
      case 'ownerName':
        // Use longest/most complete version
        const longestValue = allValues.sort((a, b) => b.value.length - a.value.length)[0];
        return longestValue.value;
        
      default:
        return currentValue;
    }
  }
  
  /**
   * Select best value when no conflict exists
   */
  private selectBestValue(values: any[], options: FusionOptions): any {
    // Already sorted by confidence and timestamp
    return values[0];
  }
  
  /**
   * Validate the fused data
   */
  private async validateFusedData(data: Record<string, any>): Promise<string[]> {
    const issues: string[] = [];
    
    // Email validation
    if (data.email && !this.isValidEmail(data.email)) {
      issues.push(`Invalid email format: ${data.email}`);
    }
    
    // Phone validation
    if (data.phone && !this.isValidPhone(data.phone)) {
      issues.push(`Invalid phone format: ${data.phone}`);
    }
    
    // URL validation
    if (data.websiteUrl && !this.isValidUrl(data.websiteUrl)) {
      issues.push(`Invalid website URL: ${data.websiteUrl}`);
    }
    
    // Business logic validation
    if (data.yearFounded) {
      const currentYear = new Date().getFullYear();
      if (data.yearFounded > currentYear) {
        issues.push(`Year founded (${data.yearFounded}) is in the future`);
      }
      if (data.yearFounded < 1800) {
        issues.push(`Year founded (${data.yearFounded}) seems unrealistic`);
      }
    }
    
    // Revenue validation
    if (data.annualRevenue && data.employeeCount) {
      const revenuePerEmployee = data.annualRevenue / data.employeeCount;
      if (revenuePerEmployee > 10000000) { // $10M per employee is unusual
        issues.push('Revenue per employee seems unusually high');
      }
    }
    
    // Credit score validation
    if (data.creditScore) {
      const score = typeof data.creditScore === 'string' ? parseInt(data.creditScore) : data.creditScore;
      if (score < 300 || score > 850) {
        issues.push(`Credit score ${score} is outside valid range (300-850)`);
      }
    }
    
    return issues;
  }
  
  /**
   * Calculate composite confidence score
   */
  private calculateCompositeConfidence(result: DataFusionResult): number {
    if (result.lineage.length === 0) return 0;
    
    let totalConfidence = 0;
    let totalWeight = 0;
    
    for (const item of result.lineage) {
      const fieldWeight = this.fieldImportance.get(item.field) || 0.5;
      totalConfidence += item.confidence * fieldWeight;
      totalWeight += fieldWeight;
    }
    
    const baseConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0;
    
    // Adjust for conflicts
    const conflictPenalty = Math.min(0.3, result.conflicts.length * 0.05);
    
    // Adjust for validation issues
    const validationPenalty = Math.min(0.2, result.validationIssues.length * 0.05);
    
    return Math.max(0, Math.min(1, baseConfidence - conflictPenalty - validationPenalty));
  }
  
  /**
   * Assess overall data quality
   */
  private assessDataQuality(result: DataFusionResult): 'high' | 'medium' | 'low' {
    const score = result.compositeConfidence;
    
    if (score >= 0.8 && result.conflicts.length <= 2 && result.validationIssues.length === 0) {
      return 'high';
    } else if (score >= 0.6 && result.conflicts.length <= 5 && result.validationIssues.length <= 2) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  /**
   * Apply fuzzy matching enhancements
   */
  private async applyFuzzyEnhancements(result: DataFusionResult): Promise<void> {
    // Check for name variations
    if (result.fusedData.businessName && result.fusedData.ownerName) {
      // Check if owner name appears in business name (common for small businesses)
      const ownerInBusiness = this.fuzzyMatch(
        result.fusedData.ownerName,
        result.fusedData.businessName,
        0.6
      );
      
      if (ownerInBusiness.isMatch) {
        // Add metadata about this relationship
        result.fusedData.businessType = 'owner-operated';
      }
    }
    
    // Standardize phone numbers
    if (result.fusedData.phone) {
      result.fusedData.phone = this.standardizePhoneNumber(result.fusedData.phone);
    }
    if (result.fusedData.secondaryPhone) {
      result.fusedData.secondaryPhone = this.standardizePhoneNumber(result.fusedData.secondaryPhone);
    }
    
    // Standardize addresses
    if (result.fusedData.fullAddress) {
      result.fusedData.fullAddress = this.standardizeAddress(result.fusedData.fullAddress);
    }
  }
  
  /**
   * Fuzzy string matching
   */
  private fuzzyMatch(str1: string, str2: string, threshold: number = 0.8): FuzzyMatchResult {
    if (!str1 || !str2) {
      return { score: 0, isMatch: false, matchType: 'none' };
    }
    
    // Normalize strings
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) {
      return { score: 1, isMatch: true, matchType: 'exact' };
    }
    
    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    const score = 1 - (distance / maxLength);
    
    let matchType: FuzzyMatchResult['matchType'] = 'none';
    if (score >= 0.95) matchType = 'strong';
    else if (score >= 0.8) matchType = 'moderate';
    else if (score >= 0.6) matchType = 'weak';
    
    return {
      score,
      isMatch: score >= threshold,
      matchType
    };
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  /**
   * Majority vote for conflict resolution
   */
  private majorityVote(values: any[]): any {
    const votes = new Map<string, number>();
    
    for (const item of values) {
      const key = JSON.stringify(item.value);
      votes.set(key, (votes.get(key) || 0) + item.confidence);
    }
    
    let maxVotes = 0;
    let winner = values[0].value;
    
    for (const [key, voteCount] of Array.from(votes.entries())) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winner = JSON.parse(key);
      }
    }
    
    return winner;
  }
  
  /**
   * Select value based on source priority
   */
  private selectBySourcePriority(values: any[], priority: string[]): any {
    for (const sourceName of priority) {
      const match = values.find(v => v.source === sourceName);
      if (match) return match;
    }
    return values[0];
  }
  
  /**
   * Helper methods
   */
  
  private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    if (!obj || typeof obj !== 'object') {
      return { [prefix || 'value']: obj };
    }
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }
    
    return flattened;
  }
  
  private hashData(data: any): string {
    return JSON.stringify(data, Object.keys(data).sort());
  }
  
  private detectFieldType(value: any): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'unknown';
  }
  
  private calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / numbers.length;
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }
  
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    const digits = phone.replace(/\D/g, '');
    return phoneRegex.test(phone) && digits.length >= 10 && digits.length <= 15;
  }
  
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  private standardizePhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as US phone number if 10 or 11 digits
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone; // Return original if can't standardize
  }
  
  private standardizeAddress(address: string): string {
    // Basic address standardization
    return address
      .replace(/\bSt\b/gi, 'Street')
      .replace(/\bAve\b/gi, 'Avenue')
      .replace(/\bBlvd\b/gi, 'Boulevard')
      .replace(/\bDr\b/gi, 'Drive')
      .replace(/\bLn\b/gi, 'Lane')
      .replace(/\bRd\b/gi, 'Road')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Update source reliability based on feedback
   */
  updateSourceReliability(sourceName: string, adjustment: number): void {
    const current = this.sourceReliability.get(sourceName) || 0.5;
    const updated = Math.max(0.1, Math.min(1.0, current + adjustment));
    this.sourceReliability.set(sourceName, updated);
    console.log(`[DataFusion] Updated reliability for ${sourceName}: ${current} → ${updated}`);
  }
  
  /**
   * Get current source reliability scores
   */
  getSourceReliability(): Map<string, number> {
    return new Map(this.sourceReliability);
  }
}

// Export singleton instance
export const dataFusionEngine = new DataFusionEngine();