# Lakefront Leadworks - Intelligent Lead Intelligence Platform

## Overview

A sophisticated AI-powered lead enrichment and verification system for Merchant Cash Advance (MCA) leads. The platform has been transformed from a simple marketplace into an intelligent system that provides real-time verification, predictive insights, and comprehensive lead intelligence scoring. Features simplified 2-tier pricing (Starter $997, Pro $2,997), unified intelligence scoring with 5 sub-scores, real-time API verification using Hunter.io and Numverify, predictive market analysis, and a centralized command center for monitoring all activities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript, using Wouter for client-side routing instead of Next.js

**UI Component System**: Radix UI primitives with Shadcn UI components styled using Tailwind CSS. Design follows a B2B SaaS aesthetic inspired by Stripe's professionalism with a professional blue primary color (HSL: 217 91% 60%) and green accent for quality indicators.

**State Management**: TanStack Query (React Query) for server state management with optimistic updates and automatic cache invalidation. No global client state - relies on server-driven data fetching.

**Form Handling**: React Hook Form with Zod schema validation for type-safe form validation across authentication, lead upload, and payment flows.

**Payment UI**: Stripe Elements integration using `@stripe/react-stripe-js` for PCI-compliant payment form rendering. Payment flow uses Stripe Checkout sessions rather than custom forms where possible.

### Backend Architecture

**Server Framework**: Express.js with TypeScript running on Node.js, serving as both API server and static file server for the React SPA.

**Authentication**: Passport.js with Local Strategy for username/password authentication. Passwords hashed using bcrypt with 10 salt rounds. Session-based authentication using express-session with secure cookies in production.

**Authorization**: Role-based access control (RBAC) with two roles:
- `buyer`: Can purchase leads, view purchase history, download purchased leads
- `admin`: Full access to upload leads, view all customers, access analytics, manage lead batches

**API Design**: RESTful JSON API with routes organized by resource:
- `/api/auth/*` - Authentication endpoints
- `/api/purchases/*` - Purchase management and downloads
- `/api/lead-batches/*` - Admin lead batch operations
- `/api/leads/*` - Lead retrieval by tier
- `/api/webhooks/stripe` - Stripe webhook handler (uses raw body parsing)

**Pricing Logic**: Hardcoded pricing tiers in backend with lead allocation:
- Gold: $500 for 50 leads (quality 60-79)
- Platinum: $1500 for 200 leads (quality 70-89)
- Diamond: $4000 for 600 leads (quality 80-100)
- Elite: Contact sales (custom pricing)

### Data Storage

**Database**: PostgreSQL accessed via Neon serverless driver with WebSocket support for connection pooling

**ORM**: Drizzle ORM for type-safe database queries and schema management. Schema definitions in `shared/schema.ts` include:
- `users` - User accounts with role-based access
- `subscriptions` - Subscription tier tracking (though primarily one-time purchases)
- `leadBatches` - CSV upload metadata and processing status
- `leads` - Individual lead records with quality scores and sold status
- `purchases` - Purchase transactions linked to Stripe payment intents
- `downloadHistory` - Audit trail of lead downloads
- `aiInsights` - Cached AI-generated batch insights

**File Storage**: AWS S3-compatible object storage (configured for Replit Object Storage) for:
- Original CSV uploads
- Fulfilled lead CSVs (per purchase)
- Pre-signed URLs with 24-hour expiration for secure downloads

**Deduplication**: Tracks sold leads via boolean `sold` flag and prevents reselling the same lead twice through database queries filtering available inventory.

### External Dependencies

**Payment Processing**: Stripe API (test mode) using `stripe` Node.js SDK
- Checkout Sessions for payment collection
- Payment Intents for transaction tracking
- Webhooks for payment status updates (endpoint: `/api/webhooks/stripe`)
- Webhook signature verification for security

**AI Insights**: OpenAI GPT-4o-mini for analyzing lead batches
- Generates quality assessments, industry distribution analysis, and recommendations
- Uses aggregated/anonymized data only (no PII sent to OpenAI)
- Insights cached in database to avoid redundant API calls
- Configurable via `OPENAI_API_KEY` and optional `OPENAI_API_BASE_URL` environment variables

**Object Storage**: AWS S3-compatible storage (Replit Object Storage)
- Stores CSV files for uploads and purchase fulfillment
- Generates pre-signed URLs for time-limited secure downloads
- Configured via environment variables: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`

**Email**: References to Resend/SendGrid for transactional emails in original requirements, but not currently implemented in codebase (future enhancement)

### Security Features

**Password Security**: Bcrypt hashing with 10 rounds for all stored passwords

**Session Security**: HTTP-only cookies with secure flag in production, 7-day expiration

**Role Enforcement**: Backend middleware ensures buyers cannot self-register as admins (role forced to "buyer" in registration endpoint)

**Download Security**: Time-limited pre-signed URLs (24-hour expiration) prevent unauthorized access to purchased leads

**Webhook Verification**: Stripe webhook signatures verified before processing payment events

**TCPA Compliance**: UI messaging indicates compliance requirements for lead usage

### Development Tooling

**Build System**: Vite for frontend bundling, esbuild for backend bundling

**Type Safety**: Shared TypeScript types between client and server via `shared/` directory, Zod schemas ensure runtime validation matches compile-time types

**Database Migrations**: Drizzle Kit for schema migrations (push-based workflow)

**Development Server**: Vite dev server with HMR, Express backend in middleware mode for integrated development experience

## Recent Changes

### October 29, 2025 - Enhanced Lead Intelligence System

Successfully transformed the platform into an intelligent lead enrichment and verification system:

**Core Enhancements:**

1. **Unified Lead Intelligence Score** - Consolidated 7 disparate scoring systems into single score with 5 transparent sub-scores:
   - Quality (25%): Data completeness and enrichment
   - Freshness (20%): Lead recency and relevance  
   - Risk (15%): Risk assessment and red flags
   - Opportunity (25%): Business potential and conversion likelihood
   - Confidence (15%): Verification accuracy level

2. **Lead Activation Hub** - Merged CRM integration, campaigns, and enrichment into unified workflow center

3. **Enhanced Verification Service** - Real-time lead verification with:
   - Hunter.io email verification (deliverability, domain quality, MX records)
   - Numverify phone validation (line type, carrier, location)
   - Composite confidence scoring with detailed breakdowns
   - 72-hour smart caching to minimize API costs

4. **Predictive Insights Engine** - Market intelligence with performance optimization:
   - Market trend analysis with 1-hour caching
   - Lead predictions with 6-hour caching  
   - Daily insights generation with 24-hour caching
   - Portfolio optimization recommendations
   - Anomaly detection and market timing signals

5. **Simplified Pricing** - Reduced from 4 tiers to 2 clear options:
   - Starter: $997 (essential features)
   - Pro: $2,997 (full platform access)

**Technical Improvements:**
- Fixed CSP inline style violations causing blank page renders
- Optimized database queries with comprehensive indexing strategy
- Implemented read-first caching patterns preventing cascading recomputation
- Added singleton service instances for consistent cache behavior
- Created background job patterns for heavy analytics operations

**Bug Fixes:**
- Resolved server startup errors from missing database exports
- Fixed command center SQL syntax errors
- Eliminated performance regressions in predictive scoring
- Corrected purchases table schema missing timestamp fields

### October 27, 2025 - Enterprise Features Release

Successfully implemented 11 major enterprise features to make Lakefront Leadworks "the biggest beast in the MCA lead field":

**New Features Implemented:**

1. **Lead Performance Analytics Dashboard** - Real-time metrics, conversion tracking, ROI analysis with interactive charts
2. **CRM Integration Hub** - Seamless integration with Salesforce, HubSpot, Zoho, Pipedrive with OAuth authentication
3. **Smart Lead Matching** - AI-powered real-time alerts when new leads match buyer criteria 
4. **Lead Enrichment Service** - Automatic business data appending from third-party data providers
5. **Advanced Filtering** - 20+ filter criteria with saved searches and bulk export capabilities
6. **Quality Guarantee Program** - Automated lead replacement system for quality issues with dispute management
7. **Lead Freshness Indicators** - Time-based scoring showing lead age and recency with automatic updates
8. **Bulk Operations** - Volume discount calculator and batch processing tools for enterprise customers
9. **Email/SMS Campaign Tools** - Template management and campaign automation with merge tags
10. **Enterprise API v1** - REST API with JWT authentication, rate limiting, webhooks, and comprehensive documentation
11. **ML-Powered Lead Scoring** - Machine learning models for predictive quality scoring with market insights

**Critical Bug Fixes:**
- Fixed server startup issue by moving API endpoints inside registerRoutes function (lines 4696-5292)
- Resolved missing Drizzle ORM `eq` import causing API failures
- Fixed frontend JSON parsing issues in smart-matching.tsx, advanced-filtering.tsx, and ml-scoring.tsx
- Fixed CRM encryption key issue - now uses stable key to ensure credentials remain decryptable after server restarts

**Security Improvements:**
- Implemented stable encryption key management for CRM credentials (development uses fixed key, production requires ENCRYPTION_KEY env var)
- Added role-based access control for all enterprise features
- Secured API endpoints with JWT authentication and rate limiting
- Added webhook signature verification for CRM integrations

**Database Enhancements:**
- Added 10+ new tables for enterprise features (leadAlerts, crmIntegrations, savedSearches, etc.)
- Implemented efficient indexing for performance optimization
- Added audit logging for all critical operations

**UI/UX Updates:**
- Added new pages for all enterprise features with professional lakefront theme
- Updated navigation menus for both admin and buyer roles
- Implemented real-time WebSocket connections for instant alerts
- Added interactive charts and visualizations for analytics

All features have been tested and are fully operational.