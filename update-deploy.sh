#!/bin/bash
# Update existing DigitalOcean deployment (sync code, build, restart)
# Use this when the app is already deployed and you only changed code.
#
# Usage:
#   ./update-deploy.sh                    # uses default IP, will prompt for password if needed
#   SSH_KEY=~/.ssh/id_ed25519 ./update-deploy.sh
#   DROPLET_IP=1.2.3.4 ./update-deploy.sh

set -e

DROPLET_IP="${DROPLET_IP:-138.197.82.122}"
SSH_USER="${SSH_USER:-root}"
APP_DIR="/home/leadapp/LeadStorefrontAI"
SSH_OPTS="-o ConnectTimeout=10 -o StrictHostKeyChecking=no"
[ -n "$SSH_KEY" ] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

echo "🔄 Updating deployment on DigitalOcean: $DROPLET_IP"
echo ""

echo "📡 Testing SSH connection..."
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "echo '✅ Connected!'" || {
    echo "❌ Cannot connect. Try: ssh $SSH_USER@$DROPLET_IP"
    echo "   Or set SSH_KEY: SSH_KEY=~/.ssh/your_key ./update-deploy.sh"
    exit 1
}

echo "📤 Syncing code (excluding node_modules, .git, dist, .env)..."
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
    --exclude '.env' --exclude '*.log' --exclude '.DS_Store' \
    -e "ssh $SSH_OPTS" \
    ./ $SSH_USER@$DROPLET_IP:$APP_DIR/

echo "📦 Installing dependencies..."
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "cd $APP_DIR && sudo -u leadapp npm install"

echo "🔨 Building application..."
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "cd $APP_DIR && sudo -u leadapp npm run build"

echo "🗄️ Running database migrations (db:push)..."
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "cd $APP_DIR && sudo -u leadapp npm run db:push" || echo "⚠️ db:push had warnings (may be ok)"

echo "🔄 Restarting app with PM2..."
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "sudo -u leadapp pm2 restart leadstorefront"
ssh $SSH_OPTS $SSH_USER@$DROPLET_IP "sudo -u leadapp pm2 save"

echo ""
echo "✅ Update complete! App: http://$DROPLET_IP"
echo "   Logs: ssh $SSH_USER@$DROPLET_IP 'pm2 logs leadstorefront'"
