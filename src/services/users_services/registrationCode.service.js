const { RegistrationCode, Coordinator, District } = require('../../models/index');

class RegistrationCodeService {
  generateCode() {
    // Generate a 6-character alphanumeric code that contains at least one letter and one number
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const digits = '0123456789'
    const all = letters + digits
    let code = ''
    // ensure at least one letter and one digit
    code += letters.charAt(Math.floor(Math.random() * letters.length))
    code += digits.charAt(Math.floor(Math.random() * digits.length))
    for (let i = 2; i < 6; i++) {
      code += all.charAt(Math.floor(Math.random() * all.length))
    }
    // shuffle the characters so letter/digit are not predictable at start
    code = code.split('').sort(() => 0.5 - Math.random()).join('')
    return code
  }

  async createCode(coordinatorId, { districtId, maxUses = 1, expiresAt = null }) {
    const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
    if (!coordinator) throw new Error('Coordinator not found');
    const district = await District.findOne({ District_ID: districtId || coordinator.District_ID });
    if (!district) throw new Error('Invalid District ID');

    const code = this.generateCode();
    const regCode = new RegistrationCode({
      Code: code,
      Coordinator_ID: coordinatorId,
      District_ID: district.District_ID,
      Max_Uses: maxUses,
      Expires_At: expiresAt || null
    });
    const saved = await regCode.save();
    return { success: true, code: saved };
  }

  async listCodes(coordinatorId) {
    const codes = await RegistrationCode.find({ Coordinator_ID: coordinatorId }).sort({ createdAt: -1 });
    return { success: true, codes };
  }

  async deactivate(code) {
    const found = await RegistrationCode.findOne({ Code: code });
    if (!found) throw new Error('Code not found');
    found.IsActive = false;
    await found.save();
    return { success: true };
  }

  async validate(code) {
    const found = await RegistrationCode.findOne({ Code: code });
    if (!found) throw new Error('Invalid code');
    if (!found.IsActive) throw new Error('Registration code is inactive');
    if (found.Expires_At && found.Expires_At < new Date()) throw new Error('Registration code expired');
    if (found.Uses >= found.Max_Uses) throw new Error('Registration code usage limit reached');
    return { success: true, code: found };
  }
}

module.exports = new RegistrationCodeService();


