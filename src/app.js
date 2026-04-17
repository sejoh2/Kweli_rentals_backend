const express = require("express");
const cors = require("cors");

const propertyRoutes = require("./routes/property.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/property", propertyRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running"
  });
});

app.get("/", (req, res) => {
  res.send("🚀 Kweli Rentals Backend is running");
});

module.exports = app;