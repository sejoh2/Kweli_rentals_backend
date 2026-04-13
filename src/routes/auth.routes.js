const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middleware/auth");

// ==================== PUBLIC ROUTES ====================
router.post("/signup", authController.signUp);
router.post("/signin", authController.signIn);
router.post("/resend-verification", authController.resendVerificationCode);
router.post("/verify-email", authController.verifyEmailCode);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/refresh-token", authController.refreshToken);
router.get("/profile/:uid", authController.getPublicUserProfile);

// ==================== PROTECTED ROUTES (Require verified email) ====================
router.get("/me", authenticate, authController.getCurrentUser);
router.put("/profile", authenticate, authController.updateUserProfile);
router.post("/logout", authenticate, authController.logout);

// ==================== LANDLORD ONLY ROUTES ====================
router.get("/listings-count", authenticate, requireRole('landlord'), authController.updateListingsCount);
router.post("/verification/submit", authenticate, requireRole('landlord'), authController.submitVerification);

// ==================== ADMIN ONLY ROUTES ====================
router.patch("/role", authenticate, requireRole('admin'), authController.updateUserRole);
router.get("/all", authenticate, requireRole('admin'), authController.getAllUsers);
router.delete("/:firebaseUid", authenticate, requireRole('admin'), authController.deactivateUser);

// Verification management (Admin only)
router.get("/verification/pending", authenticate, requireRole('admin'), authController.getPendingVerifications);
router.patch("/verification/:userId/approve", authenticate, requireRole('admin'), authController.approveVerification);
router.patch("/verification/:userId/reject", authenticate, requireRole('admin'), authController.rejectVerification);

module.exports = router;