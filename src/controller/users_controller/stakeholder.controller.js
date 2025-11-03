const stakeholderService = require('../../services/users_services/stakeholder.service');
const { signToken } = require('../../utils/jwt');

class StakeholderController {
  async register(req, res) {
    try {
      const result = await stakeholderService.register(req.body);
      return res.status(201).json({ success: true, data: result.stakeholder });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }
      const result = await stakeholderService.authenticate(email, password);
      const token = signToken({ id: result.stakeholder.Stakeholder_ID, role: 'Stakeholder', district_id: result.stakeholder.District_ID });
      return res.status(200).json({ success: true, data: result.stakeholder, token });
    } catch (error) {
      return res.status(401).json({ success: false, message: error.message });
    }
  }
}

module.exports = new StakeholderController();


