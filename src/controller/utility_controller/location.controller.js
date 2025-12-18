const locationService = require('../../services/utility_services/location.service');
const { Location } = require('../../models');

// Legacy methods (using old Province/District/Municipality models)
exports.getProvinces = async (req, res) => {
  try {
    // Try new flexible location system first
    try {
      const provinces = await locationService.getProvinces({ includeInactive: req.query.includeInactive === 'true' });
      return res.status(200).json({ success: true, data: provinces });
    } catch (newError) {
      // Fallback to legacy Province model
      const { Province } = require('../../models');
      const provinces = await Province.find().sort({ name: 1 });
      return res.status(200).json({ success: true, data: provinces });
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getDistrictsByProvince = async (req, res) => {
  try {
    const { provinceId } = req.params;
    // Try new flexible location system first
    try {
      const districts = await locationService.getDistrictsByProvince(provinceId, {
        includeCities: req.query.includeCities !== 'false',
        includeCombined: req.query.includeCombined !== 'false'
      });
      return res.status(200).json({ success: true, data: districts });
    } catch (newError) {
      // Fallback to legacy District model
      const { District } = require('../../models');
      const districts = await District.find({ province: provinceId }).sort({ name: 1 });
      return res.status(200).json({ success: true, data: districts });
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMunicipalitiesByDistrict = async (req, res) => {
  try {
    const { districtId } = req.params;
    // Try new flexible location system first
    try {
      const municipalities = await locationService.getMunicipalitiesByDistrict(districtId);
      return res.status(200).json({ success: true, data: municipalities });
    } catch (newError) {
      // Fallback to legacy Municipality model
      const { Municipality } = require('../../models');
      const municipalities = await Municipality.find({ district: districtId }).sort({ name: 1 });
      return res.status(200).json({ success: true, data: municipalities });
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAllMunicipalities = async (req, res) => {
  try {
    // Try new flexible location system first
    try {
      const municipalities = await locationService.getLocationsByType('municipality');
      return res.status(200).json({ success: true, data: municipalities });
    } catch (newError) {
      // Fallback to legacy Municipality model
      const { Municipality } = require('../../models');
      const municipalities = await Municipality.find().sort({ name: 1 });
      return res.status(200).json({ success: true, data: municipalities });
    }
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.createSignUpRequest = async (req, res) => {
  try {
    const payload = req.body;
    const result = await locationService.sendVerificationEmail(payload);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await locationService.approveRequest(id, req.user && req.user.id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await locationService.rejectRequest(id, req.user && req.user.id, reason);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getSignUpRequests = async (req, res) => {
  try {
    const user = req.user;
    const requests = await locationService.getSignUpRequests(user);
    return res.status(200).json({ success: true, data: requests });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const result = await locationService.verifyEmailToken(token);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
