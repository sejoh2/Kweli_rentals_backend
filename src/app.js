const express = require("express");
const cors = require("cors");

const propertyRoutes = require("./routes/property.routes");
const authRoutes = require("./routes/auth.routes");
const messageRoutes = require("./routes/message.routes");
const moverRoutes = require("./routes/mover.routes");
const homefinderMoverRoutes = require("./routes/homefinderMover.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/property", propertyRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/movers", moverRoutes);
app.use("/api/homefinder", homefinderMoverRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send("Kweli Rentals Backend is running");
});

module.exports = app;