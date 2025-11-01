const bcrypt = require('bcrypt');
const { BloodbankStaff, SystemAdmin, Coordinator } = require('../../models/index');

class BloodbankStaffService {
  /**
   * Authenticate user by username and password
   * Returns user data and their role-specific information
   * 
   * @param {string} username 
   * @param {string} password 
   * @returns {Object} User data with role information
   */
  async authenticateUser(username, password) {
    try {
      // Find staff by username
      const staff = await BloodbankStaff.findOne({ Username: username });

      if (!staff) {
        throw new Error('Invalid username or password');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, staff.Password);

      if (!isPasswordValid) {
        throw new Error('Invalid username or password');
      }

      // Get role-specific data
      let roleData = null;
      
      if (staff.StaffType === 'Admin') {
        const admin = await SystemAdmin.findOne({ Admin_ID: staff.ID });
        if (admin) {
          roleData = {
            type: 'Admin',
            admin_id: admin.Admin_ID,
            access_level: admin.AccessLevel
          };
        }
      } else if (staff.StaffType === 'Coordinator') {
        const coordinator = await Coordinator.findOne({ Coordinator_ID: staff.ID });
        if (coordinator) {
          roleData = {
            type: 'Coordinator',
            coordinator_id: coordinator.Coordinator_ID,
            district_id: coordinator.District_ID
          };
        }
      }

      // Return user data without password
      return {
        success: true,
        user: {
          id: staff.ID,
          username: staff.Username,
          first_name: staff.First_Name,
          middle_name: staff.Middle_Name,
          last_name: staff.Last_Name,
          email: staff.Email,
          phone_number: staff.Phone_Number,
          staff_type: staff.StaffType,
          role_data: roleData,
          created_at: staff.createdAt,
          updated_at: staff.updatedAt
        },
        message: 'Authentication successful'
      };

    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Verify password for a user
   * @param {string} userId 
   * @param {string} password 
   * @returns {boolean} True if password is correct
   */
  async verifyPassword(userId, password) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      const isPasswordValid = await bcrypt.compare(password, staff.Password);
      return isPasswordValid;

    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Change user password
   * @param {string} userId 
   * @param {string} currentPassword 
   * @param {string} newPassword 
   * @returns {Object} Success message
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, staff.Password);

      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      staff.Password = hashedNewPassword;
      await staff.save();

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      throw new Error(`Failed to change password: ${error.message}`);
    }
  }

  /**
   * Reset password (admin operation)
   * @param {string} userId 
   * @param {string} newPassword 
   * @returns {Object} Success message with new password
   */
  async resetPassword(userId, newPassword) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      staff.Password = hashedPassword;
      await staff.save();

      return {
        success: true,
        message: 'Password reset successfully',
        credentials: {
          username: staff.Username,
          password: newPassword
        }
      };

    } catch (error) {
      throw new Error(`Failed to reset password: ${error.message}`);
    }
  }

  /**
   * Get user by ID
   * @param {string} userId 
   * @returns {Object} User data
   */
  async getUserById(userId) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      // Get role-specific data
      let roleData = null;
      
      if (staff.StaffType === 'Admin') {
        const admin = await SystemAdmin.findOne({ Admin_ID: staff.ID });
        if (admin) {
          roleData = {
            type: 'Admin',
            admin_id: admin.Admin_ID,
            access_level: admin.AccessLevel
          };
        }
      } else if (staff.StaffType === 'Coordinator') {
        const coordinator = await Coordinator.findOne({ Coordinator_ID: staff.ID });
        if (coordinator) {
          roleData = {
            type: 'Coordinator',
            coordinator_id: coordinator.Coordinator_ID,
            district_id: coordinator.District_ID
          };
        }
      }

      return {
        success: true,
        user: {
          id: staff.ID,
          username: staff.Username,
          first_name: staff.First_Name,
          middle_name: staff.Middle_Name,
          last_name: staff.Last_Name,
          email: staff.Email,
          phone_number: staff.Phone_Number,
          staff_type: staff.StaffType,
          role_data: roleData,
          created_at: staff.createdAt,
          updated_at: staff.updatedAt
        }
      };

    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Get user by username
   * @param {string} username 
   * @returns {Object} User data
   */
  async getUserByUsername(username) {
    try {
      const staff = await BloodbankStaff.findOne({ Username: username });

      if (!staff) {
        throw new Error('User not found');
      }

      return {
        success: true,
        user: {
          id: staff.ID,
          username: staff.Username,
          first_name: staff.First_Name,
          middle_name: staff.Middle_Name,
          last_name: staff.Last_Name,
          email: staff.Email,
          phone_number: staff.Phone_Number,
          staff_type: staff.StaffType
        }
      };

    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Check if username is available
   * @param {string} username 
   * @returns {boolean} True if available
   */
  async isUsernameAvailable(username) {
    try {
      const existingUser = await BloodbankStaff.findOne({ Username: username });
      return !existingUser;
    } catch (error) {
      throw new Error(`Failed to check username: ${error.message}`);
    }
  }

  /**
   * Check if email is available
   * @param {string} email 
   * @returns {boolean} True if available
   */
  async isEmailAvailable(email) {
    try {
      const existingUser = await BloodbankStaff.findOne({ Email: email.toLowerCase() });
      return !existingUser;
    } catch (error) {
      throw new Error(`Failed to check email: ${error.message}`);
    }
  }

  /**
   * Update user profile
   * @param {string} userId 
   * @param {Object} updateData 
   * @returns {Object} Updated user data
   */
  async updateProfile(userId, updateData) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      // Update allowed fields
      if (updateData.First_Name) staff.First_Name = updateData.First_Name;
      if (updateData.Middle_Name !== undefined) staff.Middle_Name = updateData.Middle_Name;
      if (updateData.Last_Name) staff.Last_Name = updateData.Last_Name;
      if (updateData.Phone_Number) staff.Phone_Number = updateData.Phone_Number;

      // Email update requires validation
      if (updateData.Email && updateData.Email !== staff.Email) {
        const emailExists = await this.isEmailAvailable(updateData.Email);
        if (!emailExists) {
          throw new Error('Email already in use');
        }
        staff.Email = updateData.Email.toLowerCase();
      }

      await staff.save();

      return {
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: staff.ID,
          username: staff.Username,
          first_name: staff.First_Name,
          middle_name: staff.Middle_Name,
          last_name: staff.Last_Name,
          email: staff.Email,
          phone_number: staff.Phone_Number,
          staff_type: staff.StaffType
        }
      };

    } catch (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }

  /**
   * Get full name of user
   * @param {string} userId 
   * @returns {string} Full name
   */
  async getFullName(userId) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: userId });

      if (!staff) {
        throw new Error('User not found');
      }

      const parts = [staff.First_Name];
      if (staff.Middle_Name) {
        parts.push(staff.Middle_Name);
      }
      parts.push(staff.Last_Name);

      return parts.join(' ');

    } catch (error) {
      throw new Error(`Failed to get full name: ${error.message}`);
    }
  }

  /**
   * Search users by name or username
   * @param {string} searchTerm 
   * @param {number} limit 
   * @returns {Array} List of matching users
   */
  async searchUsers(searchTerm, limit = 10) {
    try {
      const users = await BloodbankStaff.find({
        $or: [
          { First_Name: { $regex: searchTerm, $options: 'i' } },
          { Last_Name: { $regex: searchTerm, $options: 'i' } },
          { Username: { $regex: searchTerm, $options: 'i' } }
        ]
      })
      .limit(limit)
      .select('ID Username First_Name Middle_Name Last_Name Email StaffType');

      return {
        success: true,
        users: users
      };

    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Check if staff ID exists and is valid
   * @param {string} staffId 
   * @returns {boolean} True if exists
   */
  async staffExists(staffId) {
    try {
      const staff = await BloodbankStaff.findOne({ ID: staffId });
      return !!staff;
    } catch (error) {
      throw new Error(`Failed to check staff: ${error.message}`);
    }
  }
}

module.exports = new BloodbankStaffService();

