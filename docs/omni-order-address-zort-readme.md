# Omni Order Address + ZORT Pointer README

Updated: 2026-05-26
Owner: Dex
Verifier: Boss / Dex
Status: local verified, ZORT live write approval guarded

## Purpose

เอกสารนี้เป็น pointer สำหรับงาน `ออเดอร์` ของ Omni Chat หลังติดตั้งหรือย้ายเครื่อง/ขึ้น cloud เพื่อไม่ให้ฟังก์ชันตกหล่น และให้แก้ถูกไฟล์/ถูกบรรทัด

## Current Verified State

- AI ดึงชื่อ เบอร์ และที่อยู่จากข้อความแชทได้
- ระบบอ้างอิงรหัสไปรษณีย์ไทยและเลือกตำบล/อำเภอ/จังหวัดได้
- ระบบสร้าง draft ข้อความให้ลูกค้าตรวจที่อยู่ก่อน
- Order draft เก็บ shipping/payment/address ลง DB snapshot
- Approve ไป ZORT ถูก guard ด้วยข้อมูลครบ + Thai postcode match + Boss approval
- ZORT runtime verify เป็น `live_api_ready`
- ยังไม่ควรกดสร้าง ZORT order จริงโดยไม่มี approval

## Required Install / Runtime Checks

Run from repo root unless noted:

```bash
cd server && npm install
cd ../client && npm install
```

Required runtime checks:

```bash
/Users/babycuca/.codex/bin/omni-ai-reply verify
/Users/babycuca/.codex/bin/zort-api verify
cd server && npm test
cd ../client && npm test
cd client && npm run build
git diff --check
```

Expected verified counts on 2026-05-26:

```text
server npm test: 89/89
client npm test: 26/26
client build: pass
zort-api verify: live_api_ready
omni-ai-reply verify: ok
```

## Function Pointer Map

| Function | File pointer | What to check |
|---|---|---|
| Thai postcode lookup API | `server/src/routes.js:384` | `GET /api/omni/thai-address/postcodes/:postcode` returns suggestions and `provinceCount: 77` |
| Thai postcode lookup logic | `server/src/omni/thaiAddress.js:84` | `lookupThaiAddressByPostcode()` normalizes postcode and returns province/district/subdistrict |
| Thai shipping validation | `server/src/omni/thaiAddress.js:121` | `validateThaiShippingAddress()` blocks incomplete or mismatched address before ZORT |
| Chat address parser | `server/src/omni/orderAddressIntake.js:214` | `extractThaiOrderAddress()` extracts name, phone, address line, postcode, Thai address |
| Customer confirmation text | `server/src/omni/orderAddressIntake.js:195` | `buildAddressConfirmationText()` asks customer to confirm address or request missing fields |
| Address intake setting default | `server/src/omni/service.js:22` | `orderAddressIntake.enabled` and `createConfirmationDraft` default on |
| Address intake service | `server/src/omni/service.js:879` | `createOrderAddressIntake()` reads thread messages and creates customer confirmation draft |
| Address intake API | `server/src/routes.js:202` | `POST /api/omni/threads/:threadId/order-address-intake` |
| Manual/customer confirmation draft | `server/src/omni/service.js:820` | `recordManualReplyDraft()` stores `draft_only`, does not send to customer |
| Order draft normalizer | `server/src/omni/service.js:245` | `createOrderDraftRow()` stores customer/shipping/payment/items |
| Order draft API | `server/src/routes.js:399` | `POST /api/omni/order-drafts` |
| ZORT approval guard | `server/src/omni/service.js:630` | `approveOrderDraft()` requires approval and valid Thai shipping address |
| ZORT approve API | `server/src/routes.js:406` | `POST /api/omni/order-drafts/:orderId/approve` |
| ZORT order body | `server/src/omni/zortCommerceRuntime.js:35` | `buildZortOrderBody()` sends customer/shipping/payment/list fields |
| Client address API wrapper | `client/src/lib/omniApi.js:111` | `extractOrderAddressFromThread()` calls address intake endpoint |
| Client postcode API wrapper | `client/src/lib/omniApi.js:107` | `lookupThaiAddressByPostcode()` calls postcode endpoint |
| Client draft API wrapper | `client/src/lib/omniApi.js:119` | `createOrderDraft()` posts order draft |
| Client approve API wrapper | `client/src/lib/omniApi.js:123` | `approveOrderDraft()` sends approved payload |
| Order UI address lookup | `client/src/components/omni/OrderDesk.jsx:126` | postcode effect loads Thai address options |
| Order UI AI import | `client/src/components/omni/OrderDesk.jsx:166` | `importAddressFromChat()` fills form and creates confirmation draft |
| Order UI save draft | `client/src/components/omni/OrderDesk.jsx:199` | `saveDraft()` includes shipping/payment/ZORT product |
| Order UI approve ZORT | `client/src/components/omni/OrderDesk.jsx:246` | `submitApprovedDraft()` only runs after operator confirmation |
| Order UI button | `client/src/components/omni/OrderDesk.jsx:349` | button text `AI ดึงที่อยู่จากแชท` |

If line numbers drift, refresh the map with:

```bash
rg -n "orderAddressIntake|createOrderAddressIntake|order-address-intake|extractThaiOrderAddress|buildAddressConfirmationText|lookupThaiAddressByPostcode|validateThaiShippingAddress|createOrderDraft|approveOrderDraft|buildZortOrderBody|AI ดึงที่อยู่จากแชท|extractOrderAddressFromThread" server/src client/src server/test client/src/components/omni/OmniWorkbench.test.jsx
```

## Post-Install Functional Checklist

### 1. Thai Address Dataset

Verify:

```bash
curl -s http://127.0.0.1:5174/api/omni/thai-address/postcodes/10110
curl -s http://127.0.0.1:5174/api/omni/thai-address/postcodes/50200
```

Expected:

- `ok: true`
- suggestions include province/district/subdistrict
- `source.provinceCount: 77`

### 2. AI Address Intake From Chat

Verify:

```bash
curl -s -X POST http://127.0.0.1:5174/api/omni/threads/thread_1/order-address-intake \
  -H 'content-type: application/json' \
  -d '{"text":"ชื่อผู้รับ: คุณแพรว\nเบอร์ 081-234-5678\nที่อยู่ 99/1 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110","createConfirmationDraft":true}'
```

Expected:

- `extracted.readyForDraft: true`
- `recipientName`, `recipientPhone`, `postalCode` filled
- `selectedAddress.district: คลองเตย`
- `selectedAddress.subDistrict: คลองตัน`
- `confirmationDraft.message.sourceRef: ai_address_confirmation_draft`
- no customer send yet, only `draft_only`

### 3. ZORT Product Lookup

Verify:

```bash
curl -s "http://127.0.0.1:5174/api/omni/zort/products?q=lorสีดำM&limit=3"
```

Expected:

- product exists
- product has `id`, `sku`, price
- product id is passed as `zortProductId` into draft

### 4. Order Draft Creation

Verify:

- use extracted address from step 2
- use product from step 3
- create `POST /api/omni/order-drafts`

Expected:

- `order.status: draft`
- `shippingAddress.formattedAddress` exists
- `items[0].zortProductId` exists
- no stock cut
- no ZORT order created yet

### 5. Approval Guard Before ZORT Write

Do not run live approve without Boss approval.

Safe checks:

- test `approved: false` returns `approval_required`
- test incomplete address returns `shipping_address_incomplete`
- test mismatched postcode returns `shipping_address_postcode_mismatch`

Live write allowed only after:

- customer confirmed address
- Boss/operator confirmed in UI
- ZORT product id is present
- payment/shipping method reviewed

### 6. Customer Confirmation Draft

Expected draft text shape:

```text
รบกวนตรวจสอบที่อยู่จัดส่งนี้ให้หน่อยค่ะ
ชื่อผู้รับ: ...
โทร: ...
ที่อยู่: ...
ถ้าถูกต้อง พิมพ์ "ยืนยันที่อยู่" ได้เลยค่ะ ถ้าต้องแก้ไข ส่งข้อมูลใหม่กลับมาได้เลยค่ะ
```

This draft is stored in Omni first. It is not sent until the send/reply approval path is used.

### 7. Browser QA After Local Browser Fix

Current blocker:

```text
Browser runtime could click and verify the AI address button, but input typing/fill hit:
Browser Use virtual clipboard is not installed
```

After Browser virtual clipboard/runtime is fixed, rerun:

1. Open `http://127.0.0.1:5174/?mode=inbox`
2. Click `ออเดอร์`
3. Click `AI ดึงที่อยู่จากแชท`
4. Confirm name/phone/address/postcode filled
5. Search ZORT product
6. Select product
7. Save draft
8. Open approve confirmation
9. Do not click final ZORT create unless Boss approves

## Test Pointers

| Test | File pointer | Coverage |
|---|---|---|
| Address intake route | `server/test/routes.test.js:656` | extract chat address + create customer confirmation draft |
| Thai postcode route | `server/test/routes.test.js:645` | postcode lookup with 77 provinces |
| Order draft approval success | `server/test/routes.test.js:543` | product lookup, draft, approval guard, ZORT create mock |
| Missing address block | `server/test/routes.test.js:601` | prevents ZORT create when shipping address incomplete |
| ZORT order body | `server/test/omni.test.js:39` | customer and shipping fields in ZORT payload |
| Client order flow | `client/src/components/omni/OmniWorkbench.test.jsx:316` | UI flow: AI address import, product select, draft, approve |

## Do Not Forget

- Do not treat UI as complete unless API/runtime test also passes.
- Do not create real ZORT order without explicit approval.
- Do not send customer confirmation automatically unless the outbound send path has approval.
- If moving to Vercel/cloud, replace local helper paths with cloud-safe env/runtime contracts before calling it production-ready.
- If adding more carriers/payment methods, update `OrderDesk.jsx`, draft payload, ZORT body mapping, and tests together.
