const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { verifyToken } = require('../lib/auth');
const router = express.Router();

function getTokenFromHeader(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

router.get('/mpesa', async (req, res) => {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'organizer') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    if (!isDbReady()) {
      return res.json({ type: 'Paybill', number: '', account: '' });
    }

    const [rows] = await pool.query(
      'SELECT mpesa_paybill, mpesa_till, mpesa_account_name FROM organizers WHERE user_id = ?',
      [decoded.sub],
    );

    if (!rows.length) {
      return res.json({ type: 'Paybill', number: '', account: '' });
    }

    const row = rows[0];
    res.json({
      type: row.mpesa_till ? 'Till' : 'Paybill',
      number: row.mpesa_till || row.mpesa_paybill || '',
      account: row.mpesa_account_name || '',
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

router.post('/mpesa', async (req, res) => {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'organizer') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { type, number, account } = req.body;
    if (!number) {
      return res.status(400).json({ message: 'number is required' });
    }

    if (!isDbReady()) {
      return res.json({ ok: true, message: 'Settings saved in demo mode' });
    }

    await pool.query(
      `INSERT INTO organizers (user_id, organization_name, contact_name, phone, email, mpesa_paybill, mpesa_till, mpesa_account_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         organization_name = VALUES(organization_name),
         contact_name = VALUES(contact_name),
         phone = VALUES(phone),
         email = VALUES(email),
         mpesa_paybill = VALUES(mpesa_paybill),
         mpesa_till = VALUES(mpesa_till),
         mpesa_account_name = VALUES(mpesa_account_name)`,
      [
        decoded.sub,
        'eTikket Organizer',
        'Organizer',
        '',
        decoded.email,
        type === 'Paybill' ? number : null,
        type === 'Till' ? number : null,
        account || '',
      ],
    );

    res.json({ ok: true, message: 'Settings saved' });
  } catch (error) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
});

module.exports = router;
