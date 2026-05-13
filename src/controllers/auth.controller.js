const userService = require("../services/user.service");
const smsService = require("../services/sms.service");
const documentService = require("../services/document.service");
const { generateToken } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

// Helper to generate unique user ID
const generateUserId = () => {
  return `user_${uuidv4()}`;
};

// Valid roles
const VALID_ROLES = ['home_finder', 'landlord', 'agent', 'movers'];

// ==================== PHONE NUMBER AUTHENTICATION ====================

// Step 1: Send OTP to phone number
const sendOTP = async (req, res) => {
  try {
    const { phone_number, full_name } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    // Clean phone number (remove spaces, dashes)
    const cleanedPhone = phone_number.replace(/[\s\-\(\)]/g, '');
    
    // Send OTP - don't block existing phone numbers (they can create multiple role accounts)
    const result = await smsService.sendVerificationOTP(cleanedPhone, full_name || 'User');
    
    res.json({
      success: true,
      message: "Verification code sent to your phone number",
      phone_number: cleanedPhone,
      sandbox_mode: result.sandboxMode,
      // Always indicate new user since we're creating account for specific role
      is_new_user: true
    });
    
  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({ error: error.message || "Failed to send verification code" });
  }
};

// Step 2: Verify OTP and create/authenticate user
const verifyOTPAndLogin = async (req, res) => {
  try {
    const { phone_number, code, full_name, role, email } = req.body;
    
    if (!phone_number || !code) {
      return res.status(400).json({ error: "Phone number and verification code are required" });
    }
    
    const cleanedPhone = phone_number.replace(/[\s\-\(\)]/g, '');
    
    // Verify OTP
    const verificationResult = smsService.verifyOTP(cleanedPhone, code);
    
    if (!verificationResult.success) {
      return res.status(400).json({ error: verificationResult.error });
    }
    
    // Check if user exists with this specific role (phone + role combo)
    let user = await userService.getUserByPhoneNumberAndRole(cleanedPhone, role);
    
    if (!user) {
      // NEW USER for this role - create account (even if phone exists for other roles)
      
      // Validate required fields
      if (!full_name || full_name.trim() === '') {
        return res.status(400).json({ 
          success: false,
          error: "Full name is required",
          message: "Please provide your full name to complete registration",
          is_new_user: true
        });
      }
      
      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({ 
          success: false,
          error: "Valid role is required",
          message: "Please select a role to complete registration",
          valid_roles: VALID_ROLES,
          is_new_user: true
        });
      }
      
      // Create new user with provided name and role
      const userId = generateUserId();
      const userData = {
        user_id: userId,
        phone_number: cleanedPhone,
        full_name: full_name.trim(),
        email: email || null,
        role: role,
        phone_verified: true,
        auth_provider: 'phone'
      };
      
      user = await userService.createUserFromPhoneSignup(userData);
      
      // Send welcome SMS
      await smsService.sendWelcomeSMS(cleanedPhone, user.full_name);
      
      console.log(`✅ New ${role} account created: ${user.full_name} - ${user.phone_number}`);
    } else {
      // EXISTING user for this role - just log them in
      await userService.updateLastLogin(user.user_id);
      
      if (!user.phone_verified) {
        await userService.verifyPhoneNumber(cleanedPhone);
        user = await userService.getUserByPhoneNumberAndRole(cleanedPhone, role);
      }
      
      console.log(`✅ Existing ${role} logged in: ${user.full_name} - ${user.phone_number}`);
    }
    
    // Generate JWT token
    const token = generateToken(user);
    
    res.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: user.id,
        user_id: user.user_id,
        full_name: user.full_name,
        phone_number: user.phone_number,
        email: user.email,
        role: user.role,
        profile_image_url: user.profile_image_url,
        location: user.location,
        total_listings: user.total_listings,
        phone_verified: user.phone_verified,
        is_verified: user.is_verified,
        verification_status: user.verification_status,
        was_rejected: user.was_rejected,
        rejection_reason: user.rejection_reason
      },
      token: token
    });
    
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res.status(500).json({ error: error.message || "Failed to verify code" });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    
    const cleanedPhone = phone_number.replace(/[\s\-\(\)]/g, '');
    
    const result = await smsService.sendVerificationOTP(cleanedPhone);
    
    res.json({
      success: true,
      message: "Verification code resent successfully",
      sandbox_mode: result.sandboxMode
    });
    
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Logout (just invalidate token on client side)
const logout = async (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully"
  });
};

// ==================== USER PROFILE ====================

// Get current user profile
const getCurrentUser = async (req, res) => {
  try {
    res.json({ success: true, user: req.user });
  } catch (error) {
    console.error("Error getting current user:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get public user profile by user_id
const getPublicUserProfile = async (req, res) => {
  try {
    const { uid } = req.params;
    const user = await userService.getUserByUserId(uid);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
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

// Update user profile (handles both JSON and file upload)
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const updates = {};
    
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);
    
    // Check if it's a file upload (multipart/form-data has req.file)
    if (req.file) {
      // File upload - handle profile image
      const mediaService = require("../services/media.service");
      const imageUrl = await mediaService.uploadMedia(req.file);
      updates.profile_image_url = imageUrl;
    }
    
    // Handle text fields (works for both JSON and form-data)
    if (req.body) {
      if (req.body.full_name !== undefined && req.body.full_name !== null && req.body.full_name !== '') {
        updates.full_name = req.body.full_name;
      }
      if (req.body.email !== undefined && req.body.email !== null && req.body.email !== '') {
        updates.email = req.body.email;
      }
      if (req.body.location !== undefined && req.body.location !== null && req.body.location !== '') {
        updates.location = req.body.location;
      }
      if (req.body.profile_image_url !== undefined && req.body.profile_image_url !== null && req.body.profile_image_url !== '') {
        updates.profile_image_url = req.body.profile_image_url;
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    
    console.log("Updates to apply:", updates);
    
    const updatedUser = await userService.updateUserProfile(userId, updates);
    
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

// Upload profile image
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const mediaService = require("../services/media.service");
    const imageUrl = await mediaService.uploadMedia(req.file);

    const pool = require("../config/db");
    await pool.query(
      `UPDATE users SET profile_image_url = $1, updated_at = NOW() WHERE user_id = $2`,
      [imageUrl, req.user.user_id]
    );

    const updatedUser = await userService.getUserByUserId(req.user.user_id);

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
    
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ 
        error: "Invalid role", 
        valid_roles: VALID_ROLES 
      });
    }
    
    const updatedUser = await userService.updateUserRole(userId, role);
    
    res.json({
      success: true,
      message: `Role updated to ${role}`,
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: error.message });
  }
};

// Submit verification request (Landlord/Agent/Movers only)
const submitVerification = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const allowedRoles = ['landlord', 'agent', 'movers'];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Only landlords, agents, and movers can request verification" });
    }
    
    if (req.user.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    const updated = await userService.updateVerificationStatus(userId, 'in_progress');
    
    const pool = require("../config/db");
    await pool.query(
      `UPDATE users 
       SET was_rejected = false,
           rejection_reason = NULL,
           documents_submitted = true,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
    
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

// ==================== DOCUMENT UPLOAD FUNCTIONS ====================

const uploadVerificationDocuments = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const userId = req.user.user_id;
    const allowedRoles = ['landlord', 'agent', 'movers'];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Only landlords, agents, and movers can upload verification documents" });
    }
    
    const user = await userService.getUserByUserId(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const files = [];
    
    if (req.files) {
      if (typeof req.files === 'object' && !Array.isArray(req.files)) {
        Object.keys(req.files).forEach(fieldName => {
          if (Array.isArray(req.files[fieldName])) {
            files.push(...req.files[fieldName]);
          }
        });
      } else if (Array.isArray(req.files)) {
        files.push(...req.files);
      }
    }
    
    if (files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }
    
    const uploadedDocs = [];
    
    for (const file of files) {
      let documentType = req.body.document_type;
      if (!documentType) {
        if (file.fieldname === 'id_front') documentType = 'id_front';
        else if (file.fieldname === 'id_back') documentType = 'id_back';
        else if (file.fieldname === 'business_license') documentType = 'business_license';
        else if (file.fieldname === 'proof_of_address') documentType = 'proof_of_address';
        else documentType = 'other';
      }
      
      const uploadResult = await documentService.uploadVerificationDocument(
        file,
        user.id,
        documentType
      );
      
      const savedDoc = await documentService.saveDocumentMetadata(
        user.id,
        documentType,
        uploadResult,
        pool
      );
      
      uploadedDocs.push(savedDoc);
    }
    
    if (req.user.verification_status === 'not_verified') {
      await userService.updateVerificationStatus(userId, 'in_progress');
    }
    
    await pool.query(
      `UPDATE users SET documents_submitted = true WHERE user_id = $1`,
      [userId]
    );
    
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

const getVerificationDocuments = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const { userId } = req.params;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view verification documents" });
    }
    
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const documents = await documentService.getUserDocuments(userId, pool);
    
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
        user_id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        phone_number: user.phone_number,
        role: user.role,
        verification_status: user.verification_status,
        is_verified: user.is_verified,
        was_rejected: user.was_rejected,
        rejection_reason: user.rejection_reason
      },
      documents: refreshedDocs
    });
    
  } catch (error) {
    console.error("Error getting verification documents:", error);
    res.status(500).json({ error: error.message });
  }
};

const approveVerificationWithDocs = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can approve verification" });
    }
    
    const userToVerify = await userService.getUserById(userId);
    
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
    
    const updated = await userService.updateVerificationStatus(userToVerify.user_id, 'verified');
    
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
        user_id: userToVerify.user_id,
        full_name: userToVerify.full_name,
        email: userToVerify.email,
        phone_number: userToVerify.phone_number,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
    
  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({ error: error.message });
  }
};

const rejectVerificationWithCleanup = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can reject verification" });
    }
    
    const userToReject = await userService.getUserById(userId);
    
    if (!userToReject) {
      return res.status(404).json({ error: "User not found" });
    }
    
    await documentService.deleteAllUserDocuments(userToReject.id, pool);
    
    const updated = await userService.updateVerificationStatus(userToReject.user_id, 'not_verified');
    
    res.json({
      success: true,
      message: `Verification rejected for ${userToReject.full_name}${reason ? `: ${reason}` : ''} and documents deleted.`,
      user: {
        id: userToReject.id,
        user_id: userToReject.user_id,
        full_name: userToReject.full_name,
        email: userToReject.email,
        phone_number: userToReject.phone_number,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
    
  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({ error: error.message });
  }
};

const approveVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can approve verification" });
    }
    
    const userToVerify = await userService.getUserByUserId(userId);
    
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
        user_id: userToVerify.user_id,
        full_name: userToVerify.full_name,
        email: userToVerify.email,
        phone_number: userToVerify.phone_number,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status
      }
    });
  } catch (error) {
    console.error("Error approving verification:", error);
    res.status(500).json({ error: error.message });
  }
};

const rejectVerification = async (req, res) => {
  const pool = require("../config/db");
  
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can reject verification" });
    }
    
    const userToReject = await userService.getUserByUserId(userId);
    
    if (!userToReject) {
      return res.status(404).json({ error: "User not found" });
    }
    
    await pool.query(
      `UPDATE users 
       SET verification_status = 'not_verified',
           was_rejected = true,
           rejection_reason = $1,
           rejected_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING *`,
      [reason || 'No reason provided', userId]
    );
    
    const updated = await userService.getUserByUserId(userId);
    
    res.json({
      success: true,
      message: `Verification rejected for ${userToReject.full_name}${reason ? `: ${reason}` : ''}`,
      user: {
        id: userToReject.id,
        user_id: userToReject.user_id,
        full_name: userToReject.full_name,
        email: userToReject.email,
        phone_number: userToReject.phone_number,
        is_verified: updated.is_verified,
        verification_status: updated.verification_status,
        was_rejected: true,
        rejection_reason: reason
      }
    });
  } catch (error) {
    console.error("Error rejecting verification:", error);
    res.status(500).json({ error: error.message });
  }
};

const getPendingVerifications = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view pending verifications" });
    }
    
    const pending = await userService.getPendingVerifications();
    
    res.json({
      success: true,
      count: pending.length,
      pending_verifications: pending
    });
  } catch (error) {
    console.error("Error getting pending verifications:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateListingsCount = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const totalListings = await userService.updateLandlordListingsCount(userId);
    
    res.json({
      success: true,
      total_listings: totalListings
    });
  } catch (error) {
    console.error("Error updating listings count:", error);
    res.status(500).json({ error: error.message });
  }
};

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

const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can deactivate users" });
    }
    
    const deactivatedUser = await userService.deactivateUser(userId);
    
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
  // Phone OTP auth methods
  sendOTP,
  verifyOTPAndLogin,
  resendOTP,
  logout,
  
  // User profile methods
  getCurrentUser,
  getPublicUserProfile,
  updateUserProfile,
  uploadProfileImage,
  updateUserRole,
  submitVerification,
  updateListingsCount,
  getAllUsers,
  deactivateUser,
  
  // Document verification methods
  uploadVerificationDocuments,
  getVerificationDocuments,
  approveVerificationWithDocs,
  rejectVerificationWithCleanup,
  approveVerification,
  rejectVerification,
  getPendingVerifications
};