const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { db, getUser, getUserByReferralCode, updateBalance, getSetting } = require('../database');

// ===================== BRAND MAPPING (copy from main server) =====================
const SKU_PREFIX_MAP = [
  { prefixes: ['GARENA', 'GAR'], name: 'Garena' },
  { prefixes: ['ML', 'ML_', 'ML-', 'MOBILE LEGENDS', 'MOBILE LEGEND', 'MOBILELEGENDS', 'MOBILELEGEND', 'MLBB', 'MLBB_', 'DIAMOND ML', 'ML DIAMOND', 'ML DM'], name: 'Mobile Legends' },
  { prefixes: ['PB', 'POINT BLANK', 'POINTBLANK'], name: 'Point Blank' },
  { prefixes: ['FF', 'FREE FIRE', 'FREEFIRE'], name: 'Free Fire' },
  { prefixes: ['PUBG', 'PUBGMOBILE'], name: 'PUBG Mobile' },
  { prefixes: ['VALORANT', 'VAL'], name: 'Valorant' },
  { prefixes: ['GENSHIN', 'GENSHINIMPACT'], name: 'Genshin Impact' },
  { prefixes: ['HSR', 'HONKAI STAR', 'STAR RAIL'], name: 'Honkai Star Rail' },
  { prefixes: ['FC MOBILE', 'FCMOBILE'], name: 'FC Mobile' },
  { prefixes: ['HOK', 'HONOR OF KINGS'], name: 'Honor of Kings' }
];

function guessBrand(name, sku) {
  if (!name) name = '';
  if (!sku) sku = '';
  for (const entry of SKU_PREFIX_MAP) {
    for (const p of entry.prefixes) {
      if (sku.toUpperCase().startsWith(p.toUpperCase())) return entry.name;
    }
  }
  const lowerName = name.toLowerCase();
  for (const entry of SKU_PREFIX_MAP) {
    for (const p of entry.prefixes) {
      if (lowerName.includes(p.toLowerCase())) return entry.name;
    }
  }
  return 'Lainnya';
}

// Sync products from Digiflazz API to SQLite
async function syncProductsFromDigiflazz() {
  try {
    const cfgPath = path.join(__dirname, '../../data/config.json');
    if (!fs.existsSync(cfgPath)) return;
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!cfg.username || !cfg.apiKey) return;
    const sign = crypto.createHash('md5').update(cfg.username + cfg.apiKey + 'pricelist').digest('hex');
    const response = await axios.post('https://api.digiflazz.com/v1/price-list', {
      cmd: 'prepaid', username: cfg.username, sign
    }, { headers: { 'Content-Type': 'application/json' } });
    let products = [];
    if (response.data?.data) {
      products = Array.isArray(response.data.data) ? response.data.data : (response.data.data.data || []);
    }
    products = products.filter(p => p.buyer_product_status === true || p.buyer_product_status === 1);
    const markup = parseFloat(getSetting('default_markup') || '7') / 100;
    const insertStmt = db.prepare(`INSERT OR REPLACE INTO products 
      (buyer_sku_code, product_name, brand, category, price_modal, price_sell, stock, unlimited_stock, buyer_product_status, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`);
    products.forEach(p => {
      const modal = p.price || 0;
      const sell = Math.round(modal * (1 + markup));
      insertStmt.run(p.buyer_sku_code, p.product_name || '', guessBrand(p.product_name, p.buyer_sku_code), '', modal, sell, p.stock || 0, p.unlimited_stock ? 1 : 0, 1);
    });
  } catch (e) {
    console.error('Sync products error:', e.message);
  }
}

// Sync products on first load
let lastSync = 0;
async function ensureSync() {
  const now = Date.now();
  if (now - lastSync > 5 * 60 * 1000) { // Sync every 5 minutes
    lastSync = now;
    await syncProductsFromDigiflazz();
  }
}

// ===================== DEPOSIT CALLBACK (WEBHOOK) =====================
router.post('/deposit/callback', (req, res) => {
  try {
    // Always return 200 OK quickly (recommended by Digiflazz docs)
    const sig = req.headers['x-hub-signature'] || '';
    const sigSecret = req.headers['x-digiflazz-secret'] || '';
    const ua = req.get('user-agent') || '';
    console.log(`[WEBHOOK] UA: ${ua} | Signature: ${sig ? 'present' : 'none'}`);

    const payload = req.body;
    const data = payload.data || payload;
    const refId = data.ref_id || '';
    const status = (data.status || '').toLowerCase();
    const amount = parseInt(data.amount) || 0;

    if (!refId) {
      console.log('[WEBHOOK] No ref_id in payload');
      return res.status(200).json({ success: true });
    }

    // Find deposit by ref_id
    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ? OR notes LIKE ?').get(parseInt(refId.replace(/\D/g, '')) || 0, `%${refId}%`);
    if (!deposit) {
      console.log(`[WEBHOOK] Deposit not found for ref_id: ${refId}`);
      return res.status(200).json({ success: true });
    }

    // Update based on status
    if (status.includes('sukses') || status.includes('success') || status === 'paid') {
      // Approve and credit balance
      db.prepare('UPDATE deposits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('approved', deposit.id);
      updateBalance(deposit.user_id, deposit.final_amount, 'deposit_callback', `Deposit auto-approved via callback (${refId})`, deposit.id);
      console.log(`[WEBHOOK] Deposit #${deposit.id} approved, user #${deposit.user_id} credited Rp ${deposit.final_amount}`);
    } else if (status.includes('gagal') || status.includes('failed') || status === 'expired') {
      db.prepare('UPDATE deposits SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('rejected', `Auto-rejected via callback: ${status}`, deposit.id);
      console.log(`[WEBHOOK] Deposit #${deposit.id} auto-rejected: ${status}`);
    } else {
      // Pending - update note
      db.prepare('UPDATE deposits SET admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(`Callback pending: ${status}`, deposit.id);
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[WEBHOOK] Error:', e.message);
    return res.status(200).json({ success: true }); // Still return 200 per best practice
  }
});

// ===================== DEPOSIT REQUEST (User initiates) =====================
router.post('/deposit-request', async (req, res) => {
  try {
    const { amount, payment_method, token } = req.body;
    if (!amount || amount < 10000) {
      return res.status(400).json({ success: false, message: 'Minimal deposit Rp 10.000' });
    }
    if (!token) return res.status(400).json({ success: false, message: 'Login diperlukan' });
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../auth');
    let user = null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      user = getUser(decoded.id);
    } catch (e) {}
    if (!user) return res.status(401).json({ success: false, message: 'User tidak ditemukan' });

    // Create deposit record with pending status
    // The notes will store the ref_id for webhook matching
    const refId = `DEP-${Date.now()}-${user.id}`;
    const result = db.prepare('INSERT INTO deposits (user_id, amount, fee, final_amount, payment_method, status, notes) VALUES (?, ?, 0, ?, ?, ?, ?)')
      .run(user.id, parseInt(amount), parseInt(amount), payment_method || 'auto', 'pending', refId);
    const depositId = result.lastInsertRowid;

    // Try to call Digiflazz deposit API to get payment details
    let digiflazzInfo = null;
    try {
      const cfgPath = path.join(__dirname, '../../data/config.json');
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg.username && cfg.apiKey) {
          const sign = crypto.createHash('md5').update(cfg.username + cfg.apiKey + 'deposit').digest('hex');
          const response = await axios.post('https://api.digiflazz.com/v1/deposit', {
            username: cfg.username,
            amount: parseInt(amount),
            bank: payment_method || 'BCA',
            owner_name: user.username,
            sign
          }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
          digiflazzInfo = response.data?.data || response.data;
          // Update deposit notes with Digiflazz ref if any
          if (digiflazzInfo?.notes || digiflazzInfo?.ref_id) {
            const combinedNote = `${refId} | digiflazz_ref=${digiflazzInfo.notes || digiflazzInfo.ref_id}`;
            db.prepare('UPDATE deposits SET notes = ? WHERE id = ?').run(combinedNote, depositId);
          }
        }
      }
    } catch (digiflazzErr) {
      console.log('[DEPOSIT] Digiflazz call failed (will still allow manual transfer):', digiflazzErr.message);
    }

    res.json({
      success: true,
      message: 'Deposit request berhasil. Selesaikan pembayaran untuk auto-approve.',
      deposit_id: depositId,
      ref_id: refId,
      digiflazz: digiflazzInfo
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// User polls their deposit status
router.get('/deposit-status/:id', (req, res) => {
  try {
    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(parseInt(req.params.id));
    if (!deposit) return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan' });
    res.json({ success: true, deposit });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Track referral click
router.get('/r/:code', (req, res) => {
  try {
    const affiliate = getUserByReferralCode(req.params.code);
    if (affiliate) {
      db.prepare('INSERT INTO referral_clicks (affiliate_id, ip_address, user_agent) VALUES (?, ?, ?)').run(
        affiliate.id, req.ip, req.get('user-agent') || ''
      );
    }
    res.redirect(`/shop.html?ref=${req.params.code}`);
  } catch (e) {
    res.redirect('/shop.html');
  }
});

// Get products for shop
router.get('/products', async (req, res) => {
  await ensureSync();
  try {
    const products = db.prepare('SELECT * FROM products WHERE buyer_product_status = 1 ORDER BY brand, product_name').all();
    // Group by brand
    const groups = {};
    products.forEach(p => {
      if (!groups[p.brand]) groups[p.brand] = [];
      groups[p.brand].push(p);
    });
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    res.json({ success: true, products, groups: sorted, total: products.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Process order (requires login)
router.post('/order', async (req, res) => {
  try {
    const { buyer_sku_code, customer_no, ref_id, token } = req.body;
    if (!buyer_sku_code || !customer_no || !ref_id) {
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
    }
    // Verify user from token in body
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../auth');
    let user = null;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      user = getUser(decoded.id);
    } catch (e) {}
    if (!user || user.status !== 'active') {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu' });
    }
    // Check balance
    const product = db.prepare('SELECT * FROM products WHERE buyer_sku_code = ?').get(buyer_sku_code);
    if (!product) return res.status(400).json({ success: false, message: 'Produk tidak ditemukan' });
    if (user.balance < product.price_sell) {
      return res.status(400).json({ success: false, message: 'Saldo tidak mencukupi. Silakan deposit.' });
    }
    // Check ref_id uniqueness
    const existingOrder = db.prepare('SELECT id FROM orders WHERE ref_id = ?').get(ref_id);
    if (existingOrder) {
      return res.status(400).json({ success: false, message: 'Ref ID sudah digunakan' });
    }
    // Deduct balance
    const deducted = updateBalance(user.id, -product.price_sell, 'order', `Order ${buyer_sku_code} → ${customer_no}`, null);
    if (!deducted) return res.status(400).json({ success: false, message: 'Gagal memotong saldo' });
    // Forward to Digiflazz API
    const masterConfig = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../data/config.json'), 'utf8') || '{}');
    try {
      const sign = generateSign(masterConfig.username || '', masterConfig.apiKey || '', ref_id);
      const payload = {
        username: masterConfig.username,
        sign, buyer_sku_code, customer_no, ref_id,
        testing: masterConfig.isDevelopment ? true : false
      };
      const response = await axios.post('https://api.digiflazz.com/v1/transaction', payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      const respData = response.data;
      const rc = respData?.data?.rc || '';
      const sn = respData?.data?.sn || '';
      const status = (rc === '00' || rc === '03') ? (rc === '00' ? 'success' : 'pending') : 'failed';
      // Save order
      db.prepare(`INSERT INTO orders (user_id, customer_no, buyer_sku_code, ref_id, price_modal, price_sell, rc_code, sn, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        user.id, customer_no, buyer_sku_code, ref_id, product.price_modal, product.price_sell, rc, sn, status
      );
      const orderId = db.prepare('SELECT last_insert_rowid() as id').get().id;
      // Create commission if affiliate
      if (user.role === 'affiliate') {
        const rate = user.tier === 'pro' ? parseFloat(getSetting('commission_rate_pro')) : parseFloat(getSetting('commission_rate_basic'));
        const commission = Math.round(product.price_sell * rate);
        if (commission > 0) {
          db.prepare('INSERT INTO commissions (order_id, affiliate_id, amount, rate) VALUES (?, ?, ?, ?)').run(orderId, user.id, commission, rate);
          updateBalance(user.id, commission, 'commission', `Komisi order ${buyer_sku_code}`, orderId);
          db.prepare('UPDATE users SET total_earned = total_earned + ?, total_orders = total_orders + 1 WHERE id = ?').run(commission, user.id);
        }
      }
      // Referral commission (1 level up)
      if (user.referred_by) {
        const referrer = getUser(user.referred_by);
        if (referrer && referrer.role === 'affiliate') {
          const refRate = referrer.tier === 'pro' ? parseFloat(getSetting('commission_rate_pro')) : parseFloat(getSetting('commission_rate_basic'));
          const refCommission = Math.round(product.price_sell * refRate * 0.5);
          if (refCommission > 0) {
            db.prepare('INSERT INTO commissions (order_id, affiliate_id, customer_id, amount, rate) VALUES (?, ?, ?, ?, ?)').run(
              orderId, referrer.id, user.id, refCommission, refRate * 0.5
            );
            updateBalance(referrer.id, refCommission, 'referral_commission', `Referral komisi dari ${user.username}`, orderId);
          }
        }
      }
      res.json({
        success: true,
        message: status === 'success' ? 'Transaksi berhasil' : status === 'pending' ? 'Transaksi sedang diproses' : 'Transaksi gagal',
        data: respData, rc, sn, status, orderId
      });
    } catch (apiError) {
      // Refund balance on API failure
      updateBalance(user.id, product.price_sell, 'refund', `Refund order gagal ${buyer_sku_code}`, null);
      res.status(500).json({ success: false, message: 'Gagal memproses ke API Digiflazz' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Check order status
router.post('/order-status', async (req, res) => {
  try {
    const { ref_id, buyer_sku_code, customer_no, token } = req.body;
    if (!token) return res.status(401).json({ success: false, message: 'Login diperlukan' });
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../auth');
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = getUser(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    try {
      const masterConfig = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../data/config.json'), 'utf8') || '{}');
      const sign = generateSign(masterConfig.username || '', masterConfig.apiKey || '', ref_id);
      const payload = { username: masterConfig.username, sign, buyer_sku_code, customer_no, ref_id };
      const response = await axios.post('https://api.digiflazz.com/v1/transaction', payload, {
        headers: { 'Content-Type': 'application/json' }
      });
      res.json({ success: true, data: response.data });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Gagal cek status' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function generateSign(username, apiKey, extra) {
  return crypto.createHash('md5').update(username + apiKey + extra).digest('hex');
}

module.exports = router;
