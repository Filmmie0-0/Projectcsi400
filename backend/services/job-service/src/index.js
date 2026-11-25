import express from 'express';
import { ensureSchema, pool } from './db.js';
import { HttpError, errorHandler } from './http.js';
import { router as jobRoutes } from './routes/jobs.js';
import { router as contractRoutes } from './routes/contracts.js';
import { router as partnerRoutes } from './routes/partners.js';
import { configureDormPartnerFromEnv, startRepairSyncWorker } from './repairSync.js';
import { startWebhookWorker } from './webhooks.js';

const SERVICE = 'job-service';
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

async function initWithRetry(attempts = 10) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await ensureSchema();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

await initWithRetry();
await configureDormPartnerFromEnv().catch((err) => console.error('configure dorm partner:', err.message));
startWebhookWorker();
startRepairSyncWorker();

const port = Number(process.env.PORT ?? 4002);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
