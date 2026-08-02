const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// GET /api/staff — organizer's own staff members
router.get('/', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.json([]);

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, role, created_at FROM staff_members WHERE organizer_id = ? ORDER BY created_at DESC',
      [organizerId],
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/staff — create gate staff under this organizer
router.post('/', requireAuth(['organizer']), async (req, res) => {
  try {
    const { full_name, email, phone, password_hash, role } = req.body;

    if (!full_name || !email || !phone || !password_hash) {
      return res.status(400).json({ message: 'full_name, email, phone, and password_hash are required.' });
    }

    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);

    // Also create a user account so staff can log in
    let userId = null;
    try {
      const [userResult] = await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [full_name, email, phone, password_hash, 'gate_staff'],
      );
      userId = userResult.insertId;
    } catch {
      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length) userId = existing[0].id;
    }

    const [result] = await pool.query(
      'INSERT INTO staff_members (organizer_id, full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [organizerId, full_name, email, phone, password_hash, role || 'gate_staff'],
    );

    res.status(201).json({ id: result.insertId, user_id: userId, message: 'Gate staff created' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/staff/:id — update staff (only owner can edit)
router.put('/:id', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query('SELECT id FROM staff_members WHERE id = ? AND organizer_id = ?', [req.params.id, organizerId]);
    if (!rows.length) return res.status(404).json({ message: 'Staff member not found or access denied.' });

    const { full_name, email, phone, password_hash, role } = req.body;
    const fields = [];
    const values = [];

    if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
    if (password_hash !== undefined) { fields.push('password_hash = ?'); values.push(password_hash); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }

    if (!fields.length) return res.status(400).json({ message: 'No update fields provided.' });

    values.push(req.params.id);
    await pool.query(`UPDATE staff_members SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Staff updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/staff/:id — remove staff (only owner)
router.delete('/:id', requireAuth(['organizer']), async (req, res) => {
  try {
    if (!isDbReady()) return res.status(503).json({ message: 'Database not ready.' });

    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);
    const [rows] = await pool.query('SELECT id FROM staff_members WHERE id = ? AND organizer_id = ?', [req.params.id, organizerId]);
    if (!rows.length) return res.status(404).json({ message: 'Staff member not found or access denied.' });

    await pool.query('DELETE FROM staff_members WHERE id = ?', [req.params.id]);
    res.json({ message: 'Staff deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
