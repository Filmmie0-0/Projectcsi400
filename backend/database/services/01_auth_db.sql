-- auth-service  |  MySQL 8.0.16+
-- เจ้าของข้อมูลผู้ใช้ทั้งหมด service อื่นเก็บแค่ user_id (ไม่มี FK ข้าม database)
SET NAMES utf8mb4;
USE auth_db;

CREATE TABLE users (
  user_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('ADMIN','OWNER','TENANT') NOT NULL,
  status         ENUM('ACTIVE','SUSPENDED','PENDING_VERIFY') NOT NULL DEFAULT 'PENDING_VERIFY',
  token_version  INT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at  TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE user_profiles (
  user_id            BIGINT UNSIGNED NOT NULL,
  full_name          VARCHAR(150) NOT NULL,
  phone              VARCHAR(20) NULL,
  business_name      VARCHAR(200) NULL,
  tax_id             VARCHAR(20) NULL,
  address            TEXT NULL,
  bank_name          VARCHAR(100) NULL,
  bank_account_no    VARCHAR(30) NULL,
  bank_account_name  VARCHAR(150) NULL,
  avatar_url         VARCHAR(500) NULL,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ส่วนหนึ่งของ v_admin_summary เดิม (ส่วนที่เหลืออยู่ใน space_db / booking_db)
CREATE VIEW v_user_summary AS
SELECT
  (SELECT COUNT(*) FROM users WHERE role='OWNER')  AS total_owners,
  (SELECT COUNT(*) FROM users WHERE role='TENANT') AS total_tenants;
