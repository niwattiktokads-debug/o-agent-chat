#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${HOME}/Applications/O Agent Omni.app"
SERVER_URL="${OMNI_SERVER_URL:-http://127.0.0.1:8788}"

cd "$ROOT"

npm --prefix server test
npm --prefix client test
npm --prefix client run build
"$ROOT/scripts/build-mac-app.sh"

open "$APP_PATH"

if [[ "${1:-}" == "--verify" ]]; then
  for _ in {1..20}; do
    if curl -fsS "$SERVER_URL/api/health" >/dev/null 2>&1; then
      echo "verified: $SERVER_URL/api/health"
      exit 0
    fi
    sleep 1
  done
  echo "server healthcheck failed: $SERVER_URL/api/health" >&2
  exit 1
fi
