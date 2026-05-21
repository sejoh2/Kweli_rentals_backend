const express = require("express");
const notificationController = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/device-token",
  authenticate,
  notificationController.registerDeviceToken
);

router.delete(
  "/device-token",
  authenticate,
  notificationController.removeDeviceToken
);

module.exports = router;