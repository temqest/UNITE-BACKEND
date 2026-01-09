const { EmailDailyLimit } = require('../../models/index');
const providerFactory = require('./providers/EmailProviderFactory');

class EmailService {
  constructor() {
    this.provider = null;
    this.providerName = null;
  }

  /**
   * Get the email provider instance (lazy initialization)
   * @returns {Promise<EmailProvider>}
   */
  async getProvider() {
    if (!this.provider) {
      this.provider = await providerFactory.getProvider();
      this.providerName = providerFactory.getProviderName();
    }
    return this.provider;
  }

  /**
   * Get the daily email limit from environment variable
   * @returns {number} Daily email limit
   */
  getDailyLimit() {
    return EmailDailyLimit.getDailyLimit();
  }

  /**
   * Check if daily email limit is reached
   * @returns {Promise<{allowed: boolean, reason?: string, currentCount?: number, limit?: number}>}
   */
  async checkDailyLimit() {
    try {
      const limitDoc = await EmailDailyLimit.getOrCreateToday();
      const dailyLimit = this.getDailyLimit();
      const isReached = limitDoc.emailsSent >= dailyLimit;

      if (isReached) {
        return {
          allowed: false,
          reason: `Daily email limit reached: ${limitDoc.emailsSent}/${dailyLimit} emails sent`,
          currentCount: limitDoc.emailsSent,
          limit: dailyLimit
        };
      }

      return {
        allowed: true,
        currentCount: limitDoc.emailsSent,
        limit: dailyLimit
      };
    } catch (error) {
      const providerName = this.providerName || 'EMAIL';
      console.error(`[${providerName}] Error checking daily limit:`, error);
      // On error, allow sending (fail open)
      return {
        allowed: true,
        reason: 'Error checking limit, allowing send'
      };
    }
  }

  /**
   * Send email via active provider
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject
   * @param {string} text - Plain text content
   * @param {string} html - HTML content
   * @returns {Promise<void>}
   */
  async sendEmail(to, subject, text, html) {
    // Check daily limit before sending
    const limitCheck = await this.checkDailyLimit();
    if (!limitCheck.allowed) {
      const error = new Error(limitCheck.reason);
      error.name = 'DailyLimitExceeded';
      throw error;
    }

    // Get provider instance (this will set providerName)
    const provider = await this.getProvider();
    const providerName = this.providerName || provider.getProviderName() || 'EMAIL';

    // Send email via provider
    const result = await provider.sendEmail(to, subject, text, html);

    if (!result.success) {
      if (result.error) {
        throw result.error;
      }
      throw new Error('Failed to send email');
    }

    // Increment email count after successful send
    await EmailDailyLimit.incrementCount();
  }

  /**
   * Send verification code email
   * @param {string} email - Recipient email address
   * @param {string} code - Verification code
   * @returns {Promise<void>}
   */
  async sendVerificationCode(email, code) {
    const subject = 'Verify Your UNITE Account - Email Verification Code';
    const text = `Hello,

Thank you for signing up with UNITE Blood Bank System.

Your verification code is: ${code}

Please enter this code in the signup form to complete your email verification.

This code will expire in 24 hours.

If you did not request this verification, please ignore this email.

Best regards,
UNITE Blood Bank Team
unitehealth.tech`;

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Email Verification</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello,</h3>
    <p>Thank you for signing up with UNITE Blood Bank System.</p>
    <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; text-align: center; border-radius: 5px;">
      <p style="font-size: 18px; font-weight: bold; margin: 0; color: #dc3545;">Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; margin: 10px 0; color: #333; letter-spacing: 3px;">${code}</p>
    </div>
    <p>Please enter this code in the signup form to complete your email verification.</p>
    <p style="color: #666; font-size: 14px;">This code will expire in 24 hours.</p>
    <p style="color: #666; font-size: 14px;">If you did not request this verification, please ignore this email.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;

    try {
      await this.sendEmail(email, subject, text, html);
      // Provider name is set after sendEmail calls getProvider()
      const providerName = this.providerName || providerFactory.getProviderName() || 'EMAIL';
      console.log(`[${providerName}] Verification email sent to ${email}`);
    } catch (error) {
      const providerName = this.providerName || providerFactory.getProviderName() || 'EMAIL';
      if (error.name === 'DailyLimitExceeded') {
        console.error(`[${providerName}] Failed to send verification email to ${email}: ${error.message}`);
      }
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Send password activation email
   * @param {string} email - Recipient email address
   * @param {string} activationLink - Account activation link
   * @param {string} userName - User's name
   * @returns {Promise<void>}
   */
  async sendPasswordActivationEmail(email, activationLink, userName) {
    const subject = 'Activate Your UNITE Account - Set Your Password';
    const text = `Hello ${userName},

Your signup request for the UNITE Blood Bank System has been approved!

To activate your account, please click the link below to set your password:

${activationLink}

This link will expire in 24 hours.

If you did not request this account, please ignore this email.

Best regards,
UNITE Blood Bank Team
unitehealth.tech`;

    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Account Activation</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello ${userName},</h3>
    <p style="color: #28a745; font-weight: bold;">Your signup request for the UNITE Blood Bank System has been approved!</p>
    <p>To activate your account, please click the link below to set your password:</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${activationLink}" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Activate Account & Set Password</a>
    </div>
    <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
    <p style="color: #666; font-size: 14px;">If you did not request this account, please ignore this email.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;

    try {
      await this.sendEmail(email, subject, text, html);
      // Provider name is set after sendEmail calls getProvider()
      const providerName = this.providerName || providerFactory.getProviderName() || 'EMAIL';
      console.log(`[${providerName}] Password activation email sent to ${email}`);
    } catch (error) {
      const providerName = this.providerName || providerFactory.getProviderName() || 'EMAIL';
      if (error.name === 'DailyLimitExceeded') {
        console.error(`[${providerName}] Failed to send password activation email to ${email}: ${error.message}`);
      }
      throw new Error('Failed to send password activation email');
    }
  }
}

module.exports = new EmailService();
