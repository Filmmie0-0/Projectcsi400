import { pool, tx, nextCode } from './db.js';
import { HttpError } from './http.js';
import { fetchOwnerContact } from './partnerClient.js';

export const WORK_SCOPES = ['INTERIOR', 'STRUCTURAL'];

// สร้างงานจากพาร์ทเนอร์ (ใช้ร่วมกันระหว่าง POST /api/partner/v1/jobs และตัวแปลง webhook ของหอพัก)
// upsert ตึก/ห้องตาม externalRef แล้วสร้างงาน — externalRef ของงานซ้ำ = คืนงานเดิม (idempotent)
// workScope: INTERIOR (ค่าเริ่มต้น) = เริ่มได้เลย, STRUCTURAL = ต้องได้ข้อมูลเจ้าของหอ + เจ้าของหออนุมัติก่อน
//   ถ้าไม่ส่ง owner มาด้วย เราจะไปขอจาก GET {api_base_url}/buildings/{ref}/owner ของพาร์ทเนอร์เอง
export async function createPartnerJob(p, input) {
  const {
    externalRef, jobType, building, unit, title, description, priority = 'NORMAL', preferredDate, contact = {},
    workScope = 'INTERIOR', owner,
  } = input;
  if (!externalRef || !['INSPECTION', 'RENOVATION'].includes(jobType) || !title || !building?.externalRef || !unit?.code) {
    throw new HttpError(422, 'VALIDATION', 'ต้องมี externalRef, jobType, title, building.externalRef และ unit.code');
  }
  if (!WORK_SCOPES.includes(workScope)) throw new HttpError(422, 'VALIDATION', 'workScope ต้องเป็น INTERIOR หรือ STRUCTURAL');
  const structural = workScope === 'STRUCTURAL';
  const ownerInPayload = Boolean(structural && owner?.name && owner?.phone);

  const [[existing]] = await pool.query('SELECT * FROM jobs WHERE partner_id = ? AND external_ref = ?', [p.partner_id, externalRef]);
  if (existing) return { job: existing, created: false };

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
    await conn.query('SET @status_remark = ?', [`รับงานจาก ${p.name}${structural ? ' (งานโครงสร้าง รอเจ้าของหออนุมัติ)' : ''}`]);
    const [r] = await conn.query(
      `INSERT INTO jobs (job_code, job_type, source, partner_id, external_ref, unit_id, requester_id, title, description,
                         priority, preferred_date, contact_name, contact_phone, work_scope, owner_approval)
       VALUES (?, ?, 'PARTNER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, jobType, p.partner_id, externalRef, u.unit_id, p.owner_user_id, title, description ?? null,
       priority, preferredDate || null, contact.name ?? null, contact.phone ?? null,
       workScope, structural ? 'PENDING' : 'NOT_REQUIRED'],
    );
    if (structural) {
      await conn.query(
        'INSERT INTO owner_contacts (job_id, owner_name, owner_phone, owner_email, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
        ownerInPayload
          ? [r.insertId, String(owner.name).slice(0, 150), String(owner.phone).slice(0, 20), owner.email ?? null, 'PAYLOAD', new Date()]
          : [r.insertId, null, null, null, null, null],
      );
    }
    return r.insertId;
  });
  // เรียก API พาร์ทเนอร์หลัง commit (ไม่ถือ transaction ค้างระหว่างรอ network)
  if (structural && !ownerInPayload) await fetchOwnerContact(jobId);
  const [[job]] = await pool.query('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
  return { job, created: true };
}

