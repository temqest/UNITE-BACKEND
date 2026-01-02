const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const EmailProvider = require('./EmailProvider');

/**
 * AWS SES Email Provider
 * 
 * Implements email sending using AWS Simple Email Service (SES).
 * Maintains all existing AWS SES functionality and error handling.
 */
class AwsSesProvider extends EmailProvider {
  constructor() {
    super();
    this.sesClient = null;
    this.fromEmail = null;
  }

  /**
   * Initialize AWS SES client
   * @returns {Promise<void>}
   */
  async initialize() {
    // Check for credentials
    if (!process.env.AWS_ACCESS_KEY_EMAIL_ID || !process.env.AWS_SECRET_ACCESS_KEY_EMAIL) {
      console.warn('[AWS SES] AWS credentials not found. Email sending will fail.');
    }

    // Initialize SES client
    this.sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_EMAIL_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_EMAIL || ''
      }
    });

    this.fromEmail = this.getFromEmail();
    if (!this.fromEmail) {
      console.warn('[AWS SES] EMAIL_USER not set. Email sending will fail.');
    }

    console.log('[AWS SES] Provider initialized and active');
  }

  /**
   * Validate AWS SES configuration
   * @returns {Promise<{valid: boolean, errors?: string[]}>}
   */
  async validateConfig() {
    const errors = [];

    if (!process.env.AWS_ACCESS_KEY_EMAIL_ID) {
      errors.push('AWS_ACCESS_KEY_EMAIL_ID is required');
    }

    if (!process.env.AWS_SECRET_ACCESS_KEY_EMAIL) {
      errors.push('AWS_SECRET_ACCESS_KEY_EMAIL is required');
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
    return 'aws';
  }

  /**
   * Handle AWS SES errors
   * @param {Error} error - AWS SES error
   * @throws {Error} Formatted error message
   */
  handleSESError(error) {
    if (error.name === 'MessageRejected') {
      throw new Error(`Email rejected: ${error.message}. Please verify sender and recipient addresses.`);
    } else if (error.name === 'MailFromDomainNotVerifiedException') {
      throw new Error(`Sender domain not verified in AWS SES: ${error.message}`);
    } else if (error.name === 'Throttling' || error.name === 'ThrottlingException') {
      throw new Error(`AWS SES rate limit exceeded: ${error.message}. Please try again later.`);
    } else if (error.name === 'ServiceException' || error.name === 'ServiceUnavailableException') {
      throw new Error(`AWS SES service error: ${error.message}. Please try again later.`);
    } else {
      throw new Error(`AWS SES error: ${error.message || error.toString()}`);
    }
  }

  /**
   * Send email via AWS SES
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

    if (!this.sesClient) {
      const error = new Error('AWS SES client not initialized');
      return {
        success: false,
        error
      };
    }

    const params = {
      Source: `"UNITE Blood Bank" <${this.fromEmail}>`,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: text,
            Charset: 'UTF-8'
          },
          Html: {
            Data: html,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      const command = new SendEmailCommand(params);
      const response = await this.sesClient.send(command);
      
      console.log(`[AWS SES] Email sent to ${to}. MessageId: ${response.MessageId}`);
      
      return {
        success: true,
        messageId: response.MessageId
      };
    } catch (error) {
      console.error(`[AWS SES] Error sending email to ${to}:`, error);
      this.handleSESError(error);
      // handleSESError throws, but in case it doesn't:
      return {
        success: false,
        error
      };
    }
  }
}

module.exports = AwsSesProvider;

