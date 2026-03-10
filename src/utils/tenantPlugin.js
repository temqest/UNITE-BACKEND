const { getTenantContext } = require('./tenantStorage');

/**
 * Mongoose plugin to automatically apply tenant isolation scopes to queries
 * 
 * Supports collections that include an `organizationId`. 
 * Modifies queries (find, findOne, aggregate, etc.) to automatically include 
 * the organizationId of the current AsyncLocalStorage context.
 */
module.exports = function tenantPlugin(schema) {
  // Only apply to schemas that have an organizationId
  if (!schema.paths.organizationId) {
    return;
  }

  // Helper object to apply the filter
  const applyTenantFilter = function (filter) {
    const context = getTenantContext();
    
    // If we're bypassing tenant checks (e.g., system admin, public route, or explicit script)
    if (!context || context.bypassTenant) {
      return;
    }

    if (!context.organizationId) {
      // If we are strictly in a tenant context but no organizationId exists,
      // we must force the query to return empty rather than leaking global data
      filter.organizationId = null;
      return;
    }

    // Don't overwrite if explicitly provided in query (allows for explicit cross-tenant if somehow authorized)
    // though typically the context should dictate the bound.
    if (!filter.hasOwnProperty('organizationId')) {
      filter.organizationId = context.organizationId;
    }
  };

  // Pre hooks for all query commands
  const queryMethods = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'updateMany',
    'updateOne',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'distinct'
  ];

  queryMethods.forEach(method => {
    schema.pre(method, function(next) {
      applyTenantFilter(this.getQuery());
      next();
    });
  });

  // Pre hook for aggregate
  schema.pre('aggregate', function(next) {
    const context = getTenantContext();
    
    if (!context || context.bypassTenant) {
      return next();
    }

    // Add a $match stage at the beginning of the pipeline
    const matchStage = {
      $match: {
        organizationId: context.organizationId || null
      }
    };
    
    this.pipeline().unshift(matchStage);
    next();
  });

  // Pre hook for Save (to enforce tenant ID on creation if not provided)
  schema.pre('save', function(next) {
    const context = getTenantContext();
    if (!context || context.bypassTenant) {
      return next();
    }

    if (context.organizationId && !this.organizationId) {
      this.organizationId = context.organizationId;
    }
    
    next();
  });
};
