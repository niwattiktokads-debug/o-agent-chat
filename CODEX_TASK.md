# Codex Task: Deploy Omni Chat ให้ใช้งานได้ 100%

## Context
- Repo: `niwattiktokads-debug/o-agent-chat`
- Branch: `main`
- Railway Service: `omni-server-production.up.railway.app`
- Railway Token: `b39f928e-e1e5-4d18-aa14-04eb5dafb25e`
- Railway Service ID: `90633756-ba2f-4648-8027-9ed1288c82a9`
- Railway Environment ID: `f768dc05-2df7-46f2-ba90-5636136d10f1`

## สถานะปัจจุบัน
- Deploy ล่าสุด: **FAILED** (commit `e2d3bd7`)
- ปัญหา: Railway ใช้ Dockerfile builder แต่ build FAILED — ไม่มี build logs ชัดเจน
- client/dist ถูก commit ไว้ใน repo แล้ว (pre-built)
- Dockerfile ปัจจุบัน: copy pre-built client/dist โดยตรง ไม่ต้อง npm build

## Tasks ที่ต้องทำ

### Task 1: Debug และแก้ Railway build failure
1. ดู build logs ของ deployment `e2d3bd7` ผ่าน Railway GraphQL API
2. วิเคราะห์ error และแก้ Dockerfile หรือ railway.toml ให้ build สำเร็จ
3. Force deploy ด้วย `serviceInstanceDeploy` mutation พร้อม `commitSha`
4. รอจนได้ status `SUCCESS`

**Railway GraphQL endpoint:** `https://backboard.railway.com/graphql/v2`
**Header:** `Authorization: Bearer b39f928e-e1e5-4d18-aa14-04eb5dafb25e`

```graphql
# Force deploy mutation
mutation {
  serviceInstanceDeploy(
    serviceId: "90633756-ba2f-4648-8027-9ed1288c82a9",
    environmentId: "f768dc05-2df7-46f2-ba90-5636136d10f1",
    commitSha: "<latest_commit_sha>"
  )
}
```

### Task 2: ทดสอบ Dashboard หลัง deploy สำเร็จ
1. GET `https://omni-server-production.up.railway.app/` ต้องได้ HTML ไม่ใช่ `Cannot GET /`
2. POST `https://omni-server-production.up.railway.app/auth/login` ด้วย `{ "password": "niwat2026" }` ต้องได้ `{ "token": "..." }`
3. ถ้า login ไม่ได้ ให้ตรวจสอบ `OMNI_ACCESS_PASSWORD` env var ใน Railway

### Task 3: ทดสอบ Comment Auto-Reply
ส่ง test webhook เข้า server:
```bash
curl -s -X POST "https://omni-server-production.up.railway.app/webhook/meta" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "189971841184132",
      "changes": [{
        "field": "feed",
        "value": {
          "item": "comment",
          "comment_id": "189971841184132_cmt_test001",
          "post_id": "189971841184132_post001",
          "from": {"id": "9999999999", "name": "ลูกค้าทดสอบ"},
          "message": "มีสีอะไรบ้างคะ",
          "verb": "add"
        }
      }]
    }]
  }'
```
ผลที่คาดหวัง: `{"status":"ok","autoReplies":1}` หรือ `{"status":"ok","threads":1}`

### Task 4: ตรวจสอบ pageRegistry สำหรับเพจ VZ ใหม่
เพจ `112979362131792` ถูกเพิ่มใน `server/data/pages.json` แล้ว แต่ต้องตรวจสอบว่า:
- `server/src/omni/pageRegistry.js` มี `FALLBACK_PAGE_PROFILES.vz_viris_zamara` พร้อม `pageId: '112979362131792'`
- `server/src/omni/metaInboxClient.js` มี token mapping สำหรับ `vz_viris_zamara`

ถ้าไม่มี ให้เพิ่มและ commit

## สิ่งที่ห้ามทำ
- ห้าม npm install ใน Dockerfile (ยกเว้น server deps เท่านั้น)
- ห้ามแก้ client/src (frontend code)
- ห้ามลบ env vars ใน Railway

## เมื่อทำเสร็จ
รายงานผลด้วย:
1. Deploy status (SUCCESS/FAILED)
2. Dashboard URL และ login ได้ไหม
3. Comment webhook test result
4. Commit hash สุดท้าย
