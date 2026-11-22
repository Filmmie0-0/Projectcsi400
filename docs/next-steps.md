# แนวทางแก้ไขและงานที่ต้องทำต่อ (ตรวจเมื่อ 22 พ.ย. 2569)

สรุปจากการทดสอบทั้งระบบบนเบราว์เซอร์ (E2E) และการเทียบเอกสารกับโค้ดจริง
ทำตามลำดับหัวข้อได้เลย: หัวข้อ 1 ต้องทำก่อน commit/เดโม, หัวข้อ 2–3 ทำเมื่อมีเวลา

---

## 0. สถานะตอนนี้

**ผลทดสอบ E2E: ผ่าน 49/50 ขั้นตอน** (ข้อที่ไม่ผ่านคือคีย์เดโม ดูข้อ 1.2)

ทดสอบครบ flow จริงผ่านหน้าเว็บ แยกหน้าต่างตาม role:

| ส่วน | สิ่งที่ทดสอบ | ผล |
| --- | --- | --- |
| ล็อกอิน/สิทธิ์ | สมัครสมาชิก, รหัสผิด, เข้าหน้าแอดมินโดยไม่มีสิทธิ์, ออกจากระบบ | ผ่าน |
| งานหลัก | แจ้งงาน → มอบหมายช่าง → ประเมิน → สัญญา → ชำระมัดจำ → เบิกวัสดุ → เริ่มงาน → บันทึกงาน → ส่งมอบ → ชำระงวดสุดท้าย | ผ่าน |
| สัญญาแบบแนบไฟล์ (ใหม่) | แอดมินแนบรูปสัญญา, ลูกค้าแนบรูปที่เซ็นแล้วกลับ, ลูกค้าเปิดไฟล์ร่างไม่ได้ (404), ไฟล์ผิดชนิดถูกปฏิเสธ | ผ่าน |
| Partner API | ส่งงาน (201), ส่งซ้ำได้งานเดิม (200), คีย์ผิด (401), ถามสถานะ, ยกเลิก, webhook | ผ่าน |
| หลังบ้าน | สร้าง/ระงับบัญชีช่าง, เพิ่มวัสดุ, รับของเข้าคลัง, แดชบอร์ด | ผ่าน |

**ฟีเจอร์ที่เพิ่มรอบนี้ (ยังไม่ commit):** สัญญาเปลี่ยนจาก "พิมพ์ชื่อลงนาม" เป็น "แนบรูปส่งไปมา"
- แอดมินร่างสัญญา → กด **แนบไฟล์สัญญา** (JPG/PNG/WebP/PDF ≤ 5 MB) → ถ้ายังไม่แนบจะกด "ส่งให้ลูกค้า" ไม่ได้
- ลูกค้ากด **ลงนามสัญญา** → เห็นไฟล์สัญญา → เซ็น ถ่ายรูป → **แนบรูปสัญญาที่เซ็นแล้ว** → ส่ง = ลงนาม (สร้างงวดชำระเหมือนเดิม)
- ชื่อผู้ลงนามใช้ชื่อบัญชีที่ล็อกอินอัตโนมัติ
- ไฟล์ที่แก้: `02_job_db.sql` (ตาราง `contract_files`), `job-service/src/routes/contracts.js`, `jobs.js`, `http.js`,
  `frontend/.../job/ContractFiles.tsx` (ใหม่), `ContractSection.tsx`, `services/jobService.ts`, `types/job.ts`

---

## 1. ต้องทำก่อน commit / ก่อนเดโม

### 1.1 กู้ไฟล์ `.env.example` ที่ถูกลบ

`git status` แสดงว่า `backend/.env.example` และ `frontend/.env.example` ถูกลบ แต่ README สั่งให้คัดลอกไฟล์นี้เป็น `.env`
ถ้า commit ไปแบบนี้ คนที่ clone ใหม่จะรัน `npm run stack:up` ไม่ได้ (compose บังคับต้องมี `AUTH_JWT_SECRET`)

```powershell
cd C:\Users\usEr\Desktop\Projectcsi400
git restore backend/.env.example frontend/.env.example
```

> ถ้าตั้งใจลบ ต้องแก้ส่วน "เริ่มต้นใช้งาน" ใน README ให้บอกวิธีสร้าง `.env` แทน

### 1.2 รีเซ็ตฐานข้อมูลก่อนเดโม

ปัญหา: คีย์เดโม `dbk_live_demo_7f3a9c2e1b` ใน README ใช้ไม่ได้ (ได้ `401 INVALID_API_KEY`)
สาเหตุ: ใน DB เครื่องนี้ DormBook ถูกกด "ออกคีย์ใหม่" ไปแล้วตั้งแต่ 6 พ.ย. (คีย์ปัจจุบันขึ้นต้น `pk_live_f257…`) — **โค้ดไม่ผิด**
ผลกระทบ: สคริปต์เดโมข้อ 7 "webhook พร้อมลายเซ็นถูกต้อง" จะไม่เป็นจริง

```powershell
cd C:\Users\usEr\Desktop\Projectcsi400\backend
npm run db:reset
```

> ⚠️ ลบข้อมูลทั้งหมดใน DB แล้วสร้างใหม่จาก SQL — ข้อมูลทดสอบ E2E ที่ค้างอยู่ (ลูกค้า `e2e…@test.local`, งาน/ตึก/พาร์ทเนอร์/วัสดุที่มีคำว่า E2E) จะหายไปด้วย ซึ่งเป็นผลดี
> หลัง reset ห้ามกด "ออกคีย์ใหม่" ให้ DormBook ในหน้า พาร์ทเนอร์ API อีก ไม่งั้นคีย์เดโมจะใช้ไม่ได้อีกครั้ง

### 1.3 แจ้งเพื่อนในทีมเรื่อง schema ใหม่

เพิ่มตาราง `contract_files` ใน `02_job_db.sql` — เครื่องที่มี DB อยู่แล้วจะไม่มีตารางนี้ (SQL รันแค่ตอนสร้าง DB ครั้งแรก)
หลัง pull ต้องทำอย่างใดอย่างหนึ่ง:

```powershell
cd backend
npm run db:reset                                   # ง่ายสุด แต่ข้อมูลหาย
docker compose up -d --build job-service           # ต้อง rebuild job-service ทุกครั้งที่แก้โค้ด backend
```

### 1.4 เตรียมไฟล์สำหรับเดโมสัญญา

เพราะตอนนี้การลงนามต้องแนบรูป ให้เตรียมไว้ในเครื่องก่อนขึ้นเดโม:
- `สัญญา.pdf` หรือ `.jpg` — ให้แอดมินแนบ
- `สัญญา-เซ็นแล้ว.jpg` — ให้ลูกค้าแนบกลับ (ถ่ายรูปกระดาษที่เซ็นจริงจะดูสมจริงที่สุด)

---

## 2. เอกสารที่ไม่ตรงกับโค้ด (ต้องอัปเดต)

### 2.1 `docs/er-and-component-tree.md` — เป็นของระบบเก่าทั้งไฟล์ ❗

เนื้อหาพูดถึง `spaces`, `bookings`, `stores`, `04_store_db.sql`, `SpaceSearchPage`, `BookingRequestsPage` ซึ่ง**ไม่มีในโค้ดแล้ว**
(ตรวจแล้ว: `backend/database/services/` มีแค่ `01_auth_db`, `02_job_db`, `03_inventory_db`)
ถ้าอาจารย์เปิดอ่านจะสับสน — ต้องเขียนใหม่ตาม RenoCare หรือลบทิ้ง

ER ที่ถูกต้อง (ใช้แทนได้):

```
auth_db:       users 1─1 technician_profiles
job_db:        partners 1─N buildings 1─N units 1─N jobs
               jobs 1─1 owner_contacts (งาน STRUCTURAL)
               jobs 1─N job_assignments (ช่าง N─M งาน)
               jobs 1─N site_surveys 1─N survey_items
               jobs 1─N contracts 1─N contract_items
               contracts 1─N contract_files (CONTRACT = ไฟล์จากแอดมิน, SIGNED = รูปที่ลูกค้าเซ็นกลับ)
               contracts 1─N invoices ; contracts(MAIN) 1─N contracts(ADDENDUM)
               jobs 1─N work_logs, job_status_logs ; partners 1─N webhook_deliveries
inventory_db:  materials 1─N stock_movements ; requisitions 1─N requisition_items N─1 materials
```

Component tree หลัก (ตามโค้ดจริง):

```
DashboardLayout ─ Sidebar (menu ตาม role) ─ Topbar ─ <Outlet/>
JobDetailPage:  JobStatusStepper, SurveySection(SurveyFormModal), ContractSection(ContractFormModal, ContractFiles),
                WorkLogSection, JobRequisitionSection(RequisitionCard, RequisitionFormModal), Actions, InfoCard, History
NewJobPage:     BuildingModal, UnitModal
BillingPage:    Tabs, InvoiceRow
AdminDashboardPage: StatCard x4, AlertLink
PartnersPage:   CreatePartnerModal, webhook delivery list
PartnerSandboxPage: ส่งงาน / ถามสถานะ / Request log / Webhook inbox
```

### 2.2 `docs/system-design.md`

| หัวข้อ | ตอนนี้ | แก้เป็น |
| --- | --- | --- |
| 3. Workflow | "ลูกค้าลงนาม (สร้างงวดชำระ)" | "ลูกค้าแนบรูปสัญญาที่เซ็นแล้ว (สร้างงวดชำระ)" และเพิ่มว่าแอดมินต้องแนบไฟล์สัญญาก่อนส่ง |
| 4. ER (ย่อ) | ไม่มี `owner_contacts`, `contract_files` | ใช้ ER ในข้อ 2.1 |
| 7. สคริปต์เดโม ข้อ 4 | "ร่างสัญญา … → ส่ง" | "ร่างสัญญา … → **แนบไฟล์สัญญา** → ส่ง" |
| 7. สคริปต์เดโม ข้อ 5 | "ลงนาม" | "เปิดดูสัญญา → **แนบรูปที่เซ็นแล้ว** → ส่ง" |

### 2.3 `README.md`

- ตาราง service แถว job-service: เพิ่ม `owner_contacts`, `contract_files` ในรายชื่อตาราง
- เพิ่มหมายเหตุใต้ "คำสั่ง backend": แก้ไฟล์ SQL / pull แล้วมีตารางใหม่ → `npm run db:reset`, แก้โค้ด service → `docker compose up -d --build <ชื่อ service>`

### สิ่งที่ตรวจแล้วว่า **ตรงกับโค้ด** (ไม่ต้องแก้)

- ปิดงานไม่ได้ถ้ามีสัญญา `DRAFT`/`SENT` ค้าง
- webhook retry 10s/20s/40s… สูงสุด 5 ครั้ง, ทุกการเปลี่ยนสถานะงานพาร์ทเนอร์ใส่ webhook อัตโนมัติด้วย trigger (รวมตอนยกเลิก)
- bcrypt cost 12, รหัสผ่าน 8–72 ไบต์, JWT มี issuer/audience, `AUTH_JWT_SECRET` ≥ 32 ไบต์
- ส่ง `externalRef` ซ้ำได้งานเดิม (idempotent), คิดเงิน < 30 วันรายวัน / ≥ 30 วันรายเดือน, มัดจำ 30%
- `/internal/users/:id`, `/internal/jobs/:id` มีจริงและ gateway ไม่ส่งต่อ

---

## 3. ควรทำเพิ่ม (ไม่ใช่บั๊กร้ายแรง)

### 3.1 บั๊กช่องเบอร์โทรหน้าสมัครสมาชิก — แก้ 1 ตัวอักษร

`frontend/src/pages/auth/RegisterPage.tsx` บรรทัด 52:

```diff
- pattern="[0-9+() -]{8,20}"
+ pattern="[0-9+() \-]{8,20}"
```

Chrome อ่าน pattern เดิมไม่ได้ (ขึ้น error ใน console) เลย**ไม่ตรวจรูปแบบเบอร์เลย** ใครพิมพ์อะไรก็ผ่าน

### 3.2 แจ้งชำระด้วยรูปสลิป

ตอนนี้ลูกค้าต้อง**พิมพ์**เลขอ้างอิงสลิป ขณะที่สัญญาเปลี่ยนเป็นแนบรูปแล้ว — ทำให้ไม่เป็นแนวเดียวกัน
ทำได้โดยใช้ส่วนอัปโหลดเดิม (`ContractFiles.tsx` + การตรวจไฟล์ใน `contracts.js`) แล้วเพิ่มตาราง `invoice_files` หรือคอลัมน์ไฟล์ใน `invoices`

### 3.3 Partner API ยังให้ DormBook ดูไฟล์สัญญาไม่ได้

webhook `contract.sent` / `contract.signed` ส่งแค่ตัวเลข (เลขสัญญา ยอด วันที่) ไม่มีไฟล์
ถ้าฝั่งเพื่อนต้องการไฟล์ ต้องตกลง spec เพิ่มในหัวข้อ 5 ของ system-design.md เช่น `GET /partner/v1/jobs/{externalRef}/contracts/{contractNo}/files/{fileId}`

### 3.4 เก็บสคริปต์ทดสอบ E2E ไว้ใน repo

สคริปต์ที่ใช้ทดสอบรอบนี้อยู่ในโฟลเดอร์ชั่วคราว (อาจหายเมื่อรีสตาร์ทเครื่อง)
ควรย้ายมาไว้ที่ `frontend/e2e/` แล้วเพิ่มคำสั่ง `npm run e2e` — จะได้รันทดสอบซ้ำได้ทุกครั้งก่อนส่งงาน/เดโม

---

## 4. Checklist สั้น ๆ

**ก่อน commit**
- [ ] `git restore backend/.env.example frontend/.env.example` (ข้อ 1.1)
- [ ] แก้ pattern เบอร์โทร (ข้อ 3.1)
- [ ] อัปเดต `system-design.md`, `README.md` (ข้อ 2.2–2.3)
- [ ] เขียน `er-and-component-tree.md` ใหม่ หรือลบ (ข้อ 2.1)
- [ ] commit ฟีเจอร์สัญญาแนบไฟล์ + แจ้งเพื่อนให้ `db:reset` (ข้อ 1.3)

**ก่อนเดโม**
- [ ] `npm run db:reset` (ข้อ 1.2)
- [ ] ลองส่งงานที่ `/sandbox` ด้วยคีย์เดโม ต้องได้ `201`
- [ ] เตรียมไฟล์สัญญา + รูปสัญญาที่เซ็นแล้ว (ข้อ 1.4)
- [ ] เดินตามสคริปต์เดโมใน system-design.md หัวข้อ 7 หนึ่งรอบ

## 5. ปัญหาที่เจอบ่อยตอนรัน

| อาการ | สาเหตุ | วิธีแก้ |
| --- | --- | --- |
| `Port 5173 is already in use` | มี Vite ตัวเก่ารันค้างอยู่ | `Get-NetTCPConnection -LocalPort 5173 -State Listen \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` |
| `failed to connect to the docker API` | Docker Desktop ยังไม่เปิด | เปิด Docker Desktop รอจนขึ้น running แล้วรันใหม่ |
| แก้โค้ด backend แล้วไม่เปลี่ยน | container ยังใช้ image เก่า | `docker compose up -d --build <service>` |
| แก้ SQL แล้วไม่เปลี่ยน | SQL รันแค่ตอนสร้าง DB ครั้งแรก | `npm run db:reset` |
| Sandbox ได้ `401 INVALID_API_KEY` | คีย์ใน DB ถูกออกใหม่ | `npm run db:reset` หรือใช้คีย์ใหม่จากหน้า พาร์ทเนอร์ API |
