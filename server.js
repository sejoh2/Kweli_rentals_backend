require("dotenv").config();

const app = require("./src/app");
const initTables = require("./src/migrations/initTables");
const addMessagingTables = require("./src/migrations/addMessagingTables");
const { initializeWebSocket } = require("./src/services/websocket.service");

const PORT = process.env.PORT || 3000;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

async function start() {
  console.log(`${colors.cyan}🚀 Starting Kweli Rentals Backend...${colors.reset}`);
  console.log(`${colors.yellow}⏳ Connecting to database...${colors.reset}`);

  try {
    // Initialize database tables
    await initTables();
    await addMessagingTables();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`${colors.green}✅ Server is running!${colors.reset}`);
      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.blue}🌐 Server URL:${colors.reset} http://localhost:${PORT}`);
      console.log(`${colors.blue}🔐 Auth API (Phone OTP):${colors.reset} http://localhost:${PORT}/api/auth`);
      console.log(`${colors.blue}📱 Send OTP:${colors.reset} POST http://localhost:${PORT}/api/auth/send-otp`);
      console.log(`${colors.blue}🔑 Verify OTP & Login:${colors.reset} POST http://localhost:${PORT}/api/auth/verify-otp`);
      console.log(`${colors.blue}🔄 Resend OTP:${colors.reset} POST http://localhost:${PORT}/api/auth/resend-otp`);
      console.log(`${colors.blue}👤 Get Current User:${colors.reset} GET http://localhost:${PORT}/api/auth/me`);
      console.log(`${colors.blue}🏠 Properties API:${colors.reset} http://localhost:${PORT}/api/property`);
      console.log(`${colors.blue}💬 Messages API:${colors.reset} http://localhost:${PORT}/api/messages`);
      console.log(`${colors.blue}🔌 WebSocket:${colors.reset} ws://localhost:${PORT}`);
      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.yellow}📱 Authentication: Phone Number + OTP (Africa's Talking)${colors.reset}`);
      console.log(`${colors.yellow}🔐 No passwords - Pure OTP based authentication${colors.reset}`);
      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.yellow}⚡ Server ready to accept requests${colors.reset}`);
    });

    // Initialize WebSocket with the server
    initializeWebSocket(server);

  } catch (error) {
    console.log(`${colors.red}❌ Failed to start server:${colors.reset}`, error.message);
    console.log(`${colors.red}❌ Server startup aborted due to database initialization failure${colors.reset}`);
    process.exit(1);
  }
}

start();