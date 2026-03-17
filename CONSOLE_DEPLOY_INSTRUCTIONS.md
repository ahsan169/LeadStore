# 🖥️ DigitalOcean Console Deployment Instructions

## Step 1: Upload Application Files

**Before running the deployment script, you need to upload your application files.**

### Option A: Using SCP (from your Mac terminal)

Open a **NEW terminal window** on your Mac and run:

```bash
cd /Users/user/Downloads/LeadStorefrontAI
scp -r ./* root@138.197.82.122:/home/leadapp/LeadStorefrontAI/
```

When prompted, enter your droplet root password.

### Option B: Using DigitalOcean File Upload

1. In DigitalOcean dashboard, go to your droplet
2. Use the file manager or upload feature
3. Upload files to `/home/leadapp/LeadStorefrontAI/`

---

## Step 2: Run Deployment Script

**Copy the ENTIRE script below and paste it into your DigitalOcean Console:**

```bash
#!/bin/bash
set -e

echo "🚀 Starting Complete Deployment..."
SEAMLESS_KEY="JVyPWPgLsByKOTSERM7rcQh98npI1FPifFCul4qa030M3gGSxxjAao7o9gNo4SrUxOw4d4wkgNjItapSgFLbkmwQOrkALsd0CYqoPCsrze44oEt9pcjpis1cibQvOk6/EY5agNqGbZN7eYx96eem3S/e9p1AOUmuvS/K8AUosUaYDwsB"
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
SESSION_SECRET=$(openssl rand -hex 32)

echo "🔐 Database Password: $DB_PASSWORD (SAVE THIS!)"

apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
npm install -g pm2
apt install -y postgresql postgresql-contrib && systemctl start postgresql && systemctl enable postgresql
sudo -u postgres psql -c "CREATE DATABASE leadstorefront;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS leaduser;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
apt install -y nginx
id leadapp || (adduser --disabled-password --gecos '' leadapp && usermod -aG sudo leadapp)
mkdir -p /home/leadapp/LeadStorefrontAI/logs && chown -R leadapp:leadapp /home/leadapp/LeadStorefrontAI
apt install -y git curl wget build-essential

if [ ! -f "/home/leadapp/LeadStorefrontAI/package.json" ]; then
    echo "⚠️  Files not found! Upload files first, then press Enter..."
    read -p "Press Enter after files are uploaded..."
fi

cd /home/leadapp/LeadStorefrontAI
sudo -u leadapp npm install
sudo -u leadapp npm run build
sudo -u leadapp bash -c "cat > .env << EOF
DATABASE_URL=postgresql://leaduser:$DB_PASSWORD@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=$SEAMLESS_KEY
SESSION_SECRET=$SESSION_SECRET
EOF"
chmod 600 /home/leadapp/LeadStorefrontAI/.env
sudo -u leadapp npm run db:push
sudo -u leadapp pm2 start ecosystem.config.js
sudo -u leadapp pm2 save
sudo -u leadapp pm2 startup | tail -1 | bash 2>/dev/null || true

cat > /etc/nginx/sites-available/leadstorefront << 'EOF'
server {
    listen 80;
    server_name 138.197.82.122;
    client_max_body_size 10M;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
    }
}
EOF

ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
ufw --force enable && ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force reload

echo "✅ Deployment complete! Visit http://138.197.82.122"
echo "Database password: $DB_PASSWORD"
```

---

## Step 3: Wait for Completion

The script will take 5-10 minutes to complete. You'll see progress messages.

---

## Step 4: Test Your Application

Visit: **http://138.197.82.122**

Your application should be live! 🎉

---

## Troubleshooting

If something goes wrong:

```bash
# Check application logs
pm2 logs leadstorefront

# Check application status
pm2 status

# Restart application
pm2 restart leadstorefront

# Check Nginx
systemctl status nginx
tail -f /var/log/nginx/error.log
```


