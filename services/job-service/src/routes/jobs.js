import { Router } from 'express';
import { pool, tx, nextCode } from '../db.js';
import { HttpError, camel, currentUser, requireRole } from '../http.js';
import { assertCanView, assertStatus, assignment, enqueueWebhook, getJobDetail, loadJob, moveStatus } from '../jobs.js';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const JOB_TYPES = ['INSPECTION', 'RENOVATION'];
const UNIT_TYPES = ['ROOM', 'COMMON', 'UNDER_BUILDING'];
const CONDITIONS = ['GOOD', 'FAIR', 'DAMAGED', 'MISSING'];
const ACTIONS = ['NONE', 'REPAIR', 'REPLACE'];

export const router = Router();

// ── ตึก / ห้อง ──
router.get('/api/buildings', requireRole('ADMIN', 'USER'), async (req, res) => {
  const user = currentUser(req);
  const [buildings] = await pool.query(
    `SELECT * FROM buildings ${user.role === 'USER' ? 'WHERE owner_user_id = ?' : ''} ORDER BY name`,
    [user.id],
  );
  const [units] = await pool.query('SELECT * FROM units ORDER BY code');
  res.json(buildings.map((b) => ({
    ...camel(b),
    units: units.filter((u) => u.building_id === b.building_id).map(camel),
  })));
});

router.post('/api/buildings', requireRole('USER'), async (req, res) => {
  const { name, address, units = [] } = req.body;
  if (!name?.trim() || !address?.trim()) throw new HttpError(422, 'VALIDATION', 'กรอกชื่อตึกและที่อยู่');
  const id = await tx(currentUser(req).id, async (conn) => {
    const [r] = await conn.query('INSERT INTO buildings (owner_user_id, name, address) VALUES (?, ?, ?)', [
      currentUser(req).id, name.trim(), address.trim(),
    ]);
    for (const u of units) await insertUnit(conn, r.insertId, u);
    return r.insertId;
  });
  res.status(201).json({ buildingId: id });
});

router.post('/api/buildings/:id/units', requireRole('USER'), async (req, res) => {
  const [[b]] = await pool.query('SELECT * FROM buildings WHERE building_id = ? AND owner_user_id = ?', [
    req.params.id, currentUser(req).id,
  ]);
  if (!b) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบตึก');
  const unitId = await insertUnit(pool, b.building_id, req.body);
  res.status(201).json({ unitId });
});

async function insertUnit(conn, buildingId, { unitType = 'ROOM', code, floor, sizeSqm }) {
  if (!code?.trim() || !UNIT_TYPES.includes(unitType)) throw new HttpError(422, 'VALIDATION', 'ข้อมูลห้อง/พื้นที่ไม่ถูกต้อง');
  const [r] = await conn.query('INSERT INTO units (building_id, unit_type, code, floor, size_sqm) VALUES (?, ?, ?, ?, ?)', [
    buildingId, unitType, code.trim(), floor || null, sizeSqm || null,
  ]);
  return r.insertId;
}

// ── งาน ──
router.get('/api/jobs', async (req, res) => {
  const user = currentUser(req);
  const where = [];
  const params = [];
  if (user.role === 'USER') { where.push('j.requester_id = ?'); params.push(user.id); }
  if (user.role === 'TECHNICIAN') {
    where.push('EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id = j.job_id AND a.technician_id = ?)');
    params.push(user.id);
  }
  if (req.query.status) { where.push('j.status = ?'); params.push(req.query.status); }
  if (req.query.type) { where.push('j.job_type = ?'); params.push(req.query.type); }
  const [rows] = await pool.query(
    `SELECT j.job_id, j.job_code, j.job_type, j.source, j.title, j.priority, j.status, j.preferred_date, j.created_at,
            u.code AS unit_code, u.unit_type, b.name AS building_name, p.name AS partner_name,
            (SELECT technician_name FROM job_assignments a WHERE a.job_id = j.job_id AND a.is_lead = 1 LIMIT 1) AS lead_technician,
            (SELECT scheduled_date FROM site_surveys s WHERE s.job_id = j.job_id AND s.status = 'SCHEDULED' LIMIT 1) AS survey_date,
            (SELECT MAX(progress_pct) FROM work_logs w WHERE w.job_id = j.job_id) AS progress_pct
     FROM jobs j JOIN units u ON u.unit_id = j.unit_id JOIN buildings b ON b.building_id = u.building_id
     LEFT JOIN partners p ON p.partner_id = j.partner_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(j.status, 'COMPLETED', 'CANCELLED'), j.priority = 'URGENT' DESC, j.created_at DESC`,
    params,
  );
  res.json(rows.map(camel));
});

router.post('/api/jobs', requireRole('USER'), async (req, res) => {
  const user = currentUser(req);
  const { unitId, jobType, title, description, priority = 'NORMAL', preferredDate, contactName, contactPhone } = req.body;
  if (!JOB_TYPES.includes(jobType) || !title?.trim()) throw new HttpError(422, 'VALIDATION', 'เลือกประเภทงานและกรอกหัวข้อ');
  const [[unit]] = await pool.query(
    'SELECT u.unit_id FROM units u JOIN buildings b ON b.building_id = u.building_id WHERE u.unit_id = ? AND b.owner_user_id = ?',
    [unitId, user.id],
  );
  if (!unit) throw new HttpError(422, 'VALIDATION', 'ไม่พบห้อง/พื้นที่ของคุณ');
  const job = await tx(user.id, async (conn) => {
    const code = await nextCode(conn, 'jobs', 'job_code', 'JB');
    const [r] = await conn.query(
      `INSERT INTO jobs (job_code, job_type, unit_id, requester_id, title, description, priority, preferred_date, contact_name, contact_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, jobType, unitId, user.id, title.trim(), description ?? null, priority, preferredDate || null,
       contactName || user.name, contactPhone ?? null],
    );
    return { jobId: r.insertId, jobCode: code };
  });
  res.status(201).json(job);
});

router.get('/api/jobs/:id', async (req, res) => {
  const job = await loadJob(pool, req.params.id);
  await assertCanView(pool, job, currentUser(req));
  res.json(await getJobDetail(job.job_id));
});

// NEW: มอบหมายช่าง + นัดวันประเมินหน้างาน (ช่างหัวหน้าเป็นคนประเมิน)
// สถานะอื่นก่อนจบงาน: เพิ่ม/เปลี่ยนทีมช่างอย่างเดียว
router.post('/api/jobs/:id/assign', requireRole('ADMIN'), async (req, res) => {
  const { technicianIds = [], leadId, scheduledDate } = req.body;
  if (!technicianIds.length || !technicianIds.includes(leadId)) throw new HttpError(422, 'VALIDATION', 'เลือกช่างและหัวหน้าช่าง');

  const techs = await Promise.all(technicianIds.map(async (id) => {
    const r = await fetch(`${AUTH_SERVICE_URL}/internal/users/${id}`);
    if (!r.ok) throw new HttpError(r.status === 404 ? 422 : 502, 'TECHNICIAN_NOT_FOUND', `ไม่พบช่างรหัส ${id}`);
    const u = await r.json();
    if (u.role !== 'TECHNICIAN' || u.status !== 'ACTIVE') throw new HttpError(422, 'VALIDATION', `${u.fullName} ไม่ใช่ช่างที่ใช้งานอยู่`);
    return u;
  }));

  await tx(currentUser(req).id, async (conn) => {
    const job = await loadJob(conn, req.params.id, { lock: true });
    assertStatus(job, 'NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED', 'CONTRACTED', 'IN_PROGRESS');
    if (job.status === 'NEW' && !scheduledDate) throw new HttpError(422, 'VALIDATION', 'กรุณาระบุวันนัดประเมินหน้างาน');

    await conn.query('DELETE FROM job_assignments WHERE job_id = ?', [job.job_id]);
    for (const t of techs) {
      await conn.query('INSERT INTO job_assignments (job_id, technician_id, technician_name, is_lead) VALUES (?, ?, ?, ?)', [
        job.job_id, t.userId, t.fullName, t.userId === leadId ? 1 : 0,
      ]);
    }
    if (job.status === 'NEW') {
      await conn.query('INSERT INTO site_surveys (job_id, survey_type, technician_id, scheduled_date) VALUES (?, ?, ?, ?)', [
        job.job_id, 'INITIAL', leadId, scheduledDate,
      ]);
      await moveStatus(conn, job, 'SURVEY_ASSIGNED', `นัดประเมินหน้างาน ${scheduledDate}`);
    }
  });
  res.json(await getJobDetail(Number(req.params.id)));
});

// ช่างส่งผลประเมิน: SURVEY_ASSIGNED → SURVEYED (ครั้งแรก) หรือแจ้งงานเพิ่มระหว่างทำ (ADDITIONAL → ใช้ทำสัญญาเพิ่มเติม)
router.post('/api/jobs/:id/surveys', requireRole('TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const { summary, estDays, needRepair, items = [] } = req.body;
  if (!summary?.trim() || !(Number(estDays) > 0)) throw new HttpError(422, 'VALIDATION', 'กรอกสรุปผลและจำนวนวันที่ประเมิน');
  for (const i of items) {
    if (!i.area || !i.item || !CONDITIONS.includes(i.itemCondition) || !ACTIONS.includes(i.action ?? 'NONE')) {
      throw new HttpError(422, 'VALIDATION', 'รายการตรวจไม่ครบ');
    }
  }

  await tx(user.id, async (conn) => {
    const job = await loadJob(conn, req.params.id, { lock: true });
    if (!(await assignment(conn, job.job_id, user.id))) throw new HttpError(403, 'FORBIDDEN', 'คุณไม่ได้รับมอบหมายงานนี้');
    assertStatus(job, 'SURVEY_ASSIGNED', 'CONTRACTED', 'IN_PROGRESS');

    let surveyId;
    if (job.status === 'SURVEY_ASSIGNED') {
      const [[s]] = await conn.query(
        `SELECT survey_id FROM site_surveys WHERE job_id = ? AND survey_type = 'INITIAL' AND status = 'SCHEDULED'`, [job.job_id]);
      surveyId = s.survey_id;
      await conn.query(
        `UPDATE site_surveys SET status = 'SUBMITTED', technician_id = ?, summary = ?, est_days = ?, need_repair = ?, submitted_at = NOW()
         WHERE survey_id = ?`,
        [user.id, summary.trim(), estDays, needRepair ? 1 : 0, surveyId],
      );
    } else {
      const [r] = await conn.query(
        `INSERT INTO site_surveys (job_id, survey_type, technician_id, status, summary, est_days, need_repair, submitted_at)
         VALUES (?, 'ADDITIONAL', ?, 'SUBMITTED', ?, ?, 1, NOW())`,
        [job.job_id, user.id, summary.trim(), estDays],
      );
      surveyId = r.insertId;
    }
    for (const i of items) {
      await conn.query(
        `INSERT INTO survey_items (survey_id, area, item, item_condition, action, est_cost, note, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [surveyId, i.area, i.item, i.itemCondition, i.action ?? 'NONE', i.estCost ?? 0, i.note || null, i.photoUrl || null],
      );
    }

    await enqueueWebhook(conn, job, 'survey.submitted', {
      surveyType: job.status === 'SURVEY_ASSIGNED' ? 'INITIAL' : 'ADDITIONAL',
      summary: summary.trim(), needRepair: Boolean(needRepair), estDays: Number(estDays),
      items: items.map(({ area, item, itemCondition, action }) => ({ area, item, condition: itemCondition, action })),
    });

    if (job.status === 'SURVEY_ASSIGNED') {
      await moveStatus(conn, job, 'SURVEYED');
      if (job.job_type === 'INSPECTION' && !needRepair) await moveStatus(conn, job, 'COMPLETED', 'ตรวจแล้วไม่พบจุดที่ต้องซ่อม');
    }
  });
  res.status(201).json(await getJobDetail(Number(req.params.id)));
});

// หัวหน้าช่าง/แอดมินเริ่มงานหลังลูกค้าเซ็นสัญญา
router.post('/api/jobs/:id/start', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  await tx(user.id, async (conn) => {
    const job = await loadJob(conn, req.params.id, { lock: true });
    await assertLeadOrAdmin(conn, job, user);
    assertStatus(job, 'CONTRACTED');
    await moveStatus(conn, job, 'IN_PROGRESS');
  });
  res.json(await getJobDetail(Number(req.params.id)));
});

router.post('/api/jobs/:id/work-logs', requireRole('TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const { workDate, hours, progressPct, note, photoUrl } = req.body;
  if (!workDate || !note?.trim()) throw new HttpError(422, 'VALIDATION', 'กรอกวันที่และรายละเอียดงาน');
  await tx(user.id, async (conn) => {
    const job = await loadJob(conn, req.params.id);
    const a = await assignment(conn, job.job_id, user.id);
    if (!a) throw new HttpError(403, 'FORBIDDEN', 'คุณไม่ได้รับมอบหมายงานนี้');
    assertStatus(job, 'IN_PROGRESS');
    await conn.query(
      `INSERT INTO work_logs (job_id, technician_id, technician_name, work_date, hours, progress_pct, note, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [job.job_id, user.id, a.technician_name, workDate, hours, progressPct, note.trim(), photoUrl || null],
    );
    await enqueueWebhook(conn, job, 'job.progress', { progressPct: Number(progressPct), workDate, note: note.trim() });
  });
  res.status(201).json(await getJobDetail(Number(req.params.id)));
});

// ปิดงาน: งานซ่อม/รีโนเวทที่ทำเสร็จ หรือแอดมินปิดงานตรวจห้องที่ลูกค้าไม่ต้องการซ่อม
router.post('/api/jobs/:id/complete', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  await tx(user.id, async (conn) => {
    const job = await loadJob(conn, req.params.id, { lock: true });
    await assertLeadOrAdmin(conn, job, user);
    if (job.status === 'SURVEYED' && job.job_type === 'INSPECTION' && user.role === 'ADMIN') {
      await moveStatus(conn, job, 'COMPLETED', req.body.remark || 'ส่งผลตรวจห้องแล้ว ไม่มีงานซ่อม');
      return;
    }
    assertStatus(job, 'IN_PROGRESS');
    const [[pending]] = await conn.query(
      `SELECT COUNT(*) AS n FROM contracts WHERE job_id = ? AND status IN ('DRAFT','SENT')`, [job.job_id]);
    if (pending.n > 0) throw new HttpError(409, 'CONTRACT_PENDING', 'ยังมีสัญญาเพิ่มเติมที่รอลูกค้าเซ็น');
    await moveStatus(conn, job, 'COMPLETED', req.body.remark || null);
  });
  res.json(await getJobDetail(Number(req.params.id)));
});

// ลูกค้ายกเลิกได้ก่อนเซ็นสัญญา แอดมินยกเลิกได้ทุกสถานะก่อนจบงาน
router.post('/api/jobs/:id/cancel', requireRole('ADMIN', 'USER'), async (req, res) => {
  const user = currentUser(req);
  await tx(user.id, async (conn) => {
    const job = await loadJob(conn, req.params.id, { lock: true });
    await assertCanView(conn, job, user);
    if (user.role === 'USER') assertStatus(job, 'NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED');
    else assertStatus(job, 'NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED', 'CONTRACTED', 'IN_PROGRESS');
    await cancelJob(conn, job, req.body.reason || null);
  });
  res.json(await getJobDetail(Number(req.params.id)));
});

export async function cancelJob(conn, job, reason) {
  await conn.query(`UPDATE contracts SET status = 'CANCELLED' WHERE job_id = ? AND status IN ('DRAFT','SENT')`, [job.job_id]);
  await moveStatus(conn, job, 'CANCELLED', reason);
}

async function assertLeadOrAdmin(conn, job, user) {
  if (user.role === 'ADMIN') return;
  const a = await assignment(conn, job.job_id, user.id);
  if (!a?.is_lead) throw new HttpError(403, 'FORBIDDEN', 'เฉพาะหัวหน้าช่างของงานนี้');
}
