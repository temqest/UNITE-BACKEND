/**
 * Test: Direct API calls to verify filtering works
 * This simulates what the frontend does when switching coordinators
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:6700';

async function testAPIFiltering() {
  try {
    console.log('📍 Testing API Endpoint Directly\n');

    // Get token from somewhere (for now, we'll try without it first)
    const headers = {
      'Content-Type': 'application/json',
    };

    console.log('1️⃣  Fetch all stakeholders (no coordinator filter):');
    try {
      const res1 = await axios.get(`${API_BASE}/api/users/by-capability?capability=request.review`, {
        headers,
        validateStatus: () => true, // Don't throw on any status
      });
      console.log(`   Status: ${res1.status}`);
      console.log(`   Count: ${Array.isArray(res1.data?.data) ? res1.data.data.length : 'unknown'}`);
      if (res1.status !== 200) {
        console.log(`   Error: ${res1.data?.message || res1.statusText}`);
      }
    } catch (err) {
      console.log(`   Error: ${err.message}`);
    }

    console.log('\n2️⃣  Finding coordinators in the database...');
    // First, get the database info to find a real coordinator ID
    const User = require('../models/users_models/user.model');
    const mongoose = require('mongoose');
    
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });

    const coordinators = await User.find({
      authority: 60,
      isActive: true,
    })
      .select('_id firstName lastName')
      .lean();

    console.log(`   Found ${coordinators.length} coordinators`);

    if (coordinators.length > 0) {
      const coord1 = coordinators[0];
      const coord2 = coordinators[1] || coordinators[0];

      console.log(`   Coordinator 1: ${coord1.firstName} ${coord1.lastName} (${coord1._id})`);
      if (coordinators.length > 1) {
        console.log(`   Coordinator 2: ${coord2.firstName} ${coord2.lastName} (${coord2._id})`);
      }

      console.log('\n3️⃣  Fetch stakeholders filtered by Coordinator 1:');
      try {
        const res2 = await axios.get(
          `${API_BASE}/api/users/by-capability?capability=request.review&coordinatorId=${coord1._id}`,
          {
            headers,
            validateStatus: () => true,
          }
        );
        console.log(`   Status: ${res2.status}`);
        const count1 = Array.isArray(res2.data?.data) ? res2.data.data.length : 0;
        console.log(`   Count: ${count1}`);
        if (res2.status !== 200) {
          console.log(`   Error: ${res2.data?.message || res2.statusText}`);
        }
      } catch (err) {
        console.log(`   Error: ${err.message}`);
      }

      if (coordinators.length > 1) {
        console.log('\n4️⃣  Fetch stakeholders filtered by Coordinator 2:');
        try {
          const res3 = await axios.get(
            `${API_BASE}/api/users/by-capability?capability=request.review&coordinatorId=${coord2._id}`,
            {
              headers,
              validateStatus: () => true,
            }
          );
          console.log(`   Status: ${res3.status}`);
          const count2 = Array.isArray(res3.data?.data) ? res3.data.data.length : 0;
          console.log(`   Count: ${count2}`);
          if (res3.status !== 200) {
            console.log(`   Error: ${res3.data?.message || res3.statusText}`);
          }
        } catch (err) {
          console.log(`   Error: ${err.message}`);
        }
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAPIFiltering();
