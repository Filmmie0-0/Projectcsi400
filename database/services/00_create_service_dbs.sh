#!/bin/bash
# Database-per-service: 1 MySQL instance, แต่ละ service มี database + user ของตัวเอง
# user ของ service หนึ่งเข้าถึง database ของ service อื่นไม่ได้ (ต้องคุยกันผ่าน HTTP เท่านั้น)
set -e

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS auth_db    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS space_db   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS booking_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS store_db   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'auth_svc'@'%'    IDENTIFIED BY '${AUTH_DB_PASSWORD:-auth_pass}';
CREATE USER IF NOT EXISTS 'space_svc'@'%'   IDENTIFIED BY '${SPACE_DB_PASSWORD:-space_pass}';
CREATE USER IF NOT EXISTS 'booking_svc'@'%' IDENTIFIED BY '${BOOKING_DB_PASSWORD:-booking_pass}';
CREATE USER IF NOT EXISTS 'store_svc'@'%'   IDENTIFIED BY '${STORE_DB_PASSWORD:-store_pass}';

GRANT ALL PRIVILEGES ON auth_db.*    TO 'auth_svc'@'%';
GRANT ALL PRIVILEGES ON space_db.*   TO 'space_svc'@'%';
GRANT ALL PRIVILEGES ON booking_db.* TO 'booking_svc'@'%';
GRANT ALL PRIVILEGES ON store_db.*   TO 'store_svc'@'%';
FLUSH PRIVILEGES;
SQL
