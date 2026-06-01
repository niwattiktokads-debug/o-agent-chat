# Facebook ZORT KGP Payment Flow

Updated: 2026-05-28
Owner: Dex / Codex
Verifier: Boss / Dex
Status: draft_ready / live_disabled_until_kgp_credentials

## Purpose

Contract for the Omni flow:

```text
FB Inbox
-> create ZORT order
-> create KGP payment request
-> send payment link back to customer in Facebook
-> KGP webhook updates paid/failed
-> update order/payment/finance
```

This document records the flow only. It does not enable live payment links, customer sends, paid marking, refunds, or cancellations.

## Runtime Contract

| Capability | Runtime | Guard |
|---|---|---|
| Facebook inbox read/reply | `meta-inbox-api` | customer-facing sends require Boss approval |
| ZORT order creation | `zort-api` | write commands require approval |
| KGP payment request | `meta-pay-kgp` | draft only until credentials + webhook are verified |
| Payment status callback | KGP webhook | disabled until signed webhook smoke passes |

## Required Verify Commands

```bash
/Users/babycuca/.codex/bin/meta-pay-kgp context
/Users/babycuca/.codex/bin/meta-pay-kgp verify
/Users/babycuca/.codex/bin/zort-api verify
/Users/babycuca/.codex/bin/meta-inbox-api verify --page=anna_lynn
```

## Live Guard

Live mode is blocked until:

- KGP Merchant ID, API Key, API Secret, and Webhook Secret are present in the approved secret store.
- KGP webhook endpoint is deployed and signature verification is enabled.
- Sandbox payment smoke test passes.
- Boss approves live customer-facing payment sends.

Forbidden without explicit Boss approval:

- sending real payment links to customers
- marking payment as paid
- refunding or cancelling payment
- switching KGP provider health from guarded/disabled to live

