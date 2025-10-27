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