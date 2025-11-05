/* Backfill script: populate EventRequest.MadeByStakeholderID from Event.MadeByStakeholderID when missing

Run with:
  node scripts/backfill_madeByStakeholder.js

Make sure MONGO_URI is set in your environment or a .env file in project root.
*/

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('MONGO_URI not set. Set env or create .env file');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000, family: 4 });
  console.log('Connected to DB', mongoose.connection.name);

  const models = require('../src/models');
  const EventRequest = models.EventRequest;
  const Event = models.Event;

  const cursor = EventRequest.find({ $or: [{ MadeByStakeholderID: { $exists: false } }, { MadeByStakeholderID: null }] }).cursor();
  let updated = 0;
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    try {
      const ev = await Event.findOne({ Event_ID: doc.Event_ID });
      if (ev && ev.MadeByStakeholderID) {
        doc.MadeByStakeholderID = ev.MadeByStakeholderID;
        await doc.save();
        updated++;
        console.log(`Updated ${doc.Request_ID} -> ${ev.MadeByStakeholderID}`);
      }
    } catch (e) {
      console.error('Failed for', doc.Request_ID, e.message);
    }
  }

  console.log('Done. Updated', updated, 'documents');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
