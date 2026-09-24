-- ============================================================
-- Migration 002: Local User Accounts
-- Adds multi-user support to the desktop billing app.
-- ============================================================

CREATE TABLE IF NOT EXISTS local_users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'user',
  permissions  TEXT NOT NULL DEFAULT '{}',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  created_by   TEXT,
  last_login   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_local_users_email ON local_users(email);

INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (2, strftime('%s','now') * 1000, 'Local user accounts');
