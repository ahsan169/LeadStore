# CSV Features - Quick Start Guide 🚀

## What You Can Do

### 📥 Download Company Data as CSV
**Get detailed company & contact information instantly**

1. Go to http://localhost:3000/company-search
2. Search for a company (e.g., "Tesla", "HubSpot", "Salesforce")
3. Click **"Download CSV"** button
4. Open the CSV in Excel/Google Sheets

**You get:**
- Company details (website, industry, revenue, location)
- Executive names & titles
- Email addresses
- Phone numbers
- LinkedIn profiles

---

### 📤 Bulk Enrich Companies from CSV
**Upload a list of company names → Get enriched data back**

#### Step 1: Prepare Your CSV
Create a CSV file with this format:

```csv
company_name
HubSpot
Salesforce
Shopify
Tesla
Microsoft
```

**Or use the template:** `sample_companies_template.csv`

#### Step 2: Upload & Enrich
1. Go to http://localhost:3000/company-search
2. Click **"Bulk Upload"** tab
3. Click **"Upload CSV"**
4. Select your file
5. Wait for enrichment (1-2 minutes for 50 companies)

#### Step 3: Download Results
1. View enriched companies with all contact info
2. Click **"Download Enriched CSV"**
3. Get complete data including executives, emails, phones

---

## Real Example

### Input CSV:
```csv
company_name
HubSpot
Salesforce
Shopify
```

### Output CSV (simplified):
| Company | Industry | City | Executive | Title | Email | Phone |
|---------|----------|------|-----------|-------|-------|-------|
| HubSpot | Software | Cambridge | Yamini Rangan | CEO | yamini@hubspot.com | (617) 555-0002 |
| HubSpot | Software | Cambridge | Whitney Sorenson | Chief Architect | whitney@hubspot.com | (617) 555-0001 |
| Salesforce | Software | San Francisco | Marc Benioff | CEO | marc@salesforce.com | (415) 555-0001 |
| Salesforce | Software | San Francisco | Parker Harris | CTO | parker@salesforce.com | (415) 555-0002 |
| Shopify | Software | Ottawa | Tobias Lütke | CEO | tobias@shopify.com | (613) 555-0001 |

*See `EXAMPLE_CSV_OUTPUT.csv` for full format*

---

## Use Cases

### 1. 🎯 Sales Prospecting
- Search companies in your target industry
- Download CSV with all decision-maker contacts
- Import into Salesforce/HubSpot CRM
- Start personalized outreach

### 2. 📊 Market Research
- Upload list of competitors
- Get enriched company & contact data
- Analyze in Excel
- Identify key personnel

### 3. 🔄 CRM Data Enrichment
- Export company list from your CRM
- Format as CSV with `company_name` column
- Bulk enrich via upload
- Re-import updated contact info

---

## Tips & Tricks

### ✅ Best Practices:
- Use full company names (not abbreviations)
- Example: "Tesla, Inc." instead of "TSLA"
- Maximum 50 companies per upload
- Each company takes ~1 second to enrich

### ⚠️ Common Issues:
- **"No companies found"** → Check company name spelling
- **"CSV format error"** → Ensure column is named `company_name`
- **"API not configured"** → Set `SEAMLESS_API_KEY` environment variable

### 🔍 Column Name Options:
Your CSV can use any of these column names:
- `company_name` ✅ (recommended)
- `Company Name` ✅
- `company` ✅
- `business_name` ✅

---

## Files Included

📁 **Templates:**
- `sample_companies_template.csv` - Ready-to-use template
- `EXAMPLE_CSV_OUTPUT.csv` - Shows what you'll get back

📚 **Documentation:**
- `CSV_FEATURES_GUIDE.md` - Complete technical guide
- `SEAMLESS_AI_SETUP.md` - API key setup instructions
- `QUICK_START_CSV.md` - This file!

---

## Test It Now! 🧪

### Quick Test - Download:
```bash
# 1. Search for a company
curl 'http://localhost:3000/api/company-search/live?query=HubSpot'

# 2. Access in browser
open http://localhost:3000/company-search
```

### Quick Test - Bulk Upload:
```bash
# 1. Use the test file
open test_bulk_enrichment.csv

# 2. Go to Bulk Upload tab
open http://localhost:3000/company-search

# 3. Click "Bulk Upload" tab and upload the file
```

---

## Need Help?

1. **Server not running?**
   ```bash
   cd /Users/user/Downloads/LeadStorefrontAI
   PORT=3000 DATABASE_URL="postgresql://$(whoami)@localhost:5432/lead_storefront" SEAMLESS_API_KEY="your_key" npm run dev
   ```

2. **API key not set?**
   - See `SEAMLESS_AI_SETUP.md`

3. **CSV format issues?**
   - Copy `sample_companies_template.csv` as a starting point

4. **Still stuck?**
   - Check browser console (F12)
   - Check server terminal for errors
   - Review `CSV_FEATURES_GUIDE.md`

---

## 🎉 You're Ready!

Go to **http://localhost:3000/company-search** and start enriching company data!






