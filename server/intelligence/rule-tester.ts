/**
 * Rule Testing System
 * Dry-run testing with comparison, diff generation, and performance analysis
 */

import { rulesEngine, Rule, RuleContext, RuleExecutionResult, RuleType } from './rules-engine';
import { scorecardManager, ScoreResult, LeadMetrics } from './scorecard';
import { Lead, UccFiling } from '@shared/schema';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Test configuration options
 */
export interface TestOptions {
  includePerformanceMetrics?: boolean;
  includeCoverageAnalysis?: boolean;
  includeExplanations?: boolean;
  compareScores?: boolean;
  generateReport?: boolean;
  verbose?: boolean;
}

/**
 * Test data sample
 */
export interface TestData {
  lead: Lead;
  uccFilings?: UccFiling[];
  metadata?: Record<string, any>;
}

/**
 * Test scenario
 */
export interface TestScenario {
  id: string;
  name: string;
  description: string;
  before: TestData;
  after?: TestData;
  expectedChanges?: Record<string, any>;
  rules?: string[]; // Specific rules to test
  options?: TestOptions;
}

/**
 * Field change tracking
 */
export interface FieldChange {
  field: string;
  before: any;
  after: any;
  changeType: 'added' | 'removed' | 'modified' | 'unchanged';
  ruleId?: string;
  ruleName?: string;
}

/**
 * Score comparison
 */
export interface ScoreComparison {
  before: ScoreResult;
  after: ScoreResult;
  totalScoreChange: number;
  componentChanges: Array<{
    component: string;
    before: number;
    after: number;
    change: number;
    percentageChange: number;
  }>;
  tierChange?: {
    before: string;
    after: string;
  };
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  totalExecutionTime: number;
  averageRuleTime: number;
  slowestRule: {
    id: string;
    name: string;
    time: number;
  };
  fastestRule: {
    id: string;
    name: string;
    time: number;
  };
  memoryUsage?: {
    before: number;
    after: number;
    peak: number;
  };
}

/**
 * Coverage analysis
 */
export interface CoverageAnalysis {
  totalRules: number;
  executedRules: number;
  matchedRules: number;
  skippedRules: number;
  failedRules: number;
  coverage: number; // percentage
  byType: Record<RuleType, {
    total: number;
    executed: number;
    matched: number;
  }>;
  uncoveredFields: string[];
  recommendations: string[];
}

/**
 * Test report
 */
export interface TestReport {
  scenarioId: string;
  scenarioName: string;
  timestamp: Date;
  success: boolean;
  executionResults: RuleExecutionResult[];
  fieldChanges: FieldChange[];
  scoreComparison?: ScoreComparison;
  alerts: any[];
  performance?: PerformanceMetrics;
  coverage?: CoverageAnalysis;
  explanations?: string[];
  errors?: string[];
  warnings?: string[];
}

/**
 * Golden dataset for testing
 */
export interface GoldenDataset {
  id: string;
  name: string;
  description: string;
  scenarios: TestScenario[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rule Tester class
 */
export class RuleTester {
  private goldenDatasets: Map<string, GoldenDataset> = new Map();
  private testHistory: TestReport[] = [];

  /**
   * Load golden dataset from file
   */
  public async loadGoldenDataset(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const dataset = JSON.parse(content) as GoldenDataset;
      this.goldenDatasets.set(dataset.id, dataset);
    } catch (error) {
      console.error('Failed to load golden dataset:', error);
      throw new Error(`Failed to load dataset from ${filePath}`);
    }
  }

  /**
   * Run a single test scenario
   */
  public async runTest(scenario: TestScenario & { rules?: string[] }): Promise<TestReport> {
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;

    const report: TestReport = {
      scenarioId: scenario.id || `test-${Date.now()}`,
      scenarioName: scenario.name || 'Unnamed Test',
      timestamp: new Date(),
      success: true,
      executionResults: [],
      fieldChanges: [],
      alerts: [],
      errors: [],
      warnings: []
    };

    try {
      // Create context from test data
      const context: RuleContext = {
        lead: scenario.before.lead,
        uccFilings: scenario.before.uccFilings,
        scores: {},
        transformations: {},
        alerts: [],
        enrichments: {},
        metadata: scenario.before.metadata || {},
        executionPath: [],
        timing: {}
      };

      // Execute rules
      let rulesToExecute: Rule[] = [];
      if (scenario.rules && scenario.rules.length > 0) {
        rulesToExecute = scenario.rules
          .map(id => rulesEngine.getRule(id))
          .filter(Boolean) as Rule[];
      } else {
        rulesToExecute = rulesEngine.getAllRules();
      }

      // Execute each rule and track timing
      const ruleTimings: Record<string, number> = {};
      for (const rule of rulesToExecute) {
        if (!rule.enabled) continue;

        const ruleStart = Date.now();
        const result = await rulesEngine['executeRule'](rule, context);
        ruleTimings[rule.id] = Date.now() - ruleStart;
        
        report.executionResults.push({
          ...result,
          executionTime: ruleTimings[rule.id]
        });
      }

      // Track alerts
      report.alerts = context.alerts;

      // Compare before and after
      if (scenario.after || context.transformations) {
        report.fieldChanges = this.compareData(
          scenario.before,
          {
            lead: { ...scenario.before.lead, ...context.transformations },
            uccFilings: scenario.before.uccFilings,
            metadata: { ...scenario.before.metadata, ...context.metadata }
          },
          report.executionResults
        );
      }

      // Score comparison if requested
      if (scenario.options?.compareScores) {
        const beforeMetrics: LeadMetrics = {
          lead: scenario.before.lead,
          uccFilings: scenario.before.uccFilings
        };

        const afterMetrics: LeadMetrics = {
          lead: { ...scenario.before.lead, ...context.transformations },
          uccFilings: scenario.before.uccFilings
        };

        const scoreBefore = scorecardManager.calculateScore(beforeMetrics);
        const scoreAfter = scorecardManager.calculateScore(afterMetrics);

        report.scoreComparison = this.compareScores(scoreBefore, scoreAfter);
      }

      // Performance metrics
      if (scenario.options?.includePerformanceMetrics) {
        const memAfter = process.memoryUsage().heapUsed;
        report.performance = this.calculatePerformanceMetrics(
          ruleTimings,
          rulesToExecute,
          {
            before: memBefore,
            after: memAfter,
            peak: Math.max(memBefore, memAfter)
          }
        );
      }

      // Coverage analysis
      if (scenario.options?.includeCoverageAnalysis) {
        report.coverage = this.analyzeCoverage(
          rulesToExecute,
          report.executionResults,
          scenario.before
        );
      }

      // Generate explanations
      if (scenario.options?.includeExplanations) {
        report.explanations = this.generateExplanations(
          report.executionResults,
          report.fieldChanges,
          report.scoreComparison
        );
      }

      // Validate expected changes
      if (scenario.expectedChanges) {
        const validation = this.validateExpectedChanges(
          scenario.expectedChanges,
          context.transformations
        );
        if (!validation.success) {
          report.success = false;
          report.errors?.push(...validation.errors);
        }
      }

    } catch (error) {
      report.success = false;
      report.errors?.push(error instanceof Error ? error.message : String(error));
    }

    // Store in history
    this.testHistory.push(report);

    return report;
  }

  /**
   * Run multiple test scenarios
   */
  public async runTestSuite(scenarios: TestScenario[]): Promise<TestReport[]> {
    const reports: TestReport[] = [];

    for (const scenario of scenarios) {
      const report = await this.runTest(scenario);
      reports.push(report);
    }

    return reports;
  }

  /**
   * Compare data before and after rule execution
   */
  private compareData(
    before: TestData,
    after: TestData,
    executionResults: RuleExecutionResult[]
  ): FieldChange[] {
    const changes: FieldChange[] = [];
    const allFields = new Set<string>();

    // Collect all fields
    const collectFields = (obj: any, prefix = '') => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && typeof obj[key] !== 'function') {
          const fieldPath = prefix ? `${prefix}.${key}` : key;
          allFields.add(fieldPath);
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            collectFields(obj[key], fieldPath);
          }
        }
      }
    };

    collectFields(before);
    collectFields(after);

    // Compare each field
    for (const field of allFields) {
      const beforeValue = this.getNestedValue(before, field);
      const afterValue = this.getNestedValue(after, field);

      let changeType: 'added' | 'removed' | 'modified' | 'unchanged';
      if (beforeValue === undefined && afterValue !== undefined) {
        changeType = 'added';
      } else if (beforeValue !== undefined && afterValue === undefined) {
        changeType = 'removed';
      } else if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        changeType = 'modified';
      } else {
        changeType = 'unchanged';
      }

      if (changeType !== 'unchanged') {
        // Find which rule caused this change
        const responsibleRule = executionResults.find(r => 
          r.transformations && field in r.transformations
        );

        changes.push({
          field,
          before: beforeValue,
          after: afterValue,
          changeType,
          ruleId: responsibleRule?.ruleId,
          ruleName: responsibleRule?.ruleName
        });
      }
    }

    return changes;
  }

  /**
   * Compare scores before and after
   */
  private compareScores(before: ScoreResult, after: ScoreResult): ScoreComparison {
    const componentChanges = before.components.map(beforeComp => {
      const afterComp = after.components.find(c => c.name === beforeComp.name);
      if (!afterComp) {
        return {
          component: beforeComp.name,
          before: beforeComp.weightedScore,
          after: 0,
          change: -beforeComp.weightedScore,
          percentageChange: -100
        };
      }

      const change = afterComp.weightedScore - beforeComp.weightedScore;
      const percentageChange = beforeComp.weightedScore !== 0 
        ? (change / beforeComp.weightedScore) * 100 
        : change > 0 ? 100 : 0;

      return {
        component: beforeComp.name,
        before: beforeComp.weightedScore,
        after: afterComp.weightedScore,
        change,
        percentageChange
      };
    });

    // Add any new components from after
    after.components.forEach(afterComp => {
      if (!before.components.find(c => c.name === afterComp.name)) {
        componentChanges.push({
          component: afterComp.name,
          before: 0,
          after: afterComp.weightedScore,
          change: afterComp.weightedScore,
          percentageChange: 100
        });
      }
    });

    return {
      before,
      after,
      totalScoreChange: after.totalScore - before.totalScore,
      componentChanges,
      tierChange: before.qualityTier !== after.qualityTier ? {
        before: before.qualityTier,
        after: after.qualityTier
      } : undefined
    };
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(
    ruleTimings: Record<string, number>,
    rules: Rule[],
    memoryUsage: { before: number; after: number; peak: number }
  ): PerformanceMetrics {
    const times = Object.values(ruleTimings);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const avgTime = times.length > 0 ? totalTime / times.length : 0;

    let slowest = { id: '', name: '', time: 0 };
    let fastest = { id: '', name: '', time: Infinity };

    for (const [ruleId, time] of Object.entries(ruleTimings)) {
      const rule = rules.find(r => r.id === ruleId);
      if (rule) {
        if (time > slowest.time) {
          slowest = { id: ruleId, name: rule.name, time };
        }
        if (time < fastest.time) {
          fastest = { id: ruleId, name: rule.name, time };
        }
      }
    }

    return {
      totalExecutionTime: totalTime,
      averageRuleTime: avgTime,
      slowestRule: slowest,
      fastestRule: fastest.time === Infinity ? slowest : fastest,
      memoryUsage
    };
  }

  /**
   * Analyze rule coverage
   */
  private analyzeCoverage(
    allRules: Rule[],
    executionResults: RuleExecutionResult[],
    testData: TestData
  ): CoverageAnalysis {
    const executedRuleIds = new Set(executionResults.map(r => r.ruleId));
    const matchedRuleIds = new Set(executionResults.filter(r => r.matched).map(r => r.ruleId));
    
    const byType: Record<string, any> = {};
    for (const type of Object.values(RuleType)) {
      const rulesOfType = allRules.filter(r => r.type === type);
      const executedOfType = rulesOfType.filter(r => executedRuleIds.has(r.id));
      const matchedOfType = rulesOfType.filter(r => matchedRuleIds.has(r.id));
      
      byType[type] = {
        total: rulesOfType.length,
        executed: executedOfType.length,
        matched: matchedOfType.length
      };
    }

    // Find uncovered fields
    const coveredFields = new Set<string>();
    executionResults.forEach(result => {
      if (result.transformations) {
        Object.keys(result.transformations).forEach(field => coveredFields.add(field));
      }
    });

    const allFields = this.getAllFields(testData.lead);
    const uncoveredFields = allFields.filter(f => !coveredFields.has(f));

    // Generate recommendations
    const recommendations: string[] = [];
    if (executedRuleIds.size < allRules.length * 0.8) {
      recommendations.push('Consider adding more diverse test data to trigger more rules');
    }
    if (uncoveredFields.length > allFields.length * 0.3) {
      recommendations.push(`Many fields are not being transformed. Consider adding rules for: ${uncoveredFields.slice(0, 3).join(', ')}`);
    }

    return {
      totalRules: allRules.length,
      executedRules: executedRuleIds.size,
      matchedRules: matchedRuleIds.size,
      skippedRules: allRules.filter(r => !r.enabled).length,
      failedRules: executionResults.filter(r => r.errors && r.errors.length > 0).length,
      coverage: (executedRuleIds.size / allRules.length) * 100,
      byType,
      uncoveredFields,
      recommendations
    };
  }

  /**
   * Generate explanations for the test results
   */
  private generateExplanations(
    executionResults: RuleExecutionResult[],
    fieldChanges: FieldChange[],
    scoreComparison?: ScoreComparison
  ): string[] {
    const explanations: string[] = [];

    // Explain matched rules
    const matchedRules = executionResults.filter(r => r.matched);
    if (matchedRules.length > 0) {
      explanations.push(`${matchedRules.length} rules matched and executed actions`);
      matchedRules.slice(0, 3).forEach(r => {
        explanations.push(`  - ${r.ruleName}: ${r.actionsExecuted.length} actions executed`);
      });
    }

    // Explain field changes
    const modifiedFields = fieldChanges.filter(c => c.changeType === 'modified');
    if (modifiedFields.length > 0) {
      explanations.push(`${modifiedFields.length} fields were modified`);
      modifiedFields.slice(0, 3).forEach(c => {
        explanations.push(`  - ${c.field}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`);
      });
    }

    // Explain score changes
    if (scoreComparison) {
      const scoreChange = scoreComparison.totalScoreChange;
      if (Math.abs(scoreChange) > 0.01) {
        explanations.push(`Total score ${scoreChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(scoreChange).toFixed(2)} points`);
        
        const significantChanges = scoreComparison.componentChanges
          .filter(c => Math.abs(c.change) > 0.1)
          .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
        
        if (significantChanges.length > 0) {
          explanations.push('Significant component changes:');
          significantChanges.slice(0, 3).forEach(c => {
            const direction = c.change > 0 ? '↑' : '↓';
            explanations.push(`  - ${c.component}: ${direction} ${Math.abs(c.change).toFixed(2)}`);
          });
        }

        if (scoreComparison.tierChange) {
          explanations.push(`Quality tier changed from ${scoreComparison.tierChange.before} to ${scoreComparison.tierChange.after}`);
        }
      }
    }

    return explanations;
  }

  /**
   * Validate expected changes
   */
  private validateExpectedChanges(
    expected: Record<string, any>,
    actual: Record<string, any>
  ): { success: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[field];
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        errors.push(`Field ${field}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`);
      }
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * Get all fields from an object
   */
  private getAllFields(obj: any, prefix = ''): string[] {
    const fields: string[] = [];
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] !== 'function') {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fields.push(fieldPath);
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          fields.push(...this.getAllFields(obj[key], fieldPath));
        }
      }
    }
    
    return fields;
  }

  /**
   * Generate HTML report
   */
  public generateHTMLReport(reports: TestReport[]): string {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Rule Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .report { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; }
    .success { color: green; }
    .failure { color: red; }
    .warning { color: orange; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .metric { display: inline-block; margin: 10px; padding: 10px; background: #f0f0f0; }
    .change-added { background-color: #d4edda; }
    .change-modified { background-color: #fff3cd; }
    .change-removed { background-color: #f8d7da; }
  </style>
</head>
<body>
  <h1>Rule Test Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Tests: ${reports.length}</p>
    <p>Successful: ${reports.filter(r => r.success).length}</p>
    <p>Failed: ${reports.filter(r => !r.success).length}</p>
  </div>
  
  ${reports.map(report => `
    <div class="report">
      <h3>${report.scenarioName}</h3>
      <p class="${report.success ? 'success' : 'failure'}">
        Status: ${report.success ? 'SUCCESS' : 'FAILURE'}
      </p>
      
      ${report.performance ? `
        <div class="performance">
          <h4>Performance Metrics</h4>
          <div class="metric">Total Time: ${report.performance.totalExecutionTime}ms</div>
          <div class="metric">Avg Rule Time: ${report.performance.averageRuleTime.toFixed(2)}ms</div>
          <div class="metric">Slowest: ${report.performance.slowestRule.name} (${report.performance.slowestRule.time}ms)</div>
        </div>
      ` : ''}
      
      ${report.fieldChanges.length > 0 ? `
        <div class="changes">
          <h4>Field Changes</h4>
          <table>
            <tr>
              <th>Field</th>
              <th>Before</th>
              <th>After</th>
              <th>Type</th>
              <th>Rule</th>
            </tr>
            ${report.fieldChanges.map(change => `
              <tr class="change-${change.changeType}">
                <td>${change.field}</td>
                <td>${JSON.stringify(change.before)}</td>
                <td>${JSON.stringify(change.after)}</td>
                <td>${change.changeType}</td>
                <td>${change.ruleName || '-'}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      ` : ''}
      
      ${report.explanations && report.explanations.length > 0 ? `
        <div class="explanations">
          <h4>Explanations</h4>
          <ul>
            ${report.explanations.map(exp => `<li>${exp}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${report.errors && report.errors.length > 0 ? `
        <div class="errors">
          <h4>Errors</h4>
          <ul class="failure">
            ${report.errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `).join('')}
</body>
</html>
    `;

    return html;
  }

  /**
   * Save report to file
   */
  public async saveReport(report: TestReport | TestReport[], filePath: string): Promise<void> {
    const reports = Array.isArray(report) ? report : [report];
    
    if (filePath.endsWith('.html')) {
      const html = this.generateHTMLReport(reports);
      await fs.writeFile(filePath, html, 'utf8');
    } else {
      await fs.writeFile(filePath, JSON.stringify(reports, null, 2), 'utf8');
    }
  }

  /**
   * Get test history
   */
  public getHistory(): TestReport[] {
    return [...this.testHistory];
  }

  /**
   * Clear test history
   */
  public clearHistory(): void {
    this.testHistory = [];
  }
}

// Export singleton instance
export const ruleTester = new RuleTester();