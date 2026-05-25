# Vanta Design Direction - O Agent Omni

Owner: Vanta  
Executor: Dex  
Scope: Redesign the Omni inbox into an AI/operator command center.

## Design Position

O Agent Omni is not a normal admin dashboard. It is a terminal-like hub where AI
does the routine work and Boss checks only when needed. The interface should
prioritize operational truth over decoration.

## Visual Direction

- Tone: restrained, dense, work-focused, Thai operator-first.
- Shape: workbench, not landing page.
- Palette: warm white paper, graphite text, restrained teal/live green accent.
- Corners: 6-8px for operational surfaces.
- Motion: minimal. Realtime changes should appear immediately.
- Typography: system sans with Thai readability first.

## Screen Model

1. Source rail: pages/platforms with unread counts.
2. Work queue: customer threads sorted by newest/urgency.
3. Conversation workspace: active customer thread and latest message.
4. Context drawer: AI, customer, order, payment tabs.
5. Tools area: sync, health, page management outside the live reply workflow.

## Interaction Priorities

- Boss should see the latest customer message within one glance.
- Boss should know whether AI drafted, sent, or needs approval.
- Boss should not need to hunt through connector widgets while answering a
  customer.
- Mobile should become a staged workflow, not squeezed columns.

## Component Direction

### Source Rail

Compact rail with page initials, platform, active marker, and unread count.
Use full page names only when space allows.

### Thread Card

Must show:

- customer name
- page/platform
- latest message preview
- relative time
- unread count
- status/AI state

### Chat Stream

Inbound messages align left. Outbound/page/AI messages align right. Each bubble
shows author, time, and source badge.

### Context Drawer

Default tab is AI. Orders and payment are available but not always competing
with the active chat.

### Tools

Facebook preview, TikTok sync, connector health, and page management go behind a
Tools disclosure or separate settings screen.

## Done Definition

- Latest webhook message appears without manual refresh.
- The newest thread is selected on open.
- Thread list can be scanned without clicking.
- The active conversation reads like a real chat.
- AI action is visible without scrolling past unrelated widgets.
- Mobile has no horizontal scroll.
