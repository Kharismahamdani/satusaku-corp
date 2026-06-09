const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getUserByUsername, getUserByEmail, getUserByReferralCode, createUser, getSetting } = require('../database');
const { generateToken } = require('../auth');

// Register
router.post('/register', (req, res) => {
  try {
    const { username, email, password, phone, tier, ref } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Username, email, dan password wajib' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ success: false, message: 'Username harus 3-20 karakter' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Email tidak valid' });
    }
    if (getUserByUsername(username)) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan' });
    }
    if (getUserByEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });
    }
    const selectedTier = (tier === 'pro') ? 'pro' : 'basic';
    const fee = parseInt(getSetting(selectedTier === 'pro' ? 'registration_fee_pro' : 'registration_fee_basic'));
    let referredBy = null;
    if (ref) {
      const referrer = getUserByReferralCode(ref);
      if (referrer) referredBy = referrer.id;
    }
    const result = createUser(username, email, password, phone || '', selectedTier, referredBy);
    const user = { id: result.id, username, email, role: 'affiliate', tier: selectedTier, referral_code: result.referral_code };
    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Registrasi berhasil',
      token,
      user: { ...user, fee, phone: phone || '' },
      referral_link: `${req.protocol}://${req.get('host')}/r/${result.referral_code}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal registrasi: ' + error.message });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib' });
    }
    const user = getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Akun tidak aktif' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tier: user.tier,
        balance: user.balance,
        referral_code: user.referral_code,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal login: ' + error.message });
  }
});

// Get profile
router.get('/profile', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../auth');
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { getUser } = require('../database');
    const user = getUser(decoded.id);
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        tier: user.tier,
        balance: user.balance,
        total_earned: user.total_earned,
        total_orders: user.total_orders,
        referral_code: user.referral_code,
        phone: user.phone,
        created_at: user.created_at
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal load profile' });
  }
});

module.exports = router;