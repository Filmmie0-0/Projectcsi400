import mysql from 'mysql2/promise';

// แต่ละ service ต่อได้เฉพาะ database ของตัวเอง (user ถูก GRANT แค่ DB_NAME)
export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
  timezone: '+07:00',
  decimalNumbers: true,
});
