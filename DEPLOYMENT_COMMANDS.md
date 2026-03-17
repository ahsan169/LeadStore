# 🚀 Manual Deployment Commands

If the automated script doesn't work, run these commands manually on your droplet.

**Droplet IP:** 138.197.82.122

---

## Step 1: Connect to Your Droplet

### Option A: DigitalOcean Console (Easiest)
1. Go to https://cloud.digitalocean.com
2. Click on your droplet
3. Click **"Access"** → **"Launch Droplet Console"**
4. You'll be logged in as `root`

### Option B: SSH from Terminal
```bash
ssh root@138.197.82.122
```

---

## Step 2: Run These Commands on Your Droplet

Copy and paste each section one at a time:

### 2.1 Update System
```bash
apt update && apt upgrade -y
```

### 2.2 Install Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # Should show v20.x.x
```

### 2.3 Install PM2
```bash
npm install -g pm2
```

### 2.4 Install PostgreSQL
```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
```

### 2.5 Setup Database
```bash
# Create database
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;"

# Create user (replace YOUR_PASSWORD with a secure password)
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD 'YOUR_PASSWORD_HERE';"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
```

### 2.6 Install Nginx
```bash
apt install -y nginx
```

### 2.7 Create Application User
```bash
adduser --disabled-password --gecos "" leadapp
usermod -aG sudo leadapp
```

### 2.8 Create Directories
```bash
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI
```

---

## Step 3: Upload Your Application

### Option A: Using SCP (from your local machine)
```bash
# From your Mac terminal:
cd /Users/user/Downloads/LeadStorefrontAI
scp -r ./* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/
```

### Option B: Using Git (if you have a repo)
```bash
# On the droplet:
su - leadapp
cd ~
git clone YOUR_REPOSITORY_URL
cd LeadStorefrontAI
```

---

## Step 4: Install and Build

```bash
# Switch to app user
su - leadapp
cd ~/LeadStorefrontAI

# Install dependencies
npm install

# Build application
npm run build
```

---

## Step 5: Create .env File

```bash
nano .env
```

Paste this (replace with your actual values):
```env
DATABASE_URL=postgresql://leaduser:YOUR_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=your_seamless_api_key_here
SESSION_SECRET=your_random_secret_here
```

Save: `Ctrl+X`, then `Y`, then `Enter`

Secure the file:
```bash
chmod 600 .env
```

---

## Step 6: Run Database Migrations

```bash
npm run db:push
```

---

## Step 7: Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Follow the instructions shown
```

---

## Step 8: Configure Nginx

```bash
# Switch back to root
exit

# Create Nginx config
cat > /etc/nginx/sites-available/leadstorefront << 'EOF'
server {
    listen 80;
    server_name 138.197.82.122;

    client_max_body_size 10M;

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
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and restart
nginx -t
systemctl restart nginx
systemctl enable nginx
```

---

## Step 9: Configure Firewall

```bash
ufw enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw reload
```

---

## Step 10: Test!

Visit: **http://138.197.82.122**

---

## 🔧 Useful Commands

```bash
# View application logs
pm2 logs leadstorefront

# Restart application
pm2 restart leadstorefront

# Check status
pm2 status

# View Nginx logs
tail -f /var/log/nginx/error.log
```

---

## ✅ Done!

Your application should now be live at **http://138.197.82.122**


