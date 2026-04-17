const nodemailer = require('nodemailer');

// Store verification codes temporarily
const verificationCodes = new Map();
const passwordResetCodes = new Map();

// Try multiple ports for Gmail SMTP
const getGmailTransporter = (port) => {
  const isSecure = port === 465;
  
  console.log(`📧 [EMAIL] Trying Gmail on port ${port} (SSL: ${isSecure})...`);
  
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: port,
    secure: isSecure, // true for 465, false for 587
    family: 4, // Force IPv4
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });
};

// Create transporter with fallback ports
const createTransporter = async () => {
  // Try SendGrid first if available
  if (process.env.SENDGRID_API_KEY) {
    console.log('📧 [EMAIL] Creating SendGrid transporter...');
    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY,
      },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
    });
    
    try {
      await transporter.verify();
      console.log('✅ [EMAIL] SendGrid connection successful');
      return transporter;
    } catch (error) {
      console.log('⚠️ [EMAIL] SendGrid failed, trying Gmail...');
    }
  }

  // Try Gmail on different ports
  const ports = [465, 587, 25];
  
  for (const port of ports) {
    try {
      const transporter = getGmailTransporter(port);
      await transporter.verify();
      console.log(`✅ [EMAIL] Gmail connection successful on port ${port}`);
      return transporter;
    } catch (error) {
      console.log(`❌ [EMAIL] Port ${port} failed: ${error.message}`);
    }
  }
  
  throw new Error('All email ports failed. Please check your network or use Brevo API.');
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`📧 [EMAIL] Generated code: ${code}`);
  return code;
};

// Send verification code email
const sendVerificationCode = async (email, name) => {
  console.log(`📧 [EMAIL] Sending verification code to: ${email}`);
  
  const code = generateVerificationCode();

  // Store code with expiration (15 minutes)
  verificationCodes.set(email, {
    code: code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0
  });

  // Clean up after 15 minutes
  setTimeout(() => {
    verificationCodes.delete(email);
  }, 15 * 60 * 1000);

  const mailOptions = {
    from: process.env.EMAIL_FROM || `KweliRentals <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email - KweliRentals',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ff6b35; }
          .content { padding: 20px 0; text-align: center; }
          .code { font-size: 32px; font-weight: bold; color: #ff6b35; letter-spacing: 5px; margin: 20px 0; }
          .footer { text-align: center; padding-top: 20px; font-size: 12px; color: #777; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ff6b35;">KweliRentals</h1>
          </div>
          <div class="content">
            <h2>Welcome to KweliRentals, ${name}! 👋</h2>
            <p>Your verification code is:</p>
            <div class="code">${code}</div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 KweliRentals. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const transporter = await createTransporter();
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Verification code sent to ${email}`);
    console.log(`   Message ID: ${info.messageId}`);
    return { success: true, code: code };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send to ${email}:`, error.message);
    console.error(`   ⚠️  Please check your internet connection or firewall settings`);
    console.error(`   💡 Tip: Try using your phone's hotspot to bypass network restrictions`);
    return { success: false, error: error.message, devCode: code };
  }
};

// Send password reset code
const sendPasswordResetCode = async (email, name) => {
  console.log(`📧 [EMAIL] Sending password reset code to: ${email}`);

  const code = generateVerificationCode();

  passwordResetCodes.set(email, {
    code: code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0
  });

  setTimeout(() => {
    passwordResetCodes.delete(email);
  }, 15 * 60 * 1000);

  const mailOptions = {
    from: process.env.EMAIL_FROM || `KweliRentals <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Password - KweliRentals',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ff6b35; }
          .content { padding: 20px 0; text-align: center; }
          .code { font-size: 32px; font-weight: bold; color: #ff6b35; letter-spacing: 5px; margin: 20px 0; }
          .footer { text-align: center; padding-top: 20px; font-size: 12px; color: #777; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ff6b35;">KweliRentals</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hello ${name},</p>
            <p>Your password reset code is:</p>
            <div class="code">${code}</div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 KweliRentals. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Password reset code sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send password reset:`, error.message);
    return { success: false, error: error.message, devCode: code };
  }
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, name) => {
  console.log(`📧 [EMAIL] Sending welcome email to: ${email}`);

  const mailOptions = {
    from: process.env.EMAIL_FROM || `KweliRentals <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Welcome to KweliRentals! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; }
          .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ff6b35; }
          .content { padding: 20px 0; }
          .footer { text-align: center; padding-top: 20px; font-size: 12px; color: #777; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #ff6b35;">Welcome to KweliRentals!</h1>
          </div>
          <div class="content">
            <h2>Email Verified Successfully! ✅</h2>
            <p>Hello ${name},</p>
            <p>Your email has been successfully verified. You can now:</p>
            <ul>
              <li>Browse thousands of properties</li>
              <li>Save your favorite listings</li>
              <li>Contact landlords directly</li>
              <li>List your properties (if you're a landlord)</li>
            </ul>
            <p>Get started by logging into your account!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 KweliRentals. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Welcome email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send welcome email:`, error.message);
    return { success: false, error: error.message };
  }
};

// Verify code
const verifyCode = (email, code) => {
  console.log(`📧 [EMAIL] Verifying code for ${email}`);
  const storedData = verificationCodes.get(email);

  if (!storedData) {
    return { success: false, error: "No verification code found. Please request a new code." };
  }

  if (Date.now() > storedData.expiresAt) {
    verificationCodes.delete(email);
    return { success: false, error: "Verification code has expired. Please request a new code." };
  }

  if (storedData.code !== code) {
    storedData.attempts++;
    if (storedData.attempts >= 5) {
      verificationCodes.delete(email);
      return { success: false, error: "Too many failed attempts. Please request a new code." };
    }
    return { success: false, error: "Invalid verification code. Please try again." };
  }

  console.log(`✅ [EMAIL] Code verified for ${email}`);
  verificationCodes.delete(email);
  return { success: true, codeOriginal: storedData.code };
};

// Verify password reset code
const verifyPasswordResetCode = (email, code) => {
  const storedData = passwordResetCodes.get(email);

  if (!storedData) {
    return { success: false, error: "No reset code found. Please request a new code." };
  }

  if (Date.now() > storedData.expiresAt) {
    passwordResetCodes.delete(email);
    return { success: false, error: "Reset code has expired. Please request a new code." };
  }

  if (storedData.code !== code) {
    storedData.attempts++;
    if (storedData.attempts >= 5) {
      passwordResetCodes.delete(email);
      return { success: false, error: "Too many failed attempts. Please request a new code." };
    }
    return { success: false, error: "Invalid reset code. Please try again." };
  }

  passwordResetCodes.delete(email);
  return { success: true };
};

module.exports = {
  sendVerificationCode,
  sendPasswordResetCode,
  sendWelcomeEmail,
  verifyCode,
  verifyPasswordResetCode,
};