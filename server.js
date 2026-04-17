require("dotenv").config();

const app = require("./src/app");
const initTables = require("./src/migrations/initTables");

const PORT = process.env.PORT || 3000;

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

  try {
    console.log(`${colors.yellow}⏳ Initializing database...${colors.reset}`);

    // IMPORTANT: wrap this so it doesn't crash silently
    try {
      await initTables();
      console.log(`${colors.green}✅ Database initialized${colors.reset}`);
    } catch (dbErr) {
      console.log(`${colors.red}❌ DB init failed but server will still start:${colors.reset}`, dbErr.message);
    }

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`${colors.green}✅ Server running on port ${PORT}${colors.reset}`);
    });

    // optional but important for Railway stability
    server.on("error", (err) => {
      console.log(`${colors.red}❌ Server error:${colors.reset}`, err.message);
    });

  } catch (error) {
    console.log(`${colors.red}❌ Fatal startup error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

start();