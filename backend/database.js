const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'satusaku.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===================== CREATE TABLES =====================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'affiliate' CHECK(role IN ('admin','affiliate')),
    tier TEXT DEFAULT 'basic' CHECK(tier IN ('basic','pro')),
    referral_code TEXT UNIQUE NOT NULL,
    referred_by INTEGER,
    balance REAL DEFAULT 0,
    total_earned REAL DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','banned')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referred_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_sku_code TEXT UNIQUE NOT NULL,
    product_name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    price_modal REAL DEFAULT 0,
    price_sell REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    unlimited_stock INTEGER DEFAULT 0,
    buyer_product_status INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    customer_no TEXT NOT NULL,
    buyer_sku_code TEXT NOT NULL,
    ref_id TEXT NOT NULL UNIQUE,
    price_modal REAL DEFAULT 0,
    price_sell REAL DEFAULT 0,
    rc_code TEXT,
    sn TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','success','failed')),
    testing INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    affiliate_id INTEGER NOT NULL,
    customer_id INTEGER,
    amount REAL DEFAULT 0,
    rate REAL DEFAULT 0.01,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','rejected')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (affiliate_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    fee REAL DEFAULT 0,
    final_amount REAL NOT NULL,
    payment_method TEXT,
    proof_path TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    phone TEXT NOT NULL,
    provider TEXT DEFAULT 'dana' CHECK(provider IN ('dana','ovo','gopay','pulsa')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','completed')),
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    amount REAL DEFAULT 0,
    balance_before REAL DEFAULT 0,
    balance_after REAL DEFAULT 0,
    description TEXT,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS referral_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affiliate_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (affiliate_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);
  CREATE INDEX IF NOT EXISTS idx_users_referred ON users(referred_by);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_ref ON orders(ref_id);
  CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON commissions(affiliate_id);
  CREATE INDEX IF NOT EXISTS idx_commissions_order ON commissions(order_id);
  CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
  CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
`);

// ===================== DEFAULT SETTINGS =====================
const defaultSettings = {
  'commission_rate_basic': '0.01',
  'commission_rate_pro': '0.02',
  'registration_fee_basic': '10000',
  'registration_fee_pro': '50000',
  'pro_bonus_balance': '25000',
  'min_deposit': '10000',
  'min_withdrawal': '50000',
  'withdrawal_multiplier': '5000',
  'holding_days': '7',
  'default_markup': '7',
  'maintenance_mode': '0'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

// ===================== CREATE ADMIN USER =====================
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  const crypto = require('crypto');
  const adminRefCode = 'ADMIN' + crypto.randomBytes(3).toString('hex').toUpperCase();
  db.prepare(`INSERT INTO users (username, email, password, role, tier, referral_code, balance) 
    VALUES (?, ?, ?, 'admin', 'pro', ?, 0)`).run('admin', 'admin@satusaku.com', hash, adminRefCode);
  console.log('✅ Admin user created: admin / admin123');
}

// ===================== HELPER FUNCTIONS =====================
function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserByReferralCode(code) {
  return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code);
}

function createUser(username, email, password, phone, tier, referredBy) {
  const crypto = require('crypto');
  const hash = bcrypt.hashSync(password, 10);
  let refCode;
  let attempts = 0;
  do {
    refCode = username.toUpperCase().substring(0, 4) + crypto.randomBytes(3).toString('hex').toUpperCase();
    attempts++;
  } while (getUserByReferralCode(refCode) && attempts < 10);

  const result = db.prepare(`INSERT INTO users (username, email, password, phone, tier, referral_code, referred_by) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(username, email, hash, phone, tier, refCode, referredBy);
  return { id: result.lastInsertRowid, referral_code: refCode };
}

function updateBalance(userId, amount, type, description, referenceId) {
  const user = getUser(userId);
  if (!user) return false;
  const newBalance = user.balance + amount;
  if (newBalance < 0) return false;
  db.prepare('UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, userId);
  db.prepare(`INSERT INTO transactions_log (user_id, type, amount, balance_before, balance_after, description, reference_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(userId, type, amount, user.balance, newBalance, description, referenceId);
  return true;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function updateSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(key, value);
}

function getReferralStats(affiliateId) {
  const totalReferrals = db.prepare('SELECT COUNT(*) as count FROM users WHERE referred_by = ?').get(affiliateId).count;
  const activeReferrals = db.prepare("SELECT COUNT(*) as count FROM users WHERE referred_by = ? AND status = 'active'").get(affiliateId).count;
  const totalClicks = db.prepare('SELECT COUNT(*) as count FROM referral_clicks WHERE affiliate_id = ?').get(affiliateId).count;
  const todayClicks = db.prepare("SELECT COUNT(*) as count FROM referral_clicks WHERE affiliate_id = ? AND date(created_at) = date('now')").get(affiliateId).count;
  return { totalReferrals, activeReferrals, totalClicks, todayClicks };
}

function getDashboardStats() {
  const totalUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'affiliate'").get().count;
  const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'affiliate' AND status = 'active'").get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const todayOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE date(created_at) = date('now')").get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(price_sell), 0) as total FROM orders WHERE status = ?').get('success').total;
  const todayRevenue = db.prepare("SELECT COALESCE(SUM(price_sell), 0) as total FROM orders WHERE status = 'success' AND date(created_at) = date('now')").get().total;
  const totalCommission = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM commissions').get().total;
  const pendingWithdrawals = db.prepare("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'").get().count;
  const pendingDeposits = db.prepare("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'").get().count;
  const masterBalance = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM users WHERE role = 'affiliate'").get().total;
  return { totalUsers, activeUsers, totalOrders, todayOrders, totalRevenue, todayRevenue, totalCommission, pendingWithdrawals, pendingDeposits, masterBalance };
}

module.exports = { db, getUser, getUserByUsername, getUserByEmail, getUserByReferralCode, createUser, updateBalance, getSetting, updateSetting, getReferralStats, getDashboardStats };