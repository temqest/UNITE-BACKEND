const { AsyncLocalStorage } = require('async_hooks');

const tenantContextStorage = new AsyncLocalStorage();

/**
 * Run a function within a specific tenant context
 * @param {Object} tenantContext - The tenant context object (e.g., { organizationId, isSystemAdmin })
 * @param {Function} callback - The function to run
 */
function runWithTenantContext(tenantContext, callback) {
  return tenantContextStorage.run(tenantContext, callback);
}

/**
 * Run a function bypassing the tenant context
 * @param {Function} callback - The function to run globally
 */
function runWithoutTenantContext(callback) {
  return tenantContextStorage.run({ bypassTenant: true }, callback);
}

/**
 * Get the current tenant context from AsyncLocalStorage
 * @returns {Object|null} The current tenant context
 */
function getTenantContext() {
  return tenantContextStorage.getStore();
}

module.exports = {
  tenantContextStorage,
  runWithTenantContext,
  runWithoutTenantContext,
  getTenantContext
};
