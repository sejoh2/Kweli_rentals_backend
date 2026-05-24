const express = require("express");
const router = express.Router();
const controller = require("../controllers/property.controller");
const {
  authenticate,
  requireRole,
  requireVerifiedAccount,
  optionalAuth,
} = require("../middleware/auth");

// Public routes with optional auth, so logged-in users can see is_liked
router.get("/all", optionalAuth, controller.getAllProperties);
router.get("/trending", optionalAuth, controller.getTrendingProperties);
router.get("/search", optionalAuth, controller.searchProperties);
router.get("/owner/:ownerId", optionalAuth, controller.getPropertiesByOwnerId);
router.get("/:id", optionalAuth, controller.getPropertyById);

router.post("/:id/view", controller.incrementView);

// Protected routes
router.get("/me/properties", authenticate, controller.getMyProperties);
router.post("/:id/like", authenticate, controller.toggleLike);
router.post("/:id/inquiry", authenticate, controller.incrementInquiry);

// Protected routes for landlord/agent
router.post(
  "/create",
  authenticate,
  requireRole("landlord", "agent"),
  requireVerifiedAccount,
  controller.uploadMiddleware,
  controller.createProperty
);

router.put(
  "/:id",
  authenticate,
  requireRole("landlord", "agent"),
  controller.updateProperty
);

router.patch(
  "/:id/status",
  authenticate,
  requireRole("landlord", "agent"),
  controller.updatePropertyStatus
);

router.delete(
  "/:id",
  authenticate,
  requireRole("landlord", "agent"),
  controller.deleteProperty
);

module.exports = router;