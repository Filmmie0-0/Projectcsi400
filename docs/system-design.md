# RenoCare — ระบบรับงานตรวจสอบห้องเช่า & รีโนเวทพื้นที่ (Web Service Model)

> ระบบนี้ทำงานเป็น **พาร์ทเนอร์** ของระบบจองห้องพัก (ของเพื่อน — ในเอกสารเรียกว่า **DormBook**)
> DormBook ส่งงานเข้ามาผ่าน API → RenoCare ประเมินหน้างาน ทำสัญญา เบิกวัสดุ ลงมือทำ → แจ้งผลกลับด้วย webhook

## 1. ปัญหาและแนวคิด

| ฝั่ง | ทำอะไร | ไม่ต้องทำอะไร |
| --- | --- | --- |
| DormBook (ระบบจองห้องพัก) | จัดการห้อง ผู้เช่า การจอง การย้ายเข้า-ออก | ไม่ต้องมีระบบช่าง/คลังวัสดุ/สัญญางานซ่อม |
| RenoCare (ระบบนี้) | ตรวจห้อง ซ่อม รีโนเวทพื้นที่ (เช่น ใต้ตึก) ทำสัญญา เบิกของ | ไม่ต้องรู้เรื่องการจองห้อง |

ตัวอย่างการทำงานร่วมกัน
- ผู้เช่าแจ้งย้ายออกใน DormBook → DormBook ส่งงาน `INSPECTION` มา → ช่างตรวจห้อง → ถ้าไม่เสียหาย ปิดงานทันที, ถ้าเสียหาย ทำสัญญาซ่อม → DormBook ได้ webhook และตัดสินใจคืนเงินประกัน / ปิดห้องไม่ให้จองระหว่างซ่อม
- เจ้าของหอต้องการปรับพื้นที่ใต้ตึกเป็นร้านค้า → งาน `RENOVATION` ระยะยาว คิดเงินรายเดือน

## 2. บทบาท (Role)

| Role | ใคร | สิทธิ์หลัก |
| --- | --- | --- |
| `ADMIN` | ผู้ดูแล/ผู้รับงาน | มอบหมายช่าง, ร่าง/ส่งสัญญา, อนุมัติใบเบิก, จัดการคลัง, ตรวจสลิป, จัดการผู้ใช้และพาร์ทเนอร์ |
| `USER` | ลูกค้า: เจ้าของตึก หรือ **บัญชีตัวแทนของ DormBook** | แจ้งงาน, ลงนาม/ปฏิเสธสัญญา, แจ้งชำระเงิน, ยกเลิกงานก่อนเซ็นสัญญา |
| `TECHNICIAN` | ช่าง | ส่งผลประเมินหน้างาน (เช็กลิสต์), แจ้งงานเพิ่ม, เริ่ม/ปิดงาน (หัวหน้าช่าง), บันทึกงานรายวัน, เบิก/คืนวัสดุ |

ระบบภายนอก (DormBook) ไม่ใช่ role แต่ใช้ **API key** — งานที่ส่งมาผูกกับบัญชี USER ตัวแทนของพาร์ทเนอร์ เพื่อให้มีคนเซ็นสัญญาและจ่ายเงิน

## 3. Workflow ของงาน

```
           (ลูกค้าแจ้ง / DormBook ส่ง API)
NEW ──แอดมินมอบหมายช่าง+นัด──▶ SURVEY_ASSIGNED ──ช่างส่งผลประเมิน──▶ SURVEYED
                                                              │  INSPECTION ไม่ต้องซ่อม
                                                              ├──────────────────────▶ COMPLETED
                                       แอดมินส่งสัญญาหลัก     ▼
                                                            QUOTED ──ลูกค้าปฏิเสธ──▶ SURVEYED (เสนอใหม่)
                                                              │ ลูกค้าลงนาม (สร้างงวดชำระ)
                                                              ▼
       ช่างเบิกวัสดุ ─────────────────────────────────▶  CONTRACTED ──หัวหน้าช่างเริ่มงาน──▶ IN_PROGRESS
                                                                                            │ บันทึกงานรายวัน
                     พบงานเพิ่ม: ช่างประเมินเพิ่ม → สัญญาเพิ่มเติม (ADDENDUM) → ลูกค้าลงนาม ◀──┤
                                                                                            ▼
                                                                    ส่งมอบ (ไม่มีสัญญาค้าง) COMPLETED
ยกเลิกได้: ลูกค้า (ก่อนเซ็นสัญญา), DormBook ผ่าน API (ก่อนเซ็นสัญญา), แอดมิน (ก่อนจบงาน) → CANCELLED
```

### การคิดเงิน: รายวัน หรือ รายเดือน "ตามความเหมาะสม"
- ช่างประเมินจำนวนวันทำงาน → ระบบแนะนำ: **< 30 วัน = รายวัน**, **≥ 30 วัน = เหมารายเดือน** (แอดมินเปลี่ยนได้)
- อัตราแนะนำ = ค่าแรงรายวันรวมของทีมช่าง (รายเดือน × 26 วันทำงาน)
- ยอดสัญญา = ค่าแรง (`rate × period_qty`) + ค่าวัสดุ (รายการวัสดุในสัญญา)
- งวดชำระสร้างอัตโนมัติตอนลงนาม
  - รายวัน: มัดจำ 30% (วันเริ่มงาน) + ส่วนที่เหลือ (วันส่งมอบ)
  - รายเดือน: เดือนละงวด, งวดแรกรวมค่าวัสดุ

### สัญญาเพิ่มเติม (Addendum)
ระหว่างทำงานถ้าช่างพบงานเพิ่ม → ส่ง "ประเมินเพิ่มเติม" → แอดมินร่างสัญญา `ADDENDUM` ผูกกับสัญญาหลัก → ลูกค้าลงนาม
ปิดงานไม่ได้ถ้ายังมีสัญญาที่รอเซ็น

### การเบิกวัสดุ
`PENDING` (ช่างขอ) → `ISSUED` (แอดมินอนุมัติ + จ่าย, ตัดสต็อกทันที) → `CLOSED` (ช่างคืนของเหลือ) | `REJECTED`
แอดมินเห็นต้นทุนวัสดุจริงของงานเทียบกับค่าวัสดุในสัญญา (เกินงบ/อยู่ในงบ)

## 4. สถาปัตยกรรม (Microservices, database-per-service)

```
Frontend (React) ─┐
DormBook (API key)┴─▶ Gateway :3000  ── ตรวจ session ผ่าน auth-service ทุก request, ส่ง X-User-* ให้ service, รวม /api/admin/summary
                         ├─▶ auth-service      :4001 ─▶ auth_db       users, technician_profiles
                         ├─▶ job-service       :4002 ─▶ job_db        partners, buildings, units, jobs, surveys,
                         │        │   ▲                               contracts, invoices, work_logs, webhooks
                         │        │   └── /internal/jobs/:id ◀── inventory-service (ตรวจสิทธิ์ก่อนเบิก)
                         │        └── /internal/users/:id ─▶ auth-service (ตรวจว่าเป็นช่าง + snapshot ชื่อ)
                         └─▶ inventory-service :4003 ─▶ inventory_db  materials, stock_movements, requisitions
job-service ──webhook (HMAC-SHA256)──▶ DormBook
```

ทำไมเหลือ 3 service (เดิม 4): แบ่งตามสิ่งที่ dev 2 คนรับผิดชอบได้จริง และแต่ละ service มีข้อมูลของตัวเองชัดเจน
- ข้าม database เก็บแค่ id + snapshot (เช่น `technician_name`, `job_code`) ไม่มี FK ข้าม DB
- `/internal/*` เรียกได้เฉพาะในเครือข่าย Docker (gateway ไม่ส่งต่อ)

### ความปลอดภัยของการเข้าสู่ระบบ
- JWT (HS256, 8 ชม., มี issuer/audience) เก็บใน **HttpOnly + SameSite=Strict cookie** — JavaScript อ่าน token ไม่ได้ (กัน XSS ขโมย token), production เปิด `Secure`
- `users.token_version`: logout หรือแอดมินระงับบัญชี → เพิ่มเลข → token เก่าใช้ไม่ได้ทันที
- gateway ถาม auth-service (`/internal/auth/verify`) ทุก request: ลายเซ็น + บัญชียัง ACTIVE + role/token_version ตรง แล้วจึงส่ง `X-User-*` (header ที่ client ปลอมมาถูกลบทิ้ง)
- กัน CSRF: request ที่ไม่ใช่ GET จากเบราว์เซอร์ต้องมี Origin ตรงกับ `CORS_ORIGIN`
- Rate limit: login 10 ครั้ง/15 นาที, สมัคร 5 ครั้ง/ชม. ต่อ IP
- รหัสผ่าน bcrypt (cost 12), ยาว 8-72 ไบต์; `AUTH_JWT_SECRET` ต้องยาว ≥ 32 ไบต์ ไม่งั้น auth-service ปฏิเสธ

### จุดเด่นฝั่งฐานข้อมูล (ใช้อธิบายอาจารย์)
| กลไก | ที่ไหน | ทำอะไร |
| --- | --- | --- |
| Trigger `trg_jobs_after_update` | job_db | เปลี่ยนสถานะงาน → บันทึก `job_status_logs` + ใส่ webhook ลง outbox อัตโนมัติ |
| Generated column | `contracts.labor_amount`, `total_amount`, `contract_items.line_total` | คำนวณยอดใน DB ไม่ให้ตัวเลขไม่ตรงกัน |
| Trigger `trg_citem_*` | contract_items | รวมค่าวัสดุเข้า `contracts.material_amount` + ล็อกไม่ให้แก้สัญญาที่ส่งแล้ว |
| Trigger `trg_move_*` | inventory_db | ทุก stock movement ปรับ `stock_on_hand` และกันสต็อกติดลบ |
| CHECK constraint | หลายตาราง | เช่น `PARTNER` ต้องมี `partner_id`, `ADDENDUM` ต้องมีสัญญาแม่, คืนของไม่เกินที่เบิก |
| UNIQUE `(partner_id, external_ref)` | jobs | ส่งงานซ้ำจาก DormBook ไม่สร้างงานซ้ำ (idempotent) |
| View | `v_job_summary`, `v_job_material_cost`, `v_inventory_summary` | แดชบอร์ดและต้นทุนจริงต่องาน |

### ER (ย่อ)
```
auth_db:       users 1─1 technician_profiles
job_db:        partners 1─N buildings 1─N units 1─N jobs
               jobs 1─N job_assignments (ช่าง N─M งาน)
               jobs 1─N site_surveys 1─N survey_items
               jobs 1─N contracts 1─N contract_items ; contracts 1─N invoices ; contracts(MAIN) 1─N contracts(ADDENDUM)
               jobs 1─N work_logs, job_status_logs ; partners 1─N webhook_deliveries
inventory_db:  materials 1─N stock_movements ; requisitions 1─N requisition_items N─1 materials
               requisitions 1─N stock_movements (OUT/RETURN)
```

## 5. สัญญาการเชื่อมต่อกับระบบจองห้องพัก (Partner API v1)

ให้เพื่อนเรียกตาม spec นี้ (Base URL: `http://<gateway>/api/partner/v1`, Header `X-API-Key: <key>`)

### 5.1 ส่งงาน — `POST /jobs`
```json
{
  "externalRef": "BK-88231-OUT",
  "jobType": "INSPECTION",
  "building": { "externalRef": "DB-BLD-001", "name": "บ้านริมคลอง เรสซิเดนซ์", "address": "..." },
  "unit": { "externalRef": "DB-RM-201", "code": "201", "unitType": "ROOM", "floor": "2" },
  "title": "ตรวจห้องหลังผู้เช่าย้ายออก ห้อง 201",
  "description": "ย้ายออก 20 ต.ค.",
  "priority": "URGENT",
  "preferredDate": "2026-10-21",
  "contact": { "name": "คุณนิด", "phone": "0822222222" }
}
```
- `201` สร้างงานใหม่ / `200` externalRef นี้เคยส่งแล้ว (คืนงานเดิม) — ส่งซ้ำได้ปลอดภัยเมื่อ network มีปัญหา
- ตึก/ห้องถูกสร้างหรืออัปเดตอัตโนมัติจาก `externalRef`
- `jobType`: `INSPECTION` | `RENOVATION`, `unitType`: `ROOM` | `COMMON` | `UNDER_BUILDING`

ตอบกลับ: `{ "jobCode": "JB2610-0005", "externalRef": "...", "jobType": "...", "title": "...", "status": "NEW", "createdAt": "...", "completedAt": null }`

### 5.2 ดูสถานะ — `GET /jobs/{externalRef}`
เพิ่ม `latestSurvey` (สรุปผลตรวจ, ต้องซ่อมไหม), `contracts` (ยอด, ช่วงวันที่), `progressPct`

### 5.3 ยกเลิก — `POST /jobs/{externalRef}/cancel`  `{ "reason": "..." }`
ยกเลิกได้ก่อนลูกค้าเซ็นสัญญาเท่านั้น (ไม่งั้น `409 INVALID_STATUS`)

### 5.4 Webhook ที่ DormBook ต้องรับ (POST ไปที่ `webhook_url` ที่ลงทะเบียนไว้)
Header `X-Signature: sha256=<HMAC-SHA256(webhook_secret, raw body)>` และ `X-Delivery-Id`
ตอบ 2xx = รับแล้ว, อย่างอื่น = RenoCare ส่งซ้ำแบบ backoff (10s, 20s, 40s, ...) สูงสุด 5 ครั้ง

| event | เมื่อไร | field สำคัญ |
| --- | --- | --- |
| `job.status_changed` | ทุกครั้งที่สถานะเปลี่ยน | `from`, `to`, `remark` |
| `survey.submitted` | ช่างส่งผลตรวจ/ประเมินเพิ่ม | `needRepair`, `estDays`, `items[]` (area, item, condition, action) |
| `contract.sent` / `contract.signed` | ส่งสัญญา / ลงนาม | `contractNo`, `billingType`, `totalAmount`, `startDate`, `endDate` |
| `job.progress` | ช่างบันทึกงานรายวัน | `progressPct`, `workDate`, `note` |

ทุก event มี `jobCode`, `externalRef`, `occurredAt`

**สิ่งที่แนะนำให้ฝั่ง DormBook ทำเมื่อได้ webhook**
- `to = IN_PROGRESS` → ปิดห้องไม่ให้จอง, `to = COMPLETED` → เปิดห้องให้จองได้
- `survey.submitted` + `needRepair = false` → คืนเงินประกันผู้เช่าได้

### Error format (ทุก endpoint)
`{ "code": "INVALID_STATUS", "message": "ข้อความภาษาไทย" }` — `401 INVALID_API_KEY`, `404 JOB_NOT_FOUND`, `409 INVALID_STATUS`, `422 VALIDATION`

> ถ้าระบบของเพื่อนมี API อยู่แล้ว (เช่น อยากให้ RenoCare เป็นฝ่ายดึงข้อมูลห้อง) เพิ่มเป็น client ใน job-service ได้โดยไม่กระทบโครงสร้างนี้

## 6. แบ่งงาน Dev 2 คน (แบ่งตาม service แนวตั้ง ลด merge conflict)

| | Dev A — งาน & พาร์ทเนอร์ | Dev B — ผู้ใช้ & คลัง |
| --- | --- | --- |
| Backend (`backend/services/`) | `job-service` (jobs, surveys, contracts, invoices, partner API, webhook), `gateway` | `auth-service`, `inventory-service` |
| Database (`backend/database/services/`) | `02_job_db.sql` | `01_auth_db.sql`, `03_inventory_db.sql` |
| Frontend (`frontend/src/`) | `pages/jobs`, `pages/billing`, `pages/user`, `pages/public/PartnerSandboxPage`, `pages/admin/PartnersPage`, `components/features/job` | `pages/auth`, `pages/admin/UsersPage`, `pages/inventory`, `pages/technician`, `components/features/inventory`, `components/ui` |
| ประสานงานกับเพื่อน | Partner API + webhook spec (หัวข้อ 5) | — |

ไฟล์ที่ต้องตกลงกันก่อนแก้: `frontend/src/types/*`, `frontend/src/constants/labels.ts`, `docs/system-design.md`

### แผน 4 สัปดาห์ (ตัวอย่าง)
1. ตกลง schema + API spec กับเพื่อน, ยืนยัน flow กับอาจารย์
2. CRUD + state machine ของแต่ละ service, หน้าจอหลักแต่ละ role
3. เชื่อม Partner API กับระบบจริงของเพื่อน (แทน mock ใน gateway), ทดสอบ webhook
4. เก็บงาน UI, เตรียมเดโม (ตามสคริปต์ด้านล่าง)

## 7. สคริปต์เดโม (~5 นาที)
1. เปิด `/sandbox` (เป็น DormBook) → ส่งงานตรวจห้อง
2. แท็บใหม่ ล็อกอิน **แอดมิน** → งานใหม่ → มอบหมาย "ช่างบี" + นัดวัน → sandbox เห็น webhook `SURVEY_ASSIGNED`
3. ล็อกอิน **ช่างบี** → บันทึกผลประเมิน (เช็กลิสต์) ติ๊กต้องซ่อม
4. **แอดมิน** → ร่างสัญญา (ระบบแนะนำรายวัน) เพิ่มวัสดุจากคลัง → ส่ง
5. ล็อกอิน **DormBook (ลูกค้า)** → ลงนาม → เห็นงวดมัดจำ 30%
6. **ช่างบี** → เบิกวัสดุ → **แอดมิน** อนุมัติ (สต็อกลด) → ช่างเริ่มงาน, บันทึกงาน, ปิดงาน
7. กลับไปดู `/sandbox` — webhook ครบทุกขั้น พร้อมลายเซ็นถูกต้อง
