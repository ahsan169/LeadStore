-- Create master_database_cache table if it doesn't exist
CREATE TABLE IF NOT EXISTS "master_database_cache" (
  "id" serial PRIMARY KEY,
  "entity_id" varchar(255) UNIQUE NOT NULL,
  "business_data" jsonb NOT NULL DEFAULT '{}',
  "search_indexes" jsonb DEFAULT '{}',
  "completeness" varchar(10) DEFAULT '0',
  "data_quality" varchar(10) DEFAULT '0',
  "last_verified" timestamp DEFAULT now(),
  "sources" text[] DEFAULT ARRAY[]::text[],
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Create indexes for efficient searching
CREATE INDEX IF NOT EXISTS idx_master_database_cache_entity_id ON master_database_cache(entity_id);
CREATE INDEX IF NOT EXISTS idx_master_database_cache_business_name ON master_database_cache((business_data->>'businessName'));
CREATE INDEX IF NOT EXISTS idx_master_database_cache_owner_name ON master_database_cache((business_data->>'ownerName'));
CREATE INDEX IF NOT EXISTS idx_master_database_cache_phone ON master_database_cache((business_data->>'phone'));
CREATE INDEX IF NOT EXISTS idx_master_database_cache_state ON master_database_cache((business_data->>'state'));
CREATE INDEX IF NOT EXISTS idx_master_database_cache_completeness ON master_database_cache(completeness);