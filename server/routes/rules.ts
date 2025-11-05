/**
 * Rules Management API
 * Endpoints for managing rules, scorecards, and dry-run testing
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { 
  rulesEngine, 
  Rule, 
  RuleType, 
  RulePrecedence, 
  ComparisonOperator,
  LogicalOperator,
  RuleContext,
  RuleExecutionResult,
  RuleValidationResult 
} from '../intelligence/rules-engine';
import { scorecardManager, ScorecardConfig, ScoreResult } from '../intelligence/scorecard';
import { ruleTester, TestReport } from '../intelligence/rule-tester';
import { db } from '../db';
import { rules, ruleExecutions, ruleVersions, scorecardConfigs } from '@shared/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { Lead, UccFiling } from '@shared/schema';

const router = Router();

// Validation schemas
const createRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['validation', 'scoring', 'transformation', 'enrichment', 'alert']),
  precedence: z.number().min(10).max(50),
  priority: z.number().min(0).max(100),
  enabled: z.boolean(),
  condition: z.any(), // Complex nested structure
  actions: z.array(z.object({
    type: z.string(),
    field: z.string().optional(),
    value: z.any().optional(),
    score: z.number().optional(),
    message: z.string().optional(),
    metadata: z.record(z.any()).optional()
  })),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional()
});

const updateScorecardSchema = z.object({
  weights: z.record(z.number()).optional(),
  thresholds: z.record(z.number()).optional(),
  marketAdjustments: z.object({
    enabled: z.boolean(),
    factors: z.record(z.number())
  }).optional(),
  description: z.string().optional()
});

const dryRunSchema = z.object({
  ruleIds: z.array(z.string()).optional(),
  testData: z.object({
    lead: z.any(),
    uccFilings: z.array(z.any()).optional()
  }),
  compareWith: z.object({
    lead: z.any(),
    uccFilings: z.array(z.any()).optional()
  }).optional(),
  options: z.object({
    includePerformanceMetrics: z.boolean().optional(),
    includeCoverageAnalysis: z.boolean().optional(),
    includeExplanations: z.boolean().optional()
  }).optional()
});

/**
 * GET /api/rules - List all rules with pagination
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const type = req.query.type as RuleType | undefined;
    const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;

    // Get rules from engine
    let allRules = rulesEngine.getAllRules();

    // Apply filters
    if (type) {
      allRules = allRules.filter(r => r.type === type);
    }
    if (enabled !== undefined) {
      allRules = allRules.filter(r => r.enabled === enabled);
    }
    if (tags && tags.length > 0) {
      allRules = allRules.filter(r => r.tags?.some(t => tags.includes(t)));
    }

    // Sort by precedence and priority
    allRules.sort((a, b) => {
      if (a.precedence !== b.precedence) {
        return b.precedence - a.precedence;
      }
      return b.priority - a.priority;
    });

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const rules = allRules.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        rules,
        pagination: {
          page,
          limit,
          total: allRules.length,
          totalPages: Math.ceil(allRules.length / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error listing rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list rules'
    });
  }
});

/**
 * POST /api/rules - Create new rule
 */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const body = createRuleSchema.parse(req.body);
    
    // Generate rule ID
    const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create rule object
    const newRule: Rule = {
      id: ruleId,
      ...body,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: req.session?.userId,
      version: 1
    };

    // Add rule to engine
    const validationResult = rulesEngine.addRule(newRule);

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions
      });
    }

    // Save to database
    await db.insert(rules).values({
      id: ruleId,
      name: newRule.name,
      description: newRule.description,
      type: newRule.type,
      precedence: newRule.precedence,
      priority: newRule.priority,
      enabled: newRule.enabled,
      condition: newRule.condition,
      actions: newRule.actions,
      tags: newRule.tags,
      metadata: newRule.metadata,
      createdBy: newRule.createdBy,
      version: newRule.version
    });

    res.json({
      success: true,
      data: {
        rule: newRule,
        validation: validationResult
      }
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid rule data',
        details: error.errors
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create rule'
    });
  }
});

/**
 * PUT /api/rules/:id - Update rule
 */
router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;
    const updates = req.body;

    // Get existing rule
    const existingRule = rulesEngine.getRule(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    // Create updated rule
    const updatedRule: Rule = {
      ...existingRule,
      ...updates,
      id: ruleId, // Preserve ID
      updatedAt: new Date(),
      version: existingRule.version + 1
    };

    // Save current version to history
    await db.insert(ruleVersions).values({
      ruleId,
      version: existingRule.version,
      data: existingRule,
      createdAt: existingRule.updatedAt
    });

    // Validate and update rule in engine
    const validationResult = rulesEngine.addRule(updatedRule);

    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions
      });
    }

    // Update in database
    await db.update(rules)
      .set({
        name: updatedRule.name,
        description: updatedRule.description,
        type: updatedRule.type,
        precedence: updatedRule.precedence,
        priority: updatedRule.priority,
        enabled: updatedRule.enabled,
        condition: updatedRule.condition,
        actions: updatedRule.actions,
        tags: updatedRule.tags,
        metadata: updatedRule.metadata,
        version: updatedRule.version,
        updatedAt: updatedRule.updatedAt
      })
      .where(eq(rules.id, ruleId));

    res.json({
      success: true,
      data: {
        rule: updatedRule,
        validation: validationResult
      }
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update rule'
    });
  }
});

/**
 * DELETE /api/rules/:id - Delete rule (soft delete)
 */
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const ruleId = req.params.id;

    // Get existing rule
    const existingRule = rulesEngine.getRule(ruleId);
    if (!existingRule) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    // Remove from engine
    rulesEngine.removeRule(ruleId);

    // Soft delete in database (mark as disabled with metadata)
    await db.update(rules)
      .set({
        enabled: false,
        metadata: {
          ...existingRule.metadata,
          deletedAt: new Date(),
          deletedBy: req.session?.userId
        },
        updatedAt: new Date()
      })
      .where(eq(rules.id, ruleId));

    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete rule'
    });
  }
});

/**
 * POST /api/rules/dry-run - Test rules against sample data
 */
router.post('/rules/dry-run', async (req: Request, res: Response) => {
  try {
    const body = dryRunSchema.parse(req.body);

    // Create rule context from test data
    const context: RuleContext = {
      lead: body.testData.lead,
      uccFilings: body.testData.uccFilings,
      scores: {},
      transformations: {},
      alerts: [],
      enrichments: {},
      metadata: {},
      executionPath: [],
      timing: {}
    };

    // Execute rules
    const startTime = Date.now();
    const results = await rulesEngine.execute(context, body.ruleIds?.map(id => {
      const rule = rulesEngine.getRule(id);
      return rule?.type;
    }).filter(Boolean) as RuleType[]);
    const executionTime = Date.now() - startTime;

    // Generate test report if compareWith is provided
    let testReport: TestReport | undefined;
    if (body.compareWith) {
      testReport = await ruleTester.runTest({
        before: body.compareWith,
        after: {
          lead: { ...body.testData.lead, ...context.transformations },
          uccFilings: body.testData.uccFilings
        },
        rules: body.ruleIds || rulesEngine.getAllRules().map(r => r.id),
        options: body.options || {}
      });
    }

    // Generate scorecard result
    const scoreResult = scorecardManager.calculateScore({
      lead: { ...body.testData.lead, ...context.transformations } as Lead,
      uccFilings: body.testData.uccFilings as UccFiling[]
    });

    res.json({
      success: true,
      data: {
        executionResults: results,
        context: {
          scores: context.scores,
          transformations: context.transformations,
          alerts: context.alerts,
          enrichments: context.enrichments,
          metadata: context.metadata
        },
        scoreResult,
        testReport,
        performance: {
          executionTime,
          rulesExecuted: results.length,
          rulesMatched: results.filter(r => r.matched).length
        }
      }
    });
  } catch (error) {
    console.error('Error running dry-run:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid test data',
        details: error.errors
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to run dry-run test'
    });
  }
});

/**
 * GET /api/rules/scorecard - Get current scorecard configuration
 */
router.get('/rules/scorecard', async (req: Request, res: Response) => {
  try {
    const config = scorecardManager.getConfig();
    const history = scorecardManager.getConfigHistory();

    res.json({
      success: true,
      data: {
        current: config,
        history: history.slice(-10) // Last 10 versions
      }
    });
  } catch (error) {
    console.error('Error getting scorecard config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scorecard configuration'
    });
  }
});

/**
 * PUT /api/rules/scorecard - Update scorecard weights
 */
router.put('/rules/scorecard', async (req: Request, res: Response) => {
  try {
    const body = updateScorecardSchema.parse(req.body);

    // Update configuration
    await scorecardManager.updateConfig(body);

    // Save to database
    const config = scorecardManager.getConfig();
    await db.insert(scorecardConfigs).values({
      version: config.version,
      weights: config.weights,
      thresholds: config.thresholds,
      marketAdjustments: config.marketAdjustments,
      description: config.description,
      effectiveDate: config.effectiveDate,
      createdBy: req.session?.userId
    });

    res.json({
      success: true,
      data: {
        config,
        message: 'Scorecard configuration updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating scorecard:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration data',
        details: error.errors
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to update scorecard configuration'
    });
  }
});

/**
 * POST /api/rules/validate - Validate rule syntax and logic
 */
router.post('/rules/validate', async (req: Request, res: Response) => {
  try {
    const ruleData = req.body;

    // Create temporary rule for validation
    const tempRule: Rule = {
      id: `temp-${Date.now()}`,
      ...ruleData,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1
    };

    // Validate rule
    const validationResult = rulesEngine.validateRule(tempRule);

    // Check for conflicts
    const conflicts = rulesEngine.detectConflicts(tempRule);

    res.json({
      success: true,
      data: {
        valid: validationResult.valid,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        suggestions: validationResult.suggestions,
        conflicts: conflicts.map(c => ({
          conflictingRule: c.rule2.name,
          type: c.conflictType,
          description: c.description,
          severity: c.severity,
          resolution: c.resolution
        }))
      }
    });
  } catch (error) {
    console.error('Error validating rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate rule'
    });
  }
});

/**
 * GET /api/rules/history - Rule change history
 */
router.get('/rules/history', async (req: Request, res: Response) => {
  try {
    const ruleId = req.query.ruleId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let query = db.select().from(ruleVersions);
    
    if (ruleId) {
      query = query.where(eq(ruleVersions.ruleId, ruleId)) as any;
    }
    
    const history = await query
      .orderBy(desc(ruleVersions.createdAt))
      .limit(limit);

    res.json({
      success: true,
      data: {
        history,
        total: history.length
      }
    });
  } catch (error) {
    console.error('Error getting rule history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rule history'
    });
  }
});

/**
 * POST /api/rules/rollback/:version - Rollback to previous version
 */
router.post('/rules/rollback/:version', async (req: Request, res: Response) => {
  try {
    const version = parseInt(req.params.version);
    const { type } = req.body;

    if (type === 'scorecard') {
      // Rollback scorecard configuration
      const success = await scorecardManager.rollbackToVersion(version);
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Scorecard version not found'
        });
      }

      res.json({
        success: true,
        message: `Scorecard rolled back to version ${version}`
      });
    } else if (type === 'rule') {
      // Rollback individual rule
      const { ruleId } = req.body;
      if (!ruleId) {
        return res.status(400).json({
          success: false,
          error: 'Rule ID is required for rule rollback'
        });
      }

      // Get version from history
      const [versionRecord] = await db.select()
        .from(ruleVersions)
        .where(and(
          eq(ruleVersions.ruleId, ruleId),
          eq(ruleVersions.version, version)
        ));

      if (!versionRecord) {
        return res.status(404).json({
          success: false,
          error: 'Rule version not found'
        });
      }

      // Restore rule
      const restoredRule = versionRecord.data as Rule;
      restoredRule.version = (rulesEngine.getRule(ruleId)?.version || 0) + 1;
      restoredRule.updatedAt = new Date();

      rulesEngine.addRule(restoredRule);

      res.json({
        success: true,
        message: `Rule ${ruleId} rolled back to version ${version}`,
        data: { rule: restoredRule }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid rollback type. Must be "scorecard" or "rule"'
      });
    }
  } catch (error) {
    console.error('Error rolling back:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rollback to previous version'
    });
  }
});

/**
 * POST /api/rules/import - Import rules from JSON
 */
router.post('/rules/import', async (req: Request, res: Response) => {
  try {
    const { rules: importedRules } = req.body;
    
    if (!Array.isArray(importedRules)) {
      return res.status(400).json({
        success: false,
        error: 'Rules must be provided as an array'
      });
    }

    const results = rulesEngine.importRules(JSON.stringify(importedRules));
    
    const successful = results.filter(r => r.valid).length;
    const failed = results.filter(r => !r.valid).length;

    res.json({
      success: true,
      data: {
        imported: successful,
        failed,
        results
      }
    });
  } catch (error) {
    console.error('Error importing rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import rules'
    });
  }
});

/**
 * GET /api/rules/export - Export rules to JSON
 */
router.get('/rules/export', async (req: Request, res: Response) => {
  try {
    const rulesJson = rulesEngine.exportRules();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="rules-export.json"');
    res.send(rulesJson);
  } catch (error) {
    console.error('Error exporting rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export rules'
    });
  }
});

export default router;