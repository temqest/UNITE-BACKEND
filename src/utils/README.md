# Backend Scripts Documentation

This directory contains organized scripts for setting up, seeding, and maintaining the UNITE backend system.

## Directory Structure

```
src/utils/
├── seed/              # Seed scripts for initial data population
├── migrations/         # Migration scripts for updating existing data
├── diagnostics/       # Diagnostic and troubleshooting scripts
├── dbConnection.js     # Shared database connection utility
├── createAdmin.js     # Create admin account
├── createIndexes.js   # Create database indexes
├── setupSystem.js     # Main system setup script
├── admin.json         # Admin account configuration
└── locations.json     # Location data for seeding
```

## Environment Variables

All scripts use the following environment variables (set in `.env`):

- `MONGO_DB_NAME` (required): The MongoDB database name (e.g., `unite-test-v2`)
- `MONGODB_URI` or `MONGO_URL` or `MONGO_URI`: MongoDB connection string

**Important**: All scripts automatically use `MONGO_DB_NAME` to ensure they connect to the correct database.

## Setup Scripts

### Complete System Setup

To set up the entire system from scratch:

```bash
node src/utils/setupSystem.js [--dry-run]
```

This script runs in the following order:
1. Seeds roles and permissions
2. Seeds locations (provinces, districts, municipalities, barangays)
3. Seeds organizations
4. Seeds coverage system (coverage areas)
5. Creates admin account (requires `admin.json`)
6. Creates database indexes

**Prerequisites:**
- `src/utils/admin.json` must exist (see `createAdmin.js` section)
- `src/utils/locations.json` is optional (uses fallback defaults if not found)

### Individual Seed Scripts

You can run seed scripts individually if needed:

```bash
# Seed roles and permissions
node src/utils/seed/seedRoles.js [--dry-run]

# Seed locations
node src/utils/seed/seedLocations.js [--dry-run]

# Seed organizations
node src/utils/seed/seedOrganizations.js [--dry-run]

# Seed coverage system
node src/utils/seed/seedCoverageSystem.js [--dry-run]
```

**Note**: All seed scripts are idempotent - they can be run multiple times without creating duplicates.

## Admin Account Creation

### Create Admin Account

```bash
node src/utils/createAdmin.js [--dry-run]
```

**Prerequisites:**
- `src/utils/admin.json` must exist with the following structure:

```json
{
  "user": {
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@example.com",
    "password": "secure-password",
    "phoneNumber": "+1234567890"
  },
  "admin": {
    "isSystemAdmin": true,
    "accessLevel": "super"
  },
  "roles": ["system-admin"],
  "locations": []
}
```

The script will:
- Create a user account with the specified details
- Assign the system-admin role
- Optionally assign locations if specified

## Migration Scripts

### Migrate Users to New Model

If you have existing users that need to be migrated to the new user model:

```bash
node src/utils/migrations/migrateUsersToNewModel.js [--dry-run] [--step=1,2,3,4,5]
```

**Steps:**
1. Migrate missing roles (assigns default roles to users)
2. Migrate user authority levels (updates authority based on roles)
3. Migrate user organizations (links users to organizations)
4. Migrate user coverage areas (assigns coverage areas to coordinators)
5. Migrate staff permissions (verifies permissions are correctly assigned)

You can run specific steps using `--step=1,3` to run only steps 1 and 3.

**Prerequisites:**
- Roles must be seeded: `node src/utils/seed/seedRoles.js`
- Organizations must be seeded: `node src/utils/seed/seedOrganizations.js`
- Locations must be seeded: `node src/utils/seed/seedLocations.js`

## Diagnostic Scripts

Diagnostic scripts are located in `src/utils/diagnostics/`:

- `diagnoseUser.js` - Diagnose user issues
- `diagnose-coordinator.js` - Diagnose coordinator-specific issues
- `diagnosePermissions.js` - Diagnose permission issues
- `diagnostic-checks.js` - General diagnostic checks
- `detectBrokenUsers.js` - Detect broken user records
- `validateRBAC.js` - Validate RBAC setup
- `verifyStaffCreation.js` - Verify staff creation

## Database Indexes

Create database indexes:

```bash
node src/utils/createIndexes.js
```

This script creates indexes for:
- Events
- Event Requests
- Messages
- Conversations
- Presence

## Script Execution Order

For a fresh installation:

1. **Initial Setup** (run once):
   ```bash
   node src/utils/setupSystem.js
   ```

2. **If you have existing users to migrate**:
   ```bash
   node src/utils/migrations/migrateUsersToNewModel.js
   ```

3. **Verify setup**:
   ```bash
   node src/utils/diagnostics/validateRBAC.js
   ```

## Dry-Run Mode

Most scripts support `--dry-run` mode, which shows what changes would be made without actually writing to the database:

```bash
node src/utils/setupSystem.js --dry-run
```

## Idempotency

All seed scripts are idempotent, meaning:
- They can be run multiple times safely
- They check for existing data before creating new records
- They update existing records if needed
- They won't create duplicates

## Troubleshooting

### Database Connection Issues

Ensure your `.env` file has:
```
MONGO_DB_NAME=unite-test-v2
MONGODB_URI=mongodb://localhost:27017
```

### Missing Admin Account

If admin account creation fails:
1. Check that `src/utils/admin.json` exists
2. Verify the JSON structure is valid
3. Ensure the email is unique (not already in use)

### Missing Roles

If roles are missing:
```bash
node src/utils/seed/seedRoles.js
```

### Missing Organizations

If organizations are missing:
```bash
node src/utils/seed/seedOrganizations.js
```

### User Migration Issues

If users aren't being migrated correctly:
1. Run diagnostics: `node src/utils/diagnostics/diagnoseUser.js <email>`
2. Check that prerequisites are met (roles, organizations, locations seeded)
3. Run migration with specific steps: `node src/utils/migrations/migrateUsersToNewModel.js --step=1`

## Notes

- All scripts use the shared `dbConnection.js` utility to ensure consistent database connections
- Scripts automatically use `MONGO_DB_NAME` from environment variables
- The `--dry-run` flag is available on most scripts for safe testing
- Scripts are designed to be run from the project root directory

