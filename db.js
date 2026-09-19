// db.js
const mysql = require('mysql2');
require('dotenv').config();

// Configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 12,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

// SSL config for Production (Aiven/AWS/Azure usually need this)
if (process.env.NODE_ENV === 'production') {
  dbConfig.ssl = {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA,
  };
}

// Create a Pool instead of a single Connection
const pool = mysql.createPool(dbConfig);

// Event listeners for debugging
pool.on('connection', (connection) => {
  console.log('DB Connection established');
});

pool.on('error', (err) => {
  console.error('Unexpected DB error', err);
});

module.exports = pool;
