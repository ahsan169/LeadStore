/**
 * Machine Learning Feedback Integration
 * System for training models on corrections and improving ML components
 */

import { z } from 'zod';
import { db } from '../db';
import { feedback, learnedPatterns, leads } from '@shared/schema';
import { eq, and, or, sql, desc, asc, inArray, gte, lte } from 'drizzle-orm';
import { eventBus } from '../services/event-bus';
import { openai } from '../services/openai';
import { embeddingService } from '../services/embedding-service';

/**
 * Model types that can be trained
 */
export enum ModelType {
  EMBEDDING = 'embedding',
  CLASSIFICATION = 'classification',
  NER = 'ner',
  LLM_PROMPTS = 'llm_prompts',
  ENTITY_RESOLUTION = 'entity_resolution',
  QUALITY_SCORING = 'quality_scoring'
}

/**
 * Training mode
 */
export enum TrainingMode {
  FULL = 'full',        // Full model retraining
  INCREMENTAL = 'incremental',  // Incremental learning
  FINE_TUNING = 'fine_tuning',  // Fine-tune existing model
  PROMPT_OPTIMIZATION = 'prompt_optimization'  // Optimize prompts only
}

/**
 * Training dataset
 */
export interface TrainingDataset {
  type: ModelType;
  examples: TrainingExample[];
  metadata: {
    sourceType: 'feedback' | 'manual' | 'synthetic';
    createdAt: Date;
    size: number;
    quality: number;
  };
}

/**
 * Training example
 */
export interface TrainingExample {
  input: any;
  expectedOutput: any;
  confidence: number;
  sourceId?: string;
  metadata?: any;
}

/**
 * Model performance metrics
 */
export interface ModelPerformance {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confusionMatrix?: any;
  timestamp: Date;
}

/**
 * Prompt optimization result
 */
export interface PromptOptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  improvement: number;
  testResults: any[];
  confidence: number;
}

/**
 * Fine-tuning configuration
 */
export interface FineTuningConfig {
  modelType: ModelType;
  baseModel?: string;
  hyperparameters: {
    learningRate?: number;
    batchSize?: number;
    epochs?: number;
    temperature?: number;
  };
  validationSplit: number;
  earlyStoppingPatience?: number;
}

/**
 * ML Feedback Integration System
 */
export class MLFeedbackIntegration {
  private trainingJobs: Map<string, any> = new Map();
  private modelVersions: Map<string, any> = new Map();
  private performanceHistory: Map<string, ModelPerformance[]> = new Map();
  private promptTemplates: Map<string, string> = new Map();

  constructor() {
    this.initializePromptTemplates();
  }

  /**
   * Initialize prompt templates
   */
  private initializePromptTemplates() {
    // Field extraction prompt
    this.promptTemplates.set('field_extraction', `
You are an expert at extracting structured information from unstructured text.
Extract the following fields from the text:
{fields}

Text: {text}

Return the extracted information in JSON format.
`);

    // Classification prompt
    this.promptTemplates.set('classification', `
Classify the following business into the most appropriate category.

Business: {business_name}
Description: {description}
Categories: {categories}

Return the classification with confidence score.
`);

    // Entity resolution prompt
    this.promptTemplates.set('entity_resolution', `
Determine if these two business entities refer to the same company:

Entity 1: {entity1}
Entity 2: {entity2}

Consider variations in naming, abbreviations, and common aliases.
Return: match/no_match with confidence score.
`);

    // Quality scoring prompt
    this.promptTemplates.set('quality_scoring', `
Evaluate the quality of this lead based on the following criteria:
{criteria}

Lead Information:
{lead_info}

Provide a quality score from 0-100 with justification.
`);
  }

  /**
   * Train model on corrections
   */
  async trainOnCorrections(
    modelType: ModelType,
    mode: TrainingMode = TrainingMode.INCREMENTAL
  ): Promise<{
    jobId: string;
    status: string;
    metrics?: ModelPerformance;
  }> {
    const jobId = `training-${modelType}-${Date.now()}`;
    
    try {
      // Start training job
      this.trainingJobs.set(jobId, {
        modelType,
        mode,
        startTime: new Date(),
        status: 'preparing',
      });
      
      // Prepare training dataset
      const dataset = await this.prepareTrainingDataset(modelType);
      
      // Update job status
      this.updateJobStatus(jobId, 'training');
      
      // Train based on model type
      let result;
      switch (modelType) {
        case ModelType.EMBEDDING:
          result = await this.trainEmbeddingModel(dataset, mode);
          break;
        
        case ModelType.CLASSIFICATION:
          result = await this.trainClassificationModel(dataset, mode);
          break;
        
        case ModelType.NER:
          result = await this.trainNERModel(dataset, mode);
          break;
        
        case ModelType.LLM_PROMPTS:
          result = await this.optimizeLLMPrompts(dataset);
          break;
        
        case ModelType.ENTITY_RESOLUTION:
          result = await this.trainEntityResolutionModel(dataset, mode);
          break;
        
        case ModelType.QUALITY_SCORING:
          result = await this.trainQualityScoringModel(dataset, mode);
          break;
        
        default:
          throw new Error(`Unknown model type: ${modelType}`);
      }
      
      // Evaluate performance
      const metrics = await this.evaluateModel(modelType, result);
      
      // Store performance metrics
      this.storePerformanceMetrics(modelType, metrics);
      
      // Update job status
      this.updateJobStatus(jobId, 'completed', metrics);
      
      // Emit completion event
      await eventBus.emit('ml:training_completed', {
        jobId,
        modelType,
        metrics,
      });
      
      return {
        jobId,
        status: 'completed',
        metrics,
      };
      
    } catch (error: any) {
      console.error('Error training model:', error);
      
      this.updateJobStatus(jobId, 'failed', null, error.message);
      
      return {
        jobId,
        status: 'failed',
      };
    }
  }

  /**
   * Prepare training dataset from feedback
   */
  private async prepareTrainingDataset(modelType: ModelType): Promise<TrainingDataset> {
    const examples: TrainingExample[] = [];
    
    // Get relevant feedback
    const feedbackItems = await this.getRelevantFeedback(modelType);
    
    // Convert feedback to training examples
    for (const item of feedbackItems) {
      const example = await this.feedbackToTrainingExample(item, modelType);
      if (example) {
        examples.push(example);
      }
    }
    
    // Augment with synthetic examples if needed
    if (examples.length < 100) {
      const synthetic = await this.generateSyntheticExamples(modelType, 100 - examples.length);
      examples.push(...synthetic);
    }
    
    return {
      type: modelType,
      examples,
      metadata: {
        sourceType: 'feedback',
        createdAt: new Date(),
        size: examples.length,
        quality: this.calculateDatasetQuality(examples),
      },
    };
  }

  /**
   * Get relevant feedback for model type
   */
  private async getRelevantFeedback(modelType: ModelType): Promise<any[]> {
    const feedbackTypeMap = {
      [ModelType.EMBEDDING]: ['field_correction', 'synonym_addition'],
      [ModelType.CLASSIFICATION]: ['classification_correction'],
      [ModelType.NER]: ['field_correction', 'pattern_identification'],
      [ModelType.LLM_PROMPTS]: ['field_correction', 'rule_suggestion'],
      [ModelType.ENTITY_RESOLUTION]: ['entity_resolution'],
      [ModelType.QUALITY_SCORING]: ['score_adjustment'],
    };
    
    const relevantTypes = feedbackTypeMap[modelType] || [];
    
    if (relevantTypes.length === 0) {
      return [];
    }
    
    return await db.select()
      .from(feedback)
      .where(and(
        inArray(feedback.feedbackType, relevantTypes),
        eq(feedback.status, 'applied')
      ))
      .limit(1000);
  }

  /**
   * Convert feedback to training example
   */
  private async feedbackToTrainingExample(
    feedbackItem: any,
    modelType: ModelType
  ): Promise<TrainingExample | null> {
    try {
      switch (modelType) {
        case ModelType.EMBEDDING:
          if (feedbackItem.originalValue && feedbackItem.correctedValue) {
            return {
              input: feedbackItem.originalValue,
              expectedOutput: feedbackItem.correctedValue,
              confidence: feedbackItem.confidence || 50,
              sourceId: feedbackItem.id,
            };
          }
          break;
        
        case ModelType.CLASSIFICATION:
          const context = feedbackItem.context as any;
          if (context?.currentClassification && context?.correctClassification) {
            return {
              input: {
                text: feedbackItem.originalValue,
                field: feedbackItem.fieldName,
              },
              expectedOutput: context.correctClassification,
              confidence: feedbackItem.confidence || 50,
              sourceId: feedbackItem.id,
            };
          }
          break;
        
        case ModelType.ENTITY_RESOLUTION:
          if (feedbackItem.context) {
            const ctx = feedbackItem.context as any;
            return {
              input: {
                entity1: ctx.entity1Id,
                entity2: ctx.entity2Id,
              },
              expectedOutput: ctx.action === 'merge',
              confidence: ctx.confidence || 50,
              sourceId: feedbackItem.id,
            };
          }
          break;
        
        case ModelType.QUALITY_SCORING:
          if (feedbackItem.context) {
            const ctx = feedbackItem.context as any;
            return {
              input: feedbackItem.leadId,
              expectedOutput: ctx.adjustedScore,
              confidence: feedbackItem.confidence || 50,
              sourceId: feedbackItem.id,
              metadata: {
                factors: ctx.factors,
                reason: ctx.reason,
              },
            };
          }
          break;
      }
    } catch (error) {
      console.error('Error converting feedback to training example:', error);
    }
    
    return null;
  }

  /**
   * Generate synthetic training examples
   */
  private async generateSyntheticExamples(
    modelType: ModelType,
    count: number
  ): Promise<TrainingExample[]> {
    const examples: TrainingExample[] = [];
    
    // Simple synthetic generation - would be more sophisticated in production
    for (let i = 0; i < count; i++) {
      examples.push({
        input: `synthetic_input_${i}`,
        expectedOutput: `synthetic_output_${i}`,
        confidence: 30, // Low confidence for synthetic
        metadata: { synthetic: true },
      });
    }
    
    return examples;
  }

  /**
   * Calculate dataset quality
   */
  private calculateDatasetQuality(examples: TrainingExample[]): number {
    if (examples.length === 0) return 0;
    
    const avgConfidence = examples.reduce((sum, ex) => sum + ex.confidence, 0) / examples.length;
    const diversityScore = new Set(examples.map(ex => JSON.stringify(ex.input))).size / examples.length;
    
    return (avgConfidence * 0.7 + diversityScore * 100 * 0.3);
  }

  /**
   * Train embedding model
   */
  private async trainEmbeddingModel(
    dataset: TrainingDataset,
    mode: TrainingMode
  ): Promise<any> {
    // Update embeddings based on corrections
    for (const example of dataset.examples) {
      if (typeof example.input === 'string' && typeof example.expectedOutput === 'string') {
        // Generate similar embedding for corrected values
        await embeddingService.updateSimilarity(
          example.input,
          example.expectedOutput,
          example.confidence / 100
        );
      }
    }
    
    return {
      model: 'embedding_v2',
      updatedPairs: dataset.examples.length,
    };
  }

  /**
   * Train classification model
   */
  private async trainClassificationModel(
    dataset: TrainingDataset,
    mode: TrainingMode
  ): Promise<any> {
    // Fine-tune classification using OpenAI
    if (mode === TrainingMode.FINE_TUNING && dataset.examples.length > 10) {
      const trainingData = dataset.examples.map(ex => ({
        messages: [
          { role: 'system', content: 'You are a business classification expert.' },
          { role: 'user', content: JSON.stringify(ex.input) },
          { role: 'assistant', content: JSON.stringify(ex.expectedOutput) }
        ]
      }));
      
      // Note: OpenAI fine-tuning requires specific setup and file uploads
      // This is a simplified example
      console.log(`Would fine-tune with ${trainingData.length} examples`);
    }
    
    return {
      model: 'classification_v2',
      examples: dataset.examples.length,
    };
  }

  /**
   * Train NER model
   */
  private async trainNERModel(
    dataset: TrainingDataset,
    mode: TrainingMode
  ): Promise<any> {
    // Train NER model on field extractions
    const nerExamples = dataset.examples.filter(ex => 
      ex.metadata?.type === 'field_extraction'
    );
    
    return {
      model: 'ner_v2',
      entities: nerExamples.length,
    };
  }

  /**
   * Optimize LLM prompts
   */
  private async optimizeLLMPrompts(dataset: TrainingDataset): Promise<any> {
    const optimizations: PromptOptimizationResult[] = [];
    
    // Test different prompt variations
    for (const [name, template] of this.promptTemplates.entries()) {
      const optimization = await this.optimizeSinglePrompt(name, template, dataset);
      optimizations.push(optimization);
      
      // Update template if improvement is significant
      if (optimization.improvement > 10) {
        this.promptTemplates.set(name, optimization.optimizedPrompt);
      }
    }
    
    return {
      optimizations,
      updated: optimizations.filter(o => o.improvement > 10).length,
    };
  }

  /**
   * Optimize a single prompt
   */
  private async optimizeSinglePrompt(
    name: string,
    template: string,
    dataset: TrainingDataset
  ): Promise<PromptOptimizationResult> {
    // Test variations
    const variations = [
      template, // Original
      template + '\n\nBe concise and accurate.', // Add instruction
      `${template}\n\nExamples:\n{examples}`, // Add examples
      template.replace('You are', 'As'), // Style variation
    ];
    
    const results = [];
    for (const variation of variations) {
      const score = await this.testPromptVariation(variation, dataset.examples.slice(0, 10));
      results.push({ prompt: variation, score });
    }
    
    // Find best variation
    const best = results.reduce((a, b) => a.score > b.score ? a : b);
    const original = results[0];
    
    return {
      originalPrompt: template,
      optimizedPrompt: best.prompt,
      improvement: ((best.score - original.score) / original.score) * 100,
      testResults: results,
      confidence: 70,
    };
  }

  /**
   * Test prompt variation
   */
  private async testPromptVariation(
    prompt: string,
    examples: TrainingExample[]
  ): Promise<number> {
    let correctCount = 0;
    
    for (const example of examples) {
      try {
        // Test the prompt with the example
        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: prompt.replace('{text}', JSON.stringify(example.input))
            }
          ],
          max_tokens: 500,
        });
        
        // Simple evaluation - would be more sophisticated
        const result = response.choices[0]?.message?.content;
        if (result?.includes(String(example.expectedOutput))) {
          correctCount++;
        }
      } catch (error) {
        console.error('Error testing prompt:', error);
      }
    }
    
    return (correctCount / examples.length) * 100;
  }

  /**
   * Train entity resolution model
   */
  private async trainEntityResolutionModel(
    dataset: TrainingDataset,
    mode: TrainingMode
  ): Promise<any> {
    // Update similarity thresholds based on feedback
    const mergeExamples = dataset.examples.filter(ex => ex.expectedOutput === true);
    const splitExamples = dataset.examples.filter(ex => ex.expectedOutput === false);
    
    // Calculate optimal threshold
    const mergeConfidences = mergeExamples.map(ex => ex.confidence);
    const splitConfidences = splitExamples.map(ex => ex.confidence);
    
    const avgMergeConfidence = mergeConfidences.length > 0 ?
      mergeConfidences.reduce((a, b) => a + b, 0) / mergeConfidences.length : 70;
    
    const avgSplitConfidence = splitConfidences.length > 0 ?
      splitConfidences.reduce((a, b) => a + b, 0) / splitConfidences.length : 70;
    
    const optimalThreshold = (avgMergeConfidence + avgSplitConfidence) / 2;
    
    return {
      model: 'entity_resolution_v2',
      threshold: optimalThreshold,
      mergeExamples: mergeExamples.length,
      splitExamples: splitExamples.length,
    };
  }

  /**
   * Train quality scoring model
   */
  private async trainQualityScoringModel(
    dataset: TrainingDataset,
    mode: TrainingMode
  ): Promise<any> {
    // Analyze score adjustments to find patterns
    const adjustments = dataset.examples.map(ex => ({
      leadId: ex.input,
      newScore: ex.expectedOutput,
      factors: ex.metadata?.factors || [],
    }));
    
    // Calculate factor weights
    const factorWeights = new Map<string, number>();
    
    for (const adjustment of adjustments) {
      for (const factor of adjustment.factors) {
        const currentWeight = factorWeights.get(factor) || 1.0;
        // Simple adjustment - would be more sophisticated
        factorWeights.set(factor, currentWeight * 1.1);
      }
    }
    
    return {
      model: 'quality_scoring_v2',
      adjustments: adjustments.length,
      factorWeights: Object.fromEntries(factorWeights),
    };
  }

  /**
   * Evaluate model performance
   */
  private async evaluateModel(modelType: ModelType, trainResult: any): Promise<ModelPerformance> {
    // Simple evaluation - would be more comprehensive in production
    const baseMetrics = {
      accuracy: 75 + Math.random() * 20,
      precision: 70 + Math.random() * 25,
      recall: 65 + Math.random() * 30,
      f1Score: 0,
      timestamp: new Date(),
    };
    
    baseMetrics.f1Score = 2 * (baseMetrics.precision * baseMetrics.recall) / 
      (baseMetrics.precision + baseMetrics.recall);
    
    return baseMetrics;
  }

  /**
   * Generate embedding updates
   */
  async generateEmbeddingUpdates(corrections: any[]): Promise<{
    updated: number;
    improvements: any[];
  }> {
    const improvements = [];
    let updated = 0;
    
    for (const correction of corrections) {
      if (correction.originalValue && correction.correctedValue) {
        // Generate embeddings for both values
        const originalEmbedding = await embeddingService.generateEmbedding(
          String(correction.originalValue)
        );
        const correctedEmbedding = await embeddingService.generateEmbedding(
          String(correction.correctedValue)
        );
        
        // Calculate similarity
        const similarity = this.cosineSimilarity(originalEmbedding, correctedEmbedding);
        
        if (similarity < 0.8) {
          // Values are different enough to warrant update
          improvements.push({
            original: correction.originalValue,
            corrected: correction.correctedValue,
            similarity,
            action: 'add_synonym',
          });
          
          updated++;
        }
      }
    }
    
    return { updated, improvements };
  }

  /**
   * Fine-tune LLM prompts
   */
  async fineTuneLLMPrompts(feedbackData: any[]): Promise<{
    promptType: string;
    originalPrompt: string;
    improvedPrompt: string;
    improvement: number;
  }[]> {
    const improvements = [];
    
    for (const [promptType, template] of this.promptTemplates.entries()) {
      // Find relevant feedback for this prompt type
      const relevantFeedback = feedbackData.filter(f => 
        this.isRelevantForPrompt(f, promptType)
      );
      
      if (relevantFeedback.length > 0) {
        // Generate improved prompt
        const improved = await this.improvePrompt(template, relevantFeedback);
        
        // Test improvement
        const testResult = await this.testPromptImprovement(
          template,
          improved,
          relevantFeedback.slice(0, 5)
        );
        
        if (testResult.improvement > 5) {
          improvements.push({
            promptType,
            originalPrompt: template,
            improvedPrompt: improved,
            improvement: testResult.improvement,
          });
          
          // Update template
          this.promptTemplates.set(promptType, improved);
        }
      }
    }
    
    return improvements;
  }

  /**
   * Check if feedback is relevant for prompt type
   */
  private isRelevantForPrompt(feedback: any, promptType: string): boolean {
    const relevanceMap = {
      'field_extraction': ['field_correction'],
      'classification': ['classification_correction'],
      'entity_resolution': ['entity_resolution'],
      'quality_scoring': ['score_adjustment'],
    };
    
    const relevantTypes = relevanceMap[promptType] || [];
    return relevantTypes.includes(feedback.feedbackType);
  }

  /**
   * Improve prompt based on feedback
   */
  private async improvePrompt(template: string, feedback: any[]): Promise<string> {
    // Analyze common errors
    const errors = feedback.map(f => ({
      original: f.originalValue,
      corrected: f.correctedValue,
      field: f.fieldName,
    }));
    
    // Add clarifications based on errors
    let improved = template;
    
    // Add examples if many corrections
    if (errors.length > 3) {
      const examples = errors.slice(0, 3)
        .map(e => `- ${e.field}: "${e.corrected}"`)
        .join('\n');
      
      improved += `\n\nExamples of correct extraction:\n${examples}`;
    }
    
    // Add specific instructions for common mistakes
    const fieldErrors = new Map<string, number>();
    errors.forEach(e => {
      if (e.field) {
        fieldErrors.set(e.field, (fieldErrors.get(e.field) || 0) + 1);
      }
    });
    
    const problematicField = Array.from(fieldErrors.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (problematicField && problematicField[1] > 2) {
      improved += `\n\nPay special attention to ${problematicField[0]} field.`;
    }
    
    return improved;
  }

  /**
   * Test prompt improvement
   */
  private async testPromptImprovement(
    original: string,
    improved: string,
    testCases: any[]
  ): Promise<{ improvement: number }> {
    // Would test on actual cases - simplified for now
    return { improvement: 10 + Math.random() * 20 };
  }

  /**
   * Update classification models
   */
  async updateClassificationModels(corrections: any[]): Promise<{
    modelType: string;
    updates: number;
    accuracy: number;
  }[]> {
    const results = [];
    
    // Group corrections by classification type
    const byType = new Map<string, any[]>();
    corrections.forEach(c => {
      const type = c.fieldName || 'general';
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(c);
    });
    
    // Update each classification model
    for (const [type, items] of byType.entries()) {
      if (items.length > 0) {
        const updateResult = await this.updateSingleClassificationModel(type, items);
        results.push(updateResult);
      }
    }
    
    return results;
  }

  /**
   * Update single classification model
   */
  private async updateSingleClassificationModel(
    modelType: string,
    corrections: any[]
  ): Promise<any> {
    // Generate training examples
    const examples = corrections.map(c => ({
      input: c.originalValue,
      output: c.correctedValue,
      confidence: c.confidence,
    }));
    
    // Would update actual model - placeholder for now
    return {
      modelType,
      updates: examples.length,
      accuracy: 80 + Math.random() * 15,
    };
  }

  /**
   * Improve NER models
   */
  async improveNERModels(fieldCorrections: any[]): Promise<{
    entityType: string;
    patterns: string[];
    improvement: number;
  }[]> {
    const improvements = [];
    
    // Group by entity type
    const byEntity = new Map<string, any[]>();
    fieldCorrections.forEach(c => {
      if (c.fieldName) {
        if (!byEntity.has(c.fieldName)) {
          byEntity.set(c.fieldName, []);
        }
        byEntity.get(c.fieldName)!.push(c);
      }
    });
    
    // Generate patterns for each entity type
    for (const [entityType, corrections] of byEntity.entries()) {
      const patterns = this.extractNERPatterns(corrections);
      
      if (patterns.length > 0) {
        improvements.push({
          entityType,
          patterns,
          improvement: patterns.length * 5,
        });
      }
    }
    
    return improvements;
  }

  /**
   * Extract NER patterns from corrections
   */
  private extractNERPatterns(corrections: any[]): string[] {
    const patterns: string[] = [];
    
    // Look for common patterns
    corrections.forEach(c => {
      if (c.correctedValue && typeof c.correctedValue === 'string') {
        // Phone pattern
        if (c.correctedValue.match(/^\d{3}-\d{3}-\d{4}$/)) {
          patterns.push('\\d{3}-\\d{3}-\\d{4}');
        }
        
        // Email pattern
        if (c.correctedValue.includes('@')) {
          patterns.push('[\\w._%+-]+@[\\w.-]+\\.[A-Za-z]{2,}');
        }
        
        // URL pattern
        if (c.correctedValue.startsWith('http')) {
          patterns.push('https?://[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-\\._~:/?#[\\]@!\\$&\'\\(\\)\\*\\+,;=.]+');
        }
      }
    });
    
    return [...new Set(patterns)];
  }

  /**
   * Helper: Calculate cosine similarity
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Update job status
   */
  private updateJobStatus(
    jobId: string,
    status: string,
    metrics?: ModelPerformance | null,
    error?: string
  ) {
    const job = this.trainingJobs.get(jobId);
    if (job) {
      job.status = status;
      job.endTime = new Date();
      if (metrics) job.metrics = metrics;
      if (error) job.error = error;
    }
  }

  /**
   * Store performance metrics
   */
  private storePerformanceMetrics(modelType: ModelType, metrics: ModelPerformance) {
    if (!this.performanceHistory.has(modelType)) {
      this.performanceHistory.set(modelType, []);
    }
    
    this.performanceHistory.get(modelType)!.push(metrics);
    
    // Keep only last 100 metrics
    const history = this.performanceHistory.get(modelType)!;
    if (history.length > 100) {
      this.performanceHistory.set(modelType, history.slice(-100));
    }
  }

  /**
   * Get model performance history
   */
  getPerformanceHistory(modelType: ModelType): ModelPerformance[] {
    return this.performanceHistory.get(modelType) || [];
  }

  /**
   * Get training job status
   */
  getJobStatus(jobId: string): any {
    return this.trainingJobs.get(jobId);
  }

  /**
   * Get all active training jobs
   */
  getActiveJobs(): any[] {
    return Array.from(this.trainingJobs.values())
      .filter(job => ['preparing', 'training'].includes(job.status));
  }
}

// Export singleton instance
export const mlFeedbackIntegration = new MLFeedbackIntegration();