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

## ฐานข้อมูล

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p < database/migrations/002_dormitory_wholesale.sql   # หอพัก, ร้านค้า, ราคาส่ง, Open API
```

## โครงสร้าง

- `tailwind.config.js` — Minimalist Brown: cream / beige (=sand) / mocha (=walnut) / espresso + semantic colors
- `src/layouts` — Public / Auth / Dashboard (Sidebar เปลี่ยนตาม Role จาก `navigation/menus.ts`)
- `src/routes` — React Router + lazy loading + `ProtectedRoute` + `RoleRoute`
- `src/pages` — แยกโฟลเดอร์ตาม Role: `public`, `auth`, `admin`, `owner`, `tenant` (+ `tenant/inventory`)
- `src/components` — `ui/` (design system), `common/`, `features/` (space, booking, inventory, dashboard, store, sandbox)
- `src/services` — API calls แยกตาม domain (`storeService`, `dormApiService` = Open API client, `spaceService`) + `mock/`
- `src/hooks` — React Query hooks (`useStore`, `useSpaces`) และ `useLiveSync` (refetch เมื่อข้อมูล mock เปลี่ยน)
- `src/types` — TypeScript types ตรงกับ DB schema
- `docs/` — ER explanation และ Component Tree

ไฟล์ที่ทำเสร็จแล้ว: Layouts ทั้ง 3, Routes + Role guard, Button/Card/Input, StatusBadge, PageHeader, StatCard, Login (demo)
ไฟล์อื่น ๆ เป็น stub (`// TODO`) พร้อมให้พัฒนาต่อ
