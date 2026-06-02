# Omni Production Checklist

Status for the local MVP:

- Branch: `omnichannel-foundation-mvp`
- Local database: SQLite at `server/data/omni.sqlite`
- Railway production database: SQLite at `/data/omni.sqlite` on Railway Volume `omni-server-data`
- Meta profiles verified: `anna_lynn`, `man_kynd`, `page_des`, `fb_112154661515664`
- AI mode: guarded draft only. No customer-facing send is performed by the AI endpoint.
- Chat retention: enabled by runtime config. Default deletes message bodies older than 180 days, while preserving customer contact profile fields such as phone, address, and contact history.
- Voice input: browser push-to-talk is available in the main composer. This is client-side dictation for local MVP, not server-side customer voice-message transcription.
- Dex signal: Meta and TikTok webhooks raise an event-driven `omni:attention` signal and add a Codex room message when a new inbound customer message arrives. This is not polling and does not send customer-facing replies.
- Manual drafts: the Omni thread detail has a reply composer with image attachment preview. Drafts are saved locally as `manual_draft` and are not sent to the customer.

Run locally:

```bash
./scripts/omni-start-local.sh
```

Healthcheck:

```bash
./scripts/omni-healthcheck.sh
```

Chat retention controls:

```bash
OMNI_CHAT_API_BASE=http://127.0.0.1:8788 /Users/babycuca/.codex/bin/omni-chat-runtime retention-status
OMNI_CHAT_API_BASE=http://127.0.0.1:8788 /Users/babycuca/.codex/bin/omni-chat-runtime retention-dry-run --days=180
OMNI_CHAT_API_BASE=http://127.0.0.1:8788 /Users/babycuca/.codex/bin/omni-chat-runtime retention-apply --days=180
```

Storage verification:

Railway production must keep `OMNI_DB_PATH=/data/omni.sqlite` and mount the
`omni-server-data` volume at `/data`. Verify from Settings -> Persistent
storage or through:

```bash
curl https://omni-server-production.up.railway.app/api/omni/storage/status
```

The response should report `persistent: true` and `volumeMountPath: "/data"`.

Retention environment:

- `OMNI_CHAT_RETENTION_ENABLED`: default `true`
- `OMNI_CHAT_RETENTION_DAYS`: default `180`
- `OMNI_CHAT_RETENTION_INTERVAL_MS`: default one day
- `OMNI_CHAT_RETENTION_RUN_ON_START`: default `false`

Meta webhook setup:

1. Set `META_VERIFY_TOKEN` in `server/.env`.
2. Expose the local server through a secure HTTPS tunnel or deploy it.
3. Configure Meta webhook callback URL to `/webhook/meta`.
4. Subscribe to Messenger events for the pages.

Event-driven Dex signal:

- Incoming Meta webhook: `/webhook/meta`
- Incoming TikTok Business Messaging webhook: `/webhook/tiktok/business-messaging`
- New inbound messages broadcast `omni:attention`
- The O Agent Chat room receives a Codex message beginning `@เดส มีข้อความลูกค้าใหม่`
- Duplicate webhook deliveries are upserted and do not re-signal when no new message is inserted
- Auto-draft is controlled by `OMNI_META_WEBHOOK_AUTO_REPLY`; customer-facing Meta send is live only when `OMNI_META_WEBHOOK_SEND=1`
- Live local replies use `OMNI_AI_PROVIDER=local_rules` so Dex/Codex local runtime answers without Gemini/OpenAI; cloud can switch to a real provider API key such as `OPENAI_API_KEY` after approval.
- Boss-approved all-intent mode uses `OMNI_AI_AUTO_SEND_ALL=1`; this lets the webhook send AI replies immediately instead of waiting for per-intent approval

Manual reply composer:

- UI: open Inbox/Omni, select a thread, type in the bottom composer, optionally attach images
- API: `POST /api/omni/threads/:threadId/manual-draft`
- Output: outbound Omni message with `sourceRef=manual_draft` and `deliveryStatus=draft_only`
- Guard: this does not call Meta/TikTok/Shopee send APIs

Cloud path:

- Keep SQLite for local use.
- Move to Postgres before multi-device or 24/7 cloud use.
- Move all C Snap credentials into cloud secret manager.
- Add a server-side speech-to-text provider before treating voice messages from customers as production input.
