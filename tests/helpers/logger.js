/**
 * Structured Test Logging
 * Provides consistent logging format for test execution
 */

class TestLogger {
  constructor(flowName = 'Test') {
    this.flowName = flowName;
    this.logs = [];
  }

  /**
   * Log test flow start
   */
  logFlowStart() {
    const msg = `[TEST] Flow: ${this.flowName}`;
    console.log(msg);
    this.logs.push({ type: 'flow_start', message: msg, timestamp: new Date() });
  }

  /**
   * Log actor information
   * @param {string} email - User email
   * @param {number} authority - User authority level
   * @param {Array<string>} permissions - User permissions
   */
  logActor(email, authority, permissions = []) {
    const permsStr = permissions.length > 0 ? permissions.join(', ') : 'none';
    const msg = `[ACTOR] Email: ${email} | Authority: ${authority} | Permissions: [${permsStr}]`;
    console.log(msg);
    this.logs.push({ type: 'actor', email, authority, permissions, message: msg, timestamp: new Date() });
  }

  /**
   * Log action performed
   * @param {string} action - Action name
   * @param {string} details - Additional details
   */
  logAction(action, details = '') {
    const msg = `[ACTION] ${action}${details ? ` - ${details}` : ''}`;
    console.log(msg);
    this.logs.push({ type: 'action', action, details, message: msg, timestamp: new Date() });
  }

  /**
   * Log request routing
   * @param {string} reviewerEmail - Reviewer email
   * @param {number} reviewerAuthority - Reviewer authority
   */
  logRouting(reviewerEmail, reviewerAuthority) {
    const msg = `[ROUTING] Request assigned to: ${reviewerEmail} (Authority: ${reviewerAuthority})`;
    console.log(msg);
    this.logs.push({ type: 'routing', reviewerEmail, reviewerAuthority, message: msg, timestamp: new Date() });
  }

  /**
   * Log permissions check
   * @param {Array<string>} permissions - Available permissions
   */
  logPermissions(permissions = []) {
    const permsStr = permissions.length > 0 ? permissions.join(', ') : 'none';
    const msg = `[PERMISSIONS] Reviewer has: [${permsStr}]`;
    console.log(msg);
    this.logs.push({ type: 'permissions', permissions, message: msg, timestamp: new Date() });
  }

  /**
   * Log available actions
   * @param {Array<string>} actions - Available actions
   */
  logActions(actions = []) {
    const actionsStr = actions.length > 0 ? actions.join(', ') : 'none';
    const msg = `[ACTIONS] Available: [${actionsStr}]`;
    console.log(msg);
    this.logs.push({ type: 'actions', actions, message: msg, timestamp: new Date() });
  }

  /**
   * Log state transition
   * @param {string} fromState - Previous state
   * @param {string} toState - New state
   */
  logTransition(fromState, toState) {
    const msg = `[TRANSITION] ${fromState} → ${toState}`;
    console.log(msg);
    this.logs.push({ type: 'transition', fromState, toState, message: msg, timestamp: new Date() });
  }

  /**
   * Log result
   * @param {string} result - Result description
   */
  logResult(result) {
    const msg = `[RESULT] ${result}`;
    console.log(msg);
    this.logs.push({ type: 'result', result, message: msg, timestamp: new Date() });
  }

  /**
   * Log error
   * @param {string} error - Error message
   * @param {Error} err - Error object
   */
  logError(error, err = null) {
    const msg = `[ERROR] ${error}${err ? ` - ${err.message}` : ''}`;
    console.error(msg);
    if (err) {
      console.error(err.stack);
    }
    this.logs.push({ type: 'error', error, err: err?.message, message: msg, timestamp: new Date() });
  }

  /**
   * Log assertion
   * @param {string} assertion - Assertion description
   * @param {boolean} passed - Whether assertion passed
   */
  logAssertion(assertion, passed) {
    const status = passed ? 'PASS' : 'FAIL';
    const msg = `[ASSERT] ${status}: ${assertion}`;
    console.log(msg);
    this.logs.push({ type: 'assertion', assertion, passed, message: msg, timestamp: new Date() });
  }

  /**
   * Get all logs
   * @returns {Array} Array of log entries
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
  }
}

module.exports = TestLogger;

