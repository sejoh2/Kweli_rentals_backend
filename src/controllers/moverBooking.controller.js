const moverBookingService = require("../services/moverBooking.service");

const listVerifiedMovers = async (req, res) => {
  try {
    const movers = await moverBookingService.getVerifiedMovers(req.query);

    res.json({
      success: true,
      count: movers.length,
      movers
    });
  } catch (error) {
    console.error("Error listing movers:", error);
    res.status(500).json({ error: error.message });
  }
};

const getVerifiedMover = async (req, res) => {
  try {
    const mover = await moverBookingService.getVerifiedMoverById(req.params.moverId);

    if (!mover) {
      return res.status(404).json({ error: "Mover not found" });
    }

    res.json({
      success: true,
      mover
    });
  } catch (error) {
    console.error("Error getting mover:", error);
    res.status(500).json({ error: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.createMoverBooking(
      req.user.user_id,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Mover booking request sent successfully",
      booking
    });
  } catch (error) {
    console.error("Error creating mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const getHomefinderBookings = async (req, res) => {
  try {
    const bookings = await moverBookingService.getHomefinderBookings(
      req.user.user_id,
      req.query.status
    );

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error("Error getting homefinder mover bookings:", error);
    res.status(500).json({ error: error.message });
  }
};

const getMoverDashboard = async (req, res) => {
  try {
    const dashboard = await moverBookingService.getMoverDashboard(req.user.user_id);

    res.json({
      success: true,
      ...dashboard
    });
  } catch (error) {
    console.error("Error getting mover dashboard:", error);
    res.status(500).json({ error: error.message });
  }
};

const getMoverBookings = async (req, res) => {
  try {
    const bookings = await moverBookingService.getMoverBookings(
      req.user.user_id,
      req.query.status
    );

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    console.error("Error getting mover bookings:", error);
    res.status(500).json({ error: error.message });
  }
};

const acceptBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.updateMoverBookingStatus({
      bookingId: req.params.bookingId,
      moverUserId: req.user.user_id,
      status: "confirmed",
      note: req.body.note || null
    });

    res.json({
      success: true,
      message: "Booking accepted successfully",
      booking
    });
  } catch (error) {
    console.error("Error accepting mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const declineBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.updateMoverBookingStatus({
      bookingId: req.params.bookingId,
      moverUserId: req.user.user_id,
      status: "declined",
      note: req.body.note || null,
      cancellationReason: req.body.reason || null
    });

    res.json({
      success: true,
      message: "Booking declined successfully",
      booking
    });
  } catch (error) {
    console.error("Error declining mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const startBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.updateMoverBookingStatus({
      bookingId: req.params.bookingId,
      moverUserId: req.user.user_id,
      status: "in_progress"
    });

    res.json({
      success: true,
      message: "Booking started successfully",
      booking
    });
  } catch (error) {
    console.error("Error starting mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const completeBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.updateMoverBookingStatus({
      bookingId: req.params.bookingId,
      moverUserId: req.user.user_id,
      status: "completed"
    });

    res.json({
      success: true,
      message: "Booking completed successfully",
      booking
    });
  } catch (error) {
    console.error("Error completing mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const cancelHomefinderBooking = async (req, res) => {
  try {
    const booking = await moverBookingService.cancelHomefinderBooking(
      req.params.bookingId,
      req.user.user_id,
      req.body.reason || null
    );

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      booking
    });
  } catch (error) {
    console.error("Error cancelling mover booking:", error);
    res.status(400).json({ error: error.message });
  }
};

const createReview = async (req, res) => {
  try {
    const review = await moverBookingService.createMoverReview(
      req.user.user_id,
      req.params.bookingId,
      req.body
    );

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      review
    });
  } catch (error) {
    console.error("Error creating mover review:", error);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  listVerifiedMovers,
  getVerifiedMover,
  createBooking,
  getHomefinderBookings,
  getMoverDashboard,
  getMoverBookings,
  acceptBooking,
  declineBooking,
  startBooking,
  completeBooking,
  cancelHomefinderBooking,
  createReview
};