import express from 'express';
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

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
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
