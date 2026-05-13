const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middleware/auth");
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

// ==================== PUBLIC ROUTES (Phone OTP Authentication) ====================
// Add this line BEFORE the send-otp route
router.post("/check-phone", authController.checkPhoneNumber);
router.post("/send-otp", authController.sendOTP);
router.post("/verify-otp", authController.verifyOTPAndLogin);
router.post("/resend-otp", authController.resendOTP);
router.get("/profile/:uid", authController.getPublicUserProfile);

// ==================== PROTECTED ROUTES ====================
router.get("/me", authenticate, authController.getCurrentUser);

// Update profile - supports both JSON and file upload
// Note: For file upload, use form-data; for JSON, use application/json
router.put(
  "/profile",
  authenticate,
  (req, res, next) => {
    // Check content type to determine if we need multer
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      // Use multer for file upload
      upload.single('profile_image')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }
        next();
      });
    } else {
      // Skip multer for JSON requests
      next();
    }
  },
  authController.updateUserProfile
);

router.post("/logout", authenticate, authController.logout);

// ==================== PROFILE IMAGE UPLOAD (Standalone) ====================
router.post(
  "/upload-profile-image",
  authenticate,
  upload.single("profile_image"),
  authController.uploadProfileImage
);

// ==================== LANDLORD ONLY ROUTES ====================
router.get("/listings-count", authenticate, requireRole('landlord'), authController.updateListingsCount);
router.post("/verification/submit", authenticate, requireRole('landlord'), authController.submitVerification);

// ==================== DOCUMENT UPLOAD ROUTES ====================
router.post(
  "/verification/upload-documents",
  authenticate,
  requireRole('landlord', 'agent', 'movers'),
  upload.fields([
    { name: 'id_front', maxCount: 1 },
    { name: 'id_back', maxCount: 1 },
    { name: 'business_license', maxCount: 1 },
    { name: 'proof_of_address', maxCount: 1 },
    { name: 'documents', maxCount: 10 }
  ]),
  authController.uploadVerificationDocuments
);

router.get(
  "/verification/documents/:userId",
  authenticate,
  requireRole('admin'),
  authController.getVerificationDocuments
);

router.patch(
  "/verification/:userId/approve-with-docs",
  authenticate,
  requireRole('admin'),
  authController.approveVerificationWithDocs
);

router.patch(
  "/verification/:userId/reject-with-cleanup",
  authenticate,
  requireRole('admin'),
  authController.rejectVerificationWithCleanup
);

// ==================== ADMIN ONLY ROUTES ====================
router.patch("/role", authenticate, requireRole('admin'), authController.updateUserRole);
router.get("/all", authenticate, requireRole('admin'), authController.getAllUsers);
router.delete("/:userId", authenticate, requireRole('admin'), authController.deactivateUser);

router.get("/verification/pending", authenticate, requireRole('admin'), authController.getPendingVerifications);
router.patch("/verification/:userId/approve", authenticate, requireRole('admin'), authController.approveVerification);
router.patch("/verification/:userId/reject", authenticate, requireRole('admin'), authController.rejectVerification);

module.exports = router;