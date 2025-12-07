/**
 * Reviewer Assignment Service
 * 
 * Handles configurable reviewer assignment based on requester role and business rules.
 */

const { SystemAdmin, Coordinator, Stakeholder } = require('../../models/index');
const { REVIEWER_ASSIGNMENT_RULES, ROLES } = require('./requestStateMachine');

class ReviewerAssignmentService {
  /**
   * Assign a reviewer to a request based on the requester's role
   * @param {string} requesterRole - Role of the person creating the request
   * @param {string} requesterId - ID of the requester
   * @param {Object} context - Additional context (coordinatorId, stakeholderId, etc.)
   * @returns {Promise<Object>} Reviewer assignment { id, role, name, autoAssigned }
   */
  async assignReviewer(requesterRole, requesterId, context = {}) {
    const normalizedRole = this.normalizeRole(requesterRole);
    const assignmentRule = REVIEWER_ASSIGNMENT_RULES[normalizedRole];

    if (!assignmentRule) {
      throw new Error(`No reviewer assignment rule found for role: ${requesterRole}`);
    }

    const { reviewerRole, allowAdminOverride, fallbackReviewer } = assignmentRule;

    try {
      let reviewer = null;

      // SystemAdmin creates request -> Coordinator becomes reviewer
      // IMPORTANT: Even if a stakeholder is involved, the reviewer is always the coordinator
      if (normalizedRole === ROLES.SYSTEM_ADMIN) {
        reviewer = await this.assignCoordinatorReviewer(context.coordinatorId);
        // Ensure reviewer is coordinator, not stakeholder (even if stakeholder is involved)
        if (reviewer && reviewer.role !== ROLES.COORDINATOR) {
          // If somehow a non-coordinator was assigned, reassign to coordinator
          reviewer = await this.assignCoordinatorReviewer(context.coordinatorId);
        }
      }
      // Coordinator creates request -> SystemAdmin becomes reviewer
      else if (normalizedRole === ROLES.COORDINATOR) {
        reviewer = await this.assignSystemAdminReviewer();
      }
      // Stakeholder creates request -> Coordinator becomes primary reviewer
      else if (normalizedRole === ROLES.STAKEHOLDER) {
        reviewer = await this.assignCoordinatorForStakeholder(
          context.stakeholderId || requesterId,
          context.coordinatorId
        );
      }

      if (!reviewer) {
        // Fallback to system admin if available
        if (fallbackReviewer === ROLES.SYSTEM_ADMIN) {
          reviewer = await this.assignSystemAdminReviewer();
        }
        
        if (!reviewer) {
          throw new Error('Unable to assign reviewer: no suitable reviewer found');
        }
      }

      return {
        ...reviewer,
        autoAssigned: true,
        allowAdminOverride: allowAdminOverride || false
      };
    } catch (error) {
      throw new Error(`Failed to assign reviewer: ${error.message}`);
    }
  }

  /**
   * Assign a coordinator as reviewer
   * @param {string} coordinatorId - Specific coordinator ID (optional)
   * @returns {Promise<Object>} Reviewer assignment
   */
  async assignCoordinatorReviewer(coordinatorId = null) {
    let coordinator = null;

    if (coordinatorId) {
      coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId }).lean().exec();
    }

    if (!coordinator) {
      // Find any available coordinator
      coordinator = await Coordinator.findOne().lean().exec();
    }

    if (!coordinator) {
      throw new Error('No coordinator available to assign as reviewer');
    }

    const name = await this.getCoordinatorName(coordinator.Coordinator_ID);

    return {
      id: coordinator.Coordinator_ID,
      role: ROLES.COORDINATOR,
      name: name || null
    };
  }

  /**
   * Assign a system admin as reviewer
   * @returns {Promise<Object>} Reviewer assignment
   */
  async assignSystemAdminReviewer() {
    const admin = await SystemAdmin.findOne().lean().exec();

    if (!admin) {
      throw new Error('No system administrator available to assign as reviewer');
    }

    const name = `${admin.First_Name || admin.firstName || ''} ${admin.Last_Name || admin.lastName || ''}`.trim() || 
                 admin.FullName || null;

    return {
      id: admin.Admin_ID,
      role: ROLES.SYSTEM_ADMIN,
      name: name || null
    };
  }

  /**
   * Assign coordinator for stakeholder request
   * @param {string} stakeholderId - Stakeholder ID
   * @param {string} coordinatorId - Specific coordinator ID (optional)
   * @returns {Promise<Object>} Reviewer assignment
   */
  async assignCoordinatorForStakeholder(stakeholderId, coordinatorId = null) {
    // If coordinatorId is provided, use it
    if (coordinatorId) {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId }).lean().exec();
      if (coordinator) {
        const name = await this.getCoordinatorName(coordinator.Coordinator_ID);
        return {
          id: coordinator.Coordinator_ID,
          role: ROLES.COORDINATOR,
          name: name || null
        };
      }
    }

    // Try to find coordinator from stakeholder relationship
    if (stakeholderId) {
      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId }).lean().exec();
      if (stakeholder && stakeholder.Coordinator_ID) {
        const coordinator = await Coordinator.findOne({ Coordinator_ID: stakeholder.Coordinator_ID }).lean().exec();
        if (coordinator) {
          const name = await this.getCoordinatorName(coordinator.Coordinator_ID);
          return {
            id: coordinator.Coordinator_ID,
            role: ROLES.COORDINATOR,
            name: name || null
          };
        }
      }
    }

    // Fallback: assign any available coordinator
    return this.assignCoordinatorReviewer();
  }

  /**
   * Get coordinator display name
   * @param {string} coordinatorId - Coordinator ID
   * @returns {Promise<string|null>} Coordinator name
   */
  async getCoordinatorName(coordinatorId) {
    try {
      const BloodbankStaff = require('../../models/index').BloodbankStaff;
      const staff = await BloodbankStaff.findOne({ ID: coordinatorId }).lean().exec();
      if (staff) {
        const first = staff.First_Name || staff.firstName || '';
        const last = staff.Last_Name || staff.lastName || '';
        return `${first} ${last}`.trim() || staff.FullName || null;
      }
      
      // Fallback to coordinator name
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId }).lean().exec();
      if (coordinator) {
        return coordinator.Coordinator_Name || coordinator.Name || null;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Override reviewer assignment (admin override)
   * @param {string} requestId - Request ID
   * @param {string} newReviewerId - New reviewer ID
   * @param {string} newReviewerRole - New reviewer role
   * @param {string} overrideBy - ID of admin performing override
   * @param {string} overrideByRole - Role of admin performing override
   * @returns {Promise<Object>} Updated reviewer assignment
   */
  async overrideReviewer(requestId, newReviewerId, newReviewerRole, overrideBy, overrideByRole) {
    // Only admins can override
    const normalizedRole = this.normalizeRole(overrideByRole);
    if (normalizedRole !== ROLES.SYSTEM_ADMIN) {
      throw new Error('Only system administrators can override reviewer assignments');
    }

    const normalizedReviewerRole = this.normalizeRole(newReviewerRole);
    let reviewerName = null;

    if (normalizedReviewerRole === ROLES.COORDINATOR) {
      reviewerName = await this.getCoordinatorName(newReviewerId);
    } else if (normalizedReviewerRole === ROLES.SYSTEM_ADMIN) {
      const admin = await SystemAdmin.findOne({ Admin_ID: newReviewerId }).lean().exec();
      if (admin) {
        reviewerName = `${admin.First_Name || ''} ${admin.Last_Name || ''}`.trim() || admin.FullName || null;
      }
    }

    return {
      id: newReviewerId,
      role: normalizedReviewerRole,
      name: reviewerName,
      autoAssigned: false,
      overriddenAt: new Date(),
      overriddenBy: {
        id: overrideBy,
        role: overrideByRole,
        name: null // Can be populated if needed
      }
    };
  }

  /**
   * Normalize role to canonical form
   */
  normalizeRole(role) {
    if (!role) return null;
    
    const r = String(role).toLowerCase();
    if (r === 'admin' || r === 'systemadmin' || r === 'sysadmin') {
      return ROLES.SYSTEM_ADMIN;
    }
    if (r === 'coordinator') {
      return ROLES.COORDINATOR;
    }
    if (r === 'stakeholder') {
      return ROLES.STAKEHOLDER;
    }
    
    return role;
  }
}

module.exports = new ReviewerAssignmentService();

