const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const eventsRoutes = require('./events.routes');
const requestsRoutes = require('./requests.routes');
const utilityRoutes = require('./utility.routes');
const inventoryRoutes = require('./inventory.routes');
const chatRoutes = require('./chat.routes');
const filesRoutes = require('./files.routes');
const locationsRoutes = require('./locations.routes'); // New flexible location system routes
const organizationsRoutes = require('./organizations.routes'); // Organization management routes
const coverageAreasRoutes = require('./coverageAreas.routes'); // Coverage area management routes
const rbacRoutes = require('./rbac.routes'); // RBAC management routes
const pagesRoutes = require('./pages.routes'); // Page and feature access routes

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
router.use('/api', locationsRoutes); // New flexible location routes
router.use('/api', organizationsRoutes); // Organization management routes
router.use('/api', coverageAreasRoutes); // Coverage area management routes
router.use('/api', rbacRoutes); // RBAC management routes
router.use('/api', pagesRoutes); // Page and feature access routes
router.use('/api/chat', chatRoutes);
router.use('/api/files', filesRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

