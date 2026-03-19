#!/bin/bash
# Run this ON THE DROPLET (paste into DigitalOcean Console) to fix SSH password login.
# You're already logged in as root, so run each block and check output.

set -e

echo "=== 1. What sshd is actually using ==="
sshd -T 2>/dev/null | grep -E 'permitrootlogin|passwordauthentication' || true

echo ""
echo "=== 2. Drop-in configs (these can override main config) ==="
ls -la /etc/ssh/sshd_config.d/ 2>/dev/null || echo "No sshd_config.d"

echo ""
echo "=== 3. Contents of drop-ins ==="
cat /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true

echo ""
echo "=== 4. Main config PermitRootLogin / PasswordAuthentication ==="
grep -n -E '^[^#]*(PermitRootLogin|PasswordAuthentication)' /etc/ssh/sshd_config || true
