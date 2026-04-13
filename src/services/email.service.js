const nodemailer = require('nodemailer');
const crypto = require('crypto');
const dns = require('dns');

// Store verification codes temporarily (in production, use Redis or database)
const verificationCodes = new Map();
const passwordResetCodes = new Map();

// Force DNS resolution to use IPv4 only
dns.setDefaultResultOrder('ipv4first');

// Create transporter with comprehensive IPv4 configuration
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT == '465', // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // Force IPv4
  lookup: dns.lookup, // Use DNS lookup with ipv4first
  tls: {
    rejectUnauthorized: false, // Only for testing, remove in production
    ciphers: 'SSLv3'
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
  debug: true // Enable debug logging
});

// Alternative transporter using SMTP connection options
const createAlternativeTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    family: 4,
    lookup: dns.lookup,
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send verification code email
const sendVerificationCode = async (email, name) => {
  const code = generateVerificationCode();
  
  // Store code with expiration (15 minutes)
  verificationCodes.set(email, {
    code: code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    attempts: 0
  });
  
  // Clean up old codes after 15 minutes
  setTimeout(() => {
    verificationCodes.delete(email);
  }, 15 * 60 * 1000);

  const mailOptions = {
    from: `"KweliRentals" <${process.env.EMAIL_FROM}>`,
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
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, code: code };
  } catch (error) {
    console.error('Email sending failed with primary transporter:', error);
    
    // Try alternative transporter
    console.log('Attempting with alternative transporter...');
    const altTransporter = createAlternativeTransporter();
    try {
      const info = await altTransporter.sendMail(mailOptions);
      console.log('Email sent successfully with alternative transporter:', info.messageId);
      return { success: true, code: code };
    } catch (altError) {
      console.error('Both email transporters failed:', altError);
      return { success: false, error: altError.message };
    }
  }
};

// Verify code - MODIFIED to return the original code for auto-login
const verifyCode = (email, code) => {
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
  
  // Code is valid - store the original code for auto-login
  const originalCode = storedData.code;
  verificationCodes.delete(email);
  return { success: true, codeOriginal: originalCode };
};

// Send password reset code
const sendPasswordResetCode = async (email, name) => {
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
    from: `"KweliRentals" <${process.env.EMAIL_FROM}>`,
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
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent successfully:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Password reset email sending failed:', error);
    return { success: false, error: error.message };
  }
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

// Send welcome email after verification
const sendWelcomeEmail = async (email, name) => {
  const mailOptions = {
    from: `"KweliRentals" <${process.env.EMAIL_FROM}>`,
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
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Welcome email sending failed:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendVerificationCode,
  verifyCode,
  sendPasswordResetCode,
  verifyPasswordResetCode,
  sendWelcomeEmail,
};