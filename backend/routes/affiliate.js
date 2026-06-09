const express = require('express');
const router = express.Router();
const { db, getUser, updateBalance, getSetting, getReferralStats } = require('../database');
const { authMiddleware, affiliateMiddleware } = require('../auth');

router.use(authMiddleware);
router.use(affiliateMiddleware);

// Get affiliate dashboard data
router.get('/dashboard', (req, res) => {
  try {
    const user = req.user;
    const refStats = getReferralStats(user.id);
    const recentOrders = db.prepare(`
      SELECT o.*, u.username as affiliate_username FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 10
    `).all(user.id);
    const pendingCommission = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE affiliate_id = ? AND status = 'pending'"
    ).get(user.id).total;
    const approvedCommission = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE affiliate_id = ? AND status = 'approved'"
    ).get(user.id).total;
    const todayCommission = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE affiliate_id = ? AND date(created_at) = date('now')"
    ).get(user.id).total;
    res.json({
      success: true,
      user: {
        username: user.username, tier: user.tier, balance: user.balance,
        total_earned: user.total_earned, total_orders: user.total_orders,
        referral_code: user.referral_code, phone: user.phone
      },
      referral: refStats,
      commission: { pending: pendingCommission, approved: approvedCommission, today: todayCommission },
      recentOrders,
      referral_link: `${req.protocol}://${req.get('host')}/r/${user.referral_code}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get my orders
router.get('/orders', (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get commission history
router.get('/commissions', (req, res) => {
  try {
    const commissions = db.prepare(`
      SELECT c.*, o.buyer_sku_code, o.customer_no, o.ref_id 
      FROM commissions c JOIN orders o ON c.order_id = o.id 
      WHERE c.affiliate_id = ? ORDER BY c.created_at DESC LIMIT 50
    `).all(req.user.id);
    res.json({ success: true, commissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get transaction history
router.get('/transactions', (req, res) => {
  try {
    const transactions = db.prepare(
      'SELECT * FROM transactions_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Request withdrawal
router.post('/withdraw', (req, res) => {
  try {
    const user = req.user;
    const { amount, phone, provider } = req.body;
    const minWithdrawal = parseInt(getSetting('min_withdrawal'));
    const multiplier = parseInt(getSetting('withdrawal_multiplier'));
    if (!amount || !phone) {
      return res.status(400).json({ success: false, message: 'Amount dan nomor HP wajib' });
    }
    if (parseInt(amount) < minWithdrawal) {
      return res.status(400).json({ success: false, message: `Minimal penarikan Rp ${minWithdrawal.toLocaleString()}` });
    }
    if (parseInt(amount) % multiplier !== 0) {
      return res.status(400).json({ success: false, message: `Penarikan harus kelipatan Rp ${multiplier.toLocaleString()}` });
    }
    if (user.balance < parseInt(amount)) {
      return res.status(400).json({ success: false, message: 'Saldo tidak mencukupi' });
    }
    const validProviders = ['dana', 'ovo', 'gopay', 'pulsa'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ success: false, message: 'Provider tidak valid' });
    }
    // Deduct balance
    const deducted = updateBalance(user.id, -parseInt(amount), 'withdrawal', `Penarikan ke ${provider} (${phone})`, null);
    if (!deducted) {
      return res.status(400).json({ success: false, message: 'Gagal memproses penarikan' });
    }
    db.prepare('INSERT INTO withdrawals (user_id, amount, phone, provider) VALUES (?, ?, ?, ?)').run(
      user.id, parseInt(amount), phone, provider
    );
    res.json({ success: true, message: 'Penarikan berhasil diajukan. Menunggu approval admin.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get withdrawal history
router.get('/withdrawals', (req, res) => {
  try {
    const withdrawals = db.prepare(
      'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(req.user.id);
    res.json({ success: true, withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update profile
router.put('/profile', (req, res) => {
  try {
    const { phone } = req.body;
    if (phone !== undefined) {
      db.prepare('UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(phone, req.user.id);
    }
    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;