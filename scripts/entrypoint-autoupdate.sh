#!/bin/sh
set -e  # Exit on any error

echo "=== Garcon Auto-Update Startup ==="

# Clean up any previous source directory
if [ -d /app/src ]; then
    echo "[STARTUP] Cleaning up previous source..."
    chmod -R u+rwX /app/src 2>/dev/null || true
    rm -rf /app/src
fi

echo "[STARTUP] Cloning repository..."
git clone --depth 1 --branch "${GIT_BRANCH:-master}" "${GIT_REPO_URL:-https://github.com/Lmdudester/Garcon.git}" /app/src

echo "[STARTUP] Installing dependencies..."
cd /app/src
pnpm install --frozen-lockfile

echo "[STARTUP] Building application..."
pnpm --filter @garcon/shared build
pnpm --filter @garcon/backend build
pnpm --filter @garcon/frontend build

echo "[STARTUP] Starting Garcon..."
NODE_ENV=production exec node packages/backend/dist/index.js
