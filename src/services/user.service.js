const pool = require("../config/db");
const { v4: uuidv4 } = require("uuid");

// Helper to generate unique user ID
const generateUserId = () => {
  return `user_${uuidv4()}`;
};

// ==================== USER CREATION & RETRIEVAL ====================

// Create user from phone signup
async function createUserFromPhoneSignup(userData) {
  const { user_id, phone_number, full_name, email, role, phone_verified, auth_provider } = userData;
  
  const profileImageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(full_name)}&background=random&color=fff&bold=true`;
  
  const result = await pool.query(
    `
    INSERT INTO users (
      user_id,
      phone_number,
      full_name,
      email,
      profile_image_url,
      role,
      phone_verified,
      auth_provider,
      last_login,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
    `,
    [user_id, phone_number, full_name, email || null, profileImageUrl, role || 'home_finder', phone_verified || true, auth_provider || 'phone']
  );
  
  return result.rows[0];
}

// Get user by phone number (PRIMARY lookup method)
async function getUserByPhoneNumber(phoneNumber) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE phone_number = $1
    `,
    [phoneNumber]
  );
  return result.rows[0];
}

// Get user by user_id (replaces firebase_uid)
async function getUserByUserId(userId) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows[0];
}

// Get user by ID (database primary key)
async function getUserById(id) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE id = $1
    `,
    [id]
  );
  return result.rows[0];
}

// Get user by email (optional, for users who add email later)
async function getUserByEmail(email) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE email = $1
    `,
    [email]
  );
  return result.rows[0];
}

// Check if phone number exists
async function isPhoneNumberExists(phoneNumber) {
  const result = await pool.query(
    `
    SELECT EXISTS(SELECT 1 FROM users WHERE phone_number = $1) as exists
    `,
    [phoneNumber]
  );
  return result.rows[0].exists;
}

// ==================== USER UPDATES ====================

// Update last login time
async function updateLastLogin(userId) {
  const result = await pool.query(
    `
    UPDATE users 
    SET last_login = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING *
    `,
    [userId]
  );
  return result.rows[0];
}

// Update user profile
async function updateUserProfile(userId, updates) {
  const allowedUpdates = ['full_name', 'phone_number', 'email', 'location', 'profile_image_url'];
  
  const updateFields = [];
  const values = [userId];
  let paramIndex = 2;
  
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key) && updates[key] !== undefined) {
      updateFields.push(`${key} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
  });
  
  if (updateFields.length === 0) {
    throw new Error("No valid fields to update");
  }
  
  const query = `
    UPDATE users 
    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Update user role
async function updateUserRole(userId, newRole) {
  const validRoles = ['home_finder', 'landlord', 'agent', 'movers', 'admin'];
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }
  
  const result = await pool.query(
    `
    UPDATE users 
    SET role = $1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2
    RETURNING *
    `,
    [newRole, userId]
  );
  return result.rows[0];
}

// Update landlord's total listings count
async function updateLandlordListingsCount(userId) {
  const result = await pool.query(
    `
    UPDATE users 
    SET total_listings = (
      SELECT COUNT(*) 
      FROM properties 
      WHERE owner_id = $1
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING total_listings
    `,
    [userId]
  );
  return result.rows[0]?.total_listings || 0;
}

// Update user verification status
async function updateVerificationStatus(userId, status) {
  const validStatuses = ['verified', 'in_progress', 'not_verified'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  const result = await pool.query(
    `
    UPDATE users 
    SET verification_status = $1, 
        is_verified = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $3
    RETURNING verification_status, is_verified
    `,
    [status, status === 'verified', userId]
  );
  return result.rows[0];
}

// Update user rating
async function updateUserRating(userId, newRating) {
  const result = await pool.query(
    `
    UPDATE users 
    SET rating = $1, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $2
    RETURNING rating
    `,
    [newRating, userId]
  );
  return result.rows[0];
}

// Mark phone as verified
async function verifyPhoneNumber(phoneNumber) {
  const result = await pool.query(
    `
    UPDATE users 
    SET phone_verified = true, 
        updated_at = CURRENT_TIMESTAMP
    WHERE phone_number = $1
    RETURNING *
    `,
    [phoneNumber]
  );
  return result.rows[0];
}

// ==================== USER LISTING & MANAGEMENT ====================

// Get all users with pagination
async function getAllUsers(limit = 50, offset = 0) {
  const result = await pool.query(
    `
    SELECT id, user_id, email, full_name, phone_number, role, 
           profile_image_url, location, is_active, phone_verified, 
           auth_provider, total_listings, rating, verification_status, is_verified,
           created_at, last_login
    FROM users
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [limit, offset]
  );
  return result.rows;
}

// Deactivate user account
async function deactivateUser(userId) {
  const result = await pool.query(
    `
    UPDATE users 
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING id, user_id, phone_number, is_active
    `,
    [userId]
  );
  return result.rows[0];
}

// Activate user account
async function activateUser(userId) {
  const result = await pool.query(
    `
    UPDATE users 
    SET is_active = true, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING id, user_id, phone_number, is_active
    `,
    [userId]
  );
  return result.rows[0];
}

// Delete user (hard delete - use with caution)
async function deleteUser(userId) {
  const result = await pool.query(
    `
    DELETE FROM users WHERE user_id = $1
    RETURNING id, user_id, phone_number
    `,
    [userId]
  );
  return result.rows[0];
}

// ==================== ADMIN SPECIFIC FUNCTIONS ====================

// Get all pending verifications
async function getPendingVerifications() {
  const result = await pool.query(
    `
    SELECT id, user_id, email, full_name, phone_number, 
           profile_image_url, role, verification_status, created_at
    FROM users 
    WHERE role IN ('landlord', 'agent', 'movers')
      AND verification_status = 'in_progress'
      AND is_verified = false
    ORDER BY updated_at ASC
    `
  );
  return result.rows;
}

// Get verification statistics
async function getVerificationStats() {
  const result = await pool.query(
    `
    SELECT 
      COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_count,
      COUNT(*) FILTER (WHERE verification_status = 'in_progress') as pending_count,
      COUNT(*) FILTER (WHERE verification_status = 'not_verified') as not_verified_count,
      COUNT(*) FILTER (WHERE was_rejected = true) as rejected_count
    FROM users 
    WHERE role IN ('landlord', 'agent', 'movers')
    `
  );
  return result.rows[0];
}

// Sync admin verification (for backward compatibility with old admin users)
async function syncAdminVerification(userId) {
  const result = await pool.query(
    `
    UPDATE users 
    SET is_verified = true, 
        verification_status = 'verified',
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND role = 'admin'
    RETURNING *
    `,
    [userId]
  );
  return result.rows[0];
}

// ==================== LANDLORD SPECIFIC FUNCTIONS ====================

// Get landlord by user_id
async function getLandlordByUserId(userId) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE user_id = $1 AND role = 'landlord'
    `,
    [userId]
  );
  return result.rows[0];
}

// Get landlord by ID (database primary key)
async function getLandlordById(id) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE id = $1 AND role = 'landlord'
    `,
    [id]
  );
  return result.rows[0];
}

// Update landlord profile
async function updateLandlord(userId, updates) {
  const allowedUpdates = ['full_name', 'phone_number', 'email', 'location', 'profile_image_url'];
  
  const updateFields = [];
  const values = [userId];
  let paramIndex = 2;
  
  Object.keys(updates).forEach(key => {
    if (allowedUpdates.includes(key) && updates[key] !== undefined) {
      updateFields.push(`${key} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    }
  });
  
  if (updateFields.length === 0) {
    throw new Error("No valid fields to update");
  }
  
  const query = `
    UPDATE users 
    SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND role = 'landlord'
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Update landlord stats
async function updateLandlordStats(userId, totalListings) {
  const result = await pool.query(
    `
    UPDATE users 
    SET total_listings = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND role = 'landlord'
    RETURNING *
    `,
    [userId, totalListings]
  );
  return result.rows[0];
}

// ==================== EXPORT ALL FUNCTIONS ====================

module.exports = {
  // Helper
  generateUserId,
  
  // User creation & retrieval (Phone OTP)
  createUserFromPhoneSignup,
  getUserByPhoneNumber,
  getUserByUserId,
  getUserById,
  getUserByEmail,
  isPhoneNumberExists,
  
  // User updates
  updateLastLogin,
  updateUserProfile,
  updateUserRole,
  updateLandlordListingsCount,
  updateVerificationStatus,
  updateUserRating,
  verifyPhoneNumber,
  
  // User management
  getAllUsers,
  deactivateUser,
  activateUser,
  deleteUser,
  
  // Admin specific
  getPendingVerifications,
  getVerificationStats,
  syncAdminVerification,
  
  // Landlord specific
  getLandlordByUserId,
  getLandlordById,
  updateLandlord,
  updateLandlordStats
};