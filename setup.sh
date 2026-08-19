#!/bin/bash
set -e

echo "=== ShopDrawer Setup ==="

echo "[1/6] Installing server dependencies..."
cd server
npm install
cd ..

echo "[2/6] Installing widget dependencies..."
cd widget-src
npm install
cd ..

echo "[3/6] Building widget..."
cd widget-src
npm run build
cd ..

echo "[4/6] Installing dashboard dependencies..."
cd dashboard
npm install
cd ..

echo "[5/6] Running Prisma migrations..."
cd server
npx prisma generate
npx prisma db push
cd ..

echo "[6/6] Building dashboard..."
cd dashboard
npm run build
cd ..

echo ""
echo "=== Setup Complete ==="
echo "To start with PM2: pm2 start ecosystem.config.js"
echo "Server:    http://localhost:5002"
echo "Dashboard: http://localhost:5003"
