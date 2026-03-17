# Public Testing URL - LeadStorefrontAI

## 🌐 Your Public URL

**LIVE URL:** https://leadstorefrontai.loca.lt

---

## 📱 Quick Access Links

| Page | URL |
|------|-----|
| 🏠 Homepage | https://long-streets-kneel.loca.lt |
| 🔐 Login | https://long-streets-kneel.loca.lt/auth/login |
| 🔍 Company Search | https://long-streets-kneel.loca.lt/company-search |
| 📊 Lead Management | https://long-streets-kneel.loca.lt/lead-management |
| 📤 Upload Leads | https://long-streets-kneel.loca.lt/admin |

---

## 🔑 Test Accounts

### Admin Account
- **Username:** `admin`
- **Password:** `admin123`
- **Access:** Full system access

### Buyer Account
- **Username:** `buyer`
- **Password:** `buyer123`
- **Access:** Buyer permissions

---

## ⚠️ Important: First-Time Access

When you first visit the URL, you'll see a **localtunnel warning page** that says:
> "To access the website, please enter the tunnel password below."

**IMPORTANT: This is NOT asking for a password!**

### How to Proceed:
1. **Look for a button** that says "Click to Submit", "Continue", or shows your IP address
2. **Click that button** (you don't need to enter anything)
3. **You'll be redirected** to the application

**There is NO password!** The page is just a security warning. Simply click through.

This only happens once per browser session.

---

## ✨ Features to Test

### 1. Company Search with SeamlessAI
- Go to: https://long-streets-kneel.loca.lt/company-search
- Search for companies: "Tesla", "HubSpot", "Salesforce"
- Click on any company to see full details
- View executive contacts with emails, phones, LinkedIn

### 2. Download CSV
- After searching, click **"Download CSV"** button
- Opens in Excel/Google Sheets
- Contains all company & executive contact info

### 3. Bulk Upload & Enrich
- Click **"Bulk Upload"** tab
- Upload a CSV with company names
- System enriches via SeamlessAI
- Download enriched CSV with all contacts

### 4. Lead Management
- View, filter, and manage leads
- Upload new leads via CSV
- Validate and enrich lead data

---

## 🔧 How It Works

```
Internet Users
      ↓
https://long-streets-kneel.loca.lt (Public URL)
      ↓
Localtunnel Service
      ↓
Your Local Machine (localhost:3000)
      ↓
Node.js Server + React Frontend
```

- **Your local server** runs on `localhost:3000`
- **Localtunnel** creates a secure tunnel from the internet to your local server
- **Public URL** is accessible from anywhere in the world

---

## 💡 Sharing & Testing

### Perfect For:
- ✅ Team collaboration and testing
- ✅ Mobile device testing
- ✅ Remote demos
- ✅ Stakeholder reviews
- ✅ Cross-network testing

### Share With:
- Teammates for feedback
- QA for testing
- Clients for demos
- Mobile devices for responsive testing

---

## 🔄 Keeping It Running

### Currently Active:
- ✅ Node.js server (port 3000)
- ✅ Localtunnel (public URL)
- ✅ SeamlessAI integration

### To Keep Running:
- Keep your terminal open
- Don't close the server process
- Tunnel will remain active

### If Tunnel Stops:
```bash
lt --port 3000
```

### Check Server Status:
```bash
curl http://localhost:3000
```

### Check Tunnel Status:
```bash
ps aux | grep "lt --port"
```

---

## 🛑 Stopping Services

### Stop Tunnel Only:
```bash
pkill -f "lt --port"
```

### Stop Node.js Server:
```bash
pkill -f "tsx server/index.ts"
```

### Stop Everything:
```bash
pkill -f "lt --port"
pkill -f "tsx server/index.ts"
```

---

## 🔒 Security Notes

### Localtunnel Security:
- ✅ HTTPS encryption
- ✅ Temporary URL (changes on restart)
- ✅ Warning page for first-time visitors
- ⚠️ Not for production use

### For Production:
Consider these alternatives:
- **Vercel** - Serverless deployment
- **Railway** - Container deployment
- **Render** - Full-stack deployment
- **AWS/Azure/GCP** - Cloud hosting

---

## 📊 Testing Checklist

### Basic Functionality:
- [ ] Access homepage via public URL
- [ ] Login with test credentials
- [ ] Navigate to different pages
- [ ] Test on mobile device

### Company Search Features:
- [ ] Search for "Tesla"
- [ ] View company details
- [ ] See executive contacts
- [ ] Download CSV
- [ ] Upload CSV for bulk enrichment
- [ ] Download enriched CSV

### Lead Management:
- [ ] View leads list
- [ ] Filter leads
- [ ] Upload new leads
- [ ] Validate lead data

### Performance:
- [ ] Page load times
- [ ] Search responsiveness
- [ ] CSV download speed
- [ ] Bulk enrichment speed

---

## 🆘 Troubleshooting

### URL Not Working?
1. Check if server is running: `curl http://localhost:3000`
2. Check if tunnel is running: `ps aux | grep "lt --port"`
3. Restart tunnel: `pkill -f "lt --port" && lt --port 3000`

### Getting 404 Errors?
- Ensure Node.js server is running on port 3000
- Check server logs in terminal

### Tunnel Disconnects?
- Localtunnel sessions can timeout
- Simply restart: `lt --port 3000`
- New URL will be generated

### SeamlessAI Not Working?
- Check `SEAMLESS_API_KEY` is set
- Verify API key in server startup logs
- See `SEAMLESS_AI_SETUP.md` for configuration

---

## 📈 Next Steps

### For Development:
- Keep testing and refining features
- Gather user feedback
- Fix bugs and improve UX

### For Production:
1. Choose a hosting platform
2. Set up environment variables
3. Configure database (not local)
4. Set up custom domain
5. Enable SSL certificates
6. Configure monitoring

---

## 📞 Support

- **Documentation:** See `README.md`, `CSV_FEATURES_GUIDE.md`, `QUICK_START_CSV.md`
- **CSV Features:** See `CSV_FEATURES_GUIDE.md`
- **SeamlessAI Setup:** See `SEAMLESS_AI_SETUP.md`

---

## ✨ Summary

**Your application is now publicly accessible at:**
### https://long-streets-kneel.loca.lt

**Share this URL for testing!** 🚀

---

*Generated: January 12, 2026*
*Tunnel Type: Localtunnel*
*Local Port: 3000*
*Status: Active ✅*

