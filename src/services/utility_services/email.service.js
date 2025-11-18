const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false, // true for 465, false for 587
      auth: {
        user: 'apikey', // SendGrid SMTP username is always 'apikey'
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('SMTP connection error:', error);
      } else {
        console.log('SMTP server is ready to take messages');
      }
    });
  }

  async sendVerificationCode(email, code) {
    const mailOptions = {
      from: `"UNITE Blood Bank" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your UNITE Account - Email Verification Code',
      text: `Hello,

Thank you for signing up with UNITE Blood Bank Event Management System.

Your verification code is: ${code}

Please enter this code in the signup form to complete your email verification.

This code will expire in 24 hours.

If you did not request this verification, please ignore this email.

Note: If you don't see this email in your inbox, please check your spam/junk folder.

Best regards,
UNITE Blood Bank Team
unite-bloodbank.com`,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Email Verification</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello,</h3>
    <p>Thank you for signing up with UNITE Blood Bank Event Management System.</p>
    <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; text-align: center; border-radius: 5px;">
      <p style="font-size: 18px; font-weight: bold; margin: 0; color: #dc3545;">Your verification code is:</p>
      <p style="font-size: 32px; font-weight: bold; margin: 10px 0; color: #333; letter-spacing: 3px;">${code}</p>
    </div>
    <p>Please enter this code in the signup form to complete your email verification.</p>
    <p style="color: #666; font-size: 14px;">This code will expire in 24 hours.</p>
    <p style="color: #666; font-size: 14px;">If you did not request this verification, please ignore this email.</p>
    <p style="color: #dc3545; font-size: 14px; font-weight: bold;">Note: If you don't see this email in your inbox, please check your spam/junk folder.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unite-bloodbank.com" style="color: #dc3545;">unite-bloodbank.com</a></p>
  </div>
</div>`
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendEmail(email, subject, text, html) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text,
      html
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email}`);
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }
}

module.exports = new EmailService();