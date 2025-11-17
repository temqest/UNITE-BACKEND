const { Province, District, Municipality, SignUpRequest, Coordinator } = require('../../models');
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

  async sendVerificationEmail(data) {
    // Validate hierarchy: ensure province -> district -> municipality consistency
    const province = await Province.findById(data.province);
    if (!province) throw new Error('Province not found');

    const district = await District.findOne({ _id: data.district, province: province._id });
    if (!district) throw new Error('District not found or does not belong to province');

    const municipality = await Municipality.findOne({ _id: data.municipality, district: district._id, province: province._id });
    if (!municipality) throw new Error('Municipality not found or does not belong to district/province');

    // find coordinator for the district (first match)
    const coordinator = await Coordinator.findOne({ district: district._id });

    const token = signToken({
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
      assignedCoordinator: coordinator?._id || null
    }, { expiresIn: '24h' });

    // Send verification email with the JWT token
    await emailService.sendVerificationCode(data.email, token);

    return { message: 'Verification email sent' };
  }

  async approveRequest(requestId, approverId) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    if (req.status !== 'pending') throw new Error('Request has already been processed');

    // Check if stakeholder with this email already exists
    const { Stakeholder } = require('../../models');
    const existingStakeholder = await Stakeholder.findOne({ email: req.email });
    if (existingStakeholder) throw new Error('A stakeholder with this email already exists');

    req.status = 'approved';
    req.decisionAt = new Date();
    await req.save();

    // Hash the password before creating stakeholder account
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(req.password, saltRounds);

    // Create stakeholder account
    const stakeholderId = 'STK-' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    const stakeholder = new Stakeholder({
      Stakeholder_ID: stakeholderId,
      province: req.province,
      district: req.district,
      municipality: req.municipality,
      coordinator: req.assignedCoordinator,
      firstName: req.firstName,
      middleName: req.middleName,
      lastName: req.lastName,
      email: req.email,
      phoneNumber: req.phoneNumber || null,
      password: hashedPassword,
      organizationInstitution: req.organization,
    });
    await stakeholder.save();

    // Send acceptance email
    const acceptanceMessage = `
Dear ${req.firstName} ${req.lastName},

Congratulations! Your stakeholder registration request for the UNITE Blood Bank Event Management System has been approved.

Your account has been created with the following details:
- Email: ${req.email}
- Stakeholder ID: ${stakeholderId}

You can now log in to the system using your registered email and password.

If you have any questions, please contact your assigned coordinator.

Best regards,
UNITE Blood Bank Team
    `.trim();

    await emailService.sendEmail(req.email, 'UNITE - Registration Approved', acceptanceMessage, `<pre>${acceptanceMessage}</pre>`);

    // Create notification for the new stakeholder
    const { Notification } = require('../../models');
    const stakeholderName = `${req.firstName} ${req.lastName}`;
    await Notification.createSignupRequestApprovedNotification(
      stakeholder.Stakeholder_ID,
      req._id.toString(),
      stakeholderName
    );

    return req;
  }

  async rejectRequest(requestId, approverId, reason) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    if (req.status !== 'pending') throw new Error('Request has already been processed');

    // Send rejection email before deleting
    const rejectionMessage = `
Dear ${req.firstName} ${req.lastName},

We regret to inform you that your stakeholder registration request for the UNITE Blood Bank Event Management System has been rejected.

Reason: ${reason || 'Not specified'}

If you have any questions, please contact your assigned coordinator.

Best regards,
UNITE Blood Bank Team
    `.trim();

    await emailService.sendEmail(req.email, 'UNITE - Registration Rejected', rejectionMessage, `<pre>${rejectionMessage}</pre>`);

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
    // Temporarily show all pending requests for debugging
    if (user.role === 'Admin') {
      return SignUpRequest.find({ status: 'pending' }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
    } else if (user.role === 'Coordinator') {
      // Find coordinator record to get their district
      const coord = await Coordinator.findOne({ Coordinator_ID: user.id });
      if (!coord) return [];
      // Show all pending requests in the coordinator's district
      return SignUpRequest.find({ district: coord.District_ID, status: 'pending' }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
    }
    return [];
  }

  async verifyEmailToken(token) {
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
}

module.exports = new LocationService();
