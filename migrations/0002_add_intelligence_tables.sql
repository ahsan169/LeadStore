-- Add intelligence_decisions table for storing brain decisions
CREATE TABLE IF NOT EXISTS intelligence_decisions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id VARCHAR REFERENCES leads(id) NOT NULL,
  strategy TEXT NOT NULL, -- 'minimal', 'standard', 'comprehensive', 'maximum'
  priority INTEGER NOT NULL, -- 1-10
  services TEXT[], -- Services selected for enrichment
  estimated_cost DECIMAL(10, 4) NOT NULL,
  actual_cost DECIMAL(10, 4),
  confidence DECIMAL(5, 4) NOT NULL, -- 0.0000-1.0000
  reasoning TEXT NOT NULL,
  skip_reasons TEXT[],
  execution_time INTEGER, -- milliseconds
  success BOOLEAN,
  error_message TEXT,
  result_metrics JSONB, -- Detailed metrics about the decision outcome
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add learned_patterns table for ML pattern recognition
CREATE TABLE IF NOT EXISTS learned_patterns (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL, -- 'field_mapping', 'synonym', 'entity_alias', 'extraction_rule', 'classification_rule', 'threshold'
  pattern_category TEXT, -- 'business_name', 'phone', 'email', 'industry', etc.
  pattern_value JSONB NOT NULL, -- The actual pattern (could be regex, mapping, rule, etc.)
  description TEXT,
  examples JSONB, -- Examples of where this pattern was observed
  confidence DECIMAL(5, 2) NOT NULL DEFAULT 0.00, -- 0-100
  occurrences INTEGER NOT NULL DEFAULT 1, -- Times this pattern has been seen
  success_rate DECIMAL(5, 4), -- 0-1 success rate when applied
  usage_count INTEGER NOT NULL DEFAULT 0, -- Times this pattern has been used
  last_used TIMESTAMP,
  source TEXT, -- Where this pattern came from: 'system', 'user_feedback', 'ai_learning'
  metadata JSONB, -- Additional metadata about the pattern
  is_active BOOLEAN NOT NULL DEFAULT true, -- Whether this pattern should be used
  created_by VARCHAR REFERENCES users(id),
  approved_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_intelligence_decisions_lead_id ON intelligence_decisions(lead_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_decisions_created_at ON intelligence_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_pattern_type ON learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_pattern_category ON learned_patterns(pattern_category);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_is_active ON learned_patterns(is_active);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON learned_patterns(confidence);