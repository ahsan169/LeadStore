#!/bin/bash
# Run this ON THE DROPLET (DigitalOcean Console) to allow root SSH from network.
# Ubuntu often blocks root login from network via PAM access.conf.

echo "=== Current access.conf (look for root / ALL EXCEPT LOCAL) ==="
cat /etc/security/access.conf

echo ""
echo "=== Checking PAM sshd for access ==="
grep -E 'access|account' /etc/pam.d/sshd || true
