# 🚀 How to Deploy Your Updates

### 0. Fix SSH Connection (Run this first!)

Your server's identity changed (likely due to a reinstall). Run this command on your Mac to reset it:

```bash
ssh-keygen -R 138.197.82.122
```

### 1. Run on your Mac (Terminal)

First, sync the latest code to your server. 

```bash
cd /Users/user/Downloads/LeadStorefrontAI

# Sync files to the server
# It will ask for your root password (Example123)
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' ./ root@138.197.82.122:/home/leadapp/LeadStorefrontAI/
```

### 2. Connect to your Droplet

```bash
ssh root@138.197.82.122
```

### 3. Run on the Droplet (as root)

Once you are logged in, copy and paste these commands to finalize the update:

```bash
# Set correct permissions
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Switch to the app user
su - leadapp

# Go to the app directory
cd ~/LeadStorefrontAI

# Install any new dependencies
npm install

# Build the application
npm run build

# Restart the application
pm2 restart leadstorefront

# Verify it's running
pm2 status
```

---

✅ **Done!** Your application should now be updated at **http://138.197.82.122** with the new Bulk Phone Research feature.
