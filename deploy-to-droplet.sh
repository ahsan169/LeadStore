#!/bin/bash

# Simplified Deployment Script for DigitalOcean Droplet
# Droplet IP: 138.197.82.122

set -e

DROPLET_IP="138.197.82.122"
SSH_USER="root"

echo "🚀 Deploying to DigitalOcean Droplet: $DROPLET_IP"
echo ""

# Check if we can connect
echo "📡 Testing SSH connection..."
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SSH_USER@$DROPLET_IP "echo '✅ Connected!'" || {
    echo ""
    echo "❌ Cannot connect via SSH automatically."
    echo ""
    echo "Please connect manually first:"
    echo "  1. Go to DigitalOcean dashboard"
    echo "  2. Click on your droplet"
    echo "  3. Click 'Access' → 'Launch Droplet Console'"
    echo "  4. Or use: ssh root@$DROPLET_IP"
    echo ""
    echo "Then run the deployment commands manually (see DEPLOYMENT_COMMANDS.md)"
    exit 1
}

echo "✅ SSH connection successful!"
echo ""

# Get SeamlessAI key
read -p "Enter your SeamlessAI API key (or press Enter to read from .env): " SEAMLESS_KEY
if [ -z "$SEAMLESS_KEY" ]; then
    if [ -f .env ]; then
        SEAMLESS_KEY=$(grep SEAMLESS_API_KEY .env | cut -d '=' -f2 | tr -d ' ' | tr -d '"')
        echo "✅ Using SeamlessAI key from .env"
    else
        echo "❌ No .env file found. Please enter your SeamlessAI API key:"
        read SEAMLESS_KEY
    fi
fi

# Generate secure passwords
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -hex 32)

echo ""
echo "🔐 Generated secure passwords:"
echo "   Database password: $DB_PASSWORD"
echo "   Session secret: [hidden]"
echo ""

# Step 1: Update system
echo "📦 Step 1/15: Updating system..."
ssh $SSH_USER@$DROPLET_IP "apt update && apt upgrade -y"

# Step 2: Install Node.js
echo "📦 Step 2/15: Installing Node.js 20.x..."
ssh $SSH_USER@$DROPLET_IP "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"

# Step 3: Install PM2
echo "📦 Step 3/15: Installing PM2..."
ssh $SSH_USER@$DROPLET_IP "npm install -g pm2"

# Step 4: Install PostgreSQL
echo "📦 Step 4/15: Installing PostgreSQL..."
ssh $SSH_USER@$DROPLET_IP "apt install -y postgresql postgresql-contrib && systemctl start postgresql && systemctl enable postgresql"

# Step 5: Setup Database
echo "📦 Step 5/15: Setting up database..."
ssh $SSH_USER@$DROPLET_IP "sudo -u postgres psql -c \"CREATE DATABASE leadstorefront;\" 2>/dev/null || echo 'Database exists'"
ssh $SSH_USER@$DROPLET_IP "sudo -u postgres psql -c \"DROP USER IF EXISTS leaduser;\" 2>/dev/null || true"
ssh $SSH_USER@$DROPLET_IP "sudo -u postgres psql -c \"CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';\""
ssh $SSH_USER@$DROPLET_IP "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;\""

# Step 6: Install Nginx
echo "📦 Step 6/15: Installing Nginx..."
ssh $SSH_USER@$DROPLET_IP "apt install -y nginx"

# Step 7: Create app user
echo "📦 Step 7/15: Creating application user..."
ssh $SSH_USER@$DROPLET_IP "id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)"

# Step 8: Create directories
echo "📦 Step 8/15: Creating application directories..."
ssh $SSH_USER@$DROPLET_IP "mkdir -p /home/leadapp/LeadStorefrontAI/logs && chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI"

# Step 9: Upload files
echo "📦 Step 9/15: Uploading application files..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
    --exclude '*.log' --exclude '.DS_Store' \
    -e "ssh -o StrictHostKeyChecking=no" \
    ./ $SSH_USER@$DROPLET_IP:/home/leadapp/LeadStorefrontAI/

# Step 10: Install dependencies
echo "📦 Step 10/15: Installing dependencies..."
ssh $SSH_USER@$DROPLET_IP "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm install"

# Step 11: Build application
echo "📦 Step 11/15: Building application..."
ssh $SSH_USER@$DROPLET_IP "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm run build"

# Step 12: Create .env file
echo "📦 Step 12/15: Creating .env file..."
ssh $SSH_USER@$DROPLET_IP "sudo -u leadapp bash -c 'cat > /home/leadapp/LeadStorefrontAI/.env << EOF
DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
EOF'"
ssh $SSH_USER@$DROPLET_IP "chmod 600 /home/leadapp/LeadStorefrontAI/.env"

# Step 13: Run migrations
echo "📦 Step 13/15: Running database migrations..."
ssh $SSH_USER@$DROPLET_IP "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm run db:push"

# Step 14: Start with PM2
echo "📦 Step 14/15: Starting application with PM2..."
ssh $SSH_USER@$DROPLET_IP "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp pm2 start ecosystem.config.js"
ssh $SSH_USER@$DROPLET_IP "sudo -u leadapp pm2 save"
ssh $SSH_USER@$DROPLET_IP "sudo -u leadapp pm2 startup | tail -1 | bash" 2>/dev/null || echo "PM2 startup configured"

# Step 15: Configure Nginx
echo "📦 Step 15/15: Configuring Nginx..."
ssh $SSH_USER@$DROPLET_IP "cat > /tmp/nginx-config << 'EOF'
server {
    listen 80;
    server_name $DROPLET_IP;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    location /health {
        access_log off;
        return 200 \"healthy\\n\";
        add_header Content-Type text/plain;
    }
}
EOF
sudo mv /tmp/nginx-config /etc/nginx/sites-available/leadstorefront
sudo ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx"

# Step 16: Configure firewall
echo "📦 Step 16/16: Configuring firewall..."
ssh $SSH_USER@$DROPLET_IP "ufw --force enable && ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force reload"

echo ""
echo "════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo "════════════════════════════════════════"
echo ""
echo "🌐 Your application is live at:"
echo "   http://$DROPLET_IP"
echo ""
echo "📋 Important Information:"
echo "   Database Password: $DB_PASSWORD"
echo "   (Save this password for future reference!)"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs: ssh $SSH_USER@$DROPLET_IP 'pm2 logs leadstorefront'"
echo "   Restart app: ssh $SSH_USER@$DROPLET_IP 'pm2 restart leadstorefront'"
echo "   Check status: ssh $SSH_USER@$DROPLET_IP 'pm2 status'"
echo ""
echo "🎉 Your application is now deployed!"


