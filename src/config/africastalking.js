const africastalking = require('africastalking');

// Initialize Africa's Talking
const initAfricaSTalking = () => {
  const apiKey = process.env.AFRICASTALKING_API_KEY;
  const username = process.env.AFRICASTALKING_USERNAME || 'sandbox';

  if (!apiKey) {
    console.error('❌ AFRICASTALKING_API_KEY not found in environment variables!');
    console.error('Please add AFRICASTALKING_API_KEY to your .env file');
    console.error('Get your API key from: https://account.africastalking.com/apps/sandbox/settings');
  }

  // Determine if we're in sandbox mode based on username
  const isSandbox = username === 'sandbox';
  
  // The SDK automatically uses the correct API endpoint based on username
  // - username = 'sandbox' → uses https://api.sandbox.africastalking.com
  // - username = anything else → uses https://api.africastalking.com
  const apiEndpoint = isSandbox 
    ? 'https://api.sandbox.africastalking.com' 
    : 'https://api.africastalking.com';

  console.log(`📱 Initializing Africa's Talking:`);
  console.log(`   Username: ${username}`);
  console.log(`   Mode: ${isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
  console.log(`   API Endpoint: ${apiEndpoint}`);
  console.log(`   API Key: ${apiKey ? '✅ Present' : '❌ Missing'}`);

  // Initialize SDK - ONLY apiKey and username are allowed
  const credentials = {
    apiKey: apiKey,
    username: username
  };

  const AfricasTalking = africastalking(credentials);
  
  return {
    sms: AfricasTalking.SMS,
    airtime: AfricasTalking.AIRTIME,
    payment: AfricasTalking.PAYMENT,
    isSandbox: isSandbox
  };
};

const at = initAfricaSTalking();

// Send OTP via SMS
const sendOTP = async (phoneNumber, otpCode) => {
  // Format phone number to international format
  let formattedNumber = phoneNumber;
  if (!phoneNumber.startsWith('+')) {
    if (phoneNumber.startsWith('0')) {
      formattedNumber = '+254' + phoneNumber.substring(1);
    } else {
      formattedNumber = '+' + phoneNumber;
    }
  }

  const message = `Your KweliRentals verification code is: ${otpCode}. This code will expire in 10 minutes.`;

  try {
    const smsOptions = {
      to: formattedNumber,
      message: message,
    };
    
    // Only add 'from' if it's a non-empty string AND we're in production
    if (!at.isSandbox && process.env.AFRICASTALKING_SHORTCODE && process.env.AFRICASTALKING_SHORTCODE.trim() !== '') {
      smsOptions.from = process.env.AFRICASTALKING_SHORTCODE;
      console.log(`📱 Using sender ID: ${process.env.AFRICASTALKING_SHORTCODE}`);
    } else if (at.isSandbox) {
      console.log(`📱 Sandbox mode - OTP will be logged to console`);
    } else {
      console.log(`📱 No sender ID configured - using default`);
    }
    
    console.log(`📤 Sending SMS to: ${formattedNumber}`);
    const result = await at.sms.send(smsOptions);
    
    const messageId = result.SMSMessageData?.Recipients?.[0]?.messageId;
    const status = result.SMSMessageData?.Recipients?.[0]?.status;
    const cost = result.SMSMessageData?.Recipients?.[0]?.cost;
    
    console.log(`✅ SMS sent to ${formattedNumber}`);
    console.log(`   Message ID: ${messageId || 'N/A'}`);
    console.log(`   Status: ${status || 'N/A'}`);
    if (cost) console.log(`   Cost: ${cost}`);
    
    return { 
      success: true, 
      messageId: messageId,
      recipient: formattedNumber,
      status: status
    };
  } catch (error) {
    console.error(`❌ SMS failed to ${formattedNumber}:`, error.message);
    if (error.response) {
      console.error(`   Response status: ${error.response.status}`);
      console.error(`   Response data:`, error.response.data);
    }
    return { success: false, error: error.message };
  }
};

// For sandbox testing: Log OTP to console (useful when real SMS isn't working)
const logOTPForSandbox = (phoneNumber, otpCode) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📱 SANDBOX MODE - OTP for ${phoneNumber}: ${otpCode}`);
  console.log(`💡 In production, this would be sent via SMS`);
  console.log(`${'='.repeat(60)}\n`);
};

module.exports = { at, sendOTP, logOTPForSandbox };