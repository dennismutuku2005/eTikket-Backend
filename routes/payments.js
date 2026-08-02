const express = require('express');
const { pool, isDbReady } = require('../config/db');
const qr = require('qrcode');
const router = express.Router();

router.post('/initiate', async (req, res) => {
  const { order_id, amount, phone, buyer_name, buyer_email, event_id } = req.body;

  if (!order_id || !amount || !phone) {
    return res.status(400).json({ message: 'order_id, amount, and phone are required.' });
  }

  try {
    const providerReference = `DUMMY-${Date.now()}`;
    const qrData = JSON.stringify({ order_id, buyer_name, buyer_email, event_id, providerReference });
    const qrCode = await qr.toDataURL(qrData);

    if (isDbReady()) {
      await pool.query(
        'INSERT INTO payments (order_id, payment_method, provider_reference, amount, currency, status) VALUES (?, ?, ?, ?, ?, ?)',
        [order_id, 'mpesa', providerReference, amount, 'KES', 'paid'],
      );

      await pool.query(
        'INSERT INTO tickets (order_item_id, event_id, ticket_code, attendee_name, ticket_type, status) VALUES (?, ?, ?, ?, ?, ?)',
        [1, event_id || 1, providerReference, buyer_name || 'Guest', 'Standard', 'issued'],
      );
    }

    res.json({
      ok: true,
      provider: 'dummy',
      message: 'Payment request prepared. This is a dummy flow for now.',
      provider_reference: providerReference,
      amount,
      phone,
      status: 'paid',
      qr_code: qrCode,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
