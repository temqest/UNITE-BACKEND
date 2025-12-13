/**
 * Creates a System Admin account based on `src/utils/sysadmin.json`.
 * Usage:
 *   node src/utils/createSysAdmin.js        # runs using env MONGODB_URI or MONGO_URI
 *   node src/utils/createSysAdmin.js --dry-run
 *
 * Edit `src/utils/sysadmin.json` to change credentials before running.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

const sysadminPath = path.join(__dirname, 'sysadmin.json');
const dryRun = process.argv.includes('--dry-run');
const SystemAdminService = require('../services/users_services/systemAdmin.service');

// Accept multiple env names
const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
// Database name (optional) — allows connecting to a specific DB in the cluster
const dbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB || process.env.DB_NAME || null;

function loadConfig() {
  if (fs.existsSync(sysadminPath)) {
    try {
      const raw = fs.readFileSync(sysadminPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse sysadmin.json:', e.message);
      process.exit(1);
    }
  }
  console.error('No src/utils/sysadmin.json found. Please create one.');
  process.exit(1);
}

async function run() {
  const cfg = loadConfig();
  const staff = cfg.staff || {};
  const admin = cfg.admin || {};

  console.log('Configuration to use:');
  console.log(JSON.stringify({ staff: { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email }, admin }, null, 2));

  // Log which database will be used (shows even for --dry-run)
  console.log('Database to use:', dbName ? dbName : '(from URI)');

  if (dryRun) {
    console.log('--dry-run provided; exiting without writing to DB.');
    return;
  }

  console.log('Connecting to DB:', uri.replace(/(mongodb\+srv:\/\/.*?:).*@/, '$1****@'), dbName ? `(using database: ${dbName})` : '');
  const connectOptions = { useNewUrlParser: true, useUnifiedTopology: true };
  if (dbName) connectOptions.dbName = dbName;
  await mongoose.connect(uri, connectOptions);
  try {
    const result = await SystemAdminService.createSystemAdminAccount(staff, admin, null);
    console.log('System admin created successfully:');
    console.log(JSON.stringify(result.admin, null, 2));
    console.log('Credentials (plaintext from config):', JSON.stringify(result.credentials));
  } catch (err) {
    console.error('Failed to create system admin:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) run();
