import { pool } from './db.js';

// ฝั่งที่ "เรา" เรียก API ของระบบจองห้องพัก (server คุยกับ server)
// ใช้ partners.api_base_url + outbound_api_key ส่งใน X-API-Key — database ของแต่ละระบบแยกกัน คุยกันผ่าน HTTP เท่านั้น
//
// สิ่งที่พาร์ทเนอร์ต้องเปิดให้:
//   GET {api_base_url}/buildings/{buildingExternalRef}/owner  →  { "name": "...", "phone": "...", "email": "..." }

async function callPartner(partner, path) {
  if (!partner.api_base_url || !partner.outbound_api_key) throw new Error('partner has no api_base_url / outbound_api_key');
  const r = await fetch(`${partner.api_base_url.replace(/\/$/, '')}${path}`, {
    headers: { 'X-API-Key': partner.outbound_api_key, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ขอข้อมูลติดต่อเจ้าของหอของงาน STRUCTURAL แล้วเก็บสำเนาใน owner_contacts
// ไม่ throw: เรียกไม่สำเร็จจะบันทึก fetch_error ไว้ให้แอดมินกด "ขอข้อมูลใหม่" หรือกรอกเอง
export async function fetchOwnerContact(jobId) {
  const [[row]] = await pool.query(
    `SELECT p.*, b.external_ref AS building_ref
     FROM jobs j JOIN partners p ON p.partner_id = j.partner_id
     JOIN units u ON u.unit_id = j.unit_id JOIN buildings b ON b.building_id = u.building_id
     WHERE j.job_id = ?`,
    [jobId],
  );
  if (!row?.building_ref) return null;
  try {
    const owner = await callPartner(row, `/buildings/${encodeURIComponent(row.building_ref)}/owner`);
    if (!owner?.name || !owner?.phone) throw new Error('response missing name/phone');
    await pool.query(
      `UPDATE owner_contacts SET owner_name = ?, owner_phone = ?, owner_email = ?, source = 'PARTNER_API',
              fetch_error = NULL, fetched_at = NOW() WHERE job_id = ?`,
      [String(owner.name).slice(0, 150), String(owner.phone).slice(0, 20), owner.email ? String(owner.email).slice(0, 150) : null, jobId],
    );
    return owner;
  } catch (err) {
    await pool.query('UPDATE owner_contacts SET fetch_error = ? WHERE job_id = ?', [String(err.message).slice(0, 500), jobId]);
    return null;
  }
}
