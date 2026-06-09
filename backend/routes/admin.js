const express = require('express');
const router = express.Router();
const { db, getUser, updateBalance, getSetting, updateSetting, getDashboardStats } = require('../database');
const { authMiddleware, adminMiddleware } = require('../auth');

router.use(authMiddleware);
router.use(adminMiddleware);

// Get dashboard stats
router.get('/dashboard', (req, res) => {
  try {
    const stats = getDashboardStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all users
router.get('/users', (req, res) => {
  try {
    const users = db.prepare("SELECT id,username,email,phone,role,tier,referral_code,balance,total_earned,total_orders,status,created_at FROM users WHERE role='affiliate' ORDER BY created_at DESC").all();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Toggle user status
router.put('/users/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }
    db.prepare('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `User status diubah ke ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Adjust user balance
router.post('/users/:id/adjust', (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount) return res.status(400).json({ success: false, message: 'Amount wajib' });
    const success = updateBalance(parseInt(req.params.id), parseInt(amount), 'admin_adjust', description || 'Admin adjustment', null);
    if (!success) return res.status(400).json({ success: false, message: 'Gagal adjust balance' });
    res.json({ success: true, message: 'Balance adjusted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all orders
router.get('/orders', (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT o.*, u.username as affiliate_username FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 100
    `).all();
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pending deposits
router.get('/deposits', (req, res) => {
  try {
    const deposits = db.prepare(`
      SELECT d.*, u.username, u.email FROM deposits d 
      JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50
    `).all();
    res.json({ success: true, deposits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve/reject deposit
router.put('/deposits/:id', (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }
    const deposit = db.prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);
    if (!deposit) return res.status(404).json({ success: false, message: 'Deposit tidak ditemukan' });
    if (deposit.status !== 'pending') return res.status(400).json({ success: false, message: 'Deposit sudah diproses' });
    db.prepare('UPDATE deposits SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, admin_note || '', req.params.id);
    if (status === 'approved') {
      updateBalance(deposit.user_id, deposit.final_amount, 'deposit', `Deposit approved (Rp ${deposit.final_amount.toLocaleString()})`, deposit.id);
    }
    res.json({ success: true, message: `Deposit ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get pending withdrawals
router.get('/withdrawals', (req, res) => {
  try {
    const withdrawals = db.prepare(`
      SELECT w.*, u.username, u.email FROM withdrawals w 
      JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 50
    `).all();
    res.json({ success: true, withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Approve/reject withdrawal
router.put('/withdrawals/:id', (req, res) => {
  try {
    const { status, admin_note } = req.body;
    if (!['approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }
    const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
    if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal tidak ditemukan' });
    if (withdrawal.status !== 'pending' && status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Withdrawal sudah diproses' });
    }
    db.prepare('UPDATE withdrawals SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, admin_note || '', req.params.id);
    if (status === 'rejected') {
      updateBalance(withdrawal.user_id, withdrawal.amount, 'withdrawal_refund', `Withdrawal ditolak - dana dikembalikan`, withdrawal.id);
    }
    res.json({ success: true, message: `Withdrawal ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get/update settings
router.get('/settings', (req, res) => {
  try {
    const settings = {};
    const rows = db.prepare('SELECT * FROM settings').all();
    rows.forEach(r => settings[r.key] = r.value);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'Settings tidak valid' });
    }
    Object.entries(settings).forEach(([key, value]) => {
      updateSetting(key, String(value));
    });
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all commissions
router.get('/commissions', (req, res) => {
  try {
    const commissions = db.prepare(`
      SELECT c.*, u.username as affiliate_username, o.buyer_sku_code, o.customer_no, o.ref_id
      FROM commissions c 
      JOIN users u ON c.affiliate_id = u.id
      JOIN orders o ON c.order_id = o.id
      ORDER BY c.created_at DESC LIMIT 100
    `).all();
    res.json({ success: true, commissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get transactions log
router.get('/transactions', (req, res) => {
  try {
    const transactions = db.prepare(`
      SELECT t.*, u.username FROM transactions_log t
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC LIMIT 100
    `).all();
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;