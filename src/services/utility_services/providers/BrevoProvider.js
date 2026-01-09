const EmailProvider = require('./EmailProvider');

/**
 * Brevo Email Provider
 * 
 * Implements email sending using Brevo REST API (formerly Sendinblue).
 * Uses HTTP requests to Brevo's API endpoint for email sending.
 */
class BrevoProvider extends EmailProvider {
  constructor() {
    super();
    this.apiKey = null;
    this.fromEmail = null;
    this.apiBaseUrl = 'https://api.brevo.com/v3';
  }

  /**
   * Initialize Brevo API client
   * @returns {Promise<void>}
   */
  async initialize() {
    // Support multiple variable name formats for API key
    // BREVO_EMAIL_API, BREVO_API_KEY, BREVO_API, Brevo_API
    this.apiKey = (process.env.BREVO_EMAIL_API ||
                   process.env.BREVO_API_KEY ||
                   process.env.BREVO_API ||
                   process.env.Brevo_API || '').trim();

    this.fromEmail = this.getFromEmail();
    if (!this.fromEmail) {
      console.warn('[BREVO] EMAIL_USER not set. Email sending will fail.');
    }

    // Debug logging (masked for security)
    console.log(`[BREVO] API Configuration:`);
    console.log(`[BREVO]   API Base URL: ${this.apiBaseUrl}`);
    if (this.apiKey) {
      const maskedKey = this.apiKey.length > 10 
        ? `${this.apiKey.substring(0, 10)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : '***';
      console.log(`[BREVO]   API Key: ${maskedKey} (length: ${this.apiKey.length})`);
    } else {
      console.warn(`[BREVO]   API Key: NOT FOUND`);
    }
    if (this.fromEmail) {
      console.log(`[BREVO]   From Email: ${this.fromEmail}`);
    } else {
      console.warn(`[BREVO]   From Email: NOT FOUND`);
    }

    if (!this.apiKey) {
      console.warn('[BREVO] API key not found. Email sending will fail.');
      console.warn('[BREVO] Looking for: BREVO_EMAIL_API, BREVO_API_KEY, BREVO_API, or Brevo_API');
    } else {
      // Test API connection by making a lightweight request
      try {
        const response = await fetch(`${this.apiBaseUrl}/account`, {
          method: 'GET',
          headers: {
            'api-key': this.apiKey,
            'Accept': 'application/json'
          }
        });

        if (response.ok) {
          console.log('[BREVO] Provider initialized and active (API connection verified)');
        } else if (response.status === 401) {
          console.warn('[BREVO] API key authentication failed. Please verify your BREVO_EMAIL_API key.');
        } else {
          console.warn(`[BREVO] API connection test returned status ${response.status}. Email sending may still work.`);
        }
      } catch (error) {
        console.warn('[BREVO] API connection test failed:', error.message);
        console.warn('[BREVO] Email sending may fail. Please check your API key and network connectivity.');
      }
    }
  }

  /**
   * Validate Brevo configuration
   * @returns {Promise<{valid: boolean, errors?: string[]}>}
   */
  async validateConfig() {
    const errors = [];

    // Check for API key (support multiple variable name formats)
    const apiKey = process.env.BREVO_EMAIL_API ||
                   process.env.BREVO_API_KEY ||
                   process.env.BREVO_API ||
                   process.env.Brevo_API;
    if (!apiKey) {
      errors.push('BREVO_EMAIL_API, BREVO_API_KEY, BREVO_API, or Brevo_API is required');
    }

    if (!this.getFromEmail()) {
      errors.push('EMAIL_USER is required');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    return 'brevo';
  }

  /**
   * Handle Brevo API errors
   * @param {Error|Response} error - API error or response
   * @throws {Error} Formatted error message
   */
  async handleBrevoError(error) {
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ message: error.statusText }));
      if (error.status === 401) {
        throw new Error(`Brevo API authentication failed: ${errorData.message || 'Invalid API key'}. Please verify your BREVO_EMAIL_API key.`);
      } else if (error.status === 400) {
        throw new Error(`Brevo API bad request: ${errorData.message || 'Invalid email parameters'}. Please check your email content.`);
      } else if (error.status === 403) {
        throw new Error(`Brevo API forbidden: ${errorData.message || 'Insufficient permissions'}. Please check your API key permissions.`);
      } else if (error.status >= 500) {
        throw new Error(`Brevo API server error: ${errorData.message || 'Service unavailable'}. Please try again later.`);
      } else {
        throw new Error(`Brevo API error (${error.status}): ${errorData.message || error.statusText}`);
      }
    } else {
      throw new Error(`Brevo API error: ${error.message || error.toString()}`);
    }
  }

  /**
   * Send email via Brevo REST API
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content
   * @returns {Promise<{success: boolean, messageId?: string, error?: Error}>}
   */
  async sendEmail(to, subject, text, html) {
    if (!this.fromEmail) {
      const error = new Error('EMAIL_USER not configured. Cannot send email.');
      return {
        success: false,
        error
      };
    }

    if (!this.apiKey) {
      const error = new Error('Brevo API key not configured. Cannot send email.');
      return {
        success: false,
        error
      };
    }

    const emailData = {
      sender: {
        name: 'UNITE Blood Bank',
        email: this.fromEmail
      },
      to: [
        {
          email: to
        }
      ],
      subject: subject,
      textContent: text,
      htmlContent: html
    };

    try {
      const response = await fetch(`${this.apiBaseUrl}/smtp/email`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        await this.handleBrevoError(response);
        return {
          success: false,
          error: new Error(`HTTP ${response.status}: ${response.statusText}`)
        };
      }

      const result = await response.json();
      const messageId = result.messageId || result.id || 'unknown';
      
      console.log(`[BREVO] Email sent to ${to}. MessageId: ${messageId}`);
      
      return {
        success: true,
        messageId: messageId
      };
    } catch (error) {
      console.error(`[BREVO] Error sending email to ${to}:`, error);
      // handleBrevoError throws, but in case it doesn't:
      return {
        success: false,
        error
      };
    }
  }
}

module.exports = BrevoProvider;

