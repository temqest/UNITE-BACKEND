const { BloodBagRequest } = require('../../models/index');

class BloodBagRequestService {
  generateRequestID() {
    const ts = Date.now();
    const rnd = Math.random().toString(36).substr(2,6).toUpperCase();
    return `REQBAG_${ts}_${rnd}`;
  }

  async createRequest(data) {
    try {
      if (!data.Request_ID) data.Request_ID = this.generateRequestID();

      const exists = await BloodBagRequest.findOne({ Request_ID: data.Request_ID });
      if (exists) throw new Error('Request_ID already exists');

      const reqDoc = new BloodBagRequest({
        Request_ID: data.Request_ID,
        Requester_ID: data.Requester_ID,
        Requestee_ID: data.Requestee_ID,
        RequestedItems: data.RequestedItems,
        RequestedForAt: data.RequestedForAt,
        Urgency: data.Urgency || 'medium',
        Notes: data.Notes
      });

      const saved = await reqDoc.save();
      return { success: true, message: 'Blood bag request created', request: saved.toObject() };
    } catch (error) {
      throw new Error(`Failed to create blood bag request: ${error.message}`);
    }
  }

  async getRequestById(requestId) {
    try {
      const req = await BloodBagRequest.findOne({ Request_ID: requestId });
      if (!req) throw new Error('Blood bag request not found');
      return { success: true, request: req.toObject() };
    } catch (error) {
      throw new Error(`Failed to get blood bag request: ${error.message}`);
    }
  }

  async getAllRequests(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      const query = {};
      if (filters.requesterId) query.Requester_ID = filters.requesterId;
      if (filters.requesteeId) query.Requestee_ID = filters.requesteeId;
      if (filters.urgency) query.Urgency = filters.urgency;

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const docs = await BloodBagRequest.find(query).skip(skip).limit(limit).sort(sort);
      const total = await BloodBagRequest.countDocuments(query);

      return { success: true, requests: docs.map(d => d.toObject()), pagination: { page, limit, total, pages: Math.ceil(total/limit) } };
    } catch (error) {
      throw new Error(`Failed to list blood bag requests: ${error.message}`);
    }
  }

  async updateRequest(requestId, updateData) {
    try {
      const req = await BloodBagRequest.findOne({ Request_ID: requestId });
      if (!req) throw new Error('Blood bag request not found');

      if (updateData.RequestedItems) req.RequestedItems = updateData.RequestedItems;
      if (updateData.Requestee_ID) req.Requestee_ID = updateData.Requestee_ID;
      if (updateData.Requester_ID) req.Requester_ID = updateData.Requester_ID;
      if (updateData.RequestedForAt) req.RequestedForAt = updateData.RequestedForAt;
      if (updateData.Urgency) req.Urgency = updateData.Urgency;
      if (updateData.Notes) req.Notes = updateData.Notes;

      await req.save();
      return { success: true, message: 'Blood bag request updated', request: req.toObject() };
    } catch (error) {
      throw new Error(`Failed to update blood bag request: ${error.message}`);
    }
  }

  async deleteRequest(requestId) {
    try {
      const req = await BloodBagRequest.findOne({ Request_ID: requestId });
      if (!req) throw new Error('Blood bag request not found');

      await BloodBagRequest.deleteOne({ Request_ID: requestId });
      return { success: true, message: 'Blood bag request deleted' };
    } catch (error) {
      throw new Error(`Failed to delete blood bag request: ${error.message}`);
    }
  }
}

module.exports = new BloodBagRequestService();
