// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session); // Connector for DB sessions
const helmet = require('helmet'); // Security headers
const morgan = require('morgan'); // Request logging
const db = require('./db');

const app = express();

// 1. Security & Logging Middleware
// Helmet sets various HTTP headers to help protect your app
app.use(
  helmet({
    contentSecurityPolicy: false, // Set to true later if you want to restrict script sources
  })
);
app.use(morgan('dev')); // Logs requests to console (e.g., "GET /student/login 200")

// 2. Built-in Body Parsing (Replaces body-parser)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 3. Static Files with Caching
app.use(
  '/public',
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static assets for 1 day to reduce server load
    etag: true,
  })
);

// 4. Persistent Session Store
// This saves session data to your MySQL database instead of RAM
const sessionStore = new MySQLStore({}, db); // Pass the DB pool

app.use(
  session({
    key: 'session_cookie_name', // Use a generic name for security
    secret: process.env.SESSION_SECRET,
    store: sessionStore, // Sessions are now saved in DB!
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
      httpOnly: true, // Prevents JavaScript from reading the cookie (XSS protection)
      maxAge: 1000 * 60 * 60 * 24, // Cookie valid for 1 day
    },
  })
);

// Setup EJS
app.set('view engine', 'ejs');

// Routes
app.use('/student', require('./routes/student'));
app.use('/admin', require('./routes/admin'));

// Home route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, './public/html/index.html'));
});

// 5. Global Error Handling
// Catches errors from anywhere in the app preventing crashes
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong! Please try again later.');
});

// 404 Handler (Redirect to home)
app.use((req, res) => {
  res.redirect('/');
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
