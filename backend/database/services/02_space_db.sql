-- space-service  |  MySQL 8.0.16+
-- หอพัก + พื้นที่เช่าใต้หอพัก  (owner_id = users.user_id ใน auth_db, ไม่มี FK ข้าม database)
SET NAMES utf8mb4;
USE space_db;

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
  CONSTRAINT chk_dorm_rooms CHECK (total_rooms > 0)
) ENGINE=InnoDB;

CREATE TABLE spaces (
  space_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id            BIGINT UNSIGNED NOT NULL,
  dormitory_id        BIGINT UNSIGNED NULL,
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
  KEY idx_spaces_dorm (dormitory_id),
  KEY idx_spaces_search (province, availability_status, price_per_month),
  CONSTRAINT fk_spaces_dorm   FOREIGN KEY (dormitory_id) REFERENCES dormitories(dormitory_id),
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

CREATE VIEW v_space_summary AS
SELECT
  (SELECT COUNT(*) FROM spaces WHERE is_active=1)      AS total_spaces,
  (SELECT COUNT(*) FROM dormitories WHERE is_active=1) AS total_dormitories;
