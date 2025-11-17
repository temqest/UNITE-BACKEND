const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async sendVerificationCode(email, code) {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'UNITE - Verify Your Email',
      text: `Your verification code is: ${code}\n\nPlease enter this code in the signup form to verify your email.\n\nThis code will expire in 24 hours.`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>Please enter this code in the signup form to verify your email.</p><p>This code will expire in 24 hours.</p>`
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