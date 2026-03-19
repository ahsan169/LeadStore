# Update existing DigitalOcean deployment

Use this when the app is **already deployed** and you only changed code. Your existing `.env` and database on the droplet are left unchanged.

## Option A: From your Mac (recommended)

1. **From project root**, run:
   ```bash
   ./update-deploy.sh
   ```
   You’ll be prompted for the droplet password if you don’t use SSH keys.

2. **If you use an SSH key:**
   ```bash
   SSH_KEY=~/.ssh/id_ed25519 ./update-deploy.sh
   ```
   Or with a custom droplet IP:
   ```bash
   DROPLET_IP=1.2.3.4 ./update-deploy.sh
   ```

The script will: sync code → `npm install` → `npm run build` → `npm run db:push` → `pm2 restart leadstorefront`.

---

## Option B: DigitalOcean Console (no SSH from Mac)

If you can’t SSH from your Mac (e.g. no key, firewall), do the following.

1. **Upload your updated code** to the droplet:
   - Zip the project (excluding `node_modules`, `.git`, `dist`) and use DigitalOcean droplet **Files** / SFTP, or  
   - Use another machine where `rsync`/`scp` works and run Option A from there.

2. **In DigitalOcean: Droplet → Access → Launch Droplet Console**, then run:
   ```bash
   cd /home/leadapp/LeadStorefrontAI
   sudo -u leadapp npm install
   sudo -u leadapp npm run build
   sudo -u leadapp npm run db:push
   sudo -u leadapp pm2 restart leadstorefront
   sudo -u leadapp pm2 save
   ```

---

**Droplet IP:** `138.197.82.122` (default in script)  
**App URL after update:** http://138.197.82.122
