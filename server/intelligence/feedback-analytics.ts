/**
 * Feedback Analytics System
 * Track patterns, measure improvements, and generate insights from feedback data
 */

import { z } from 'zod';
import { db } from '../db';
import { feedback, learnedPatterns, improvementSuggestions, feedbackMetrics, leads, abTests } from '@shared/schema';
import { eq, and, or, sql, desc, asc, inArray, gte, lte, between, count } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';
import { FeedbackType } from './feedback-system';

/**
 * Analytics time period
 */
export enum TimePeriod {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly'
}

/**
 * Metric type
 */
export enum MetricType {
  FEEDBACK_VOLUME = 'feedback_volume',
  ACCURACY = 'accuracy',
  PROCESSING_TIME = 'processing_time',
  ERROR_RATE = 'error_rate',
  PATTERN_DISCOVERY = 'pattern_discovery',
  IMPROVEMENT_RATE = 'improvement_rate',
  OPERATOR_PERFORMANCE = 'operator_performance',
  SYSTEM_HEALTH = 'system_health'
}

/**
 * Correction pattern
 */
export interface CorrectionPattern {
  pattern: string;
  frequency: number;
  confidence: number;
  fields: string[];
  examples: any[];
  trend: 'increasing' | 'stable' | 'decreasing';
  impact: number;
}

/**
 * Accuracy metric
 */
export interface AccuracyMetric {
  period: Date;
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  confidenceInterval: [number, number];
}

/**
 * System improvement
 */
export interface SystemImprovement {
  metric: string;
  baseline: number;
  current: number;
  improvement: number;
  percentageChange: number;
  trend: 'improving' | 'stable' | 'degrading';
  significance: 'high' | 'medium' | 'low';
  timeline: Date[];
  values: number[];
}

/**
 * Operator performance
 */
export interface OperatorPerformance {
  operatorId: string;
  totalFeedback: number;
  appliedFeedback: number;
  rejectedFeedback: number;
  accuracy: number;
  avgConfidence: number;
  specialization: string[];
  ranking: number;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Problem area
 */
export interface ProblemArea {
  area: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  errorRate: number;
  feedbackCount: number;
  commonErrors: string[];
  recommendations: string[];
  estimatedImpact: number;
}

/**
 * Analytics report
 */
export interface AnalyticsReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalFeedback: number;
    patternsDiscovered: number;
    improvementsImplemented: number;
    accuracyImprovement: number;
    systemHealth: number;
  };
  metrics: Record<MetricType, any>;
  trends: SystemImprovement[];
  problemAreas: ProblemArea[];
  recommendations: string[];
}

/**
 * Feedback Analytics System
 */
export class FeedbackAnalyticsSystem {
  private metricsCache: Map<string, any> = new Map();
  private trendBuffer: Map<string, number[]> = new Map();

  /**
   * Track correction patterns
   */
  async trackCorrectionPatterns(
    startDate?: Date,
    endDate?: Date
  ): Promise<CorrectionPattern[]> {
    try {
      const whereConditions = [
        eq(feedback.status, 'applied'),
      ];
      
      if (startDate) {
        whereConditions.push(gte(feedback.createdAt, startDate));
      }
      if (endDate) {
        whereConditions.push(lte(feedback.createdAt, endDate));
      }
      
      // Get feedback data
      const feedbackData = await db.select()
        .from(feedback)
        .where(and(...whereConditions));
      
      // Analyze patterns
      const patternMap = new Map<string, CorrectionPattern>();
      
      feedbackData.forEach(item => {
        if (item.originalValue && item.correctedValue) {
          const patternKey = `${item.fieldName}:${item.originalValue}→${item.correctedValue}`;
          
          if (!patternMap.has(patternKey)) {
            patternMap.set(patternKey, {
              pattern: patternKey,
              frequency: 0,
              confidence: 0,
              fields: [],
              examples: [],
              trend: 'stable',
              impact: 0,
            });
          }
          
          const pattern = patternMap.get(patternKey)!;
          pattern.frequency++;
          pattern.confidence = Math.max(pattern.confidence, Number(item.confidence) || 0);
          
          if (item.fieldName && !pattern.fields.includes(item.fieldName)) {
            pattern.fields.push(item.fieldName);
          }
          
          if (pattern.examples.length < 5) {
            pattern.examples.push({
              id: item.id,
              leadId: item.leadId,
              timestamp: item.createdAt,
            });
          }
          
          // Calculate impact
          pattern.impact = pattern.frequency * (pattern.confidence / 100);
        }
      });
      
      // Analyze trends
      for (const pattern of Array.from(patternMap.values())) {
        pattern.trend = await this.analyzeTrend(pattern);
      }
      
      // Sort by impact
      return Array.from(patternMap.values())
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 50); // Top 50 patterns
      
    } catch (error) {
      console.error('Error tracking correction patterns:', error);
      return [];
    }
  }

  /**
   * Analyze trend for a pattern
   */
  private async analyzeTrend(pattern: CorrectionPattern): Promise<'increasing' | 'stable' | 'decreasing'> {
    // Simplified trend analysis
    const bufferKey = pattern.pattern;
    
    if (!this.trendBuffer.has(bufferKey)) {
      this.trendBuffer.set(bufferKey, []);
    }
    
    const buffer = this.trendBuffer.get(bufferKey)!;
    buffer.push(pattern.frequency);
    
    if (buffer.length > 10) {
      buffer.shift();
    }
    
    if (buffer.length < 3) {
      return 'stable';
    }
    
    // Calculate trend
    const recent = buffer.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const older = buffer.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    
    if (recent > older * 1.2) {
      return 'increasing';
    } else if (recent < older * 0.8) {
      return 'decreasing';
    } else {
      return 'stable';
    }
  }

  /**
   * Measure system improvement
   */
  async measureSystemImprovement(
    metric: MetricType,
    period: TimePeriod = TimePeriod.DAILY,
    lookback: number = 30
  ): Promise<SystemImprovement> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      
      // Calculate start date based on lookback
      switch (period) {
        case TimePeriod.HOURLY:
          startDate.setHours(startDate.getHours() - lookback);
          break;
        case TimePeriod.DAILY:
          startDate.setDate(startDate.getDate() - lookback);
          break;
        case TimePeriod.WEEKLY:
          startDate.setDate(startDate.getDate() - (lookback * 7));
          break;
        case TimePeriod.MONTHLY:
          startDate.setMonth(startDate.getMonth() - lookback);
          break;
        default:
          startDate.setDate(startDate.getDate() - lookback);
      }
      
      // Get metric values over time
      const metricData = await this.getMetricTimeSeries(metric, startDate, endDate, period);
      
      // Calculate improvement
      const baseline = metricData.values[0] || 0;
      const current = metricData.values[metricData.values.length - 1] || 0;
      const improvement = current - baseline;
      const percentageChange = baseline !== 0 ? (improvement / baseline) * 100 : 0;
      
      // Determine trend
      const trend = this.calculateTrend(metricData.values);
      
      // Determine significance
      const significance = Math.abs(percentageChange) > 20 ? 'high' :
                         Math.abs(percentageChange) > 10 ? 'medium' : 'low';
      
      return {
        metric: metric.toString(),
        baseline,
        current,
        improvement,
        percentageChange,
        trend,
        significance,
        timeline: metricData.timeline,
        values: metricData.values,
      };
      
    } catch (error) {
      console.error('Error measuring system improvement:', error);
      return {
        metric: metric.toString(),
        baseline: 0,
        current: 0,
        improvement: 0,
        percentageChange: 0,
        trend: 'stable',
        significance: 'low',
        timeline: [],
        values: [],
      };
    }
  }

  /**
   * Get metric time series data
   */
  private async getMetricTimeSeries(
    metric: MetricType,
    startDate: Date,
    endDate: Date,
    period: TimePeriod
  ): Promise<{ timeline: Date[]; values: number[] }> {
    const timeline: Date[] = [];
    const values: number[] = [];
    
    // Generate time points
    const current = new Date(startDate);
    while (current <= endDate) {
      timeline.push(new Date(current));
      
      // Get metric value for this time point
      const value = await this.getMetricValue(metric, current, period);
      values.push(value);
      
      // Move to next time point
      switch (period) {
        case TimePeriod.HOURLY:
          current.setHours(current.getHours() + 1);
          break;
        case TimePeriod.DAILY:
          current.setDate(current.getDate() + 1);
          break;
        case TimePeriod.WEEKLY:
          current.setDate(current.getDate() + 7);
          break;
        case TimePeriod.MONTHLY:
          current.setMonth(current.getMonth() + 1);
          break;
        default:
          current.setDate(current.getDate() + 1);
      }
    }
    
    return { timeline, values };
  }

  /**
   * Get metric value for a specific time point
   */
  private async getMetricValue(
    metric: MetricType,
    date: Date,
    period: TimePeriod
  ): Promise<number> {
    // Calculate period boundaries
    const periodStart = new Date(date);
    const periodEnd = new Date(date);
    
    switch (period) {
      case TimePeriod.HOURLY:
        periodEnd.setHours(periodEnd.getHours() + 1);
        break;
      case TimePeriod.DAILY:
        periodEnd.setDate(periodEnd.getDate() + 1);
        break;
      case TimePeriod.WEEKLY:
        periodEnd.setDate(periodEnd.getDate() + 7);
        break;
      case TimePeriod.MONTHLY:
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        break;
    }
    
    // Get metric value based on type
    switch (metric) {
      case MetricType.FEEDBACK_VOLUME:
        return await this.getFeedbackVolume(periodStart, periodEnd);
      
      case MetricType.ACCURACY:
        return await this.getAccuracy(periodStart, periodEnd);
      
      case MetricType.ERROR_RATE:
        return await this.getErrorRate(periodStart, periodEnd);
      
      case MetricType.PATTERN_DISCOVERY:
        return await this.getPatternDiscoveryRate(periodStart, periodEnd);
      
      case MetricType.IMPROVEMENT_RATE:
        return await this.getImprovementRate(periodStart, periodEnd);
      
      default:
        return 0;
    }
  }

  /**
   * Get feedback volume
   */
  private async getFeedbackVolume(startDate: Date, endDate: Date): Promise<number> {
    const result = await db.select({
      count: sql<number>`count(*)`
    })
    .from(feedback)
    .where(between(feedback.createdAt, startDate, endDate));
    
    return Number(result[0]?.count || 0);
  }

  /**
   * Get accuracy
   */
  private async getAccuracy(startDate: Date, endDate: Date): Promise<number> {
    const stats = await db.select({
      total: sql<number>`count(*)`,
      applied: sql<number>`count(case when status = 'applied' then 1 end)`,
    })
    .from(feedback)
    .where(between(feedback.createdAt, startDate, endDate));
    
    const total = Number(stats[0]?.total || 0);
    const applied = Number(stats[0]?.applied || 0);
    
    return total > 0 ? (applied / total) * 100 : 100;
  }

  /**
   * Get error rate
   */
  private async getErrorRate(startDate: Date, endDate: Date): Promise<number> {
    const stats = await db.select({
      total: sql<number>`count(*)`,
      rejected: sql<number>`count(case when status = 'rejected' then 1 end)`,
    })
    .from(feedback)
    .where(between(feedback.createdAt, startDate, endDate));
    
    const total = Number(stats[0]?.total || 0);
    const rejected = Number(stats[0]?.rejected || 0);
    
    return total > 0 ? (rejected / total) * 100 : 0;
  }

  /**
   * Get pattern discovery rate
   */
  private async getPatternDiscoveryRate(startDate: Date, endDate: Date): Promise<number> {
    const result = await db.select({
      count: sql<number>`count(*)`
    })
    .from(learnedPatterns)
    .where(between(learnedPatterns.firstSeen, startDate, endDate));
    
    return Number(result[0]?.count || 0);
  }

  /**
   * Get improvement rate
   */
  private async getImprovementRate(startDate: Date, endDate: Date): Promise<number> {
    const result = await db.select({
      count: sql<number>`count(*)`
    })
    .from(improvementSuggestions)
    .where(and(
      between(improvementSuggestions.implementedAt, startDate, endDate),
      eq(improvementSuggestions.status, 'implemented')
    ));
    
    return Number(result[0]?.count || 0);
  }

  /**
   * Calculate trend from values
   */
  private calculateTrend(values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 3) return 'stable';
    
    // Simple linear regression
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Determine trend based on slope
    if (slope > 0.1) {
      return 'improving';
    } else if (slope < -0.1) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  /**
   * Calculate accuracy metrics
   */
  async calculateAccuracyMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<AccuracyMetric> {
    try {
      // Get feedback statistics
      const stats = await db.select({
        total: sql<number>`count(*)`,
        applied: sql<number>`count(case when status = 'applied' then 1 end)`,
        rejected: sql<number>`count(case when status = 'rejected' then 1 end)`,
        pending: sql<number>`count(case when status = 'pending' then 1 end)`,
      })
      .from(feedback)
      .where(between(feedback.createdAt, startDate, endDate));
      
      const total = Number(stats[0]?.total || 0);
      const applied = Number(stats[0]?.applied || 0);
      const rejected = Number(stats[0]?.rejected || 0);
      
      // Calculate metrics
      const accuracy = total > 0 ? (applied / total) * 100 : 100;
      const precision = (applied + rejected) > 0 ? applied / (applied + rejected) : 1;
      const recall = total > 0 ? applied / total : 1;
      const f1Score = precision + recall > 0 ? 
        2 * (precision * recall) / (precision + recall) : 0;
      
      // Calculate confidence interval (95%)
      const standardError = Math.sqrt((accuracy * (100 - accuracy)) / total);
      const marginOfError = 1.96 * standardError;
      const confidenceInterval: [number, number] = [
        Math.max(0, accuracy - marginOfError),
        Math.min(100, accuracy + marginOfError),
      ];
      
      return {
        period: startDate,
        accuracy,
        precision: precision * 100,
        recall: recall * 100,
        f1Score: f1Score * 100,
        truePositives: applied,
        falsePositives: rejected,
        trueNegatives: 0, // Would need actual negative cases
        falseNegatives: 0, // Would need actual missed cases
        confidenceInterval,
      };
      
    } catch (error) {
      console.error('Error calculating accuracy metrics:', error);
      return {
        period: startDate,
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        truePositives: 0,
        falsePositives: 0,
        trueNegatives: 0,
        falseNegatives: 0,
        confidenceInterval: [0, 0],
      };
    }
  }

  /**
   * Generate improvement report
   */
  async generateImprovementReport(
    startDate: Date,
    endDate: Date
  ): Promise<AnalyticsReport> {
    try {
      // Get summary statistics
      const summary = await this.getSummaryStatistics(startDate, endDate);
      
      // Get metrics for each type
      const metrics: Partial<Record<MetricType, any>> = {};
      
      metrics[MetricType.FEEDBACK_VOLUME] = await this.getFeedbackVolume(startDate, endDate);
      metrics[MetricType.ACCURACY] = await this.getAccuracy(startDate, endDate);
      metrics[MetricType.ERROR_RATE] = await this.getErrorRate(startDate, endDate);
      metrics[MetricType.PATTERN_DISCOVERY] = await this.getPatternDiscoveryRate(startDate, endDate);
      metrics[MetricType.IMPROVEMENT_RATE] = await this.getImprovementRate(startDate, endDate);
      
      // Get trends
      const trends = await this.getSystemTrends(startDate, endDate);
      
      // Identify problem areas
      const problemAreas = await this.identifyProblemAreas(startDate, endDate);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        summary,
        metrics as Record<MetricType, any>,
        trends,
        problemAreas
      );
      
      return {
        period: {
          start: startDate,
          end: endDate,
        },
        summary,
        metrics: metrics as Record<MetricType, any>,
        trends,
        problemAreas,
        recommendations,
      };
      
    } catch (error) {
      console.error('Error generating improvement report:', error);
      throw error;
    }
  }

  /**
   * Get summary statistics
   */
  private async getSummaryStatistics(
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    const feedbackResult = await db.select({
      total: sql<number>`count(*)`,
    })
    .from(feedback)
    .where(between(feedback.createdAt, startDate, endDate));
    
    const patterns = await db.select({
      count: sql<number>`count(*)`
    })
    .from(learnedPatterns)
    .where(between(learnedPatterns.firstSeen, startDate, endDate));
    
    const improvements = await db.select({
      count: sql<number>`count(*)`
    })
    .from(improvementSuggestions)
    .where(and(
      between(improvementSuggestions.implementedAt, startDate, endDate),
      eq(improvementSuggestions.status, 'implemented')
    ));
    
    // Calculate accuracy improvement
    const accuracyStart = await this.getAccuracy(startDate, new Date(startDate.getTime() + 24*60*60*1000));
    const accuracyEnd = await this.getAccuracy(new Date(endDate.getTime() - 24*60*60*1000), endDate);
    const accuracyImprovement = accuracyEnd - accuracyStart;
    
    return {
      totalFeedback: Number(feedbackResult[0]?.total || 0),
      patternsDiscovered: Number(patterns[0]?.count || 0),
      improvementsImplemented: Number(improvements[0]?.count || 0),
      accuracyImprovement,
      systemHealth: 85, // Would calculate actual health score
    };
  }

  /**
   * Get system trends
   */
  private async getSystemTrends(
    startDate: Date,
    endDate: Date
  ): Promise<SystemImprovement[]> {
    const trends: SystemImprovement[] = [];
    
    // Track key metrics
    const keyMetrics = [
      MetricType.ACCURACY,
      MetricType.ERROR_RATE,
      MetricType.PATTERN_DISCOVERY,
    ];
    
    for (const metric of keyMetrics) {
      const improvement = await this.measureSystemImprovement(
        metric,
        TimePeriod.DAILY,
        Math.ceil((endDate.getTime() - startDate.getTime()) / (24*60*60*1000))
      );
      trends.push(improvement);
    }
    
    return trends;
  }

  /**
   * Identify problem areas
   */
  async identifyProblemAreas(
    startDate: Date,
    endDate: Date
  ): Promise<ProblemArea[]> {
    const problemAreas: ProblemArea[] = [];
    
    try {
      // Analyze feedback by field
      const fieldErrors = await db.select({
        fieldName: feedback.fieldName,
        errorCount: sql<number>`count(*)`,
        avgConfidence: sql<number>`avg(confidence)`,
      })
      .from(feedback)
      .where(and(
        between(feedback.createdAt, startDate, endDate),
        eq(feedback.status, 'rejected')
      ))
      .groupBy(feedback.fieldName);
      
      // Analyze each problematic field
      for (const field of fieldErrors) {
        if (field.fieldName && Number(field.errorCount) > 5) {
          const totalForField = await db.select({
            count: sql<number>`count(*)`
          })
          .from(feedback)
          .where(and(
            between(feedback.createdAt, startDate, endDate),
            eq(feedback.fieldName, field.fieldName)
          ));
          
          const total = Number(totalForField[0]?.count || 1);
          const errors = Number(field.errorCount);
          const errorRate = (errors / total) * 100;
          
          // Get common errors
          const commonErrors = await this.getCommonErrors(field.fieldName, startDate, endDate);
          
          // Determine severity
          const severity = errorRate > 30 ? 'critical' :
                         errorRate > 20 ? 'high' :
                         errorRate > 10 ? 'medium' : 'low';
          
          problemAreas.push({
            area: field.fieldName,
            severity,
            errorRate,
            feedbackCount: total,
            commonErrors: commonErrors.slice(0, 5),
            recommendations: this.generateFieldRecommendations(field.fieldName, errorRate),
            estimatedImpact: errors * 10, // Simple impact calculation
          });
        }
      }
      
      // Sort by severity and error rate
      problemAreas.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return b.errorRate - a.errorRate;
      });
      
    } catch (error) {
      console.error('Error identifying problem areas:', error);
    }
    
    return problemAreas;
  }

  /**
   * Get common errors for a field
   */
  private async getCommonErrors(
    fieldName: string,
    startDate: Date,
    endDate: Date
  ): Promise<string[]> {
    const errors = await db.select({
      originalValue: feedback.originalValue,
      count: sql<number>`count(*)`,
    })
    .from(feedback)
    .where(and(
      between(feedback.createdAt, startDate, endDate),
      eq(feedback.fieldName, fieldName),
      eq(feedback.status, 'rejected')
    ))
    .groupBy(feedback.originalValue)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
    
    return errors.map(e => String(e.originalValue || 'null'));
  }

  /**
   * Generate field-specific recommendations
   */
  private generateFieldRecommendations(fieldName: string, errorRate: number): string[] {
    const recommendations: string[] = [];
    
    if (errorRate > 20) {
      recommendations.push(`Review extraction logic for ${fieldName}`);
      recommendations.push('Consider additional validation rules');
    }
    
    if (fieldName.includes('email') || fieldName.includes('phone')) {
      recommendations.push('Implement format validation');
      recommendations.push('Add normalization rules');
    }
    
    if (fieldName.includes('date') || fieldName.includes('time')) {
      recommendations.push('Standardize date/time formats');
      recommendations.push('Add timezone handling');
    }
    
    recommendations.push('Collect more training examples');
    recommendations.push('Review operator training for this field');
    
    return recommendations;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    summary: any,
    metrics: Record<MetricType, any>,
    trends: SystemImprovement[],
    problemAreas: ProblemArea[]
  ): string[] {
    const recommendations: string[] = [];
    
    // Based on accuracy
    if (metrics[MetricType.ACCURACY] < 80) {
      recommendations.push('Focus on improving data quality and validation rules');
    }
    
    // Based on error rate
    if (metrics[MetricType.ERROR_RATE] > 15) {
      recommendations.push('Review and update extraction patterns');
      recommendations.push('Increase operator training');
    }
    
    // Based on pattern discovery
    if (metrics[MetricType.PATTERN_DISCOVERY] < 5) {
      recommendations.push('Collect more diverse feedback examples');
    }
    
    // Based on trends
    const degradingTrends = trends.filter(t => t.trend === 'degrading');
    if (degradingTrends.length > 0) {
      recommendations.push('Investigate recent changes that may have caused performance degradation');
      degradingTrends.forEach(t => {
        recommendations.push(`Address declining ${t.metric} metric`);
      });
    }
    
    // Based on problem areas
    const criticalProblems = problemAreas.filter(p => p.severity === 'critical');
    if (criticalProblems.length > 0) {
      recommendations.push('URGENT: Address critical problem areas immediately');
      criticalProblems.forEach(p => {
        recommendations.push(`Fix ${p.area} field (${p.errorRate.toFixed(1)}% error rate)`);
      });
    }
    
    // General recommendations
    if (summary.patternsDiscovered > 10 && summary.improvementsImplemented < 5) {
      recommendations.push('Review and implement discovered patterns');
    }
    
    if (summary.accuracyImprovement < 0) {
      recommendations.push('Consider rolling back recent changes');
      recommendations.push('Increase testing before implementing changes');
    }
    
    return recommendations;
  }

  /**
   * Get operator performance
   */
  async getOperatorPerformance(
    operatorId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<OperatorPerformance[]> {
    const whereConditions = [];
    
    if (operatorId) {
      whereConditions.push(eq(feedback.operatorId, operatorId));
    }
    
    if (startDate) {
      whereConditions.push(gte(feedback.createdAt, startDate));
    }
    
    if (endDate) {
      whereConditions.push(lte(feedback.createdAt, endDate));
    }
    
    // Get operator statistics
    const operatorStats = await db.select({
      operatorId: feedback.operatorId,
      total: sql<number>`count(*)`,
      applied: sql<number>`count(case when status = 'applied' then 1 end)`,
      rejected: sql<number>`count(case when status = 'rejected' then 1 end)`,
      avgConfidence: sql<number>`avg(confidence)`,
    })
    .from(feedback)
    .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    .groupBy(feedback.operatorId);
    
    // Process and rank operators
    const performances: OperatorPerformance[] = operatorStats.map(stat => {
      const total = Number(stat.total || 0);
      const applied = Number(stat.applied || 0);
      const rejected = Number(stat.rejected || 0);
      
      return {
        operatorId: stat.operatorId,
        totalFeedback: total,
        appliedFeedback: applied,
        rejectedFeedback: rejected,
        accuracy: total > 0 ? (applied / total) * 100 : 0,
        avgConfidence: Number(stat.avgConfidence || 0),
        specialization: [], // Would need to analyze
        ranking: 0, // Will calculate
        trend: 'stable' as const, // Would need historical data
      };
    });
    
    // Rank operators by accuracy
    performances.sort((a, b) => b.accuracy - a.accuracy);
    performances.forEach((p, index) => {
      p.ranking = index + 1;
    });
    
    return performances;
  }

  /**
   * Track A/B test performance
   */
  async trackABTestPerformance(testId: string): Promise<{
    testId: string;
    variantAMetrics: any;
    variantBMetrics: any;
    winner: 'a' | 'b' | 'no_difference';
    confidence: number;
  }> {
    const test = await db.select()
      .from(abTests)
      .where(eq(abTests.id, testId))
      .limit(1);
    
    if (!test || test.length === 0) {
      throw new Error('Test not found');
    }
    
    const testData = test[0];
    
    // Calculate performance metrics
    const aMetrics = testData.variantAMetrics as any || { successes: 0, failures: 0 };
    const bMetrics = testData.variantBMetrics as any || { successes: 0, failures: 0 };
    
    const aTotal = aMetrics.successes + aMetrics.failures;
    const bTotal = bMetrics.successes + bMetrics.failures;
    
    const aSuccessRate = aTotal > 0 ? aMetrics.successes / aTotal : 0;
    const bSuccessRate = bTotal > 0 ? bMetrics.successes / bTotal : 0;
    
    // Determine winner
    let winner: 'a' | 'b' | 'no_difference' = 'no_difference';
    let confidence = 0;
    
    if (aTotal > 30 && bTotal > 30) { // Minimum sample size
      const difference = Math.abs(bSuccessRate - aSuccessRate);
      const pooledRate = (aMetrics.successes + bMetrics.successes) / (aTotal + bTotal);
      const standardError = Math.sqrt(pooledRate * (1 - pooledRate) * (1/aTotal + 1/bTotal));
      const zScore = difference / standardError;
      
      confidence = this.zScoreToConfidence(zScore);
      
      if (confidence > 95) {
        winner = bSuccessRate > aSuccessRate ? 'b' : 'a';
      }
    }
    
    return {
      testId,
      variantAMetrics: {
        ...aMetrics,
        successRate: aSuccessRate * 100,
        sampleSize: aTotal,
      },
      variantBMetrics: {
        ...bMetrics,
        successRate: bSuccessRate * 100,
        sampleSize: bTotal,
      },
      winner,
      confidence,
    };
  }

  /**
   * Convert z-score to confidence percentage
   */
  private zScoreToConfidence(zScore: number): number {
    // Simplified conversion
    if (zScore > 2.576) return 99;
    if (zScore > 1.96) return 95;
    if (zScore > 1.645) return 90;
    if (zScore > 1.28) return 80;
    return Math.min(zScore * 30, 75);
  }

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics(): Promise<{
    currentHour: any;
    last24Hours: any;
    trends: any;
  }> {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60*60*1000);
    const dayAgo = new Date(now.getTime() - 24*60*60*1000);
    
    // Current hour metrics
    const currentHour = {
      feedbackCount: await this.getFeedbackVolume(hourAgo, now),
      accuracy: await this.getAccuracy(hourAgo, now),
      patternsDiscovered: await this.getPatternDiscoveryRate(hourAgo, now),
    };
    
    // Last 24 hours metrics
    const last24Hours = {
      feedbackCount: await this.getFeedbackVolume(dayAgo, now),
      accuracy: await this.getAccuracy(dayAgo, now),
      errorRate: await this.getErrorRate(dayAgo, now),
      patternsDiscovered: await this.getPatternDiscoveryRate(dayAgo, now),
      improvementsImplemented: await this.getImprovementRate(dayAgo, now),
    };
    
    // Calculate trends
    const trends = {
      feedbackVolume: currentHour.feedbackCount > 10 ? 'high' : 'normal',
      systemHealth: last24Hours.accuracy > 85 ? 'healthy' : 'needs_attention',
      learningRate: last24Hours.patternsDiscovered > 5 ? 'active' : 'low',
    };
    
    return {
      currentHour,
      last24Hours,
      trends,
    };
  }
}

// Export singleton instance
export const feedbackAnalytics = new FeedbackAnalyticsSystem();