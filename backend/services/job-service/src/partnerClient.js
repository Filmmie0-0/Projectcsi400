import { pool } from './db.js';

// ฝั่งที่ "เรา" เรียก API ของระบบจองห้องพัก / หอพัก (server คุยกับ server)
// ใช้ partners.api_base_url + outbound_api_key — database ของแต่ละระบบแยกกัน คุยกันผ่าน HTTP เท่านั้น
//
// Endpoint เจ้าของหอ (ทั้ง Partner API เดิม และ Repair API v1 ของหอพัก):
//   GET {api_base_url}/buildings/{buildingExternalRef}/owner  →  { "name": "...", "phone": "...", "email": "..." }

async function callPartner(partner, path) {
  if (!partner.api_base_url || !partner.outbound_api_key) throw new Error('partner has no api_base_url / outbound_api_key');
  const headers = { Accept: 'application/json' };
  if (partner.integration_mode === 'REPAIR_API_V1') headers['X-Repair-Api-Key'] = partner.outbound_api_key;
  else headers['X-API-Key'] = partner.outbound_api_key;

  const r = await fetch(`${partner.api_base_url.replace(/\/+$/, '')}${path}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const errBody = await r.json();
      if (errBody?.message) msg = `${errBody.code ? `${errBody.code}: ` : ''}${errBody.message}`;
    } catch { /* ignore non-JSON */ }
    throw new Error(msg);
  }
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
  const ref = row?.building_ref && !row.building_ref.startsWith('DORM-')
    ? row.building_ref
    : row?.default_building_ref || row?.building_ref;
  if (!row || !ref) return null;

  try {
    const raw = await callPartner(row, `/buildings/${encodeURIComponent(ref)}/owner`);
    const owner = raw?.owner ?? raw;
    if (!owner?.name || !owner?.phone) throw new Error('response missing name/phone');
    await pool.query(
      `UPDATE owner_contacts SET owner_name = ?, owner_phone = ?, owner_email = ?, source = 'PARTNER_API',
              fetch_error = NULL, fetched_at = NOW() WHERE job_id = ?`,
      [String(owner.name).slice(0, 150), String(owner.phone).slice(0, 20), owner.email ? String(owner.email).slice(0, 150) : null, jobId],
    );
    if (row.integration_mode === 'REPAIR_API_V1') {
      await pool.query(
        `INSERT INTO partner_sync_logs (partner_id, job_id, remote_job_id, direction, action, status, http_status, detail)
         VALUES (?, ?, ?, 'OUTBOUND_OWNER', ?, 'OK', 200, ?)`,
        [row.partner_id, jobId, row.remote_job_id ?? null, `GET /buildings/${ref}/owner`, JSON.stringify(owner)],
      );
    }
    return owner;
  } catch (err) {
    await pool.query('UPDATE owner_contacts SET fetch_error = ? WHERE job_id = ?', [String(err.message).slice(0, 500), jobId]);
    if (row.integration_mode === 'REPAIR_API_V1') {
      await pool.query(
        `INSERT INTO partner_sync_logs (partner_id, job_id, remote_job_id, direction, action, status, error_message)
         VALUES (?, ?, ?, 'OUTBOUND_OWNER', ?, 'ERROR', ?)`,
        [row.partner_id, jobId, row.remote_job_id ?? null, `GET /buildings/${ref}/owner`, String(err.message).slice(0, 500)],
      );
    }
    return null;
  }
}

export async function fetchBuildingOwnerByRef(partner, buildingRef) {
  const raw = await callPartner(partner, `/buildings/${encodeURIComponent(buildingRef)}/owner`);
  return raw?.owner ?? raw;
}
