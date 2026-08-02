const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// ─── Public listing (no auth) ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 6)));
    const search = (req.query.search || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const offset = (page - 1) * limit;

    if (!isDbReady()) return res.json({ data: [], page, limit, total: 0 });

    let query = `
      SELECT e.*,
        COALESCE(SUM(tt.available_quantity), 0) AS total_tickets,
        GREATEST(0, COALESCE(SUM(tt.available_quantity), 0) - COUNT(t.id)) AS remaining_tickets
      FROM events e
      LEFT JOIN event_ticket_types tt ON tt.event_id = e.id
      LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'issued'
      WHERE 1 = 1`;
    const values = [];

    if (search) {
      query += ' AND (e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ? OR e.host_name LIKE ?)';
      const needle = `%${search}%`;
      values.push(needle, needle, needle, needle);
    }
    if (category) {
      query += ' AND e.category = ?';
      values.push(category);
    }
    query += ' GROUP BY e.id ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    values.push(limit, offset);

    const [rows] = await pool.query(query, values);

    let countQuery = 'SELECT COUNT(*) AS total FROM events e WHERE 1 = 1';
    const countValues = [];
    if (search) {
      countQuery += ' AND (e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ? OR e.host_name LIKE ?)';
      const n = `%${search}%`;
      countValues.push(n, n, n, n);
    }
    if (category) { countQuery += ' AND e.category = ?'; countValues.push(category); }
    const [[{ total }]] = await pool.query(countQuery, countValues);

    res.json({ data: rows, page, limit, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── Organizer: their own events ────────────────────────────────────────────
router.get('/mine', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.json([]);

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query(
      `SELECT e.*,
        COALESCE(SUM(tt.available_quantity), 0) AS total_tickets,
        GREATEST(0, COALESCE(SUM(tt.available_quantity), 0) - COUNT(t.id)) AS remaining_tickets
       FROM events e
       LEFT JOIN event_ticket_types tt ON tt.event_id = e.id
       LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'issued'
       WHERE e.organizer_id = ?
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [organizerId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── Get single event by id or slug (public) ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'DB not ready' });

    const lookup = req.params.id;
    const eventQuery = `
      SELECT e.*,
        COALESCE(SUM(tt.available_quantity), 0) AS total_tickets,
        GREATEST(0, COALESCE(SUM(tt.available_quantity), 0) - COUNT(t.id)) AS remaining_tickets
      FROM events e
      LEFT JOIN event_ticket_types tt ON tt.event_id = e.id
      LEFT JOIN tickets t ON t.event_id = e.id AND t.status = 'issued'
      WHERE e.id = ? OR e.slug = ?
      GROUP BY e.id
      LIMIT 1`;

    const [rows] = await pool.query(eventQuery, [lookup, lookup]);
    if (rows.length) return res.json(rows[0]);

    return res.status(404).json({ message: 'Event not found' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── Create event (organizer only) ──────────────────────────────────────────
router.post('/', requireAuth(['organizer']), async (req, res) => {
  try {
    const body = req.body || {};
    const {
      title, slug, description, category,
      event_date, event_time, venue, host_name,
      price_label, status,
      cover_image_url, latitude, longitude,
    } = body;

    if (!title || !category || !venue) {
      return res.status(400).json({ message: 'title, category, and venue are required.' });
    }

    const safeSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

    if (!isDbReady()) {
      return res.status(503).json({ message: 'Database not ready.' });
    }

    // Look up or auto-create valid primary key in organizers table
    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email, host_name);

    const [result] = await pool.query(
      `INSERT INTO events
         (organizer_id, title, slug, description, category, event_date, event_time, venue,
          host_name, price_label, status, cover_image_url, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizerId,
        title,
        safeSlug,
        description || null,
        category,
        event_date || null,
        event_time || null,
        venue,
        host_name || null,
        price_label || null,
        status || 'draft',
        cover_image_url || null,
        latitude || null,
        longitude || null,
      ],
    );

    res.status(201).json({ id: result.insertId, slug: safeSlug, message: 'Event created' });
  } catch (error) {
    console.error('Error creating event:', error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── Update event (organizer only, must own it) ──────────────────────────────
router.put('/:id', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query('SELECT id FROM events WHERE id = ? AND organizer_id = ?', [req.params.id, organizerId]);
    if (!rows.length) return res.status(404).json({ message: 'Event not found or access denied.' });

    const allowed = [
      'title', 'slug', 'description', 'category', 'event_date', 'event_time',
      'venue', 'host_name', 'price_label', 'status',
      'cover_image_url', 'latitude', 'longitude',
    ];

    const fields = [];
    const values = [];
    const body = req.body || {};
    Object.entries(body).forEach(([key, value]) => {
      if (allowed.includes(key)) { fields.push(`${key} = ?`); values.push(value); }
    });

    if (!fields.length) return res.status(400).json({ message: 'No valid update fields provided.' });

    values.push(req.params.id);
    await pool.query(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Event updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── Delete event (organizer only, must own it) ──────────────────────────────
router.delete('/:id', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query('SELECT id FROM events WHERE id = ? AND organizer_id = ?', [req.params.id, organizerId]);
    if (!rows.length) return res.status(404).json({ message: 'Event not found or access denied.' });

    await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
