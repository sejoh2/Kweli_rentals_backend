const userService = require("../services/user.service");
const { admin, signUpWithEmailPassword, signInWithEmailPassword, refreshFirebaseToken } = require("../config/firebase");

// Sign Up with Email and Password
const signUp = async (req, res) => {
  try {
    const { email, password, full_name, phone_number, role = 'home_finder' } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: "Email and password are required" 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        error: "Password must be at least 6 characters" 
      });
    }
    
    // Create user in Firebase Auth
    const firebaseUser = await signUpWithEmailPassword(email, password, full_name);
    
    // Create user in our database
    const userData = {
      uid: firebaseUser.localId,
      email: firebaseUser.email,
      full_name: full_name || email.split('@')[0],
      phone_number: phone_number || null,
      role: role,
      email_verified: firebaseUser.emailVerified || false,
      auth_provider: 'email'
    };
    
    // Save to PostgreSQL
    const dbUser = await userService.createOrUpdateUserFromSignup(userData);
    
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: {
        id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        phone_number: dbUser.phone_number,
        role: dbUser.role,
        profile_image_url: dbUser.profile_image_url,
        email_verified: dbUser.email_verified
      },
      token: firebaseUser.idToken,
      refreshToken: firebaseUser.refreshToken
    });
    
  } catch (error) {
    console.error("Sign up error:", error.message);
    res.status(400).json({ 
      error: error.message || "Failed to create user account" 
    });
  }
};

// Sign In with Email and Password
const signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: "Email and password are required" 
      });
    }
    
    // Sign in with Firebase Auth REST API
    const firebaseUser = await signInWithEmailPassword(email, password);
    
    // Get or create user in database
    let dbUser = await userService.getUserByFirebaseUid(firebaseUser.localId);
    
    if (!dbUser) {
      // Create user record if doesn't exist
      const userData = {
        uid: firebaseUser.localId,
        email: firebaseUser.email,
        full_name: firebaseUser.displayName || email.split('@')[0],
        role: 'home_finder',
        email_verified: firebaseUser.emailVerified || false,
        auth_provider: 'email'
      };
      dbUser = await userService.createOrUpdateUserFromSignup(userData);
    } else {
      // Update last login
      await userService.updateLastLogin(firebaseUser.localId);
    }
    
    res.json({
      success: true,
      message: "Signed in successfully",
      user: {
        id: dbUser.id,
        email: dbUser.email,
        full_name: dbUser.full_name,
        phone_number: dbUser.phone_number,
        role: dbUser.role,
        profile_image_url: dbUser.profile_image_url,
        location: dbUser.location,
        total_listings: dbUser.total_listings,
        email_verified: dbUser.email_verified,
        is_verified: dbUser.is_verified,
        verification_status: dbUser.verification_status
      },
      token: firebaseUser.idToken,
      refreshToken: firebaseUser.refreshToken
    });
    
  } catch (error) {
    console.error("Sign in error:", error.message);
    res.status(401).json({ 
      error: "Invalid email or password" 
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
    res.json({
      success: true,
      user: req.user
    });
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
    
    // Return only public information
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

// Update user role (Admin only)
const updateUserRole = async (req, res) => {
  try {
    const { role, userId } = req.body;
    
    // Only admins can change roles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can update user roles" });
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

// Submit verification request (Landlord only)
const submitVerification = async (req, res) => {
  try {
    const firebaseUid = req.user.firebase_uid;
    const { documents } = req.body; // You can add document URLs here
    
    // Only landlords can request verification
    if (req.user.role !== 'landlord') {
      return res.status(403).json({ error: "Only landlords can request verification" });
    }
    
    // Check if already verified
    if (req.user.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    // Update status to 'in_progress'
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

// Approve verification (Admin only)
const approveVerification = async (req, res) => {
  try {
    const { userId } = req.params; // This is the user's firebase_uid
    
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can approve verification" });
    }
    
    // Get the user to verify
    const userToVerify = await userService.getUserByFirebaseUid(userId);
    
    if (!userToVerify) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Check if user is landlord
    if (userToVerify.role !== 'landlord') {
      return res.status(400).json({ error: "Verification can only be approved for landlords" });
    }
    
    // Check if already verified
    if (userToVerify.is_verified) {
      return res.status(400).json({ error: "User is already verified" });
    }
    
    // Update status to 'verified'
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

// Reject verification (Admin only)
const rejectVerification = async (req, res) => {
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
    
    // Reset status to 'not_verified'
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
    // Check if requester is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Only admins can view pending verifications" });
    }
    
    const pool = require("../config/db");
    const result = await pool.query(
      `
      SELECT id, firebase_uid, email, full_name, phone_number, 
             profile_image_url, created_at, updated_at
      FROM users 
      WHERE role = 'landlord' 
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
    // Check if requester is admin
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
    
    // Check if requester is admin
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
  refreshToken,
  getCurrentUser,
  getPublicUserProfile,
  updateUserProfile,
  updateUserRole,
  submitVerification,
  approveVerification,
  rejectVerification,
  getPendingVerifications,
  updateListingsCount,
  logout,
  getAllUsers,
  deactivateUser
};