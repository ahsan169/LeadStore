# CSV Import/Export Features Guide

## Overview
The Company Search page now includes powerful CSV import/export features that allow you to:
1. **Download search results** as CSV with all company and executive contact information
2. **Bulk enrich companies** by uploading a CSV file of company names

---

## Feature 1: Download Search Results as CSV

### How it works:
1. Go to **Company Search** page (`/company-search`)
2. Search for companies using the search bar (e.g., "Tesla", "HubSpot")
3. View the search results
4. Click the **"Download CSV"** button at the top of the results

### What you get:
A CSV file containing all companies and their executives with the following columns:
- Company Name
- Industry
- Company City
- Company State
- Company Website
- Company LinkedIn
- Employee Count
- Annual Revenue
- Founded
- Executive Name
- Executive Title
- Executive Email
- Executive Phone
- Executive LinkedIn
- Data Confidence
- Data Sources

### Example:
```csv
Company Name,Industry,Executive Name,Executive Title,Executive Email,Executive Phone,...
HubSpot,Computer Software,Whitney Sorenson,Chief Architect,wsorenson@hubspot.com,(555) 123-4567,...
HubSpot,Computer Software,Yamini Rangan,Chief Executive Officer,yrangan@hubspot.com,(555) 987-6543,...
```

**Note:** Each executive gets their own row, so companies with multiple executives will have multiple rows.

---

## Feature 2: Bulk Company Enrichment via CSV Upload

### How it works:
1. Go to **Company Search** page (`/company-search`)
2. Click on the **"Bulk Upload"** tab
3. Click **"Upload CSV"** button
4. Select your CSV file
5. Wait for enrichment (this may take time for large files)
6. View enriched results
7. Click **"Download Enriched CSV"** to export

### CSV Format Requirements:
Your CSV file must have a column with one of these exact names:
- `company_name`
- `Company Name`
- `company`
- `Company`
- `business_name`
- `Business Name`

### Sample CSV Template:
Use the provided `sample_companies_template.csv`:

```csv
company_name
Tesla
Microsoft
Google
Apple
Amazon
Salesforce
HubSpot
Acme Corporation
```

### Processing Limits:
- Maximum 50 companies per upload (to prevent timeouts)
- 1 second delay between each enrichment (API rate limiting)
- Processing time: ~50-60 seconds for 50 companies

### What you get:
The same CSV format as the download feature, with all enriched data including:
- Company details (website, location, industry, revenue, etc.)
- All executives with contact information
- LinkedIn profiles
- Confidence scores

---

## API Endpoints

### POST `/api/company-search/export`
Export companies to CSV.

**Body:**
```json
{
  "companies": [
    {
      "businessName": "HubSpot",
      "industry": "Computer Software",
      "executives": [...],
      ...
    }
  ]
}
```

**Response:** CSV file download

---

### POST `/api/company-search/bulk-enrich`
Bulk enrich companies from uploaded CSV.

**Request:** Multipart form data with `file` field containing CSV

**Response:**
```json
{
  "success": true,
  "total": 10,
  "processed": 10,
  "enriched": 8,
  "companies": [...]
}
```

---

## Frontend Implementation

The CSV features are implemented in:
- **Page:** `client/src/pages/CompanySearchPage.tsx`
- **Backend Routes:** `server/routes/company-search-routes.ts`
- **Service:** `server/services/seamless-ai-service.ts`

### Key Functions:
- `handleDownloadCSV()` - Exports search results to CSV
- `handleFileUpload()` - Processes bulk CSV upload
- `Papa.unparse()` - Converts JSON to CSV format
- `Papa.parse()` - Parses uploaded CSV files

---

## Use Cases

### 1. Lead Generation Workflow:
1. Search for companies in your target industry
2. Download CSV with all contacts
3. Import into CRM (Salesforce, HubSpot, etc.)
4. Begin outreach campaigns

### 2. Data Enrichment Workflow:
1. Export your existing company list from CRM as CSV
2. Format with `company_name` column
3. Upload to Company Search bulk enrichment
4. Download enriched data with all contacts
5. Re-import into CRM with updated information

### 3. Market Research:
1. Search multiple companies in a specific industry
2. Download comprehensive company & contact data
3. Analyze in Excel/Google Sheets
4. Identify decision makers and org structures

---

## Troubleshooting

### CSV Upload Fails:
- **Problem:** "No company names found in CSV"
- **Solution:** Ensure your CSV has a column named `company_name` or `Company Name`

### Enrichment Returns Few Results:
- **Problem:** Only 3 out of 10 companies enriched
- **Solution:** Some companies may not have data in SeamlessAI database. Try:
  - Use full company names (not abbreviations)
  - Include domain if known
  - Check company name spelling

### Download Button Not Appearing:
- **Problem:** Can't find download button
- **Solution:** Make sure you have search results displayed first

---

## SeamlessAI API Configuration

To use these features, you must have a valid SeamlessAI API key configured:

```bash
export SEAMLESS_API_KEY="your_api_key_here"
```

See `SEAMLESS_AI_SETUP.md` for detailed setup instructions.

---

## Technical Details

### CSV Parsing:
- Uses `papaparse` library for robust CSV parsing
- Supports multiple column name variations
- Handles quotes, commas, and special characters
- UTF-8 encoding support

### Rate Limiting:
- 1 second delay between API calls during bulk enrichment
- Prevents SeamlessAI API throttling
- Ensures stable enrichment process

### File Size:
- No explicit file size limit on upload
- Processing limited to 50 companies per request
- Large files (>50 companies) will only process first 50

---

## Future Enhancements

Potential improvements:
- [ ] Batch processing for files >50 companies
- [ ] Progress bar for enrichment
- [ ] Filter/customize CSV columns
- [ ] Schedule automatic enrichment jobs
- [ ] Save enriched data to database
- [ ] Deduplication during bulk enrichment
- [ ] Support for Excel (.xlsx) files

---

## Support

For issues or questions about CSV features:
1. Check SeamlessAI API key configuration
2. Verify CSV format matches requirements
3. Check server logs for detailed error messages
4. Review network tab in browser dev tools

**Server Logs Location:** Terminal running `npm run dev`
**Sample Templates:** `sample_companies_template.csv`






