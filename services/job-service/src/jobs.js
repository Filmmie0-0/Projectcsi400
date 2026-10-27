import { pool } from './db.js';
import { HttpError, camel } from './http.js';

// ── กติกาที่ใช้ร่วมกันระหว่าง route ของงาน สัญญา และ Partner API ──

export async function loadJob(conn, jobId, { lock = false } = {}) {
  const [[job]] = await conn.query(`SELECT * FROM jobs WHERE job_id = ? ${lock ? 'FOR UPDATE' : ''}`, [jobId]);
  if (!job) throw new HttpError(404, 'JOB_NOT_FOUND', 'ไม่พบงาน');
  return job;
}

// USER เห็นเฉพาะงานที่ตัวเองแจ้ง, TECHNICIAN เห็นเฉพาะงานที่ถูกมอบหมาย
export async function assertCanView(conn, job, user) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'USER' && job.requester_id === user.id) return;
  if (user.role === 'TECHNICIAN' && (await assignment(conn, job.job_id, user.id))) return;
  throw new HttpError(404, 'JOB_NOT_FOUND', 'ไม่พบงาน');
}

export async function assignment(conn, jobId, technicianId) {
  const [[row]] = await conn.query('SELECT * FROM job_assignments WHERE job_id = ? AND technician_id = ?', [jobId, technicianId]);
  return row;
}

export function assertStatus(job, ...allowed) {
  if (!allowed.includes(job.status)) {
    throw new HttpError(409, 'INVALID_STATUS', `ทำรายการนี้ไม่ได้ขณะงานอยู่สถานะ ${job.status}`);
  }
}

// trigger trg_jobs_after_update บันทึกประวัติ + ใส่ webhook ให้พาร์ทเนอร์เอง
export async function moveStatus(conn, job, to, remark = null) {
  await conn.query('SET @status_remark = ?', [remark]);
  await conn.query(
    `UPDATE jobs SET status = ?, completed_at = IF(? = 'COMPLETED', NOW(), completed_at) WHERE job_id = ?`,
    [to, to, job.job_id],
  );
  job.status = to;
}

// webhook นอกเหนือจากการเปลี่ยนสถานะ (เช่น ผลตรวจห้อง, ส่งสัญญา)
export async function enqueueWebhook(conn, job, event, data) {
  if (!job.partner_id) return;
  const payload = {
    event, jobCode: job.job_code, externalRef: job.external_ref, ...data,
    occurredAt: new Date().toISOString(),
  };
  await conn.query('INSERT INTO webhook_deliveries (partner_id, job_id, event, payload) VALUES (?, ?, ?, ?)', [
    job.partner_id, job.job_id, event, JSON.stringify(payload),
  ]);
}

export async function getJobDetail(jobId) {
  const q = (sql) => pool.query(sql, [jobId]).then(([rows]) => rows.map(camel));
  const [[job]] = await pool.query(
    `SELECT j.*, u.code AS unit_code, u.unit_type, u.floor, u.size_sqm, b.building_id, b.name AS building_name, b.address,
            p.name AS partner_name
     FROM jobs j JOIN units u ON u.unit_id = j.unit_id JOIN buildings b ON b.building_id = u.building_id
     LEFT JOIN partners p ON p.partner_id = j.partner_id WHERE j.job_id = ?`,
    [jobId],
  );
  const [assignments, surveys, surveyItems, contracts, contractItems, invoices, workLogs, statusLogs] = await Promise.all([
    q('SELECT * FROM job_assignments WHERE job_id = ? ORDER BY is_lead DESC, assigned_at'),
    q('SELECT * FROM site_surveys WHERE job_id = ? ORDER BY survey_id'),
    q('SELECT i.* FROM survey_items i JOIN site_surveys s ON s.survey_id = i.survey_id WHERE s.job_id = ? ORDER BY i.item_id'),
    q('SELECT * FROM contracts WHERE job_id = ? ORDER BY contract_id'),
    q('SELECT i.* FROM contract_items i JOIN contracts c ON c.contract_id = i.contract_id WHERE c.job_id = ? ORDER BY i.item_id'),
    q('SELECT v.* FROM invoices v JOIN contracts c ON c.contract_id = v.contract_id WHERE c.job_id = ? ORDER BY v.contract_id, v.installment_no'),
    q('SELECT * FROM work_logs WHERE job_id = ? ORDER BY work_date DESC, log_id DESC'),
    q('SELECT * FROM job_status_logs WHERE job_id = ? ORDER BY created_at, log_id'),
  ]);
  return {
    ...camel(job),
    assignments,
    surveys: surveys.map((s) => ({ ...s, items: surveyItems.filter((i) => i.surveyId === s.surveyId) })),
    contracts: contracts.map((c) => ({
      ...c,
      items: contractItems.filter((i) => i.contractId === c.contractId),
      invoices: invoices.filter((v) => v.contractId === c.contractId),
    })),
    workLogs,
    statusLogs,
  };
}

// ยอดงวดตามประเภทสัญญา: DAILY = มัดจำ 30% + ส่วนที่เหลือเมื่อจบงาน, MONTHLY = งวดละเดือน งวดแรกรวมค่าวัสดุ
export function buildInstallments(c) {
  const addMonths = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10);
  };
  if (c.billing_type === 'DAILY') {
    const deposit = Math.round(c.total_amount * 0.3 * 100) / 100;
    return [
      { description: 'งวดที่ 1: มัดจำ 30%', dueDate: c.start_date, amount: deposit },
      { description: 'งวดที่ 2: ส่วนที่เหลือเมื่อส่งมอบงาน', dueDate: c.end_date, amount: Math.round((c.total_amount - deposit) * 100) / 100 },
    ];
  }
  return Array.from({ length: c.period_qty }, (_, i) => ({
    description: i === 0 ? 'งวดที่ 1: ค่าแรงเดือนที่ 1 + ค่าวัสดุ' : `งวดที่ ${i + 1}: ค่าแรงเดือนที่ ${i + 1}`,
    dueDate: addMonths(c.start_date, i),
    amount: Number(c.rate) + (i === 0 ? Number(c.material_amount) : 0),
  })).filter((v) => v.amount > 0);
}
