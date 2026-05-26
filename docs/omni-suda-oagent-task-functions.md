# Omni Chat: Suda O-agent Task Functions

Date: 2026-05-26
Owner: Boss
Controller: Dex / Codex
Status: implemented in local Omni Chat backend

## Purpose

ให้ Omni Chat เรียกแจ้งเตือนงานวินผ่าน LINE OA `สุดา @537mpwyq` ได้จาก backend โดยไม่กลับไปใช้ n8n เป็นทางหลัก และใช้ LINE Official Messaging API เป็น primary route เมื่อมี `groupId` ของกลุ่ม `O-agent(4)`.

## Current Runtime Status

| Runtime | Status | Meaning |
|---|---|---|
| `omni-ai-reply` | ready | ร่างคำตอบแชทลูกค้าแบบ draft ได้ทันที |
| `zort-api` | ready | ค้นสินค้า/สต็อกและสร้าง order draft หลัง approval ได้ |
| `line-suda-oagent` | API token ready, target pending | ต่อบอทสุดาได้แล้ว แต่ยังรอ `groupId` ของ `O-agent(4)` สำหรับ push API |
| `tiktok-messaging-api` | OAuth/token pending | ยังรับ/ตอบแชท TikTok ผ่าน official Business Messaging ไม่ได้จนกว่าจะอนุมัติ app และบันทึก token |

## Core Workflow

```text
incoming task or customer priority
-> Omni Chat function
-> decide whether it is customer reply, order work, or staff task alert
-> for customer reply: omni-ai-reply creates draft only unless policy allows send
-> for order/stock: ZORT lookup or order draft
-> for staff task alert: line-suda-oagent sends to O-agent group as สุดา
-> audit result in Omni response
```

## Function 1: Check Suda O-agent LINE Health

Use this before sending any Winn task alert.

```http
GET /api/omni/notifications/suda-oagent/health
```

Expected result when API token works but groupId is still missing:

```json
{
  "ok": true,
  "token": "resolved",
  "bot": {
    "displayName": "สุดา",
    "basicId": "@537mpwyq"
  },
  "target": {
    "ok": false,
    "reason": "missing_target_group_id_for_O_agent"
  },
  "primaryRoute": "official_line_push_api_pending_group_id"
}
```

Meaning:

- `bot.displayName = สุดา` means the API token is correct.
- `target.ok = false` means it cannot push to `O-agent(4)` yet.
- Do not use n8n to bypass this. Capture and save the real groupId.

## Function 2: Save Verified O-agent Group ID

Use this after the O-agent groupId is captured from a LINE event/webhook or other verified source.

```http
POST /api/omni/notifications/suda-oagent/group-id
content-type: application/json

{
  "groupId": "Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

The function calls:

```bash
/Users/babycuca/.codex/bin/line-suda-oagent set-group-id --group-id <GROUP_ID>
```

Guard:

- It verifies the LINE group summary before saving.
- It accepts only group names matching `O-agent`, `O-agent(4)`, `O Agent`, `O-Agent`, or `Oagent`.
- It rejects `บอสอุ้ย` and `AnnaLynn Live` style wrong targets.

## Function 3: Send Winn Task Summary To O-agent

Use this when Boss says to notify Winn in the O-agent group through Suda.

```http
POST /api/omni/notifications/suda-oagent/task-summary
content-type: application/json

{
  "dryRun": false
}
```

Dry run:

```http
POST /api/omni/notifications/suda-oagent/task-summary
content-type: application/json

{
  "dryRun": true
}
```

Dry run does not send. It returns the helper command that would run and the current verification state.

Actual message content is owned by:

```text
/Users/babycuca/.codex/integrations/line_suda_oagent_alerts.json
```

Current task summary:

```text
สุดาแจ้งเตือนวิน สรุปงานที่ต้องทำตอนนี้

1. ตอบแชทลูกค้า TikTok ก่อนเป็นงานแรก
2. ทำตะกร้า VZ กางเกงตามลิงก์ที่พี่รี่ส่งให้
3. งานร้าน her: ขอตัวอย่างทดลองขาย โดยเลือกสินค้า top sale, มีครบสี, ผลิตต่อเนื่อง และเป็นสินค้าขายดี
4. หลังตกลงดิลสินค้า ให้นำสินค้ามาทำตะกร้าเตรียมขายต่อทันที
5. เข้า Notion แล้วเปลี่ยนสถานะงานเป็น กำลังดำเนินงาน เพื่อให้ระบบเริ่มจับเวลาและแทรคงาน

Notion: https://www.notion.so/VZ-36b7cc48e7e8813db421c9ddf4dcdc30

หมายเหตุ: ต้องเปลี่ยนสถานะเป็น กำลังดำเนินงาน เพื่อเริ่มจับเวลาและหยุดการเตือนซ้ำ
```

## Function 4: Return LINE OA Chat Fallback URL

Use this only while official push API is blocked by missing groupId.

```http
GET /api/omni/notifications/suda-oagent/chat-url
```

Expected:

```json
{
  "ok": true,
  "route": "LINE OA Chat fallback",
  "url": "https://chat.line.biz/",
  "account": "สุดา",
  "basicId": "@537mpwyq",
  "confirmedChatName": "O-agent(4)"
}
```

Rule:

- This is fallback only.
- Use LINE OA Chat `สุดา -> O-agent(4)`.
- Do not send from Boss personal LINE.
- Do not make n8n the primary route.

## Function 5: Customer Chat Priority Pipeline

This is the Omni Chat operating order when there is customer work and staff task work at the same time.

```text
1. Customer inbound TikTok/Facebook chat first
2. Create AI draft, not live send, unless policy explicitly allows auto-send
3. Check product/stock/order context through ZORT or platform adapter
4. Create order draft if customer intent is buying/CF
5. Notify Winn/Suda staff task only after customer reply priority is registered
6. Track Winn work status in Notion; repeat LINE reminder every 10 minutes until status changes
```

Current blockers:

- TikTok Business Messaging official chat still needs OAuth/app approval and saved token.
- LINE staff task repeat reminder needs Notion status watcher plus O-agent groupId.

## Test Commands

Run local Omni Chat health:

```bash
/Users/babycuca/.codex/bin/omni-chat-runtime verify-local
```

Start local app:

```bash
/Users/babycuca/.codex/bin/omni-chat-runtime start-local
```

Check Suda O-agent API through Omni endpoint:

```bash
curl -sS http://127.0.0.1:8787/api/omni/notifications/suda-oagent/health | jq
```

Dry-run task alert:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/omni/notifications/suda-oagent/task-summary \
  -H 'content-type: application/json' \
  -d '{"dryRun":true}' | jq
```

Send after groupId is saved:

```bash
curl -sS -X POST http://127.0.0.1:8787/api/omni/notifications/suda-oagent/task-summary \
  -H 'content-type: application/json' \
  -d '{"dryRun":false}' | jq
```

## Implementation Files

| File | Role |
|---|---|
| `server/src/omni/lineSudaOagentNotifier.js` | Node wrapper around Codex helper |
| `server/src/routes.js` | Omni API endpoints |
| `/Users/babycuca/.codex/bin/line-suda-oagent` | Codex LINE API helper |
| `/Users/babycuca/.codex/integrations/line_suda_oagent_alerts.json` | Task message, target rules, credential names |

## Production Move

For cloud:

1. Move `LINE_CHANNEL_ACCESS_TOKEN` to cloud secret manager.
2. Save `LINE_SUDA_OAGENT_GROUP_ID` as cloud secret after verification.
3. Replace local helper path with portable runtime command or container entrypoint.
4. Add Notion status watcher:
   - if status is not `กำลังดำเนินงาน`, send reminder every 10 minutes;
   - if status changes, stop reminder and start work timer.
5. Keep write guard:
   - customer-facing send requires policy gate;
   - staff task LINE send requires verified target group.
