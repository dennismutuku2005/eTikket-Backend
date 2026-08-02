const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { signToken } = require('../lib/auth');
const router = express.Router();

router.post('/register', async (req, res) => {
  console.log('📌 [POST /api/users/register] Incoming registration request:', {
    name: req.body?.name,
    email: req.body?.email,
    phone: req.body?.phone,
    role: req.body?.role,
  });

  try {
    const { name, email, phone, password, role = 'buyer' } = req.body;

    if (!name || !email || !phone || !password) {
      console.warn('⚠️ [POST /api/users/register] Missing required fields');
      return res.status(400).json({ message: 'name, email, phone, and password are required.' });
    }

    if (!isDbReady()) {
      console.warn('⚠️ [POST /api/users/register] Database not ready');
      return res.status(503).json({ message: 'Database not ready. Registration is unavailable.' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, password, role],
    );

    console.log('✅ [POST /api/users/register] Registration successful for user ID:', result.insertId);
    const token = signToken({ sub: result.insertId, role, email });
    res.status(201).json({ id: result.insertId, token, message: 'Registration successful' });
  } catch (error) {
    console.error('❌ [POST /api/users/register] Error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

