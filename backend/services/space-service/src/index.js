import express from 'express';
import { pool } from './db.js';

const SERVICE = 'space-service';
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

// ── Public (ผ่าน gateway: /api/spaces/*, /api/dormitories/*) ──
app.get('/api/spaces', async (req, res) => {
  const { province } = req.query;
  const [rows] = await pool.query(
    `SELECT s.*, d.name AS dormitory_name, d.total_rooms
     FROM spaces s LEFT JOIN dormitories d ON d.dormitory_id = s.dormitory_id
     WHERE s.is_active = 1 AND (? IS NULL OR s.province = ?)
     ORDER BY s.created_at DESC`,
    [province ?? null, province ?? null],
  );
  res.json(rows);
});

app.get('/api/spaces/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM spaces WHERE space_id = ?', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: 'Space not found' });
  const [images] = await pool.query(
    'SELECT * FROM space_images WHERE space_id = ? ORDER BY sort_order',
    [req.params.id],
  );
  res.json({ ...rows[0], images });
});

app.get('/api/dormitories', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM dormitories WHERE is_active = 1 ORDER BY name');
  res.json(rows);
});

// ── Internal ──
// booking-service ใช้ตอนสร้าง booking เพื่อ snapshot owner_id / dormitory_id / ราคา
app.get('/internal/spaces/:id', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT space_id, owner_id, dormitory_id, name, price_per_month, deposit_amount,
            availability_status, is_active
     FROM spaces WHERE space_id = ?`,
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Space not found' });
  res.json(rows[0]);
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_space_summary');
  res.json(row);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT ?? 4002);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
