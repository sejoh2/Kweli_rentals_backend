require("dotenv").config();

const {
  sendDueMoverBookingReminders
} = require("../services/notification.service");

async function run() {
  console.log("Running mover booking reminder job...");
  console.log(`Time: ${new Date().toISOString()}`);

  try {
    const result = await sendDueMoverBookingReminders();

    console.log(
      `Reminder job completed. Checked: ${result.checked}, Sent: ${result.sent}`
    );

    process.exit(0);
  } catch (error) {
    console.error("Reminder job failed:", error);
    process.exit(1);
  }
}

run();