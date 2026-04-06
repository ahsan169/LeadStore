# Destroy compromised droplet and create a new one

**We cannot do this for you from Cursor** — DigitalOcean requires **your** login (or a **personal access token** you never share). Follow the steps below.

---

## Part 1 — Destroy the old droplet (web UI)

1. Log in: https://cloud.digitalocean.com
2. Go to **Droplets**
3. Open **`ubuntu-s-2vcpu-2gb-nyc3-01`** (or the disconnected one at `138.197.82.122`)
4. **Optional:** If you need data, use **Backups / Snapshots** or the [Recovery ISO](https://docs.digitalocean.com/products/droplets/how-to/recovery-iso/) first — **do not** copy the whole disk to a new droplet if you suspect malware; copy only files you need (e.g. `.env` values you will **rotate** anyway).
5. **Destroy** the droplet: **More** (…) → **Destroy** → confirm.

**Rotate all secrets** that ever lived on that server: DB password, `SESSION_SECRET`, `ENCRYPTION_KEY`, `SEAMLESS_API_KEY` (if exposed), SSH keys.

---

## Part 2 — Create a new droplet

1. **Create** → **Droplets**
2. Choose **Ubuntu 24.04 LTS**
3. Plan: **Basic** — **Regular** — **$12/mo (2 GB / 2 vCPU)** or what you prefer
4. **Datacenter:** e.g. NYC3 (or your choice)
5. **Authentication:** **SSH keys** only (recommended) — add your Mac’s public key; **avoid** root password login if possible
6. **Hostname:** e.g. `leadstorefront-prod`
7. **Create Droplet**

Note the **new IPv4 address** (it will **not** be `138.197.82.122`).

---

## Part 3 — Hardening (first login via DO Console or SSH)

```bash
ssh root@NEW_DROPLET_IP
```

```bash
apt update && apt upgrade -y
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Firewall: SSH + HTTP(S) only
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

Do **not** re-enable weak SSH (password + root) like on the old box unless you understand the risk.

---

## Part 4 — Install stack (Node, Postgres, Nginx, PM2, user)

Use your existing guides: `DIGITALOCEAN_DEPLOYMENT.md` / `DIGITALOCEAN_QUICK_START.md`, or run the same flow you used before:

- Create user `leadapp`, install Node 20, PostgreSQL, Nginx, PM2 globally
- Create DB `leadstorefront` and user `leaduser` with a **new** password

---

## Part 5 — Deploy app from Git (recommended)

On the new droplet as root (then `leadapp`):

```bash
mkdir -p /home/leadapp && chown leadapp:leadapp /home/leadapp
sudo -u leadapp git clone https://github.com/ahsan169/LeadStore.git /home/leadapp/LeadStorefrontAI
cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm install
sudo -u leadapp npm run build
```

Create **`/home/leadapp/LeadStorefrontAI/.env`** (new values):

```env
DATABASE_URL=postgresql://leaduser:NEW_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=your_key
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

```bash
sudo -u leadapp npm run db:push
```

PM2 (use `.cjs` config):

```bash
# Ensure ecosystem.config.cjs exists (from repo) or create minimal one — see ecosystem.config.cjs in repo
sudo -u leadapp pm2 start ecosystem.config.cjs
sudo -u leadapp pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u leadapp --hp /home/leadapp
```

Configure Nginx to proxy to `127.0.0.1:3000` (copy from your old notes or `nginx-leadstorefront.conf`).

---

## Optional — Automate with `doctl` (on your Mac)

```bash
brew install doctl
doctl auth init
# paste a read/write token from: https://cloud.digitalocean.com/account/api/tokens

doctl compute droplet list
doctl compute droplet delete DROPLET_ID --force
doctl compute droplet create leadstorefront-prod --image ubuntu-24-04-x64 --size s-2vcpu-2gb --region nyc3 --ssh-keys YOUR_SSH_KEY_FINGERPRINT
```

Replace sizes/regions/keys with your choices.

---

## After abuse incidents

- **Do not** restore a **full disk clone** of the infected VM.
- **Do** redeploy from **Git** and **new** secrets.
- Open a ticket with DigitalOcean if they require a cleanup statement before restoring networking on a **kept** droplet — for a **new** droplet, networking is normal from creation.
