/**
 * Email Provider Base Class
 * 
 * Abstract interface that all email providers must implement.
 * Provides a consistent API for email sending across different providers.
 */
class EmailProvider {
  /**
   * Initialize the provider
   * Should be called after instantiation to set up connections, clients, etc.
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('initialize() must be implemented by provider');
  }

  /**
   * Validate provider-specific configuration
   * @returns {Promise<{valid: boolean, errors?: string[]}>}
   */
  async validateConfig() {
    throw new Error('validateConfig() must be implemented by provider');
  }

  /**
   * Send email
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content
   * @returns {Promise<{success: boolean, messageId?: string, error?: Error}>}
   */
  async sendEmail(to, subject, text, html) {
    throw new Error('sendEmail() must be implemented by provider');
  }

  /**
   * Get provider name/identifier
   * @returns {string} Provider name (e.g., 'aws', 'brevo')
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by provider');
  }

  /**
   * Get sender email address
   * @returns {string} Sender email
   */
  getFromEmail() {
    return process.env.EMAIL_USER || '';
  }
}

module.exports = EmailProvider;

