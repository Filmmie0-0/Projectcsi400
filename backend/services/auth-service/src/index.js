import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const SERVICE = 'auth-service';
const app = express();
app.use(express.json({ limit: '10kb' }));

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const TOKEN_ISSUER = 'microfulfill-auth';
const TOKEN_AUDIENCE = 'microfulfill-api';
const PUBLIC_ROLES = new Set(['OWNER', 'TENANT']);

function getJwtSecret(res) {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    res.status(503).json({ message: 'Authentication is not configured' });
    return null;
  }
  return secret;
}

function presentUser(row) {
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
  };
}

function issueToken(row, secret) {
  return jwt.sign({ sub: String(row.user_id), role: row.role, ver: row.token_version ?? 0 }, secret, {
    algorithm: 'HS256',
    audience: TOKEN_AUDIENCE,
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: TOKEN_ISSUER,
  });
}

function setAccessCookie(res, token) {
  res.cookie('mfc_access_token', token, {
    httpOnly: true,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/api',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
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
app.get('/api/auth/ping', (_req, res) => res.json({ service: SERVICE, ok: true }));

app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, phone, address, businessName, taxId, password, role } = req.body ?? {};
  if (
    typeof fullName !== 'string' ||
    !fullName.trim() ||
    fullName.trim().length > 150 ||
    typeof email !== 'string' ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof phone !== 'string' ||
    !/^[0-9+() -]{8,20}$/.test(phone.trim()) ||
    typeof address !== 'string' ||
    !address.trim() ||
    address.trim().length > 2000 ||
    (role === 'OWNER' &&
      (typeof businessName !== 'string' || !businessName.trim() || businessName.trim().length > 200)) ||
    (taxId !== undefined &&
      (typeof taxId !== 'string' || taxId.length > 20)) ||
    typeof password !== 'string' ||
    Buffer.byteLength(password, 'utf8') < 8 ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    !PUBLIC_ROLES.has(role)
  ) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ถูกต้อง (รหัสผ่าน 8-72 ไบต์)' });
  }

  const secret = getJwtSecret(res);
  if (!secret) return;

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO users (email, password_hash, role, status)
       VALUES (?, ?, ?, 'ACTIVE')`,
      [normalizedEmail, passwordHash, role],
    );
    await connection.query(
      `INSERT INTO user_profiles (user_id, full_name, phone, business_name, tax_id, address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        fullName.trim(),
        phone.trim(),
        role === 'OWNER' ? businessName.trim() : null,
        taxId?.trim() || null,
        address.trim(),
      ],
    );
    await connection.commit();

    const user = {
      user_id: result.insertId,
      email: normalizedEmail,
      role,
      full_name: fullName.trim(),
    };
    setAccessCookie(res, issueToken(user, secret));
    return res.status(201).json({ user: presentUser(user), expiresIn: TOKEN_TTL_SECONDS });
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }
    throw err;
  } finally {
    connection.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (
    typeof email !== 'string' ||
    email.length > 255 ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่าน' });
  }

  const secret = getJwtSecret(res);
  if (!secret) return;

  const [rows] = await pool.query(
    `SELECT u.user_id, u.email, u.password_hash, u.role, u.status, u.token_version, p.full_name
     FROM users u
     LEFT JOIN user_profiles p ON p.user_id = u.user_id
     WHERE u.email = ?
     LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ message: 'บัญชีนี้ยังไม่สามารถเข้าสู่ระบบได้' });
  }

  await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?', [user.user_id]);
  setAccessCookie(res, issueToken(user, secret));
  return res.json({ user: presentUser(user), expiresIn: TOKEN_TTL_SECONDS });
});

app.post('/api/auth/logout', async (req, res) => {
  const cookieToken = req.get('cookie')?.match(/(?:^|;\s*)mfc_access_token=([^;]+)/)?.[1];
  res.clearCookie('mfc_access_token', {
    httpOnly: true,
    path: '/api',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  if (!cookieToken) return res.sendStatus(204);

  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) return res.sendStatus(204);
  let claims;
  try {
    claims = jwt.verify(cookieToken, secret, {
      algorithms: ['HS256'],
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
  } catch {
    return res.sendStatus(204);
  }

  if (
    typeof claims !== 'string' &&
    typeof claims.sub === 'string' &&
    /^[1-9]\d*$/.test(claims.sub) &&
    Number.isSafeInteger(claims.ver) &&
    claims.ver >= 0
  ) {
    await pool.query(
      'UPDATE users SET token_version = token_version + 1 WHERE user_id = ? AND token_version = ?',
      [claims.sub, claims.ver],
    );
  }
  return res.sendStatus(204);
});

// ── Internal (เรียกระหว่าง service เท่านั้น gateway ไม่ได้ส่งต่อ /internal) ──
app.get('/internal/auth/verify', async (req, res) => {
  const secret = getJwtSecret(res);
  if (!secret) return;

  const authorization = req.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ message: 'Authentication required' });

  let claims;
  try {
    claims = jwt.verify(match[1], secret, {
      algorithms: ['HS256'],
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (
    typeof claims === 'string' ||
    typeof claims.sub !== 'string' ||
    !/^[1-9]\d*$/.test(claims.sub) ||
    !Number.isSafeInteger(claims.ver) ||
    claims.ver < 0 ||
    !['ADMIN', 'OWNER', 'TENANT'].includes(claims.role)
  ) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  const [rows] = await pool.query(
    'SELECT user_id, role, token_version FROM users WHERE user_id = ? AND status = ? LIMIT 1',
    [claims.sub, 'ACTIVE'],
  );
  const user = rows[0];
  if (!user || user.role !== claims.role || user.token_version !== claims.ver) {
    return res.status(401).json({ message: 'Account is not active' });
  }
  return res.json({ userId: String(user.user_id), role: user.role });
});

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
  res.status(500).json({ message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง' });
});

const port = Number(process.env.PORT ?? 4001);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
