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
