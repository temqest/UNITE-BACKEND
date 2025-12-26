/**
 * Request Helper
 * Provides utilities for creating requests, executing actions, and managing request lifecycle
 * Updated for new event request system (/api/event-requests)
 */

const request = require('supertest');

/**
 * Create a request via API
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {Object} requestData - Request payload
 * @returns {Promise<Object>} Created request
 */
async function createRequest(app, token, requestData) {
  // Generate Event_ID if not provided (for testing)
  if (!requestData.Event_ID) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    requestData.Event_ID = `EVT-${timestamp}-${random}`;
  }

  const response = await request(app)
    .post('/api/event-requests')
    .set('Authorization', `Bearer ${token}`)
    .send(requestData);

  if (response.status !== 201 && response.status !== 200) {
    const errorMsg = response.body.message || 
                     (Array.isArray(response.body.errors) ? response.body.errors.join(', ') : response.body.errors) ||
                     JSON.stringify(response.body) ||
                     'Unknown error';
    throw new Error(`Failed to create request: ${errorMsg}`);
  }

  // New API returns: { success: true, data: { request: {...} } }
  return response.body.data?.request || response.body.request || response.body.data;
}

/**
 * Get request by ID
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID (can be Request_ID or _id)
 * @returns {Promise<Object>} Request object
 */
async function getRequest(app, token, requestId) {
  const response = await request(app)
    .get(`/api/event-requests/${requestId}`)
    .set('Authorization', `Bearer ${token}`);

  if (response.status !== 200) {
    throw new Error(`Failed to get request: ${response.body.message || 'Unknown error'}`);
  }

  return response.body.data?.request || response.body.request || response.body.data;
}

/**
 * Get available actions for a request
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID
 * @returns {Promise<Array<string>>} Array of available action names
 */
async function getAvailableActions(app, token, requestId) {
  const response = await request(app)
    .get(`/api/event-requests/${requestId}/actions`)
    .set('Authorization', `Bearer ${token}`);

  if (response.status !== 200) {
    throw new Error(`Failed to get available actions: ${response.body.message || 'Unknown error'}`);
  }

  // New API returns: { success: true, data: { actions: [...] } }
  return response.body.data?.actions || response.body.actions || [];
}

/**
 * Execute a review action (accept/reject/reschedule) using unified actions endpoint
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID
 * @param {string} action - Action name ('accept', 'reject', 'reschedule')
 * @param {Object} actionData - Additional action data (notes, proposedDate, etc.)
 * @returns {Promise<Object>} Updated request
 */
async function executeReviewAction(app, token, requestId, action, actionData = {}) {
  const response = await request(app)
    .post(`/api/event-requests/${requestId}/actions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      action,
      ...actionData
    });

  if (response.status !== 200) {
    throw new Error(`Failed to execute ${action}: ${response.body.message || 'Unknown error'}`);
  }

  // New API returns: { success: true, data: { request: {...} } }
  return response.body.data?.request || response.body.request || response.body.data;
}

/**
 * Confirm a reviewer's decision
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID
 * @param {string} action - Confirmation action ('confirm', 'decline')
 * @param {Object} actionData - Additional data (notes, etc.)
 * @returns {Promise<Object>} Updated request
 */
async function confirmDecision(app, token, requestId, action = 'confirm', actionData = {}) {
  const response = await request(app)
    .post(`/api/event-requests/${requestId}/actions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      action,
      ...actionData
    });

  if (response.status !== 200) {
    throw new Error(`Failed to confirm decision: ${response.body.message || 'Unknown error'}`);
  }

  return response.body.data?.request || response.body.request || response.body.data;
}

/**
 * Execute a unified action (accept, reject, reschedule, cancel, confirm, etc.)
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID
 * @param {string} action - Action name
 * @param {Object} actionData - Additional action data
 * @returns {Promise<Object>} Updated request
 */
async function executeAction(app, token, requestId, action, actionData = {}) {
  const response = await request(app)
    .post(`/api/event-requests/${requestId}/actions`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      action,
      ...actionData
    });

  if (response.status !== 200) {
    throw new Error(`Failed to execute action ${action}: ${response.body.message || 'Unknown error'}`);
  }

  return response.body.data?.request || response.body.request || response.body.data;
}

/**
 * Wait for request state to change
 * @param {Object} app - Express app instance
 * @param {string} token - User JWT token
 * @param {string} requestId - Request ID
 * @param {string} expectedState - Expected state
 * @param {number} timeout - Timeout in milliseconds (default: 10000)
 * @param {number} interval - Polling interval in milliseconds (default: 500)
 * @returns {Promise<Object>} Request with expected state
 */
async function waitForStateChange(app, token, requestId, expectedState, timeout = 10000, interval = 500) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const request = await getRequest(app, token, requestId);
    // New model uses 'status' field
    const currentState = request.status || request.Status;
    
    if (currentState === expectedState) {
      return request;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  const finalRequest = await getRequest(app, token, requestId);
  throw new Error(`Request state did not change to ${expectedState} within ${timeout}ms. Current state: ${finalRequest.status || finalRequest.Status}`);
}

module.exports = {
  createRequest,
  getRequest,
  getAvailableActions,
  executeReviewAction,
  confirmDecision,
  executeAction,
  waitForStateChange
};
