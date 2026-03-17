# 🚀 Quick Deploy Instructions

## Step 1: Access Your Droplet Console

1. Go to https://cloud.digitalocean.com
2. Click on your droplet (138.197.82.122)
3. Click **"Access"** → **"Launch Droplet Console"**
4. You'll see a terminal window

---

## Step 2: Upload Files First

**From your Mac terminal, run:**

```bash
cd /Users/user/Downloads/LeadStorefrontAI
scp -r ./* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/
```

**When prompted for password:** Enter your DigitalOcean root password (or use SSH key if configured)

---

## Step 3: Run Deployment Script

**In the DigitalOcean Console, run:**

```bash
# Download and run the deployment script
curl -o /tmp/deploy.sh https://raw.githubusercontent.com/YOUR_REPO/deploy-on-droplet.sh
# OR copy-paste the script content

chmod +x /tmp/deploy.sh
/tmp/deploy.sh
```

**OR copy-paste this entire script into the console:**

```bash
#!/bin/bash
set -e

# Get SeamlessAI API key
SEAMLESS_KEY="JVyPWPgLsByKOTSERM7rcQh98npI1FPifFCul4qa030M3gGSxxjAao7o9gNo4SrUxOw4d4wkgNjItapSgFLbkmwQOrkALsd0CYqoPCsrze44oEt9pcjpis1cibQvOk6/EY5agNqGbZN7eYx96eem3S/e9p1AOUmuvS/K8AUosUaYDwsB"

# Generate passwords
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -hex 32)

echo "🚀 Starting deployment..."

# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs npm

# Install PM2
npm install -g pm2

# Install PostgreSQL
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Setup Database
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS leaduser;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"

# Install Nginx
apt install -y nginx

# Create app user
id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)

# Create directories
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Install dependencies (if files are uploaded)
if [ -d "/home/leadapp/LeadStorefrontAI" ] && [ -f "/home/leadapp/LeadStorefrontAI/package.json" ]; then
    cd /home/leadapp/LeadStorefrontAI
    sudo -u leadapp npm install
    sudo -u leadapp npm run build
    
    # Create .env
    sudo -u leadapp bash -c "cat > .env << EOF
DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
EOF"
    chmod 600 /home/leadapp/LeadStorefrontAI/.env
    
    # Run migrations
    sudo -u leadapp npm run db:push
    
    # Start PM2
    sudo -u leadapp pm2 start ecosystem.config.js
    sudo -u leadapp pm2 save
    sudo -u leadapp pm2 startup | tail -1 | bash 2>/dev/null || true
fi

# Configure Nginx
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
    }
}
EOF

ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Firewall
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force reload

echo "✅ Deployment complete! Visit http://138.197.82.122"
echo "Database password: $DB_PASSWORD"
```

---

## Alternative: Manual Step-by-Step

If the script doesn't work, see `DEPLOYMENT_COMMANDS.md` for step-by-step instructions.

---

## ✅ After Deployment

Visit: **http://138.197.82.122**

Your app should be live! 🎉


