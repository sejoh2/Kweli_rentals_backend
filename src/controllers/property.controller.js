const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const mediaService = require("../services/media.service");
const propertyService = require("../services/property.service");

exports.uploadMiddleware = upload.array("media", 10);

// Create a new property (authenticated)
exports.createProperty = async (req, res) => {
  try {
    console.log("Starting property creation...");
    
    // Get owner_id from authenticated user
    const owner_id = req.user.firebase_uid;
    console.log("Owner ID:", owner_id);
    
    const files = req.files || [];
    let mediaUrls = [];

    console.log("Number of files:", files.length);

    // Upload media files if provided
    if (files && files.length > 0) {
      for (const file of files) {
        console.log("Uploading file:", file.originalname);
        const url = await mediaService.uploadMedia(file);
        mediaUrls.push(url);
      }
    }

    // Parse amenities
    let amenities = [];
    if (req.body.amenities) {
      try {
        amenities = typeof req.body.amenities === 'string' 
          ? JSON.parse(req.body.amenities) 
          : req.body.amenities;
      } catch (e) {
        amenities = req.body.amenities.split(',').map(a => a.trim());
      }
    }

    // Parse furnished
    let furnished = false;
    if (req.body.furnished) {
      furnished = req.body.furnished === 'true' || req.body.furnished === true;
    }

    // Parse numeric fields
    const monthly_rent = parseFloat(req.body.monthly_rent);
    const security_deposit = req.body.security_deposit ? parseFloat(req.body.security_deposit) : null;
    const bedrooms = req.body.bedrooms ? parseInt(req.body.bedrooms) : null;
    const bathrooms = req.body.bathrooms ? parseFloat(req.body.bathrooms) : null;
    const size_sqm = req.body.size_sqm ? parseFloat(req.body.size_sqm) : null;

    // Validate required fields
    if (!req.body.title) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!req.body.property_type) {
      return res.status(400).json({ error: "Property type is required" });
    }
    if (!req.body.location_text) {
      return res.status(400).json({ error: "Location is required" });
    }
    if (!monthly_rent || isNaN(monthly_rent)) {
      return res.status(400).json({ error: "Valid monthly rent is required" });
    }

    const property = {
      owner_id: owner_id,
      title: req.body.title.trim(),
      description: req.body.description || null,
      property_type: req.body.property_type,
      location_text: req.body.location_text,
      monthly_rent: monthly_rent,
      security_deposit: security_deposit,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      size_sqm: size_sqm,
      furnished: furnished,
    };

    console.log("Creating property with data:", property);

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

// Rest of your controller functions remain the same...
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

exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.firebase_uid;
    const updates = req.body;
    const pool = require("../config/db");
    
    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or you don't have permission" });
    }
    
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

exports.updatePropertyStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const owner_id = req.user.firebase_uid;
    const pool = require("../config/db");

    const validStatuses = ['active', 'pending', 'occupied'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: "Invalid status. Must be one of: active, pending, occupied" 
      });
    }

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

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.firebase_uid;
    const pool = require("../config/db");
    
    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found or you don't have permission" });
    }
    
    await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);
    
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

exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = require("../config/db");
    
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
      values.push(parseFloat(minPrice));
      paramIndex++;
    }
    
    if (maxPrice) {
      sqlQuery += ` AND p.monthly_rent <= $${paramIndex}`;
      values.push(parseFloat(maxPrice));
      paramIndex++;
    }
    
    if (bedrooms) {
      sqlQuery += ` AND p.bedrooms = $${paramIndex}`;
      values.push(parseInt(bedrooms));
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