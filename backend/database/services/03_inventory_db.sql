-- inventory-service  |  MySQL 8.0.16+
-- คลังวัสดุ + การเบิก/คืนของของช่าง
-- job_id = jobs.job_id (job_db), technician_id / created_by / reviewed_by = users.user_id (auth_db)
-- ไม่มี FK ข้าม database: job_code / technician_name เป็น snapshot ตอนสร้างใบเบิก
SET NAMES utf8mb4;
USE inventory_db;

-- stock_on_hand ไม่ให้แก้ตรง ๆ: เปลี่ยนผ่าน stock_movements เท่านั้น (trigger ด้านล่าง)
CREATE TABLE materials (
  material_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku            VARCHAR(30) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(50) NOT NULL,
  unit           VARCHAR(20) NOT NULL,
  unit_cost      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  stock_on_hand  INT NOT NULL DEFAULT 0,
  reorder_level  INT UNSIGNED NOT NULL DEFAULT 0,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (material_id),
  UNIQUE KEY uq_material_sku (sku),
  KEY idx_material_category (category),
  CONSTRAINT chk_material_stock CHECK (stock_on_hand >= 0),
  CONSTRAINT chk_material_cost  CHECK (unit_cost >= 0)
) ENGINE=InnoDB;

-- PENDING → ISSUED (แอดมินอนุมัติ + จ่ายของ) → CLOSED (ช่างคืนของเหลือ/ปิดใบเบิก) | REJECTED
CREATE TABLE requisitions (
  requisition_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  req_code         VARCHAR(20) NOT NULL,
  job_id           BIGINT UNSIGNED NOT NULL,
  job_code         VARCHAR(20) NOT NULL,
  technician_id    BIGINT UNSIGNED NOT NULL,
  technician_name  VARCHAR(150) NOT NULL,
  status           ENUM('PENDING','ISSUED','REJECTED','CLOSED') NOT NULL DEFAULT 'PENDING',
  note             VARCHAR(500) NULL,
  reviewed_by      BIGINT UNSIGNED NULL,
  reviewed_at      TIMESTAMP NULL,
  reject_reason    VARCHAR(500) NULL,
  closed_at        TIMESTAMP NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (requisition_id),
  UNIQUE KEY uq_req_code (req_code),
  KEY idx_req_job (job_id),
  KEY idx_req_tech (technician_id, status)
) ENGINE=InnoDB;

-- unit_cost = snapshot ราคาทุนตอนจ่ายของ (คิดต้นทุนจริงของงาน)
CREATE TABLE requisition_items (
  item_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requisition_id  BIGINT UNSIGNED NOT NULL,
  material_id     BIGINT UNSIGNED NOT NULL,
  qty_requested   INT UNSIGNED NOT NULL,
  qty_issued      INT UNSIGNED NOT NULL DEFAULT 0,
  qty_returned    INT UNSIGNED NOT NULL DEFAULT 0,
  unit_cost       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (item_id),
  UNIQUE KEY uq_ritem_material (requisition_id, material_id),
  CONSTRAINT fk_ritem_req      FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id) ON DELETE CASCADE,
  CONSTRAINT fk_ritem_material FOREIGN KEY (material_id)    REFERENCES materials(material_id),
  CONSTRAINT chk_ritem_qty CHECK (qty_requested > 0 AND qty_issued <= qty_requested AND qty_returned <= qty_issued)
) ENGINE=InnoDB;

-- IN = รับเข้า, OUT = จ่ายตามใบเบิก, RETURN = ช่างคืน, ADJUST = ปรับยอด (qty ติดลบได้)
CREATE TABLE stock_movements (
  movement_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  material_id     BIGINT UNSIGNED NOT NULL,
  movement_type   ENUM('IN','OUT','RETURN','ADJUST') NOT NULL,
  qty             INT NOT NULL,
  unit_cost       DECIMAL(12,2) NULL,
  requisition_id  BIGINT UNSIGNED NULL,
  note            VARCHAR(500) NULL,
  created_by      BIGINT UNSIGNED NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (movement_id),
  KEY idx_move_material (material_id, created_at),
  KEY idx_move_req (requisition_id),
  CONSTRAINT fk_move_material FOREIGN KEY (material_id)    REFERENCES materials(material_id),
  CONSTRAINT fk_move_req      FOREIGN KEY (requisition_id) REFERENCES requisitions(requisition_id),
  CONSTRAINT chk_move_qty CHECK (qty <> 0 AND (movement_type = 'ADJUST' OR qty > 0))
) ENGINE=InnoDB;

-- ───────────────────────── Triggers ─────────────────────────
DELIMITER $$

-- ตรวจสต็อกพอก่อนตัด (ข้อความอ่านง่ายกว่า error ของ chk_material_stock)
CREATE TRIGGER trg_move_before_insert BEFORE INSERT ON stock_movements FOR EACH ROW
BEGIN
  DECLARE v_stock INT;
  DECLARE v_name VARCHAR(200);
  SELECT stock_on_hand, name INTO v_stock, v_name FROM materials WHERE material_id = NEW.material_id FOR UPDATE;
  IF (NEW.movement_type = 'OUT' AND NEW.qty > v_stock) OR (NEW.movement_type = 'ADJUST' AND v_stock + NEW.qty < 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INSUFFICIENT_STOCK: สต็อกวัสดุไม่พอ';
  END IF;
END$$

CREATE TRIGGER trg_move_after_insert AFTER INSERT ON stock_movements FOR EACH ROW
BEGIN
  UPDATE materials
     SET stock_on_hand = stock_on_hand + IF(NEW.movement_type = 'OUT', -NEW.qty, NEW.qty),
         unit_cost = IF(NEW.movement_type = 'IN' AND NEW.unit_cost IS NOT NULL, NEW.unit_cost, unit_cost)
   WHERE material_id = NEW.material_id;
END$$

DELIMITER ;

-- ───────────────────────── Views ─────────────────────────
-- ต้นทุนวัสดุจริงต่องาน (จ่ายออก - คืน) ใช้เทียบกับค่าวัสดุในสัญญา
CREATE VIEW v_job_material_cost AS
SELECT r.job_id, r.job_code,
       COUNT(DISTINCT r.requisition_id)                         AS requisitions,
       COALESCE(SUM((i.qty_issued - i.qty_returned) * i.unit_cost), 0) AS material_cost
FROM requisitions r
JOIN requisition_items i ON i.requisition_id = r.requisition_id
WHERE r.status IN ('ISSUED','CLOSED')
GROUP BY r.job_id, r.job_code;

CREATE VIEW v_inventory_summary AS
SELECT
  (SELECT COUNT(*) FROM materials WHERE is_active = 1)                                   AS total_materials,
  (SELECT COUNT(*) FROM materials WHERE is_active = 1 AND stock_on_hand <= reorder_level) AS low_stock_materials,
  (SELECT COALESCE(SUM(stock_on_hand * unit_cost), 0) FROM materials WHERE is_active = 1) AS stock_value,
  (SELECT COUNT(*) FROM requisitions WHERE status = 'PENDING')                            AS pending_requisitions;

-- ───────────────────────── Seed ─────────────────────────
-- material_id 1-11 ถูกอ้างถึงใน job_db.contract_items
INSERT INTO materials (material_id, sku, name, category, unit, reorder_level) VALUES
  (1,  'CEM-50',  'ปูนซีเมนต์ 50 กก.',             'งานปูน',  'ถุง',  20),
  (2,  'TIL-60',  'กระเบื้องพื้น 60x60 ซม.',       'งานปูน',  'แผ่น', 50),
  (3,  'PNT-IN9', 'สีน้ำอะคริลิกภายใน 9 ลิตร',    'งานสี',   'ถัง',  5),
  (4,  'PNT-PR9', 'สีรองพื้นปูนใหม่ 9 ลิตร',      'งานสี',   'ถัง',  5),
  (5,  'PVC-12',  'ท่อ PVC 1/2 นิ้ว ยาว 4 ม.',     'ประปา',   'เส้น', 20),
  (6,  'WIR-25',  'สายไฟ THW 2.5 sq.mm 100 ม.',    'ไฟฟ้า',   'ม้วน', 3),
  (7,  'LED-18',  'โคม LED panel 18W',              'ไฟฟ้า',   'ชุด',  10),
  (8,  'GYP-9',   'แผ่นยิปซัม 9 มม.',              'ฝ้า/ผนัง', 'แผ่น', 20),
  (9,  'SCR-GY',  'สกรูยิปซัม (กล่อง 1,000 ตัว)',  'ฝ้า/ผนัง', 'กล่อง', 5),
  (10, 'SIL-01',  'ซิลิโคนยาแนว',                  'ประปา',   'หลอด', 10),
  (11, 'FAU-01',  'ก๊อกอ่างล้างหน้า',               'ประปา',   'ชุด',  3);

-- รับเข้าครั้งแรก (trigger ตั้ง stock_on_hand และ unit_cost)
INSERT INTO stock_movements (material_id, movement_type, qty, unit_cost, note, created_by, created_at) VALUES
  (1, 'IN', 60, 165, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),  (2, 'IN', 200, 85, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),
  (3, 'IN', 12, 1450, 'ยอดยกมา', 1, '2026-09-01 09:00:00'), (4, 'IN', 8, 1200, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),
  (5, 'IN', 40, 45, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),   (6, 'IN', 4, 1650, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),
  (7, 'IN', 25, 320, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),  (8, 'IN', 30, 155, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),
  (9, 'IN', 6, 120, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),   (10, 'IN', 8, 95, 'ยอดยกมา', 1, '2026-09-01 09:00:00'),
  (11, 'IN', 4, 450, 'ยอดยกมา', 1, '2026-09-01 09:00:00');

INSERT INTO requisitions (requisition_id, req_code, job_id, job_code, technician_id, technician_name, status, note, reviewed_by, reviewed_at, created_at) VALUES
  (1, 'RQ2610-0001', 1, 'JB2609-0001', 4, 'ช่างเอก งานโครงสร้าง', 'ISSUED', 'งานพื้นสัปดาห์แรก', 1, '2026-10-01 08:30:00', '2026-10-01 08:00:00'),
  (2, 'RQ2610-0002', 1, 'JB2609-0001', 5, 'ช่างบี ไฟฟ้า-ประปา',   'PENDING', 'งานไฟ', NULL, NULL, '2026-10-26 08:00:00');

INSERT INTO requisition_items (requisition_id, material_id, qty_requested, qty_issued, unit_cost) VALUES
  (1, 1, 20, 20, 165), (1, 2, 80, 80, 85),
  (2, 6, 2, 0, 0), (2, 7, 10, 0, 0);

INSERT INTO stock_movements (material_id, movement_type, qty, requisition_id, note, created_by, created_at) VALUES
  (1, 'OUT', 20, 1, 'RQ2610-0001', 1, '2026-10-01 08:30:00'),
  (2, 'OUT', 80, 1, 'RQ2610-0001', 1, '2026-10-01 08:30:00');
