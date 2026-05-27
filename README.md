# O Agent Chat

Local web app — ห้องแชต 3 ฝ่าย: บอส · Code · Codex (realtime ผ่าน WebSocket)

## Layout
- `client/` — UI (owned by Code) — Vite + React + Tailwind
- `server/` — backend/state (owned by Codex) — Node.js + Express + ws

## รัน

Terminal A — server:
```bash
cd server && npm install && npm run dev
# listens on http://localhost:8787
```

Terminal B — client:
```bash
cd client && npm install && npm run dev
# open http://localhost:5173 (or 5174 if 5173 busy)
```

Vite proxies `/api` and `/ws` to `localhost:8787`.

## Test
- Server: `cd server && npm test` (Node `node:test`)
- UI: `cd client && npm test` (Vitest)

## Cloud Runtime Without n8n
Omni cloud path does not require n8n.

Current split:
- Vercel: frontend
- Supabase: database and realtime change notifications
- Node server: REST/webhook runtime only if a connector still needs server-side secrets or long-running work

Enable Supabase Realtime in the frontend with:

```bash
VITE_OMNI_REALTIME_PROVIDER=supabase
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

If the frontend calls a separate backend, also set:

```bash
VITE_OMNI_API_BASE_URL=https://<backend-host>
VITE_OMNI_WS_BASE_URL=wss://<backend-host>
```

Run the Supabase schema first:

```bash
supabase/migrations/0001_omni_realtime.sql
```

The migration uses `omni_*` table names to avoid colliding with existing O-Agent Console tables.

## Omni Chat Retention
ระบบลบข้อมูลแชทเก่าเก็บไว้ที่ backend: default คือข้อความแชทเก่ากว่า 180 วันจะถูกลบโดย job รายวัน แต่ข้อมูลลูกค้าสำคัญใน profile เช่น `phone`, `address`, `contactJson` จะถูกเก็บไว้ก่อนลบข้อความ

```bash
/Users/babycuca/.codex/bin/omni-chat-runtime retention-dry-run --days=180
/Users/babycuca/.codex/bin/omni-chat-runtime retention-apply --days=180
```

## Voice Input
กล่องพิมพ์หลักรองรับ push-to-talk ผ่าน browser Speech Recognition: กดปุ่ม `MIC` ค้างไว้เพื่อพูด ปล่อยปุ่มแล้วระบบจะแปลงเป็นข้อความในช่องพิมพ์ จากนั้นผู้ใช้กด `ส่ง` เอง

ข้อจำกัด: ใช้ความสามารถของ browser เป็นหลัก จึงเหมาะกับ local MVP. ถ้าต้อง transcribe voice message จากลูกค้าหรือใช้งานบน cloud production ให้เพิ่ม provider ฝั่ง server เช่น local Whisper/whisper.cpp, Deepgram, AssemblyAI, หรือ OpenAI transcription.

## Webhook Dex Signal
Meta/TikTok webhook จะส่งสัญญาณแบบ event-driven ทันทีเมื่อมี inbound customer message ใหม่ โดย broadcast `omni:attention` และเพิ่มข้อความจาก `Codex` ในห้อง O Agent Chat เพื่อให้เดสรู้ว่ามี thread ที่ต้องตอบ

ระบบนี้ไม่ใช้ timer/polling. หลังบอสอนุมัติ live mode แล้ว runtime local เปิด `OMNI_META_WEBHOOK_AUTO_REPLY=1`, `OMNI_META_WEBHOOK_SEND=1`, `OMNI_AI_PROVIDER=local_rules`, และ `OMNI_AI_AUTO_SEND_ALL=1` เพื่อให้ webhook สร้างคำตอบด้วย Dex/Codex local rules ในเครื่อง แล้วส่งกลับ Meta pages ที่รองรับทันที

Provider AI เปลี่ยนได้ผ่าน env:

```bash
OMNI_AI_PROVIDER=local_rules
OMNI_AI_MODEL=dex-local-rules-v1
```

## Suda O-agent Task Alerts
Omni Chat มี endpoint สำหรับแจ้งงานวินเข้า LINE OA `สุดา @537mpwyq` แล้ว โดยใช้ helper `/Users/babycuca/.codex/bin/line-suda-oagent` เป็นตัวกลางและไม่ใช้ n8n เป็นทางหลัก

LINE webhook ของสุดารองรับ group intake แล้ว: เมื่อสุดาถูกเพิ่มเข้ากลุ่มใหม่ ระบบจะบันทึกรายละเอียดกลุ่มเข้า Omni/registry เท่านั้นโดย default และ helper จะห้ามส่งข้อความทุกชนิดเข้ากลุ่มนั้นจนกว่าจะตั้งครบ 4 ช่อง: `/su หน้าที่: ... / รูปแบบคำถาม: ... / รูปแบบตอบ: ... / กฎตอบ: ...`

หน้า Settings > Connections มี card `LINE OA · สุดา O-agent` สำหรับแก้กฎคำถามและคำตอบรายกลุ่มจากในแอป โดยเขียนลงไฟล์ current rules เดียวกับ webhook

รายละเอียดฟังก์ชันและคำสั่งทดสอบอยู่ที่ `docs/omni-suda-oagent-task-functions.md`

## Omni Manual Draft
หน้า Inbox/Omni มีช่องพิมพ์ใต้ thread ที่เลือกแล้ว สามารถพิมพ์ข้อความและแนบภาพได้หลายรูป ระบบจะบันทึกเป็น `manual_draft` ใน Omni และอัปเดตหน้าจอทันที

Draft นี้ยังเป็นโหมด manual ภายในหน้า Omni ส่วน webhook auto-send ใช้ flow แยกตาม env ด้านบน

## Omni Order Address + ZORT Pointer
งานออเดอร์ที่เกี่ยวกับ AI ดึงที่อยู่จากแชท, Thai postcode autofill, order draft, customer confirmation draft, และ ZORT approval guard ต้องอ่าน pointer นี้ก่อนแก้:

`docs/omni-order-address-zort-readme.md`

ไฟล์นี้มีรายการ post-install checklist, สิ่งที่ยังติดหลังติดตั้ง, endpoint, test, และ line pointer ของทุกฟังก์ชันเพื่อไม่ให้แก้ตกหล่น

## API Contract (freeze)
```
GET  /api/state                                    → { roomName, leader, operator, executor, goal, scope, dod, doneDefinition, messages[], presence, updatedAt }
POST /api/message  { text, role? }                 → { ok, message, state }
POST /api/leader   { leader: "code"|"codex" }      → { ok, state }
POST /api/field    { key, value }                  → { ok, state }
WS   /ws                                           → push { event, state, payload }
```

WebSocket events (server → client): `state | message | leader | presence | typing | room`
WebSocket events (client → server): `identify { who } | typing { typing }`

## Conversation Protocol (3 rules)
1. ถ้าบอสระบุชื่อท้ายประโยค → คนนั้นตอบก่อน
2. ถ้าบอสไม่ระบุชื่อ → Code ตอบ UI/UX, Codex ตอบ backend/logic/integration
3. ถ้าคุยยาว/เห็นต่าง → คนตอบสุดท้ายสรุป 3 บรรทัด: ตกลง · ค้าง · ต่อ

ลงชื่อท้ายข้อความ = คนนั้นพูด, ไม่ลงชื่อ = บอส

## Tag Vocabulary
`[ASK] [ANS] [PROPOSE] [AGREE] [DISAGREE] [DECIDE] [DO] [PASS] [STATE]`

## Docs
- Spec: `docs/superpowers/specs/2026-04-26-3way-chat-realtime-design.md`
- Plan: `docs/superpowers/plans/2026-04-26-3way-chat-realtime.md`
