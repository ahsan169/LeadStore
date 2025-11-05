/**
 * Entity Resolution Core
 * Intelligent entity matching and resolution system with multiple algorithms
 */

import { z } from 'zod';
import { Lead, UccFiling } from '@shared/schema';
import { 
  calculateLevenshtein, 
  calculateJaroWinkler, 
  calculateNGramSimilarity,
  calculateTokenSimilarity,
  soundex,
  metaphone,
  normalizeBusinessName,
  normalizePhone,
  normalizeEmail,
  normalizeAddress
} from './matching-algorithms';
import { db } from '../db';
import { leads, entityMatches, entityGroups } from '@shared/schema';
import { eq, and, or, sql, inArray, ne, isNotNull } from 'drizzle-orm';

/**
 * Match types
 */
export enum MatchType {
  EXACT = 'exact',
  FUZZY = 'fuzzy',
  PHONETIC = 'phonetic',
  TOKEN = 'token',
  BUSINESS_VARIANT = 'business_variant',
  COMPOSITE = 'composite'
}

/**
 * Confidence levels for matches
 */
export enum MatchConfidence {
  CERTAIN = 95,    // >95% - Automatic merge candidate
  PROBABLE = 85,   // 85-95% - Review recommended
  POSSIBLE = 70,   // 70-85% - Manual review required
  UNLIKELY = 50,   // 50-70% - Low confidence
  NO_MATCH = 0     // <50% - Not a match
}

/**
 * Field weights for composite matching
 */
export const FIELD_WEIGHTS = {
  businessName: 0.40,
  phone: 0.25,
  email: 0.20,
  address: 0.15
};

/**
 * Entity match result
 */
export interface EntityMatchResult {
  entity1Id: string;
  entity2Id: string;
  confidence: number;
  matchType: MatchType;
  fieldScores: {
    businessName?: number;
    phone?: number;
    email?: number;
    address?: number;
  };
  matchDetails: {
    algorithm: string;
    normalizedValues: Record<string, any>;
    warnings?: string[];
    suggestions?: string[];
  };
  timestamp: Date;
}

/**
 * Blocking strategy for performance
 */
export interface BlockingStrategy {
  field: string;
  type: 'exact' | 'prefix' | 'suffix' | 'phonetic' | 'token';
  length?: number;
}

/**
 * Entity resolution configuration
 */
export interface ResolutionConfig {
  confidenceThreshold: number;
  blockingStrategies: BlockingStrategy[];
  enablePhonetic: boolean;
  enableFuzzy: boolean;
  enableTokenBased: boolean;
  businessVariantHandling: boolean;
  strictMode: boolean;
}

/**
 * Default resolution configuration
 */
export const DEFAULT_CONFIG: ResolutionConfig = {
  confidenceThreshold: MatchConfidence.POSSIBLE,
  blockingStrategies: [
    { field: 'phone', type: 'exact' },
    { field: 'email', type: 'exact' },
    { field: 'businessName', type: 'prefix', length: 3 },
    { field: 'businessName', type: 'phonetic' }
  ],
  enablePhonetic: true,
  enableFuzzy: true,
  enableTokenBased: true,
  businessVariantHandling: true,
  strictMode: false
};

/**
 * Entity Resolution Engine
 */
export class EntityResolutionEngine {
  private config: ResolutionConfig;

  constructor(config: Partial<ResolutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Find potential matches for an entity
   */
  async findMatches(
    entity: Partial<Lead>,
    candidatePool?: Lead[]
  ): Promise<EntityMatchResult[]> {
    // Get candidates using blocking strategies
    const candidates = candidatePool || await this.getCandidates(entity);
    
    // Calculate matches
    const matches: EntityMatchResult[] = [];
    
    for (const candidate of candidates) {
      // Skip self-match
      if (entity.id && candidate.id === entity.id) continue;
      
      const matchResult = await this.calculateMatch(entity, candidate);
      
      if (matchResult.confidence >= this.config.confidenceThreshold) {
        matches.push(matchResult);
      }
    }
    
    // Sort by confidence
    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate match between two entities
   */
  async calculateMatch(
    entity1: Partial<Lead>,
    entity2: Partial<Lead>
  ): Promise<EntityMatchResult> {
    const fieldScores: EntityMatchResult['fieldScores'] = {};
    const normalizedValues: Record<string, any> = {};
    const warnings: string[] = [];
    
    // Match business name
    if (entity1.businessName && entity2.businessName) {
      const norm1 = normalizeBusinessName(entity1.businessName);
      const norm2 = normalizeBusinessName(entity2.businessName);
      
      normalizedValues.businessName = { entity1: norm1, entity2: norm2 };
      
      // Calculate multiple similarity scores
      const scores = [];
      
      // Exact match
      if (norm1 === norm2) {
        scores.push(1.0);
      } else {
        // Fuzzy matching
        if (this.config.enableFuzzy) {
          scores.push(calculateJaroWinkler(norm1, norm2));
          scores.push(calculateLevenshtein(norm1, norm2));
        }
        
        // Phonetic matching
        if (this.config.enablePhonetic) {
          const phonetic1 = metaphone(norm1);
          const phonetic2 = metaphone(norm2);
          scores.push(phonetic1 === phonetic2 ? 0.85 : 0);
        }
        
        // Token-based matching
        if (this.config.enableTokenBased) {
          scores.push(calculateTokenSimilarity(norm1, norm2));
        }
      }
      
      fieldScores.businessName = Math.max(...scores);
    }
    
    // Match phone
    if (entity1.phone && entity2.phone) {
      const norm1 = normalizePhone(entity1.phone);
      const norm2 = normalizePhone(entity2.phone);
      
      normalizedValues.phone = { entity1: norm1, entity2: norm2 };
      
      // Exact match for phone (after normalization)
      fieldScores.phone = norm1 === norm2 ? 1.0 : 0;
      
      // Check secondary phone
      if (!fieldScores.phone && entity1.secondaryPhone && entity2.secondaryPhone) {
        const secNorm1 = normalizePhone(entity1.secondaryPhone);
        const secNorm2 = normalizePhone(entity2.secondaryPhone);
        fieldScores.phone = secNorm1 === secNorm2 ? 0.8 : 0;
      }
    }
    
    // Match email
    if (entity1.email && entity2.email) {
      const norm1 = normalizeEmail(entity1.email);
      const norm2 = normalizeEmail(entity2.email);
      
      normalizedValues.email = { entity1: norm1, entity2: norm2 };
      
      if (norm1 === norm2) {
        fieldScores.email = 1.0;
      } else {
        // Check domain match
        const domain1 = norm1.split('@')[1];
        const domain2 = norm2.split('@')[1];
        fieldScores.email = domain1 === domain2 ? 0.5 : 0;
      }
    }
    
    // Match address
    if (entity1.fullAddress && entity2.fullAddress) {
      const norm1 = normalizeAddress(entity1.fullAddress);
      const norm2 = normalizeAddress(entity2.fullAddress);
      
      normalizedValues.address = { entity1: norm1, entity2: norm2 };
      
      if (norm1 === norm2) {
        fieldScores.address = 1.0;
      } else {
        // Fuzzy match for address
        fieldScores.address = calculateJaroWinkler(norm1, norm2);
      }
    } else if (entity1.city && entity1.state && entity2.city && entity2.state) {
      // Partial address match
      const cityMatch = entity1.city.toLowerCase() === entity2.city.toLowerCase();
      const stateMatch = entity1.state?.toLowerCase() === entity2.state?.toLowerCase();
      fieldScores.address = (cityMatch && stateMatch) ? 0.6 : 0;
    }
    
    // Calculate composite confidence
    const confidence = this.calculateCompositeConfidence(fieldScores);
    
    // Determine match type
    const matchType = this.determineMatchType(fieldScores, confidence);
    
    // Add warnings for edge cases
    if (fieldScores.businessName && fieldScores.businessName > 0.9 && !fieldScores.phone && !fieldScores.email) {
      warnings.push('High business name match but no contact info match - possible false positive');
    }
    
    if (fieldScores.phone === 1.0 && (!fieldScores.businessName || fieldScores.businessName < 0.3)) {
      warnings.push('Phone match but low business name similarity - verify manually');
    }
    
    return {
      entity1Id: entity1.id || '',
      entity2Id: entity2.id || '',
      confidence,
      matchType,
      fieldScores,
      matchDetails: {
        algorithm: this.getAlgorithmDescription(matchType),
        normalizedValues,
        warnings: warnings.length > 0 ? warnings : undefined,
        suggestions: this.generateSuggestions(fieldScores, confidence)
      },
      timestamp: new Date()
    };
  }

  /**
   * Calculate composite confidence score
   */
  private calculateCompositeConfidence(
    fieldScores: EntityMatchResult['fieldScores']
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;
    
    // Business name
    if (fieldScores.businessName !== undefined) {
      weightedSum += fieldScores.businessName * FIELD_WEIGHTS.businessName;
      totalWeight += FIELD_WEIGHTS.businessName;
    }
    
    // Phone
    if (fieldScores.phone !== undefined) {
      weightedSum += fieldScores.phone * FIELD_WEIGHTS.phone;
      totalWeight += FIELD_WEIGHTS.phone;
    }
    
    // Email
    if (fieldScores.email !== undefined) {
      weightedSum += fieldScores.email * FIELD_WEIGHTS.email;
      totalWeight += FIELD_WEIGHTS.email;
    }
    
    // Address
    if (fieldScores.address !== undefined) {
      weightedSum += fieldScores.address * FIELD_WEIGHTS.address;
      totalWeight += FIELD_WEIGHTS.address;
    }
    
    // Calculate final confidence
    const baseConfidence = totalWeight > 0 ? (weightedSum / totalWeight) : 0;
    
    // Apply bonuses/penalties
    let finalConfidence = baseConfidence * 100;
    
    // Bonus for multiple field matches
    const matchedFields = Object.values(fieldScores).filter(s => s && s > 0.5).length;
    if (matchedFields >= 3) {
      finalConfidence = Math.min(100, finalConfidence * 1.1);
    } else if (matchedFields === 1) {
      finalConfidence = Math.min(finalConfidence, 75); // Cap single field matches
    }
    
    return Math.round(finalConfidence);
  }

  /**
   * Determine match type based on scores
   */
  private determineMatchType(
    fieldScores: EntityMatchResult['fieldScores'],
    confidence: number
  ): MatchType {
    // Check for exact match
    const allExact = Object.values(fieldScores).every(s => s === 1.0);
    if (allExact && Object.keys(fieldScores).length >= 2) {
      return MatchType.EXACT;
    }
    
    // Check for business variant
    if (fieldScores.businessName && fieldScores.businessName > 0.7 && 
        fieldScores.businessName < 1.0) {
      return MatchType.BUSINESS_VARIANT;
    }
    
    // Check for phonetic match
    if (this.config.enablePhonetic && confidence > 70) {
      return MatchType.PHONETIC;
    }
    
    // Check for token-based match
    if (this.config.enableTokenBased && confidence > 60) {
      return MatchType.TOKEN;
    }
    
    // Default to composite
    return MatchType.COMPOSITE;
  }

  /**
   * Get candidates using blocking strategies
   */
  private async getCandidates(entity: Partial<Lead>): Promise<Lead[]> {
    const conditions = [];
    
    for (const strategy of this.config.blockingStrategies) {
      const value = entity[strategy.field as keyof Lead];
      if (!value) continue;
      
      switch (strategy.type) {
        case 'exact':
          conditions.push(eq(leads[strategy.field as keyof typeof leads], value));
          break;
        
        case 'prefix':
          if (strategy.length) {
            const prefix = String(value).substring(0, strategy.length).toLowerCase();
            conditions.push(
              sql`LOWER(SUBSTRING(${leads[strategy.field as keyof typeof leads]} FROM 1 FOR ${strategy.length})) = ${prefix}`
            );
          }
          break;
        
        case 'phonetic':
          const phoneticValue = metaphone(String(value));
          // Store phonetic values in a separate index for performance
          conditions.push(
            sql`metaphone(${leads[strategy.field as keyof typeof leads]}) = ${phoneticValue}`
          );
          break;
      }
    }
    
    if (conditions.length === 0) {
      return [];
    }
    
    // Fetch candidates
    const candidates = await db
      .select()
      .from(leads)
      .where(or(...conditions))
      .limit(100);
    
    return candidates;
  }

  /**
   * Get algorithm description
   */
  private getAlgorithmDescription(matchType: MatchType): string {
    switch (matchType) {
      case MatchType.EXACT:
        return 'Exact match on normalized fields';
      case MatchType.FUZZY:
        return 'Fuzzy string matching (Levenshtein/Jaro-Winkler)';
      case MatchType.PHONETIC:
        return 'Phonetic similarity (Metaphone/Soundex)';
      case MatchType.TOKEN:
        return 'Token-based matching (TF-IDF)';
      case MatchType.BUSINESS_VARIANT:
        return 'Business name variant detection';
      case MatchType.COMPOSITE:
        return 'Composite multi-field matching';
      default:
        return 'Unknown matching algorithm';
    }
  }

  /**
   * Generate suggestions based on match results
   */
  private generateSuggestions(
    fieldScores: EntityMatchResult['fieldScores'],
    confidence: number
  ): string[] {
    const suggestions = [];
    
    if (confidence >= MatchConfidence.CERTAIN) {
      suggestions.push('High confidence match - automatic merge recommended');
    } else if (confidence >= MatchConfidence.PROBABLE) {
      suggestions.push('Probable match - review before merging');
    } else if (confidence >= MatchConfidence.POSSIBLE) {
      suggestions.push('Possible match - manual verification required');
    }
    
    // Field-specific suggestions
    if (fieldScores.businessName && fieldScores.businessName < 0.5) {
      suggestions.push('Business names differ significantly - verify if related entities');
    }
    
    if (!fieldScores.phone && !fieldScores.email) {
      suggestions.push('No contact information match - additional verification needed');
    }
    
    return suggestions;
  }

  /**
   * Perform transitive closure to find entity groups
   */
  async findEntityGroups(matches: EntityMatchResult[]): Promise<Map<string, Set<string>>> {
    const groups = new Map<string, Set<string>>();
    const entityToGroup = new Map<string, string>();
    
    for (const match of matches) {
      const entity1Group = entityToGroup.get(match.entity1Id);
      const entity2Group = entityToGroup.get(match.entity2Id);
      
      if (entity1Group && entity2Group && entity1Group !== entity2Group) {
        // Merge groups
        const group1 = groups.get(entity1Group)!;
        const group2 = groups.get(entity2Group)!;
        
        // Move all entities from group2 to group1
        for (const entity of group2) {
          group1.add(entity);
          entityToGroup.set(entity, entity1Group);
        }
        
        groups.delete(entity2Group);
      } else if (entity1Group) {
        // Add entity2 to entity1's group
        groups.get(entity1Group)!.add(match.entity2Id);
        entityToGroup.set(match.entity2Id, entity1Group);
      } else if (entity2Group) {
        // Add entity1 to entity2's group
        groups.get(entity2Group)!.add(match.entity1Id);
        entityToGroup.set(match.entity1Id, entity2Group);
      } else {
        // Create new group
        const groupId = match.entity1Id;
        groups.set(groupId, new Set([match.entity1Id, match.entity2Id]));
        entityToGroup.set(match.entity1Id, groupId);
        entityToGroup.set(match.entity2Id, groupId);
      }
    }
    
    return groups;
  }

  /**
   * Batch entity resolution
   */
  async resolveBatch(entities: Lead[]): Promise<{
    matches: EntityMatchResult[];
    groups: Map<string, Set<string>>;
    statistics: {
      totalEntities: number;
      duplicatesFound: number;
      groupsFormed: number;
      averageConfidence: number;
    };
  }> {
    const allMatches: EntityMatchResult[] = [];
    const processedPairs = new Set<string>();
    
    // Compare all pairs (with optimization)
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const pairKey = `${entities[i].id}-${entities[j].id}`;
        if (processedPairs.has(pairKey)) continue;
        
        const match = await this.calculateMatch(entities[i], entities[j]);
        
        if (match.confidence >= this.config.confidenceThreshold) {
          allMatches.push(match);
        }
        
        processedPairs.add(pairKey);
      }
    }
    
    // Find entity groups through transitive closure
    const groups = await this.findEntityGroups(allMatches);
    
    // Calculate statistics
    const totalDuplicates = Array.from(groups.values())
      .reduce((sum, group) => sum + group.size - 1, 0);
    
    const avgConfidence = allMatches.length > 0
      ? allMatches.reduce((sum, m) => sum + m.confidence, 0) / allMatches.length
      : 0;
    
    return {
      matches: allMatches,
      groups,
      statistics: {
        totalEntities: entities.length,
        duplicatesFound: totalDuplicates,
        groupsFormed: groups.size,
        averageConfidence: Math.round(avgConfidence)
      }
    };
  }
}

// Export singleton instance
export const entityResolution = new EntityResolutionEngine();