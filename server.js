require("dotenv").config();

const app = require("./src/app");
const initTables = require("./src/migrations/initTables");
const addMessagingTables = require("./src/migrations/addMessagingTables");
const addMoverTables = require("./src/migrations/addMoverTables");
const addMoverBookingTables = require("./src/migrations/addMoverBookingTables");
const addNotificationTables = require("./src/migrations/addNotificationTables");
const { initializeWebSocket } = require("./src/services/websocket.service");
const {
  sendDueMoverBookingReminders
} = require("./src/services/notification.service");

const PORT = process.env.PORT || 3000;

function startBookingReminderJob() {
  if (process.env.ENABLE_BOOKING_REMINDER_JOB !== "true") return;

  const intervalMinutes = Number(
    process.env.BOOKING_REMINDER_JOB_INTERVAL_MINUTES || 10
  );

  const runReminderJob = async () => {
    try {
      const result = await sendDueMoverBookingReminders();
      if (result.sent > 0) {
        console.log(`Booking reminder job sent ${result.sent} reminder(s)`);
      }
    } catch (error) {
      console.error("Booking reminder job failed:", error.message);
    }
  };

  runReminderJob();

  setInterval(runReminderJob, intervalMinutes * 60 * 1000);

  console.log(
    `Booking reminder job enabled. Running every ${intervalMinutes} minute(s).`
  );
}

async function start() {
  console.log("Starting Kweli Rentals Backend...");
  console.log("Connecting to database...");

  try {
    await initTables();
    await addMessagingTables();
    await addMoverTables();
    await addMoverBookingTables();
    await addNotificationTables();

    const server = app.listen(PORT, () => {
      console.log("Server is running!");
      console.log(`Server URL: http://localhost:${PORT}`);
      console.log(`Auth API: http://localhost:${PORT}/api/auth`);
      console.log(`Properties API: http://localhost:${PORT}/api/property`);
      console.log(`Messages API: http://localhost:${PORT}/api/messages`);
      console.log(`Movers API: http://localhost:${PORT}/api/movers`);
      console.log(
        `Homefinder Movers API: http://localhost:${PORT}/api/homefinder/movers`
      );
      console.log(`Notifications API: http://localhost:${PORT}/api/notifications`);
      console.log(`WebSocket: ws://localhost:${PORT}`);
    });

    initializeWebSocket(server);
    startBookingReminderJob();
  } catch (error) {
    console.log("Failed to start server:", error.message);
    process.exit(1);
  }
}

start();