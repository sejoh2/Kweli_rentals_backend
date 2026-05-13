const { sendOTP, logOTPForSandbox } = require("../config/africastalking");

// Helper function to normalize phone numbers to E.164 format
const normalizePhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters except '+'
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // If it starts with '0', replace with '+254' (Kenya)
  if (cleaned.startsWith('0')) {
    cleaned = '+254' + cleaned.substring(1);
  }
  // If it doesn't start with '+' and doesn't start with '0', add '+'
  else if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
};

// Store OTP codes temporarily (in production, use Redis)
const otpCodes = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`🔐 Generated OTP: ${code}`);
  return code;
};

// Send OTP via SMS (or log in sandbox mode)
const sendVerificationOTP = async (phoneNumber, name = 'User') => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  console.log(`📱 Sending OTP to: ${normalizedPhone}`);
  
  const otpCode = generateOTP();

  // Store OTP with expiration (10 minutes) using normalized phone number
  otpCodes.set(normalizedPhone, {
    code: otpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    name: name
  });

  // Clean up after 10 minutes
  setTimeout(() => {
    otpCodes.delete(normalizedPhone);
    console.log(`🗑️ OTP expired for ${normalizedPhone}`);
  }, 10 * 60 * 1000);

  // Try to send SMS using normalized phone number
  const smsResult = await sendOTP(normalizedPhone, otpCode);
  
  // If SMS fails (sandbox mode or network issue), log OTP for development
  if (!smsResult.success) {
    logOTPForSandbox(normalizedPhone, otpCode);
  }
  
  return { 
    success: true, 
    message: smsResult.success ? 'OTP sent via SMS' : 'OTP logged for sandbox testing',
    sandboxMode: !smsResult.success,
    normalizedPhone: normalizedPhone
  };
};

// Verify OTP
const verifyOTP = (phoneNumber, code) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  console.log(`🔐 Verifying OTP for ${normalizedPhone}`);
  const storedData = otpCodes.get(normalizedPhone);

  if (!storedData) {
    return { 
      success: false, 
      error: "No verification code found. Please request a new code." 
    };
  }

  if (Date.now() > storedData.expiresAt) {
    otpCodes.delete(normalizedPhone);
    return { 
      success: false, 
      error: "Verification code has expired. Please request a new code." 
    };
  }

  if (storedData.code !== code) {
    storedData.attempts++;
    if (storedData.attempts >= 5) {
      otpCodes.delete(normalizedPhone);
      return { 
        success: false, 
        error: "Too many failed attempts. Please request a new code." 
      };
    }
    return { 
      success: false, 
      error: "Invalid verification code. Please try again." 
    };
  }

  console.log(`✅ OTP verified for ${normalizedPhone}`);
  // Don't delete immediately - keep for a few seconds to prevent duplicate verifications
  setTimeout(() => {
    otpCodes.delete(normalizedPhone);
  }, 5000);
  
  return { success: true, name: storedData.name };
};

// Send welcome SMS (optional)
const sendWelcomeSMS = async (phoneNumber, name) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  const message = `Welcome to KweliRentals, ${name}! 🎉 Your phone number has been verified. You can now start browsing properties. Download our app to get started!`;
  
  try {
    const result = await sendOTP(normalizedPhone, 'WELCOME');
    console.log(`✅ Welcome SMS sent to ${normalizedPhone}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send welcome SMS:`, error.message);
    return { success: false };
  }
};

module.exports = {
  sendVerificationOTP,
  verifyOTP,
  sendWelcomeSMS
};