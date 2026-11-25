import crypto from 'node:crypto';
import { Router } from 'express';
import { pool, tx } from '../db.js';
import { HttpError, camel, requireRole } from '../http.js';
import { COMPANY_CONTACT, assertStatus, loadJob, recordOwnerDecision, technicianContacts } from '../jobs.js';
import { cancelJob } from './jobs.js';
import { createPartnerJob } from '../partnerJobs.js';
import { handleDormWebhook } from '../dormAdapter.js';

export const router = Router();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newApiKey = () => `pk_live_${crypto.randomBytes(16).toString('hex')}`;

// ───────────── Admin: จัดการพาร์ทเนอร์ (/api/partners) ─────────────
router.get('/api/partners', requireRole('ADMIN'), async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT p.partner_id, p.name, p.owner_user_id, p.api_key_prefix, p.webhook_url, p.api_base_url, p.building_ref, p.is_active, p.created_at,
            p.outbound_api_key IS NOT NULL AS has_outbound_key,
            (SELECT COUNT(*) FROM jobs j WHERE j.partner_id = p.partner_id) AS total_jobs,
            (SELECT COUNT(*) FROM webhook_deliveries w WHERE w.partner_id = p.partner_id AND w.status = 'FAILED') AS failed_webhooks
     FROM partners p ORDER BY p.name`,
  );
  res.json(rows.map(camel));
});

// คีย์และ secret แสดงครั้งเดียวตอนสร้าง (DB เก็บแค่ hash ของคีย์)
router.post('/api/partners', requireRole('ADMIN'), async (req, res) => {
  const { name, ownerUserId, webhookUrl, apiBaseUrl, outboundApiKey, buildingRef } = req.body;
  if (!name?.trim() || !ownerUserId) throw new HttpError(422, 'VALIDATION', 'กรอกชื่อพาร์ทเนอร์และบัญชีผู้ใช้ตัวแทน');
  assertBuildingRef(buildingRef);
  const apiKey = newApiKey();
  const webhookSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
  const [r] = await pool.query(
    `INSERT INTO partners (name, owner_user_id, api_key_prefix, api_key_hash, webhook_url, webhook_secret, api_base_url, outbound_api_key, building_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name.trim(), ownerUserId, apiKey.slice(0, 12), sha256(apiKey), webhookUrl || null, webhookSecret,
     apiBaseUrl || null, outboundApiKey || null, buildingRef || null],
  );
  res.status(201).json({ partnerId: r.insertId, apiKey, webhookSecret });
});

router.patch('/api/partners/:id', requireRole('ADMIN'), async (req, res) => {
  const { webhookUrl, isActive, apiBaseUrl, outboundApiKey, buildingRef } = req.body;
  assertBuildingRef(buildingRef);
  await pool.query(
    `UPDATE partners SET webhook_url = COALESCE(?, webhook_url), is_active = COALESCE(?, is_active),
            api_base_url = COALESCE(?, api_base_url), outbound_api_key = COALESCE(?, outbound_api_key),
            building_ref = COALESCE(?, building_ref) WHERE partner_id = ?`,
    [webhookUrl || null, isActive === undefined ? null : Number(Boolean(isActive)), apiBaseUrl || null, outboundApiKey || null,
     buildingRef || null, req.params.id],
  );
  res.json({ ok: true });
});

// รหัสอาคารต้องตรงกับที่หอพักตั้งไว้ (หอพักใช้รูปแบบนี้ใน URL webhook และ /buildings/:ref/owner)
function assertBuildingRef(ref) {
  if (ref && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/.test(ref)) {
    throw new HttpError(422, 'VALIDATION', 'รหัสอาคารใช้ A-Z a-z 0-9 _ - ยาว 3-40 ตัว');
  }
}

router.post('/api/partners/:id/rotate-key', requireRole('ADMIN'), async (req, res) => {
  const apiKey = newApiKey();
  const [r] = await pool.query('UPDATE partners SET api_key_prefix = ?, api_key_hash = ? WHERE partner_id = ?', [
    apiKey.slice(0, 12), sha256(apiKey), req.params.id,
  ]);
  if (!r.affectedRows) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพาร์ทเนอร์');
  res.json({ apiKey });
});

// secret เก่าใช้ไม่ได้ทันที ทั้งลายเซ็นขาเข้าและขาออก — พาร์ทเนอร์ต้องเปลี่ยนตามก่อนส่งข้อมูลครั้งถัดไป
router.post('/api/partners/:id/rotate-secret', requireRole('ADMIN'), async (req, res) => {
  const webhookSecret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
  const [r] = await pool.query('UPDATE partners SET webhook_secret = ? WHERE partner_id = ?', [webhookSecret, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพาร์ทเนอร์');
  res.json({ webhookSecret });
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

// ส่งงานเข้า (รายละเอียดดู partnerJobs.js) — ส่ง externalRef ซ้ำ = ได้งานเดิมคืน (200)
partnerApi.post('/jobs', async (req, res) => {
  const { job, created } = await createPartnerJob(req.partner, req.body);
  res.status(created ? 201 : 200).json(partnerJobView(job));
});

// ระบบหอพัก (Repair API) ส่ง job.created / job.updated / job.cancelled มาที่นี่ (ดู dormAdapter.js)
partnerApi.post('/dorm-webhook', handleDormWebhook);

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
    technicians: await technicianContacts(pool, job.job_id),
    contact: COMPANY_CONTACT,
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

// ระบบจองห้องพักถามเจ้าของหอในระบบตัวเองแล้วส่งผลมา (ทางเลือกแทนให้แอดมินเราโทรถาม)
partnerApi.post('/jobs/:externalRef/owner-approval', async (req, res) => {
  const found = await findPartnerJob(req);
  const { decision, note } = req.body;
  await tx(null, async (conn) => {
    const job = await loadJob(conn, found.job_id, { lock: true });
    await recordOwnerDecision(conn, job, decision, note);
    if (decision === 'REJECTED') await cancelJob(conn, job, `เจ้าของหอไม่อนุมัติ${note ? `: ${note}` : ''}`);
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
  workScope: j.work_scope, ownerApproval: j.owner_approval, status: j.status, createdAt: j.created_at, completedAt: j.completed_at,
});
