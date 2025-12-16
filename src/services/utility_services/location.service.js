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

    // find coordinator for the district (first match)
    const coordinator = await Coordinator.findOne({ district: district._id });

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

  Congratulations! Your stakeholder registration request for the UNITE Blood Bank System has been approved.

  Your account has been created with the following details:
  - Email: ${req.email}
  - Stakeholder ID: ${stakeholderId}

  You can now log in to the system using your registered email and password.

  If you have any questions, please contact your assigned coordinator.

  Best regards,
  UNITE Blood Bank Team
    `.trim();

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
        <li><strong>Stakeholder ID:</strong> ${stakeholderId}</li>
      </ul>
    </div>
    <p>You can now log in to the system using your registered email and password.</p>
    <p>If you have any questions, please contact your assigned coordinator.</p>
    
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`);

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

  We regret to inform you that your stakeholder registration request for the UNITE Blood Bank System has been rejected.

  Reason: ${reason || 'Not specified'}

  If you have any questions, please contact your assigned coordinator.

  Best regards,
  UNITE Blood Bank Team
    `.trim();

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
    if (user.role === 'Admin') {
      return SignUpRequest.find({ status: 'pending', emailVerified: true }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
    } else if (user.role === 'Coordinator') {
      // Find coordinator record to get their district and province
      const coord = await Coordinator.findOne({ Coordinator_ID: user.id });
      if (!coord) return [];
      // Show all pending requests in the coordinator's province and district
      return SignUpRequest.find({ province: coord.province, district: coord.district, status: 'pending', emailVerified: true }).populate('province district municipality assignedCoordinator').sort({ submittedAt: -1 });
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
}

module.exports = new LocationService();
