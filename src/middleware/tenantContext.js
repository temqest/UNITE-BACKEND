const mongoose = require('mongoose');
const { Organization, UserOrganization, User } = require('../models');

/**
 * Tenant context middleware
 *
 * Resolves the active organization (tenant) for each authenticated request and
 * attaches it to req.tenant. Resolution order:
 * 1. Explicit header: X-Organization-Id (ObjectId) or X-Organization-Code (slug/code)
 * 2. Primary UserOrganization assignment for the authenticated user
 * 3. Embedded User.organizations (fallback)
 *
 * Rules:
 * - Organization must exist and be active.
 * - User must be assigned to the organization (unless isSystemAdmin).
 * - On failure, responds with 400/403 instead of proceeding with ambiguous tenant.
 */
module.exports = async function tenantContext(req, res, next) {
  try {
    // Allow unauthenticated public routes to bypass tenant resolution
    // (e.g., health checks, some public content). Authenticated routes
    // should already be behind authenticate() in the router.
    const isPublic =
      req.path.startsWith('/health') ||
      req.path.startsWith('/public/');

    // If there is no authenticated user and this is not an explicitly public route,
    // let downstream auth middleware handle it.
    if (!req.user && !isPublic) {
      return next();
    }

    // System admins may operate without a specific tenant in some contexts.
    const isSystemAdmin = !!req.user?.isSystemAdmin;

    let organization = null;

    // -------- 1) Explicit header-based resolution --------
    const rawOrgId = req.header('X-Organization-Id') || req.header('x-organization-id');
    const rawOrgCode = req.header('X-Organization-Code') || req.header('x-organization-code');

    if (rawOrgId || rawOrgCode) {
      const orgQuery = {};

      if (rawOrgId) {
        if (!mongoose.Types.ObjectId.isValid(rawOrgId)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid X-Organization-Id header (must be a valid ObjectId)',
          });
        }
        orgQuery._id = rawOrgId;
      } else if (rawOrgCode) {
        orgQuery.code = String(rawOrgCode).toLowerCase().trim();
      }

      organization = await Organization.findOne({ ...orgQuery, isActive: true }).lean();

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found or inactive for provided tenant header',
        });
      }
    }

    // -------- 2) Resolve from user assignments when no explicit header --------
    if (!organization && req.user) {
      const userId = req.user.id || req.user._id;

      if (userId) {
        // Prefer explicit UserOrganization mapping
        const userOrg = await UserOrganization.findPrimaryOrganization(userId);
        if (userOrg?.organizationId && userOrg.organizationId.isActive !== false) {
          organization = userOrg.organizationId.toObject ? userOrg.organizationId.toObject() : userOrg.organizationId;
        }

        // Fallback: embedded User.organizations
        if (!organization) {
          const userDoc = await User.findById(userId).lean();
          if (userDoc && Array.isArray(userDoc.organizations) && userDoc.organizations.length > 0) {
            const primary = userDoc.organizations.find((o) => o.isPrimary) || userDoc.organizations[0];
            if (primary?.organizationId) {
              const inferredOrg = await Organization.findOne({
                _id: primary.organizationId,
                isActive: true,
              }).lean();
              if (inferredOrg) {
                organization = inferredOrg;
              }
            }
          }
        }
      }
    }

    // -------- 3) Enforce membership (non-admin users) --------
    if (organization && req.user && !isSystemAdmin) {
      const userId = req.user.id || req.user._id;
      if (userId) {
        // Check UserOrganization for membership
        const membership = await UserOrganization.findOne({
          userId,
          organizationId: organization._id,
          isActive: true,
        })
          .select('_id expiresAt')
          .lean();

        let isMember = false;
        if (membership) {
          if (!membership.expiresAt || new Date(membership.expiresAt) > new Date()) {
            isMember = true;
          }
        } else {
          // Fallback: check embedded organizations array
          const userDoc = await User.findById(userId)
            .select('organizations')
            .lean();
          if (userDoc && Array.isArray(userDoc.organizations)) {
            isMember = userDoc.organizations.some((o) => {
              if (!o || !o.organizationId) return false;
              const orgId = o.organizationId.toString ? o.organizationId.toString() : String(o.organizationId);
              const targetId = organization._id.toString ? organization._id.toString() : String(organization._id);
              return orgId === targetId && o.isActive !== false;
            });
          }
        }

        if (!isMember) {
          return res.status(403).json({
            success: false,
            message: 'User is not a member of the requested organization',
          });
        }
      }
    }

    // For non-admin users, we require a resolved tenant for authenticated routes.
    if (!organization && req.user && !isSystemAdmin && !isPublic) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve tenant organization for this request',
      });
    }

    // Attach tenant context (may be null for global/public/system-admin contexts)
    req.tenant = {
      organizationId: organization ? organization._id : null,
      organization: organization || null,
      isSystemAdmin,
    };

    return next();
  } catch (err) {
    console.error('[tenantContext] Error resolving tenant:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve tenant organization',
    });
  }
}

