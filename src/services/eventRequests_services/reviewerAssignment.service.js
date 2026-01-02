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
   * @param {Object} context - Context { locationId, organizationId, coverageAreaId, stakeholderId }
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
      const stakeholderId = context.stakeholderId || context.stakeholder_id || context.Stakeholder_ID || null;

      // Log initial assignment context
      console.log(`[REVIEWER ASSIGNMENT] Starting assignment for requester ${requesterId} (authority: ${requesterAuthority}, locationId: ${locationId || 'null'}, stakeholderId: ${stakeholderId || 'null'})`);

      // 1.5. Special case: Coordinator (60-79) creating request WITH Stakeholder → assign Stakeholder as reviewer
      if (requesterAuthority >= AUTHORITY_TIERS.COORDINATOR && 
          requesterAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN && 
          stakeholderId) {
        console.log(`[REVIEWER ASSIGNMENT] Coordinator creating request with Stakeholder - attempting to assign Stakeholder as reviewer`, {
          requesterId,
          requesterAuthority,
          stakeholderId,
          locationId
        });
        
        // Get stakeholder user
        const stakeholder = await this._getUser(stakeholderId);
        if (!stakeholder) {
          console.warn(`[REVIEWER ASSIGNMENT] Stakeholder ${stakeholderId} not found, falling back to auto-assignment`);
          // Fall through to normal assignment logic
        } else {
          const stakeholderAuthority = stakeholder.authority || AUTHORITY_TIERS.BASIC_USER;
          console.log(`[REVIEWER ASSIGNMENT] Found stakeholder:`, {
            stakeholderId: stakeholder._id,
            name: `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim(),
            authority: stakeholderAuthority,
            expectedRange: `${AUTHORITY_TIERS.STAKEHOLDER}-${AUTHORITY_TIERS.COORDINATOR - 1}`
          });
          
          // Validate stakeholder is not the requester
          const requesterIdStr = requester._id?.toString() || requesterId?.toString();
          const stakeholderIdStr = stakeholder._id?.toString();
          if (requesterIdStr === stakeholderIdStr) {
            console.warn(`[REVIEWER ASSIGNMENT] Stakeholder ${stakeholderId} is the same as requester, falling back to auto-assignment`);
            // Fall through to normal assignment logic
          } else if (stakeholderAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
            // More lenient: assign if authority < 80 (not an admin)
            // This handles cases where stakeholder might have coordinator-level authority but is still the intended reviewer
            // Validate stakeholder has request.review permission
            const hasReviewPermission = await permissionService.checkPermission(
              stakeholder._id,
              'request',
              'review',
              locationId ? { locationId } : {}
            );
            
            console.log(`[REVIEWER ASSIGNMENT] Stakeholder permission check:`, {
              stakeholderId: stakeholder._id,
              hasReviewPermission,
              locationId
            });
            
            if (!hasReviewPermission) {
              // Try global permission check
              const hasGlobalPermission = await permissionService.checkPermission(
                stakeholder._id,
                'request',
                'review',
                {}
              );
              
              console.log(`[REVIEWER ASSIGNMENT] Stakeholder global permission check:`, {
                stakeholderId: stakeholder._id,
                hasGlobalPermission
              });
              
              if (!hasGlobalPermission) {
                console.warn(`[REVIEWER ASSIGNMENT] Stakeholder ${stakeholderId} does not have request.review permission, but assigning anyway (Coordinator→Stakeholder workflow)`);
                // Still assign them - Coordinator explicitly selected this stakeholder
                // They'll need the permission to actually review, but we assign them as reviewer
                return await this._formatReviewer(stakeholder, 'coordinator-to-stakeholder');
              } else {
                console.log(`[REVIEWER ASSIGNMENT] Assigning Stakeholder ${stakeholderId} as reviewer (has global request.review permission)`);
                return await this._formatReviewer(stakeholder, 'coordinator-to-stakeholder');
              }
            } else {
              console.log(`[REVIEWER ASSIGNMENT] Assigning Stakeholder ${stakeholderId} as reviewer (has request.review permission)`);
              return await this._formatReviewer(stakeholder, 'coordinator-to-stakeholder');
            }
          } else {
            console.warn(`[REVIEWER ASSIGNMENT] Stakeholder ${stakeholderId} has authority ${stakeholderAuthority} (>= ${AUTHORITY_TIERS.COORDINATOR}), not assigning as stakeholder reviewer. Falling back to auto-assignment`);
            // Fall through to normal assignment logic
          }
        }
      }

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

      console.log(`[REVIEWER ASSIGNMENT] Target authority range: ${targetAuthorityMin}-${targetAuthorityMax}, rule: ${assignmentRule}, requiresOrgMatch: ${requiresOrgMatch}, requiresCoverageMatch: ${requiresCoverageMatch}`);

      // 3. Find users with request.review permission in location scope
      const candidateReviewers = await this._findUsersWithReviewPermission(locationId, requesterId);

      if (candidateReviewers.length === 0) {
        // Fallback to system admin
        console.log(`[REVIEWER ASSIGNMENT] No candidates found, using fallback reviewer`);
        return await this._assignFallbackReviewer(requester, assignmentRule);
      }

      console.log(`[REVIEWER ASSIGNMENT] Found ${candidateReviewers.length} candidate reviewers with request.review permission`);

      // 4. Filter by target authority tier
      let qualifiedReviewers = candidateReviewers.filter(candidate => {
        const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
        return candidateAuthority >= targetAuthorityMin && candidateAuthority <= targetAuthorityMax;
      });

      console.log(`[REVIEWER ASSIGNMENT] After authority filtering (${targetAuthorityMin}-${targetAuthorityMax}): ${qualifiedReviewers.length} qualified reviewers`);

      // If no one meets target authority, find closest match
      if (qualifiedReviewers.length === 0) {
        console.log(`[REVIEWER ASSIGNMENT] No reviewers in target authority range, looking for closest match (authority >= ${requesterAuthority})`);
        qualifiedReviewers = candidateReviewers.filter(candidate => {
          const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
          return candidateAuthority >= requesterAuthority; // At least same or higher authority
        });

        if (qualifiedReviewers.length === 0) {
          // Last resort: use highest authority candidate
          console.log(`[REVIEWER ASSIGNMENT] No reviewers with authority >= requester, using highest authority candidate`);
          candidateReviewers.sort((a, b) => (b.authority || 0) - (a.authority || 0));
          qualifiedReviewers = candidateReviewers.length > 0 ? [candidateReviewers[0]] : [];
        } else {
          console.log(`[REVIEWER ASSIGNMENT] Found ${qualifiedReviewers.length} reviewers with authority >= requester`);
        }
      }

      // 5. Apply organization and coverage matching for stakeholder requests
      if (requiresOrgMatch || requiresCoverageMatch) {
        const beforeFilterCount = qualifiedReviewers.length;
        qualifiedReviewers = await this._filterByOrganizationAndCoverage(
          qualifiedReviewers,
          requester,
          context
        );
        console.log(`[REVIEWER ASSIGNMENT] After org/coverage filtering: ${qualifiedReviewers.length} reviewers (from ${beforeFilterCount})`);

        if (qualifiedReviewers.length === 0) {
          // Fallback to authority-filtered candidates if no org/coverage match
          console.log(`[REVIEWER ASSIGNMENT] No org/coverage match found, falling back to authority-filtered candidates`);
          qualifiedReviewers = candidateReviewers.filter(candidate => {
            const candidateAuthority = candidate.authority || AUTHORITY_TIERS.BASIC_USER;
            return candidateAuthority >= targetAuthorityMin && candidateAuthority <= targetAuthorityMax;
          });
        }
      }

      // If still no reviewers, use fallback
      if (qualifiedReviewers.length === 0) {
        console.log(`[REVIEWER ASSIGNMENT] No qualified reviewers after all filtering, using fallback reviewer`);
        return await this._assignFallbackReviewer(requester, assignmentRule);
      }

      // 6. Select best reviewer (prefer lower authority if multiple candidates)
      if (qualifiedReviewers.length > 1) {
        qualifiedReviewers.sort((a, b) => (a.authority || 0) - (b.authority || 0));
      }

      const selectedReviewer = qualifiedReviewers[0];
      
      // Safety check: Ensure selected reviewer is not the requester (prevent self-review)
      const requesterIdStr = requester._id?.toString() || requesterId?.toString();
      const reviewerIdStr = selectedReviewer._id?.toString();
      if (requesterIdStr === reviewerIdStr) {
        console.warn(`[REVIEWER ASSIGNMENT] Selected reviewer is the requester! Removing from candidates and selecting next reviewer.`);
        // Remove requester from candidates and select next reviewer
        qualifiedReviewers = qualifiedReviewers.filter(r => r._id.toString() !== requesterIdStr);
        if (qualifiedReviewers.length === 0) {
          // No other candidates, use fallback
          console.log(`[REVIEWER ASSIGNMENT] No other candidates after removing requester, using fallback reviewer`);
          return await this._assignFallbackReviewer(requester, assignmentRule);
        }
        // Select next reviewer
        const nextReviewer = qualifiedReviewers[0];
        console.log(`[REVIEWER ASSIGNMENT] Selected reviewer: ${nextReviewer._id} (authority: ${nextReviewer.authority || 'unknown'}, name: ${nextReviewer.firstName || ''} ${nextReviewer.lastName || ''})`);
        return await this._formatReviewer(nextReviewer, assignmentRule);
      }
      
      console.log(`[REVIEWER ASSIGNMENT] Selected reviewer: ${selectedReviewer._id} (authority: ${selectedReviewer.authority || 'unknown'}, name: ${selectedReviewer.firstName || ''} ${selectedReviewer.lastName || ''})`);
      
      return await this._formatReviewer(selectedReviewer, assignmentRule);

    } catch (error) {
      console.error(`[REVIEWER ASSIGNMENT] Error: ${error.message}`);
      console.error(`[REVIEWER ASSIGNMENT] Stack: ${error.stack}`);
      throw new Error(`Failed to assign reviewer: ${error.message}`);
    }
  }

  /**
   * Find users with request.review permission
   * @private
   */
  async _findUsersWithReviewPermission(locationId, excludeUserId) {
    // First try with locationId if provided
    let userIds = await permissionService.getUsersWithPermission('request.review', locationId);
    
    // If no results and locationId was provided, try global search (null locationId)
    if (userIds.length === 0 && locationId) {
      console.log(`[REVIEWER ASSIGNMENT] No reviewers found with locationId ${locationId}, trying global search`);
      userIds = await permissionService.getUsersWithPermission('request.review', null);
    }
    
    // Log search results
    if (locationId) {
      console.log(`[REVIEWER ASSIGNMENT] Found ${userIds.length} users with request.review permission (locationId: ${locationId})`);
    } else {
      console.log(`[REVIEWER ASSIGNMENT] Found ${userIds.length} users with request.review permission (global search)`);
    }
    
    // Exclude requester
    const excludeIdStr = excludeUserId?.toString();
    const filteredIds = userIds.filter(id => id.toString() !== excludeIdStr);
    
    if (filteredIds.length < userIds.length) {
      console.log(`[REVIEWER ASSIGNMENT] Excluded requester ${excludeIdStr}, ${filteredIds.length} candidates remaining`);
    }

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

    // Edge case: If requester has no org/coverage data, don't filter (return all candidates)
    if (requesterOrgIds.size === 0 && requesterMunicipalityIds.size === 0) {
      console.log(`[REVIEWER ASSIGNMENT] Requester has no org/coverage data, skipping org/coverage filtering`);
      return candidateReviewers;
    }

    console.log(`[REVIEWER ASSIGNMENT] Filtering by org/coverage: requester has ${requesterOrgIds.size} orgs, ${requesterMunicipalityIds.size} municipalities`);

    // Check each candidate
    for (const candidate of candidateReviewers) {
      // If requester has no orgs, skip org matching (orgMatch = true)
      // If requester has no municipalities, skip coverage matching (coverageMatch = true)
      let orgMatch = requesterOrgIds.size === 0;
      let coverageMatch = requesterMunicipalityIds.size === 0;

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
   * Assign fallback reviewer (system admin or any user with request.review permission)
   * @private
   */
  async _assignFallbackReviewer(requester, assignmentRule) {
    console.log(`[REVIEWER ASSIGNMENT] Attempting to assign fallback reviewer`);
    
    // First, try to find any user with request.review permission globally
    const userIds = await permissionService.getUsersWithPermission('request.review', null);
    const excludeIdStr = requester._id?.toString();
    const filteredIds = userIds.filter(id => id.toString() !== excludeIdStr);
    
    if (filteredIds.length > 0) {
      // Get the first user with request.review permission
      const mongoose = require('mongoose');
      const fallbackUser = await User.findOne({
        _id: { $in: filteredIds.map(id => {
          try {
            return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
          } catch (e) {
            return id;
          }
        })},
        isActive: true
      }).select('_id firstName lastName email authority roles organizations coverageAreas locations').lean();
      
      if (fallbackUser) {
        console.log(`[REVIEWER ASSIGNMENT] Using fallback reviewer with request.review permission: ${fallbackUser._id}`);
        return await this._formatReviewer(fallbackUser, assignmentRule);
      }
    }
    
    // If no user with request.review permission found, try system admin role
    console.log(`[REVIEWER ASSIGNMENT] No users with request.review permission found, trying system-admin role`);
    const { Role } = require('../../models/index');
    const { UserRole } = require('../../models/index');
    const requesterIdStr = requester._id?.toString();

    const systemAdminRole = await Role.findOne({ code: 'system-admin' });
    if (!systemAdminRole) {
      // Last resort: find any active user with high authority (but not the requester)
      console.log(`[REVIEWER ASSIGNMENT] System admin role not found, finding any user with authority >= 80`);
      const highAuthorityUser = await User.findOne({
        authority: { $gte: AUTHORITY_TIERS.OPERATIONAL_ADMIN },
        isActive: true,
        _id: { $ne: requester._id } // Exclude requester
      }).select('_id firstName lastName email authority roles organizations coverageAreas locations').lean();
      
      if (highAuthorityUser && highAuthorityUser._id.toString() !== requesterIdStr) {
        console.log(`[REVIEWER ASSIGNMENT] Using high authority user as fallback: ${highAuthorityUser._id}`);
        return await this._formatReviewer(highAuthorityUser, assignmentRule);
      }
      
      throw new Error('System admin role not found and no high authority users available (excluding requester). Cannot assign fallback reviewer.');
    }

    const userRole = await UserRole.findOne({
      roleId: systemAdminRole._id,
      isActive: true,
      userId: { $ne: requester._id } // Exclude requester
    }).limit(1);

    if (!userRole) {
      // Try to find any user with system admin role in embedded roles (but not the requester)
      const systemAdminUser = await User.findOne({
        'roles.roleCode': 'system-admin',
        'roles.isActive': true,
        isActive: true,
        _id: { $ne: requester._id } // Exclude requester
      }).select('_id firstName lastName email authority roles organizations coverageAreas locations').lean();
      
      if (systemAdminUser && systemAdminUser._id.toString() !== requesterIdStr) {
        console.log(`[REVIEWER ASSIGNMENT] Using system admin from embedded roles: ${systemAdminUser._id}`);
        return await this._formatReviewer(systemAdminUser, assignmentRule);
      }
      
      throw new Error('No active system admin found (excluding requester). Cannot assign fallback reviewer.');
    }

    const user = await User.findById(userRole.userId)
      .select('_id firstName lastName email authority roles organizations coverageAreas locations')
      .lean();
    
    if (!user) {
      throw new Error('System admin user not found.');
    }
    
    // Safety check: Ensure fallback reviewer is not the requester
    if (user._id.toString() === requesterIdStr) {
      throw new Error('Fallback reviewer cannot be the requester. Cannot assign fallback reviewer.');
    }
    
    // Verify the fallback reviewer has request.review permission
    const hasPermission = await permissionService.checkPermission(user._id, 'request', 'review', {});
    if (!hasPermission) {
      console.warn(`[REVIEWER ASSIGNMENT] Fallback reviewer ${user._id} does not have request.review permission, but using anyway`);
    } else {
      console.log(`[REVIEWER ASSIGNMENT] Fallback reviewer ${user._id} has request.review permission`);
    }

    console.log(`[REVIEWER ASSIGNMENT] Using system admin as fallback reviewer: ${user._id}`);
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

