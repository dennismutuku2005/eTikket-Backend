const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// GET /api/tickets/organizer — get attendees, entry flow, ticket mix & logs for organizer
router.get('/organizer', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.json({
        stats: { totalAttendees: 0, checkedIn: 0, pending: 0, repeatVisits: 0 },
        entryFlow: [],
        ticketMix: [],
        logs: [],
      });
    }

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);

    // Fetch all tickets for this organizer's events
    const [tickets] = await pool.query(
      `SELECT t.id, t.ticket_code, t.attendee_name, t.ticket_type, t.status, t.scanned_at,
              e.title AS event_title, o.buyer_name, o.buyer_email
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       JOIN orders o ON t.order_item_id IS NOT NULL AND o.event_id = e.id
       WHERE e.organizer_id = ?
       ORDER BY t.created_at DESC`,
      [organizerId],
    );

    // If no direct JOIN on orders via order_item_id, fallback to joining via event_id
    let allTickets = tickets;
    if (allTickets.length === 0) {
      const [fallbackTickets] = await pool.query(
        `SELECT t.id, t.ticket_code, t.attendee_name, t.ticket_type, t.status, t.scanned_at,
                e.title AS event_title
         FROM tickets t
         JOIN events e ON t.event_id = e.id
         WHERE e.organizer_id = ?
         ORDER BY t.created_at DESC`,
        [organizerId],
      );
      allTickets = fallbackTickets;
    }

    const totalAttendees = allTickets.length;
    const checkedIn = allTickets.filter((t) => t.status === 'checked_in').length;
    const pending = totalAttendees - checkedIn;

    // Check for repeat visits (multiple check-in records if any)
    const [repeatRows] = await pool.query(
      `SELECT ticket_id, COUNT(*) AS count
       FROM check_ins c
       JOIN tickets t ON c.ticket_id = t.id
       JOIN events e ON t.event_id = e.id
       WHERE e.organizer_id = ?
       GROUP BY ticket_id HAVING count > 1`,
      [organizerId],
    );
    const repeatVisits = repeatRows.length;

    // Group entry flow by day/hour
    const [flowRows] = await pool.query(
      `SELECT DATE_FORMAT(scanned_at, '%a') as day,
              DATE_FORMAT(scanned_at, '%Y-%m-%d') as full_date,
              COUNT(*) as count
       FROM tickets t
       JOIN events e ON t.event_id = e.id
       WHERE e.organizer_id = ? AND t.status = 'checked_in' AND t.scanned_at IS NOT NULL
       GROUP BY full_date, day
       ORDER BY full_date ASC
       LIMIT 7`,
      [organizerId],
    );

    const defaultDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const flowMap = {};
    flowRows.forEach((r) => { flowMap[r.day] = Number(r.count); });
    const entryFlow = defaultDays.map((day) => ({
      day,
      scans: flowMap[day] || 0,
    }));

    // Group ticket mix
    const mixMap = {};
    allTickets.forEach((t) => {
      const type = t.ticket_type || 'General';
      mixMap[type] = (mixMap[type] || 0) + 1;
    });

    const ticketMix = Object.entries(mixMap).map(([name, count]) => ({
      name,
      value: count,
      percentage: totalAttendees > 0 ? Math.round((count / totalAttendees) * 100) : 0,
    }));

    // Logs
    const logs = allTickets.map((t) => ({
      id: t.id,
      name: t.attendee_name || t.buyer_name || 'Guest',
      email: t.buyer_email || '',
      ticket: t.ticket_type || 'General',
      code: t.ticket_code,
      event_title: t.event_title,
      status: t.status === 'checked_in' ? 'Used' : 'Unused',
      scanned: t.scanned_at ? new Date(t.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
    }));

    res.json({
      stats: { totalAttendees, checkedIn, pending, repeatVisits },
      entryFlow,
      ticketMix,
      logs,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/tickets/:code
router.get('/:code', async (req, res) => {
  try {
    if (!isDbReady()) {
      return res.json({
        code: req.params.code,
        status: 'issued',
        attendee_name: 'Demo guest',
        qr_code: null,
      });
    }

    const [rows] = await pool.query('SELECT * FROM tickets WHERE ticket_code = ?', [req.params.code]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/tickets/verify
router.post('/verify', async (req, res) => {
  try {
    const { code, staff_id } = req.body;
    if (!code || !staff_id) {
      return res.status(400).json({ message: 'code and staff_id are required.' });
    }

    if (isDbReady()) {
      await pool.query('UPDATE tickets SET status = ?, scanned_by = ?, scanned_at = NOW() WHERE ticket_code = ?', ['checked_in', staff_id, code]);
    }

    res.json({ ok: true, message: 'Ticket verified' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
