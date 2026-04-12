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
        email_verified: dbUser.email_verified
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

// Update user role
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const firebaseUid = req.user.firebase_uid;
    
    const updatedUser = await userService.updateUserRole(firebaseUid, role);
    
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

// Update verification status
const updateVerification = async (req, res) => {
  try {
    const { status } = req.body;
    const firebaseUid = req.user.firebase_uid;
    
    const updated = await userService.updateVerificationStatus(firebaseUid, status);
    
    res.json({
      success: true,
      verification_status: updated.verification_status,
      is_verified: updated.is_verified
    });
  } catch (error) {
    console.error("Error updating verification status:", error);
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

// Get all users
const getAllUsers = async (req, res) => {
  try {
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

// Deactivate user
const deactivateUser = async (req, res) => {
  try {
    const { firebaseUid } = req.params;
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
  updateUserProfile,
  updateUserRole,
  updateListingsCount,
  updateVerification,
  logout,
  getAllUsers,
  deactivateUser
};