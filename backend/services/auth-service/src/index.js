import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { HttpError, currentUser, errorHandler, requireRole } from './http.js';

const SERVICE = 'auth-service';
const ROLES = ['ADMIN', 'USER', 'TECHNICIAN'];
const app = express();
app.use(express.json({ limit: '10kb' }));

// JWT (HS256, 8 ชม.) อยู่ใน HttpOnly cookie; token_version ใน DB ทำให้ logout/ระงับบัญชีแล้ว token เก่าใช้ไม่ได้ทันที
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const TOKEN_ISSUER = 'renocare-auth';
const TOKEN_AUDIENCE = 'renocare-api';
const COOKIE_NAME = 'renocare_access_token';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+() -]{8,20}$/;

function jwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new HttpError(503, 'AUTH_NOT_CONFIGURED', 'ยังไม่ได้ตั้งค่า AUTH_JWT_SECRET (อย่างน้อย 32 ไบต์)');
  }
  return secret;
}

const cookieOptions = {
  httpOnly: true,
  path: '/api',
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
};

function issueSession(res, row) {
  const token = jwt.sign({ sub: String(row.userId), role: row.role, ver: row.tokenVersion ?? 0 }, jwtSecret(), {
    algorithm: 'HS256',
    audience: TOKEN_AUDIENCE,
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: TOKEN_ISSUER,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: TOKEN_TTL_SECONDS * 1000 });
  const { tokenVersion, ...user } = row;
  return { user, expiresIn: TOKEN_TTL_SECONDS };
}

function verifyToken(token) {
  try {
    const claims = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'], audience: TOKEN_AUDIENCE, issuer: TOKEN_ISSUER });
    if (typeof claims === 'string' || !/^[1-9]\d*$/.test(claims.sub) || !Number.isSafeInteger(claims.ver) || !ROLES.includes(claims.role)) {
      return null;
    }
    return claims;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return null;
  }
}

const readCookie = (req) => req.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))?.[1];

const USER_COLUMNS = `u.user_id AS userId, u.email, u.role, u.status, u.full_name AS fullName, u.phone,
  u.created_at AS createdAt, u.token_version AS tokenVersion, t.skills, t.daily_wage AS dailyWage`;

async function findUser(where, params) {
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN technician_profiles t ON t.user_id = u.user_id WHERE ${where}`,
    params,
  );
  return rows[0];
}

const publicUser = (u) => {
  if (!u) return u;
  const { tokenVersion, ...rest } = u;
  return rest;
};

function validateNewUser({ email, password, fullName, phone }) {
  if (
    typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 150 ||
    typeof email !== 'string' || email.length > 255 || !EMAIL_RE.test(email.trim()) ||
    (phone && (typeof phone !== 'string' || !PHONE_RE.test(phone.trim()))) ||
    typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new HttpError(422, 'VALIDATION', 'กรุณากรอกข้อมูลให้ถูกต้อง (รหัสผ่าน 8-72 ไบต์)');
  }
}

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
  const body = req.body ?? {};
  validateNewUser(body);
  jwtSecret();
  const [r] = await pool.query(
    'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
    [body.email.trim().toLowerCase(), await bcrypt.hash(body.password, 12), 'USER', body.fullName.trim(), body.phone?.trim() || null],
  );
  res.status(201).json(issueSession(res, await findUser('u.user_id = ?', [r.insertId])));
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || email.length > 255 || typeof password !== 'string' || !password ||
      Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(422, 'VALIDATION', 'กรุณากรอกอีเมลและรหัสผ่าน');
  }
  jwtSecret();
  const [rows] = await pool.query('SELECT user_id, password_hash, status FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  const row = rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (row.status !== 'ACTIVE') throw new HttpError(403, 'SUSPENDED', 'บัญชีนี้ถูกระงับ');
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [row.user_id]);
  res.json(issueSession(res, await findUser('u.user_id = ?', [row.user_id])));
});

// เพิ่ม token_version → token นี้ (และทุก token ของผู้ใช้) ใช้ไม่ได้อีก
app.post('/api/auth/logout', async (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  const token = readCookie(req) ?? req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const claims = token && verifyToken(token);
  if (claims) {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE user_id = ? AND token_version = ?', [claims.sub, claims.ver]);
  }
  res.sendStatus(204);
});

app.get('/api/auth/me', async (req, res) => {
  const user = await findUser('u.user_id = ?', [currentUser(req).id]);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  res.json(publicUser(user));
});

// ── Admin: จัดการผู้ใช้ (/api/users) ──
app.get('/api/users', requireRole('ADMIN'), async (req, res) => {
  const { role } = req.query;
  const [rows] = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users u LEFT JOIN technician_profiles t ON t.user_id = u.user_id
     ${role ? 'WHERE u.role = ?' : ''} ORDER BY u.role, u.full_name`,
    role ? [role] : [],
  );
  res.json(rows.map(publicUser));
});

app.post('/api/users', requireRole('ADMIN'), async (req, res) => {
  const body = req.body ?? {};
  if (!ROLES.includes(body.role)) throw new HttpError(422, 'VALIDATION', 'role ไม่ถูกต้อง');
  validateNewUser(body);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)',
      [body.email.trim().toLowerCase(), await bcrypt.hash(body.password, 12), body.role, body.fullName.trim(), body.phone?.trim() || null],
    );
    if (body.role === 'TECHNICIAN') {
      await conn.query('INSERT INTO technician_profiles (user_id, skills, daily_wage) VALUES (?, ?, ?)', [
        r.insertId, body.skills ?? null, body.dailyWage ?? 0,
      ]);
    }
    await conn.commit();
    res.status(201).json(publicUser(await findUser('u.user_id = ?', [r.insertId])));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ระงับบัญชี = เพิ่ม token_version ด้วย จึงถูกเตะออกจากระบบทันที
app.patch('/api/users/:id', requireRole('ADMIN'), async (req, res) => {
  const { status, fullName, phone, skills, dailyWage } = req.body ?? {};
  const id = Number(req.params.id);
  if (status !== undefined && !['ACTIVE', 'SUSPENDED'].includes(status)) throw new HttpError(422, 'VALIDATION', 'สถานะไม่ถูกต้อง');
  if (id === currentUser(req).id && status === 'SUSPENDED') throw new HttpError(422, 'VALIDATION', 'ระงับบัญชีตัวเองไม่ได้');
  await pool.query(
    `UPDATE users SET status = COALESCE(?, status), full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
       token_version = token_version + IF(? = 'SUSPENDED', 1, 0)
     WHERE user_id = ?`,
    [status ?? null, fullName ?? null, phone ?? null, status ?? null, id],
  );
  if (skills !== undefined || dailyWage !== undefined) {
    await pool.query(
      `UPDATE technician_profiles SET skills = COALESCE(?, skills), daily_wage = COALESCE(?, daily_wage) WHERE user_id = ?`,
      [skills ?? null, dailyWage ?? null, id],
    );
  }
  const user = await findUser('u.user_id = ?', [id]);
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
  res.json(publicUser(user));
});

// ── Internal (เรียกระหว่าง service เท่านั้น gateway ไม่ได้ส่งต่อ /internal) ──
// gateway เรียกทุก request เพื่อตรวจ token + สถานะบัญชี + token_version
app.get('/internal/auth/verify', async (req, res) => {
  const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const claims = token && verifyToken(token);
  if (!claims) throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  const user = await findUser('u.user_id = ? AND u.status = ?', [claims.sub, 'ACTIVE']);
  if (!user || user.role !== claims.role || user.tokenVersion !== claims.ver) {
    throw new HttpError(401, 'INVALID_TOKEN', 'Account is not active');
  }
  res.json({ userId: user.userId, role: user.role, fullName: user.fullName });
});

// job-service ใช้ตรวจว่าเป็นช่างจริงก่อนมอบหมายงาน และเก็บ snapshot ชื่อ
app.get('/internal/users/:id', async (req, res) => {
  const user = await findUser('u.user_id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(publicUser(user));
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_user_summary');
  res.json(row);
});

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
