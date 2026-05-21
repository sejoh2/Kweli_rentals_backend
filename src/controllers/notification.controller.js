const notificationService = require("../services/notification.service");

const registerDeviceToken = async (req, res) => {
  try {
    const { token, platform, deviceId, device_id } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Notification token is required" });
    }

    const savedToken = await notificationService.saveDeviceToken({
      userId: req.user.user_id,
      token,
      platform: platform || "android",
      deviceId: deviceId || device_id || null
    });

    res.json({
      success: true,
      token: savedToken
    });
  } catch (error) {
    console.error("Error registering notification token:", error);
    res.status(500).json({ error: error.message });
  }
};

const removeDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Notification token is required" });
    }

    await notificationService.removeDeviceToken({
      userId: req.user.user_id,
      token
    });

    res.json({
      success: true,
      message: "Notification token removed"
    });
  } catch (error) {
    console.error("Error removing notification token:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  registerDeviceToken,
  removeDeviceToken
};