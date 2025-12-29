/**
 * Duplicate Detection System
 * Real-time and batch duplicate detection with configurable thresholds
 */

import { EntityResolutionEngine, EntityMatchResult, MatchConfidence } from './entity-resolution';
import { Lead, InsertLead } from '@shared/schema';
import { db } from '../db';
import { leads, entityMatches, entityGroups } from '@shared/schema';
import { eq, and, or, sql, gte, lte, inArray, ne, isNotNull } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';

/**
 * Duplicate detection mode
 */
export enum DetectionMode {
  REAL_TIME = 'real_time',
  BATCH = 'batch',
  INCREMENTAL = 'incremental'
}

/**
 * Duplicate status
 */
export enum DuplicateStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  MERGED = 'merged',
  IGNORED = 'ignored'
}

/**
 * Duplicate cluster
 */
export interface DuplicateCluster {
  id: string;
  entities: Lead[];
  masterEntity?: Lead;
  confidence: number;
  matchType: string;
  createdAt: Date;
  status: DuplicateStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  mergeRecommendation?: MergeRecommendation;
}

/**
 * Merge recommendation
 */
export interface MergeRecommendation {
  masterEntityId: string;
  mergeStrategy: 'keep_newest' | 'keep_oldest' | 'keep_most_complete' | 'manual';
  fieldConflicts: FieldConflict[];
  confidence: number;
  reason: string;
}

/**
 * Field conflict
 */
export interface FieldConflict {
  field: string;
  values: Array<{ entityId: string; value: any }>;
  resolution: 'use_master' | 'use_most_recent' | 'concatenate' | 'manual';
  recommendedValue?: any;
}

/**
 * Detection configuration
 */
export interface DetectionConfig {
  mode: DetectionMode;
  thresholds: {
    certain: number;    // >95%
    probable: number;   // 85-95%
    possible: number;   // 70-85%
  };
  autoMerge: boolean;
  autoMergeThreshold: number;
  batchSize: number;
  enableClustering: boolean;
  maxClusterSize: number;
}

/**
 * Default detection configuration
 */
export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  mode: DetectionMode.REAL_TIME,
  thresholds: {
    certain: MatchConfidence.CERTAIN,
    probable: MatchConfidence.PROBABLE,
    possible: MatchConfidence.POSSIBLE
  },
  autoMerge: false,
  autoMergeThreshold: MatchConfidence.CERTAIN,
  batchSize: 100,
  enableClustering: true,
  maxClusterSize: 10
};

/**
 * Detection statistics
 */
export interface DetectionStats {
  totalChecked: number;
  duplicatesFound: number;
  clustersFormed: number;
  autoMerged: number;
  pendingReview: number;
  processingTime: number;
  confidenceDistribution: {
    certain: number;
    probable: number;
    possible: number;
    unlikely: number;
  };
}

/**
 * Duplicate Detection Service
 */
export class DuplicateDetector {
  private resolutionEngine: EntityResolutionEngine;
  private config: DetectionConfig;
  private detectionCache: Map<string, EntityMatchResult[]>;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config };
    this.resolutionEngine = new EntityResolutionEngine({
      confidenceThreshold: this.config.thresholds.possible
    });
    this.detectionCache = new Map();
  }

  /**
   * Real-time duplicate check for a single entity
   */
  async checkForDuplicates(entity: Partial<Lead>): Promise<{
    isDuplicate: boolean;
    matches: EntityMatchResult[];
    recommendation: string;
  }> {
    // Check cache first
    const cacheKey = this.generateCacheKey(entity);
    if (this.detectionCache.has(cacheKey)) {
      const cached = this.detectionCache.get(cacheKey)!;
      return {
        isDuplicate: cached.length > 0,
        matches: cached,
        recommendation: this.generateRecommendation(cached)
      };
    }

    // Find matches
    const matches = await this.resolutionEngine.findMatches(entity);
    
    // Filter by confidence threshold
    const significantMatches = matches.filter(
      m => m.confidence >= this.config.thresholds.possible
    );

    // Cache results
    this.detectionCache.set(cacheKey, significantMatches);

    // Emit event for real-time notifications
    if (significantMatches.length > 0) {
      eventBus.emit('duplicate-detected', {
        entity,
        matches: significantMatches,
        timestamp: new Date()
      });
    }

    return {
      isDuplicate: significantMatches.length > 0,
      matches: significantMatches,
      recommendation: this.generateRecommendation(significantMatches)
    };
  }

  /**
   * Batch duplicate detection
   */
  async detectBatchDuplicates(
    entities: Lead[],
    onProgress?: (progress: number) => void
  ): Promise<{
    clusters: DuplicateCluster[];
    stats: DetectionStats;
  }> {
    const startTime = Date.now();
    const stats: DetectionStats = {
      totalChecked: entities.length,
      duplicatesFound: 0,
      clustersFormed: 0,
      autoMerged: 0,
      pendingReview: 0,
      processingTime: 0,
      confidenceDistribution: {
        certain: 0,
        probable: 0,
        possible: 0,
        unlikely: 0
      }
    };

    // Process in batches
    const clusters: DuplicateCluster[] = [];
    const processedPairs = new Set<string>();
    
    for (let i = 0; i < entities.length; i += this.config.batchSize) {
      const batch = entities.slice(i, Math.min(i + this.config.batchSize, entities.length));
      
      // Resolve batch
      const batchResult = await this.resolutionEngine.resolveBatch(batch);
      
      // Update stats
      stats.duplicatesFound += batchResult.statistics.duplicatesFound;
      
      // Create clusters from groups
      if (this.config.enableClustering) {
        const batchClusters = await this.createClusters(
          batchResult.matches,
          batchResult.groups,
          batch
        );
        clusters.push(...batchClusters);
        stats.clustersFormed += batchClusters.length;
      }
      
      // Update confidence distribution
      for (const match of batchResult.matches) {
        if (match.confidence >= this.config.thresholds.certain) {
          stats.confidenceDistribution.certain++;
        } else if (match.confidence >= this.config.thresholds.probable) {
          stats.confidenceDistribution.probable++;
        } else if (match.confidence >= this.config.thresholds.possible) {
          stats.confidenceDistribution.possible++;
        } else {
          stats.confidenceDistribution.unlikely++;
        }
      }
      
      // Report progress
      if (onProgress) {
        const progress = ((i + batch.length) / entities.length) * 100;
        onProgress(Math.round(progress));
      }
    }

    // Auto-merge if enabled
    if (this.config.autoMerge) {
      const autoMergeCandidates = clusters.filter(
        c => c.confidence >= this.config.autoMergeThreshold
      );
      
      for (const cluster of autoMergeCandidates) {
        const merged = await this.autoMergeCluster(cluster);
        if (merged) {
          stats.autoMerged++;
          cluster.status = DuplicateStatus.MERGED;
        }
      }
    }

    // Count pending reviews
    stats.pendingReview = clusters.filter(
      c => c.status === DuplicateStatus.PENDING
    ).length;

    stats.processingTime = Date.now() - startTime;

    return { clusters, stats };
  }

  /**
   * Create duplicate clusters from matches
   */
  private async createClusters(
    matches: EntityMatchResult[],
    groups: Map<string, Set<string>>,
    entities: Lead[]
  ): Promise<DuplicateCluster[]> {
    const clusters: DuplicateCluster[] = [];
    const entityMap = new Map(entities.map(e => [e.id, e]));

    for (const [groupId, entityIds] of Array.from(groups.entries())) {
      // Limit cluster size
      if (entityIds.size > this.config.maxClusterSize) {
        console.warn(`Cluster ${groupId} exceeds max size (${entityIds.size}), splitting...`);
        // Split large clusters
        const subClusters = this.splitLargeCluster(entityIds, matches);
        for (const subCluster of subClusters) {
          clusters.push(await this.createClusterFromGroup(subCluster, matches, entityMap));
        }
      } else {
        clusters.push(await this.createClusterFromGroup(entityIds, matches, entityMap));
      }
    }

    return clusters;
  }

  /**
   * Create a cluster from a group of entity IDs
   */
  private async createClusterFromGroup(
    entityIds: Set<string>,
    matches: EntityMatchResult[],
    entityMap: Map<string, Lead>
  ): Promise<DuplicateCluster> {
    const clusterEntities = Array.from(entityIds)
      .map(id => entityMap.get(id))
      .filter(e => e !== undefined) as Lead[];

    // Calculate average confidence for the cluster
    const relevantMatches = matches.filter(
      m => entityIds.has(m.entity1Id) && entityIds.has(m.entity2Id)
    );
    
    const avgConfidence = relevantMatches.length > 0
      ? relevantMatches.reduce((sum, m) => sum + m.confidence, 0) / relevantMatches.length
      : 0;

    // Determine master entity
    const masterEntity = await this.selectMasterEntity(clusterEntities);

    // Generate merge recommendation
    const mergeRecommendation = await this.generateMergeRecommendation(
      clusterEntities,
      masterEntity,
      relevantMatches
    );

    return {
      id: `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entities: clusterEntities,
      masterEntity,
      confidence: Math.round(avgConfidence),
      matchType: this.determineClusterMatchType(relevantMatches),
      createdAt: new Date(),
      status: DuplicateStatus.PENDING,
      mergeRecommendation
    };
  }

  /**
   * Split large clusters into smaller ones
   */
  private splitLargeCluster(
    entityIds: Set<string>,
    matches: EntityMatchResult[]
  ): Array<Set<string>> {
    const subClusters: Array<Set<string>> = [];
    const remaining = new Set(entityIds);
    
    while (remaining.size > 0) {
      const subCluster = new Set<string>();
      const seed = remaining.values().next().value as string;
      subCluster.add(seed);
      remaining.delete(seed);
      
      // Add closely related entities up to max size
      for (const entityId of Array.from(remaining)) {
        if (subCluster.size >= this.config.maxClusterSize) break;
        
        // Check if entity is closely related to cluster
        const isRelated = matches.some(m => 
          (m.entity1Id === entityId && subCluster.has(m.entity2Id)) ||
          (m.entity2Id === entityId && subCluster.has(m.entity1Id))
        );
        
        if (isRelated) {
          subCluster.add(entityId);
          remaining.delete(entityId);
        }
      }
      
      subClusters.push(subCluster);
    }
    
    return subClusters;
  }

  /**
   * Select master entity from a cluster
   */
  private async selectMasterEntity(entities: Lead[]): Promise<Lead> {
    if (entities.length === 0) {
      throw new Error('Cannot select master from empty cluster');
    }
    
    if (entities.length === 1) {
      return entities[0];
    }

    // Score each entity based on completeness and quality
    const scores = entities.map(entity => {
      let score = 0;
      
      // Data completeness
      if (entity.businessName) score += 10;
      if (entity.email) score += 8;
      if (entity.phone) score += 8;
      if (entity.fullAddress) score += 6;
      if (entity.industry) score += 4;
      if (entity.annualRevenue) score += 5;
      
      // Quality indicators
      if (entity.isEnriched) score += 15;
      if (entity.qualityScore) score += entity.qualityScore / 10;
      if (entity.intelligenceScore) score += entity.intelligenceScore / 10;
      
      // Freshness
      const age = Date.now() - entity.uploadedAt.getTime();
      const daysSinceUpload = age / (1000 * 60 * 60 * 24);
      score -= daysSinceUpload * 0.5; // Penalize older records
      
      return { entity, score };
    });

    // Sort by score and return the best
    scores.sort((a, b) => b.score - a.score);
    return scores[0].entity;
  }

  /**
   * Generate merge recommendation
   */
  private async generateMergeRecommendation(
    entities: Lead[],
    masterEntity: Lead,
    matches: EntityMatchResult[]
  ): Promise<MergeRecommendation> {
    const fieldConflicts: FieldConflict[] = [];
    
    // Check for field conflicts
    const fields = [
      'businessName', 'email', 'phone', 'industry', 
      'annualRevenue', 'fullAddress', 'creditScore'
    ];
    
    for (const field of fields) {
      const values = new Map<any, string[]>();
      
      for (const entity of entities) {
        const value = entity[field as keyof Lead];
        if (value !== null && value !== undefined) {
          if (!values.has(value)) {
            values.set(value, []);
          }
          values.get(value)!.push(entity.id);
        }
      }
      
      if (values.size > 1) {
        // We have conflicting values
        const conflict: FieldConflict = {
          field,
          values: Array.from(values.entries()).map(([value, entityIds]) => ({
            entityId: entityIds[0],
            value
          })),
          resolution: this.determineFieldResolution(field, masterEntity),
          recommendedValue: masterEntity[field as keyof Lead]
        };
        fieldConflicts.push(conflict);
      }
    }

    // Calculate confidence based on conflicts
    const conflictRatio = fieldConflicts.length / fields.length;
    const confidence = Math.round((1 - conflictRatio * 0.5) * 100);

    // Determine merge strategy
    let strategy: MergeRecommendation['mergeStrategy'];
    if (conflictRatio < 0.2) {
      strategy = 'keep_most_complete';
    } else if (conflictRatio < 0.5) {
      strategy = 'keep_newest';
    } else {
      strategy = 'manual';
    }

    return {
      masterEntityId: masterEntity.id,
      mergeStrategy: strategy,
      fieldConflicts,
      confidence,
      reason: this.generateMergeReason(entities, matches, conflictRatio)
    };
  }

  /**
   * Determine field resolution strategy
   */
  private determineFieldResolution(field: string, masterEntity: Lead): FieldConflict['resolution'] {
    // Critical fields should use master
    const criticalFields = ['businessName', 'email', 'phone'];
    if (criticalFields.includes(field)) {
      return 'use_master';
    }
    
    // Financial fields should use most recent
    const financialFields = ['annualRevenue', 'creditScore', 'monthlyRevenue'];
    if (financialFields.includes(field)) {
      return 'use_most_recent';
    }
    
    // Address and description fields can be concatenated
    const concatenateFields = ['fullAddress', 'businessDescription'];
    if (concatenateFields.includes(field)) {
      return 'concatenate';
    }
    
    return 'manual';
  }

  /**
   * Generate merge reason explanation
   */
  private generateMergeReason(
    entities: Lead[],
    matches: EntityMatchResult[],
    conflictRatio: number
  ): string {
    const avgConfidence = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
      : 0;

    if (avgConfidence >= MatchConfidence.CERTAIN) {
      return `Very high confidence match (${Math.round(avgConfidence)}%) with minimal conflicts`;
    } else if (avgConfidence >= MatchConfidence.PROBABLE) {
      return `High confidence match (${Math.round(avgConfidence)}%) - review recommended due to ${Math.round(conflictRatio * 100)}% field conflicts`;
    } else {
      return `Moderate confidence match (${Math.round(avgConfidence)}%) - manual review required`;
    }
  }

  /**
   * Auto-merge a cluster
   */
  private async autoMergeCluster(cluster: DuplicateCluster): Promise<boolean> {
    if (!cluster.mergeRecommendation || !cluster.masterEntity) {
      return false;
    }

    try {
      // Start transaction
      await db.transaction(async (tx) => {
        // Update master entity with merged data
        const mergedData = await this.mergEntityData(
          cluster.masterEntity!,
          cluster.entities,
          cluster.mergeRecommendation!
        );
        
        // Update master entity
        await tx.update(leads)
          .set(mergedData)
          .where(eq(leads.id, cluster.masterEntity!.id));
        
        // Mark other entities as merged
        const otherIds = cluster.entities
          .filter(e => e.id !== cluster.masterEntity!.id)
          .map(e => e.id);
        
        if (otherIds.length > 0) {
          await tx.update(leads)
            .set({ 
              sold: true,
              soldTo: cluster.masterEntity!.id as any,
              soldAt: new Date()
            })
            .where(inArray(leads.id, otherIds));
        }
        
        // Store merge record
        await tx.insert(entityMatches).values({
          id: `match_${Date.now()}`,
          entity1Id: cluster.masterEntity!.id,
          entity2Id: otherIds[0] || cluster.masterEntity!.id,
          matchConfidence: cluster.confidence,
          matchType: 'auto_merge',
          matchDetails: {
            clusterId: cluster.id,
            mergedEntities: otherIds,
            strategy: cluster.mergeRecommendation!.mergeStrategy
          },
          status: 'confirmed',
          createdAt: new Date()
        });
      });

      // Emit merge event
      eventBus.emit('entities-merged', {
        clusterId: cluster.id,
        masterEntity: cluster.masterEntity,
        mergedCount: cluster.entities.length - 1,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Auto-merge failed:', error);
      return false;
    }
  }

  /**
   * Merge entity data according to recommendation
   */
  private async mergEntityData(
    master: Lead,
    entities: Lead[],
    recommendation: MergeRecommendation
  ): Promise<Partial<Lead>> {
    const merged: Partial<Lead> = { ...master };

    // Resolve field conflicts
    for (const conflict of recommendation.fieldConflicts) {
      switch (conflict.resolution) {
        case 'use_master':
          // Keep master value
          break;
        
        case 'use_most_recent':
          // Find most recent value
          const mostRecent = entities
            .filter(e => e[conflict.field as keyof Lead] !== null)
            .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];
          
          if (mostRecent) {
            (merged as any)[conflict.field] = mostRecent[conflict.field as keyof Lead];
          }
          break;
        
        case 'concatenate':
          // Concatenate unique values
          const values = entities
            .map(e => e[conflict.field as keyof Lead])
            .filter((v, i, arr) => v && arr.indexOf(v) === i);
          
          if (values.length > 0) {
            merged[conflict.field as keyof Lead] = values.join('; ') as any;
          }
          break;
        
        case 'manual':
          // Use recommended value
          if (conflict.recommendedValue !== undefined) {
            merged[conflict.field as keyof Lead] = conflict.recommendedValue;
          }
          break;
      }
    }

    // Update quality and intelligence scores
    const maxQuality = Math.max(...entities.map(e => e.qualityScore || 0));
    const maxIntelligence = Math.max(...entities.map(e => e.intelligenceScore || 0));
    
    merged.qualityScore = maxQuality;
    merged.intelligenceScore = maxIntelligence;
    
    // Mark as enriched if any entity was enriched
    merged.isEnriched = entities.some(e => e.isEnriched);

    return merged;
  }

  /**
   * Determine cluster match type
   */
  private determineClusterMatchType(matches: EntityMatchResult[]): string {
    if (matches.length === 0) return 'unknown';
    
    // Count match types
    const typeCounts = new Map<string, number>();
    for (const match of matches) {
      const count = typeCounts.get(match.matchType) || 0;
      typeCounts.set(match.matchType, count + 1);
    }
    
    // Return most common type
    let maxCount = 0;
    let dominantType = 'composite';
    
    for (const [type, count] of Array.from(typeCounts.entries())) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }
    
    return dominantType;
  }

  /**
   * Generate cache key for an entity
   */
  private generateCacheKey(entity: Partial<Lead>): string {
    const parts = [
      entity.businessName || '',
      entity.email || '',
      entity.phone || '',
      entity.fullAddress || ''
    ];
    return parts.join('|').toLowerCase();
  }

  /**
   * Generate recommendation based on matches
   */
  private generateRecommendation(matches: EntityMatchResult[]): string {
    if (matches.length === 0) {
      return 'No duplicates detected - safe to proceed';
    }

    const highConfidenceMatches = matches.filter(
      m => m.confidence >= this.config.thresholds.probable
    );

    if (highConfidenceMatches.length > 0) {
      return `Found ${highConfidenceMatches.length} high-confidence duplicate(s) - review recommended before proceeding`;
    }

    return `Found ${matches.length} possible duplicate(s) - manual review recommended`;
  }

  /**
   * Clear detection cache
   */
  clearCache(): void {
    this.detectionCache.clear();
  }

  /**
   * Get detection statistics
   */
  async getDetectionStats(): Promise<DetectionStats> {
    // Query database for statistics
    const result = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT entity1_id) + COUNT(DISTINCT entity2_id) as total_checked,
        COUNT(*) as duplicates_found,
        COUNT(DISTINCT CASE WHEN status = 'merged' THEN entity1_id END) as auto_merged,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_review,
        AVG(match_confidence) as avg_confidence
      FROM ${entityMatches}
      WHERE created_at >= NOW() - INTERVAL '24 HOURS'
    `) as any;
    const stats = result.rows?.[0] || result[0] || {};

    return {
      totalChecked: Number((stats as any).total_checked) || 0,
      duplicatesFound: Number((stats as any).duplicates_found) || 0,
      clustersFormed: 0, // Would need separate tracking
      autoMerged: Number((stats as any).auto_merged) || 0,
      pendingReview: Number((stats as any).pending_review) || 0,
      processingTime: 0, // Would need separate tracking
      confidenceDistribution: {
        certain: 0,
        probable: 0,
        possible: 0,
        unlikely: 0
      }
    };
  }
}

// Export singleton instance
export const duplicateDetector = new DuplicateDetector();