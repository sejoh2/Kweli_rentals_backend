require("dotenv").config();

const app = require("./src/app");
const initTables = require("./src/migrations/initTables");

const PORT = process.env.PORT;

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

    // Start server
   app.listen(PORT, "0.0.0.0", () => {
      console.log(`${colors.green}✅ Server is running!${colors.reset}`);
      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.blue}🌐 Server URL:${colors.reset} http://localhost:${PORT}`);
      console.log(`${colors.blue}🔐 Auth API:${colors.reset} http://localhost:${PORT}/api/auth`);
      console.log(`${colors.blue}📝 Sign Up:${colors.reset} POST http://localhost:${PORT}/api/auth/signup`);
      console.log(`${colors.blue}🔑 Sign In:${colors.reset} POST http://localhost:${PORT}/api/auth/signin`);
      console.log(`${colors.blue}👤 Get User:${colors.reset} GET http://localhost:${PORT}/api/auth/me`);
      console.log(`${colors.blue}🏠 Properties API:${colors.reset} http://localhost:${PORT}/api/property`);
      console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
      console.log(`${colors.yellow}⚡ Server ready to accept requests${colors.reset}`);
    });

  } catch (error) {
    console.log(`${colors.red}❌ Failed to start server:${colors.reset}`, error.message);
    console.log(`${colors.red}❌ Server startup aborted due to database initialization failure${colors.reset}`);
    process.exit(1);
  }
}

start();