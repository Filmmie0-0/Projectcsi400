#!/bin/bash
# Database-per-service: 1 MySQL instance, แต่ละ service มี database + user ของตัวเอง
# user ของ service หนึ่งเข้าถึง database ของ service อื่นไม่ได้ (ต้องคุยกันผ่าน HTTP เท่านั้น)
set -e

mysql --protocol=socket -uroot -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS auth_db      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS job_db       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'auth_svc'@'%'      IDENTIFIED BY '${AUTH_DB_PASSWORD:-auth_pass}';
CREATE USER IF NOT EXISTS 'job_svc'@'%'       IDENTIFIED BY '${JOB_DB_PASSWORD:-job_pass}';
CREATE USER IF NOT EXISTS 'inventory_svc'@'%' IDENTIFIED BY '${INVENTORY_DB_PASSWORD:-inventory_pass}';

GRANT ALL PRIVILEGES ON auth_db.*      TO 'auth_svc'@'%';
GRANT ALL PRIVILEGES ON job_db.*       TO 'job_svc'@'%';
GRANT ALL PRIVILEGES ON inventory_db.* TO 'inventory_svc'@'%';
FLUSH PRIVILEGES;
SQL
