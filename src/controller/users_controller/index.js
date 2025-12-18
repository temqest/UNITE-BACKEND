const systemAdminController = require('./systemAdmin.controller');
const coordinatorController = require('./coordinator.controller');
const bloodbankStaffController = require('./bloodbankStaff.controller');
const stakeholderController = require('./stakeholder.controller');
const userController = require('./user.controller'); // New unified user controller

module.exports = {
  systemAdminController,
  coordinatorController,
  bloodbankStaffController,
  stakeholderController,
  userController
};

