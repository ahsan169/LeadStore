# MCA Lead Marketplace

## Overview

A professional B2B marketplace platform for buying and selling Merchant Cash Advance (MCA) leads. The platform features multi-tier pricing packages (Gold, Platinum, Diamond, Elite), AI-powered lead quality scoring, secure Stripe payment processing, and automated CSV delivery with expiring download URLs. Administrators can upload lead batches, view AI-generated insights, and track sales analytics. Buyers can purchase leads based on quality tiers, access purchase history, and download leads securely.

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