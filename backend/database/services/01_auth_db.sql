-- auth-service  |  MySQL 8.0.16+
-- เจ้าของข้อมูลผู้ใช้ทั้งหมด service อื่นเก็บแค่ user_id (+ snapshot ชื่อ) ไม่มี FK ข้าม database
-- Roles: ADMIN = ผู้ดูแล/รับงาน, USER = ลูกค้า (เจ้าของตึก หรือบัญชีของระบบพาร์ทเนอร์), TECHNICIAN = ช่าง
SET NAMES utf8mb4;
USE auth_db;

CREATE TABLE users (
  user_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
<<<<<<< HEAD:database/services/01_auth_db.sql
  role           ENUM('ADMIN','USER','TECHNICIAN') NOT NULL,
  status         ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  full_name      VARCHAR(150) NOT NULL,
  phone          VARCHAR(20) NULL,
=======
  role           ENUM('ADMIN','OWNER','TENANT') NOT NULL,
  status         ENUM('ACTIVE','SUSPENDED','PENDING_VERIFY') NOT NULL DEFAULT 'PENDING_VERIFY',
  token_version  INT UNSIGNED NOT NULL DEFAULT 0,
>>>>>>> 6aca8a91bcd6df99dcd651a81e703215097c3458:backend/database/services/01_auth_db.sql
  last_login_at  TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role, status)
) ENGINE=InnoDB;

-- ข้อมูลเฉพาะช่าง: ค่าแรงรายวันใช้เป็นค่าตั้งต้นตอนแอดมินทำสัญญาแบบรายวัน
CREATE TABLE technician_profiles (
  user_id     BIGINT UNSIGNED NOT NULL,
  skills      VARCHAR(255) NULL,
  daily_wage  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_tech_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_tech_wage CHECK (daily_wage >= 0)
) ENGINE=InnoDB;

CREATE VIEW v_user_summary AS
SELECT
  (SELECT COUNT(*) FROM users WHERE role='USER'       AND status='ACTIVE') AS total_customers,
  (SELECT COUNT(*) FROM users WHERE role='TECHNICIAN' AND status='ACTIVE') AS total_technicians;

-- ───────────────────────── Seed (รหัสผ่านทุกบัญชี: password123) ─────────────────────────
-- user_id 1-5 ถูกอ้างถึงใน job_db / inventory_db seed
INSERT INTO users (user_id, email, password_hash, role, full_name, phone) VALUES
  (1, 'admin@renocare.local',   '$2a$10$SZ2Fnqt5c6rlXSZMwgXDie0QvNOz7i8Jx114DnehlcvyJ8qPDaSTy', 'ADMIN',      'แอดมิน รีโนแคร์',         '020000000'),
  (2, 'owner@renocare.local',   '$2a$10$SZ2Fnqt5c6rlXSZMwgXDie0QvNOz7i8Jx114DnehlcvyJ8qPDaSTy', 'USER',       'สมหญิง เจ้าของหอ',        '0811111111'),
  (3, 'partner@dormbook.local', '$2a$10$SZ2Fnqt5c6rlXSZMwgXDie0QvNOz7i8Jx114DnehlcvyJ8qPDaSTy', 'USER',       'DormBook (ระบบจองห้องพัก)', '0822222222'),
  (4, 'tech1@renocare.local',   '$2a$10$SZ2Fnqt5c6rlXSZMwgXDie0QvNOz7i8Jx114DnehlcvyJ8qPDaSTy', 'TECHNICIAN', 'ช่างเอก งานโครงสร้าง',     '0833333333'),
  (5, 'tech2@renocare.local',   '$2a$10$SZ2Fnqt5c6rlXSZMwgXDie0QvNOz7i8Jx114DnehlcvyJ8qPDaSTy', 'TECHNICIAN', 'ช่างบี ไฟฟ้า-ประปา',       '0844444444');

INSERT INTO technician_profiles (user_id, skills, daily_wage) VALUES
  (4, 'ก่อ ฉาบ ปูกระเบื้อง ทาสี', 800.00),
  (5, 'ไฟฟ้า ประปา แอร์',        900.00);
