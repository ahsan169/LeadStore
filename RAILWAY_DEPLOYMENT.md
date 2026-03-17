# Railway Deployment Guide

Complete guide to deploy your LeadStorefrontAI application on Railway.

## Prerequisites

- GitHub account (recommended) or GitLab
- Railway account (sign up at [railway.app](https://railway.app))
- All your environment variables ready

## Important Notes

✅ **Railway Advantages:**
- Full Node.js support (no serverless limitations)
- WebSocket support
- PostgreSQL database available
- Simple deployment process
- Automatic SSL certificates
- Custom domain support
- Persistent storage
- No execution time limits

---

## Step 1: Prepare Your Repository

### Push to GitHub

1. **Initialize Git (if not already):**
   ```bash
   cd /Users/user/Downloads/LeadStorefrontAI
   git init
   git add .
   git commit -m "Initial commit for Railway deployment"
   ```

2. **Create GitHub repository:**
   - Go to [github.com](https://github.com) → New repository
   - Name it (e.g., `leadstorefront`)
   - Don't initialize with README
   - Click "Create repository"

3. **Push your code:**
   ```bash
   git remote add origin https://github.com/yourusername/leadstorefront.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Create Railway Project

### Via Web Dashboard

1. **Go to [railway.app](https://railway.app) and sign in**
   - Sign in with GitHub (recommended)

2. **Click "New Project"**

3. **Select "Deploy from GitHub repo"**
   - Authorize Railway to access your GitHub if prompted
   - Select your repository: `leadstorefront` (or your repo name)
   - Click "Deploy Now"

4. **Railway will automatically:**
   - Detect Node.js
   - Start building your project
   - Create a deployment

### Alternative: Deploy from CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd /Users/user/Downloads/LeadStorefrontAI
railway init

# Deploy
railway up
```

---

## Step 3: Configure Build Settings

Railway usually auto-detects Node.js projects, but verify settings:

1. **Go to your project → Service → Settings**

2. **Build & Deploy Settings:**
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Root Directory:** `./` (leave as default)

3. **If using Procfile** (already created):
   - Railway will use: `web: npm start`
   - This is correct for your setup

---

## Step 4: Set Up PostgreSQL Database

### Option A: Railway PostgreSQL (Recommended)

1. **In your Railway project, click "+ New"**

2. **Select "Database" → "Add PostgreSQL"**

3. **Railway will:**
   - Create a PostgreSQL database
   - Automatically add `DATABASE_URL` environment variable
   - Provide connection details

4. **The `DATABASE_URL` is automatically available** to your service

### Option B: External Database

If using external database (Neon, Supabase, etc.):

1. **Get connection string** from your database provider
2. **Add as environment variable** (see Step 5)

---

## Step 5: Configure Environment Variables

### Add Environment Variables

1. **Go to your Service → Variables tab**

2. **Add the following variables:**

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://... (auto-added if using Railway PostgreSQL)
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
```

### Generate SESSION_SECRET

```bash
# On Mac/Linux
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Reference Other Services

If you have multiple services in Railway:
- Click "Reference Variable" to reference variables from other services
- Useful for `DATABASE_URL` from PostgreSQL service

---

## Step 6: Run Database Migrations

### Option A: Via Railway CLI

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Link to your project:**
   ```bash
   railway link
   # Select your project
   ```

4. **Run migrations:**
   ```bash
   railway run npm run db:push
   ```

### Option B: Via Railway Dashboard

1. **Go to your service → Deployments**

2. **Click on latest deployment → View Logs**

3. **Open Shell/Terminal** (if available)

4. **Run:**
   ```bash
   npm run db:push
   ```

### Option C: One-Time Migration Script

Create a temporary migration endpoint in your API, call it once, then remove it.

---

## Step 7: Custom Domain Setup

### Add Domain in Railway

1. **Go to your Service → Settings → Networking**

2. **Click "Generate Domain"** (for Railway domain) OR

3. **Click "Custom Domain"** → Enter your domain:
   - `yourdomain.com`
   - `www.yourdomain.com`

4. **Railway will show DNS records to add**

### Configure GoDaddy DNS

1. **Log into GoDaddy → DNS Management**

2. **Add DNS Records:**

   **For root domain (yourdomain.com):**
   - Type: `CNAME`
   - Name: `@` (or leave blank)
   - Value: Railway's CNAME target (e.g., `your-app.up.railway.app`)
   - TTL: 3600

   **OR if Railway provides A records:**
   - Type: `A`
   - Name: `@`
   - Value: IP address from Railway
   - TTL: 3600

   **For www subdomain:**
   - Type: `CNAME`
   - Name: `www`
   - Value: Railway's CNAME target
   - TTL: 3600

3. **Wait for DNS propagation** (1-24 hours, usually 1-2 hours)

4. **Railway will automatically provision SSL certificate** once DNS is verified

### Verify Domain

- Railway will show "Pending" until DNS propagates
- Once verified, status changes to "Active"
- SSL certificate is automatically provisioned

---

## Step 8: Monitor Deployment

### View Logs

1. **Go to your Service → Deployments**

2. **Click on a deployment** → View logs

3. **Check for:**
   - Build success
   - Application starting
   - Port binding (should show "serving on port 5000")
   - Any errors

### Common Log Messages

✅ **Success:**
```
serving on port 5000
Lead freshness service started
```

❌ **Errors to watch for:**
- Database connection errors
- Missing environment variables
- Port binding issues
- Build failures

---

## Step 9: Post-Deployment Checklist

- [ ] Application builds successfully
- [ ] All environment variables are set
- [ ] Database is connected
- [ ] Migrations are run (`npm run db:push`)
- [ ] Application starts without errors
- [ ] Custom domain is configured
- [ ] SSL certificate is active
- [ ] Application is accessible via domain
- [ ] Test login/registration
- [ ] Test API endpoints
- [ ] Test file uploads
- [ ] Test payment flow (Stripe test mode)

---

## Step 10: Continuous Deployment

Railway automatically deploys when you push to your connected repository:

1. **Push to main branch** → Automatic deployment
2. **Railway detects changes** → Starts new build
3. **Build completes** → Deploys new version
4. **Zero-downtime deployment** (usually)

### Manual Deployment

```bash
railway up
```

### Rollback

1. **Go to Deployments**
2. **Click on previous deployment**
3. **Click "Redeploy"**

---

## Railway CLI Commands

```bash
# Login
railway login

# Link to project
railway link

# View logs
railway logs

# Run command in Railway environment
railway run <command>

# Example: Run migrations
railway run npm run db:push

# Example: Run seed script
railway run tsx server/seed.ts

# Open project in browser
railway open

# View environment variables
railway variables

# Add environment variable
railway variables set KEY=value

# Deploy
railway up
```

---

## Troubleshooting

### Build Fails

**Error: "Cannot find module"**
- Check `package.json` dependencies
- Verify all dependencies are listed
- Check Node.js version (Railway uses Node 18+)

**Error: "Build command failed"**
- Check build logs
- Test build locally: `npm run build`
- Verify all environment variables are set

### Application Won't Start

**Error: "Port already in use"**
- Railway sets `PORT` automatically
- Your app should use `process.env.PORT || 5000` ✅ (already configured)

**Error: "Database connection failed"**
- Verify `DATABASE_URL` is set
- Check database is running (if Railway PostgreSQL)
- Verify connection string format
- Check database firewall settings

**Error: "Missing environment variable"**
- Check all required variables are set
- Verify variable names match exactly
- Check for typos

### Domain Not Working

**"Domain not verified"**
- Wait for DNS propagation (can take 24 hours)
- Verify DNS records are correct
- Check Railway domain settings

**"SSL certificate pending"**
- Wait for DNS to fully propagate
- Verify domain is correctly configured
- Check Railway SSL status

### Performance Issues

**Slow response times**
- Check Railway service logs
- Verify database connection pooling
- Check for N+1 queries
- Consider upgrading Railway plan

---

## Cost Considerations

### Free Trial
- $5 free credit
- Expires after 30 days or when credit runs out

### Hobby Plan ($5/month)
- $5 credit included
- Pay-as-you-go for usage
- Good for small projects

### Pro Plan ($20/month)
- $20 credit included
- Better for production apps
- More resources

### Usage-Based Pricing
- Compute: ~$0.000463/GB-second
- Database: Included with PostgreSQL service
- Bandwidth: Included

**Tip:** Monitor usage in Railway Dashboard → Usage tab

---

## Advanced Configuration

### Multiple Services

If you need separate services:
1. **Frontend service** (React app)
2. **Backend service** (API)
3. **Database service** (PostgreSQL)

Railway supports multiple services in one project.

### Environment-Specific Deployments

1. **Create separate projects** for staging/production
2. **Or use branches** with different environment variables
3. **Or use Railway environments** feature

### Persistent Storage

Railway provides persistent storage:
- Files uploaded persist across deployments
- Use for file storage if needed
- Or continue using Google Cloud Storage

---

## Database Management

### Access Database

```bash
# Via Railway CLI
railway connect postgres

# Or use connection string
psql $DATABASE_URL
```

### Run Migrations

```bash
railway run npm run db:push
```

### Backup Database

Railway PostgreSQL includes automatic backups, or:
```bash
# Export database
railway run pg_dump $DATABASE_URL > backup.sql
```

---

## Monitoring & Logs

### View Logs

1. **Dashboard:** Service → Deployments → View Logs
2. **CLI:** `railway logs`
3. **Stream logs:** `railway logs --follow`

### Metrics

Railway provides:
- CPU usage
- Memory usage
- Network traffic
- Request metrics

View in: Service → Metrics

---

## Next Steps

1. ✅ Deploy to Railway
2. ✅ Set up PostgreSQL database
3. ✅ Configure environment variables
4. ✅ Run database migrations
5. ✅ Set up custom domain
6. ✅ Test all features
7. ✅ Set up monitoring
8. ✅ Configure backups

---

## Additional Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway CLI Reference](https://docs.railway.app/develop/cli)
- [Railway PostgreSQL Guide](https://docs.railway.app/databases/postgresql)
- [Railway Custom Domains](https://docs.railway.app/deploy/custom-domains)

---

## Quick Reference

```bash
# Deploy
railway up

# View logs
railway logs

# Run migrations
railway run npm run db:push

# Add environment variable
railway variables set KEY=value

# Open in browser
railway open
```

---

**Need Help?** Check Railway's documentation or Discord community. Railway has excellent support and documentation.


