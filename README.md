# MicroFulfill — Micro-Fulfillment Space Matching & Basic WMS

Frontend: React 18 + TypeScript + Vite + Tailwind CSS (ธีม Minimalist Brown)
Database: MySQL 8.0.16+

## เริ่มต้นใช้งาน

```bash
npm install
npm run dev        # http://localhost:5173
```

หน้า `/login` เป็นโหมดทดลอง กดเลือกบทบาท (ผู้เช่า / เจ้าของพื้นที่ / แอดมิน) เพื่อดู Layout และเมนูของแต่ละ Role

## ฐานข้อมูล

```bash
mysql -u root -p < database/schema.sql
```

## โครงสร้าง

- `tailwind.config.js` — Custom palette (cream / walnut / sand / espresso + semantic colors)
- `src/layouts` — Public / Auth / Dashboard (Sidebar เปลี่ยนตาม Role จาก `navigation/menus.ts`)
- `src/routes` — React Router + lazy loading + `ProtectedRoute` + `RoleRoute`
- `src/pages` — แยกโฟลเดอร์ตาม Role: `public`, `auth`, `admin`, `owner`, `tenant` (+ `tenant/inventory`)
- `src/components` — `ui/` (design system), `common/`, `features/` (space, booking, inventory, dashboard)
- `src/types` — TypeScript types ตรงกับ DB schema
- `docs/` — ER explanation และ Component Tree

ไฟล์ที่ทำเสร็จแล้ว: Layouts ทั้ง 3, Routes + Role guard, Button/Card/Input, StatusBadge, PageHeader, StatCard, Login (demo)
ไฟล์อื่น ๆ เป็น stub (`// TODO`) พร้อมให้พัฒนาต่อ
