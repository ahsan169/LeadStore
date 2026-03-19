#!/bin/bash
# Run this ON THE DROPLET (DigitalOcean Console) to diagnose SSH auth failures.
# Paste the full output back.

echo "=== 1. sshd effective config (auth-related) ==="
sshd -T 2>/dev/null | grep -E 'authorizedkeysfile|authorizedkeyscommand|pubkeyauthentication|passwordauthentication|permitrootlogin|usepaam'

echo ""
echo "=== 2. AuthorizedKeysCommand (if set - this OVERRIDES ~/.ssh/authorized_keys) ==="
grep -rniE 'AuthorizedKeysCommand|AuthorizedKeysFile' /etc/ssh/ 2>/dev/null

echo ""
echo "=== 3. PAM access.conf (blocks logins from network) ==="
cat /etc/security/access.conf 2>/dev/null

echo ""
echo "=== 4. sshd_config.d contents ==="
for f in /etc/ssh/sshd_config.d/*.conf; do
  echo "--- $f ---"
  cat "$f" 2>/dev/null
done

echo ""
echo "=== 5. Main sshd_config auth settings ==="
grep -n -E '^[^#]*(Match |AuthorizedKeys|PubkeyAuth|PasswordAuth|PermitRoot|UsePAM)' /etc/ssh/sshd_config 2>/dev/null || true
