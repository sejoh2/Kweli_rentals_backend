const pool = require("../config/db");

// Create or update user after Firebase authentication
async function createOrUpdateUserFromSignup(userData) {
  const { uid, email, full_name, phone_number, location, profile_image_url, role, email_verified, auth_provider } = userData;
  
  const finalProfileImageUrl = profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(full_name || email.split('@')[0])}&background=random&color=fff&bold=true`;
  
  const result = await pool.query(
    `
    INSERT INTO users (
      firebase_uid,
      email,
      full_name,
      phone_number,
      location,
      profile_image_url,
      role,
      email_verified,
      auth_provider,
      last_login,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (firebase_uid) 
    DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, users.full_name),
      phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
      location = COALESCE(EXCLUDED.location, users.location),
      profile_image_url = COALESCE(EXCLUDED.profile_image_url, users.profile_image_url),
      role = COALESCE(EXCLUDED.role, users.role),
      email_verified = EXCLUDED.email_verified,
      last_login = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [uid, email, full_name, phone_number, location, finalProfileImageUrl, role || 'home_finder', email_verified || false, auth_provider || 'email']
  );
  
  return result.rows[0];
}

// Get user by Firebase UID
async function getUserByFirebaseUid(firebaseUid) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE firebase_uid = $1
    `,
    [firebaseUid]
  );
  return result.rows[0];
}

// Get user by email
async function getUserByEmail(email) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE email = $1
    `,
    [email]
  );
  return result.rows[0];
}

// Get user by ID
async function getUserById(id) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE id = $1
    `,
    [id]
  );
  return result.rows[0];
}

// Verify user email
// Verify user email - This should be called when email is verified
async function verifyUserEmail(email) {
  const result = await pool.query(
    `
    UPDATE users 
    SET email_verified = true, 
        updated_at = CURRENT_TIMESTAMP
    WHERE email = $1
    RETURNING *
    `,
    [email]
  );
  return result.rows[0];
}

// Add this new function to sync verification status for admins
async function syncAdminVerification(firebaseUid) {
  const result = await pool.query(
    `
    UPDATE users 
    SET is_verified = true, 
        verification_status = 'verified',
        updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $1 AND role = 'admin'
    RETURNING *
    `,
    [firebaseUid]
  );
  return result.rows[0];
}

// Update last login time
async function updateLastLogin(firebaseUid) {
  const result = await pool.query(
    `
    UPDATE users 
    SET last_login = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $1
    RETURNING *
    `,
    [firebaseUid]
  );
  return result.rows[0];
}

// Update user profile
async function updateUserProfile(firebaseUid, updates) {
  const allowedUpdates = ['full_name', 'phone_number', 'location', 'profile_image_url'];
  
  const updateFields = [];
  const values = [firebaseUid];
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
    WHERE firebase_uid = $1
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Update user role
async function updateUserRole(firebaseUid, newRole) {
  const validRoles = ['home_finder', 'landlord', 'agent', 'movers', 'admin'];
  if (!validRoles.includes(newRole)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }
  
  const result = await pool.query(
    `
    UPDATE users 
    SET role = $1, updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $2
    RETURNING *
    `,
    [newRole, firebaseUid]
  );
  return result.rows[0];
}

// Update landlord's total listings count
async function updateLandlordListingsCount(firebaseUid) {
  const result = await pool.query(
    `
    UPDATE users 
    SET total_listings = (
      SELECT COUNT(*) 
      FROM properties 
      WHERE owner_id = $1
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $1
    RETURNING total_listings
    `,
    [firebaseUid]
  );
  return result.rows[0]?.total_listings || 0;
}

// Update user verification status
async function updateVerificationStatus(firebaseUid, status) {
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
    WHERE firebase_uid = $3
    RETURNING verification_status, is_verified
    `,
    [status, status === 'verified', firebaseUid]
  );
  return result.rows[0];
}

// Update user rating
async function updateUserRating(firebaseUid, newRating) {
  const result = await pool.query(
    `
    UPDATE users 
    SET rating = $1, updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $2
    RETURNING rating
    `,
    [newRating, firebaseUid]
  );
  return result.rows[0];
}

// Get all users with pagination
async function getAllUsers(limit = 50, offset = 0) {
  const result = await pool.query(
    `
    SELECT id, firebase_uid, email, full_name, phone_number, role, 
           profile_image_url, location, is_active, email_verified, 
           auth_provider, total_listings, rating, verification_status,
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
async function deactivateUser(firebaseUid) {
  const result = await pool.query(
    `
    UPDATE users 
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $1
    RETURNING id, email, is_active
    `,
    [firebaseUid]
  );
  return result.rows[0];
}

// Create or update landlord (for backward compatibility)
async function createOrUpdateLandlord(landlordData, profileImageUrl) {
  const { uid, full_name, email, phone_number, location } = landlordData;
  
  const result = await pool.query(
    `
    INSERT INTO users (
      firebase_uid,
      email,
      full_name,
      phone_number,
      location,
      profile_image_url,
      role,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'landlord', CURRENT_TIMESTAMP)
    ON CONFLICT (firebase_uid) 
    DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      phone_number = EXCLUDED.phone_number,
      location = EXCLUDED.location,
      profile_image_url = COALESCE(EXCLUDED.profile_image_url, users.profile_image_url),
      role = 'landlord',
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [uid, email, full_name, phone_number, location, profileImageUrl]
  );
  
  return result.rows[0];
}

// Get landlord by UID
async function getLandlordByUid(uid) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE firebase_uid = $1 AND role = 'landlord'
    `,
    [uid]
  );
  return result.rows[0];
}

// Get landlord by ID
async function getLandlordById(id) {
  const result = await pool.query(
    `
    SELECT * FROM users WHERE id = $1 AND role = 'landlord'
    `,
    [id]
  );
  return result.rows[0];
}

// Update landlord
async function updateLandlord(uid, updates) {
  const allowedUpdates = ['full_name', 'phone_number', 'location', 'profile_image_url'];
  
  const updateFields = [];
  const values = [uid];
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
    WHERE firebase_uid = $1 AND role = 'landlord'
    RETURNING *
  `;
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Update landlord stats
async function updateLandlordStats(uid, totalListings) {
  const result = await pool.query(
    `
    UPDATE users 
    SET total_listings = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE firebase_uid = $1 AND role = 'landlord'
    RETURNING *
    `,
    [uid, totalListings]
  );
  return result.rows[0];
}

module.exports = {
  createOrUpdateUserFromSignup,
  getUserByFirebaseUid,
  getUserByEmail,
  getUserById,
  verifyUserEmail,
  updateLastLogin,
  updateUserProfile,
  updateUserRole,
  updateLandlordListingsCount,
  updateVerificationStatus,
  updateUserRating,
  getAllUsers,
  deactivateUser,
  createOrUpdateLandlord,
  getLandlordByUid,
  getLandlordById,
  updateLandlord,
  updateLandlordStats,
  syncAdminVerification,
};