#!/usr/bin/env bash
# Usage:
#   WEBHOOK_URL=https://xxx.up.railway.app META_VERIFY_TOKEN=yyy bash scripts/verify-webhook.sh
#
# Tests that the webhook endpoint responds correctly to Meta's challenge.

set -euo pipefail

WEBHOOK_URL="${WEBHOOK_URL:?WEBHOOK_URL required}"
VERIFY_TOKEN="${META_VERIFY_TOKEN:?META_VERIFY_TOKEN required}"
CHALLENGE="test_challenge_$(date +%s)"
WEBHOOK_URL="${WEBHOOK_URL%/}"

echo "Testing webhook verification..."
RESPONSE=$(curl -sf "${WEBHOOK_URL}/webhook/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${CHALLENGE}")

if [ "$RESPONSE" = "$CHALLENGE" ]; then
  echo "Webhook verification OK - response: $RESPONSE"
else
  echo "Webhook verification FAILED - expected: $CHALLENGE, got: $RESPONSE"
  exit 1
fi
