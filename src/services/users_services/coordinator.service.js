const bcrypt = require('bcrypt');
const { BloodbankStaff, Coordinator, District, EventRequest, Event, Notification } = require('../../models/index');

class CoordinatorService {
  /**
   * Generate a unique coordinator ID
   * @returns {string} Unique coordinator ID
   */
  generateCoordinatorID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `COORD_${timestamp}_${random}`;
  }

  /**
   * Create a new coordinator account
   * Called by SystemAdmin to create coordinator accounts
   * 
   * @param {Object} staffData - BloodbankStaff data
   * @param {Object} coordinatorData - Coordinator specific data
   * @param {string} createdByAdminId - SystemAdmin who is creating this account
   * @returns {Object} Created coordinator data with credentials
   */
  async createCoordinatorAccount(staffData, coordinatorData, createdByAdminId) {
    try {
      // Validate inputs
      if (!staffData || !coordinatorData) {
        throw new Error('Staff data and coordinator data are required');
      }

      // Validate that district exists
      const district = await District.findOne({ District_ID: coordinatorData.District_ID });
      if (!district) {
        throw new Error('Invalid District ID. District does not exist');
      }

      // Check if email already exists
      const existingStaff = await BloodbankStaff.findOne({
        Email: staffData.Email
      });

      if (existingStaff) {
        throw new Error('Email already exists');
      }

      // Generate unique coordinator ID
      const coordinatorId = this.generateCoordinatorID();

      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(staffData.Password, saltRounds);

      // Create BloodbankStaff record (no Username)
      const bloodbankStaff = new BloodbankStaff({
        ID: coordinatorId,
        First_Name: staffData.First_Name,
        Middle_Name: staffData.Middle_Name || null,
        Last_Name: staffData.Last_Name,
        Email: staffData.Email,
        Phone_Number: staffData.Phone_Number,
        Password: hashedPassword,
        StaffType: 'Coordinator'
      });

      const savedStaff = await bloodbankStaff.save();

      // Create Coordinator record
      const coordinator = new Coordinator({
        Coordinator_ID: coordinatorId,
        District_ID: coordinatorData.District_ID,
        Province_Name: coordinatorData.Province_Name || null
      });

      const savedCoordinator = await coordinator.save();

      // Return coordinator data with credentials (without password hash)
      return {
        success: true,
        coordinator: {
          Coordinator_ID: savedCoordinator.Coordinator_ID,
          District_ID: savedCoordinator.District_ID,
          District: district,
          Staff: {
            ID: savedStaff.ID,
            First_Name: savedStaff.First_Name,
            Middle_Name: savedStaff.Middle_Name,
            Last_Name: savedStaff.Last_Name,
            Email: savedStaff.Email,
            Phone_Number: savedStaff.Phone_Number,
            StaffType: savedStaff.StaffType,
            created_at: savedStaff.createdAt,
            updated_at: savedStaff.updatedAt
          },
          created_at: savedCoordinator.createdAt,
          updated_at: savedCoordinator.updatedAt
        },
        credentials: {
          Email: staffData.Email,
          Password: staffData.Password // Return plain password for admin to provide to coordinator
        },
        created_by: createdByAdminId,
        message: 'Coordinator account created successfully'
      };

    } catch (error) {
      throw new Error(`Failed to create coordinator account: ${error.message}`);
    }
  }

  /**
   * Get coordinator by ID with full details
   * @param {string} coordinatorId 
   * @returns {Object} Coordinator data
   */
  async getCoordinatorById(coordinatorId) {
    try {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      
      if (!coordinator) {
        throw new Error('Coordinator not found');
      }

      const staff = await BloodbankStaff.findOne({ ID: coordinatorId });
      if (!staff) {
        throw new Error('Staff record not found for this coordinator');
      }

      const district = await District.findOne({ District_ID: coordinator.District_ID });
      if (!district) {
        throw new Error('District not found');
      }

      return {
        success: true,
        coordinator: {
          Coordinator_ID: coordinator.Coordinator_ID,
          District_ID: coordinator.District_ID,
          District: district,
          Staff: {
            ID: staff.ID,
            First_Name: staff.First_Name,
            Middle_Name: staff.Middle_Name,
            Last_Name: staff.Last_Name,
            Email: staff.Email,
            Phone_Number: staff.Phone_Number,
            StaffType: staff.StaffType,
            created_at: staff.createdAt,
            updated_at: staff.updatedAt
          },
          created_at: coordinator.createdAt,
          updated_at: coordinator.updatedAt
        }
      };

    } catch (error) {
      throw new Error(`Failed to get coordinator: ${error.message}`);
    }
  }

  /**
   * Get all coordinators with filtering and pagination
   * @param {Object} filters - Filter options
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Object} List of coordinators
   */
  async getAllCoordinators(filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      if (filters.district_id) {
        query.District_ID = filters.district_id;
      }

      const coordinators = await Coordinator.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await Coordinator.countDocuments(query);

      // Get full details for each coordinator
      const coordinatorDetails = await Promise.all(
        coordinators.map(async (coord) => {
          const staff = await BloodbankStaff.findOne({ ID: coord.Coordinator_ID });
          const district = await District.findOne({ District_ID: coord.District_ID });
          
          return {
            Coordinator_ID: coord.Coordinator_ID,
            District_ID: coord.District_ID,
            District: district || null,
            Staff: staff ? {
              First_Name: staff.First_Name,
              Middle_Name: staff.Middle_Name,
              Last_Name: staff.Last_Name,
              Email: staff.Email,
              Phone_Number: staff.Phone_Number
            } : null
          };
        })
      );

      return {
        success: true,
        coordinators: coordinatorDetails,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get coordinators: ${error.message}`);
    }
  }

  /**
   * Update coordinator information
   * @param {string} coordinatorId 
   * @param {Object} updateData 
   * @returns {Object} Updated coordinator data
   */
  async updateCoordinator(coordinatorId, updateData) {
    try {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      
      if (!coordinator) {
        throw new Error('Coordinator not found');
      }

      const staff = await BloodbankStaff.findOne({ ID: coordinatorId });
      if (!staff) {
        throw new Error('Staff record not found');
      }

      const updates = {};

      // Update district if provided
      if (updateData.District_ID) {
        const district = await District.findOne({ District_ID: updateData.District_ID });
        if (!district) {
          throw new Error('Invalid District ID');
        }
        coordinator.District_ID = updateData.District_ID;
        await coordinator.save();
      }

      // Update province name if provided
      if (updateData.Province_Name !== undefined) {
        coordinator.Province_Name = updateData.Province_Name;
        await coordinator.save();
      }

      // Update staff information
      if (updateData.First_Name) staff.First_Name = updateData.First_Name;
      if (updateData.Middle_Name !== undefined) staff.Middle_Name = updateData.Middle_Name;
      if (updateData.Last_Name) staff.Last_Name = updateData.Last_Name;
      if (updateData.Email) staff.Email = updateData.Email;
      if (updateData.Phone_Number) staff.Phone_Number = updateData.Phone_Number;

      // If password is being updated, hash it
      if (updateData.Password) {
        const saltRounds = 10;
        staff.Password = await bcrypt.hash(updateData.Password, saltRounds);
      }

      await staff.save();

      const district = await District.findOne({ District_ID: coordinator.District_ID });

      return {
        success: true,
        message: 'Coordinator updated successfully',
        coordinator: {
          Coordinator_ID: coordinator.Coordinator_ID,
          District_ID: coordinator.District_ID,
          District: district,
          Staff: {
            ID: staff.ID,
            First_Name: staff.First_Name,
            Middle_Name: staff.Middle_Name,
            Last_Name: staff.Last_Name,
            Email: staff.Email,
            Phone_Number: staff.Phone_Number,
            StaffType: staff.StaffType
          }
        }
      };

    } catch (error) {
      throw new Error(`Failed to update coordinator: ${error.message}`);
    }
  }

  /**
   * Get coordinator dashboard data
   * Includes pending events, upcoming events, notifications, stats
   * @param {string} coordinatorId 
   * @returns {Object} Dashboard data
   */
  async getCoordinatorDashboard(coordinatorId) {
    try {
      const coordinator = await this.getCoordinatorById(coordinatorId);
      
      // Get pending requests
      const pendingRequests = await EventRequest.find({
        Coordinator_ID: coordinatorId,
        Status: 'Pending_Admin_Review'
      }).sort({ createdAt: -1 });

      // Get approved/accepted events
      const acceptedEvents = await EventRequest.find({
        Coordinator_ID: coordinatorId,
        Status: { $in: ['Accepted_By_Admin', 'Rescheduled_By_Admin'] }
      }).sort({ createdAt: -1 });

      // Get upcoming completed events
      const upcomingEvents = await EventRequest.find({
        Coordinator_ID: coordinatorId,
        Status: 'Completed',
        'AdminActionDate': { $gte: new Date() }
      })
      .sort({ 'AdminActionDate': 1 })
      .limit(5);

      // Get unread notifications
      const unreadNotifications = await Notification.find({
        Recipient_ID: coordinatorId,
        RecipientType: 'Coordinator',
        IsRead: false
      }).sort({ createdAt: -1 }).limit(10);

      // Get event counts
      const totalRequests = await EventRequest.countDocuments({ Coordinator_ID: coordinatorId });
      const completedEvents = await EventRequest.countDocuments({
        Coordinator_ID: coordinatorId,
        Status: 'Completed'
      });
      const rejectedEvents = await EventRequest.countDocuments({
        Coordinator_ID: coordinatorId,
        Status: 'Rejected'
      });

      return {
        success: true,
        dashboard: {
          coordinator: coordinator.coordinator,
          stats: {
            total_requests: totalRequests,
            pending_requests: pendingRequests.length,
            completed_events: completedEvents,
            rejected_events: rejectedEvents,
            unread_notifications: unreadNotifications.length
          },
          pending_requests: pendingRequests,
          waiting_confirmation: acceptedEvents,
          upcoming_events: upcomingEvents,
          unread_notifications: unreadNotifications
        }
      };

    } catch (error) {
      throw new Error(`Failed to get dashboard: ${error.message}`);
    }
  }

  /**
   * Delete/deactivate coordinator account
   * @param {string} coordinatorId 
   * @returns {Object} Success message
   */
  async deleteCoordinator(coordinatorId) {
    try {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      
      if (!coordinator) {
        throw new Error('Coordinator not found');
      }

      // Check if coordinator has active events
      const activeEvents = await EventRequest.find({
        Coordinator_ID: coordinatorId,
        Status: { $nin: ['Completed', 'Rejected'] }
      });

      if (activeEvents.length > 0) {
        throw new Error('Cannot delete coordinator with active events. Please complete or cancel events first.');
      }

      // Delete coordinator record
      await Coordinator.deleteOne({ Coordinator_ID: coordinatorId });
      
      // Delete staff record
      await BloodbankStaff.deleteOne({ ID: coordinatorId });

      return {
        success: true,
        message: 'Coordinator deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete coordinator: ${error.message}`);
    }
  }

  /**
   * Get coordinator events history
   * @param {string} coordinatorId 
   * @param {Object} filters 
   * @param {number} page 
   * @param {number} limit 
   * @returns {Object} Event history
   */
  async getCoordinatorEventHistory(coordinatorId, filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      const query = { Coordinator_ID: coordinatorId };
      
      if (filters.status) {
        query.Status = filters.status;
      }

      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) query.createdAt.$gte = new Date(filters.date_from);
        if (filters.date_to) query.createdAt.$lte = new Date(filters.date_to);
      }

      const eventRequests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await EventRequest.countDocuments(query);

      return {
        success: true,
        events: eventRequests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get event history: ${error.message}`);
    }
  }
}

module.exports = new CoordinatorService();

