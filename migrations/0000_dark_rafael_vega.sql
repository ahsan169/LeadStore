CREATE TABLE "ai_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"executive_summary" text,
	"segments" jsonb,
	"risk_flags" jsonb,
	"outreach_angles" jsonb,
	"generated_by" text DEFAULT 'openai' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" varchar NOT NULL,
	"lead_batch_id" varchar NOT NULL,
	"matched_leads" integer DEFAULT 0 NOT NULL,
	"lead_ids" text[],
	"notification_sent" boolean DEFAULT false NOT NULL,
	"viewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"purchase_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"lead_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"key_name" text NOT NULL,
	"key_hash" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"status_code" integer NOT NULL,
	"response_time" integer,
	"request_body" jsonb,
	"response_size" integer,
	"ip_address" text,
	"user_agent" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_discounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tier_name" text NOT NULL,
	"min_quantity" integer NOT NULL,
	"max_quantity" integer,
	"discount_percentage" numeric(5, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"total_leads" integer NOT NULL,
	"original_price" numeric(10, 2) NOT NULL,
	"discount_applied" numeric(5, 2) NOT NULL,
	"final_price" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"criteria" jsonb,
	"lead_ids" text[],
	"stripe_payment_intent_id" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"approved_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"template_name" text NOT NULL,
	"template_type" text NOT NULL,
	"subject" text,
	"content" text NOT NULL,
	"variables" jsonb,
	"category" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"purchase_id" varchar NOT NULL,
	"campaign_name" text NOT NULL,
	"template_id" varchar NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"company" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"balance_before" numeric(10, 2) NOT NULL,
	"balance_after" numeric(10, 2) NOT NULL,
	"description" text,
	"reference_id" text,
	"stripe_payment_intent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"lifetime_purchased" numeric(10, 2) DEFAULT '0' NOT NULL,
	"lifetime_used" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_purchase_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_integrations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"crm_type" text NOT NULL,
	"api_key" text NOT NULL,
	"api_url" text,
	"mapping_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_sync_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" varchar NOT NULL,
	"purchase_id" varchar,
	"lead_ids" text[],
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_ingestion_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"downloaded_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "enhanced_verification" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"email_verification" jsonb,
	"email_score" integer,
	"email_status" text,
	"domain_status" text,
	"mx_records" boolean,
	"smtp_check" boolean,
	"email_disposable" boolean,
	"email_webmail" boolean,
	"email_accept_all" boolean,
	"phone_verification" jsonb,
	"phone_valid" boolean,
	"phone_line_type" text,
	"phone_carrier" text,
	"phone_location" text,
	"phone_country_code" text,
	"phone_location_data" jsonb,
	"phone_risk_score" integer,
	"overall_confidence_score" numeric(5, 2),
	"confidence_breakdown" jsonb,
	"verification_status" text,
	"cached_until" timestamp,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"hunter_credits_used" integer DEFAULT 0,
	"numverify_credits_used" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_costs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar,
	"service" text NOT NULL,
	"api_call" text NOT NULL,
	"cost" numeric(10, 6) NOT NULL,
	"response" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrichment_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar,
	"batch_id" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"enrichment_options" jsonb,
	"source" text NOT NULL,
	"user_id" varchar,
	"result" jsonb,
	"error" text,
	"api_call_count" integer DEFAULT 0 NOT NULL,
	"total_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "insight_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"industry" text,
	"region" text,
	"affected_leads" jsonb,
	"affected_count" integer,
	"trigger_condition" jsonb,
	"threshold_value" numeric(10, 2),
	"actual_value" numeric(10, 2),
	"recommendations" jsonb,
	"action_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_type" text NOT NULL,
	"cache_key" text,
	"executive_summary" text,
	"key_insights" jsonb,
	"metrics" jsonb,
	"recommendations" jsonb,
	"period" text,
	"date_range" jsonb,
	"filters" jsonb,
	"data" jsonb,
	"charts" jsonb,
	"tables" jsonb,
	"report_status" text DEFAULT 'draft' NOT NULL,
	"generated_by" text NOT NULL,
	"generated_for" varchar,
	"generation_time_ms" integer,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_activation_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activation_id" text NOT NULL,
	"lead_ids" text[] NOT NULL,
	"user_id" varchar,
	"steps" jsonb NOT NULL,
	"overall_status" text NOT NULL,
	"enrichment_results" jsonb,
	"campaign_id" varchar,
	"crm_export_results" jsonb,
	"quick_action_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"execution_time_ms" integer,
	CONSTRAINT "lead_activation_history_activation_id_unique" UNIQUE("activation_id")
);
--> statement-breakpoint
CREATE TABLE "lead_aging" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_batch_id" varchar NOT NULL,
	"age_in_days" integer NOT NULL,
	"freshness_category" text NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"average_freshness_score" numeric(5, 2),
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"alert_name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_triggered_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lead_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"average_quality_score" numeric(5, 2),
	"status" text DEFAULT 'processing' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_dedupe_candidates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id_1" varchar,
	"lead_id_2" varchar,
	"match_type" text NOT NULL,
	"match_score" numeric(3, 2) NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolution" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_enrichment" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"enriched_data" jsonb NOT NULL,
	"enrichment_source" text DEFAULT 'mock' NOT NULL,
	"confidence_score" numeric(5, 2) NOT NULL,
	"social_profiles" jsonb,
	"company_details" jsonb,
	"industry_details" jsonb,
	"contact_info" jsonb,
	"enriched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_enrichment_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "lead_performance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"contacted_at" timestamp,
	"qualified_at" timestamp,
	"closed_at" timestamp,
	"deal_amount" numeric(12, 2),
	"notes" text,
	"updated_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_predictions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"time_to_close_prediction" integer,
	"time_to_close_confidence" numeric(5, 2),
	"optimal_contact_time" jsonb,
	"deal_size_prediction" numeric(12, 2),
	"deal_size_range" jsonb,
	"deal_size_confidence" numeric(5, 2),
	"success_probability" numeric(5, 4),
	"funding_likelihood" numeric(5, 4),
	"default_risk" numeric(5, 4),
	"expected_roi" numeric(10, 2),
	"risk_adjusted_roi" numeric(10, 2),
	"payback_period" integer,
	"lifecycle_stage" text,
	"stage_transition_probability" jsonb,
	"churn_risk" numeric(5, 4),
	"next_best_actions" jsonb,
	"recommended_channels" jsonb,
	"recommended_offers" jsonb,
	"market_position" jsonb,
	"competitive_analysis" jsonb,
	"market_timing" text,
	"model_version" text,
	"overall_confidence" numeric(5, 2),
	"factors_analyzed" jsonb,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_scoring_models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_name" text NOT NULL,
	"model_version" text NOT NULL,
	"features" jsonb NOT NULL,
	"accuracy" numeric(5, 2),
	"trained_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"precision" numeric(5, 2),
	"recall" numeric(5, 2),
	"f1_score" numeric(5, 2),
	"training_data_size" integer,
	"model_parameters" jsonb,
	"performance_metrics" jsonb,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" varchar NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"secondary_phone" text,
	"industry" text,
	"annual_revenue" text,
	"requested_amount" text,
	"time_in_business" text,
	"credit_score" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"freshness_score" integer DEFAULT 100 NOT NULL,
	"daily_bank_deposits" boolean DEFAULT false,
	"previous_mca_history" text DEFAULT 'none',
	"urgency_level" text DEFAULT 'exploring',
	"state_code" text,
	"lead_age" integer DEFAULT 0,
	"exclusivity_status" text DEFAULT 'non_exclusive',
	"quality_score" integer DEFAULT 0 NOT NULL,
	"tier" text,
	"sold" boolean DEFAULT false NOT NULL,
	"sold_to" varchar,
	"sold_at" timestamp,
	"is_enriched" boolean DEFAULT false NOT NULL,
	"linkedin_url" text,
	"website_url" text,
	"company_size" text,
	"year_founded" integer,
	"naics_code" text,
	"estimated_revenue" integer,
	"revenue_confidence" text,
	"employee_count" integer,
	"years_in_business" integer,
	"owner_background" text,
	"research_insights" jsonb,
	"last_enriched_at" timestamp,
	"enrichment_confidence" integer DEFAULT 0,
	"enrichment_sources" jsonb,
	"enrichment_status" text DEFAULT 'pending',
	"full_address" text,
	"business_description" text,
	"city" text,
	"ml_quality_score" integer DEFAULT 0,
	"conversion_probability" numeric(5, 4),
	"expected_deal_size" numeric(12, 2),
	"scoring_factors" jsonb,
	"intelligence_score" integer DEFAULT 0,
	"quality_sub_score" integer DEFAULT 0,
	"freshness_sub_score" integer DEFAULT 0,
	"risk_sub_score" integer DEFAULT 0,
	"opportunity_sub_score" integer DEFAULT 0,
	"confidence_sub_score" integer DEFAULT 0,
	"intelligence_metadata" jsonb,
	"intelligence_calculated_at" timestamp,
	"last_activated_at" timestamp,
	"activation_count" integer DEFAULT 0 NOT NULL,
	"master_enrichment_score" integer DEFAULT 0,
	"data_completeness" jsonb,
	"enrichment_cascade_depth" integer DEFAULT 0,
	"data_lineage" jsonb,
	"last_master_enrichment_at" timestamp,
	"ucc_number" text,
	"filing_date" timestamp,
	"filing_type" text,
	"expire_date" timestamp,
	"amend_date" timestamp,
	"secured_parties" text,
	"lender_count" integer,
	"filing_count" integer,
	"primary_lender_type" text,
	"has_multiple_mca" boolean DEFAULT false,
	"active_positions" integer,
	"terminated_positions" integer,
	"last_filing_date" timestamp,
	"filing_span_days" integer,
	"stacking_risk" text,
	"business_maturity" text,
	"ucc_intelligence" jsonb,
	"total_ucc_debt" numeric(15, 2),
	"active_ucc_count" integer DEFAULT 0,
	"last_ucc_filing_date" timestamp,
	"ucc_risk_level" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark_type" text NOT NULL,
	"category" text NOT NULL,
	"avg_conversion_rate" numeric(5, 4),
	"avg_deal_size" numeric(12, 2),
	"avg_time_to_close" integer,
	"avg_credit_score" integer,
	"avg_annual_revenue" numeric(12, 2),
	"top_quartile_conversion" numeric(5, 4),
	"top_quartile_deal_size" numeric(12, 2),
	"bottom_quartile_conversion" numeric(5, 4),
	"bottom_quartile_deal_size" numeric(12, 2),
	"avg_default_rate" numeric(5, 4),
	"avg_payback_period" integer,
	"risk_profile" jsonb,
	"market_maturity" text,
	"competition_level" text,
	"growth_rate" numeric(5, 2),
	"historical_trends" jsonb,
	"seasonal_patterns" jsonb,
	"sample_size" integer,
	"confidence" numeric(5, 2),
	"last_updated" timestamp NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_type" text NOT NULL,
	"industry" text,
	"region" text,
	"timeframe" text,
	"trend_direction" text,
	"trend_strength" numeric(5, 2),
	"demand_index" numeric(5, 2),
	"supply_index" numeric(5, 2),
	"competition_density" numeric(5, 2),
	"saturation_level" numeric(5, 2),
	"forecasted_demand" jsonb,
	"seasonal_factors" jsonb,
	"optimal_time_windows" jsonb,
	"geographic_hotspots" jsonb,
	"regional_opportunities" jsonb,
	"historical_data" jsonb,
	"benchmarks" jsonb,
	"confidence" numeric(5, 2),
	"data_points" integer,
	"analysis_metadata" jsonb,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "popular_searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_query" text NOT NULL,
	"filters" jsonb NOT NULL,
	"search_count" integer DEFAULT 1 NOT NULL,
	"last_searched_at" timestamp DEFAULT now() NOT NULL,
	"weekly_count" integer DEFAULT 1 NOT NULL,
	"monthly_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "popular_searches_search_query_unique" UNIQUE("search_query")
);
--> statement-breakpoint
CREATE TABLE "pricing_strategies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_price" numeric(10, 2) NOT NULL,
	"exclusive_multiplier" numeric(3, 1) DEFAULT '2.5' NOT NULL,
	"volume_discounts" jsonb,
	"industry_premiums" jsonb,
	"geographic_premiums" jsonb,
	"age_discounts" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_tiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"price" integer NOT NULL,
	"lead_count" integer NOT NULL,
	"min_quality" integer NOT NULL,
	"max_quality" integer NOT NULL,
	"features" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_tiers_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tier" text NOT NULL,
	"lead_count" integer NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"lead_ids" text[],
	"download_url" text,
	"download_url_expiry" timestamp,
	"total_contacted" integer DEFAULT 0 NOT NULL,
	"total_qualified" integer DEFAULT 0 NOT NULL,
	"total_closed" integer DEFAULT 0 NOT NULL,
	"total_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"roi" numeric(10, 2),
	"guarantee_expires_at" timestamp,
	"total_replacements" integer DEFAULT 0 NOT NULL,
	"replacement_credits" integer DEFAULT 0 NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_guarantee" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"issue_type" text NOT NULL,
	"issue_description" text NOT NULL,
	"evidence_data" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"replacement_lead_id" varchar,
	"resolved_at" timestamp,
	"resolved_by" varchar,
	"resolution_notes" text,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_data_dumps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"path" text NOT NULL,
	"record_count" integer NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"search_name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_by" text,
	"sort_order" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "search_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"search_id" varchar,
	"search_query" text NOT NULL,
	"filters" jsonb NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"execution_time" integer,
	"search_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_suggestions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"suggestion_text" text NOT NULL,
	"suggestion_reason" text,
	"filters" jsonb NOT NULL,
	"score" numeric(5, 2),
	"dismissed" boolean DEFAULT false NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "smart_searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"search_name" text,
	"search_query" text,
	"filters" jsonb NOT NULL,
	"search_mode" text NOT NULL,
	"result_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_notifications" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "staging_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"source" text NOT NULL,
	"raw_id" text NOT NULL,
	"business_name" text,
	"owner_name" text,
	"legal_name" text,
	"aliases" text[],
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"phones" text[],
	"emails" text[],
	"domains" text[],
	"confidence" numeric(3, 2) DEFAULT '0.5' NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"monthly_price" integer NOT NULL,
	"monthly_leads" integer NOT NULL,
	"price_per_additional_lead" numeric(10, 2),
	"features" text[] NOT NULL,
	"min_quality_score" integer DEFAULT 60 NOT NULL,
	"max_quality_score" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tier" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ucc_filings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar,
	"debtor_name" text NOT NULL,
	"secured_party" text NOT NULL,
	"filing_date" timestamp NOT NULL,
	"file_number" text NOT NULL,
	"collateral_description" text,
	"loan_amount" integer,
	"filing_type" text,
	"jurisdiction" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ucc_intelligence" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar,
	"filing_id" varchar,
	"ai_analysis" jsonb NOT NULL,
	"debt_stacking_score" integer,
	"refinancing_probability" numeric(5, 4),
	"business_growth_indicator" text,
	"risk_level" text,
	"estimated_total_debt" numeric(12, 2),
	"debt_to_revenue_ratio" numeric(5, 2),
	"mca_approval_likelihood" numeric(5, 4),
	"business_health_score" integer,
	"financing_type" text,
	"industry_insights" jsonb,
	"entity_relationships" jsonb,
	"ownership_structure" jsonb,
	"lender_network" jsonb,
	"filing_patterns" jsonb,
	"anomalies" jsonb,
	"analysis_confidence" numeric(5, 2),
	"data_quality_score" numeric(5, 2),
	"recommendations" jsonb,
	"warning_flags" jsonb,
	"analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ucc_monitoring_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"action_required" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ucc_relationships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id_a" varchar NOT NULL,
	"lead_id_b" varchar NOT NULL,
	"relationship_type" text NOT NULL,
	"relationship_strength" numeric(5, 2),
	"matching_criteria" jsonb,
	"confidence_score" numeric(5, 2),
	"common_filings" jsonb,
	"common_lenders" jsonb,
	"business_relationship" text,
	"risk_propagation" numeric(5, 2),
	"graph_distance" integer,
	"cluster_group" text,
	"discovered_by" text,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ucc_state_formats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_code" text NOT NULL,
	"state_name" text NOT NULL,
	"format_version" text DEFAULT '1.0.0' NOT NULL,
	"column_mappings" jsonb NOT NULL,
	"date_format" text,
	"filing_number_pattern" text,
	"additional_fields" jsonb,
	"collateral_codes" jsonb,
	"filing_types" jsonb,
	"continuation_rules" jsonb,
	"characteristics" jsonb,
	"parsing_hints" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ucc_state_formats_state_code_unique" UNIQUE("state_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"row_number" integer NOT NULL,
	"lead_data" jsonb NOT NULL,
	"status" text NOT NULL,
	"verification_score" integer DEFAULT 0 NOT NULL,
	"phone_validation" jsonb,
	"email_validation" jsonb,
	"business_name_validation" jsonb,
	"owner_name_validation" jsonb,
	"address_validation" jsonb,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_type" text,
	"duplicate_lead_id" varchar,
	"issues" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"warnings" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"selected_for_import" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uploaded_by" varchar NOT NULL,
	"filename" text NOT NULL,
	"file_buffer" text,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"verified_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"strictness_level" text DEFAULT 'moderate' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivery_at" timestamp,
	"last_delivery_status" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_batch_id_lead_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."lead_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_lead_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."lead_alerts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_lead_batch_id_lead_batches_id_fk" FOREIGN KEY ("lead_batch_id") REFERENCES "public"."lead_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_orders" ADD CONSTRAINT "bulk_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_campaign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_integrations" ADD CONSTRAINT "crm_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_log" ADD CONSTRAINT "crm_sync_log_integration_id_crm_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."crm_integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sync_log" ADD CONSTRAINT "crm_sync_log_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_history" ADD CONSTRAINT "download_history_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_history" ADD CONSTRAINT "download_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhanced_verification" ADD CONSTRAINT "enhanced_verification_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_costs" ADD CONSTRAINT "enrichment_costs_job_id_enrichment_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."enrichment_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_alerts" ADD CONSTRAINT "insight_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_reports" ADD CONSTRAINT "insight_reports_generated_for_users_id_fk" FOREIGN KEY ("generated_for") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activation_history" ADD CONSTRAINT "lead_activation_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_aging" ADD CONSTRAINT "lead_aging_lead_batch_id_lead_batches_id_fk" FOREIGN KEY ("lead_batch_id") REFERENCES "public"."lead_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_alerts" ADD CONSTRAINT "lead_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_batches" ADD CONSTRAINT "lead_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_dedupe_candidates" ADD CONSTRAINT "lead_dedupe_candidates_lead_id_1_leads_id_fk" FOREIGN KEY ("lead_id_1") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_dedupe_candidates" ADD CONSTRAINT "lead_dedupe_candidates_lead_id_2_leads_id_fk" FOREIGN KEY ("lead_id_2") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_dedupe_candidates" ADD CONSTRAINT "lead_dedupe_candidates_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_enrichment" ADD CONSTRAINT "lead_enrichment_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_performance" ADD CONSTRAINT "lead_performance_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_performance" ADD CONSTRAINT "lead_performance_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_performance" ADD CONSTRAINT "lead_performance_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_predictions" ADD CONSTRAINT "lead_predictions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scoring_models" ADD CONSTRAINT "lead_scoring_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_batch_id_lead_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."lead_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sold_to_users_id_fk" FOREIGN KEY ("sold_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_guarantee" ADD CONSTRAINT "quality_guarantee_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_guarantee" ADD CONSTRAINT "quality_guarantee_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_guarantee" ADD CONSTRAINT "quality_guarantee_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_guarantee" ADD CONSTRAINT "quality_guarantee_replacement_lead_id_leads_id_fk" FOREIGN KEY ("replacement_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_guarantee" ADD CONSTRAINT "quality_guarantee_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_search_id_smart_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."smart_searches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_suggestions" ADD CONSTRAINT "search_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_searches" ADD CONSTRAINT "smart_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_filings" ADD CONSTRAINT "ucc_filings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_intelligence" ADD CONSTRAINT "ucc_intelligence_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_intelligence" ADD CONSTRAINT "ucc_intelligence_filing_id_ucc_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."ucc_filings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_monitoring_alerts" ADD CONSTRAINT "ucc_monitoring_alerts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_monitoring_alerts" ADD CONSTRAINT "ucc_monitoring_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_relationships" ADD CONSTRAINT "ucc_relationships_lead_id_a_leads_id_fk" FOREIGN KEY ("lead_id_a") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ucc_relationships" ADD CONSTRAINT "ucc_relationships_lead_id_b_leads_id_fk" FOREIGN KEY ("lead_id_b") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_session_id_verification_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."verification_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_duplicate_lead_id_leads_id_fk" FOREIGN KEY ("duplicate_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;