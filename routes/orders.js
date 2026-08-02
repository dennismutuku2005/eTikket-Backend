const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// GET /api/orders/mine — all orders for events owned by this organizer
router.get('/mine', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.json({ data: [], total: 0 });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = Math.max(0, Number(req.query.offset || 0));

    const [rows] = await pool.query(
      `SELECT o.*, e.title AS event_title, e.venue AS event_venue, e.event_date
       FROM orders o
       INNER JOIN events e ON o.event_id = e.id
       WHERE e.organizer_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [organizerId, limit, offset],
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders o
       INNER JOIN events e ON o.event_id = e.id
       WHERE e.organizer_id = ?`,
      [organizerId],
    );

    res.json({ data: rows, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/orders — all orders
router.get('/', async (_req, res) => {
  try {
    if (!isDbReady()) return res.json([]);
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/orders — create order (public, for buyers)
router.post('/', async (req, res) => {
  try {
    const { event_id, buyer_name, buyer_email, buyer_phone, total_amount, currency, accepted_terms } = req.body;

    if (!event_id || !buyer_name || !buyer_email || !buyer_phone) {
      return res.status(400).json({ message: 'event_id, buyer_name, buyer_email, and buyer_phone are required.' });
    }

    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const orderNumber = `ETK-${Date.now()}`;
    const [result] = await pool.query(
      'INSERT INTO orders (event_id, buyer_name, buyer_email, buyer_phone, order_number, total_amount, currency, status, accepted_terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [event_id, buyer_name, buyer_email, buyer_phone, orderNumber, total_amount || 0, currency || 'KES', 'pending', accepted_terms ? 1 : 0],
    );

    res.status(201).json({ id: result.insertId, order_number: orderNumber, status: 'pending' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
