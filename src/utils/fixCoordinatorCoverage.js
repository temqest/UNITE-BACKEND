#!/usr/bin/env node
/**
 * Fix coordinator coverage areas to use coverageArea.geographicUnits
 * (remove expanded municipality/district lists that were over-broad).
 *
 * What it does:
 * 1) For each coordinator with a coverageAreaId, load that CoverageArea.
 * 2) If geographicUnits exist, replace municipalityIds/districtIds/provinceIds
 *    with geographicUnits (as-is), and mark a changed flag.
 * 3) Persist only changed coordinators and log before/after counts.
 *
 * Run: node src/utils/fixCoordinatorCoverage.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');
const CoverageArea = require('../models/utility_models/coverageArea.model');

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri) {
    console.error('Missing MONGODB_URI / MONGO_URI');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...', { uri: uri.slice(0, 40) + '...', dbName });
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, dbName });
  console.log('Connected');

  const coordinators = await User.find({ authority: { $gte: 60, $lt: 80 }, 'coverageAreas.0': { $exists: true } })
    .select('firstName lastName coverageAreas')
    .lean();

  console.log(`Found ${coordinators.length} coordinators with coverage areas`);

  let changed = 0;
  let totalAreas = 0;

  for (const coord of coordinators) {
    const updatedAreas = [];
    let coordChanged = false;

    for (const ca of coord.coverageAreas || []) {
      totalAreas += 1;
      if (!ca.coverageAreaId) {
        updatedAreas.push(ca);
        continue;
      }

      const covId = ca.coverageAreaId._id || ca.coverageAreaId;
      const cov = await CoverageArea.findById(covId).select('geographicUnits name').lean();
      if (!cov || !cov.geographicUnits || cov.geographicUnits.length === 0) {
        updatedAreas.push(ca);
        continue;
      }

      const originalMun = (ca.municipalityIds || []).length;
      const originalDist = (ca.districtIds || []).length;
      const originalProv = (ca.provinceIds || []).length;

      // Replace with geographicUnits
      const newUnits = cov.geographicUnits.map(id => new mongoose.Types.ObjectId(id));
      const newArea = {
        ...ca,
        municipalityIds: newUnits,
        districtIds: [],
        provinceIds: [],
      };

      // Detect change
      const changedMun = originalMun !== newUnits.length;
      const changedDist = originalDist !== 0;
      const changedProv = originalProv !== 0;
      if (changedMun || changedDist || changedProv) {
        coordChanged = true;
        console.log(`[FIX] ${coord.firstName} ${coord.lastName} | ${cov.name || cov._id} | mun ${originalMun}->${newUnits.length} dist ${originalDist}->0 prov ${originalProv}->0`);
      }

      updatedAreas.push(newArea);
    }

    if (coordChanged) {
      await User.updateOne({ _id: coord._id }, { $set: { coverageAreas: updatedAreas } });
      changed += 1;
    }
  }

  console.log(`Done. Coordinators updated: ${changed}/${coordinators.length}, total coverage areas scanned: ${totalAreas}`);
  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
