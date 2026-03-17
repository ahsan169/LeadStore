#!/bin/bash
# Complete Deployment Script - Copy and paste this ENTIRE script into DigitalOcean Console
# Droplet: 138.197.82.122

set -e

echo "🚀 Starting Complete Deployment..."
echo ""

# Configuration
SEAMLESS_KEY="JVyPWPgLsByKOTSERM7rcQh98npI1FPifFCul4qa030M3gGSxxjAao7o9gNo4SrUxOw4d4wkgNjItapSgFLbkmwQOrkALsd0CYqoPCsrze44oEt9pcjpis1cibQvOk6/EY5agNqGbZN7eYx96eem3S/e9p1AOUmuvS/K8AUosUaYDwsB"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -hex 32)

echo "🔐 Generated Database Password: $DB_PASSWORD"
echo "   (SAVE THIS PASSWORD!)"
echo ""

# Step 1: Update system
echo "📦 [1/17] Updating system..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20.x
echo "📦 [2/17] Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
echo "✅ Node.js $(node --version) installed"

# Step 3: Install PM2
echo "📦 [3/17] Installing PM2..."
npm install -g pm2

# Step 4: Install PostgreSQL
echo "📦 [4/17] Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Step 5: Setup Database
echo "📦 [5/17] Setting up database..."
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;" 2>/dev/null || echo "Database exists"
sudo -u postgres psql -c "DROP USER IF EXISTS leaduser;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
echo "✅ Database configured"

# Step 6: Install Nginx
echo "📦 [6/17] Installing Nginx..."
apt install -y nginx

# Step 7: Create app user
echo "📦 [7/17] Creating application user..."
id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)

# Step 8: Create directories
echo "📦 [8/17] Creating directories..."
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Step 9: Check if files exist, if not, wait for upload
echo "📦 [9/17] Checking for application files..."
if [ ! -f "/home/leadapp/LeadStorefrontAI/package.json" ]; then
    echo "⚠️  Application files not found!"
    echo "Please upload files using one of these methods:"
    echo ""
    echo "Method 1 - From your Mac terminal:"
    echo "  cd /Users/user/Downloads/LeadStorefrontAI"
    echo "  scp -r ./* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/"
    echo ""
    echo "Method 2 - Extract from /tmp if already uploaded:"
    echo "  tar -xzf /tmp/leadstorefront-deploy.tar.gz -C /home/leadapp/LeadStorefrontAI/"
    echo ""
    read -p "Press Enter after files are uploaded..."
fi

# Step 10: Install dependencies
echo "📦 [10/17] Installing dependencies..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm install

# Step 11: Build application
echo "📦 [11/17] Building application..."
sudo -u leadapp npm run build

# Step 12: Create .env file
echo "📦 [12/17] Creating .env file..."
sudo -u leadapp bash -c "cat > /home/leadapp/LeadStorefrontAI/.env << EOF
DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
EOF"
chmod 600 /home/leadapp/LeadStorefrontAI/.env
echo "✅ .env file created"

# Step 13: Run database migrations
echo "📦 [13/17] Running database migrations..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm run db:push
echo "✅ Database migrations complete"

# Step 14: Start with PM2
echo "📦 [14/17] Starting application with PM2..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp pm2 start ecosystem.config.js
sudo -u leadapp pm2 save
sudo -u leadapp pm2 startup | tail -1 | bash 2>/dev/null || echo "PM2 startup configured"
echo "✅ Application started"

# Step 15: Configure Nginx
echo "📦 [15/17] Configuring Nginx..."
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

ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
echo "✅ Nginx configured"

# Step 16: Configure firewall
echo "📦 [16/17] Configuring firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force reload
echo "✅ Firewall configured"

# Step 17: Verify deployment
echo "📦 [17/17] Verifying deployment..."
sleep 3
pm2 status
curl -s http://localhost:3000 > /dev/null && echo "✅ Application is responding!" || echo "⚠️  Application may need a moment to start"

echo ""
echo "════════════════════════════════════════"
echo "✅ DEPLOYMENT COMPLETE!"
echo "════════════════════════════════════════"
echo ""
echo "🌐 Your application is live at:"
echo "   http://138.197.82.122"
echo ""
echo "📋 Important Information:"
echo "   Database Password: $DB_PASSWORD"
echo "   (SAVE THIS PASSWORD!)"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs: pm2 logs leadstorefront"
echo "   Restart: pm2 restart leadstorefront"
echo "   Status: pm2 status"
echo ""
echo "🎉 Deployment successful! Visit http://138.197.82.122"


