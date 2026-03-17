# GoDaddy Deployment Guide

This guide will help you deploy your LeadStorefrontAI application using your GoDaddy domain. Since this is a Node.js application, you have a few options depending on your GoDaddy hosting plan.

## Important Note

**GoDaddy shared hosting (cPanel) does NOT support Node.js applications.** You'll need to use one of these approaches:

1. **Recommended**: Host the app on a Node.js platform and point your GoDaddy domain to it
2. **Alternative**: Use GoDaddy VPS/Dedicated Server (if you have one)

---

## Option 1: Host on Node.js Platform + Point GoDaddy Domain (RECOMMENDED)

This is the easiest and most reliable option. We'll host your app on a platform that supports Node.js, then connect your GoDaddy domain.

### Step 1: Choose a Hosting Platform

Popular options (all support Node.js):
- **Railway** (railway.app) - Easy setup, free tier available
- **Render** (render.com) - Free tier, easy deployment
- **Vercel** (vercel.com) - Great for frontend, supports full-stack
- **Fly.io** (fly.io) - Good performance
- **DigitalOcean App Platform** - Reliable, paid plans

### Step 2: Prepare Your Application

1. **Build your application:**
   ```bash
   npm run build
   ```

2. **Create a `.env` file** with your production environment variables:
   ```env
   NODE_ENV=production
   PORT=5000
   DATABASE_URL=your_postgresql_connection_string
   STRIPE_SECRET_KEY=your_stripe_secret_key
   VITE_STRIPE_PUBLIC_KEY=your_stripe_public_key
   SESSION_SECRET=your_secure_random_string_here
   DEFAULT_OBJECT_STORAGE_BUCKET_ID=your_gcs_bucket_id
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_API_BASE_URL=https://api.openai.com/v1
   ```

3. **Create a `Procfile`** (for platforms like Railway/Render):
   ```
   web: npm start
   ```

### Step 3: Deploy to Hosting Platform

#### For Railway:
1. Sign up at railway.app
2. Click "New Project" → "Deploy from GitHub repo" (or upload your code)
3. Add environment variables in the "Variables" tab
4. Railway will automatically detect Node.js and deploy
5. Your app will get a URL like: `your-app.railway.app`

#### For Render:
1. Sign up at render.com
2. Click "New" → "Web Service"
3. Connect your GitHub repo or upload code
4. Set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. Add environment variables in the "Environment" section
6. Deploy - you'll get a URL like: `your-app.onrender.com`

### Step 4: Point Your GoDaddy Domain

1. **Log into GoDaddy** and go to your domain management
2. **Find DNS Settings** (usually under "DNS" or "Manage DNS")
3. **Add/Edit DNS Records:**

   **Option A: Use A Record (for root domain like yourdomain.com)**
   - Type: `A`
   - Name: `@` (or leave blank)
   - Value: Get the IP address from your hosting platform
     - Railway: Check your service settings for IP
     - Render: Use the IP shown in your service dashboard
   - TTL: 3600 (or default)

   **Option B: Use CNAME (for subdomain like www.yourdomain.com)**
   - Type: `CNAME`
   - Name: `www` (or your subdomain)
   - Value: `your-app.railway.app` (or your hosting platform URL)
   - TTL: 3600

   **Option C: Use CNAME for root domain (if platform supports it)**
   - Some platforms provide a CNAME target for root domains
   - Check your hosting platform's DNS documentation

4. **Wait for DNS propagation** (can take 1-24 hours, usually 1-2 hours)

5. **Configure SSL/HTTPS** on your hosting platform:
   - Most platforms automatically provide SSL certificates
   - Railway: Automatic SSL
   - Render: Automatic SSL (may need to add custom domain in settings)

### Step 5: Update Your Application

If your hosting platform provides a custom domain feature:
1. Add your GoDaddy domain in the platform's domain settings
2. Follow the platform's instructions to verify domain ownership
3. The platform will handle SSL certificate automatically

---

## Option 2: Deploy on GoDaddy VPS (If You Have One)

If you have a GoDaddy VPS or Dedicated Server, you can host directly there.

### Prerequisites
- GoDaddy VPS/Dedicated Server with SSH access
- Node.js 18+ installed
- PostgreSQL database (can be on same server or external)
- PM2 or similar process manager

### Step 1: Connect to Your Server

```bash
ssh your-username@your-server-ip
```

### Step 2: Install Node.js (if not installed)

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### Step 3: Install PostgreSQL (if needed)

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 4: Upload Your Application

**Option A: Using Git**
```bash
cd /var/www  # or your preferred directory
git clone your-repository-url
cd LeadStorefrontAI
npm install
```

**Option B: Using SCP (from your local machine)**
```bash
scp -r /Users/user/Downloads/LeadStorefrontAI your-username@your-server-ip:/var/www/
```

### Step 5: Set Up Environment Variables

```bash
cd /var/www/LeadStorefrontAI
nano .env
```

Add all your environment variables (see Step 2 in Option 1).

### Step 6: Build and Set Up Process Manager

```bash
# Install PM2 globally
sudo npm install -g pm2

# Build the application
npm run build

# Start the application with PM2
pm2 start dist/index.js --name leadstorefront

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot
pm2 startup
# Follow the instructions it provides
```

### Step 7: Set Up Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt-get install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/leadstorefront
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
```

### Step 8: Set Up SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will automatically configure Nginx and renew certificates
```

### Step 9: Configure GoDaddy DNS

1. Log into GoDaddy
2. Go to DNS Management
3. Set A record:
   - Type: `A`
   - Name: `@`
   - Value: Your server's IP address
   - TTL: 3600
4. Set CNAME for www:
   - Type: `CNAME`
   - Name: `www`
   - Value: `yourdomain.com`
   - TTL: 3600

---

## Database Setup

You'll need a PostgreSQL database. Options:

1. **External Database Service** (Recommended):
   - Neon (neon.tech) - Free tier available
   - Supabase (supabase.com) - Free tier
   - Railway PostgreSQL
   - Render PostgreSQL

2. **On Your VPS** (if using Option 2):
   - Install PostgreSQL on the same server
   - Create database and user
   - Update `DATABASE_URL` in your `.env`

### Setting Up External Database (Neon/Supabase):

1. Sign up for Neon or Supabase
2. Create a new project/database
3. Copy the connection string
4. Update your `DATABASE_URL` environment variable
5. Run migrations:
   ```bash
   npm run db:push
   ```

---

## Post-Deployment Checklist

- [ ] Application builds successfully
- [ ] All environment variables are set
- [ ] Database is connected and migrations are run
- [ ] Domain DNS is configured correctly
- [ ] SSL certificate is active (HTTPS works)
- [ ] Application is accessible via your domain
- [ ] Test login/registration
- [ ] Test payment flow (if applicable)
- [ ] Set up monitoring/logging (optional)

---

## Troubleshooting

### DNS Not Working
- Wait 24-48 hours for full propagation
- Use `dig yourdomain.com` or `nslookup yourdomain.com` to check
- Clear your DNS cache: `sudo dscacheutil -flushcache` (Mac)

### Application Not Starting
- Check logs: `pm2 logs` (if using PM2)
- Verify environment variables are set
- Check database connection
- Ensure port 5000 is not blocked by firewall

### SSL Issues
- Ensure DNS is pointing correctly before requesting SSL
- Check that port 443 is open in firewall
- Verify Certbot configuration

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check database firewall allows connections
- Ensure database is running

---

## Support Resources

- **Railway Docs**: https://docs.railway.app
- **Render Docs**: https://render.com/docs
- **GoDaddy DNS Help**: https://www.godaddy.com/help/manage-dns-680
- **PM2 Docs**: https://pm2.keymetrics.io/docs/usage/quick-start/

---

## Quick Start Commands Summary

```bash
# Build application
npm run build

# Start in production (after build)
npm start

# With PM2
pm2 start dist/index.js --name leadstorefront
pm2 save
pm2 startup

# Check status
pm2 status
pm2 logs

# Database migrations
npm run db:push
```

---

**Need Help?** If you run into issues, check the hosting platform's documentation or support forums. Most platforms have excellent documentation and community support.


