#!/usr/bin/env node

const RequestStateService = require('../src/services/eventRequests_services/requestState.service');
const { REQUEST_STATES } = require('../src/utils/eventRequests/requestConstants');

console.log('\n🧪 Testing RequestStateService.getAvailableActions()\n');

const approvedActions = RequestStateService.getAvailableActions(REQUEST_STATES.APPROVED);
console.log(`✅ APPROVED state available actions:`, approvedActions);
console.log(`   Total: ${approvedActions.length}`);

const pendingReviewActions = RequestStateService.getAvailableActions(REQUEST_STATES.PENDING_REVIEW);
console.log(`\n✅ PENDING_REVIEW state available actions:`, pendingReviewActions);
console.log(`   Total: ${pendingReviewActions.length}`);

const reviewRescheduledActions = RequestStateService.getAvailableActions(REQUEST_STATES.REVIEW_RESCHEDULED);
console.log(`\n✅ REVIEW_RESCHEDULED state available actions:`, reviewRescheduledActions);
console.log(`   Total: ${reviewRescheduledActions.length}`);

console.log('\n');
