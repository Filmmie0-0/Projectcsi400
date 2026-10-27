import crypto from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';

// API Gateway: frontend เรียกที่เดียว (VITE_API_URL=http://localhost:3000/api) แล้วส่งต่อตาม path
// - ตรวจ token ทุก request ผ่าน auth-service (/internal/auth/verify: ลายเซ็น + สถานะบัญชี + token_version)
//   แล้วส่ง X-User-Id / X-User-Role / X-User-Name ให้ service ปลายทาง
// - /api/partner/* ไม่ใช้ JWT: job-service ตรวจ X-API-Key ของระบบพาร์ทเนอร์เอง
// - /internal/* ของแต่ละ service ไม่ถูกส่งต่อ จึงเรียกได้จากในเครือข่าย docker เท่านั้น
const AUTH = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const JOB = process.env.JOB_SERVICE_URL ?? 'http://localhost:4002';
const INVENTORY = process.env.INVENTORY_SERVICE_URL ?? 'http://localhost:4003';
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
const COOKIE_NAME = 'renocare_access_token';
const MOCK_PARTNER_SECRET = process.env.MOCK_PARTNER_WEBHOOK_SECRET ?? 'whsec_dormbook_demo';

const routes = [
  { prefixes: ['/api/auth', '/api/users'], target: AUTH },
  { prefixes: ['/api/jobs', '/api/buildings', '/api/contracts', '/api/invoices', '/api/partners', '/api/partner'], target: JOB },
  { prefixes: ['/api/materials', '/api/stock', '/api/requisitions'], target: INVENTORY },
];

const PUBLIC_POST = ['/api/auth/login', '/api/auth/register', '/api/auth/logout'];
const PUBLIC_GET = ['/api/mock-partner/events'];

const app = express();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่' },
  skipSuccessfulRequests: true,
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'สมัครสมาชิกบ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
  skipFailedRequests: true,
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  // ห้าม client ส่งตัวตนมาเอง: ค่าเหล่านี้มาจากการตรวจ token เท่านั้น
  delete req.headers['x-user-id'];
  delete req.headers['x-user-role'];
  delete req.headers['x-user-name'];
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);

app.get('/health', async (_req, res) => {
  const services = { auth: AUTH, job: JOB, inventory: INVENTORY };
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
  res.status(results.every(([, s]) => s === 'ok') ? 200 : 503).json(Object.fromEntries(results));
});

// ── ระบบจองห้องพักจำลอง (แทนระบบของเพื่อนตอนเดโม ลบออกเมื่อเชื่อมระบบจริง) ──
// job-service ส่ง webhook มาที่ http://gateway:3000/mock-partner/webhook แล้วหน้า Partner Sandbox อ่านผ่าน /api/mock-partner/events
const partnerInbox = [];

app.post('/mock-partner/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const expected = crypto.createHmac('sha256', MOCK_PARTNER_SECRET).update(req.body).digest('hex');
  const valid = req.get('X-Signature') === `sha256=${expected}`;
  partnerInbox.unshift({ receivedAt: new Date().toISOString(), signatureValid: valid, body: JSON.parse(req.body.toString()) });
  partnerInbox.length = Math.min(partnerInbox.length, 50);
  res.status(valid ? 200 : 401).json({ ok: valid });
});

app.get('/api/mock-partner/events', (_req, res) => res.json(partnerInbox));

// ── Auth ──
app.use('/api', async (req, res, next) => {
  const path = req.originalUrl.split('?')[0];
  // กัน CSRF: คำขอที่เปลี่ยนข้อมูลจากเบราว์เซอร์ต้องมาจาก origin ของ frontend เท่านั้น
  const origin = req.get('origin');
  if (!['GET', 'HEAD'].includes(req.method) && origin && origin !== CORS_ORIGIN) {
    return res.status(403).json({ code: 'ORIGIN_NOT_ALLOWED', message: 'Origin is not allowed' });
  }
  if ((req.method === 'POST' && PUBLIC_POST.includes(path)) || (req.method === 'GET' && PUBLIC_GET.includes(path)) ||
      path.startsWith('/api/partner/')) {
    return next();
  }

  const cookieToken = req.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))?.[1];
  const token = req.get('authorization') ?? (cookieToken ? `Bearer ${cookieToken}` : null);
  if (!token) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });

  try {
    const r = await fetch(`${AUTH}/internal/auth/verify`, { headers: { Authorization: token }, signal: AbortSignal.timeout(3000) });
    if (r.status === 401) return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    if (!r.ok) return res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'ไม่สามารถตรวจสอบสิทธิ์ได้ในขณะนี้' });
    const user = await r.json();
    req.headers['x-user-id'] = String(user.userId);
    req.headers['x-user-role'] = user.role;
    req.headers['x-user-name'] = encodeURIComponent(user.fullName);
    next();
  } catch {
    res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'ไม่สามารถเชื่อมต่อบริการตรวจสอบสิทธิ์ได้' });
  }
});

// แดชบอร์ดแอดมิน: ข้อมูลอยู่ 3 database จึงรวมที่ gateway
app.get('/api/admin/summary', async (req, res) => {
  if (req.headers['x-user-role'] !== 'ADMIN') return res.status(403).json({ code: 'FORBIDDEN', message: 'สำหรับผู้ดูแลระบบ' });
  try {
    const [users, jobs, inventory] = await Promise.all(
      [AUTH, JOB, INVENTORY].map((url) => fetch(`${url}/internal/summary`).then((r) => r.json())),
    );
    const merged = { ...users, ...jobs, ...inventory };
    // view ใน DB เป็น snake_case → API เป็น camelCase เหมือน endpoint อื่น
    res.json(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), Number(v)])));
  } catch {
    res.status(502).json({ code: 'UPSTREAM_ERROR', message: 'รวมข้อมูลสรุปไม่สำเร็จ' });
  }
});

for (const { prefixes, target } of routes) {
  app.use(createProxyMiddleware({ target, pathFilter: prefixes, changeOrigin: true }));
}

app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'No service for this path' }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`gateway listening on :${port}`));
