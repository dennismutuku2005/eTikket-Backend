const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'etikket',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

let dbReady = false;
let dbMessage = 'Initializing...';
let dbError = null;

async function initializeDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    dbReady = true;
    dbMessage = 'MySQL connected';
    dbError = null;
    console.log('✅ Connected to MySQL database successfully.');

    // Idempotent migrations — safe to run on every startup
    try {
      await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url VARCHAR(512) DEFAULT NULL`);
      await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id INT DEFAULT NULL`);
      console.log('✅ Events table schema verified.');
    } catch (migrationErr) {
      // MySQL < 8 may not support IF NOT EXISTS on ALTER — attempt gracefully
      console.warn('⚠️  Schema migration warning:', migrationErr.message);
    }

    return true;
  } catch (error) {
    dbReady = false;
    dbMessage = 'MySQL connection failed';
    dbError = error;
    console.error('❌ Failed to connect to MySQL database:', error.message);
    return false;
  }
}

function isDbReady() {
  return dbReady;
}

function getDbStatus() {
  return {
    ready: dbReady,
    message: dbMessage,
    error: dbError ? dbError.message : null,
  };
}

module.exports = {
  pool,
  initializeDatabase,
  isDbReady,
  getDbStatus,
};

