#!/usr/bin/env bash
# Usage:
#   META_APP_ID=xxx META_APP_SECRET=yyy WEBHOOK_CALLBACK_URL=https://xxx.up.railway.app META_VERIFY_TOKEN=yyy \
#     bash scripts/subscribe-meta-webhook.sh
#
# Subscribes the Meta app webhook callback. Page token subscriptions still need
# to be reviewed page-by-page in Meta Developer Console or a guarded page helper.

set -euo pipefail

APP_ID="${META_APP_ID:?META_APP_ID required}"
APP_SECRET="${META_APP_SECRET:?META_APP_SECRET required}"
CALLBACK_URL="${WEBHOOK_CALLBACK_URL:?WEBHOOK_CALLBACK_URL required}"
VERIFY_TOKEN="${META_VERIFY_TOKEN:?META_VERIFY_TOKEN required}"
GRAPH_VERSION="${META_GRAPH_VERSION:-v23.0}"
CALLBACK_URL="${CALLBACK_URL%/}"

echo "Getting app access token..."
APP_TOKEN_RESP=$(curl -sf "https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&grant_type=client_credentials")
APP_TOKEN=$(echo "$APP_TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Subscribing app to page webhook..."
curl -sf -X POST "https://graph.facebook.com/${GRAPH_VERSION}/${APP_ID}/subscriptions" \
  -d "object=page" \
  --data-urlencode "callback_url=${CALLBACK_URL}/webhook/meta" \
  --data-urlencode "verify_token=${VERIFY_TOKEN}" \
  -d "fields=messages,messaging_postbacks,feed,comments" \
  --data-urlencode "access_token=${APP_TOKEN}" \
  | python3 -c "import sys,json; print('App subscribe:', json.load(sys.stdin))"

echo ""
echo "Done. Now subscribe each page token separately in Meta Developer Console."
echo "Callback URL: ${CALLBACK_URL}/webhook/meta"
echo "Verify Token: ${VERIFY_TOKEN}"
echo "Fields: messages, messaging_postbacks, feed, comments"
