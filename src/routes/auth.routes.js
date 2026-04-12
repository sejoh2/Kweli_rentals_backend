const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middleware/auth");

// Public routes (no authentication required)
router.post("/signup", authController.signUp);
router.post("/signin", authController.signIn);
router.post("/refresh-token", authController.refreshToken);

// Protected routes (require authentication)
router.get("/me", authenticate, authController.getCurrentUser);
router.put("/profile", authenticate, authController.updateUserProfile);
router.post("/logout", authenticate, authController.logout);
router.patch("/role", authenticate, authController.updateUserRole);

// Landlord specific routes
router.get("/listings-count", authenticate, requireRole('landlord'), authController.updateListingsCount);
router.patch("/verification", authenticate, requireRole('landlord'), authController.updateVerification);

// Admin routes
router.get("/all", authenticate, authController.getAllUsers);
router.delete("/:firebaseUid", authenticate, authController.deactivateUser);

module.exports = router;