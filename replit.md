# Land of Leads - Customizable Funding Leads CRM

## Overview

Land of Leads is a customizable multi-tenant CRM platform for the funding industry. The system supports **multiple funding types** (MCA, SBA loans, equipment financing, invoice factoring, and more) with configurable AI scoring per funding product. It features multi-tenant company architecture with role-based access (super_admin, company_admin, agent), an AI Brain for calculating hot scores (0-100), call logging with outcome tracking, automated workflow for follow-ups, and company-scoped data isolation.

**Key Features:**
- **Configurable Funding Products**: Create and manage any funding type with custom scoring weights, eligibility criteria, and pricing tiers
- **Daily UCC Data Pipelines**: Automated lead generation from Colorado and Florida state records
- **AI-Powered Scoring**: Scores tailored per funding product type (0-100 scale)
- **Buyer Feedback Loop**: Machine learning from buyer outcomes to improve source quality

**Note**: Lead enrichment features have been removed from the UI (backend routes remain intact for future use).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Multi-Tenant Structure
- **Companies**: Each company has isolated data with their own leads, users, tasks, and pipeline stages
- **User Roles**:
  - `super_admin`: Platform-wide access, can manage all companies
  - `company_admin`: Full access within their company, can manage users
  - `agent`: Can work leads, log calls, manage tasks within their company
- **Data Isolation**: All queries filter by companyId except for super_admin views

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing.
- **UI Component System**: Radix UI primitives, Shadcn UI components, Tailwind CSS for styling. Design aesthetic inspired by Stripe's B2B SaaS.
- **State Management**: TanStack Query for server state, optimistic updates, and cache invalidation.
- **Form Handling**: React Hook Form with Zod for type-safe validation.
- **Payment UI**: Stripe Elements integration.

### Backend Architecture
- **Server Framework**: Express.js with TypeScript on Node.js.
- **Authentication**: Passport.js with Local Strategy (bcrypt) and session-based authentication.
- **Authorization**: Role-based access control (RBAC) for `super_admin`, `company_admin`, and `agent`.
- **API Design**: RESTful JSON API with company-scoped endpoints.
- **AI Brain**: Event-driven service that recalculates hot_score after call/task mutations.

### Data Storage
- **Database**: PostgreSQL via Neon serverless driver.
- **ORM**: Drizzle ORM for type-safe queries and schema management.
- **Key Tables**:
  - `fundingProducts`: Configurable funding types with scoring weights, eligibility criteria, and pricing tiers
  - `companies`: Multi-tenant company management with AI Brain settings
  - `users`: User accounts with companyId and role
  - `leads`: Lead records with hotScore, attemptCount, lastOutcome, nextActionAt, fundingProductId
  - `callLogs`: Call tracking with outcome and company scope
  - `tasks`: Task management with company scope
  - `pipelineStages`: Company-specific pipeline configurations
- **File Storage**: AWS S3-compatible object storage (Replit Object Storage) for CSVs, using pre-signed URLs.

### AI Brain System
The AI Brain calculates hot scores (0-100) for leads based on:
- **Recency Weight (0.3)**: How recently the lead was created/contacted
- **Source Weight (0.2)**: Quality of lead source (manual, import, web, referral, paid)
- **Attempt Weight (0.2)**: Number of contact attempts (decreases score after max attempts)
- **Outcome Weight (0.3)**: Last call outcome (connected, voicemail, no_answer, etc.)
- **Feedback Weight (0.2)**: Buyer feedback from conversion outcomes

Lead fields for AI Brain:
- `hotScore`: 0-100 AI-calculated priority score
- `aiScore`: Alternative AI score field for scoring tier
- `attemptCount`: Number of contact attempts
- `lastCallAt`: Last call timestamp
- `lastOutcome`: Last call outcome type
- `lastOutcomeAt`: Timestamp of last outcome
- `conversionLabel`: Feedback label (unknown, funded, contacted, no_response, bad)
- `nextActionAt`: When next action is due
- `nextActionType`: Type of next action ('call', 'email', 'follow_up', 'meeting')
- `e164Phone`: Normalized E.164 phone format

### Buyer Feedback System
- **Lead Assignments**: Tracks which leads are assigned to which buyers after purchase
- **Lead Activities**: Lightweight CRM history for buyer feedback (status changes, notes, outcomes)
- **Conversion Labels**: "unknown", "funded", "contacted", "no_response", "bad"
- **Feedback Loop**: Buyer outcomes feed back into AI Brain for source quality learning

### God Mode Admin Portal
Super admin control center for AI Brain and analytics:
- **Dashboard**: Platform-wide stats (leads, fund rate, revenue, active buyers)
- **Buyer Performance**: Leaderboard with fund rate and feedback rate per buyer
- **Source Performance**: Conversion rates by lead source
- **Brain Settings**: Adjustable weights for AI scoring (recency, source, attempt, outcome, feedback)
- **Activity Feed**: Live feed of buyer feedback and status changes

### UI/UX Decisions
- Streamlined 6-page interface for core functionality.
- **Kingdom Theme**: Elegant forest green (#2d6a4f) and golden amber color palette.
- **Typography**: Playfair Display serif for headings, Inter for body text.
- **Premium Effects**: 20+ CSS utilities including `text-gradient-royal`, `card-kingdom`, `btn-kingdom`, `badge-gold/emerald/royal`, `glow-crown`, `hover-lift`, `divider-elegant`, shimmer animations.
- **Dark Mode**: Full support with proper color variants across all components.
- Enhanced Admin Panel with 8 tabs for comprehensive management (Upload, Analytics, User, Lead, Customers, Activity, Settings, UCC).
- Visual indicators for lead quality, UCC risk, and verification status.
- Kanban-style Pipeline Board for CRM.
- "Next Best Lead" feature powered by AI Brain.

### Feature Specifications
- **Comprehensive CRM**: Pipeline Board, Task Manager, Contact Manager, Activity Timeline, CRM Dashboard.
- **Call Logging**: Track calls with outcomes (connected, voicemail, no_answer, busy, wrong_number, callback_requested, follow_up, funded, not_interested).
- **Lead Validation Center**: Verify and validate lead data quality before use.
- **Simplified UCC Intelligence System**: Integrates UCC data, calculates risk (Low/Medium/High) based on debt-to-revenue, visual indicators, admin UCC upload/processing, statistics dashboard. AI-powered parsing and advanced data extraction.
- **Advanced Lead Intelligence Features**: Auto-Verification, Unified Lead Scoring (0-100 with color coding), Practical Insights Engine, Smart Lead Matching, CRM Export Support.
- **Enterprise Features**: Lead Performance Analytics Dashboard, CRM Integration Hub (Salesforce, HubSpot), Smart Lead Matching (AI alerts), Advanced Filtering (20+ criteria), Quality Guarantee, Lead Freshness Indicators, Bulk Operations.

### System Design Choices
- Event-driven communication, service isolation for UCC intelligence.
- AI Brain recalculates hot_score after call/task mutations.
- Company isolation: All queries filter by companyId except for super_admin.
- Optimized caching strategies.
- Robust security: Bcrypt hashing, HTTP-only cookies, RBAC, pre-signed URLs, webhook verification, TCPA compliance, encrypted CRM credentials.
- Development tooling: Vite for frontend, esbuild for backend, Drizzle Kit for migrations.

## External Dependencies

- **Payment Processing**: Stripe API (Node.js SDK)
- **AI Insights**: OpenAI GPT-4o-mini (lead batches), OpenAI GPT-4 (UCC pattern recognition)
- **Object Storage**: AWS S3-compatible object storage (Replit Object Storage)
- **Email Verification**: Hunter.io API
- **Phone Verification**: Numverify API

## Recent Changes

- Added `companies` table for multi-tenant architecture
- Updated `users` table with companyId and expanded role types (super_admin, company_admin, agent)
- Added AI Brain fields to leads: hotScore, attemptCount, lastCallAt, lastOutcome, nextActionAt, nextActionType, e164Phone
- Added companyId to leads, tasks, callLogs, pipelineStages for multi-tenant isolation
- Updated callLogs table with enhanced fields (phoneDialed, durationSec, notes)
- Implemented AI Brain service (server/services/ai-brain.ts) with hot score calculation
- Created multi-tenant routes (server/routes/multi-tenant.ts) for company management and call logging
- Updated /api/auth/me to return { user, company, permissions } for role-based UI
- Added Next Best Lead feature with skip functionality and call logging modal
- Frontend App.tsx updated with role-based sidebar navigation (super_admin, company_admin, agent)

### Buyer Feedback System (Latest)
- Added `leadAssignments` table for tracking lead-buyer associations with companyId for multi-tenant isolation
- Added `leadActivities` table for tracking buyer feedback (funded, contacted, bad_lead, no_response)
- Added `brainConfig` table for storing AI Brain configuration settings
- Added `sourceStats` table for learning source quality from buyer feedback
- Created buyer feedback routes (server/routes/buyer-feedback.ts): GET /api/my-leads, POST /api/leads/:id/activity
- Created God Mode admin portal (server/routes/god-mode.ts): dashboard, buyer performance, source stats, brain settings
- Implemented AI Brain feedback weight integration and source quality learning
- Created My Leads page (client/src/pages/my-leads.tsx) for buyer workspace with activity tracking
- Created God Mode page (client/src/pages/god-mode.tsx) for super_admin with analytics and brain settings
- Wired up Stripe webhook to create leadAssignments when purchases complete

### Lead Generation Pipelines (Latest)
- Created Colorado UCC pipeline (server/pipelines/colorado-ucc-pipeline.ts) - pulls data from Colorado SOS via Socrata API
- Created Florida pipeline (server/pipelines/florida-pipeline.ts) - pulls data from Florida Sunbiz/SFTP
- Created pipeline API routes (server/routes/pipeline-routes.ts) - endpoints to run/monitor pipelines
- Registered pipeline routes at /api/pipelines in server/routes.ts
- Environment variable SOCRATA_APP_TOKEN configured for Colorado public data access

### Home Page Content Simplification
- Updated hero section to emphasize "Fresh MCA Leads from State UCC Filings"
- Simplified FEATURES content: "Fresh UCC Data Daily" (Colorado/Florida), "AI-Powered Scoring" (0-100), "Pay Per Lead"
- Updated trust badges: "Fresh Daily", "TCPA Compliant", "AI Scored", "Secure"
- Simplified FAQs to 8 questions focused on UCC data sourcing, scoring, and purchasing
- Updated Features section heading to "Why Land of Leads?"
- Updated Contact section heading to "Have Questions?"
- Removed references to "enrichment" and "validation" from UI (backend routes remain)

### Customizable Funding Products System
- Added `fundingProducts` table for configurable funding types (MCA, SBA loans, equipment financing, invoice factoring, etc.)
- Each funding product has custom scoring weights (recency, source, financial, risk), eligibility criteria, custom fields, and pricing tiers
- Added `fundingProductId` field to leads table for multi-funding-type support
- Updated AI Brain service with `calculateHotScoreWithProduct()` method for funding product-specific scoring
- Added funding product weights caching for efficient scoring
- Created God Mode "Products" tab for super_admin to manage funding products (CRUD operations)
- API routes: GET/POST/PUT/DELETE `/api/god-mode/funding-products`
- Rebranded home page from MCA-specific to customizable funding leads platform
- Updated all frontend MCA references to generic "funding" terminology (20+ files)
- Platform now positioned as configurable funding leads CRM supporting any funding vertical

### TypeScript Error Fixes (December 2025)
- Fixed 507+ TypeScript errors across the entire codebase
- All main application files are now error-free; only test files retain type errors (37 total in server/test-*.ts files)
- Key fix patterns applied:
  - `Array.from()` for Map/Set iteration (TypeScript downlevelIteration issue)
  - `as any` type casting for loose typing where schema/type mismatches existed
  - Correcting schema field names (e.g., `status` → `paymentStatus`, `state` → `stateCode`, `activity.type` → `activity.activityType`)
  - Converting `null` to `undefined` using `?? undefined` where type signatures required
  - Removing duplicate export declarations
  - Converting axios imports to `const axios = require('axios') as any` to avoid type declaration issues
- Note: The `apiRequest` function signature is `apiRequest(method, url, data?)` returning `Promise<Response>`

### Replit Auth Integration (December 2025)
- Integrated Replit Auth using OpenID Connect provider
- Auth module files: `server/replit_integrations/auth/` (replitAuth.ts, storage.ts, routes.ts, index.ts)
- Schema: `shared/models/auth.ts` (users and sessions tables)
- Client hooks: `client/src/hooks/use-auth.ts` and `client/src/lib/auth-utils.ts`
- Auth routes: `/api/login`, `/api/logout`, `/api/auth/user`
- Supports: Google, GitHub, X, Apple, and email/password login
- Session storage: PostgreSQL via connect-pg-simple
