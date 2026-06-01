# Codex Task: Fix Deploy and Facebook Comment Auto-Reply Bug

We are deploying a Meta Webhook and AI reply engine on Railway Cloud. We have encountered two critical issues that need to be resolved:

## 1. Railway Build Failure (Nixpacks & Railpack detection)
**Problem:** The server source code is located in the `server/` subdirectory, but the repository root does not have a `package.json`. Railway's Nixpacks/Railpack builder fails because it cannot detect a Node.js project at the root level.
**Solution:**
- Create a `package.json` at the root directory that acts as a proxy/manifest for the Node.js project.
- Configure `nixpacks.toml` at the root directory to specify `nodejs_22` and run `npm --prefix server install --omit=dev` during the install phase.
- Configure `railway.toml` at the root directory to use the `dockerfile` builder as a backup, pointing to a root `Dockerfile` that correctly copies the `server/` files and installs dependencies.

## 2. Facebook/Instagram Comment Webhook Auto-Reply Bug
**Problem:** When a user comments on a Facebook page post or Instagram media, the Meta webhook receives a `feed` or `comments` event. The webhook normalizes the payload into a thread with platform `facebook_comment`, `facebook_video_comment`, or `instagram_comment`. However, `autoReplyThreadIds` in `server/src/webhook.js` only checks for `candidate.platform === 'facebook'`, completely ignoring comment platforms. This results in `autoReplies: 0` and the AI never drafting or sending replies to comments.
**Solution:**
- Update `autoReplyThreadIds` in `server/src/webhook.js` to correctly resolve and include comment platforms (`facebook_comment`, `facebook_video_comment`, `instagram_comment`).
- Ensure that the thread resolution logic maps comment threads correctly to their database/snapshot counterparts so that the AI reply engine can draft replies.

---

### Files to Create/Modify:

#### A. Root `package.json` (Create if not exists)
```json
{
  "name": "omni-server-root",
  "version": "0.0.3",
  "private": true,
  "scripts": {
    "start": "node server/src/index.js",
    "install:server": "npm --prefix server install --omit=dev"
  },
  "engines": {
    "node": ">=22"
  }
}
```

#### B. Root `nixpacks.toml` (Modify/Create)
```toml
[phases.setup]
nixPkgs = ["nodejs_22"]

[phases.install]
cmds = ["npm --prefix server install --omit=dev"]

[start]
cmd = "node server/src/index.js"
```

#### C. Root `Dockerfile` (Modify/Create)
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/src/index.js"]
```

#### D. Root `railway.toml` (Modify/Create)
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node server/src/index.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

#### E. `server/src/webhook.js` (Modify `autoReplyThreadIds` function)
```javascript
const COMMENT_PLATFORMS = new Set(['facebook_comment', 'facebook_video_comment', 'instagram_comment'])

function autoReplyThreadIds({ normalized, snapshot }) {
  const threads = snapshot?.threads || []
  const pagesById = new Map((snapshot?.pages || []).map((page) => [page.id, page]))
  const ids = []
  for (const thread of normalized.threads || []) {
    const isComment = COMMENT_PLATFORMS.has(thread.platform)
    const resolved = threads.find((candidate) => (
      (isComment
        ? COMMENT_PLATFORMS.has(candidate.platform)
        : candidate.platform === 'facebook') &&
      candidate.pageId === thread.pageId &&
      candidate.customerId === thread.customerId &&
      (isComment || !String(candidate.id || '').startsWith('fb_webhook_'))
    )) || threads.find((candidate) => candidate.id === thread.id)
    const page = pagesById.get(resolved?.pageId || thread.pageId)
    if (page?.autoReplyEnabled === false) continue
    if (resolved?.id && !ids.includes(resolved.id)) ids.push(resolved.id)
  }
  return ids
}
```

Please execute these changes, ensure all code matches production quality, and verify that there are no syntax errors.
