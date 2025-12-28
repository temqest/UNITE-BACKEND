const locationService = require('../../services/utility_services/location.service');
const { Location } = require('../../models');

exports.getProvinces = async (req, res) => {
  try {
    const provinces = await locationService.getProvinces({ includeInactive: req.query.includeInactive === 'true' });
    return res.status(200).json({ success: true, data: provinces });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getDistrictsByProvince = async (req, res) => {
  try {
    const { provinceId } = req.params;
    const districts = await locationService.getDistrictsByProvince(provinceId, {
      includeCities: req.query.includeCities !== 'false',
      includeCombined: req.query.includeCombined !== 'false'
    });
    return res.status(200).json({ success: true, data: districts });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getMunicipalitiesByDistrict = async (req, res) => {
  try {
    const { districtId } = req.params;
    const municipalities = await locationService.getMunicipalitiesByDistrict(districtId);
    return res.status(200).json({ success: true, data: municipalities });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getAllMunicipalities = async (req, res) => {
  try {
    const municipalities = await locationService.getLocationsByType('municipality');
    return res.status(200).json({ success: true, data: municipalities });
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
    const userId = req.user && req.user.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Check permissions: authority >= 60 AND staff.create permission (or admin)
    const authorityService = require('../../services/users_services/authority.service');
    const permissionService = require('../../services/users_services/permission.service');
    
    const userAuthority = await authorityService.calculateUserAuthority(userId);
    const hasStaffCreate = await permissionService.checkPermission(userId, 'staff', 'create', {});
    const isSystemAdmin = userAuthority >= 100;
    
    // Special case: system admins have all permissions
    if (!isSystemAdmin && (userAuthority < 60 || !hasStaffCreate)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only users with authority level 60 or higher and staff.create permission can approve signup requests' 
      });
    }
    
    const result = await locationService.approveRequest(id, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    // If request is already approved, try to resend activation email
    if (error.message === 'Request has already been processed') {
      try {
        const resendResult = await locationService.resendActivationEmail(id);
        return res.status(200).json({ 
          success: true, 
          data: resendResult,
          message: 'Activation email resent successfully'
        });
      } catch (resendError) {
        return res.status(400).json({ 
          success: false, 
          message: resendError.message || 'Request already processed and unable to resend email'
        });
      }
    }
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user && req.user.id;
    
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Check permissions: authority >= 60 AND staff.create permission (or admin)
    const authorityService = require('../../services/users_services/authority.service');
    const permissionService = require('../../services/users_services/permission.service');
    
    const userAuthority = await authorityService.calculateUserAuthority(userId);
    const hasStaffCreate = await permissionService.checkPermission(userId, 'staff', 'create', {});
    const isSystemAdmin = userAuthority >= 100;
    
    // Special case: system admins have all permissions
    if (!isSystemAdmin && (userAuthority < 60 || !hasStaffCreate)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only users with authority level 60 or higher and staff.create permission can reject signup requests' 
      });
    }
    
    const result = await locationService.rejectRequest(id, userId, reason);
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

// Public endpoint to get stakeholder roles (authority <= 59)
exports.getStakeholderRoles = async (req, res) => {
  try {
    const { Role } = require('../../models');
    const roles = await Role.find({
      authority: { $lte: 59 }
    })
    .select('_id code name authority description')
    .sort({ authority: -1, name: 1 });
    
    return res.status(200).json({ success: true, data: roles });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Public endpoint to get active organizations
exports.getPublicOrganizations = async (req, res) => {
  try {
    const { Organization } = require('../../models');
    const organizations = await Organization.find({
      isActive: true
    })
    .select('_id name type code')
    .sort({ name: 1 });
    
    return res.status(200).json({ success: true, data: organizations });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};