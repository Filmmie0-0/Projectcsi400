# RenoCare — ตรวจสอบห้องเช่า & รีโนเวทพื้นที่ (Partner Web Service)

รับงานต่อจากระบบจองห้องพัก (พาร์ทเนอร์) หรือจากเจ้าของตึกโดยตรง → ประเมินหน้างาน → ทำสัญญา (รายวัน/รายเดือน + สัญญาเพิ่มเติม)
→ เบิกวัสดุ → บันทึกงาน → ส่งมอบ พร้อมแจ้งสถานะกลับระบบพาร์ทเนอร์ด้วย webhook

- `frontend/` — React 18 + TypeScript + Vite + Tailwind (ธีม Minimalist Brown)
- `backend/` — Node.js (Express) microservices + MySQL 8 (database-per-service) บน Docker
- เอกสารออกแบบระบบ / Partner API spec / ความปลอดภัย / แบ่งงาน dev 2 คน: [docs/system-design.md](docs/system-design.md)

## เริ่มต้นใช้งาน

ต้องมี Docker Desktop และ Node.js 20+

```powershell
# 1) Backend: DB + phpMyAdmin + 3 services + gateway
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run stack:up

# 2) Frontend (อีกหน้าต่าง)
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run dev        # http://localhost:5173
```

`backend/.env.example` มี `AUTH_JWT_SECRET` สำหรับเครื่อง dev — ใช้จริงให้สร้างใหม่
(`node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`), ตั้ง `CORS_ORIGIN` ให้ตรงกับ origin ของ frontend
(ใส่ได้หลายค่าคั่นด้วย `,` เช่น `http://localhost:5173,http://localhost:5180` — แก้แล้วต้อง `npm run stack:up` ใหม่)
และบน production ใช้ HTTPS + `NODE_ENV=production` เพื่อเปิด Secure cookie

### บัญชีทดสอบ

| Email | Password | Role |
| --- | --- | --- |
| admin@renocare.local | password123 | ADMIN |
| owner@renocare.local | password123 | USER (เจ้าของหอ) |
| partner@dormbook.local | password123 | USER (บัญชีตัวแทนระบบจอง DormBook) |
| tech1@renocare.local | password123 | TECHNICIAN (ช่างเอก — ก่อ ฉาบ ปูกระเบื้อง ทาสี) |
| tech2@renocare.local | password123 | TECHNICIAN (ช่างบี — ไฟฟ้า ประปา แอร์) |

Partner API key เดโม: `dbk_live_demo_7f3a9c2e1b` — ลองได้ที่หน้า `/sandbox` (จำลองระบบจองห้องพักของเพื่อน รับ webhook จริง)

## สถาปัตยกรรม

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

- ห้าม JOIN ข้าม database: ข้าม service เก็บ id + snapshot แล้วเรียกกันผ่าน `/internal/*` (gateway ไม่ส่งต่อ)
- `/api/admin/summary` รวมตัวเลขจาก 3 service ที่ gateway

### Authentication

- JWT (HS256, 8 ชม.) อยู่ใน `HttpOnly`, `SameSite=Strict` cookie; production เปิด `Secure`
- เปิดใช้งานหลายแท็บในเบราว์เซอร์เดียวกันได้ โดยสถานะเข้าสู่ระบบและออกจากระบบจะซิงก์ข้ามแท็บ
- gateway ตรวจ token กับ auth-service ทุก request (ลายเซ็น + บัญชี ACTIVE + `token_version`) แล้วส่ง `X-User-Id / X-User-Role / X-User-Name` ให้ service — header ที่ client ส่งมาเองถูกลบทิ้ง
- logout หรือแอดมินระงับบัญชี → เพิ่ม `users.token_version` → token เดิมใช้ไม่ได้ทันที
- request ที่เปลี่ยนข้อมูลจากเบราว์เซอร์ต้องมี Origin ตรงกับ `CORS_ORIGIN` (กัน CSRF)
- จำกัด login ล้มเหลว 10 ครั้ง/IP/15 นาที, สมัครสมาชิก 5 ครั้ง/IP/ชั่วโมง; รหัสผ่าน bcrypt ยาว 8-72 ไบต์
- สมัครเองได้เฉพาะลูกค้า (USER); ช่างและแอดมินสร้างโดยแอดมินในหน้า "ผู้ใช้ & ช่าง"
- `/api/partner/v1/*` ใช้ `X-API-Key` (เก็บแค่ SHA-256 ใน DB) แทน cookie
- ยังไม่มีระบบยืนยันอีเมล/รีเซ็ตรหัสผ่าน

## คำสั่ง backend (`cd backend`)

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run stack:up` | เปิดทั้งหมด |
| `npm run stack:down` | ปิด (ข้อมูลยังอยู่) |
| `npm run stack:logs` | ดู log |
| `npm run db:up` | เปิดเฉพาะ MySQL + phpMyAdmin |
| `npm run db:reset` | ลบข้อมูลแล้วสร้างใหม่จาก SQL (ต้องทำทุกครั้งที่แก้ไฟล์ใน `backend/database/services/`) |
| `npm run db:shell` | mysql CLI (root) |

- phpMyAdmin — http://localhost:8081 · Health — http://localhost:3000/health
- compose ใช้ชื่อ project `renocare` จึงได้ volume ใหม่ `renocare_mysql_data`; volume ของระบบเดิม (`projectcsi400_mysql_data`) ไม่ได้ใช้แล้ว ลบได้ด้วย `docker volume rm projectcsi400_mysql_data`
- พอร์ต 3306 ชนกับ MySQL ในเครื่อง → ตั้ง `DB_PORT=3307` ใน `backend/.env`

## เอาไปเปิดเครื่องอื่นด้วยแฟลชไดร์ฟ (Docker + ข้อมูลจริง)

ใช้เปิดทั้งระบบบนเครื่อง Windows อื่นที่มี Docker Desktop โดยใช้ข้อมูลชุดเดียวกับเครื่องนี้ ข้อมูลที่แก้ในเครื่องนั้นจะบันทึกกลับลงแฟลชไดร์ฟ

### 1. ที่เครื่องนี้: ลงแฟลชไดร์ฟ

```bash
cd backend && npm run stack:up     # Docker ต้องรันอยู่ (ใช้ดึงข้อมูลจริง)
cd .. && node portable/build-docker.mjs
```

แล้วคัดลอกโฟลเดอร์ `portable/dist/RenoCare-Docker` **ทั้งโฟลเดอร์**ลงแฟลชไดร์ฟ (ประมาณ 3 MB ในนั้นมีโค้ด หน้าเว็บที่ build แล้ว และข้อมูลจริงใน `data/*.sql`)

### 2. ที่เครื่องอื่น: เปิดใช้

ครั้งแรกในเครื่องนั้น: ติดตั้ง **Docker Desktop** และต่ออินเทอร์เน็ต (Docker ต้องโหลด image mysql/node)

1. เปิด Docker Desktop รอจนขึ้น **Engine running**
2. ดับเบิลคลิก **`START-RenoCare.bat`** ในแฟลชไดร์ฟ ระบบจะสร้าง container แล้วนำข้อมูลจากแฟลชไดร์ฟเข้า Docker
   (ครั้งแรกใช้เวลาหลายนาที ถ้า Windows เตือน กด More info → Run anyway)
3. เบราว์เซอร์เปิด **http://localhost:3090** ให้เอง แล้ว login ด้วยบัญชีทดสอบด้านบน

### 3. ใช้เสร็จ: ก่อนถอดแฟลชไดร์ฟ

ดับเบิลคลิก **`STOP-RenoCare.bat`** แล้วรอจนขึ้น "ปิดเรียบร้อย ถอดแฟลชไดร์ฟได้" ขั้นนี้บันทึกข้อมูลกลับลงแฟลชไดร์ฟแล้วปิด container
**ถ้าไม่กด STOP สิ่งที่ทำในเครื่องนั้นจะไม่ติดมากับแฟลชไดร์ฟ** (`SAVE-data.bat` ใช้บันทึกระหว่างใช้งานโดยไม่ปิดระบบ)

ใช้หลายเครื่อง: เครื่อง A START → ใช้ → **STOP** → ถอด → เครื่อง B START → ใช้ → **STOP**

### ข้อควรรู้

- `data/STAMP.txt` คือรหัสชุดข้อมูล START จะนำข้อมูลจากแฟลชไดร์ฟเข้า Docker เฉพาะเมื่อรหัสไม่ตรงกับที่อยู่ในเครื่อง เปิดซ้ำในเครื่องเดิมจึงไม่ทับข้อมูลในเครื่อง
- แยกจากชุดพัฒนา: container ชื่อ `renocare_usb_*` พอร์ต 3090 (เว็บ) / 3316 (MySQL) / 8091 (phpMyAdmin, root/root) เปิดพร้อม `npm run stack:up` ได้ ข้อมูลไม่ทับกัน
- ข้อมูลบนแฟลชไดร์ฟไม่ไหลกลับเข้าชุดพัฒนา (พอร์ต 3000) เอง และการ build ใหม่ด้วย `build-docker.mjs` จะ**ทับ**ข้อมูลในแฟลชไดร์ฟด้วยข้อมูลของเครื่องนี้
- ต้องเข้าเว็บที่ `http://localhost:3090` เท่านั้น (`127.0.0.1` จะ login ไม่ได้ เพราะ CORS/CSRF ผูกกับ origin นี้)
- `port is already allocated` = มีโปรแกรมอื่นใช้พอร์ต 3090/3316/8091 อยู่
- ล้างทุกอย่างของชุดนี้ในเครื่องนั้น: `docker compose -p renocare_usb down -v` (ข้อมูลในแฟลชไดร์ฟยังอยู่)
- สคริปต์ต้นฉบับอยู่ที่ `portable/docker/` (START/SAVE/STOP, `usb.sh` สำหรับ dump/restore ใน container, `docker-compose.usb.yml`)

## โครงสร้าง

- `backend/database/services/` — schema + ข้อมูลเดโมแยกตาม service (`01_auth_db`, `02_job_db`, `03_inventory_db`)
- `backend/services/` — `gateway`, `auth-service`, `job-service`, `inventory-service`
- `frontend/src/pages` — `public` (landing, partner sandbox), `auth`, `admin`, `user`, `technician` และหน้าที่ใช้ร่วมกันหลาย role: `jobs`, `billing`, `inventory`
- `frontend/src/components` — `ui/` (design system), `common/`, `features/job`, `features/inventory`
- `frontend/src/services` — API client แยกตาม service (`authService`, `jobService`, `inventoryService`, `partnerService`)
- `frontend/src/hooks` — React Query hooks แยกตาม service
- `frontend/src/types` — ตรงกับ schema ใน `backend/database/services/`
- `frontend/src/constants/labels.ts` — ชื่อสถานะ/สีภาษาไทย และกติกาแนะนำรายวัน/รายเดือน
