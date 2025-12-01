const { BloodBag } = require('../../models/index');

class BloodBagService {
  generateBloodBagID() {
    const ts = Date.now();
    const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `BAG_${ts}_${rand}`;
  }

  async createBloodBag(data) {
    try {
      if (!data.BloodBag_ID) data.BloodBag_ID = this.generateBloodBagID();

      // ensure uniqueness
      const existing = await BloodBag.findOne({ BloodBag_ID: data.BloodBag_ID });
      if (existing) throw new Error('BloodBag_ID already exists');

      const bloodBag = new BloodBag({
        BloodBag_ID: data.BloodBag_ID,
        BloodType: data.BloodType
      });

      const saved = await bloodBag.save();

      return { success: true, message: 'Blood bag created', bloodBag: saved.toObject() };
    } catch (error) {
      throw new Error(`Failed to create blood bag: ${error.message}`);
    }
  }

  async getBloodBagById(bagId) {
    try {
      const bag = await BloodBag.findOne({ BloodBag_ID: bagId });
      if (!bag) throw new Error('Blood bag not found');
      return { success: true, bloodBag: bag.toObject() };
    } catch (error) {
      throw new Error(`Failed to get blood bag: ${error.message}`);
    }
  }

  async getAllBloodBags(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = options;
      const skip = (page - 1) * limit;

      const query = {};
      if (filters.bloodType) query.BloodType = filters.bloodType;

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const docs = await BloodBag.find(query).skip(skip).limit(limit).sort(sort);
      const total = await BloodBag.countDocuments(query);

      return {
        success: true,
        bloodBags: docs.map(d => d.toObject()),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      };
    } catch (error) {
      throw new Error(`Failed to list blood bags: ${error.message}`);
    }
  }

  async updateBloodBag(bagId, updateData) {
    try {
      const bag = await BloodBag.findOne({ BloodBag_ID: bagId });
      if (!bag) throw new Error('Blood bag not found');

      if (updateData.BloodType) bag.BloodType = updateData.BloodType;

      await bag.save();

      return { success: true, message: 'Blood bag updated', bloodBag: bag.toObject() };
    } catch (error) {
      throw new Error(`Failed to update blood bag: ${error.message}`);
    }
  }

  async deleteBloodBag(bagId) {
    try {
      const bag = await BloodBag.findOne({ BloodBag_ID: bagId });
      if (!bag) throw new Error('Blood bag not found');

      await BloodBag.deleteOne({ BloodBag_ID: bagId });

      return { success: true, message: 'Blood bag deleted' };
    } catch (error) {
      throw new Error(`Failed to delete blood bag: ${error.message}`);
    }
  }
}

module.exports = new BloodBagService();
