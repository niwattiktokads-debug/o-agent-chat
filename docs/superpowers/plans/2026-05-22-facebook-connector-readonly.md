# Facebook Connector Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only Facebook connector that calls the local `meta-inbox-api` helper, normalizes conversations into Omni shapes, and exposes them through a safe API.

**Architecture:** Keep the existing mock seed as default. Add a `MetaInboxClient` wrapper around the helper with injectable command runner for tests. Add normalizers that map Meta conversations to `threads`, `customers`, and preview `messages`. Expose `/api/omni/facebook/conversations?page=<profile>` as read-only; no send or mutation endpoints.

**Tech Stack:** Node.js `child_process.execFile`, Express, Node test runner, existing `meta-inbox-api` helper.

---

## Tasks

1. Create `server/src/omni/metaInboxClient.js` with helper runner and normalizer.
2. Add tests using an injected fake runner, including customer/page sender split.
3. Mount `GET /api/omni/facebook/conversations`.
4. Add a small client helper and UI button/link for Facebook live preview.
5. Verify server tests, client tests, build, and one real helper call.
