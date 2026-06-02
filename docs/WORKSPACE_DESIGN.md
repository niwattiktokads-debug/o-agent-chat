# Omni Private SaaS v1 — Workspace Foundation Design

## Overview

This document describes the **additive** multi-tenant/workspace model introduced in the
`feature/omni-private-saas-v1-foundation` branch. The design preserves 100% backward
compatibility with the existing O-Agent single-tenant runtime.

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Workspace** | A logical tenant boundary that owns pages, channels, settings, and knowledge. |
| **Default Workspace** | `ws_oagent` — the existing O-Agent workspace. All current pages/channels are mapped here automatically. |
| **Workspace ID** | Prefixed string `ws_*`. Used as an optional filter/context parameter. |
| **Backward Compatibility** | When no `workspaceId` is supplied, the system behaves exactly as before (single-tenant mode). |

## Data Model (Additive Only)

### New Collection: `workspaces`

```json
{
  "id": "ws_oagent",
  "name": "O-Agent",
  "slug": "o-agent",
  "plan": "private_saas",
  "status": "active",
  "ownerRef": "boss",
  "settings": {},
  "createdAt": "2026-06-02T00:00:00.000Z",
  "updatedAt": "2026-06-02T00:00:00.000Z"
}
```

### New Field on Existing Collections (nullable, additive)

| Collection | New Field | Default |
|------------|-----------|---------|
| `pages` | `workspaceId` | `'ws_oagent'` (backfilled) |
| `knowledgeSources` | `workspaceId` | `'ws_oagent'` (backfilled) |
| `omniSettings` | `workspaceId` | `'ws_oagent'` (backfilled) |

### Mapping Strategy

- All existing pages get `workspaceId: 'ws_oagent'` via seed backfill.
- Queries without `workspaceId` return **all** data (backward-compatible).
- Queries with `workspaceId` filter to that workspace only.
- No existing field is removed or renamed.

## API Changes (Additive)

| Endpoint | Change |
|----------|--------|
| `GET /api/omni/workspaces` | **New** — list all workspaces |
| `GET /api/omni/workspaces/:id` | **New** — get workspace detail with mapped pages |
| `GET /api/omni/snapshot` | Adds `workspaces` array to response; existing fields unchanged |
| `GET /api/omni/pages` | Optional `?workspaceId=` filter; without it returns all pages as before |

## Frontend Changes

- **Settings Page**: New "Workspace" info panel showing current workspace name, plan, status, and page count.
- **AI Config Panel**: Shows workspace badge per page card.
- No new navigation or routing required for v1.

## Safety Guarantees

1. No existing field removed or renamed.
2. No migration deletes data.
3. System works identically when `workspaceId` is absent.
4. Default workspace `ws_oagent` is auto-created via seed.
5. No deploy, env change, or credential modification.
