-- Run once on databases initialized before token_version was added to 01_auth_db.sql.
ALTER TABLE auth_db.users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
