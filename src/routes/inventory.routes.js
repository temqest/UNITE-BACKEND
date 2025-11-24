const express = require('express');
const router = express.Router();

const { bloodBagController } = require('../controller/inventory_controller');
const { validateCreateBloodBag, validateUpdateBloodBag } = require('../validators/utility_validators/bloodbag.validators');

// Create blood bag
router.post('/bloodbags', validateCreateBloodBag, async (req, res, next) => {
  try {
    await bloodBagController.createBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

// Get all blood bags
router.get('/bloodbags', async (req, res, next) => {
  try {
    await bloodBagController.getAllBloodBags(req, res);
  } catch (error) {
    next(error);
  }
});

// Get blood bag by id
router.get('/bloodbags/:bloodBagId', async (req, res, next) => {
  try {
    await bloodBagController.getBloodBagById(req, res);
  } catch (error) {
    next(error);
  }
});

// Update blood bag
router.put('/bloodbags/:bloodBagId', validateUpdateBloodBag, async (req, res, next) => {
  try {
    await bloodBagController.updateBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

// Delete blood bag
router.delete('/bloodbags/:bloodBagId', async (req, res, next) => {
  try {
    await bloodBagController.deleteBloodBag(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
