const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Store verification codes temporarily
const verificationCodes = new Map();
const passwordResetCodes = new Map();

// Create transporter with production-ready TLS settings
const createTransporter = () => {
  console.log('📧 [EMAIL] Creating email transporter...');
  console.log(`   Host: ${process.env.EMAIL_HOST}`);
  console.log(`   Port: ${process.env.EMAIL_PORT}`);
  console.log(`   User: ${process.env.EMAIL_USER}`);
  console.log(`   From: ${process.env.EMAIL_FROM}`);
  console.log(`   Has password: ${process.env.EMAIL_PASS ? 'Yes' : 'No'}`);
  
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false, // false for 587, true for 465
    family: 4, 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    debug: true, // Enable debug output
  });
  
  return transporter;
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`📧 [EMAIL] Generated code: ${code}`);
  return code;
};

// Send verification code email
const sendVerificationCode = async (email, name) => {
  console.log(`📧 [EMAIL] Starting sendVerificationCode to: ${email}`);
  console.log(`   Name: ${name}`);
  
  const code = generateVerificationCode();
  
  // Store code with expiration (15 minutes)
  verificationCodes.set(email, {
    code: code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0
  });
  console.log(`📧 [EMAIL] Code stored for ${email}, expires in 15 minutes`);
  
  // Clean up old codes after 15 minutes
  setTimeout(() => {
    verificationCodes.delete(email);
    console.log(`📧 [EMAIL] Code expired and removed for: ${email}`);
  }, 15 * 60 * 1000);

  const mailOptions = {
    from: process.env.EMAIL_FROM,
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
            <p>Thank you for signing up! Please use the verification code below to verify your email address:</p>
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
    console.log(`📧 [EMAIL] Attempting to send email via transporter...`);
    const transporter = createTransporter();
    
    // Verify SMTP connection first
    console.log(`📧 [EMAIL] Verifying SMTP connection...`);
    await transporter.verify();
    console.log(`📧 [EMAIL] SMTP connection verified successfully!`);
    
    console.log(`📧 [EMAIL] Sending mail to: ${email}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [EMAIL] Email sent successfully!`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    return { success: true, code: code };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send verification email:`);
    console.error(`   Error name: ${error.name}`);
    console.error(`   Error message: ${error.message}`);
    console.error(`   Error code: ${error.code}`);
    console.error(`   Command: ${error.command}`);
    console.error(`   Response: ${error.response}`);
    console.error(`   Full error:`, error);
    return { success: false, error: error.message };
  }
};

// Send password reset code
const sendPasswordResetCode = async (email, name) => {
  console.log(`📧 [EMAIL] Starting sendPasswordResetCode to: ${email}`);
  
  const code = generateVerificationCode();
  
  passwordResetCodes.set(email, {
    code: code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0
  });
  console.log(`📧 [EMAIL] Reset code stored for ${email}`);
  
  setTimeout(() => {
    passwordResetCodes.delete(email);
    console.log(`📧 [EMAIL] Reset code expired for: ${email}`);
  }, 15 * 60 * 1000);

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Password Reset Code - KweliRentals',
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
            <p>We received a request to reset your password. Use the code below to reset your password:</p>
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
    console.log(`📧 [EMAIL] Attempting to send password reset email...`);
    const transporter = createTransporter();
    await transporter.verify();
    console.log(`📧 [EMAIL] SMTP verified for password reset`);
    
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [EMAIL] Password reset email sent successfully!`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send password reset email:`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Code: ${error.code}`);
    return { success: false, error: error.message };
  }
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, name) => {
  console.log(`📧 [EMAIL] Starting sendWelcomeEmail to: ${email}`);
  
  const mailOptions = {
    from: process.env.EMAIL_FROM,
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
    const transporter = createTransporter();
    await transporter.verify();
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 [EMAIL] Welcome email sent successfully to ${email}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [EMAIL] Failed to send welcome email: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// Verify code
const verifyCode = (email, code) => {
  console.log(`📧 [EMAIL] Verifying code for ${email}, code: ${code}`);
  const storedData = verificationCodes.get(email);
  
  if (!storedData) {
    console.log(`❌ [EMAIL] No verification code found for ${email}`);
    return { success: false, error: "No verification code found. Please request a new code." };
  }
  
  console.log(`📧 [EMAIL] Stored code: ${storedData.code}, expires at: ${new Date(storedData.expiresAt)}`);
  
  if (Date.now() > storedData.expiresAt) {
    console.log(`❌ [EMAIL] Code expired for ${email}`);
    verificationCodes.delete(email);
    return { success: false, error: "Verification code has expired. Please request a new code." };
  }
  
  if (storedData.code !== code) {
    storedData.attempts++;
    console.log(`❌ [EMAIL] Invalid code for ${email}, attempt ${storedData.attempts}`);
    if (storedData.attempts >= 5) {
      verificationCodes.delete(email);
      return { success: false, error: "Too many failed attempts. Please request a new code." };
    }
    return { success: false, error: "Invalid verification code. Please try again." };
  }
  
  console.log(`✅ [EMAIL] Code verified successfully for ${email}`);
  verificationCodes.delete(email);
  return { success: true, codeOriginal: storedData.code };
};

// Verify password reset code
const verifyPasswordResetCode = (email, code) => {
  console.log(`📧 [EMAIL] Verifying reset code for ${email}`);
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