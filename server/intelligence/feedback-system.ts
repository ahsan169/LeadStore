/**
 * Feedback Collection System
 * Comprehensive system for collecting, validating, and processing operator feedback
 */

import { z } from 'zod';
import { db } from '../db';
import { feedback, learnedPatterns, improvementSuggestions, leads } from '@shared/schema';
import { eq, and, or, sql, desc, asc, inArray, gte, lte } from 'drizzle-orm';
import { Lead, Feedback, LearnedPattern, ImprovementSuggestion } from '@shared/schema';
import { eventBus } from '../services/event-bus';
import { FIELD_SYNONYMS, CanonicalField, fieldMapper } from './ontology';
import { rulesEngine } from './rules-engine';
import { entityResolutionEngine } from './entity-resolution';

/**
 * Feedback types enumeration
 */
export enum FeedbackType {
  FIELD_CORRECTION = 'field_correction',
  ENTITY_RESOLUTION = 'entity_resolution',
  CLASSIFICATION_CORRECTION = 'classification_correction',
  SCORE_ADJUSTMENT = 'score_adjustment',
  RULE_SUGGESTION = 'rule_suggestion',
  SYNONYM_ADDITION = 'synonym_addition',
  THRESHOLD_ADJUSTMENT = 'threshold_adjustment',
  PATTERN_IDENTIFICATION = 'pattern_identification',
  DATA_QUALITY = 'data_quality',
  VALIDATION = 'validation'
}

/**
 * Feedback priority levels
 */
export enum FeedbackPriority {
  CRITICAL = 100,
  HIGH = 75,
  MEDIUM = 50,
  LOW = 25,
  MINIMAL = 10
}

/**
 * Feedback impact levels
 */
export enum FeedbackImpact {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * Feedback status
 */
export enum FeedbackStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  TESTING = 'testing',
  APPLIED = 'applied',
  REJECTED = 'rejected',
  ROLLED_BACK = 'rolled_back'
}

/**
 * Feedback validation rules
 */
export const feedbackValidationRules = {
  [FeedbackType.FIELD_CORRECTION]: z.object({
    fieldName: z.string(),
    originalValue: z.any(),
    correctedValue: z.any(),
    explanation: z.string().optional(),
  }),
  
  [FeedbackType.ENTITY_RESOLUTION]: z.object({
    entity1Id: z.string(),
    entity2Id: z.string(),
    action: z.enum(['merge', 'split', 'no_match']),
    confidence: z.number().min(0).max(100),
    reason: z.string(),
  }),
  
  [FeedbackType.CLASSIFICATION_CORRECTION]: z.object({
    fieldName: z.string(),
    currentClassification: z.string(),
    correctClassification: z.string(),
    evidence: z.any().optional(),
  }),
  
  [FeedbackType.SCORE_ADJUSTMENT]: z.object({
    scoreType: z.string(),
    currentScore: z.number(),
    adjustedScore: z.number(),
    reason: z.string(),
    factors: z.array(z.string()).optional(),
  }),
  
  [FeedbackType.RULE_SUGGESTION]: z.object({
    ruleType: z.enum(['validation', 'scoring', 'transformation', 'enrichment', 'alert']),
    condition: z.any(),
    action: z.any(),
    description: z.string(),
    examples: z.array(z.any()).optional(),
  }),
};

/**
 * Feedback submission interface
 */
export interface FeedbackSubmission {
  leadId?: string;
  feedbackType: FeedbackType;
  data: any;
  confidence?: number;
  priority?: number;
  operatorId: string;
  explanation?: string;
  affectedLeads?: string[];
}

/**
 * Feedback validation result
 */
export interface FeedbackValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  suggestions?: string[];
  confidence?: number;
}

/**
 * Batch feedback processing options
 */
export interface BatchProcessingOptions {
  batchSize?: number;
  parallel?: boolean;
  validateOnly?: boolean;
  testMode?: boolean;
  rollbackOnError?: boolean;
}

/**
 * Feedback Collection System main class
 */
export class FeedbackCollectionSystem {
  private processingQueue: Map<string, FeedbackSubmission> = new Map();
  private validationCache: Map<string, FeedbackValidationResult> = new Map();

  /**
   * Submit feedback
   */
  async submitFeedback(submission: FeedbackSubmission): Promise<Feedback> {
    try {
      // Validate feedback
      const validation = await this.validateFeedback(submission);
      if (!validation.valid) {
        throw new Error(`Invalid feedback: ${validation.errors?.join(', ')}`);
      }
      
      // Calculate impact and priority
      const impact = await this.calculateImpact(submission);
      const priority = submission.priority || this.calculatePriority(submission, impact);
      
      // Store feedback
      const [newFeedback] = await db.insert(feedback).values({
        leadId: submission.leadId,
        feedbackType: submission.feedbackType,
        fieldName: submission.data.fieldName,
        originalValue: submission.data.originalValue,
        correctedValue: submission.data.correctedValue,
        explanation: submission.explanation || submission.data.explanation,
        confidence: validation.confidence || submission.confidence || 50,
        priority,
        impact,
        status: FeedbackStatus.PENDING,
        operatorId: submission.operatorId,
        context: submission.data,
        affectedLeads: submission.affectedLeads,
        metadata: {
          submittedAt: new Date(),
          validationResult: validation,
        },
      }).returning();
      
      // Emit event
      await eventBus.emit('feedback:submitted', {
        feedback: newFeedback,
        impact,
        priority,
      });
      
      // Check for similar patterns
      await this.checkForPatterns(newFeedback);
      
      // Auto-apply if high confidence
      if (validation.confidence && validation.confidence >= 90) {
        await this.autoApplyFeedback(newFeedback);
      }
      
      return newFeedback;
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Validate feedback
   */
  async validateFeedback(submission: FeedbackSubmission): Promise<FeedbackValidationResult> {
    // Check cache
    const cacheKey = `${submission.feedbackType}:${JSON.stringify(submission.data)}`;
    if (this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey)!;
    }
    
    const result: FeedbackValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };
    
    try {
      // Type-specific validation
      const schema = feedbackValidationRules[submission.feedbackType];
      if (schema) {
        const validation = schema.safeParse(submission.data);
        if (!validation.success) {
          result.valid = false;
          result.errors = validation.error.errors.map(e => e.message);
          return result;
        }
      }
      
      // Field-specific validation
      if (submission.feedbackType === FeedbackType.FIELD_CORRECTION) {
        const fieldValidation = await this.validateFieldCorrection(submission);
        if (!fieldValidation.valid) {
          return fieldValidation;
        }
      }
      
      // Entity resolution validation
      if (submission.feedbackType === FeedbackType.ENTITY_RESOLUTION) {
        const entityValidation = await this.validateEntityResolution(submission);
        if (!entityValidation.valid) {
          return entityValidation;
        }
      }
      
      // Calculate confidence
      result.confidence = await this.calculateConfidence(submission);
      
      // Check for conflicts
      const conflicts = await this.checkForConflicts(submission);
      if (conflicts.length > 0) {
        result.warnings?.push(...conflicts.map(c => `Conflict detected: ${c}`));
      }
      
      // Generate suggestions
      const suggestions = await this.generateSuggestions(submission);
      if (suggestions.length > 0) {
        result.suggestions = suggestions;
      }
      
      // Cache result
      this.validationCache.set(cacheKey, result);
      
    } catch (error) {
      result.valid = false;
      result.errors?.push(`Validation error: ${error}`);
    }
    
    return result;
  }

  /**
   * Validate field correction
   */
  private async validateFieldCorrection(submission: FeedbackSubmission): Promise<FeedbackValidationResult> {
    const result: FeedbackValidationResult = { valid: true };
    
    const { fieldName, originalValue, correctedValue } = submission.data;
    
    // Check if field exists
    const canonicalField = fieldMapper.getCanonicalField(fieldName);
    if (!canonicalField) {
      result.valid = false;
      result.errors = [`Unknown field: ${fieldName}`];
      return result;
    }
    
    // Validate data type
    const validator = fieldMapper.getValidator(canonicalField);
    if (validator) {
      const validationResult = validator.safeParse(correctedValue);
      if (!validationResult.success) {
        result.valid = false;
        result.errors = [`Invalid value for ${fieldName}: ${validationResult.error.message}`];
        return result;
      }
    }
    
    // Check for semantic validity
    if (originalValue === correctedValue) {
      result.warnings = ['Original and corrected values are the same'];
    }
    
    return result;
  }

  /**
   * Validate entity resolution
   */
  private async validateEntityResolution(submission: FeedbackSubmission): Promise<FeedbackValidationResult> {
    const result: FeedbackValidationResult = { valid: true };
    
    const { entity1Id, entity2Id, action } = submission.data;
    
    // Check if entities exist
    const entities = await db.select()
      .from(leads)
      .where(inArray(leads.id, [entity1Id, entity2Id]));
    
    if (entities.length !== 2) {
      result.valid = false;
      result.errors = ['One or both entities not found'];
      return result;
    }
    
    // Check if action makes sense
    if (action === 'merge' && entity1Id === entity2Id) {
      result.valid = false;
      result.errors = ['Cannot merge entity with itself'];
      return result;
    }
    
    return result;
  }

  /**
   * Calculate confidence score for feedback
   */
  private async calculateConfidence(submission: FeedbackSubmission): Promise<number> {
    let confidence = 50; // Base confidence
    
    // Operator history boosts confidence
    const operatorHistory = await this.getOperatorHistory(submission.operatorId);
    if (operatorHistory.successRate > 0.8) {
      confidence += 20;
    } else if (operatorHistory.successRate > 0.6) {
      confidence += 10;
    }
    
    // Multiple similar feedback boosts confidence
    const similarFeedback = await this.findSimilarFeedback(submission);
    if (similarFeedback.length > 5) {
      confidence += 20;
    } else if (similarFeedback.length > 2) {
      confidence += 10;
    }
    
    // Evidence provided boosts confidence
    if (submission.explanation && submission.explanation.length > 100) {
      confidence += 10;
    }
    
    // Type-specific adjustments
    if (submission.feedbackType === FeedbackType.FIELD_CORRECTION) {
      if (submission.data.evidence) {
        confidence += 10;
      }
    }
    
    return Math.min(confidence, 100);
  }

  /**
   * Calculate impact of feedback
   */
  private async calculateImpact(submission: FeedbackSubmission): Promise<FeedbackImpact> {
    // Count affected leads
    const affectedCount = submission.affectedLeads?.length || 0;
    
    // Type-based impact
    const typeImpact = {
      [FeedbackType.FIELD_CORRECTION]: FeedbackImpact.MEDIUM,
      [FeedbackType.ENTITY_RESOLUTION]: FeedbackImpact.HIGH,
      [FeedbackType.CLASSIFICATION_CORRECTION]: FeedbackImpact.HIGH,
      [FeedbackType.SCORE_ADJUSTMENT]: FeedbackImpact.CRITICAL,
      [FeedbackType.RULE_SUGGESTION]: FeedbackImpact.MEDIUM,
      [FeedbackType.SYNONYM_ADDITION]: FeedbackImpact.LOW,
      [FeedbackType.THRESHOLD_ADJUSTMENT]: FeedbackImpact.HIGH,
      [FeedbackType.PATTERN_IDENTIFICATION]: FeedbackImpact.MEDIUM,
      [FeedbackType.DATA_QUALITY]: FeedbackImpact.HIGH,
      [FeedbackType.VALIDATION]: FeedbackImpact.LOW,
    };
    
    let impact = typeImpact[submission.feedbackType] || FeedbackImpact.MEDIUM;
    
    // Upgrade impact based on affected count
    if (affectedCount > 100) {
      impact = FeedbackImpact.CRITICAL;
    } else if (affectedCount > 50 && impact !== FeedbackImpact.CRITICAL) {
      impact = FeedbackImpact.HIGH;
    }
    
    return impact;
  }

  /**
   * Calculate priority
   */
  private calculatePriority(submission: FeedbackSubmission, impact: FeedbackImpact): number {
    const impactPriority = {
      [FeedbackImpact.CRITICAL]: FeedbackPriority.CRITICAL,
      [FeedbackImpact.HIGH]: FeedbackPriority.HIGH,
      [FeedbackImpact.MEDIUM]: FeedbackPriority.MEDIUM,
      [FeedbackImpact.LOW]: FeedbackPriority.LOW,
    };
    
    return impactPriority[impact] || FeedbackPriority.MEDIUM;
  }

  /**
   * Check for conflicts with existing feedback
   */
  private async checkForConflicts(submission: FeedbackSubmission): Promise<string[]> {
    const conflicts: string[] = [];
    
    if (submission.feedbackType === FeedbackType.FIELD_CORRECTION) {
      // Check for conflicting corrections on same field
      const existingCorrections = await db.select()
        .from(feedback)
        .where(and(
          eq(feedback.feedbackType, FeedbackType.FIELD_CORRECTION),
          eq(feedback.fieldName, submission.data.fieldName),
          eq(feedback.status, FeedbackStatus.APPLIED),
          submission.leadId ? eq(feedback.leadId, submission.leadId) : sql`true`
        ))
        .limit(5);
      
      if (existingCorrections.length > 0) {
        conflicts.push(`Existing corrections found for field ${submission.data.fieldName}`);
      }
    }
    
    return conflicts;
  }

  /**
   * Generate suggestions based on feedback
   */
  private async generateSuggestions(submission: FeedbackSubmission): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Field correction suggestions
    if (submission.feedbackType === FeedbackType.FIELD_CORRECTION) {
      // Suggest adding as synonym
      if (!submission.data.fieldName.toLowerCase().includes('id')) {
        suggestions.push(`Consider adding "${submission.data.originalValue}" as a synonym for "${submission.data.correctedValue}"`);
      }
      
      // Suggest pattern rule
      if (submission.affectedLeads && submission.affectedLeads.length > 10) {
        suggestions.push('Consider creating a transformation rule for this pattern');
      }
    }
    
    // Entity resolution suggestions
    if (submission.feedbackType === FeedbackType.ENTITY_RESOLUTION) {
      if (submission.data.confidence < 70) {
        suggestions.push('Consider adjusting entity matching thresholds');
      }
    }
    
    return suggestions;
  }

  /**
   * Check for patterns in feedback
   */
  private async checkForPatterns(feedbackItem: Feedback): Promise<void> {
    try {
      // Find similar feedback
      const similar = await this.findSimilarFeedbackById(feedbackItem.id);
      
      if (similar.length >= 3) {
        // Create pattern suggestion
        await this.createPatternFromFeedback(similar);
      }
    } catch (error) {
      console.error('Error checking for patterns:', error);
    }
  }

  /**
   * Auto-apply high-confidence feedback
   */
  private async autoApplyFeedback(feedbackItem: Feedback): Promise<void> {
    try {
      // Only auto-apply certain types
      const autoApplicableTypes = [
        FeedbackType.SYNONYM_ADDITION,
        FeedbackType.FIELD_CORRECTION,
      ];
      
      if (!autoApplicableTypes.includes(feedbackItem.feedbackType as FeedbackType)) {
        return;
      }
      
      // Apply feedback
      await this.applyFeedback(feedbackItem.id);
      
      // Emit event
      await eventBus.emit('feedback:auto_applied', {
        feedbackId: feedbackItem.id,
        type: feedbackItem.feedbackType,
      });
      
    } catch (error) {
      console.error('Error auto-applying feedback:', error);
    }
  }

  /**
   * Apply feedback
   */
  async applyFeedback(feedbackId: string): Promise<void> {
    const feedbackItem = await db.select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);
    
    if (!feedbackItem || feedbackItem.length === 0) {
      throw new Error('Feedback not found');
    }
    
    const fb = feedbackItem[0];
    
    try {
      // Apply based on type
      switch (fb.feedbackType) {
        case FeedbackType.FIELD_CORRECTION:
          await this.applyFieldCorrection(fb);
          break;
        
        case FeedbackType.ENTITY_RESOLUTION:
          await this.applyEntityResolution(fb);
          break;
        
        case FeedbackType.SCORE_ADJUSTMENT:
          await this.applyScoreAdjustment(fb);
          break;
        
        case FeedbackType.SYNONYM_ADDITION:
          await this.applySynonymAddition(fb);
          break;
        
        default:
          console.log(`Feedback type ${fb.feedbackType} requires manual application`);
      }
      
      // Update status
      await db.update(feedback)
        .set({
          status: FeedbackStatus.APPLIED,
          appliedAt: new Date(),
        })
        .where(eq(feedback.id, feedbackId));
      
      // Emit event
      await eventBus.emit('feedback:applied', {
        feedbackId,
        type: fb.feedbackType,
      });
      
    } catch (error) {
      console.error('Error applying feedback:', error);
      throw error;
    }
  }

  /**
   * Apply field correction
   */
  private async applyFieldCorrection(feedbackItem: Feedback): Promise<void> {
    if (!feedbackItem.leadId || !feedbackItem.fieldName) {
      throw new Error('Missing required data for field correction');
    }
    
    // Update the lead
    await db.update(leads)
      .set({
        [feedbackItem.fieldName]: feedbackItem.correctedValue,
      })
      .where(eq(leads.id, feedbackItem.leadId));
    
    // Check if this should become a pattern
    if (feedbackItem.affectedLeads && feedbackItem.affectedLeads.length > 0) {
      // Apply to all affected leads
      for (const leadId of feedbackItem.affectedLeads) {
        await db.update(leads)
          .set({
            [feedbackItem.fieldName]: feedbackItem.correctedValue,
          })
          .where(eq(leads.id, leadId));
      }
    }
  }

  /**
   * Apply entity resolution
   */
  private async applyEntityResolution(feedbackItem: Feedback): Promise<void> {
    const context = feedbackItem.context as any;
    if (!context) {
      throw new Error('Missing context for entity resolution');
    }
    
    const { entity1Id, entity2Id, action } = context;
    
    if (action === 'merge') {
      // Merge entities (keep entity1, update references from entity2)
      // This would involve updating all references to entity2 to point to entity1
      console.log(`Merging entity ${entity2Id} into ${entity1Id}`);
      // Implementation would depend on your specific merge logic
    }
  }

  /**
   * Apply score adjustment
   */
  private async applyScoreAdjustment(feedbackItem: Feedback): Promise<void> {
    if (!feedbackItem.leadId) {
      throw new Error('Missing lead ID for score adjustment');
    }
    
    const context = feedbackItem.context as any;
    const { adjustedScore } = context;
    
    await db.update(leads)
      .set({
        qualityScore: adjustedScore,
      })
      .where(eq(leads.id, feedbackItem.leadId));
  }

  /**
   * Apply synonym addition
   */
  private async applySynonymAddition(feedbackItem: Feedback): Promise<void> {
    const context = feedbackItem.context as any;
    const { fieldName, synonym, canonicalValue } = context;
    
    // Add to field mapper (this would need to persist to configuration)
    console.log(`Adding synonym "${synonym}" for "${canonicalValue}" in field ${fieldName}`);
    // Implementation would update the ontology configuration
  }

  /**
   * Batch process feedback
   */
  async batchProcessFeedback(
    feedbackIds: string[],
    options: BatchProcessingOptions = {}
  ): Promise<{
    successful: string[];
    failed: string[];
    errors: Record<string, string>;
  }> {
    const {
      batchSize = 10,
      parallel = false,
      validateOnly = false,
      testMode = false,
      rollbackOnError = false,
    } = options;
    
    const result = {
      successful: [] as string[],
      failed: [] as string[],
      errors: {} as Record<string, string>,
    };
    
    try {
      // Process in batches
      for (let i = 0; i < feedbackIds.length; i += batchSize) {
        const batch = feedbackIds.slice(i, i + batchSize);
        
        if (parallel) {
          // Process batch in parallel
          const promises = batch.map(id => this.processSingleFeedback(id, validateOnly, testMode));
          const results = await Promise.allSettled(promises);
          
          results.forEach((res, index) => {
            if (res.status === 'fulfilled') {
              result.successful.push(batch[index]);
            } else {
              result.failed.push(batch[index]);
              result.errors[batch[index]] = res.reason.message;
              
              if (rollbackOnError) {
                throw new Error(`Failed to process feedback ${batch[index]}: ${res.reason.message}`);
              }
            }
          });
        } else {
          // Process sequentially
          for (const id of batch) {
            try {
              await this.processSingleFeedback(id, validateOnly, testMode);
              result.successful.push(id);
            } catch (error: any) {
              result.failed.push(id);
              result.errors[id] = error.message;
              
              if (rollbackOnError) {
                throw error;
              }
            }
          }
        }
      }
    } catch (error) {
      if (rollbackOnError) {
        // Rollback all successful applications
        for (const id of result.successful) {
          await this.rollbackFeedback(id);
        }
        throw error;
      }
    }
    
    return result;
  }

  /**
   * Process single feedback
   */
  private async processSingleFeedback(
    feedbackId: string,
    validateOnly: boolean,
    testMode: boolean
  ): Promise<void> {
    const feedbackItem = await db.select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);
    
    if (!feedbackItem || feedbackItem.length === 0) {
      throw new Error('Feedback not found');
    }
    
    const fb = feedbackItem[0];
    
    // Validate
    const validation = await this.validateFeedback({
      leadId: fb.leadId || undefined,
      feedbackType: fb.feedbackType as FeedbackType,
      data: fb.context,
      operatorId: fb.operatorId,
    });
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
    }
    
    if (!validateOnly && !testMode) {
      await this.applyFeedback(feedbackId);
    }
  }

  /**
   * Rollback feedback
   */
  async rollbackFeedback(feedbackId: string): Promise<void> {
    const feedbackItem = await db.select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);
    
    if (!feedbackItem || feedbackItem.length === 0) {
      throw new Error('Feedback not found');
    }
    
    const fb = feedbackItem[0];
    
    // Rollback based on type
    if (fb.feedbackType === FeedbackType.FIELD_CORRECTION && fb.leadId && fb.fieldName) {
      // Restore original value
      await db.update(leads)
        .set({
          [fb.fieldName]: fb.originalValue,
        })
        .where(eq(leads.id, fb.leadId));
    }
    
    // Update status
    await db.update(feedback)
      .set({
        status: FeedbackStatus.ROLLED_BACK,
      })
      .where(eq(feedback.id, feedbackId));
    
    // Emit event
    await eventBus.emit('feedback:rolled_back', {
      feedbackId,
      type: fb.feedbackType,
    });
  }

  /**
   * Get operator history
   */
  private async getOperatorHistory(operatorId: string): Promise<{
    totalFeedback: number;
    appliedFeedback: number;
    successRate: number;
  }> {
    const stats = await db.select({
      total: sql<number>`count(*)`,
      applied: sql<number>`count(case when status = ${FeedbackStatus.APPLIED} then 1 end)`,
    })
    .from(feedback)
    .where(eq(feedback.operatorId, operatorId));
    
    const total = Number(stats[0]?.total || 0);
    const applied = Number(stats[0]?.applied || 0);
    
    return {
      totalFeedback: total,
      appliedFeedback: applied,
      successRate: total > 0 ? applied / total : 0,
    };
  }

  /**
   * Find similar feedback
   */
  private async findSimilarFeedback(submission: FeedbackSubmission): Promise<Feedback[]> {
    const similar = await db.select()
      .from(feedback)
      .where(and(
        eq(feedback.feedbackType, submission.feedbackType),
        submission.data.fieldName ? eq(feedback.fieldName, submission.data.fieldName) : sql`true`,
        eq(feedback.status, FeedbackStatus.APPLIED)
      ))
      .limit(10);
    
    return similar;
  }

  /**
   * Find similar feedback by ID
   */
  private async findSimilarFeedbackById(feedbackId: string): Promise<Feedback[]> {
    const feedbackItem = await db.select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);
    
    if (!feedbackItem || feedbackItem.length === 0) {
      return [];
    }
    
    const fb = feedbackItem[0];
    
    return await db.select()
      .from(feedback)
      .where(and(
        eq(feedback.feedbackType, fb.feedbackType),
        fb.fieldName ? eq(feedback.fieldName, fb.fieldName) : sql`true`,
        sql`${feedback.id} != ${feedbackId}`
      ))
      .limit(10);
  }

  /**
   * Create pattern from feedback
   */
  private async createPatternFromFeedback(feedbackItems: Feedback[]): Promise<void> {
    if (feedbackItems.length < 3) return;
    
    const firstItem = feedbackItems[0];
    
    // Create pattern
    const [pattern] = await db.insert(learnedPatterns).values({
      patternType: 'feedback_derived',
      patternCategory: firstItem.fieldName || 'general',
      patternValue: {
        feedbackType: firstItem.feedbackType,
        pattern: this.extractPattern(feedbackItems),
      },
      description: `Pattern derived from ${feedbackItems.length} similar feedback items`,
      examples: feedbackItems.slice(0, 3).map(f => f.context),
      confidence: (feedbackItems.length / 10) * 100, // More feedback = higher confidence
      occurrences: feedbackItems.length,
      sourceType: 'feedback',
      sourceFeedbackIds: feedbackItems.map(f => f.id),
      status: 'discovered',
    }).returning();
    
    // Create improvement suggestion
    await db.insert(improvementSuggestions).values({
      suggestionType: 'pattern_implementation',
      title: `Implement pattern from ${firstItem.feedbackType} feedback`,
      description: `A pattern has been detected from ${feedbackItems.length} similar feedback items`,
      impactScore: Math.min(feedbackItems.length * 10, 100),
      affectedLeadsCount: feedbackItems.filter(f => f.leadId).length,
      evidence: {
        patternId: pattern.id,
        feedbackIds: feedbackItems.map(f => f.id),
      },
      status: 'pending',
      priority: feedbackItems.length > 10 ? 'high' : 'medium',
    });
  }

  /**
   * Extract pattern from feedback items
   */
  private extractPattern(feedbackItems: Feedback[]): any {
    // Simple pattern extraction - would be more sophisticated in practice
    const patterns: any = {};
    
    feedbackItems.forEach(item => {
      if (item.context) {
        Object.entries(item.context as any).forEach(([key, value]) => {
          if (!patterns[key]) {
            patterns[key] = [];
          }
          patterns[key].push(value);
        });
      }
    });
    
    return patterns;
  }

  /**
   * Get feedback statistics
   */
  async getFeedbackStatistics(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    byOperator: Record<string, number>;
    averageConfidence: number;
    averageProcessingTime: number;
  }> {
    const whereClause = [];
    if (startDate) {
      whereClause.push(gte(feedback.createdAt, startDate));
    }
    if (endDate) {
      whereClause.push(lte(feedback.createdAt, endDate));
    }
    
    const stats = await db.select({
      total: sql<number>`count(*)`,
      avgConfidence: sql<number>`avg(confidence)`,
    })
    .from(feedback)
    .where(and(...whereClause));
    
    // Get breakdown by type
    const byType = await db.select({
      type: feedback.feedbackType,
      count: sql<number>`count(*)`,
    })
    .from(feedback)
    .where(and(...whereClause))
    .groupBy(feedback.feedbackType);
    
    // Get breakdown by status
    const byStatus = await db.select({
      status: feedback.status,
      count: sql<number>`count(*)`,
    })
    .from(feedback)
    .where(and(...whereClause))
    .groupBy(feedback.status);
    
    return {
      total: Number(stats[0]?.total || 0),
      byType: Object.fromEntries(byType.map(t => [t.type, Number(t.count)])),
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, Number(s.count)])),
      byOperator: {}, // Would need additional query
      averageConfidence: Number(stats[0]?.avgConfidence || 0),
      averageProcessingTime: 0, // Would need to track this
    };
  }
}

// Export singleton instance
export const feedbackCollectionSystem = new FeedbackCollectionSystem();