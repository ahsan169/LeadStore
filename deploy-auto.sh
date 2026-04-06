#!/bin/bash

# Automated DigitalOcean Deployment Script
# This script will deploy your application to your DigitalOcean droplet

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 DigitalOcean Automated Deployment${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# Check if we're deploying remotely or locally
if [ -z "$DROPLET_IP" ]; then
    echo -e "${YELLOW}This script will deploy to your DigitalOcean droplet${NC}"
    echo ""
    read -p "Enter your droplet IP address: " DROPLET_IP
    read -p "Enter SSH user (usually 'root'): " SSH_USER
    SSH_USER=${SSH_USER:-root}
    
    echo ""
    echo -e "${YELLOW}Choose SSH authentication method:${NC}"
    echo "1) Password"
    echo "2) SSH Key (recommended)"
    read -p "Enter choice (1 or 2): " AUTH_METHOD
    
    if [ "$AUTH_METHOD" = "1" ]; then
        echo -e "${YELLOW}You'll be prompted for password when connecting${NC}"
        SSH_CMD="ssh"
    else
        read -p "Enter path to SSH key (or press Enter for default ~/.ssh/id_rsa): " SSH_KEY
        SSH_KEY=${SSH_KEY:-~/.ssh/id_rsa}
        SSH_CMD="ssh -i $SSH_KEY"
    fi
else
    # Remote execution mode
    SSH_CMD=""
fi

echo ""
echo -e "${GREEN}📋 Deployment Information:${NC}"
echo "  Droplet IP: $DROPLET_IP"
echo "  SSH User: $SSH_USER"
echo ""

# Function to execute commands on remote server
remote_exec() {
    if [ -z "$SSH_CMD" ]; then
        # We're already on the remote server
        eval "$1"
    else
        # Execute on remote server
        $SSH_CMD $SSH_USER@$DROPLET_IP "$1"
    fi
}

# Function to copy files to remote server
remote_copy() {
    if [ -z "$SSH_CMD" ]; then
        echo "Already on remote server, skipping copy"
    else
        scp -r $1 $SSH_USER@$DROPLET_IP:$2
    fi
}

echo -e "${YELLOW}Step 1: Testing SSH connection...${NC}"
if [ -n "$SSH_CMD" ]; then
    $SSH_CMD $SSH_USER@$DROPLET_IP "echo 'SSH connection successful!'" || {
        echo -e "${RED}❌ SSH connection failed!${NC}"
        echo "Please check:"
        echo "  - Droplet IP is correct"
        echo "  - SSH key/password is correct"
        echo "  - Firewall allows SSH (port 22)"
        exit 1
    }
fi
echo -e "${GREEN}✅ SSH connection successful${NC}"

echo ""
echo -e "${YELLOW}Step 2: Updating system packages...${NC}"
remote_exec "apt update && apt upgrade -y"
echo -e "${GREEN}✅ System updated${NC}"

echo ""
echo -e "${YELLOW}Step 3: Installing Node.js 20.x...${NC}"
remote_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
NODE_VERSION=$(remote_exec "node --version")
echo -e "${GREEN}✅ Node.js installed: $NODE_VERSION${NC}"

echo ""
echo -e "${YELLOW}Step 4: Installing PM2...${NC}"
remote_exec "npm install -g pm2"
echo -e "${GREEN}✅ PM2 installed${NC}"

echo ""
echo -e "${YELLOW}Step 5: Installing PostgreSQL...${NC}"
remote_exec "apt install -y postgresql postgresql-contrib"
remote_exec "systemctl start postgresql && systemctl enable postgresql"
echo -e "${GREEN}✅ PostgreSQL installed${NC}"

echo ""
echo -e "${YELLOW}Step 6: Installing Nginx...${NC}"
remote_exec "apt install -y nginx"
echo -e "${GREEN}✅ Nginx installed${NC}"

echo ""
echo -e "${YELLOW}Step 7: Creating application user...${NC}"
remote_exec "id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)"
echo -e "${GREEN}✅ Application user created${NC}"

echo ""
echo -e "${YELLOW}Step 8: Setting up database...${NC}"
read -p "Enter database password for 'leaduser': " DB_PASSWORD
remote_exec "sudo -u postgres psql -c \"CREATE DATABASE leadstorefront;\" 2>/dev/null || echo 'Database exists'"
remote_exec "sudo -u postgres psql -c \"CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';\" 2>/dev/null || echo 'User exists'"
remote_exec "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;\""
echo -e "${GREEN}✅ Database configured${NC}"

echo ""
echo -e "${YELLOW}Step 9: Uploading application files...${NC}"
# Create app directory
remote_exec "mkdir -p /home/leadapp/LeadStorefrontAI"
remote_exec "mkdir -p /home/leadapp/LeadStorefrontAI/logs"
remote_exec "chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI"

# Copy files (if not already on server)
if [ -n "$SSH_CMD" ]; then
    echo "Uploading files..."
    # Exclude node_modules and other unnecessary files
    rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
        -e "$SSH_CMD" \
        ./ $SSH_USER@$DROPLET_IP:/home/leadapp/LeadStorefrontAI/ || {
        echo -e "${YELLOW}⚠️  rsync not available, using scp...${NC}"
        # Fallback to scp
        scp -r ./* $SSH_USER@$DROPLET_IP:/home/leadapp/LeadStorefrontAI/
    }
fi
echo -e "${GREEN}✅ Files uploaded${NC}"

echo ""
echo -e "${YELLOW}Step 10: Installing dependencies...${NC}"
remote_exec "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm install"
echo -e "${GREEN}✅ Dependencies installed${NC}"

echo ""
echo -e "${YELLOW}Step 11: Building application...${NC}"
remote_exec "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm run build"
echo -e "${GREEN}✅ Application built${NC}"

echo ""
echo -e "${YELLOW}Step 12: Creating .env file...${NC}"
read -p "Enter SeamlessAI API key: " SEAMLESS_KEY
read -p "Enter SESSION_SECRET (or press Enter for random): " SESSION_SECRET
SESSION_SECRET=${SESSION_SECRET:-$(openssl rand -hex 32)}
ENCRYPTION_KEY=$(openssl rand -hex 32)

ENV_CONTENT="DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY"

remote_exec "sudo -u leadapp bash -c 'cat > /home/leadapp/LeadStorefrontAI/.env << EOF
$ENV_CONTENT
EOF'"
remote_exec "chmod 600 /home/leadapp/LeadStorefrontAI/.env"
echo -e "${GREEN}✅ .env file created${NC}"

echo ""
echo -e "${YELLOW}Step 13: Running database migrations...${NC}"
remote_exec "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp npm run db:push"
echo -e "${GREEN}✅ Database migrations completed${NC}"

echo ""
echo -e "${YELLOW}Step 14: Starting application with PM2...${NC}"
remote_exec "cd /home/leadapp/LeadStorefrontAI && sudo -u leadapp pm2 start ecosystem.config.cjs"
remote_exec "sudo -u leadapp pm2 save"
remote_exec "sudo -u leadapp pm2 startup | tail -1 | bash" || echo "PM2 startup already configured"
echo -e "${GREEN}✅ Application started${NC}"

echo ""
echo -e "${YELLOW}Step 15: Configuring Nginx...${NC}"
read -p "Enter your domain name (or press Enter to use IP): " DOMAIN
DOMAIN=${DOMAIN:-$DROPLET_IP}

NGINX_CONFIG="server {
    listen 80;
    server_name $DOMAIN;

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
}"

remote_exec "cat > /tmp/leadstorefront << 'NGINXEOF'
$NGINX_CONFIG
NGINXEOF
"
remote_exec "sudo mv /tmp/leadstorefront /etc/nginx/sites-available/leadstorefront"
remote_exec "sudo ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/"
remote_exec "sudo rm -f /etc/nginx/sites-enabled/default"
remote_exec "sudo nginx -t && sudo systemctl restart nginx"
echo -e "${GREEN}✅ Nginx configured${NC}"

echo ""
echo -e "${YELLOW}Step 16: Configuring firewall...${NC}"
remote_exec "ufw --force enable"
remote_exec "ufw allow OpenSSH"
remote_exec "ufw allow 'Nginx Full'"
remote_exec "ufw --force reload"
echo -e "${GREEN}✅ Firewall configured${NC}"

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Your application is now live at:${NC}"
echo -e "  🌐 http://$DOMAIN"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Test your application: http://$DOMAIN"
echo "  2. Setup SSL (optional): sudo certbot --nginx -d $DOMAIN"
echo "  3. View logs: pm2 logs leadstorefront"
echo ""
echo -e "${GREEN}🎉 Deployment successful!${NC}"


