import crypto from 'node:crypto';
import { pool } from './db.js';

// ส่ง webhook จาก outbox (webhook_deliveries) ไปยังระบบพาร์ทเนอร์
// ลายเซ็น: X-Signature: sha256=HMAC(webhook_secret, body) ให้ฝั่งพาร์ทเนอร์ตรวจว่ามาจากเราจริง
// ล้มเหลว → retry แบบ backoff (10s, 20s, 40s, ...) สูงสุด 5 ครั้งแล้วเป็น FAILED (แอดมินกดส่งใหม่ได้)
const MAX_ATTEMPTS = 5;

async function deliverPending() {
  const [rows] = await pool.query(
    `SELECT w.delivery_id, w.payload, w.attempts, p.webhook_url, p.webhook_secret
     FROM webhook_deliveries w JOIN partners p ON p.partner_id = w.partner_id
     WHERE w.status = 'PENDING' AND w.next_attempt_at <= NOW() ORDER BY w.delivery_id LIMIT 10`,
  );
  for (const d of rows) {
    const body = typeof d.payload === 'string' ? d.payload : JSON.stringify(d.payload);
    try {
      if (!d.webhook_url) throw new Error('partner has no webhook_url');
      const signature = crypto.createHmac('sha256', d.webhook_secret).update(body).digest('hex');
      const r = await fetch(d.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${signature}`, 'X-Delivery-Id': String(d.delivery_id) },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await pool.query(`UPDATE webhook_deliveries SET status = 'SENT', attempts = attempts + 1, sent_at = NOW(), last_error = NULL WHERE delivery_id = ?`, [d.delivery_id]);
    } catch (err) {
      const attempts = d.attempts + 1;
      await pool.query(
        `UPDATE webhook_deliveries SET attempts = ?, last_error = ?, status = ?, next_attempt_at = NOW() + INTERVAL ? SECOND WHERE delivery_id = ?`,
        [attempts, String(err.message).slice(0, 500), attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING', 10 * 2 ** (attempts - 1), d.delivery_id],
      );
    }
  }
}

export function startWebhookWorker(intervalMs = 3000) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await deliverPending();
    } catch (err) {
      console.error('webhook worker:', err.message);
    } finally {
      running = false;
    }
  }, intervalMs);
}
