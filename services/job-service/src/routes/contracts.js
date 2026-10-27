import { Router } from 'express';
import { pool, tx, nextCode } from '../db.js';
import { HttpError, camel, currentUser, requireRole } from '../http.js';
import { assertStatus, buildInstallments, enqueueWebhook, getJobDetail, loadJob, moveStatus } from '../jobs.js';

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

router.post('/api/contracts/:id/send', requireRole('ADMIN'), async (req, res) => {
  const jobId = await tx(currentUser(req).id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'DRAFT');
    const job = await loadJob(conn, c.job_id, { lock: true });
    await conn.query(`UPDATE contracts SET status = 'SENT', sent_at = NOW() WHERE contract_id = ?`, [c.contract_id]);
    await enqueueWebhook(conn, job, 'contract.sent', contractPayload(c));
    if (c.contract_type === 'MAIN') await moveStatus(conn, job, 'QUOTED', `ส่งสัญญา ${c.contract_no}`);
    return job.job_id;
  });
  res.json(await getJobDetail(jobId));
});

// ลูกค้าเซ็นสัญญา → สร้างงวดชำระ, สัญญาหลักทำให้งานเป็น CONTRACTED
router.post('/api/contracts/:id/sign', requireRole('USER'), async (req, res) => {
  const user = currentUser(req);
  const signedName = req.body.signedName?.trim();
  if (!signedName) throw new HttpError(422, 'VALIDATION', 'กรุณาพิมพ์ชื่อผู้ลงนาม');
  const jobId = await tx(user.id, async (conn) => {
    const c = await loadContract(conn, req.params.id, 'SENT');
    const job = await loadJob(conn, c.job_id, { lock: true });
    if (job.requester_id !== user.id) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบสัญญา');
    await conn.query(
      `UPDATE contracts SET status = 'SIGNED', signed_by = ?, signed_name = ?, signed_at = NOW() WHERE contract_id = ?`,
      [user.id, signedName, c.contract_id],
    );
    const installments = buildInstallments(c);
    for (const [i, v] of installments.entries()) {
      await conn.query(
        'INSERT INTO invoices (invoice_no, contract_id, installment_no, description, due_date, amount) VALUES (?, ?, ?, ?, ?, ?)',
        [`IV${c.contract_no.slice(2)}-${i + 1}`, c.contract_id, i + 1, v.description, v.dueDate, v.amount],
      );
    }
    await enqueueWebhook(conn, job, 'contract.signed', { ...contractPayload(c), signedName });
    if (c.contract_type === 'MAIN') await moveStatus(conn, job, 'CONTRACTED', `เซ็นสัญญา ${c.contract_no}`);
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
    const reason = req.body.reason?.trim() || null;
    await conn.query(`UPDATE contracts SET status = 'REJECTED', reject_reason = ? WHERE contract_id = ?`, [reason, c.contract_id]);
    if (c.contract_type === 'MAIN') await moveStatus(conn, job, 'SURVEYED', `ปฏิเสธสัญญา ${c.contract_no}${reason ? `: ${reason}` : ''}`);
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
