import crypto from 'node:crypto';
import { pool, tx, nextCode } from './db.js';
import { HttpError } from './http.js';
import { buildInstallments, cancelJob, loadJob, markContractRejected, markContractSigned } from './jobs.js';
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
    return 'ระบบหอพักไม่รับ API key นี้ (401) — ให้หอพักเปิดใช้งานสัญญาช่างให้อยู่ในช่วงวันที่ปัจจุบัน หรือออก key ใหม่แล้วใส่ใน DORM_API_KEY';
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
  // เอกสารหอพัก: ระบบภายนอกอย่าง RenoCare ส่ง key ใน X-API-Key
  const headers = {
    'X-API-Key': partner.outbound_api_key,
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

// ───────────── สัญญาซ่อม ↔ หอพัก (docs/dorm-contract-api-request.md) ─────────────
// PUT /jobs/:id/contracts/:contract_no ส่งสัญญาให้หอพักอนุมัติ, GET /jobs/:id/contracts ดึงผลกลับ
const PARTNER_FILE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

async function loadPartnerContract(contractId) {
  const [[row]] = await pool.query(
    `SELECT c.*, j.remote_job_id, j.job_id AS j_id, p.partner_id AS p_id, p.name AS p_name, p.integration_mode,
            p.api_base_url, p.outbound_api_key, pc.contract_no AS parent_contract_no
     FROM contracts c
     JOIN jobs j ON j.job_id = c.job_id
     JOIN partners p ON p.partner_id = j.partner_id
     LEFT JOIN contracts pc ON pc.contract_id = c.parent_contract_id
     WHERE c.contract_id = ?`,
    [contractId],
  );
  if (!row || row.integration_mode !== 'REPAIR_API_V1' || !row.remote_job_id) return null;
  return { contract: row, partner: { ...row, partner_id: row.p_id, name: row.p_name } };
}

async function buildContractBody(c) {
  const [items] = await pool.query(
    'SELECT description, qty, unit, unit_price FROM contract_items WHERE contract_id = ? ORDER BY item_id',
    [c.contract_id],
  );
  const [files] = await pool.query(
    `SELECT file_name, mime_type, data FROM contract_files WHERE contract_id = ? AND kind = 'CONTRACT' ORDER BY file_id LIMIT 5`,
    [c.contract_id],
  );
  return {
    contract_type: c.contract_type === 'ADDENDUM' ? 'addendum' : 'main',
    parent_contract_no: c.parent_contract_no ?? null,
    billing_type: c.billing_type === 'MONTHLY' ? 'monthly' : 'daily',
    rate: round2(c.rate),
    period_qty: Number(c.period_qty),
    start_date: String(c.start_date).slice(0, 10),
    end_date: String(c.end_date).slice(0, 10),
    labor_amount: round2(c.labor_amount),
    material_amount: round2(c.material_amount),
    total_amount: round2(c.total_amount),
    terms: c.terms ? String(c.terms).slice(0, 2000) : null,
    items: items.map((i) => ({
      description: String(i.description).slice(0, 200), qty: Number(i.qty), unit: i.unit, unit_price: round2(i.unit_price),
    })),
    installments: buildInstallments(c).map((v, idx) => ({
      no: idx + 1, description: v.description, due_date: v.dueDate, amount: round2(v.amount),
    })),
    files: files
      .filter((f) => PARTNER_FILE_TYPES.has(f.mime_type))
      .map((f) => ({ file_name: f.file_name, mime_type: f.mime_type, data_base64: Buffer.from(f.data).toString('base64') })),
  };
}

async function setJobSyncError(jobId, message) {
  await pool.query('UPDATE jobs SET remote_sync_error = ? WHERE job_id = ?', [message ? String(message).slice(0, 500) : null, jobId]);
}

export async function pushContractToPartner(contractId) {
  const loaded = await loadPartnerContract(contractId);
  if (!loaded) return null;
  const { contract: c, partner } = loaded;
  const path = `/jobs/${c.remote_job_id}/contracts/${encodeURIComponent(c.contract_no)}`;
  try {
    const body = await buildContractBody(c);
    const { status: httpStatus, data } = await callRepairApi(partner, 'PUT', path, body);
    const remoteStatus = String(data?.status ?? data?.contract?.status ?? 'pending');
    await pool.query('UPDATE contracts SET remote_status = ?, remote_synced_at = NOW() WHERE contract_id = ?', [remoteStatus, c.contract_id]);
    await setJobSyncError(c.j_id, null);
    await logSync(partner.partner_id, {
      jobId: c.j_id, remoteJobId: c.remote_job_id, direction: 'OUTBOUND_CONTRACT',
      action: `PUT ${path}`, status: 'OK', httpStatus,
      detail: { ...body, files: body.files.map((f) => f.file_name) },
    });
    return { ok: true, remoteStatus };
  } catch (err) {
    const msg = `ส่งสัญญา ${c.contract_no} ให้หอพักไม่สำเร็จ: ${err.message}`;
    await setJobSyncError(c.j_id, msg);
    await logSync(partner.partner_id, {
      jobId: c.j_id, remoteJobId: c.remote_job_id, direction: 'OUTBOUND_CONTRACT',
      action: `PUT ${path}`, status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: msg,
    });
    return { ok: false, message: msg };
  }
}

// ผลอนุมัติจากหอพัก: approved = ลงนามแทนลูกค้า (สร้างงวดชำระ), rejected = ปฏิเสธสัญญา
async function applyRemoteContractDecision(local, remote, partner) {
  const remoteStatus = String(remote.status ?? '');
  if (remoteStatus === local.remote_status) return;
  await tx(null, async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM contracts WHERE contract_id = ? FOR UPDATE', [local.contract_id]);
    await conn.query('UPDATE contracts SET remote_status = ?, remote_synced_at = NOW() WHERE contract_id = ?', [remoteStatus, c.contract_id]);
    if (c.status !== 'SENT') return;
    const job = await loadJob(conn, c.job_id, { lock: true });
    const who = remote.decided_by_name ? String(remote.decided_by_name).slice(0, 150) : partner.name;
    if (remoteStatus === 'approved') {
      await markContractSigned(conn, c, job, { signedBy: null, signedName: `${who} (${partner.name})`.slice(0, 150) });
    } else if (remoteStatus === 'rejected') {
      const reason = remote.decision_note ? `หอพักไม่อนุมัติ: ${remote.decision_note}` : 'หอพักไม่อนุมัติ';
      await markContractRejected(conn, c, job, reason.slice(0, 500));
    }
  });
  await logSync(partner.partner_id, {
    jobId: local.job_id, remoteJobId: local.remote_job_id, direction: 'INBOUND_CONTRACT',
    action: `contract ${local.contract_no}: ${local.remote_status ?? '-'} → ${remoteStatus}`, status: 'OK',
    detail: { decided_by_name: remote.decided_by_name ?? null, decision_note: remote.decision_note ?? null },
  });
}

export async function syncPartnerContracts(partnerId) {
  const [[partner]] = await pool.query('SELECT * FROM partners WHERE partner_id = ?', [partnerId]);
  if (!partner) return;
  const [rows] = await pool.query(
    `SELECT c.contract_id, c.contract_no, c.status, c.remote_status, j.job_id, j.remote_job_id
     FROM contracts c JOIN jobs j ON j.job_id = c.job_id
     WHERE j.partner_id = ? AND j.remote_job_id IS NOT NULL
       AND (c.status = 'SENT' OR (c.status = 'CANCELLED' AND c.remote_status = 'pending'))`,
    [partnerId],
  );

  // ส่งซ้ำสัญญาที่ยังส่งไม่สำเร็จ
  for (const r of rows.filter((x) => x.status === 'SENT' && !x.remote_status)) await pushContractToPartner(r.contract_id);

  // สัญญาที่ฝั่งเรายกเลิก (เช่น ยกเลิกงาน) แต่หอพักยังรออนุมัติอยู่
  for (const r of rows.filter((x) => x.status === 'CANCELLED')) {
    const path = `/jobs/${r.remote_job_id}/contracts/${encodeURIComponent(r.contract_no)}/cancel`;
    try {
      await callRepairApi(partner, 'POST', path, { reason: 'ยกเลิกสัญญาโดย RenoCare' });
      await pool.query(`UPDATE contracts SET remote_status = 'cancelled', remote_synced_at = NOW() WHERE contract_id = ?`, [r.contract_id]);
      await logSync(partnerId, { jobId: r.job_id, remoteJobId: r.remote_job_id, direction: 'OUTBOUND_CONTRACT', action: `POST ${path}`, status: 'OK' });
    } catch (err) {
      if (err.httpStatus === 409 || err.httpStatus === 404) {
        await pool.query('UPDATE contracts SET remote_status = NULL WHERE contract_id = ?', [r.contract_id]);
      }
      await logSync(partnerId, {
        jobId: r.job_id, remoteJobId: r.remote_job_id, direction: 'OUTBOUND_CONTRACT', action: `POST ${path}`,
        status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: err.message,
      });
    }
  }

  // ดึงผลอนุมัติของสัญญาที่รออยู่ (เรียก 1 ครั้งต่องาน)
  const waiting = rows.filter((x) => x.status === 'SENT' && x.remote_status);
  for (const remoteJobId of new Set(waiting.map((x) => x.remote_job_id))) {
    try {
      const { data } = await callRepairApi(partner, 'GET', `/jobs/${remoteJobId}/contracts`);
      const remoteList = Array.isArray(data?.contracts) ? data.contracts : [];
      for (const local of waiting.filter((x) => x.remote_job_id === remoteJobId)) {
        const remote = remoteList.find((rc) => rc.contract_no === local.contract_no);
        if (remote) await applyRemoteContractDecision(local, remote, partner);
      }
    } catch (err) {
      await logSync(partnerId, {
        remoteJobId, direction: 'INBOUND_CONTRACT', action: `GET /jobs/${remoteJobId}/contracts`,
        status: 'ERROR', httpStatus: err.httpStatus || null, errorMessage: err.message,
      });
    }
  }
}

// ตั้งค่าการเชื่อมต่อระบบหอพักของเพื่อนจาก env (DORM_API_BASE_URL + DORM_API_KEY) ตอน service เริ่มทำงาน
// ใช้แถวพาร์ทเนอร์เดิมที่ชี้ไป base URL เดียวกัน (หรือแถวแรกถ้ายังไม่มี) แล้วสลับเป็นโหมด Repair API v1
export async function configureDormPartnerFromEnv() {
  const baseUrl = process.env.DORM_API_BASE_URL?.trim().replace(/\/+$/, '');
  const apiKey = process.env.DORM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return;
  const name = process.env.DORM_PARTNER_NAME?.trim() || 'หอพักพาร์ทเนอร์ (Repair API v1)';

  const [[byUrl]] = await pool.query(
    `SELECT partner_id FROM partners WHERE TRIM(TRAILING '/' FROM api_base_url) = ? ORDER BY partner_id LIMIT 1`,
    [baseUrl],
  );
  const [[first]] = byUrl ? [[byUrl]] : await pool.query('SELECT partner_id FROM partners ORDER BY partner_id LIMIT 1');
  const target = byUrl ?? first;

  if (target) {
    // webhook_url = NULL: โหมดนี้เราเป็นฝ่ายเรียก API ของหอพักเอง ไม่ต้องยิง webhook แบบ Partner Push ออกไป
    await pool.query(
      `UPDATE partners SET name = ?, integration_mode = 'REPAIR_API_V1', api_base_url = ?, outbound_api_key = ?,
              webhook_url = NULL, sync_enabled = 1, is_active = 1 WHERE partner_id = ?`,
      [name, baseUrl, apiKey, target.partner_id],
    );
  } else {
    const placeholderKey = `pk_live_${crypto.randomBytes(16).toString('hex')}`;
    await pool.query(
      `INSERT INTO partners (name, owner_user_id, integration_mode, api_key_prefix, api_key_hash, webhook_secret,
                             api_base_url, outbound_api_key, sync_enabled)
       VALUES (?, ?, 'REPAIR_API_V1', ?, ?, ?, ?, ?, 1)`,
      [
        name, Number(process.env.DORM_OWNER_USER_ID ?? 1), placeholderKey.slice(0, 12),
        crypto.createHash('sha256').update(placeholderKey).digest('hex'),
        `whsec_${crypto.randomBytes(16).toString('hex')}`, baseUrl, apiKey,
      ],
    );
  }
  // งาน PARTNER_PUSH ที่ค้างส่งไปยัง URL เก่าไม่ต้องส่งต่อแล้ว
  await pool.query(
    `DELETE w FROM webhook_deliveries w JOIN partners p ON p.partner_id = w.partner_id
     WHERE p.integration_mode = 'REPAIR_API_V1' AND p.webhook_url IS NULL AND w.status = 'PENDING'`,
  );
  console.log(`dorm partner configured: ${baseUrl}`);
}

// ข้อมูลกระดิ่งแจ้งเตือน: งานจากหอพักที่ยังรอมอบหมาย + สถานะการเชื่อมต่อ
export async function getPartnerInbox() {
  const [partners] = await pool.query(
    `SELECT partner_id, name, last_synced_at, last_sync_error FROM partners
     WHERE is_active = 1 AND integration_mode = 'REPAIR_API_V1' ORDER BY partner_id`,
  );
  const [jobs] = await pool.query(
    `SELECT j.job_id, j.job_code, j.title, j.priority, j.remote_job_id, j.remote_status, j.created_at, u.code AS unit_code, p.name AS partner_name
     FROM jobs j
     JOIN partners p ON p.partner_id = j.partner_id
     LEFT JOIN units u ON u.unit_id = j.unit_id
     WHERE p.integration_mode = 'REPAIR_API_V1' AND j.status = 'NEW'
     ORDER BY j.job_id DESC LIMIT 20`,
  );
  return { partners, jobs };
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
        await syncPartnerContracts(p.partner_id);
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
