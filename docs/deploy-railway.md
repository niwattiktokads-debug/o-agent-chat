# Deploy O Agent Omni Server to Railway

## Prerequisites

- Railway account: https://railway.app
- GitHub repo connected to Railway
- Meta App with webhook permissions

## Step 1: Create Railway Project

1. Railway dashboard -> New Project -> Deploy from GitHub repo.
2. Select `o-agent-chat`; Railway should detect `railway.toml`.
3. Wait for first deploy.
4. Copy the Railway public URL, for example `https://xxx.up.railway.app`.

## Step 2: Set Environment Variables

Railway dashboard -> your service -> Variables -> add values from `server/.env.cloud.example`.

Production storage uses a Railway Volume named `omni-server-data` mounted at
`/data`. Keep `OMNI_DB_PATH=/data/omni.sqlite`; using a relative path such as
`./data/omni.sqlite` stores data inside the container and may reset on deploy.

Required minimum:

| Variable | Value |
| --- | --- |
| `OMNI_AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | OpenAI API key |
| `META_VERIFY_TOKEN` | Random string, for example from `openssl rand -hex 16` |
| `OMNI_ACCESS_PASSWORD` | Strong password for the inbox UI |
| `OMNI_ACTION_TOKEN` | Strong random token for approved API calls |
| `OMNI_DB_PATH` | `/data/omni.sqlite` |
| `META_PAGE_TOKEN_ANNA_LYNN` | Facebook page access token |
| `ZORT_STORE_NAME` | ZORT Open API store name |
| `ZORT_API_KEY` | ZORT Open API key |
| `ZORT_API_SECRET` | ZORT Open API secret |

Meta Pay / KGP can be deployed ahead of approval, but keep it disabled:

| Variable | Value |
| --- | --- |
| `META_PAY_KGP_ENABLED` | `0` |
| `META_PAY_KGP_MERCHANT_ID` | KGP merchant ID, blank until received |
| `META_PAY_KGP_API_KEY` | KGP API key, blank until received |
| `META_PAY_KGP_API_SECRET` | KGP API secret, blank until received |
| `META_PAY_KGP_WEBHOOK_SECRET` | KGP webhook secret, blank until received |
| `META_PAY_KGP_CHECKOUT_ENDPOINT` | KGP checkout API endpoint from KGP |
| `META_PAY_KGP_WEBHOOK_PATH` | `/webhook/kgp/meta-pay` |

Keep safe defaults:

| Variable | Value |
| --- | --- |
| `OMNI_META_WEBHOOK_SEND` | `0` |
| `OMNI_META_WEBHOOK_AUTO_REPLY` | `1` |

ZORT product lookup and approved order creation run directly against the ZORT
Open API in Railway. Leave `ZORT_HELPER` empty on cloud; the local
`/Users/.../.codex/bin/zort-api` helper is only a Mac/C Snap fallback.

## Step 3: Verify Server Health

```bash
curl https://xxx.up.railway.app/api/health
```

Expected response:

```json
{"ok":true}
```

## Step 4: Test Webhook Verification

```bash
WEBHOOK_URL=https://xxx.up.railway.app \
META_VERIFY_TOKEN=your-token \
bash scripts/verify-webhook.sh
```

Expected output includes `Webhook verification OK`.

## Step 5: Subscribe Meta Webhook

Use the helper for app-level subscription:

```bash
META_APP_ID=your-app-id \
META_APP_SECRET=your-app-secret \
WEBHOOK_CALLBACK_URL=https://xxx.up.railway.app \
META_VERIFY_TOKEN=your-token \
bash scripts/subscribe-meta-webhook.sh
```

Then review page subscriptions in Meta Developer Console.

For Facebook pages:

- Object: `Page`
- Callback URL: `https://xxx.up.railway.app/webhook/meta`
- Verify Token: same as `META_VERIFY_TOKEN`
- Subscribed fields: `messages`, `messaging_postbacks`, `feed`

For Instagram:

- Object: `Instagram`
- Callback URL: same endpoint
- Subscribed fields: `messages`, `comments`

## Step 6: Test Draft Mode

Send a test message to a Facebook page, then check Railway logs and the Omni inbox UI. The system should create an AI draft while `OMNI_META_WEBHOOK_SEND=0` keeps customer-facing send disabled.

## Step 7: Enable Auto-Send After Approval

Only after confirming drafts are correct:

1. Railway Variables -> set `OMNI_META_WEBHOOK_SEND=1`.
2. Redeploy.
3. Test one page first before expanding scope.

## Step 8: Enable KGP Payment Links After Approval

Do not enable KGP until the message template is approved and a sandbox/live smoke
test has passed.

1. Add KGP merchant/API/webhook secrets in Railway Variables.
2. Add the KGP checkout endpoint from KGP in `META_PAY_KGP_CHECKOUT_ENDPOINT`.
3. Keep `META_PAY_KGP_ENABLED=0` and redeploy.
4. Verify `/api/omni/payments/providers/meta_pay_kgp/health`; it should show
   credentials ready but disabled.
5. Run a signed webhook smoke test against `/webhook/kgp/meta-pay`.
6. After Boss approval, set `META_PAY_KGP_ENABLED=1` and redeploy.

## Updating IG Page IDs

When real IG Page IDs are available:

1. Edit `server/data/pages.json`.
2. Replace `PLACEHOLDER_IG_*_PAGE_ID` with real IDs.
3. Commit and push; Railway redeploys from GitHub.

## Adding New Pages

```bash
curl -X POST https://xxx.up.railway.app/api/omni/pages/registry \
  -H "Content-Type: application/json" \
  -H "Cookie: omni_access=<session>" \
  -d '{
    "profileKey": "new_page",
    "pageId": "123456789",
    "pageName": "New Page Name",
    "omniPageId": "page_new_page",
    "platform": "facebook"
  }'
```
