import express from 'express';
import { pool } from './db.js';

const SERVICE = 'auth-service';
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

// ── Public (ผ่าน gateway: /api/auth/*) ──
app.get('/api/auth/ping', (_req, res) => res.json({ service: SERVICE, ok: true }));

// TODO: POST /api/auth/register, POST /api/auth/login (ออก JWT)

// ── Internal (เรียกระหว่าง service เท่านั้น gateway ไม่ได้ส่งต่อ /internal) ──
app.get('/internal/users/:id', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.user_id, u.email, u.role, u.status, p.full_name
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE u.user_id = ?`,
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
  res.json(rows[0]);
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_user_summary');
  res.json(row);
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message });
});

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
