import crypto from 'node:crypto';
import { Router } from 'express';
import { pool, tx, nextCode } from '../db.js';
import { HttpError, camel, requireRole } from '../http.js';
import { assertStatus, loadJob } from '../jobs.js';
import { cancelJob } from './jobs.js';

export const router = Router();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newApiKey = () => `pk_live_${crypto.randomBytes(16).toString('hex')}`;

// ───────────── Admin: จัดการพาร์ทเนอร์ (/api/partners) ─────────────
router.get('/api/partners', requireRole('ADMIN'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT p.partner_id, p.name, p.owner_user_id, p.api_key_prefix, p.webhook_url, p.is_active, p.created_at,
            (SELECT COUNT(*) FROM jobs j WHERE j.partner_id = p.partner_id) AS total_jobs,
            (SELECT COUNT(*) FROM webhook_deliveries w WHERE w.partner_id = p.partner_id AND w.status = 'FAILED') AS failed_webhooks
     FROM partners p ORDER BY p.name`,
  );
  res.json(rows.map(camel));
});

// คีย์และ secret แสดงครั้งเดียวตอนสร้าง (DB เก็บแค่ hash ของคีย์)
router.post('/api/partners', requireRole('ADMIN'), async (req, res) => {
  const { name, ownerUserId, webhookUrl } = req.body;
  if (!name?.trim() || !ownerUserId) throw new HttpError(422, 'VALIDATION', 'กรอกชื่อพาร์ทเนอร์และบัญชีผู้ใช้ตัวแทน');
  const apiKey = newApiKey();
  const webhookSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
  const [r] = await pool.query(
    `INSERT INTO partners (name, owner_user_id, api_key_prefix, api_key_hash, webhook_url, webhook_secret) VALUES (?, ?, ?, ?, ?, ?)`,
    [name.trim(), ownerUserId, apiKey.slice(0, 12), sha256(apiKey), webhookUrl || null, webhookSecret],
  );
  res.status(201).json({ partnerId: r.insertId, apiKey, webhookSecret });
});

router.patch('/api/partners/:id', requireRole('ADMIN'), async (req, res) => {
  const { webhookUrl, isActive } = req.body;
  await pool.query('UPDATE partners SET webhook_url = COALESCE(?, webhook_url), is_active = COALESCE(?, is_active) WHERE partner_id = ?', [
    webhookUrl ?? null, isActive === undefined ? null : Number(Boolean(isActive)), req.params.id,
  ]);
  res.json({ ok: true });
});

router.post('/api/partners/:id/rotate-key', requireRole('ADMIN'), async (req, res) => {
  const apiKey = newApiKey();
  const [r] = await pool.query('UPDATE partners SET api_key_prefix = ?, api_key_hash = ? WHERE partner_id = ?', [
    apiKey.slice(0, 12), sha256(apiKey), req.params.id,
  ]);
  if (!r.affectedRows) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพาร์ทเนอร์');
  res.json({ apiKey });
});

router.get('/api/partners/:id/deliveries', requireRole('ADMIN'), async (req, res) => {
  res.json(await listDeliveries(req.params.id));
});

router.post('/api/partners/deliveries/:id/retry', requireRole('ADMIN'), async (req, res) => {
  await pool.query(
    `UPDATE webhook_deliveries SET status = 'PENDING', attempts = 0, next_attempt_at = NOW() WHERE delivery_id = ?`,
    [req.params.id],
  );
  res.json({ ok: true });
});

async function listDeliveries(partnerId) {
  const [rows] = await pool.query(
    `SELECT delivery_id, job_id, event, payload, status, attempts, last_error, sent_at, created_at
     FROM webhook_deliveries WHERE partner_id = ? ORDER BY delivery_id DESC LIMIT 50`,
    [partnerId],
  );
  return rows.map(camel);
}

// ───────────── Partner API v1 (ระบบจองห้องพักเรียกด้วย X-API-Key) ─────────────
const partnerApi = Router();
router.use('/api/partner/v1', partnerApi);

partnerApi.use(async (req, _res, next) => {
  const key = req.get('X-API-Key');
  const [[p]] = key ? await pool.query('SELECT * FROM partners WHERE api_key_hash = ? AND is_active = 1', [sha256(key)]) : [[]];
  if (!p) throw new HttpError(401, 'INVALID_API_KEY', 'API key ไม่ถูกต้องหรือถูกปิดใช้งาน');
  req.partner = p;
  next();
});

// ส่งงานเข้า: upsert ตึก/ห้องตาม externalRef แล้วสร้างงาน
// externalRef ของงานซ้ำ = คืนงานเดิม (idempotent, ส่งซ้ำได้เมื่อ network มีปัญหา)
partnerApi.post('/jobs', async (req, res) => {
  const p = req.partner;
  const { externalRef, jobType, building, unit, title, description, priority = 'NORMAL', preferredDate, contact = {} } = req.body;
  if (!externalRef || !['INSPECTION', 'RENOVATION'].includes(jobType) || !title || !building?.externalRef || !unit?.code) {
    throw new HttpError(422, 'VALIDATION', 'ต้องมี externalRef, jobType, title, building.externalRef และ unit.code');
  }

  const [[existing]] = await pool.query('SELECT * FROM jobs WHERE partner_id = ? AND external_ref = ?', [p.partner_id, externalRef]);
  if (existing) return res.status(200).json(partnerJobView(existing));

  const jobId = await tx(null, async (conn) => {
    await conn.query(
      `INSERT INTO buildings (owner_user_id, partner_id, external_ref, name, address) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address)`,
      [p.owner_user_id, p.partner_id, building.externalRef, building.name ?? building.externalRef, building.address ?? '-'],
    );
    const [[b]] = await conn.query('SELECT building_id FROM buildings WHERE partner_id = ? AND external_ref = ?', [p.partner_id, building.externalRef]);
    await conn.query(
      `INSERT INTO units (building_id, unit_type, code, floor, size_sqm, external_ref) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE external_ref = VALUES(external_ref), floor = VALUES(floor)`,
      [b.building_id, unit.unitType ?? 'ROOM', unit.code, unit.floor ?? null, unit.sizeSqm ?? null, unit.externalRef ?? null],
    );
    const [[u]] = await conn.query('SELECT unit_id FROM units WHERE building_id = ? AND code = ?', [b.building_id, unit.code]);

    const code = await nextCode(conn, 'jobs', 'job_code', 'JB');
    await conn.query('SET @status_remark = ?', [`รับงานจาก ${p.name}`]);
    const [r] = await conn.query(
      `INSERT INTO jobs (job_code, job_type, source, partner_id, external_ref, unit_id, requester_id, title, description,
                         priority, preferred_date, contact_name, contact_phone)
       VALUES (?, ?, 'PARTNER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, jobType, p.partner_id, externalRef, u.unit_id, p.owner_user_id, title, description ?? null,
       priority, preferredDate || null, contact.name ?? null, contact.phone ?? null],
    );
    return r.insertId;
  });
  const [[job]] = await pool.query('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
  res.status(201).json(partnerJobView(job));
});

partnerApi.get('/jobs/:externalRef', async (req, res) => {
  const job = await findPartnerJob(req);
  const [[survey]] = await pool.query(
    `SELECT summary, need_repair, est_days, submitted_at FROM site_surveys WHERE job_id = ? AND status = 'SUBMITTED' ORDER BY survey_id DESC LIMIT 1`,
    [job.job_id],
  );
  const [contracts] = await pool.query(
    `SELECT contract_no, contract_type, billing_type, total_amount, start_date, end_date, status FROM contracts WHERE job_id = ? AND status <> 'DRAFT'`,
    [job.job_id],
  );
  const [[progress]] = await pool.query('SELECT MAX(progress_pct) AS pct FROM work_logs WHERE job_id = ?', [job.job_id]);
  res.json({
    ...partnerJobView(job),
    latestSurvey: survey ? camel(survey) : null,
    contracts: contracts.map(camel),
    progressPct: progress.pct ?? 0,
  });
});

partnerApi.post('/jobs/:externalRef/cancel', async (req, res) => {
  const found = await findPartnerJob(req);
  await tx(null, async (conn) => {
    const job = await loadJob(conn, found.job_id, { lock: true });
    assertStatus(job, 'NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED');
    await cancelJob(conn, job, req.body.reason || `ยกเลิกโดย ${req.partner.name}`);
  });
  const [[job]] = await pool.query('SELECT * FROM jobs WHERE job_id = ?', [found.job_id]);
  res.json(partnerJobView(job));
});

partnerApi.get('/webhooks', async (req, res) => {
  res.json(await listDeliveries(req.partner.partner_id));
});

async function findPartnerJob(req) {
  const [[job]] = await pool.query('SELECT * FROM jobs WHERE partner_id = ? AND external_ref = ?', [
    req.partner.partner_id, req.params.externalRef,
  ]);
  if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'ไม่พบงานของ externalRef นี้');
  return job;
}

const partnerJobView = (j) => ({
  jobCode: j.job_code, externalRef: j.external_ref, jobType: j.job_type, title: j.title,
  status: j.status, createdAt: j.created_at, completedAt: j.completed_at,
});
