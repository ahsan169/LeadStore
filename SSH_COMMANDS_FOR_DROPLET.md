# 🖥️ Commands to Run in Your SSH Terminal (Already Connected to Droplet)

Since you have an SSH terminal open in Cursor that's connected to the droplet, run these commands **IN THAT TERMINAL**:

## Step 1: Create Directory and User

```bash
# Create the user first
adduser --disabled-password --gecos '' leadapp
usermod -aG sudo leadapp

# Create directory
mkdir -p /home/leadapp/LeadStorefrontAI/logs
chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI

# Verify
ls -la /home/leadapp/LeadStorefrontAI/
```

## Step 2: Upload Files (From Your Mac Terminal)

After running Step 1, go to your **Mac terminal** and run:

```bash
cd /Users/user/Downloads/LeadStorefrontAI
scp -r ./* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/
```

Enter password: `Example123`

## Step 3: Run Deployment (Back in SSH Terminal)

After files are uploaded, go back to your **SSH terminal in Cursor** and run the deployment script from `QUICK_DEPLOY.md`

---

## ⚠️ Important

- **SSH Terminal in Cursor** = Commands run ON the droplet
- **Mac Terminal** = Commands run on your Mac (for uploading files)

Make sure you're in the right terminal for each step!


