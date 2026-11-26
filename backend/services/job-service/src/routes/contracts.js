import express, { Router } from 'express';
import { pool, tx, nextCode } from '../db.js';
import { HttpError, camel, currentUser, requireRole } from '../http.js';
import {
  assertOwnerApproved, assertStatus, enqueueWebhook, getJobDetail, loadJob, markContractRejected, markContractSigned, moveStatus,
} from '../jobs.js';
import { pushContractToPartner } from '../repairSync.js';

export const router = Router();

const CONTRACT_LIST_SQL = `
  SELECT c.*, j.job_code, j.title AS job_title, j.requester_id, j.job_type
  FROM contracts c JOIN jobs j ON j.job_id = c.job_id`;

router.get('/api/contracts', requireRole('ADMIN', 'USER'), async (req, res) => {
  const user = currentUser(req);
  const [rows] = await pool.query(
    `${CONTRACT_LIST_SQL} ${user.role === 'USER' ? `WHERE j.requester_id = ? AND c.status <> 'DRAFT'` : ''}
     ORDER BY c.created_at DESC`,
    [user.id],
  );
  res.json(rows.map(camel));
});

// แอดมินร่างสัญญาจากผลประเมิน
// MAIN: งานต้อง SURVEYED และไม่มีสัญญาหลักที่ยังใช้งาน, ADDENDUM: งานต้องเซ็นสัญญาหลักแล้ว (สัญญาเพิ่มเติมจากงานที่พบเพิ่ม)
router.post('/api/contracts', requireRole('ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const { jobId, surveyId, contractType = 'MAIN', billingType, rate, periodQty, startDate, terms, items = [] } = req.body;
  if (!['DAILY', 'MONTHLY'].includes(billingType) || !(Number(periodQty) > 0) || !(Number(rate) >= 0) || !startDate) {
    throw new HttpError(422, 'VALIDATION', 'กรอกรูปแบบการคิดเงิน อัตรา จำนวนวัน/เดือน และวันเริ่มงาน');
  }

  const contractId = await tx(user.id, async (conn) => {
    const job = await loadJob(conn, jobId, { lock: true });
    const [[activeMain]] = await conn.query(
      `SELECT * FROM contracts WHERE job_id = ? AND contract_type = 'MAIN' AND status IN ('DRAFT','SENT','SIGNED')`, [job.job_id]);
    let parentId = null;
    if (contractType === 'MAIN') {
      assertStatus(job, 'SURVEYED');
      if (activeMain) throw new HttpError(409, 'CONTRACT_EXISTS', `มีสัญญาหลัก ${activeMain.contract_no} อยู่แล้ว`);
    } else {
      assertStatus(job, 'CONTRACTED', 'IN_PROGRESS');
      if (activeMain?.status !== 'SIGNED') throw new HttpError(409, 'NO_MAIN_CONTRACT', 'ต้องมีสัญญาหลักที่เซ็นแล้ว');
      parentId = activeMain.contract_id;
    }

    const code = await nextCode(conn, 'contracts', 'contract_no', 'CT');
    const endExpr = billingType === 'DAILY'
      ? 'DATE_ADD(?, INTERVAL ? - 1 DAY)'
      : 'DATE_SUB(DATE_ADD(?, INTERVAL ? MONTH), INTERVAL 1 DAY)';
    const [r] = await conn.query(
      `INSERT INTO contracts (contract_no, job_id, survey_id, contract_type, parent_contract_id, billing_type, rate, period_qty,
                              start_date, end_date, terms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${endExpr}, ?, ?)`,
      [code, job.job_id, surveyId || null, contractType, parentId, billingType, rate, periodQty,
       startDate, startDate, periodQty, terms || null, user.id],
    );
    for (const i of items) {
      if (!i.description || !(Number(i.qty) > 0)) throw new HttpError(422, 'VALIDATION', 'รายการวัสดุไม่ครบ');
      await conn.query(
        'INSERT INTO contract_items (contract_id, material_id, description, qty, unit, unit_price) VALUES (?, ?, ?, ?, ?, ?)',
        [r.insertId, i.materialId || null, i.description, i.qty, i.unit || 'ชิ้น', i.unitPrice ?? 0],
      );
    }
    return r.insertId;
  });
  res.status(201).json({ contractId });
});

router.delete('/api/contracts/:id', requireRole('ADMIN'), async (req, res) => {
  const [r] = await pool.query(`DELETE FROM contracts WHERE contract_id = ? AND status = 'DRAFT'`, [req.params.id]);
  if (!r.affectedRows) throw new HttpError(409, 'CONTRACT_LOCKED', 'ลบได้เฉพาะสัญญาฉบับร่าง');
  res.status(204).end();
});

// ── ไฟล์แนบสัญญา (รูป/PDF) ──
// อัปโหลดเป็น binary ตรง ๆ (Content-Type = ชนิดไฟล์, ?name= ชื่อไฟล์) ไม่ต้องใช้ multipart
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
};
const rawFile = express.raw({ type: Object.keys(FILE_TYPES), limit: MAX_FILE_BYTES });

function readUpload(req) {
  const mime = req.get('Content-Type')?.split(';')[0].trim();
  if (!Buffer.isBuffer(req.body) || !req.body.length || !FILE_TYPES[mime]) {
    throw new HttpError(422, 'INVALID_FILE', 'แนบได้เฉพาะไฟล์ JPG, PNG, WebP หรือ PDF ขนาดไม่เกิน 5 MB');
  }
  if (!FILE_TYPES[mime](req.body)) throw new HttpError(422, 'INVALID_FILE', 'เนื้อไฟล์ไม่ตรงกับชนิดไฟล์');
  const name = String(req.query.name ?? '').replace(/[\\/\r\n"]/g, '_').trim().slice(0, 200) || 'file';
  return { name, mime, data: req.body };
}

const insertFile = (conn, contractId, kind, f, userId) =>
  conn.query(
    'INSERT INTO contract_files (contract_id, kind, file_name, mime_type, size_bytes, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [contractId, kind, f.name, f.mime, f.data.length, f.data, userId],
  );

// แอดมินแนบไฟล์สัญญาได้ตอนยังเป็นฉบับร่าง
router.post('/api/contracts/:id/files', requireRole('ADMIN'), rawFile, async (req, res) => {
  const user = currentUser(req);
  const file = readUpload(req);
  const jobId = await tx(user.id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'DRAFT');
    await insertFile(conn, c.contract_id, 'CONTRACT', file, user.id);
    return c.job_id;
  });
  res.status(201).json(await getJobDetail(jobId));
});

router.delete('/api/contracts/:id/files/:fileId', requireRole('ADMIN'), async (req, res) => {
  const jobId = await tx(currentUser(req).id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'DRAFT');
    const [r] = await conn.query(`DELETE FROM contract_files WHERE file_id = ? AND contract_id = ? AND kind = 'CONTRACT'`,
      [req.params.fileId, c.contract_id]);
    if (!r.affectedRows) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบไฟล์');
    return c.job_id;
  });
  res.json(await getJobDetail(jobId));
});

// ดูไฟล์: แอดมิน, ช่างในทีมของงาน, ลูกค้าเจ้าของงาน (หลังสัญญาถูกส่งแล้ว)
router.get('/api/contracts/:id/files/:fileId', requireRole('ADMIN', 'USER', 'TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const [[f]] = await pool.query(
    `SELECT f.*, c.status AS contract_status, j.job_id, j.requester_id
     FROM contract_files f JOIN contracts c ON c.contract_id = f.contract_id JOIN jobs j ON j.job_id = c.job_id
     WHERE f.file_id = ? AND f.contract_id = ?`,
    [req.params.fileId, req.params.id],
  );
  let allowed = Boolean(f) && user.role === 'ADMIN';
  if (f && user.role === 'USER') allowed = f.requester_id === user.id && f.contract_status !== 'DRAFT';
  if (f && user.role === 'TECHNICIAN') {
    const [[a]] = await pool.query('SELECT 1 FROM job_assignments WHERE job_id = ? AND technician_id = ?', [f.job_id, user.id]);
    allowed = Boolean(a);
  }
  if (!allowed) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบไฟล์');
  res.set({
    'Content-Type': f.mime_type,
    'Content-Length': f.size_bytes,
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  res.end(f.data);
});

router.post('/api/contracts/:id/send', requireRole('ADMIN'), async (req, res) => {
  const jobId = await tx(currentUser(req).id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'DRAFT');
    const job = await loadJob(conn, c.job_id, { lock: true });
    assertOwnerApproved(job);
    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM contract_files WHERE contract_id = ? AND kind = 'CONTRACT'`, [c.contract_id]);
    if (!n) throw new HttpError(422, 'NO_CONTRACT_FILE', 'แนบไฟล์สัญญาก่อนส่งให้ลูกค้า');
    await conn.query(`UPDATE contracts SET status = 'SENT', sent_at = NOW() WHERE contract_id = ?`, [c.contract_id]);
    await enqueueWebhook(conn, job, 'contract.sent', contractPayload(c));
    if (c.contract_type === 'MAIN') await moveStatus(conn, job, 'QUOTED', `ส่งสัญญา ${c.contract_no}`);
    return job.job_id;
  });
  // งานจากหอพัก (Repair API v1): ส่งสัญญาไปให้หอพักอนุมัติ — ไม่สำเร็จจะแสดงใน remote_sync_error และ worker ส่งซ้ำให้
  await pushContractToPartner(Number(req.params.id));
  res.json(await getJobDetail(jobId));
});

// ลูกค้าแนบรูปสัญญาที่เซ็นแล้วส่งกลับ = ลงนาม → สร้างงวดชำระ, สัญญาหลักทำให้งานเป็น CONTRACTED
// ชื่อผู้ลงนามใช้ชื่อบัญชีที่ล็อกอิน (ไม่ต้องพิมพ์เอง)
router.post('/api/contracts/:id/sign', requireRole('USER'), rawFile, async (req, res) => {
  const user = currentUser(req);
  const file = readUpload(req);
  const signedName = user.name || `ผู้ใช้ #${user.id}`;
  const jobId = await tx(user.id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'SENT');
    const job = await loadJob(conn, c.job_id, { lock: true });
    if (job.requester_id !== user.id) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบสัญญา');
    await insertFile(conn, c.contract_id, 'SIGNED', file, user.id);
    await enqueueWebhook(conn, job, 'contract.signed', { ...contractPayload(c), signedName });
    await markContractSigned(conn, c, job, { signedBy: user.id, signedName });
    return job.job_id;
  });
  res.json(await getJobDetail(jobId));
});

// ลูกค้าปฏิเสธ: สัญญาหลักทำให้งานกลับไป SURVEYED ให้แอดมินเสนอใหม่
router.post('/api/contracts/:id/reject', requireRole('USER'), async (req, res) => {
  const user = currentUser(req);
  const jobId = await tx(user.id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'SENT');
    const job = await loadJob(conn, c.job_id, { lock: true });
    if (job.requester_id !== user.id) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบสัญญา');
    await markContractRejected(conn, c, job, req.body.reason?.trim() || null);
    return job.job_id;
  });
  res.json(await getJobDetail(jobId));
});

async function loadContract(conn, id, expectedStatus) {
  const [[c]] = await conn.query('SELECT * FROM contracts WHERE contract_id = ? FOR UPDATE', [id]);
  if (!c) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบสัญญา');
  if (c.status !== expectedStatus) throw new HttpError(409, 'INVALID_STATUS', `สัญญาอยู่สถานะ ${c.status}`);
  return c;
}

const contractPayload = (c) => ({
  contractNo: c.contract_no, contractType: c.contract_type, billingType: c.billing_type,
  rate: c.rate, periodQty: c.period_qty, startDate: c.start_date, endDate: c.end_date, totalAmount: c.total_amount,
});

// ── ใบแจ้งหนี้ ──
router.get('/api/invoices', requireRole('ADMIN', 'USER'), async (req, res) => {
  const user = currentUser(req);
  const where = [];
  const params = [];
  if (user.role === 'USER') { where.push('j.requester_id = ?'); params.push(user.id); }
  if (req.query.status) { where.push('v.status = ?'); params.push(req.query.status); }
  const [rows] = await pool.query(
    `SELECT v.*, c.contract_no, c.billing_type, j.job_id, j.job_code, j.title AS job_title
     FROM invoices v JOIN contracts c ON c.contract_id = v.contract_id JOIN jobs j ON j.job_id = c.job_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(v.status, 'PENDING_VERIFY', 'UNPAID', 'PAID'), v.due_date`,
    params,
  );
  res.json(rows.map(camel));
});

router.post('/api/invoices/:id/pay', requireRole('USER'), async (req, res) => {
  const slipRef = req.body.slipRef?.trim();
  if (!slipRef) throw new HttpError(422, 'VALIDATION', 'กรอกเลขอ้างอิงสลิป/ลิงก์รูปสลิป');
  const [r] = await pool.query(
    `UPDATE invoices v JOIN contracts c ON c.contract_id = v.contract_id JOIN jobs j ON j.job_id = c.job_id
     SET v.status = 'PENDING_VERIFY', v.slip_ref = ?
     WHERE v.invoice_id = ? AND j.requester_id = ? AND v.status = 'UNPAID'`,
    [slipRef, req.params.id, currentUser(req).id],
  );
  if (!r.affectedRows) throw new HttpError(409, 'INVALID_STATUS', 'ชำระได้เฉพาะใบแจ้งหนี้ที่ยังไม่จ่าย');
  res.json({ ok: true });
});

router.post('/api/invoices/:id/verify', requireRole('ADMIN'), async (req, res) => {
  const approve = Boolean(req.body.approve);
  const [r] = await pool.query(
    `UPDATE invoices SET status = ?, paid_at = IF(?, NOW(), NULL), verified_by = ?, slip_ref = IF(?, slip_ref, NULL)
     WHERE invoice_id = ? AND status = 'PENDING_VERIFY'`,
    [approve ? 'PAID' : 'UNPAID', approve, currentUser(req).id, approve, req.params.id],
  );
  if (!r.affectedRows) throw new HttpError(409, 'INVALID_STATUS', 'ใบแจ้งหนี้นี้ไม่ได้รอตรวจสอบ');
  res.json({ ok: true });
});
