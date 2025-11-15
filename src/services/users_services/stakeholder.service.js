const bcrypt = require('bcrypt');
const { Stakeholder, District, RegistrationCode } = require('../../models/index');

class StakeholderService {
  generateStakeholderID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `STKH_${timestamp}_${random}`;
  }

  async register(stakeholderData) {
    const district = await District.findOne({ District_ID: stakeholderData.District_ID });
    let effectiveDistrict = district;

    // If Registration_Code provided, validate and set district if missing
    let codeCoordinatorId;
    if (stakeholderData.Registration_Code) {
      const code = await RegistrationCode.findOne({ Code: stakeholderData.Registration_Code });
      if (!code) throw new Error('Invalid registration code');
      if (!code.IsActive) throw new Error('Registration code is inactive');
      if (code.Expires_At && code.Expires_At < new Date()) throw new Error('Registration code expired');
      if (code.Uses >= code.Max_Uses) throw new Error('Registration code usage limit reached');

      // capture the coordinator referenced by the registration code
      codeCoordinatorId = code.Coordinator_ID;

      if (!effectiveDistrict) {
        effectiveDistrict = await District.findOne({ District_ID: code.District_ID });
      } else if (effectiveDistrict.District_ID !== code.District_ID) {
        throw new Error('Registration code does not match the provided district');
      }
    }

    if (!effectiveDistrict) throw new Error('Invalid District ID. District does not exist');

    const existing = await Stakeholder.findOne({ Email: stakeholderData.Email.toLowerCase() });
    if (existing) throw new Error('Email already exists');

    const Stakeholder_ID = stakeholderData.Stakeholder_ID || this.generateStakeholderID();
    const hashed = await bcrypt.hash(stakeholderData.Password, 10);

    const stakeholder = new Stakeholder({
      ...stakeholderData,
      Stakeholder_ID,
      Email: stakeholderData.Email.toLowerCase(),
      Password: hashed,
      District_ID: effectiveDistrict.District_ID,
      Coordinator_ID: stakeholderData.Coordinator_ID || codeCoordinatorId || undefined
    });
    const saved = await stakeholder.save();

    if (stakeholderData.Registration_Code) {
      const code = await RegistrationCode.findOne({ Code: stakeholderData.Registration_Code });
      await code.consume();
    }

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
        Coordinator_ID: saved.Coordinator_ID,
        Province_Name: saved.Province_Name,
        City_Municipality: saved.City_Municipality,
        Organization_Institution: saved.Organization_Institution,
        created_at: saved.createdAt
      }
    };
  }

  async authenticate(email, password) {
    const stakeholder = await Stakeholder.findOne({ Email: email.toLowerCase() });
    if (!stakeholder) throw new Error('Invalid email or password');
    const ok = await bcrypt.compare(password, stakeholder.Password);
    if (!ok) throw new Error('Invalid email or password');
    return {
      success: true,
      stakeholder: {
        Stakeholder_ID: stakeholder.Stakeholder_ID,
        First_Name: stakeholder.First_Name,
        Middle_Name: stakeholder.Middle_Name,
        Last_Name: stakeholder.Last_Name,
        Email: stakeholder.Email,
        Phone_Number: stakeholder.Phone_Number,
        District_ID: stakeholder.District_ID,
        Coordinator_ID: stakeholder.Coordinator_ID,
        Province_Name: stakeholder.Province_Name
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
        First_Name: s.First_Name,
        Middle_Name: s.Middle_Name,
        Last_Name: s.Last_Name,
        Email: s.Email,
        Phone_Number: s.Phone_Number,
        District_ID: s.District_ID,
        Province_Name: s.Province_Name,
        City_Municipality: s.City_Municipality,
        Organization_Institution: s.Organization_Institution,
        Coordinator_ID: s.Coordinator_ID,
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

    // Only allow updating safe fields here
    const allowed = ['First_Name','Middle_Name','Last_Name','Email','Phone_Number','District_ID','Province_Name','City_Municipality','Organization_Institution','Coordinator_ID'];
    for (const k of Object.keys(updateData || {})) {
      if (allowed.includes(k)) s[k] = updateData[k]
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
        Coordinator_ID: saved.Coordinator_ID
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
    if (filters.district_id) query.District_ID = filters.district_id;
    if (filters.email) query.Email = { $regex: filters.email, $options: 'i' };

    const skip = (page - 1) * limit;
    const items = await Stakeholder.find(query).skip(skip).limit(limit).sort({ createdAt: -1 });
    const total = await Stakeholder.countDocuments(query);

    return {
      success: true,
      data: items.map(s => ({
        Stakeholder_ID: s.Stakeholder_ID,
        First_Name: s.First_Name,
        Middle_Name: s.Middle_Name,
        Last_Name: s.Last_Name,
        Email: s.Email,
        Phone_Number: s.Phone_Number,
        District_ID: s.District_ID,
        Province_Name: s.Province_Name,
        City_Municipality: s.City_Municipality,
        Organization_Institution: s.Organization_Institution,
        created_at: s.createdAt
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    };
  }
}

module.exports = new StakeholderService();


