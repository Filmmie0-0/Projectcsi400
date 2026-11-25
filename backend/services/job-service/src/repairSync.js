import { pool, tx, nextCode } from './db.js';
import { HttpError } from './http.js';
import { cancelJob, loadJob } from './jobs.js';
import { fetchOwnerContact } from './partnerClient.js';

// ───────────── เชื่อมต่อ Repair API v1 ของระบบหอพักพาร์ทเนอร์ (เช่น backend.ayasakimioweb.com) ─────────────
// Base URL: https://backend.ayasakimioweb.com/api/repair/v1
// Header: X-Repair-Api-Key: <API_KEY> (ห้ามส่ง Authorization)
// Endpoints: GET /vendor, GET /jobs?status=, GET /jobs/:id, PATCH /jobs/:id/status, GET /buildings/:ref/owner

const CATEGORY_LABELS = {
  aircon: 'ซ่อมแอร์',
  electrical: 'ซ่อมไฟฟ้า',
  plumbing: 'ซ่อมประปา',
  furniture: 'ซ่อมเฟอร์นิเจอร์',
  appliance: 'ซ่อมเครื่องใช้ไฟฟ้า',
  door: 'ซ่อมประตู/หน้าต่าง',
  lock: 'ซ่อมกุญแจ/ลูกบิด',
  door_lock: 'ซ่อมประตู/กุญแจ',
  structural: 'งานโครงสร้าง/อาคาร',
  cleaning: 'ทำความสะอาด',
  inspection: 'ตรวจสอบห้อง',
  paint: 'ทาสี',
  other: 'งานซ่อมทั่วไป',
};

const ACTIVE_REMOTE_STATUSES = new Set(['sent', 'accepted', 'in_progress']);
const TERMINAL_REMOTE_STATUSES = new Set(['done', 'rejected', 'cancelled']);
const rateLimitUntil = new Map();
const syncingPartners = new Set();

export class RepairApiError extends Error {
  constructor(httpStatus, code, message) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code ?? 'REPAIR_API_ERROR';
  }
}

function parseRetryAfterMs(headerVal) {
  if (!headerVal) return 60_000;
  const secs = Number(headerVal);
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs * 1000, 300_000);
  const dt = Date.parse(headerVal);
  if (!Number.isNaN(dt)) return Math.max(1000, Math.min(dt - Date.now(), 300_000));
  return 60_000;
}

function formatApiErrorMessage(httpStatus, code, rawMessage) {
  if (httpStatus === 401 || code === 'INVALID_API_KEY') {
    return 'API key ไม่ถูกต้อง ถูกยกเลิก หรือสัญญาซ่อมสิ้นสุดแล้ว (401 INVALID_API_KEY)';
  }
  if (httpStatus === 429 || code === 'RATE_LIMITED') {
    return `เรียก API เกินโควตา 120 ครั้ง/นาที (429 RATE_LIMITED)${rawMessage ? `: ${rawMessage}` : ''}`;
  }
  return `${httpStatus ? `HTTP ${httpStatus}` : 'NETWORK'} ${code ?? ''}: ${rawMessage || 'เชื่อมต่อไม่สำเร็จ'}`.trim();
}

export async function callRepairApi(partner, method, path, body = undefined) {
  if (!partner?.api_base_url || !partner?.outbound_api_key) {
    throw new RepairApiError(0, 'MISSING_CONFIG', 'ยังไม่ได้ตั้งค่า API Base URL หรือ API Key ของหอพัก');
  }
  const blockedUntil = rateLimitUntil.get(partner.partner_id) ?? 0;
  if (Date.now() < blockedUntil) {
    const waitSec = Math.ceil((blockedUntil - Date.now()) / 1000);
    throw new RepairApiError(429, 'RATE_LIMITED', `ติด rate limit กรุณารออีก ${waitSec} วินาที`);
  }

  const base = partner.api_base_url.replace(/\/+$/, '');
  const headers = {
    'X-Repair-Api-Key': partner.outbound_api_key,
    Accept: 'application/json',
  };
  const init = {
    method,
    headers,
    signal: AbortSignal.timeout(10000),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, init);
  } catch (err) {
    throw new RepairApiError(0, 'NETWORK_ERROR', err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์หอพักได้');
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

  if (res.status === 429) {
    rateLimitUntil.set(partner.partner_id, Date.now() + parseRetryAfterMs(res.headers.get('Retry-After')));
  }
  if (!res.ok) {
    throw new RepairApiError(res.status, data?.code, formatApiErrorMessage(res.status, data?.code, data?.message));
  }
  return { status: res.status, data };
}

async function logSync(partnerId, { jobId = null, remoteJobId = null, direction, action, status, httpStatus = null, detail = null, errorMessage = null }) {
  try {
    await pool.query(
      `INSERT INTO partner_sync_logs (partner_id, job_id, remote_job_id, direction, action, status, http_status, detail, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partnerId, jobId, remoteJobId, direction, action.slice(0, 100), status, httpStatus,
        detail ? JSON.stringify(detail) : null, errorMessage ? String(errorMessage).slice(0, 500) : null,
      ],
    );
  } catch (err) {
    console.error('logSync error:', err.message);
  }
}

export async function fetchRemoteVendor(partner) {
  try {
    const { status, data } = await callRepairApi(partner, 'GET', '/vendor');
    await logSync(partner.partner_id, {
      direction: 'OUTBOUND_VENDOR', action: 'GET /vendor', status: 'OK', httpStatus: status, detail: data,
    });
    return { vendor: data?.vendor ?? null, jobSummary: data?.job_summary ?? null };
  } catch (err) {
    await logSync(partner.partner_id, {
      direction: 'OUTBOUND_VENDOR', action: 'GET /vendor', status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: err.message,
    });
    throw new HttpError(err.httpStatus === 401 ? 422 : 502, err.code || 'PARTNER_API_ERROR', err.message);
  }
}

function mapUrgency(urgency) {
  const u = String(urgency ?? '').toLowerCase();
  if (['urgent', 'high', 'emergency', 'critical'].includes(u)) return 'URGENT';
  if (u === 'low') return 'LOW';
  return 'NORMAL';
}

function buildRepairTitle(remoteJob, roomCode) {
  if (remoteJob.title && String(remoteJob.title).trim()) return String(remoteJob.title).trim().slice(0, 200);
  const cat = String(remoteJob.category ?? 'other').trim().toLowerCase();
  const catLabel = CATEGORY_LABELS[cat] ?? (cat ? `ซ่อม (${remoteJob.category})` : 'งานซ่อม');
  return `[#${remoteJob.id}] ${catLabel} ห้อง ${roomCode}`.slice(0, 200);
}

function inferFloor(remoteJob, roomCode) {
  if (remoteJob.floor !== undefined && remoteJob.floor !== null && String(remoteJob.floor).trim()) {
    return String(remoteJob.floor).trim().slice(0, 10);
  }
  if (/^\d{3,4}$/.test(roomCode)) return roomCode.slice(0, roomCode.length - 2);
  return null;
}

function resolveBuildingInfo(partner, remoteJob) {
  const ref = String(
    remoteJob.building_ref ?? remoteJob.building?.externalRef ?? partner.default_building_ref ?? `DORM-${partner.partner_id}`,
  ).trim().slice(0, 64);
  const name = String(
    remoteJob.building_name ?? remoteJob.building?.name ?? partner.default_building_name ?? partner.name,
  ).trim().slice(0, 200);
  const address = String(
    remoteJob.building_address ?? remoteJob.building?.address ?? partner.default_building_address ?? '-',
  ).trim() || '-';
  return { ref, name, address };
}

export async function upsertRemoteRepairJob(partner, remoteJob, direction = 'INBOUND_POLL') {
  const remoteId = Number(remoteJob?.id);
  if (!Number.isInteger(remoteId) || remoteId <= 0) return { outcome: 'skipped' };

  const roomCode = String(remoteJob.room_number ?? 'ไม่ระบุ').trim().slice(0, 50) || 'ไม่ระบุ';
  const bInfo = resolveBuildingInfo(partner, remoteJob);
  const category = String(remoteJob.category ?? 'other').trim().toLowerCase();
  const jobType = category === 'inspection' ? 'INSPECTION' : 'RENOVATION';
  const workScope = (remoteJob.work_scope === 'STRUCTURAL' || category === 'structural') ? 'STRUCTURAL' : 'INTERIOR';
  const priority = mapUrgency(remoteJob.urgency);
  const title = buildRepairTitle(remoteJob, roomCode);
  const description = remoteJob.description != null ? String(remoteJob.description) : null;
  const contactPhone = remoteJob.contact_phone ? String(remoteJob.contact_phone).trim().slice(0, 20) : null;
  const contactName = String(remoteJob.contact_name || remoteJob.sent_by_name || partner.name).trim().slice(0, 150);
  const preferredDate = remoteJob.preferred_date ? String(remoteJob.preferred_date).slice(0, 10) : null;
  const remoteStatus = String(remoteJob.status ?? 'sent');
  const remoteUpdatedAt = remoteJob.details_updated_at ? String(remoteJob.details_updated_at).slice(0, 40) : null;
  const remotePayloadJson = JSON.stringify(remoteJob);
  const candidateExtRef = remoteJob.external_ref && String(remoteJob.external_ref).trim()
    ? String(remoteJob.external_ref).trim().slice(0, 64)
    : `RPR-${remoteId}`;

  let createdStructuralJobId = null;

  const result = await tx(null, async (conn) => {
    let [[existing]] = await conn.query(
      'SELECT * FROM jobs WHERE partner_id = ? AND remote_job_id = ? FOR UPDATE',
      [partner.partner_id, remoteId],
    );
    if (!existing && remoteJob.external_ref && String(remoteJob.external_ref).trim()) {
      [[existing]] = await conn.query(
        'SELECT * FROM jobs WHERE partner_id = ? AND external_ref = ? FOR UPDATE',
        [partner.partner_id, String(remoteJob.external_ref).trim().slice(0, 64)],
      );
    }

    // ถ้าเป็นงานปิด/ยกเลิกตั้งแต่ก่อนนำเข้า และยังไม่เคยอยู่ใน RenoCare ไม่ต้องสร้างงานใหม่
    if (!existing && !ACTIVE_REMOTE_STATUSES.has(remoteStatus) && direction === 'INBOUND_POLL') {
      return { outcome: 'skipped', jobId: null };
    }
    if (!existing && TERMINAL_REMOTE_STATUSES.has(remoteStatus) && direction === 'INBOUND_WEBHOOK') {
      return { outcome: 'skipped', jobId: null };
    }

    await conn.query(
      `INSERT INTO buildings (owner_user_id, partner_id, external_ref, name, address) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), address = VALUES(address)`,
      [partner.owner_user_id, partner.partner_id, bInfo.ref, bInfo.name, bInfo.address],
    );
    const [[b]] = await conn.query(
      'SELECT building_id FROM buildings WHERE partner_id = ? AND external_ref = ?',
      [partner.partner_id, bInfo.ref],
    );
    const unitType = ['ROOM', 'COMMON', 'UNDER_BUILDING'].includes(remoteJob.unit_type) ? remoteJob.unit_type : 'ROOM';
    await conn.query(
      `INSERT INTO units (building_id, unit_type, code, floor, external_ref) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE floor = COALESCE(VALUES(floor), floor), external_ref = COALESCE(VALUES(external_ref), external_ref)`,
      [b.building_id, unitType, roomCode, inferFloor(remoteJob, roomCode), remoteJob.unit_ref ? String(remoteJob.unit_ref).slice(0, 64) : null],
    );
    const [[u]] = await conn.query('SELECT unit_id FROM units WHERE building_id = ? AND code = ?', [b.building_id, roomCode]);

    if (existing) {
      const detailsChanged =
        existing.unit_id !== u.unit_id ||
        existing.title !== title ||
        (existing.description ?? null) !== description ||
        existing.priority !== priority ||
        (existing.contact_phone ?? null) !== contactPhone ||
        (existing.contact_name ?? null) !== contactName ||
        (existing.remote_details_updated_at ?? null) !== remoteUpdatedAt;
      const statusChangedRemotely = existing.remote_status !== remoteStatus;

      let outcome = 'unchanged';
      await conn.query(
        `UPDATE jobs
            SET unit_id = ?, title = ?, description = ?, priority = ?, contact_name = ?, contact_phone = ?,
                remote_job_id = ?, remote_status = ?, remote_details_updated_at = ?, remote_synced_at = NOW(), remote_payload = ?
          WHERE job_id = ?`,
        [
          u.unit_id, title, description, priority, contactName, contactPhone,
          remoteId, remoteStatus, remoteUpdatedAt, remotePayloadJson, existing.job_id,
        ],
      );

      if (remoteStatus === 'cancelled' && !['CANCELLED', 'COMPLETED'].includes(existing.status)) {
        const reason = `ยกเลิกโดยหอพัก${remoteJob.cancel_reason ? `: ${remoteJob.cancel_reason}` : ''}`;
        await cancelJob(conn, existing, reason);
        outcome = 'cancelled';
      } else if (remoteStatus === 'rejected' && !['CANCELLED', 'COMPLETED'].includes(existing.status)) {
        await cancelJob(conn, existing, `ปฏิเสธงาน${remoteJob.vendor_note ? `: ${remoteJob.vendor_note}` : ''}`);
        outcome = 'cancelled';
      } else if (detailsChanged || statusChangedRemotely) {
        outcome = 'updated';
      }
      return { outcome, jobId: existing.job_id };
    }

    // หลีกเลี่ยง external_ref ชนถ้าฝั่งหอส่งซ้ำที่ไม่ผูกกับ remote_job_id
    let finalExtRef = candidateExtRef;
    const [[dupRef]] = await conn.query(
      'SELECT job_id FROM jobs WHERE partner_id = ? AND external_ref = ?',
      [partner.partner_id, finalExtRef],
    );
    if (dupRef) finalExtRef = `RPR-${remoteId}`;

    const code = await nextCode(conn, 'jobs', 'job_code', 'JB');
    const structural = workScope === 'STRUCTURAL';
    await conn.query('SET @status_remark = ?', [`รับงาน #${remoteId} จาก ${partner.name}${structural ? ' (งานโครงสร้าง รอเจ้าของหออนุมัติ)' : ''}`]);
    const [r] = await conn.query(
      `INSERT INTO jobs (job_code, job_type, source, partner_id, external_ref, unit_id, requester_id, title, description,
                         priority, preferred_date, contact_name, contact_phone, work_scope, owner_approval,
                         remote_job_id, remote_status, remote_details_updated_at, remote_synced_at, remote_payload)
       VALUES (?, ?, 'PARTNER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        code, jobType, partner.partner_id, finalExtRef, u.unit_id, partner.owner_user_id, title, description,
        priority, preferredDate, contactName, contactPhone, workScope, structural ? 'PENDING' : 'NOT_REQUIRED',
        remoteId, remoteStatus, remoteUpdatedAt, remotePayloadJson,
      ],
    );
    if (structural) {
      await conn.query('INSERT INTO owner_contacts (job_id) VALUES (?)', [r.insertId]);
      createdStructuralJobId = r.insertId;
    }
    return { outcome: 'created', jobId: r.insertId };
  });

  if (createdStructuralJobId) await fetchOwnerContact(createdStructuralJobId);
  if (['created', 'cancelled', 'updated'].includes(result.outcome)) {
    await logSync(partner.partner_id, {
      jobId: result.jobId, remoteJobId: remoteId, direction,
      action: `${result.outcome}: #${remoteId} (${remoteStatus})`, status: 'OK',
      detail: { room_number: remoteJob.room_number, category: remoteJob.category, status: remoteStatus },
    });
  }
  return result;
}

export async function syncPartnerJobs(partnerId, { statusFilter = '', manual = false } = {}) {
  const [[partner]] = await pool.query('SELECT * FROM partners WHERE partner_id = ?', [partnerId]);
  if (!partner) throw new HttpError(404, 'NOT_FOUND', 'ไม่พบพาร์ทเนอร์');
  if (partner.integration_mode !== 'REPAIR_API_V1') {
    throw new HttpError(409, 'INVALID_MODE', 'พาร์ทเนอร์นี้ไม่ได้ตั้งค่าเป็นโหมด Repair API v1');
  }
  if (!partner.is_active) throw new HttpError(409, 'INACTIVE_PARTNER', 'พาร์ทเนอร์ถูกปิดการใช้งาน');
  if (syncingPartners.has(partner.partner_id)) {
    return { total: 0, created: 0, updated: 0, cancelled: 0, unchanged: 0, skipped: 0, inProgress: true };
  }

  syncingPartners.add(partner.partner_id);
  try {
    const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const { status: httpStatus, data } = await callRepairApi(partner, 'GET', `/jobs${query}`);
    const list = Array.isArray(data) ? data : (data?.jobs ?? []);
    const counts = { total: list.length, created: 0, updated: 0, cancelled: 0, unchanged: 0, skipped: 0 };

    for (const remoteJob of list) {
      const { outcome } = await upsertRemoteRepairJob(partner, remoteJob, 'INBOUND_POLL');
      if (outcome in counts) counts[outcome] += 1;
    }

    await pool.query('UPDATE partners SET last_synced_at = NOW(), last_sync_error = NULL WHERE partner_id = ?', [partner.partner_id]);
    if (manual || counts.created > 0 || counts.updated > 0 || counts.cancelled > 0) {
      await logSync(partner.partner_id, {
        direction: 'INBOUND_POLL',
        action: `GET /jobs${query}`,
        status: 'OK',
        httpStatus,
        detail: counts,
      });
    }
    return { ...counts, syncedAt: new Date().toISOString() };
  } catch (err) {
    await pool.query('UPDATE partners SET last_sync_error = ? WHERE partner_id = ?', [
      String(err.message).slice(0, 500), partner.partner_id,
    ]);
    await logSync(partner.partner_id, {
      direction: 'INBOUND_POLL',
      action: 'GET /jobs',
      status: 'ERROR',
      httpStatus: err.httpStatus || null,
      errorMessage: err.message,
    });
    if (manual) throw new HttpError(err.httpStatus === 401 ? 422 : 502, err.code || 'PARTNER_API_ERROR', err.message);
    return null;
  } finally {
    syncingPartners.delete(partner.partner_id);
  }
}

export async function syncSingleRemoteJob(jobId) {
  const [[row]] = await pool.query(
    `SELECT j.*, p.partner_id AS p_id, p.name AS p_name, p.owner_user_id, p.integration_mode,
            p.api_base_url, p.outbound_api_key, p.default_building_ref, p.default_building_name, p.default_building_address
     FROM jobs j JOIN partners p ON p.partner_id = j.partner_id
     WHERE j.job_id = ?`,
    [jobId],
  );
  if (!row || row.integration_mode !== 'REPAIR_API_V1' || !row.remote_job_id) {
    throw new HttpError(409, 'INVALID_MODE', 'งานนี้ไม่ได้เชื่อมกับ Repair API v1');
  }
  const partner = { ...row, partner_id: row.p_id, name: row.p_name };
  try {
    const { status: httpStatus, data } = await callRepairApi(partner, 'GET', `/jobs/${row.remote_job_id}`);
    const remoteJob = data?.job ?? data;
    const res = await upsertRemoteRepairJob(partner, remoteJob, 'INBOUND_POLL');
    await pool.query('UPDATE jobs SET remote_sync_error = NULL, remote_synced_at = NOW() WHERE job_id = ?', [jobId]);
    await logSync(partner.partner_id, {
      jobId, remoteJobId: row.remote_job_id, direction: 'INBOUND_POLL',
      action: `GET /jobs/${row.remote_job_id}`, status: 'OK', httpStatus, detail: { outcome: res.outcome, status: remoteJob?.status },
    });
    return { remoteJob, outcome: res.outcome };
  } catch (err) {
    await pool.query('UPDATE jobs SET remote_sync_error = ? WHERE job_id = ?', [String(err.message).slice(0, 500), jobId]);
    await logSync(partner.partner_id, {
      jobId, remoteJobId: row.remote_job_id, direction: 'INBOUND_POLL',
      action: `GET /jobs/${row.remote_job_id}`, status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: err.message,
    });
    throw new HttpError(err.httpStatus === 401 ? 422 : 502, err.code || 'PARTNER_API_ERROR', err.message);
  }
}

export async function handleIncomingRepairWebhook({ partnerId = null, headerKey = null, eventName, payload }) {
  const remoteJobId = Number(payload?.job?.id);
  if (!Number.isInteger(remoteJobId) || remoteJobId <= 0) return;

  let partners = [];
  if (partnerId) {
    const [rows] = await pool.query(
      `SELECT * FROM partners WHERE partner_id = ? AND is_active = 1 AND integration_mode = 'REPAIR_API_V1'`,
      [partnerId],
    );
    partners = rows;
  } else if (headerKey) {
    const [rows] = await pool.query(
      `SELECT * FROM partners WHERE outbound_api_key = ? AND is_active = 1 AND integration_mode = 'REPAIR_API_V1'`,
      [headerKey],
    );
    partners = rows;
  } else {
    const [rows] = await pool.query(
      `SELECT * FROM partners WHERE is_active = 1 AND integration_mode = 'REPAIR_API_V1' AND api_base_url IS NOT NULL AND outbound_api_key IS NOT NULL`,
    );
    partners = rows;
  }

  for (const partner of partners) {
    try {
      // ตามเอกสารข้อ 7: หลังตอบ 200 แล้วให้ยืนยันข้อมูลจริงด้วย GET /jobs/:id เสมอ
      const { status: httpStatus, data } = await callRepairApi(partner, 'GET', `/jobs/${remoteJobId}`);
      const verifiedJob = data?.job ?? data;
      const res = await upsertRemoteRepairJob(partner, verifiedJob, 'INBOUND_WEBHOOK');
      await pool.query('UPDATE partners SET last_synced_at = NOW(), last_sync_error = NULL WHERE partner_id = ?', [partner.partner_id]);
      await logSync(partner.partner_id, {
        jobId: res.jobId, remoteJobId, direction: 'INBOUND_WEBHOOK',
        action: `webhook:${eventName || payload?.event || 'unknown'} → GET /jobs/${remoteJobId}`,
        status: 'OK', httpStatus, detail: { outcome: res.outcome, remoteStatus: verifiedJob?.status },
      });
      if (partners.length > 1) break;
    } catch (err) {
      await logSync(partner.partner_id, {
        remoteJobId, direction: 'INBOUND_WEBHOOK',
        action: `webhook:${eventName || payload?.event || 'unknown'}`,
        status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: err.message,
      });
    }
  }
}

function formatThaiPhoneOrNull(phone) {
  if (!phone) return null;
  const cleaned = String(phone).trim();
  if (!cleaned) return null;
  // ยอมรับ 081-234-5678, 0812345678, +6681...
  if (!/^[0-9+\-\s()]{8,20}$/.test(cleaned)) return null;
  return cleaned;
}

function formatScheduledAt(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = String(dateStr).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = timeStr && /^\d{2}:\d{2}/.test(String(timeStr).trim()) ? String(timeStr).trim().slice(0, 5) : '09:00';
  return `${d}T${t}`;
}

function desiredRemoteStatusForLocal(localStatus) {
  if (['SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED', 'CONTRACTED'].includes(localStatus)) return 'accepted';
  if (localStatus === 'IN_PROGRESS') return 'in_progress';
  if (localStatus === 'COMPLETED') return 'done';
  if (localStatus === 'CANCELLED') return 'rejected';
  return null;
}

function computeTransitionSteps(currentRemote, targetRemote) {
  if (!targetRemote || currentRemote === targetRemote) return [];
  if (TERMINAL_REMOTE_STATUSES.has(currentRemote)) return null;

  if (targetRemote === 'accepted') {
    if (currentRemote === 'sent') return ['accepted'];
    if (currentRemote === 'in_progress') return [];
  }
  if (targetRemote === 'in_progress') {
    if (currentRemote === 'sent') return ['accepted', 'in_progress'];
    if (currentRemote === 'accepted') return ['in_progress'];
  }
  if (targetRemote === 'done') {
    if (currentRemote === 'sent') return ['accepted', 'done'];
    if (currentRemote === 'accepted' || currentRemote === 'in_progress') return ['done'];
  }
  if (targetRemote === 'rejected') {
    if (currentRemote === 'sent') return ['rejected'];
    return null; // หอพักไม่อนุญาตให้ช่างปฏิเสธหลังจากรับงานแล้ว
  }
  return [];
}

// ส่งสถานะจาก RenoCare กลับไปยัง PATCH /jobs/:id/status ของเว็บหอพัก
// เรียก GET /jobs/:id ก่อนทุกครั้งเพื่อกัน 409 INVALID_TRANSITION และส่งเฉพาะ 5 ฟิลด์ที่อนุญาตเท่านั้น
export async function pushJobStatusToPartner(jobId, opts = {}) {
  const [[row]] = await pool.query(
    `SELECT j.*, p.partner_id AS p_id, p.name AS p_name, p.integration_mode, p.api_base_url, p.outbound_api_key
     FROM jobs j JOIN partners p ON p.partner_id = j.partner_id
     WHERE j.job_id = ?`,
    [jobId],
  );
  if (!row || row.integration_mode !== 'REPAIR_API_V1' || !row.remote_job_id) return null;

  const partner = { ...row, partner_id: row.p_id, name: row.p_name };
  const targetRemote = desiredRemoteStatusForLocal(row.status);
  if (!targetRemote) return null;

  const [[leadTech]] = await pool.query(
    'SELECT technician_name, technician_phone FROM job_assignments WHERE job_id = ? ORDER BY is_lead DESC, assigned_at LIMIT 1',
    [jobId],
  );
  let scheduledDate = opts.scheduledDate;
  if (!scheduledDate) {
    const [[survey]] = await pool.query(
      `SELECT scheduled_date FROM site_surveys WHERE job_id = ? AND survey_type = 'INITIAL' ORDER BY survey_id DESC LIMIT 1`,
      [jobId],
    );
    scheduledDate = survey?.scheduled_date ?? null;
  }

  try {
    // กฎข้อ 1: เรียก GET /jobs/:id ก่อนเปลี่ยนสถานะเสมอ
    const { data: currentData } = await callRepairApi(partner, 'GET', `/jobs/${row.remote_job_id}`);
    const remoteJob = currentData?.job ?? currentData;
    const currentRemote = String(remoteJob?.status ?? row.remote_status ?? 'sent');

    if (currentRemote === 'cancelled' && !['CANCELLED', 'COMPLETED'].includes(row.status)) {
      await tx(null, async (conn) => {
        const locked = await loadJob(conn, jobId, { lock: true });
        if (!['CANCELLED', 'COMPLETED'].includes(locked.status)) {
          await cancelJob(conn, locked, `ยกเลิกโดยหอพัก${remoteJob?.cancel_reason ? `: ${remoteJob.cancel_reason}` : ''}`);
        }
      });
      await pool.query(
        'UPDATE jobs SET remote_status = ?, remote_synced_at = NOW(), remote_sync_error = ?, remote_payload = ? WHERE job_id = ?',
        ['cancelled', 'งานถูกยกเลิกจากฝั่งหอพักแล้ว', JSON.stringify(remoteJob), jobId],
      );
      return { ok: false, remoteStatus: 'cancelled' };
    }

    const steps = computeTransitionSteps(currentRemote, targetRemote);
    if (steps === null) {
      const msg = currentRemote === 'done' || currentRemote === 'rejected' || currentRemote === 'cancelled'
        ? `งานฝั่งหอพักสิ้นสุดแล้ว (${currentRemote}) ไม่สามารถเปลี่ยนเป็น ${targetRemote} ได้`
        : `ฝั่งหอพักรับงานไปแล้ว (${currentRemote}) ไม่สามารถปฏิเสธผ่าน API ได้ กรุณาติดต่อหอพักให้ยกเลิก`;
      await pool.query(
        'UPDATE jobs SET remote_status = ?, remote_synced_at = NOW(), remote_sync_error = ?, remote_payload = ? WHERE job_id = ?',
        [currentRemote, msg.slice(0, 500), JSON.stringify(remoteJob), jobId],
      );
      await logSync(partner.partner_id, {
        jobId, remoteJobId: row.remote_job_id, direction: 'OUTBOUND_STATUS',
        action: `SKIP ${currentRemote} → ${targetRemote}`, status: 'ERROR', errorMessage: msg,
      });
      return { ok: false, message: msg };
    }

    if (!steps.length) {
      await pool.query(
        'UPDATE jobs SET remote_status = ?, remote_synced_at = NOW(), remote_sync_error = NULL, remote_payload = ? WHERE job_id = ?',
        [currentRemote, JSON.stringify(remoteJob), jobId],
      );
      return { ok: true, remoteStatus: currentRemote };
    }

    let latestRemoteJob = remoteJob;
    for (const stepStatus of steps) {
      // ส่งได้เฉพาะ 5 ฟิลด์: status, note, technician_name, technician_phone, scheduled_at
      const body = { status: stepStatus };
      const noteText = opts.note ? String(opts.note).trim().slice(0, 500) : '';
      const techName = leadTech?.technician_name ? String(leadTech.technician_name).trim().slice(0, 150) : null;
      const techPhone = formatThaiPhoneOrNull(leadTech?.technician_phone);
      const scheduledAt = formatScheduledAt(scheduledDate, opts.scheduledTime);

      if (stepStatus === 'accepted') {
        if (techName) body.technician_name = techName;
        if (techPhone) body.technician_phone = techPhone;
        if (scheduledAt) body.scheduled_at = scheduledAt;
        if (noteText) body.note = noteText;
      } else if (stepStatus === 'in_progress') {
        if (techName) body.technician_name = techName;
        if (techPhone) body.technician_phone = techPhone;
        if (noteText && steps.length === 1) body.note = noteText;
      } else if (stepStatus === 'done') {
        body.note = noteText || 'ซ่อมเสร็จเรียบร้อยแล้ว';
      } else if (stepStatus === 'rejected') {
        body.note = noteText || 'ปฏิเสธงานโดยช่าง/ผู้ดูแลระบบ';
      }

      const { status: httpStatus, data: patchRes } = await callRepairApi(
        partner, 'PATCH', `/jobs/${row.remote_job_id}/status`, body,
      );
      latestRemoteJob = patchRes?.job ?? latestRemoteJob;
      await logSync(partner.partner_id, {
        jobId, remoteJobId: row.remote_job_id, direction: 'OUTBOUND_STATUS',
        action: `PATCH /jobs/${row.remote_job_id}/status (${stepStatus})`,
        status: 'OK', httpStatus, detail: body,
      });
    }

    const finalRemoteStatus = latestRemoteJob?.status ?? steps[steps.length - 1];
    await pool.query(
      'UPDATE jobs SET remote_status = ?, remote_synced_at = NOW(), remote_sync_error = NULL, remote_payload = ? WHERE job_id = ?',
      [finalRemoteStatus, JSON.stringify(latestRemoteJob), jobId],
    );
    return { ok: true, remoteStatus: finalRemoteStatus };
  } catch (err) {
    const errMsg = String(err.message).slice(0, 500);
    await pool.query('UPDATE jobs SET remote_sync_error = ? WHERE job_id = ?', [errMsg, jobId]);
    await logSync(partner.partner_id, {
      jobId, remoteJobId: row.remote_job_id, direction: 'OUTBOUND_STATUS',
      action: `PATCH /jobs/${row.remote_job_id}/status (${targetRemote})`,
      status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: errMsg,
    });
    return { ok: false, message: errMsg };
  }
}

export function startRepairSyncWorker(intervalMs = Number(process.env.REPAIR_SYNC_INTERVAL_MS ?? 60_000)) {
  if (intervalMs <= 0) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const [partners] = await pool.query(
        `SELECT partner_id FROM partners
         WHERE is_active = 1 AND integration_mode = 'REPAIR_API_V1' AND sync_enabled = 1
           AND api_base_url IS NOT NULL AND outbound_api_key IS NOT NULL`,
      );
      for (const p of partners) {
        await syncPartnerJobs(p.partner_id);
      }
    } catch (err) {
      console.error('repair sync worker:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, intervalMs);
}
