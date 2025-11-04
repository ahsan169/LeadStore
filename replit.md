# Lakefront Leadworks - Streamlined MCA Lead Marketplace

## Overview

Lakefront Leadworks is a simplified, practical MCA lead marketplace designed to be an "all-in-one machine" that's easy to understand and use. The platform focuses on essential functionality: user authentication, lead purchasing with clear pricing tiers, and consolidated admin management. After a major simplification effort on November 4, 2025, the application has been reduced from 40+ complex pages to just 6 essential pages, making it significantly more practical and user-friendly.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Wouter for routing.
- **UI Component System**: Radix UI primitives with Shadcn UI components, styled using Tailwind CSS. Design inspired by Stripe's B2B SaaS aesthetic with a professional blue primary color and green accent.
- **State Management**: TanStack Query (React Query) for server state management, leveraging optimistic updates and cache invalidation.
- **Form Handling**: React Hook Form with Zod for type-safe validation.
- **Payment UI**: Stripe Elements integration for PCI-compliant payment forms.

### Backend Architecture
- **Server Framework**: Express.js with TypeScript on Node.js, serving both API and static React SPA files.
- **Authentication**: Passport.js with Local Strategy (bcrypt hashing) and session-based authentication using secure cookies.
- **Authorization**: Role-based access control (RBAC) with `buyer` and `admin` roles.
- **API Design**: RESTful JSON API with organized routes for authentication, purchases, lead batches, leads, and Stripe webhooks.
- **Pricing Logic**: Hardcoded pricing tiers (Gold, Platinum, Diamond, Elite) with corresponding lead allocations.

### Data Storage
- **Database**: PostgreSQL via Neon serverless driver.
- **ORM**: Drizzle ORM for type-safe queries and schema management, defining `users`, `subscriptions`, `leadBatches`, `leads`, `purchases`, `downloadHistory`, and `aiInsights`.
- **File Storage**: AWS S3-compatible object storage (Replit Object Storage) for CSV uploads and fulfilled lead CSVs, utilizing pre-signed URLs for secure downloads.
- **Deduplication**: Tracks and prevents reselling of leads using a `sold` flag.

### UCC Intelligence System
- **AI-Powered UCC Filing Parser**: Analyzes and extracts data from 50 US state UCC filing formats with high accuracy.
- **Advanced Data Extraction & Inference**: Includes Debt Velocity Analysis, Lender Concentration Risk, Collateral Quality Assessment, Payment Pattern Recognition, Business Expansion Indicators, and Industry-Specific Intelligence.
- **Lead-to-Lead Relationship Matching**: Uses fuzzy entity matching, beneficial owner detection, supply chain mapping, and risk contagion analysis.
- **Predictive Analytics Engine**: Provides Default Risk Prediction, Next Financing Prediction, Consolidation Opportunities, Stacking Pattern Detection, and Fraud Risk Assessment.
- **Real-Time Monitoring & Alerts**: Notifies on new filings, loan stacking, refinancing opportunities, and related entity filings.
- **Deep Lead Scoring Integration**: UCC data dynamically adjusts lead scores with multipliers and influence badges.
- **Technical Architecture**: Event-driven communication, service isolation, optimized caching, new database tables for UCC data, and OpenAI GPT-4 integration for insights.
- **UI/UX Enhancements**: Dedicated UCC Intelligence Dashboard, enhanced lead cards, detailed UCC modal, and visual risk indicators.

### Lead Intelligence System
- **Unified Lead Intelligence Score**: Combines 7 scoring systems into a single score with 5 sub-scores: Quality, Freshness, Risk, Opportunity, and Confidence.
- **Lead Activation Hub**: Integrates CRM, campaigns, and enrichment into one workflow.
- **Enhanced Verification Service**: Real-time verification using Hunter.io for emails and Numverify for phone numbers, with composite confidence scoring and smart caching.
- **Predictive Insights Engine**: Provides market trend analysis, lead predictions, daily insights, portfolio optimization, and anomaly detection with tiered caching.
- **Simplified Pricing**: Two clear pricing tiers: Starter and Pro.

### Enterprise Features
- **Lead Performance Analytics Dashboard**: Real-time metrics, conversion tracking, ROI analysis.
- **CRM Integration Hub**: Seamless integration with major CRMs (Salesforce, HubSpot, Zoho, Pipedrive) via OAuth.
- **Smart Lead Matching**: AI-powered alerts for new leads matching buyer criteria.
- **Lead Enrichment Service**: Automatic business data appending from third-party providers.
- **Advanced Filtering**: 20+ filter criteria, saved searches, and bulk export.
- **Quality Guarantee Program**: Automated lead replacement and dispute management.
- **Lead Freshness Indicators**: Time-based scoring for lead age and recency.
- **Bulk Operations**: Volume discounts and batch processing tools.
- **Email/SMS Campaign Tools**: Template management and campaign automation.
- **Enterprise API v1**: REST API with JWT authentication, rate limiting, and webhooks.
- **ML-Powered Lead Scoring**: Machine learning models for predictive quality scoring.

### Security Features
- **Password Security**: Bcrypt hashing with 10 rounds.
- **Session Security**: HTTP-only cookies with secure flag, 7-day expiration.
- **Role Enforcement**: Backend middleware for RBAC.
- **Download Security**: Time-limited pre-signed URLs (24-hour expiration).
- **Webhook Verification**: Stripe webhook signature verification.
- **TCPA Compliance**: UI messaging for lead usage.
- **CRM Credential Security**: Stable encryption key management for CRM credentials.

### Development Tooling
- **Build System**: Vite for frontend, esbuild for backend.
- **Type Safety**: Shared TypeScript types and Zod schemas.
- **Database Migrations**: Drizzle Kit.
- **Development Server**: Vite dev server with HMR and Express backend middleware.

## External Dependencies

- **Payment Processing**: Stripe API (Node.js SDK) for Checkout Sessions, Payment Intents, and webhooks.
- **AI Insights**: OpenAI GPT-4o-mini for analyzing lead batches and OpenAI GPT-4 for UCC pattern recognition.
- **Object Storage**: AWS S3-compatible object storage (Replit Object Storage) for file uploads and downloads.
- **Email Verification**: Hunter.io API.
- **Phone Verification**: Numverify API.