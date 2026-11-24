// สร้างชุด "Docker บนแฟลชไดร์ฟ": เอาไปเสียบเครื่องอื่นที่มี Docker Desktop แล้วรันทั้งระบบด้วย Docker + ข้อมูลจริง
//
//   node portable/build-docker.mjs   → portable/dist/RenoCare-Docker (คัดลอกทั้งโฟลเดอร์ลงแฟลชไดร์ฟ)
//
// ในชุดมี: โค้ด backend (Dockerfile/compose), หน้าเว็บที่ build แล้ว, ข้อมูลจริงจาก Docker เครื่องนี้ (data/*.sql)
// เครื่องปลายทางต้องมี: Windows + Docker Desktop (ครั้งแรกต้องต่อเน็ตเพื่อโหลด image mysql/node)
import { execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SRC = path.join(HERE, 'docker');
const OUT = path.join(HERE, 'dist', 'RenoCare-Docker');
const SERVICES = ['gateway', 'auth-service', 'job-service', 'inventory-service'];
const DBS = ['auth_db', 'job_db', 'inventory_db'];
const DB_CONTAINER = 'renocare_db';
const DB_ROOT_PW = process.env.MYSQL_ROOT_PASSWORD ?? 'root';
const GATEWAY_PORT = 3090; // ต้องตรงกับ docker/env.cmd

const step = (m) => console.log(`\n▶ ${m}`);
const run = (cmd, cwd, env = {}) => execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
const die = (m) => { console.error(`\n[ผิดพลาด] ${m}`); process.exit(1); };
const lf = (s) => s.replace(/\r\n/g, '\n');
const crlf = (s) => lf(s).replace(/\n/g, '\r\n');

// 1) ข้อมูลจริงจาก Docker เครื่องนี้ (ทำก่อน ถ้า Docker ไม่ได้เปิดจะได้หยุดเร็ว)
step('ดึงข้อมูลจริงจาก Docker (mysqldump)');
const ps = spawnSync('docker', ['ps', '--filter', `name=^${DB_CONTAINER}$`, '--format', '{{.Status}}'], { encoding: 'utf8' });
if (ps.status !== 0 || !ps.stdout.includes('Up')) die(`ไม่พบ container ${DB_CONTAINER} ที่รันอยู่ — เปิด Docker แล้วรัน npm run stack:up (ใน backend/) ก่อน`);
const dumps = {};
for (const db of DBS) {
  const r = spawnSync('docker', ['exec', '-e', `MYSQL_PWD=${DB_ROOT_PW}`, DB_CONTAINER, 'mysqldump', '-uroot',
    '--single-transaction', '--routines', '--triggers', '--events', '--hex-blob', '--set-gtid-purged=OFF', '--no-tablespaces',
    '--default-character-set=utf8mb4', db], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) die(`dump ${db} ไม่สำเร็จ: ${r.stderr}`);
  dumps[db] = r.stdout;
  console.log(`  ${db}: ${(r.stdout.length / 1024).toFixed(0)} KB`);
}

// 2) หน้าเว็บ: เรียก API ที่ origin เดียวกัน (gateway เสิร์ฟทั้งเว็บและ API)
step('build หน้าเว็บ (frontend)');
const fe = path.join(REPO, 'frontend');
if (!fs.existsSync(path.join(fe, 'node_modules'))) run('npm ci', fe);
run('npm run build', fe, { VITE_API_URL: '/api' });

step(`ประกอบชุดที่ ${path.relative(REPO, OUT)}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(fe, 'dist'), path.join(OUT, 'web'), { recursive: true });

// 3) backend: เฉพาะที่ docker compose ใช้ build (ไม่เอา node_modules / .env ของเครื่องนี้)
const be = path.join(REPO, 'backend');
const beOut = path.join(OUT, 'backend');
fs.mkdirSync(beOut, { recursive: true });
fs.copyFileSync(path.join(be, 'docker-compose.yml'), path.join(beOut, 'docker-compose.yml'));
fs.cpSync(path.join(be, 'database'), path.join(beOut, 'database'), { recursive: true });
for (const s of SERVICES) {
  const from = path.join(be, 'services', s);
  const to = path.join(beOut, 'services', s);
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(path.join(from, 'src'), path.join(to, 'src'), { recursive: true });
  for (const f of ['Dockerfile', '.dockerignore', 'package.json', 'package-lock.json']) {
    if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(to, f));
  }
}
// สคริปต์ที่รันใน Linux container ต้องเป็น LF
for (const f of fs.readdirSync(path.join(beOut, 'database', 'services'))) {
  const p = path.join(beOut, 'database', 'services', f);
  if (f.endsWith('.sh')) fs.writeFileSync(p, lf(fs.readFileSync(p, 'utf8')));
}
fs.copyFileSync(path.join(SRC, 'docker-compose.usb.yml'), path.join(beOut, 'docker-compose.usb.yml'));

// .env ของชุดแฟลชไดร์ฟ: พอร์ตไม่ชนกับชุดพัฒนา (3000/3306/8081) + JWT secret ใหม่
fs.writeFileSync(path.join(beOut, '.env'), [
  '# สร้างโดย portable/build-docker.mjs สำหรับรันจากแฟลชไดร์ฟ',
  `GATEWAY_PORT=${GATEWAY_PORT}`,
  `CORS_ORIGIN=http://localhost:${GATEWAY_PORT}`,
  `AUTH_JWT_SECRET=${crypto.randomBytes(48).toString('base64')}`,
  'NODE_ENV=development',
  'DB_PORT=3316',
  'PHPMYADMIN_PORT=8091',
  'MYSQL_ROOT_PASSWORD=root',
  'AUTH_DB_PASSWORD=auth_pass',
  'JOB_DB_PASSWORD=job_pass',
  'INVENTORY_DB_PASSWORD=inventory_pass',
  '',
].join('\n'));

// 4) ข้อมูล + รหัสชุดข้อมูล (START ใช้เทียบว่าต้องกู้ข้อมูลเข้า Docker หรือไม่)
fs.mkdirSync(path.join(OUT, 'data'));
for (const db of DBS) fs.writeFileSync(path.join(OUT, 'data', `${db}.sql`), dumps[db]);
const now = new Date();
const stamp = `${now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${os.hostname().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)}`;
fs.writeFileSync(path.join(OUT, 'data', 'STAMP.txt'), stamp);

// 5) สคริปต์สำหรับเครื่องปลายทาง
fs.mkdirSync(path.join(OUT, 'usb'));
fs.writeFileSync(path.join(OUT, 'usb', 'usb.sh'), lf(fs.readFileSync(path.join(SRC, 'usb.sh'), 'utf8')));
fs.writeFileSync(path.join(OUT, 'usb', 'env.cmd'), crlf(fs.readFileSync(path.join(SRC, 'env.cmd'), 'utf8')));
for (const f of ['START-RenoCare.bat', 'SAVE-data.bat', 'STOP-RenoCare.bat', 'README.txt']) {
  fs.writeFileSync(path.join(OUT, f), crlf(fs.readFileSync(path.join(SRC, f), 'utf8')));
}

const size = fs.readdirSync(OUT, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile()).reduce((s, e) => s + fs.statSync(path.join(e.parentPath, e.name)).size, 0);
console.log(`\n✔ เสร็จแล้ว: ${OUT}  (${(size / 1024 / 1024).toFixed(1)} MB, ข้อมูลชุด ${stamp})`);
console.log('  คัดลอกโฟลเดอร์ RenoCare-Docker ลงแฟลชไดร์ฟ แล้วดับเบิลคลิก START-RenoCare.bat ที่เครื่องปลายทาง');
