# MicroFulfill — Micro-Fulfillment Space Matching & Basic WMS

Frontend: React 18 + TypeScript + Vite + Tailwind CSS (ธีม Minimalist Brown)
Database: MySQL 8.0.16+

## เริ่มต้นใช้งาน

```bash
npm install
npm run dev        # http://localhost:5173
```

หน้าใหม่:
- `/spaces` — ค้นหาพื้นที่ใต้หอพัก (ชื่อหอ, จำนวนห้องพัก, ขนาด, ค่าเช่า)
- `/tenant/store` — Store & Inventory Builder: ตั้งชื่อร้าน/โลโก้/เปิด-ปิด, หมวดหมู่, ราคาปลีก-ส่งขั้นบันได, ปรับสต็อก, Quick Preset
- `/sandbox` — API Sandbox: จำลองแอปหอพักสั่งของผ่าน Open API (X-API-Key) แล้วเห็นสต็อกลดทันที + log request/response

ยังไม่มี backend จึงใช้ mock Web Service ในเบราว์เซอร์ (`src/services/mock/mockDb.ts`, กติกาเดียวกับ trigger ใน DB)
ข้อมูลเก็บใน localStorage และ sync ข้ามแท็บ — ตั้ง `VITE_USE_MOCK=false` ใน `.env` เมื่อมี backend จริง

หน้า `/login` เป็นโหมดทดลอง กดเลือกบทบาท (ผู้เช่า / เจ้าของพื้นที่ / แอดมิน) เพื่อดู Layout และเมนูของแต่ละ Role

## Backend + ฐานข้อมูล (Docker, Microservices)

ต้องติดตั้ง Docker Desktop ก่อน ไม่ต้องลง MySQL หรือ Node backend ในเครื่อง

```bash
cp .env.example .env   # ปรับรหัสผ่าน/พอร์ตได้ที่นี่ (ไม่บังคับ มีค่าเริ่มต้น)
npm run stack:up       # = docker compose up -d --build
```

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
- สิ่งที่เปลี่ยนจาก schema เดิม (`database/legacy/`):
  - `bookings` เพิ่ม snapshot `space_owner_id`, `dormitory_id` จาก space-service ตอนสร้าง booking
  - `trg_store_before_insert` ย้ายไปเป็นโค้ดใน `POST /api/tenant/stores` (store-service ถาม booking-service)
  - `v_admin_summary` แยกเป็น view ย่อยในแต่ละ DB แล้วรวมที่ gateway: `GET /api/admin/summary`
  - trigger สต็อก/ออเดอร์/ราคาส่งอยู่ใน `store_db` ทั้งหมด จึงทำงานเหมือนเดิม

เครื่องมือ
- phpMyAdmin — http://localhost:8081 (`root` / `root` หรือ user ของ service เช่น `store_svc` / `store_pass`)
- Health check — http://localhost:3000/health
- ข้อมูลเก็บใน Docker volume `mysql_data` ไม่หายเมื่อ `stack:down`
- SQL ใน `database/services/` รันอัตโนมัติเฉพาะตอนสร้าง DB ครั้งแรก ถ้าแก้ต้อง `npm run db:reset`

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run stack:up` | เปิดทั้งหมด (DB, phpMyAdmin, 4 services, gateway) |
| `npm run stack:down` | ปิดทั้งหมด (ข้อมูลยังอยู่) |
| `npm run stack:logs` | ดู log ทุก container |
| `npm run db:up` | เปิดเฉพาะ MySQL + phpMyAdmin |
| `npm run db:reset` | ลบข้อมูลทั้งหมดแล้วสร้างใหม่จาก SQL |
| `npm run db:shell` | เข้า mysql CLI ด้วย root |

ใช้ backend จริงจาก frontend: ตั้ง `VITE_USE_MOCK=false` ใน `.env` (ตอนนี้ service ยังเป็นโครง มี endpoint บางส่วน ดู `// TODO` ใน `services/*/src/index.js`)

ถ้าพอร์ต 3306 ชนกับ MySQL ที่ลงไว้ในเครื่อง ให้หยุด service เดิม หรือตั้ง `DB_PORT=3307` ใน `.env`

## โครงสร้าง

- `tailwind.config.js` — Minimalist Brown: cream / beige (=sand) / mocha (=walnut) / espresso + semantic colors
- `src/layouts` — Public / Auth / Dashboard (Sidebar เปลี่ยนตาม Role จาก `navigation/menus.ts`)
- `src/routes` — React Router + lazy loading + `ProtectedRoute` + `RoleRoute`
- `src/pages` — แยกโฟลเดอร์ตาม Role: `public`, `auth`, `admin`, `owner`, `tenant` (+ `tenant/inventory`)
- `src/components` — `ui/` (design system), `common/`, `features/` (space, booking, inventory, dashboard, store, sandbox)
- `src/services` — API calls แยกตาม domain (`storeService`, `dormApiService` = Open API client, `spaceService`) + `mock/`
- `src/hooks` — React Query hooks (`useStore`, `useSpaces`) และ `useLiveSync` (refetch เมื่อข้อมูล mock เปลี่ยน)
- `src/types` — TypeScript types ตรงกับ DB schema
- `services/` — backend microservices (Express + mysql2): `gateway`, `auth-service`, `space-service`, `booking-service`, `store-service`
- `database/services/` — schema แยกตาม service, `database/legacy/` — schema แบบรวม DB เดียวเดิม (อ้างอิงเท่านั้น)
- `docs/` — ER explanation และ Component Tree

ไฟล์ที่ทำเสร็จแล้ว: Layouts ทั้ง 3, Routes + Role guard, Button/Card/Input, StatusBadge, PageHeader, StatCard, Login (demo)
ไฟล์อื่น ๆ เป็น stub (`// TODO`) พร้อมให้พัฒนาต่อ
