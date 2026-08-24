#!/usr/bin/env bash
# Redeploy School BPM to the TEST server.
#
# Mirrors deploy.sh, pointed at the test host, directory, service and domain.
# The Angular build runs locally: the server has ~1GB of RAM and cannot build it.
#
# Test differs from production in its own database, JWT secret and Resend key,
# all of which live in /opt/schoolbpm-test/.env on the server. That file is
# never synced, so redeploying cannot overwrite it — and a new environment
# variable has to be added there by hand.
#
# Usage: ./deploy-test.sh
set -euo pipefail

HOST="${SCHOOLBPM_TEST_HOST:-ubuntu@140.238.65.145}"
APP_DIR="${SCHOOLBPM_TEST_DIR:-/opt/schoolbpm-test}"
SERVICE="${SCHOOLBPM_TEST_SERVICE:-schoolbpm-test}"
PORT="${SCHOOLBPM_TEST_PORT:-4100}"
URL="${SCHOOLBPM_TEST_URL:-https://test.idverge.com.ng}"
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
  sudo systemctl restart '$SERVICE'"

echo "==> Health check"
sleep 5
ssh "$HOST" "curl -fsS http://127.0.0.1:$PORT/api/health" && echo
echo "Deployed: $URL"
