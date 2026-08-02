const express = require('express');
const { pool, isDbReady } = require('../config/db');
const { requireAuth } = require('../lib/middleware');
const { getOrCreateOrganizerId } = require('../lib/organizers');
const router = express.Router();

// GET /api/analytics/summary — organizer-scoped analytics
router.get('/summary', requireAuth(['organizer']), async (req, res) => {
  if (!isDbReady()) {
    return res.json({
      totalRevenue: 0,
      totalOrders: 0,
      totalTickets: 0,
      activeEvents: 0,
      soldOutEvents: 0,
      revenueByDay: [],
      bookingsByDay: [],
    });
  }

  try {
    const organizerId = await getOrCreateOrganizerId(req.user.sub, req.user.email);

    // Basic counts
    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*) AS totalEvents,
         COALESCE(SUM(CASE WHEN status NOT IN ('Draft','Sold out') THEN 1 ELSE 0 END), 0) AS activeEvents,
         COALESCE(SUM(CASE WHEN status = 'Sold out' THEN 1 ELSE 0 END), 0) AS soldOutEvents
       FROM events
       WHERE organizer_id = ?`,
      [organizerId],
    );

    // Revenue & orders from orders table joined to events
    const [[ordersAgg]] = await pool.query(
      `SELECT
         COALESCE(SUM(o.total_amount), 0) AS totalRevenue,
         COUNT(o.id) AS totalOrders
       FROM orders o
       INNER JOIN events e ON o.event_id = e.id
       WHERE e.organizer_id = ?`,
      [organizerId],
    );

    // Tickets sold (from order_tickets if exists, fallback to orders count)
    let totalTickets = ordersAgg.totalOrders;
    try {
      const [[tkt]] = await pool.query(
        `SELECT COALESCE(SUM(ot.quantity), 0) AS total
         FROM order_tickets ot
         INNER JOIN orders o ON ot.order_id = o.id
         INNER JOIN events e ON o.event_id = e.id
         WHERE e.organizer_id = ?`,
        [organizerId],
      );
      totalTickets = tkt.total || ordersAgg.totalOrders;
    } catch {
      // order_tickets table may not exist
    }

    // Revenue per day (last 7 days)
    const [revenueByDay] = await pool.query(
      `SELECT
         DATE(o.created_at) AS day,
         COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM orders o
       INNER JOIN events e ON o.event_id = e.id
       WHERE e.organizer_id = ?
         AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(o.created_at)
       ORDER BY day ASC`,
      [organizerId],
    );

    // Bookings per day (last 7 days)
    const [bookingsByDay] = await pool.query(
      `SELECT
         DATE(o.created_at) AS day,
         COUNT(o.id) AS bookings
       FROM orders o
       INNER JOIN events e ON o.event_id = e.id
       WHERE e.organizer_id = ?
         AND o.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(o.created_at)
       ORDER BY day ASC`,
      [organizerId],
    );

    // Fill in missing days with 0s for the last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const revMap = Object.fromEntries(revenueByDay.map((r) => [r.day.toISOString().slice(0, 10), Number(r.revenue)]));
    const bkMap = Object.fromEntries(bookingsByDay.map((r) => [r.day.toISOString().slice(0, 10), Number(r.bookings)]));

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const revenueChart = days.map((d) => ({
      label: labels[new Date(d).getDay() === 0 ? 6 : new Date(d).getDay() - 1] || d.slice(5),
      value: revMap[d] || 0,
    }));
    const bookingsChart = days.map((d) => ({
      label: labels[new Date(d).getDay() === 0 ? 6 : new Date(d).getDay() - 1] || d.slice(5),
      value: bkMap[d] || 0,
    }));

    res.json({
      totalRevenue: Number(ordersAgg.totalRevenue),
      totalOrders: Number(ordersAgg.totalOrders),
      totalTickets,
      activeEvents: Number(counts.activeEvents),
      soldOutEvents: Number(counts.soldOutEvents),
      revenueByDay: revenueChart,
      bookingsByDay: bookingsChart,
    });
  } catch (error) {
    console.error('Analytics error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
