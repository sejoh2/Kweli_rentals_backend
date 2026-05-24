const africastalking = require("africastalking");

const initAfricaSTalking = () => {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME || "sandbox";

  if (!apiKey) {
    console.error("AFRICASTALKING_API_KEY not found in environment variables.");
    console.error("Please add AFRICASTALKING_API_KEY to your .env file.");
  }

  const isSandbox = username === "sandbox";

  const apiEndpoint = isSandbox
    ? "https://api.sandbox.africastalking.com"
    : "https://api.africastalking.com";

  console.log("Initializing Africa's Talking:");
  console.log(`   Username: ${username}`);
  console.log(`   Mode: ${isSandbox ? "SANDBOX" : "PRODUCTION"}`);
  console.log(`   API Endpoint: ${apiEndpoint}`);
  console.log(`   API Key: ${apiKey ? "Present" : "Missing"}`);

  const credentials = {
    apiKey,
    username,
  };

  const AfricasTalking = africastalking(credentials);

  return {
    sms: AfricasTalking.SMS,
    airtime: AfricasTalking.AIRTIME,
    payment: AfricasTalking.PAYMENT,
    isSandbox,
  };
};

const at = initAfricaSTalking();

const normalizePhoneNumber = (phoneNumber) => {
  let formattedNumber = phoneNumber;

  if (!formattedNumber.startsWith("+")) {
    if (formattedNumber.startsWith("0")) {
      formattedNumber = "+254" + formattedNumber.substring(1);
    } else {
      formattedNumber = "+" + formattedNumber;
    }
  }

  return formattedNumber;
};

const sendOTP = async (phoneNumber, otpCode) => {
  const formattedNumber = normalizePhoneNumber(phoneNumber);

  const message = `Your KweliRentals verification code is: ${otpCode}. This code will expire in 10 minutes.`;

  try {
    const smsOptions = {
      to: formattedNumber,
      message,
    };

    if (
      !at.isSandbox &&
      process.env.AFRICASTALKING_SHORTCODE &&
      process.env.AFRICASTALKING_SHORTCODE.trim() !== ""
    ) {
      smsOptions.from = process.env.AFRICASTALKING_SHORTCODE.trim();
      console.log(`Using sender ID: ${smsOptions.from}`);
    } else if (at.isSandbox) {
      console.log("Sandbox mode - OTP will be logged to console");
    } else {
      console.log("No sender ID configured - using default");
    }

    console.log(`Sending SMS to: ${formattedNumber}`);

    const result = await at.sms.send(smsOptions);
    const recipient = result.SMSMessageData?.Recipients?.[0];

    const messageId = recipient?.messageId || null;
    const status = recipient?.status || null;
    const statusCode = recipient?.statusCode || null;
    const cost = recipient?.cost || null;

    console.log(`SMS response for ${formattedNumber}`);
    console.log(`   Message ID: ${messageId || "N/A"}`);
    console.log(`   Status: ${status || "N/A"}`);
    console.log(`   Status Code: ${statusCode || "N/A"}`);
    console.log(`   Cost: ${cost || "N/A"}`);

    const successfulStatuses = ["Success", "Sent", "Submitted"];
    const wasAccepted = successfulStatuses.includes(status);

    if (!wasAccepted) {
      let friendlyError = `SMS was not delivered. Status: ${
        status || "Unknown"
      }`;

      if (status === "UserInBlacklist") {
        friendlyError =
          "This number has blocked or opted out of receiving these messages. During testing, use the KweliRentals test OTP if enabled.";
      }

      return {
        success: false,
        error: friendlyError,
        status,
        statusCode,
        messageId,
        cost,
        recipient: formattedNumber,
      };
    }

    return {
      success: true,
      messageId,
      recipient: formattedNumber,
      status,
      statusCode,
      cost,
    };
  } catch (error) {
    console.error(`SMS failed to ${formattedNumber}:`, error.message);

    if (error.response) {
      console.error(`   Response status: ${error.response.status}`);
      console.error("   Response data:", error.response.data);
    }

    return {
      success: false,
      error: error.message,
      recipient: formattedNumber,
    };
  }
};

const logOTPForSandbox = (phoneNumber, otpCode) => {
  console.log("");
  console.log("============================================================");
  console.log(`SANDBOX/DEV OTP for ${phoneNumber}: ${otpCode}`);
  console.log("============================================================");
  console.log("");
};

module.exports = {
  at,
  sendOTP,
  logOTPForSandbox,
};