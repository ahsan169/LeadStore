#!/bin/bash

# DigitalOcean Deployment Script
# Run this script on your droplet after uploading your application

set -e

echo "🚀 Starting DigitalOcean Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Running as root${NC}"

# Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
apt update && apt upgrade -y

# Install essential tools
echo -e "${YELLOW}📦 Installing essential tools...${NC}"
apt install -y curl wget git build-essential

# Install Node.js 20.x
echo -e "${YELLOW}📦 Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ Node.js installed: $NODE_VERSION${NC}"
echo -e "${GREEN}✅ npm installed: $NPM_VERSION${NC}"

# Install PM2
echo -e "${YELLOW}📦 Installing PM2...${NC}"
npm install -g pm2

# Install PostgreSQL
echo -e "${YELLOW}📦 Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql

# Install Nginx
echo -e "${YELLOW}📦 Installing Nginx...${NC}"
apt install -y nginx

# Create application user
echo -e "${YELLOW}👤 Creating application user...${NC}"
if ! id "leadapp" &>/dev/null; then
    adduser --disabled-password --gecos "" leadapp
    usermod -aG sudo leadapp
    echo -e "${GREEN}✅ User 'leadapp' created${NC}"
else
    echo -e "${YELLOW}⚠️  User 'leadapp' already exists${NC}"
fi

# Database setup
echo -e "${YELLOW}🗄️  Setting up database...${NC}"
echo -e "${YELLOW}⚠️  You'll need to set a database password manually${NC}"
echo -e "${YELLOW}Run these commands:${NC}"
echo "sudo -u postgres psql"
echo "CREATE DATABASE leadstorefront;"
echo "CREATE USER leaduser WITH PASSWORD 'YOUR_SECURE_PASSWORD';"
echo "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
echo "\\q"

# Create logs directory
echo -e "${YELLOW}📁 Creating logs directory...${NC}"
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Setup firewall
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
ufw --force enable
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force reload

echo -e "${GREEN}✅ Firewall configured${NC}"

# Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Basic server setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Switch to application user: su - leadapp"
echo "2. Navigate to app: cd ~/LeadStorefrontAI"
echo "3. Install dependencies: npm install"
echo "4. Build application: npm run build"
echo "5. Create .env file with your configuration"
echo "6. Run database migrations: npm run db:push"
echo "7. Start with PM2: pm2 start ecosystem.config.js"
echo "8. Configure Nginx (see DIGITALOCEAN_DEPLOYMENT.md)"
echo ""
echo -e "${GREEN}📚 See DIGITALOCEAN_DEPLOYMENT.md for detailed instructions${NC}"


