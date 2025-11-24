const bloodBagService = require('../../services/utility_services/bloodbag.service');

class BloodBagController {
  async createBloodBag(req, res) {
    try {
      const data = req.validatedData || req.body;
      const result = await bloodBagService.createBloodBag(data);

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: result.bloodBag
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to create blood bag' });
    }
  }

  async getBloodBagById(req, res) {
    try {
      const { bloodBagId } = req.params;
      const result = await bloodBagService.getBloodBagById(bloodBagId);

      return res.status(200).json({ success: result.success, data: result.bloodBag });
    } catch (error) {
      return res.status(404).json({ success: false, message: error.message || 'Blood bag not found' });
    }
  }

  async getAllBloodBags(req, res) {
    try {
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const filters = {
        bloodType: req.query.bloodType
      };

      Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

      const result = await bloodBagService.getAllBloodBags(filters, options);

      return res.status(200).json({
        success: result.success,
        data: result.bloodBags,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch blood bags' });
    }
  }

  async updateBloodBag(req, res) {
    try {
      const { bloodBagId } = req.params;
      const data = req.validatedData || req.body;

      const result = await bloodBagService.updateBloodBag(bloodBagId, data);

      return res.status(200).json({ success: result.success, message: result.message, data: result.bloodBag });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to update blood bag' });
    }
  }

  async deleteBloodBag(req, res) {
    try {
      const { bloodBagId } = req.params;
      const result = await bloodBagService.deleteBloodBag(bloodBagId);

      return res.status(200).json({ success: result.success, message: result.message });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to delete blood bag' });
    }
  }
}

module.exports = new BloodBagController();
