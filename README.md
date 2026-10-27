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
และบน production ใช้ HTTPS + `NODE_ENV=production` เพื่อเปิด Secure cookie

บัญชีเดโม (รหัสผ่าน `password123`, มีปุ่มลัดในหน้า login)

| บัญชี | Role |
| --- | --- |
| admin@renocare.local | ADMIN |
| owner@renocare.local | USER (เจ้าของหอ) |
| partner@dormbook.local | USER (บัญชีตัวแทนระบบจอง DormBook) |
| tech1@renocare.local, tech2@renocare.local | TECHNICIAN |

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

## โครงสร้าง

- `backend/database/services/` — schema + ข้อมูลเดโมแยกตาม service (`01_auth_db`, `02_job_db`, `03_inventory_db`)
- `backend/services/` — `gateway`, `auth-service`, `job-service`, `inventory-service`
- `frontend/src/pages` — `public` (landing, partner sandbox), `auth`, `admin`, `user`, `technician` และหน้าที่ใช้ร่วมกันหลาย role: `jobs`, `billing`, `inventory`
- `frontend/src/components` — `ui/` (design system), `common/`, `features/job`, `features/inventory`
- `frontend/src/services` — API client แยกตาม service (`authService`, `jobService`, `inventoryService`, `partnerService`)
- `frontend/src/hooks` — React Query hooks แยกตาม service
- `frontend/src/types` — ตรงกับ schema ใน `backend/database/services/`
- `frontend/src/constants/labels.ts` — ชื่อสถานะ/สีภาษาไทย และกติกาแนะนำรายวัน/รายเดือน
