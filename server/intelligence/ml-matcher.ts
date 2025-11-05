/**
 * Machine Learning Enhanced Matcher
 * Learns from confirmed/rejected matches to improve accuracy over time
 */

import { EntityMatchResult } from './entity-resolution';
import { Lead } from '@shared/schema';
import { db } from '../db';
import { entityMatches, leads } from '@shared/schema';
import { eq, and, or, sql, desc } from 'drizzle-orm';

/**
 * Feedback type for learning
 */
export enum FeedbackType {
  CONFIRM_MATCH = 'confirm_match',
  REJECT_MATCH = 'reject_match',
  CONFIRM_MERGE = 'confirm_merge',
  UNDO_MERGE = 'undo_merge'
}

/**
 * Feature vector for ML model
 */
export interface FeatureVector {
  // Name similarity features
  nameExactMatch: number;
  nameJaroWinkler: number;
  nameLevenshtein: number;
  nameTokenOverlap: number;
  namePhoneticMatch: number;
  nameLengthDiff: number;
  
  // Contact features
  phoneMatch: number;
  phonePartialMatch: number;
  emailMatch: number;
  emailDomainMatch: number;
  
  // Address features
  addressExactMatch: number;
  addressStreetMatch: number;
  addressCityMatch: number;
  addressStateMatch: number;
  addressZipMatch: number;
  addressDistance: number; // Geographic distance if coordinates available
  
  // Business features
  industrySame: number;
  revenueRangeSame: number;
  yearFoundedDiff: number;
  employeeRangeSame: number;
  
  // Meta features
  dataCompleteness1: number;
  dataCompleteness2: number;
  enrichmentStatus1: number;
  enrichmentStatus2: number;
  qualityScoreDiff: number;
  uploadDateDiff: number;
}

/**
 * Learning model configuration
 */
export interface MLConfig {
  learningRate: number;
  minSamplesForUpdate: number;
  featureImportanceDecay: number;
  adaptiveThreshold: boolean;
  abTestingEnabled: boolean;
  abTestSplitRatio: number;
}

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  averageConfidenceDelta: number;
  totalSamples: number;
}

/**
 * A/B test variant
 */
export interface ABTestVariant {
  id: string;
  name: string;
  weights: Map<string, number>;
  threshold: number;
  metrics: ModelMetrics;
  sampleCount: number;
}

/**
 * Default ML configuration
 */
const DEFAULT_CONFIG: MLConfig = {
  learningRate: 0.01,
  minSamplesForUpdate: 100,
  featureImportanceDecay: 0.995,
  adaptiveThreshold: true,
  abTestingEnabled: false,
  abTestSplitRatio: 0.2
};

/**
 * Machine Learning Enhanced Matcher
 */
export class MLMatcher {
  private config: MLConfig;
  private featureWeights: Map<string, number>;
  private featureImportance: Map<string, number>;
  private confidenceThreshold: number;
  private trainingData: Array<{ features: FeatureVector; label: boolean; confidence: number }>;
  private modelVersion: number;
  private abTestVariants: Map<string, ABTestVariant>;
  private currentMetrics: ModelMetrics;

  constructor(config: Partial<MLConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.featureWeights = this.initializeWeights();
    this.featureImportance = new Map();
    this.confidenceThreshold = 70; // Initial threshold
    this.trainingData = [];
    this.modelVersion = 1;
    this.abTestVariants = new Map();
    this.currentMetrics = this.initializeMetrics();
    
    // Load existing model if available
    this.loadModel();
  }

  /**
   * Initialize feature weights
   */
  private initializeWeights(): Map<string, number> {
    const weights = new Map<string, number>();
    
    // Initial weights based on domain knowledge
    weights.set('nameExactMatch', 1.0);
    weights.set('nameJaroWinkler', 0.8);
    weights.set('nameLevenshtein', 0.7);
    weights.set('nameTokenOverlap', 0.6);
    weights.set('namePhoneticMatch', 0.5);
    weights.set('nameLengthDiff', -0.2);
    
    weights.set('phoneMatch', 0.9);
    weights.set('phonePartialMatch', 0.4);
    weights.set('emailMatch', 0.85);
    weights.set('emailDomainMatch', 0.3);
    
    weights.set('addressExactMatch', 0.7);
    weights.set('addressStreetMatch', 0.5);
    weights.set('addressCityMatch', 0.3);
    weights.set('addressStateMatch', 0.2);
    weights.set('addressZipMatch', 0.4);
    weights.set('addressDistance', -0.3);
    
    weights.set('industrySame', 0.3);
    weights.set('revenueRangeSame', 0.2);
    weights.set('yearFoundedDiff', -0.1);
    weights.set('employeeRangeSame', 0.15);
    
    weights.set('dataCompleteness1', 0.1);
    weights.set('dataCompleteness2', 0.1);
    weights.set('enrichmentStatus1', 0.15);
    weights.set('enrichmentStatus2', 0.15);
    weights.set('qualityScoreDiff', -0.1);
    weights.set('uploadDateDiff', -0.05);
    
    return weights;
  }

  /**
   * Extract features from entity pair
   */
  extractFeatures(entity1: Lead, entity2: Lead): FeatureVector {
    // Import matching functions from matching-algorithms
    const { 
      calculateJaroWinkler,
      calculateLevenshtein,
      calculateTokenSimilarity,
      metaphone,
      normalizeBusinessName,
      normalizePhone,
      normalizeEmail,
      normalizeAddress
    } = require('./matching-algorithms');
    
    // Name features
    const name1 = normalizeBusinessName(entity1.businessName || '');
    const name2 = normalizeBusinessName(entity2.businessName || '');
    
    const features: FeatureVector = {
      nameExactMatch: name1 === name2 ? 1 : 0,
      nameJaroWinkler: calculateJaroWinkler(name1, name2),
      nameLevenshtein: calculateLevenshtein(name1, name2),
      nameTokenOverlap: calculateTokenSimilarity(name1, name2),
      namePhoneticMatch: metaphone(name1) === metaphone(name2) ? 1 : 0,
      nameLengthDiff: Math.abs(name1.length - name2.length) / Math.max(name1.length, name2.length, 1),
      
      // Contact features
      phoneMatch: 0,
      phonePartialMatch: 0,
      emailMatch: 0,
      emailDomainMatch: 0,
      
      // Address features
      addressExactMatch: 0,
      addressStreetMatch: 0,
      addressCityMatch: 0,
      addressStateMatch: 0,
      addressZipMatch: 0,
      addressDistance: 0,
      
      // Business features
      industrySame: 0,
      revenueRangeSame: 0,
      yearFoundedDiff: 0,
      employeeRangeSame: 0,
      
      // Meta features
      dataCompleteness1: 0,
      dataCompleteness2: 0,
      enrichmentStatus1: entity1.isEnriched ? 1 : 0,
      enrichmentStatus2: entity2.isEnriched ? 1 : 0,
      qualityScoreDiff: 0,
      uploadDateDiff: 0
    };
    
    // Phone features
    if (entity1.phone && entity2.phone) {
      const phone1 = normalizePhone(entity1.phone);
      const phone2 = normalizePhone(entity2.phone);
      features.phoneMatch = phone1 === phone2 ? 1 : 0;
      features.phonePartialMatch = phone1.startsWith(phone2.substring(0, 6)) || 
                                   phone2.startsWith(phone1.substring(0, 6)) ? 1 : 0;
    }
    
    // Email features
    if (entity1.email && entity2.email) {
      const email1 = normalizeEmail(entity1.email);
      const email2 = normalizeEmail(entity2.email);
      features.emailMatch = email1 === email2 ? 1 : 0;
      features.emailDomainMatch = email1.split('@')[1] === email2.split('@')[1] ? 1 : 0;
    }
    
    // Address features
    if (entity1.fullAddress && entity2.fullAddress) {
      const addr1 = normalizeAddress(entity1.fullAddress);
      const addr2 = normalizeAddress(entity2.fullAddress);
      features.addressExactMatch = addr1 === addr2 ? 1 : 0;
      
      // City and state matching
      features.addressCityMatch = entity1.city === entity2.city ? 1 : 0;
      features.addressStateMatch = entity1.state === entity2.state ? 1 : 0;
      features.addressZipMatch = entity1.zipCode === entity2.zipCode ? 1 : 0;
    }
    
    // Business features
    features.industrySame = entity1.industry === entity2.industry && entity1.industry ? 1 : 0;
    
    // Revenue range comparison
    const revenue1 = parseInt(entity1.annualRevenue || '0');
    const revenue2 = parseInt(entity2.annualRevenue || '0');
    if (revenue1 > 0 && revenue2 > 0) {
      const revenueDiff = Math.abs(revenue1 - revenue2) / Math.max(revenue1, revenue2);
      features.revenueRangeSame = revenueDiff < 0.3 ? 1 - revenueDiff : 0;
    }
    
    // Year founded difference
    if (entity1.yearFounded && entity2.yearFounded) {
      features.yearFoundedDiff = Math.abs(entity1.yearFounded - entity2.yearFounded) / 100;
    }
    
    // Employee count range
    if (entity1.employeeCount && entity2.employeeCount) {
      const empDiff = Math.abs(entity1.employeeCount - entity2.employeeCount) / 
                      Math.max(entity1.employeeCount, entity2.employeeCount);
      features.employeeRangeSame = empDiff < 0.5 ? 1 - empDiff : 0;
    }
    
    // Data completeness
    features.dataCompleteness1 = this.calculateCompleteness(entity1);
    features.dataCompleteness2 = this.calculateCompleteness(entity2);
    
    // Quality score difference
    const qualityDiff = Math.abs((entity1.qualityScore || 0) - (entity2.qualityScore || 0)) / 100;
    features.qualityScoreDiff = qualityDiff;
    
    // Upload date difference (in days)
    const daysDiff = Math.abs(entity1.uploadedAt.getTime() - entity2.uploadedAt.getTime()) / 
                     (1000 * 60 * 60 * 24);
    features.uploadDateDiff = Math.min(daysDiff / 365, 1); // Normalize to 0-1
    
    return features;
  }

  /**
   * Calculate entity data completeness
   */
  private calculateCompleteness(entity: Lead): number {
    const fields = [
      'businessName', 'ownerName', 'email', 'phone', 
      'industry', 'annualRevenue', 'fullAddress', 'city', 
      'state', 'zipCode', 'yearFounded', 'employeeCount'
    ];
    
    const filledFields = fields.filter(field => 
      entity[field as keyof Lead] !== null && 
      entity[field as keyof Lead] !== ''
    ).length;
    
    return filledFields / fields.length;
  }

  /**
   * Predict match confidence using ML model
   */
  predict(entity1: Lead, entity2: Lead): number {
    const features = this.extractFeatures(entity1, entity2);
    
    // A/B testing if enabled
    if (this.config.abTestingEnabled && Math.random() < this.config.abTestSplitRatio) {
      return this.predictWithVariant(features);
    }
    
    // Standard prediction
    return this.predictWithWeights(features, this.featureWeights);
  }

  /**
   * Predict with current weights
   */
  private predictWithWeights(features: FeatureVector, weights: Map<string, number>): number {
    let score = 0;
    let totalWeight = 0;
    
    for (const [featureName, featureValue] of Object.entries(features)) {
      const weight = weights.get(featureName) || 0;
      score += featureValue * Math.abs(weight);
      totalWeight += Math.abs(weight);
    }
    
    // Normalize to 0-100
    const confidence = totalWeight > 0 ? (score / totalWeight) * 100 : 0;
    
    // Apply sigmoid transformation for better distribution
    const sigmoid = 1 / (1 + Math.exp(-((confidence - 50) / 10)));
    return Math.round(sigmoid * 100);
  }

  /**
   * Predict with A/B test variant
   */
  private predictWithVariant(features: FeatureVector): number {
    // Select random variant
    const variants = Array.from(this.abTestVariants.values());
    if (variants.length === 0) {
      // Create default variant if none exist
      this.createABTestVariant('baseline', this.featureWeights);
      this.createABTestVariant('experimental', this.mutateWeights(this.featureWeights));
      return this.predictWithVariant(features);
    }
    
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const confidence = this.predictWithWeights(features, variant.weights);
    
    // Track for metrics
    variant.sampleCount++;
    
    return confidence;
  }

  /**
   * Learn from feedback
   */
  async learn(
    match: EntityMatchResult,
    feedback: FeedbackType,
    entity1: Lead,
    entity2: Lead
  ): Promise<void> {
    const features = this.extractFeatures(entity1, entity2);
    const label = feedback === FeedbackType.CONFIRM_MATCH || 
                  feedback === FeedbackType.CONFIRM_MERGE;
    
    // Add to training data
    this.trainingData.push({
      features,
      label,
      confidence: match.confidence
    });
    
    // Update weights if enough samples
    if (this.trainingData.length >= this.config.minSamplesForUpdate) {
      await this.updateWeights();
      this.trainingData = []; // Clear after update
    }
    
    // Update feature importance
    this.updateFeatureImportance(features, label, match.confidence);
    
    // Adjust threshold if adaptive
    if (this.config.adaptiveThreshold) {
      this.adjustThreshold(feedback, match.confidence);
    }
    
    // Store feedback in database
    await this.storeFeedback(match, feedback);
  }

  /**
   * Update weights based on training data
   */
  private async updateWeights(): Promise<void> {
    const gradients = new Map<string, number>();
    
    // Initialize gradients
    for (const key of this.featureWeights.keys()) {
      gradients.set(key, 0);
    }
    
    // Calculate gradients
    for (const sample of this.trainingData) {
      const prediction = this.predictWithWeights(sample.features, this.featureWeights) / 100;
      const error = (sample.label ? 1 : 0) - prediction;
      
      for (const [featureName, featureValue] of Object.entries(sample.features)) {
        const currentGradient = gradients.get(featureName) || 0;
        gradients.set(featureName, currentGradient + error * featureValue);
      }
    }
    
    // Apply gradients with learning rate
    for (const [featureName, gradient] of gradients) {
      const currentWeight = this.featureWeights.get(featureName) || 0;
      const avgGradient = gradient / this.trainingData.length;
      const newWeight = currentWeight + this.config.learningRate * avgGradient;
      
      // Clip weights to prevent explosion
      this.featureWeights.set(featureName, Math.max(-2, Math.min(2, newWeight)));
    }
    
    // Increment model version
    this.modelVersion++;
    
    // Save updated model
    await this.saveModel();
    
    // Update metrics
    await this.updateMetrics();
  }

  /**
   * Update feature importance
   */
  private updateFeatureImportance(
    features: FeatureVector,
    label: boolean,
    confidence: number
  ): void {
    const correctPrediction = (label && confidence > this.confidenceThreshold) ||
                             (!label && confidence < this.confidenceThreshold);
    
    for (const [featureName, featureValue] of Object.entries(features)) {
      const currentImportance = this.featureImportance.get(featureName) || 0;
      
      // Increase importance for features that contribute to correct predictions
      const contribution = correctPrediction ? featureValue : -featureValue * 0.5;
      const newImportance = currentImportance * this.config.featureImportanceDecay + contribution;
      
      this.featureImportance.set(featureName, newImportance);
    }
  }

  /**
   * Adjust confidence threshold based on feedback
   */
  private adjustThreshold(feedback: FeedbackType, confidence: number): void {
    const delta = 0.5; // Adjustment step
    
    switch (feedback) {
      case FeedbackType.CONFIRM_MATCH:
        if (confidence < this.confidenceThreshold) {
          // Lower threshold to catch more true positives
          this.confidenceThreshold = Math.max(50, this.confidenceThreshold - delta);
        }
        break;
      
      case FeedbackType.REJECT_MATCH:
        if (confidence > this.confidenceThreshold) {
          // Raise threshold to reduce false positives
          this.confidenceThreshold = Math.min(95, this.confidenceThreshold + delta);
        }
        break;
    }
  }

  /**
   * Create A/B test variant
   */
  private createABTestVariant(name: string, weights: Map<string, number>): void {
    const variant: ABTestVariant = {
      id: `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      weights: new Map(weights),
      threshold: this.confidenceThreshold,
      metrics: this.initializeMetrics(),
      sampleCount: 0
    };
    
    this.abTestVariants.set(variant.id, variant);
  }

  /**
   * Mutate weights for experimentation
   */
  private mutateWeights(weights: Map<string, number>): Map<string, number> {
    const mutated = new Map(weights);
    
    // Randomly adjust some weights
    const featuresToMutate = Array.from(weights.keys())
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
    
    for (const feature of featuresToMutate) {
      const currentWeight = mutated.get(feature) || 0;
      const mutation = (Math.random() - 0.5) * 0.4; // ±20% change
      mutated.set(feature, currentWeight * (1 + mutation));
    }
    
    return mutated;
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): ModelMetrics {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      averageConfidenceDelta: 0,
      totalSamples: 0
    };
  }

  /**
   * Update model metrics
   */
  private async updateMetrics(): Promise<void> {
    // Fetch recent feedback from database
    const recentMatches = await db
      .select()
      .from(entityMatches)
      .where(sql`reviewed_at >= NOW() - INTERVAL '30 DAYS'`)
      .orderBy(desc(entityMatches.reviewedAt))
      .limit(1000);
    
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;
    let totalConfidenceDelta = 0;
    
    for (const match of recentMatches) {
      const predicted = match.matchConfidence >= this.confidenceThreshold;
      const actual = match.status === 'confirmed';
      
      if (predicted && actual) truePositives++;
      else if (predicted && !actual) falsePositives++;
      else if (!predicted && actual) falseNegatives++;
      else if (!predicted && !actual) trueNegatives++;
      
      totalConfidenceDelta += Math.abs(match.matchConfidence - (actual ? 100 : 0));
    }
    
    const total = truePositives + falsePositives + trueNegatives + falseNegatives;
    
    if (total > 0) {
      this.currentMetrics = {
        accuracy: (truePositives + trueNegatives) / total,
        precision: truePositives / (truePositives + falsePositives || 1),
        recall: truePositives / (truePositives + falseNegatives || 1),
        f1Score: 0,
        falsePositiveRate: falsePositives / (falsePositives + trueNegatives || 1),
        falseNegativeRate: falseNegatives / (falseNegatives + truePositives || 1),
        averageConfidenceDelta: totalConfidenceDelta / total,
        totalSamples: total
      };
      
      // Calculate F1 score
      if (this.currentMetrics.precision + this.currentMetrics.recall > 0) {
        this.currentMetrics.f1Score = 2 * (this.currentMetrics.precision * this.currentMetrics.recall) /
                                      (this.currentMetrics.precision + this.currentMetrics.recall);
      }
    }
  }

  /**
   * Get best performing variant
   */
  getBestVariant(): ABTestVariant | null {
    let bestVariant: ABTestVariant | null = null;
    let bestScore = -1;
    
    for (const variant of this.abTestVariants.values()) {
      if (variant.sampleCount < 100) continue; // Need minimum samples
      
      const score = variant.metrics.f1Score || 0;
      if (score > bestScore) {
        bestScore = score;
        bestVariant = variant;
      }
    }
    
    return bestVariant;
  }

  /**
   * Generate matching rules from patterns
   */
  async generateRules(): Promise<Array<{ pattern: string; confidence: number; support: number }>> {
    const rules = [];
    
    // Analyze feature importance
    const sortedFeatures = Array.from(this.featureImportance.entries())
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);
    
    for (const [feature, importance] of sortedFeatures) {
      const weight = this.featureWeights.get(feature) || 0;
      
      // Generate rule based on feature importance and weight
      if (Math.abs(importance) > 0.5) {
        let pattern = '';
        let confidence = Math.abs(importance) * 100;
        
        // Create human-readable pattern
        if (feature.includes('name')) {
          pattern = `Business name ${feature} similarity`;
        } else if (feature.includes('phone')) {
          pattern = `Phone number ${feature.replace('phone', '').toLowerCase()} match`;
        } else if (feature.includes('email')) {
          pattern = `Email ${feature.replace('email', '').toLowerCase()} match`;
        } else if (feature.includes('address')) {
          pattern = `Address ${feature.replace('address', '').toLowerCase()} match`;
        } else {
          pattern = `${feature} comparison`;
        }
        
        // Add directionality
        if (weight > 0) {
          pattern += ' indicates match';
        } else {
          pattern += ' indicates non-match';
        }
        
        rules.push({
          pattern,
          confidence,
          support: Math.abs(weight) * 50 // Convert weight to support percentage
        });
      }
    }
    
    return rules;
  }

  /**
   * Store feedback in database
   */
  private async storeFeedback(
    match: EntityMatchResult,
    feedback: FeedbackType
  ): Promise<void> {
    // This would store feedback for future analysis
    // Implementation depends on database schema
  }

  /**
   * Save model to database
   */
  private async saveModel(): Promise<void> {
    // Convert weights and importance to JSON
    const modelData = {
      version: this.modelVersion,
      weights: Object.fromEntries(this.featureWeights),
      importance: Object.fromEntries(this.featureImportance),
      threshold: this.confidenceThreshold,
      metrics: this.currentMetrics,
      config: this.config,
      timestamp: new Date()
    };
    
    // Store in database (would need a model storage table)
    // For now, just log
    console.log('Model saved:', {
      version: this.modelVersion,
      accuracy: this.currentMetrics.accuracy,
      f1Score: this.currentMetrics.f1Score
    });
  }

  /**
   * Load model from database
   */
  private async loadModel(): Promise<void> {
    // This would load a previously saved model
    // For now, use defaults
  }

  /**
   * Get model metrics
   */
  getMetrics(): ModelMetrics {
    return this.currentMetrics;
  }

  /**
   * Get feature importance ranking
   */
  getFeatureImportance(): Array<{ feature: string; importance: number }> {
    return Array.from(this.featureImportance.entries())
      .map(([feature, importance]) => ({ feature, importance }))
      .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance));
  }

  /**
   * Export model for external use
   */
  exportModel(): string {
    const model = {
      version: this.modelVersion,
      weights: Object.fromEntries(this.featureWeights),
      importance: Object.fromEntries(this.featureImportance),
      threshold: this.confidenceThreshold,
      metrics: this.currentMetrics
    };
    
    return JSON.stringify(model, null, 2);
  }

  /**
   * Import model from JSON
   */
  importModel(modelJson: string): void {
    const model = JSON.parse(modelJson);
    
    this.modelVersion = model.version;
    this.featureWeights = new Map(Object.entries(model.weights));
    this.featureImportance = new Map(Object.entries(model.importance));
    this.confidenceThreshold = model.threshold;
    this.currentMetrics = model.metrics;
  }
}

// Export singleton instance
export const mlMatcher = new MLMatcher();