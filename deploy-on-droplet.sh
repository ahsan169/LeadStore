#!/bin/bash

# Complete Deployment Script for DigitalOcean Droplet
# Run this ENTIRE script on your droplet via DigitalOcean Console

set -e

echo "🚀 Starting deployment on DigitalOcean Droplet..."
echo ""

# Get SeamlessAI API key
read -p "Enter your SeamlessAI API key: " SEAMLESS_KEY

# Generate secure passwords
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -hex 32)

echo ""
echo "🔐 Generated secure passwords:"
echo "   Database password: $DB_PASSWORD"
echo "   (Save this password!)"
echo ""

# Step 1: Update system
echo "📦 Step 1/16: Updating system..."
apt update && apt upgrade -y

# Step 2: Install Node.js
echo "📦 Step 2/16: Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version

# Step 3: Install PM2
echo "📦 Step 3/16: Installing PM2..."
npm install -g pm2

# Step 4: Install PostgreSQL
echo "📦 Step 4/16: Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Step 5: Setup Database
echo "📦 Step 5/16: Setting up database..."
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;" 2>/dev/null || echo "Database exists"
sudo -u postgres psql -c "DROP USER IF EXISTS leaduser;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
echo "✅ Database created with password: $DB_PASSWORD"

# Step 6: Install Nginx
echo "📦 Step 6/16: Installing Nginx..."
apt install -y nginx

# Step 7: Create app user
echo "📦 Step 7/16: Creating application user..."
id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)

# Step 8: Create directories
echo "📦 Step 8/16: Creating directories..."
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Step 9: Install essential tools
echo "📦 Step 9/16: Installing essential tools..."
apt install -y git curl wget build-essential

# Step 10: Clone or prepare for file upload
echo "📦 Step 10/16: Preparing for application files..."
echo "⚠️  You'll need to upload your application files next"
echo "   Option 1: Use 'scp' from your local machine"
echo "   Option 2: Use Git if you have a repository"
echo ""
read -p "Do you have a Git repository URL? (y/n): " HAS_GIT
if [ "$HAS_GIT" = "y" ]; then
    read -p "Enter Git repository URL: " GIT_URL
    su - leadapp -c "cd ~ && git clone $GIT_URL LeadStorefrontAI"
else
    echo "Please upload files using SCP from your local machine:"
    echo "  scp -r /Users/user/Downloads/LeadStorefrontAI/* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/"
    echo ""
    read -p "Press Enter after files are uploaded..."
fi

# Step 11: Install dependencies
echo "📦 Step 11/16: Installing dependencies..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm install

# Step 12: Build application
echo "📦 Step 12/16: Building application..."
sudo -u leadapp npm run build

# Step 13: Create .env file
echo "📦 Step 13/16: Creating .env file..."
sudo -u leadapp bash -c "cat > /home/leadapp/LeadStorefrontAI/.env << EOF
DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
EOF"
chmod 600 /home/leadapp/LeadStorefrontAI/.env

# Step 14: Run migrations
echo "📦 Step 14/16: Running database migrations..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm run db:push

# Step 15: Start with PM2
echo "📦 Step 15/16: Starting application with PM2..."
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp pm2 start ecosystem.config.js
sudo -u leadapp pm2 save
sudo -u leadapp pm2 startup | tail -1 | bash 2>/dev/null || echo "PM2 startup configured"

# Step 16: Configure Nginx
echo "📦 Step 16/16: Configuring Nginx..."
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

# Step 17: Configure firewall
echo "📦 Step 17/17: Configuring firewall..."
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force reload

echo ""
echo "════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo "════════════════════════════════════════"
echo ""
echo "🌐 Your application is live at:"
echo "   http://138.197.82.122"
echo ""
echo "📋 Important Information:"
echo "   Database Password: $DB_PASSWORD"
echo "   (Save this password!)"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs: pm2 logs leadstorefront"
echo "   Restart: pm2 restart leadstorefront"
echo "   Status: pm2 status"
echo ""
echo "🎉 Deployment successful!"


