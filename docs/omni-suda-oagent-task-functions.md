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
| `line-suda-oagent` | ready | ต่อบอทสุดา, webhook, O-agent target, approval-gated group intake, และ `/su หน้าที่:` ได้แล้ว |
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

## Function 6: LINE Group Join Intake

When `สุดา` is added to a new LINE group, LINE sends a `join` event to:

```http
POST /webhook/line/suda-oagent
```

Omni now does four things automatically:

1. Captures the event in `finance/staging/line_suda_oagent_capture_events.jsonl`.
2. Calls `/Users/babycuca/.codex/bin/line-suda-oagent group-details --group-id <GROUP_ID>`.
3. Records a pending group response-rule row in `finance/staging/line_suda_group_registry.jsonl`.
4. Upserts the latest current rule state in `finance/staging/line_suda_group_rules.json`.

Default behavior is record-only. It must not send a visible intake message into the LINE group on join. All visible group sends are blocked until that group has complete usage rules:

```text
หน้าที่
รูปแบบคำถาม
รูปแบบตอบ
กฎตอบ
```

After those four fields are set, a visible intake message is allowed only by manual command or by explicitly setting:

```bash
LINE_SUDA_JOIN_INTAKE_PUSH=1
```

When explicitly approved, the visible LINE message includes:

```text
สุดาเชื่อมกลุ่ม LINE ใหม่แล้ว

กลุ่ม: [group name]
รหัสกลุ่ม: [masked group id]
สมาชิก: [count]
รายชื่อที่ API อ่านได้:
- [member names when LINE allows profile reads]

บอสต้องการให้สุดาทำอะไรในกลุ่มนี้?
ตอบด้วยรูปแบบนี้:
/su
หน้าที่: [งานของสุดาในกลุ่มนี้]
รูปแบบคำถาม: [คำถาม/คำสั่งที่คนในกลุ่มมักใช้]
รูปแบบตอบ: [รูปแบบคำตอบตั้งต้นของสุดา]
กฎตอบ: [น้ำเสียง, ข้อห้าม, เงื่อนไขที่ต้องถามบอสก่อน]
```

LINE API limitation:

- `members/count` works for the tested group.
- `members/ids` can return `403 Access to this API is not available for your account`; when this happens, Omni reports the member count and explicitly says the member names cannot be read instead of guessing.

## Function 7: Record Group Response Rules With `/su`

Boss can define the default context and response rules of `สุดา` in each LINE group by sending:

```text
/su
หน้าที่: แจ้งเตือนงานผลิตและถามสถานะวิน
รูปแบบคำถาม: สถานะงานผลิต / วินส่งไปยัง / ต้องตามใคร
รูปแบบตอบ: สรุปสถานะล่าสุด, ระบุคนรับผิดชอบ, ถามบอสถ้าข้อมูลไม่พอ
กฎตอบ: สุภาพ สั้น ห้ามเดาสถานะ ห้ามสรุปว่าจบถ้าไม่มีหลักฐาน
```

Omni captures this command, records it in:

```text
finance/staging/line_suda_group_registry.jsonl
finance/staging/line_suda_group_rules.json
```

and sends an acknowledgement back to the same LINE group as `สุดา`.

Stored fields:

- `duty`
- `questionPattern`
- `defaultReply`
- `replyRules`
- `responseRules`

## Function 8: Edit Group Rules In Connections UI

The app UI keeps this setting in the correct connection surface:

```text
Settings -> Connections -> LINE OA · สุดา O-agent -> กฎคำถามและคำตอบรายกลุ่ม
```

Backend endpoints:

```http
GET /api/omni/notifications/suda-oagent/group-rules
POST /api/omni/notifications/suda-oagent/group-rules/:groupId
```

The UI edits the same current state file as `/su`:

```text
finance/staging/line_suda_group_rules.json
```

This keeps LINE group behavior, question patterns, default replies, and reply rules inside the connection settings instead of scattering them across general app settings.

Current blockers:

- TikTok Business Messaging official chat still needs OAuth/app approval and saved token.
- LINE staff task repeat reminder still needs Notion status watcher logic.

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
| `server/src/webhook.js` | LINE webhook capture, join intake, `/su หน้าที่:` duty capture |
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
