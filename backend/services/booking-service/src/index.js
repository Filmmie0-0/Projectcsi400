import express from 'express';
import { pool } from './db.js';

const SERVICE = 'booking-service';
const SPACE_SERVICE_URL = process.env.SPACE_SERVICE_URL ?? 'http://localhost:4002';
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

// ── Public (ผ่าน gateway: /api/booking/*, /api/bookings/*) ──
app.get('/api/booking/ping', (_req, res) => res.json({ service: SERVICE, ok: true }));

app.post('/api/bookings', async (req, res) => {
  const tenantId = req.get('x-auth-user-id');
  if (req.get('x-auth-role') !== 'TENANT' || !tenantId) {
    return res.status(403).json({ message: 'เฉพาะผู้เช่าที่เข้าสู่ระบบเท่านั้นที่จองพื้นที่ได้' });
  }
  const { space_id, start_date, end_date, note } = req.body;
  const startTime = Date.parse(start_date);
  const endTime = Date.parse(end_date);
  if (
    !space_id ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return res.status(400).json({ message: 'ข้อมูลการจองไม่ถูกต้อง' });
  }

  // spaces อยู่ใน space_db จึงขอข้อมูลผ่าน space-service แล้วเก็บ snapshot ไว้ใน booking
  const r = await fetch(`${SPACE_SERVICE_URL}/internal/spaces/${space_id}`);
  if (r.status === 404) return res.status(422).json({ message: 'Space not found' });
  if (!r.ok) return res.status(502).json({ message: 'space-service unavailable' });
  const space = await r.json();
  if (!space.is_active || space.availability_status !== 'AVAILABLE') {
    return res.status(422).json({ message: 'Space is not available' });
  }

  const months = Math.max(1, Math.ceil((endTime - startTime) / (30 * 86400000)));
  const total = space.price_per_month * months + space.deposit_amount;
  const code = `BK${Date.now().toString(36).toUpperCase()}`;

  const [result] = await pool.query(
    `INSERT INTO bookings
       (booking_code, space_id, space_owner_id, dormitory_id, tenant_id, start_date, end_date,
        price_per_month_snapshot, deposit_snapshot, total_amount, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, space_id, space.owner_id, space.dormitory_id, tenantId, start_date, end_date,
     space.price_per_month, space.deposit_amount, total, note ?? null],
  );
  res.status(201).json({ booking_id: result.insertId, booking_code: code, total_amount: total });
});

app.get('/api/bookings/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bookings WHERE booking_id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: 'Booking not found' });
  const booking = rows[0];
  const userId = req.get('x-auth-user-id');
  const role = req.get('x-auth-role');
  if (
    role !== 'ADMIN' &&
    !(role === 'TENANT' && String(booking.tenant_id) === userId) &&
    !(role === 'OWNER' && String(booking.space_owner_id) === userId)
  ) {
    return res.status(403).json({ message: 'ไม่มีสิทธิ์ดูข้อมูลการจองนี้' });
  }
  return res.json(booking);
});

// ── Internal ──
// store-service ใช้ตรวจก่อนเปิดร้าน (แทน trg_store_before_insert เดิม)
app.get('/internal/bookings/:id', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT booking_id, tenant_id, space_id, dormitory_id, status FROM bookings WHERE booking_id = ?',
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Booking not found' });
  res.json(rows[0]);
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_booking_summary');
  res.json(row);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT ?? 4003);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
