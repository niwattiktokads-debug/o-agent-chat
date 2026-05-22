#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"

export PORT="${PORT:-8787}"
export OMNI_DB_PATH="${OMNI_DB_PATH:-$SERVER_DIR/data/omni.sqlite}"

mkdir -p "$SERVER_DIR/data"

cd "$SERVER_DIR"
npm run start &
SERVER_PID=$!

cd "$CLIENT_DIR"
npm run dev -- --host 127.0.0.1 &
CLIENT_PID=$!

trap 'kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true' INT TERM EXIT

echo "Omni server: http://127.0.0.1:$PORT"
echo "Omni client: http://127.0.0.1:5173"
wait
