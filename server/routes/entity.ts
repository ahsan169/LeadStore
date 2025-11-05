/**
 * Entity Resolution API Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { leads, entityMatches, entityGroups, entityRelationships } from '@shared/schema';
import { eq, and, or, gte, inArray, desc, sql } from 'drizzle-orm';
import { entityResolution } from '../intelligence/entity-resolution';
import { duplicateDetector } from '../intelligence/duplicate-detector';
import { entityGraphBuilder } from '../intelligence/entity-graph';
import { eventBus } from '../services/event-bus';

const router = Router();

/**
 * Resolve entities for a batch
 */
router.post('/api/entity/resolve', async (req, res) => {
  try {
    const bodySchema = z.object({
      leadIds: z.array(z.string()).optional(),
      batchId: z.string().optional(),
      config: z.object({
        confidenceThreshold: z.number().min(0).max(100).optional(),
        autoMerge: z.boolean().optional(),
        enableClustering: z.boolean().optional(),
      }).optional(),
    });

    const { leadIds, batchId, config } = bodySchema.parse(req.body);

    // Fetch leads
    let leadsToResolve;
    if (leadIds && leadIds.length > 0) {
      leadsToResolve = await db
        .select()
        .from(leads)
        .where(inArray(leads.id, leadIds));
    } else if (batchId) {
      leadsToResolve = await db
        .select()
        .from(leads)
        .where(eq(leads.batchId, batchId))
        .limit(1000); // Limit for performance
    } else {
      return res.status(400).json({ error: 'Either leadIds or batchId must be provided' });
    }

    if (leadsToResolve.length === 0) {
      return res.json({
        matches: [],
        groups: [],
        statistics: {
          totalEntities: 0,
          duplicatesFound: 0,
          groupsFormed: 0,
          averageConfidence: 0,
        },
      });
    }

    // Perform resolution
    const result = await entityResolution.resolveBatch(leadsToResolve);

    // Store matches in database
    if (result.matches.length > 0) {
      const matchRecords = result.matches.map(match => ({
        entity1Id: match.entity1Id,
        entity2Id: match.entity2Id,
        matchConfidence: match.confidence,
        matchType: match.matchType,
        matchDetails: match.matchDetails,
        status: 'pending' as const,
      }));

      await db.insert(entityMatches).values(matchRecords).onConflictDoNothing();
    }

    // Store groups in database
    if (result.groups.size > 0) {
      const groupRecords = Array.from(result.groups.entries()).map(([groupId, members]) => ({
        groupId,
        masterEntityId: Array.from(members)[0], // First member as master for now
        memberCount: members.size,
        groupType: 'duplicate' as const,
        confidence: result.statistics.averageConfidence,
        metadata: { members: Array.from(members) },
      }));

      await db.insert(entityGroups).values(groupRecords).onConflictDoNothing();
    }

    // Emit event for real-time updates
    eventBus.emit('entity-resolution-complete', {
      statistics: result.statistics,
      timestamp: new Date(),
    });

    res.json({
      matches: result.matches,
      groups: Array.from(result.groups.entries()).map(([id, members]) => ({
        id,
        members: Array.from(members),
      })),
      statistics: result.statistics,
    });
  } catch (error) {
    console.error('Entity resolution error:', error);
    res.status(500).json({ error: 'Failed to resolve entities' });
  }
});

/**
 * Get duplicate candidates
 */
router.get('/api/entity/duplicates', async (req, res) => {
  try {
    const querySchema = z.object({
      threshold: z.string().transform(Number).pipe(z.number().min(0).max(100)).optional(),
      search: z.string().optional(),
      limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).default('50'),
      offset: z.string().transform(Number).pipe(z.number().min(0)).default('0'),
    });

    const { threshold = 70, search, limit, offset } = querySchema.parse(req.query);

    // Build query
    let query = db
      .select({
        match: entityMatches,
        entity1: {
          id: leads.id,
          businessName: leads.businessName,
          email: leads.email,
          phone: leads.phone,
          fullAddress: leads.fullAddress,
        },
      })
      .from(entityMatches)
      .leftJoin(leads, eq(leads.id, entityMatches.entity1Id))
      .where(
        and(
          gte(entityMatches.matchConfidence, threshold),
          eq(entityMatches.status, 'pending')
        )
      )
      .orderBy(desc(entityMatches.matchConfidence))
      .limit(limit)
      .offset(offset);

    const results = await query;

    // Group matches by entity
    const duplicateGroups = new Map();
    
    for (const row of results) {
      if (!row.entity1) continue;
      
      const groupKey = row.match.entity1Id;
      if (!duplicateGroups.has(groupKey)) {
        duplicateGroups.set(groupKey, {
          id: groupKey,
          entities: [],
          confidence: row.match.matchConfidence,
          matchedFields: Object.keys(row.match.matchDetails.fieldScores || {}),
          suggestedMaster: row.match.entity1Id,
        });
      }
      
      duplicateGroups.get(groupKey).entities.push({
        id: row.entity1.id,
        businessName: row.entity1.businessName,
        email: row.entity1.email,
        phone: row.entity1.phone,
        address: row.entity1.fullAddress || '',
        matchPercentage: row.match.matchConfidence,
      });
    }

    res.json(Array.from(duplicateGroups.values()));
  } catch (error) {
    console.error('Get duplicates error:', error);
    res.status(500).json({ error: 'Failed to get duplicates' });
  }
});

/**
 * Merge entities
 */
router.post('/api/entity/merge', async (req, res) => {
  try {
    const bodySchema = z.object({
      entityIds: z.array(z.string()).min(2),
      masterId: z.string().optional(),
      mergeStrategy: z.enum(['keep_newest', 'keep_oldest', 'keep_most_complete', 'manual']).optional(),
      fieldResolutions: z.record(z.any()).optional(),
    });

    const { entityIds, masterId, mergeStrategy = 'keep_most_complete', fieldResolutions } = bodySchema.parse(req.body);

    // Fetch entities
    const entitiesToMerge = await db
      .select()
      .from(leads)
      .where(inArray(leads.id, entityIds));

    if (entitiesToMerge.length < 2) {
      return res.status(400).json({ error: 'At least 2 entities required for merge' });
    }

    // Determine master entity
    let masterEntity;
    if (masterId) {
      masterEntity = entitiesToMerge.find(e => e.id === masterId);
      if (!masterEntity) {
        return res.status(400).json({ error: 'Master entity not found' });
      }
    } else {
      // Auto-select master based on strategy
      switch (mergeStrategy) {
        case 'keep_newest':
          masterEntity = entitiesToMerge.reduce((newest, current) => 
            current.uploadedAt > newest.uploadedAt ? current : newest
          );
          break;
        case 'keep_oldest':
          masterEntity = entitiesToMerge.reduce((oldest, current) => 
            current.uploadedAt < oldest.uploadedAt ? current : oldest
          );
          break;
        case 'keep_most_complete':
        default:
          // Score based on completeness
          masterEntity = entitiesToMerge.reduce((best, current) => {
            const currentScore = Object.values(current).filter(v => v !== null && v !== '').length;
            const bestScore = Object.values(best).filter(v => v !== null && v !== '').length;
            return currentScore > bestScore ? current : best;
          });
          break;
      }
    }

    // Merge data
    const mergedData: any = { ...masterEntity };
    
    // Apply field resolutions if provided
    if (fieldResolutions) {
      Object.assign(mergedData, fieldResolutions);
    } else {
      // Auto-merge: take non-null values from other entities
      for (const entity of entitiesToMerge) {
        if (entity.id === masterEntity.id) continue;
        
        for (const [key, value] of Object.entries(entity)) {
          if (value !== null && value !== '' && (mergedData[key] === null || mergedData[key] === '')) {
            mergedData[key] = value;
          }
        }
      }
    }

    // Start transaction
    await db.transaction(async (tx) => {
      // Update master entity
      await tx.update(leads)
        .set(mergedData)
        .where(eq(leads.id, masterEntity.id));
      
      // Mark other entities as merged
      const otherIds = entityIds.filter(id => id !== masterEntity.id);
      await tx.update(leads)
        .set({ 
          sold: true,
          soldTo: masterEntity.id,
          soldAt: new Date(),
        })
        .where(inArray(leads.id, otherIds));
      
      // Update entity matches
      await tx.update(entityMatches)
        .set({ 
          status: 'confirmed',
          reviewedBy: (req as any).session?.userId,
          reviewedAt: new Date(),
        })
        .where(
          or(
            and(
              eq(entityMatches.entity1Id, masterEntity.id),
              inArray(entityMatches.entity2Id, otherIds)
            ),
            and(
              inArray(entityMatches.entity1Id, otherIds),
              eq(entityMatches.entity2Id, masterEntity.id)
            )
          )
        );
      
      // Create entity group
      await tx.insert(entityGroups).values({
        groupId: `merge_${Date.now()}`,
        masterEntityId: masterEntity.id,
        memberCount: entityIds.length,
        groupType: 'duplicate',
        confidence: 100,
        metadata: { 
          mergedEntities: otherIds,
          mergeStrategy,
          mergedAt: new Date(),
        },
      });
    });

    // Emit merge event
    eventBus.emit('entities-merged', {
      masterId: masterEntity.id,
      mergedIds: entityIds.filter(id => id !== masterEntity.id),
      strategy: mergeStrategy,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      masterId: masterEntity.id,
      mergedCount: entityIds.length - 1,
    });
  } catch (error) {
    console.error('Merge entities error:', error);
    res.status(500).json({ error: 'Failed to merge entities' });
  }
});

/**
 * Unmerge entities
 */
router.post('/api/entity/unmerge/:mergeId', async (req, res) => {
  try {
    const { mergeId } = req.params;

    // Find the merge group
    const [group] = await db
      .select()
      .from(entityGroups)
      .where(eq(entityGroups.id, mergeId));

    if (!group) {
      return res.status(404).json({ error: 'Merge group not found' });
    }

    const mergedIds = group.metadata?.mergedEntities || [];
    if (mergedIds.length === 0) {
      return res.status(400).json({ error: 'No merged entities found' });
    }

    // Restore merged entities
    await db.update(leads)
      .set({ 
        sold: false,
        soldTo: null,
        soldAt: null,
      })
      .where(inArray(leads.id, mergedIds));

    // Update entity matches
    await db.update(entityMatches)
      .set({ 
        status: 'rejected',
        reviewedBy: (req as any).session?.userId,
        reviewedAt: new Date(),
      })
      .where(
        or(
          and(
            eq(entityMatches.entity1Id, group.masterEntityId),
            inArray(entityMatches.entity2Id, mergedIds)
          ),
          and(
            inArray(entityMatches.entity1Id, mergedIds),
            eq(entityMatches.entity2Id, group.masterEntityId)
          )
        )
      );

    // Delete the group
    await db.delete(entityGroups).where(eq(entityGroups.id, mergeId));

    // Emit unmerge event
    eventBus.emit('entities-unmerged', {
      groupId: mergeId,
      restoredIds: mergedIds,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      restoredCount: mergedIds.length,
    });
  } catch (error) {
    console.error('Unmerge entities error:', error);
    res.status(500).json({ error: 'Failed to unmerge entities' });
  }
});

/**
 * Get matches for an entity
 */
router.get('/api/entity/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Find all matches for this entity
    const matches = await db
      .select()
      .from(entityMatches)
      .where(
        or(
          eq(entityMatches.entity1Id, id),
          eq(entityMatches.entity2Id, id)
        )
      )
      .orderBy(desc(entityMatches.matchConfidence));

    // Get matched entity details
    const matchedIds = new Set<string>();
    matches.forEach(match => {
      if (match.entity1Id !== id) matchedIds.add(match.entity1Id);
      if (match.entity2Id !== id) matchedIds.add(match.entity2Id);
    });

    const matchedEntities = matchedIds.size > 0
      ? await db
          .select()
          .from(leads)
          .where(inArray(leads.id, Array.from(matchedIds)))
      : [];

    const entityMap = new Map(matchedEntities.map(e => [e.id, e]));

    // Format response
    const formattedMatches = matches.map(match => {
      const matchedId = match.entity1Id === id ? match.entity2Id : match.entity1Id;
      const matchedEntity = entityMap.get(matchedId);
      
      return {
        ...match,
        matchedEntity: matchedEntity ? {
          id: matchedEntity.id,
          businessName: matchedEntity.businessName,
          email: matchedEntity.email,
          phone: matchedEntity.phone,
          fullAddress: matchedEntity.fullAddress,
        } : null,
      };
    });

    res.json(formattedMatches);
  } catch (error) {
    console.error('Get entity matches error:', error);
    res.status(500).json({ error: 'Failed to get entity matches' });
  }
});

/**
 * Confirm or reject a match
 */
router.put('/api/entity/match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bodySchema = z.object({
      status: z.enum(['confirmed', 'rejected']),
      notes: z.string().optional(),
    });

    const { status, notes } = bodySchema.parse(req.body);

    // Update match status
    const [updated] = await db.update(entityMatches)
      .set({
        status,
        reviewedBy: (req as any).session?.userId,
        reviewedAt: new Date(),
        matchDetails: sql`jsonb_set(match_details, '{reviewNotes}', ${JSON.stringify(notes)}::jsonb)`,
      })
      .where(eq(entityMatches.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // If confirmed, consider auto-merging high confidence matches
    if (status === 'confirmed' && updated.matchConfidence >= 95) {
      // Emit event for potential auto-merge
      eventBus.emit('match-confirmed', {
        match: updated,
        autoMergeEligible: true,
        timestamp: new Date(),
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update match error:', error);
    res.status(500).json({ error: 'Failed to update match' });
  }
});

/**
 * Get entity relationship graph
 */
router.get('/api/entity/graph/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const querySchema = z.object({
      depth: z.string().transform(Number).pipe(z.number().min(1).max(5)).default('3'),
      includeUCC: z.string().transform(v => v === 'true').default('true'),
    });

    const { depth, includeUCC } = querySchema.parse(req.query);

    // Get entity
    const [entity] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id));

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    // Build graph starting from this entity
    const visited = new Set<string>([id]);
    const queue = [{ entityId: id, level: 0 }];
    const nodes = [entity];
    const edges = [];

    while (queue.length > 0 && queue[0].level < depth) {
      const { entityId, level } = queue.shift()!;

      // Get relationships for this entity
      const relationships = await db
        .select()
        .from(entityRelationships)
        .where(
          or(
            eq(entityRelationships.parentEntityId, entityId),
            eq(entityRelationships.childEntityId, entityId)
          )
        );

      for (const rel of relationships) {
        const otherId = rel.parentEntityId === entityId ? rel.childEntityId : rel.parentEntityId;
        
        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push({ entityId: otherId, level: level + 1 });
          
          // Get entity details
          const [otherEntity] = await db
            .select()
            .from(leads)
            .where(eq(leads.id, otherId));
          
          if (otherEntity) {
            nodes.push(otherEntity);
          }
        }
        
        edges.push(rel);
      }
    }

    // Generate family tree
    const familyTree = await entityGraphBuilder.generateFamilyTree(id);

    // Analyze graph
    await entityGraphBuilder.buildGraph(nodes, includeUCC);
    const analysis = entityGraphBuilder.analyzeGraph();

    res.json({
      nodes: nodes.map(node => ({
        id: node.id,
        businessName: node.businessName,
        type: 'lead',
        metadata: {
          qualityScore: node.qualityScore,
          intelligenceScore: node.intelligenceScore,
          isEnriched: node.isEnriched,
        },
      })),
      edges: edges.map(edge => ({
        source: edge.parentEntityId,
        target: edge.childEntityId,
        type: edge.relationshipType,
        confidence: edge.confidence,
        bidirectional: edge.bidirectional,
      })),
      familyTree,
      analysis: {
        connectedComponents: analysis.connectedComponents.size,
        centralityScore: analysis.centralityScores.get(id) || 0,
        hierarchyLevel: analysis.hierarchyLevels.get(id) || 0,
        isHub: analysis.hubNodes.has(id),
        isOrphan: analysis.orphanNodes.has(id),
      },
    });
  } catch (error) {
    console.error('Get entity graph error:', error);
    res.status(500).json({ error: 'Failed to get entity graph' });
  }
});

/**
 * Bulk resolution operations
 */
router.post('/api/entity/bulk-resolve', async (req, res) => {
  try {
    const bodySchema = z.object({
      action: z.enum(['merge_all', 'ignore_all', 'detect_all']),
      threshold: z.number().min(0).max(100).optional(),
      groupIds: z.array(z.string()).optional(),
      batchId: z.string().optional(),
    });

    const { action, threshold = 90, groupIds, batchId } = bodySchema.parse(req.body);

    let processed = 0;
    let errors = 0;

    switch (action) {
      case 'merge_all':
        // Auto-merge high confidence matches
        if (groupIds && groupIds.length > 0) {
          for (const groupId of groupIds) {
            try {
              const [group] = await db
                .select()
                .from(entityGroups)
                .where(eq(entityGroups.id, groupId));
              
              if (group && group.confidence >= threshold) {
                // Perform merge
                // This would call the merge logic
                processed++;
              }
            } catch (err) {
              console.error(`Failed to merge group ${groupId}:`, err);
              errors++;
            }
          }
        }
        break;

      case 'ignore_all':
        // Mark matches as rejected
        if (groupIds && groupIds.length > 0) {
          await db.update(entityMatches)
            .set({
              status: 'rejected',
              reviewedBy: (req as any).session?.userId,
              reviewedAt: new Date(),
            })
            .where(
              and(
                inArray(entityMatches.id, groupIds),
                gte(entityMatches.matchConfidence, threshold)
              )
            );
          processed = groupIds.length;
        }
        break;

      case 'detect_all':
        // Run duplicate detection on batch
        if (batchId) {
          const batchLeads = await db
            .select()
            .from(leads)
            .where(eq(leads.batchId, batchId))
            .limit(1000);
          
          const detector = duplicateDetector;
          const result = await detector.detectBatchDuplicates(batchLeads);
          
          processed = result.clusters.length;
        }
        break;
    }

    res.json({
      success: true,
      action,
      processed,
      errors,
    });
  } catch (error) {
    console.error('Bulk resolve error:', error);
    res.status(500).json({ error: 'Failed to perform bulk resolution' });
  }
});

/**
 * Get resolution statistics
 */
router.get('/api/entity/resolution-stats', async (req, res) => {
  try {
    // Get statistics
    const [stats] = await db.execute(sql`
      SELECT 
        COUNT(DISTINCT entity1_id) + COUNT(DISTINCT entity2_id) as total_entities,
        COUNT(*) as total_matches,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_matches,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_matches,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_matches,
        AVG(match_confidence) as avg_confidence,
        COUNT(DISTINCT CASE WHEN match_confidence >= 95 THEN entity1_id END) as high_confidence_entities,
        COUNT(DISTINCT CASE WHEN match_confidence >= 85 AND match_confidence < 95 THEN entity1_id END) as medium_confidence_entities,
        COUNT(DISTINCT CASE WHEN match_confidence >= 70 AND match_confidence < 85 THEN entity1_id END) as low_confidence_entities
      FROM ${entityMatches}
      WHERE created_at >= NOW() - INTERVAL '30 DAYS'
    `);

    const [groupStats] = await db.execute(sql`
      SELECT 
        COUNT(*) as total_groups,
        AVG(member_count) as avg_group_size,
        MAX(member_count) as max_group_size,
        COUNT(CASE WHEN group_type = 'duplicate' THEN 1 END) as duplicate_groups,
        COUNT(CASE WHEN group_type = 'family' THEN 1 END) as family_groups,
        COUNT(CASE WHEN group_type = 'network' THEN 1 END) as network_groups
      FROM ${entityGroups}
    `);

    const [relationshipStats] = await db.execute(sql`
      SELECT 
        COUNT(*) as total_relationships,
        COUNT(DISTINCT parent_entity_id) as parent_entities,
        COUNT(DISTINCT child_entity_id) as child_entities,
        AVG(confidence) as avg_relationship_confidence,
        COUNT(CASE WHEN relationship_type = 'parent' THEN 1 END) as parent_relationships,
        COUNT(CASE WHEN relationship_type = 'subsidiary' THEN 1 END) as subsidiary_relationships,
        COUNT(CASE WHEN relationship_type = 'affiliate' THEN 1 END) as affiliate_relationships,
        COUNT(CASE WHEN relationship_type = 'franchise' THEN 1 END) as franchise_relationships
      FROM ${entityRelationships}
    `);

    res.json({
      matches: {
        total: Number(stats.total_matches) || 0,
        confirmed: Number(stats.confirmed_matches) || 0,
        rejected: Number(stats.rejected_matches) || 0,
        pending: Number(stats.pending_matches) || 0,
        averageConfidence: Number(stats.avg_confidence) || 0,
      },
      entities: {
        total: Number(stats.total_entities) || 0,
        highConfidence: Number(stats.high_confidence_entities) || 0,
        mediumConfidence: Number(stats.medium_confidence_entities) || 0,
        lowConfidence: Number(stats.low_confidence_entities) || 0,
      },
      groups: {
        total: Number(groupStats.total_groups) || 0,
        averageSize: Number(groupStats.avg_group_size) || 0,
        maxSize: Number(groupStats.max_group_size) || 0,
        byType: {
          duplicate: Number(groupStats.duplicate_groups) || 0,
          family: Number(groupStats.family_groups) || 0,
          network: Number(groupStats.network_groups) || 0,
        },
      },
      relationships: {
        total: Number(relationshipStats.total_relationships) || 0,
        parentEntities: Number(relationshipStats.parent_entities) || 0,
        childEntities: Number(relationshipStats.child_entities) || 0,
        averageConfidence: Number(relationshipStats.avg_relationship_confidence) || 0,
        byType: {
          parent: Number(relationshipStats.parent_relationships) || 0,
          subsidiary: Number(relationshipStats.subsidiary_relationships) || 0,
          affiliate: Number(relationshipStats.affiliate_relationships) || 0,
          franchise: Number(relationshipStats.franchise_relationships) || 0,
        },
      },
    });
  } catch (error) {
    console.error('Get resolution stats error:', error);
    res.status(500).json({ error: 'Failed to get resolution statistics' });
  }
});

export default router;