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

## Omni Manual Draft
หน้า Inbox/Omni มีช่องพิมพ์ใต้ thread ที่เลือกแล้ว สามารถพิมพ์ข้อความและแนบภาพได้หลายรูป ระบบจะบันทึกเป็น `manual_draft` ใน Omni และอัปเดตหน้าจอทันที

Draft นี้ยังเป็นโหมด manual ภายในหน้า Omni ส่วน webhook auto-send ใช้ flow แยกตาม env ด้านบน

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
