# Automated Backend Test Suite

This test suite validates the permission-based event/request system by simulating real users, creating requests, verifying routing logic, checking permissions, and validating state transitions.

## Structure

```
tests/
├── setup/
│   ├── testSetup.js          # Database connection, test environment setup
│   ├── authHelper.js         # JWT token generation, user authentication
│   └── testData.js           # Test user data, sample request payloads
├── helpers/
│   ├── requestHelper.js      # Request creation, action execution helpers
│   ├── assertionHelper.js    # Custom assertions for permissions, routing
│   └── logger.js             # Structured test logging
├── flows/
│   ├── stakeholderToCoordinator.test.js
│   ├── coordinatorToAdmin.test.js
│   ├── adminToCoordinator.test.js
│   └── coordinatorStakeholderBidirectional.test.js
└── integration/
    └── requestLifecycle.test.js  # Full lifecycle tests
```

## Prerequisites

1. **Environment Variables**: Ensure your `.env` file has:
   - `MONGODB_URI` or `MONGO_URI` - MongoDB connection string
   - `JWT_SECRET` - JWT secret for token generation (defaults to 'dev-secret-change-me' if not set)

2. **Test Users**: The tests use these existing accounts:
   - **System Admin**: `admin@example.com` (Authority 100)
   - **Coordinator**: `patrickkurtv@gmail.com` (Authority 60)
   - **Stakeholder**: `jpetalio@gmail.com` (Authority 30)

3. **Dependencies**: Install test dependencies:
   ```bash
   npm install
   ```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- tests/flows/stakeholderToCoordinator.test.js
```

## Test Flows

### 1. Stakeholder → Coordinator Flow
Tests:
- Stakeholder creates request
- Request routes to coordinator (authority ≥ 60) with `request.review` permission
- Coordinator can accept/reject/reschedule
- Organization/coverage area matching
- Complete lifecycle flows (accept→publish, reject→finalized, reschedule loops)

### 2. Coordinator → Admin Flow
Tests:
- Coordinator creates request
- Request routes to admin (authority ≥ 80) with `request.review` permission
- Admin review actions
- Authority validation

### 3. Admin → Coordinator Flow
Tests:
- Admin creates request with coordinator selection
- Request assigned to selected coordinator
- Coordinator execution and lifecycle validation

### 4. Coordinator ↔ Stakeholder Bidirectional Flow
Tests:
- Coordinator-created requests with stakeholder involvement
- Stakeholder-created request escalation
- Multiple reschedule iterations
- Organization/coverage matching

### 5. Request Lifecycle Integration Tests
Tests:
- Complete accept → publish flow
- Complete reject → finalized flow
- Reschedule loops with multiple iterations
- Permission edge cases
- Authority mismatch detection
- Missing organization/coverage match detection

## Test Output

Each test logs structured information:
- **Actor**: User email, authority, permissions
- **Action**: Action performed
- **Routing**: Request assignment details
- **Permissions**: Available permissions
- **Actions**: Available actions
- **Transitions**: State transitions
- **Results**: Final outcomes

Example output:
```
[TEST] Flow: Stakeholder → Coordinator
[ACTOR] Email: jpetalio@gmail.com | Authority: 30 | Permissions: [request.create]
[ACTION] Created request REQ-12345
[ROUTING] Request assigned to: patrickkurtv@gmail.com (Authority: 60)
[PERMISSIONS] Reviewer has: [request.review, request.approve]
[ACTIONS] Available: [view, accept, reject, reschedule]
[TRANSITION] pending-review → review-accepted
[RESULT] Request approved, event published
```

## Success Criteria

The test suite validates:
- ✅ All flows run successfully
- ✅ No frontend required
- ✅ Clear output showing request routing
- ✅ Permission validation working
- ✅ Authority hierarchy enforced
- ✅ State transitions correct
- ✅ Organization/coverage matching works
- ✅ Reschedule loops function properly
- ✅ Missing permissions detected and reported

## Error Detection

Tests detect and report:
- Missing `request.review` permission on coordinator
- Authority hierarchy violations
- Incorrect routing assignments
- Invalid state transitions
- Permission seed errors
- Configuration issues

## Notes

- Tests use the actual database (ensure test data is safe to create)
- JWT tokens are generated using the same secret as production
- Tests bypass UI and call APIs directly via Supertest
- All assertions are based on permissions + authority, not role names
- Comprehensive logging for debugging and validation

## Troubleshooting

### Database Connection Issues
- Ensure `MONGODB_URI` is set in `.env`
- Verify MongoDB is accessible
- Check network connectivity

### Authentication Issues
- Verify test users exist in database
- Check JWT_SECRET is configured
- Ensure user IDs are correct

### Permission Issues
- Verify roles and permissions are seeded
- Check user role assignments
- Ensure coverage area assignments exist

### Test Failures
- Check test logs for detailed error messages
- Verify test users have correct permissions
- Ensure request payloads are valid
- Check state machine transitions are correct

