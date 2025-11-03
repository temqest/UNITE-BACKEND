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
    if (stakeholderData.Registration_Code) {
      const code = await RegistrationCode.findOne({ Code: stakeholderData.Registration_Code });
      if (!code) throw new Error('Invalid registration code');
      if (!code.IsActive) throw new Error('Registration code is inactive');
      if (code.Expires_At && code.Expires_At < new Date()) throw new Error('Registration code expired');
      if (code.Uses >= code.Max_Uses) throw new Error('Registration code usage limit reached');

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
      District_ID: effectiveDistrict.District_ID
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
        Province_Name: stakeholder.Province_Name
      }
    };
  }
}

module.exports = new StakeholderService();


