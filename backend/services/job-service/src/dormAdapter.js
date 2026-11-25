import crypto from 'node:crypto';
import { pool, tx } from './db.js';
import { HttpError } from './http.js';
import { assertStatus, loadJob } from './jobs.js';
import { createPartnerJob } from './partnerJobs.js';
import { cancelJob } from './routes/jobs.js';

// ── ตัวแปลง webhook จากระบบหอพัก (Repair API ของหอพัก) ──
// หอพัก POST มาที่ /api/partner/v1/dorm-webhook (ตั้งเป็น Webhook URL ของช่างในระบบหอพัก)
//   headers: X-API-Key = key ที่เราออกให้หอพัก, X-Signature = sha256=HMAC(webhook_secret, body), X-Repair-Event
//   body:    { event: 'job.created' | 'job.updated' | 'job.cancelled', sent_at, job: { id, room_number, category, ... } }
// หอพักรอคำตอบแค่ 5 วินาที จึงต้องตอบให้เร็ว

const CATEGORY = {
  electrical: 'ไฟฟ้า', plumbing: 'ประปา', aircon: 'เครื่องปรับอากาศ', appliance: 'เครื่องใช้ไฟฟ้า', furniture: 'เฟอร์นิเจอร์',
  door: 'ประตู/หน้าต่าง/กุญแจ', building: 'ผนัง/เพดาน/พื้น', internet: 'อินเทอร์เน็ต/Wi-Fi', pest: 'แมลง/สัตว์รบกวน', other: 'อื่นๆ',
};
const PREFERRED_TIME = {
  anytime: 'เวลาไหนก็ได้', morning: 'ช่วงเช้า (08:00-12:00)', afternoon: 'ช่วงบ่าย (12:00-16:00)',
  evening: 'ช่วงเย็น (16:00-19:00)', night: 'ช่วงค่ำ (19:00-21:00)', weekend: 'เสาร์-อาทิตย์',
};
const OPEN_BEFORE_CONTRACT = ['NEW', 'SURVEY_ASSIGNED', 'SURVEYED', 'QUOTED'];
const CLOSED = ['COMPLETED', 'CANCELLED'];
const CONFIRM_TIMEOUT_MS = 3000;

export function verifySignature(secret, rawBody, header) {
  if (!secret || !rawBody || typeof header !== 'string') return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(header.trim().toLowerCase());
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** งานของหอพัก → ข้อมูลงานของเรา (รูปแบบเดียวกับ POST /api/partner/v1/jobs) */
export function toRenoCareJob(dormJob, partner) {
  const category = CATEGORY[dormJob.category] ?? dormJob.category ?? 'งานซ่อม';
  const lines = [
    dormJob.description,
    dormJob.preferred_time && `ช่วงเวลาที่สะดวก: ${PREFERRED_TIME[dormJob.preferred_time] ?? dormJob.preferred_time}`,
    dormJob.sent_by_name && `ผู้ส่งงาน (หอพัก): ${dormJob.sent_by_name}`,
  ].filter(Boolean);
  return {
    externalRef: String(dormJob.id),
    jobType: 'RENOVATION',
    workScope: 'INTERIOR',
    title: `ซ่อม${category} ห้อง ${dormJob.room_number}`.slice(0, 200),
    description: lines.join('\n'),
    priority: dormJob.urgency === 'urgent' ? 'URGENT' : 'NORMAL',
    building: { externalRef: partner.building_ref, name: partner.name },
    unit: { code: String(dormJob.room_number), unitType: 'ROOM' },
    contact: { name: dormJob.sent_by_name ?? null, phone: dormJob.contact_phone ?? null },
  };
}

// คู่มือหอพักให้ยืนยันข้อมูลด้วย GET /jobs/:id อีกครั้ง — ถ้าเรียกไม่ได้ใช้ข้อมูลใน webhook (ผ่านการตรวจลายเซ็นแล้ว)
async function confirmDormJob(partner, dormJob) {
  if (!partner.api_base_url || !partner.outbound_api_key) return dormJob;
  try {
    const r = await fetch(`${partner.api_base_url.replace(/\/$/, '')}/jobs/${encodeURIComponent(dormJob.id)}`, {
      headers: { 'X-API-Key': partner.outbound_api_key, Accept: 'application/json' },
      signal: AbortSignal.timeout(CONFIRM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json();
    return body?.job?.id === dormJob.id ? body.job : dormJob;
  } catch (err) {
    console.warn(`dorm-webhook: ยืนยันงาน ${dormJob.id} กับหอพักไม่สำเร็จ (${err.message}) ใช้ข้อมูลจาก webhook แทน`);
    return dormJob;
  }
}

async function findJob(partner, externalRef) {
  const [[job]] = await pool.query('SELECT * FROM jobs WHERE partner_id = ? AND external_ref = ?', [partner.partner_id, externalRef]);
  return job ?? null;
}

async function updateDetails(job, input) {
  if (CLOSED.includes(job.status)) return 'ignored';
  await pool.query(
    'UPDATE jobs SET title = ?, description = ?, priority = ?, contact_name = ?, contact_phone = ? WHERE job_id = ?',
    [input.title, input.description, input.priority, input.contact.name, input.contact.phone, job.job_id],
  );
  return 'updated';
}

async function cancelFromDorm(job, dormJob) {
  if (CLOSED.includes(job.status)) return 'ignored';
  // ทำสัญญา/เริ่มงานแล้วยกเลิกอัตโนมัติไม่ได้ ให้แอดมินคุยกับหอพักเอง
  if (!OPEN_BEFORE_CONTRACT.includes(job.status)) {
    console.warn(`dorm-webhook: หอพักยกเลิกงาน ${job.job_code} แต่งานอยู่สถานะ ${job.status} แล้ว ไม่ยกเลิกอัตโนมัติ`);
    return 'needs_admin';
  }
  await tx(null, async (conn) => {
    const locked = await loadJob(conn, job.job_id, { lock: true });
    assertStatus(locked, ...OPEN_BEFORE_CONTRACT);
    await cancelJob(conn, locked, `หอพักยกเลิกงาน${dormJob.cancel_reason ? `: ${dormJob.cancel_reason}` : ''}`);
  });
  return 'cancelled';
}

export async function handleDormWebhook(req, res) {
  const partner = req.partner;
  if (!verifySignature(partner.webhook_secret, req.rawBody, req.get('X-Signature'))) {
    throw new HttpError(401, 'INVALID_SIGNATURE', 'X-Signature ไม่ถูกต้อง');
  }
  if (!partner.building_ref) {
    throw new HttpError(409, 'NOT_CONFIGURED', 'ยังไม่ได้ตั้งรหัสอาคารของหอพักนี้ในหน้า "พาร์ทเนอร์ API"');
  }
  const event = req.body?.event ?? req.get('X-Repair-Event');
  const payloadJob = req.body?.job;
  if (!payloadJob?.id || !payloadJob.room_number) throw new HttpError(422, 'VALIDATION', 'ต้องมี job.id และ job.room_number');

  const dormJob = event === 'job.cancelled' ? payloadJob : await confirmDormJob(partner, payloadJob);
  const input = toRenoCareJob(dormJob, partner);
  let job = await findJob(partner, input.externalRef);
  let action;

  if (event === 'job.created' || event === 'job.updated') {
    if (!job) {
      ({ job } = await createPartnerJob(partner, input));
      action = 'created';
    } else {
      action = event === 'job.updated' ? await updateDetails(job, input) : 'duplicate';
    }
  } else if (event === 'job.cancelled') {
    action = job ? await cancelFromDorm(job, dormJob) : 'ignored';
  } else {
    throw new HttpError(422, 'VALIDATION', `ไม่รู้จัก event "${event}"`);
  }

  res.json({ received: true, event, action, jobCode: job?.job_code ?? null });
}

// ── ขาออก: แปลง webhook ของเราเป็นรูปแบบที่หอพักรับ (POST /api/repair/webhooks/renocare/<รหัสอาคาร>) ──
// หอพักมีแค่ sent → accepted → in_progress → done (หรือ rejected) ขั้นสำรวจ/เสนอราคา/สัญญาของเราจึงไม่ส่งสถานะ
// ส่งแค่ข้อมูลช่างโดยไม่ใส่ status ได้: หอพักจะเปลี่ยนงานที่ยัง sent เป็น accepted ให้เอง และคงสถานะเดิมถ้ารับงานแล้ว
const truncate = (text, max = 500) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** คืน { body } ที่จะส่งให้หอพัก หรือ { skip: เหตุผล } ถ้า event นี้หอพักไม่ต้องรู้ */
export function toDormUpdate(payload, deliveryId) {
  const jobId = Number(payload.externalRef);
  if (!Number.isSafeInteger(jobId) || jobId < 1) return { skip: `externalRef "${payload.externalRef}" ไม่ใช่เลขงานของหอพัก` };
  const base = { event_id: `renocare-${deliveryId}`, job_id: jobId, external_ref: payload.jobCode };

  switch (payload.event) {
    case 'job.technicians_assigned': {
      const lead = payload.technicians?.find((t) => t.isLead) ?? payload.technicians?.[0];
      if (!lead) return { skip: 'ไม่มีข้อมูลช่าง' };
      const note = payload.surveyDate ? `นัดประเมินหน้างานวันที่ ${payload.surveyDate}` : undefined;
      return { body: { ...base, technician: { name: lead.name, ...(lead.phone && { phone: lead.phone }) }, ...(note && { note }) } };
    }
    case 'job.status_changed':
      if (payload.to === 'IN_PROGRESS') return { body: { ...base, status: 'in_progress', ...(payload.remark && { note: truncate(payload.remark) }) } };
      if (payload.to === 'COMPLETED') return { body: { ...base, status: 'done', note: truncate(payload.remark || 'RenoCare ปิดงานเรียบร้อย') } };
      if (payload.to === 'CANCELLED') {
        if (payload.remark?.startsWith('หอพักยกเลิกงาน')) return { skip: 'หอพักเป็นฝ่ายยกเลิกเอง' };
        return { body: { ...base, status: 'rejected', note: truncate(payload.remark || 'RenoCare ยกเลิกงาน') } };
      }
      return { skip: `สถานะ ${payload.to} ไม่มีในระบบหอพัก` };
    case 'survey.submitted':
      return { body: { ...base, note: truncate(`ประเมินหน้างานแล้ว: ${payload.summary} (ประมาณ ${payload.estDays} วัน)`) } };
    case 'job.progress':
      return { body: { ...base, note: truncate(`ความคืบหน้า ${payload.progressPct}% (${payload.workDate}): ${payload.note}`) } };
    default:
      return { skip: `หอพักไม่ใช้ event ${payload.event}` };
  }
}
