import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// ─── Types mirrored from types.ts ────────────────────────────────────────────
export interface Product {
  id: string; name: string; rate: number; price?: number; unit: string; packing?: string;
}
export interface Customer {
  id: string; name: string; city: string; phone?: string; mobile?: string;
}
export interface Invoice {
  id: string; date: string; customerName: string; customerCity: string;
  customerMobile?: string; items: any[]; total: number; subtotal?: number;
  gstAmount?: number; gstRate?: number; sgstAmount?: number; cgstAmount?: number;
  payments?: any[]; showUnitInItemsTable?: boolean; customTotalQtyText?: string;
  createdBy?: string; createdByName?: string; createdByEmail?: string; createdAt?: number;
  updatedBy?: string; updatedByName?: string; updatedByEmail?: string; updatedAt?: number;
  billedBy?: string; isDeleted?: boolean; deletedAt?: number; deletedBy?: string;
  deletedByName?: string; deletedByEmail?: string; deleteReason?: string;
  restoredAt?: number; restoredBy?: string; restoredByName?: string;
  auditTrail?: any[];
}
export interface BusinessSettings { [key: string]: any; }
export interface ActivityLog {
  id: string; action: string; category: string; details?: string;
  timestamp: number; userId?: string; userEmail?: string;
}
export interface ErrorLog {
  id: string; message: string; stack?: string; route?: string; timestamp: number;
}

// ─── Database Singleton ───────────────────────────────────────────────────────
let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized. Call initDatabase() first.');
  return _db;
}

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'billing.db');
  const db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = 10000');

  runMigrations(db);
  _db = db;
  console.log('[DB] Initialized at:', dbPath);
  return db;
}

function runMigrations(db: Database.Database): void {
  // Create version table first if missing
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      description TEXT
    );
  `);

  const currentVersion = (() => {
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any;
    return row?.v ?? 0;
  })();

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const match = file.match(/^(\d+)_/);
    if (!match) continue;
    const version = parseInt(match[1], 10);
    if (version <= currentVersion) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      db.exec(sql);
      console.log(`[DB] Applied migration ${file}`);
    } catch (e: any) {
      // Skip "already exists" errors — idempotent migrations
      if (!e.message?.includes('already exists')) throw e;
    }
  }
}

export function closeDatabase(): void {
  if (_db) { _db.close(); _db = null; }
}

// ─── Helper: generate UUID-like ID ───────────────────────────────────────────
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── PRODUCTS CRUD ────────────────────────────────────────────────────────────
export const productsDb = {
  getAll(): Product[] {
    return getDb().prepare('SELECT * FROM products ORDER BY name ASC').all() as Product[];
  },
  getById(id: string): Product | undefined {
    return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
  },
  upsert(p: Product): void {
    getDb().prepare(`
      INSERT INTO products (id, name, rate, price, unit, packing, updated_at)
      VALUES (@id, @name, @rate, @price, @unit, @packing, @ts)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, rate=excluded.rate, price=excluded.price,
        unit=excluded.unit, packing=excluded.packing, updated_at=excluded.updated_at
    `).run({ id: p.id, name: p.name, rate: p.rate, price: p.price ?? null,
              unit: p.unit, packing: p.packing ?? null, ts: Date.now() });
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
  },
  bulkInsert(products: Product[]): void {
    const stmt = getDb().prepare(`
      INSERT OR REPLACE INTO products (id, name, rate, price, unit, packing, updated_at)
      VALUES (@id, @name, @rate, @price, @unit, @packing, @ts)
    `);
    const tx = getDb().transaction((prods: Product[]) => {
      for (const p of prods) stmt.run({ id: p.id, name: p.name, rate: p.rate,
        price: p.price ?? null, unit: p.unit, packing: p.packing ?? null, ts: Date.now() });
    });
    tx(products);
  }
};

// ─── CUSTOMERS CRUD ───────────────────────────────────────────────────────────
export const customersDb = {
  getAll(): Customer[] {
    return getDb().prepare('SELECT * FROM customers ORDER BY name ASC').all() as Customer[];
  },
  getById(id: string): Customer | undefined {
    return getDb().prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer | undefined;
  },
  upsert(c: Customer): void {
    getDb().prepare(`
      INSERT INTO customers (id, name, city, phone, mobile, updated_at)
      VALUES (@id, @name, @city, @phone, @mobile, @ts)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, city=excluded.city, phone=excluded.phone,
        mobile=excluded.mobile, updated_at=excluded.updated_at
    `).run({ id: c.id, name: c.name, city: c.city, phone: c.phone ?? null,
              mobile: c.mobile ?? null, ts: Date.now() });
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM customers WHERE id = ?').run(id);
  },
  bulkInsert(customers: Customer[]): void {
    const stmt = getDb().prepare(`
      INSERT OR REPLACE INTO customers (id, name, city, phone, mobile, updated_at)
      VALUES (@id, @name, @city, @phone, @mobile, @ts)
    `);
    const tx = getDb().transaction((custs: Customer[]) => {
      for (const c of custs) stmt.run({ id: c.id, name: c.name, city: c.city,
        phone: c.phone ?? null, mobile: c.mobile ?? null, ts: Date.now() });
    });
    tx(customers);
  }
};

// ─── INVOICES CRUD ────────────────────────────────────────────────────────────
function rowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    date: row.date,
    customerName: row.customer_name,
    customerCity: row.customer_city,
    customerMobile: row.customer_mobile ?? undefined,
    items: JSON.parse(row.items || '[]'),
    total: row.total,
    subtotal: row.subtotal ?? undefined,
    gstAmount: row.gst_amount ?? undefined,
    gstRate: row.gst_rate ?? undefined,
    sgstAmount: row.sgst_amount ?? undefined,
    cgstAmount: row.cgst_amount ?? undefined,
    payments: JSON.parse(row.payments || '[]'),
    showUnitInItemsTable: row.show_unit_in_items === 1,
    customTotalQtyText: row.custom_total_qty ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdByName: row.created_by_name ?? undefined,
    createdByEmail: row.created_by_email ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    updatedByName: row.updated_by_name ?? undefined,
    updatedByEmail: row.updated_by_email ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    billedBy: row.billed_by ?? undefined,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
    deletedByName: row.deleted_by_name ?? undefined,
    deletedByEmail: row.deleted_by_email ?? undefined,
    deleteReason: row.delete_reason ?? undefined,
    restoredAt: row.restored_at ?? undefined,
    restoredBy: row.restored_by ?? undefined,
    restoredByName: row.restored_by_name ?? undefined,
    auditTrail: JSON.parse(row.audit_trail || '[]'),
  };
}

export const invoicesDb = {
  getAll(): Invoice[] {
    return (getDb().prepare('SELECT * FROM invoices ORDER BY created_at DESC').all() as any[])
      .map(rowToInvoice);
  },
  getById(id: string): Invoice | undefined {
    const row = getDb().prepare('SELECT * FROM invoices WHERE id = ?').get(id) as any;
    return row ? rowToInvoice(row) : undefined;
  },
  upsert(inv: Invoice): void {
    getDb().prepare(`
      INSERT INTO invoices (
        id, date, customer_name, customer_city, customer_mobile,
        items, total, subtotal, gst_amount, gst_rate, sgst_amount, cgst_amount,
        payments, show_unit_in_items, custom_total_qty,
        created_by, created_by_name, created_by_email, created_at,
        updated_by, updated_by_name, updated_by_email, updated_at, billed_by,
        is_deleted, deleted_at, deleted_by, deleted_by_name, deleted_by_email,
        delete_reason, restored_at, restored_by, restored_by_name, audit_trail
      ) VALUES (
        @id, @date, @customer_name, @customer_city, @customer_mobile,
        @items, @total, @subtotal, @gst_amount, @gst_rate, @sgst_amount, @cgst_amount,
        @payments, @show_unit_in_items, @custom_total_qty,
        @created_by, @created_by_name, @created_by_email, @created_at,
        @updated_by, @updated_by_name, @updated_by_email, @updated_at, @billed_by,
        @is_deleted, @deleted_at, @deleted_by, @deleted_by_name, @deleted_by_email,
        @delete_reason, @restored_at, @restored_by, @restored_by_name, @audit_trail
      )
      ON CONFLICT(id) DO UPDATE SET
        date=excluded.date, customer_name=excluded.customer_name,
        customer_city=excluded.customer_city, customer_mobile=excluded.customer_mobile,
        items=excluded.items, total=excluded.total, subtotal=excluded.subtotal,
        gst_amount=excluded.gst_amount, gst_rate=excluded.gst_rate,
        sgst_amount=excluded.sgst_amount, cgst_amount=excluded.cgst_amount,
        payments=excluded.payments, show_unit_in_items=excluded.show_unit_in_items,
        custom_total_qty=excluded.custom_total_qty,
        updated_by=excluded.updated_by, updated_by_name=excluded.updated_by_name,
        updated_by_email=excluded.updated_by_email, updated_at=excluded.updated_at,
        billed_by=excluded.billed_by, is_deleted=excluded.is_deleted,
        deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by,
        deleted_by_name=excluded.deleted_by_name, deleted_by_email=excluded.deleted_by_email,
        delete_reason=excluded.delete_reason, restored_at=excluded.restored_at,
        restored_by=excluded.restored_by, restored_by_name=excluded.restored_by_name,
        audit_trail=excluded.audit_trail
    `).run({
      id: inv.id, date: inv.date, customer_name: inv.customerName,
      customer_city: inv.customerCity, customer_mobile: inv.customerMobile ?? null,
      items: JSON.stringify(inv.items || []), total: inv.total,
      subtotal: inv.subtotal ?? null, gst_amount: inv.gstAmount ?? null,
      gst_rate: inv.gstRate ?? null, sgst_amount: inv.sgstAmount ?? null,
      cgst_amount: inv.cgstAmount ?? null,
      payments: JSON.stringify(inv.payments || []),
      show_unit_in_items: inv.showUnitInItemsTable ? 1 : 0,
      custom_total_qty: inv.customTotalQtyText ?? null,
      created_by: inv.createdBy ?? null, created_by_name: inv.createdByName ?? null,
      created_by_email: inv.createdByEmail ?? null, created_at: inv.createdAt ?? null,
      updated_by: inv.updatedBy ?? null, updated_by_name: inv.updatedByName ?? null,
      updated_by_email: inv.updatedByEmail ?? null, updated_at: inv.updatedAt ?? null,
      billed_by: inv.billedBy ?? null, is_deleted: inv.isDeleted ? 1 : 0,
      deleted_at: inv.deletedAt ?? null, deleted_by: inv.deletedBy ?? null,
      deleted_by_name: inv.deletedByName ?? null, deleted_by_email: inv.deletedByEmail ?? null,
      delete_reason: inv.deleteReason ?? null, restored_at: inv.restoredAt ?? null,
      restored_by: inv.restoredBy ?? null, restored_by_name: inv.restoredByName ?? null,
      audit_trail: JSON.stringify(inv.auditTrail || []),
    });
  },
  delete(id: string): void {
    getDb().prepare('DELETE FROM invoices WHERE id = ?').run(id);
  },
  bulkInsert(invoices: Invoice[]): void {
    const tx = getDb().transaction((invs: Invoice[]) => {
      for (const inv of invs) invoicesDb.upsert(inv);
    });
    tx(invoices);
  }
};

// ─── BUSINESS SETTINGS CRUD ───────────────────────────────────────────────────
export const settingsDb = {
  get(): BusinessSettings | null {
    const row = getDb().prepare('SELECT data FROM business_settings WHERE id = ?').get('general') as any;
    return row ? JSON.parse(row.data) : null;
  },
  set(settings: BusinessSettings): void {
    getDb().prepare(`
      INSERT INTO business_settings (id, data) VALUES ('general', @data)
      ON CONFLICT(id) DO UPDATE SET data=excluded.data
    `).run({ data: JSON.stringify(settings) });
  }
};

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────
export const activityDb = {
  log(entry: Omit<ActivityLog, 'id'>): void {
    const id = newId();
    getDb().prepare(`
      INSERT INTO activity_logs (id, action, category, details, timestamp, user_id, user_email)
      VALUES (@id, @action, @category, @details, @timestamp, @user_id, @user_email)
    `).run({ id, ...entry, details: entry.details ?? null,
              user_id: entry.userId ?? null, user_email: entry.userEmail ?? null });
  },
  getRecent(limit = 200): ActivityLog[] {
    return (getDb().prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[])
      .map(r => ({ id: r.id, action: r.action, category: r.category, details: r.details,
                   timestamp: r.timestamp, userId: r.user_id, userEmail: r.user_email }));
  },
  getFiltered(filters?: { userId?: string; category?: string; limit?: number }): ActivityLog[] {
    const db = getDb();
    const clauses: string[] = [];
    const params: any[] = [];
    if (filters?.userId) {
      clauses.push('user_id = ?');
      params.push(filters.userId);
    }
    if (filters?.category) {
      clauses.push('category = ?');
      params.push(filters.category);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters?.limit || 200;
    params.push(limit);
    return (db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY timestamp DESC LIMIT ?`).all(...params) as any[])
      .map(r => ({ id: r.id, action: r.action, category: r.category, details: r.details,
                   timestamp: r.timestamp, userId: r.user_id, userEmail: r.user_email }));
  }
};

// ─── ERROR LOGS ───────────────────────────────────────────────────────────────
export const errorDb = {
  log(entry: Omit<ErrorLog, 'id'>): void {
    const id = newId();
    getDb().prepare(`
      INSERT INTO error_logs (id, message, stack, route, timestamp)
      VALUES (@id, @message, @stack, @route, @timestamp)
    `).run({ id, ...entry, stack: entry.stack ?? null, route: entry.route ?? null });
  }
};

// ─── APP CONFIG ───────────────────────────────────────────────────────────────
export const configDb = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM app_config WHERE key = ?').get(key) as any;
    return row?.value ?? null;
  },
  set(key: string, value: string): void {
    getDb().prepare(`
      INSERT INTO app_config (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, value);
  },
  delete(key: string): void {
    getDb().prepare('DELETE FROM app_config WHERE key = ?').run(key);
  }
};

// ─── FULL DB EXPORT (for backup) ─────────────────────────────────────────────
export function exportFullDatabase(): object {
  // Export all users (with hashed passwords — safe to store locally)
  const users = getDb().prepare('SELECT * FROM local_users ORDER BY created_at ASC').all();
  // Export activity logs (last 5000 entries to keep file size manageable)
  const activityLogs = getDb().prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 5000').all();

  return {
    version: 2, // v2 includes users and activity logs
    exportedAt: Date.now(),
    settings: settingsDb.get(),
    products: productsDb.getAll(),
    customers: customersDb.getAll(),
    invoices: invoicesDb.getAll(),
    users,        // local_users table (with hashed passwords)
    activityLogs, // activity_logs table
  };
}

// ─── FULL DB IMPORT (from backup or cloud export) ─────────────────────────────
export function importFullDatabase(data: any): { imported: boolean; error?: string } {
  try {
    const tx = getDb().transaction(() => {
      if (data.settings) settingsDb.set(data.settings);
      if (Array.isArray(data.products)) productsDb.bulkInsert(data.products);
      if (Array.isArray(data.customers)) customersDb.bulkInsert(data.customers);
      if (Array.isArray(data.invoices)) invoicesDb.bulkInsert(data.invoices);

      // Restore users (v2+ backups)
      if (Array.isArray(data.users) && data.users.length > 0) {
        const deleteConflictingEmail = getDb().prepare(
          'DELETE FROM local_users WHERE email = ? COLLATE NOCASE AND id != ?'
        );
        const upsertUser = getDb().prepare(`
          INSERT INTO local_users (id, name, email, password_hash, role, permissions, is_active, created_at, created_by, last_login)
          VALUES (@id, @name, @email, @password_hash, @role, @permissions, @is_active, @created_at, @created_by, @last_login)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, email=excluded.email,
            password_hash=excluded.password_hash, role=excluded.role,
            permissions=excluded.permissions, is_active=excluded.is_active,
            created_by=excluded.created_by, last_login=excluded.last_login
        `);
        for (const u of data.users) {
          if (!u.email || !u.id) continue;
          const email = u.email.toLowerCase().trim();

          // Delete any temporary pre-existing user row that has the same email but a different id
          deleteConflictingEmail.run(email, u.id);

          upsertUser.run({
            id: u.id,
            name: u.name || 'User',
            email,
            password_hash: u.password_hash,
            role: u.role || 'user',
            permissions: typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || {}),
            is_active: u.is_active ?? 1,
            created_at: u.created_at || Date.now(),
            created_by: u.created_by || null,
            last_login: u.last_login || null,
          });
        }
      }

      // Restore activity logs (v2+ backups)
      if (Array.isArray(data.activityLogs) && data.activityLogs.length > 0) {
        const upsertLog = getDb().prepare(`
          INSERT OR IGNORE INTO activity_logs (id, action, category, details, timestamp, user_id, user_email)
          VALUES (@id, @action, @category, @details, @timestamp, @user_id, @user_email)
        `);
        for (const log of data.activityLogs) {
          upsertLog.run({
            id: log.id, action: log.action, category: log.category,
            details: log.details || null, timestamp: log.timestamp,
            user_id: log.user_id || null, user_email: log.user_email || null,
          });
        }
      }
    });
    tx();
    return { imported: true };
  } catch (e: any) {
    return { imported: false, error: e.message };
  }
}

// ─── LOCAL USER MANAGEMENT ────────────────────────────────────────────────────
import crypto from 'crypto';

export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  permissions: {
    canViewSettings?: boolean;
    canDeleteBills?: boolean;
    canViewAnalytics?: boolean;
    canManageProducts?: boolean;
    canManageCustomers?: boolean;
    canManagePayments?: boolean;
  };
  is_active: boolean;
  created_at: number;
  created_by?: string;
  last_login?: number;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':');
    const attempt = crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    return attempt === hash;
  } catch { return false; }
}

export const usersDb = {
  create(user: Omit<LocalUser, 'id' | 'created_at'> & { password: string; id?: string }): LocalUser {
    const db = getDb();
    const id = user.id || crypto.randomUUID();
    const now = Date.now();
    const passwordHash = hashPassword(user.password);
    const permsJson = JSON.stringify(user.permissions || {});
    db.prepare(`
      INSERT INTO local_users (id, name, email, password_hash, role, permissions, is_active, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, user.name, user.email.toLowerCase().trim(), passwordHash, user.role, permsJson, user.is_active ? 1 : 0, now, user.created_by || null);
    return usersDb.getById(id)!;
  },

  getById(id: string): LocalUser | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM local_users WHERE id = ?').get(id) as any;
    return row ? usersDb._rowToUser(row) : null;
  },

  getByEmail(email: string): LocalUser | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM local_users WHERE email = ? COLLATE NOCASE').get(email.toLowerCase().trim()) as any;
    return row ? usersDb._rowToUser(row) : null;
  },

  listAll(): LocalUser[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM local_users ORDER BY created_at ASC').all() as any[];
    return rows.map(usersDb._rowToUser);
  },

  count(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as c FROM local_users').get() as any;
    return row?.c ?? 0;
  },

  update(id: string, updates: Partial<LocalUser> & { password?: string }): LocalUser | null {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM local_users WHERE id = ?').get(id) as any;
    if (!existing) return null;
    const name = updates.name ?? existing.name;
    const role = updates.role ?? existing.role;
    const permsJson = updates.permissions ? JSON.stringify(updates.permissions) : existing.permissions;
    const isActive = updates.is_active !== undefined ? (updates.is_active ? 1 : 0) : existing.is_active;
    const passwordHash = updates.password ? hashPassword(updates.password) : existing.password_hash;
    db.prepare(`
      UPDATE local_users SET name=?, role=?, permissions=?, is_active=?, password_hash=? WHERE id=?
    `).run(name, role, permsJson, isActive, passwordHash, id);
    return usersDb.getById(id);
  },

  delete(id: string): void {
    getDb().prepare('DELETE FROM local_users WHERE id = ?').run(id);
  },

  updateLastLogin(id: string): void {
    getDb().prepare('UPDATE local_users SET last_login = ? WHERE id = ?').run(Date.now(), id);
  },

  verifyLogin(email: string, password: string): LocalUser | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM local_users WHERE email = ? COLLATE NOCASE AND is_active = 1').get(email.toLowerCase().trim()) as any;
    if (!row) return null;
    if (!verifyPasswordHash(password, row.password_hash)) return null;
    usersDb.updateLastLogin(row.id);
    return usersDb._rowToUser(row);
  },

  _rowToUser(row: any): LocalUser {
    let permissions = {};
    try { permissions = JSON.parse(row.permissions || '{}'); } catch { }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      permissions,
      is_active: row.is_active === 1,
      created_at: row.created_at,
      created_by: row.created_by,
      last_login: row.last_login,
    };
  },
};

