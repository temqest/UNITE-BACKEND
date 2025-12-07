const messageService = require('./message.service');
const presenceService = require('./presence.service');
const typingService = require('./typing.service');
const permissionsService = require('./permissions.service');

module.exports = {
  messageService,
  presenceService,
  typingService,
  permissionsService
};