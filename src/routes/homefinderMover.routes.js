const express = require("express");
const moverBookingController = require("../controllers/moverBooking.controller");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get(
  "/movers",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.listVerifiedMovers
);

router.get(
  "/movers/:moverId",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.getVerifiedMover
);

router.post(
  "/mover-bookings",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.createBooking
);

router.get(
  "/mover-bookings/me",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.getHomefinderBookings
);

router.patch(
  "/mover-bookings/:bookingId/cancel",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.cancelHomefinderBooking
);

router.post(
  "/mover-bookings/:bookingId/review",
  authenticate,
  requireRole("home_finder"),
  moverBookingController.createReview
);

module.exports = router;