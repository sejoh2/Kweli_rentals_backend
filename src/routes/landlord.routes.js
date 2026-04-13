// const express = require("express");
// const router = express.Router();
// const controller = require("../controllers/landlord.controller");
// const { authenticate, requireRole } = require("../middleware/auth");

// // Protected routes - only landlords can access these
// router.post(
//   "/profile",
//   authenticate,
//   requireRole('landlord'),
//   controller.uploadMiddleware,
//   controller.createOrUpdateLandlord
// );

// router.get("/profile/:uid", authenticate, controller.getLandlord);

// router.patch(
//   "/profile/:uid",
//   authenticate,
//   requireRole('landlord'),
//   controller.updateLandlord
// );

// module.exports = router;