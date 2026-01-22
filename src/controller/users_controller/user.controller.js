/**
 * Unified User Controller
 * Handles HTTP requests related to the unified User model
 * Supports both new User model and legacy models during migration
 */

const { User, UserRole, UserLocation } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');
const locationService = require('../../services/utility_services/location.service');
const userCoverageAssignmentService = require('../../services/users_services/userCoverageAssignment.service');
const bcrypt = require('bcrypt');
const { signToken } = require('../../utils/jwt');
const mongoose = require('mongoose');

class UserController {
  /**
   * Create a new user
   * POST /api/users
   */
  async createUser(req, res) {
    try {
      const userData = req.validatedData || req.body;
      let { roles = [], locations = [], coverageAreaId, coverageAreaIds = [], organizationId, organizationIds = [], municipalityId, barangayId } = userData;
      const pageContext = req.headers['x-page-context'] || req.body.pageContext;
      const requesterId = req.user?.id || req.user?._id;

      // Normalize coverageAreaIds: if coverageAreaId is provided but coverageAreaIds is not, use coverageAreaId
      if (coverageAreaId && (!coverageAreaIds || coverageAreaIds.length === 0)) {
        coverageAreaIds = [coverageAreaId];
      }

      // Normalize organizationIds: if organizationId is provided but organizationIds is not, use organizationId
      if (organizationId && (!organizationIds || organizationIds.length === 0)) {
        organizationIds = [organizationId];
      }

      // For stakeholder-management page, validate that roles are provided and are stakeholder roles
      if (pageContext === 'stakeholder-management') {
        // Require at least one role
        if (!roles || roles.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one role is required for stakeholder creation',
            code: 'MISSING_ROLE'
          });
        }
        
        // Validate that all provided roles are stakeholder roles (authority < 60)
        const { Role } = require('../../models');
        const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
        const authorityService = require('../../services/users_services/authority.service');
        
        for (const roleIdentifier of roles) {
          // Support both role codes and role IDs
          let role;
          if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
            role = await Role.findById(roleIdentifier);
          } else {
            role = await Role.findOne({ code: roleIdentifier });
          }
          
          if (!role) {
            return res.status(400).json({
              success: false,
              message: `Invalid role: ${roleIdentifier}`,
              code: 'INVALID_ROLE'
            });
          }
          
          const roleAuthority = role.authority || await authorityService.calculateRoleAuthority(role._id);
          if (roleAuthority >= AUTHORITY_TIERS.COORDINATOR) {
            return res.status(403).json({
              success: false,
              message: `Cannot assign coordinator-level or higher role to stakeholder: ${role.code}`,
              code: 'INVALID_ROLE_AUTHORITY'
            });
          }
        }
        
        console.log('[STAKEHOLDER] Creating stakeholder:', {
          email: userData.email,
          requesterId: requesterId?.toString(),
          roles: roles,
          municipalityId: municipalityId || 'none',
          organizationId: organizationId || 'none'
        });
      }

      // Check if email already exists (only check active users)
      // Inactive/deleted users can be recreated with the same email
      const existingActiveUser = await User.findOne({ 
        email: userData.email,
        isActive: true 
      });
      if (existingActiveUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      // Check if there's an inactive user with this email
      // If so, we'll delete it before creating the new one (allows email reuse)
      const existingInactiveUser = await User.findOne({ 
        email: userData.email,
        isActive: false 
      });
      if (existingInactiveUser) {
        // Delete the inactive user to free up the email
        // This allows recreating stakeholders with the same email after deletion
        await User.deleteOne({ _id: existingInactiveUser._id });
      }

      // Validation: For coordinator creation (non-stakeholder), require at least one role
      if (pageContext !== 'stakeholder-management' && roles.length === 0) {
        console.log('[DIAG] createUser - VALIDATION FAILED: Coordinator creation requires at least one role');
        return res.status(400).json({
          success: false,
          message: 'Coordinator must have at least one role assigned',
          code: 'MISSING_ROLE'
        });
      }

      // Validation: For coordinator creation, require at least one coverage area
      if (pageContext !== 'stakeholder-management' && coverageAreaIds.length === 0) {
        console.log('[DIAG] createUser - VALIDATION FAILED: Coordinator creation requires at least one coverage area');
        return res.status(400).json({
          success: false,
          message: 'Coordinator must have at least one coverage area assigned',
          code: 'MISSING_COVERAGE_AREA'
        });
      }

      // Validation: For coordinator creation, require at least one organization
      if (pageContext === 'coordinator-management' && organizationIds.length === 0 && !organizationId) {
        console.log('[DIAG] createUser - VALIDATION FAILED: Coordinator creation requires at least one organization');
        return res.status(400).json({
          success: false,
          message: 'Coordinator must have at least one organization assigned',
          code: 'MISSING_ORGANIZATION'
        });
      }

      // Validate role authority BEFORE creating user
      if (requesterId && roles.length > 0) {
        const authorityService = require('../../services/users_services/authority.service');
        const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
        
        // For coordinator creation, creator must have authority ≥ 60
        if (pageContext === 'coordinator-management' && requesterAuthority < 60) {
          return res.status(403).json({
            success: false,
            message: 'Only users with authority level 60 or higher can create coordinators',
            code: 'INSUFFICIENT_AUTHORITY_FOR_COORDINATOR_CREATION'
          });
        }
        
        // Validate role authority (creator must have higher authority than role)
        // Support both role codes and role IDs
        const { Role } = require('../../models');
        for (const roleIdentifier of roles) {
          let role;
          if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
            role = await Role.findById(roleIdentifier);
          } else {
            role = await Role.findOne({ code: roleIdentifier });
          }
          
          if (!role) {
            return res.status(400).json({
              success: false,
              message: `Invalid role: ${roleIdentifier}`,
              code: 'INVALID_ROLE'
            });
          }
          
          const roleAuthority = role.authority || await authorityService.calculateRoleAuthority(role._id);
          if (requesterAuthority <= roleAuthority) {
            return res.status(403).json({
              success: false,
              message: `Cannot create staff with role '${role.code || roleIdentifier}': Your authority level is insufficient`,
              code: 'INSUFFICIENT_AUTHORITY'
            });
          }
        }
        
        // Fail loudly if requesterAuthority is missing or cannot be determined
        if (requesterAuthority === null || requesterAuthority === undefined) {
          return res.status(500).json({ success: false, message: 'Unable to determine creator authority' });
        }

        // Server-side jurisdiction enforcement (do not rely solely on middleware)
        const jurisdictionService = require('../../services/users_services/jurisdiction.service');

        if (pageContext === 'stakeholder-management') {
          // Municipality is required for stakeholder creation
          if (!municipalityId) {
            return res.status(400).json({ success: false, message: 'Municipality is required for stakeholder creation', code: 'MUNICIPALITY_REQUIRED' });
          }

          // Ensure municipality is within creator's jurisdiction
          const allowedMunicipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(requesterId);
          const allowedIds = allowedMunicipalities.map(m => m._id.toString());
          
          if (!allowedIds.includes(municipalityId.toString())) {
            return res.status(403).json({ 
              success: false, 
              message: 'Cannot create stakeholder in municipality outside your jurisdiction', 
              code: 'MUNICIPALITY_OUTSIDE_JURISDICTION' 
            });
          }
          
          // Validate barangay if provided
          if (barangayId) {
            const { Location } = require('../../models');
            const barangay = await Location.findById(barangayId);
            if (!barangay || barangay.type !== 'barangay') {
              return res.status(400).json({
                success: false,
                message: 'Invalid barangay specified',
                code: 'INVALID_BARANGAY'
              });
            }
            
            if (barangay.parent?.toString() !== municipalityId.toString() && barangay.parent?.toString() !== municipalityId) {
              return res.status(400).json({
                success: false,
                message: 'Barangay does not belong to the selected municipality',
                code: 'BARANGAY_MISMATCH'
              });
            }
          }
          
          // Validate organization if provided
          if (organizationId) {
            const allowedOrganizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(requesterId);
            const allowedOrgIds = allowedOrganizations.map(o => o._id.toString());
            
            if (!allowedOrgIds.includes(organizationId.toString())) {
              return res.status(403).json({
                success: false,
                message: 'Cannot assign organization outside your jurisdiction',
                code: 'ORGANIZATION_OUTSIDE_JURISDICTION'
              });
            }
          }
        } else {
          // For staff/coordinator creation: validate coverage areas
          if (coverageAreaIds && coverageAreaIds.length > 0) {
            for (const caId of coverageAreaIds) {
              const ok = await jurisdictionService.canCreateUserInCoverageArea(requesterId, caId);
              if (!ok) {
                return res.status(403).json({ success: false, message: 'Cannot create user in coverage area outside your jurisdiction', code: 'COVERAGE_AREA_OUTSIDE_JURISDICTION' });
              }
            }
          }
          
          // For coordinator creation: validate organizations
          if (pageContext === 'coordinator-management' && organizationIds && organizationIds.length > 0) {
            const allowedOrganizations = await jurisdictionService.getAllowedOrganizationsForCoordinatorCreation(requesterId);
            const allowedOrgIds = allowedOrganizations.map(o => o._id.toString());
            
            for (const orgId of organizationIds) {
              if (!allowedOrgIds.includes(orgId.toString())) {
                return res.status(403).json({
                  success: false,
                  message: 'Cannot assign organization outside your jurisdiction',
                  code: 'ORGANIZATION_OUTSIDE_JURISDICTION'
                });
              }
            }
          }
        }
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      // Start MongoDB transaction session
      const session = await mongoose.startSession();
      session.startTransaction();

      let user = null;
      try {
        // Create user (now safe to create) - within transaction
        // Initialize with default authority (will be updated when roles are assigned)
        user = new User({
          email: userData.email,
          firstName: userData.firstName,
          middleName: userData.middleName || null,
          lastName: userData.lastName,
          phoneNumber: userData.phoneNumber || null,
          password: hashedPassword,
          organizationType: userData.organizationType || null,
          organizationInstitution: userData.organizationInstitution || null,
          organizationId: organizationId || null,
          field: userData.field || null,
          isSystemAdmin: userData.isSystemAdmin || false,
          isActive: true,
          authority: 20, // Default, will be updated from roles
          roles: [],
          organizations: [],
          coverageAreas: [],
          locations: {}
        });

        await user.save({ session });
        console.log('[RBAC] createUser - User created in transaction:', user._id.toString());

        // Assign roles if provided (atomic - must succeed or user creation fails)
        if (roles.length > 0) {
          console.log('[RBAC] createUser - Starting role assignment in transaction:', {
            userId: user._id.toString(),
            rolesCount: roles.length,
            roles: roles
          });
          
          const { Role } = require('../../models/index');
          const assignedRoles = [];
          let maxAuthority = 20;
          
          for (const roleIdentifier of roles) {
            console.log(`[RBAC] createUser - Assigning role: ${roleIdentifier} (type: ${typeof roleIdentifier})`);
            let role = null;
            
            // Try to find role by ID first (if it's an ObjectId)
            if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
              role = await Role.findById(roleIdentifier).session(session);
              if (role) {
                console.log(`[RBAC] createUser - Found role by ID: ${role.code} (${role.name})`);
              }
            }
            
            // If not found by ID, try by code (string)
            if (!role) {
              role = await permissionService.getRoleByCode(roleIdentifier);
            }
            
            if (!role) {
              console.log(`[RBAC] createUser - ✗ Role not found: ${roleIdentifier}`);
              throw new Error(`Role not found: ${roleIdentifier}`);
            }
            
            // Get role authority (use persisted field)
            const roleAuthority = role.authority || await authorityService.calculateRoleAuthority(role._id);
            maxAuthority = Math.max(maxAuthority, roleAuthority);
            
            // Assign role via UserRole collection
            const userRole = await permissionService.assignRole(
              user._id, 
              role._id, 
              [], 
              requesterId || null, 
              null, 
              [], 
              session
            );
            
            // Add to embedded roles array
            user.roles.push({
              roleId: role._id,
              roleCode: role.code,
              roleAuthority: roleAuthority,
              assignedAt: new Date(),
              assignedBy: requesterId || null,
              isActive: true
            });
            
            assignedRoles.push({ roleIdentifier, roleCode: role.code, roleId: role._id, userRoleId: userRole._id });
            console.log(`[RBAC] createUser - ✓ Role assigned successfully: ${role.code} (${role.name})`);
          }
          
          // Update user authority from roles
          user.authority = maxAuthority;
          await user.save({ session });
          
          console.log('[RBAC] createUser - Role assignment completed:', {
            userId: user._id.toString(),
            assignedRolesCount: assignedRoles.length,
            assignedRoles: assignedRoles.map(r => r.roleCode),
            userAuthority: user.authority
          });
        } else {
          // For coordinators, roles are required
          if (pageContext !== 'stakeholder-management') {
            throw new Error('Coordinator must have at least one role assigned');
          }
        }

        // For stakeholder creation, use municipality/barangay instead of coverage area
        if (pageContext === 'stakeholder-management') {
          // Stakeholders use Location model (municipality/barangay), not CoverageArea
          if (municipalityId) {
            // Get municipality for denormalization
            const { Location } = require('../../models');
            const municipality = await Location.findById(municipalityId).session(session);
            if (!municipality) {
              throw new Error(`Municipality not found: ${municipalityId}`);
            }
            
            // Assign municipality location (required for stakeholders)
            await locationService.assignUserToLocation(
              user._id,
              municipalityId,
              'exact',
              { 
                isPrimary: true,
                assignedBy: requesterId || null,
                session
              }
            );
            
            // Update embedded locations
            user.locations = {
              municipalityId: municipality._id,
              municipalityName: municipality.name,
              barangayId: null,
              barangayName: null
            };
            
            console.log(`[RBAC] createUser - Assigned municipality ${municipalityId} to stakeholder`);
          }

          if (barangayId) {
            // Get barangay for denormalization
            const { Location } = require('../../models');
            const barangay = await Location.findById(barangayId).session(session);
            if (!barangay) {
              throw new Error(`Barangay not found: ${barangayId}`);
            }
            
            // Assign barangay location (optional for stakeholders)
            await locationService.assignUserToLocation(
              user._id,
              barangayId,
              'exact',
              { 
                isPrimary: false,
                assignedBy: requesterId || null,
                session
              }
            );
            
            // Update embedded locations
            if (user.locations) {
              user.locations.barangayId = barangay._id;
              user.locations.barangayName = barangay.name;
            }
            
            console.log(`[RBAC] createUser - Assigned barangay ${barangayId} to stakeholder`);
          }
          
          // Save updated locations
          if (user.locations && user.locations.municipalityId) {
            await user.save({ session });
          }
        } else {
          // For staff creation, use coverage areas (support multiple)
          if (coverageAreaIds && coverageAreaIds.length > 0) {
            console.log('[RBAC] createUser - Starting coverage area assignment in transaction:', {
              userId: user._id.toString(),
              coverageAreaIdsCount: coverageAreaIds.length,
              coverageAreaIds: coverageAreaIds
            });
            
            const { CoverageArea, Location } = require('../../models');
            
            for (let i = 0; i < coverageAreaIds.length; i++) {
              const coverageAreaId = coverageAreaIds[i];
              console.log(`[RBAC] createUser - Assigning coverage area ${i + 1}/${coverageAreaIds.length}: ${coverageAreaId}`);
              
              // Get coverage area for denormalization
              const coverageArea = await CoverageArea.findById(coverageAreaId)
                .populate('geographicUnits')
                .session(session);
              
              if (!coverageArea) {
                throw new Error(`Coverage area not found: ${coverageAreaId}`);
              }
              
              // Derive districts and municipalities from geographic units
              const districtIds = [];
              const provinceIds = [];
              
              for (const unit of coverageArea.geographicUnits || []) {
                const unitDoc = typeof unit === 'object' && unit._id ? unit : await Location.findById(unit).session(session);
                if (!unitDoc) continue;
                
                if (unitDoc.type === 'district' || unitDoc.type === 'city') {
                  districtIds.push(unitDoc._id);
                } else if (unitDoc.type === 'province') {
                  provinceIds.push(unitDoc._id);
                }
              }
              
              // If coverage area contains provinces, get all districts under those provinces
              if (provinceIds.length > 0) {
                const provinceDistricts = await Location.find({
                  type: { $in: ['district', 'city'] },
                  parent: { $in: provinceIds },
                  isActive: true
                }).session(session);
                provinceDistricts.forEach(d => {
                  if (!districtIds.some(id => id.toString() === d._id.toString())) {
                    districtIds.push(d._id);
                  }
                });
              }
              
              // Get all municipalities under these districts
              const municipalityIds = [];
              if (districtIds.length > 0) {
                const municipalities = await Location.find({
                  type: 'municipality',
                  parent: { $in: districtIds },
                  isActive: true
                }).session(session);
                municipalities.forEach(m => municipalityIds.push(m._id));
              }
              
              // Assign coverage area via UserCoverageAssignment
              await userCoverageAssignmentService.assignUserToCoverageArea(
                user._id,
                coverageAreaId,
                {
                  isPrimary: i === 0,
                  autoCoverDescendants: true,
                  assignedBy: requesterId || null,
                  session
                }
              );
              
              // Add to embedded coverageAreas array
              user.coverageAreas.push({
                coverageAreaId: coverageArea._id,
                coverageAreaName: coverageArea.name,
                districtIds: districtIds,
                municipalityIds: municipalityIds,
                isPrimary: i === 0,
                assignedAt: new Date(),
                assignedBy: requesterId || null
              });
              
              console.log(`[RBAC] createUser - ✓ Coverage area assigned: ${coverageArea.name} (${municipalityIds.length} municipalities)`);
            }
            
            // Save updated coverage areas
            await user.save({ session });
          } else if (coverageAreaId) {
            // Fallback for backward compatibility (single coverageAreaId)
            console.log('[RBAC] createUser - Using single coverageAreaId (backward compatibility):', coverageAreaId);
            
            const { CoverageArea, Location } = require('../../models');
            const coverageArea = await CoverageArea.findById(coverageAreaId)
              .populate('geographicUnits')
              .session(session);
            
            if (!coverageArea) {
              throw new Error(`Coverage area not found: ${coverageAreaId}`);
            }
            
            // Derive districts and municipalities (same logic as above)
            const districtIds = [];
            const provinceIds = [];
            
            for (const unit of coverageArea.geographicUnits || []) {
              const unitDoc = typeof unit === 'object' && unit._id ? unit : await Location.findById(unit).session(session);
              if (!unitDoc) continue;
              
              if (unitDoc.type === 'district' || unitDoc.type === 'city') {
                districtIds.push(unitDoc._id);
              } else if (unitDoc.type === 'province') {
                provinceIds.push(unitDoc._id);
              }
            }
            
            if (provinceIds.length > 0) {
              const provinceDistricts = await Location.find({
                type: { $in: ['district', 'city'] },
                parent: { $in: provinceIds },
                isActive: true
              }).session(session);
              provinceDistricts.forEach(d => {
                if (!districtIds.some(id => id.toString() === d._id.toString())) {
                  districtIds.push(d._id);
                }
              });
            }
            
            const municipalityIds = [];
            if (districtIds.length > 0) {
              const municipalities = await Location.find({
                type: 'municipality',
                parent: { $in: districtIds },
                isActive: true
              }).session(session);
              municipalities.forEach(m => municipalityIds.push(m._id));
            }
            
            await userCoverageAssignmentService.assignUserToCoverageArea(
              user._id,
              coverageAreaId,
              {
                isPrimary: true,
                autoCoverDescendants: true,
                assignedBy: requesterId || null,
                session
              }
            );
            
            user.coverageAreas.push({
              coverageAreaId: coverageArea._id,
              coverageAreaName: coverageArea.name,
              districtIds: districtIds,
              municipalityIds: municipalityIds,
              isPrimary: true,
              assignedAt: new Date(),
              assignedBy: requesterId || null
            });
            
            await user.save({ session });
            console.log(`[RBAC] createUser - ✓ Single coverage area assigned: ${coverageArea.name}`);
          }
        }

        // Assign organizations (support multiple via UserOrganization)
        if (organizationIds && organizationIds.length > 0) {
          console.log('[RBAC] createUser - Starting organization assignment in transaction:', {
            userId: user._id.toString(),
            organizationIdsCount: organizationIds.length,
            organizationIds: organizationIds
          });
          
          const { UserOrganization, Organization } = require('../../models');
          
          for (let i = 0; i < organizationIds.length; i++) {
            const orgId = organizationIds[i];
            console.log(`[RBAC] createUser - Assigning organization ${i + 1}/${organizationIds.length}: ${orgId}`);
            
            // Get organization for denormalization
            const org = await Organization.findById(orgId).session(session);
            if (!org || !org.isActive) {
              throw new Error(`Organization not found or inactive: ${orgId}`);
            }
            
            // Determine roleInOrg based on user's role
            let roleInOrg = 'member';
            if (roles.length > 0) {
              const firstRoleCode = typeof roles[0] === 'string' ? roles[0] : (roles[0].code || '');
              if (firstRoleCode.toLowerCase() === 'coordinator') {
                roleInOrg = 'coordinator';
              }
            }
            
            // Assign via UserOrganization collection
            await UserOrganization.assignOrganization(
              user._id,
              orgId,
              {
                roleInOrg: roleInOrg,
                isPrimary: i === 0,
                assignedBy: requesterId || null,
                session
              }
            );
            
            // Add to embedded organizations array
            user.organizations.push({
              organizationId: org._id,
              organizationName: org.name,
              organizationType: org.type,
              isPrimary: i === 0,
              assignedAt: new Date(),
              assignedBy: requesterId || null
            });
            
            console.log(`[RBAC] createUser - ✓ Organization assigned: ${org.name}`);
          }
          
          // Save updated organizations
          await user.save({ session });
        } else if (organizationId) {
          // Fallback for backward compatibility (single organizationId)
          console.log('[RBAC] createUser - Using single organizationId (backward compatibility):', organizationId);
          
          const { UserOrganization, Organization } = require('../../models');
          const org = await Organization.findById(organizationId).session(session);
          
          if (!org || !org.isActive) {
            throw new Error(`Organization not found or inactive: ${organizationId}`);
          }
          
          let roleInOrg = 'member';
          if (roles.length > 0) {
            const firstRoleCode = typeof roles[0] === 'string' ? roles[0] : (roles[0].code || '');
            if (firstRoleCode.toLowerCase() === 'coordinator') {
              roleInOrg = 'coordinator';
            }
          }
          
          await UserOrganization.assignOrganization(
            user._id,
            organizationId,
            {
              roleInOrg: roleInOrg,
              isPrimary: true,
              assignedBy: requesterId || null,
              session
            }
          );
          
          user.organizations.push({
            organizationId: org._id,
            organizationName: org.name,
            organizationType: org.type,
            isPrimary: true,
            assignedAt: new Date(),
            assignedBy: requesterId || null
          });
          
          await user.save({ session });
          console.log(`[RBAC] createUser - ✓ Single organization assigned: ${org.name}`);
        }

        // Assign additional locations if provided (for backward compatibility)
        if (locations.length > 0) {
          for (const loc of locations) {
            await locationService.assignUserToLocation(
              user._id,
              loc.locationId,
              loc.scope || 'exact',
              { 
                isPrimary: loc.isPrimary || false,
                session
              }
            );
          }
        }

        // Commit transaction - all operations succeeded
        await session.commitTransaction();
        
        // Log successful stakeholder creation
        if (pageContext === 'stakeholder-management') {
          console.log('[STAKEHOLDER] Stakeholder created successfully:', {
            userId: user._id.toString(),
            email: user.email,
            municipalityId: municipalityId || 'none',
            organizationId: organizationId || 'none'
          });
        }
        
      } catch (transactionError) {
        // Abort transaction on any error - ensures no partial saves
        try {
          await session.abortTransaction();
          console.log('[RBAC] createUser - Transaction aborted due to error');
        } catch (abortError) {
          console.error('[RBAC] createUser - Error aborting transaction:', abortError);
        }
        
        // Handle MongoDB duplicate key error (E11000) for email
        // This can happen if an inactive user exists but wasn't caught in the pre-check
        // or due to a race condition
        if (transactionError.code === 11000 && transactionError.keyPattern && transactionError.keyPattern.email) {
          // Check if there's an inactive user with this email (outside transaction)
          const inactiveUser = await User.findOne({ 
            email: userData.email,
            isActive: false 
          });
          
          if (inactiveUser) {
            // Delete the inactive user to free up the email
            await User.deleteOne({ _id: inactiveUser._id });
            
            // Create a custom error to indicate retry is needed
            const retryError = new Error('Email was previously used by a deleted account. The inactive account has been removed. Please try creating the stakeholder again.');
            retryError.code = 'EMAIL_RECYCLED';
            retryError.retry = true;
            throw retryError;
          }
        }
        
        if (pageContext === 'stakeholder-management') {
          console.error('[STAKEHOLDER] Stakeholder creation failed:', transactionError.message);
        }
        throw transactionError;
      } finally {
        // End session - always cleanup
        try {
          session.endSession();
        } catch (endError) {
          console.error('[RBAC] createUser - Error ending session:', endError);
        }
      }

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: userResponse
      });
    } catch (error) {
      // Handle special case: email recycled from inactive user
      if (error.code === 'EMAIL_RECYCLED') {
        return res.status(400).json({
          success: false,
          message: error.message || 'Email was previously used. Please try again.',
          code: 'EMAIL_RECYCLED',
          retry: true
        });
      }
      
      // Handle MongoDB duplicate key error that wasn't caught in transaction
      if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
        // Check if there's an inactive user with this email
        const inactiveUser = await User.findOne({ 
          email: userData.email,
          isActive: false 
        });
        
        if (inactiveUser) {
          // Delete the inactive user to free up the email
          await User.deleteOne({ _id: inactiveUser._id });
          return res.status(400).json({
            success: false,
            message: 'Email was previously used by a deleted account. The inactive account has been removed. Please try creating the stakeholder again.',
            code: 'EMAIL_RECYCLED',
            retry: true
          });
        }
      }
      
      console.error('[RBAC] createUser - Error:', error);
      // Error response - transaction already aborted in catch block
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create user',
        code: error.code || 'USER_CREATION_FAILED'
      });
    }
  }

  /**
   * Get user by ID
   * GET /api/users/:userId
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      
      // Try as ObjectId first, then legacy userId
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user roles and permissions
      const roles = await permissionService.getUserRoles(user._id);
      const permissions = await permissionService.getUserPermissions(user._id);
      const locations = await locationService.getUserLocations(user._id);

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        data: {
          ...userResponse,
          roles,
          permissions,
          locations
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user'
      });
    }
  }

  /**
   * Get user edit context
   * GET /api/users/:userId/edit-context
   * Returns complete, consistent stakeholder data ready for editing
   */
  async getUserEditContext(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;
      
      // Try as ObjectId first, then legacy userId
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get current user's authority to determine edit permissions
      let requesterAuthority = null;
      if (requesterId) {
        const requester = await User.findById(requesterId);
        if (requester) {
          requesterAuthority = requester.authority || (requester.isSystemAdmin ? 100 : null);
        }
      }

      // Resolve role (from embedded roles array)
      let roleData = null;
      if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
        const activeRole = user.roles.find(r => r.isActive !== false) || user.roles[0];
        if (activeRole && activeRole.roleId) {
          const { Role } = require('../../models');
          const role = await Role.findById(activeRole.roleId);
          if (role) {
            roleData = {
              _id: role._id.toString(),
              code: role.code,
              name: role.name,
              authority: role.authority
            };
          }
        }
      }

      // Resolve organization (from embedded organizations array)
      let organizationData = null;
      if (user.organizations && Array.isArray(user.organizations) && user.organizations.length > 0) {
        const primaryOrg = user.organizations.find(o => o.isPrimary) || user.organizations[0];
        if (primaryOrg && primaryOrg.organizationId) {
          const { Organization } = require('../../models');
          const org = await Organization.findById(primaryOrg.organizationId);
          if (org) {
            organizationData = {
              _id: org._id.toString(),
              name: org.name || primaryOrg.organizationName,
              type: org.type || primaryOrg.organizationType
            };
          } else {
            // Fallback to embedded data
            organizationData = {
              _id: primaryOrg.organizationId.toString(),
              name: primaryOrg.organizationName || '',
              type: primaryOrg.organizationType || ''
            };
          }
        }
      }

      // Resolve location hierarchy
      let locationData = null;
      if (user.locations && user.locations.municipalityId) {
        const { Location } = require('../../models');
        const municipality = await Location.findById(user.locations.municipalityId);
        
        if (municipality) {
          // Get ancestors to find district and province
          const ancestors = await locationService.getLocationAncestors(municipality._id, {
            includeSelf: false,
            includeInactive: false
          });

          // Find district (type === 'district' or type === 'city' with isCity metadata)
          const districtObj = ancestors.find(a => 
            a.type === 'district' || 
            (a.type === 'city' && a.metadata?.isCity)
          );

          // Find province (type === 'province')
          const provinceObj = ancestors.find(a => a.type === 'province');

          // Get barangay if exists
          let barangayData = null;
          if (user.locations.barangayId) {
            const barangay = await Location.findById(user.locations.barangayId);
            if (barangay) {
              barangayData = {
                _id: barangay._id.toString(),
                name: barangay.name
              };
            }
          }

          locationData = {
            municipality: {
              _id: municipality._id.toString(),
              name: municipality.name || user.locations.municipalityName || ''
            },
            barangay: barangayData,
            district: districtObj ? {
              _id: districtObj._id.toString(),
              name: districtObj.name || districtObj.District_Name || ''
            } : null,
            province: provinceObj ? {
              _id: provinceObj._id.toString(),
              name: provinceObj.name || provinceObj.Province_Name || ''
            } : null
          };
        }
      }

      // Determine edit permissions based on current user's authority
      const isRequesterAdmin = requesterAuthority !== null && requesterAuthority >= 80;
      const isRequesterCoordinator = requesterAuthority !== null && requesterAuthority >= 60 && requesterAuthority < 80;
      
      // Check if coordinator has multiple organizations (for organization editing)
      let coordinatorCanEditOrg = false;
      if (isRequesterCoordinator && requesterId) {
        const requester = await User.findById(requesterId);
        if (requester && requester.organizations && Array.isArray(requester.organizations)) {
          coordinatorCanEditOrg = requester.organizations.length > 1;
        }
      }

      const editPermissions = {
        canEditRole: isRequesterAdmin,
        canEditOrganization: isRequesterAdmin || coordinatorCanEditOrg,
        canEditLocation: isRequesterAdmin || isRequesterCoordinator,
        canEditProvinceDistrict: isRequesterAdmin  // Only admin can edit province/district
      };

      // Build response
      const response = {
        success: true,
        data: {
          _id: user._id.toString(),
          firstName: user.firstName || '',
          middleName: user.middleName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          phoneNumber: user.phoneNumber || '',
          role: roleData,
          organization: organizationData,
          location: locationData,
          editPermissions
        }
      };

      return res.status(200).json(response);
    } catch (error) {
      console.error('[getUserEditContext] Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user edit context'
      });
    }
  }

  /**
   * Update user
   * PUT /api/users/:userId
   */
  async updateUser(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { userId } = req.params;
      const updateData = req.validatedData || req.body;
      const requesterId = req.user?.id || req.user?._id;
      
      // Extract complex fields that need special handling
      const { 
        password, 
        email, 
        roles, 
        organizationId, 
        organizationIds,
        municipalityId, 
        barangayId,
        ...simpleFields 
      } = updateData;

      // Find user
      let user = null;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId).session(session);
      }
      if (!user) {
        user = await User.findByLegacyId(userId).session(session);
      }

      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check email uniqueness if email is being updated
      if (email && email !== user.email) {
        // Check email uniqueness (only check active users)
        const existingUser = await User.findOne({ 
          email: email,
          isActive: true 
        }).session(session);
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Email already exists'
          });
        }
        user.email = email;
      }

      // Hash password if provided
      if (password) {
        const saltRounds = 10;
        user.password = await bcrypt.hash(password, saltRounds);
      }

      // Update simple fields (firstName, middleName, lastName, phoneNumber, etc.)
      Object.assign(user, simpleFields);

      // Handle role updates
      if (roles !== undefined && Array.isArray(roles)) {
        const { Role } = require('../../models');
        const authorityService = require('../../services/users_services/authority.service');
        
        // Revoke all existing active roles
        await permissionService.revokeRole(user._id);
        user.roles = [];
        
        // Assign new roles
        let maxAuthority = 20;
        for (const roleIdentifier of roles) {
          let role = null;
          
          // Try to find role by ID first
          if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
            role = await Role.findById(roleIdentifier).session(session);
          }
          
          // If not found by ID, try by code
          if (!role) {
            role = await permissionService.getRoleByCode(roleIdentifier);
          }
          
          if (!role) {
            throw new Error(`Role not found: ${roleIdentifier}`);
          }
          
          // Get role authority
          const roleAuthority = role.authority || await authorityService.calculateRoleAuthority(role._id);
          maxAuthority = Math.max(maxAuthority, roleAuthority);
          
          // Assign role via UserRole collection
          await permissionService.assignRole(
            user._id,
            role._id,
            [],
            requesterId || null,
            null,
            [],
            session
          );
          
          // Add to embedded roles array
          user.roles.push({
            roleId: role._id,
            roleCode: role.code,
            roleAuthority: roleAuthority,
            assignedAt: new Date(),
            assignedBy: requesterId || null,
            isActive: true
          });
        }
        
        // Update user authority from roles
        user.authority = maxAuthority;
      }

      // Handle organization update (support both single organizationId and multiple organizationIds)
      if (organizationIds !== undefined && Array.isArray(organizationIds)) {
        const { UserOrganization, Organization } = require('../../models');
        
        if (organizationIds.length === 0) {
          throw new Error('At least one organization must be assigned');
        }
        
        // Determine roleInOrg based on user's role
        let roleInOrg = 'member';
        if (user.roles && user.roles.length > 0) {
          const firstRoleCode = user.roles[0].roleCode || '';
          if (firstRoleCode.toLowerCase() === 'coordinator') {
            roleInOrg = 'coordinator';
          }
        }
        
        // Revoke all existing organizations for this user
        await UserOrganization.updateMany(
          { userId: user._id },
          { isActive: false }
        ).session(session);
        
        // Assign new organizations
        user.organizations = [];
        for (let i = 0; i < organizationIds.length; i++) {
          const orgId = organizationIds[i];
          const org = await Organization.findById(orgId).session(session);
          if (!org || !org.isActive) {
            throw new Error(`Organization not found or inactive: ${orgId}`);
          }
          
          // Assign via UserOrganization collection
          await UserOrganization.assignOrganization(
            user._id,
            orgId,
            {
              roleInOrg: roleInOrg,
              isPrimary: i === 0, // First organization is primary
              assignedBy: requesterId || null,
              session
            }
          );
          
          // Add to embedded organizations array
          user.organizations.push({
            organizationId: org._id,
            organizationName: org.name,
            organizationType: org.type,
            isPrimary: i === 0,
            assignedAt: new Date(),
            assignedBy: requesterId || null
          });
        }
      } else if (organizationId !== undefined) {
        // Backward compatibility: handle single organizationId
        const { UserOrganization, Organization } = require('../../models');
        
        // Get organization
        const org = await Organization.findById(organizationId).session(session);
        if (!org || !org.isActive) {
          throw new Error(`Organization not found or inactive: ${organizationId}`);
        }
        
        // Determine roleInOrg based on user's role
        let roleInOrg = 'member';
        if (user.roles && user.roles.length > 0) {
          const firstRoleCode = user.roles[0].roleCode || '';
          if (firstRoleCode.toLowerCase() === 'coordinator') {
            roleInOrg = 'coordinator';
          }
        }
        
        // Revoke all existing organizations for this user
        await UserOrganization.updateMany(
          { userId: user._id },
          { isActive: false }
        ).session(session);
        
        // Assign new organization
        await UserOrganization.assignOrganization(
          user._id,
          organizationId,
          {
            roleInOrg: roleInOrg,
            isPrimary: true,
            assignedBy: requesterId || null,
            session
          }
        );
        
        // Update embedded organizations array
        user.organizations = [{
          organizationId: org._id,
          organizationName: org.name,
          organizationType: org.type,
          isPrimary: true,
          assignedAt: new Date(),
          assignedBy: requesterId || null
        }];
      }

      // Handle location updates (municipality/barangay for stakeholders)
      if (municipalityId !== undefined || barangayId !== undefined) {
        const { Location } = require('../../models');
        
        // Update municipality if provided
        if (municipalityId) {
          const municipality = await Location.findById(municipalityId).session(session);
          if (!municipality) {
            throw new Error(`Municipality not found: ${municipalityId}`);
          }
          
          // Assign municipality location
          await locationService.assignUserToLocation(
            user._id,
            municipalityId,
            'exact',
            {
              isPrimary: true,
              assignedBy: requesterId || null,
              session
            }
          );
          
          // Update embedded locations
          if (!user.locations) {
            user.locations = {};
          }
          user.locations.municipalityId = municipality._id;
          user.locations.municipalityName = municipality.name;
        }
        
        // Update barangay if provided
        if (barangayId) {
          const barangay = await Location.findById(barangayId).session(session);
          if (!barangay) {
            throw new Error(`Barangay not found: ${barangayId}`);
          }
          
          // Assign barangay location
          await locationService.assignUserToLocation(
            user._id,
            barangayId,
            'exact',
            {
              isPrimary: false,
              assignedBy: requesterId || null,
              session
            }
          );
          
          // Update embedded locations
          if (!user.locations) {
            user.locations = {};
          }
          user.locations.barangayId = barangay._id;
          user.locations.barangayName = barangay.name;
        } else if (barangayId === null || barangayId === '') {
          // Clear barangay if explicitly set to null/empty
          if (user.locations) {
            user.locations.barangayId = null;
            user.locations.barangayName = null;
          }
        }
      }

      // Save user with all updates
      await user.save({ session });

      // Commit transaction
      await session.commitTransaction();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: userResponse
      });
    } catch (error) {
      // Abort transaction on error
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('[UserController] Error aborting transaction:', abortError);
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update user'
      });
    } finally {
      // End session
      try {
        session.endSession();
      } catch (endError) {
        console.error('[UserController] Error ending session:', endError);
      }
    }
  }

  /**
   * Delete user (soft delete)
   * DELETE /api/users/:userId
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      // Find user
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Soft delete
      user.isActive = false;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete user'
      });
    }
  }

  /**
   * Authenticate user (login)
   * POST /api/auth/login
   */
  async authenticateUser(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive. Please contact an administrator.'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Update last login
      await user.updateLastLogin();

      // Create JWT token payload (minimal - only id and email for security)
      // Role and permissions should be fetched from server, not embedded in token
      const tokenPayload = {
        id: user._id.toString(),
        email: user.email
      };

      // Sign token with shorter expiration (30 minutes default, configurable via env)
      const tokenExpiration = process.env.JWT_EXPIRES_IN || '30m';
      const token = signToken(tokenPayload, { expiresIn: tokenExpiration });

      // Prepare minimal user response for frontend
      // Full user data should be fetched via /api/auth/me endpoint
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Set cookie as fallback (optional, for cookie-based auth)
      // Cookie also uses minimal data for security
      const cookieData = JSON.stringify({
        id: user._id.toString(),
        email: user.email
      });

      res.cookie('unite_user', cookieData, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });

      // Return minimal user data - frontend should call /api/auth/me for full user info
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: displayName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Authentication failed'
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   * 
   * Refreshes the access token if the current token is valid.
   * This allows extending the session without requiring re-login.
   * 
   * Note: This is a simple refresh mechanism. For production, consider implementing
   * a proper refresh token system with HttpOnly cookies and database storage.
   */
  async refreshToken(req, res) {
    try {
      // req.user is set by authenticate middleware
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Verify user still exists and is active
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // Create new token with minimal payload
      const tokenPayload = {
        id: user._id.toString(),
        email: user.email
      };

      // Sign new token with same expiration as configured
      const tokenExpiration = process.env.JWT_EXPIRES_IN || '30m';
      const token = signToken(tokenPayload, { expiresIn: tokenExpiration });

      // Prepare minimal user response
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: displayName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to refresh token'
      });
    }
  }

  /**
   * Get current authenticated user
   * GET /api/auth/me
   * 
   * SECURITY NOTE: This endpoint returns full user data including roles, permissions, and locations.
   * This data should be:
   * - Fetched fresh from the server when needed (e.g., on app load, page refresh)
   * - Stored in memory only (React Context/State) - NEVER persisted to localStorage/sessionStorage
   * - Re-validated periodically to ensure permissions are up-to-date
   * 
   * The frontend should NOT persist this data to localStorage as it contains sensitive authorization
   * information that could be tampered with. All authorization decisions should be made server-side
   * via permission checking endpoints (/api/permissions/check, /api/pages/check, etc.).
   * 
   * Use this endpoint to:
   * - Validate the current session on app load
   * - Get fresh user data after login
   * - Re-validate user state on page refresh
   * - Check current user's roles/permissions for UI display (not for authorization decisions)
   */
  async getCurrentUser(req, res) {
    try {
      // req.user is set by authenticate middleware
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Find user
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // OPTIMIZATION: Use embedded data first (fast path for new users)
      // New stakeholders have embedded roles, permissions can be calculated from embedded roles
      // This avoids expensive database queries for users with embedded data
      
      // Get user roles - permissionService already optimized to use embedded roles first
      const roles = await permissionService.getUserRoles(user._id);
      
      // Get permissions - permissionService already optimized to use embedded roles first
      const permissions = await permissionService.getUserPermissions(user._id);
      
      // Get locations - locationService now optimized to use embedded locations first
      const locations = await locationService.getUserLocations(user._id);

      // Prepare user response
      const userResponse = user.toObject({ virtuals: true });
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        user: {
          ...userResponse,
          roles: roles.map(r => ({
            _id: r._id,
            code: r.code,
            name: r.name,
            description: r.description
          })),
          permissions,
          locations,
          isSystemAdmin: user.authority >= 80
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user'
      });
    }
  }

  /**
   * List users with filtering
   * GET /api/users
   */
  async listUsers(req, res) {
    try {
      const { 
        role, 
        capability,
        organizationType, 
        isActive, 
        locationId,
        page = 1,
        limit = 50
      } = req.query;

      const query = {};

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (organizationType) {
        query.organizationType = organizationType;
      }

      // Filter by capability (permission-based)
      if (capability) {
        const capabilities = Array.isArray(capability) ? capability : [capability];
        const userIdsSet = new Set();
        
        // Get users with any of the specified capabilities
        for (const cap of capabilities) {
          const userIds = await permissionService.getUsersWithPermission(cap, { locationId });
          userIds.forEach(id => userIdsSet.add(id.toString()));
        }
        
        if (userIdsSet.size > 0) {
          // If we already have a role filter, intersect with capability filter
          if (query._id && query._id.$in) {
            const roleUserIds = new Set(query._id.$in.map(id => id.toString()));
            const intersection = Array.from(userIdsSet).filter(id => roleUserIds.has(id));
            query._id = intersection.length > 0 ? { $in: intersection } : { $in: [] };
          } else {
            query._id = { $in: Array.from(userIdsSet) };
          }
        } else {
          // No users found with these capabilities
          query._id = { $in: [] };
        }
      }

      // Filter by role (backward compatibility)
      if (role) {
        const roleDoc = await permissionService.getRoleByCode(role);
        if (roleDoc) {
          const userRoles = await UserRole.find({ 
            roleId: roleDoc._id, 
            isActive: true 
          });
          const userIds = userRoles.map(ur => ur.userId);
          
          // Intersect with existing query if capability filter was applied
          if (query._id && query._id.$in) {
            const existingIds = new Set(query._id.$in.map(id => id.toString()));
            const roleIds = new Set(userIds.map(id => id.toString()));
            const intersection = Array.from(existingIds).filter(id => roleIds.has(id));
            query._id = intersection.length > 0 ? { $in: intersection } : { $in: [] };
          } else {
            query._id = { $in: userIds };
          }
        }
      }

      // Filter by location
      if (locationId) {
        const locationUsers = await locationService.getUserLocations(null, {
          includeDescendants: true
        });
        // This would need to be implemented in locationService
        // For now, we'll filter after fetching
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const users = await User.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      // Remove passwords from response
      const usersResponse = users.map(u => {
        const userObj = u.toObject();
        delete userObj.password;
        return userObj;
      });

      return res.status(200).json({
        success: true,
        data: usersResponse,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to list users'
      });
    }
  }

  /**
   * Get user capabilities (diagnostic endpoint)
   * GET /api/users/:userId/capabilities
   */
  async getUserCapabilities(req, res) {
    try {
      const { userId } = req.params;
      
      // Find user
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // OPTIMIZATION: Use embedded data first (fast path for new users)
      // permissionService already optimized to use embedded roles first
      const roles = await permissionService.getUserRoles(user._id);
      const permissions = await permissionService.getUserPermissions(user._id);
      
      // Compute capabilities
      const capabilities = [];
      for (const perm of permissions) {
        if (perm.resource === '*') {
          if (perm.actions.includes('*')) {
            capabilities.push('*'); // All capabilities
            break;
          }
          for (const action of perm.actions) {
            capabilities.push(`*.${action}`);
          }
        } else {
          for (const action of perm.actions) {
            if (action === '*') {
              capabilities.push(`${perm.resource}.*`);
            } else {
              capabilities.push(`${perm.resource}.${action}`);
            }
          }
        }
      }

      // Check operational capabilities
      const operationalCapabilities = [
        'request.create',
        'event.create',
        'event.update',
        'staff.create',
        'staff.update'
      ];
      const hasOperational = operationalCapabilities.some(cap => capabilities.includes(cap) || capabilities.includes('*'));
      
      // Check review capabilities
      const hasReview = capabilities.includes('request.review') || capabilities.includes('*');

      return res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roles: roles.map(r => ({
            id: r._id,
            code: r.code,
            name: r.name,
            permissions: r.permissions || []
          })),
          permissions,
          capabilities: [...new Set(capabilities)],
          classification: {
            isStakeholder: hasReview,
            isCoordinator: hasOperational,
            isHybrid: hasReview && hasOperational,
            type: hasReview && hasOperational ? 'hybrid' : hasReview ? 'stakeholder' : hasOperational ? 'coordinator' : 'none'
          }
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user capabilities'
      });
    }
  }

  /**
   * List users by permission capability
   * GET /api/users/by-capability
   */
  async listUsersByCapability(req, res) {
    try {
      const requesterId = req.user?.id || req.user?._id;
      const { 
        capability,
        organizationType, 
        isActive, 
        locationId,
        page = 1,
        limit = 50
      } = req.query;

      if (!capability) {
        return res.status(400).json({
          success: false,
          message: 'At least one capability parameter is required'
        });
      }

      // Get capabilities as array (support multiple capability params)
      const capabilities = Array.isArray(capability) ? capability : [capability];
      
      // Debug logging
      console.log('[listUsersByCapability] Request:', {
        capabilities,
        organizationType,
        isActive,
        locationId,
        page,
        limit,
        requesterId: requesterId?.toString() || 'none'
      });
      
      // Enhanced diagnostic for coordinator/stakeholder queries
      const isCoordinatorQuery = capabilities.some(c => c === 'request.create' || c === 'event.create');
      const isStakeholderQuery = capabilities.some(c => c === 'request.review');
      
      if (isCoordinatorQuery || isStakeholderQuery) {
        const queryType = isCoordinatorQuery ? 'COORDINATORS' : 'STAKEHOLDERS';
        console.log(`[DIAG] ${queryType} QUERY INITIATED:`, {
          queryType,
          capabilities,
          requesterId: requesterId?.toString(),
          locationId,
          expectedBehavior: queryType === 'COORDINATORS' 
            ? 'System Admin: all coordinators | Coordinator: self | Stakeholder: assigned coordinator'
            : 'System Admin: all stakeholders | Coordinator: stakeholders in org+coverage | Stakeholder: self'
        });
      }
      
      // Get users with ANY of the specified capabilities
      const userIdsSet = new Set();
      const capabilityResults = {};
      
      // Only pass locationId if it's defined
      const context = locationId ? { locationId } : {};
      
      // Detailed logging: Get user details for each capability to see what we're finding
      const { User } = require('../../models/index');
      const authorityService = require('../../services/users_services/authority.service');
      
      for (const cap of capabilities) {
        let userIds = await permissionService.getUsersWithPermission(cap, context);
        capabilityResults[cap] = userIds.length;
        
        // SPECIAL CASE: For 'request.review' capability (stakeholder page),
        // stakeholders don't have request.review permission, so we MUST query them by authority
        // and merge with any users found via permission lookup
        if (cap === 'request.review' && !capabilities.some(c => c.startsWith('staff.'))) {
          console.log('[listUsersByCapability] request.review requested - querying stakeholders by authority and merging with permission results');
          const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
          const stakeholderUsers = await User.find({
            authority: { $lt: AUTHORITY_TIERS.COORDINATOR },
            isActive: true
          }).select('_id').lean();
          
          const stakeholderIds = stakeholderUsers.map(u => u._id.toString());
          const permissionUserIds = userIds.map(id => id.toString());
          console.log(`[listUsersByCapability] Found ${stakeholderIds.length} stakeholders by authority, ${permissionUserIds.length} users via permission lookup`);
          
          // Merge: combine permission-based results with stakeholder results
          const mergedSet = new Set([...permissionUserIds, ...stakeholderIds]);
          userIds = Array.from(mergedSet);
          capabilityResults[cap] = userIds.length;
          const uniqueFromPermissions = permissionUserIds.filter(id => !stakeholderIds.includes(id)).length;
          const uniqueStakeholders = stakeholderIds.filter(id => !permissionUserIds.includes(id)).length;
          const overlap = userIds.length - uniqueFromPermissions - uniqueStakeholders;
          console.log(`[listUsersByCapability] Merged results: ${userIds.length} total users (${uniqueFromPermissions} unique from permissions, ${uniqueStakeholders} unique stakeholders, ${overlap} overlap)`);
        }
        
        // DETAILED DIAGNOSTIC: Log each user found with their authority and role info
        if (userIds.length > 0) {
          const usersFound = await User.find({ _id: { $in: userIds } }).select('_id email firstName lastName authority isSystemAdmin roles');
          const userDetails = await Promise.all(usersFound.map(async (u) => {
            const auth = u.authority || await authorityService.calculateUserAuthority(u._id);
            const roleCodes = (u.roles || []).filter(r => r.isActive).map(r => r.roleCode || 'unknown');
            return {
              userId: u._id.toString(),
              email: u.email,
              name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
              authority: auth,
              isSystemAdmin: u.isSystemAdmin,
              roles: roleCodes,
              hasRequestReviewPermission: cap === 'request.review'
            };
          }));
          
          console.log(`[DIAG] getUsersWithPermission for "${cap}" returned ${userIds.length} users:`, userDetails);
        } else {
          console.log(`[DIAG] getUsersWithPermission for "${cap}" returned NO users`);
        }
        
        userIds.forEach(id => userIdsSet.add(id.toString()));
      }
      
      console.log('[listUsersByCapability] Capability resolution:', {
        requestedCapabilities: capabilities,
        usersPerCapability: capabilityResults,
        totalUniqueUsers: userIdsSet.size
      });
      
      // Enhanced diagnostic for coordinator/stakeholder queries after capability resolution
      if (isCoordinatorQuery || isStakeholderQuery) {
        const queryType = isCoordinatorQuery ? 'COORDINATORS' : 'STAKEHOLDERS';
        console.log(`[DIAG] ${queryType} - After capability resolution:`, {
          totalUsersFound: userIdsSet.size,
          capabilityBreakdown: capabilityResults
        });
      }
      
      // ADDITIONAL DIAGNOSTIC: Check if there are any stakeholders in the database at all
      if (capabilities.includes('request.review') && !capabilities.some(c => c.startsWith('staff.'))) {
        const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
        const allStakeholders = await User.find({
          authority: { $lt: AUTHORITY_TIERS.COORDINATOR },
          isActive: true
        }).select('_id email firstName lastName authority roles organizations locations').limit(20);
        
        console.log('[DIAG] Database check - All stakeholders in database (first 20):', {
          totalStakeholdersFound: allStakeholders.length,
          stakeholders: allStakeholders.map(s => ({
            userId: s._id.toString(),
            email: s.email,
            name: `${s.firstName || ''} ${s.lastName || ''}`.trim(),
            authority: s.authority,
            roles: (s.roles || []).filter(r => r.isActive).map(r => r.roleCode || 'unknown'),
            hasOrganizations: (s.organizations || []).length > 0,
            organizationsCount: (s.organizations || []).length,
            hasMunicipality: !!(s.locations && s.locations.municipalityId),
            municipalityId: s.locations?.municipalityId?.toString() || 'none'
          }))
        });
        
        // Check if stakeholders have request.review permission via their roles
        const stakeholderRoleIds = allStakeholders
          .flatMap(s => (s.roles || []).filter(r => r.isActive).map(r => r.roleId))
          .filter(Boolean);
        
        if (stakeholderRoleIds.length > 0) {
          const { Role } = require('../../models/index');
          const stakeholderRoles = await Role.find({
            _id: { $in: stakeholderRoleIds }
          }).select('_id code name authority permissions');
          
          console.log('[DIAG] Stakeholder roles and permissions:', stakeholderRoles.map(r => ({
            roleId: r._id.toString(),
            code: r.code,
            name: r.name,
            authority: r.authority,
            hasRequestReview: r.permissions?.some(p => 
              (p.resource === '*' || p.resource === 'request') && 
              (p.actions?.includes('*') || p.actions?.includes('review'))
            ) || false
          })));
        }
      }

      // NEW: Authority filtering - filter out users with equal/higher authority than requester
      let filteredUserIds = Array.from(userIdsSet);
      
      if (requesterId && filteredUserIds.length > 0) {
        const authorityService = require('../../services/users_services/authority.service');
        
        // Allow equal authority ONLY for explicit staff management context (staff.*)
        // Do NOT allow equal authority for request/event review contexts — coordinators must not see other coordinators there
        const isStaffManagementContext = capabilities.some(cap => cap.startsWith('staff.'));

        filteredUserIds = await authorityService.filterUsersByAuthority(
          requesterId,
          filteredUserIds,
          context,
          isStaffManagementContext // Allow equal authority only for staff management
        );
        
        console.log('[listUsersByCapability] Authority filtering:', {
          beforeFiltering: userIdsSet.size,
          afterFiltering: filteredUserIds.length,
          allowEqualAuthority: isStaffManagementContext,
          filteredOut: userIdsSet.size - filteredUserIds.length
        });
        
        // Enhanced diagnostic for coordinator/stakeholder queries after authority filtering
        if (isCoordinatorQuery || isStakeholderQuery) {
          const queryType = isCoordinatorQuery ? 'COORDINATORS' : 'STAKEHOLDERS';
          console.log(`[DIAG] ${queryType} - After authority filtering:`, {
            beforeFiltering: userIdsSet.size,
            afterFiltering: filteredUserIds.length,
            filteredOut: userIdsSet.size - filteredUserIds.length,
            requesterAuthority: requesterId ? 'will be calculated' : 'no requester'
          });
        }
      }

      // Build query
      const query = {};

      // Server-side jurisdiction filtering: ensure users are within requester's jurisdiction
      // Operational admins (authority ≥ 80) bypass jurisdiction filtering
      if (requesterId && filteredUserIds.length > 0) {
        try {
          const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
          
          // Operational admins (≥80) bypass jurisdiction checks
          if (requesterAuthority >= 80) {
            console.log('[listUsersByCapability] Jurisdiction filtering bypassed (admin):', {
              requesterAuthority,
              userIdsCount: filteredUserIds.length
            });
          } else {
            const jurisdictionService = require('../../services/users_services/jurisdiction.service');
            const jurisdictionFiltered = await jurisdictionService.filterUsersByJurisdiction(requesterId, filteredUserIds);
            console.log('[listUsersByCapability] Jurisdiction filtering:', {
              before: filteredUserIds.length,
              after: jurisdictionFiltered.length,
              requesterAuthority,
              filteredOut: filteredUserIds.length - jurisdictionFiltered.length
            });
            
            // Enhanced diagnostic for coordinator/stakeholder queries after jurisdiction filtering
            if (isCoordinatorQuery || isStakeholderQuery) {
              const queryType = isCoordinatorQuery ? 'COORDINATORS' : 'STAKEHOLDERS';
              console.log(`[DIAG] ${queryType} - After jurisdiction filtering:`, {
                beforeFiltering: filteredUserIds.length,
                afterFiltering: jurisdictionFiltered.length,
                filteredOut: filteredUserIds.length - jurisdictionFiltered.length,
                requesterAuthority
              });
            }
            filteredUserIds = jurisdictionFiltered;
          }
        } catch (err) {
          console.error('[listUsersByCapability] Jurisdiction filtering error:', err);
          // On error, fail safe: return empty list
          filteredUserIds = [];
        }
      }

      // Role type filtering: For stakeholder pages (request.review), explicitly filter to stakeholder roles only
      // This ensures coordinators don't appear in stakeholder lists
      // Use embedded User.roles[] array AND user authority field
      const roleTypeFilteredCount = filteredUserIds.length;
      if (capabilities.includes('request.review') && !capabilities.some(c => c.startsWith('staff.')) && filteredUserIds.length > 0) {
        try {
          const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
          
          // Get stakeholder role codes (authority < COORDINATOR)
          const { Role } = require('../../models');
          const stakeholderRoles = await Role.find({
            authority: { $lt: AUTHORITY_TIERS.COORDINATOR }
          }).select('_id code authority');
          
          const stakeholderRoleIds = new Set(stakeholderRoles.map(r => r._id.toString()));
          const stakeholderRoleCodes = new Set(stakeholderRoles.map(r => r.code));
          
          console.log('[listUsersByCapability] Role type filtering - Stakeholder roles found:', {
            count: stakeholderRoles.length,
            roleCodes: Array.from(stakeholderRoleCodes),
            roleIds: Array.from(stakeholderRoleIds)
          });
          
          if (stakeholderRoleIds.size > 0) {
            // Get users who have stakeholder roles OR have authority < COORDINATOR
            // This handles cases where authority is set but roles might be missing
            const usersToCheck = await User.find({
              _id: { $in: filteredUserIds },
              $or: [
                { 'roles.roleAuthority': { $lt: AUTHORITY_TIERS.COORDINATOR }, 'roles.isActive': true },
                { authority: { $lt: AUTHORITY_TIERS.COORDINATOR } }
              ]
            }).select('_id roles authority');
            
            const stakeholderUserIds = new Set();
            usersToCheck.forEach(user => {
              // Check 1: User authority < COORDINATOR (most reliable)
              const userAuthority = user.authority || 20;
              if (userAuthority < AUTHORITY_TIERS.COORDINATOR) {
                stakeholderUserIds.add(user._id.toString());
                return;
              }
              
              // Check 2: User has stakeholder role in embedded array
              if (user.roles && user.roles.length > 0) {
                const hasStakeholderRole = user.roles.some(role => {
                  if (!role.isActive) return false;
                  
                  const roleId = role.roleId?.toString();
                  const roleCode = role.roleCode;
                  const roleAuthority = role.roleAuthority;
                  
                  // Check by role ID, code, or authority
                  return (roleId && stakeholderRoleIds.has(roleId)) ||
                         (roleCode && stakeholderRoleCodes.has(roleCode)) ||
                         (roleAuthority !== undefined && roleAuthority < AUTHORITY_TIERS.COORDINATOR);
                });
                
                if (hasStakeholderRole) {
                  stakeholderUserIds.add(user._id.toString());
                }
              }
            });
            
            const beforeRoleFilter = filteredUserIds.length;
            filteredUserIds = filteredUserIds.filter(id => 
              stakeholderUserIds.has(id.toString())
            );
            
            console.log('[listUsersByCapability] Role type filtering:', {
              before: beforeRoleFilter,
              after: filteredUserIds.length,
              filteredOut: beforeRoleFilter - filteredUserIds.length,
              stakeholderRoleIds: stakeholderRoleIds.size,
              usersChecked: usersToCheck.length,
              usersWithStakeholderRoles: stakeholderUserIds.size,
              method: 'authority_and_roles'
            });
          } else {
            console.log('[listUsersByCapability] Role type filtering - No stakeholder roles found, using authority-based filtering');
            // Fallback: filter by authority only if no stakeholder roles exist
            const usersByAuthority = await User.find({
              _id: { $in: filteredUserIds },
              authority: { $lt: AUTHORITY_TIERS.COORDINATOR }
            }).select('_id authority');
            
            filteredUserIds = usersByAuthority.map(u => u._id.toString());
            
            console.log('[listUsersByCapability] Authority-based filtering (fallback):', {
              before: roleTypeFilteredCount,
              after: filteredUserIds.length
            });
          }
        } catch (err) {
          console.error('[listUsersByCapability] Role type filtering error:', err);
          // On error, try fallback to authority-based filtering
          try {
            const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
            const usersByAuthority = await User.find({
              _id: { $in: filteredUserIds },
              authority: { $lt: AUTHORITY_TIERS.COORDINATOR }
            }).select('_id authority');
            
            filteredUserIds = usersByAuthority.map(u => u._id.toString());
            console.log('[listUsersByCapability] Fallback authority filtering:', {
              after: filteredUserIds.length
            });
          } catch (fallbackErr) {
            console.error('[listUsersByCapability] Fallback filtering also failed:', fallbackErr);
            // Final fail safe: return empty list
            filteredUserIds = [];
          }
        }
      }
      
      // Comprehensive diagnostic logging for stakeholder display
      if (capabilities.includes('request.review') && !capabilities.some(c => c.startsWith('staff.'))) {
        const afterJurisdictionCount = filteredUserIds.length; // This is after jurisdiction filter
        console.log('[DIAG] Stakeholder Display Filtering Breakdown:', {
          totalUsersWithCapability: userIdsSet.size,
          afterAuthorityFilter: roleTypeFilteredCount,
          afterJurisdictionFilter: afterJurisdictionCount,
          afterRoleTypeFilter: filteredUserIds.length,
          filteredOut: {
            byAuthority: userIdsSet.size - roleTypeFilteredCount,
            byJurisdiction: roleTypeFilteredCount - afterJurisdictionCount,
            byRoleType: afterJurisdictionCount - filteredUserIds.length
          },
          requesterId: requesterId?.toString(),
          requesterAuthority: requesterId ? await require('../../services/users_services/authority.service').calculateUserAuthority(requesterId) : 'unknown'
        });
      }

      // Authority-based filtering for operational staff (Staff Operations page)
      // Filter: authority >= 60 AND authority !== 100
      // This ensures only valid staff/coordinators are shown, excluding stakeholders and super admins
      const isOperationalStaffQuery = isCoordinatorQuery || capabilities.some(c => 
        c === 'staff.create' || c === 'staff.update' || c === 'staff.delete' || 
        c === 'event.create' || c === 'event.update' || c === 'request.create'
      );
      
      if (isOperationalStaffQuery && filteredUserIds.length > 0) {
        try {
          const usersToCheck = await User.find({
            _id: { $in: filteredUserIds }
          }).select('_id authority').lean();
          
          const validStaffIds = usersToCheck
            .filter(user => {
              const authority = user.authority || 20;
              // Only include users with authority >= 60 (staff/coordinator level) and exclude super admins (100)
              return authority >= 60 && authority !== 100;
            })
            .map(user => user._id.toString());
          
          const beforeStaffFilter = filteredUserIds.length;
          filteredUserIds = validStaffIds;
          
          console.log('[listUsersByCapability] Operational staff authority filtering:', {
            before: beforeStaffFilter,
            after: filteredUserIds.length,
            filteredOut: beforeStaffFilter - filteredUserIds.length,
            criteria: 'authority >= 60 AND authority !== 100'
          });
        } catch (err) {
          console.error('[listUsersByCapability] Operational staff authority filtering error:', err);
          // On error, fail safe: filter client-side will handle it
        }
      }
      
      if (filteredUserIds.length > 0) {
        query._id = { $in: filteredUserIds };
      } else {
        // No users found with these capabilities or all filtered out by authority
        query._id = { $in: [] };
      }

      // Default to only active users (soft delete support)
      // Only show inactive users if explicitly requested
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      } else {
        // Default to active users only for listUsersByCapability
        query.isActive = true;
      }

      if (organizationType) {
        query.organizationType = organizationType;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const users = await User.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);
      
      console.log('[listUsersByCapability] Query results:', {
        queryUserIdCount: userIdsSet.size,
        queryConditions: Object.keys(query).length,
        totalUsers: total,
        returnedUsers: users.length,
        page,
        limit
      });
      
      // Final diagnostic for coordinator/stakeholder queries
      if (isCoordinatorQuery || isStakeholderQuery) {
        const queryType = isCoordinatorQuery ? 'COORDINATORS' : 'STAKEHOLDERS';
        const authorityService = require('../../services/users_services/authority.service');
        const requesterAuthority = requesterId ? await authorityService.calculateUserAuthority(requesterId) : null;
        
        console.log(`[DIAG] ${queryType} - FINAL RESULTS:`, {
          queryType,
          totalReturned: users.length,
          totalInDatabase: total,
          requesterAuthority,
          requesterTier: requesterAuthority ? require('../../services/users_services/authority.service').AuthorityService.getAuthorityTierName(requesterAuthority) : 'unknown',
          userAuthorities: users.slice(0, 10).map(u => ({
            userId: u._id.toString(),
            name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
            authority: u.authority,
            tier: require('../../services/users_services/authority.service').AuthorityService.getAuthorityTierName(u.authority || 20),
            orgs: (u.organizations || []).length,
            coverageAreas: (u.coverageAreas || []).length
          })),
          emptyResult: users.length === 0,
          possibleIssues: users.length === 0 ? [
            'No users with required permission/authority in database',
            'All users filtered out by authority hierarchy',
            'All users filtered out by jurisdiction (org/coverage mismatch)',
            'Check if requester has organizations[] and coverageAreas[] set',
            'For coordinators: ensure users have authority >= 60',
            'For stakeholders: ensure users have authority < 60'
          ] : []
        });
      }

      // Remove passwords from response and ensure coverage area/organization data is included
      // Also resolve province/district from municipality for table display
      const usersResponse = await Promise.all(users.map(async (u) => {
        const userObj = u.toObject();
        delete userObj.password;
        
        // Ensure locations (municipality/barangay) are properly formatted
        // Locations are already embedded in user document as: { municipalityId, municipalityName, barangayId?, barangayName? }
        
        // Resolve province and district from municipality for table display
        if (userObj.locations && userObj.locations.municipalityId) {
          try {
            const { Location } = require('../../models');
            const municipality = await Location.findById(userObj.locations.municipalityId);
            
            if (municipality) {
              // Get ancestors to find district and province
              const ancestors = await locationService.getLocationAncestors(municipality._id, {
                includeSelf: false,
                includeInactive: false
              });

              // Find district (type === 'district' or type === 'city' with isCity metadata)
              const districtObj = ancestors.find(a => 
                a.type === 'district' || 
                (a.type === 'city' && a.metadata?.isCity)
              );

              // Find province (type === 'province')
              const provinceObj = ancestors.find(a => a.type === 'province');

              // Add province and district names to user object for table display
              if (provinceObj) {
                userObj.Province_Name = provinceObj.name || provinceObj.Province_Name || '';
                userObj.province = provinceObj.name || provinceObj.Province_Name || '';
              }
              
              if (districtObj) {
                userObj.District_Name = districtObj.name || districtObj.District_Name || '';
                userObj.district = districtObj.name || districtObj.District_Name || '';
                // Also include district ID for frontend resolution
                userObj.District_ID = districtObj._id.toString();
                userObj.DistrictId = districtObj._id.toString();
              }
            }
          } catch (error) {
            // If resolution fails, continue without province/district (non-critical)
            console.warn(`[listUsersByCapability] Failed to resolve province/district for user ${u._id}:`, error.message);
          }
        }
        
        // Ensure organizations array is included (for stakeholders, should have one organization)
        // Organizations are already embedded in user document as: [{ organizationId, organizationName, organizationType, ... }]
        
        return userObj;
      }));

      return res.status(200).json({
        success: true,
        data: usersResponse,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to list users by capability'
      });
    }
  }

  /**
   * Get create context for user creation forms
   * GET /api/users/create-context?pageContext=stakeholder-management
   * Returns allowedRoles, lockedFields, defaultValues, requiredFields, optionalFields
   */
  async getCreateContext(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const pageContext = req.query.pageContext || req.headers['x-page-context'];
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!pageContext) {
        return res.status(400).json({
          success: false,
          message: 'pageContext query parameter is required'
        });
      }

      const permissionController = require('../rbac_controller/permission.controller');
      const jurisdictionService = require('../../services/users_services/jurisdiction.service');
      const authorityService = require('../../services/users_services/authority.service');
      
      // Get assignable roles for this context
      const assignableRolesReq = {
        user: { id: userId, _id: userId },
        query: { context: pageContext }
      };
      
      let assignableRolesResponse;
      try {
        assignableRolesResponse = await permissionController.getAssignableRoles(assignableRolesReq, {
          status: (code) => ({ json: (data) => data }),
          json: (data) => data
        });
      } catch (error) {
        console.error('[RBAC] getCreateContext - Error getting assignable roles:', error);
        assignableRolesResponse = { success: true, data: [] };
      }
      
      const allowedRoles = assignableRolesResponse.success ? assignableRolesResponse.data : [];
      
      // Get user authority
      const userAuthority = await authorityService.calculateUserAuthority(userId);
      const isSystemAdmin = userAuthority >= 100;
      
      // Determine field states based on context and authority
      let lockedFields = [];
      let defaultValues = {};
      let requiredFields = [];
      let optionalFields = [];
      
      if (pageContext === 'stakeholder-management') {
        // Stakeholder creation context
        // Note: This endpoint is deprecated in favor of /api/stakeholders/creation-context
        // Role is dynamically determined based on creator's authority
        // Default to first available role if only one option
        if (allowedRoles.length === 1) {
          defaultValues.role = allowedRoles[0].code;
          lockedFields.push('role');
        }
        
        requiredFields = ['municipality', 'organization'];
        optionalFields = ['barangay'];
        
        // Organization is locked for coordinators (they can only assign their own organizations)
        if (!isSystemAdmin) {
          lockedFields.push('organization');
        }
      } else if (pageContext === 'coordinator-management') {
        // Coordinator creation context
        requiredFields = ['role', 'coverageArea', 'organization'];
        optionalFields = [];
        
        // Role is locked if only one role available
        if (allowedRoles.length === 1) {
          lockedFields.push('role');
          defaultValues.role = allowedRoles[0].code;
        }
        
        // Organization is NOT locked - coordinators can select multiple organizations
        // Only lock if creator has no organizations (shouldn't happen, but safety check)
      }
      
      // Get allowed organizations for the creator
      let allowedOrganizations = [];
      let allowedMunicipalities = [];
      let allowedCoverageAreas = [];
      
      try {
        if (pageContext === 'coordinator-management') {
          // For coordinator creation, use coordinator-specific methods
          allowedOrganizations = await jurisdictionService.getAllowedOrganizationsForCoordinatorCreation(userId);
          allowedMunicipalities = await jurisdictionService.getMunicipalitiesForCoordinatorCreation(userId);
          allowedCoverageAreas = await jurisdictionService.getCreatorJurisdictionForStakeholderCreation(userId);
        } else {
          // For stakeholder creation, use stakeholder-specific methods
          allowedOrganizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(userId);
          allowedCoverageAreas = await jurisdictionService.getCreatorJurisdictionForStakeholderCreation(userId);
        }
      } catch (error) {
        console.error('[RBAC] getCreateContext - Error getting allowed data:', error);
      }
      
      // Roles are already filtered by getAssignableRoles based on authority and context
      // For coordinator-management, returns coordinator-level roles (authority >= 60)
      // For stakeholder-management, returns stakeholder-level roles (authority < 60)
      
      return res.status(200).json({
        success: true,
        data: {
          pageContext,
          allowedRoles: allowedRoles.map(r => ({
            _id: r._id,
            code: r.code,
            name: r.name,
            description: r.description,
            authority: r.authority
          })),
          lockedFields,
          defaultValues,
          requiredFields,
          optionalFields,
          allowedOrganizations: allowedOrganizations.map(org => ({
            _id: org._id,
            name: org.name,
            type: org.type,
            code: org.code
          })),
          allowedMunicipalities: allowedMunicipalities.map(muni => ({
            _id: muni._id,
            name: muni.name,
            code: muni.code,
            type: muni.type,
            parent: muni.parent?._id || muni.parent,
            districtId: muni.parent?._id || muni.parent,
            province: muni.province?._id || muni.province
          })),
          allowedCoverageAreas: allowedCoverageAreas.map(ca => ({
            _id: ca._id || ca.coverageAreaId?._id || ca.coverageAreaId,
            name: ca.name || ca.coverageAreaId?.name
          })),
          isSystemAdmin
        }
      });
    } catch (error) {
      console.error('[RBAC] getCreateContext - Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get create context'
      });
    }
  }

  /**
   * Get municipalities with nested barangays for coordinator creation
   * GET /api/users/creation-context/municipalities
   */
  async getMunicipalitiesWithBarangays(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const jurisdictionService = require('../../services/users_services/jurisdiction.service');
      const { Location } = require('../../models');
      
      // Get municipalities available to creator
      const municipalities = await jurisdictionService.getMunicipalitiesForCoordinatorCreation(userId);
      
      // Get barangays for each municipality
      const municipalitiesWithBarangays = await Promise.all(
        municipalities.map(async (municipality) => {
          const barangays = await Location.find({
            type: 'barangay',
            parent: municipality._id,
            isActive: true
          })
            .sort({ name: 1 })
            .select('_id name code type parent');
          
          return {
            _id: municipality._id,
            name: municipality.name,
            code: municipality.code,
            type: municipality.type,
            parent: municipality.parent?._id || municipality.parent,
            districtId: municipality.parent?._id || municipality.parent,
            province: municipality.province?._id || municipality.province,
            barangays: barangays.map(b => ({
              _id: b._id,
              name: b.name,
              code: b.code,
              type: b.type,
              parent: b.parent
            }))
          };
        })
      );
      
      return res.status(200).json({
        success: true,
        data: {
          municipalities: municipalitiesWithBarangays
        }
      });
    } catch (error) {
      console.error('[RBAC] getMunicipalitiesWithBarangays - Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get municipalities with barangays'
      });
    }
  }

  /**
   * Get comprehensive diagnostic information for a user
   * GET /api/users/:userId/diagnostics
   */
  async getUserDiagnostics(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Get user
      const user = await User.findById(userId) || await User.findByLegacyId(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if requester can view this user (authority check)
      const authorityService = require('../../services/users_services/authority.service');
      const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
      const targetAuthority = user.authority || await authorityService.calculateUserAuthority(user._id);
      
      const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
      const isSystemAdmin = requesterAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN;
      const canView = isSystemAdmin || requesterAuthority > targetAuthority || requesterId?.toString() === userId;
      
      if (!canView) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view diagnostics for this user'
        });
      }

      // Get role details
      const { Role } = require('../../models');
      const roleDetails = [];
      for (const embeddedRole of user.roles || []) {
        if (embeddedRole.isActive) {
          const role = await Role.findById(embeddedRole.roleId);
          if (role) {
            roleDetails.push({
              roleId: role._id,
              roleCode: embeddedRole.roleCode,
              roleName: role.name,
              roleAuthority: embeddedRole.roleAuthority,
              assignedAt: embeddedRole.assignedAt,
              assignedBy: embeddedRole.assignedBy
            });
          }
        }
      }

      // Get organization details
      const { Organization } = require('../../models');
      const organizationDetails = [];
      for (const embeddedOrg of user.organizations || []) {
        const org = await Organization.findById(embeddedOrg.organizationId);
        if (org) {
          organizationDetails.push({
            organizationId: org._id,
            organizationName: embeddedOrg.organizationName,
            organizationType: embeddedOrg.organizationType,
            isPrimary: embeddedOrg.isPrimary,
            assignedAt: embeddedOrg.assignedAt,
            assignedBy: embeddedOrg.assignedBy
          });
        }
      }

      // Get coverage area details
      const { CoverageArea } = require('../../models');
      const coverageAreaDetails = [];
      for (const embeddedCA of user.coverageAreas || []) {
        const ca = await CoverageArea.findById(embeddedCA.coverageAreaId);
        if (ca) {
          coverageAreaDetails.push({
            coverageAreaId: ca._id,
            coverageAreaName: embeddedCA.coverageAreaName,
            districtCount: embeddedCA.districtIds?.length || 0,
            municipalityCount: embeddedCA.municipalityIds?.length || 0,
            isPrimary: embeddedCA.isPrimary,
            assignedAt: embeddedCA.assignedAt
          });
        }
      }

      // Get location details (for stakeholders)
      const { Location } = require('../../models');
      let locationDetails = null;
      if (user.locations && user.locations.municipalityId) {
        const municipality = await Location.findById(user.locations.municipalityId);
        const barangay = user.locations.barangayId ? await Location.findById(user.locations.barangayId) : null;
        
        locationDetails = {
          municipality: municipality ? {
            _id: municipality._id,
            name: user.locations.municipalityName,
            code: municipality.code
          } : null,
          barangay: barangay ? {
            _id: barangay._id,
            name: user.locations.barangayName,
            code: barangay.code
          } : null
        };
      }

      // Validation summary
      const validation = {
        hasRequiredRole: (user.roles || []).some(r => r.isActive),
        hasRequiredOrganization: (user.organizations || []).length > 0,
        hasRequiredCoverage: (user.coverageAreas || []).length > 0 || (user.locations && user.locations.municipalityId),
        canCreateStakeholders: (user.authority >= 60 || user.isSystemAdmin) && 
                              (user.organizations || []).length > 0 && 
                              ((user.coverageAreas || []).some(ca => (ca.municipalityIds || []).length > 0) || user.isSystemAdmin),
        isValid: true
      };

      // Check for issues
      const issues = [];
      if (user.authority >= 60 && !user.isSystemAdmin) {
        if ((user.organizations || []).length === 0) {
          issues.push('NO_ORGANIZATIONS');
          validation.isValid = false;
        }
        if ((user.coverageAreas || []).length === 0) {
          issues.push('NO_COVERAGE_AREAS');
          validation.isValid = false;
        }
        const hasMunicipalities = (user.coverageAreas || []).some(ca => (ca.municipalityIds || []).length > 0);
        if (!hasMunicipalities && (user.coverageAreas || []).length > 0) {
          issues.push('NO_MUNICIPALITIES');
          validation.isValid = false;
        }
      }
      if (user.authority < 60) {
        if (!user.locations || !user.locations.municipalityId) {
          issues.push('NO_MUNICIPALITY');
          validation.isValid = false;
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          user: {
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            authority: user.authority,
            authorityTier: (() => {
              const { AuthorityService } = require('../../services/users_services/authority.service');
              return AuthorityService.getAuthorityTierName ? AuthorityService.getAuthorityTierName(user.authority) : 'UNKNOWN';
            })(),
            isSystemAdmin: user.isSystemAdmin,
            isActive: user.isActive
          },
          roles: roleDetails,
          organizations: organizationDetails,
          coverageAreas: coverageAreaDetails,
          locations: locationDetails,
          validation: {
            ...validation,
            issues: issues
          },
          summary: {
            canCreateStakeholders: validation.canCreateStakeholders,
            missingData: {
              organizations: (user.organizations || []).length === 0,
              coverageAreas: (user.coverageAreas || []).length === 0,
              municipalities: !(user.coverageAreas || []).some(ca => (ca.municipalityIds || []).length > 0),
              municipality: !(user.locations && user.locations.municipalityId)
            }
          }
        }
      });
    } catch (error) {
      console.error('[DIAG] Error in getUserDiagnostics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user diagnostics'
      });
    }
  }

  /**
   * Resolve coordinator(s) for a stakeholder
   * 
   * Uses enhanced CoordinatorResolverService to find valid coordinators that:
   * 1. Match the stakeholder's organization type
   * 2. Have coverage areas containing the stakeholder's municipality/district
   * 
   * @route GET /api/users/:userId/coordinator
   * @desc Resolve coordinator(s) for a stakeholder
   * @access Private
   */
  async resolveCoordinatorForStakeholder(req, res) {
    try {
      const { userId } = req.params;
      
      console.log('[resolveCoordinatorForStakeholder] Resolving coordinator for stakeholder:', {
        userId,
        timestamp: new Date().toISOString()
      });

      // Validate that user exists
      const stakeholder = await User.findById(userId);
      if (!stakeholder) {
        return res.status(404).json({
          success: false,
          message: 'Stakeholder not found'
        });
      }

      // Check if user is actually a stakeholder (authority < 60)
      const authorityService = require('../../services/users_services/authority.service');
      const stakeholderAuthority = stakeholder.authority || await authorityService.calculateUserAuthority(userId);
      
      if (stakeholderAuthority >= 60) {
        return res.status(400).json({
          success: false,
          message: 'User is not a stakeholder'
        });
      }

      // Use enhanced CoordinatorResolverService
      const coordinatorResolverService = require('../../services/users_services/coordinatorResolver.service');
      const result = await coordinatorResolverService.resolveValidCoordinators(userId);

      console.log('[resolveCoordinatorForStakeholder] Resolution complete:', {
        stakeholderId: userId,
        coordinatorsCount: result.coordinators.length,
        coordinators: result.coordinators.map(c => ({
          id: c._id.toString(),
          name: c.fullName,
          organizationType: c.organizationType
        }))
      });

      return res.status(200).json({
        success: true,
        data: {
          coordinators: result.coordinators,
          primaryCoordinator: result.primaryCoordinator,
          _debug: {
            validationDetails: process.env.NODE_ENV === 'development' ? result.validationDetails : undefined
          }
        }
      });
    } catch (error) {
      console.error('[resolveCoordinatorForStakeholder] Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to resolve coordinator for stakeholder'
      });
    }
  }

  /**
   * Diagnostic endpoint for coordinator resolution
   * @route GET /api/users/:userId/coordinator/diagnostic
   */
  async diagnoseCoordinatorResolution(req, res) {
    try {
      const { userId } = req.params;
      const stakeholder = await User.findById(userId);
      
      if (!stakeholder) {
        return res.status(404).json({
          success: false,
          message: 'Stakeholder not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          stakeholder: {
            _id: stakeholder._id,
            email: stakeholder.email,
            firstName: stakeholder.firstName,
            lastName: stakeholder.lastName,
            authority: stakeholder.authority,
            organizations: stakeholder.organizations || [],
            locations: stakeholder.locations || {},
            roles: stakeholder.roles || []
          }
        }
      });
    } catch (error) {
      console.error('[diagnoseCoordinatorResolution] Error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to diagnose coordinator resolution'
      });
    }
  }
}

module.exports = new UserController();
