# Vercel Deployment Guide

Complete guide to deploy your LeadStorefrontAI application on Vercel.

## Prerequisites

- GitHub account (recommended) or GitLab/Bitbucket
- Vercel account (sign up at [vercel.com](https://vercel.com))
- All your environment variables ready

## Important Notes

⚠️ **Vercel Considerations:**
- Vercel uses serverless functions, which have execution time limits (10s on free tier, 60s on Pro)
- WebSocket connections **DO NOT work** on Vercel (your app uses WebSockets for command center)
- Your Express app currently starts a server immediately, which needs modification for Vercel
- Long-running processes may need to be moved to background jobs
- File uploads are limited to 4.5MB on free tier
- **Recommended:** Use Railway for full-stack deployment, or split frontend/backend

✅ **Vercel Advantages:**
- Automatic SSL certificates
- Global CDN
- Easy custom domain setup
- Automatic deployments from Git
- Great performance for static sites and API routes

## Deployment Strategy Options

### Option 1: Railway (Recommended for Full-Stack)
Deploy the entire app on Railway - see `RAILWAY_DEPLOYMENT.md`

### Option 2: Hybrid (Vercel Frontend + Railway Backend)
- Deploy frontend on Vercel
- Deploy backend API on Railway
- Update frontend API URLs to point to Railway backend

### Option 3: Vercel Full-Stack (Requires Code Changes)
Modify `server/index.ts` to export the Express app instead of starting the server immediately. See instructions below.

---

## Option 3: Modify Code for Vercel (Advanced)

If you want to deploy the full-stack app on Vercel, you need to modify `server/index.ts`:

### Step 1: Modify server/index.ts

The current code starts the server immediately. For Vercel, we need to export the app:

```typescript
// At the end of server/index.ts, instead of:
(async () => {
  // ... existing code ...
  server.listen(port, "0.0.0.0", () => {
    // ...
  });
})();

// Export the app for Vercel:
export default app;

// Only start server if not in Vercel environment:
if (process.env.VERCEL !== '1') {
  (async () => {
    const server = await registerRoutes(app);
    // ... rest of server setup ...
    server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
      leadFreshnessService.startAutoUpdate();
      log(`Lead freshness service started`);
    });
  })();
}
```

**Note:** This is a significant change and may break Railway deployment. Consider using environment variables to detect the platform.

### Step 2: Create Vercel API Handler

Update `api/index.ts` to properly handle the Express app for Vercel.

---

## Step 1: Prepare Your Repository (Standard Deployment)

### Option A: Deploy from GitHub (Recommended)

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/leadstorefront.git
   git push -u origin main
   ```

2. **Make sure these files are in your repo:**
   - `vercel.json` (already created)
   - `package.json`
   - All source files

### Option B: Deploy via Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel:**
   ```bash
   vercel login
   ```

---

## Step 2: Create Vercel Project

### Via Web Dashboard (Recommended)

1. **Go to [vercel.com](https://vercel.com) and sign in**

2. **Click "Add New" → "Project"**

3. **Import your GitHub repository:**
   - Select your repository
   - Click "Import"

4. **Configure Project Settings:**
   - **Framework Preset:** Other
   - **Root Directory:** `./` (leave as default)
   - **Build Command:** `npm install && npm run build`
   - **Output Directory:** `dist/public` (for static files)
   - **Install Command:** `npm install`

5. **Add Environment Variables** (see Step 3 below)

6. **Click "Deploy"**

### Via CLI

```bash
cd /Users/user/Downloads/LeadStorefrontAI
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? **Your account**
- Link to existing project? **No**
- Project name? **leadstorefront** (or your choice)
- Directory? **./** (current directory)
- Override settings? **No**

---

## Step 3: Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables, add:

### Required Variables

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=your_postgresql_connection_string
STRIPE_SECRET_KEY=sk_live_... (or sk_test_... for testing)
VITE_STRIPE_PUBLIC_KEY=pk_live_... (or pk_test_... for testing)
SESSION_SECRET=generate_a_secure_random_string_here_min_32_chars
DEFAULT_OBJECT_STORAGE_BUCKET_ID=your_gcs_bucket_id
OPENAI_API_KEY=sk-...
OPENAI_API_BASE_URL=https://api.openai.com/v1
```

### Optional Variables (if used)

```env
PERPLEXITY_API_KEY=your_perplexity_key
GOOGLE_DRIVE_CLIENT_ID=your_google_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_google_client_secret
REPL_ID= (leave empty or remove)
REPLIT_DOMAINS= (leave empty or remove)
```

### Generate SESSION_SECRET

```bash
# On Mac/Linux
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Important:** 
- Add variables for **Production**, **Preview**, and **Development** environments
- Click "Save" after adding each variable

---

## Step 4: Update Vercel Configuration

The `vercel.json` file is already created, but you may need to adjust it based on your needs.

### Current Configuration

The `vercel.json` routes:
- `/api/*` → Serverless function (your Express API)
- `/*` → Static files from `dist/public`

### If You Need to Adjust Routes

Edit `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/dist/index.js"
    },
    {
      "src": "/(.*\\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot))",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      }
    },
    {
      "src": "/(.*)",
      "dest": "/dist/public/index.html"
    }
  ]
}
```

---

## Step 5: Handle Vercel-Specific Issues

### Issue 1: WebSocket Support

Vercel doesn't support WebSocket connections in serverless functions. If your app uses WebSockets:

**Solution A:** Disable WebSocket features for Vercel deployment
**Solution B:** Use Railway for the backend, Vercel for frontend only
**Solution C:** Use a separate WebSocket service (e.g., Pusher, Ably)

### Issue 2: File Upload Size Limits

Vercel has a 4.5MB limit for request body size on free tier.

**Solution:** Upload files directly to Google Cloud Storage from the client, or use a service like Cloudinary.

### Issue 3: Execution Time Limits

Serverless functions have time limits (10s free, 60s Pro).

**Solution:** Move long-running tasks to background jobs or use Vercel Cron Jobs.

### Issue 4: Static File Path

Update `server/vite.ts` if needed to ensure correct path:

The current setup should work, but verify that `dist/public` contains your built frontend.

---

## Step 6: Build Configuration

Vercel will automatically:
1. Run `npm install`
2. Run your build command: `npm run build`
3. Deploy the output

### Verify Build Output

After first deployment, check:
- `dist/index.js` exists (serverless function)
- `dist/public/index.html` exists (frontend)
- `dist/public/assets/` contains your JS/CSS files

---

## Step 7: Database Setup

### Option A: Use External PostgreSQL (Recommended)

1. **Neon** (neon.tech) - Free tier available
   - Sign up → Create project → Copy connection string
   - Use as `DATABASE_URL`

2. **Supabase** (supabase.com) - Free tier
   - Create project → Settings → Database → Connection string

3. **Railway PostgreSQL** - Can create alongside Railway deployment

### Run Migrations

After deployment, you can run migrations via Vercel CLI:

```bash
vercel env pull .env.local  # Get environment variables
npm run db:push
```

Or create a one-time migration script and run it manually.

---

## Step 8: Custom Domain Setup

### Add Domain in Vercel

1. **Go to Project → Settings → Domains**

2. **Add your domain:**
   - Enter: `yourdomain.com` and `www.yourdomain.com`
   - Click "Add"

3. **Vercel will show DNS records to add:**
   - Usually a CNAME record pointing to `cname.vercel-dns.com`
   - Or A records with IP addresses

### Configure GoDaddy DNS

1. **Log into GoDaddy → DNS Management**

2. **Add DNS Records:**

   **For root domain (yourdomain.com):**
   - Type: `A`
   - Name: `@`
   - Value: IP address from Vercel (if provided)
   - TTL: 3600

   **OR use CNAME (if Vercel supports it):**
   - Type: `CNAME`
   - Name: `@`
   - Value: `cname.vercel-dns.com` (or what Vercel provides)

   **For www subdomain:**
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com` (or Vercel's CNAME target)
   - TTL: 3600

3. **Wait for DNS propagation** (1-24 hours, usually 1-2 hours)

4. **Vercel will automatically provision SSL certificate** once DNS is verified

---

## Step 9: Post-Deployment

### 1. Run Database Migrations

```bash
# Option A: Via Vercel CLI
vercel env pull .env.local
npm run db:push

# Option B: Create a migration endpoint (one-time use)
# Add to your API routes, call it once, then remove
```

### 2. Seed Initial Data (if needed)

```bash
# If you have seed scripts
tsx server/seed.ts
```

### 3. Test Your Application

- ✅ Visit your Vercel URL (e.g., `your-app.vercel.app`)
- ✅ Test login/registration
- ✅ Test API endpoints
- ✅ Test file uploads (if applicable)
- ✅ Test payment flow (use Stripe test mode first)

### 4. Set Up Monitoring

- Vercel provides built-in analytics
- Check Function logs in Vercel Dashboard
- Set up error tracking (e.g., Sentry)

---

## Step 10: Continuous Deployment

Vercel automatically deploys when you push to your connected Git repository:

1. **Push to main branch** → Production deployment
2. **Push to other branches** → Preview deployment
3. **Create Pull Request** → Preview deployment with unique URL

### Environment-Specific Variables

You can set different environment variables for:
- **Production** (main branch)
- **Preview** (other branches/PRs)
- **Development** (local)

---

## Troubleshooting

### Build Fails

**Error: "Cannot find module"**
- Check `package.json` dependencies
- Ensure all dependencies are in `dependencies`, not just `devDependencies`

**Error: "Build command failed"**
- Check build logs in Vercel Dashboard
- Test build locally: `npm run build`
- Verify Node.js version (Vercel uses Node 18+ by default)

### Runtime Errors

**"Function execution timeout"**
- Move long-running tasks to background jobs
- Optimize database queries
- Consider upgrading to Pro plan (60s limit)

**"Module not found"**
- Check that all imports use correct paths
- Verify `dist/index.js` includes all dependencies

### API Routes Not Working

**404 on `/api/*` routes**
- Check `vercel.json` routing configuration
- Verify `dist/index.js` exists after build
- Check function logs in Vercel Dashboard

### Static Files Not Loading

**404 on assets**
- Verify `dist/public` contains built files
- Check `vite.config.ts` output directory
- Ensure build completes successfully

### Database Connection Issues

**"Connection refused" or timeout**
- Verify `DATABASE_URL` is correct
- Check database allows external connections
- Verify database firewall settings
- Test connection string locally

---

## Vercel CLI Commands

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# List deployments
vercel ls

# Pull environment variables
vercel env pull .env.local

# Open project in browser
vercel open
```

---

## Cost Considerations

### Free Tier Limits
- 100GB bandwidth/month
- 100 serverless function executions/day
- 10s function execution time
- 4.5MB request body size

### Pro Tier ($20/month)
- Unlimited bandwidth
- Unlimited function executions
- 60s function execution time
- 4.5MB request body size
- Team collaboration

---

## Next Steps

1. ✅ Deploy to Vercel
2. ✅ Set up custom domain
3. ✅ Configure environment variables
4. ✅ Run database migrations
5. ✅ Test all features
6. ✅ Set up monitoring
7. ✅ Configure backups

---

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Guide](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Custom Domains](https://vercel.com/docs/concepts/projects/domains)

---

**Need Help?** Check Vercel's documentation or community forums. Most issues are well-documented with solutions.

