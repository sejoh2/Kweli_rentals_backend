const { verifyFirebaseToken } = require("../config/firebase");
const userService = require("../services/user.service");

// Main authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: "No token provided. Please log in." 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await verifyFirebaseToken(token);
    
    // Get user from database
    let user = await userService.getUserByFirebaseUid(decodedToken.uid);
    
    if (!user) {
      return res.status(401).json({ 
        error: "User not found. Please register first." 
      });
    }
    
    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({ 
        error: "Your account has been deactivated. Please contact support." 
      });
    }
    
    req.user = user;
    req.firebaseUser = decodedToken;
    
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    return res.status(401).json({ 
      error: "Invalid or expired token. Please log in again." 
    });
  }
};

// Role-based authorization middleware
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
      });
    }
    
    next();
  };
};

// Optional auth (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await verifyFirebaseToken(token);
      const user = await userService.getUserByFirebaseUid(decodedToken.uid);
      req.user = user;
      req.firebaseUser = decodedToken;
    } else {
      req.user = null;
    }
    
    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// Check if user is admin (helper)
const isAdmin = (req) => {
  return req.user && req.user.role === 'admin';
};

module.exports = { authenticate, requireRole, optionalAuth, isAdmin };