const { sendOTP, logOTPForSandbox } = require("../config/africastalking");

const DEFAULT_TEST_OTP_ALLOWED_FAILURE_STATUSES = ["UserInBlacklist"];

// Helper function to normalize phone numbers to E.164 format
const normalizePhoneNumber = (phoneNumber) => {
  let cleaned = phoneNumber.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "+254" + cleaned.substring(1);
  } else if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
};

// Store OTP codes temporarily. In production, Redis would be better.
const otpCodes = new Map();

const isTestOTPEnabled = () => {
  return process.env.ENABLE_TEST_OTP === "true";
};

const getTestOTPCode = () => {
  return process.env.TEST_OTP_CODE || "";
};

const getAllowedTestOTPFailureStatuses = () => {
  const rawStatuses = process.env.TEST_OTP_ALLOWED_FAILURE_STATUSES;

  if (!rawStatuses || rawStatuses.trim() === "") {
    return DEFAULT_TEST_OTP_ALLOWED_FAILURE_STATUSES;
  }

  return rawStatuses
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
};

const canUseTestOTPForStatus = (status) => {
  if (!isTestOTPEnabled() || !status) return false;

  return getAllowedTestOTPFailureStatuses().includes(status);
};

// Generate 6-digit OTP
const generateOTP = () => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`Generated OTP: ${code}`);
  return code;
};

// Send OTP via SMS
const sendVerificationOTP = async (phoneNumber, name = "User") => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  console.log(`Sending OTP to: ${normalizedPhone}`);

  const otpCode = generateOTP();

  otpCodes.set(normalizedPhone, {
    code: otpCode,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    name,
    testOtpAllowed: false,
    smsStatus: null,
    smsError: null,
  });

  setTimeout(() => {
    otpCodes.delete(normalizedPhone);
    console.log(`OTP expired for ${normalizedPhone}`);
  }, 10 * 60 * 1000);

  const smsResult = await sendOTP(normalizedPhone, otpCode);

  if (!smsResult.success) {
    const storedData = otpCodes.get(normalizedPhone);
    const testOtpAllowed = canUseTestOTPForStatus(smsResult.status);

    if (storedData) {
      storedData.testOtpAllowed = testOtpAllowed;
      storedData.smsStatus = smsResult.status || null;
      storedData.smsError = smsResult.error || null;
    }

    if (testOtpAllowed) {
      console.log(
        `Test OTP enabled for ${normalizedPhone} because SMS status was ${smsResult.status}`
      );

      return {
        success: true,
        message:
          "SMS delivery is blocked for this number during testing. Use the test verification code provided by the KweliRentals team.",
        sandboxMode: false,
        testOtpAllowed: true,
        normalizedPhone,
        smsStatus: smsResult.status,
        smsError: smsResult.error,
      };
    }

    if (process.env.NODE_ENV !== "production") {
      logOTPForSandbox(normalizedPhone, otpCode);

      return {
        success: true,
        message: "OTP logged for development testing",
        sandboxMode: true,
        testOtpAllowed: false,
        normalizedPhone,
        smsStatus: smsResult.status,
        smsError: smsResult.error,
      };
    }

    otpCodes.delete(normalizedPhone);

    return {
      success: false,
      message: smsResult.error || "Failed to send OTP",
      sandboxMode: false,
      testOtpAllowed: false,
      normalizedPhone,
      smsStatus: smsResult.status,
      smsError: smsResult.error,
    };
  }

  return {
    success: true,
    message: "OTP sent via SMS",
    sandboxMode: false,
    testOtpAllowed: false,
    normalizedPhone,
    smsStatus: smsResult.status,
  };
};

// Verify OTP
const verifyOTP = (phoneNumber, code) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  console.log(`Verifying OTP for ${normalizedPhone}`);

  const storedData = otpCodes.get(normalizedPhone);

  if (!storedData) {
    return {
      success: false,
      error: "No verification code found. Please request a new code.",
    };
  }

  if (Date.now() > storedData.expiresAt) {
    otpCodes.delete(normalizedPhone);
    return {
      success: false,
      error: "Verification code has expired. Please request a new code.",
    };
  }

  const testOtpCode = getTestOTPCode();

  const isValidRealOTP = storedData.code === code;
  const isValidTestOTP =
    storedData.testOtpAllowed &&
    isTestOTPEnabled() &&
    testOtpCode.trim() !== "" &&
    code === testOtpCode;

  if (!isValidRealOTP && !isValidTestOTP) {
    storedData.attempts++;

    if (storedData.attempts >= 5) {
      otpCodes.delete(normalizedPhone);
      return {
        success: false,
        error: "Too many failed attempts. Please request a new code.",
      };
    }

    return {
      success: false,
      error: "Invalid verification code. Please try again.",
    };
  }

  if (isValidTestOTP) {
    console.log(`Test OTP verified for ${normalizedPhone}`);
  } else {
    console.log(`OTP verified for ${normalizedPhone}`);
  }

  setTimeout(() => {
    otpCodes.delete(normalizedPhone);
  }, 5000);

  return {
    success: true,
    name: storedData.name,
    usedTestOtp: isValidTestOTP,
  };
};

// Send welcome SMS optional
const sendWelcomeSMS = async (phoneNumber, name) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  try {
    await sendOTP(normalizedPhone, "WELCOME");
    console.log(`Welcome SMS sent to ${normalizedPhone}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to send welcome SMS:", error.message);
    return { success: false };
  }
};

module.exports = {
  sendVerificationOTP,
  verifyOTP,
  sendWelcomeSMS,
  normalizePhoneNumber,
};