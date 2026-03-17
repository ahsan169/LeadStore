# 🚀 DigitalOcean Deployment Guide

Complete step-by-step guide to deploy your LeadStorefrontAI application on a DigitalOcean droplet.

---

## 📋 Prerequisites

- ✅ DigitalOcean droplet purchased
- ✅ SSH access to your droplet
- ✅ Domain name (optional, but recommended)
- ✅ Your `.env` file with API keys

---

## 🔧 Step 1: Initial Server Setup

### 1.1 Connect to Your Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

Replace `YOUR_DROPLET_IP` with your actual droplet IP address.

### 1.2 Update System Packages

```bash
apt update && apt upgrade -y
```

### 1.3 Install Essential Tools

```bash
apt install -y curl wget git build-essential
```

---

## 📦 Step 2: Install Node.js and npm

### 2.1 Install Node.js 20.x (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

### 2.2 Verify Installation

```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 2.3 Install PM2 (Process Manager)

```bash
npm install -g pm2
```

---

## 🗄️ Step 3: Install PostgreSQL

### 3.1 Install PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
```

### 3.2 Start PostgreSQL

```bash
systemctl start postgresql
systemctl enable postgresql
```

### 3.3 Create Database and User

```bash
sudo -u postgres psql
```

Then in PostgreSQL prompt:

```sql
CREATE DATABASE leadstorefront;
CREATE USER leaduser WITH PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;
\q
```

**Remember your password!** You'll need it for `DATABASE_URL`.

---

## 👤 Step 4: Create Application User

### 4.1 Create Non-Root User

```bash
adduser leadapp
usermod -aG sudo leadapp
```

### 4.2 Switch to Application User

```bash
su - leadapp
```

---

## 📥 Step 5: Deploy Your Application

### 5.1 Clone Your Repository

```bash
cd ~
git clone YOUR_REPOSITORY_URL
cd LeadStorefrontAI
```

**OR** if you don't have a Git repo, upload files via SCP:

```bash
# From your local machine:
scp -r /Users/user/Downloads/LeadStorefrontAI/* root@YOUR_DROPLET_IP:/home/leadapp/LeadStorefrontAI/
```

### 5.2 Install Dependencies

```bash
cd ~/LeadStorefrontAI
npm install
```

### 5.3 Build the Application

```bash
npm run build
```

---

## 🔐 Step 6: Configure Environment Variables

### 6.1 Create `.env` File

```bash
nano ~/LeadStorefrontAI/.env
```

### 6.2 Add Your Environment Variables

```env
# Database
DATABASE_URL=postgresql://leaduser:YOUR_SECURE_PASSWORD@localhost:5432/leadstorefront

# Server
PORT=3000
NODE_ENV=production

# SeamlessAI
SEAMLESS_API_KEY=your_seamless_api_key_here

# Add any other environment variables you need
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

### 6.3 Secure the .env File

```bash
chmod 600 ~/LeadStorefrontAI/.env
```

---

## 🗄️ Step 7: Setup Database Schema

### 7.1 Run Database Migrations

```bash
cd ~/LeadStorefrontAI
npm run db:push
```

This will create all necessary tables in your PostgreSQL database.

---

## 🚀 Step 8: Start Application with PM2

### 8.1 Create PM2 Ecosystem File

```bash
nano ~/LeadStorefrontAI/ecosystem.config.js
```

Add this content:

```javascript
module.exports = {
  apps: [{
    name: 'leadstorefront',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G'
  }]
};
```

### 8.2 Create Logs Directory

```bash
mkdir -p ~/LeadStorefrontAI/logs
```

### 8.3 Start Application

```bash
cd ~/LeadStorefrontAI
pm2 start ecosystem.config.js
```

### 8.4 Save PM2 Configuration

```bash
pm2 save
pm2 startup
```

Follow the instructions to enable PM2 on system startup.

### 8.5 Check Application Status

```bash
pm2 status
pm2 logs leadstorefront
```

---

## 🌐 Step 9: Install and Configure Nginx

### 9.1 Install Nginx

```bash
sudo apt install -y nginx
```

### 9.2 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/leadstorefront
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com www.YOUR_DOMAIN.com;

    # If no domain, use your droplet IP
    # server_name YOUR_DROPLET_IP;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase timeouts for long-running requests
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
}
```

**Replace `YOUR_DOMAIN.com` with your actual domain, or use your droplet IP.**

### 9.3 Enable the Site

```bash
sudo ln -s /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 🔒 Step 10: Setup SSL with Let's Encrypt (Optional but Recommended)

### 10.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 10.2 Get SSL Certificate

```bash
sudo certbot --nginx -d YOUR_DOMAIN.com -d www.YOUR_DOMAIN.com
```

Follow the prompts. Certbot will automatically configure Nginx for HTTPS.

### 10.3 Auto-Renewal

Certbot sets up auto-renewal automatically. Test it:

```bash
sudo certbot renew --dry-run
```

---

## 🔥 Step 11: Configure Firewall

### 11.1 Setup UFW Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### 11.2 Check Firewall Status

```bash
sudo ufw status
```

---

## 📊 Step 12: Verify Deployment

### 12.1 Check Application

```bash
pm2 status
pm2 logs leadstorefront --lines 50
```

### 12.2 Test Locally on Server

```bash
curl http://localhost:3000
```

### 12.3 Test from Browser

- **With domain:** `https://YOUR_DOMAIN.com`
- **Without domain:** `http://YOUR_DROPLET_IP`

---

## 🔄 Step 13: Domain Configuration (If Using Domain)

### 13.1 DNS Settings

In your domain registrar (GoDaddy, Namecheap, etc.):

1. Go to DNS settings
2. Add/Edit A record:
   - **Type:** A
   - **Name:** @ (or leave blank)
   - **Value:** YOUR_DROPLET_IP
   - **TTL:** 3600

3. Add CNAME for www:
   - **Type:** CNAME
   - **Name:** www
   - **Value:** YOUR_DOMAIN.com
   - **TTL:** 3600

### 13.2 Wait for DNS Propagation

DNS changes can take 5 minutes to 48 hours. Usually 15-30 minutes.

---

## 🛠️ Step 14: Useful Commands

### Application Management

```bash
# View application status
pm2 status

# View logs
pm2 logs leadstorefront

# Restart application
pm2 restart leadstorefront

# Stop application
pm2 stop leadstorefront

# View real-time logs
pm2 logs leadstorefront --lines 100

# Monitor resources
pm2 monit
```

### Database Management

```bash
# Connect to PostgreSQL
sudo -u postgres psql -d leadstorefront

# Backup database
pg_dump -U leaduser leadstorefront > backup.sql

# Restore database
psql -U leaduser leadstorefront < backup.sql
```

### Nginx Management

```bash
# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Restart Nginx
sudo systemctl restart nginx

# View Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

---

## 🔧 Troubleshooting

### Application Not Starting

```bash
# Check PM2 logs
pm2 logs leadstorefront

# Check if port is in use
sudo lsof -i :3000

# Restart PM2
pm2 restart leadstorefront
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
psql -U leaduser -d leadstorefront -h localhost

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Nginx Issues

```bash
# Check Nginx status
sudo systemctl status nginx

# Test configuration
sudo nginx -t

# View error logs
sudo tail -f /var/log/nginx/error.log
```

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process (replace PID)
sudo kill -9 PID
```

---

## 📝 Step 15: Update Application

### 15.1 Pull Latest Changes

```bash
cd ~/LeadStorefrontAI
git pull origin main  # or your branch name
```

### 15.2 Rebuild and Restart

```bash
npm install
npm run build
pm2 restart leadstorefront
```

---

## 🔐 Security Best Practices

### 1. Keep System Updated

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Use Strong Passwords

- Database password
- User passwords
- API keys

### 3. Regular Backups

```bash
# Backup database daily
0 2 * * * pg_dump -U leaduser leadstorefront > /backups/db-$(date +\%Y\%m\%d).sql
```

### 4. Monitor Logs

```bash
# Set up log rotation
pm2 install pm2-logrotate
```

### 5. Firewall Rules

Only allow necessary ports:
- 22 (SSH)
- 80 (HTTP)
- 443 (HTTPS)

---

## 📊 Monitoring

### PM2 Monitoring

```bash
# Install PM2 monitoring
pm2 install pm2-server-monit

# View monitoring dashboard
pm2 monit
```

### System Resources

```bash
# CPU and Memory
htop

# Disk usage
df -h

# Network
iftop
```

---

## 🎯 Quick Deployment Checklist

- [ ] Connect to droplet via SSH
- [ ] Update system packages
- [ ] Install Node.js 20.x
- [ ] Install PostgreSQL
- [ ] Create database and user
- [ ] Clone/upload application
- [ ] Install dependencies (`npm install`)
- [ ] Build application (`npm run build`)
- [ ] Create `.env` file with all variables
- [ ] Run database migrations (`npm run db:push`)
- [ ] Start with PM2
- [ ] Configure Nginx
- [ ] Setup SSL (optional)
- [ ] Configure firewall
- [ ] Test application
- [ ] Configure domain DNS (if using domain)

---

## 🚀 Quick Start Script

Save this as `deploy.sh` and run it:

```bash
#!/bin/bash

# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Install PM2
npm install -g pm2

# Install Nginx
apt install -y nginx

# Create database (you'll need to set password)
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;"
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD 'CHANGE_THIS';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"

echo "✅ Basic setup complete!"
echo "📝 Next steps:"
echo "1. Upload your application files"
echo "2. Create .env file"
echo "3. Run: npm install && npm run build"
echo "4. Run: npm run db:push"
echo "5. Start with PM2"
```

---

## 📞 Support

If you encounter issues:

1. Check PM2 logs: `pm2 logs leadstorefront`
2. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Check system resources: `htop`
4. Verify environment variables: `cat .env`

---

## ✅ Success!

Once deployed, your application will be accessible at:
- **With domain:** `https://YOUR_DOMAIN.com`
- **Without domain:** `http://YOUR_DROPLET_IP`

**Your LeadStorefrontAI application is now live on DigitalOcean! 🎉**


