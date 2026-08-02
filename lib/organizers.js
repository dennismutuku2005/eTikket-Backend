const { pool } = require('../config/db');

/**
 * Gets the primary key `id` from `organizers` table for a given `user_id`.
 * Automatically creates an `organizers` row if one does not exist yet.
 * @param {number} userId - user_id from JWT payload (users.id)
 * @param {string} email - user's email
 * @param {string} [name] - organization / contact name
 * @returns {Promise<number>} - organizers.id
 */
async function getOrCreateOrganizerId(userId, email = '', name = 'eTikket Organizer') {
  // 1. Look up existing organizer entry by user_id
  const [rows] = await pool.query('SELECT id FROM organizers WHERE user_id = ?', [userId]);
  if (rows.length) {
    return rows[0].id;
  }

  // 2. Insert new entry into organizers table if missing
  try {
    const [result] = await pool.query(
      `INSERT INTO organizers (user_id, organization_name, contact_name, phone, email)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name || 'eTikket Organizer', name || 'Organizer', '', email || ''],
    );
    return result.insertId;
  } catch (err) {
    // Re-query in case of race condition
    const [recheck] = await pool.query('SELECT id FROM organizers WHERE user_id = ?', [userId]);
    if (recheck.length) {
      return recheck[0].id;
    }
    throw err;
  }
}

module.exports = { getOrCreateOrganizerId };
