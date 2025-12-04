# Lakefront Leadworks - Streamlined MCA Lead Marketplace

## Overview

Lakefront Leadworks is a simplified, practical MCA lead marketplace designed for ease of use. It focuses on essential functionality: user authentication, lead purchasing with clear pricing tiers, and consolidated administration. The platform has been streamlined to just 6 core pages, emphasizing practicality and user experience in the Merchant Cash Advance (MCA) lead industry. Key capabilities include comprehensive CRM, advanced lead enrichment with multi-source verification and confidence scoring, and a sophisticated UCC Intelligence System for detailed lead assessment. The business vision is to provide an "all-in-one machine" for high-quality MCA leads, leveraging AI and robust data analysis to offer significant market potential for buyers.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing.
- **UI Component System**: Radix UI primitives, Shadcn UI components, Tailwind CSS for styling. Design aesthetic inspired by Stripe's B2B SaaS.
- **State Management**: TanStack Query for server state, optimistic updates, and cache invalidation.
- **Form Handling**: React Hook Form with Zod for type-safe validation.
- **Payment UI**: Stripe Elements integration.

### Backend Architecture
- **Server Framework**: Express.js with TypeScript on Node.js.
- **Authentication**: Passport.js with Local Strategy (bcrypt) and session-based authentication.
- **Authorization**: Role-based access control (RBAC) for `buyer` and `admin`.
- **API Design**: RESTful JSON API.
- **Pricing Logic**: Hardcoded pricing tiers (Gold, Platinum, Diamond, Elite) with lead allocations.

### Data Storage
- **Database**: PostgreSQL via Neon serverless driver.
- **ORM**: Drizzle ORM for type-safe queries and schema management (users, subscriptions, leadBatches, leads, purchases, downloadHistory, aiInsights).
- **File Storage**: AWS S3-compatible object storage (Replit Object Storage) for CSVs, using pre-signed URLs.
- **Deduplication**: `sold` flag to prevent lead reselling.

### UI/UX Decisions
- Streamlined 6-page interface for core functionality.
- Professional blue primary color with green accents.
- Enhanced Admin Panel with 8 tabs for comprehensive management (Upload, Analytics, User, Lead, Customers, Activity, Settings, UCC).
- Visual indicators for lead quality, UCC risk, and verification status.
- Kanban-style Pipeline Board for CRM.

### Feature Specifications
- **Comprehensive CRM**: Pipeline Board, Task Manager, Contact Manager, Activity Timeline, CRM Dashboard.
- **Advanced Lead Enrichment**: Multi-Source Verification (Hunter.io, Numverify, business data), Intelligent Enrichment Orchestrator, Quality Assurance, Enrichment Analytics, Smart Caching, Audit Trail. Includes automatic `firstName` and `lastName` extraction.
- **Colorado MCA Enrichment**: Industry-proven scoring methodology (UCC filings, bank/equipment financing, secured party diversity, IRS/SBA liens), quality tiers (Excellent, Good, Fair, Poor), sector classification, government entity filtering, visual insights.
- **Simplified UCC Intelligence System**: Integrates UCC data, calculates risk (Low/Medium/High) based on debt-to-revenue, visual indicators, admin UCC upload/processing, statistics dashboard. AI-powered parsing and advanced data extraction.
- **Advanced Lead Intelligence Features**: Auto-Enrichment (high-quality leads), Auto-Verification, Unified Lead Scoring (0-100 with color coding), Practical Insights Engine, Smart Lead Matching, CRM Export Support.
- **Enterprise Features**: Lead Performance Analytics Dashboard, CRM Integration Hub (Salesforce, HubSpot), Smart Lead Matching (AI alerts), Lead Enrichment Service, Advanced Filtering (20+ criteria), Quality Guarantee, Lead Freshness Indicators, Bulk Operations, Email/SMS Campaign Tools, Enterprise API v1, ML-Powered Lead Scoring.

### System Design Choices
- Event-driven communication, service isolation for UCC intelligence.
- Optimized caching strategies.
- Robust security: Bcrypt hashing, HTTP-only cookies, RBAC, pre-signed URLs, webhook verification, TCPA compliance, encrypted CRM credentials.
- Development tooling: Vite for frontend, esbuild for backend, Drizzle Kit for migrations.

## External Dependencies

- **Payment Processing**: Stripe API (Node.js SDK)
- **AI Insights**: OpenAI GPT-4o-mini (lead batches), OpenAI GPT-4 (UCC pattern recognition)
- **Object Storage**: AWS S3-compatible object storage (Replit Object Storage)
- **Email Verification**: Hunter.io API
- **Phone Verification**: Numverify API