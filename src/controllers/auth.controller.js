const userService = require("../services/user.service");
const emailService = require("../services/email.service");
const documentService = require("../services/document.service");
const { admin, signUpWithEmailPassword, signInWithEmailPassword, refreshFirebaseToken } = require("../config/firebase");

// Sign Up with Email and Password (NO TOKEN ISSUED)
const signUp = async (req, res) => {
  try {
    const { email, password, full_name, phone_number, role = 'home_finder' } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    
    // Check if user already exists in database
    const existingUser = await userService.getUserByEmail(email);
    if (existingUser) {
      if (!existingUser.email_verified) {
        // User exists but not verified - send new code
        await emailService.sendVerificationCode(email, existingUser.full_name);
        return res.status(200).json({
          success: true,
          message: "Account exists but not verified. A new verification code has been sent to your email.",
          requires_verification: true,
          email: email
        });
      } else {
        return res.status(400).json({ error: "Email already registered. Please sign in." });
      }
    }
    
    // Create user in Firebase Auth
    const firebaseUser = await signUpWithEmailPassword(email, password, full_name);
    
    // Create user in our database (email not verified yet)
    const userData = {
      uid: firebaseUser.localId,
      email: firebaseUser.email,
      full_name: full_name || email.split('@')[0],
      phone_number: phone_number || null,
      role: role,
      email_verified: false,
      auth_provider: 'email'
    };
    
    const dbUser = await userService.createOrUpdateUserFromSignup(userData);
    
    // Send verification code email
    const emailResult = await emailService.sendVerificationCode(email, full_name || email.split('@')[0]);
    
    if (!emailResult.success) {
      return res.status(500).json({ error: "Failed to send verification email" });
    }
    
    res.status(201).json({
      success: true,
      message: "User registered successfully. A verification code has been sent to your email.",
      requires_verification: true,
      email: email,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        phone_number: dbUser.phone_number,
        role: dbUser.role,
        profile_image_url: dbUser.profile_image_url,
        email_verified: false
      }
    });
    
  } catch (error) {
    console.error("Sign up error:", error.message);
    res.status(400).json({ error: error.message || "Failed to create user account" });
  }
};

// Sign In with Email and Password (BLOCK if email not verified)
const signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    // Get user from database first
    const dbUser = await userService.getUserByEmail(email);
    
    if (!dbUser) {
      return res.status(401).json({ error: "User not found. Please register first." });
    }
    
    // CHECK IF EMAIL IS VERIFIED
    if (!dbUser.email_verified) {
      // Send a new verification code
      await emailService.sendVerificationCode(email, dbUser.full_name);
      return res.status(403).json({ 
        error: "Email not verified. A new verification code has been sent to your email.",
        requires_verification: true,
        email: dbUser.email
      });
    }
    
    // Sign in with Firebase Auth REST API
    const firebaseUser = await signInWithEmailPassword(email, password);
    
    // Update last login
    await userService.updateLastLogin(firebaseUser.localId);
    
    // Get fresh user data
    const verifiedUser = await userService.getUserByFirebaseUid(firebaseUser.localId);
    
    res.json({
      success: true,
      message: "Signed in successfully",
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        full_name: verifiedUser.full_name,
        phone_number: verifiedUser.phone_number,
        role: verifiedUser.role,
        profile_image_url: verifiedUser.profile_image_url,
        location: verifiedUser.location,
        total_listings: verifiedUser.total_listings,
        email_verified: verifiedUser.email_verified,
        is_verified: verifiedUser.is_verified,
        verification_status: verifiedUser.verification_status
      },
      token: firebaseUser.idToken,
      refreshToken: firebaseUser.refreshToken
    });
    
  } catch (error) {
    console.error("Sign in error:", error.message);
    res.status(401).json({ error: "Invalid email or password" });
  }
};

// Resend verification code
const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found. Please sign up first." });
    }
    
    if (user.email_verified) {
      return res.status(400).json({ error: "Email already verified. Please sign in." });
    }
    
    const result = await emailService.sendVerificationCode(email, user.full_name);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: "Verification code sent successfully",
        email: email
      });
    } else {
      res.status(500).json({ error: "Failed to send verification code" });
    }
  } catch (error) {
    console.error("Error resending verification code:", error);
    res.status(500).json({ error: error.message });
  }
};

// Verify email code - MANUAL SIGN-IN (Recommended)
const verifyEmailCode = async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }
    
    // Verify the code
    const verificationResult = emailService.verifyCode(email, code);
    
    if (!verificationResult.success) {
      return res.status(400).json({ error: verificationResult.error });
    }
    
    // Get user from database
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Update email_verified to true
    let updatedUser = await userService.verifyUserEmail(email);
    
    // For home_finder role, also set is_verified and verification_status to verified
    if (updatedUser.role === 'home_finder') {
      await userService.updateVerificationStatus(updatedUser.firebase_uid, 'verified');
      updatedUser = await userService.getUserByEmail(email);
    }
    
    // Send welcome email
    await emailService.sendWelcomeEmail(email, updatedUser.full_name);
    
    // Return success - user must sign in manually
    res.json({
      success: true,
      message: "Email verified successfully! You can now sign in.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        phone_number: updatedUser.phone_number,
        role: updatedUser.role,
        profile_image_url: updatedUser.profile_image_url,
        location: updatedUser.location,
        total_listings: updatedUser.total_listings,
        email_verified: updatedUser.email_verified,
        is_verified: updatedUser.is_verified,
        verification_status: updatedUser.verification_status
      }
    });
  } catch (error) {
    console.error("Error verifying code:", error);
    res.status(500).json({ error: error.message });
  }
};

// Request password reset code
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    // Check if user exists
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ 
        error: "No account found with this email address",
        code: "USER_NOT_FOUND"
      });
    }
    
    // Check if email is verified
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first before resetting your password.",
        code: "EMAIL_NOT_VERIFIED"
      });
    }
    
    // Send password reset code email
    const result = await emailService.sendPasswordResetCode(email, user.full_name);
    
    if (!result.success) {
      return res.status(500).json({ 
        error: "Failed to send reset code. Please try again later.",
        code: "EMAIL_SEND_FAILED"
      });
    }
    
    res.json({ 
      success: true, 
      message: "Password reset code sent to your email",
      code: "SUCCESS"
    });
    
  } catch (error) {
    console.error("Error sending password reset code:", error);
    res.status(500).json({ 
      error: "Something went wrong. Please try again later.",
      code: "INTERNAL_ERROR"
    });
  }
};

// Reset password with code
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required" });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    
    // Check if user exists first
    const user = await userService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ 
        error: "No account found with this email address",
        code: "USER_NOT_FOUND"
      });
    }
    
    // Verify the reset code
    const verificationResult = emailService.verifyPasswordResetCode(email, code);
    
    if (!verificationResult.success) {
      return res.status(400).json({ 
        error: verificationResult.error,
        code: "INVALID_CODE"
      });
    }
    
    // Update password in Firebase
    const firebaseUser = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(firebaseUser.uid, { password: newPassword });
    
    res.json({ 
      success: true, 
      message: "Password reset successfully. You can now sign in with your new password." 
    });
    
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ 
      error: "Something went wrong. Please try again later.",
      code: "INTERNAL_ERROR"
    });
  }
};

// Refresh Token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }
    
    const tokens = await refreshFirebaseToken(refreshToken);
    
    res.json({
      success: true,
      token: tokens.idToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn
    });
    
  } catch (error) {
    console.error("Token refresh error:", error.message);
    res.status(401).json({ error: "Failed to refresh token" });
  }
};

// Get current user profile
const getCurrentUser = async (req, res) => {
  try {
    if (!req.user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first.",
        requires_verification: true
      });
    }
    res.json({ success: true, user: req.user });
  } catch (error) {
    console.error("Error getting current user:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get public user profile by UID
const getPublicUserProfile = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await userService.getUserByFirebaseUid(uid);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.full_name,
        profile_image_url: user.profile_image_url,
        location: user.location,
        role: user.role,
        rating: user.rating,
        total_listings: user.total_listings,
        is_verified: user.is_verified,
        joined_at: user.created_at
      }
    });
  } catch (error) {
    console.error("Error getting public profile:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update user profile
const updateUserProfile = async (req, res) => {
  try {
    if (!req.user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first.",
        requires_verification: true
      });
    }
    
    const { full_name, phone_number, location, profile_image_url } = req.body;
    const firebaseUid = req.user.firebase_uid;
    
    const updatedUser = await userService.updateUserProfile(firebaseUid, {
      full_name,
      phone_number,
      location,
      profile_image_url
    });
    
    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ error: error.message });
  }
};

// Upload profile image first to update the profile
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Use existing media service to upload to Supabase
    const mediaService = require("../services/media.service");
    const imageUrl = await mediaService.uploadMedia(req.file);

    // Update user's profile_image_url in database
    const pool = require("../config/db");
    await pool.query(
      `UPDATE users SET profile_image_url = $1, updated_at = NOW() WHERE firebase_uid = $2`,
      [imageUrl, req.user.firebase_uid]
    );

    // Get updated user
    const updatedUser = await userService.getUserByFirebaseUid(req.user.firebase_uid);

    res.json({
      success: true,
      imageUrl: imageUrl,
      user: updatedUser
    });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update user role (Admin only)
const updateUserRole = async (req, res) => {
  try {
    const { role, userId } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can update user roles" });
    }
    
    const updatedUser = await userService.updateUserRole(userId, role);
    
    // If promoting to admin, also verify them
    if (role === 'admin' && !updatedUser.is_verified) {
      await userService.syncAdminVerification(updatedUser.firebase_uid);
    }
    
    const finalUser = await userService.getUserByFirebaseUid(userId);
    
    res.json({
      success: true,
      message: `Role updated to ${role}`,
      user: finalUser
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: error.message });
  }
};

// Submit verification request (Landlord/Agent/Movers only)
const submitVerification = async (req, res) => {
  try {
    if (!req.user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first.",
        requires_verification: true
      });
    }
    
    const firebaseUid = req.user.firebase_uid;
    const allowedRoles = ['landlord', 'agent', 'movers'];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Only landlords, agents, and movers can request verification" });
    }
    
    if (req.user.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    const updated = await userService.updateVerificationStatus(firebaseUid, 'in_progress');
    
    res.json({
      success: true,
      message: "Verification request submitted successfully. Awaiting admin approval.",
      verification_status: updated.verification_status,
      is_verified: updated.is_verified
    });
  } catch (error) {
    console.error("Error submitting verification:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== NEW DOCUMENT UPLOAD FUNCTIONS ====================

// Upload verification documents (Landlord/Agent/Movers only)
// Upload verification documents (Landlord/Agent/Movers only)
const uploadVerificationDocuments = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    if (!req.user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first.",
        requires_verification: true
      });
    }
    
    const firebaseUid = req.user.firebase_uid;
    const allowedRoles = ['landlord', 'agent', 'movers'];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Only landlords, agents, and movers can upload verification documents" });
    }
    
    // Get user from database
    const user = await userService.getUserByFirebaseUid(firebaseUid);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Handle files from multer - req.files is an object with field names as keys
    const files = [];
    
    // Collect all files from different fields
    if (req.files) {
      // Using upload.fields() returns an object
      if (typeof req.files === 'object' && !Array.isArray(req.files)) {
        Object.keys(req.files).forEach(fieldName => {
          if (Array.isArray(req.files[fieldName])) {
            files.push(...req.files[fieldName]);
          }
        });
      } 
      // Using upload.array() would return an array
      else if (Array.isArray(req.files)) {
        files.push(...req.files);
      }
    }
    
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    const uploadedDocs = [];
    
    for (const file of files) {
      // Determine document type from field name or filename
      let documentType = req.body.document_type;
      if (!documentType) {
        if (file.fieldname === 'id_front') documentType = 'id_front';
        else if (file.fieldname === 'id_back') documentType = 'id_back';
        else if (file.fieldname === 'business_license') documentType = 'business_license';
        else if (file.fieldname === 'proof_of_address') documentType = 'proof_of_address';
        else documentType = 'other';
      }
      
      // Upload document to Supabase
      const uploadResult = await documentService.uploadVerificationDocument(
        file,
        user.id,
        documentType
      );
      
      // Save metadata to database
      const savedDoc = await documentService.saveDocumentMetadata(
        user.id,
        documentType,
        uploadResult,
        pool
      );
      
      uploadedDocs.push(savedDoc);
    }
    
    // Update verification status to 'in_progress' if not already
    if (req.user.verification_status === 'not_verified') {
      await userService.updateVerificationStatus(firebaseUid, 'in_progress');
    }
    
    res.json({
      success: true,
      message: `${uploadedDocs.length} document(s) uploaded successfully. Awaiting admin review.`,
      documents: uploadedDocs,
      verification_status: 'in_progress'
    });
    
  } catch (error) {
    console.error("Error uploading verification documents:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get verification documents (Admin only)
const getVerificationDocuments = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const { userId } = req.params;
    
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view verification documents" });
    }
    
    // Get user
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Get documents
    const documents = await documentService.getUserDocuments(userId, pool);
    
    // Refresh signed URLs for each document (expiring in 15 minutes)
    const refreshedDocs = await Promise.all(documents.map(async (doc) => {
      if (doc.storage_path) {
        try {
          const freshUrl = await documentService.refreshSignedUrl(doc.storage_path, 900);
          doc.file_url = freshUrl;
        } catch (err) {
          console.error(`Failed to refresh URL for ${doc.storage_path}:`, err.message);
        }
      }
      return doc;
    }));
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        verification_status: user.verification_status,
        is_verified: user.is_verified,
      },
      documents: refreshedDocs
    });
    
  } catch (error) {
    console.error("Error getting verification documents:", error);
    res.status(500).json({ error: error.message });
  }
};

// Approve verification with document review (Admin only)
const approveVerificationWithDocs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;
    
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can approve verification" });
    }
    
    // Get the user to verify
    const userToVerify = await userService.getUserById(userId);
    
    if (!userToVerify) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const allowedRoles = ['landlord', 'agent', 'movers'];
    if (!allowedRoles.includes(userToVerify.role)) {
      return res.status(400).json({ error: "Verification can only be approved for landlords, agents, and movers" });
    }
    
    // Check if already verified
    if (userToVerify.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    // Update verification status
    const updated = await userService.updateVerificationStatus(userToVerify.firebase_uid, 'verified');
    
    // Store admin notes
    if (notes) {
      const pool = require("../config/db");
      await pool.query(
        `UPDATE users SET admin_notes = $1, verified_by = $2, verified_at = NOW() 
         WHERE id = $3`,
        [notes, req.user.id, userId]
      );
    }
    
    res.json({
      success: true,
      message: `User ${userToVerify.full_name} has been verified successfully`,
      user: {
        id: userToVerify.id,
        full_name: userToVerify.full_name,
        email: userToVerify.email,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
    
  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({ error: error.message });
  }
};

// Reject verification with document cleanup (Admin only)
const rejectVerificationWithCleanup = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can reject verification" });
    }
    
    // Get the user
    const userToReject = await userService.getUserByFirebaseUid(userId);
    
    if (!userToReject) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Delete all uploaded documents
    await documentService.deleteAllUserDocuments(userToReject.id, pool);
    
    // Reset status to 'not_verified'
    const updated = await userService.updateVerificationStatus(userId, 'not_verified');
    
    res.json({
      success: true,
      message: `Verification rejected for ${userToReject.full_name}${reason ? `: ${reason}` : ''} and documents deleted.`,
      user: {
        id: userToReject.id,
        full_name: userToReject.full_name,
        email: userToReject.email,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
    
  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==================== END NEW DOCUMENT UPLOAD FUNCTIONS ====================

// Approve verification (Admin only) - Keep original
const approveVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can approve verification" });
    }
    
    const userToVerify = await userService.getUserByFirebaseUid(userId);
    
    if (!userToVerify) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const allowedRoles = ['landlord', 'agent', 'movers'];
    if (!allowedRoles.includes(userToVerify.role)) {
      return res.status(400).json({ error: "Verification can only be approved for landlords, agents, and movers" });
    }
    
    if (userToVerify.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    const updated = await userService.updateVerificationStatus(userId, 'verified');
    
    res.json({
      success: true,
      message: `User ${userToVerify.full_name} has been verified successfully`,
      user: {
        id: userToVerify.id,
        full_name: userToVerify.full_name,
        email: userToVerify.email,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({ error: error.message });
  }
};

// Reject verification (Admin only) - Keep original
const rejectVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can reject verification" });
    }
    
    const userToReject = await userService.getUserByFirebaseUid(userId);
    
    if (!userToReject) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const updated = await userService.updateVerificationStatus(userId, 'not_verified');
    
    res.json({
      success: true,
      message: `Verification rejected for ${userToReject.full_name}${reason ? `: ${reason}` : ''}`,
      user: {
        id: userToReject.id,
        full_name: userToReject.full_name,
        email: userToReject.email,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all pending verification requests (Admin only)
const getPendingVerifications = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view pending verifications" });
    }
    
    const pool = require("../config/db");
    const result = await pool.query(
      `
      SELECT id, firebase_uid, email, full_name, phone_number, 
             profile_image_url, created_at, updated_at
      FROM users 
      WHERE role IN ('landlord', 'agent', 'movers')
        AND verification_status = 'in_progress'
        AND is_verified = false
      ORDER BY updated_at ASC
      `
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      pending_verifications: result.rows
    });
  } catch (error) {
    console.error("Error getting pending verifications:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update landlord listings count
const updateListingsCount = async (req, res) => {
  try {
    if (!req.user.email_verified) {
      return res.status(403).json({ 
        error: "Email not verified. Please verify your email first.",
        requires_verification: true
      });
    }
    
    const firebaseUid = req.user.firebase_uid;
    const totalListings = await userService.updateLandlordListingsCount(firebaseUid);
    
    res.json({
      success: true,
      total_listings: totalListings
    });
  } catch (error) {
    console.error("Error updating listings count:", error);
    res.status(500).json({ error: error.message });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    if (req.firebaseUser) {
      await admin.auth().revokeRefreshTokens(req.firebaseUser.uid);
    }
    
    res.json({
      success: true,
      message: "Logged out successfully"
    });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view all users" });
    }
    
    const { limit = 50, offset = 0 } = req.query;
    const users = await userService.getAllUsers(parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      users,
      pagination: { limit: parseInt(limit), offset: parseInt(offset) }
    });
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({ error: error.message });
  }
};

// Deactivate user (Admin only)
const deactivateUser = async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can deactivate users" });
    }
    
    const deactivatedUser = await userService.deactivateUser(firebaseUid);
    
    if (!deactivatedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      success: true,
      message: "User account deactivated",
      user: deactivatedUser
    });
  } catch (error) {
    console.error("Error deactivating user:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  signUp,
  signIn,
  resendVerificationCode,
  verifyEmailCode,
  forgotPassword,
  resetPassword,
  refreshToken,
  getCurrentUser,
  getPublicUserProfile,
  updateUserProfile,
  uploadProfileImage, 
  updateUserRole,
  submitVerification,
  approveVerification,
  rejectVerification,
  getPendingVerifications,
  updateListingsCount,
  logout,
  getAllUsers,
  deactivateUser,
  // New document upload functions
  uploadVerificationDocuments,
  getVerificationDocuments,
  approveVerificationWithDocs,
  rejectVerificationWithCleanup
};