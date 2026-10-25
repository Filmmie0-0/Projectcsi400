-- Dormitory Micro-Warehouse & Wholesale Web Service  |  MySQL 8.0.16+
-- Run after database/schema.sql (run once):
--   mysql -u root -p mfc_wms < database/migrations/002_dormitory_wholesale.sql
--
-- Roles: users.role 'OWNER' = DORM_OWNER (เจ้าของหอพัก), 'TENANT' = เจ้าของร้านขายส่ง, 'ADMIN'
USE mfc_wms;

-- ───────────────────────── Dormitories ─────────────────────────
CREATE TABLE dormitories (
  dormitory_id  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id      BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(200) NOT NULL,
  total_rooms   INT UNSIGNED NOT NULL,
  phone         VARCHAR(20) NULL,
  province      VARCHAR(100) NOT NULL,
  district      VARCHAR(100) NULL,
  address       TEXT NOT NULL,
  latitude      DECIMAL(10,7) NULL,
  longitude     DECIMAL(10,7) NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dormitory_id),
  KEY idx_dorm_owner (owner_id),
  KEY idx_dorm_province (province),
  CONSTRAINT fk_dorm_owner  FOREIGN KEY (owner_id) REFERENCES users(user_id),
  CONSTRAINT chk_dorm_rooms CHECK (total_rooms > 0)
) ENGINE=InnoDB;

-- พื้นที่เช่าใต้หอพัก (spaces เดิม) ผูกกับหอพัก
ALTER TABLE spaces
  ADD COLUMN dormitory_id BIGINT UNSIGNED NULL AFTER owner_id,
  ADD KEY idx_spaces_dorm (dormitory_id),
  ADD CONSTRAINT fk_spaces_dorm FOREIGN KEY (dormitory_id) REFERENCES dormitories(dormitory_id);

-- ───────────────────────── Stores ─────────────────────────
-- 1 booking ที่อนุมัติแล้ว = 1 ร้านค้า (dormitory_id ถูกเติมอัตโนมัติจาก booking → space)
CREATE TABLE stores (
  store_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  booking_id    BIGINT UNSIGNED NOT NULL,
  dormitory_id  BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(150) NOT NULL,
  logo_url      VARCHAR(500) NULL,
  description   TEXT NULL,
  phone         VARCHAR(20) NULL,
  status        ENUM('OPEN','CLOSED','SUSPENDED') NOT NULL DEFAULT 'CLOSED',
  open_time     TIME NULL,
  close_time    TIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (store_id),
  UNIQUE KEY uq_store_booking (booking_id),
  UNIQUE KEY uq_store_dorm_name (dormitory_id, name),
  KEY idx_store_tenant (tenant_id),
  CONSTRAINT fk_store_tenant  FOREIGN KEY (tenant_id)    REFERENCES users(user_id),
  CONSTRAINT fk_store_booking FOREIGN KEY (booking_id)   REFERENCES bookings(booking_id),
  CONSTRAINT fk_store_dorm    FOREIGN KEY (dormitory_id) REFERENCES dormitories(dormitory_id)
) ENGINE=InnoDB;

-- ───────────────────────── Categories & Products ─────────────────────────
ALTER TABLE product_categories
  ADD COLUMN store_id   BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER name,
  ADD KEY idx_category_store (store_id),
  ADD CONSTRAINT fk_category_store FOREIGN KEY (store_id) REFERENCES stores(store_id) ON DELETE CASCADE;

-- selling_price = ราคาขายปลีก, ราคาส่งอยู่ใน product_price_tiers
ALTER TABLE products
  ADD COLUMN store_id       BIGINT UNSIGNED NULL AFTER tenant_id,
  ADD COLUMN units_per_case INT UNSIGNED NULL AFTER unit,
  ADD KEY idx_product_store (store_id),
  ADD CONSTRAINT fk_product_store FOREIGN KEY (store_id) REFERENCES stores(store_id),
  ADD CONSTRAINT chk_product_case CHECK (units_per_case IS NULL OR units_per_case > 0);

-- ราคาขั้นบันได: ซื้อ >= min_qty ชิ้น ได้ราคา unit_price ต่อชิ้น
CREATE TABLE product_price_tiers (
  tier_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  label       VARCHAR(50) NULL,
  min_qty     INT UNSIGNED NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tier_id),
  UNIQUE KEY uq_tier_product_qty (product_id, min_qty),
  CONSTRAINT fk_tier_product FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  CONSTRAINT chk_tier_qty    CHECK (min_qty >= 2),
  CONSTRAINT chk_tier_price  CHECK (unit_price >= 0)
) ENGINE=InnoDB;

-- ───────────────────────── Open API ─────────────────────────
-- เก็บเฉพาะ SHA-256 ของ key; key_prefix ใช้ค้นหา/แสดงผล (เช่น "mfc_ab12cd")
CREATE TABLE api_keys (
  api_key_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dormitory_id        BIGINT UNSIGNED NOT NULL,
  store_id            BIGINT UNSIGNED NULL,
  name                VARCHAR(100) NOT NULL,
  key_prefix          VARCHAR(16) NOT NULL,
  key_hash            CHAR(64) NOT NULL,
  scopes              SET('products:read','orders:read','orders:write') NOT NULL DEFAULT 'products:read,orders:read,orders:write',
  rate_limit_per_min  INT UNSIGNED NOT NULL DEFAULT 60,
  status              ENUM('ACTIVE','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  created_by          BIGINT UNSIGNED NOT NULL,
  last_used_at        TIMESTAMP NULL,
  expires_at          TIMESTAMP NULL,
  revoked_at          TIMESTAMP NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (api_key_id),
  UNIQUE KEY uq_api_key_prefix (key_prefix),
  UNIQUE KEY uq_api_key_hash (key_hash),
  KEY idx_api_key_dorm (dormitory_id, status),
  CONSTRAINT fk_api_key_dorm  FOREIGN KEY (dormitory_id) REFERENCES dormitories(dormitory_id),
  CONSTRAINT fk_api_key_store FOREIGN KEY (store_id)     REFERENCES stores(store_id) ON DELETE CASCADE,
  CONSTRAINT fk_api_key_user  FOREIGN KEY (created_by)   REFERENCES users(user_id)
) ENGINE=InnoDB;

-- ───────────────────────── External Orders ─────────────────────────
CREATE TABLE external_orders (
  order_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_code       VARCHAR(20) NOT NULL,
  store_id         BIGINT UNSIGNED NOT NULL,
  dormitory_id     BIGINT UNSIGNED NOT NULL,
  api_key_id       BIGINT UNSIGNED NOT NULL,
  external_ref     VARCHAR(100) NULL,
  room_no          VARCHAR(20) NOT NULL,
  resident_name    VARCHAR(150) NULL,
  resident_phone   VARCHAR(20) NULL,
  subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status           ENUM('PENDING','CONFIRMED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  billing_status   ENUM('UNBILLED','BILLED','PAID','VOID') NOT NULL DEFAULT 'UNBILLED',
  billing_period   CHAR(7) NOT NULL DEFAULT (DATE_FORMAT(CURRENT_DATE, '%Y-%m')),
  dorm_bill_ref    VARCHAR(100) NULL,
  billed_at        TIMESTAMP NULL,
  note             VARCHAR(500) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  UNIQUE KEY uq_order_code (order_code),
  UNIQUE KEY uq_order_idempotency (api_key_id, external_ref),
  KEY idx_order_store (store_id, status),
  KEY idx_order_billing (dormitory_id, billing_period, room_no, billing_status),
  CONSTRAINT fk_order_store    FOREIGN KEY (store_id)     REFERENCES stores(store_id),
  CONSTRAINT fk_order_dorm     FOREIGN KEY (dormitory_id) REFERENCES dormitories(dormitory_id),
  CONSTRAINT fk_order_api_key  FOREIGN KEY (api_key_id)   REFERENCES api_keys(api_key_id),
  CONSTRAINT chk_order_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND total_amount >= 0),
  CONSTRAINT chk_order_period  CHECK (billing_period REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')
) ENGINE=InnoDB;

-- unit_price / price_tier_id / line_total / product_name ถูกคำนวณโดย trigger
CREATE TABLE external_order_items (
  item_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       BIGINT UNSIGNED NOT NULL,
  product_id     BIGINT UNSIGNED NOT NULL,
  price_tier_id  BIGINT UNSIGNED NULL,
  product_name   VARCHAR(200) NOT NULL DEFAULT '',
  quantity       INT UNSIGNED NOT NULL,
  unit_price     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (item_id),
  UNIQUE KEY uq_item_order_product (order_id, product_id),
  KEY idx_item_product (product_id),
  CONSTRAINT fk_item_order   FOREIGN KEY (order_id)      REFERENCES external_orders(order_id) ON DELETE CASCADE,
  CONSTRAINT fk_item_product FOREIGN KEY (product_id)    REFERENCES products(product_id),
  CONSTRAINT fk_item_tier    FOREIGN KEY (price_tier_id) REFERENCES product_price_tiers(tier_id) ON DELETE SET NULL,
  CONSTRAINT chk_item_qty    CHECK (quantity > 0)
) ENGINE=InnoDB;

-- ───────────────────────── Triggers ─────────────────────────
DELIMITER $$

-- (จาก schema.sql) อัปเดตยอดคงเหลือทุกครั้งที่มี inventory_transactions
-- UPDATE ก่อน INSERT: ON DUPLICATE KEY UPDATE จะตรวจ chk_bal_qty กับแถวติดลบก่อนเสมอ ทำให้ OUTBOUND ล้มเหลว
DROP TRIGGER IF EXISTS trg_inventory_after_insert$$
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
  UPDATE inventory_balances SET quantity_on_hand = quantity_on_hand + delta
  WHERE product_id = NEW.product_id AND booking_id = NEW.booking_id;
  IF ROW_COUNT() = 0 THEN
    INSERT INTO inventory_balances (product_id, booking_id, quantity_on_hand)
    VALUES (NEW.product_id, NEW.booking_id, delta);
  END IF;
END$$

-- ร้านต้องมาจาก booking ที่อนุมัติแล้วของผู้เช่าคนเดียวกัน
CREATE TRIGGER trg_store_before_insert
BEFORE INSERT ON stores
FOR EACH ROW
BEGIN
  DECLARE v_tenant BIGINT UNSIGNED;
  DECLARE v_status VARCHAR(20);
  DECLARE v_dorm   BIGINT UNSIGNED;

  SELECT b.tenant_id, b.status, s.dormitory_id INTO v_tenant, v_status, v_dorm
  FROM bookings b JOIN spaces s ON s.space_id = b.space_id
  WHERE b.booking_id = NEW.booking_id;

  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking does not belong to this tenant';
  END IF;
  IF v_status <> 'APPROVED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Booking must be APPROVED before creating a store';
  END IF;
  IF v_dorm IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Space is not linked to a dormitory';
  END IF;
  SET NEW.dormitory_id = v_dorm;
END$$

-- ตรวจ API key + ร้าน และเติม dormitory_id
CREATE TRIGGER trg_order_before_insert
BEFORE INSERT ON external_orders
FOR EACH ROW
BEGIN
  DECLARE v_key_dorm   BIGINT UNSIGNED;
  DECLARE v_key_store  BIGINT UNSIGNED;
  DECLARE v_key_status VARCHAR(10);
  DECLARE v_key_exp    TIMESTAMP;
  DECLARE v_store_dorm BIGINT UNSIGNED;
  DECLARE v_store_stat VARCHAR(10);

  SELECT dormitory_id, store_id, status, expires_at
    INTO v_key_dorm, v_key_store, v_key_status, v_key_exp
  FROM api_keys WHERE api_key_id = NEW.api_key_id;
  SELECT dormitory_id, status INTO v_store_dorm, v_store_stat
  FROM stores WHERE store_id = NEW.store_id;

  IF v_key_status IS NULL OR v_key_status <> 'ACTIVE'
     OR (v_key_exp IS NOT NULL AND v_key_exp < CURRENT_TIMESTAMP) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'API key is invalid, revoked or expired';
  END IF;
  IF v_store_dorm IS NULL OR v_store_dorm <> v_key_dorm
     OR (v_key_store IS NOT NULL AND v_key_store <> NEW.store_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'API key is not allowed to order from this store';
  END IF;
  IF v_store_stat <> 'OPEN' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Store is not open';
  END IF;

  SET NEW.dormitory_id = v_store_dorm;
  SET NEW.subtotal = 0.00;
  SET NEW.total_amount = GREATEST(0, NEW.subtotal - NEW.discount_amount);
END$$

-- ยอดรวม / ห้ามยกเลิกออเดอร์ที่รวมบิลค่าหอไปแล้ว
CREATE TRIGGER trg_order_before_update
BEFORE UPDATE ON external_orders
FOR EACH ROW
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    IF OLD.billing_status IN ('BILLED','PAID') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Order already billed to dormitory; void the bill first';
    END IF;
    SET NEW.billing_status = 'VOID';
  END IF;
  IF OLD.status = 'CANCELLED' AND NEW.status <> 'CANCELLED' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelled order cannot be reopened';
  END IF;
  IF NEW.billing_status = 'BILLED' AND OLD.billing_status <> 'BILLED' AND NEW.billed_at IS NULL THEN
    SET NEW.billed_at = CURRENT_TIMESTAMP;
  END IF;
  SET NEW.total_amount = GREATEST(0, NEW.subtotal - NEW.discount_amount);
END$$

-- คืนสต็อกเมื่อยกเลิกออเดอร์
CREATE TRIGGER trg_order_after_update
AFTER UPDATE ON external_orders
FOR EACH ROW
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
    INSERT INTO inventory_transactions
      (product_id, booking_id, transaction_type, quantity, reference_no, reason, created_by)
    SELECT i.product_id, st.booking_id, 'INBOUND', i.quantity, NEW.order_code,
           'คืนสต็อก: ยกเลิกออเดอร์จากหอพัก', st.tenant_id
    FROM external_order_items i
    JOIN stores st ON st.store_id = NEW.store_id
    WHERE i.order_id = NEW.order_id;
  END IF;
END$$

-- เลือกราคาขั้นบันได + ตรวจสต็อก
CREATE TRIGGER trg_order_item_before_insert
BEFORE INSERT ON external_order_items
FOR EACH ROW
BEGIN
  DECLARE v_store      BIGINT UNSIGNED;
  DECLARE v_booking    BIGINT UNSIGNED;
  DECLARE v_tenant     BIGINT UNSIGNED;
  DECLARE v_status     VARCHAR(10);
  DECLARE v_p_tenant   BIGINT UNSIGNED;
  DECLARE v_p_store    BIGINT UNSIGNED;
  DECLARE v_p_active   TINYINT;
  DECLARE v_p_name     VARCHAR(200);
  DECLARE v_retail     DECIMAL(12,2);
  DECLARE v_tier_id    BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_tier_price DECIMAL(12,2) DEFAULT NULL;
  DECLARE v_on_hand    INT DEFAULT 0;

  SELECT o.store_id, st.booking_id, st.tenant_id, o.status
    INTO v_store, v_booking, v_tenant, v_status
  FROM external_orders o JOIN stores st ON st.store_id = o.store_id
  WHERE o.order_id = NEW.order_id;

  IF v_status <> 'PENDING' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Items can only be added to PENDING orders';
  END IF;

  SELECT tenant_id, store_id, is_active, name, selling_price
    INTO v_p_tenant, v_p_store, v_p_active, v_p_name, v_retail
  FROM products WHERE product_id = NEW.product_id;

  IF v_p_tenant IS NULL OR v_p_tenant <> v_tenant
     OR (v_p_store IS NOT NULL AND v_p_store <> v_store) OR v_p_active = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Product is not available in this store';
  END IF;
  IF v_retail IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Product has no selling price';
  END IF;

  SELECT COALESCE(SUM(quantity_on_hand), 0) INTO v_on_hand
  FROM inventory_balances WHERE product_id = NEW.product_id AND booking_id = v_booking;
  IF v_on_hand < NEW.quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock';
  END IF;

  SELECT tier_id, unit_price INTO v_tier_id, v_tier_price
  FROM product_price_tiers
  WHERE product_id = NEW.product_id AND min_qty <= NEW.quantity
  ORDER BY min_qty DESC LIMIT 1;

  SET NEW.product_name  = v_p_name;
  SET NEW.price_tier_id = v_tier_id;
  SET NEW.unit_price    = COALESCE(v_tier_price, v_retail);
  SET NEW.line_total    = NEW.unit_price * NEW.quantity;
END$$

-- ตัดสต็อกอัตโนมัติ + บวกยอดออเดอร์
CREATE TRIGGER trg_order_item_after_insert
AFTER INSERT ON external_order_items
FOR EACH ROW
BEGIN
  INSERT INTO inventory_transactions
    (product_id, booking_id, transaction_type, quantity, reference_no, reason, created_by)
  SELECT NEW.product_id, st.booking_id, 'OUTBOUND', NEW.quantity, o.order_code,
         CONCAT('ออเดอร์หอพัก ห้อง ', o.room_no), st.tenant_id
  FROM external_orders o JOIN stores st ON st.store_id = o.store_id
  WHERE o.order_id = NEW.order_id;

  UPDATE external_orders SET subtotal = subtotal + NEW.line_total WHERE order_id = NEW.order_id;
END$$

DELIMITER ;

-- ───────────────────────── Views ─────────────────────────
-- (จาก schema.sql)
CREATE OR REPLACE VIEW v_admin_summary AS
SELECT
  (SELECT COUNT(*) FROM users WHERE role='OWNER')  AS total_owners,
  (SELECT COUNT(*) FROM users WHERE role='TENANT') AS total_tenants,
  (SELECT COUNT(*) FROM spaces WHERE is_active=1)  AS total_spaces,
  (SELECT COUNT(*) FROM bookings WHERE status='PENDING')  AS pending_bookings,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='VERIFIED') AS total_revenue;

CREATE OR REPLACE VIEW v_owner_space_performance AS
SELECT s.owner_id, s.space_id, s.name,
       COUNT(DISTINCT b.booking_id) AS total_bookings,
       COUNT(DISTINCT CASE WHEN b.status='APPROVED' THEN b.booking_id END) AS active_bookings,
       COALESCE(SUM(CASE WHEN p.status='VERIFIED' THEN p.amount END),0) AS revenue
FROM spaces s
LEFT JOIN bookings b ON b.space_id = s.space_id
LEFT JOIN payments p ON p.booking_id = b.booking_id
GROUP BY s.owner_id, s.space_id, s.name;

CREATE OR REPLACE VIEW v_tenant_low_stock AS
SELECT p.tenant_id, p.product_id, p.sku, p.name, p.reorder_level,
       COALESCE(SUM(ib.quantity_on_hand),0) AS total_on_hand
FROM products p
LEFT JOIN inventory_balances ib ON ib.product_id = p.product_id
WHERE p.is_active = 1
GROUP BY p.tenant_id, p.product_id, p.sku, p.name, p.reorder_level
HAVING total_on_hand <= p.reorder_level;

-- แคตตาล็อกสำหรับ Open API (GET products)
CREATE OR REPLACE VIEW v_store_catalog AS
SELECT st.dormitory_id, st.store_id, st.name AS store_name, st.status AS store_status,
       p.product_id, p.sku, p.name, p.unit, p.units_per_case, c.name AS category_name,
       p.selling_price AS retail_price, p.image_url,
       COALESCE(ib.quantity_on_hand, 0) AS stock_on_hand
FROM stores st
JOIN products p ON p.tenant_id = st.tenant_id AND (p.store_id IS NULL OR p.store_id = st.store_id)
LEFT JOIN product_categories c ON c.category_id = p.category_id
LEFT JOIN inventory_balances ib ON ib.product_id = p.product_id AND ib.booking_id = st.booking_id
WHERE p.is_active = 1;

-- ยอดที่ต้องรวมเข้าบิลค่าหอ แยกตามห้อง/เดือน
CREATE OR REPLACE VIEW v_dorm_room_billing AS
SELECT dormitory_id, billing_period, room_no,
       COUNT(*) AS order_count,
       SUM(total_amount) AS amount_to_bill
FROM external_orders
WHERE status <> 'CANCELLED' AND billing_status = 'UNBILLED'
GROUP BY dormitory_id, billing_period, room_no;
