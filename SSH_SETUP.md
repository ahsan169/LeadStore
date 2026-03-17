# 🔐 SSH Authentication Setup

## Option 1: SSH Key Authentication (Recommended - Most Secure)

### Step 1: Generate SSH Key (if you don't have one)

On your Mac, run:
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

Press Enter to accept default location (`~/.ssh/id_ed25519`), then set a passphrase (optional).

### Step 2: Copy Public Key to Droplet

**Method A: Using ssh-copy-id (Easiest)**
```bash
ssh-copy-id root@138.197.82.122
```
You'll be prompted for your droplet password once, then it will work without password.

**Method B: Manual Copy**
```bash
# Copy your public key
cat ~/.ssh/id_ed25519.pub

# Then on your droplet (via DigitalOcean Console), run:
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Step 3: Test Connection
```bash
ssh root@138.197.82.122
```
Should connect without password!

---

## Option 2: Password Authentication (Simpler)

If your droplet already has password authentication enabled:

1. **Get your root password from DigitalOcean:**
   - Go to your droplet
   - Click "Access" → "Reset Root Password"
   - DigitalOcean will email you the password

2. **Test connection:**
   ```bash
   ssh root@138.197.82.122
   ```
   Enter the password when prompted.

3. **For automated deployment, I can use `sshpass`:**
   ```bash
   # Install sshpass (if not installed)
   brew install hudochenkov/sshpass/sshpass
   ```

---

## Option 3: DigitalOcean Console + Manual Commands

If SSH setup is complicated, you can:
1. Use DigitalOcean Console (no SSH needed)
2. I'll provide commands to copy-paste
3. Run them in the console

---

## Quick Setup (Choose One)

### A) Quick SSH Key Setup (2 minutes)
```bash
# Generate key (if needed)
ssh-keygen -t ed25519

# Copy to droplet
ssh-copy-id root@138.197.82.122
```

### B) Use Password
Just tell me your root password and I'll use it for deployment.

### C) Use Console
I'll give you commands to run in DigitalOcean Console.

---

**Which method do you prefer?** Once set up, I can deploy automatically! 🚀


