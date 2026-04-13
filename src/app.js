const express = require("express");
const cors = require("cors");

const propertyRoutes = require("./routes/property.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ ADD ROOT ENDPOINT HERE (before other routes)
app.get("/", (req, res) => {
  res.json({
    message: "Kweli Rentals API is running!",
    status: "healthy",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth",
      properties: "/api/property",
      health: "/health"
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/property", propertyRoutes);

module.exports = app;