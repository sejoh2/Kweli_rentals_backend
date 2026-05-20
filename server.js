require("dotenv").config();

const app = require("./src/app");
const initTables = require("./src/migrations/initTables");
const addMessagingTables = require("./src/migrations/addMessagingTables");
const addMoverTables = require("./src/migrations/addMoverTables");
const addMoverBookingTables = require("./src/migrations/addMoverBookingTables");
const { initializeWebSocket } = require("./src/services/websocket.service");

const PORT = process.env.PORT || 3000;

async function start() {
  console.log("Starting Kweli Rentals Backend...");
  console.log("Connecting to database...");

  try {
    await initTables();
    await addMessagingTables();
    await addMoverTables();
    await addMoverBookingTables();

    const server = app.listen(PORT, () => {
      console.log("Server is running!");
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(`Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`Properties API: http://localhost:${PORT}/api/property`);
      console.log(`Messages API: http://localhost:${PORT}/api/messages`);
      console.log(`Movers API: http://localhost:${PORT}/api/movers`);
      console.log(`Homefinder Movers API: http://localhost:${PORT}/api/homefinder/movers`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
    });

    initializeWebSocket(server);
  } catch (error) {
    console.log("Failed to start server:", error.message);
    process.exit(1);
  }
}

start();