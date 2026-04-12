const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const mediaService = require("../services/media.service");
const propertyService = require("../services/property.service");

exports.uploadMiddleware = upload.array("media", 10);

// Create a new property (authenticated)
exports.createProperty = async (req, res) => {
  try {
    // Get owner_id from authenticated user
    const owner_id = req.user.firebase_uid;
    
    const files = req.files;
    let mediaUrls = [];

    // Upload media files if provided
    if (files && files.length > 0) {
      for (const file of files) {
        const url = await mediaService.uploadMedia(file);
        mediaUrls.push(url);
      }
    }

    const amenities = JSON.parse(req.body.amenities || "[]");

    const property = {
      owner_id: owner_id,
      title: req.body.title,
      description: req.body.description,
      property_type: req.body.property_type,
      location_text: req.body.location_text,
      monthly_rent: req.body.monthly_rent,
      security_deposit: req.body.security_deposit,
      bedrooms: req.body.bedrooms,
      bathrooms: req.body.bathrooms,
      size_sqm: req.body.size_sqm,
      furnished: req.body.furnished === 'true' || req.body.furnished === true,
    };

    const id = await propertyService.createProperty(property, mediaUrls, amenities);

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      propertyId: id,
    });
  } catch (err) {
    console.error("Error creating property:", err);
    res.status(500).json({
      error: err.message,
    });
  }
};

// Get all properties (public)
exports.getAllProperties = async (req, res) => {
  try {
    const pool = require("../config/db");
    
    const result = await pool.query(`
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'phone_number', u.phone_number,
          'profile_image_url', u.profile_image_url,
          'rating', u.rating
        ) as owner,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pm.id,
            'url', pm.url,
            'type', pm.type
          )) FILTER (WHERE pm.id IS NOT NULL), 
          '[]'
        ) as media,
        COALESCE(
          json_agg(DISTINCT pa.name) FILTER (WHERE pa.name IS NOT NULL),
          '[]'
        ) as amenities
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.firebase_uid
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      GROUP BY p.id, u.id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
      ORDER BY p.created_at DESC
    `);
    
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get properties by owner ID (public)
exports.getPropertiesByOwnerId = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const pool = require("../config/db");
    
    const result = await pool.query(`
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'phone_number', u.phone_number,
          'profile_image_url', u.profile_image_url,
          'rating', u.rating
        ) as owner,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pm.id,
            'url', pm.url,
            'type', pm.type
          )) FILTER (WHERE pm.id IS NOT NULL), 
          '[]'
        ) as media,
        COALESCE(
          json_agg(DISTINCT pa.name) FILTER (WHERE pa.name IS NOT NULL),
          '[]'
        ) as amenities
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.firebase_uid
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.owner_id = $1
      GROUP BY p.id, u.id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
      ORDER BY p.created_at DESC
    `, [ownerId]);
    
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching properties by owner:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get my properties (authenticated user's own properties)
exports.getMyProperties = async (req, res) => {
  try {
    const owner_id = req.user.firebase_uid;
    const pool = require("../config/db");
    
    const result = await pool.query(`
      SELECT 
        p.*,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pm.id,
            'url', pm.url,
            'type', pm.type
          )) FILTER (WHERE pm.id IS NOT NULL), 
          '[]'
        ) as media,
        COALESCE(
          json_agg(DISTINCT pa.name) FILTER (WHERE pa.name IS NOT NULL),
          '[]'
        ) as amenities
      FROM properties p
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.owner_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [owner_id]);
    
    res.json({
      success: true,
      properties: result.rows
    });
  } catch (err) {
    console.error("Error fetching my properties:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get single property by ID (public)
exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = require("../config/db");
    
    const result = await pool.query(`
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'email', u.email,
          'phone_number', u.phone_number,
          'profile_image_url', u.profile_image_url,
          'rating', u.rating,
          'total_listings', u.total_listings,
          'joined_at', u.created_at
        ) as owner,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pm.id,
            'url', pm.url,
            'type', pm.type
          )) FILTER (WHERE pm.id IS NOT NULL), 
          '[]'
        ) as media,
        COALESCE(
          json_agg(DISTINCT pa.name) FILTER (WHERE pa.name IS NOT NULL),
          '[]'
        ) as amenities
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.firebase_uid
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.id = $1
      GROUP BY p.id, u.id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating, u.total_listings, u.created_at
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching property:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update property (authenticated owner only)
exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.firebase_uid;
    const updates = req.body;
    const pool = require("../config/db");
    
    // First check if property exists and belongs to user
    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or you don't have permission" });
    }
    
    // Build dynamic update query
    const allowedUpdates = ['title', 'description', 'property_type', 'location_text', 
                           'monthly_rent', 'security_deposit', 'bedrooms', 'bathrooms', 
                           'size_sqm', 'furnished'];
    
    const updateFields = [];
    const values = [id];
    let paramIndex = 2;
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key) && updates[key] !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(updates[key]);
        paramIndex++;
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    
    const query = `
      UPDATE properties 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: "Property updated successfully",
      property: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating property:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update property status (authenticated owner only)
exports.updatePropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const owner_id = req.user.firebase_uid;
    const pool = require("../config/db");

    // Validate status
    const validStatuses = ['active', 'pending', 'occupied'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: "Invalid status. Must be one of: active, pending, occupied" 
      });
    }

    // Check if property exists and belongs to user
    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or you don't have permission" });
    }

    const result = await pool.query(
      `UPDATE properties 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING id, title, status`,
      [status, id]
    );

    res.json({
      success: true,
      message: `Property status updated to ${status}`,
      property: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating property status:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete property (authenticated owner only)
exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.firebase_uid;
    const pool = require("../config/db");
    
    // Check if property exists and belongs to user
    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or you don't have permission" });
    }
    
    // Delete property (cascade will delete media and amenities)
    await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);
    
    // Update landlord's total listings count
    const userService = require("../services/user.service");
    await userService.updateLandlordListingsCount(owner_id);
    
    res.json({
      success: true,
      message: "Property deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting property:", err);
    res.status(500).json({ error: err.message });
  }
};

// Like/Unlike property
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = require("../config/db");
    
    // Increment or decrement likes
    const result = await pool.query(
      `UPDATE properties 
       SET likes = likes + 1 
       WHERE id = $1 
       RETURNING likes`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }
    
    res.json({
      success: true,
      likes: result.rows[0].likes
    });
  } catch (err) {
    console.error("Error toggling like:", err);
    res.status(500).json({ error: err.message });
  }
};

// Search properties
exports.searchProperties = async (req, res) => {
  try {
    const { query, minPrice, maxPrice, bedrooms, property_type, location } = req.query;
    const pool = require("../config/db");
    
    let sqlQuery = `
      SELECT 
        p.*,
        jsonb_build_object(
          'id', u.id,
          'full_name', u.full_name,
          'profile_image_url', u.profile_image_url,
          'rating', u.rating
        ) as owner,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', pm.id,
            'url', pm.url,
            'type', pm.type
          )) FILTER (WHERE pm.id IS NOT NULL), 
          '[]'
        ) as media,
        COALESCE(
          json_agg(DISTINCT pa.name) FILTER (WHERE pa.name IS NOT NULL),
          '[]'
        ) as amenities
      FROM properties p
      LEFT JOIN users u ON p.owner_id = u.firebase_uid
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramIndex = 1;
    
    if (query) {
      sqlQuery += ` AND (p.title ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      values.push(`%${query}%`);
      paramIndex++;
    }
    
    if (minPrice) {
      sqlQuery += ` AND p.monthly_rent >= $${paramIndex}`;
      values.push(minPrice);
      paramIndex++;
    }
    
    if (maxPrice) {
      sqlQuery += ` AND p.monthly_rent <= $${paramIndex}`;
      values.push(maxPrice);
      paramIndex++;
    }
    
    if (bedrooms) {
      sqlQuery += ` AND p.bedrooms = $${paramIndex}`;
      values.push(bedrooms);
      paramIndex++;
    }
    
    if (property_type) {
      sqlQuery += ` AND p.property_type = $${paramIndex}`;
      values.push(property_type);
      paramIndex++;
    }
    
    if (location) {
      sqlQuery += ` AND p.location_text ILIKE $${paramIndex}`;
      values.push(`%${location}%`);
      paramIndex++;
    }
    
    sqlQuery += ` GROUP BY p.id, u.id, u.full_name, u.profile_image_url, u.rating ORDER BY p.created_at DESC`;
    
    const result = await pool.query(sqlQuery, values);
    
    res.json({
      success: true,
      count: result.rows.length,
      properties: result.rows
    });
  } catch (err) {
    console.error("Error searching properties:", err);
    res.status(500).json({ error: err.message });
  }
};