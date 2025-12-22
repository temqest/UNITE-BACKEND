const { Province, District, Municipality, SignUpRequest, Location, UserLocation, User } = require('../../models');
const permissionService = require('../users_services/permission.service');
const crypto = require('crypto');
const { signToken, verifyToken } = require('../../utils/jwt');
const emailService = require('./email.service');
const bcrypt = require('bcrypt');

class LocationService {
  async getProvinces() {
    return Province.find().sort({ name: 1 });
  }

  async getDistrictsByProvince(provinceId) {
    return District.find({ province: provinceId }).sort({ name: 1 });
  }

  async getMunicipalitiesByDistrict(districtId) {
    return Municipality.find({ district: districtId }).sort({ name: 1 });
  }

  async getAllMunicipalities() {
    return Municipality.find().sort({ name: 1 });
  }

  async sendVerificationEmail(data) {
    // Validate hierarchy: ensure province -> district -> municipality consistency
    const province = await Province.findById(data.province);
    if (!province) throw new Error('Province not found');

    const district = await District.findOne({ _id: data.district, province: province._id });
    if (!district) throw new Error('District not found or does not belong to province');

    const municipality = await Municipality.findOne({ _id: data.municipality, district: district._id, province: province._id });
    if (!municipality) throw new Error('Municipality not found or does not belong to district/province');

    // find coordinator for the district (first match) - using User model with coordinator role
    const { UserRole, Role, UserLocation } = require('../../models');
    const coordinatorRole = await Role.findOne({ code: 'coordinator' });
    let coordinator = null;
    if (coordinatorRole && district) {
      // Find users assigned to this district location
      const locationUsers = await UserLocation.findLocationUsers(district._id);
      
      // Filter to only coordinators
      for (const locationUser of locationUsers) {
        if (locationUser.userId) {
          const userRoles = await UserRole.find({ 
            userId: locationUser.userId._id,
            roleId: coordinatorRole._id,
            isActive: true
          });
          if (userRoles.length > 0) {
            coordinator = locationUser.userId;
            break;
          }
        }
      }
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create signup request with verification code
    const req = new SignUpRequest({
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      password: data.password,
      organization: data.organization,
      province: province._id,
      district: district._id,
      municipality: municipality._id,
      assignedCoordinator: coordinator?._id || null,
      verificationCode: verificationCode,
      emailVerified: false
    });

    await req.save();

    // Send verification email with the code
    await emailService.sendVerificationCode(data.email, verificationCode);

    return { message: 'Verification code sent to your email' };
  }

  async approveRequest(requestId, approverId) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    if (req.status !== 'pending') throw new Error('Request has already been processed');

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: req.email.toLowerCase() });
    if (existingUser) throw new Error('A user with this email already exists');

    req.status = 'approved';
    req.decisionAt = new Date();
    await req.save();

    // Hash the password before creating user account
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(req.password, saltRounds);

    // Create user account with stakeholder role
    const user = new User({
      email: req.email.toLowerCase(),
      firstName: req.firstName,
      middleName: req.middleName || null,
      lastName: req.lastName,
      phoneNumber: req.phoneNumber || null,
      password: hashedPassword,
      organizationType: req.organizationType || null,
      organizationInstitution: req.organization || null,
      isActive: true
    });
    await user.save();

    // Assign stakeholder role
    const stakeholderRole = await permissionService.getRoleByCode('stakeholder');
    if (stakeholderRole) {
      await permissionService.assignRole(user._id, stakeholderRole._id, [], null, null);
    }

    // Assign locations if provided
    if (req.district) {
      await this.assignUserToLocation(user._id, req.district, 'exact', { isPrimary: true });
    }
    if (req.province) {
      await this.assignUserToLocation(user._id, req.province, 'hierarchical', { isPrimary: false });
    }
    if (req.municipality) {
      await this.assignUserToLocation(user._id, req.municipality, 'exact', { isPrimary: false });
    }

    // Send acceptance email (with error handling to prevent blocking)
    const acceptanceMessage = `
  Dear ${req.firstName} ${req.lastName},

  Congratulations! Your stakeholder registration request for the UNITE Blood Bank System has been approved.

  Your account has been created with the following details:
  - Email: ${req.email}

  You can now log in to the system using your registered email and password.

  If you have any questions, please contact your assigned coordinator.

  Best regards,
  UNITE Blood Bank Team
    `.trim();

    try {
      await emailService.sendEmail(req.email, 'UNITE - Registration Approved', acceptanceMessage, `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Registration Approved</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Dear ${req.firstName} ${req.lastName},</h3>
    <p style="color: #28a745; font-weight: bold;">Congratulations! Your stakeholder registration request for the UNITE Blood Bank System has been approved.</p>
    <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0; font-weight: bold;">Your account has been created with the following details:</p>
      <ul style="margin: 10px 0 0 20px;">
        <li><strong>Email:</strong> ${req.email}</li>
      </ul>
    </div>
    <p>You can now log in to the system using your registered email and password.</p>
    <p>If you have any questions, please contact your assigned coordinator.</p>
    
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`);
      console.log(`Approval email sent successfully to ${req.email}`);
    } catch (emailError) {
      // Log error but don't fail the approval process
      console.error(`Failed to send approval email to ${req.email}:`, emailError.message);
    }

    // Create notification for the new stakeholder
    const { Notification } = require('../../models');
    const stakeholderName = `${req.firstName} ${req.lastName}`;
    await Notification.createSignupRequestApprovedNotification(
      user._id.toString(),
      req._id.toString(),
      stakeholderName
    );

    return req;
  }

  async rejectRequest(requestId, approverId, reason) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    if (req.status !== 'pending') throw new Error('Request has already been processed');

    // Send rejection email before deleting (with error handling)
    const rejectionMessage = `
  Dear ${req.firstName} ${req.lastName},

  We regret to inform you that your stakeholder registration request for the UNITE Blood Bank System has been rejected.

  Reason: ${reason || 'Not specified'}

  If you have any questions, please contact your assigned coordinator.

  Best regards,
  UNITE Blood Bank Team
    `.trim();

    try {
      await emailService.sendEmail(req.email, 'UNITE - Registration Update', rejectionMessage, `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Registration Update</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Dear ${req.firstName} ${req.lastName},</h3>
    <p style="color: #dc3545;">We regret to inform you that your stakeholder registration request for the UNITE Blood Bank System has been rejected.</p>
    <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #dc3545;">
      <p style="margin: 0; font-weight: bold;">Reason:</p>
      <p style="margin: 10px 0 0 0;">${reason || 'Not specified'}</p>
    </div>
    <p>If you have any questions, please contact your assigned coordinator.</p>
    
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`);
      console.log(`Rejection email sent successfully to ${req.email}`);
    } catch (emailError) {
      // Log error but don't fail the rejection process
      console.error(`Failed to send rejection email to ${req.email}:`, emailError.message);
    }

    // Create notification for the rejected request (using email as recipient ID)
    const { Notification } = require('../../models');
    await Notification.createSignupRequestRejectedNotification(
      req.email,
      req._id.toString(),
      reason
    );

    // Delete the request instead of marking as rejected
    await SignUpRequest.findByIdAndDelete(requestId);

    return { message: 'Request rejected and deleted successfully' };
  }

  async getSignUpRequests(user) {
    // Check permissions instead of roles
    const permissionService = require('../users_services/permission.service');
    const hasFullAccess = await permissionService.checkPermission(user.id, '*', '*', {});
    const canManageLocations = await permissionService.checkPermission(user.id, 'location', 'read', {});
    
    if (user.isSystemAdmin || hasFullAccess) {
      return SignUpRequest.find({ status: 'pending', emailVerified: true }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
    } else if (canManageLocations) {
      // Find coordinator user to get their locations
      const coordinatorUser = await User.findById(user.id);
      if (!coordinatorUser) return [];
      const locationService = require('./location.service');
      const locations = await locationService.getUserLocations(coordinatorUser._id);
      const locationIds = locations.map(loc => loc.locationId);
      // Show all pending requests in the coordinator's locations
      return SignUpRequest.find({ 
        $or: [
          { district: { $in: locationIds } },
          { province: { $in: locationIds } },
          { municipality: { $in: locationIds } }
        ],
        status: 'pending', 
        emailVerified: true 
      }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
    }
    return [];
  }

  async verifyEmailToken(token) {
    // Check if token is a 6-digit code
    if (/^\d{6}$/.test(token)) {
      const req = await SignUpRequest.findOne({ verificationCode: token, emailVerified: false });
      if (!req) throw new Error('Invalid verification code');
      req.emailVerified = true;
      await req.save();

      // Create notification for coordinator about new signup request
      if (req.assignedCoordinator) {
        const { Notification } = require('../../models');
        const requesterName = `${req.firstName} ${req.middleName || ''} ${req.lastName}`.trim();
        await Notification.createNewSignupRequestNotification(
          req.assignedCoordinator,
          req._id.toString(),
          requesterName,
          req.email
        );
      }

      return req;
    }

    try {
      // Try to decode as JWT first
      const decoded = verifyToken(token);
      
      // If successful, this is a new signup request - create it
      const req = new SignUpRequest({
        firstName: decoded.firstName,
        middleName: decoded.middleName,
        lastName: decoded.lastName,
        email: decoded.email,
        phoneNumber: decoded.phoneNumber,
        password: decoded.password,
        organization: decoded.organization,
        province: decoded.province,
        district: decoded.district,
        municipality: decoded.municipality,
        assignedCoordinator: decoded.assignedCoordinator,
        emailVerificationToken: token,
        emailVerified: true
      });

      await req.save();

      // Create notification for coordinator about new signup request
      if (decoded.assignedCoordinator) {
        const { Notification } = require('../../models');
        const requesterName = `${decoded.firstName} ${decoded.middleName || ''} ${decoded.lastName}`.trim();
        await Notification.createNewSignupRequestNotification(
          decoded.assignedCoordinator,
          req._id.toString(),
          requesterName,
          decoded.email
        );
      }

      return req;
    } catch (jwtError) {
      // If JWT verification fails, try the old method (for backward compatibility)
      const req = await SignUpRequest.findOne({ emailVerificationToken: token });
      if (!req) throw new Error('Invalid token');
      req.emailVerified = true;
      await req.save();
      return req;
    }
  }

  // ============================================
  // NEW FLEXIBLE LOCATION SYSTEM METHODS
  // ============================================

  /**
   * Create a location with flexible hierarchy
   * @param {Object} data - Location data
   * @param {string} data.name - Location name (required)
   * @param {string} data.type - Location type: 'province', 'district', 'city', 'municipality', 'barangay', 'custom'
   * @param {ObjectId} data.parentId - Optional parent location ID
   * @param {string} data.code - Optional unique code (auto-generated from name if not provided)
   * @param {string} data.administrativeCode - Optional official administrative code
   * @param {Object} data.metadata - Optional metadata (isCity, isCombined, operationalGroup, custom)
   * @returns {Promise<Object>} Created Location document
   */
  async createLocation(data) {
    try {
      const { name, type, parentId, code, administrativeCode, metadata = {} } = data;

      if (!name || !type) {
        throw new Error('Name and type are required');
      }

      // Validate type
      const validTypes = ['province', 'district', 'city', 'municipality', 'barangay', 'custom'];
      if (!validTypes.includes(type)) {
        throw new Error(`Invalid location type. Must be one of: ${validTypes.join(', ')}`);
      }

      // If parent is provided, validate it exists
      let parent = null;
      if (parentId) {
        parent = await Location.findById(parentId);
        if (!parent) {
          throw new Error('Parent location not found');
        }
        if (!parent.isActive) {
          throw new Error('Parent location is not active');
        }
      }

      // Check for duplicate code if provided
      if (code) {
        const existing = await Location.findOne({ code: code.toLowerCase() });
        if (existing) {
          throw new Error('Location with this code already exists');
        }
      }

      // Create location
      const location = new Location({
        name,
        type,
        parent: parentId || null,
        code: code || null,
        administrativeCode: administrativeCode || null,
        metadata: {
          isCity: metadata.isCity || false,
          isCombined: metadata.isCombined || false,
          operationalGroup: metadata.operationalGroup || null,
          custom: metadata.custom || {}
        },
        isActive: true
      });

      await location.save();
      return location;
    } catch (error) {
      throw new Error(`Failed to create location: ${error.message}`);
    }
  }

  /**
   * Get hierarchical tree from root location
   * @param {ObjectId} rootId - Root location ID (optional, if not provided, returns all provinces)
   * @param {Object} options - Options for tree building
   * @param {boolean} options.includeInactive - Include inactive locations (default: false)
   * @param {number} options.maxDepth - Maximum depth to traverse (default: unlimited)
   * @returns {Promise<Object>} Tree structure with children populated
   */
  async getLocationTree(rootId = null, options = {}) {
    try {
      const { includeInactive = false, maxDepth = null } = options;

      let root;
      if (rootId) {
        root = await Location.findById(rootId);
        if (!root) {
          throw new Error('Root location not found');
        }
      } else {
        // Get all provinces if no root specified
        const query = { type: 'province', isActive: true };
        if (includeInactive) {
          delete query.isActive;
        }
        const provinces = await Location.find(query).sort({ name: 1 });
        return await Promise.all(
          provinces.map(province => this._buildLocationTree(province, includeInactive, maxDepth, 0))
        );
      }

      return await this._buildLocationTree(root, includeInactive, maxDepth, 0);
    } catch (error) {
      throw new Error(`Failed to get location tree: ${error.message}`);
    }
  }

  /**
   * Internal helper to build location tree recursively
   * @private
   */
  async _buildLocationTree(location, includeInactive, maxDepth, currentDepth) {
    if (maxDepth !== null && currentDepth >= maxDepth) {
      return location.toObject();
    }

    const query = { parent: location._id };
    if (!includeInactive) {
      query.isActive = true;
    }

    const children = await Location.find(query).sort({ name: 1 });
    const locationObj = location.toObject();
    locationObj.children = await Promise.all(
      children.map(child => this._buildLocationTree(child, includeInactive, maxDepth, currentDepth + 1))
    );

    return locationObj;
  }

  /**
   * Get all ancestor locations (parents up to root)
   * @param {ObjectId} locationId - Location ID
   * @param {Object} options - Options
   * @param {boolean} options.includeSelf - Include the location itself in results (default: false)
   * @param {boolean} options.includeInactive - Include inactive locations (default: false)
   * @returns {Promise<Array>} Array of ancestor locations (ordered from immediate parent to root)
   */
  async getLocationAncestors(locationId, options = {}) {
    try {
      const { includeSelf = false, includeInactive = false } = options;

      const location = await Location.findById(locationId);
      if (!location) {
        throw new Error('Location not found');
      }

      const ancestors = [];
      if (includeSelf && (includeInactive || location.isActive)) {
        ancestors.push(location);
      }

      let current = location;
      while (current.parent) {
        const parent = await Location.findById(current.parent);
        if (!parent) break;

        if (includeInactive || parent.isActive) {
          ancestors.push(parent);
        }

        current = parent;
      }

      return ancestors;
    } catch (error) {
      throw new Error(`Failed to get location ancestors: ${error.message}`);
    }
  }

  /**
   * Get all descendant locations (children and all nested children)
   * @param {ObjectId} locationId - Location ID
   * @param {Object} options - Options
   * @param {boolean} options.includeSelf - Include the location itself in results (default: false)
   * @param {boolean} options.includeInactive - Include inactive locations (default: false)
   * @param {boolean} options.includeCitiesAsDistricts - Include cities with isCity flag as districts (default: true)
   * @returns {Promise<Array>} Array of descendant locations
   */
  async getLocationDescendants(locationId, options = {}) {
    try {
      const { includeSelf = false, includeInactive = false, includeCitiesAsDistricts = true } = options;

      const location = await Location.findById(locationId);
      if (!location) {
        throw new Error('Location not found');
      }

      const descendants = [];
      if (includeSelf && (includeInactive || location.isActive)) {
        descendants.push(location);
      }

      // Use the model's static method for recursive traversal
      const children = await Location.findDescendants(locationId);
      
      // Filter by active status if needed
      const filtered = includeInactive 
        ? children 
        : children.filter(loc => loc.isActive);

      descendants.push(...filtered);

      return descendants;
    } catch (error) {
      throw new Error(`Failed to get location descendants: ${error.message}`);
    }
  }

  /**
   * Assign user to location with coverage scope
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} locationId - Location ID
   * @param {string} scope - Coverage scope: 'exact', 'descendants', 'ancestors', 'all'
   * @param {Object} options - Additional options
   * @param {boolean} options.isPrimary - Set as primary location (default: false)
   * @param {ObjectId} options.assignedBy - User ID who assigned this location
   * @param {Date} options.expiresAt - Optional expiration date
   * @returns {Promise<Object>} Created or updated UserLocation document
   */
  async assignUserToLocation(userId, locationId, scope = 'exact', options = {}) {
    try {
      const { isPrimary = false, assignedBy = null, expiresAt = null } = options;

      // Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate location exists
      const location = await Location.findById(locationId);
      if (!location) {
        throw new Error('Location not found');
      }
      if (!location.isActive) {
        throw new Error('Location is not active');
      }

      // Validate scope
      const validScopes = ['exact', 'descendants', 'ancestors', 'all'];
      if (!validScopes.includes(scope)) {
        throw new Error(`Invalid scope. Must be one of: ${validScopes.join(', ')}`);
      }

      // Use UserLocation static method for assignment
      return await UserLocation.assignLocation(userId, locationId, {
        scope,
        isPrimary,
        assignedBy,
        expiresAt
      });
    } catch (error) {
      throw new Error(`Failed to assign user to location: ${error.message}`);
    }
  }

  /**
   * Get all locations a user has access to based on their assignments
   * @param {ObjectId} userId - User ID
   * @param {Object} options - Options
   * @param {boolean} options.includeDescendants - Include descendant locations based on scope (default: true)
   * @param {boolean} options.includeInactive - Include inactive locations (default: false)
   * @param {boolean} options.onlyActiveAssignments - Only include active, non-expired assignments (default: true)
   * @returns {Promise<Array>} Array of Location documents user has access to
   */
  async getUserLocations(userId, options = {}) {
    try {
      const { 
        includeDescendants = true, 
        includeInactive = false,
        onlyActiveAssignments = true 
      } = options;

      // Get all user location assignments
      const query = { userId };
      if (onlyActiveAssignments) {
        query.isActive = true;
        query.$or = [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ];
      }

      const assignments = await UserLocation.find(query).populate('locationId');

      if (assignments.length === 0) {
        return [];
      }

      const locationIds = new Set();
      const locationMap = new Map();

      // Process each assignment based on scope
      for (const assignment of assignments) {
        const location = assignment.locationId;
        if (!location) continue;

        // Add the assigned location
        if (includeInactive || location.isActive) {
          locationIds.add(location._id.toString());
          locationMap.set(location._id.toString(), location);
        }

        if (includeDescendants) {
          // Handle different scopes
          if (assignment.scope === 'descendants' || assignment.scope === 'all') {
            const descendants = await this.getLocationDescendants(location._id, {
              includeSelf: false,
              includeInactive
            });
            descendants.forEach(loc => {
              locationIds.add(loc._id.toString());
              locationMap.set(loc._id.toString(), loc);
            });
          }

          if (assignment.scope === 'ancestors' || assignment.scope === 'all') {
            const ancestors = await this.getLocationAncestors(location._id, {
              includeSelf: false,
              includeInactive
            });
            ancestors.forEach(loc => {
              locationIds.add(loc._id.toString());
              locationMap.set(loc._id.toString(), loc);
            });
          }
        }
      }

      // Return unique locations
      return Array.from(locationIds).map(id => locationMap.get(id));
    } catch (error) {
      throw new Error(`Failed to get user locations: ${error.message}`);
    }
  }

  /**
   * Check if user has access to a specific location
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} locationId - Location ID to check access for
   * @param {Object} options - Options
   * @param {boolean} options.includeDescendants - Check if user has access via descendant scope (default: true)
   * @param {boolean} options.includeAncestors - Check if user has access via ancestor scope (default: true)
   * @returns {Promise<boolean>} True if user has access to the location
   */
  async checkLocationAccess(userId, locationId, options = {}) {
    try {
      // Return false if locationId is not provided or invalid
      // Check for null, undefined, empty string, empty object, or invalid ObjectId
      if (!locationId || 
          locationId === null || 
          locationId === undefined ||
          (typeof locationId === 'object' && Object.keys(locationId).length === 0) ||
          (typeof locationId === 'string' && locationId.trim() === '')) {
        return false;
      }

      // Validate it's a valid ObjectId format (24 hex characters)
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(locationId)) {
        return false;
      }

      const { includeDescendants = true, includeAncestors = true } = options;

      // Validate location exists
      const location = await Location.findById(locationId);
      if (!location) {
        return false;
      }

      // Get all user location assignments
      const assignments = await UserLocation.find({
        userId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('locationId');

      if (assignments.length === 0) {
        return false;
      }

      // Check each assignment
      for (const assignment of assignments) {
        const assignedLocation = assignment.locationId;
        if (!assignedLocation) continue;

        // Direct match
        if (assignedLocation._id.toString() === locationId.toString()) {
          return true;
        }

        // Check scope-based access
        if (assignment.scope === 'exact') {
          continue; // Already checked above
        }

        if (assignment.scope === 'descendants' || assignment.scope === 'all') {
          if (includeDescendants) {
            const descendants = await this.getLocationDescendants(assignedLocation._id, {
              includeSelf: false,
              includeInactive: false
            });
            if (descendants.some(loc => loc._id.toString() === locationId.toString())) {
              return true;
            }
          }
        }

        if (assignment.scope === 'ancestors' || assignment.scope === 'all') {
          if (includeAncestors) {
            const ancestors = await this.getLocationAncestors(assignedLocation._id, {
              includeSelf: false,
              includeInactive: false
            });
            if (ancestors.some(loc => loc._id.toString() === locationId.toString())) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking location access:', error);
      return false;
    }
  }

  /**
   * Get districts for a province (including cities acting as districts)
   * Handles special case: cities with metadata.isCity = true are treated as districts
   * @param {ObjectId} provinceId - Province location ID
   * @param {Object} options - Options
   * @param {boolean} options.includeCities - Include cities acting as districts (default: true)
   * @param {boolean} options.includeCombined - Include combined districts (default: true)
   * @returns {Promise<Array>} Array of district/city locations
   */
  async getDistrictsByProvince(provinceId, options = {}) {
    try {
      const { includeCities = true, includeCombined = true } = options;

      const province = await Location.findById(provinceId);
      if (!province) {
        throw new Error('Province not found');
      }
      if (province.type !== 'province') {
        throw new Error('Location is not a province');
      }

      // Get direct children that are districts
      const query = {
        parent: provinceId,
        isActive: true
      };

      const districts = await Location.find({
        ...query,
        type: 'district'
      }).sort({ name: 1 });

      let results = [...districts];

      // Include cities acting as districts
      if (includeCities) {
        const cities = await Location.find({
          ...query,
          type: 'city',
          'metadata.isCity': true
        }).sort({ name: 1 });
        results.push(...cities);
      }

      // Include combined districts
      if (includeCombined) {
        const combined = await Location.find({
          ...query,
          'metadata.isCombined': true
        }).sort({ name: 1 });
        results.push(...combined);
      }

      return results.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new Error(`Failed to get districts by province: ${error.message}`);
    }
  }

  /**
   * Get municipalities for a district (or city acting as district)
   * Handles special case: cities with metadata.isCity = true can have municipalities
   * @param {ObjectId} districtId - District or city location ID
   * @param {Object} options - Options
   * @returns {Promise<Array>} Array of municipality locations
   */
  async getMunicipalitiesByDistrict(districtId, options = {}) {
    try {
      const district = await Location.findById(districtId);
      if (!district) {
        throw new Error('District not found');
      }

      // Check if it's a district or city acting as district
      const isDistrict = district.type === 'district' || 
                        (district.type === 'city' && district.metadata?.isCity === true);

      if (!isDistrict) {
        throw new Error('Location is not a district or city acting as district');
      }

      // Get municipalities that are children of this district
      const municipalities = await Location.find({
        parent: districtId,
        type: 'municipality',
        isActive: true
      }).sort({ name: 1 });

      return municipalities;
    } catch (error) {
      throw new Error(`Failed to get municipalities by district: ${error.message}`);
    }
  }

  /**
   * Get all provinces (root locations of type 'province')
   * @param {Object} options - Options
   * @param {boolean} options.includeInactive - Include inactive provinces (default: false)
   * @returns {Promise<Array>} Array of province locations
   */
  async getProvinces(options = {}) {
    try {
      const { includeInactive = false } = options;

      const query = { type: 'province' };
      if (!includeInactive) {
        query.isActive = true;
      }

      return await Location.find(query).sort({ name: 1 });
    } catch (error) {
      throw new Error(`Failed to get provinces: ${error.message}`);
    }
  }

  /**
   * Get locations by type (with special handling for cities as districts)
   * @param {String} type - Location type ('province', 'district', 'city', 'municipality', etc.)
   * @param {ObjectId} parentId - Optional parent location ID
   * @returns {Promise<Array>} Array of locations
   */
  async getLocationsByType(type, parentId = null) {
    const query = { type, isActive: true };
    
    // Special handling: if type is 'district', also include cities acting as districts
    if (type === 'district') {
      query.$or = [
        { type: 'district' },
        { type: 'city', 'metadata.isCity': true }
      ];
    }
    
    if (parentId) {
      query.parent = parentId;
    }

    return await Location.find(query).sort({ name: 1 });
  }

  /**
   * Find location by code
   * @param {String} code - Location code
   * @returns {Promise<Object|null>} Location or null
   */
  async findLocationByCode(code) {
    return await Location.findByCode(code);
  }

  /**
   * Get primary location for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Primary location assignment or null
   */
  async getPrimaryLocation(userId) {
    return await UserLocation.findPrimaryLocation(userId);
  }

  /**
   * Revoke user's location assignment
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} locationId - Location ID
   * @returns {Promise<Object>} Update result
   */
  async revokeUserLocation(userId, locationId) {
    try {
      return await UserLocation.revokeLocation(userId, locationId);
    } catch (error) {
      throw new Error(`Failed to revoke user location: ${error.message}`);
    }
  }
}

module.exports = new LocationService();
