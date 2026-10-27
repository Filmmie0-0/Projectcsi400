import express from 'express';
import { pool, tx, nextCode } from './db.js';
import { HttpError, camel, currentUser, errorHandler, requireRole } from './http.js';

const SERVICE = 'inventory-service';
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL ?? 'http://localhost:4002';
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

// ── วัสดุ (/api/materials) ทุก role อ่านได้ (ช่างใช้เลือกของตอนเบิก, แอดมินใช้ตอนทำสัญญา) ──
app.get('/api/materials', async (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const [rows] = await pool.query(
    `SELECT *, stock_on_hand <= reorder_level AS is_low_stock FROM materials
     WHERE is_active = 1 ${q ? 'AND (name LIKE ? OR sku LIKE ?)' : ''} ORDER BY category, name`,
    q ? [q, q] : [],
  );
  res.json(rows.map((r) => ({ ...camel(r), isLowStock: Boolean(r.is_low_stock) })));
});

app.post('/api/materials', requireRole('ADMIN'), async (req, res) => {
  const { sku, name, category, unit, unitCost = 0, reorderLevel = 0 } = req.body;
  if (!sku?.trim() || !name?.trim() || !category?.trim() || !unit?.trim()) throw new HttpError(422, 'VALIDATION', 'กรอก SKU ชื่อ หมวด และหน่วย');
  const [r] = await pool.query(
    'INSERT INTO materials (sku, name, category, unit, unit_cost, reorder_level) VALUES (?, ?, ?, ?, ?, ?)',
    [sku.trim().toUpperCase(), name.trim(), category.trim(), unit.trim(), unitCost, reorderLevel],
  );
  res.status(201).json({ materialId: r.insertId });
});

// แก้ข้อมูลทั่วไปเท่านั้น สต็อกต้องเปลี่ยนผ่าน /api/stock/*
app.patch('/api/materials/:id', requireRole('ADMIN'), async (req, res) => {
  const { name, category, unit, unitCost, reorderLevel, isActive } = req.body;
  await pool.query(
    `UPDATE materials SET name = COALESCE(?, name), category = COALESCE(?, category), unit = COALESCE(?, unit),
       unit_cost = COALESCE(?, unit_cost), reorder_level = COALESCE(?, reorder_level), is_active = COALESCE(?, is_active)
     WHERE material_id = ?`,
    [name ?? null, category ?? null, unit ?? null, unitCost ?? null, reorderLevel ?? null,
     isActive === undefined ? null : Number(Boolean(isActive)), req.params.id],
  );
  res.json({ ok: true });
});

// ── สต็อก ──
app.post('/api/stock/in', requireRole('ADMIN'), async (req, res) => {
  const { materialId, qty, unitCost, note } = req.body;
  if (!(Number(qty) > 0)) throw new HttpError(422, 'VALIDATION', 'จำนวนต้องมากกว่า 0');
  await pool.query(
    `INSERT INTO stock_movements (material_id, movement_type, qty, unit_cost, note, created_by) VALUES (?, 'IN', ?, ?, ?, ?)`,
    [materialId, qty, unitCost ?? null, note || null, currentUser(req).id],
  );
  res.status(201).json({ ok: true });
});

app.post('/api/stock/adjust', requireRole('ADMIN'), async (req, res) => {
  const { materialId, qty, note } = req.body;
  if (!Number.isInteger(Number(qty)) || Number(qty) === 0 || !note?.trim()) throw new HttpError(422, 'VALIDATION', 'ระบุจำนวน (+/-) และเหตุผล');
  await pool.query(
    `INSERT INTO stock_movements (material_id, movement_type, qty, note, created_by) VALUES (?, 'ADJUST', ?, ?, ?)`,
    [materialId, qty, note.trim(), currentUser(req).id],
  );
  res.status(201).json({ ok: true });
});

app.get('/api/stock/movements', requireRole('ADMIN'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT m.*, t.sku, t.name AS material_name, t.unit, r.req_code, r.job_code
     FROM stock_movements m JOIN materials t ON t.material_id = m.material_id
     LEFT JOIN requisitions r ON r.requisition_id = m.requisition_id
     ${req.query.materialId ? 'WHERE m.material_id = ?' : ''}
     ORDER BY m.movement_id DESC LIMIT 200`,
    req.query.materialId ? [req.query.materialId] : [],
  );
  res.json(rows.map(camel));
});

// ── ใบเบิกวัสดุ (/api/requisitions) ──
async function listRequisitions(where, params) {
  const [reqs] = await pool.query(
    `SELECT * FROM requisitions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY FIELD(status, 'PENDING', 'ISSUED', 'CLOSED', 'REJECTED'), requisition_id DESC`,
    params,
  );
  if (!reqs.length) return [];
  const [items] = await pool.query(
    `SELECT i.*, m.sku, m.name AS material_name, m.unit, m.stock_on_hand
     FROM requisition_items i JOIN materials m ON m.material_id = i.material_id
     WHERE i.requisition_id IN (?) ORDER BY i.item_id`,
    [reqs.map((r) => r.requisition_id)],
  );
  return reqs.map((r) => ({
    ...camel(r),
    items: items.filter((i) => i.requisition_id === r.requisition_id).map(camel),
  }));
}

// ADMIN เห็นทั้งหมด, TECHNICIAN เห็นของตัวเอง หรือทั้งงานถ้าส่ง jobId (ตรวจกับ job-service ว่าเป็นช่างของงานนั้น)
app.get('/api/requisitions', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const where = [];
  const params = [];
  if (req.query.jobId) {
    if (user.role === 'TECHNICIAN') {
      const job = await fetchJob(req.query.jobId);
      if (!job.technicianIds.includes(user.id)) throw new HttpError(403, 'FORBIDDEN', 'คุณไม่ได้รับมอบหมายงานนี้');
    }
    where.push('job_id = ?');
    params.push(req.query.jobId);
  } else if (user.role === 'TECHNICIAN') {
    where.push('technician_id = ?');
    params.push(user.id);
  }
  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  res.json(await listRequisitions(where, params));
});

app.get('/api/requisitions/job-cost/:jobId', requireRole('ADMIN'), async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_job_material_cost WHERE job_id = ?', [req.params.jobId]);
  res.json(row ? camel(row) : { jobId: Number(req.params.jobId), requisitions: 0, materialCost: 0 });
});

// ช่างเบิกได้เฉพาะงานที่ได้รับมอบหมายและเซ็นสัญญาแล้ว
app.post('/api/requisitions', requireRole('TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const { jobId, note, items = [] } = req.body;
  const lines = items.filter((i) => Number(i.qty) > 0);
  if (!lines.length) throw new HttpError(422, 'VALIDATION', 'เลือกวัสดุอย่างน้อย 1 รายการ');
  if (new Set(lines.map((i) => i.materialId)).size !== lines.length) throw new HttpError(422, 'VALIDATION', 'มีวัสดุซ้ำในใบเบิก');

  const job = await fetchJob(jobId);
  if (!job.technicianIds.includes(user.id)) throw new HttpError(403, 'FORBIDDEN', 'คุณไม่ได้รับมอบหมายงานนี้');
  if (!['CONTRACTED', 'IN_PROGRESS'].includes(job.status)) throw new HttpError(409, 'INVALID_STATUS', 'เบิกได้หลังเซ็นสัญญาแล้วเท่านั้น');

  const created = await tx(async (conn) => {
    const code = await nextCode(conn, 'requisitions', 'req_code', 'RQ');
    const [r] = await conn.query(
      `INSERT INTO requisitions (req_code, job_id, job_code, technician_id, technician_name, note) VALUES (?, ?, ?, ?, ?, ?)`,
      [code, job.jobId, job.jobCode, user.id, user.name, note || null],
    );
    for (const i of lines) {
      await conn.query('INSERT INTO requisition_items (requisition_id, material_id, qty_requested) VALUES (?, ?, ?)', [
        r.insertId, i.materialId, i.qty,
      ]);
    }
    return { requisitionId: r.insertId, reqCode: code };
  });
  res.status(201).json(created);
});

// แอดมินอนุมัติ + จ่ายของ (จ่ายน้อยกว่าที่ขอได้) → OUT movement ทุกรายการใน transaction เดียว
app.post('/api/requisitions/:id/issue', requireRole('ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const issued = new Map((req.body.items ?? []).map((i) => [Number(i.itemId), Number(i.qtyIssued)]));
  await tx(async (conn) => {
    const r = await loadRequisition(conn, req.params.id, 'PENDING');
    const [items] = await conn.query(
      'SELECT i.*, m.unit_cost AS current_cost FROM requisition_items i JOIN materials m ON m.material_id = i.material_id WHERE i.requisition_id = ?',
      [r.requisition_id],
    );
    for (const i of items) {
      const qty = issued.has(i.item_id) ? issued.get(i.item_id) : i.qty_requested;
      if (!(qty >= 0 && qty <= i.qty_requested)) throw new HttpError(422, 'VALIDATION', 'จำนวนจ่ายต้องไม่เกินจำนวนที่ขอ');
      await conn.query('UPDATE requisition_items SET qty_issued = ?, unit_cost = ? WHERE item_id = ?', [qty, i.current_cost, i.item_id]);
      if (qty > 0) {
        await conn.query(
          `INSERT INTO stock_movements (material_id, movement_type, qty, unit_cost, requisition_id, note, created_by) VALUES (?, 'OUT', ?, ?, ?, ?, ?)`,
          [i.material_id, qty, i.current_cost, r.requisition_id, r.req_code, user.id],
        );
      }
    }
    await conn.query(`UPDATE requisitions SET status = 'ISSUED', reviewed_by = ?, reviewed_at = NOW() WHERE requisition_id = ?`, [
      user.id, r.requisition_id,
    ]);
  });
  res.json({ ok: true });
});

app.post('/api/requisitions/:id/reject', requireRole('ADMIN'), async (req, res) => {
  await tx(async (conn) => {
    const r = await loadRequisition(conn, req.params.id, 'PENDING');
    await conn.query(
      `UPDATE requisitions SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(), reject_reason = ? WHERE requisition_id = ?`,
      [currentUser(req).id, req.body.reason || null, r.requisition_id],
    );
  });
  res.json({ ok: true });
});

// ช่างคืนของเหลือแล้วปิดใบเบิก (คืน 0 = ใช้หมด) → RETURN movement
app.post('/api/requisitions/:id/close', requireRole('TECHNICIAN'), async (req, res) => {
  const user = currentUser(req);
  const returned = new Map((req.body.items ?? []).map((i) => [Number(i.itemId), Number(i.qtyReturned)]));
  await tx(async (conn) => {
    const r = await loadRequisition(conn, req.params.id, 'ISSUED');
    if (r.technician_id !== user.id) throw new HttpError(403, 'FORBIDDEN', 'ไม่ใช่ใบเบิกของคุณ');
    const [items] = await conn.query('SELECT * FROM requisition_items WHERE requisition_id = ?', [r.requisition_id]);
    for (const i of items) {
      const qty = returned.get(i.item_id) ?? 0;
      if (!(qty >= 0 && qty <= i.qty_issued)) throw new HttpError(422, 'VALIDATION', 'จำนวนคืนต้องไม่เกินจำนวนที่ได้รับ');
      if (qty === 0) continue;
      await conn.query('UPDATE requisition_items SET qty_returned = ? WHERE item_id = ?', [qty, i.item_id]);
      await conn.query(
        `INSERT INTO stock_movements (material_id, movement_type, qty, unit_cost, requisition_id, note, created_by) VALUES (?, 'RETURN', ?, ?, ?, ?, ?)`,
        [i.material_id, qty, i.unit_cost, r.requisition_id, `คืนจาก ${r.req_code}`, user.id],
      );
    }
    await conn.query(`UPDATE requisitions SET status = 'CLOSED', closed_at = NOW() WHERE requisition_id = ?`, [r.requisition_id]);
  });
  res.json({ ok: true });
});

async function loadRequisition(conn, id, expectedStatus) {
  const [[r]] = await conn.query('SELECT * FROM requisitions WHERE requisition_id = ? FOR UPDATE', [id]);
  if (!r) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบใบเบิก');
  if (r.status !== expectedStatus) throw new HttpError(409, 'INVALID_STATUS', `ใบเบิกอยู่สถานะ ${r.status}`);
  return r;
}

async function fetchJob(jobId) {
  const r = await fetch(`${JOB_SERVICE_URL}/internal/jobs/${jobId}`);
  if (r.status === 404) throw new HttpError(422, 'JOB_NOT_FOUND', 'ไม่พบงาน');
  if (!r.ok) throw new HttpError(502, 'UPSTREAM_ERROR', 'job-service ไม่พร้อมใช้งาน');
  return r.json();
}

// ── Internal ──
app.get('/internal/summary', async (_req, res) => {
  const [[row]] = await pool.query('SELECT * FROM v_inventory_summary');
  res.json(row);
});

app.use(errorHandler);

const port = Number(process.env.PORT ?? 4003);
app.listen(port, () => console.log(`${SERVICE} listening on :${port}`));
