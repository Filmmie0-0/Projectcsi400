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

// การเคลื่อนไหวสต็อกหลายรายการต้องสำเร็จหรือล้มเหลวพร้อมกัน
export async function tx(fn) {
  const conn = await pool.getConnection();
  try {
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
