const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { signToken } = require('../lib/auth');
const router = express.Router();

router.post('/login', async (req, res) => {
  console.log('📌 [POST /api/auth/login] Incoming login request for:', req.body?.identifier);

  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      console.warn('⚠️ [POST /api/auth/login] Missing identifier or password');
      return res.status(400).json({ message: 'identifier and password are required.' });
    }

    if (!isDbReady()) {
      console.warn('⚠️ [POST /api/auth/login] Database not ready');
      return res.status(503).json({ message: 'Database not ready. Please try again later.' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE (email = ? OR phone = ?) AND password_hash = ?',
      [identifier, identifier, password],
    );

    if (!rows.length) {
      console.warn('⚠️ [POST /api/auth/login] Invalid credentials for:', identifier);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    console.log('✅ [POST /api/auth/login] Login successful for user:', user.email);
    res.json({ user, token });
  } catch (error) {
    console.error('❌ [POST /api/auth/login] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

