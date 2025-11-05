/**
 * Feedback API Routes
 * HTTP endpoints for feedback collection and learning system
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { feedback, learnedPatterns, improvementSuggestions, abTests, feedbackMetrics, leads } from '@shared/schema';
import { eq, and, or, sql, desc, asc, inArray, gte, lte, like } from 'drizzle-orm';
import { feedbackCollectionSystem, FeedbackType, FeedbackSubmission } from '../intelligence/feedback-system';
import { learningEngine, ABTestConfig } from '../intelligence/learning-engine';
import { eventBus } from '../services/event-bus';

const router = Router();

/**
 * Submit feedback
 * POST /api/feedback/submit
 */
router.post('/submit', async (req, res) => {
  try {
    const schema = z.object({
      leadId: z.string().optional(),
      feedbackType: z.enum([
        'field_correction',
        'entity_resolution',
        'classification_correction',
        'score_adjustment',
        'rule_suggestion',
        'synonym_addition',
        'threshold_adjustment',
        'pattern_identification',
        'data_quality',
        'validation'
      ]),
      data: z.any(),
      confidence: z.number().min(0).max(100).optional(),
      priority: z.number().min(0).max(100).optional(),
      explanation: z.string().optional(),
      affectedLeads: z.array(z.string()).optional(),
    });
    
    const validatedData = schema.parse(req.body);
    
    // Get operator ID from session
    const operatorId = (req as any).session?.userId;
    if (!operatorId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const submission: FeedbackSubmission = {
      ...validatedData,
      feedbackType: validatedData.feedbackType as FeedbackType,
      operatorId,
    };
    
    // Submit feedback
    const result = await feedbackCollectionSystem.submitFeedback(submission);
    
    // Trigger learning asynchronously
    learningEngine.learnFromFeedback(result.id).catch(error => {
      console.error('Error learning from feedback:', error);
    });
    
    res.json({
      success: true,
      feedback: result,
      message: 'Feedback submitted successfully',
    });
    
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to submit feedback',
      details: error.errors || undefined,
    });
  }
});

/**
 * Get pending feedback
 * GET /api/feedback/pending
 */
router.get('/pending', async (req, res) => {
  try {
    const { 
      limit = 20, 
      offset = 0,
      type,
      priority,
    } = req.query;
    
    const whereConditions = [
      eq(feedback.status, 'pending'),
    ];
    
    if (type) {
      whereConditions.push(eq(feedback.feedbackType, type as string));
    }
    
    if (priority) {
      whereConditions.push(gte(feedback.priority, parseInt(priority as string)));
    }
    
    const items = await db.select()
      .from(feedback)
      .where(and(...whereConditions))
      .orderBy(desc(feedback.priority), desc(feedback.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const total = await db.select({
      count: sql<number>`count(*)`
    })
    .from(feedback)
    .where(and(...whereConditions));
    
    res.json({
      items,
      total: Number(total[0]?.count || 0),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
  } catch (error) {
    console.error('Error fetching pending feedback:', error);
    res.status(500).json({ error: 'Failed to fetch pending feedback' });
  }
});

/**
 * Apply specific feedback
 * POST /api/feedback/apply/:id
 */
router.post('/apply/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Apply feedback
    await feedbackCollectionSystem.applyFeedback(id);
    
    // Update reviewed by
    await db.update(feedback)
      .set({
        reviewedBy: user.id,
      })
      .where(eq(feedback.id, id));
    
    res.json({
      success: true,
      message: 'Feedback applied successfully',
    });
    
  } catch (error: any) {
    console.error('Error applying feedback:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to apply feedback' 
    });
  }
});

/**
 * Bulk apply feedback
 * POST /api/feedback/bulk-apply
 */
router.post('/bulk-apply', async (req, res) => {
  try {
    const schema = z.object({
      feedbackIds: z.array(z.string()).min(1),
      options: z.object({
        batchSize: z.number().optional(),
        parallel: z.boolean().optional(),
        validateOnly: z.boolean().optional(),
        testMode: z.boolean().optional(),
        rollbackOnError: z.boolean().optional(),
      }).optional(),
    });
    
    const { feedbackIds, options } = schema.parse(req.body);
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Process feedback in batches
    const result = await feedbackCollectionSystem.batchProcessFeedback(
      feedbackIds,
      options
    );
    
    res.json({
      success: true,
      result,
      message: `Processed ${result.successful.length} feedback items successfully`,
    });
    
  } catch (error: any) {
    console.error('Error bulk applying feedback:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to bulk apply feedback' 
    });
  }
});

/**
 * Get learned patterns
 * GET /api/feedback/patterns
 */
router.get('/patterns', async (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
      type,
      status = 'active',
      minConfidence,
    } = req.query;
    
    const whereConditions = [];
    
    if (status) {
      whereConditions.push(eq(learnedPatterns.status, status as string));
    }
    
    if (type) {
      whereConditions.push(eq(learnedPatterns.patternType, type as string));
    }
    
    if (minConfidence) {
      whereConditions.push(gte(learnedPatterns.confidence, parseFloat(minConfidence as string)));
    }
    
    const patterns = await db.select()
      .from(learnedPatterns)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(learnedPatterns.confidence), desc(learnedPatterns.occurrences))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const total = await db.select({
      count: sql<number>`count(*)`
    })
    .from(learnedPatterns)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
    
    res.json({
      patterns,
      total: Number(total[0]?.count || 0),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
  } catch (error) {
    console.error('Error fetching learned patterns:', error);
    res.status(500).json({ error: 'Failed to fetch learned patterns' });
  }
});

/**
 * Get improvement suggestions
 * GET /api/feedback/suggestions
 */
router.get('/suggestions', async (req, res) => {
  try {
    const {
      limit = 20,
      offset = 0,
      status = 'pending',
      priority,
      minImpact,
    } = req.query;
    
    const whereConditions = [];
    
    if (status) {
      whereConditions.push(eq(improvementSuggestions.status, status as string));
    }
    
    if (priority) {
      whereConditions.push(eq(improvementSuggestions.priority, priority as string));
    }
    
    if (minImpact) {
      whereConditions.push(gte(improvementSuggestions.impactScore, parseInt(minImpact as string)));
    }
    
    const suggestions = await db.select()
      .from(improvementSuggestions)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(improvementSuggestions.impactScore), desc(improvementSuggestions.createdAt))
      .limit(parseInt(limit as string))
      .offset(parseInt(offset as string));
    
    const total = await db.select({
      count: sql<number>`count(*)`
    })
    .from(improvementSuggestions)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
    
    res.json({
      suggestions,
      total: Number(total[0]?.count || 0),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    
  } catch (error) {
    console.error('Error fetching improvement suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch improvement suggestions' });
  }
});

/**
 * Trigger model retraining
 * POST /api/feedback/train
 */
router.post('/train', async (req, res) => {
  try {
    const schema = z.object({
      mode: z.enum(['full', 'incremental', 'test']).optional(),
      targetMetrics: z.array(z.string()).optional(),
      minConfidence: z.number().min(0).max(100).optional(),
    });
    
    const { mode = 'incremental', targetMetrics, minConfidence = 60 } = schema.parse(req.body);
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Start training process asynchronously
    const trainingJob = {
      id: `training-${Date.now()}`,
      mode,
      startedAt: new Date(),
      status: 'running',
    };
    
    // Apply learned patterns
    learningEngine.applyLearnedPatterns()
      .then(appliedCount => {
        console.log(`Applied ${appliedCount} learned patterns`);
        eventBus.emit('training:completed', {
          jobId: trainingJob.id,
          appliedPatterns: appliedCount,
        });
      })
      .catch(error => {
        console.error('Training failed:', error);
        eventBus.emit('training:failed', {
          jobId: trainingJob.id,
          error: error.message,
        });
      });
    
    res.json({
      success: true,
      job: trainingJob,
      message: 'Training started successfully',
    });
    
  } catch (error: any) {
    console.error('Error starting training:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to start training' 
    });
  }
});

/**
 * Analyze feedback impact
 * GET /api/feedback/impact/:id
 */
router.get('/impact/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get feedback item
    const feedbackItem = await db.select()
      .from(feedback)
      .where(eq(feedback.id, id))
      .limit(1);
    
    if (!feedbackItem || feedbackItem.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }
    
    const fb = feedbackItem[0];
    
    // Calculate impact
    const impact = {
      directImpact: {
        leadsAffected: fb.affectedLeads?.length || 1,
        fieldsChanged: fb.fieldName ? 1 : 0,
        confidence: fb.confidence,
      },
      indirectImpact: {
        patternsGenerated: 0,
        rulesCreated: 0,
        similarFeedback: 0,
      },
      potentialImpact: {
        estimatedLeadsAffected: 0,
        estimatedAccuracyImprovement: 0,
        estimatedTimeReduction: 0,
      },
    };
    
    // Find related patterns
    const patterns = await db.select()
      .from(learnedPatterns)
      .where(sql`${learnedPatterns.sourceFeedbackIds} @> '[${JSON.stringify(id)}]'::jsonb`)
      .limit(10);
    
    impact.indirectImpact.patternsGenerated = patterns.length;
    
    // Find similar feedback
    const similar = await db.select({
      count: sql<number>`count(*)`
    })
    .from(feedback)
    .where(and(
      eq(feedback.feedbackType, fb.feedbackType),
      fb.fieldName ? eq(feedback.fieldName, fb.fieldName) : sql`true`,
      sql`${feedback.id} != ${id}`
    ));
    
    impact.indirectImpact.similarFeedback = Number(similar[0]?.count || 0);
    
    // Estimate potential impact
    if (fb.affectedLeads && fb.affectedLeads.length > 0) {
      // Find similar leads
      const totalLeads = await db.select({
        count: sql<number>`count(*)`
      })
      .from(leads);
      
      const ratio = fb.affectedLeads.length / Number(totalLeads[0]?.count || 1);
      impact.potentialImpact.estimatedLeadsAffected = Math.round(ratio * Number(totalLeads[0]?.count || 0));
    }
    
    impact.potentialImpact.estimatedAccuracyImprovement = (fb.confidence / 100) * 10; // Rough estimate
    impact.potentialImpact.estimatedTimeReduction = fb.affectedLeads?.length || 0 * 2; // Seconds saved per lead
    
    res.json({
      feedback: fb,
      impact,
    });
    
  } catch (error) {
    console.error('Error analyzing feedback impact:', error);
    res.status(500).json({ error: 'Failed to analyze feedback impact' });
  }
});

/**
 * Get feedback statistics
 * GET /api/feedback/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const stats = await feedbackCollectionSystem.getFeedbackStatistics(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );
    
    // Get learning metrics
    const learningMetrics = await learningEngine.getLearningMetrics();
    
    res.json({
      feedback: stats,
      learning: learningMetrics,
    });
    
  } catch (error) {
    console.error('Error fetching feedback statistics:', error);
    res.status(500).json({ error: 'Failed to fetch feedback statistics' });
  }
});

/**
 * Start A/B test
 * POST /api/feedback/ab-test/start
 */
router.post('/ab-test/start', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string(),
      description: z.string(),
      type: z.enum(['pattern', 'threshold', 'weight', 'rule', 'model']),
      variantA: z.any(),
      variantB: z.any(),
      sampleSize: z.number().min(10),
      successMetric: z.string(),
      confidenceLevel: z.number().min(0).max(1).optional(),
      minimumDetectableEffect: z.number().min(0).max(1).optional(),
    });
    
    const testConfig = schema.parse(req.body) as ABTestConfig;
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Start test
    const testId = await learningEngine.startABTest(testConfig);
    
    res.json({
      success: true,
      testId,
      message: 'A/B test started successfully',
    });
    
  } catch (error: any) {
    console.error('Error starting A/B test:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to start A/B test' 
    });
  }
});

/**
 * Update A/B test results
 * POST /api/feedback/ab-test/:id/update
 */
router.post('/ab-test/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    
    const schema = z.object({
      variant: z.enum(['a', 'b']),
      success: z.boolean(),
    });
    
    const { variant, success } = schema.parse(req.body);
    
    // Update test results
    await learningEngine.updateABTestResults(id, variant, success);
    
    res.json({
      success: true,
      message: 'Test results updated',
    });
    
  } catch (error: any) {
    console.error('Error updating A/B test:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to update A/B test' 
    });
  }
});

/**
 * Complete A/B test
 * POST /api/feedback/ab-test/:id/complete
 */
router.post('/ab-test/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Complete test and get results
    const result = await learningEngine.completeABTest(id);
    
    res.json({
      success: true,
      result,
    });
    
  } catch (error: any) {
    console.error('Error completing A/B test:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to complete A/B test' 
    });
  }
});

/**
 * Get active A/B tests
 * GET /api/feedback/ab-test/active
 */
router.get('/ab-test/active', async (req, res) => {
  try {
    const tests = await db.select()
      .from(abTests)
      .where(eq(abTests.status, 'running'))
      .orderBy(desc(abTests.startedAt));
    
    res.json({
      tests,
      total: tests.length,
    });
    
  } catch (error) {
    console.error('Error fetching active A/B tests:', error);
    res.status(500).json({ error: 'Failed to fetch active A/B tests' });
  }
});

/**
 * Get feedback metrics
 * GET /api/feedback/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const { periodType = 'daily', limit = 7 } = req.query;
    
    const metrics = await db.select()
      .from(feedbackMetrics)
      .where(eq(feedbackMetrics.periodType, periodType as string))
      .orderBy(desc(feedbackMetrics.periodEnd))
      .limit(parseInt(limit as string));
    
    res.json({
      metrics,
      periodType,
    });
    
  } catch (error) {
    console.error('Error fetching feedback metrics:', error);
    res.status(500).json({ error: 'Failed to fetch feedback metrics' });
  }
});

/**
 * Rollback feedback
 * POST /api/feedback/rollback/:id
 */
router.post('/rollback/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check permissions (admin only)
    const user = (req as any).session?.user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Rollback feedback
    await feedbackCollectionSystem.rollbackFeedback(id);
    
    res.json({
      success: true,
      message: 'Feedback rolled back successfully',
    });
    
  } catch (error: any) {
    console.error('Error rolling back feedback:', error);
    res.status(400).json({ 
      error: error.message || 'Failed to rollback feedback' 
    });
  }
});

export default router;