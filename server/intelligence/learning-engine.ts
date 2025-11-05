/**
 * Learning Engine
 * Core system for learning from feedback and improving intelligence over time
 */

import { z } from 'zod';
import { db } from '../db';
import { feedback, learnedPatterns, improvementSuggestions, abTests, feedbackMetrics, rules, leads } from '@shared/schema';
import { eq, and, or, sql, desc, asc, inArray, gte, lte, ne } from 'drizzle-orm';
import { Feedback, LearnedPattern, ImprovementSuggestion, AbTest } from '@shared/schema';
import { eventBus } from '../services/event-bus';
import { FIELD_SYNONYMS, CanonicalField, fieldMapper } from './ontology';
import { rulesEngine, RuleType, Rule, RuleAction } from './rules-engine';
import { entityResolutionEngine } from './entity-resolution';
import { feedbackCollectionSystem } from './feedback-system';

/**
 * Pattern types that can be learned
 */
export enum PatternType {
  FIELD_MAPPING = 'field_mapping',
  SYNONYM = 'synonym',
  ENTITY_ALIAS = 'entity_alias',
  EXTRACTION_RULE = 'extraction_rule',
  CLASSIFICATION_RULE = 'classification_rule',
  THRESHOLD_ADJUSTMENT = 'threshold',
  SCORE_WEIGHT = 'score_weight',
  TRANSFORMATION_RULE = 'transformation_rule',
  VALIDATION_RULE = 'validation_rule'
}

/**
 * Learning confidence thresholds
 */
export enum ConfidenceThreshold {
  AUTO_APPLY = 90,        // Automatically apply pattern
  SUGGEST_APPLY = 75,     // Suggest applying pattern
  TEST_PATTERN = 60,      // Test pattern in A/B test
  MONITOR = 40,           // Monitor pattern
  IGNORE = 0              // Ignore pattern
}

/**
 * Pattern discovery result
 */
export interface PatternDiscoveryResult {
  pattern: any;
  type: PatternType;
  confidence: number;
  evidence: any[];
  occurrences: number;
  impact: number;
  suggestions: string[];
}

/**
 * Weight adjustment result
 */
export interface WeightAdjustmentResult {
  field: string;
  oldWeight: number;
  newWeight: number;
  improvement: number;
  confidence: number;
  basedOn: number; // Number of feedback items
}

/**
 * Threshold optimization result
 */
export interface ThresholdOptimizationResult {
  metric: string;
  oldThreshold: number;
  newThreshold: number;
  expectedImprovement: number;
  confidence: number;
  testRecommended: boolean;
}

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  name: string;
  description: string;
  type: 'pattern' | 'threshold' | 'weight' | 'rule' | 'model';
  variantA: any;
  variantB: any;
  sampleSize: number;
  successMetric: string;
  confidenceLevel?: number;
  minimumDetectableEffect?: number;
}

/**
 * A/B test result
 */
export interface ABTestResult {
  testId: string;
  winner: 'a' | 'b' | 'no_difference';
  variantAPerformance: number;
  variantBPerformance: number;
  statisticalSignificance: number;
  confidence: number;
  recommendation: string;
}

/**
 * Learning Engine main class
 */
export class LearningEngine {
  private patternCache: Map<string, PatternDiscoveryResult> = new Map();
  private activeTests: Map<string, AbTest> = new Map();
  private learningHistory: any[] = [];

  /**
   * Learn from feedback
   */
  async learnFromFeedback(feedbackId: string): Promise<void> {
    try {
      const feedbackItem = await this.getFeedback(feedbackId);
      if (!feedbackItem) {
        throw new Error('Feedback not found');
      }
      
      // Pattern recognition
      const patterns = await this.recognizePatterns(feedbackItem);
      
      // Generate rules from patterns
      for (const pattern of patterns) {
        if (pattern.confidence >= ConfidenceThreshold.SUGGEST_APPLY) {
          await this.generateRuleFromPattern(pattern);
        }
      }
      
      // Learn synonyms
      if (feedbackItem.feedbackType === 'field_correction') {
        await this.learnSynonym(feedbackItem);
      }
      
      // Learn entity aliases
      if (feedbackItem.feedbackType === 'entity_resolution') {
        await this.learnEntityAlias(feedbackItem);
      }
      
      // Optimize thresholds
      await this.optimizeThresholds(feedbackItem);
      
      // Adjust weights
      await this.adjustWeights(feedbackItem);
      
      // Track learning
      this.learningHistory.push({
        feedbackId,
        timestamp: new Date(),
        patternsFound: patterns.length,
        actionsToken: patterns.filter(p => p.confidence >= ConfidenceThreshold.AUTO_APPLY).length,
      });
      
      // Emit event
      await eventBus.emit('learning:completed', {
        feedbackId,
        patterns: patterns.length,
      });
      
    } catch (error) {
      console.error('Error learning from feedback:', error);
      throw error;
    }
  }

  /**
   * Recognize patterns from feedback
   */
  async recognizePatterns(feedbackItem: Feedback): Promise<PatternDiscoveryResult[]> {
    const patterns: PatternDiscoveryResult[] = [];
    
    try {
      // Find similar feedback
      const similarFeedback = await this.findSimilarFeedback(feedbackItem);
      
      if (similarFeedback.length >= 3) {
        // Field mapping pattern
        if (feedbackItem.fieldName && feedbackItem.correctedValue) {
          const fieldPattern = await this.detectFieldMappingPattern(feedbackItem, similarFeedback);
          if (fieldPattern) {
            patterns.push(fieldPattern);
          }
        }
        
        // Transformation pattern
        const transformPattern = await this.detectTransformationPattern(feedbackItem, similarFeedback);
        if (transformPattern) {
          patterns.push(transformPattern);
        }
        
        // Classification pattern
        if (feedbackItem.feedbackType === 'classification_correction') {
          const classPattern = await this.detectClassificationPattern(feedbackItem, similarFeedback);
          if (classPattern) {
            patterns.push(classPattern);
          }
        }
      }
      
      // Score adjustment pattern
      if (feedbackItem.feedbackType === 'score_adjustment') {
        const scorePattern = await this.detectScorePattern(feedbackItem);
        if (scorePattern) {
          patterns.push(scorePattern);
        }
      }
      
      // Cache patterns
      patterns.forEach(pattern => {
        const key = `${pattern.type}:${JSON.stringify(pattern.pattern)}`;
        this.patternCache.set(key, pattern);
      });
      
    } catch (error) {
      console.error('Error recognizing patterns:', error);
    }
    
    return patterns;
  }

  /**
   * Detect field mapping pattern
   */
  private async detectFieldMappingPattern(
    feedbackItem: Feedback,
    similarFeedback: Feedback[]
  ): Promise<PatternDiscoveryResult | null> {
    if (!feedbackItem.fieldName || !feedbackItem.originalValue || !feedbackItem.correctedValue) {
      return null;
    }
    
    // Count occurrences of this mapping
    const mappings = similarFeedback.filter(f => 
      f.fieldName === feedbackItem.fieldName &&
      f.originalValue === feedbackItem.originalValue &&
      f.correctedValue === feedbackItem.correctedValue
    );
    
    if (mappings.length < 2) {
      return null;
    }
    
    return {
      pattern: {
        field: feedbackItem.fieldName,
        from: feedbackItem.originalValue,
        to: feedbackItem.correctedValue,
      },
      type: PatternType.FIELD_MAPPING,
      confidence: Math.min(mappings.length * 20, 95),
      evidence: mappings.map(m => m.id),
      occurrences: mappings.length,
      impact: mappings.length * 10,
      suggestions: [
        `Add transformation rule: ${feedbackItem.fieldName} "${feedbackItem.originalValue}" → "${feedbackItem.correctedValue}"`,
      ],
    };
  }

  /**
   * Detect transformation pattern
   */
  private async detectTransformationPattern(
    feedbackItem: Feedback,
    similarFeedback: Feedback[]
  ): Promise<PatternDiscoveryResult | null> {
    if (!feedbackItem.originalValue || !feedbackItem.correctedValue) {
      return null;
    }
    
    // Analyze transformation type
    const original = String(feedbackItem.originalValue);
    const corrected = String(feedbackItem.correctedValue);
    
    // Check for common transformations
    let transformationType = null;
    let pattern = null;
    
    // Case transformation
    if (original.toLowerCase() === corrected.toLowerCase()) {
      transformationType = 'case_normalization';
      pattern = { transform: 'lowercase' };
    }
    
    // Prefix/suffix removal
    if (corrected.startsWith(original) || original.startsWith(corrected)) {
      transformationType = 'prefix_suffix';
      pattern = { 
        type: corrected.startsWith(original) ? 'add_prefix' : 'remove_prefix',
        value: corrected.startsWith(original) ? 
          corrected.substring(0, corrected.length - original.length) : 
          original.substring(0, original.length - corrected.length)
      };
    }
    
    // Phone number formatting
    if (feedbackItem.fieldName === 'phone') {
      transformationType = 'phone_format';
      pattern = { format: 'standard' };
    }
    
    if (!transformationType) {
      return null;
    }
    
    return {
      pattern: {
        type: transformationType,
        rule: pattern,
        field: feedbackItem.fieldName,
      },
      type: PatternType.TRANSFORMATION_RULE,
      confidence: 70,
      evidence: [feedbackItem.id],
      occurrences: 1,
      impact: 30,
      suggestions: [
        `Apply ${transformationType} transformation to ${feedbackItem.fieldName}`,
      ],
    };
  }

  /**
   * Detect classification pattern
   */
  private async detectClassificationPattern(
    feedbackItem: Feedback,
    similarFeedback: Feedback[]
  ): Promise<PatternDiscoveryResult | null> {
    const context = feedbackItem.context as any;
    if (!context?.currentClassification || !context?.correctClassification) {
      return null;
    }
    
    // Count misclassifications
    const misclassifications = similarFeedback.filter(f => {
      const ctx = f.context as any;
      return ctx?.currentClassification === context.currentClassification &&
             ctx?.correctClassification === context.correctClassification;
    });
    
    if (misclassifications.length < 2) {
      return null;
    }
    
    return {
      pattern: {
        from: context.currentClassification,
        to: context.correctClassification,
        field: feedbackItem.fieldName || 'classification',
      },
      type: PatternType.CLASSIFICATION_RULE,
      confidence: Math.min(misclassifications.length * 15, 85),
      evidence: misclassifications.map(m => m.id),
      occurrences: misclassifications.length,
      impact: misclassifications.length * 15,
      suggestions: [
        `Update classification rule: ${context.currentClassification} → ${context.correctClassification}`,
      ],
    };
  }

  /**
   * Detect score adjustment pattern
   */
  private async detectScorePattern(feedbackItem: Feedback): Promise<PatternDiscoveryResult | null> {
    const context = feedbackItem.context as any;
    if (!context?.currentScore || !context?.adjustedScore) {
      return null;
    }
    
    const adjustment = context.adjustedScore - context.currentScore;
    const adjustmentPercent = (adjustment / context.currentScore) * 100;
    
    return {
      pattern: {
        scoreType: context.scoreType || 'quality',
        adjustmentDirection: adjustment > 0 ? 'increase' : 'decrease',
        adjustmentAmount: Math.abs(adjustmentPercent),
        factors: context.factors || [],
      },
      type: PatternType.SCORE_WEIGHT,
      confidence: 60,
      evidence: [feedbackItem.id],
      occurrences: 1,
      impact: Math.abs(adjustmentPercent),
      suggestions: [
        `Adjust ${context.scoreType || 'quality'} score weights by ${adjustmentPercent.toFixed(1)}%`,
      ],
    };
  }

  /**
   * Generate rule from pattern
   */
  async generateRuleFromPattern(pattern: PatternDiscoveryResult): Promise<string | null> {
    try {
      let rule: Partial<Rule> | null = null;
      
      switch (pattern.type) {
        case PatternType.FIELD_MAPPING:
          rule = this.createFieldMappingRule(pattern);
          break;
        
        case PatternType.TRANSFORMATION_RULE:
          rule = this.createTransformationRule(pattern);
          break;
        
        case PatternType.CLASSIFICATION_RULE:
          rule = this.createClassificationRule(pattern);
          break;
        
        case PatternType.VALIDATION_RULE:
          rule = this.createValidationRule(pattern);
          break;
      }
      
      if (!rule) {
        return null;
      }
      
      // Store as learned pattern
      const [storedPattern] = await db.insert(learnedPatterns).values({
        patternType: pattern.type,
        patternCategory: this.getPatternCategory(pattern),
        patternValue: pattern.pattern,
        description: `Auto-generated from ${pattern.occurrences} feedback occurrences`,
        examples: pattern.evidence.slice(0, 5),
        confidence: pattern.confidence,
        occurrences: pattern.occurrences,
        sourceType: 'feedback',
        sourceFeedbackIds: pattern.evidence,
        status: pattern.confidence >= ConfidenceThreshold.AUTO_APPLY ? 'active' : 'testing',
      }).returning();
      
      // Create improvement suggestion if confidence not high enough for auto-apply
      if (pattern.confidence < ConfidenceThreshold.AUTO_APPLY) {
        await db.insert(improvementSuggestions).values({
          suggestionType: 'new_rule',
          title: `Implement ${pattern.type} pattern`,
          description: pattern.suggestions[0] || `Apply learned ${pattern.type} pattern`,
          impactScore: pattern.impact,
          affectedLeadsCount: pattern.occurrences,
          estimatedImprovement: pattern.confidence / 2,
          evidence: {
            patternId: storedPattern.id,
            pattern: pattern.pattern,
            feedbackIds: pattern.evidence,
          },
          status: 'pending',
          priority: pattern.impact > 50 ? 'high' : 'medium',
        });
      }
      
      return storedPattern.id;
      
    } catch (error) {
      console.error('Error generating rule from pattern:', error);
      return null;
    }
  }

  /**
   * Create field mapping rule
   */
  private createFieldMappingRule(pattern: PatternDiscoveryResult): Partial<Rule> {
    const p = pattern.pattern;
    return {
      name: `Field mapping: ${p.field} ${p.from} → ${p.to}`,
      description: `Auto-generated mapping rule from feedback`,
      type: RuleType.TRANSFORMATION,
      condition: {
        field: p.field,
        operator: '==',
        value: p.from,
      },
      actions: [{
        type: 'set_field',
        field: p.field,
        value: p.to,
      }],
      precedence: 30, // Learned rules have medium precedence
      priority: pattern.confidence,
      enabled: pattern.confidence >= ConfidenceThreshold.AUTO_APPLY,
    };
  }

  /**
   * Create transformation rule
   */
  private createTransformationRule(pattern: PatternDiscoveryResult): Partial<Rule> {
    const p = pattern.pattern;
    return {
      name: `Transformation: ${p.type} on ${p.field}`,
      description: `Auto-generated transformation rule`,
      type: RuleType.TRANSFORMATION,
      condition: {
        field: p.field,
        operator: 'is_not_null',
      },
      actions: [{
        type: 'transform',
        field: p.field,
        metadata: p.rule,
      }],
      precedence: 30,
      priority: pattern.confidence,
      enabled: pattern.confidence >= ConfidenceThreshold.AUTO_APPLY,
    };
  }

  /**
   * Create classification rule
   */
  private createClassificationRule(pattern: PatternDiscoveryResult): Partial<Rule> {
    const p = pattern.pattern;
    return {
      name: `Classification correction: ${p.from} → ${p.to}`,
      description: `Auto-generated classification rule`,
      type: RuleType.TRANSFORMATION,
      condition: {
        field: p.field,
        operator: '==',
        value: p.from,
      },
      actions: [{
        type: 'set_field',
        field: p.field,
        value: p.to,
      }],
      precedence: 30,
      priority: pattern.confidence,
      enabled: pattern.confidence >= ConfidenceThreshold.AUTO_APPLY,
    };
  }

  /**
   * Create validation rule
   */
  private createValidationRule(pattern: PatternDiscoveryResult): Partial<Rule> {
    const p = pattern.pattern;
    return {
      name: `Validation rule for ${p.field}`,
      description: `Auto-generated validation rule`,
      type: RuleType.VALIDATION,
      condition: p.condition,
      actions: [{
        type: 'reject',
        message: p.message || 'Validation failed',
      }],
      precedence: 30,
      priority: pattern.confidence,
      enabled: pattern.confidence >= ConfidenceThreshold.AUTO_APPLY,
    };
  }

  /**
   * Get pattern category
   */
  private getPatternCategory(pattern: PatternDiscoveryResult): string {
    if (pattern.pattern.field) {
      return pattern.pattern.field;
    }
    return pattern.type;
  }

  /**
   * Learn synonym from feedback
   */
  async learnSynonym(feedbackItem: Feedback): Promise<void> {
    if (!feedbackItem.fieldName || !feedbackItem.originalValue || !feedbackItem.correctedValue) {
      return;
    }
    
    // Check if this is a potential synonym
    const original = String(feedbackItem.originalValue).toLowerCase();
    const corrected = String(feedbackItem.correctedValue).toLowerCase();
    
    // Simple similarity check (could be more sophisticated)
    const similarity = this.calculateSimilarity(original, corrected);
    
    if (similarity > 0.7) {
      // Store as synonym pattern
      await db.insert(learnedPatterns).values({
        patternType: PatternType.SYNONYM,
        patternCategory: feedbackItem.fieldName,
        patternValue: {
          term: original,
          canonicalTerm: corrected,
          field: feedbackItem.fieldName,
        },
        description: `Synonym: "${original}" → "${corrected}"`,
        confidence: similarity * 100,
        occurrences: 1,
        sourceType: 'feedback',
        sourceFeedbackIds: [feedbackItem.id],
        status: 'discovered',
      });
    }
  }

  /**
   * Learn entity alias from feedback
   */
  async learnEntityAlias(feedbackItem: Feedback): Promise<void> {
    const context = feedbackItem.context as any;
    if (!context?.entity1Id || !context?.entity2Id || context?.action !== 'merge') {
      return;
    }
    
    // Get entity details
    const entities = await db.select()
      .from(leads)
      .where(inArray(leads.id, [context.entity1Id, context.entity2Id]));
    
    if (entities.length === 2) {
      const entity1 = entities[0];
      const entity2 = entities[1];
      
      // Store as entity alias pattern
      await db.insert(learnedPatterns).values({
        patternType: PatternType.ENTITY_ALIAS,
        patternCategory: 'business_name',
        patternValue: {
          name1: entity1.businessName,
          name2: entity2.businessName,
          matchType: 'alias',
        },
        description: `Entity alias: "${entity1.businessName}" = "${entity2.businessName}"`,
        confidence: context.confidence || 75,
        occurrences: 1,
        sourceType: 'feedback',
        sourceFeedbackIds: [feedbackItem.id],
        status: 'discovered',
      });
    }
  }

  /**
   * Optimize thresholds based on feedback
   */
  async optimizeThresholds(feedbackItem: Feedback): Promise<ThresholdOptimizationResult[]> {
    const optimizations: ThresholdOptimizationResult[] = [];
    
    if (feedbackItem.feedbackType === 'entity_resolution') {
      const context = feedbackItem.context as any;
      
      // Check if threshold adjustment might help
      if (context?.confidence && context?.action) {
        let adjustment = null;
        
        if (context.action === 'merge' && context.confidence < 70) {
          // Lower threshold might catch more matches
          adjustment = {
            metric: 'entity_match_threshold',
            oldThreshold: 70,
            newThreshold: context.confidence - 5,
            expectedImprovement: 10,
            confidence: 60,
            testRecommended: true,
          };
        } else if (context.action === 'split' && context.confidence > 70) {
          // Higher threshold might prevent false matches
          adjustment = {
            metric: 'entity_match_threshold',
            oldThreshold: 70,
            newThreshold: context.confidence + 5,
            expectedImprovement: 8,
            confidence: 55,
            testRecommended: true,
          };
        }
        
        if (adjustment) {
          optimizations.push(adjustment);
          
          // Store as pattern for testing
          await db.insert(learnedPatterns).values({
            patternType: PatternType.THRESHOLD_ADJUSTMENT,
            patternCategory: 'entity_resolution',
            patternValue: adjustment,
            description: `Threshold adjustment for entity resolution`,
            confidence: adjustment.confidence,
            occurrences: 1,
            sourceType: 'feedback',
            sourceFeedbackIds: [feedbackItem.id],
            status: 'discovered',
          });
        }
      }
    }
    
    return optimizations;
  }

  /**
   * Adjust weights based on feedback
   */
  async adjustWeights(feedbackItem: Feedback): Promise<WeightAdjustmentResult[]> {
    const adjustments: WeightAdjustmentResult[] = [];
    
    if (feedbackItem.feedbackType === 'score_adjustment') {
      const context = feedbackItem.context as any;
      
      if (context?.factors && Array.isArray(context.factors)) {
        // Calculate weight adjustments for each factor
        for (const factor of context.factors) {
          const adjustment: WeightAdjustmentResult = {
            field: factor,
            oldWeight: 1.0, // Would fetch actual weight
            newWeight: context.adjustedScore > context.currentScore ? 1.2 : 0.8,
            improvement: Math.abs(context.adjustedScore - context.currentScore),
            confidence: 50,
            basedOn: 1,
          };
          
          adjustments.push(adjustment);
          
          // Store as pattern
          await db.insert(learnedPatterns).values({
            patternType: PatternType.SCORE_WEIGHT,
            patternCategory: 'scoring',
            patternValue: adjustment,
            description: `Weight adjustment for ${factor}`,
            confidence: adjustment.confidence,
            occurrences: 1,
            sourceType: 'feedback',
            sourceFeedbackIds: [feedbackItem.id],
            status: 'discovered',
          });
        }
      }
    }
    
    return adjustments;
  }

  /**
   * Start A/B test
   */
  async startABTest(config: ABTestConfig): Promise<string> {
    try {
      const [test] = await db.insert(abTests).values({
        testName: config.name,
        testDescription: config.description,
        testType: config.type,
        variantA: config.variantA,
        variantB: config.variantB,
        sampleSize: config.sampleSize,
        confidenceLevel: config.confidenceLevel || 0.95,
        minimumDetectableEffect: config.minimumDetectableEffect || 0.05,
        status: 'running',
        startedAt: new Date(),
      }).returning();
      
      // Cache active test
      this.activeTests.set(test.id, test);
      
      // Emit event
      await eventBus.emit('abtest:started', {
        testId: test.id,
        name: config.name,
      });
      
      return test.id;
      
    } catch (error) {
      console.error('Error starting A/B test:', error);
      throw error;
    }
  }

  /**
   * Update A/B test results
   */
  async updateABTestResults(
    testId: string,
    variant: 'a' | 'b',
    success: boolean
  ): Promise<void> {
    try {
      const test = await db.select()
        .from(abTests)
        .where(eq(abTests.id, testId))
        .limit(1);
      
      if (!test || test.length === 0) {
        throw new Error('Test not found');
      }
      
      const currentTest = test[0];
      
      // Update metrics
      const variantMetrics = variant === 'a' ? 
        currentTest.variantAMetrics || { successes: 0, failures: 0 } :
        currentTest.variantBMetrics || { successes: 0, failures: 0 };
      
      if (success) {
        variantMetrics.successes++;
      } else {
        variantMetrics.failures++;
      }
      
      const updates = variant === 'a' ? 
        { variantAMetrics: variantMetrics } :
        { variantBMetrics: variantMetrics };
      
      await db.update(abTests)
        .set(updates)
        .where(eq(abTests.id, testId));
      
      // Check if test is complete
      const totalSamples = 
        (currentTest.variantAMetrics?.successes || 0) +
        (currentTest.variantAMetrics?.failures || 0) +
        (currentTest.variantBMetrics?.successes || 0) +
        (currentTest.variantBMetrics?.failures || 0);
      
      if (totalSamples >= currentTest.sampleSize) {
        await this.completeABTest(testId);
      }
      
    } catch (error) {
      console.error('Error updating A/B test results:', error);
    }
  }

  /**
   * Complete A/B test and analyze results
   */
  async completeABTest(testId: string): Promise<ABTestResult> {
    try {
      const test = await db.select()
        .from(abTests)
        .where(eq(abTests.id, testId))
        .limit(1);
      
      if (!test || test.length === 0) {
        throw new Error('Test not found');
      }
      
      const currentTest = test[0];
      
      // Calculate performance
      const aMetrics = currentTest.variantAMetrics as any || { successes: 0, failures: 0 };
      const bMetrics = currentTest.variantBMetrics as any || { successes: 0, failures: 0 };
      
      const aTotal = aMetrics.successes + aMetrics.failures;
      const bTotal = bMetrics.successes + bMetrics.failures;
      
      const aPerformance = aTotal > 0 ? aMetrics.successes / aTotal : 0;
      const bPerformance = bTotal > 0 ? bMetrics.successes / bTotal : 0;
      
      // Simple statistical significance (would use proper statistics in production)
      const pooledProportion = 
        (aMetrics.successes + bMetrics.successes) / (aTotal + bTotal);
      const standardError = Math.sqrt(
        pooledProportion * (1 - pooledProportion) * (1/aTotal + 1/bTotal)
      );
      const zScore = (bPerformance - aPerformance) / standardError;
      const pValue = 1 - this.normalCDF(Math.abs(zScore));
      
      // Determine winner
      let winner: 'a' | 'b' | 'no_difference' = 'no_difference';
      if (pValue < 0.05) {
        winner = bPerformance > aPerformance ? 'b' : 'a';
      }
      
      // Update test
      await db.update(abTests)
        .set({
          status: 'completed',
          endedAt: new Date(),
          winner,
          statisticalSignificance: pValue,
          decision: winner === 'b' ? 'adopt_b' : winner === 'a' ? 'keep_a' : 'no_difference',
        })
        .where(eq(abTests.id, testId));
      
      // Remove from active tests
      this.activeTests.delete(testId);
      
      const result: ABTestResult = {
        testId,
        winner,
        variantAPerformance: aPerformance,
        variantBPerformance: bPerformance,
        statisticalSignificance: pValue,
        confidence: (1 - pValue) * 100,
        recommendation: winner === 'b' ? 
          'Adopt variant B - significantly better performance' :
          winner === 'a' ?
          'Keep variant A - control performs better' :
          'No significant difference - continue with current approach',
      };
      
      // Emit event
      await eventBus.emit('abtest:completed', result);
      
      return result;
      
    } catch (error) {
      console.error('Error completing A/B test:', error);
      throw error;
    }
  }

  /**
   * Apply learned patterns
   */
  async applyLearnedPatterns(): Promise<number> {
    try {
      // Get active patterns
      const patterns = await db.select()
        .from(learnedPatterns)
        .where(eq(learnedPatterns.status, 'active'));
      
      let appliedCount = 0;
      
      for (const pattern of patterns) {
        const success = await this.applyPattern(pattern);
        if (success) {
          appliedCount++;
          
          // Update application count
          await db.update(learnedPatterns)
            .set({
              applicationsCount: sql`${learnedPatterns.applicationsCount} + 1`,
              successfulApplications: sql`${learnedPatterns.successfulApplications} + 1`,
              lastSeen: new Date(),
            })
            .where(eq(learnedPatterns.id, pattern.id));
        }
      }
      
      return appliedCount;
      
    } catch (error) {
      console.error('Error applying learned patterns:', error);
      return 0;
    }
  }

  /**
   * Apply single pattern
   */
  private async applyPattern(pattern: LearnedPattern): Promise<boolean> {
    try {
      switch (pattern.patternType) {
        case PatternType.SYNONYM:
          return await this.applySynonymPattern(pattern);
        
        case PatternType.FIELD_MAPPING:
          return await this.applyFieldMappingPattern(pattern);
        
        case PatternType.THRESHOLD_ADJUSTMENT:
          return await this.applyThresholdPattern(pattern);
        
        default:
          return false;
      }
    } catch (error) {
      console.error('Error applying pattern:', error);
      return false;
    }
  }

  /**
   * Apply synonym pattern
   */
  private async applySynonymPattern(pattern: LearnedPattern): Promise<boolean> {
    const value = pattern.patternValue as any;
    if (!value?.term || !value?.canonicalTerm || !value?.field) {
      return false;
    }
    
    // This would update the ontology configuration
    // For now, just log it
    console.log(`Applying synonym: ${value.field} "${value.term}" → "${value.canonicalTerm}"`);
    return true;
  }

  /**
   * Apply field mapping pattern
   */
  private async applyFieldMappingPattern(pattern: LearnedPattern): Promise<boolean> {
    const value = pattern.patternValue as any;
    if (!value?.field || !value?.from || !value?.to) {
      return false;
    }
    
    // Create or update transformation rule
    console.log(`Applying field mapping: ${value.field} "${value.from}" → "${value.to}"`);
    return true;
  }

  /**
   * Apply threshold pattern
   */
  private async applyThresholdPattern(pattern: LearnedPattern): Promise<boolean> {
    const value = pattern.patternValue as any;
    if (!value?.metric || !value?.newThreshold) {
      return false;
    }
    
    // This would update the configuration
    console.log(`Applying threshold: ${value.metric} = ${value.newThreshold}`);
    return true;
  }

  /**
   * Helper functions
   */
  
  private async getFeedback(feedbackId: string): Promise<Feedback | null> {
    const result = await db.select()
      .from(feedback)
      .where(eq(feedback.id, feedbackId))
      .limit(1);
    
    return result[0] || null;
  }

  private async findSimilarFeedback(feedbackItem: Feedback): Promise<Feedback[]> {
    return await db.select()
      .from(feedback)
      .where(and(
        eq(feedback.feedbackType, feedbackItem.feedbackType),
        feedbackItem.fieldName ? eq(feedback.fieldName, feedbackItem.fieldName) : sql`true`,
        ne(feedback.id, feedbackItem.id)
      ))
      .limit(20);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein-based similarity
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
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
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private normalCDF(z: number): number {
    // Approximation of normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2.0);
    
    const t = 1.0 / (1.0 + p * z);
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    
    const y = 1.0 - (((((a5 * t5 + a4 * t4) + a3 * t3) + a2 * t2) + a1 * t) * Math.exp(-z * z));
    
    return 0.5 * (1.0 + sign * y);
  }
  
  /**
   * Get learning metrics
   */
  async getLearningMetrics(): Promise<{
    totalPatterns: number;
    activePatterns: number;
    testingPatterns: number;
    averageConfidence: number;
    totalApplications: number;
    successRate: number;
    activeTests: number;
  }> {
    const patterns = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(case when status = 'active' then 1 end)`,
      testing: sql<number>`count(case when status = 'testing' then 1 end)`,
      avgConfidence: sql<number>`avg(confidence)`,
      totalApps: sql<number>`sum(applications_count)`,
      successfulApps: sql<number>`sum(successful_applications)`,
    })
    .from(learnedPatterns);
    
    const stats = patterns[0];
    const totalApps = Number(stats?.totalApps || 0);
    const successfulApps = Number(stats?.successfulApps || 0);
    
    return {
      totalPatterns: Number(stats?.total || 0),
      activePatterns: Number(stats?.active || 0),
      testingPatterns: Number(stats?.testing || 0),
      averageConfidence: Number(stats?.avgConfidence || 0),
      totalApplications: totalApps,
      successRate: totalApps > 0 ? successfulApps / totalApps : 0,
      activeTests: this.activeTests.size,
    };
  }
}

// Export singleton instance
export const learningEngine = new LearningEngine();