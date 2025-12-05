# Lakefront Leadworks - Multi-Tenant MCA Lead CRM

## Overview

Lakefront Leadworks is a multi-tenant CRM platform designed for the Merchant Cash Advance (MCA) industry. The system supports multiple companies with role-based access (super_admin, company_admin, agent), features an AI Brain for calculating hot scores (0-100) and suggesting next best leads, includes call logging with outcome tracking, automated workflow for follow-ups, and company-scoped data isolation.

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
  - `companies`: Multi-tenant company management with AI Brain settings
  - `users`: User accounts with companyId and role
  - `leads`: Lead records with hotScore, attemptCount, lastOutcome, nextActionAt
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
- Professional blue primary color with green accents.
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
