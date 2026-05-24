const jwt = require('jsonwebtoken');
const userService = require("../services/user.service");

// Generate JWT token for authenticated user
const generateToken = (user) => {
  const payload = {
    id: user.id,
    user_id: user.user_id,
    phone_number: user.phone_number,
    email: user.email,
    role: user.role,
    is_verified: user.is_verified,
    phone_verified: user.phone_verified
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

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
    const decoded = verifyToken(token);
    
    // Get user from database using user_id
    let user = await userService.getUserByUserId(decoded.user_id);
    
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
    
    // Attach user to request
    req.user = user;
    
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

const requireVerifiedAccount = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.user.is_verified || req.user.verification_status !== "verified") {
    return res.status(403).json({
      success: false,
      error: "Your account must be verified before you can list a property.",
      verification_status: req.user.verification_status,
      is_verified: req.user.is_verified,
    });
  }

  next();
};

// Optional auth (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decoded = verifyToken(token);
      const user = await userService.getUserByUserId(decoded.user_id);
      req.user = user;
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

module.exports = {
  authenticate,
  requireRole,
  requireVerifiedAccount,
  optionalAuth,
  isAdmin,
  generateToken,
  verifyToken,
};