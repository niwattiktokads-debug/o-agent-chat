# Zaapi AI Train Study

Source: live authenticated Zaapi session on `https://app.zaapi.com/th/ai/train/knowledge-source`
Date: 2026-05-24
Scope: AI training, knowledge source, activation, and analytics workflow.

## What Zaapi Does

Zaapi splits AI training into a clear left-menu workflow:

- Knowledge source
- Scenario/SOP handling
- AI personality
- Testing
- Activation
- Analytics

The knowledge source page is not a chat surface. It is a management console for
adding and auditing information the AI can use later.

## Knowledge Source Flow

The add-source flow opens a right-side modal, not an inline editor. It asks for:

- source name
- account/channel scope
- source type
- source payload

Supported source types observed:

- file upload
- website crawl
- manual writing

Important observed details:

- storage quota is visible: characters used vs plan limit
- file upload describes supported formats and suggests templates
- website crawl explains depth/page limits before ingestion
- manual writing uses a rich text editor with simple formatting controls
- every source row has metadata: source type, connection scope, character count,
  uploader/updater, status, created date

## Training Flow Beyond Knowledge

Zaapi separates additional AI training areas:

- Scenario handling: SOP-like rules for common customer situations.
- Personality: brand voice/personality applied to AI replies.
- Testing: account selector and test area for AI auto-reply behavior.
- Activation: connects AI to automation/flow builder templates.
- Analytics: tracks AI message count, fully handled/partially handled chats,
  time saved, cost saved, and closed chats involving AI.

## What O Agent Already Has

- Knowledge source API with save, edit, delete, search, and test.
- Source status labels and page scope.
- AI testing panel.
- Deploy/status panel.
- Omni inbox connection direction.
- Guarded payment/order logic in the wider Omni runtime.

## Gaps To Close

1. Source type UX:
   O Agent has a type dropdown, but it does not yet provide different input flows
   for file, website crawl, and manual writing.

2. Quota and character accounting:
   O Agent should show character usage and per-source character count.

3. Account/channel selector:
   Current scope is a text field. It should become a selectable page/account
   scope using existing Omni pages.

4. SOP/scenario page:
   Current Instructions page is basic text. It should become structured
   scenario rules with intent, trigger, response policy, and escalation policy.

5. Personality page:
   O Agent should separate brand voice from knowledge content.

6. Activation templates:
   Deploy should offer practical templates such as always-on AI, after-hours AI,
   draft-only mode, and high-risk approval mode.

7. AI analytics:
   Add metrics for AI messages, auto-drafted, auto-sent, approval-needed,
   time saved, and avoided manual responses.

## O Agent Design Decision

Do not copy Zaapi pixel-for-pixel. Use the workflow model, then make O Agent more
operator-first:

- keep AI training tied to real Omni threads
- show exactly which source supports each draft
- keep high-risk order/payment/refund answers behind approval
- make activation explicit per page/account
- keep local-first, cloud-ready data paths

## Recommended Implementation Order

1. Add character count and quota to Knowledge Source.
2. Replace free-text scope with page/account selector.
3. Add guided source type panels for manual, website, and file.
4. Split Instructions into Scenario Handling.
5. Add Personality page.
6. Expand Deploy into activation templates.
7. Add AI analytics page based on stored Omni decisions/messages.
