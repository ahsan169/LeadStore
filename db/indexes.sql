-- Performance indexes for advanced filtering on leads table
-- Run this script after the tables are created to optimize query performance

-- Basic filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_quality_score ON leads(quality_score);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
CREATE INDEX IF NOT EXISTS idx_leads_state_code ON leads(state_code);
CREATE INDEX IF NOT EXISTS idx_leads_sold ON leads(sold);
CREATE INDEX IF NOT EXISTS idx_leads_batch_id ON leads(batch_id);

-- Financial filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_annual_revenue ON leads(annual_revenue);
CREATE INDEX IF NOT EXISTS idx_leads_credit_score ON leads(credit_score);

-- Business filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_time_in_business ON leads(time_in_business);
CREATE INDEX IF NOT EXISTS idx_leads_company_size ON leads(company_size);
CREATE INDEX IF NOT EXISTS idx_leads_year_founded ON leads(year_founded);

-- Status filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_exclusivity_status ON leads(exclusivity_status);
CREATE INDEX IF NOT EXISTS idx_leads_is_enriched ON leads(is_enriched);
CREATE INDEX IF NOT EXISTS idx_leads_lead_age ON leads(lead_age);
CREATE INDEX IF NOT EXISTS idx_leads_urgency_level ON leads(urgency_level);
CREATE INDEX IF NOT EXISTS idx_leads_previous_mca ON leads(previous_mca_history);

-- Advanced filter indexes
CREATE INDEX IF NOT EXISTS idx_leads_naics_code ON leads(naics_code);
CREATE INDEX IF NOT EXISTS idx_leads_daily_deposits ON leads(daily_bank_deposits);

-- Combined indexes for common filter combinations
CREATE INDEX IF NOT EXISTS idx_leads_sold_quality ON leads(sold, quality_score);
CREATE INDEX IF NOT EXISTS idx_leads_state_industry ON leads(state_code, industry);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);

-- Saved searches indexes
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_is_default ON saved_searches(user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_saved_searches_last_used ON saved_searches(last_used_at);

-- Performance indexes for other filtering tables
CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_user_id ON allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_allocations_lead_hash ON allocations(lead_hash);
CREATE INDEX IF NOT EXISTS idx_lead_batches_status ON lead_batches(status);
CREATE INDEX IF NOT EXISTS idx_lead_performance_status ON lead_performance(status);
CREATE INDEX IF NOT EXISTS idx_lead_performance_purchase_id ON lead_performance(purchase_id);

-- ============ PERFORMANCE OPTIMIZATION INDEXES FOR CACHING ============
-- Added for predictive insights engine optimization

-- Indexes for leadPredictions table (caching)
CREATE INDEX IF NOT EXISTS idx_lead_predictions_lead_id ON lead_predictions(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_expires_at ON lead_predictions(expires_at);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_created_at ON lead_predictions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_score ON lead_predictions(conversion_probability DESC);
CREATE INDEX IF NOT EXISTS idx_lead_predictions_combined ON lead_predictions(lead_id, expires_at);

-- Indexes for marketInsights table (caching)
CREATE INDEX IF NOT EXISTS idx_market_insights_cache_key ON market_insights(cache_key);
CREATE INDEX IF NOT EXISTS idx_market_insights_expires_at ON market_insights(expires_at);
CREATE INDEX IF NOT EXISTS idx_market_insights_created_at ON market_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_insights_combined ON market_insights(cache_key, expires_at);

-- Indexes for insightReports table (caching)
CREATE INDEX IF NOT EXISTS idx_insight_reports_type ON insight_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_insight_reports_period ON insight_reports(period);
CREATE INDEX IF NOT EXISTS idx_insight_reports_expires_at ON insight_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_insight_reports_generated_at ON insight_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_reports_status ON insight_reports(report_status);
CREATE INDEX IF NOT EXISTS idx_insight_reports_combined ON insight_reports(report_type, expires_at, report_status);

-- Indexes for leadIntelligence table
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_lead_id ON lead_intelligence(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_score ON lead_intelligence(intelligence_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_calculated_at ON lead_intelligence(calculated_at DESC);

-- Indexes for verification table (caching)
CREATE INDEX IF NOT EXISTS idx_verification_lead_id ON lead_verifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_verification_verified_at ON lead_verifications(verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_status ON lead_verifications(verification_status);

-- Indexes for userPurchases table
CREATE INDEX IF NOT EXISTS idx_user_purchases_user_id ON user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_lead_id ON user_purchases(lead_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_purchased_at ON user_purchases(purchased_at DESC);

-- Indexes for leadViews table
CREATE INDEX IF NOT EXISTS idx_lead_views_lead_id ON lead_views(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_views_user_id ON lead_views(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_views_viewed_at ON lead_views(viewed_at DESC);

-- Indexes for dailyInsights table
CREATE INDEX IF NOT EXISTS idx_daily_insights_date ON daily_insights(insight_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_insights_type ON daily_insights(insight_type);