# MicroFulfill — Micro-Fulfillment Space Matching & Basic WMS

Frontend: React 18 + TypeScript + Vite + Tailwind CSS (ธีม Minimalist Brown)
Database: MySQL 8.0.16+

## เริ่มต้นใช้งาน

```bash
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }   # PowerShell
npm install
npm run dev        # http://localhost:5173
```

หน้าใหม่:
- `/spaces` — ค้นหาพื้นที่ใต้หอพัก (ชื่อหอ, จำนวนห้องพัก, ขนาด, ค่าเช่า)
- `/tenant/store` — Store & Inventory Builder: ตั้งชื่อร้าน/โลโก้/เปิด-ปิด, หมวดหมู่, ราคาปลีก-ส่งขั้นบันได, ปรับสต็อก, Quick Preset
- `/sandbox` — API Sandbox: จำลองแอปหอพักสั่งของผ่าน Open API (X-API-Key) แล้วเห็นสต็อกลดทันที + log request/response

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

ก่อนเปิดระบบ ให้กำหนด `AUTH_JWT_SECRET` ใน `backend/.env` เป็นค่าสุ่มอย่างน้อย 32 ไบต์
(สร้างได้ด้วย `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
กำหนด `CORS_ORIGIN` ใน `backend/.env` ให้ตรงกับ origin ของ frontend ทุกตัวอักษร
และบน production ให้ใช้ HTTPS พร้อมตั้ง `NODE_ENV=production` เพื่อเปิด Secure cookie.

```
frontend :5173 ──> gateway :3000 ──┬─> auth-service    :4001 ──> auth_db
                                   ├─> space-service   :4002 ──> space_db
                                   ├─> booking-service :4003 ──> booking_db
                                   └─> store-service   :4004 ──> store_db
                                         (MySQL 8.0 ตัวเดียว :3306, 1 database + 1 user ต่อ service)
```

| Service | Path ที่ gateway ส่งต่อ | Database / ตาราง |
| --- | --- | --- |
| auth-service | `/api/auth` | `auth_db`: users, user_profiles |
| space-service | `/api/spaces`, `/api/dormitories` | `space_db`: dormitories, spaces, space_images |
| booking-service | `/api/booking(s)`, `/api/payments` | `booking_db`: bookings, payments, booking_status_logs |
| store-service | `/api/tenant`, `/api/inventory`, `/api/product`, `/api/open` | `store_db`: stores, product_categories, products, product_price_tiers, inventory_*, api_keys, external_orders, external_order_items |

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
