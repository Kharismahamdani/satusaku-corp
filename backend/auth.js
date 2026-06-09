const jwt = require('jsonwebtoken');
const { getUser } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'satusaku-corp-secret-key-2024';
const JWT_EXPIRES = '7d';

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role, tier: user.tier }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau expired' });
  }
  const user = getUser(decoded.id);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ success: false, message: 'Akun tidak aktif' });
  }
  req.user = user;
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya admin.' });
  }
  next();
}

function affiliateMiddleware(req, res, next) {
  if (req.user.role !== 'affiliate') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya affiliate.' });
  }
  next();
}

module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware, affiliateMiddleware, JWT_SECRET };