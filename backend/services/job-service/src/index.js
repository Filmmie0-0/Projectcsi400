import express from 'express';
import { pool } from './db.js';
import { HttpError, errorHandler } from './http.js';
import { router as jobRoutes } from './routes/jobs.js';
import { router as contractRoutes } from './routes/contracts.js';
import { router as partnerRoutes } from './routes/partners.js';
import { startWebhookWorker } from './webhooks.js';

const SERVICE = 'job-service';
const app = express();
// เก็บ body ดิบไว้ตรวจ X-Signature ของ webhook จากหอพัก (HMAC ต้องคำนวณจาก byte ที่ส่งมาจริง)
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: SERVICE, db: 'ok' });
  } catch (err) {
    res.status(503).json({ service: SERVICE, db: 'down', error: err.message });
  }
});

// ── Public (ผ่าน gateway): /api/buildings, /api/jobs, /api/contracts, /api/invoices, /api/partners, /api/partner/v1 ──
app.use(jobRoutes);
app.use(contractRoutes);
app.use(partnerRoutes);

// ── Internal ──
// inventory-service ใช้ตรวจก่อนสร้างใบเบิกว่างานยังเปิดอยู่และช่างได้รับมอบหมายจริง
app.get('/internal/jobs/:id', async (req, res) => {
  const [[job]] = await pool.query('SELECT job_id, job_code, status FROM jobs WHERE job_id = ?', [req.params.id]);
  if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'ไม่พบงาน');
  const [techs] = await pool.query('SELECT technician_id FROM job_assignments WHERE job_id = ?', [job.job_id]);
  res.json({ jobId: job.job_id, jobCode: job.job_code, status: job.status, technicianIds: techs.map((t) => t.technician_id) });
});

app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_job_summary');
  res.json(row);
});

app.use(errorHandler);

// DB ที่สร้างไว้ก่อนเพิ่ม partners.building_ref / webhook_deliveries.status = SKIPPED (init script รันเฉพาะตอนสร้าง volume ใหม่)
async function ensureSchema() {
  const [[col]] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'partners' AND COLUMN_NAME = 'building_ref'`,
  );
  if (!col.n) await pool.query('ALTER TABLE partners ADD COLUMN building_ref VARCHAR(40) NULL AFTER outbound_api_key');
  const [[wh]] = await pool.query(
    `SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'webhook_deliveries' AND COLUMN_NAME = 'status'`,
  );
  if (!wh.t.includes('SKIPPED')) {
    await pool.query(`ALTER TABLE webhook_deliveries MODIFY status ENUM('PENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING'`);
  }
}
await ensureSchema();

startWebhookWorker();

const port = Number(process.env.PORT ?? 4002);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
