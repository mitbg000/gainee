#!/usr/bin/env bash
# Install / update Gainee on the server. Safe to run repeatedly.
#   bash scripts/deploy.sh            # pull latest code from origin/main, build, migrate, reload
#   bash scripts/deploy.sh --no-pull  # build what is already on disk
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_node.sh

[ -f .env ] || { echo ".env not found – run: bash scripts/init-env.sh"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo "==> Installing PM2"; npm install -g pm2; }

if [ "${1:-}" != "--no-pull" ] && [ -d .git ]; then
  echo "==> Pulling latest code"
  git fetch --quiet origin
  git reset --hard origin/main
fi

echo "==> Installing dependencies"
# speech recognition runs on the CPU: skip onnxruntime-node's CUDA download (404s, and no GPU here)
ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm ci --no-audit --no-fund

echo "==> Building"
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "==> Migrating database"
node --env-file=.env dist/migrate.js

echo "==> (Re)starting processes"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

echo "==> Health check"
PORT=$(grep -E '^PORT=' .env | cut -d= -f2); PORT=${PORT:-3000}
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "✅ Gainee is running: $(git log -1 --pretty='%h %s' 2>/dev/null || echo 'local build')"
    exit 0
  fi
  sleep 2
done
echo "❌ No response on port $PORT – check logs: pm2 logs gainee-web --lines 100"
exit 1
