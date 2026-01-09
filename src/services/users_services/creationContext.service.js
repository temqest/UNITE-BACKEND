const { AUTHORITY_TIERS } = require('./authority.service');

/**
 * Creation Context Service
 * 
 * Defines explicit creation contexts for different user creation scenarios.
 * Each context specifies allowed roles, required permissions, location rules, and organization rules.
 */
class CreationContextService {
  /**
   * Creation context constants
   */
  static CONTEXTS = {
    STAFF_CREATION: 'staff-management',
    STAKEHOLDER_CREATION: 'stakeholder-management'
  };

  /**
   * Get context configuration
   * @param {string} context - Context name (STAFF_CREATION or STAKEHOLDER_CREATION)
   * @returns {Object} Context configuration
   */
  getContextConfig(context) {
    const configs = {
      [this.constructor.CONTEXTS.STAFF_CREATION]: {
        name: 'Staff Creation',
        allowedRoles: ['coordinator', 'operational-admin'], // Can create coordinators and operational admins
        requiredPermission: 'staff.create',
        locationRules: {
          useCoverageAreas: true, // Staff use coverage areas
          useLocations: false
        },
        organizationRules: {
          canChoose: true, // Can select from allowed organizations
          required: true // Organization is required
        }
      },
      [this.constructor.CONTEXTS.STAKEHOLDER_CREATION]: {
        name: 'Stakeholder Creation',
        allowedRoles: ['stakeholder'], // Only stakeholder role
        requiredPermission: 'staff.create',
        locationRules: {
          useCoverageAreas: false, // Stakeholders don't use coverage areas
          useLocations: true, // Stakeholders use Location model (municipality/barangay)
          requiredLevel: 'municipality', // Municipality is required
          optionalLevel: 'barangay' // Barangay is optional
        },
        organizationRules: {
          canChoose: true, // Can select from allowed organizations
          required: true // Organization is required
        }
      }
    };

    return configs[context] || null;
  }

  /**
   * Check if a role is allowed in a context
   * @param {string} context - Context name
   * @param {string} roleCode - Role code to check
   * @returns {boolean} True if role is allowed
   */
  isRoleAllowedInContext(context, roleCode) {
    const config = this.getContextConfig(context);
    if (!config) return false;
    return config.allowedRoles.includes(roleCode);
  }

  /**
   * Get allowed roles for a context
   * @param {string} context - Context name
   * @returns {Array<string>} Array of allowed role codes
   */
  getAllowedRolesForContext(context) {
    const config = this.getContextConfig(context);
    return config ? config.allowedRoles : [];
  }
}

module.exports = new CreationContextService();

