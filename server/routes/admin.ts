import { Express, Request, Response } from "express";

// Middleware to check if user is authenticated
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.user = { id: req.session.userId, role: req.session.userRole };
  next();
}

// Middleware to check admin role
function requireAdmin(req: any, res: any, next: any) {
  if (req.session?.userRole !== 'admin') {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function setupAdminRoutes(app: Express) {
  // Intelligence Dashboard Routes
  
  // GET /api/admin/intelligence/overview - Get dashboard metrics
  app.get("/api/admin/intelligence/overview", requireAuth, requireAdmin, async (req, res) => {
    try {
      // Simulate intelligence overview data
      const overview = {
        pipelineStatus: 'healthy',
        systemStatus: 'healthy',
        systemMessage: 'All systems operational',
        activePipelines: 3,
        todaysCost: 45.67,
        monthCost: 1234.56,
        tierUsage: {
          tier0: 1250,  // AI fields
          tier1: 3450,  // API fields
          tier2: 890    // Fallback fields
        },
        costBreakdown: generateCostData(30),
        recentErrors: []
      };
      
      res.json(overview);
    } catch (error) {
      console.error("Error fetching intelligence overview:", error);
      res.status(500).json({ error: "Failed to fetch intelligence overview" });
    }
  });

  // GET /api/rules/performance - Get rule performance metrics
  app.get("/api/rules/performance", requireAuth, requireAdmin, async (req, res) => {
    try {
      const performance = {
        topRules: [
          { id: '1', name: 'Revenue Validation', executions: 1234, successRate: 95, impactScore: 89 },
          { id: '2', name: 'Email Enrichment', executions: 987, successRate: 88, impactScore: 76 },
          { id: '3', name: 'Industry Classification', executions: 654, successRate: 92, impactScore: 82 },
          { id: '4', name: 'Risk Assessment', executions: 543, successRate: 90, impactScore: 71 },
          { id: '5', name: 'Data Normalization', executions: 432, successRate: 94, impactScore: 68 }
        ]
      };
      
      res.json(performance);
    } catch (error) {
      console.error("Error fetching rule performance:", error);
      res.status(500).json({ error: "Failed to fetch rule performance" });
    }
  });

  // GET /api/brain/recent - Get recent processing explanations
  app.get("/api/brain/recent", requireAuth, requireAdmin, async (req, res) => {
    try {
      const recent = {
        explanations: generateRecentProcessing(10)
      };
      
      res.json(recent);
    } catch (error) {
      console.error("Error fetching recent processing:", error);
      res.status(500).json({ error: "Failed to fetch recent processing" });
    }
  });

  // Pipeline Inspector Routes
  
  // GET /api/brain/history - Get processing history
  app.get("/api/brain/history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { search, status, limit = '50' } = req.query;
      
      const history = generateProcessingHistory(parseInt(limit as string));
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching processing history:", error);
      res.status(500).json({ error: "Failed to fetch processing history" });
    }
  });

  // GET /api/brain/history/:leadId - Get detailed history for a lead
  app.get("/api/brain/history/:leadId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { leadId } = req.params;
      
      const detailedHistory = generateDetailedHistory(leadId);
      
      res.json(detailedHistory);
    } catch (error) {
      console.error("Error fetching lead history:", error);
      res.status(500).json({ error: "Failed to fetch lead history" });
    }
  });

  // Rules Manager Routes
  
  // GET /api/rules - Get all rules (if not already defined)
  app.get("/api/rules", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { type, search } = req.query;
      
      const rules = {
        rules: generateRules(20)
      };
      
      res.json(rules);
    } catch (error) {
      console.error("Error fetching rules:", error);
      res.status(500).json({ error: "Failed to fetch rules" });
    }
  });

  // POST /api/rules/dry-run - Test rules with sample data
  app.post("/api/rules/dry-run", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { ruleIds, testData } = req.body;
      
      const result = {
        matched: Math.random() > 0.3,
        transformations: {
          businessName: { before: 'TEST CO', after: 'Test Company Inc.' },
          revenue: { before: null, after: 1000000 }
        },
        scoreImpact: Math.floor(Math.random() * 30) - 10,
        executionTime: Math.floor(Math.random() * 100) + 50,
        explanation: 'Rule executed successfully with field transformations applied'
      };
      
      res.json(result);
    } catch (error) {
      console.error("Error running dry test:", error);
      res.status(500).json({ error: "Failed to run dry test" });
    }
  });

  // Knowledge Manager Routes
  
  // GET /api/admin/knowledge/ontology - Get field ontology
  app.get("/api/admin/knowledge/ontology", requireAuth, requireAdmin, async (req, res) => {
    try {
      const ontology = {
        fields: {
          businessName: {
            canonical: 'businessName',
            synonyms: ['company_name', 'business', 'name', 'companyName', 'biz_name'],
            validator: 'string',
            normalizer: 'titleCase',
            description: 'The official business name'
          },
          email: {
            canonical: 'email',
            synonyms: ['email_address', 'contact_email', 'emailAddress', 'mail'],
            validator: 'email',
            normalizer: 'lowercase',
            description: 'Primary contact email'
          },
          phone: {
            canonical: 'phone',
            synonyms: ['phone_number', 'telephone', 'phoneNumber', 'tel', 'mobile'],
            validator: 'phone',
            normalizer: 'phoneFormat',
            description: 'Primary phone number'
          },
          annualRevenue: {
            canonical: 'annualRevenue',
            synonyms: ['revenue', 'annual_revenue', 'yearly_revenue', 'sales'],
            validator: 'number',
            normalizer: 'currency',
            description: 'Annual revenue in USD'
          },
          industry: {
            canonical: 'industry',
            synonyms: ['sector', 'business_type', 'industry_type', 'vertical'],
            validator: 'string',
            normalizer: 'titleCase',
            description: 'Primary industry classification'
          }
        }
      };
      
      res.json(ontology);
    } catch (error) {
      console.error("Error fetching ontology:", error);
      res.status(500).json({ error: "Failed to fetch ontology" });
    }
  });

  // PUT /api/admin/knowledge/ontology - Update field ontology
  app.put("/api/admin/knowledge/ontology", requireAuth, requireAdmin, async (req, res) => {
    try {
      const ontology = req.body;
      
      // In a real implementation, save the ontology
      console.log("Updating ontology:", ontology);
      
      res.json({ success: true, message: "Ontology updated successfully" });
    } catch (error) {
      console.error("Error updating ontology:", error);
      res.status(500).json({ error: "Failed to update ontology" });
    }
  });

  // GET /api/admin/knowledge/funders - Get funders database
  app.get("/api/admin/knowledge/funders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const funders = {
        funders: [
          {
            id: '1',
            name: 'OnDeck',
            aliases: ['OnDeck Capital', 'On Deck'],
            type: 'MCA Provider',
            tier: 'Tier 1',
            patterns: ['ondeck', 'on-deck'],
            riskLevel: 'moderate'
          },
          {
            id: '2',
            name: 'Kabbage',
            aliases: ['Kabbage Inc', 'Kabbage Funding'],
            type: 'Alternative Lender',
            tier: 'Tier 1',
            patterns: ['kabbage'],
            riskLevel: 'moderate'
          },
          {
            id: '3',
            name: 'CAN Capital',
            aliases: ['CAN', 'CAN Capital Inc'],
            type: 'MCA Provider',
            tier: 'Tier 1',
            patterns: ['can capital', 'cancapital'],
            riskLevel: 'moderate'
          },
          {
            id: '4',
            name: 'Square Capital',
            aliases: ['Square', 'Block Capital'],
            type: 'Payment Processor Lender',
            tier: 'Tier 1',
            patterns: ['square', 'block'],
            riskLevel: 'low'
          },
          {
            id: '5',
            name: 'PayPal Working Capital',
            aliases: ['PayPal', 'PPWC'],
            type: 'Payment Processor Lender',
            tier: 'Tier 1',
            patterns: ['paypal'],
            riskLevel: 'low'
          }
        ]
      };
      
      res.json(funders);
    } catch (error) {
      console.error("Error fetching funders:", error);
      res.status(500).json({ error: "Failed to fetch funders" });
    }
  });

  // PUT /api/admin/knowledge/funders - Update funders database
  app.put("/api/admin/knowledge/funders", requireAuth, requireAdmin, async (req, res) => {
    try {
      const funders = req.body;
      
      // In a real implementation, save the funders
      console.log("Updating funders:", funders);
      
      res.json({ success: true, message: "Funders database updated successfully" });
    } catch (error) {
      console.error("Error updating funders:", error);
      res.status(500).json({ error: "Failed to update funders" });
    }
  });

  // GET /api/admin/knowledge/industry - Get industry knowledge
  app.get("/api/admin/knowledge/industry", requireAuth, requireAdmin, async (req, res) => {
    try {
      const industryKnowledge = {
        riskProfiles: {
          restaurant: 0.8,
          retail: 0.6,
          construction: 0.7,
          technology: 0.3,
          healthcare: 0.4,
          manufacturing: 0.5,
          transportation: 0.6,
          real_estate: 0.4,
          professional_services: 0.3,
          hospitality: 0.7
        },
        scoringParameters: {
          revenueWeight: 0.3,
          industryWeight: 0.2,
          uccWeight: 0.25,
          fundingHistoryWeight: 0.15,
          businessAgeWeight: 0.1
        }
      };
      
      res.json(industryKnowledge);
    } catch (error) {
      console.error("Error fetching industry knowledge:", error);
      res.status(500).json({ error: "Failed to fetch industry knowledge" });
    }
  });

  // POST /api/admin/knowledge/test-mapping - Test field mapping
  app.post("/api/admin/knowledge/test-mapping", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { field } = req.body;
      
      // Simple mapping logic for testing
      const mappings: Record<string, string> = {
        'company_name': 'businessName',
        'business': 'businessName',
        'biz_name': 'businessName',
        'email_address': 'email',
        'contact_email': 'email',
        'phone_number': 'phone',
        'telephone': 'phone',
        'revenue': 'annualRevenue',
        'yearly_revenue': 'annualRevenue',
        'sector': 'industry',
        'business_type': 'industry'
      };
      
      const canonical = mappings[field.toLowerCase()] || null;
      
      res.json({ canonical });
    } catch (error) {
      console.error("Error testing mapping:", error);
      res.status(500).json({ error: "Failed to test mapping" });
    }
  });

  // Entity Resolution Routes
  
  // GET /api/admin/entity-resolution/duplicates - Get potential duplicates
  app.get("/api/admin/entity-resolution/duplicates", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { threshold = '75', search } = req.query;
      
      const duplicates = generateDuplicateGroups(5, parseInt(threshold as string));
      
      res.json(duplicates);
    } catch (error) {
      console.error("Error fetching duplicates:", error);
      res.status(500).json({ error: "Failed to fetch duplicates" });
    }
  });

  // POST /api/admin/entity-resolution/merge - Merge entities
  app.post("/api/admin/entity-resolution/merge", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { entityIds, masterId } = req.body;
      
      console.log(`Merging entities ${entityIds.join(', ')} into ${masterId}`);
      
      res.json({ 
        success: true, 
        message: `Successfully merged ${entityIds.length} entities`,
        mergedId: masterId
      });
    } catch (error) {
      console.error("Error merging entities:", error);
      res.status(500).json({ error: "Failed to merge entities" });
    }
  });

  // GET /api/admin/entity-resolution/history - Get merge history
  app.get("/api/admin/entity-resolution/history", requireAuth, requireAdmin, async (req, res) => {
    try {
      const history = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 86400000),
          action: 'merge',
          entities: ['lead-123', 'lead-456'],
          performedBy: 'admin@example.com'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 172800000),
          action: 'merge',
          entities: ['lead-789', 'lead-012', 'lead-345'],
          performedBy: 'admin@example.com'
        }
      ];
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching merge history:", error);
      res.status(500).json({ error: "Failed to fetch merge history" });
    }
  });

  // GET /api/admin/entity-resolution/stats - Get resolution stats
  app.get("/api/admin/entity-resolution/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = {
        totalEntities: 5432,
        avgMatchQuality: 82.5,
        recentMerges: 15,
        pendingReview: 28
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching resolution stats:", error);
      res.status(500).json({ error: "Failed to fetch resolution stats" });
    }
  });

  // Learning Center Routes
  
  // GET /api/admin/learning/feedback - Get feedback queue
  app.get("/api/admin/learning/feedback", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { status = 'pending' } = req.query;
      
      const feedback = generateFeedbackItems(10, status as string);
      
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  // POST /api/admin/learning/feedback/:id - Apply feedback action
  app.post("/api/admin/learning/feedback/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { action } = req.body;
      
      console.log(`Processing feedback ${id} with action: ${action}`);
      
      res.json({ 
        success: true, 
        message: `Feedback ${action === 'accept' ? 'accepted' : 'rejected'}`,
        feedbackId: id
      });
    } catch (error) {
      console.error("Error processing feedback:", error);
      res.status(500).json({ error: "Failed to process feedback" });
    }
  });

  // GET /api/admin/learning/improvements - Get system improvements
  app.get("/api/admin/learning/improvements", requireAuth, requireAdmin, async (req, res) => {
    try {
      const improvements = [
        {
          id: '1',
          type: 'rule',
          title: 'Enhanced Email Validation',
          description: 'Improved email validation to handle international domains',
          impact: 'high',
          status: 'implemented',
          metrics: {
            accuracyImprovement: 12,
            speedImprovement: 5
          }
        },
        {
          id: '2',
          type: 'model',
          title: 'Revenue Prediction Model v2',
          description: 'Updated ML model for better revenue predictions',
          impact: 'high',
          status: 'testing',
          metrics: {
            accuracyImprovement: 18,
            costReduction: 10
          }
        },
        {
          id: '3',
          type: 'process',
          title: 'Parallel Processing Pipeline',
          description: 'Implement parallel processing for faster enrichment',
          impact: 'medium',
          status: 'proposed'
        }
      ];
      
      res.json(improvements);
    } catch (error) {
      console.error("Error fetching improvements:", error);
      res.status(500).json({ error: "Failed to fetch improvements" });
    }
  });

  // GET /api/admin/learning/ab-tests - Get A/B tests
  app.get("/api/admin/learning/ab-tests", requireAuth, requireAdmin, async (req, res) => {
    try {
      const abTests = [
        {
          id: '1',
          name: 'Industry Classification Rules',
          description: 'Testing new industry classification logic',
          variant_a: { logic: 'keyword-based' },
          variant_b: { logic: 'ml-based' },
          status: 'running',
          startDate: new Date(Date.now() - 7 * 86400000),
          results: {
            variant_a_performance: 78,
            variant_b_performance: 85,
            confidence: 92
          }
        },
        {
          id: '2',
          name: 'UCC Risk Scoring',
          description: 'Comparing risk scoring algorithms',
          variant_a: { algorithm: 'weighted-average' },
          variant_b: { algorithm: 'neural-network' },
          status: 'completed',
          startDate: new Date(Date.now() - 30 * 86400000),
          endDate: new Date(Date.now() - 2 * 86400000),
          results: {
            variant_a_performance: 72,
            variant_b_performance: 81,
            winner: 'b',
            confidence: 98
          }
        }
      ];
      
      res.json(abTests);
    } catch (error) {
      console.error("Error fetching A/B tests:", error);
      res.status(500).json({ error: "Failed to fetch A/B tests" });
    }
  });

  // GET /api/admin/learning/trends - Get performance trends
  app.get("/api/admin/learning/trends", requireAuth, requireAdmin, async (req, res) => {
    try {
      const trends = {
        accuracy: generateTrendData(30, 'accuracy'),
        feedbackVolume: generateTrendData(30, 'feedback')
      };
      
      res.json(trends);
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trends" });
    }
  });

  // GET /api/admin/learning/stats - Get learning stats
  app.get("/api/admin/learning/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = {
        pendingFeedback: 23,
        accuracyImprovement: 8.5,
        modelVersion: 'v2.3.1',
        lastTraining: new Date(Date.now() - 3 * 86400000),
        precision: 89,
        recall: 86,
        f1Score: 87.5,
        learningRate: 0.001
      };
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching learning stats:", error);
      res.status(500).json({ error: "Failed to fetch learning stats" });
    }
  });

  // POST /api/admin/learning/retrain - Trigger model retraining
  app.post("/api/admin/learning/retrain", requireAuth, requireAdmin, async (req, res) => {
    try {
      console.log("Initiating model retraining...");
      
      // In a real implementation, this would trigger an async job
      res.json({ 
        success: true, 
        message: "Model retraining initiated",
        jobId: `retrain-${Date.now()}`
      });
    } catch (error) {
      console.error("Error initiating retraining:", error);
      res.status(500).json({ error: "Failed to initiate retraining" });
    }
  });
}

// Helper functions to generate mock data

function generateCostData(days: number) {
  const data = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    data.push({
      date: new Date(now - i * 86400000),
      aiCost: Math.random() * 50 + 10,
      apiCost: Math.random() * 30 + 5,
      storageCost: Math.random() * 10 + 2
    });
  }
  return data;
}

function generateRecentProcessing(count: number) {
  const explanations = [];
  for (let i = 0; i < count; i++) {
    explanations.push({
      id: `proc-${i}`,
      leadId: `lead-${1000 + i}`,
      timestamp: new Date(Date.now() - i * 3600000),
      confidence: Math.floor(Math.random() * 40) + 60,
      stages: ['ingest', 'normalize', 'resolve', 'enrich', 'score', 'export'],
      explanation: `Processed lead with ${Math.floor(Math.random() * 10) + 5} enrichment sources`,
      duration: Math.floor(Math.random() * 500) + 100,
      score: Math.floor(Math.random() * 40) + 60,
      tierBreakdown: `T0: ${Math.floor(Math.random() * 10)}, T1: ${Math.floor(Math.random() * 20)}, T2: ${Math.floor(Math.random() * 5)}`
    });
  }
  return explanations;
}

function generateProcessingHistory(count: number) {
  const history = [];
  for (let i = 0; i < count; i++) {
    history.push({
      id: `hist-${i}`,
      leadId: `lead-${2000 + i}`,
      sessionId: `session-${Date.now()}-${i}`,
      timestamp: new Date(Date.now() - i * 7200000),
      duration: Math.floor(Math.random() * 1000) + 200,
      stages: [
        { name: 'ingest', status: 'completed', confidence: 100, timestamp: new Date() },
        { name: 'normalize', status: 'completed', confidence: 95, timestamp: new Date() },
        { name: 'resolve', status: 'completed', confidence: 88, timestamp: new Date() },
        { name: 'enrich', status: 'completed', confidence: 82, timestamp: new Date() },
        { name: 'score', status: 'completed', confidence: 90, timestamp: new Date() },
      ],
      confidence: 85 + Math.floor(Math.random() * 15),
      score: 60 + Math.floor(Math.random() * 40),
      tierUsage: { tier0: 8, tier1: 15, tier2: 3 },
      rulesExecuted: ['rule-1', 'rule-2', 'rule-3'],
      transformations: [],
      lineage: [],
      flags: []
    });
  }
  return history;
}

function generateDetailedHistory(leadId: string) {
  return {
    id: `hist-detail-${leadId}`,
    leadId,
    sessionId: `session-${Date.now()}`,
    timestamp: new Date(),
    duration: 845,
    stages: [
      {
        name: 'ingest',
        status: 'completed',
        confidence: 100,
        timestamp: new Date(),
        duration: 50,
        decision: 'Successfully ingested lead data'
      },
      {
        name: 'normalize',
        status: 'completed',
        confidence: 95,
        timestamp: new Date(),
        duration: 120,
        decision: 'Normalized 15 fields',
        transformations: [
          { field: 'phone', from: '555-1234', to: '+1 (555) 123-4567' }
        ]
      },
      {
        name: 'resolve',
        status: 'completed',
        confidence: 88,
        timestamp: new Date(),
        duration: 200,
        decision: 'Resolved entity with 88% confidence'
      },
      {
        name: 'enrich',
        status: 'completed',
        confidence: 82,
        timestamp: new Date(),
        duration: 350,
        decision: 'Enriched from 3 data sources'
      },
      {
        name: 'score',
        status: 'completed',
        confidence: 90,
        timestamp: new Date(),
        duration: 125,
        decision: 'Final score calculated: 78/100'
      }
    ],
    confidence: 88,
    score: 78,
    tierUsage: { tier0: 8, tier1: 15, tier2: 3 },
    rulesExecuted: ['revenue-validation', 'email-enrichment', 'industry-classification'],
    transformations: [
      { field: 'businessName', before: 'ACME CO', after: 'Acme Company Inc.', stage: 'normalize', rule: 'name-normalization' },
      { field: 'revenue', before: null, after: 1500000, stage: 'enrich', rule: 'revenue-enrichment' }
    ],
    lineage: [
      { stage: 'ingest', inputFields: ['raw_data'], outputFields: ['parsed_fields'], source: 'CSV Upload' },
      { stage: 'normalize', inputFields: ['parsed_fields'], outputFields: ['normalized_fields'], source: 'System' },
      { stage: 'enrich', inputFields: ['normalized_fields'], outputFields: ['enriched_fields'], source: 'External APIs' }
    ],
    flags: [],
    errors: []
  };
}

function generateRules(count: number) {
  const rules = [];
  const types = ['validation', 'scoring', 'transformation', 'enrichment', 'alert'];
  
  for (let i = 0; i < count; i++) {
    rules.push({
      id: `rule-${i}`,
      name: `Rule ${i + 1}`,
      description: `Description for rule ${i + 1}`,
      type: types[i % types.length],
      precedence: Math.floor(Math.random() * 100),
      priority: Math.floor(Math.random() * 100),
      enabled: Math.random() > 0.2,
      condition: { field: 'revenue', operator: '>', value: 100000 },
      actions: [{ type: 'set_field', field: 'tier', value: 'premium' }],
      tags: ['auto-generated'],
      createdAt: new Date(Date.now() - Math.random() * 30 * 86400000),
      updatedAt: new Date(Date.now() - Math.random() * 7 * 86400000),
      version: 1
    });
  }
  
  return rules;
}

function generateDuplicateGroups(count: number, threshold: number) {
  const groups = [];
  
  for (let i = 0; i < count; i++) {
    const confidence = threshold + Math.floor(Math.random() * (100 - threshold));
    groups.push({
      id: `group-${i}`,
      entities: [
        {
          id: `entity-${i}-1`,
          businessName: `Test Company ${i}`,
          email: `contact${i}@example.com`,
          phone: `555-${1000 + i}`,
          address: `${100 + i} Main St`,
          score: 75 + Math.floor(Math.random() * 25),
          createdAt: new Date(Date.now() - Math.random() * 30 * 86400000),
          matchPercentage: confidence
        },
        {
          id: `entity-${i}-2`,
          businessName: `Test Co ${i}`,
          email: `info${i}@example.com`,
          phone: `555-${1000 + i}`,
          address: `${100 + i} Main Street`,
          score: 70 + Math.floor(Math.random() * 30),
          createdAt: new Date(Date.now() - Math.random() * 30 * 86400000),
          matchPercentage: confidence - 5
        }
      ],
      confidence,
      matchedFields: ['phone', 'address'],
      suggestedMaster: `entity-${i}-1`
    });
  }
  
  return groups;
}

function generateFeedbackItems(count: number, status: string) {
  const items = [];
  
  for (let i = 0; i < count; i++) {
    items.push({
      id: `feedback-${i}`,
      leadId: `lead-${3000 + i}`,
      field: ['revenue', 'industry', 'email', 'phone'][i % 4],
      originalValue: 'Original Value',
      correctedValue: 'Corrected Value',
      explanation: 'Operator provided correction based on verified information',
      confidence: 75 + Math.floor(Math.random() * 25),
      status: status === 'all' ? ['pending', 'accepted', 'rejected'][i % 3] : status,
      submittedBy: `operator${i % 3 + 1}@example.com`,
      submittedAt: new Date(Date.now() - i * 3600000),
      reviewedBy: status !== 'pending' ? 'admin@example.com' : undefined,
      reviewedAt: status !== 'pending' ? new Date() : undefined
    });
  }
  
  return items;
}

function generateTrendData(days: number, type: string) {
  const data = [];
  const now = Date.now();
  
  for (let i = days - 1; i >= 0; i--) {
    if (type === 'accuracy') {
      data.push({
        date: new Date(now - i * 86400000),
        accuracy: 75 + Math.random() * 20,
        baseline: 80
      });
    } else if (type === 'feedback') {
      data.push({
        date: new Date(now - i * 86400000),
        accepted: Math.floor(Math.random() * 20) + 5,
        rejected: Math.floor(Math.random() * 10) + 2,
        pending: Math.floor(Math.random() * 15) + 3
      });
    }
  }
  
  return data;
}