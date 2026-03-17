# 🚀 DigitalOcean Quick Start Guide

Fast deployment guide for your DigitalOcean droplet.

---

## ⚡ Quick Deployment (15 minutes)

### Step 1: Connect to Your Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### Step 2: Run Setup Script

```bash
# Upload the deployment script first, or copy-paste it
wget https://raw.githubusercontent.com/YOUR_REPO/deploy-digitalocean.sh
# OR copy the script content manually

chmod +x deploy-digitalocean.sh
sudo ./deploy-digitalocean.sh
```

### Step 3: Setup Database

```bash
sudo -u postgres psql
```

Then run:
```sql
CREATE DATABASE leadstorefront;
CREATE USER leaduser WITH PASSWORD 'YOUR_SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;
\q
```

### Step 4: Upload Your Application

**Option A: Using Git (Recommended)**
```bash
su - leadapp
cd ~
git clone YOUR_REPOSITORY_URL
cd LeadStorefrontAI
```

**Option B: Using SCP (from your local machine)**
```bash
# From your local machine:
scp -r /Users/user/Downloads/LeadStorefrontAI/* root@YOUR_DROPLET_IP:/home/leadapp/LeadStorefrontAI/
```

### Step 5: Install and Build

```bash
cd ~/LeadStorefrontAI
npm install
npm run build
```

### Step 6: Create .env File

```bash
nano .env
```

Add:
```env
DATABASE_URL=postgresql://leaduser:YOUR_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=your_api_key_here
SESSION_SECRET=your_random_secret_here
```

Save: `Ctrl+X`, `Y`, `Enter`

### Step 7: Setup Database Schema

```bash
npm run db:push
```

### Step 8: Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Follow the instructions shown
```

### Step 9: Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/leadstorefront
```

Copy content from `nginx-leadstorefront.conf` and replace `YOUR_DOMAIN.com` with your domain or IP.

Then:
```bash
sudo ln -s /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 10: Test!

Visit: `http://YOUR_DROPLET_IP` or `https://YOUR_DOMAIN.com`

---

## 🔒 SSL Setup (Optional but Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

---

## 📋 Checklist

- [ ] Connected to droplet
- [ ] Ran setup script
- [ ] Created database
- [ ] Uploaded application
- [ ] Installed dependencies
- [ ] Built application
- [ ] Created .env file
- [ ] Ran database migrations
- [ ] Started with PM2
- [ ] Configured Nginx
- [ ] Tested application
- [ ] Setup SSL (optional)

---

## 🛠️ Useful Commands

```bash
# View application logs
pm2 logs leadstorefront

# Restart application
pm2 restart leadstorefront

# Check status
pm2 status

# View Nginx logs
sudo tail -f /var/log/nginx/error.log
```

---

## 🆘 Troubleshooting

**App not starting?**
```bash
pm2 logs leadstorefront
```

**Database connection error?**
```bash
sudo systemctl status postgresql
```

**Nginx not working?**
```bash
sudo nginx -t
sudo systemctl status nginx
```

---

**See `DIGITALOCEAN_DEPLOYMENT.md` for detailed instructions!**


