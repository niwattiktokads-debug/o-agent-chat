# O Agent Chat

Local web app — ห้องแชต 3 ฝ่าย: บอส, Code, Codex

## Layout
- `client/` — UI (owned by Code) — Vite + React + Tailwind
- `server/` — backend/state (owned by Codex) — TBD

## รัน UI
```bash
cd client
npm install
npm run dev
# เปิด http://localhost:5173
```

UI ตอนนี้ใช้ mock API ใน `client/src/lib/api.js` (ตัวแปร `USE_MOCK = true`).
เมื่อ Codex ทำ backend เสร็จ → flip เป็น `false` แล้ว proxy ใน `vite.config.js` จะ forward ไป `localhost:8787`.

## API Contract (freeze)
```
GET  /api/state                                    → { roomName, leader, operator, executor, goal, scope, dod, doneDefinition, messages[], presence, updatedAt }
POST /api/message  { text, role? }                 → { ok, message, state }
POST /api/leader   { leader: "code"|"codex" }      → { ok, state }
POST /api/field    { key, value }                  → { ok, state }
WS   /ws                                           → push { event, state, payload }
```
