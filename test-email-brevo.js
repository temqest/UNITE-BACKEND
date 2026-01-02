/**
 * Test script for Brevo email sending
 * 
 * Usage: node test-email-brevo.js
 */

require('dotenv').config();
const emailService = require('./src/services/utility_services/email.service');

async function testEmailSending() {
  console.log('🧪 Testing Brevo Email Sending...\n');
  
  const recipient = 'patrickkurtv@gmail.com';
  const subject = 'Test Email from UNITE Backend - Brevo API';
  const text = `Hello,

This is a test email from the UNITE Blood Bank System backend.

The email is being sent via Brevo API to verify that the email provider is working correctly.

If you receive this email, it means:
✅ Brevo API is configured correctly
✅ Email sending is working
✅ The provider abstraction is functioning properly

Best regards,
UNITE Blood Bank Team`;

  const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Email Test</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello,</h3>
    <p>This is a <strong>test email</strong> from the UNITE Blood Bank System backend.</p>
    <p>The email is being sent via <strong>Brevo API</strong> to verify that the email provider is working correctly.</p>
    <div style="background-color: #d4edda; padding: 15px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #28a745;">
      <p style="margin: 0; font-weight: bold; color: #155724;">✅ If you receive this email, it means:</p>
      <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #155724;">
        <li>Brevo API is configured correctly</li>
        <li>Email sending is working</li>
        <li>The provider abstraction is functioning properly</li>
      </ul>
    </div>
    <p>This is an automated test email. No action is required.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;

  try {
    console.log(`📧 Sending test email to: ${recipient}`);
    console.log(`📝 Subject: ${subject}\n`);
    
    await emailService.sendEmail(recipient, subject, text, html);
    
    console.log('\n✅ Test email sent successfully!');
    console.log('📬 Please check the inbox (and spam folder) for: patrickkurtv@gmail.com');
    console.log('\n✨ Email provider is working correctly!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to send test email:');
    console.error(`   Error: ${error.message}`);
    
    if (error.name === 'DailyLimitExceeded') {
      console.error('\n💡 The daily email limit has been reached.');
    } else if (error.message.includes('API')) {
      console.error('\n💡 Please check your BREVO_EMAIL_API key in .env file');
    } else {
      console.error('\n💡 Please check your email configuration and try again.');
    }
    
    process.exit(1);
  }
}

// Run the test
testEmailSending();

