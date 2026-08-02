const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// GET /api/event-ticket-types/:eventId — list ticket types for an event
router.get('/:eventId', async (req, res) => {
  try {
    if (!isDbReady()) return res.json([]);
    const [rows] = await pool.query(
      'SELECT * FROM event_ticket_types WHERE event_id = ? ORDER BY sort_order ASC, id ASC',
      [req.params.eventId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/event-ticket-types/:eventId — replace all ticket types for an event (organizer only)
// Deletes existing types for this event and re-inserts from the provided array.
router.put('/:eventId', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const eventId = Number(req.params.eventId);
    const ticketTypes = Array.isArray(req.body) ? req.body : [];

    // Verify the event belongs to this organizer
    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [events] = await pool.query(
      'SELECT id FROM events WHERE id = ? AND organizer_id = ?',
      [eventId, organizerId],
    );
    if (!events.length) {
      return res.status(404).json({ message: 'Event not found or access denied.' });
    }

    // Replace all ticket types atomically
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM event_ticket_types WHERE event_id = ?', [eventId]);

      if (ticketTypes.length > 0) {
        const rows = ticketTypes.map((t, i) => [
          eventId,
          (t.name || 'General').trim(),
          (t.description || '').trim(),
          Number(t.price) || 0,
          Math.max(0, Number(t.available) || 0),
          i, // sort_order
        ]);
        await conn.query(
          'INSERT INTO event_ticket_types (event_id, name, description, price, available_quantity, sort_order) VALUES ?',
          [rows],
        );
      }

      await conn.commit();
      res.json({ message: 'Ticket types saved.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
