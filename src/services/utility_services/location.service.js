const { SignUpRequest, Location, UserLocation, User, Role, Organization, UserRole } = require('../../models');
const permissionService = require('../users_services/permission.service');
const crypto = require('crypto');
const { signToken, verifyToken } = require('../../utils/jwt');
const jwt = require('jsonwebtoken');
const emailService = require('./email.service');
const bcrypt = require('bcrypt');
const locationCache = require('../../utils/locationCache');

class LocationService {
  async getProvinces() {
    // OPTIMIZATION: Use .lean() for read-only queries and .select() to project only needed fields
    return Location.find({ type: 'province', isActive: true })
      .select('_id name code type level province')
      .lean()
      .sort({ name: 1 });
  }

  async getDistrictsByProvince(provinceId) {
    // Try cache first (O(1) lookup)
    if (locationCache.isCacheReady()) {
      const districtIds = locationCache.getDistrictsByProvince(provinceId);
      if (districtIds.length > 0) {
        // Fetch full objects from DB using cached IDs
        // OPTIMIZATION: Use .lean() and .select() for performance
        return Location.find({ 
          _id: { $in: districtIds }, 
          type: 'district', 
          isActive: true 
        })
          .select('_id name code type parent province level')
          .lean()
          .sort({ name: 1 });
      }
    }
    // Fallback to standard query if cache not ready
    return Location.find({ type: 'district', province: provinceId, isActive: true })
      .select('_id name code type parent province level')
      .lean()
      .sort({ name: 1 });
  }

  async getMunicipalitiesByDistrict(districtId) {
    // Try cache first (O(1) lookup)
    if (locationCache.isCacheReady()) {
      const munIds = locationCache.getMunicipalitiesByDistrict(districtId);
      if (munIds.length > 0) {
        // Fetch full objects from DB using cached IDs
        // OPTIMIZATION: Use .lean() and .select() for performance
        return Location.find({ 
          _id: { $in: munIds }, 
          type: 'municipality', 
          isActive: true 
        })
          .select('_id name code type parent province level')
          .lean()
          .sort({ name: 1 });
      }
    }
    // Fallback to standard query if cache not ready
    return Location.find({ type: 'municipality', parent: districtId, isActive: true })
      .select('_id name code type parent province level')
      .lean()
      .sort({ name: 1 });
  }

  async getAllMunicipalities() {
    // OPTIMIZATION: Use .lean() for read-only queries
    return Location.find({ type: 'municipality', isActive: true })
      .select('_id name code type parent province level')
      .lean()
      .sort({ name: 1 });
  }

  async sendVerificationEmail(data) {
    // Validate hierarchy: ensure province -> district -> municipality consistency
    // All locations use the unified Location model
    const province = await Location.findById(data.province);
    if (!province) throw new Error('Province not found');
    if (province.type !== 'province') throw new Error('Invalid province');

    // Districts are connected via parent field (or province field if denormalized)
    const district = await Location.findOne({ 
      _id: data.district, 
      type: { $in: ['district', 'city'] },
      $or: [
        { parent: province._id },
        { province: province._id }
      ]
    });
    if (!district) throw new Error('District not found or does not belong to province');

    // Municipalities are connected via parent field (pointing to district)
    const municipality = await Location.findOne({ 
      _id: data.municipality, 
      type: 'municipality', 
      parent: district._id 
    });
    if (!municipality) throw new Error('Municipality not found or does not belong to district');

    // Validate roleId - must have authority <= 59
    if (!data.roleId) throw new Error('Role is required');
    const role = await Role.findById(data.roleId);
    if (!role) throw new Error('Role not found');
    if (role.authority > 59) throw new Error('Invalid role: Only stakeholder-level roles (authority ≤ 59) are allowed');

    // Validate organizationId - must exist and be active
    if (!data.organizationId) throw new Error('Organization is required');
    const organization = await Organization.findById(data.organizationId);
    if (!organization) throw new Error('Organization not found');
    if (!organization.isActive) throw new Error('Organization is not active');

    // find coordinator for the district (first match) - using User model with coordinator role
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

    // Create signup request with verification code (no password)
    const req = new SignUpRequest({
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      roleId: role._id,
      organizationId: organization._id,
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
    const req = await SignUpRequest.findById(requestId).populate('roleId organizationId');
    if (!req) throw new Error('Sign up request not found');
    
    // If already approved, check if we can resend the activation email
    if (req.status === 'approved') {
      // Check if user exists and hasn't activated yet
      const existingUser = await User.findOne({ email: req.email.toLowerCase() });
      if (existingUser && !existingUser.isActive && req.passwordActivationToken) {
        // User exists but hasn't activated - resend the email
        return await this.resendActivationEmail(requestId);
      }
      throw new Error('Request has already been processed');
    }
    
    if (req.status !== 'pending') {
      throw new Error('Request has already been processed');
    }

    // Check if user with this email already exists
    const existingUser = await User.findOne({ email: req.email.toLowerCase() });
    if (existingUser) throw new Error('A user with this email already exists');

    req.status = 'approved';
    req.decisionAt = new Date();
    
    // Create user account WITHOUT password (set temporary placeholder, will be replaced on activation)
    // Set isActive to false - will be activated after password is set
    const tempPassword = crypto.randomBytes(32).toString('hex'); // Temporary, will be replaced
    const user = new User({
      email: req.email.toLowerCase(),
      firstName: req.firstName,
      middleName: req.middleName || null,
      lastName: req.lastName,
      phoneNumber: req.phoneNumber || null,
      password: tempPassword, // Temporary password, user must set real password via activation
      organizationInstitution: req.organization || null,
      isActive: false // Will be activated after password is set
    });
    await user.save();

    // Generate password activation token (JWT with 24 hour expiration)
    // Use jwt.sign directly since we need custom fields (userId, signupRequestId) that signToken doesn't support
    const activationTokenPayload = {
      userId: user._id.toString(),
      email: req.email,
      signupRequestId: req._id.toString()
    };
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const activationToken = jwt.sign(activationTokenPayload, JWT_SECRET, { expiresIn: '24h' });
    
    // Set activation token and expiration in signup request
    req.passwordActivationToken = activationToken;
    req.passwordActivationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await req.save();

    // CRITICAL: Send activation email NOW, before potentially failing organization/location operations
    // This ensures email is sent even if subsequent saves fail due to validation errors
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const activationLink = `${frontendUrl}/auth/activate-account?token=${encodeURIComponent(activationToken)}`;
    const userName = `${req.firstName} ${req.lastName}`;

    try {
      await emailService.sendPasswordActivationEmail(req.email, activationLink, userName);
      console.log(`[approveRequest] Password activation email sent successfully to ${req.email}`);
    } catch (emailError) {
      // Log error but don't fail the approval process
      console.error(`[approveRequest] Failed to send password activation email to ${req.email}:`, emailError.message);
      // Continue with approval - email can be resent later if needed
    }

    // Assign role from signup request
    if (req.roleId) {
      // Verify the role is actually a stakeholder role (authority < 60)
      const role = req.roleId;
      const roleAuthority = role.authority || 30;
      
      if (roleAuthority >= 60) {
        throw new Error(`Cannot assign coordinator-level role (authority ${roleAuthority}) to stakeholder signup request`);
      }
      
      // Remove any existing coordinator-level roles (authority >= 60) that might have been accidentally assigned
      const { UserRole } = require('../../models');
      const { Role } = require('../../models');
      const coordinatorRoles = await Role.find({ authority: { $gte: 60 } }).select('_id');
      const coordinatorRoleIds = coordinatorRoles.map(r => r._id);
      
      if (coordinatorRoleIds.length > 0) {
        await UserRole.updateMany(
          { userId: user._id, roleId: { $in: coordinatorRoleIds }, isActive: true },
          { isActive: false }
        );
        console.log(`[approveRequest] Removed any existing coordinator roles for ${user.email}`);
      }
      
      // Assign the stakeholder role
      await permissionService.assignRole(user._id, req.roleId._id, [], approverId || null, null);
      
      // Sync the embedded roles array with UserRole collection
      // This ensures the authority calculation uses the correct role
      const userRoles = await UserRole.find({ userId: user._id, isActive: true })
        .populate('roleId')
        .sort({ assignedAt: -1 });
      
      // Filter out any coordinator roles (authority >= 60) from the embedded array
      const stakeholderRoles = userRoles.filter(ur => {
        const auth = ur.roleId?.authority || 20;
        return auth < 60;
      });
      
      // Update embedded roles array with only stakeholder roles
      user.roles = stakeholderRoles.map(ur => ({
        roleId: ur.roleId._id,
        roleCode: ur.roleId.code,
        roleAuthority: ur.roleId.authority || 20,
        assignedAt: ur.assignedAt || new Date(),
        assignedBy: ur.assignedBy || null,
        isActive: ur.isActive !== false
      }));
      
      // Save user document to persist roles before continuing with other assignments
      // This ensures roles are available for authority calculation later
      await user.save();
      console.log(`[approveRequest] Synced and saved roles for ${user.email}:`, {
        rolesCount: user.roles.length,
        roles: user.roles.map(r => ({ code: r.roleCode, authority: r.roleAuthority, isActive: r.isActive }))
      });
    }

    // CRITICAL: Set embedded locations field BEFORE assigning organizations
    // This prevents validation error "Stakeholders must have a municipality assignment"
    // The validation checks if organizations exist AND municipality is missing
    // So we must set municipality before organizations
    if (req.municipality) {
      const { Location } = require('../../models');
      const municipality = await Location.findById(req.municipality);
      if (municipality) {
        user.locations = {
          municipalityId: municipality._id,
          municipalityName: municipality.name,
          barangayId: null,
          barangayName: null
        };
        // Note: SignUpRequest model doesn't currently have barangay field
        // If added in future, update here: user.locations.barangayId = req.barangay, etc.
        await user.save();
        console.log(`[approveRequest] Set embedded locations for ${user.email}:`, {
          municipalityId: municipality._id.toString(),
          municipalityName: municipality.name
        });
      } else {
        console.warn(`[approveRequest] Municipality ${req.municipality} not found for ${user.email}`);
      }
    }

    // Assign organization from signup request
    if (req.organizationId) {
      const { UserOrganization } = require('../../models');
      const organization = req.organizationId; // Already populated

      // Validate organization exists and is active (provides type safety without hard-coded enums)
      if (!organization || !organization.isActive) {
        throw new Error('Organization not found or is not active');
      }

      // Attempt to assign via UserOrganization; if it fails, continue and still set embedded fields
      try {
        await UserOrganization.assignOrganization(
          user._id,
          organization._id,
          {
            roleInOrg: 'member',
            isPrimary: true,
            assignedBy: approverId || null
          }
        );
      } catch (assignErr) {
        console.error(`[approveRequest] Warning: UserOrganization.assignOrganization failed for ${user.email}:`, assignErr.message || assignErr);
        // continue - we'll still set embedded organization fields so the user record is usable
      }

      // Set top-level organizationId and organizationType (required for backward compatibility and queries)
      try {
        user.organizationId = organization._id;
        user.organizationType = organization.type;

        // Update embedded organizations array
        user.organizations = [{
          organizationId: organization._id,
          organizationName: organization.name,
          organizationType: organization.type,
          isPrimary: true,
          assignedAt: new Date(),
          assignedBy: approverId || null
        }];

        // organizationInstitution is already set (line 152) - keep it as reference only
        // Do NOT let it override organizationId - organizationId is the source of truth

        await user.save();
        console.log(`[approveRequest] Assigned organization to ${user.email}:`, {
          organizationId: organization._id.toString(),
          organizationName: organization.name,
          organizationType: organization.type,
          assignedBy: approverId ? approverId.toString() : null
        });
      } catch (saveErr) {
        console.error(`[approveRequest] Error saving user organization fields for ${user.email}:`, saveErr.message || saveErr);
      }
    }

    // Assign locations via UserLocation collection (for location hierarchy queries)
    // Note: Embedded locations field was already set above before organization assignment
    if (req.district) {
      await this.assignUserToLocation(user._id, req.district, 'exact', { isPrimary: true });
    }
    if (req.province) {
      await this.assignUserToLocation(user._id, req.province, 'descendants', { isPrimary: false });
    }
    if (req.municipality) {
      await this.assignUserToLocation(user._id, req.municipality, 'exact', { isPrimary: false });
    }

    // Recalculate and update user's authority AFTER all assignments are complete
    // This ensures authority calculation sees all roles, organizations, and locations
    if (req.roleId) {
      const authorityService = require('../users_services/authority.service');
      // Reload user to ensure we have latest data including roles and locations
      await user.populate('roles');
      const newAuthority = await authorityService.calculateUserAuthority(user._id);
      user.authority = newAuthority;
      await user.save();
      console.log(`[approveRequest] Final authority calculation for ${user.email}:`, {
        authority: newAuthority,
        roles: user.roles.map(r => ({ code: r.roleCode, authority: r.roleAuthority })),
        hasLocations: !!user.locations?.municipalityId,
        hasOrganizations: user.organizations && user.organizations.length > 0
      });
      
      // Validation: Ensure authority is correct for stakeholder
      if (newAuthority >= 60) {
        console.error(`[approveRequest] WARNING: Stakeholder ${user.email} has incorrect authority ${newAuthority} (expected < 60)`);
      }
      if (newAuthority !== 30 && user.roles.length > 0) {
        const expectedAuthority = Math.max(...user.roles.map(r => r.roleAuthority || 20));
        if (newAuthority !== expectedAuthority) {
          console.warn(`[approveRequest] Authority mismatch for ${user.email}: calculated=${newAuthority}, expected=${expectedAuthority}`);
        }
      }
    }

    // Email was already sent earlier (after token generation) to ensure it's sent even if later saves fail
    // See lines after token generation for email sending logic

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

  async resendActivationEmail(requestId) {
    const req = await SignUpRequest.findById(requestId).populate('roleId organizationId');
    if (!req) throw new Error('Sign up request not found');
    if (req.status !== 'approved') throw new Error('Request is not in approved status');

    const user = await User.findOne({ email: req.email.toLowerCase() });
    if (!user) throw new Error('User not found for this approved request');
    if (user.isActive) throw new Error('Account is already activated');

    // Check if existing token is still valid, if not, generate a new one
    let activationToken = req.passwordActivationToken;
    let activationLink;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (!activationToken || !req.passwordActivationExpires || new Date() > req.passwordActivationExpires) {
      // Token expired or missing, generate a new one
      const activationTokenPayload = {
        userId: user._id.toString(),
        email: req.email,
        signupRequestId: req._id.toString()
      };
      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
      activationToken = jwt.sign(activationTokenPayload, JWT_SECRET, { expiresIn: '24h' });
      req.passwordActivationToken = activationToken;
      req.passwordActivationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await req.save();
      console.log(`[resendActivationEmail] Generated new activation token for ${req.email}`);
    } else {
      console.log(`[resendActivationEmail] Using existing valid activation token for ${req.email}`);
    }

    activationLink = `${frontendUrl}/auth/activate-account?token=${encodeURIComponent(activationToken)}`;
    const userName = `${req.firstName} ${req.lastName}`;

    try {
      await emailService.sendPasswordActivationEmail(req.email, activationLink, userName);
      console.log(`[resendActivationEmail] Password activation email resent successfully to ${req.email}`);
      return { message: 'Activation email resent successfully' };
    } catch (emailError) {
      console.error(`[resendActivationEmail] Failed to resend password activation email to ${req.email}:`, emailError.message);
      throw new Error('Failed to resend password activation email');
    }
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

  async verifyActivationToken(token) {
    try {
      // Verify JWT token
      const decoded = verifyToken(token);
      
      // Check if token has required fields (new format)
      if (!decoded.userId || !decoded.email || !decoded.signupRequestId) {
        // Token might be in old format - try to find by email and stored token
        console.log('[verifyActivationToken] Token missing required fields, trying to find by email and stored token');
        
        // Try to find signup request by matching the token directly
        const req = await SignUpRequest.findOne({ 
          passwordActivationToken: token,
          status: 'approved'
        }).populate('roleId organizationId');
        
        if (!req) {
          throw new Error('Invalid activation token. Please request a new activation email.');
        }
        
        // Check expiration
        if (req.passwordActivationExpires && new Date() > req.passwordActivationExpires) {
          throw new Error('Activation token has expired. Please request a new activation email.');
        }
        
        // Find user by email
        const user = await User.findOne({ email: req.email.toLowerCase() });
        if (!user) {
          throw new Error('User account not found for this activation token');
        }
        if (user.isActive) {
          throw new Error('Account is already activated');
        }
        
        return {
          userId: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`
        };
      }

      // New token format - proceed with normal verification
      // Check if signup request exists and token matches
      const req = await SignUpRequest.findById(decoded.signupRequestId);
      if (!req) throw new Error('Signup request not found');
      if (req.passwordActivationToken !== token) {
        throw new Error('Invalid activation token');
      }
      if (req.passwordActivationExpires && new Date() > req.passwordActivationExpires) {
        throw new Error('Activation token has expired');
      }
      if (req.status !== 'approved') {
        throw new Error('Signup request has not been approved');
      }

      // Get user info
      const user = await User.findById(decoded.userId);
      if (!user) throw new Error('User not found');
      if (user.isActive) {
        throw new Error('Account is already activated');
      }

      return {
        userId: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new Error('Invalid or expired activation token. Please request a new activation email.');
      }
      throw error;
    }
  }

  async activateAccount(token, password) {
    try {
      // Verify token first
      const decoded = verifyToken(token);
      
      let req;
      let user;
      
      // Check if token has required fields (new format)
      if (!decoded.userId || !decoded.email || !decoded.signupRequestId) {
        // Token might be in old format - try to find by stored token
        console.log('[activateAccount] Token missing required fields, trying to find by stored token');
        
        // Try to find signup request by matching the token directly
        req = await SignUpRequest.findOne({ 
          passwordActivationToken: token,
          status: 'approved'
        });
        
        if (!req) {
          throw new Error('Invalid activation token. Please request a new activation email.');
        }
        
        // Check expiration
        if (req.passwordActivationExpires && new Date() > req.passwordActivationExpires) {
          throw new Error('Activation token has expired. Please request a new activation email.');
        }
        
        // Find user by email
        user = await User.findOne({ email: req.email.toLowerCase() });
        if (!user) {
          throw new Error('User account not found for this activation token');
        }
        if (user.isActive) {
          throw new Error('Account is already activated');
        }
      } else {
        // New token format - proceed with normal verification
        // Check if signup request exists and token matches
        req = await SignUpRequest.findById(decoded.signupRequestId);
        if (!req) throw new Error('Signup request not found');
        if (req.passwordActivationToken !== token) {
          throw new Error('Invalid activation token');
        }
        if (req.passwordActivationExpires && new Date() > req.passwordActivationExpires) {
          throw new Error('Activation token has expired');
        }
        if (req.status !== 'approved') {
          throw new Error('Signup request has not been approved');
        }

        // Get user
        user = await User.findById(decoded.userId);
        if (!user) throw new Error('User not found');
        if (user.isActive) {
          throw new Error('Account is already activated');
        }
      }

      // Validate password
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Update user: set password and activate account
      // IMPORTANT: Only update password and isActive - preserve roles, locations, and organizations
      user.password = hashedPassword;
      user.isActive = true;
      
      // Recalculate and update user's authority after activation (in case it wasn't set correctly)
      // This ensures authority is correct even if it was miscalculated during approval
      const authorityService = require('../users_services/authority.service');
      const newAuthority = await authorityService.calculateUserAuthority(user._id);
      user.authority = newAuthority;
      await user.save();
      console.log(`[activateAccount] Activated account for ${user.email}:`, {
        authority: newAuthority,
        hasRoles: user.roles && user.roles.length > 0,
        hasLocations: !!user.locations?.municipalityId,
        hasOrganizations: user.organizations && user.organizations.length > 0
      });

      // Invalidate activation token
      req.passwordActivationToken = null;
      req.passwordActivationExpires = null;
      await req.save();

      return {
        message: 'Account activated successfully',
        userId: user._id.toString(),
        email: user.email
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new Error('Invalid or expired activation token');
      }
      throw error;
    }
  }

  async getSignUpRequests(user) {
    // Check permissions instead of roles
    const permissionService = require('../users_services/permission.service');
    const hasFullAccess = await permissionService.checkPermission(user.id, '*', '*', {});
    const canManageLocations = await permissionService.checkPermission(user.id, 'location', 'read', {});
    
    if (user.isSystemAdmin || hasFullAccess) {
      // Show both pending requests AND approved requests where user hasn't activated yet
      // This allows resending activation emails for approved but not-yet-activated accounts
      const pendingRequests = await SignUpRequest.find({ status: 'pending', emailVerified: true })
        .populate('province district municipality')
        .populate({ path: 'assignedCoordinator', model: 'User' })
        .populate({ path: 'roleId', model: 'Role' })
        .populate({ path: 'organizationId', model: 'Organization' })
        .sort({ submittedAt: -1 });
      
      // Also get approved requests where the user account exists but is not activated
      const approvedRequests = await SignUpRequest.find({ status: 'approved', emailVerified: true })
        .populate('province district municipality')
        .populate({ path: 'assignedCoordinator', model: 'User' })
        .populate({ path: 'roleId', model: 'Role' })
        .populate({ path: 'organizationId', model: 'Organization' })
        .sort({ submittedAt: -1 });
      
      // Filter approved requests to only include those where user hasn't activated
      const approvedButNotActivated = [];
      for (const req of approvedRequests) {
        const userAccount = await User.findOne({ email: req.email.toLowerCase() });
        if (userAccount && !userAccount.isActive) {
          approvedButNotActivated.push(req);
        }
      }
      
      // Combine and return both pending and approved-but-not-activated requests
      return [...pendingRequests, ...approvedButNotActivated].sort((a, b) => {
        // Sort by submittedAt descending (most recent first)
        return new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt);
      });
    } else if (canManageLocations) {
      // Find coordinator user to get their locations and organizations
      const coordinatorUser = await User.findById(user.id);
      if (!coordinatorUser) return [];
      
      // Get location IDs from both UserLocation assignments and coverageAreas
      const mongoose = require('mongoose');
      const locationService = require('./location.service');
      const locations = await locationService.getUserLocations(coordinatorUser._id);
      const locationIdsFromAssignments = locations
        .map(loc => loc.locationId)
        .filter(Boolean)
        .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
      
      // Also get location IDs from coverageAreas (coordinators use this)
      const locationIdsFromCoverage = [];
      if (coordinatorUser.coverageAreas && coordinatorUser.coverageAreas.length > 0) {
        for (const coverageArea of coordinatorUser.coverageAreas) {
          if (coverageArea.districtIds && Array.isArray(coverageArea.districtIds)) {
            locationIdsFromCoverage.push(...coverageArea.districtIds
              .filter(id => id)
              .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
          }
          if (coverageArea.municipalityIds && Array.isArray(coverageArea.municipalityIds)) {
            locationIdsFromCoverage.push(...coverageArea.municipalityIds
              .filter(id => id)
              .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
          }
        }
      }
      
      // Combine all location IDs (convert to ObjectIds for proper comparison)
      const allLocationIds = [...new Set([
        ...locationIdsFromAssignments.map(id => id.toString()),
        ...locationIdsFromCoverage.map(id => id.toString())
      ])].map(id => new mongoose.Types.ObjectId(id));
      
      // Get organization IDs from coordinator's organizations
      const organizationIds = [];
      if (coordinatorUser.organizations && coordinatorUser.organizations.length > 0) {
        organizationIds.push(...coordinatorUser.organizations
          .map(org => org.organizationId)
          .filter(Boolean)
          .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id));
      }
      
      // Build query: Show requests that match:
      // 1. Location match (district, province, or municipality in coordinator's locations)
      // 2. AND organization match (if coordinator has organizations assigned)
      // Show both pending AND approved-but-not-activated requests
      const pendingQuery = {
        status: 'pending', 
        emailVerified: true 
      };
      
      const approvedQuery = {
        status: 'approved', 
        emailVerified: true 
      };
      
      // Location filter: district, province, or municipality must be in coordinator's locations
      if (allLocationIds.length > 0) {
        pendingQuery.$or = [
          { district: { $in: allLocationIds } },
          { province: { $in: allLocationIds } },
          { municipality: { $in: allLocationIds } }
        ];
        approvedQuery.$or = [
          { district: { $in: allLocationIds } },
          { province: { $in: allLocationIds } },
          { municipality: { $in: allLocationIds } }
        ];
      } else {
        // If no locations, return empty (coordinator has no coverage)
        console.log('[getSignUpRequests] Coordinator has no locations, returning empty');
        return [];
      }
      
      // Organization filter: if coordinator has organizations, only show requests with matching organizations
      if (organizationIds.length > 0) {
        pendingQuery.organizationId = { $in: organizationIds };
        approvedQuery.organizationId = { $in: organizationIds };
      } else {
        // If coordinator has no organizations, they can't see any requests
        console.log('[getSignUpRequests] Coordinator has no organizations, returning empty');
        return [];
      }
      
      console.log('[getSignUpRequests] Coordinator filter:', {
        coordinatorId: coordinatorUser._id.toString(),
        locationIdsCount: allLocationIds.length,
        organizationIdsCount: organizationIds.length,
        locationIds: allLocationIds.slice(0, 5).map(id => id.toString()),
        organizationIds: organizationIds.map(id => id.toString()),
        hasCoverageAreas: !!coordinatorUser.coverageAreas,
        coverageAreasCount: coordinatorUser.coverageAreas?.length || 0,
        hasOrganizations: !!coordinatorUser.organizations,
        organizationsCount: coordinatorUser.organizations?.length || 0
      });
      
      // Get pending requests
      const pendingRequests = await SignUpRequest.find(pendingQuery)
        .populate('province district municipality')
        .populate({ path: 'assignedCoordinator', model: 'User' })
        .populate({ path: 'roleId', model: 'Role' })
        .populate({ path: 'organizationId', model: 'Organization' })
        .sort({ submittedAt: -1 });
      
      // Get approved requests
      const approvedRequests = await SignUpRequest.find(approvedQuery)
        .populate('province district municipality')
        .populate({ path: 'assignedCoordinator', model: 'User' })
        .populate({ path: 'roleId', model: 'Role' })
        .populate({ path: 'organizationId', model: 'Organization' })
        .sort({ submittedAt: -1 });
      
      // Filter approved requests to only include those where user hasn't activated
      const approvedButNotActivated = [];
      for (const req of approvedRequests) {
        const userAccount = await User.findOne({ email: req.email.toLowerCase() });
        if (userAccount && !userAccount.isActive) {
          approvedButNotActivated.push(req);
        }
      }
      
      // Combine and return both pending and approved-but-not-activated requests
      return [...pendingRequests, ...approvedButNotActivated].sort((a, b) => {
        // Sort by submittedAt descending (most recent first)
        return new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt);
      });
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

      // Trigger cache rebuild after successful creation
      try {
        if (locationCache.isCacheReady()) {
          await locationCache.rebuildCache(Location);
          console.log(`[createLocation] Location cache rebuilt after creating location: ${location.name}`);
        }
      } catch (cacheError) {
        console.warn(`[createLocation] Failed to rebuild cache: ${cacheError.message}`);
        // Don't fail the request due to cache rebuild failure
      }

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
      const { isPrimary = false, assignedBy = null, expiresAt = null, session = null } = options;

      // Validate user exists
      const user = await User.findById(userId).session(session);
      if (!user) {
        throw new Error('User not found');
      }

      // Validate location exists
      const location = await Location.findById(locationId).session(session);
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
        expiresAt,
        session
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

      // OPTIMIZATION: Check embedded locations first (fast path for new users)
      // New stakeholders created via signup have embedded locations field
      const user = await User.findById(userId).select('locations').lean();
      if (user && user.locations && user.locations.municipalityId) {
        // Fast path: Use embedded locations
        const locationIds = [
          user.locations.municipalityId,
          user.locations.barangayId
        ].filter(Boolean);
        
        if (locationIds.length > 0) {
          const locationDocs = await Location.find({ _id: { $in: locationIds } }).lean();
          const locations = locationDocs.map(loc => ({
            _id: loc._id,
            locationId: loc._id,
            locationName: loc.name,
            locationType: loc.type,
            scope: 'exact',
            isPrimary: loc._id.toString() === user.locations.municipalityId?.toString(),
            assignedAt: new Date(), // Approximate
            isActive: true
          }));
          
          return locations;
        }
      }

      // Slow path: Query UserLocation collection (for users without embedded locations)
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

  // ============================================================================
  // PERFORMANCE-OPTIMIZED LOCATION TREE METHODS
  // ============================================================================

  /**
   * Get provinces only (optimized for initial load)
   * Returns a minimal list of provinces without nested children
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of provinces
   */
  async getProvincesOptimized(options = {}) {
    const { includeInactive = false } = options;
    
    const query = { type: 'province' };
    if (!includeInactive) {
      query.isActive = true;
    }

    // Use .lean() for 30-50% performance boost (returns plain objects instead of Mongoose documents)
    // Select only essential fields to reduce data transfer
    return Location.find(query)
      .select('_id name code type level isActive')
      .lean()
      .sort({ name: 1 })
      .exec();
  }

  /**
   * Get single province tree with ALL descendants using aggregation (NO recursion)
   * This replaces the slow recursive _buildLocationTree method
   * Performance: Single aggregation query instead of N queries
   * @param {ObjectId} provinceId - Province ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Province with nested children
   */
  async getProvinceTreeOptimized(provinceId, options = {}) {
    const { includeInactive = false } = options;
    const mongoose = require('mongoose');

    // Validate provinceId
    if (!mongoose.Types.ObjectId.isValid(provinceId)) {
      throw new Error('Invalid province ID');
    }

    const province = await Location.findById(provinceId).lean();
    if (!province) {
      throw new Error('Province not found');
    }

    // Use aggregation pipeline for efficient tree building (single query)
    const pipeline = [
      // Start with all locations that are active (or all if includeInactive)
      {
        $match: includeInactive ? {} : { isActive: true }
      },
      // Add lookup to build parent-child relationships
      {
        $graphLookup: {
          from: 'locations',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent',
          as: 'descendants',
          maxDepth: 3,
          depthField: 'depth'
        }
      },
      // Match only the province we want
      {
        $match: { _id: new mongoose.Types.ObjectId(provinceId) }
      },
      // Project only needed fields
      {
        $project: {
          _id: 1,
          name: 1,
          code: 1,
          type: 1,
          level: 1,
          isActive: 1,
          descendants: {
            _id: 1,
            name: 1,
            code: 1,
            type: 1,
            parent: 1,
            level: 1,
            isActive: 1,
            'metadata.isCity': 1
          }
        }
      }
    ];

    const results = await Location.aggregate(pipeline);
    
    if (results.length === 0) {
      return province; // Return province without children if aggregation fails
    }

    // Build hierarchical structure from flat descendants list
    const provinceData = results[0];
    const allLocations = [provinceData, ...provinceData.descendants];
    
    // Create a map for O(1) lookups
    const locationMap = new Map();
    allLocations.forEach(loc => {
      locationMap.set(loc._id.toString(), { ...loc, children: [] });
    });

    // Build parent-child relationships
    allLocations.forEach(loc => {
      if (loc.parent) {
        const parentId = loc.parent.toString();
        const parent = locationMap.get(parentId);
        if (parent) {
          parent.children.push(locationMap.get(loc._id.toString()));
        }
      }
    });

    // Sort children at each level
    const sortChildren = (node) => {
      if (node.children && node.children.length > 0) {
        node.children.sort((a, b) => a.name.localeCompare(b.name));
        node.children.forEach(sortChildren);
      }
    };

    const tree = locationMap.get(provinceId.toString());
    if (tree) {
      sortChildren(tree);
      delete tree.descendants; // Remove the flat descendants array
    }

    return tree || province;
  }

  /**
   * Get immediate children of a location (lazy loading)
   * Optimized for progressive tree expansion
   * @param {ObjectId} parentId - Parent location ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of child locations
   */
  async getLocationChildrenOptimized(parentId, options = {}) {
    const { includeInactive = false, types = null } = options;
    const mongoose = require('mongoose');

    // Validate parentId
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw new Error('Invalid parent ID');
    }

    const query = { 
      parent: new mongoose.Types.ObjectId(parentId)
    };

    if (!includeInactive) {
      query.isActive = true;
    }

    // Optionally filter by type (e.g., only districts or only municipalities)
    if (types && Array.isArray(types) && types.length > 0) {
      query.type = { $in: types };
    }

    // Use .lean() and select only needed fields for performance
    return Location.find(query)
      .select('_id name code type parent level isActive metadata.isCity')
      .lean()
      .sort({ name: 1 })
      .exec();
  }

  /**
   * Get complete location tree with all provinces and descendants (optimized)
   * Uses caching and efficient aggregation
   * WARNING: This can still be slow for very large datasets - prefer lazy loading
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of province trees
   */
  async getCompleteTreeOptimized(options = {}) {
    const { includeInactive = false, useCache = true } = options;

    // Check in-memory cache first (5 minute TTL)
    const cacheKey = `location-tree:${includeInactive ? 'all' : 'active'}`;
    
    if (useCache && this._treeCache && this._treeCache[cacheKey]) {
      const cached = this._treeCache[cacheKey];
      const now = Date.now();
      if (now - cached.timestamp < 5 * 60 * 1000) { // 5 minutes
        return cached.data;
      }
    }

    // Get all provinces
    const provinces = await this.getProvincesOptimized({ includeInactive });

    // Build tree for each province in parallel (but limit concurrency)
    const trees = [];
    const BATCH_SIZE = 3; // Process 3 provinces at a time to avoid overwhelming DB
    
    for (let i = 0; i < provinces.length; i += BATCH_SIZE) {
      const batch = provinces.slice(i, i + BATCH_SIZE);
      const batchTrees = await Promise.all(
        batch.map(province => this.getProvinceTreeOptimized(province._id, { includeInactive }))
      );
      trees.push(...batchTrees);
    }

    // Cache the result
    if (!this._treeCache) {
      this._treeCache = {};
    }
    this._treeCache[cacheKey] = {
      data: trees,
      timestamp: Date.now()
    };

    return trees;
  }

  /**
   * Clear location tree cache
   * Should be called after location CRUD operations
   */
  clearTreeCache() {
    this._treeCache = {};
  }
}

module.exports = new LocationService();
