const { Province, District, Municipality, SignUpRequest, Coordinator } = require('../../models');
const crypto = require('crypto');

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

  async createSignUpRequest(data) {
    // Validate hierarchy: ensure province -> district -> municipality consistency
    const province = await Province.findById(data.province);
    if (!province) throw new Error('Province not found');

    const district = await District.findOne({ _id: data.district, province: province._id });
    if (!district) throw new Error('District not found or does not belong to province');

    const municipality = await Municipality.findOne({ _id: data.municipality, district: district._id, province: province._id });
    if (!municipality) throw new Error('Municipality not found or does not belong to district/province');

    // find coordinator for the district (first match)
    const coordinator = await Coordinator.findOne({ district: district._id });

    const token = crypto.randomBytes(24).toString('hex');

    const req = new SignUpRequest({
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      organization: data.organization,
      province: province._id,
      district: district._id,
      municipality: municipality._id,
      assignedCoordinator: coordinator?._id || null,
      emailVerificationToken: token
    });

    await req.save();

    // In production, send email. Here we just log and return token.
    console.log(`Send verification email to ${req.email} with token: ${token}`);

    return req;
  }

  async approveRequest(requestId, approverId) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    req.status = 'approved';
    req.decisionAt = new Date();
    await req.save();
    // In a full implementation, create stakeholder record and send email
    return req;
  }

  async rejectRequest(requestId, approverId, reason) {
    const req = await SignUpRequest.findById(requestId);
    if (!req) throw new Error('Sign up request not found');
    req.status = 'rejected';
    req.decisionAt = new Date();
    await req.save();
    return req;
  }

  async verifyEmailToken(token) {
    const req = await SignUpRequest.findOne({ emailVerificationToken: token });
    if (!req) throw new Error('Invalid token');
    req.emailVerified = true;
    await req.save();
    return req;
  }
}

module.exports = new LocationService();
