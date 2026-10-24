-- Micro-Fulfillment Space Matching & Basic WMS  |  MySQL 8.0.16+
CREATE DATABASE IF NOT EXISTS mfc_wms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mfc_wms;

CREATE TABLE users (
  user_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('ADMIN','OWNER','TENANT') NOT NULL,
  status         ENUM('ACTIVE','SUSPENDED','PENDING_VERIFY') NOT NULL DEFAULT 'PENDING_VERIFY',
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

CREATE TABLE spaces (
  space_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id            BIGINT UNSIGNED NOT NULL,
  name                VARCHAR(200) NOT NULL,
  description         TEXT NULL,
  size_sqm            DECIMAL(10,2) NOT NULL,
  price_per_month     DECIMAL(12,2) NOT NULL,
  deposit_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  province            VARCHAR(100) NOT NULL,
  district            VARCHAR(100) NULL,
  address             TEXT NOT NULL,
  latitude            DECIMAL(10,7) NULL,
  longitude           DECIMAL(10,7) NULL,
  availability_status ENUM('AVAILABLE','UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id),
  KEY idx_spaces_owner (owner_id),
  KEY idx_spaces_search (province, availability_status, price_per_month),
  CONSTRAINT fk_spaces_owner FOREIGN KEY (owner_id) REFERENCES users(user_id),
  CONSTRAINT chk_spaces_size  CHECK (size_sqm > 0),
  CONSTRAINT chk_spaces_price CHECK (price_per_month >= 0)
) ENGINE=InnoDB;

CREATE TABLE space_images (
  image_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  space_id    BIGINT UNSIGNED NOT NULL,
  image_url   VARCHAR(500) NOT NULL,
  is_cover    TINYINT(1) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_images_space (space_id),
  CONSTRAINT fk_images_space FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE bookings (
  booking_id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_code              VARCHAR(20) NOT NULL,
  space_id                  BIGINT UNSIGNED NOT NULL,
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
  KEY idx_booking_space_dates (space_id, status, start_date, end_date),
  CONSTRAINT fk_booking_space    FOREIGN KEY (space_id)    REFERENCES spaces(space_id),
  CONSTRAINT fk_booking_tenant   FOREIGN KEY (tenant_id)   REFERENCES users(user_id),
  CONSTRAINT fk_booking_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(user_id),
  CONSTRAINT chk_booking_dates   CHECK (end_date > start_date)
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
  CONSTRAINT fk_payment_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id),
  CONSTRAINT fk_payment_verifier FOREIGN KEY (verified_by) REFERENCES users(user_id),
  CONSTRAINT chk_payment_amount  CHECK (amount > 0)
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
  CONSTRAINT fk_log_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
  CONSTRAINT fk_log_user    FOREIGN KEY (changed_by) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE product_categories (
  category_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  name         VARCHAR(100) NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_category_tenant_name (tenant_id, name),
  CONSTRAINT fk_category_tenant FOREIGN KEY (tenant_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE products (
  product_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  category_id    BIGINT UNSIGNED NULL,
  sku            VARCHAR(50) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  description    TEXT NULL,
  unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',
  cost_price     DECIMAL(12,2) NULL,
  selling_price  DECIMAL(12,2) NULL,
  reorder_level  INT UNSIGNED NOT NULL DEFAULT 0,
  image_url      VARCHAR(500) NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  UNIQUE KEY uq_product_tenant_sku (tenant_id, sku),
  CONSTRAINT fk_product_tenant   FOREIGN KEY (tenant_id)   REFERENCES users(user_id),
  CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES product_categories(category_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE inventory_transactions (
  transaction_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id        BIGINT UNSIGNED NOT NULL,
  booking_id        BIGINT UNSIGNED NOT NULL,
  transaction_type  ENUM('INBOUND','OUTBOUND','ADJUSTMENT') NOT NULL,
  quantity          INT NOT NULL,
  reference_no      VARCHAR(100) NULL,
  reason            VARCHAR(255) NULL,
  transaction_date  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by        BIGINT UNSIGNED NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (transaction_id),
  KEY idx_tx_product_booking (product_id, booking_id),
  KEY idx_tx_date (transaction_date),
  CONSTRAINT fk_tx_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_tx_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT fk_tx_user    FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT chk_tx_qty    CHECK (quantity <> 0)
) ENGINE=InnoDB;

CREATE TABLE inventory_balances (
  product_id        BIGINT UNSIGNED NOT NULL,
  booking_id        BIGINT UNSIGNED NOT NULL,
  quantity_on_hand  INT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, booking_id),
  CONSTRAINT fk_bal_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_bal_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
  CONSTRAINT chk_bal_qty    CHECK (quantity_on_hand >= 0)
) ENGINE=InnoDB;

DELIMITER $$
CREATE TRIGGER trg_inventory_after_insert
AFTER INSERT ON inventory_transactions
FOR EACH ROW
BEGIN
  DECLARE delta INT;
  SET delta = CASE NEW.transaction_type
                WHEN 'INBOUND'  THEN NEW.quantity
                WHEN 'OUTBOUND' THEN -NEW.quantity
                ELSE NEW.quantity
              END;
  INSERT INTO inventory_balances (product_id, booking_id, quantity_on_hand)
  VALUES (NEW.product_id, NEW.booking_id, delta)
  ON DUPLICATE KEY UPDATE quantity_on_hand = quantity_on_hand + delta;
END$$
DELIMITER ;

-- Dashboard views
CREATE VIEW v_admin_summary AS
SELECT
  (SELECT COUNT(*) FROM users WHERE role='OWNER')  AS total_owners,
  (SELECT COUNT(*) FROM users WHERE role='TENANT') AS total_tenants,
  (SELECT COUNT(*) FROM spaces WHERE is_active=1)  AS total_spaces,
  (SELECT COUNT(*) FROM bookings WHERE status='PENDING')  AS pending_bookings,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='VERIFIED') AS total_revenue;

CREATE VIEW v_owner_space_performance AS
SELECT s.owner_id, s.space_id, s.name,
       COUNT(DISTINCT b.booking_id) AS total_bookings,
       COUNT(DISTINCT CASE WHEN b.status='APPROVED' THEN b.booking_id END) AS active_bookings,
       COALESCE(SUM(CASE WHEN p.status='VERIFIED' THEN p.amount END),0) AS revenue
FROM spaces s
LEFT JOIN bookings b ON b.space_id = s.space_id
LEFT JOIN payments p ON p.booking_id = b.booking_id
GROUP BY s.owner_id, s.space_id, s.name;

CREATE VIEW v_tenant_low_stock AS
SELECT p.tenant_id, p.product_id, p.sku, p.name, p.reorder_level,
       COALESCE(SUM(ib.quantity_on_hand),0) AS total_on_hand
FROM products p
LEFT JOIN inventory_balances ib ON ib.product_id = p.product_id
WHERE p.is_active = 1
GROUP BY p.tenant_id, p.product_id, p.sku, p.name, p.reorder_level
HAVING total_on_hand <= p.reorder_level;
