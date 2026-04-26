# O-Agent Chat — 3-Way Realtime Room Design

**Date:** 2026-04-26
**Owners:** Code (UI/UX) · Codex (backend/integration)
**Final integration owner:** Code

## Goal

ห้องแชตเดียวให้ บอส · Code · Codex คุยกันแบบ realtime ได้ลื่นไหล โดย Boss ใช้เว็บ/มือถือ, Code และ Codex เป็น agent CLI ที่เชื่อมเข้าห้องเดียวกันผ่าน WebSocket

## Conversation Protocol (กติกา 3 ข้อ)

1. ถ้าบอสระบุชื่อท้ายประโยคหรือเอ่ยชื่อชัด → คนนั้นตอบก่อน
2. ถ้าบอสไม่ระบุชื่อ → Code ตอบเรื่อง UI/UX, Codex ตอบ backend/logic/integration คนละสั้น
3. ถ้าคุยยาว/เห็นต่าง → คนตอบสุดท้ายสรุป 3 บรรทัด: ตกลงอะไร · ค้างอะไร · ต่ออะไร

ลงชื่อท้ายข้อความ = คนนั้นพูด, ไม่ลงชื่อ = บอสพูด

## Architecture

```
[Telegram / External] ──→ webhook ingress ──→ room server (Codex)
                                                   │
                                          ┌────────┼────────┐
                                          ▼        ▼        ▼
                                       WS Boss  WS Code  WS Codex
                                       (browser) (CLI)    (CLI)
```

- **Room server** = single source of truth (in-memory state + broadcast hub)
- **Webhook ingress** = แยกจาก realtime runtime ส่งข้อความเข้า room server เท่านั้น
- **Persistence** = sync ลง Obsidian/Supabase แบบ async ไม่ขวาง realtime

## API Contract (FROZEN)

```
GET  /api/state                                    → { leader, operator, goal, scope, dod, messages[] }
POST /api/message  { sender, text }                → { ok }
POST /api/leader   { leader: "Code"|"Codex" }      → { ok }
WS   /ws                                           → push { type, payload }
```

WebSocket event types:
- `state:full` — initial sync ตอน connect
- `message:new` — broadcast ข้อความใหม่
- `state:update` — leader/operator/goal/scope/dod เปลี่ยน
- `presence:update` — { who: "Boss"|"Code"|"Codex", online: bool }
- `typing:update` — { who, typing: bool }

## State Shape

```ts
{
  leader: "Code" | "Codex" | "—",
  operator: "Code" | "Codex" | "—",
  goal: string,
  scope: string,
  dod: string,                       // definition of done
  messages: Array<{
    id: string,
    sender: "Boss" | "Code" | "Codex",
    text: string,
    ts: number,
    tag?: "ASK" | "ANS" | "PROPOSE" | "AGREE" | "DISAGREE" | "DECIDE" | "DO" | "PASS" | "STATE"
  }>
}
```

## Component Plan (UI — Code scope)

| Component | สถานะปัจจุบัน | งานที่ต้องเพิ่ม |
|---|---|---|
| `App.jsx` | layout ครบ | mobile responsive (drawer pattern <768px) |
| `StatusPanel` | skeleton | leader/operator badge, online dots 3 ฝ่าย, goal/scope/dod editable inline |
| `MessageList` | skeleton | avatar+สีแยก 3 ฝ่าย, timestamp, tag badge, pending state, group-by-sender |
| `Composer` | skeleton | typing event, offline send queue, Enter to send (Shift+Enter newline), `@Code`/`@Codex` autocomplete |
| `lib/api.js` | mock toggle | WS reconnect (exponential backoff), optimistic update, presence ping ทุก 15s |
| `MobileDrawer` (ใหม่) | — | StatusPanel เป็น drawer trigger จาก hamburger บน <768px |
| `TagBadge` (ใหม่) | — | render `[PROPOSE]`/`[DECIDE]`/`[ASK]` เป็น badge สีตาม semantic |

## Data Flow

1. Boss พิมพ์ → Composer optimistic insert (pending=true) → POST `/api/message`
2. Server validate → append state.messages → broadcast `message:new` → ทุก client receive → reconcile pending → done
3. Code/Codex agent → POST `/api/message` (sender=Code/Codex) → broadcast
4. Leader change → POST `/api/leader` → broadcast `state:update`
5. Disconnect → Composer queue messages locally → reconnect → flush queue → GET `/api/state` reconcile

## Error Handling

- **WS disconnect** → exponential backoff (1s → 2s → 5s → 15s, max 30s) + banner `เชื่อมต่อใหม่...`
- **Send fail** → message มี ⚠️ marker + retry button + ไม่ลบจาก list
- **State drift** → GET `/api/state` ทุก 30s + on every reconnect → diff merge
- **Webhook fail** → ingress log + retry by external sender (idempotent by `id`)

## Testing

- **Manual end-to-end:** 3 browser tab พร้อมกัน (จำลอง Boss/Code/Codex) ส่งสลับ ตรวจ broadcast ครบ
- **Mobile QA:** Chrome DevTools 375×667 + 414×896 ตรวจ drawer, composer, message overflow
- **Reconnect test:** kill server → restart → ตรวจ banner + queue flush
- **Latency target:** < 200ms send→broadcast บน localhost

## Phase Plan

| Phase | Owner | Output | Blocker |
|---|---|---|---|
| 1. Server skeleton + WS hub | Codex | `server/` รัน localhost:8787, contract ครบ | — |
| 2. UI ขณะ mock | Code | mobile layout, tag badge, avatar/สี, typing UI (mock) | — |
| 3. Wire realtime | Code | flip `USE_MOCK=false`, ws reconnect, presence, queue | Phase 1 |
| 4. Webhook ingress | Codex | `/webhook/telegram` → broadcast | Phase 1 |
| 5. Final integration | Code | end-to-end 3-way test, mobile QA, deploy doc, ปิดงาน | Phase 1-4 |

## Out of Scope (v1)

- Authentication / multi-room (single hardcoded room)
- File/image upload
- Persistent message history (in-memory เท่านั้น, sync Obsidian/Supabase ทำ async ภายหลัง)
- Push notification (Telegram channel ทำหน้าที่นี้แทน)
- Voice/video

## Success Criteria

1. บอสเปิดเว็บ พิมพ์ → Code/Codex CLI เห็นภายใน 200ms
2. Code/Codex ตอบ → บอสเห็น typing indicator + ข้อความ
3. ปิดเซิร์ฟเวอร์ → reopen → state sync กลับมาครบ (in-memory ยอม reset ได้)
4. มือถือใช้งานได้ครบ (composer, drawer, scroll)
5. กติกา 3 ข้อทำงาน: routing โดยชื่อ + domain split + summary on long thread
