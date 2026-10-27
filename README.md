# RenoCare — ตรวจสอบห้องเช่า & รีโนเวทพื้นที่ (Partner Web Service)

รับงานต่อจากระบบจองห้องพัก (พาร์ทเนอร์) หรือจากเจ้าของตึกโดยตรง → ประเมินหน้างาน → ทำสัญญา (รายวัน/รายเดือน + สัญญาเพิ่มเติม)
→ เบิกวัสดุ → บันทึกงาน → ส่งมอบ พร้อมแจ้งสถานะกลับระบบพาร์ทเนอร์ด้วย webhook

- Frontend: React 18 + TypeScript + Vite + Tailwind (ธีม Minimalist Brown เดิม)
- Backend: Node.js (Express) microservices + MySQL 8 (database-per-service) บน Docker
- เอกสารออกแบบระบบ / Partner API spec / แบ่งงาน dev 2 คน: [docs/system-design.md](docs/system-design.md)

## เริ่มต้นใช้งาน

ต้องมี Docker Desktop

```bash
cp .env.example .env   # ไม่บังคับ มีค่าเริ่มต้น
npm install
npm run stack:up       # DB + phpMyAdmin + 3 services + gateway
npm run dev            # http://localhost:5173
```

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
