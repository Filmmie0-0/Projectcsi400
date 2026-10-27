# RenoCare — ตรวจสอบห้องเช่า & รีโนเวทพื้นที่ (Partner Web Service)

รับงานต่อจากระบบจองห้องพัก (พาร์ทเนอร์) หรือจากเจ้าของตึกโดยตรง → ประเมินหน้างาน → ทำสัญญา (รายวัน/รายเดือน + สัญญาเพิ่มเติม)
→ เบิกวัสดุ → บันทึกงาน → ส่งมอบ พร้อมแจ้งสถานะกลับระบบพาร์ทเนอร์ด้วย webhook

- Frontend: React 18 + TypeScript + Vite + Tailwind (ธีม Minimalist Brown เดิม)
- Backend: Node.js (Express) microservices + MySQL 8 (database-per-service) บน Docker
- เอกสารออกแบบระบบ / Partner API spec / แบ่งงาน dev 2 คน: [docs/system-design.md](docs/system-design.md)

## เริ่มต้นใช้งาน

ต้องมี Docker Desktop

```bash
<<<<<<< HEAD
cp .env.example .env   # ไม่บังคับ มีค่าเริ่มต้น
=======
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }   # PowerShell
>>>>>>> 6aca8a91bcd6df99dcd651a81e703215097c3458
npm install
npm run stack:up       # DB + phpMyAdmin + 3 services + gateway
npm run dev            # http://localhost:5173
```

บัญชีเดโม (รหัสผ่าน `password123`, มีปุ่มลัดในหน้า login)

<<<<<<< HEAD
| บัญชี | Role |
| --- | --- |
| admin@renocare.local | ADMIN |
| owner@renocare.local | USER (เจ้าของหอ) |
| partner@dormbook.local | USER (บัญชีตัวแทนระบบจอง DormBook) |
| tech1@renocare.local, tech2@renocare.local | TECHNICIAN |

Partner API key เดโม: `dbk_live_demo_7f3a9c2e1b` — ลองได้ที่หน้า `/sandbox` (จำลองระบบจองห้องพักของเพื่อน รับ webhook จริง)

## สถาปัตยกรรม
=======
ข้อมูลพื้นที่/ร้าน/คลังสินค้าใช้ mock Web Service ในเบราว์เซอร์เป็นค่าเริ่มต้น
(`frontend/src/services/mock/mockDb.ts`) และเก็บใน localStorage — ตั้ง `VITE_USE_MOCK=false`
ใน `frontend/.env` เพื่อเรียก backend จริง

หน้า `/login` และ `/register` ใช้ auth-service จริงผ่าน gateway ต้องเปิด backend ก่อนใช้งาน
ระบบสมัครได้เฉพาะบทบาทผู้เช่าหรือเจ้าของพื้นที่; การสร้าง ADMIN ต้องทำโดยผู้ดูแลระบบในฐานข้อมูล

## Backend + ฐานข้อมูล (Docker, Microservices)

ต้องติดตั้ง Docker Desktop ก่อน ไม่ต้องลง MySQL หรือ Node backend ในเครื่อง

```bash
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }   # PowerShell
npm run stack:up
```
>>>>>>> 6aca8a91bcd6df99dcd651a81e703215097c3458

ก่อนเปิดระบบ ให้กำหนด `AUTH_JWT_SECRET` ใน `backend/.env` เป็นค่าสุ่มอย่างน้อย 32 ไบต์
(สร้างได้ด้วย `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
กำหนด `CORS_ORIGIN` ใน `backend/.env` ให้ตรงกับ origin ของ frontend ทุกตัวอักษร
และบน production ให้ใช้ HTTPS พร้อมตั้ง `NODE_ENV=production` เพื่อเปิด Secure cookie.

```
frontend :5173 ──┐
partner (API key)┴─> gateway :3000 ──┬─> auth-service      :4001 ──> auth_db
                                     ├─> job-service       :4002 ──> job_db  ──webhook──> partner
                                     └─> inventory-service :4003 ──> inventory_db
```

| Service | Path ที่ gateway ส่งต่อ | ตาราง |
| --- | --- | --- |
| auth-service | `/api/auth`, `/api/users` | users, technician_profiles |
| job-service | `/api/jobs`, `/api/buildings`, `/api/contracts`, `/api/invoices`, `/api/partners`, `/api/partner/v1` | partners, buildings, units, jobs, job_assignments, site_surveys, survey_items, contracts, contract_items, invoices, work_logs, job_status_logs, webhook_deliveries |
| inventory-service | `/api/materials`, `/api/stock`, `/api/requisitions` | materials, stock_movements, requisitions, requisition_items |

<<<<<<< HEAD
- gateway ตรวจ JWT แล้วส่ง `X-User-Id / X-User-Role / X-User-Name` ให้ service; `/api/partner/v1/*` ใช้ `X-API-Key` แทน
- ห้าม JOIN ข้าม database: ข้าม service เก็บ id + snapshot แล้วเรียกกันผ่าน `/internal/*` (gateway ไม่ส่งต่อ)
- `/api/admin/summary` รวมตัวเลขจาก 3 service ที่ gateway

## คำสั่ง

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run stack:up` | เปิดทั้งหมด |
| `npm run stack:down` | ปิด (ข้อมูลยังอยู่) |
| `npm run stack:logs` | ดู log |
| `npm run db:reset` | ลบข้อมูลแล้วสร้างใหม่จาก SQL (ต้องทำทุกครั้งที่แก้ไฟล์ใน `database/services/`) |
| `npm run db:shell` | mysql CLI (root) |

- phpMyAdmin — http://localhost:8081 · Health — http://localhost:3000/health
- compose ใช้ชื่อ project `renocare` จึงได้ volume ใหม่ `renocare_mysql_data` (volume ของระบบเดิม `projectcsi400_mysql_data` ไม่ถูกแตะ ลบเองได้ด้วย `docker volume rm projectcsi400_mysql_data`)
- พอร์ต 3306 ชนกับ MySQL ในเครื่อง → ตั้ง `DB_PORT=3307` ใน `.env`

## โครงสร้าง frontend

- `src/pages` — `public` (landing, partner sandbox), `auth`, `admin`, `user`, `technician`, และหน้าที่ใช้ร่วมกันหลาย role: `jobs`, `billing`, `inventory`
- `src/components` — `ui/` (design system), `common/`, `features/job`, `features/inventory`
- `src/services` — API client แยกตาม service (`authService`, `jobService`, `inventoryService`, `partnerService`)
- `src/hooks` — React Query hooks แยกตาม service
- `src/types` — ตรงกับ schema ใน `database/services/`
- `src/constants/labels.ts` — ชื่อสถานะ/สีภาษาไทย และกติกาแนะนำรายวัน/รายเดือน
=======
กติกา database-per-service
- user ของแต่ละ service เข้าได้เฉพาะ database ของตัวเอง ห้าม JOIN ข้าม database: ต้องเรียก service อื่นผ่าน HTTP
- ข้าม service เก็บแค่ id (เช่น `tenant_id`, `booking_id`) โดยไม่มี foreign key
- endpoint `/internal/*` ใช้คุยกันระหว่าง service เท่านั้น gateway ไม่ส่งต่อ
- gateway ตรวจ JWT, สถานะบัญชี และ role ก่อนส่งคำขอไปยัง service; booking/store ใช้ user ID จาก token แทน ID จาก client
- สิ่งที่เปลี่ยนจาก schema เดิม (`backend/database/legacy/`):
  - `bookings` เพิ่ม snapshot `space_owner_id`, `dormitory_id` จาก space-service ตอนสร้าง booking
  - `trg_store_before_insert` ย้ายไปเป็นโค้ดใน `POST /api/tenant/stores` (store-service ถาม booking-service)
  - `v_admin_summary` แยกเป็น view ย่อยในแต่ละ DB แล้วรวมที่ gateway: `GET /api/admin/summary`
  - trigger สต็อก/ออเดอร์/ราคาส่งอยู่ใน `store_db` ทั้งหมด จึงทำงานเหมือนเดิม

เครื่องมือ
- phpMyAdmin — http://localhost:8081 (`root` / `root` หรือ user ของ service เช่น `store_svc` / `store_pass`)
- Health check — http://localhost:3000/health
- ข้อมูลเก็บใน Docker volume `mysql_data` ไม่หายเมื่อ `stack:down`
- SQL ใน `backend/database/services/` รันอัตโนมัติเฉพาะตอนสร้าง DB ครั้งแรก ถ้าแก้ต้อง `npm run db:reset`

| คำสั่ง | ทำอะไร |
| --- | --- |
| `cd backend; npm run stack:up` | เปิดทั้งหมด (DB, phpMyAdmin, 4 services, gateway) |
| `cd backend; npm run stack:down` | ปิดทั้งหมด (ข้อมูลยังอยู่) |
| `cd backend; npm run stack:logs` | ดู log ทุก container |
| `cd backend; npm run db:up` | เปิดเฉพาะ MySQL + phpMyAdmin |
| `cd backend; npm run db:reset` | ลบข้อมูลทั้งหมดแล้วสร้างใหม่จาก SQL |
| `cd backend; npm run db:shell` | เข้า mysql CLI ด้วย root |

ใช้ backend จริงจาก frontend: ตั้ง `VITE_USE_MOCK=false` ใน `frontend/.env`
(ตอนนี้ service ยังเป็นโครง มี endpoint บางส่วน ดู `// TODO` ใน `backend/services/*/src/index.js`)

### Authentication

- สมัครสมาชิกต้องกรอกชื่อ อีเมล เบอร์โทรศัพท์ ที่อยู่ ประเภทธุรกิจ (กรณีเจ้าของพื้นที่) และยืนยันรหัสผ่าน; เลขผู้เสียภาษีเป็นข้อมูลไม่บังคับ
- รหัสผ่านเก็บเป็น bcrypt hash; รหัสผ่านสมัครยาว 8-72 ไบต์
- JWT ใช้ HS256 อายุ 8 ชั่วโมง อยู่ใน `HttpOnly`, `SameSite=Strict` cookie; ใน production เปิด `Secure`
- logout เพิกถอน token โดยเพิ่ม `users.token_version` (จึงออกจากระบบทุกอุปกรณ์); การระงับบัญชีหรือเปลี่ยน role มีผลกับคำขอถัดไป
- จำกัด login สูงสุด 10 ครั้งที่ล้มเหลวต่อ IP ใน 15 นาที และสมัครสมาชิก 5 ครั้งต่อ IP ต่อชั่วโมง
- ยังไม่มีระบบยืนยันอีเมล/รีเซ็ตรหัสผ่าน; บัญชีที่สมัครจะ ACTIVE ทันที
- หากฐานข้อมูลเดิมสร้างก่อนคอลัมน์ `token_version` ให้รัน SQL ใน [backend/database/migrations/001_auth_token_version.sql](./backend/database/migrations/001_auth_token_version.sql) หนึ่งครั้ง

ถ้าพอร์ต 3306 ชนกับ MySQL ที่ลงไว้ในเครื่อง ให้หยุด service เดิม หรือตั้ง `DB_PORT=3307` ใน `backend/.env`

## โครงสร้าง

- `frontend/tailwind.config.js` — Minimalist Brown: cream / beige (=sand) / mocha (=walnut) / espresso + semantic colors
- `frontend/src/layouts` — Public / Auth / Dashboard (Sidebar เปลี่ยนตาม Role จาก `navigation/menus.ts`)
- `frontend/` — React/Vite application, dependencies, build config, `.env`
- `backend/services/` — backend microservices (Express + mysql2): `gateway`, `auth-service`, `space-service`, `booking-service`, `store-service`
- `backend/database/` — schema แยกตาม service และ legacy schema อ้างอิง
- `backend/docker-compose.yml` — orchestration สำหรับ backend และ MySQL
- `docs/` — ER explanation และ Component Tree

ไฟล์ที่ทำเสร็จแล้ว: Layouts ทั้ง 3, Routes + Role guard, Button/Card/Input, StatusBadge, PageHeader, StatCard, Login/Register
ไฟล์อื่น ๆ เป็น stub (`// TODO`) พร้อมให้พัฒนาต่อ
>>>>>>> 6aca8a91bcd6df99dcd651a81e703215097c3458
