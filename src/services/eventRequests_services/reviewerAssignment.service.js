/**
 * Reviewer Assignment Service
 * 
 * Implements exact routing rules based on requester authority:
 * - Stakeholder (30-59) → Coordinator (60-79) with org/coverage match
 * - Coordinator (60-79) → Admin (80+)
 * - Admin (80+) → Coordinator (60-79)
 */

const { User } = require('../../models/index');
const permissionService = require('../users_services/permission.service');
const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

class ReviewerAssignmentService {
  /**
   * Assign reviewer based on requester authority and routing rules
   * @param {string|ObjectId} requesterId - Requester user ID
   * @param {Object} context - Context { locationId, organizationId, coverageAreaId }
   * @returns {Promise<Object>} Reviewer assignment object
   */
  async assignReviewer(requesterId, context = {}) {
    try {
      // 1. Get requester details
      const requester = await this._getUser(requesterId);
      if (!requester) {
        throw new Error(`Requester with ID ${requesterId} not found`);
      }

      const requesterAuthority = requester.authority || AUTHORITY_TIERS.BASIC_USER;
      const locationId = context.locationId || context.district || context.municipalityId;

      // 2. Determine target reviewer authority tier based on routing rules
      let targetAuthorityMin = AUTHORITY_TIERS.BASIC_USER;
      let targetAuthorityMax = AUTHORITY_TIERS.SYSTEM_ADMIN;
      let requiresOrgMatch = false;
      let requiresCoverageMatch = false;
      let assignmentRule = 'auto-assigned';

      if (requesterAuthority >= AUTHORITY_TIERS.STAKEHOLDER && requesterAuthority < AUTHORITY_TIERS.COORDINATOR) {
        // Stakeholder (30-59) → Coordinator (60-79) with org/coverage match
        targetAuthorityMin = AUTHORITY_TIERS.COORDINATOR;
        targetAuthorityMax = AUTHORITY_TIERS.OPERATIONAL_ADMIN - 1;
        requiresOrgMatch = true;
        requiresCoverageMatch = true;
        assignmentRule = 'stakeholder-to-coordinator';
      } else if (requesterAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Coordinator (60-79) → Admin (80+)
        targetAuthorityMin = AUTHORITY_TIERS.OPERATIONAL_ADMIN;
        targetAuthorityMax = AUTHORITY_TIERS.SYSTEM_ADMIN;
        assignmentRule = 'coordinator-to-admin';
      } else if (requesterAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Admin (80+) → Coordinator (60-79)
        targetAuthorityMin = AUTHORITY_TIERS.COORDINATOR;
        targetAuthorityMax = AUTHORITY_TIERS.OPERATIONAL_ADMIN - 1;
        assignmentRule = 'admin-to-coordinator';
      }

      // 3. Find users with request.review permission in location scope
      const candidateReviewers = await this._findUsersWithReviewPermission(locationId, requesterId);

      if (candidateReviewers.length === 0) {
        // Fallback to system admin
        return await this._assignFallbackReviewer(requester, assignmentRule);
      }

      // 4. Filter by target authority tier
      let qualifiedReviewers = candidateReviewers.filter(candidate => {
        const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
        return candidateAuthority >= targetAuthorityMin && candidateAuthority <= targetAuthorityMax;
      });

      // If no one meets target authority, find closest match
      if (qualifiedReviewers.length === 0) {
        qualifiedReviewers = candidateReviewers.filter(candidate => {
          const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
          return candidateAuthority >= requesterAuthority; // At least same or higher authority
        });

        if (qualifiedReviewers.length === 0) {
          // Last resort: use highest authority candidate
          candidateReviewers.sort((a, b) => (b.authority || 0) - (a.authority || 0));
          qualifiedReviewers = [candidateReviewers[0]];
        }
      }

      // 5. Apply organization and coverage matching for stakeholder requests
      if (requiresOrgMatch || requiresCoverageMatch) {
        qualifiedReviewers = await this._filterByOrganizationAndCoverage(
          qualifiedReviewers,
          requester,
          context
        );

        if (qualifiedReviewers.length === 0) {
          // Fallback to authority-filtered candidates if no org/coverage match
          qualifiedReviewers = candidateReviewers.filter(candidate => {
            const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
            return candidateAuthority >= targetAuthorityMin && candidateAuthority <= targetAuthorityMax;
          });
        }
      }

      // 6. Select best reviewer (prefer lower authority if multiple candidates)
      if (qualifiedReviewers.length > 1) {
        qualifiedReviewers.sort((a, b) => (a.authority || 0) - (b.authority || 0));
      }

      const selectedReviewer = qualifiedReviewers[0];
      return await this._formatReviewer(selectedReviewer, assignmentRule);

    } catch (error) {
      console.error(`[REVIEWER ASSIGNMENT] Error: ${error.message}`);
      throw new Error(`Failed to assign reviewer: ${error.message}`);
    }
  }

  /**
   * Find users with request.review permission
   * @private
   */
  async _findUsersWithReviewPermission(locationId, excludeUserId) {
    const userIds = await permissionService.getUsersWithPermission('request.review', locationId);
    
    // Exclude requester
    const excludeIdStr = excludeUserId?.toString();
    const filteredIds = userIds.filter(id => id.toString() !== excludeIdStr);

    // Get user details with authority
    const mongoose = require('mongoose');
    const users = await User.find({
      _id: { $in: filteredIds.map(id => {
        try {
          return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
        } catch (e) {
          return id;
        }
      })},
      isActive: true
    }).select('_id firstName lastName email authority roles organizations coverageAreas locations').lean();

    return users;
  }

  /**
   * Filter reviewers by organization and coverage matching
   * @private
   */
  async _filterByOrganizationAndCoverage(candidateReviewers, requester, context) {
    const filtered = [];

    // Get requester's organizations
    const requesterOrgIds = new Set();
    if (requester.organizations && requester.organizations.length > 0) {
      requester.organizations.forEach(org => {
        if (org.isActive !== false && org.organizationId) {
          requesterOrgIds.add(org.organizationId.toString());
        }
      });
    }

    // Get requester's municipality IDs (from locations or coverage areas)
    const requesterMunicipalityIds = new Set();
    if (requester.locations && requester.locations.municipalityId) {
      requesterMunicipalityIds.add(requester.locations.municipalityId.toString());
    }
    if (requester.coverageAreas && requester.coverageAreas.length > 0) {
      requester.coverageAreas.forEach(ca => {
        if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
          ca.municipalityIds.forEach(muniId => {
            if (muniId) requesterMunicipalityIds.add(muniId.toString());
          });
        }
      });
    }

    // Check each candidate
    for (const candidate of candidateReviewers) {
      let orgMatch = requesterOrgIds.size === 0; // If requester has no orgs, skip org matching
      let coverageMatch = requesterMunicipalityIds.size === 0; // If requester has no location, skip coverage matching

      // Check organization match
      if (requesterOrgIds.size > 0) {
        const candidateOrgIds = new Set();
        if (candidate.organizations && candidate.organizations.length > 0) {
          candidate.organizations.forEach(org => {
            if (org.isActive !== false && org.organizationId) {
              candidateOrgIds.add(org.organizationId.toString());
            }
          });
        }

        for (const requesterOrgId of requesterOrgIds) {
          if (candidateOrgIds.has(requesterOrgId)) {
            orgMatch = true;
            break;
          }
        }
      }

      // Check coverage/municipality match
      if (requesterMunicipalityIds.size > 0) {
        const candidateMunicipalityIds = new Set();
        if (candidate.coverageAreas && candidate.coverageAreas.length > 0) {
          candidate.coverageAreas.forEach(ca => {
            if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
              ca.municipalityIds.forEach(muniId => {
                if (muniId) candidateMunicipalityIds.add(muniId.toString());
              });
            }
          });
        }

        for (const requesterMuniId of requesterMunicipalityIds) {
          if (candidateMunicipalityIds.has(requesterMuniId)) {
            coverageMatch = true;
            break;
          }
        }
      }

      if (orgMatch && coverageMatch) {
        filtered.push(candidate);
      }
    }

    return filtered;
  }

  /**
   * Format reviewer object
   * @private
   */
  async _formatReviewer(user, assignmentRule) {
    const roles = await permissionService.getUserRoles(user._id);
    const primaryRole = roles[0];

    return {
      userId: user._id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      roleSnapshot: primaryRole?.code || null,
      assignedAt: new Date(),
      autoAssigned: true,
      assignmentRule
    };
  }

  /**
   * Assign fallback reviewer (system admin)
   * @private
   */
  async _assignFallbackReviewer(requester, assignmentRule) {
    const { Role } = require('../../models/index');
    const { UserRole } = require('../../models/index');

    const systemAdminRole = await Role.findOne({ code: 'system-admin' });
    if (!systemAdminRole) {
      throw new Error('System admin role not found. Cannot assign fallback reviewer.');
    }

    const userRole = await UserRole.findOne({
      roleId: systemAdminRole._id,
      isActive: true
    }).limit(1);

    if (!userRole) {
      throw new Error('No active system admin found. Cannot assign fallback reviewer.');
    }

    const user = await User.findById(userRole.userId);
    if (!user) {
      throw new Error('System admin user not found.');
    }

    return await this._formatReviewer(user, assignmentRule);
  }

  /**
   * Get user by ID
   * @private
   */
  async _getUser(userId) {
    const mongoose = require('mongoose');
    
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId)
        .select('_id firstName lastName email authority roles organizations coverageAreas locations isActive')
        .lean();
      if (user) return user;
    }

    // Try legacy userId
    const user = await User.findByLegacyId(userId);
    if (user) {
      return user.toObject ? user.toObject() : user;
    }

    return null;
  }
}

module.exports = new ReviewerAssignmentService();

