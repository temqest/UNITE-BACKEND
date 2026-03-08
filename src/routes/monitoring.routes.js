const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireAdminAuthority = require('../middleware/requireAdminAuthority');
const monitoringController = require('../controller/utility_controller/monitoring.controller');

router.use('/monitoring', authenticate, requireAdminAuthority());

router.get('/monitoring/health', monitoringController.getHealth);
router.get('/monitoring/metrics', monitoringController.getMetrics);
router.get('/monitoring/activity', monitoringController.getActivity);
router.get('/monitoring/ping', monitoringController.ping);
router.all('/monitoring/echo', monitoringController.echo);

module.exports = router;
