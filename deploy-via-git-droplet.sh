#!/bin/bash
# Run this ON THE DROPLET (paste into DigitalOcean Console).
# Replace YOUR_GITHUB_REPO_URL with your actual repo (e.g. https://github.com/username/LeadStorefrontAI.git)

REPO_URL="${1:-YOUR_GITHUB_REPO_URL}"
APP_DIR="/home/leadapp/LeadStorefrontAI"

if [ "$REPO_URL" = "YOUR_GITHUB_REPO_URL" ]; then
  echo "Usage: paste this script and replace YOUR_GITHUB_REPO_URL with your repo URL"
  echo "Example: bash deploy-via-git-droplet.sh https://github.com/youruser/LeadStorefrontAI.git"
  exit 1
fi

set -e
cd /home/leadapp

# Backup .env
cp -a LeadStorefrontAI/.env /tmp/leadstorefront.env 2>/dev/null || true

# Pull or clone
if [ -d LeadStorefrontAI/.git ]; then
  cd LeadStorefrontAI
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
  git fetch origin
  git reset --hard origin/main
else
  rm -rf LeadStorefrontAI
  git clone "$REPO_URL" LeadStorefrontAI
  cd LeadStorefrontAI
  cp -a /tmp/leadstorefront.env .env 2>/dev/null || true
fi

# Deploy
sudo -u leadapp npm install
sudo -u leadapp npm run build
sudo -u leadapp npm run db:push || true
sudo -u leadapp pm2 restart leadstorefront
sudo -u leadapp pm2 save

echo ""
echo "✅ Deploy complete! App: http://138.197.82.122"
