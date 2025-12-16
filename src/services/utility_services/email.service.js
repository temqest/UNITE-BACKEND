const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    sgMail.setApiKey(process.env.EMAIL_PASS);

    // Note: SendGrid API doesn't require connection verification like SMTP
    console.log('SendGrid API initialized');
  }

  async sendVerificationCode(email, code) {
    const msg = {
      to: email,
      from: `"UNITE Blood Bank" <${process.env.EMAIL_USER}>`,
      subject: 'Verify Your UNITE Account - Email Verification Code',
      text: `Hello,

    Thank you for signing up with UNITE Blood Bank System.

    Your verification code is: ${code}

    Please enter this code in the signup form to complete your email verification.

    This code will expire in 24 hours.

    If you did not request this verification, please ignore this email.

    Best regards,
    UNITE Blood Bank Team
    unitehealth.tech`,
      html: `
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
</div>`
    };

    try {
      await sgMail.send(msg);
      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendEmail(email, subject, text, html) {
    const msg = {
      to: email,
      from: process.env.EMAIL_USER,
      subject,
      text,
      html
    };

    try {
      await sgMail.send(msg);
      console.log(`Email sent to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }
}

module.exports = new EmailService();