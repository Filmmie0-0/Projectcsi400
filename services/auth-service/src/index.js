import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { HttpError, currentUser, errorHandler, requireRole } from './http.js';

const SERVICE = 'auth-service';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const ROLES = ['ADMIN', 'USER', 'TECHNICIAN'];
const app = express();
app.use(express.json());

const USER_COLUMNS = `u.user_id AS userId, u.email, u.role, u.status, u.full_name AS fullName, u.phone,
  u.created_at AS createdAt, t.skills, t.daily_wage AS dailyWage`;

async function findUser(where, params) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN technician_profiles t ON t.user_id = u.user_id WHERE ${where}`,
    params,
  );
  return rows[0];
}

const signToken = (u) =>
  jwt.sign({ sub: u.userId, role: u.role, name: u.fullName }, JWT_SECRET, { expiresIn: '8h' });

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: SERVICE, db: 'ok' });
  } catch (err) {
    res.status(503).json({ service: SERVICE, db: 'down', error: err.message });
  }
});

// ── Public (ผ่าน gateway: /api/auth/*) ──
// สมัครเองได้เฉพาะ USER (ลูกค้า) ส่วนช่าง/แอดมินให้แอดมินสร้าง
app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName, phone } = req.body;
  if (!email || !fullName || !password || password.length < 8) {
    throw new HttpError(422, 'VALIDATION', 'กรอกอีเมล ชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
  }
  const hash = await bcrypt.hash(password, 10);
  const [r] = await pool.query(
    'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
    [email.trim().toLowerCase(), hash, 'USER', fullName.trim(), phone ?? null],
  );
  const user = await findUser('u.user_id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(user), user });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT user_id, password_hash, status FROM users WHERE email = ?', [
    String(email ?? '').trim().toLowerCase(),
  ]);
  const row = rows[0];
  if (!row || !(await bcrypt.compare(String(password ?? ''), row.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (row.status !== 'ACTIVE') throw new HttpError(403, 'SUSPENDED', 'บัญชีนี้ถูกระงับ');
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [row.user_id]);
  const user = await findUser('u.user_id = ?', [row.user_id]);
  res.json({ token: signToken(user), user });
});

app.get('/api/auth/me', async (req, res) => {
  const user = await findUser('u.user_id = ?', [currentUser(req).id]);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  res.json(user);
});

// ── Admin: จัดการผู้ใช้ (/api/users) ──
app.get('/api/users', requireRole('ADMIN'), async (req, res) => {
  const { role } = req.query;
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN technician_profiles t ON t.user_id = u.user_id
     ${role ? 'WHERE u.role = ?' : ''} ORDER BY u.role, u.full_name`,
    role ? [role] : [],
  );
  res.json(rows);
});

app.post('/api/users', requireRole('ADMIN'), async (req, res) => {
  const { email, password, fullName, phone, role, skills, dailyWage } = req.body;
  if (!ROLES.includes(role)) throw new HttpError(422, 'VALIDATION', 'role ไม่ถูกต้อง');
  if (!email || !fullName || !password || password.length < 8) {
    throw new HttpError(422, 'VALIDATION', 'กรอกอีเมล ชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      [email.trim().toLowerCase(), await bcrypt.hash(password, 10), role, fullName.trim(), phone ?? null],
    );
    if (role === 'TECHNICIAN') {
      await conn.query('INSERT INTO technician_profiles (user_id, skills, daily_wage) VALUES (?, ?, ?)', [
        r.insertId, skills ?? null, dailyWage ?? 0,
      ]);
    }
    await conn.commit();
    res.status(201).json(await findUser('u.user_id = ?', [r.insertId]));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

app.patch('/api/users/:id', requireRole('ADMIN'), async (req, res) => {
  const { status, fullName, phone, skills, dailyWage } = req.body;
  const id = Number(req.params.id);
  if (id === currentUser(req).id && status === 'SUSPENDED') throw new HttpError(422, 'VALIDATION', 'ระงับบัญชีตัวเองไม่ได้');
  await pool.query(
    `UPDATE users SET status = COALESCE(?, status), full_name = COALESCE(?, full_name), phone = COALESCE(?, phone)
     WHERE user_id = ?`,
    [status ?? null, fullName ?? null, phone ?? null, id],
  );
  if (skills !== undefined || dailyWage !== undefined) {
    await pool.query(
      `UPDATE technician_profiles SET skills = COALESCE(?, skills), daily_wage = COALESCE(?, daily_wage) WHERE user_id = ?`,
      [skills ?? null, dailyWage ?? null, id],
    );
  }
  const user = await findUser('u.user_id = ?', [id]);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  res.json(user);
});

// ── Internal (เรียกระหว่าง service เท่านั้น gateway ไม่ได้ส่งต่อ /internal) ──
// job-service ใช้ตรวจว่าเป็นช่างจริงก่อนมอบหมายงาน และเก็บ snapshot ชื่อ
app.get('/internal/users/:id', async (req, res) => {
  const user = await findUser('u.user_id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_user_summary');
  res.json(row);
});

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
