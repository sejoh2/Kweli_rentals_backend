const express = require("express");
const cors = require("cors");

const propertyRoutes = require("./routes/property.routes");
const landlordRoutes = require("./routes/landlord.routes");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/property", propertyRoutes);
app.use("/api/landlord", landlordRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

module.exports = app;