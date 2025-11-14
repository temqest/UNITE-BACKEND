const stakeholderService = require('../../services/users_services/stakeholder.service');
const { signToken } = require('../../utils/jwt');

class StakeholderController {
  async register(req, res) {
    try {
      const result = await stakeholderService.register(req.body);
      return res.status(201).json({ success: true, data: result.stakeholder });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }
      const result = await stakeholderService.authenticate(email, password);
  const token = signToken({ id: result.stakeholder.Stakeholder_ID, role: 'Stakeholder', district_id: result.stakeholder.District_ID, coordinator_id: result.stakeholder.Coordinator_ID });
      // Set a server-side cookie with a sanitized user payload so the
      // frontend (Next.js app) can read it during SSR and show admin links
      // without waiting for client-side localStorage. Cookie contains only
      // non-sensitive profile data (no password). Use HttpOnly false so
      // client code could still read it if needed; set secure in production.
      try {
        const roleStr = String(result.stakeholder.Role || result.stakeholder.role || result.stakeholder.StaffType || '').toLowerCase();
        const isAdminFlag = !!result.stakeholder.isAdmin || (/sys|system/.test(roleStr) && roleStr.includes('admin')) || roleStr.includes('admin');
        const cookieValue = JSON.stringify({
          role: result.stakeholder.Role || result.stakeholder.role || result.stakeholder.StaffType || null,
          isAdmin: !!isAdminFlag,
          First_Name: result.stakeholder.First_Name || result.stakeholder.FirstName || null,
          email: result.stakeholder.Email || result.stakeholder.email || null,
          id: result.stakeholder.Stakeholder_ID || result.stakeholder.id || null,
        });
        if (process.env.NODE_ENV !== 'production') {
          try { console.log('[auth] setting unite_user cookie (stakeholder login):', cookieValue); } catch (e) {}
        }
        const cookieOpts = {
          // HttpOnly so the cookie is only used by the server on subsequent requests
          httpOnly: true,
          // Use secure + SameSite='none' in production for cross-site compatibility.
          // During local development, avoid Secure and use SameSite='lax' so
          // the cookie is not rejected by browsers that require Secure for
          // SameSite=None.
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
          path: '/',
        };
        // Ensure any previous cookie is cleared first to avoid stale values
        try {
          res.clearCookie('unite_user', { path: '/' });
        } catch (e) {}
        // Do not force domain in development to avoid mismatches
        res.cookie('unite_user', cookieValue, cookieOpts);
      } catch (e) {
        // ignore cookie set errors
      }

      return res.status(200).json({ success: true, data: result.stakeholder, token });
    } catch (error) {
      return res.status(401).json({ success: false, message: error.message });
    }
  }

  async list(req, res) {
    try {
      // Start with client-provided filters but enforce server-side restrictions
      const filters = {
        district_id: req.query.district_id,
        email: req.query.email
      };

      // Authorization: enforce coordinator-scoped listing on the server
      const actor = req.user || {};
      const role = String(actor.role || '').toLowerCase();
      const isAdmin = (role && role.includes('admin')) || !!actor.isAdmin;

      if (!isAdmin) {
        const isCoordinator = role && role.includes('coordinator');
        // Coordinators must only see stakeholders in their district.
        if (!isCoordinator) {
          return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
        }

        const actorDistrict = actor.district_id || actor.district || (actor.role_data && actor.role_data.district_id) || null;
        if (!actorDistrict) {
          return res.status(403).json({ success: false, message: 'Unauthorized: coordinator missing district information' });
        }

        // Override any client-supplied district filter to prevent bypassing
        filters.district_id = String(actorDistrict);
      }
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const result = await stakeholderService.list(filters, page, limit);
      return res.status(200).json({ success: true, data: result.data, pagination: result.pagination });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  async getById(req, res) {
    try {
      const id = req.params.stakeholderId;
      // Authorization: only system admins or coordinators from the same district may view
      const actor = req.user || {};
      const role = String(actor.role || '').toLowerCase();
      const isAdmin = (role && role.includes('admin')) || !!actor.isAdmin;

      const result = await stakeholderService.getById(id);
      const stakeholder = result.data;

      if (!isAdmin) {
        // Allow coordinators only for stakeholders in their district
        const isCoordinator = role && role.includes('coordinator');
        const isStakeholder = role && role.includes('stakeholder');

        // Allow stakeholders to fetch their own record
        if (isStakeholder) {
          // actor.id comes from token payload (see signin flows)
          const actorId = actor.id || actor.userId || actor.Stakeholder_ID || actor.stakeholder_id || null;
          if (!actorId || String(actorId) !== String(stakeholder.Stakeholder_ID)) {
            return res.status(403).json({ success: false, message: 'Unauthorized: stakeholders may only access their own record' });
          }
          // allowed: stakeholder requesting their own record
        } else {
          // existing coordinator checks
          if (!isCoordinator) {
            return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
          }
          const actorDistrict = actor.district_id || actor.district || (actor.role_data && actor.role_data.district_id) || null;
          if (!actorDistrict || String(actorDistrict) !== String(stakeholder.District_ID)) {
            return res.status(403).json({ success: false, message: 'Unauthorized: coordinator may only access stakeholders in their district' });
          }
        }
      }

      return res.status(200).json({ success: true, data: stakeholder });
    } catch (error) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = req.params.stakeholderId;
      const payload = req.body || {};

      // Authorization checks
      const actor = req.user || {};
      const role = String(actor.role || '').toLowerCase();
      const isAdmin = (role && role.includes('admin')) || !!actor.isAdmin;
      const isCoordinator = role && role.includes('coordinator');

      // Fetch existing stakeholder to validate district ownership
      const existingRes = await stakeholderService.getById(id);
      const existing = existingRes.data;
      if (!existing) return res.status(404).json({ success: false, message: 'Stakeholder not found' });

      if (!isAdmin) {
        if (!isCoordinator) {
          return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
        }
        const actorDistrict = actor.district_id || actor.district || (actor.role_data && actor.role_data.district_id) || null;
        if (!actorDistrict || String(actorDistrict) !== String(existing.District_ID)) {
          return res.status(403).json({ success: false, message: 'Unauthorized: coordinator may only update stakeholders in their district' });
        }

        // Coordinators are not allowed to change District_ID — enforce by removing it from payload
        if ('District_ID' in payload) delete payload.District_ID;
      }

      const result = await stakeholderService.update(id, payload);
      return res.status(200).json({ success: true, data: result.stakeholder });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message, errors: error.errors || null });
    }
  }

  async remove(req, res) {
    try {
      const id = req.params.stakeholderId;
      // Authorization: only admins or coordinators in same district
      const actor = req.user || {};
      const role = String(actor.role || '').toLowerCase();
      const isAdmin = (role && role.includes('admin')) || !!actor.isAdmin;
      const isCoordinator = role && role.includes('coordinator');

      const existingRes = await stakeholderService.getById(id);
      const existing = existingRes.data;
      if (!existing) return res.status(404).json({ success: false, message: 'Stakeholder not found' });

      if (!isAdmin) {
        if (!isCoordinator) {
          return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
        }
        const actorDistrict = actor.district_id || actor.district || (actor.role_data && actor.role_data.district_id) || null;
        if (!actorDistrict || String(actorDistrict) !== String(existing.District_ID)) {
          return res.status(403).json({ success: false, message: 'Unauthorized: coordinator may only delete stakeholders in their district' });
        }
      }

      await stakeholderService.remove(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new StakeholderController();


