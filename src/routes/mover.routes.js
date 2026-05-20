const express = require("express");
const multer = require("multer");
const moverController = require("../controllers/mover.controller");
const moverBookingController = require("../controllers/moverBooking.controller");
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

router.get(
  "/me",
  authenticate,
  requireRole("movers"),
  moverController.getMyMoverProfile
);

router.get(
  "/dashboard",
  authenticate,
  requireRole("movers"),
  moverBookingController.getMoverDashboard
);

router.get(
  "/bookings",
  authenticate,
  requireRole("movers"),
  moverBookingController.getMoverBookings
);

router.patch(
  "/bookings/:bookingId/accept",
  authenticate,
  requireRole("movers"),
  moverBookingController.acceptBooking
);

router.patch(
  "/bookings/:bookingId/decline",
  authenticate,
  requireRole("movers"),
  moverBookingController.declineBooking
);

router.patch(
  "/bookings/:bookingId/start",
  authenticate,
  requireRole("movers"),
  moverBookingController.startBooking
);

router.patch(
  "/bookings/:bookingId/complete",
  authenticate,
  requireRole("movers"),
  moverBookingController.completeBooking
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