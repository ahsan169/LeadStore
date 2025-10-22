# Lakefront Leadworks

A professional AI-powered Merchant Cash Advance (MCA) lead marketplace platform with multi-tier pricing, automated quality scoring, Stripe payment integration, and AI-generated insights.

## Features

### For Buyers
- **Multi-Tier Pricing**: Gold, Platinum, Diamond, and Elite tier packages
- **Quality-Scored Leads**: Each lead includes a 0-100 quality score
- **Secure Payments**: Stripe integration for safe transactions
- **Instant Delivery**: Automated CSV download with 24-hour expiring URLs
- **Purchase History**: Track all orders and download leads anytime

### For Administrators
- **Lead Management**: Upload and manage lead batches via CSV
- **AI Insights**: OpenAI-powered analysis of lead batches (aggregated data only, no PII)
- **Customer Management**: View all registered buyers
- **Analytics Dashboard**: Track sales, lead inventory, and quality metrics
- **Deduplication**: Prevent selling the same lead twice

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn UI, Wouter
- **Backend**: Express.js, Node.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with bcrypt password hashing
- **Payments**: Stripe (test mode configured)
- **AI**: OpenAI GPT-4o-mini for insights
- **Storage**: Google Cloud Storage for CSV files
- **Real-time**: TanStack Query for data fetching

## Security Features

✅ Bcrypt password hashing (10 rounds)
✅ Role-based access control (admin/buyer)
✅ Protected routes with authentication middleware
✅ Secure session management
✅ TCPA compliance messaging
✅ 24-hour expiring download URLs
✅ Download audit trail

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Stripe account (test mode)
- Google Cloud Storage bucket

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (already configured in Replit):
   - `DATABASE_URL` - PostgreSQL connection string
   - `STRIPE_SECRET_KEY` - Stripe secret key
   - `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key
   - `SESSION_SECRET` - Session encryption secret
   - `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - GCS bucket ID
   - `OPENAI_API_BASE_URL` - OpenAI API endpoint (via Replit AI)

4. Push database schema:
   ```bash
   npm run db:push
   ```

5. Seed test users:
   ```bash
   tsx server/seed.ts
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

## Test Credentials

**Admin Account:**
- Username: `admin`
- Password: `admin123`

**Buyer Account:**
- Username: `buyer`
- Password: `buyer123`

## Pricing Tiers

| Tier | Price | Leads | Quality Range | Features |
|------|-------|-------|---------------|----------|
| Gold | $500 | 50 | 60-79 | Basic deduplication, 24hr delivery |
| Platinum | $1,500 | 200 | 70-89 | Advanced deduplication, instant delivery, priority support |
| Diamond | $4,000 | 600 | 80-100 | AI insights, replace guarantee, priority support |
| Elite | Custom | Custom | 85-100 | Dedicated manager, API access, white-label |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new buyer account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Purchases (Authenticated)
- `POST /api/purchases` - Create new purchase
- `GET /api/purchases` - Get user's purchases
- `GET /api/purchases/:id` - Get specific purchase
- `POST /api/purchases/:id/download-url` - Generate download URL

### Admin Routes (Admin Only)
- `GET /api/batches` - Get all lead batches
- `GET /api/batches/:id` - Get specific batch
- `POST /api/batches/:id/publish` - Publish batch to tier
- `GET /api/leads/batch/:batchId` - Get leads in batch
- `GET /api/leads/stats` - Get lead statistics
- `GET /api/customers` - Get all customers
- `POST /api/insights/generate/:batchId` - Generate AI insights
- `GET /api/insights/batch/:batchId` - Get insights for batch

### Webhooks
- `POST /api/webhooks/stripe` - Stripe payment webhooks

## Database Schema

- **users** - User accounts with roles
- **subscriptions** - Subscription tiers (future use)
- **leadBatches** - Uploaded CSV batches
- **leads** - Individual lead records with quality scores
- **purchases** - Payment transactions
- **downloadHistory** - Audit trail of downloads
- **aiInsights** - AI-generated batch analysis

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run db:push` - Push schema changes to database
- `tsx server/seed.ts` - Create test users

### Code Structure
```
├── client/              # Frontend React application
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   └── App.tsx      # Main app with routing
├── server/              # Backend Express application
│   ├── routes.ts        # API routes
│   ├── storage.ts       # Database operations
│   ├── index.ts         # Server entry point
│   └── seed.ts          # Database seeding
├── shared/              # Shared types and schemas
│   └── schema.ts        # Drizzle schema definitions
```

## Compliance

All leads are sourced in compliance with:
- **TCPA** (Telephone Consumer Protection Act)
- **CAN-SPAM Act**
- Express written consent requirements

Buyers are responsible for compliance with all applicable regulations in their jurisdiction.

## License

Proprietary - All rights reserved

## Support

For technical support or sales inquiries:
- Email: sales@example.com
- Admin Dashboard: `/admin/dashboard`
