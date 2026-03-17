# Quick Deployment Checklist

## Fastest Path: Railway + GoDaddy Domain

### 1. Deploy to Railway (5 minutes)
1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub" (or "Empty Project" to upload)
3. If uploading: Zip your project and upload it
4. Railway will auto-detect Node.js

### 2. Set Environment Variables in Railway
Go to your project → Variables tab → Add these:

```
NODE_ENV=production
PORT=5000
DATABASE_URL=your_postgresql_url
STRIPE_SECRET_KEY=your_stripe_secret
VITE_STRIPE_PUBLIC_KEY=your_stripe_public
SESSION_SECRET=generate_a_random_string_here
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your_bucket_id
OPENAI_API_KEY=your_openai_key
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

### 3. Get Database (if needed)
- **Neon** (neon.tech) - Free PostgreSQL
- **Supabase** (supabase.com) - Free PostgreSQL
- Copy connection string → Use as `DATABASE_URL`

### 4. Build Settings in Railway
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### 5. Point GoDaddy Domain
1. Log into GoDaddy → DNS Management
2. Find your Railway app URL (e.g., `your-app.railway.app`)
3. In GoDaddy DNS:
   - Add CNAME record:
     - Name: `www`
     - Value: `your-app.railway.app`
   - Or add A record (get IP from Railway settings)

### 6. Add Custom Domain in Railway
1. Railway project → Settings → Domains
2. Add your GoDaddy domain
3. Railway will provide SSL automatically

### 7. Run Database Migrations
In Railway, go to your service → Deployments → Click on a deployment → Open shell:
```bash
npm run db:push
```

### 8. Test
Visit your domain - it should work! 🎉

---

## Alternative: Render.com

1. Sign up at [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub or upload code
4. Settings:
   - Build: `npm install && npm run build`
   - Start: `npm start`
5. Add environment variables
6. Deploy
7. Point GoDaddy domain (same as Railway steps)

---

## What You Need

- ✅ GoDaddy domain
- ✅ PostgreSQL database (Neon/Supabase free tier works)
- ✅ Stripe account (for payments)
- ✅ OpenAI API key (for AI features)
- ✅ Google Cloud Storage bucket (for file storage)

---

## Common Issues

**"Application Error"**
→ Check Railway/Render logs
→ Verify all environment variables are set

**"Database connection failed"**
→ Check DATABASE_URL is correct
→ Verify database allows external connections

**"Domain not working"**
→ Wait 1-2 hours for DNS propagation
→ Check DNS records are correct

---

**Full guide**: See `GODADDY_DEPLOYMENT_GUIDE.md` for detailed instructions.


