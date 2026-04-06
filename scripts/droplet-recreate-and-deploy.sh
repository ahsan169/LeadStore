#!/usr/bin/env bash
# Destroy a named DigitalOcean droplet, create a fresh Ubuntu 24.04 VM, and deploy LeadStorefront from Git.
#
# Prerequisites (on your Mac):
#   brew install doctl
#   doctl auth init
#
# Required environment:
#   export SEAMLESS_API_KEY='your-seamless-key'
#
# Optional:
#   OLD_DROPLET_NAME   default: ubuntu-s-2vcpu-2gb-nyc3-01  (set SKIP_DELETE=1 to keep all droplets)
#   NEW_DROPLET_NAME   default: leadstorefront-prod
#   REGION             default: nyc3
#   SIZE               default: s-2vcpu-2gb
#   GIT_REPO           default: https://github.com/ahsan169/LeadStore.git
#   DO_SSH_KEY_IDS     comma-separated doctl SSH key IDs (default: first key in your account)
#
set -euo pipefail

DOCTL=$(command -v doctl || true)
if [[ -z "$DOCTL" && -x "$HOME/bin/doctl" ]]; then DOCTL="$HOME/bin/doctl"; fi
if [[ -z "$DOCTL" ]]; then
  echo "Install doctl: brew install doctl  (then: doctl auth init)"
  exit 1
fi

"$DOCTL" account get >/dev/null || {
  echo "doctl is not authenticated. Run: doctl auth init"
  exit 1
}

: "${SEAMLESS_API_KEY:?Set SEAMLESS_API_KEY}"
OLD_DROPLET_NAME="${OLD_DROPLET_NAME:-ubuntu-s-2vcpu-2gb-nyc3-01}"
NEW_DROPLET_NAME="${NEW_DROPLET_NAME:-leadstorefront-prod}"
REGION="${REGION:-nyc3}"
SIZE="${SIZE:-s-2vcpu-2gb}"
GIT_REPO="${GIT_REPO:-https://github.com/ahsan169/LeadStore.git}"
SKIP_DELETE="${SKIP_DELETE:-0}"

if [[ -z "${DO_SSH_KEY_IDS:-}" ]]; then
  DO_SSH_KEY_IDS=$("$DOCTL" compute ssh-key list --format ID --no-header | head -1 | tr -d ' ')
fi
if [[ -z "$DO_SSH_KEY_IDS" ]]; then
  echo "No SSH keys in DigitalOcean. Add one: https://cloud.digitalocean.com/account/security"
  exit 1
fi

SSH_KEY_ARGS=()
IFS=',' read -ra _keys <<<"$DO_SSH_KEY_IDS"
for id in "${_keys[@]}"; do
  id=$(echo "$id" | tr -d ' ')
  [[ -n "$id" ]] && SSH_KEY_ARGS+=(--ssh-keys "$id")
done

if [[ "$SKIP_DELETE" != "1" && -n "$OLD_DROPLET_NAME" ]]; then
  while read -r did dname; do
    if [[ "$dname" == "$OLD_DROPLET_NAME" ]]; then
      echo "Deleting droplet ID=$did name=$dname"
      "$DOCTL" compute droplet delete "$did" --force
    fi
  done < <("$DOCTL" compute droplet list --format ID,Name --no-header)
fi

echo "Creating $NEW_DROPLET_NAME ($SIZE in $REGION)..."
"$DOCTL" compute droplet create "$NEW_DROPLET_NAME" \
  --image ubuntu-24-04-x64 \
  --size "$SIZE" \
  --region "$REGION" \
  "${SSH_KEY_ARGS[@]}" \
  --wait

NEW_ID=$("$DOCTL" compute droplet list --format ID,Name --no-header | awk -v n="$NEW_DROPLET_NAME" '$2==n {print $1; exit}')
DROPLET_IP=$("$DOCTL" compute droplet get "$NEW_ID" --format PublicIPv4 --no-header | tr -d ' ')
echo "New droplet IPv4: $DROPLET_IP"

echo "Waiting for SSH..."
for i in $(seq 1 60); do
  if ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 "root@${DROPLET_IP}" "echo ok" 2>/dev/null; then
    break
  fi
  sleep 5
  if [[ "$i" == "60" ]]; then
    echo "SSH did not become ready in time."
    exit 1
  fi
done

DB_PASSWORD=$(openssl rand -hex 16)
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

ssh -o StrictHostKeyChecking=accept-new "root@${DROPLET_IP}" bash -s <<REMOTE
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git rsync ca-certificates

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y -qq nodejs
npm install -g pm2

apt-get install -y -qq postgresql postgresql-contrib nginx
systemctl enable --now postgresql
systemctl enable --now nginx

id leadapp 2>/dev/null || adduser --disabled-password --gecos '' leadapp

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'leadstorefront'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE leadstorefront;"
sudo -u postgres psql -c "DROP USER IF EXISTS leaduser;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE USER leaduser WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE leadstorefront TO leaduser;"
sudo -u postgres psql -d leadstorefront -c "GRANT ALL ON SCHEMA public TO leaduser;"

install -d -o leadapp -g leadapp /home/leadapp/LeadStorefrontAI
sudo -u leadapp git clone --depth 1 "${GIT_REPO}" /home/leadapp/LeadStorefrontAI || true
if [[ ! -f /home/leadapp/LeadStorefrontAI/package.json ]]; then
  echo "Git clone failed or repo empty."
  exit 1
fi

sudo -u leadapp bash -c "cd /home/leadapp/LeadStorefrontAI && npm install && npm run build"

sudo -u leadapp tee /home/leadapp/LeadStorefrontAI/.env > /dev/null <<ENVEOF
DATABASE_URL=postgresql://leaduser:${DB_PASSWORD}@localhost:5432/leadstorefront
PORT=3000
NODE_ENV=production
SEAMLESS_API_KEY=${SEAMLESS_API_KEY}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ENVEOF
chmod 600 /home/leadapp/LeadStorefrontAI/.env

sudo -u leadapp bash -c "cd /home/leadapp/LeadStorefrontAI && npm run db:push"

sudo -u leadapp bash -c "cd /home/leadapp/LeadStorefrontAI && (pm2 delete leadstorefront 2>/dev/null || true) && pm2 start ecosystem.config.cjs && pm2 save"
STARTUP_LINE=\$(sudo -u leadapp env PATH=\$PATH pm2 startup systemd -u leadapp --hp /home/leadapp 2>/dev/null | tail -1)
if [[ -n "\$STARTUP_LINE" ]]; then eval "\$STARTUP_LINE"; fi

cat > /etc/nginx/sites-available/leadstorefront <<NGX
server {
    listen 80;
    server_name ${DROPLET_IP};

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }

    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
NGX
ln -sf /etc/nginx/sites-available/leadstorefront /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
REMOTE

echo ""
echo "Done. App: http://${DROPLET_IP}"
echo "Save these (not stored on your Mac by this script):"
echo "  DATABASE_URL=postgresql://leaduser:${DB_PASSWORD}@localhost:5432/leadstorefront"
echo "  (also on server in /home/leadapp/LeadStorefrontAI/.env)"
