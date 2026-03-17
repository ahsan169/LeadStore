# 🧪 Frontend Testing Guide - Research Contacts with Phone Numbers

## 🎯 Quick Test Flow

### Step 1: Access the App
1. **Open your browser**
2. **Go to:** `http://localhost:3000`
3. **Wait for the page to load** (should see the main dashboard)

### Step 2: Navigate to Company Search
**Option A: Via Navigation Menu**
- Look for "Company Search" or "Company Intelligence" in the sidebar/navigation
- Click on it

**Option B: Direct URL**
- Go to: `http://localhost:3000/company-search`

### Step 3: Use the Research Feature
1. **Click the "Enrich Single" tab** (you'll see two tabs: "Find Companies" and "Enrich Single")
2. **Enter a company name** in the search box:
   - Try: `HubSpot`
   - Or: `Salesforce`
   - Or: `Microsoft`
   - Or: `Tesla`
3. **Click the "Research with Phones ⭐" button** (the blue button with phone icon)

### Step 4: Watch the Process
You'll see progress messages:
- 🔍 "Searching contacts..."
- 📤 "Creating research for chunk of X IDs"
- ⏳ "Poll attempt X - Remaining: Y"
- ✅ "Found X contacts with phone numbers!"

**Wait time:** 30-60 seconds (this is normal - phone numbers require the full research pipeline)

### Step 5: View Results
Once complete, you'll see:
- **Company name** at the top
- **List of contacts** with:
  - ✅ Name
  - ✅ Title (CEO, CTO, etc.)
  - ✅ **Phone Number** 📞 (this is what you're testing!)
  - ✅ Email address
  - ✅ LinkedIn URL

---

## 📸 What You Should See

### Before Clicking:
```
┌─────────────────────────────────────┐
│ Company Intelligence Search         │
├─────────────────────────────────────┤
│ [Search Box: "HubSpot"        ]     │
│                                     │
│ [Find Companies] [Enrich Single]   │
│                                     │
│ [Quick Enrich] [Research with Phones⭐]│
└─────────────────────────────────────┘
```

### After Clicking "Research with Phones ⭐":
```
┌─────────────────────────────────────┐
│ 🔍 Searching contacts...            │
│ 📤 Creating research for chunk...   │
│ ⏳ Poll attempt 1 - Remaining: 10   │
│ ✅ Found 10 contacts with phones!   │
└─────────────────────────────────────┘
```

### Results Display:
```
┌─────────────────────────────────────┐
│ Enriched Company Data                │
│ HubSpot                              │
├─────────────────────────────────────┤
│ Executives:                          │
│                                     │
│ 1. Whitney Sorenson                  │
│    Chief Architect, HubSpot Next     │
│    📞 617.335.4105                   │
│    ✉️ wsorenson@hubspot.com          │
│    🔗 linkedin.com/in/wsorenson     │
│                                     │
│ 2. Alyssa Robinson                   │
│    Chief Information Security Officer│
│    📞 857.221.2375                   │
│    ✉️ arobinson@hubspot.com          │
│    🔗 linkedin.com/in/alyssa...     │
│                                     │
│ ... (more contacts)                 │
└─────────────────────────────────────┘
```

---

## ✅ Success Criteria

You know it's working when:
- ✅ Button "Research with Phones ⭐" is visible
- ✅ Clicking it shows progress messages
- ✅ Results show contacts with **phone numbers**
- ✅ Phone numbers are formatted and displayed
- ✅ Each contact has name, title, email, phone, LinkedIn

---

## 🔍 Step-by-Step Visual Guide

### 1. Open Browser
```
http://localhost:3000
```

### 2. Find Company Search Page
- Look in navigation menu
- Or go directly to: `/company-search`

### 3. Click "Enrich Single" Tab
```
[Find Companies] [Enrich Single] [Bulk Upload]
                    ↑ Click this
```

### 4. Enter Company Name
```
┌──────────────────────────────┐
│ Enter company name...        │
│ HubSpot                      │
└──────────────────────────────┘
```

### 5. Click "Research with Phones ⭐"
```
┌──────────────────┐  ┌──────────────────────────┐
│ Quick Enrich     │  │ Research with Phones ⭐  │
└──────────────────┘  └──────────────────────────┘
                          ↑ Click this one!
```

### 6. Wait for Results
- Progress messages will appear
- Wait 30-60 seconds
- Don't close the browser!

### 7. See Phone Numbers
- Results will appear automatically
- Scroll to see all contacts
- Each contact has a phone number!

---

## 🧪 Test Cases

### Test Case 1: HubSpot (Recommended First)
1. Company: `HubSpot`
2. Expected: 10+ contacts with phone numbers
3. Expected time: 30-45 seconds

### Test Case 2: Salesforce
1. Company: `Salesforce`
2. Expected: 10+ contacts with phone numbers
3. Expected time: 30-60 seconds

### Test Case 3: Microsoft
1. Company: `Microsoft`
2. Expected: Multiple contacts
3. Expected time: 30-60 seconds

### Test Case 4: Small Company
1. Company: `Acme Corp` (or any small company)
2. Expected: May have fewer contacts or none
3. This tests error handling

---

## ⚠️ Troubleshooting

### "Research with Phones ⭐" Button Not Visible
- **Check:** Are you on the "Enrich Single" tab?
- **Solution:** Click the "Enrich Single" tab first

### "SeamlessAI API not configured" Error
- **Check:** Is SEAMLESS_API_KEY in .env?
- **Solution:** The API key is already set, but if you see this, restart the server:
  ```bash
  # Stop server (Ctrl+C)
  # Then restart:
  cd /Users/user/Downloads/LeadStorefrontAI
  export $(cat .env | grep -v '^#' | xargs)
  PORT=3000 npm run dev
  ```

### No Results After 60 Seconds
- **Possible:** Company not found in SeamlessAI database
- **Solution:** Try a different company (HubSpot, Salesforce, Microsoft)

### Page Not Loading
- **Check:** Is server running?
  ```bash
  curl http://localhost:3000
  ```
- **Solution:** Restart server if needed

### Button Clicked But Nothing Happens
- **Check:** Browser console for errors (F12 → Console)
- **Check:** Network tab to see if API call is made
- **Solution:** Check server logs for errors

---

## 🔍 Debugging Tips

### Check Browser Console
1. Press `F12` (or right-click → Inspect)
2. Go to "Console" tab
3. Look for errors (red text)
4. Look for API calls to `/api/company-search/research-contacts`

### Check Network Requests
1. Press `F12` → "Network" tab
2. Click "Research with Phones ⭐"
3. Look for request to `/api/company-search/research-contacts`
4. Check response status (should be 200)
5. Check response data (should have `contacts` array with phone numbers)

### Check Server Logs
The server terminal will show:
```
[CompanySearch] Researching contacts with phones for: HubSpot
[SeamlessAI] 🔍 Starting full research flow for: HubSpot
[SeamlessAI] ✅ Found 10 search result IDs
[SeamlessAI] 🚀 Research jobs created: 10
[SeamlessAI] ⏳ Poll attempt 1 - Remaining: 10
[SeamlessAI] ✅ Completed: request_id
[SeamlessAI] 📦 Final results: 10 contacts with phone numbers
```

---

## 📋 Complete Testing Checklist

- [ ] Server is running at http://localhost:3000
- [ ] Can access Company Search page
- [ ] "Enrich Single" tab is visible
- [ ] "Research with Phones ⭐" button is visible
- [ ] Can enter company name
- [ ] Button click shows progress messages
- [ ] Results appear after 30-60 seconds
- [ ] Results show contacts with phone numbers
- [ ] Phone numbers are formatted correctly
- [ ] Each contact has name, title, email, phone

---

## 🎯 Quick Test (2 Minutes)

1. **Open:** http://localhost:3000/company-search
2. **Click:** "Enrich Single" tab
3. **Type:** `HubSpot`
4. **Click:** "Research with Phones ⭐"
5. **Wait:** 30-60 seconds
6. **See:** Contacts with phone numbers! 📞

---

## 📞 Expected Phone Number Format

Phone numbers will appear as:
- `617.335.4105` (formatted)
- `857.221.2375` (formatted)
- `888.482.7768` (company phone)

All with 99% confidence from SeamlessAI research!

---

## 🚀 Ready to Test!

Your app is running at: **http://localhost:3000**

**Start testing now:**
1. Open the URL above
2. Navigate to Company Search
3. Click "Research with Phones ⭐"
4. Enter "HubSpot"
5. Wait and see the phone numbers! 📞

---

## 💡 Pro Tips

- **First test:** Use "HubSpot" - it has reliable data
- **Be patient:** Research takes 30-60 seconds (this is normal)
- **Check console:** If something doesn't work, check browser console (F12)
- **Multiple tests:** Try different companies to see variety

**Happy Testing! 🎉**


