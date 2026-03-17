#!/bin/bash
# Quick SSH Setup Script

echo "🔐 SSH Authentication Setup"
echo ""

# Check if key exists
if [ -f ~/.ssh/id_ed25519_digitalocean ]; then
    echo "✅ SSH key already exists!"
else
    echo "📦 Generating SSH key..."
    ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_digitalocean -N "" -C "digitalocean-deploy"
    echo "✅ SSH key generated!"
fi

echo ""
echo "📋 Your public key:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat ~/.ssh/id_ed25519_digitalocean.pub
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📝 Next steps:"
echo ""
echo "Option A - Automatic (requires droplet password):"
echo "  ssh-copy-id -i ~/.ssh/id_ed25519_digitalocean.pub root@138.197.82.122"
echo ""
echo "Option B - Manual (copy key above to droplet):"
echo "  1. Go to DigitalOcean Console"
echo "  2. Run: mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys"
echo "  3. Paste the public key above"
echo "  4. Run: chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
echo ""
echo "Option C - Use password authentication:"
echo "  Just provide your droplet root password"
echo ""


