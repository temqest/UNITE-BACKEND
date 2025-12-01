const bloodBagRequestService = require('../../services/request_services/bloodBagRequest.service');

class BloodBagRequestController {
  async createRequest(req, res) {
    try {
      const data = req.validatedData || req.body;
      const result = await bloodBagRequestService.createRequest(data);
      return res.status(201).json({ success: result.success, message: result.message, data: result.request });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to create request' });
    }
  }

  async getRequestById(req, res) {
    try {
      const { requestId } = req.params;
      const result = await bloodBagRequestService.getRequestById(requestId);
      return res.status(200).json({ success: result.success, data: result.request });
    } catch (error) {
      return res.status(404).json({ success: false, message: error.message || 'Request not found' });
    }
  }

  async getAllRequests(req, res) {
    try {
      const filters = { requesterId: req.query.requesterId, requesteeId: req.query.requesteeId, urgency: req.query.urgency };
      Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);
      const options = { page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 50, sortBy: req.query.sortBy || 'createdAt', sortOrder: req.query.sortOrder || 'desc' };

      const result = await bloodBagRequestService.getAllRequests(filters, options);
      return res.status(200).json({ success: result.success, data: result.requests, pagination: result.pagination });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to list requests' });
    }
  }

  async updateRequest(req, res) {
    try {
      const { requestId } = req.params;
      const data = req.validatedData || req.body;
      const result = await bloodBagRequestService.updateRequest(requestId, data);
      return res.status(200).json({ success: result.success, message: result.message, data: result.request });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to update request' });
    }
  }

  async deleteRequest(req, res) {
    try {
      const { requestId } = req.params;
      const result = await bloodBagRequestService.deleteRequest(requestId);
      return res.status(200).json({ success: result.success, message: result.message });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to delete request' });
    }
  }
}

module.exports = new BloodBagRequestController();
