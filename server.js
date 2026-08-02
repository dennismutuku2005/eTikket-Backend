const path = require('path');
const express = require('express');
const cors = require('cors');
const { initializeDatabase, getDbStatus } = require('./config/db');
const healthRoutes = require('./routes/health');
const eventsRoutes = require('./routes/events');
const ordersRoutes = require('./routes/orders');
const paymentsRoutes = require('./routes/payments');
const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const usersRoutes = require('./routes/users');
const ticketsRoutes = require('./routes/tickets');
const organizerSettingsRoutes = require('./routes/organizer-settings');
const eventTicketTypesRoutes = require('./routes/event-ticket-types');
const analyticsRoutes = require('./routes/analytics');
const uploadsRoutes = require('./routes/uploads');

const app = express();

// Allow large JSON bodies (for legacy base64 images) and larger uploads
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded event images as static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const PORT = process.env.PORT || 4010;

app.get('/health', async (_req, res) => {
  const dbStatus = getDbStatus();
  res.json({ ok: true, db: dbStatus });
});

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/organizer-settings', organizerSettingsRoutes);
app.use('/api/event-ticket-types', eventTicketTypesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/uploads', uploadsRoutes);

async function startServer() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`eTikket backend listening on port ${PORT}`);
  });
}

startServer();
