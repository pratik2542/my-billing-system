-- ============================================================
-- Migration 001: Initial Schema
-- All Firestore collections replicated as SQLite tables.
-- JSON blobs used for nested objects (items, auditTrail, etc.)
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------
-- Schema version tracking (for future migrations)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL,
  description TEXT
);

-- ----------------------------------------------------------------
-- Business Settings (single row)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_settings (
  id          TEXT PRIMARY KEY DEFAULT 'general',
  data        TEXT NOT NULL DEFAULT '{}'   -- full JSON blob of BusinessSettings
);

-- ----------------------------------------------------------------
-- Products
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  rate        REAL NOT NULL DEFAULT 0,
  price       REAL,
  unit        TEXT NOT NULL DEFAULT 'Qty',
  packing     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ----------------------------------------------------------------
-- Customers
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT '',
  phone       TEXT,
  mobile      TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

-- ----------------------------------------------------------------
-- Invoices
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                  TEXT PRIMARY KEY,       -- Bill No
  date                TEXT NOT NULL,
  customer_name       TEXT NOT NULL,
  customer_city       TEXT NOT NULL DEFAULT '',
  customer_mobile     TEXT,
  items               TEXT NOT NULL DEFAULT '[]',  -- JSON array of InvoiceItem
  total               REAL NOT NULL DEFAULT 0,
  subtotal            REAL,
  gst_amount          REAL,
  gst_rate            REAL,
  sgst_amount         REAL,
  cgst_amount         REAL,
  payments            TEXT DEFAULT '[]',          -- JSON array of PaymentEntry
  show_unit_in_items  INTEGER DEFAULT 1,
  custom_total_qty    TEXT,
  -- User attribution
  created_by          TEXT,
  created_by_name     TEXT,
  created_by_email    TEXT,
  created_at          INTEGER,
  updated_by          TEXT,
  updated_by_name     TEXT,
  updated_by_email    TEXT,
  updated_at          INTEGER,
  billed_by           TEXT,
  -- Soft deletion
  is_deleted          INTEGER DEFAULT 0,
  deleted_at          INTEGER,
  deleted_by          TEXT,
  deleted_by_name     TEXT,
  deleted_by_email    TEXT,
  delete_reason       TEXT,
  restored_at         INTEGER,
  restored_by         TEXT,
  restored_by_name    TEXT,
  -- Audit trail
  audit_trail         TEXT DEFAULT '[]'           -- JSON array of InvoiceAuditEntry
);

CREATE INDEX IF NOT EXISTS idx_invoices_date        ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer    ON invoices(customer_name);
CREATE INDEX IF NOT EXISTS idx_invoices_is_deleted  ON invoices(is_deleted);

-- ----------------------------------------------------------------
-- Activity Logs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  category    TEXT NOT NULL,
  details     TEXT,
  timestamp   INTEGER NOT NULL,
  user_id     TEXT,
  user_email  TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_logs(timestamp);

-- ----------------------------------------------------------------
-- Error Logs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS error_logs (
  id          TEXT PRIMARY KEY,
  message     TEXT NOT NULL,
  stack       TEXT,
  route       TEXT,
  timestamp   INTEGER NOT NULL
);

-- ----------------------------------------------------------------
-- App Config (key-value store for misc settings)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);

-- ----------------------------------------------------------------
-- Seed schema_version
-- ----------------------------------------------------------------
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, strftime('%s','now') * 1000, 'Initial schema');
