// Legacy eventRequestController was moved to /legacy-event-request
// Use the new eventRequests_controller instead
const systemSettingsController = require('./systemSettings.controller');
const bloodBagRequestController = require('./bloodBagRequest.controller');

module.exports = {
  // eventRequestController removed - use eventRequests_controller instead
  systemSettingsController,
  bloodBagRequestController
};

