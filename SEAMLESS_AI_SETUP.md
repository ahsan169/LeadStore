# SeamlessAI Integration Setup

## ✅ Real SeamlessAI API Integrated!

The application now uses the **REAL SeamlessAI API** to fetch actual company data!

## Setup Steps:

### 1. Get Your API Key

Go to [Seamless.AI Settings → API Key](https://app.seamless.ai/settings/api) and create a new API key.

### 2. Set the Environment Variable

**Option A: Temporary (for testing)**
```bash
export SEAMLESS_API_KEY="your_api_key_here"
```

**Option B: Permanent (recommended)**

Add to your `.env` file:
```bash
echo "SEAMLESS_API_KEY=your_api_key_here" >> .env
```

### 3. Start the Server

```bash
cd /Users/user/Downloads/LeadStorefrontAI
PORT=3000 DATABASE_URL="postgresql://$(whoami)@localhost:5432/lead_storefront" SEAMLESS_API_KEY="your_key" npm run dev
```

## How It Works:

### Real Data from SeamlessAI:
- ✅ **Company Search** - finds real companies via SeamlessAI `/search/companies` endpoint
- ✅ **Contact Search** - finds real executives via SeamlessAI `/search/contacts` endpoint  
- ✅ **Executive Enrichment** - returns CEO, President, Founder details
- ✅ **Company Details** - revenue, employees, industry, location, LinkedIn
- ✅ **95% Confidence** - all data comes directly from SeamlessAI

### API Endpoints:

**Search Multiple Companies:**
```bash
GET /api/company-search/live?query=Tesla
```

**Enrich Single Company:**
```bash
POST /api/company-search/enrich
Content-Type: application/json
{
  "companyName": "Microsoft"
}
```

## Features:

✅ Searches real companies via SeamlessAI
✅ Returns actual contact information (emails, phones)
✅ Finds real executives (CEOs, Presidents, Founders)
✅ Shows company details (revenue, employees, LinkedIn)
✅ 100 requests per minute rate limit (from SeamlessAI)
✅ Uses correct authentication: `Token: API_KEY` header

## Testing:

Try searching for real companies:
- Tesla
- Microsoft  
- Google
- Your own company name

You'll get REAL data from SeamlessAI's database!

## Troubleshooting:

**Error: "SeamlessAI API not configured"**
- Solution: Set the `SEAMLESS_API_KEY` environment variable

**Error: "429 Too Many Requests"**
- Solution: You've exceeded the rate limit (100 req/min). Wait a bit.

**Error: "401 Unauthorized"**
- Solution: Your API key is invalid or expired. Get a new one from SeamlessAI.

## API Documentation:

See `/Users/user/Downloads/LeadStorefrontAI/client/public/API Reference _ Seamless.pdf` for full API reference.

Based on official SeamlessAI API:
- Base URL: `https://api.seamless.ai/api/client/v1`
- Auth Header: `Token: YOUR_API_KEY`
- Rate Limit: 100 requests per 60 seconds






