const express = require('express');
const router = express.Router();

const { bloodBagController } = require('../controller/inventory_controller');
const { validateCreateBloodBag, validateUpdateBloodBag } = require('../validators/utility_validators/bloodbag.validators');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');

// Create blood bag (requires appropriate permission - can be customized)
router.post('/bloodbags', authenticate, validateCreateBloodBag, async (req, res, next) => {
  try {
    await bloodBagController.createBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

// Get all blood bags (requires read permission)
router.get('/bloodbags', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await bloodBagController.getAllBloodBags(req, res);
  } catch (error) {
    next(error);
  }
});

// Get blood bag by id (requires read permission)
router.get('/bloodbags/:bloodBagId', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await bloodBagController.getBloodBagById(req, res);
  } catch (error) {
    next(error);
  }
});

// Update blood bag (requires update permission)
router.put('/bloodbags/:bloodBagId', authenticate, requirePermission('request', 'update'), validateUpdateBloodBag, async (req, res, next) => {
  try {
    await bloodBagController.updateBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

// Delete blood bag (requires delete permission)
router.delete('/bloodbags/:bloodBagId', authenticate, requirePermission('request', 'delete'), async (req, res, next) => {
  try {
    await bloodBagController.deleteBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
