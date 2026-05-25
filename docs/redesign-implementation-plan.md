# O Agent Omni Redesign Implementation Plan

## Phase 1 - Lock System

- Create design source of truth in `design.md`.
- Add shared CSS tokens.
- Update route intent so `mode=omni` opens the inbox.

## Phase 2 - Workbench Shell

- Replace fixed 4-column layout with responsive workbench shell.
- Desktop: source rail, work queue, conversation, context drawer.
- Mobile/tablet: staged layout with horizontal source/queue and full-width chat.

## Phase 3 - Queue and Chat

- Redesign page rail into compact source selector.
- Redesign thread cards with customer, preview, time, unread, page/platform.
- Redesign chat stream with inbound/outbound alignment and metadata.
- Keep realtime WebSocket subscription.

## Phase 4 - Context Drawer

- Convert AI/order/payment into contextual tabs.
- Move connector health, sync tools, and page management into a Tools disclosure.

## Phase 5 - Verify

- Check current framework/library docs with Context7 before final UI changes.
- Run client tests.
- Run server tests if route/webhook assumptions change.
- Restart local client.
- Verify with Playwright at desktop and mobile widths.

## Phase 6 - Zaapi Workflow Parity

- Add character usage and quota display to AI training.
- Replace free-text source scope with page/account selector.
- Add guided source type panels for manual, website, and file ingestion.
- Split basic instructions into scenario/SOP handling.
- Add AI personality/brand voice setup.
- Expand deploy into activation templates.
- Add AI analytics for drafted, sent, approved, escalated, and saved-time metrics.

Reference: `docs/zaapi-ai-train-study.md`.
