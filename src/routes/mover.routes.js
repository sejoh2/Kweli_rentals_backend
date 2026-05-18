const express = require("express");
const multer = require("multer");
const moverController = require("../controllers/mover.controller");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const moverUploadFields = upload.fields([
  { name: "business_logo", maxCount: 1 },
  { name: "insurance_policy", maxCount: 1 },
  { name: "owner_id_document", maxCount: 1 }
]);

// Mover routes
router.get(
  "/me",
  authenticate,
  requireRole("movers"),
  moverController.getMyMoverProfile
);

router.post(
  "/register",
  authenticate,
  requireRole("movers"),
  moverUploadFields,
  moverController.registerMover
);

router.put(
  "/company-details",
  authenticate,
  requireRole("movers"),
  moverController.updateCompanyDetails
);

router.put(
  "/service-areas",
  authenticate,
  requireRole("movers"),
  moverController.updateServiceAreas
);

router.put(
  "/fleet-pricing",
  authenticate,
  requireRole("movers"),
  moverController.updateFleetPricing
);

router.put(
  "/availability",
  authenticate,
  requireRole("movers"),
  moverController.updateAvailability
);

router.post(
  "/documents",
  authenticate,
  requireRole("movers"),
  moverUploadFields,
  moverController.uploadDocuments
);

// Admin routes
router.get(
  "/admin/pending",
  authenticate,
  requireRole("admin"),
  moverController.getPendingMovers
);

router.get(
  "/admin/:moverId",
  authenticate,
  requireRole("admin"),
  moverController.getMoverForAdmin
);

router.patch(
  "/admin/:moverId/approve",
  authenticate,
  requireRole("admin"),
  moverController.approveMover
);

router.patch(
  "/admin/:moverId/reject",
  authenticate,
  requireRole("admin"),
  moverController.rejectMover
);

module.exports = router;