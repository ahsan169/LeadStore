#!/bin/bash
# Update deployment using ONE SSH connection.
# Usage:
#   ./update-deploy-one-ssh.sh              # will prompt for password
#   SSHPASS='Leads123' ./update-deploy-one-ssh.sh   # no prompt (uses sshpass)

set -e

DROPLET_IP="${DROPLET_IP:-138.197.82.122}"
SSH_USER="${SSH_USER:-deploy}"
APP_DIR="/home/leadapp/LeadStorefrontAI"
SSH_OPTS="-o ConnectTimeout=15 -o StrictHostKeyChecking=no"
if [ -n "$SSH_KEY" ]; then
  SSH_OPTS="$SSH_OPTS -i $SSH_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o PreferredAuthentications=publickey"
  SSH_CMD="ssh"
  echo "🔄 Updating deployment: $DROPLET_IP (using deploy key)"
elif [ -n "$SSHPASS" ]; then
  SSH_OPTS="$SSH_OPTS -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  SSH_CMD="sshpass -e ssh"
  echo "🔄 Updating deployment: $DROPLET_IP (using SSHPASS)"
else
  SSH_CMD="ssh"
  echo "🔄 Updating deployment: $DROPLET_IP (you'll type password once)"
fi
echo ""

# Build tarball and pipe to single SSH session that extracts + installs + builds + restarts
tar cf - \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  . | $SSH_CMD $SSH_OPTS $SSH_USER@$DROPLET_IP "set -e
    echo '📥 Extracting code...'
    sudo bash -c 'cd /home/leadapp/LeadStorefrontAI && tar xf -'
    echo '📦 Installing dependencies...'
    sudo -u leadapp bash -c 'cd /home/leadapp/LeadStorefrontAI && npm install'
    echo '🔨 Building...'
    sudo -u leadapp bash -c 'cd /home/leadapp/LeadStorefrontAI && npm run build'
    echo '🗄️ Database migrations...'
    sudo -u leadapp bash -c 'cd /home/leadapp/LeadStorefrontAI && npm run db:push' || true
    echo '🔄 Restarting PM2...'
    sudo -u leadapp pm2 restart leadstorefront
    sudo -u leadapp pm2 save
    echo ''
    echo '✅ Update complete!'
" || {
  echo "❌ Deploy failed. If password was rejected, on droplet run: echo 'root:Leads123' | sudo chpasswd"
  exit 1
}

echo ""
echo "🌐 App: http://$DROPLET_IP"
echo "   Logs: ssh $SSH_USER@$DROPLET_IP 'pm2 logs leadstorefront'"
