import express from 'express';
import { pool } from './db.js';

const SERVICE = 'store-service';
const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:4003';
const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: SERVICE, db: 'ok' });
  } catch (err) {
    res.status(503).json({ service: SERVICE, db: 'down', error: err.message });
  }
});

// ── Public (ผ่าน gateway: /api/tenant/*, /api/inventory/*, /api/product/*, /api/open/*) ──
app.get('/api/inventory/ping', (_req, res) => res.json({ service: SERVICE, ok: true }));
app.get('/api/product/ping', (_req, res) => res.json({ service: SERVICE, ok: true }));

// เปิดร้านจาก booking ที่อนุมัติแล้ว — แทน trg_store_before_insert เดิม
// (bookings/spaces อยู่คนละ database จึงตรวจผ่าน booking-service)
// TODO: ดึง tenant_id จาก JWT แทน body เมื่อ auth-service ออก token ได้แล้ว
app.post('/api/tenant/stores', async (req, res) => {
  const { tenant_id, booking_id, name, phone, description } = req.body;

  const r = await fetch(`${BOOKING_SERVICE_URL}/internal/bookings/${booking_id}`);
  if (r.status === 404) return res.status(422).json({ message: 'Booking not found' });
  if (!r.ok) return res.status(502).json({ message: 'booking-service unavailable' });
  const booking = await r.json();

  if (booking.tenant_id !== Number(tenant_id)) {
    return res.status(422).json({ message: 'Booking does not belong to this tenant' });
  }
  if (booking.status !== 'APPROVED') {
    return res.status(422).json({ message: 'Booking must be APPROVED before creating a store' });
  }
  if (booking.dormitory_id == null) {
    return res.status(422).json({ message: 'Space is not linked to a dormitory' });
  }

  const [result] = await pool.query(
    `INSERT INTO stores (tenant_id, booking_id, dormitory_id, name, phone, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenant_id, booking_id, booking.dormitory_id, name, phone ?? null, description ?? null],
  );
  res.status(201).json({ store_id: result.insertId });
});

app.get('/api/tenant/low-stock', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM v_tenant_low_stock WHERE tenant_id = ?', [
    req.query.tenant_id,
  ]);
  res.json(rows);
});

// TODO: /api/tenant/store/* (หมวดหมู่, สินค้า, ปรับสต็อก) และ Open API /api/open/v1/* (X-API-Key)

// MySQL SIGNAL จาก trigger (SQLSTATE 45000) = ผิดกติกาธุรกิจ → 422
app.use((err, _req, res, _next) => {
  if (err.sqlState === '45000') return res.status(422).json({ message: err.sqlMessage });
  console.error(err);
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT ?? 4004);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
