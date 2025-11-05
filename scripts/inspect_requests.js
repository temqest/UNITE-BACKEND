/*
  Inspect requests helper
  Usage:
    node scripts/inspect_requests.js --stakeholder STKH_... 
    node scripts/inspect_requests.js --coordinator COORD_... 
    node scripts/inspect_requests.js --request REQ_... 

  Make sure MONGO_URI is set in your environment or in a .env file in project root.
*/

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set. Set env or create .env file');
  process.exit(1);
}

const argv = require('minimist')(process.argv.slice(2));

async function run() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, family: 4 });
  console.log('Connected to DB', mongoose.connection.name);

  const models = require('../src/models');
  const EventRequest = models.EventRequest;
  const Event = models.Event;
  const Stakeholder = models.Stakeholder;
  const Coordinator = models.Coordinator;

  if (argv.request) {
    const q = argv.request;
    console.log('Looking up EventRequest by Request_ID or _id:', q);
    const r = await EventRequest.findOne({ $or: [{ Request_ID: q }, { _id: q }] }).lean();
    if (!r) { console.log('No EventRequest found'); process.exit(0); }
    console.log('EventRequest:', JSON.stringify(r, null, 2));
    const ev = await Event.findOne({ Event_ID: r.Event_ID }).lean();
    console.log('Linked Event:', JSON.stringify(ev, null, 2));
    if (r.MadeByStakeholderID) {
      const s = await Stakeholder.findOne({ Stakeholder_ID: r.MadeByStakeholderID }).lean().catch(() => null);
      console.log('MadeByStakeholder:', JSON.stringify(s, null, 2));
    }
    if (r.Coordinator_ID) {
      const c = await Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID }).lean().catch(() => null);
      console.log('Coordinator (by Coordinator_ID):', JSON.stringify(c, null, 2));
    }
    process.exit(0);
  }

  if (argv.stakeholder) {
    const sid = argv.stakeholder;
    console.log('Looking up requests created by stakeholder:', sid);
    const list = await EventRequest.find({ MadeByStakeholderID: sid }).lean();
    console.log(`Found ${list.length} EventRequests`);
    for (const r of list) {
      console.log('---');
      console.log(JSON.stringify(r, null, 2));
      const ev = await Event.findOne({ Event_ID: r.Event_ID }).lean();
      console.log('Linked Event:', JSON.stringify(ev, null, 2));
    }
    process.exit(0);
  }

  if (argv.coordinator) {
    const cid = argv.coordinator;
    console.log('Looking up EventRequests with Coordinator_ID or linked to Events/Stakeholders for coordinator:', cid);
    const byCoordinator = await EventRequest.find({ Coordinator_ID: cid }).lean();
    console.log(`EventRequests with Coordinator_ID === ${cid}: ${byCoordinator.length}`);
    if (byCoordinator.length) for (const r of byCoordinator) console.log(JSON.stringify(r, null, 2));

    const events = await Event.find({ MadeByCoordinatorID: cid }).select('Event_ID').lean();
    const eventIds = events.map(e => e.Event_ID);
    console.log(`Events made by coordinator (${eventIds.length}):`, eventIds);
    if (eventIds.length) {
      const reqs = await EventRequest.find({ Event_ID: { $in: eventIds } }).lean();
      console.log(`EventRequests linked by Event_ID (${reqs.length}):`);
      for (const r of reqs) console.log(JSON.stringify(r, null, 2));
    }

    const stakeholders = await Stakeholder.find({ Coordinator_ID: cid }).select('Stakeholder_ID').lean();
    const stakeholderIds = stakeholders.map(s => s.Stakeholder_ID);
    console.log(`Stakeholders under coordinator (${stakeholderIds.length}):`, stakeholderIds);
    if (stakeholderIds.length) {
      const reqs2 = await EventRequest.find({ MadeByStakeholderID: { $in: stakeholderIds } }).lean();
      console.log(`EventRequests created by stakeholders (${reqs2.length}):`);
      for (const r of reqs2) console.log(JSON.stringify(r, null, 2));
    }

    process.exit(0);
  }

  console.log('Nothing specified. Use --request, --stakeholder or --coordinator');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
