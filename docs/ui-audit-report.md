<!-- Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 -->

# O Agent Omni UI Audit Report

Date: 2026-05-24  
Scope: Local Omni inbox at `http://127.0.0.1:5173/?mode=inbox`  
Mode: Audit only. No production UI files changed for this report.

## Executive Summary

The current UI issue is not only visual styling. The core problem is information architecture: the screen tries to be an inbox, AI command center, order desk, payment desk, connector monitor, sync utility, and page manager at the same time.

For Boss usage, the first screen must answer three questions immediately:

1. Which customer needs attention now?
2. What did they say last?
3. What did AI do, and is anything waiting for approval?

The current screen does not answer those fast enough. It shows data, but not operational priority.

## Critical Findings

### 1. Fixed four-column layout breaks the product model

- Tell: mobile responsiveness failure / structural rigidity
- Where: `client/src/components/omni/OmniWorkbench.jsx:37-56`
- Severity: critical
- Evidence: `grid-cols-[240px_minmax(300px,380px)_1fr_340px]` forces every workflow into one desktop-only surface.
- Impact: On smaller screens, the UI becomes cramped. On mobile, the user cannot naturally move from page list -> queue -> conversation -> AI/order context.
- Fix: Replace with responsive workbench shell: desktop = page rail + queue + conversation + context drawer; tablet/mobile = one pane at a time with bottom/segmented navigation.

### 2. Thread list hides the information needed to choose work

- Tell: operational hierarchy missing
- Where: `client/src/components/omni/ThreadList.jsx:13-17`
- Severity: critical
- Evidence: each thread only shows platform, status, intent, and risk. It does not show customer name, page name, latest message, timestamp, unread count, or AI state.
- Impact: Boss cannot know which conversation is new or important without clicking around.
- Fix: Redesign thread cards with customer/page, latest message preview, relative time, unread badge, platform icon, and AI state badge.

### 3. Right rail is a widget dump, not an action surface

- Tell: card-in-card / default dashboard dump
- Where: `client/src/components/omni/OmniWorkbench.jsx:48-55`
- Severity: critical
- Evidence: AI Decision, Order Desk, Payment Desk, TikTok Sync, Facebook Preview, Connector Health, and Page Management all share one scrolling sidebar.
- Impact: The next action is buried. Production controls and setup tools compete with live customer response.
- Fix: Keep only current-thread action in the default context panel. Move sync, health, and page management into Settings/Tools.

### 4. Route intent is wrong for Omni

- Tell: navigation model drift
- Where: `client/src/App.jsx:22-26`
- Severity: critical
- Evidence: `mode=omni` currently opens `ai-train`, not inbox.
- Impact: Boss expects Omni to be the inbox, but the URL opens training. This creates trust issues during testing.
- Fix: Make `mode=omni` and default app launch open the Inbox/workbench. Use `mode=ai-train` only for knowledge training.

## Major Findings

### 5. Chat bubbles do not distinguish customer, page, AI, and human clearly

- Tell: centered/equal-weight message treatment
- Where: `client/src/components/omni/ThreadDetail.jsx:18-23`
- Severity: major
- Evidence: every message uses the same white card style and max width.
- Impact: It is hard to scan who said what, whether AI replied, and whether the reply came from webhook, sync, or human action.
- Fix: Inbound left, outbound right. Add author, time, source badge, and distinct AI/human/page styling.

### 6. No visible realtime health state

- Tell: hidden system status
- Where: `client/src/components/omni/OmniWorkbench.jsx:42-45`
- Severity: major
- Evidence: header only says "Local-first customer inbox with guarded AI replies".
- Impact: Boss cannot tell whether webhook is live, tunnel is connected, AI draft is on, or auto-send is off.
- Fix: Add status strip: Webhook live, Tunnel live, AI draft on, Auto-send off, last event time.

### 7. Tokens and visual system are not locked

- Tell: mid-render token improvisation / pure white surface dependence
- Where: repeated arbitrary values across `PageRail.jsx`, `ThreadList.jsx`, `ThreadDetail.jsx`, `OmniWorkbench.jsx`
- Severity: major
- Evidence: many direct Tailwind arbitrary colors such as `#f4f7f6`, `#dfe8e4`, `#0f8f7b`, plus repeated `bg-white`.
- Impact: Styling will drift every time a component is edited. It also prevents a coherent Vanta-owned visual system.
- Fix: Create design tokens for paper, panel, border, text, accent, danger, success, live, AI, customer, and platform colors.

### 8. AI Decision panel is not decision-oriented

- Tell: weak action hierarchy
- Where: `client/src/components/omni/AiDecisionPanel.jsx:20-44`
- Severity: major
- Evidence: "AI Draft" is a generic button; prior decisions only show action and confidence.
- Impact: The user cannot see why AI decided, what evidence it used, whether it was sent, or what needs approval.
- Fix: Show AI state as a timeline: observed message -> intent -> evidence -> draft -> send gate -> result.

### 9. Order and payment context is disconnected from conversation flow

- Tell: card-in-card / context split
- Where: `client/src/components/omni/OrderDesk.jsx:3-21`, `client/src/components/omni/PaymentDesk.jsx:3-14`
- Severity: major
- Evidence: order/payment cards are separate widgets, not tied into the message composer or AI action.
- Impact: AI cannot be reviewed as a sales/order assistant from the UI. It reads as an admin sidebar.
- Fix: Use tabs in the context drawer: AI, Customer, Orders, Payment. Surface only alerts and suggested next action by default.

### 10. No useful identity model in customer-facing screens

- Tell: generic label fallback
- Where: `client/src/components/omni/ThreadDetail.jsx:21`, webhook data currently can show `Facebook Customer`
- Severity: major
- Evidence: recent realtime webhook messages display `Facebook Customer` instead of the known customer name until thread history sync enriches it.
- Impact: Boss loses confidence because messages look detached from the real person.
- Fix: When rendering, resolve author from thread/customer/page maps. Never show generic fallback if a known customer exists on the thread.

### 11. Page rail is too dominant for an operator workflow

- Tell: oversized navigation chrome
- Where: `client/src/components/omni/PageRail.jsx:6-17`
- Severity: major
- Evidence: page buttons are large, card-like blocks with repeated status text.
- Impact: The rail consumes attention that should belong to the active queue and conversation.
- Fix: Collapse to compact source rail with icons, count badges, and active source. Full page management should move to Settings.

## Minor Findings

### 12. Language is mixed and weak for Boss workflow

- Tell: generic SaaS copy
- Where: `client/src/App.jsx:50-53`, `client/src/components/omni/OmniWorkbench.jsx:42-45`, multiple panel headings
- Severity: minor
- Evidence: Chat, AI Train, Inbox, Local-first, No linked orders, AI Draft.
- Fix: Use Thai operator labels: แชท, สอน AI, กล่องรวม, กำลังตอบ, รออนุมัติ, ชำระเงิน.

### 13. Excessive rounded cards flatten the interface

- Tell: card-in-card tendency
- Where: `PageRail.jsx:6-17`, `ThreadDetail.jsx:20`, `AiDecisionPanel.jsx:34`, `OrderDesk.jsx:10`, `PaymentDesk.jsx:9`
- Severity: minor
- Evidence: `rounded-xl` and `rounded-2xl` appear across navigation, messages, decisions, orders, and payments.
- Fix: Use 6-8px radius for operational cards; reserve larger radius for modal/drawer surfaces only.

### 14. Missing timestamps in conversation view

- Tell: hidden temporal context
- Where: `client/src/components/omni/ThreadDetail.jsx:20-23`
- Severity: minor
- Evidence: messages show author and text, not time.
- Fix: Add compact time label per message and date dividers for long threads.

### 15. Empty states are not actionable

- Tell: generic placeholder copy
- Where: `OrderDesk.jsx:7`, `PaymentDesk.jsx:6`
- Severity: minor
- Evidence: "No linked orders" and "No payment drafts" do not tell what to do next.
- Fix: Replace with action-aware empty states: "ยังไม่มีออเดอร์ที่ผูกกับลูกค้าคนนี้" plus a search/link action.

### 16. Focus states are not explicit

- Tell: hover-only / weak keyboard affordance
- Where: `PageRail.jsx`, `ThreadList.jsx`, top nav buttons in `App.jsx`
- Severity: minor
- Evidence: hover/active styles exist, but no consistent `focus-visible` system.
- Fix: Add focus-visible ring token and apply to all interactive elements.

## Recommended Redesign Direction

### Primary product shape

Use an operator-first command center:

- Source rail: compact pages/platforms with unread counts.
- Work queue: one card per customer thread, sorted by urgency.
- Conversation workspace: message stream, composer/action bar, AI draft surface.
- Context drawer: tabs for AI, Customer, Orders, Payment, History.

### Default screen priority

1. Realtime status and current page.
2. Work queue with latest customer message.
3. Active conversation with latest message visible.
4. AI suggested action.
5. Order/payment context only when relevant.

### Move out of the main workbench

- Facebook Live Preview
- TikTok Order Sync
- Connector Health
- Page Management

These belong in Settings/Tools, not beside a live customer conversation.

## Acceptance Criteria for Redesign

- Latest Facebook webhook message appears in the active thread without manual refresh.
- Thread list shows customer name, latest message, page/platform, time, unread count, AI state.
- Active chat visually separates inbound, outbound, AI, and human messages.
- Top bar shows realtime health: webhook, tunnel, AI draft, auto-send.
- Mobile works as a staged workflow, not a squeezed 4-column grid.
- No production tool widget competes with the main customer reply workflow.
- All colors and fonts come from tokens.
- Thai operator copy is used for primary UI.

## Count

4 critical · 7 major · 5 minor
