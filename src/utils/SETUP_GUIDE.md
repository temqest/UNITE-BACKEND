# UNITE Backend Setup Guide

This guide provides step-by-step instructions for setting up the UNITE backend system from scratch.

## Prerequisites

1. **Node.js** installed (v14 or higher)
2. **MongoDB** running and accessible
3. **Environment Variables** configured in `.env` file

## Environment Configuration

Create a `.env` file in the project root with:

```env
MONGO_DB_NAME=unite-test-v2
MONGODB_URI=mongodb://localhost:27017
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net
```

**Important**: Always set `MONGO_DB_NAME` to ensure scripts connect to the correct database.

## Step-by-Step Setup

### Step 1: Initial System Setup

Run the complete system setup script:

```bash
node src/utils/setupSystem.js
```

This script will:
1. ✅ Seed roles and permissions (system-admin, coordinator, stakeholder)
2. ✅ Seed locations (provinces, districts, municipalities, barangays)
3. ✅ Seed organizations (LGU, NGO, Hospital, etc.)
4. ✅ Seed coverage system (coverage areas)
5. ✅ Create admin account (requires `admin.json`)
6. ✅ Create database indexes

**Before running**, ensure `src/utils/admin.json` exists with your admin account details:

```json
{
  "user": {
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@example.com",
    "password": "your-secure-password",
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

### Step 2: Verify Setup

After setup completes, verify everything is working:

```bash
# Validate RBAC setup
node src/utils/diagnostics/validateRBAC.js

# Check admin account
node src/utils/diagnostics/diagnoseUser.js admin@example.com
```

### Step 3: Migrate Existing Users (If Applicable)

If you have existing users in the database that need to be migrated to the new model:

```bash
node src/utils/migrations/migrateUsersToNewModel.js
```

This will:
- Assign missing roles to users
- Update user authority levels
- Link users to organizations
- Assign coverage areas to coordinators
- Verify staff permissions

## Individual Script Execution

If you need to run scripts individually:

### Seed Scripts

```bash
# Seed roles and permissions
node src/utils/seed/seedRoles.js

# Seed locations
node src/utils/seed/seedLocations.js

# Seed organizations
node src/utils/seed/seedOrganizations.js

# Seed coverage system
node src/utils/seed/seedCoverageSystem.js
```

### Admin Account

```bash
# Create admin account
node src/utils/createAdmin.js
```

### Database Indexes

```bash
# Create indexes
node src/utils/createIndexes.js
```

## Dry-Run Mode

Test scripts without making changes:

```bash
node src/utils/setupSystem.js --dry-run
```

## Troubleshooting

### Database Connection Issues

**Problem**: Scripts can't connect to MongoDB

**Solution**:
1. Verify MongoDB is running
2. Check `.env` file has correct `MONGODB_URI`
3. Ensure `MONGO_DB_NAME` is set correctly
4. Test connection: `mongosh "your-connection-string"`

### Admin Account Creation Fails

**Problem**: Admin account creation fails

**Solution**:
1. Check `src/utils/admin.json` exists and is valid JSON
2. Verify email is unique (not already in database)
3. Ensure password meets requirements
4. Check that roles are seeded first

### Missing Roles

**Problem**: Users don't have roles assigned

**Solution**:
```bash
# Re-seed roles
node src/utils/seed/seedRoles.js

# Migrate users to assign roles
node src/utils/migrations/migrateUsersToNewModel.js --step=1
```

### Missing Organizations

**Problem**: Organizations not found

**Solution**:
```bash
# Re-seed organizations
node src/utils/seed/seedOrganizations.js
```

### User Migration Issues

**Problem**: Users not migrating correctly

**Solution**:
1. Run diagnostics: `node src/utils/diagnostics/diagnoseUser.js <email>`
2. Verify prerequisites are met (roles, organizations, locations seeded)
3. Run migration with specific steps: `node src/utils/migrations/migrateUsersToNewModel.js --step=1,2,3`

## Script Organization

Scripts are organized into folders:

- **`seed/`**: Initial data population scripts
- **`migrations/`**: Data migration and update scripts
- **`diagnostics/`**: Troubleshooting and validation scripts

## Best Practices

1. **Always use dry-run first**: Test scripts with `--dry-run` before running for real
2. **Backup database**: Before running migrations, backup your database
3. **Run in order**: Follow the setup order (seed → create admin → migrate)
4. **Check prerequisites**: Ensure all prerequisites are met before running scripts
5. **Verify results**: Use diagnostic scripts to verify setup completed correctly

## Next Steps

After setup:

1. Log in with admin credentials
2. Configure system settings
3. Create additional staff accounts through the admin interface
4. Assign coordinators to coverage areas
5. Create stakeholder accounts

## Support

For issues or questions:
1. Check the main README: `src/utils/README.md`
2. Run diagnostic scripts to identify issues
3. Review script output for error messages

