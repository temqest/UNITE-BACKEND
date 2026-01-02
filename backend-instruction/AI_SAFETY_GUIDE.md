# AI Safety Guide for Backend Modifications

## Overview

This guide provides step-by-step instructions for AI to safely modify, update, or extend the UNITE Backend system. Follow these procedures to ensure changes do not break existing logic, workflows, or architectural design.

## Critical System Principles

Before making ANY changes, understand these core principles:

1. **Role-Agnostic Design**: The system uses permission-based authorization, NOT hard-coded roles
2. **State Machine Workflows**: Request workflows use a state machine pattern - changes must respect state transitions
3. **Location Scoping**: Many permissions support location-based scoping - preserve this functionality
4. **Backward Compatibility**: Legacy fields may exist for migration - do NOT remove without verification
5. **Unified User Model**: All user types use the single `User` model - do NOT create role-specific models

## Pre-Change Analysis Phase

### Step 1: Understand the System Structure

**Required Reading (in order):**

1. [BACKEND_API_DOCUMENTATION.md](BACKEND_API_DOCUMENTATION.md) - System overview
2. [src/routes/index.js](src/routes/index.js) - Route structure
3. [src/models/index.js](src/models/index.js) - Model relationships
4. [server.js](server.js) - Application setup and middleware

**Key Architecture Files:**

- **Request Workflow**: [src/services/request_services/requestStateMachine.js](src/services/request_services/requestStateMachine.js)
- **Request Flow Engine**: [src/services/request_services/requestFlowEngine.js](src/services/request_services/requestFlowEngine.js)
- **Reviewer Assignment**: [src/services/request_services/reviewerAssignment.service.js](src/services/request_services/reviewerAssignment.service.js)
- **Permission Service**: [src/services/users_services/permission.service.js](src/services/users_services/permission.service.js)

**Documentation References:**

- [MODELS_REFERENCE.md](MODELS_REFERENCE.md) - Complete model schemas
- [MIDDLEWARE_REFERENCE.md](MIDDLEWARE_REFERENCE.md) - Middleware documentation
- [API_REQUESTS.md](API_REQUESTS.md) - Request workflow details
- [API_RBAC.md](API_RBAC.md) - Permission system
- [STATE_MACHINE_README.md](src/services/request_services/STATE_MACHINE_README.md) - State machine architecture

### Step 2: Map Dependencies

**Before modifying any component, identify:**

1. **Direct Dependencies:**

   - What models does this component use?
   - What services does it call?
   - What middleware does it use?
   - What validators does it use?

2. **Reverse Dependencies:**

   - What routes use this controller?
   - What controllers use this service?
   - What services use this model?
   - What components depend on this middleware?

3. **Cross-Domain Dependencies:**

   - Does this affect request workflows?
   - Does this affect RBAC/permissions?
   - Does this affect location assignments?
   - Does this affect notifications?

**Tools for Dependency Analysis:**

```bash
# Search for imports/usages
grep -r "ComponentName" src/
grep -r "require.*component" src/
```

### Step 3: Identify Affected Components

Create a dependency map:

```
Component to Change: [Component Name]
├── Direct Dependencies
│   ├── Models: [list]
│   ├── Services: [list]
│   ├── Middleware: [list]
│   └── Validators: [list]
├── Reverse Dependencies
│   ├── Routes: [list]
│   ├── Controllers: [list]
│   └── Services: [list]
└── Cross-Domain Impact
    ├── Request Workflow: [yes/no, details]
    ├── RBAC System: [yes/no, details]
    ├── Location System: [yes/no, details]
    └── Notifications: [yes/no, details]
```

## Change Scope and Impact Assessment

### Step 4: Assess Impact on Core Systems

**CRITICAL: Check impact on these systems:**

#### A. Request Workflow System

**Files to Review:**

- [src/services/request_services/requestStateMachine.js](src/services/request_services/requestStateMachine.js)
- [src/services/request_services/requestFlowEngine.js](src/services/request_services/requestFlowEngine.js)
- [src/models/request_models/eventRequest.model.js](src/models/request_models/eventRequest.model.js)

**Questions to Answer:**

- Does this change affect request states or transitions?
- Does this change affect reviewer assignment logic?
- Does this change affect action permissions?
- Does this change affect the state machine rules?

**Rules:**

- NEVER modify state machine constants (`REQUEST_STATES`, `ACTIONS`) without updating all transition rules
- NEVER remove state transitions without checking for dependent logic
- ALWAYS maintain backward compatibility with legacy states
- ALWAYS test state transitions after changes

#### B. RBAC and Permission System

**Files to Review:**

- [src/services/users_services/permission.service.js](src/services/users_services/permission.service.js)
- [src/middleware/requirePermission.js](src/middleware/requirePermission.js)
- [src/models/users_models/permission.model.js](src/models/users_models/permission.model.js)
- [src/models/users_models/role.model.js](src/models/users_models/role.model.js)

**Questions to Answer:**

- Does this change affect permission checking?
- Does this change affect role assignments?
- Does this change affect location scoping?
- Does this change affect staff type restrictions?

**Rules:**

- NEVER hard-code role checks - use `permissionService.checkPermission()`
- NEVER bypass permission middleware
- ALWAYS preserve location scoping in permission checks
- ALWAYS maintain permission aggregation logic

#### C. Location System

**Files to Review:**

- [src/models/utility_models/location.model.js](src/models/utility_models/location.model.js)
- [src/models/users_models/userLocation.model.js](src/models/users_models/userLocation.model.js)
- [src/services/utility_services/location.service.js](src/services/utility_services/location.service.js)

**Questions to Answer:**

- Does this change affect location hierarchy?
- Does this change affect user location assignments?
- Does this change affect location scoping in permissions?

**Rules:**

- NEVER break location hierarchy (parent-child relationships)
- NEVER remove location scope support from permissions
- ALWAYS preserve location assignment scopes (exact, descendants, ancestors, all)
- ALWAYS maintain denormalized province references

#### D. User Model and RBAC

**Files to Review:**

- [src/models/users_models/user.model.js](src/models/users_models/user.model.js)
- [src/models/users_models/userRole.model.js](src/models/users_models/userRole.model.js)
- [src/controller/users_controller/user.controller.js](src/controller/users_controller/user.controller.js)

**Questions to Answer:**

- Does this change affect user creation/updates?
- Does this change affect role assignments?
- Does this change affect staff type restrictions?

**Rules:**

- NEVER create role-specific user models (use unified `User` model)
- NEVER bypass `requireStaffManagement` middleware for user operations
- ALWAYS validate staff types against `allowedStaffTypes` metadata
- ALWAYS preserve legacy `userId` field for backward compatibility

### Step 5: Identify Side Effects

**Check for side effects on:**

1. **Notifications:**

   - Will this change trigger notifications?
   - Are notification recipients correct?
   - Are notification types appropriate?
   - Are Socket.IO events emitted correctly?

2. **Audit Trails:**

   - Will this change be logged in audit trails?
   - Is actor information captured correctly?
   - Is location context preserved?
   - Are role snapshots maintained?

3. **Socket.IO Events:**

   - Will this change emit Socket.IO events?
   - Are event names consistent?
   - Are event payloads correct?
   - Are recipients properly identified?

4. **Data Consistency:**

   - Will this change create orphaned records?
   - Will this change break referential integrity?
   - Will this change affect cascading operations?
   - Will this affect denormalized data?

## Data Integrity & Validation

### Step 6: Preserve Schema Integrity

**Model Changes:**

**DO:**

- Add new optional fields
- Add new indexes
- Add new virtual fields
- Add new methods
- Extend existing enums (add new values)

**DON'T:**

- Remove required fields without migration
- Change field types without migration
- Remove indexes that are actively used
- Break model relationships
- Remove legacy fields without verification

**Schema Validation Checklist:**

- [ ] All required fields remain required
- [ ] Field types are unchanged (unless intentional)
- [ ] Indexes are preserved or updated
- [ ] Model relationships are intact
- [ ] Validation rules are preserved
- [ ] Virtual fields still work
- [ ] Methods still function correctly

**Example Safe Model Change:**

```javascript
// SAFE: Adding optional field
const userSchema = new mongoose.Schema({
  // ... existing fields ...
  newOptionalField: {
    type: String,
    required: false,
    trim: true
  }
});
```

**Example Unsafe Model Change:**

```javascript
// UNSAFE: Removing required field
const userSchema = new mongoose.Schema({
  // email: { type: String, required: true }, // REMOVED - BREAKS EXISTING DATA
  // ... other fields ...
});
```

### Step 7: Preserve Validation Rules

**Validator Changes:**

**Files to Review:**

- [src/validators/users_validators/user.validators.js](src/validators/users_validators/user.validators.js)
- [src/validators/request_validators/eventRequest.validators.js](src/validators/request_validators/eventRequest.validators.js)
- [src/validators/rbac_validators/permission.validators.js](src/validators/rbac_validators/permission.validators.js)

**Rules:**

- NEVER remove validation for required fields
- NEVER relax validation rules without explicit approval
- ALWAYS maintain Joi schema structure
- ALWAYS preserve error message formats
- ALWAYS validate enum values

**Validation Checklist:**

- [ ] Required field validations are preserved
- [ ] String length constraints are maintained
- [ ] Enum validations are intact
- [ ] Date validations are correct
- [ ] Email/phone format validations are preserved
- [ ] Custom validators still function

## Workflow & Business Logic Preservation

### Step 8: Maintain Request Workflow

**CRITICAL: Request workflow uses state machine pattern**

**Files:**

- [src/services/request_services/requestStateMachine.js](src/services/request_services/requestStateMachine.js)
- [src/services/request_services/requestFlowEngine.js](src/services/request_services/requestFlowEngine.js)
- [src/services/request_services/requestAction.service.js](src/services/request_services/requestAction.service.js)

**State Machine Rules:**

- NEVER modify `REQUEST_STATES` constants without updating all transition rules
- NEVER remove state transitions without checking dependent logic
- ALWAYS use `stateMachine.getAllowedActions()` to check permissions
- ALWAYS use `stateMachine.canTransition()` before executing actions
- ALWAYS use `stateMachine.executeTransition()` for state changes
- ALWAYS preserve backward compatibility with legacy states

**Adding a New State:**

1. Add state to `REQUEST_STATES` in `requestStateMachine.js`
2. Define state configuration in `STATE_TRANSITIONS`
3. Add state to model enum in `eventRequest.model.js`
4. Update state normalization logic
5. Update all transition rules that reference this state
6. Test all state transitions

**Adding a New Action:**

1. Add action to `ACTIONS` in `requestStateMachine.js`
2. Define transitions in relevant state configurations
3. Update action processing logic in `requestFlowEngine.js`
4. Update permission mapping in `requestAction.service.js`
5. Test action in all applicable states

**Example Safe Workflow Change:**

```javascript
// SAFE: Adding new state transition
STATE_TRANSITIONS[REQUEST_STATES.PENDING_REVIEW] = {
  transitions: {
    [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED,
    [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED,
    [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED,
    [ACTIONS.NEW_ACTION]: REQUEST_STATES.NEW_STATE // NEW - properly integrated
  }
};
```

### Step 9: Maintain Permission-Based Authorization

**CRITICAL: System uses permission-based authorization, NOT role-based**

**Files:**

- [src/middleware/requirePermission.js](src/middleware/requirePermission.js)
- [src/services/users_services/permission.service.js](src/services/users_services/permission.service.js)

**Authorization Rules:**

- NEVER hard-code role checks (e.g., `if (user.role === 'coordinator')`)
- ALWAYS use `permissionService.checkPermission()`
- ALWAYS use `requirePermission` middleware in routes
- ALWAYS preserve location scoping in permission checks
- ALWAYS maintain permission aggregation logic

**Example Unsafe Code:**

```javascript
// UNSAFE: Hard-coded role check
if (user.role === 'coordinator') {
  // Allow action
}
```

**Example Safe Code:**

```javascript
// SAFE: Permission-based check
const hasPermission = await permissionService.checkPermission(
  userId,
  'request',
  'create',
  { locationId }
);
if (hasPermission) {
  // Allow action
}
```

### Step 10: Preserve Reviewer Assignment Logic

**Files:**

- [src/services/request_services/reviewerAssignment.service.js](src/services/request_services/reviewerAssignment.service.js)
- [src/config/reviewerAssignmentRules.js](src/config/reviewerAssignmentRules.js) (if exists)

**Reviewer Assignment Rules:**

- NEVER hard-code reviewer assignment by role
- ALWAYS use `reviewerAssignmentService.assignReviewer()`
- ALWAYS use permission-based reviewer finding
- ALWAYS preserve location scope in reviewer assignment
- ALWAYS maintain fallback reviewer logic

**Example Safe Reviewer Assignment:**

```javascript
// SAFE: Using reviewer assignment service
const reviewer = await reviewerAssignmentService.assignReviewer(
  requesterId,
  { locationId, requestType: 'eventRequest' }
);
```

## Testing & Verification

### Step 11: Pre-Change Verification

**Before making changes, verify:**

1. **Current Functionality:**

   - Test affected endpoints
   - Verify permission checks work
   - Confirm workflows function correctly
   - Check data integrity

2. **Dependencies:**

   - Verify all imports resolve
   - Check model relationships
   - Confirm service dependencies
   - Validate middleware chain

3. **Edge Cases:**

   - Test with missing data
   - Test with invalid inputs
   - Test permission denials
   - Test location scoping

### Step 12: Change Implementation

**During implementation:**

1. **Make Incremental Changes:**

   - Change one component at a time
   - Test after each change
   - Commit working changes
   - Document each step

2. **Preserve Existing Patterns:**

   - Follow existing code style
   - Use existing error handling patterns
   - Maintain existing response formats
   - Keep existing logging patterns

3. **Add Defensive Checks:**

   - Validate inputs
   - Check for null/undefined
   - Handle edge cases
   - Add error handling

### Step 13: Post-Change Verification

**After making changes, verify:**

1. **Functionality Tests:**

   - [ ] All affected endpoints work
   - [ ] Permission checks function correctly
   - [ ] State transitions work as expected
   - [ ] Data validation works
   - [ ] Error handling works

2. **Integration Tests:**

   - [ ] Related services still work
   - [ ] Middleware chain is intact
   - [ ] Model relationships are preserved
   - [ ] Notifications are sent correctly
   - [ ] Socket.IO events are emitted

3. **Regression Tests:**

   - [ ] Unchanged endpoints still work
   - [ ] Existing workflows are intact
   - [ ] RBAC system functions correctly
   - [ ] Location system works
   - [ ] User management works

**Test Checklist:**

```markdown
## Testing Checklist

### Authentication & Authorization
- [ ] Login works
- [ ] Permission checks work
- [ ] Location scoping works
- [ ] Staff type restrictions work

### Request Workflow
- [ ] Request creation works
- [ ] State transitions work
- [ ] Reviewer assignment works
- [ ] Action execution works
- [ ] Audit trail is updated

### User Management
- [ ] User creation works
- [ ] Role assignment works
- [ ] Location assignment works
- [ ] Staff type validation works

### Events
- [ ] Event creation works
- [ ] Calendar views work
- [ ] Event statistics work
- [ ] Category data is preserved

### Locations
- [ ] Location hierarchy works
- [ ] User location assignments work
- [ ] Location scoping works
- [ ] Ancestors/descendants work

### Notifications & Real-Time
- [ ] Notifications are created correctly
- [ ] Socket.IO events are emitted
- [ ] Notification recipients are correct
- [ ] Real-time updates work
```

## Documentation Requirements

### Step 14: Document Changes

**For every change, document:**

1. **Change Summary:**

   - What was changed
   - Why it was changed
   - When it was changed

2. **Affected Components:**

   - Files modified
   - Files created
   - Files deleted
   - Dependencies affected

3. **API Changes:**

   - Endpoints modified
   - Request/response changes
   - New endpoints added
   - Deprecated endpoints

4. **Schema Changes:**

   - Model fields added/removed
   - Validation rules changed
   - Indexes added/removed
   - Relationships changed

5. **Behavior Changes:**

   - New behaviors
   - Changed behaviors
   - Deprecated behaviors
   - Breaking changes

**Documentation Template:**

```markdown
## Change Log: [Date] - [Change Description]

### Summary
[Brief description of change]

### Files Modified
- [file path] - [what changed]
- [file path] - [what changed]

### API Changes
- [Endpoint] - [change description]

### Schema Changes
- [Model] - [field changes]

### Breaking Changes
- [List any breaking changes]

### Migration Notes
- [Any migration steps required]

### Testing
- [Test results]
```

### Step 15: Update API Documentation

**If API changes are made, update:**

1. **Domain Documentation:**

   - [API_AUTH.md](API_AUTH.md)
   - [API_USERS.md](API_USERS.md)
   - [API_EVENTS.md](API_EVENTS.md)
   - [API_REQUESTS.md](API_REQUESTS.md)
   - [API_RBAC.md](API_RBAC.md)
   - [API_LOCATIONS.md](API_LOCATIONS.md)
   - [API_CHAT.md](API_CHAT.md)
   - [API_INVENTORY.md](API_INVENTORY.md)
   - [API_UTILITY.md](API_UTILITY.md)
   - [API_PAGES_FEATURES.md](API_PAGES_FEATURES.md)

2. **Reference Documentation:**

   - [MODELS_REFERENCE.md](MODELS_REFERENCE.md) - If models changed
   - [MIDDLEWARE_REFERENCE.md](MIDDLEWARE_REFERENCE.md) - If middleware changed
   - [ERROR_CODES.md](ERROR_CODES.md) - If error codes changed

3. **Main Index:**

   - [BACKEND_API_DOCUMENTATION.md](BACKEND_API_DOCUMENTATION.md) - Update overview if needed

## Rollback Plan

### Step 16: Create Backup Before Changes

**Before making changes:**

1. **Code Backup:**

   - Commit current state to git
   - Create a backup branch: `git checkout -b backup-before-[change-description]`
   - Tag the commit: `git tag backup-[timestamp]`

2. **Database Backup:**

   - Export critical collections
   - Document current data state
   - Note any pending migrations

3. **Configuration Backup:**

   - Backup `.env` file
   - Backup configuration files
   - Document environment variables

### Step 17: Implement Rollback Strategy

**Rollback Procedures:**

1. **Code Rollback:**
   ```bash
   # Revert to backup commit
   git checkout backup-[timestamp]
   # Or revert specific files
   git checkout backup-[timestamp] -- [file path]
   ```

2. **Database Rollback:**

   - Restore from backup if schema changed
   - Run reverse migrations if created
   - Verify data integrity

3. **Verification After Rollback:**

   - Test all endpoints
   - Verify workflows
   - Check data integrity
   - Confirm no side effects

## Specific Component Modification Guidelines

### Modifying Controllers

**File Pattern:** `src/controller/[domain]_controller/[name].controller.js`

**Rules:**

- Keep controllers thin - delegate to services
- Always use `authenticate` middleware first
- Always use permission middleware (`requirePermission`, `requireFeature`, etc.)
- Always validate input using validators
- Always handle errors consistently
- Always return standardized response format

**Controller Structure:**

```javascript
class Controller {
  async methodName(req, res) {
    try {
      // 1. Extract and validate input (already done by validator middleware)
      const data = req.validatedData || req.body;
      
      // 2. Call service method
      const result = await service.method(data);
      
      // 3. Return standardized response
      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      // 4. Handle errors consistently
      return res.status(400).json({
        success: false,
        message: error.message || 'Operation failed'
      });
    }
  }
}
```

**Checklist:**

- [ ] Uses `authenticate` middleware
- [ ] Uses appropriate permission middleware
- [ ] Uses validator middleware
- [ ] Delegates to service layer
- [ ] Returns standardized responses
- [ ] Handles errors consistently
- [ ] Does NOT contain business logic

### Modifying Services

**File Pattern:** `src/services/[domain]_services/[name].service.js`

**Rules:**

- Services contain ALL business logic
- Services handle data validation
- Services interact with models
- Services handle errors and throw descriptive messages
- Services do NOT handle HTTP requests/responses

**Service Structure:**

```javascript
class Service {
  async methodName(data) {
    try {
      // 1. Validate business rules
      await this._validateBusinessRules(data);
      
      // 2. Check permissions (if needed)
      const hasPermission = await permissionService.checkPermission(...);
      if (!hasPermission) {
        throw new Error('Permission denied');
      }
      
      // 3. Perform business logic
      const result = await this._performOperation(data);
      
      // 4. Update related entities
      await this._updateRelatedEntities(result);
      
      // 5. Send notifications (if needed)
      await this._sendNotifications(result);
      
      // 6. Return result
      return result;
    } catch (error) {
      throw new Error(`Operation failed: ${error.message}`);
    }
  }
}
```

**Checklist:**

- [ ] Contains business logic
- [ ] Validates business rules
- [ ] Handles model interactions
- [ ] Throws descriptive errors
- [ ] Does NOT handle HTTP
- [ ] Does NOT use `req`/`res` objects

### Modifying Routes

**File Pattern:** `src/routes/[name].routes.js`

**Rules:**

- Routes define endpoints and middleware chain
- Routes mount controllers
- Routes apply validators
- Routes apply authentication/authorization
- Routes do NOT contain business logic

**Route Structure:**

```javascript
router.post('/endpoint',
  authenticate,                    // 1. Authenticate
  requirePermission('resource', 'action'),  // 2. Check permission
  validateCreateSchema,            // 3. Validate input
  rateLimiter.general,            // 4. Rate limit
  controller.methodName           // 5. Handle request
);
```

**Checklist:**

- [ ] Uses `authenticate` middleware
- [ ] Uses appropriate permission middleware
- [ ] Uses validator middleware
- [ ] Mounts controller methods
- [ ] Does NOT contain business logic
- [ ] Follows RESTful conventions

### Modifying Models

**File Pattern:** `src/models/[domain]_models/[name].model.js`

**Rules:**

- Models define data structure
- Models define validation rules
- Models define relationships
- Models define indexes
- Models define methods/virtuals
- Models do NOT contain business logic

**Model Modification Checklist:**

- [ ] Required fields remain required
- [ ] Field types are unchanged (unless intentional)
- [ ] Indexes are preserved
- [ ] Relationships are intact
- [ ] Validation rules are preserved
- [ ] Methods still work
- [ ] Virtual fields still work
- [ ] Backward compatibility maintained

**Safe Model Changes:**

- Adding optional fields
- Adding new indexes
- Adding virtual fields
- Adding instance/static methods
- Extending enums (adding values)

**Unsafe Model Changes:**

- Removing required fields
- Changing field types
- Removing indexes
- Breaking relationships
- Removing validation rules

### Modifying Middleware

**File Pattern:** `src/middleware/[name].js`

**Rules:**

- Middleware handles cross-cutting concerns
- Middleware modifies `req` object
- Middleware calls `next()` on success
- Middleware returns error response on failure
- Middleware does NOT contain business logic

**Middleware Structure:**

```javascript
function middleware(req, res, next) {
  try {
    // 1. Extract data from request
    const data = req.body || req.params || req.query;
    
    // 2. Perform middleware logic
    const result = performLogic(data);
    
    // 3. Attach to request object
    req.middlewareData = result;
    
    // 4. Continue to next middleware
    next();
  } catch (error) {
    // 5. Return error response
    return res.status(403).json({
      success: false,
      message: error.message
    });
  }
}
```

**Checklist:**

- [ ] Modifies `req` object (if needed)
- [ ] Calls `next()` on success
- [ ] Returns error response on failure
- [ ] Does NOT contain business logic
- [ ] Handles errors gracefully

### Modifying Validators

**File Pattern:** `src/validators/[domain]_validators/[name].validators.js`

**Rules:**

- Validators use Joi schemas
- Validators validate input structure
- Validators sanitize input
- Validators attach validated data to `req.validatedData`
- Validators return error response on failure

**Validator Structure:**

```javascript
const schema = Joi.object({
  field: Joi.string().required().trim()
});

const validate = (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false
  });
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details.map(d => d.message)
    });
  }
  
  req.validatedData = value;
  next();
};
```

**Checklist:**

- [ ] Uses Joi for validation
- [ ] Validates all required fields
- [ ] Sanitizes input (trim, lowercase, etc.)
- [ ] Attaches to `req.validatedData`
- [ ] Returns standardized error format
- [ ] Does NOT contain business logic

## Critical Business Rules to Preserve

### Request Workflow Rules

1. **State Machine Integrity:**

   - States: `pending-review`, `review-accepted`, `review-rejected`, `review-rescheduled`, `approved`, `rejected`, `cancelled`, `closed`
   - Actions: `view`, `accept`, `reject`, `reschedule`, `confirm`, `decline`, `edit`, `manage-staff`, `cancel`, `delete`
   - Transitions must be validated by state machine
   - Never bypass state machine validation

2. **Reviewer Assignment:**

   - Uses permission-based assignment
   - Supports location scoping
   - Has fallback to system admin
   - Preserves role snapshots

3. **Double Confirmation:**

   - Reviewer decision → Requester confirmation
   - Both steps must complete
   - Cannot skip confirmation step

### Permission System Rules

1. **Permission Types:**

   - `resource` - Standard CRUD permissions
   - `page` - Page access permissions
   - `feature` - Feature access permissions
   - `staff` - Staff management with type restrictions

2. **Permission Aggregation:**

   - Permissions aggregated from all user roles
   - Metadata merged correctly (especially `allowedStaffTypes`)
   - Wildcard permissions (`*`) grant full access
   - Location scoping applied correctly

3. **Staff Type Restrictions:**

   - `allowedStaffTypes` in metadata controls which types can be managed
   - `['*']` means all types allowed
   - Empty array means no types allowed
   - Specific array means only those types allowed

### Location System Rules

1. **Hierarchy Integrity:**

   - Locations form a tree structure (parent-child relationships)
   - Province → District → Municipality hierarchy must be preserved
   - Denormalized province references must be maintained
   - Location ancestors/descendants queries must work correctly

2. **Location Scoping:**

   - Permissions can be scoped to specific locations
   - User location assignments support multiple scopes: `exact`, `descendants`, `ancestors`, `all`
   - Location scoping affects permission checks
   - Location context must be preserved in audit trails

3. **User Location Assignments:**

   - Users can have multiple location assignments
   - Each assignment has a scope type
   - Location assignments affect permission checks
   - Location assignments must be validated against hierarchy

### Notification System Rules

1. **Notification Types:**

   - Notification types are defined in the Notification model enum
   - Each notification type has specific recipients
   - Notification types must match business events
   - Socket.IO events must be emitted for real-time updates

2. **Recipient Identification:**

   - Recipients identified by `Recipient_ID` and `RecipientType`
   - Recipient type must match user's role
   - Notifications must be sent to correct users based on request context
   - Counterpart admins must be notified when configured

3. **Real-Time Updates:**

   - Socket.IO events must be emitted for relevant actions
   - Event names must be consistent
   - Event payloads must include necessary data
   - Online/offline presence must be tracked correctly

### System Settings Rules

1. **Configurable Settings:**

   - System settings are stored in `SystemSettings` model
   - Settings have defaults defined in `systemSettings.service.js`
   - Settings affect validation rules (max events, blood bags, etc.)
   - Settings must be validated before updates

2. **Validation Rules:**

   - Maximum events per day (default: 3)
   - Maximum blood bags per day (default: 200)
   - Weekend restriction (default: false)
   - Advance booking days (default: 30)
   - Maximum pending requests (default: 1)
   - Review expiration hours (default: 72)
   - Confirmation window hours (default: 48)

3. **Settings Usage:**

   - Settings must be checked before allowing operations
   - Settings can be overridden by admins in specific cases
   - Settings changes must not break existing requests
   - Settings must be cached for performance

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Hard-Coding Role Checks

**Problem:**
```javascript
// WRONG: Hard-coded role check
if (user.role === 'coordinator') {
  // Allow action
}
```

**Solution:**
```javascript
// CORRECT: Permission-based check
const hasPermission = await permissionService.checkPermission(
  userId,
  'request',
  'create',
  { locationId }
);
```

### Pitfall 2: Bypassing State Machine

**Problem:**
```javascript
// WRONG: Direct status update
request.Status = 'approved';
await request.save();
```

**Solution:**
```javascript
// CORRECT: Use state machine
const stateMachine = new RequestStateMachine();
await stateMachine.executeTransition(request, 'accept', { userId });
```

### Pitfall 3: Removing Legacy Fields

**Problem:**
```javascript
// WRONG: Removing legacy field without migration
const userSchema = new mongoose.Schema({
  // made_by_id removed - breaks existing data
});
```

**Solution:**
```javascript
// CORRECT: Keep legacy field, add new field
const userSchema = new mongoose.Schema({
  made_by_id: { type: String }, // Legacy - keep for backward compatibility
  requester: { type: Object }   // New - use going forward
});
```

### Pitfall 4: Breaking Location Hierarchy

**Problem:**
```javascript
// WRONG: Not validating location hierarchy
const location = await Location.create({ name: 'District', parent: null });
```

**Solution:**
```javascript
// CORRECT: Validate hierarchy
const location = await locationService.createLocation({
  name: 'District',
  type: 'district',
  parent: provinceId // Must be province
});
```

### Pitfall 5: Not Preserving Role Snapshots

**Problem:**
```javascript
// WRONG: Not storing role snapshot
request.requester = { userId: requesterId };
```

**Solution:**
```javascript
// CORRECT: Store role snapshot
const roles = await permissionService.getUserRoles(requesterId);
request.requester = {
  userId: requesterId,
  roleSnapshot: roles[0]?.code || null
};
```

## Quick Reference Checklist

Before making ANY change, verify:

- [ ] I have read the relevant documentation
- [ ] I understand the system architecture
- [ ] I have mapped all dependencies
- [ ] I have assessed impact on core systems
- [ ] I have identified all side effects
- [ ] I have created a backup
- [ ] I have a rollback plan
- [ ] I will test after changes
- [ ] I will document the changes

## Summary

This guide provides comprehensive instructions for safely modifying the UNITE Backend system. Always:

1. **Analyze** before making changes
2. **Assess** impact on core systems
3. **Preserve** existing patterns and rules
4. **Test** thoroughly after changes
5. **Document** all modifications
6. **Maintain** backward compatibility

When in doubt, refer to the existing codebase patterns, documentation, and this guide. If a change seems risky, break it into smaller, incremental changes and test each step.

---

**Last Updated:** 2024
**Version:** 1.0
