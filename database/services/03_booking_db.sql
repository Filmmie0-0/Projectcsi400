-- booking-service  |  MySQL 8.0.16+
-- การจองพื้นที่ + การชำระเงิน
-- tenant_id / reviewed_by / verified_by / changed_by = users.user_id (auth_db)
-- space_id = spaces.space_id (space_db)  — ไม่มี FK ข้าม database
SET NAMES utf8mb4;
USE booking_db;

-- space_owner_id / dormitory_id = snapshot จาก space-service ตอนสร้าง booking
-- (แทนการ JOIN spaces ข้าม database ใน v_owner_space_performance และ trigger ร้านค้าเดิม)
CREATE TABLE bookings (
  booking_id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code              VARCHAR(20) NOT NULL,
  space_id                  BIGINT UNSIGNED NOT NULL,
  space_owner_id            BIGINT UNSIGNED NOT NULL,
  dormitory_id              BIGINT UNSIGNED NULL,
  tenant_id                 BIGINT UNSIGNED NOT NULL,
  start_date                DATE NOT NULL,
  end_date                  DATE NOT NULL,
  price_per_month_snapshot  DECIMAL(12,2) NOT NULL,
  deposit_snapshot          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount              DECIMAL(12,2) NOT NULL,
  status                    ENUM('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  reject_reason             VARCHAR(500) NULL,
  reviewed_by               BIGINT UNSIGNED NULL,
  reviewed_at               TIMESTAMP NULL,
  note                      TEXT NULL,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (booking_id),
  UNIQUE KEY uq_booking_code (booking_code),
  KEY idx_booking_tenant (tenant_id, status),
  KEY idx_booking_owner (space_owner_id),
  KEY idx_booking_space_dates (space_id, status, start_date, end_date),
  CONSTRAINT chk_booking_dates CHECK (end_date > start_date)
) ENGINE=InnoDB;

CREATE TABLE payments (
  payment_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id         BIGINT UNSIGNED NOT NULL,
  amount             DECIMAL(12,2) NOT NULL,
  payment_type       ENUM('DEPOSIT','RENT','OTHER') NOT NULL DEFAULT 'RENT',
  slip_url           VARCHAR(500) NOT NULL,
  transfer_datetime  DATETIME NOT NULL,
  status             ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  verified_by        BIGINT UNSIGNED NULL,
  verified_at        TIMESTAMP NULL,
  reject_reason      VARCHAR(500) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  KEY idx_payment_booking (booking_id),
  KEY idx_payment_status (status),
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE booking_status_logs (
  log_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id   BIGINT UNSIGNED NOT NULL,
  from_status  VARCHAR(20) NULL,
  to_status    VARCHAR(20) NOT NULL,
  changed_by   BIGINT UNSIGNED NOT NULL,
  remark       VARCHAR(500) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_log_booking (booking_id),
  CONSTRAINT fk_log_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE VIEW v_booking_summary AS
SELECT
  (SELECT COUNT(*) FROM bookings WHERE status='PENDING') AS pending_bookings,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='VERIFIED') AS total_revenue;

-- ชื่อพื้นที่ไม่อยู่ใน database นี้แล้ว: ดึงจาก space-service ด้วย space_id
CREATE VIEW v_owner_space_performance AS
SELECT b.space_owner_id AS owner_id, b.space_id,
       COUNT(DISTINCT b.booking_id) AS total_bookings,
       COUNT(DISTINCT CASE WHEN b.status='APPROVED' THEN b.booking_id END) AS active_bookings,
       COALESCE(SUM(CASE WHEN p.status='VERIFIED' THEN p.amount END),0) AS revenue
FROM bookings b
LEFT JOIN payments p ON p.booking_id = b.booking_id
GROUP BY b.space_owner_id, b.space_id;
