const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'unite_bmc_production';
const mongoUrl = MONGODB_URI.includes(MONGO_DB_NAME) ? MONGODB_URI : `${MONGODB_URI}/${MONGO_DB_NAME}`;

async function checkActiveResponder() {
  try {
    console.log('Connecting to:', mongoUrl.replace(/\/\/[^@]*@/, '//***@'));
    await mongoose.connect(mongoUrl);
    console.log('Connected\n');

    const EventRequest = mongoose.model('EventRequest', new mongoose.Schema({}, { strict: false }), 'eventrequests');

    // Check the specific request from logs
    const requestId = process.env.TEST_REQUEST_ID || 'REQ-1769416849407-1603';
    const request = await EventRequest.findOne({ Request_ID: requestId }).lean();

    if (!request) {
      console.log(`Request ${requestId} not found`);
      await mongoose.disconnect();
      return;
    }

    console.log('Request:', requestId);
    console.log('Status:', request.status);
    console.log('\nRequester:');
    console.log('  userId:', request.requester?.userId?.toString());
    console.log('  name:', request.requester?.name);
    console.log('  roleSnapshot:', request.requester?.roleSnapshot);
    console.log('  authority:', request.requester?.authoritySnapshot);

    console.log('\nReviewer:');
    console.log('  userId:', request.reviewer?.userId?.toString());
    console.log('  name:', request.reviewer?.name);
    console.log('  roleSnapshot:', request.reviewer?.roleSnapshot);
    console.log('  assignmentRule:', request.reviewer?.assignmentRule);

    console.log('\nReschedule Proposal:');
    if (request.rescheduleProposal) {
      console.log('  proposedBy userId:', request.rescheduleProposal.proposedBy?.userId?.toString());
      console.log('  proposedBy name:', request.rescheduleProposal.proposedBy?.name);
      console.log('  proposedDate:', request.rescheduleProposal.proposedDate);
    } else {
      console.log('  None');
    }

    console.log('\nActive Responder:');
    if (request.activeResponder) {
      console.log('  userId:', request.activeResponder.userId?.toString());
      console.log('  relationship:', request.activeResponder.relationship);
      console.log('  authority:', request.activeResponder.authority);
      
      // Determine if correct
      const isRequester = request.activeResponder.userId?.toString() === request.requester?.userId?.toString();
      const isReviewer = request.activeResponder.userId?.toString() === request.reviewer?.userId?.toString();
      
      console.log('\n  ✓ Matches requester?', isRequester);
      console.log('  ✓ Matches reviewer?', isReviewer);
      
      if (request.status === 'review-rescheduled') {
        const proposerId = request.rescheduleProposal?.proposedBy?.userId?.toString();
        const isProposer = request.activeResponder.userId?.toString() === proposerId;
        const requesterId = request.requester?.userId?.toString();
        const reviewerId = request.reviewer?.userId?.toString();
        const proposerIsValidCoord = proposerId && proposerId !== requesterId && proposerId !== reviewerId;
        
        if (proposerIsValidCoord && request.requester?.roleSnapshot === 'stakeholder') {
          console.log('\n  🔍 Valid coordinator rescheduled S→C flow');
          console.log('  Expected activeResponder: Stakeholder (requester)');
          console.log('  Actual activeResponder:', isRequester ? 'Stakeholder ✓' : 'Reviewer ✗');
        }
      }
    } else {
      console.log('  None (null)');
    }

    console.log('\nLast Action:');
    if (request.lastAction) {
      console.log('  action:', request.lastAction.action);
      console.log('  actorId:', request.lastAction.actorId?.toString());
      console.log('  timestamp:', request.lastAction.timestamp);
    } else {
      console.log('  None');
    }

    await mongoose.disconnect();
    console.log('\nDone');
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkActiveResponder();
