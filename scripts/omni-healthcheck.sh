#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT:-8788}}"

curl -fsS "$BASE_URL/api/health" >/dev/null
curl -fsS "$BASE_URL/api/omni/pages" >/dev/null
curl -fsS "$BASE_URL/api/omni/schema" >/dev/null

echo "ok"
