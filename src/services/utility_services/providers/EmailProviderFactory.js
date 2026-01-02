const AwsSesProvider = require('./AwsSesProvider');
const BrevoProvider = require('./BrevoProvider');

/**
 * Email Provider Factory
 * 
 * Selects and initializes the appropriate email provider based on EMAIL_SENDER
 * environment variable. Provides a singleton instance of the active provider.
 */
class EmailProviderFactory {
  constructor() {
    this.provider = null;
    this.providerName = null;
  }

  /**
   * Get the active email provider
   * @returns {EmailProvider} The initialized email provider instance
   */
  async getProvider() {
    if (this.provider) {
      return this.provider;
    }

    // Determine provider from environment variable
    const emailSender = (process.env.EMAIL_SENDER || '').toLowerCase().trim();

    let ProviderClass;
    let providerName;

    switch (emailSender) {
      case 'aws':
        ProviderClass = AwsSesProvider;
        providerName = 'AWS SES';
        break;
      case 'brevo':
        ProviderClass = BrevoProvider;
        providerName = 'Brevo';
        break;
      default:
        // Fallback to AWS SES if EMAIL_SENDER is missing or invalid
        if (emailSender) {
          console.warn(`[EMAIL] Invalid EMAIL_SENDER value: "${emailSender}". Falling back to AWS SES.`);
        } else {
          console.warn('[EMAIL] EMAIL_SENDER not set. Falling back to AWS SES.');
        }
        ProviderClass = AwsSesProvider;
        providerName = 'AWS SES';
    }

    // Instantiate and initialize provider
    this.provider = new ProviderClass();
    this.providerName = providerName;

    // Validate configuration
    const validation = await this.provider.validateConfig();
    if (!validation.valid) {
      console.error(`[EMAIL] Provider configuration validation failed for ${providerName}:`, validation.errors);
      console.error('[EMAIL] Email sending may fail. Please check your environment variables.');
    }

    // Initialize provider
    try {
      await this.provider.initialize();
      console.log(`[EMAIL] Active provider: ${providerName}`);
    } catch (error) {
      console.error(`[EMAIL] Failed to initialize ${providerName} provider:`, error.message);
      throw error;
    }

    return this.provider;
  }

  /**
   * Get the name of the active provider
   * @returns {string|null} Provider name or null if not initialized
   */
  getProviderName() {
    return this.providerName;
  }

  /**
   * Reset the provider (useful for testing or re-initialization)
   */
  reset() {
    this.provider = null;
    this.providerName = null;
  }
}

// Export singleton instance
const factory = new EmailProviderFactory();

module.exports = factory;

