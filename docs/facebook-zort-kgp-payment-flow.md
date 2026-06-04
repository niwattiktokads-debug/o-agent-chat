# Facebook ZORT KGP Payment Flow

Updated: 2026-06-04
Owner: Dex / Codex
Verifier: Boss / Dex
Status: guarded_deployed / live_disabled_until_kgp_credentials_endpoint_and_approval

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

This document records the live-ready guarded flow. It deploys UI, provider health,
checkout guard, and signed webhook handling, but it does not enable live payment
links, customer sends, paid marking without verified webhook, refunds, or cancellations.

## Runtime Contract

| Capability | Runtime | Guard |
|---|---|---|
| Facebook inbox read/reply | `meta-inbox-api` | customer-facing sends require Boss approval |
| ZORT order creation | `zort-api` | write commands require approval |
| KGP payment request | `meta-pay-kgp` | draft only until credentials + webhook are verified |
| KGP checkout link | `POST /api/omni/payment-requests/:id/kgp/checkout` | requires payment approval, message approval, and `META_PAY_KGP_ENABLED=1` |
| Payment status callback | `POST /webhook/kgp/meta-pay` | requires valid HMAC signature using `META_PAY_KGP_WEBHOOK_SECRET` |

## Message Box Shape

Omni shows the payment as an operator-reviewed draft before any customer send:

```text
สรุปยอดชำระค่ะ
ออเดอร์: <order_id>
ยอดชำระ: THB <amount>
ชำระผ่าน Meta Pay / KGP: <checkout_url>
หลังชำระแล้วระบบจะอัปเดตสถานะให้อัตโนมัติค่ะ
```

If KGP is not live-ready yet, the checkout URL line stays as a placeholder:

```text
ลิงก์ Meta Pay / KGP จะถูกสร้างหลังระบบชำระเงินพร้อมใช้งาน
```

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
- KGP checkout endpoint is configured in `META_PAY_KGP_CHECKOUT_ENDPOINT`.
- KGP webhook endpoint is deployed and signature verification is enabled.
- Sandbox payment smoke test passes.
- Boss approves live customer-facing payment sends.

Forbidden without explicit Boss approval:

- sending real payment links to customers
- marking payment as paid
- refunding or cancelling payment
- switching KGP provider health from guarded/disabled to live
