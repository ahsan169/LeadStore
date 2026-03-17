#!/bin/bash
# Setup script using password authentication

DROPLET_IP="138.197.82.122"
PASSWORD="Example123"

echo "🔧 Setting up droplet..."

# Install sshpass if needed
if ! command -v sshpass &> /dev/null; then
    echo "Installing sshpass..."
    brew install hudochenkov/sshpass/sshpass 2>/dev/null || {
        echo "Please install sshpass: brew install hudochenkov/sshpass/sshpass"
        exit 1
    }
fi

# Create directory and user on droplet
echo "📦 Creating directory and user on droplet..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'EOF'
mkdir -p /home/leadapp/LeadStorefrontAI/logs
id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI
echo "✅ Directory and user created!"
EOF

# Upload files
echo "📤 Uploading files..."
cd /Users/user/Downloads/LeadStorefrontAI
sshpass -p "$PASSWORD" scp -r -o StrictHostKeyChecking=no ./* root@$DROPLET_IP:/home/leadapp/LeadStorefrontAI/ 2>&1 | grep -v "Warning: Permanently added" | tail -10

echo ""
echo "✅ Files uploaded!"
echo ""
echo "📋 Next step: Run the deployment script in your SSH terminal"


