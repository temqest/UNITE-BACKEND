const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const eventsRoutes = require('./events.routes');
const requestsRoutes = require('./requests.routes');
const utilityRoutes = require('./utility.routes');
const inventoryRoutes = require('./inventory.routes');

// Mount routes
// Auth routes are mounted under /api/auth (canonical) and also under /api
// to preserve compatibility with frontend calls that expect /api/login.
router.use('/api/auth', authRoutes);
router.use('/api', authRoutes);
router.use('/api', usersRoutes);
router.use('/api', eventsRoutes);
router.use('/api', requestsRoutes);
router.use('/api', utilityRoutes);
router.use('/api', inventoryRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

