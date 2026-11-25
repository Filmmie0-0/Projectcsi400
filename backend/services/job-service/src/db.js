import mysql from 'mysql2/promise';

// แต่ละ service ต่อได้เฉพาะ database ของตัวเอง (user ถูก GRANT แค่ DB_NAME)
// dateStrings: ส่งวันที่เป็น 'YYYY-MM-DD' ตรง ๆ ไม่ให้ JSON เลื่อนวันเพราะ timezone
export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  timezone: '+07:00',
  decimalNumbers: true,
  dateStrings: true,
});

// ทุกการเขียนที่อาจเปลี่ยนสถานะงานต้องผ่าน tx(): ตั้ง @actor_id ให้ trigger บันทึก job_status_logs
// actorId = null หมายถึงระบบพาร์ทเนอร์ (เรียกผ่าน API key)
export async function tx(actorId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @actor_id = ?, @status_remark = NULL', [actorId]);
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// เลขเอกสารรูปแบบ PREFIX + ปีเดือน + ลำดับ เช่น JB2610-0007
export async function nextCode(conn, table, column, prefix) {
  const now = new Date();
  const head = `${prefix}${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-`;
  const [[row]] = await conn.query(`SELECT MAX(${column}) AS last FROM ${table} WHERE ${column} LIKE ? FOR UPDATE`, [`${head}%`]);
  const seq = row.last ? Number(row.last.slice(head.length)) + 1 : 1;
  return `${head}${String(seq).padStart(4, '0')}`;
}

async function addMissingColumns(table, definitions) {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  const existing = new Set(cols.map((c) => c.COLUMN_NAME));
  for (const [name, ddl] of definitions) {
    if (!existing.has(name)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

// เพิ่มคอลัมน์/ตารางที่จำเป็นสำหรับ Repair API v1 ให้ DB เดิมที่สร้างไว้ก่อนหน้าทำงานต่อได้โดยไม่ต้อง reset
export async function ensureSchema() {
  await addMissingColumns('partners', [
    ['integration_mode', "ENUM('PARTNER_PUSH','REPAIR_API_V1') NOT NULL DEFAULT 'PARTNER_PUSH' AFTER owner_user_id"],
    ['default_building_ref', 'VARCHAR(64) NULL AFTER outbound_api_key'],
    ['default_building_name', 'VARCHAR(200) NULL AFTER default_building_ref'],
    ['default_building_address', 'TEXT NULL AFTER default_building_name'],
    ['sync_enabled', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER default_building_address'],
    ['last_synced_at', 'TIMESTAMP NULL AFTER sync_enabled'],
    ['last_sync_error', 'VARCHAR(500) NULL AFTER last_synced_at'],
  ]);

  await addMissingColumns('jobs', [
    ['remote_job_id', 'BIGINT UNSIGNED NULL AFTER status'],
    ['remote_status', 'VARCHAR(30) NULL AFTER remote_job_id'],
    ['remote_details_updated_at', 'VARCHAR(40) NULL AFTER remote_status'],
    ['remote_synced_at', 'TIMESTAMP NULL AFTER remote_details_updated_at'],
    ['remote_sync_error', 'VARCHAR(500) NULL AFTER remote_synced_at'],
    ['remote_payload', 'JSON NULL AFTER remote_sync_error'],
  ]);

  const [indexes] = await pool.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND INDEX_NAME = 'uq_job_remote'`,
  );
  if (!indexes.length) {
    await pool.query('ALTER TABLE jobs ADD UNIQUE KEY uq_job_remote (partner_id, remote_job_id)');
  }

  // ไฟล์สัญญา (PDF/รูป) ที่เพิ่มมาทีหลัง — DB ที่สร้างก่อนหน้าจะยังไม่มีตารางนี้ ทำให้หน้ารายละเอียดงาน 500
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_files (
      file_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      contract_id  BIGINT UNSIGNED NOT NULL,
      kind         ENUM('CONTRACT','SIGNED') NOT NULL,
      file_name    VARCHAR(200) NOT NULL,
      mime_type    VARCHAR(50) NOT NULL,
      size_bytes   INT UNSIGNED NOT NULL,
      data         MEDIUMBLOB NOT NULL,
      uploaded_by  BIGINT UNSIGNED NOT NULL,
      created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (file_id),
      KEY idx_cfile_contract (contract_id),
      CONSTRAINT fk_cfile_contract FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partner_sync_logs (
      log_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      partner_id    BIGINT UNSIGNED NOT NULL,
      job_id        BIGINT UNSIGNED NULL,
      remote_job_id BIGINT UNSIGNED NULL,
      direction     ENUM('INBOUND_POLL','INBOUND_WEBHOOK','OUTBOUND_STATUS','OUTBOUND_VENDOR','OUTBOUND_OWNER') NOT NULL,
      action        VARCHAR(100) NOT NULL,
      status        ENUM('OK','ERROR') NOT NULL,
      http_status   SMALLINT UNSIGNED NULL,
      detail        JSON NULL,
      error_message VARCHAR(500) NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (log_id),
      KEY idx_pslog_partner (partner_id, log_id DESC),
      CONSTRAINT fk_pslog_partner FOREIGN KEY (partner_id) REFERENCES partners(partner_id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
}
