/**
 * Migration script: Backfill organizationId for existing documents.
 *
 * Strategy:
 * - Resolve a DEFAULT_ORG from env or create/find one by code 'default'.
 * - Users: ensure top-level organizationId and at least one embedded organizations[] entry.
 * - Events: copy organizationId from linked EventRequest if present; otherwise fall back to
 *   coordinator's primary organization or DEFAULT_ORG.
 * - Notifications: backfill organizationId from linked EventRequest/Event or recipient user;
 *   else DEFAULT_ORG.
 * - BloodBagRequest / BloodBag: assign from requester/requestee user organization or DEFAULT_ORG.
 *
 * This is intentionally conservative and can be re-run; it only fills missing organizationId.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  Organization,
  User,
  UserOrganization,
  Event,
  EventRequest,
  Notification,
  BloodBagRequest,
  BloodBag
} = require('../src/models');

const DRY_RUN = process.env.DRY_RUN === 'true';

async function connect() {
  const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!rawMongoUri) {
    throw new Error('Missing MONGODB_URI / MONGO_URI / MONGO_URL env var');
  }
  await mongoose.connect(rawMongoUri);
}

async function getDefaultOrganization() {
  const code = (process.env.DEFAULT_ORG_CODE || 'default').toLowerCase().trim();
  let org = await Organization.findOne({ code });
  if (!org) {
    throw new Error(`Default organization with code "${code}" not found. Run scripts/createDefaultOrganization.js first.`);
  }
  return org;
}

async function migrateUsers(defaultOrg) {
  console.log('--- Migrating Users ---');
  const cursor = User.find({}).cursor();
  let updated = 0;

  for await (const user of cursor) {
    let needsSave = false;

    if (!user.organizationId) {
      // Prefer embedded organizations
      if (Array.isArray(user.organizations) && user.organizations.length > 0) {
        const primary = user.organizations.find(o => o.isPrimary) || user.organizations[0];
        if (primary && primary.organizationId) {
          user.organizationId = primary.organizationId;
        }
      }

      if (!user.organizationId) {
        user.organizationId = defaultOrg._id;
      }
      needsSave = true;
    }

    // Ensure embedded organizations includes at least one entry
    if (!Array.isArray(user.organizations) || user.organizations.length === 0) {
      user.organizations = [{
        organizationId: user.organizationId,
        organizationName: defaultOrg.name,
        organizationType: defaultOrg.type,
        isPrimary: true,
        assignedAt: new Date()
      }];
      needsSave = true;
    }

    if (needsSave) {
      updated++;
      console.log(`User ${user.email} -> organizationId=${user.organizationId.toString()}`);
      if (!DRY_RUN) {
        await user.save();
      }
    }

    // Ensure UserOrganization entry exists
    const userId = user._id;
    const orgId = user.organizationId;
    const existing = await UserOrganization.findOne({ userId, organizationId: orgId });
    if (!existing && !DRY_RUN) {
      await UserOrganization.assignOrganization(userId, orgId, {
        roleInOrg: 'member',
        isPrimary: true
      });
    }
  }

  console.log(`Users updated: ${updated}`);
}

async function migrateEvents(defaultOrg) {
  console.log('--- Migrating Events ---');
  const cursor = Event.find({ organizationId: { $exists: false } }).cursor();
  let updated = 0;

  for await (const ev of cursor) {
    let orgId = null;

    // 1) Try linked EventRequest (new model)
    if (ev.Request_ID) {
      const req = await EventRequest.findOne({ Request_ID: ev.Request_ID }).select('organizationId').lean();
      if (req && req.organizationId) {
        orgId = req.organizationId;
      }
    }

    // 2) Try coordinator user
    if (!orgId && ev.coordinator_id) {
      const coord = await User.findOne({ userId: ev.coordinator_id }).select('organizationId').lean();
      if (coord && coord.organizationId) {
        orgId = coord.organizationId;
      }
    }

    // 3) Default organization
    if (!orgId) {
      orgId = defaultOrg._id;
    }

    ev.organizationId = orgId;
    updated++;
    console.log(`Event ${ev.Event_ID} -> organizationId=${orgId.toString()}`);
    if (!DRY_RUN) {
      await ev.save();
    }
  }

  console.log(`Events updated: ${updated}`);
}

async function migrateNotifications(defaultOrg) {
  console.log('--- Migrating Notifications ---');
  const cursor = Notification.find({ organizationId: { $exists: false } }).cursor();
  let updated = 0;

  for await (const n of cursor) {
    let orgId = null;

    // 1) From EventRequest
    if (n.Request_ID) {
      const req = await EventRequest.findOne({ Request_ID: n.Request_ID }).select('organizationId').lean();
      if (req && req.organizationId) {
        orgId = req.organizationId;
      }
    }

    // 2) From Event
    if (!orgId && n.Event_ID) {
      const ev = await Event.findOne({ Event_ID: n.Event_ID }).select('organizationId').lean();
      if (ev && ev.organizationId) {
        orgId = ev.organizationId;
      }
    }

    // 3) From recipient user
    if (!orgId && n.recipientUserId) {
      const user = await User.findById(n.recipientUserId).select('organizationId').lean();
      if (user && user.organizationId) {
        orgId = user.organizationId;
      }
    }

    if (!orgId) {
      orgId = defaultOrg._id;
    }

    n.organizationId = orgId;
    updated++;
    console.log(`Notification ${n.Notification_ID} -> organizationId=${orgId.toString()}`);
    if (!DRY_RUN) {
      await n.save();
    }
  }

  console.log(`Notifications updated: ${updated}`);
}

async function migrateBloodBagRequests(defaultOrg) {
  console.log('--- Migrating BloodBagRequests ---');
  const cursor = BloodBagRequest.find({ organizationId: { $exists: false } }).cursor();
  let updated = 0;

  for await (const br of cursor) {
    let orgId = null;

    // Try requester / requestee as users (by legacy IDs)
    if (br.Requester_ID) {
      const requester = await User.findOne({ userId: br.Requester_ID }).select('organizationId').lean();
      if (requester && requester.organizationId) {
        orgId = requester.organizationId;
      }
    }

    if (!orgId && br.Requestee_ID) {
      const requestee = await User.findOne({ userId: br.Requestee_ID }).select('organizationId').lean();
      if (requestee && requestee.organizationId) {
        orgId = requestee.organizationId;
      }
    }

    if (!orgId) {
      orgId = defaultOrg._id;
    }

    br.organizationId = orgId;
    updated++;
    console.log(`BloodBagRequest ${br.Request_ID} -> organizationId=${orgId.toString()}`);
    if (!DRY_RUN) {
      await br.save();
    }
  }

  console.log(`BloodBagRequests updated: ${updated}`);
}

async function migrateBloodBags(defaultOrg) {
  console.log('--- Migrating BloodBags ---');
  const cursor = BloodBag.find({ organizationId: { $exists: false } }).cursor();
  let updated = 0;

  for await (const bag of cursor) {
    // Without strong ownership info, default them to defaultOrg.
    bag.organizationId = defaultOrg._id;
    updated++;
    console.log(`BloodBag ${bag.BloodBag_ID} -> organizationId=${defaultOrg._id.toString()}`);
    if (!DRY_RUN) {
      await bag.save();
    }
  }

  console.log(`BloodBags updated: ${updated}`);
}

async function main() {
  try {
    await connect();
    console.log('Connected to MongoDB');
    const defaultOrg = await getDefaultOrganization();
    console.log(`Using default organization: ${defaultOrg._id.toString()} (${defaultOrg.name})`);

    await migrateUsers(defaultOrg);
    await migrateEvents(defaultOrg);
    await migrateNotifications(defaultOrg);
    await migrateBloodBagRequests(defaultOrg);
    await migrateBloodBags(defaultOrg);

    console.log('Migration completed.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();

