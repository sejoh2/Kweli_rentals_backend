const { sendOTP, logOTPForSandbox } = require("../config/africastalking");

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
  console.log(`📱 Sending OTP to: ${phoneNumber}`);
  
  const otpCode = generateOTP();

  // Store OTP with expiration (10 minutes)
  otpCodes.set(phoneNumber, {
    code: otpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    name: name
  });

  // Clean up after 10 minutes
  setTimeout(() => {
    otpCodes.delete(phoneNumber);
    console.log(`🗑️ OTP expired for ${phoneNumber}`);
  }, 10 * 60 * 1000);

  // Try to send SMS
  const smsResult = await sendOTP(phoneNumber, otpCode);
  
  // If SMS fails (sandbox mode or network issue), log OTP for development
  if (!smsResult.success) {
    logOTPForSandbox(phoneNumber, otpCode);
  }
  
  return { 
    success: true, 
    message: smsResult.success ? 'OTP sent via SMS' : 'OTP logged for sandbox testing',
    sandboxMode: !smsResult.success
  };
};

// Verify OTP
const verifyOTP = (phoneNumber, code) => {
  console.log(`🔐 Verifying OTP for ${phoneNumber}`);
  const storedData = otpCodes.get(phoneNumber);

  if (!storedData) {
    return { 
      success: false, 
      error: "No verification code found. Please request a new code." 
    };
  }

  if (Date.now() > storedData.expiresAt) {
    otpCodes.delete(phoneNumber);
    return { 
      success: false, 
      error: "Verification code has expired. Please request a new code." 
    };
  }

  if (storedData.code !== code) {
    storedData.attempts++;
    if (storedData.attempts >= 5) {
      otpCodes.delete(phoneNumber);
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

  console.log(`✅ OTP verified for ${phoneNumber}`);
  // Don't delete immediately - keep for a few seconds to prevent duplicate verifications
  setTimeout(() => {
    otpCodes.delete(phoneNumber);
  }, 5000);
  
  return { success: true, name: storedData.name };
};

// Send welcome SMS (optional)
const sendWelcomeSMS = async (phoneNumber, name) => {
  const message = `Welcome to KweliRentals, ${name}! 🎉 Your phone number has been verified. You can now start browsing properties. Download our app to get started!`;
  
  try {
    const result = await sendOTP(phoneNumber, 'WELCOME');
    console.log(`✅ Welcome SMS sent to ${phoneNumber}`);
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