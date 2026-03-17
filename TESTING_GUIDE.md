# Testing Guide - Research Contacts with Phone Numbers

## 🚀 Server Status

The server is starting! It should be ready in 10-20 seconds.

**Access the app at:** `http://localhost:5000`

---

## 📍 How to Test

### Step 1: Navigate to Company Search Page

1. Open your browser: `http://localhost:5000`
2. Navigate to **Company Search** page (or go directly to `/company-search`)

### Step 2: Use the "Enrich Single" Tab

1. Click on the **"Enrich Single"** tab
2. You'll see two buttons:
   - **Quick Enrich** - Fast enrichment (may not have phone numbers)
   - **Research with Phones ⭐** - Full research pipeline (guaranteed phone numbers)

### Step 3: Search for a Company

Enter a company name in the search box and click **"Research with Phones ⭐"**

---

## 🔍 What to Search For

### Recommended Test Companies:

1. **"HubSpot"** - Tech company, usually has good data
2. **"Salesforce"** - Large tech company, lots of contacts
3. **"Microsoft"** - Well-known company
4. **"Tesla"** - Popular company
5. **"Apple"** - Large company with many contacts

### Good Test Companies (Medium-sized):

- **"Stripe"**
- **"Shopify"**
- **"Zoom"**
- **"Slack"**
- **"Atlassian"**

### Smaller Companies (May have less data):

- **"Acme Corp"**
- **"Local Business Name"**

---

## ⏱️ What to Expect

### When you click "Research with Phones ⭐":

1. **Search Phase** (5-10 seconds)
   - Status: "🔍 Searching contacts..."
   - Searches for contacts matching the company name

2. **Research Phase** (10-20 seconds)
   - Status: "📤 Creating research for chunk of X IDs"
   - Creates research requests (this initiates phone number lookup)
   - May show multiple chunks if there are many contacts

3. **Polling Phase** (20-60 seconds)
   - Status: "⏳ Poll attempt X - Remaining: Y"
   - Polls the research API until contacts are ready
   - This is where phone numbers are retrieved

4. **Results** (when complete)
   - Status: "✅ Found X contacts with phone numbers!"
   - Shows all contacts with:
     - ✅ Names
     - ✅ Titles
     - ✅ **Phone Numbers** (this is the key feature!)
     - ✅ Emails
     - ✅ LinkedIn URLs

---

## 📊 Expected Results

### Successful Response:

You should see a card with:
- Company name
- List of executives/contacts
- Each contact showing:
  - Name
  - Title (CEO, CTO, etc.)
  - **Phone number** (formatted)
  - Email address
  - LinkedIn URL

### Example Output:

```
HubSpot
├── John Doe - CEO
│   📞 +1-617-555-1234
│   ✉️ john@hubspot.com
│   🔗 linkedin.com/in/johndoe
├── Jane Smith - CTO
│   📞 +1-617-555-5678
│   ✉️ jane@hubspot.com
│   🔗 linkedin.com/in/janesmith
└── ...
```

---

## ⚠️ Troubleshooting

### "SeamlessAI API not configured"
- **Solution:** Set `SEAMLESS_API_KEY` environment variable
- Add to `.env` file or export before running:
  ```bash
  export SEAMLESS_API_KEY="your_api_key_here"
  ```

### "No contacts found"
- Try a different company name
- Some companies may not have data in SeamlessAI
- Try well-known companies first (HubSpot, Salesforce, Microsoft)

### Research takes too long
- This is normal! The research pipeline takes 30-60 seconds
- The polling phase waits for phone numbers to be ready
- Be patient - phone numbers require the full research process

### Partial results
- Some contacts may not have phone numbers (this is normal)
- The research pipeline returns what's available
- Check the console for detailed logs

---

## 🎯 Quick Test Commands

### Test via cURL (if server is running):

```bash
curl -X POST http://localhost:5000/api/company-search/research-contacts \
  -H "Content-Type: application/json" \
  -d '{"companyName": "HubSpot", "limit": 5}'
```

### Check Server Status:

```bash
curl http://localhost:5000
```

---

## 📝 Notes

- **First request may be slower** - API warmup
- **Rate limiting** - The system waits 5 seconds between research chunks
- **Phone numbers are guaranteed** - Unlike quick enrich, this uses the full research pipeline
- **Results are cached** - Subsequent searches for the same company may be faster

---

## ✅ Success Criteria

You know it's working when:
1. ✅ You see "Research with Phones ⭐" button
2. ✅ Clicking it shows progress messages
3. ✅ Results show contacts with **phone numbers**
4. ✅ Phone numbers are formatted and clickable
5. ✅ Each contact has name, title, email, phone, LinkedIn

---

**Happy Testing! 🎉**

The server should be ready at `http://localhost:5000` - try searching for "HubSpot" or "Salesforce" first!


