# Omni Production Checklist

Status for the local MVP:

- Branch: `omnichannel-foundation-mvp`
- Local database: SQLite at `server/data/omni.sqlite`
- Meta profiles verified: `anna_lynn`, `man_kynd`, `page_des`, `fb_112154661515664`
- AI mode: guarded draft only. No customer-facing send is performed by the AI endpoint.

Run locally:

```bash
./scripts/omni-start-local.sh
```

Healthcheck:

```bash
./scripts/omni-healthcheck.sh
```

Meta webhook setup:

1. Set `META_VERIFY_TOKEN` in `server/.env`.
2. Expose the local server through a secure HTTPS tunnel or deploy it.
3. Configure Meta webhook callback URL to `/webhook/meta`.
4. Subscribe to Messenger events for the pages.

Cloud path:

- Keep SQLite for local use.
- Move to Postgres before multi-device or 24/7 cloud use.
- Move all C Snap credentials into cloud secret manager.
