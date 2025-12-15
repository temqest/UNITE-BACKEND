const bcrypt = require('bcrypt');
const { Stakeholder, District, Municipality, Province, RegistrationCode } = require('../../models/index');

class StakeholderService {
  generateStakeholderID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `STKH_${timestamp}_${random}`;
  }

  async register(stakeholderData) {
    // Try to resolve provided district/province/municipality
    let district = null;
    let municipality = null;
    let province = null;

    if (stakeholderData.district) {
      district = await District.findById(stakeholderData.district);
    }
    if (stakeholderData.municipality) {
      municipality = await Municipality.findById(stakeholderData.municipality);
    }
    if (stakeholderData.province) {
      province = await Province.findById(stakeholderData.province);
    }

    // If registration code provided, try to map coordinator but do not rely on legacy District_ID mapping
    let codeCoordinatorId = null;
    if (stakeholderData.registrationCode) {
      const code = await RegistrationCode.findOne({ Code: stakeholderData.registrationCode });
      if (!code) throw new Error('Invalid registration code');
      if (!code.IsActive) throw new Error('Registration code is inactive');
      if (code.Expires_At && code.Expires_At < new Date()) throw new Error('Registration code expired');
      if (code.Uses >= code.Max_Uses) throw new Error('Registration code usage limit reached');
      codeCoordinatorId = code.Coordinator_ID;
    }

    if (!district) throw new Error('Invalid district. District does not exist');

    const existing = await Stakeholder.findOne({ email: stakeholderData.email.toLowerCase() });
    if (existing) throw new Error('Email already exists');

    const Stakeholder_ID = stakeholderData.Stakeholder_ID || this.generateStakeholderID();
    const hashed = await bcrypt.hash(stakeholderData.password, 10);

    const stakeholder = new Stakeholder({
      Stakeholder_ID,
      province: province ? province._id : district.province,
      district: district._id,
      municipality: municipality ? municipality._id : undefined,
      coordinator: stakeholderData.coordinator || codeCoordinatorId || undefined,
      firstName: stakeholderData.firstName,
      middleName: stakeholderData.middleName || null,
      lastName: stakeholderData.lastName,
      field: stakeholderData.field || null,
      email: stakeholderData.email.toLowerCase(),
      phoneNumber: stakeholderData.phoneNumber,
      password: hashed,
      organizationInstitution: stakeholderData.organizationInstitution || null,
      registrationCode: stakeholderData.registrationCode || null,
      accountType: stakeholderData.accountType
    });
    const saved = await stakeholder.save();

    if (stakeholderData.registrationCode) {
      const code = await RegistrationCode.findOne({ Code: stakeholderData.registrationCode });
      if (code && typeof code.consume === 'function') await code.consume();
    }

    return {
      success: true,
      stakeholder: {
        Stakeholder_ID: saved.Stakeholder_ID,
        firstName: saved.firstName,
        middleName: saved.middleName,
        lastName: saved.lastName,
        email: saved.email,
        phoneNumber: saved.phoneNumber,
        district: saved.district,
        province: saved.province,
        municipality: saved.municipality,
        coordinator: saved.coordinator,
        organizationInstitution: saved.organizationInstitution,
        accountType: saved.accountType,
        created_at: saved.createdAt
      }
    };
  }

  async authenticate(email, password) {
    const stakeholder = await Stakeholder.findOne({ email: email.toLowerCase() });
    if (!stakeholder) throw new Error('Invalid email or password');
    const ok = await bcrypt.compare(password, stakeholder.password);
    if (!ok) throw new Error('Invalid email or password');
    return {
      success: true,
      stakeholder: {
        Stakeholder_ID: stakeholder.Stakeholder_ID,
        firstName: stakeholder.firstName,
        middleName: stakeholder.middleName,
        lastName: stakeholder.lastName,
        email: stakeholder.email,
        phoneNumber: stakeholder.phoneNumber,
        district: stakeholder.district,
        coordinator: stakeholder.coordinator,
        province: stakeholder.province,
        accountType: stakeholder.accountType
      }
    };
  }

  async getById(stakeholderId) {
    const s = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId });
    if (!s) throw new Error('Stakeholder not found');
    return {
      success: true,
      data: {
        Stakeholder_ID: s.Stakeholder_ID,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        email: s.email,
        phoneNumber: s.phoneNumber,
        district: s.district,
        province: s.province,
        municipality: s.municipality,
        organizationInstitution: s.organizationInstitution,
        coordinator: s.coordinator,
        accountType: s.accountType,
        created_at: s.createdAt
      }
    };
  }

  async update(stakeholderId, updateData) {
    const s = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId });
    if (!s) throw new Error('Stakeholder not found');

    // Prevent email collisions
    if (updateData.Email && String(updateData.Email).toLowerCase() !== String(s.Email).toLowerCase()) {
      const exist = await Stakeholder.findOne({ Email: String(updateData.Email).toLowerCase() });
      if (exist) throw new Error('Email already exists');
    }

    // Accept both legacy keys (First_Name, Email, etc.) and normalized keys
    // Map incoming payload keys to the normalized schema fields used by the model.
    const map = {}

    // Name fields
    if ('firstName' in updateData) map.firstName = updateData.firstName;
    if ('First_Name' in updateData) map.firstName = updateData.First_Name;
    if ('middleName' in updateData) map.middleName = updateData.middleName;
    if ('Middle_Name' in updateData) map.middleName = updateData.Middle_Name;
    if ('lastName' in updateData) map.lastName = updateData.lastName;
    if ('Last_Name' in updateData) map.lastName = updateData.Last_Name;

    // Contact fields
    if ('email' in updateData) map.email = String(updateData.email).toLowerCase();
    if ('Email' in updateData) map.email = String(updateData.Email).toLowerCase();
    if ('phoneNumber' in updateData) map.phoneNumber = updateData.phoneNumber;
    if ('Phone_Number' in updateData) map.phoneNumber = updateData.Phone_Number;

    // Organization
    if ('organizationInstitution' in updateData) map.organizationInstitution = updateData.organizationInstitution;
    if ('Organization_Institution' in updateData) map.organizationInstitution = updateData.Organization_Institution;

    // Account type
    if ('accountType' in updateData) map.accountType = updateData.accountType;

    // Coordinator reference
    if ('coordinator' in updateData) map.coordinator = updateData.coordinator;
    if ('Coordinator_ID' in updateData) map.coordinator = updateData.Coordinator_ID;

    // Location: district/province/municipality
    // Prefer normalized id fields if present
    if ('district' in updateData && updateData.district) map.district = updateData.district;
    if ('District_ID' in updateData && updateData.District_ID) map.district = updateData.District_ID;
    if ('DistrictId' in updateData && updateData.DistrictId) map.district = updateData.DistrictId;

    if ('municipality' in updateData) map.municipality = updateData.municipality;
    if ('Municipality_ID' in updateData) map.municipality = updateData.Municipality_ID;
    if ('City_Municipality' in updateData) map.municipality = updateData.City_Municipality;

    if ('province' in updateData) map.province = updateData.province;
    if ('Province_Name' in updateData) map.province = updateData.Province_Name;

    // Password updates (normalized and legacy)
    const newPassword = updateData.password || updateData.Password || null;

    // Do not assign location fields directly yet; resolve them first to ObjectIds when possible
    const districtVal = map.district;
    const municipalityVal = map.municipality;
    const provinceVal = map.province;

    // Remove location keys from map so they aren't blindly assigned
    delete map.district;
    delete map.municipality;
    delete map.province;

    // Apply mapped normalized fields (non-location) to the document
    for (const k of Object.keys(map)) {
      if (map[k] !== undefined && map[k] !== null) s[k] = map[k];
    }

    // If password change requested, hash and set it
    if (newPassword && String(newPassword).trim().length > 0) {
      const hashed = await bcrypt.hash(String(newPassword), 10);
      s.password = hashed;
    }

    // Resolve district/province/municipality ids when simple strings or legacy ids are provided
    try {
      // District
      if (districtVal !== undefined && districtVal !== null && districtVal !== "") {
        let resolvedDistrict = null;
        const idLike = String(districtVal).match(/^[0-9a-fA-F]{24}$/);
        if (idLike) {
          resolvedDistrict = await District.findById(String(districtVal));
        }
        if (!resolvedDistrict) {
          resolvedDistrict = await District.findOne({ $or: [{ District_ID: String(districtVal) }, { _id: String(districtVal) }] });
        }
        if (resolvedDistrict) {
          s.district = resolvedDistrict._id;
          // derive province from district when not explicitly provided
          if ((!provinceVal || provinceVal === undefined || provinceVal === null || provinceVal === "") && resolvedDistrict.province) {
            s.province = resolvedDistrict.province;
          }
        }
      }

      // Municipality
      if (municipalityVal !== undefined && municipalityVal !== null && municipalityVal !== "") {
        let resolvedMun = null;
        const idLike = String(municipalityVal).match(/^[0-9a-fA-F]{24}$/);
        if (idLike) {
          resolvedMun = await Municipality.findById(String(municipalityVal));
        }
        if (!resolvedMun) {
          resolvedMun = await Municipality.findOne({ $or: [{ Municipality_ID: String(municipalityVal) }, { _id: String(municipalityVal) }, { name: String(municipalityVal) }] });
        }
        if (resolvedMun) s.municipality = resolvedMun._id;
      }

      // Province
      if (provinceVal !== undefined && provinceVal !== null && provinceVal !== "") {
        let resolvedProv = null;
        const idLike = String(provinceVal).match(/^[0-9a-fA-F]{24}$/);
        if (idLike) {
          resolvedProv = await Province.findById(String(provinceVal));
        }
        if (!resolvedProv) {
          // try various name/id fields separately
          resolvedProv = await Province.findOne({ $or: [ { Province_ID: String(provinceVal) }, { _id: String(provinceVal) }, { name: String(provinceVal) }, { Province_Name: String(provinceVal) } ] });
        }
        if (resolvedProv) s.province = resolvedProv._id;
      }
    } catch (e) {
      // ignore resolution errors - avoid assigning raw strings that will fail cast
    }

    const saved = await s.save();
    return {
      success: true,
      stakeholder: {
        Stakeholder_ID: saved.Stakeholder_ID,
        First_Name: saved.First_Name,
        Middle_Name: saved.Middle_Name,
        Last_Name: saved.Last_Name,
        Email: saved.Email,
        Phone_Number: saved.Phone_Number,
        District_ID: saved.District_ID,
        Province_Name: saved.Province_Name,
        City_Municipality: saved.City_Municipality,
        Organization_Institution: saved.Organization_Institution,
        Coordinator_ID: saved.Coordinator_ID,
        accountType: saved.accountType
      }
    }
  }

  async remove(stakeholderId) {
    const s = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId });
    if (!s) throw new Error('Stakeholder not found');
    await Stakeholder.deleteOne({ Stakeholder_ID: stakeholderId });
    return { success: true }
  }

  async list(filters = {}, page = 1, limit = 20) {
    const query = {};
    if (filters.district_id) query.district = filters.district_id;
    if (filters.accountType) query.accountType = filters.accountType;
    if (filters.email) query.email = { $regex: filters.email, $options: 'i' };

    const skip = (page - 1) * limit;
    const items = await Stakeholder.find(query).populate('province').populate('district').populate('municipality').skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await Stakeholder.countDocuments(query);

    return {
      success: true,
      data: items.map(s => ({
        Stakeholder_ID: s.Stakeholder_ID,
        firstName: s.firstName,
        middleName: s.middleName,
        lastName: s.lastName,
        email: s.email,
        phoneNumber: s.phoneNumber,
        district: s.district,
        province: s.province,
        municipality: s.municipality,
        organizationInstitution: s.organizationInstitution,
        accountType: s.accountType,
        created_at: s.createdAt
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }
}

module.exports = new StakeholderService();


