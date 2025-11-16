const bcrypt = require('bcrypt');
const { BloodbankStaff, SystemAdmin, Coordinator, District, EventRequest, Event, Notification } = require('../../models/index');
const coordinatorService = require('./coordinator.service');
const notificationService = require('../utility_services/notification.service');

class SystemAdminService {
  /**
   * Generate a unique admin ID
   * @returns {string} Unique admin ID
   */
  generateAdminID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `ADMIN_${timestamp}_${random}`;
  }

  /**
   * Create a new system admin account
   * @param {Object} staffData - BloodbankStaff data
   * @param {Object} adminData - SystemAdmin specific data
   * @param {string} createdByAdminId - Admin who is creating this account (optional, for first admin)
   * @returns {Object} Created admin data
   */
  async createSystemAdminAccount(staffData, adminData, createdByAdminId = null) {
    try {
      // Validate inputs
      if (!staffData || !adminData) {
        throw new Error('Staff data and admin data are required');
      }

      // Check if email already exists
      const existingStaff = await BloodbankStaff.findOne({
        Email: staffData.Email
      });

      if (existingStaff) {
        throw new Error('Email already exists');
      }

      // Generate unique admin ID
      const adminId = this.generateAdminID();

      // Hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(staffData.Password, saltRounds);

      // Create BloodbankStaff record (no Username)
      const bloodbankStaff = new BloodbankStaff({
        ID: adminId,
        First_Name: staffData.First_Name,
        Middle_Name: staffData.Middle_Name || null,
        Last_Name: staffData.Last_Name,
        Email: staffData.Email,
        Phone_Number: staffData.Phone_Number,
        Password: hashedPassword,
        StaffType: 'Admin'
      });

      const savedStaff = await bloodbankStaff.save();

      // Create SystemAdmin record
      const systemAdmin = new SystemAdmin({
        Admin_ID: adminId,
        AccessLevel: adminData.AccessLevel
      });

      const savedAdmin = await systemAdmin.save();

      return {
        success: true,
        admin: {
          Admin_ID: savedAdmin.Admin_ID,
          AccessLevel: savedAdmin.AccessLevel,
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
          created_at: savedAdmin.createdAt,
          updated_at: savedAdmin.updatedAt
        },
        credentials: { Email: staffData.Email, Password: staffData.Password },
        message: 'System Admin account created successfully'
      };

    } catch (error) {
      throw new Error(`Failed to create admin account: ${error.message}`);
    }
  }

  /**
   * Get admin by ID with full details
   * @param {string} adminId 
   * @returns {Object} Admin data
   */
  async getAdminById(adminId) {
    try {
      const admin = await SystemAdmin.findOne({ Admin_ID: adminId });
      
      if (!admin) {
        throw new Error('Admin not found');
      }

      const staff = await BloodbankStaff.findOne({ ID: adminId });
      if (!staff) {
        throw new Error('Staff record not found for this admin');
      }

      return {
        success: true,
        admin: {
          Admin_ID: admin.Admin_ID,
          AccessLevel: admin.AccessLevel,
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
          created_at: admin.createdAt,
          updated_at: admin.updatedAt
        }
      };

    } catch (error) {
      throw new Error(`Failed to get admin: ${error.message}`);
    }
  }

  /**
   * Get all admins
   * @returns {Object} List of admins
   */
  async getAllAdmins() {
    try {
      const admins = await SystemAdmin.find().sort({ createdAt: -1 });

      const adminDetails = await Promise.all(
        admins.map(async (admin) => {
          const staff = await BloodbankStaff.findOne({ ID: admin.Admin_ID });
          
          return {
            Admin_ID: admin.Admin_ID,
            AccessLevel: admin.AccessLevel,
            Staff: staff ? {
              First_Name: staff.First_Name,
              Middle_Name: staff.Middle_Name,
              Last_Name: staff.Last_Name,
              Email: staff.Email,
              Phone_Number: staff.Phone_Number,
              created_at: staff.createdAt
            } : null
          };
        })
      );

      return {
        success: true,
        admins: adminDetails
      };

    } catch (error) {
      throw new Error(`Failed to get admins: ${error.message}`);
    }
  }

  /**
   * Update admin information
   * @param {string} adminId 
   * @param {Object} updateData 
   * @returns {Object} Updated admin data
   */
  async updateAdmin(adminId, updateData) {
    try {
      const admin = await SystemAdmin.findOne({ Admin_ID: adminId });
      
      if (!admin) {
        throw new Error('Admin not found');
      }

      const staff = await BloodbankStaff.findOne({ ID: adminId });
      if (!staff) {
        throw new Error('Staff record not found');
      }

      // Update access level if provided
      if (updateData.AccessLevel) {
        admin.AccessLevel = updateData.AccessLevel;
        await admin.save();
      }


      // Compute diffs for notification
      const changedFields = [];
      if (updateData.First_Name && updateData.First_Name !== staff.First_Name) changedFields.push('First_Name');
      if (updateData.Middle_Name !== undefined && updateData.Middle_Name !== staff.Middle_Name) changedFields.push('Middle_Name');
      if (updateData.Last_Name && updateData.Last_Name !== staff.Last_Name) changedFields.push('Last_Name');
      if (updateData.Email && updateData.Email !== staff.Email) changedFields.push('Email');
      if (updateData.Phone_Number && updateData.Phone_Number !== staff.Phone_Number) changedFields.push('Phone_Number');
      const passwordChanged = !!(updateData.Password && updateData.Password.length > 0);
      if (passwordChanged) changedFields.push('Password');

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

      // If admin changed their own profile (or an admin was updated), create a notification summarizing changed fields
      try {
        if (changedFields.length > 0) {
          const title = 'Profile Updated';
          // Avoid putting raw password in message
          const readableFields = changedFields.map(f => (f === 'Password' ? 'Password (changed)' : f)).join(', ');
          const message = `The following fields were updated: ${readableFields}`;

          // Use a synthetic Request_ID for profile changes so the Notification schema's required field is satisfied
          const requestId = `PROFILE_EDIT_${adminId}_${Date.now()}`;

          await notificationService.createNotification({
            Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
            Recipient_ID: adminId,
            RecipientType: 'Admin',
            Request_ID: requestId,
            Event_ID: null,
            Title: title,
            Message: message,
            NotificationType: 'RequestCompleted',
            IsRead: false
          });
        }
      } catch (notifErr) {
        // Don't block admin update if notification creation fails; just log
        console.warn('Failed to create profile update notification:', notifErr.message || notifErr);
      }

      return {
        success: true,
        message: 'Admin updated successfully',
        admin: {
          Admin_ID: admin.Admin_ID,
          AccessLevel: admin.AccessLevel,
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
      throw new Error(`Failed to update admin: ${error.message}`);
    }
  }

  /**
   * Get admin dashboard with comprehensive stats
   * @param {string} adminId 
   * @returns {Object} Dashboard data
   */
  async getAdminDashboard(adminId) {
    try {
      // Get all coordinators
      const allCoordinators = await Coordinator.countDocuments();
      
      // Get all districts
      const allDistricts = await District.countDocuments();

      // Get pending requests
      const pendingRequests = await EventRequest.find({
        Status: 'Pending_Admin_Review'
      }).sort({ createdAt: -1 }).limit(10);

      // Get event counts by status
      const totalRequests = await EventRequest.countDocuments();
      const pendingCount = await EventRequest.countDocuments({ Status: 'Pending_Admin_Review' });
      const acceptedCount = await EventRequest.countDocuments({ Status: 'Accepted_By_Admin' });
      const rescheduledCount = await EventRequest.countDocuments({ Status: 'Rescheduled_By_Admin' });
      const rejectedCount = await EventRequest.countDocuments({ Status: 'Rejected_By_Admin' });
      const completedCount = await EventRequest.countDocuments({ Status: 'Completed' });
      const finallyRejectedCount = await EventRequest.countDocuments({ Status: 'Rejected' });

      // Get upcoming events (next 7 days)
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const upcomingEvents = await EventRequest.find({
        Status: 'Completed',
        'CoordinatorFinalActionDate': { $gte: new Date(), $lte: sevenDaysFromNow }
      })
      .sort({ 'CoordinatorFinalActionDate': 1 })
      .limit(10);

      // Get unread notifications
      const unreadNotifications = await Notification.find({
        Recipient_ID: adminId,
        RecipientType: 'Admin',
        IsRead: false
      }).sort({ createdAt: -1 }).limit(10);

      // Get today's statistics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayEvents = await EventRequest.countDocuments({
        Status: 'Completed',
        'CoordinatorFinalActionDate': { $gte: today, $lt: tomorrow }
      });

      const todayRequests = await EventRequest.countDocuments({
        createdAt: { $gte: today, $lt: tomorrow }
      });

      // Get recent activity (last 10 actions)
      const recentActivity = await EventRequest.find({})
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('Request_ID Coordinator_ID Status AdminAction CoordinatorFinalAction updatedAt');

      return {
        success: true,
        dashboard: {
          stats: {
            total_coordinators: allCoordinators,
            total_districts: allDistricts,
            total_requests: totalRequests,
            pending_requests: pendingCount,
            accepted_events: acceptedCount,
            rescheduled_events: rescheduledCount,
            rejected_events: rejectedCount,
            completed_events: completedCount,
            finally_rejected: finallyRejectedCount,
            today_events: todayEvents,
            today_requests: todayRequests,
            unread_notifications: unreadNotifications.length
          },
          pending_requests: pendingRequests,
          upcoming_events: upcomingEvents,
          unread_notifications: unreadNotifications,
          recent_activity: recentActivity
        }
      };

    } catch (error) {
      throw new Error(`Failed to get dashboard: ${error.message}`);
    }
  }

  /**
   * Get system-wide statistics
   * @returns {Object} Statistics data
   */
  async getSystemStatistics() {
    try {
      // Count by model
      const totalAdmins = await SystemAdmin.countDocuments();
      const totalCoordinators = await Coordinator.countDocuments();
      const totalDistricts = await District.countDocuments();
      const totalEvents = await Event.countDocuments();
      const totalRequests = await EventRequest.countDocuments();
      const totalNotifications = await Notification.countDocuments();

      // Event distribution by status
      const eventStatusDistribution = {
        pending: await EventRequest.countDocuments({ Status: 'Pending_Admin_Review' }),
        accepted: await EventRequest.countDocuments({ Status: 'Accepted_By_Admin' }),
        rescheduled: await EventRequest.countDocuments({ Status: 'Rescheduled_By_Admin' }),
        rejected: await EventRequest.countDocuments({ Status: 'Rejected_By_Admin' }),
        completed: await EventRequest.countDocuments({ Status: 'Completed' }),
        finally_rejected: await EventRequest.countDocuments({ Status: 'Rejected' })
      };

      // Notification distribution
      const notificationStats = {
        total: totalNotifications,
        read: await Notification.countDocuments({ IsRead: true }),
        unread: await Notification.countDocuments({ IsRead: false }),
        by_recipient_type: {
          admin: await Notification.countDocuments({ RecipientType: 'Admin' }),
          coordinator: await Notification.countDocuments({ RecipientType: 'Coordinator' })
        }
      };

      // Time-based statistics (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentRequests = await EventRequest.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });

      const recentEvents = await Event.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });

      return {
        success: true,
        statistics: {
          overview: {
            total_admins: totalAdmins,
            total_coordinators: totalCoordinators,
            total_districts: totalDistricts,
            total_events: totalEvents,
            total_requests: totalRequests,
            total_notifications: totalNotifications
          },
          event_status_distribution: eventStatusDistribution,
          notification_statistics: notificationStats,
          recent_activity: {
            requests_last_30_days: recentRequests,
            events_last_30_days: recentEvents
          }
        }
      };

    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * Delete admin account
   * Prevents deletion if there's only one admin
   * @param {string} adminId 
   * @returns {Object} Success message
   */
  async deleteAdmin(adminId) {
    try {
      const admin = await SystemAdmin.findOne({ Admin_ID: adminId });
      
      if (!admin) {
        throw new Error('Admin not found');
      }

      // Prevent deletion if this is the only admin
      const adminCount = await SystemAdmin.countDocuments();
      if (adminCount <= 1) {
        throw new Error('Cannot delete the last remaining admin');
      }

      // Check if admin has processed requests
      const adminRequests = await EventRequest.countDocuments({
        Admin_ID: adminId
      });

      if (adminRequests > 0) {
        throw new Error('Cannot delete admin with processed requests. Consider deactivating instead.');
      }

      // Delete admin record
      await SystemAdmin.deleteOne({ Admin_ID: adminId });
      
      // Delete staff record
      await BloodbankStaff.deleteOne({ ID: adminId });

      return {
        success: true,
        message: 'Admin deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete admin: ${error.message}`);
    }
  }

  /**
   * Get all coordinators under this admin's management
   * @param {string} adminId 
   * @returns {Object} List of coordinators
   */
  async getManagedCoordinators(adminId, page = 1, limit = 10) {
    try {
      return await coordinatorService.getAllCoordinators({}, page, limit);
    } catch (error) {
      throw new Error(`Failed to get coordinators: ${error.message}`);
    }
  }

  /**
   * Create a coordinator account (delegates to CoordinatorService)
   * @param {Object} staffData 
   * @param {Object} coordinatorData 
   * @param {string} createdByAdminId 
   * @returns {Object} Created coordinator
   */
  async createCoordinatorAccount(staffData, coordinatorData, createdByAdminId) {
    try {
      return await coordinatorService.createCoordinatorAccount(staffData, coordinatorData, createdByAdminId);
    } catch (error) {
      throw new Error(`Failed to create coordinator account: ${error.message}`);
    }
  }

  /**
   * Get requests requiring admin attention
   * @param {string} adminId 
   * @param {number} limit 
   * @returns {Object} Requests needing attention
   */
  async getRequestsRequiringAttention(adminId, limit = 20) {
    try {
      // Get pending requests
      const pendingRequests = await EventRequest.find({
        Status: 'Pending_Admin_Review'
      })
      .sort({ createdAt: 1 }) // Oldest first
      .limit(limit);

      // Get requests waiting for admin final confirmation
      const waitingFinalConfirmation = await EventRequest.find({
        Status: { $in: ['Accepted_By_Admin', 'Rescheduled_By_Admin'] },
        CoordinatorFinalAction: { $ne: null }
      })
      .sort({ 'CoordinatorFinalActionDate': 1 })
      .limit(limit);

      return {
        success: true,
        requests: {
          pending_review: pendingRequests,
          awaiting_final_confirmation: waitingFinalConfirmation
        }
      };

    } catch (error) {
      throw new Error(`Failed to get requests: ${error.message}`);
    }
  }
}

module.exports = new SystemAdminService();

