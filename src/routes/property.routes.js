const express = require("express");
const router = express.Router();
const controller = require("../controllers/property.controller");
const { authenticate, requireRole } = require("../middleware/auth");

// Public routes (anyone can view)
router.get("/all", controller.getAllProperties);
router.get("/search", controller.searchProperties);
router.get("/:id", controller.getPropertyById);
router.get("/owner/:ownerId", controller.getPropertiesByOwnerId);
router.post("/:id/like", controller.toggleLike);

// Protected routes (require authentication)
router.get("/me/properties", authenticate, controller.getMyProperties);

// Protected routes (require landlord or agent role)
router.post(
  "/create",
  authenticate,
  requireRole('landlord', 'agent'),
  controller.uploadMiddleware,
  controller.createProperty
);

router.put(
  "/:id",
  authenticate,
  requireRole('landlord', 'agent'),
  controller.updateProperty
);

router.patch(
  "/:id/status",
  authenticate,
  requireRole('landlord', 'agent'),
  controller.updatePropertyStatus
);

router.delete(
  "/:id",
  authenticate,
  requireRole('landlord', 'agent'),
  controller.deleteProperty
);

module.exports = router;