# Design - O Agent Omni

A locked design system for the O Agent Omni local inbox. Every UI change should
read this file first. The product is an operator command center for AI-assisted
customer replies, not a marketing dashboard.

## Genre

modern-minimal

## Macrostructure Family

- App pages: Workbench. Compact source rail, work queue, active conversation,
  contextual action drawer.
- Content/training pages: Long Document. Dense forms and training sources with
  clear section rhythm.
- Tools/settings pages: Index-First. Connector health, sync utilities, and page
  management live outside the live customer reply surface.

## Theme

- `--color-paper`: oklch(98% 0.006 165)
- `--color-panel`: oklch(100% 0 0)
- `--color-panel-2`: oklch(96% 0.01 165)
- `--color-ink`: oklch(19% 0.035 170)
- `--color-ink-2`: oklch(43% 0.03 170)
- `--color-muted`: oklch(61% 0.025 170)
- `--color-rule`: oklch(88% 0.015 165)
- `--color-accent`: oklch(49% 0.105 174)
- `--color-accent-soft`: oklch(93% 0.045 174)
- `--color-live`: oklch(57% 0.14 150)
- `--color-warn`: oklch(67% 0.14 75)
- `--color-danger`: oklch(56% 0.17 24)
- `--color-ai`: oklch(52% 0.09 255)
- `--color-customer`: oklch(35% 0.035 170)
- `--color-focus`: oklch(61% 0.16 180)

Accent usage must stay below 5 percent of a viewport. Use it for active states,
live indicators, and primary actions only.

## Typography

- Display: system sans stack, weight 650-760.
- Body: system sans stack with `Noto Sans Thai` fallback, weight 400-560.
- Mono: `SFMono-Regular`, `Menlo`, monospace.
- Letter spacing: 0 for normal UI. Use no negative tracking.
- Numeric data: `font-variant-numeric: tabular-nums`.

## Spacing

4-point scale. Prefer dense operational spacing over marketing spacing.

## Motion

- No decorative reveal animations.
- Use transform/opacity only for hover and active states.
- Realtime updates should feel immediate, not animated.
- Reduced motion: no spatial animation.

## Component Rules

- Cards use 8px radius or less.
- Do not put cards inside cards.
- Source rail is compact. Page management is a settings task.
- Thread cards must show customer, page, platform, latest message, time, unread,
  and AI state.
- Conversation bubbles must separate inbound, outbound, AI, and human/page
  messages.
- Right context must default to current-thread AI action. Orders and payments
  are tabs, not always-open widgets.

## Thai Operator Copy

Primary UI should use Thai labels:

- กล่องรวม
- สอน AI
- ต้องตอบ
- AI ร่างแล้ว
- ส่งแล้ว
- รออนุมัติ
- ออเดอร์
- ชำระเงิน
- เครื่องมือ

English is allowed for provider names, IDs, and technical health labels.

## What Must Stay Visible

- Realtime status.
- AI draft status.
- Auto-send status.
- Active page/source.
- Latest customer message.

## Exports

See `tokens.css` at the project root for portable CSS variables.
