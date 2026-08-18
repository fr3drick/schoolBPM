#!/usr/bin/env bash
# Redeploy School BPM to the production server.
#
# The Angular build runs locally: the server has 1GB of RAM and cannot build it.
# Everything else (deps, service restart) happens over SSH.
#
# Usage: ./deploy.sh
set -euo pipefail

HOST="${SCHOOLBPM_HOST:-ubuntu@150.230.125.111}"
APP_DIR="${SCHOOLBPM_DIR:-/opt/schoolbpm}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building client"
(cd "$ROOT/client" && npm ci --silent && npx ng build --configuration production)

echo "==> Syncing server code"
rsync -az --delete --exclude node_modules --exclude .env --exclude .git \
  "$ROOT/server/src" "$ROOT/server/package.json" "$ROOT/server/package-lock.json" \
  "$HOST:$APP_DIR/"

echo "==> Syncing client bundle"
rsync -az --delete "$ROOT/client/dist/client/browser/" "$HOST:$APP_DIR/public/"

echo "==> Installing dependencies and restarting"
ssh "$HOST" "set -e
  cd '$APP_DIR'
  npm ci --omit=dev --silent
  sudo chgrp -R schoolbpm '$APP_DIR'
  sudo systemctl restart schoolbpm"

echo "==> Health check"
sleep 5
ssh "$HOST" "curl -fsS http://127.0.0.1:4100/api/health" && echo
echo "Deployed: https://efeirubor.name.ng:8080"
