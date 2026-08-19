#!/bin/bash
set -e

echo "=== ShopDrawer VPS Deployment ==="

# Update system
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# Install Node.js 20
echo "[2/8] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
echo "Node: $(node -v), npm: $(npm -v)"

# Install PM2
echo "[3/8] Installing PM2..."
npm install -g pm2

# Install PostgreSQL
echo "[4/8] Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
  apt install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

# Create database and user
echo "[5/8] Setting up database..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='shopdrawer'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER shopdrawer WITH PASSWORD 'changeme_strong_password';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='shopdrawer'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE shopdrawer OWNER shopdrawer;"

# Install Nginx
echo "[6/8] Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# Configure Nginx reverse proxy
echo "[7/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/shopdrawer <<'NGINX'
server {
    listen 80;
    server_name _;

    # Server API + widget.js
    location /api/ {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /widget.js {
        proxy_pass http://127.0.0.1:5002/widget.js;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=300";
    }

    # Dashboard
    location / {
        proxy_pass http://127.0.0.1:5003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/shopdrawer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Setup the app
echo "[8/8] Setting up ShopDrawer app..."
cd /root/shopdrawer

# Create .env if it doesn't exist
if [ ! -f server/.env ]; then
  cat > server/.env <<'ENV'
DATABASE_URL=postgresql://shopdrawer:changeme_strong_password@localhost:5432/shopdrawer
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHARS
ENCRYPTION_KEY=CHANGE_ME_TO_RANDOM_32_CHARS
PORT=5002
DASHBOARD_URL=http://200.141.13.66
SABPAISA_MERCHANT_ID=
SABPAISA_CLIENT_CODE=
SABPAISA_AUTH_KEY=
SABPAISA_AUTH_IV=
SABPAISA_CALLBACK_URL=http://200.141.13.66/api/payments/callback
WIDGET_CALLBACK_URL=http://200.141.13.66
ENV
  echo ">>> Created server/.env — EDIT IT with real secrets!"
fi

if [ ! -f dashboard/.env.local ]; then
  cat > dashboard/.env.local <<'ENV'
NEXT_PUBLIC_API_URL=http://200.141.13.66
ENV
fi

# Install deps, build widget, run migrations, build dashboard
cd server && npm install && cd ..
cd widget-src && npm install && npm run build && cd ..
cd dashboard && npm install && npm run build && cd ..
cd server && npx prisma generate && npx prisma db push && cd ..

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo ""
echo "=== Deployment Complete ==="
echo "Dashboard: http://200.141.13.66"
echo "Widget JS: http://200.141.13.66/widget.js"
echo ""
echo "IMPORTANT: Edit /root/shopdrawer/server/.env with real secrets!"
echo "Then run: cd /root/shopdrawer && pm2 restart all"
