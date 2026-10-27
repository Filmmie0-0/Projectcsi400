import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';

// API Gateway: frontend เรียกที่เดียว (VITE_API_URL=http://localhost:3000/api) แล้วส่งต่อตาม path
// /internal/* ของแต่ละ service ไม่ถูกส่งต่อ จึงเรียกได้จากในเครือข่าย docker เท่านั้น
const AUTH = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const SPACE = process.env.SPACE_SERVICE_URL ?? 'http://localhost:4002';
const BOOKING = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:4003';
const STORE = process.env.STORE_SERVICE_URL ?? 'http://localhost:4004';

const routes = [
  { prefixes: ['/api/auth'], target: AUTH },
  { prefixes: ['/api/spaces', '/api/dormitories'], target: SPACE },
  { prefixes: ['/api/booking', '/api/bookings', '/api/payments'], target: BOOKING },
  { prefixes: ['/api/tenant', '/api/inventory', '/api/product', '/api/open'], target: STORE },
];

const app = express();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่' },
  skipSuccessfulRequests: true,
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'สมัครสมาชิกบ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
  skipFailedRequests: true,
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? 'http://localhost:5173');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  delete req.headers['x-auth-user-id'];
  delete req.headers['x-auth-role'];
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);

function requestPath(req) {
  return req.originalUrl.split('?')[0];
}

function isPublicRequest(req, path) {
  if (
    req.method === 'POST' &&
    ['/api/auth/login', '/api/auth/register', '/api/auth/logout'].includes(path)
  ) {
    return true;
  }
  if (req.method === 'GET' && path === '/api/auth/ping') return true;
  if (
    req.method === 'GET' &&
    ['/api/booking/ping', '/api/inventory/ping', '/api/product/ping'].includes(path)
  ) {
    return true;
  }
  if (req.method === 'GET' && /^\/api\/(spaces|dormitories)(\/|$)/.test(path)) return true;
  return path.startsWith('/api/open/');
}

function allowedRoles(req, path) {
  if (path === '/api/admin' || path.startsWith('/api/admin/')) return ['ADMIN'];
  if (
    path.startsWith('/api/tenant/') ||
    path.startsWith('/api/inventory/') ||
    path.startsWith('/api/product/') ||
    (req.method === 'POST' && path === '/api/bookings')
  ) {
    return ['TENANT'];
  }
  if (
    (path === '/api/spaces' || path.startsWith('/api/spaces/') ||
      path === '/api/dormitories' || path.startsWith('/api/dormitories/')) &&
    req.method !== 'GET'
  ) {
    return ['ADMIN', 'OWNER'];
  }
  return ['ADMIN', 'OWNER', 'TENANT'];
}

app.use('/api', async (req, res, next) => {
  const path = requestPath(req);
  const origin = req.get('origin');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    origin &&
    origin !== (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  ) {
    return res.status(403).json({ message: 'Origin is not allowed' });
  }
  if (isPublicRequest(req, path)) return next();

  const authorization = req.get('authorization');
  const cookieToken = req.get('cookie')?.match(/(?:^|;\s*)mfc_access_token=([^;]+)/)?.[1];
  const token = authorization ?? (cookieToken ? `Bearer ${cookieToken}` : null);
  if (!token) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });

  try {
    const verification = await fetch(`${AUTH}/internal/auth/verify`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(3000),
    });
    if (verification.status === 401) {
      return res.status(401).json({ message: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }
    if (!verification.ok) {
      return res.status(503).json({ message: 'ไม่สามารถตรวจสอบสิทธิ์ได้ในขณะนี้' });
    }

    const user = await verification.json();
    if (
      typeof user.userId !== 'string' ||
      !['ADMIN', 'OWNER', 'TENANT'].includes(user.role)
    ) {
      return res.status(503).json({ message: 'ผลการตรวจสอบสิทธิ์ไม่ถูกต้อง' });
    }
    if (!allowedRoles(req, path).includes(user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ใช้งานรายการนี้' });
    }

    req.headers['x-auth-user-id'] = user.userId;
    req.headers['x-auth-role'] = user.role;
    return next();
  } catch {
    return res.status(503).json({ message: 'ไม่สามารถเชื่อมต่อบริการตรวจสอบสิทธิ์ได้' });
  }
});

app.get('/health', async (_req, res) => {
  const services = { auth: AUTH, space: SPACE, booking: BOOKING, store: STORE };
  const results = await Promise.all(
    Object.entries(services).map(async ([name, url]) => {
      try {
        const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
        return [name, r.ok ? 'ok' : `error ${r.status}`];
      } catch {
        return [name, 'down'];
      }
    }),
  );
  const status = Object.fromEntries(results);
  res.status(results.every(([, s]) => s === 'ok') ? 200 : 503).json(status);
});

// v_admin_summary เดิม: ตอนนี้ข้อมูลอยู่ 3 database จึงรวมที่ gateway
app.get('/api/admin/summary', async (_req, res) => {
  try {
    const [users, spaces, bookings] = await Promise.all(
      [AUTH, SPACE, BOOKING].map((url) => fetch(`${url}/internal/summary`).then((r) => r.json())),
    );
    res.json({ ...users, ...spaces, ...bookings });
  } catch (err) {
    res.status(502).json({ message: 'Failed to aggregate summary', error: err.message });
  }
});

for (const { prefixes, target } of routes) {
  app.use(createProxyMiddleware({ target, pathFilter: prefixes, changeOrigin: true }));
}

app.use('/api', (_req, res) => res.status(404).json({ message: 'No service for this path' }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`gateway listening on :${port}`));
