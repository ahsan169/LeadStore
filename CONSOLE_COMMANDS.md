# 🖥️ DigitalOcean Console Commands

Copy and paste these commands into your DigitalOcean Console, one section at a time.

---

## Step 1: Setup SSH Key (for automatic deployment)

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILukmYCf2QmqqoDgnEbu5kHBoeltGT63uN3AVxGNHSsM digitalocean-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "✅ SSH key added!"
```

---

## Step 2: Test Connection

After adding the key, I'll test the connection from my side.

---

## Step 3: Full Deployment (Run after SSH is working)

The complete deployment script will be run automatically once SSH is working.

---

## Alternative: Manual Deployment (If SSH doesn't work)

If you prefer to deploy manually, see the next section.


