#!/bin/bash
# =============================================================================
# VOD_Auctions VPS Deployment Script
# Server: 72.62.148.205 (Hostinger VPS)
# =============================================================================
set -e

PROJECT_DIR="/root/VOD_Auctions"
REPO_URL="https://github.com/rseckler/VOD_Auctions.git"

echo "============================================"
echo "VOD_Auctions Deployment"
echo "============================================"

# --- Step 1: System prerequisites ---
echo ""
echo "[1/8] Installing system prerequisites..."

# Redis
if ! command -v redis-server &>/dev/null; then
    echo "  Installing Redis..."
    apt update && apt install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
    echo "  Redis installed and started."
else
    echo "  Redis already installed."
    systemctl start redis-server 2>/dev/null || true
fi
redis-cli ping

# Node.js check
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
echo "  Node.js version: $NODE_VERSION"
if [[ "$NODE_VERSION" == "none" ]] || [[ "${NODE_VERSION:1:2}" -lt 20 ]]; then
    echo "  ERROR: Node.js >= 20 required. Install via nvm or nodesource."
    exit 1
fi

# Python3 check
python3 --version
pip3 --version || apt install -y python3-pip

echo "  Prerequisites OK."

# --- Step 2: Clone/update repository ---
echo ""
echo "[2/8] Setting up repository..."

if [ -d "$PROJECT_DIR/.git" ]; then
    echo "  Repo exists, pulling latest..."
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard origin/main
else
    echo "  Cloning repository..."
    cd /root
    git clone "$REPO_URL"
fi
cd "$PROJECT_DIR"
echo "  Repository ready."

# --- Step 3: Backend setup ---
echo ""
echo "[3/8] Setting up Backend (Medusa.js)..."
cd "$PROJECT_DIR/backend"

# Install dependencies
npm install

# Create production .env if not exists
if [ ! -f .env.production ]; then
    echo "  Creating .env for production..."
    cat > .env <<'ENVEOF'
MEDUSA_ADMIN_ONBOARDING_TYPE=default
DATABASE_URL=postgresql://postgres:REPLACE_WITH_SUPABASE_DB_PASSWORD@db.bofblwqieuvmqybzxapx.supabase.co:5432/postgres
REDIS_URL=redis://localhost:6379
JWT_SECRET=vod-auctions-jwt-secret-2026-prod
COOKIE_SECRET=vod-auctions-cookie-secret-2026-prod
STORE_CORS=https://vod-auctions.com,https://www.vod-auctions.com,https://vodauction.thehotshit.de,http://localhost:3006
ADMIN_CORS=https://admin.vod-auctions.com,https://api.vod-auctions.com,https://vodauction-api.thehotshit.de,http://localhost:9000
AUTH_CORS=https://vod-auctions.com,https://www.vod-auctions.com,https://admin.vod-auctions.com,https://vodauction.thehotshit.de,https://vodauction-api.thehotshit.de,http://localhost:3006,http://localhost:9000
ENVEOF
    echo "  .env created. IMPORTANT: Update JWT_SECRET and COOKIE_SECRET with secure random values!"
fi

# Build
echo "  Building backend..."
npm run build

# DB migrations
echo "  Running DB migrations..."
npx medusa db:migrate || echo "  (Migrations may already be applied)"

# Start with PM2
echo "  Starting backend with PM2..."
pm2 delete vodauction-backend 2>/dev/null || true
pm2 start ecosystem.config.js
echo "  Backend started on port 9000."

# --- Step 4: Storefront setup ---
echo ""
echo "[4/8] Setting up Storefront (Next.js)..."
cd "$PROJECT_DIR/storefront"

npm install

# Create production .env.local if not exists
if [ ! -f .env.local.bak ]; then
    echo "  Creating .env.local for production..."
    cat > .env.local <<'ENVEOF'
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.vod-auctions.com
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_0b591cae08b7aea1e783fd9a70afb3644b6aff6aaa90f509058bd56cfdbce78d
NEXT_PUBLIC_SUPABASE_URL=https://bofblwqieuvmqybzxapx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvZmJsd3FpZXV2bXF5Ynp4YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODQzNzgsImV4cCI6MjA4Nzk2MDM3OH0.f0rwPjEom1zhCWucImlb8x76sVV3Mt_CIVMBfFkNj3U
ENVEOF
fi

# Build
echo "  Building storefront..."
npm run build

# Stop old clickdummy if running
pm2 delete vodauction-clickdummy 2>/dev/null || true
pm2 delete vodauction 2>/dev/null || true

# Start with PM2
echo "  Starting storefront with PM2..."
pm2 delete vodauction-storefront 2>/dev/null || true
pm2 start ecosystem.config.js
echo "  Storefront started on port 3006."

# --- Step 5: Python scripts ---
echo ""
echo "[5/8] Setting up Python scripts..."
cd "$PROJECT_DIR/scripts"

# Create virtual environment
if [ ! -d venv ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Create .env in project root if not exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cat > "$PROJECT_DIR/.env" <<'ENVEOF'
# Supabase (vod-auctions project, eu-central-1)
NEXT_PUBLIC_SUPABASE_URL=https://bofblwqieuvmqybzxapx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvZmJsd3FpZXV2bXF5Ynp4YXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODQzNzgsImV4cCI6MjA4Nzk2MDM3OH0.f0rwPjEom1zhCWucImlb8x76sVV3Mt_CIVMBfFkNj3U
SUPABASE_PROJECT_ID=bofblwqieuvmqybzxapx

# Legacy MySQL (for migration only)
LEGACY_DB_HOST=213.133.106.99
LEGACY_DB_PORT=3306
LEGACY_DB_USER=maier1_2_r
LEGACY_DB_NAME=vodtapes
LEGACY_DB_PASSWORD=REPLACE_WITH_LEGACY_DB_PASSWORD

# Supabase Direct DB Connection
SUPABASE_DB_URL=postgresql://postgres:REPLACE_WITH_SUPABASE_DB_PASSWORD@db.bofblwqieuvmqybzxapx.supabase.co:5432/postgres
ENVEOF
    echo "  .env created."
fi

echo "  Python scripts ready."

# --- Step 6: Nginx ---
echo ""
echo "[6/8] Configuring Nginx..."

# Copy nginx configs
cp "$PROJECT_DIR/nginx/vodauction-api.conf" /etc/nginx/sites-available/vodauction-api
cp "$PROJECT_DIR/nginx/vodauction-store.conf" /etc/nginx/sites-available/vodauction-store

# Enable sites
ln -sf /etc/nginx/sites-available/vodauction-api /etc/nginx/sites-enabled/vodauction-api
ln -sf /etc/nginx/sites-available/vodauction-store /etc/nginx/sites-enabled/vodauction-store

# Remove old clickdummy config if exists
rm -f /etc/nginx/sites-enabled/vodauction

# Test and reload
nginx -t && systemctl reload nginx
echo "  Nginx configured (HTTP only — run certbot for SSL after DNS propagation)."

# --- Step 7: Cronjobs ---
echo ""
echo "[7/8] Setting up cronjobs..."

# Add cronjobs (idempotent — checks if already present)
CRON_LEGACY="0 4 * * * cd /root/VOD_Auctions/scripts && /root/VOD_Auctions/scripts/venv/bin/python3 legacy_sync.py >> /root/VOD_Auctions/scripts/legacy_sync.log 2>&1"
CRON_DISCOGS="0 2 * * 0 cd /root/VOD_Auctions/scripts && /root/VOD_Auctions/scripts/venv/bin/python3 discogs_weekly_sync.py >> /root/VOD_Auctions/scripts/discogs_weekly.log 2>&1"

(crontab -l 2>/dev/null | grep -v "VOD_Auctions/scripts/legacy_sync" | grep -v "VOD_Auctions/scripts/discogs_weekly"; echo "$CRON_LEGACY"; echo "$CRON_DISCOGS") | crontab -
echo "  Cronjobs installed:"
echo "    - Legacy sync: daily 04:00 UTC"
echo "    - Discogs sync: Sunday 02:00 UTC"

# --- Step 8: PM2 save ---
echo ""
echo "[8/8] Saving PM2 config..."
pm2 save
echo "  PM2 processes saved."

# --- Verification ---
echo ""
echo "============================================"
echo "VERIFICATION"
echo "============================================"

echo ""
echo "PM2 Status:"
pm2 list

echo ""
echo "Health Checks:"
sleep 3
curl -s http://localhost:9000/health && echo " ← Backend OK" || echo " ← Backend FAILED"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3006 && echo " ← Storefront OK" || echo " ← Storefront FAILED"
redis-cli ping

echo ""
echo "Cronjobs:"
crontab -l | grep VOD

echo ""
echo "============================================"
echo "DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Configure DNS at all-inkl.com (A-Records → 72.62.148.205)"
echo "  2. After DNS propagation, run:"
echo "     certbot --nginx -d api.vod-auctions.com"
echo "     certbot --nginx -d vod-auctions.com -d www.vod-auctions.com"
echo "  3. Start initial Discogs batch (runs 8-12h):"
echo "     cd /root/VOD_Auctions/scripts && source venv/bin/activate"
echo "     nohup python3 discogs_batch.py > discogs_batch.log 2>&1 &"
echo ""
