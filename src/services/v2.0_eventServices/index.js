/**
 * v2.0 Event Services Index
 * 
 * Exports all v2.0 event-related services
 */

const v2EventRequestService = require('./v2.0_eventRequest.service');
const v2EventService = require('./v2.0_event.service');
const v2ReviewerResolver = require('./v2.0_reviewerResolver.service');
const V2RequestStateMachine = require('./v2.0_requestStateMachine');

module.exports = {
  v2EventRequestService,
  v2EventService,
  v2ReviewerResolver,
  V2RequestStateMachine
};
