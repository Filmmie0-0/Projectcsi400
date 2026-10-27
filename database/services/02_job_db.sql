-- job-service  |  MySQL 8.0.16+
-- งานตรวจสอบห้องเช่า / รีโนเวทพื้นที่ + ประเมินหน้างาน + สัญญา + ใบแจ้งหนี้ + API พาร์ทเนอร์ (ระบบจองห้องพัก)
-- requester_id / technician_id / created_by / signed_by / changed_by = users.user_id (auth_db)
-- material_id = materials.material_id (inventory_db)  — ไม่มี FK ข้าม database
SET NAMES utf8mb4;
USE job_db;

-- ───────────────────────── Partner (ระบบจองห้องพักของเพื่อน) ─────────────────────────
-- owner_user_id = บัญชี USER ที่เป็นตัวแทนพาร์ทเนอร์ (ใช้เซ็นสัญญา/จ่ายเงินแทนงานที่ส่งมาทาง API)
-- api_key เก็บแค่ SHA-256 แสดงคีย์เต็มครั้งเดียวตอนสร้าง
CREATE TABLE partners (
  partner_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  owner_user_id   BIGINT UNSIGNED NOT NULL,
  api_key_prefix  VARCHAR(12) NOT NULL,
  api_key_hash    CHAR(64) NOT NULL,
  webhook_url     VARCHAR(500) NULL,
  webhook_secret  VARCHAR(64) NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (partner_id),
  UNIQUE KEY uq_partner_key (api_key_hash)
) ENGINE=InnoDB;

-- ───────────────────────── สถานที่ ─────────────────────────
-- external_ref = id ฝั่งระบบพาร์ทเนอร์ ใช้ upsert ตึก/ห้องที่ส่งมากับงาน
CREATE TABLE buildings (
  building_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id  BIGINT UNSIGNED NOT NULL,
  partner_id     BIGINT UNSIGNED NULL,
  external_ref   VARCHAR(64) NULL,
  name           VARCHAR(200) NOT NULL,
  address        TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (building_id),
  UNIQUE KEY uq_building_ext (partner_id, external_ref),
  KEY idx_building_owner (owner_user_id),
  CONSTRAINT fk_building_partner FOREIGN KEY (partner_id) REFERENCES partners(partner_id)
) ENGINE=InnoDB;

-- ROOM = ห้องเช่า, COMMON = พื้นที่ส่วนกลาง, UNDER_BUILDING = พื้นที่ใต้ตึก
CREATE TABLE units (
  unit_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id   BIGINT UNSIGNED NOT NULL,
  unit_type     ENUM('ROOM','COMMON','UNDER_BUILDING') NOT NULL DEFAULT 'ROOM',
  code          VARCHAR(50) NOT NULL,
  floor         VARCHAR(10) NULL,
  size_sqm      DECIMAL(8,2) NULL,
  external_ref  VARCHAR(64) NULL,
  PRIMARY KEY (unit_id),
  UNIQUE KEY uq_unit_code (building_id, code),
  CONSTRAINT fk_unit_building FOREIGN KEY (building_id) REFERENCES buildings(building_id) ON DELETE CASCADE,
  CONSTRAINT chk_unit_size CHECK (size_sqm IS NULL OR size_sqm > 0)
) ENGINE=InnoDB;

-- ───────────────────────── งาน (Work order) ─────────────────────────
-- NEW → SURVEY_ASSIGNED → SURVEYED → QUOTED → CONTRACTED → IN_PROGRESS → COMPLETED  (+ CANCELLED)
-- งาน INSPECTION ที่ตรวจแล้วไม่ต้องซ่อม: SURVEYED → COMPLETED ได้เลย
CREATE TABLE jobs (
  job_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_code        VARCHAR(20) NOT NULL,
  job_type        ENUM('INSPECTION','RENOVATION') NOT NULL,
  source          ENUM('DIRECT','PARTNER') NOT NULL DEFAULT 'DIRECT',
  partner_id      BIGINT UNSIGNED NULL,
  external_ref    VARCHAR(64) NULL,
  unit_id         BIGINT UNSIGNED NOT NULL,
  requester_id    BIGINT UNSIGNED NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  priority        ENUM('LOW','NORMAL','URGENT') NOT NULL DEFAULT 'NORMAL',
  preferred_date  DATE NULL,
  contact_name    VARCHAR(150) NULL,
  contact_phone   VARCHAR(20) NULL,
  status          ENUM('NEW','SURVEY_ASSIGNED','SURVEYED','QUOTED','CONTRACTED','IN_PROGRESS','COMPLETED','CANCELLED')
                  NOT NULL DEFAULT 'NEW',
  completed_at    TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id),
  UNIQUE KEY uq_job_code (job_code),
  UNIQUE KEY uq_job_partner_ref (partner_id, external_ref),   -- idempotency ของ Partner API
  KEY idx_job_requester (requester_id, status),
  KEY idx_job_status (status),
  CONSTRAINT fk_job_unit    FOREIGN KEY (unit_id)    REFERENCES units(unit_id),
  CONSTRAINT fk_job_partner FOREIGN KEY (partner_id) REFERENCES partners(partner_id),
  CONSTRAINT chk_job_source CHECK ((source = 'PARTNER') = (partner_id IS NOT NULL))
) ENGINE=InnoDB;

-- technician_name = snapshot จาก auth-service ตอนมอบหมาย
CREATE TABLE job_assignments (
  job_id           BIGINT UNSIGNED NOT NULL,
  technician_id    BIGINT UNSIGNED NOT NULL,
  technician_name  VARCHAR(150) NOT NULL,
  is_lead          TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, technician_id),
  KEY idx_assign_tech (technician_id),
  CONSTRAINT fk_assign_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ───────────────────────── ประเมินหน้างาน / ตรวจห้อง ─────────────────────────
-- INITIAL = ประเมินครั้งแรก (ทำสัญญาหลัก), ADDITIONAL = พบงานเพิ่มระหว่างทำ (ทำสัญญาเพิ่มเติม)
CREATE TABLE site_surveys (
  survey_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id          BIGINT UNSIGNED NOT NULL,
  survey_type     ENUM('INITIAL','ADDITIONAL') NOT NULL DEFAULT 'INITIAL',
  technician_id   BIGINT UNSIGNED NOT NULL,
  scheduled_date  DATE NULL,
  status          ENUM('SCHEDULED','SUBMITTED') NOT NULL DEFAULT 'SCHEDULED',
  summary         TEXT NULL,
  est_days        INT UNSIGNED NULL,
  need_repair     TINYINT(1) NULL,
  submitted_at    TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (survey_id),
  KEY idx_survey_job (job_id),
  CONSTRAINT fk_survey_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
  CONSTRAINT chk_survey_days CHECK (est_days IS NULL OR est_days > 0)
) ENGINE=InnoDB;

-- เช็กลิสต์ตรวจห้อง (ห้องน้ำ/ผนัง/พื้น/ไฟฟ้า ...) + ประเมินราคาคร่าว ๆ ต่อรายการ
CREATE TABLE survey_items (
  item_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  survey_id       BIGINT UNSIGNED NOT NULL,
  area            VARCHAR(100) NOT NULL,
  item            VARCHAR(150) NOT NULL,
  item_condition  ENUM('GOOD','FAIR','DAMAGED','MISSING') NOT NULL,
  action          ENUM('NONE','REPAIR','REPLACE') NOT NULL DEFAULT 'NONE',
  est_cost        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  note            VARCHAR(500) NULL,
  photo_url       VARCHAR(500) NULL,
  PRIMARY KEY (item_id),
  KEY idx_sitem_survey (survey_id),
  CONSTRAINT fk_sitem_survey FOREIGN KEY (survey_id) REFERENCES site_surveys(survey_id) ON DELETE CASCADE,
  CONSTRAINT chk_sitem_cost CHECK (est_cost >= 0)
) ENGINE=InnoDB;

-- ───────────────────────── สัญญา ─────────────────────────
-- DAILY = ค่าแรงรายวัน (rate × จำนวนวัน), MONTHLY = เหมารายเดือน (rate × จำนวนเดือน)
-- ค่าแรง/ยอดรวมเป็น generated column, material_amount อัปเดตด้วย trigger จาก contract_items
CREATE TABLE contracts (
  contract_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_no         VARCHAR(20) NOT NULL,
  job_id              BIGINT UNSIGNED NOT NULL,
  survey_id           BIGINT UNSIGNED NULL,
  contract_type       ENUM('MAIN','ADDENDUM') NOT NULL DEFAULT 'MAIN',
  parent_contract_id  BIGINT UNSIGNED NULL,
  billing_type        ENUM('DAILY','MONTHLY') NOT NULL,
  rate                DECIMAL(12,2) NOT NULL,
  period_qty          INT UNSIGNED NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  material_amount     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  labor_amount        DECIMAL(12,2) AS (rate * period_qty) STORED,
  total_amount        DECIMAL(12,2) AS (rate * period_qty + material_amount) STORED,
  terms               TEXT NULL,
  status              ENUM('DRAFT','SENT','SIGNED','REJECTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  created_by          BIGINT UNSIGNED NOT NULL,
  sent_at             TIMESTAMP NULL,
  signed_by           BIGINT UNSIGNED NULL,
  signed_name         VARCHAR(150) NULL,
  signed_at           TIMESTAMP NULL,
  reject_reason       VARCHAR(500) NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (contract_id),
  UNIQUE KEY uq_contract_no (contract_no),
  KEY idx_contract_job (job_id),
  CONSTRAINT fk_contract_job    FOREIGN KEY (job_id)             REFERENCES jobs(job_id),
  CONSTRAINT fk_contract_survey FOREIGN KEY (survey_id)          REFERENCES site_surveys(survey_id),
  CONSTRAINT fk_contract_parent FOREIGN KEY (parent_contract_id) REFERENCES contracts(contract_id),
  CONSTRAINT chk_contract_rate  CHECK (rate >= 0 AND period_qty > 0),
  CONSTRAINT chk_contract_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_contract_addendum CHECK ((contract_type = 'ADDENDUM') = (parent_contract_id IS NOT NULL))
) ENGINE=InnoDB;

-- material_id/unit_price = snapshot จาก inventory-service ตอนทำสัญญา
CREATE TABLE contract_items (
  item_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  contract_id  BIGINT UNSIGNED NOT NULL,
  material_id  BIGINT UNSIGNED NULL,
  description  VARCHAR(200) NOT NULL,
  qty          DECIMAL(10,2) NOT NULL,
  unit         VARCHAR(20) NOT NULL DEFAULT 'ชิ้น',
  unit_price   DECIMAL(12,2) NOT NULL,
  line_total   DECIMAL(12,2) AS (qty * unit_price) STORED,
  PRIMARY KEY (item_id),
  KEY idx_citem_contract (contract_id),
  CONSTRAINT fk_citem_contract FOREIGN KEY (contract_id) REFERENCES contracts(contract_id) ON DELETE CASCADE,
  CONSTRAINT chk_citem_qty CHECK (qty > 0 AND unit_price >= 0)
) ENGINE=InnoDB;

-- งวดชำระ: DAILY = มัดจำ 30% + ส่วนที่เหลือ, MONTHLY = เดือนละงวด (งวดแรกรวมค่าวัสดุ) สร้างตอนเซ็นสัญญา
CREATE TABLE invoices (
  invoice_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_no      VARCHAR(24) NOT NULL,
  contract_id     BIGINT UNSIGNED NOT NULL,
  installment_no  TINYINT UNSIGNED NOT NULL,
  description     VARCHAR(200) NOT NULL,
  due_date        DATE NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  status          ENUM('UNPAID','PENDING_VERIFY','PAID') NOT NULL DEFAULT 'UNPAID',
  slip_ref        VARCHAR(255) NULL,
  paid_at         TIMESTAMP NULL,
  verified_by     BIGINT UNSIGNED NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (invoice_id),
  UNIQUE KEY uq_invoice_no (invoice_no),
  UNIQUE KEY uq_invoice_installment (contract_id, installment_no),
  KEY idx_invoice_status (status),
  CONSTRAINT fk_invoice_contract FOREIGN KEY (contract_id) REFERENCES contracts(contract_id),
  CONSTRAINT chk_invoice_amount CHECK (amount > 0)
) ENGINE=InnoDB;

-- ───────────────────────── บันทึกงาน ─────────────────────────
CREATE TABLE work_logs (
  log_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id           BIGINT UNSIGNED NOT NULL,
  technician_id    BIGINT UNSIGNED NOT NULL,
  technician_name  VARCHAR(150) NOT NULL,
  work_date        DATE NOT NULL,
  hours            DECIMAL(4,1) NOT NULL,
  progress_pct     TINYINT UNSIGNED NOT NULL,
  note             TEXT NOT NULL,
  photo_url        VARCHAR(500) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_wlog_job (job_id, work_date),
  CONSTRAINT fk_wlog_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE,
  CONSTRAINT chk_wlog_hours CHECK (hours > 0 AND hours <= 24),
  CONSTRAINT chk_wlog_pct CHECK (progress_pct <= 100)
) ENGINE=InnoDB;

-- changed_by NULL = เปลี่ยนโดยระบบพาร์ทเนอร์ (ผ่าน API key)
CREATE TABLE job_status_logs (
  log_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id       BIGINT UNSIGNED NOT NULL,
  from_status  VARCHAR(20) NULL,
  to_status    VARCHAR(20) NOT NULL,
  changed_by   BIGINT UNSIGNED NULL,
  remark       VARCHAR(500) NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_slog_job (job_id),
  CONSTRAINT fk_slog_job FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Outbox: แจ้งระบบพาร์ทเนอร์ผ่าน webhook (job-service ส่ง + retry, ลงชื่อ HMAC-SHA256)
CREATE TABLE webhook_deliveries (
  delivery_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_id       BIGINT UNSIGNED NOT NULL,
  job_id           BIGINT UNSIGNED NULL,
  event            VARCHAR(50) NOT NULL,
  payload          JSON NOT NULL,
  status           ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_error       VARCHAR(500) NULL,
  next_attempt_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at          TIMESTAMP NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (delivery_id),
  KEY idx_wh_pending (status, next_attempt_at),
  KEY idx_wh_partner (partner_id, created_at),
  CONSTRAINT fk_wh_partner FOREIGN KEY (partner_id) REFERENCES partners(partner_id)
) ENGINE=InnoDB;

-- ───────────────────────── Triggers ─────────────────────────
-- job-service ตั้ง @actor_id / @status_remark ก่อนเปลี่ยนสถานะ (ดู services/job-service/src/db.js)
DELIMITER $$

CREATE TRIGGER trg_jobs_after_insert AFTER INSERT ON jobs FOR EACH ROW
BEGIN
  INSERT INTO job_status_logs (job_id, from_status, to_status, changed_by, remark)
  VALUES (NEW.job_id, NULL, NEW.status, @actor_id, @status_remark);
END$$

-- ทุกครั้งที่สถานะเปลี่ยน: เก็บประวัติ + ถ้าเป็นงานของพาร์ทเนอร์ ใส่ webhook ลง outbox
CREATE TRIGGER trg_jobs_after_update AFTER UPDATE ON jobs FOR EACH ROW
BEGIN
  IF NOT (OLD.status <=> NEW.status) THEN
    INSERT INTO job_status_logs (job_id, from_status, to_status, changed_by, remark)
    VALUES (NEW.job_id, OLD.status, NEW.status, @actor_id, @status_remark);

    IF NEW.partner_id IS NOT NULL THEN
      INSERT INTO webhook_deliveries (partner_id, job_id, event, payload)
      VALUES (NEW.partner_id, NEW.job_id, 'job.status_changed',
        JSON_OBJECT('event', 'job.status_changed', 'jobCode', NEW.job_code, 'externalRef', NEW.external_ref,
                    'from', OLD.status, 'to', NEW.status, 'remark', @status_remark,
                    'occurredAt', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s+07:00')));
    END IF;
  END IF;
END$$

-- แก้รายการได้เฉพาะสัญญาที่ยังเป็น DRAFT
CREATE TRIGGER trg_citem_before_insert BEFORE INSERT ON contract_items FOR EACH ROW
BEGIN
  IF (SELECT status FROM contracts WHERE contract_id = NEW.contract_id) <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONTRACT_LOCKED: แก้ไขได้เฉพาะสัญญาฉบับร่าง';
  END IF;
END$$

CREATE TRIGGER trg_citem_before_delete BEFORE DELETE ON contract_items FOR EACH ROW
BEGIN
  IF (SELECT status FROM contracts WHERE contract_id = OLD.contract_id) <> 'DRAFT' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CONTRACT_LOCKED: แก้ไขได้เฉพาะสัญญาฉบับร่าง';
  END IF;
END$$

CREATE TRIGGER trg_citem_after_insert AFTER INSERT ON contract_items FOR EACH ROW
BEGIN
  UPDATE contracts
     SET material_amount = (SELECT COALESCE(SUM(line_total), 0) FROM contract_items WHERE contract_id = NEW.contract_id)
   WHERE contract_id = NEW.contract_id;
END$$

CREATE TRIGGER trg_citem_after_delete AFTER DELETE ON contract_items FOR EACH ROW
BEGIN
  UPDATE contracts
     SET material_amount = (SELECT COALESCE(SUM(line_total), 0) FROM contract_items WHERE contract_id = OLD.contract_id)
   WHERE contract_id = OLD.contract_id;
END$$

DELIMITER ;

-- ───────────────────────── Views ─────────────────────────
CREATE VIEW v_job_summary AS
SELECT
  SUM(status = 'NEW')                                   AS new_jobs,
  SUM(status IN ('SURVEY_ASSIGNED','SURVEYED','QUOTED')) AS jobs_in_survey,
  SUM(status IN ('CONTRACTED','IN_PROGRESS'))           AS jobs_in_progress,
  SUM(status = 'COMPLETED')                             AS jobs_completed,
  SUM(source = 'PARTNER')                               AS partner_jobs,
  (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'PAID')           AS total_revenue,
  (SELECT COUNT(*) FROM invoices WHERE status = 'PENDING_VERIFY')                 AS invoices_to_verify
FROM jobs;

-- ───────────────────────── Seed ─────────────────────────
-- API key เดโม: dbk_live_demo_7f3a9c2e1b  (webhook ชี้ไปที่ระบบจองจำลองใน gateway)
INSERT INTO partners (partner_id, name, owner_user_id, api_key_prefix, api_key_hash, webhook_url, webhook_secret) VALUES
  (1, 'DormBook — ระบบจองห้องพัก', 3, 'dbk_live_dem',
   '3987047cba8caf17c107d864602a93d5b3d24a530faf5bce2a9a769c43051353',
   'http://gateway:3000/mock-partner/webhook', 'whsec_dormbook_demo');

INSERT INTO buildings (building_id, owner_user_id, partner_id, external_ref, name, address) VALUES
  (1, 2, NULL, NULL,         'หอพักสุขใจ แมนชั่น',      'ซ.พหลโยธิน 32 แขวงจันทรเกษม เขตจตุจักร กรุงเทพฯ'),
  (2, 3, 1,    'DB-BLD-001', 'บ้านริมคลอง เรสซิเดนซ์', 'ถ.พหลโยธิน กม.42 อ.คลองหลวง จ.ปทุมธานี');

INSERT INTO units (unit_id, building_id, unit_type, code, floor, size_sqm, external_ref) VALUES
  (1, 1, 'ROOM',           '305',     '3', 24.00, NULL),
  (2, 1, 'UNDER_BUILDING', 'G-01',    'G', 40.00, NULL),
  (3, 2, 'ROOM',           '201',     '2', 22.00, 'DB-RM-201'),
  (4, 2, 'ROOM',           '202',     '2', 22.00, 'DB-RM-202'),
  (5, 2, 'UNDER_BUILDING', 'G-LOBBY', 'G', 60.00, 'DB-AREA-G');

INSERT INTO jobs (job_id, job_code, job_type, source, partner_id, external_ref, unit_id, requester_id, title, description,
                  priority, preferred_date, contact_name, contact_phone, status, created_at) VALUES
  (1, 'JB2609-0001', 'RENOVATION', 'DIRECT', NULL, NULL, 2, 2,
   'รีโนเวทพื้นที่ใต้ตึกเป็นร้านกาแฟ', 'ทำพื้นกระเบื้องใหม่ ทาสี เดินไฟใหม่ ติดโคม LED', 'NORMAL', '2026-09-25',
   'สมหญิง', '0811111111', 'IN_PROGRESS', '2026-09-20 10:00:00'),
  (2, 'JB2610-0002', 'INSPECTION', 'PARTNER', 1, 'BK-88231-OUT', 3, 3,
   'ตรวจห้องหลังผู้เช่าย้ายออก ห้อง 201', 'ผู้เช่าแจ้งย้ายออก 20 ต.ค. ตรวจสภาพก่อนคืนเงินประกัน', 'URGENT', '2026-10-21',
   'คุณนิด (DormBook)', '0822222222', 'QUOTED', '2026-10-20 09:15:00'),
  (3, 'JB2610-0003', 'INSPECTION', 'PARTNER', 1, 'BK-88310-OUT', 4, 3,
   'ตรวจห้องหลังผู้เช่าย้ายออก ห้อง 202', 'ย้ายออก 31 ต.ค.', 'NORMAL', '2026-10-31',
   'คุณนิด (DormBook)', '0822222222', 'NEW', '2026-10-26 14:30:00'),
  (4, 'JB2610-0004', 'RENOVATION', 'DIRECT', NULL, NULL, 1, 2,
   'ทาสีใหม่ + เปลี่ยนพื้นห้อง 305', 'ห้องเก่า ผนังมีคราบ พื้นลามิเนตบวม', 'LOW', '2026-11-02',
   'สมหญิง', '0811111111', 'SURVEY_ASSIGNED', '2026-10-25 11:00:00');

INSERT INTO job_assignments (job_id, technician_id, technician_name, is_lead, assigned_at) VALUES
  (1, 4, 'ช่างเอก งานโครงสร้าง', 1, '2026-09-21 09:00:00'),
  (1, 5, 'ช่างบี ไฟฟ้า-ประปา',   0, '2026-09-21 09:00:00'),
  (2, 5, 'ช่างบี ไฟฟ้า-ประปา',   1, '2026-10-20 10:00:00'),
  (4, 4, 'ช่างเอก งานโครงสร้าง', 1, '2026-10-26 09:00:00');

INSERT INTO site_surveys (survey_id, job_id, survey_type, technician_id, scheduled_date, status, summary, est_days, need_repair, submitted_at) VALUES
  (1, 1, 'INITIAL', 4, '2026-09-23', 'SUBMITTED', 'พื้นที่โล่ง 40 ตร.ม. พื้นปูนเดิมแตกร้าว ระบบไฟเดิมไม่รองรับเครื่องชงกาแฟ', 45, 1, '2026-09-23 16:00:00'),
  (2, 2, 'INITIAL', 5, '2026-10-21', 'SUBMITTED', 'ห้องโดยรวมสภาพดี ก๊อกอ่างล้างหน้ารั่ว ยาแนวห้องน้ำขึ้นรา', 3, 1, '2026-10-21 15:30:00'),
  (3, 4, 'INITIAL', 4, '2026-10-28', 'SCHEDULED', NULL, NULL, NULL, NULL);

INSERT INTO survey_items (survey_id, area, item, item_condition, action, est_cost, note) VALUES
  (1, 'พื้น',     'พื้นปูนเดิม',            'DAMAGED', 'REPLACE', 12000, 'ร้าวหลายจุด ต้องปรับระดับก่อนปูกระเบื้อง'),
  (1, 'ผนัง',     'ผนังรอบด้าน',            'FAIR',    'REPAIR',  9000,  'ทาสีรองพื้น + สีจริง 2 รอบ'),
  (1, 'ไฟฟ้า',    'ตู้ไฟและสายเมน',         'DAMAGED', 'REPLACE', 15000, 'ต้องเดินสายใหม่ 2.5 sq.mm'),
  (2, 'ห้องน้ำ',  'ก๊อกอ่างล้างหน้า',       'DAMAGED', 'REPLACE', 500,   'รั่วซึมตลอด'),
  (2, 'ห้องน้ำ',  'ยาแนวผนัง/พื้น',         'FAIR',    'REPAIR',  300,   'ขึ้นราดำ'),
  (2, 'ห้องนอน',  'ผนังและพื้น',            'GOOD',    'NONE',    0,     NULL),
  (2, 'ไฟฟ้า',    'ปลั๊ก/สวิตช์',           'GOOD',    'NONE',    0,     NULL);

-- สัญญาเริ่มเป็น DRAFT (trigger อนุญาตให้ใส่รายการ) แล้วค่อยเปลี่ยนสถานะ
INSERT INTO contracts (contract_id, contract_no, job_id, survey_id, contract_type, billing_type, rate, period_qty,
                       start_date, end_date, terms, created_by, created_at) VALUES
  (1, 'CT2609-0001', 1, 1, 'MAIN', 'MONTHLY', 36000, 2, '2026-10-01', '2026-11-30',
   'เหมาค่าแรงรายเดือน ทีมช่าง 2 คน รับประกันงาน 6 เดือน', 1, '2026-09-24 10:00:00'),
  (2, 'CT2610-0002', 2, 2, 'MAIN', 'DAILY', 900, 3, '2026-10-28', '2026-10-30',
   'ค่าแรงรายวัน ช่าง 1 คน', 1, '2026-10-22 09:00:00');

INSERT INTO contract_items (contract_id, material_id, description, qty, unit, unit_price) VALUES
  (1, 1,  'ปูนซีเมนต์ 50 กก.',          20, 'ถุง', 180),
  (1, 2,  'กระเบื้องพื้น 60x60',        80, 'แผ่น', 95),
  (1, 3,  'สีน้ำอะคริลิกภายใน 9 ลิตร', 6,  'ถัง', 1600),
  (1, 7,  'โคม LED panel 18W',          10, 'ชุด', 350),
  (2, 10, 'ซิลิโคนยาแนว',               2,  'หลอด', 110),
  (2, 11, 'ก๊อกอ่างล้างหน้า',           1,  'ชุด', 500);

UPDATE contracts SET status = 'SIGNED', sent_at = '2026-09-24 11:00:00', signed_by = 2, signed_name = 'สมหญิง เจ้าของหอ',
                     signed_at = '2026-09-25 09:00:00' WHERE contract_id = 1;
UPDATE contracts SET status = 'SENT', sent_at = '2026-10-22 09:30:00' WHERE contract_id = 2;

-- งวด 1 = ค่าแรงเดือนแรก + ค่าวัสดุ (36000 + 24300)
INSERT INTO invoices (invoice_no, contract_id, installment_no, description, due_date, amount, status, slip_ref, paid_at, verified_by) VALUES
  ('IV2609-0001-1', 1, 1, 'งวดที่ 1: ค่าแรงเดือนที่ 1 + ค่าวัสดุ', '2026-10-01', 60300, 'PAID', 'KBANK-20260930-0912', '2026-09-30 10:00:00', 1),
  ('IV2609-0001-2', 1, 2, 'งวดที่ 2: ค่าแรงเดือนที่ 2',           '2026-11-01', 36000, 'UNPAID', NULL, NULL, NULL);

INSERT INTO work_logs (job_id, technician_id, technician_name, work_date, hours, progress_pct, note) VALUES
  (1, 4, 'ช่างเอก งานโครงสร้าง', '2026-10-01', 8, 10, 'สกัดพื้นเดิม ปรับระดับ'),
  (1, 5, 'ช่างบี ไฟฟ้า-ประปา',   '2026-10-03', 8, 20, 'เดินท่อร้อยสายไฟใหม่'),
  (1, 4, 'ช่างเอก งานโครงสร้าง', '2026-10-15', 8, 45, 'ปูกระเบื้องพื้นเสร็จ 60%');

-- ประวัติสถานะที่ trigger สร้างตอน seed ไม่ตรงกับเหตุการณ์จริง จึงใส่ประวัติเดโมแทน
DELETE FROM job_status_logs;
INSERT INTO job_status_logs (job_id, from_status, to_status, changed_by, remark, created_at) VALUES
  (1, NULL,              'NEW',             2,    NULL,                    '2026-09-20 10:00:00'),
  (1, 'NEW',             'SURVEY_ASSIGNED', 1,    'นัดสำรวจ 23 ก.ย.',     '2026-09-21 09:00:00'),
  (1, 'SURVEY_ASSIGNED', 'SURVEYED',        4,    NULL,                    '2026-09-23 16:00:00'),
  (1, 'SURVEYED',        'QUOTED',          1,    'ส่งสัญญา CT2609-0001', '2026-09-24 11:00:00'),
  (1, 'QUOTED',          'CONTRACTED',      2,    'เซ็นสัญญา CT2609-0001', '2026-09-25 09:00:00'),
  (1, 'CONTRACTED',      'IN_PROGRESS',     4,    NULL,                    '2026-10-01 08:00:00'),
  (2, NULL,              'NEW',             NULL, 'รับงานจาก DormBook',    '2026-10-20 09:15:00'),
  (2, 'NEW',             'SURVEY_ASSIGNED', 1,    NULL,                    '2026-10-20 10:00:00'),
  (2, 'SURVEY_ASSIGNED', 'SURVEYED',        5,    NULL,                    '2026-10-21 15:30:00'),
  (2, 'SURVEYED',        'QUOTED',          1,    'ส่งสัญญา CT2610-0002', '2026-10-22 09:30:00'),
  (3, NULL,              'NEW',             NULL, 'รับงานจาก DormBook',    '2026-10-26 14:30:00'),
  (4, NULL,              'NEW',             2,    NULL,                    '2026-10-25 11:00:00'),
  (4, 'NEW',             'SURVEY_ASSIGNED', 1,    'นัดสำรวจ 28 ต.ค.',     '2026-10-26 09:00:00');
