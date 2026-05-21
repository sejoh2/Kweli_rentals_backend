const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const mediaService = require("../services/media.service");
const propertyService = require("../services/property.service");
const trendingService = require("../services/trending.service");
const geocodingService = require("../services/geocoding.service");

exports.uploadMiddleware = upload.array("media", 10);

const emitPropertyEvent = (eventName, payload) => {
  try {
    const { getIO } = require("../services/websocket.service");
    getIO().emit(eventName, payload);
  } catch (socketError) {
    console.error(`Failed to emit ${eventName}:`, socketError.message);
  }
};

// Create a new property (authenticated)
exports.createProperty = async (req, res) => {
  try {
    console.log("Starting property creation...");
    console.log("Headers:", req.headers);
    console.log("User:", req.user);

    if (!req.user) {
      console.error("No user found in request");
      return res.status(401).json({ error: "User not authenticated" });
    }

    const owner_id = req.user.user_id;
    if (!owner_id) {
      console.error("No user_id found in user");
      return res.status(401).json({ error: "User ID not found" });
    }

    console.log("Owner ID:", owner_id);

    const files = req.files || [];
    const mediaUrls = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          console.log("Uploading file:", file.originalname);
          const url = await mediaService.uploadMedia(file);
          mediaUrls.push(url);
        } catch (uploadError) {
          console.error("Error uploading file:", uploadError.message);
        }
      }
    }

    let amenities = [];
    if (req.body.amenities) {
      try {
        amenities =
          typeof req.body.amenities === "string"
            ? JSON.parse(req.body.amenities)
            : req.body.amenities;
      } catch (e) {
        amenities = req.body.amenities.split(",").map((a) => a.trim());
      }
    }

    const furnished =
      req.body.furnished === "true" || req.body.furnished === true;

    const parseOptionalFloat = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    const monthly_rent = parseFloat(req.body.monthly_rent);
    const security_deposit = parseOptionalFloat(req.body.security_deposit);
    const bedrooms = req.body.bedrooms ? parseInt(req.body.bedrooms) : null;
    const bathrooms = parseOptionalFloat(req.body.bathrooms);
    const size_sqm = parseOptionalFloat(req.body.size_sqm);

    let latitude = parseOptionalFloat(req.body.latitude);
    let longitude = parseOptionalFloat(req.body.longitude);
    let location_text = req.body.location_text?.toString().trim() || "";

    const resolvedLocation = await geocodingService.resolvePropertyLocation({
      locationText: location_text,
      latitude,
      longitude,
    });

    location_text = resolvedLocation.locationText;
    latitude = resolvedLocation.latitude;
    longitude = resolvedLocation.longitude;

    if (!req.body.title) {
      return res.status(400).json({ error: "Title is required" });
    }

    if (!req.body.property_type) {
      return res.status(400).json({ error: "Property type is required" });
    }

    if (!location_text) {
      return res.status(400).json({ error: "Location is required" });
    }

    if (!monthly_rent || Number.isNaN(monthly_rent)) {
      return res.status(400).json({ error: "Valid monthly rent is required" });
    }

    const property = {
      owner_id,
      title: req.body.title.trim(),
      description: req.body.description || null,
      property_type: req.body.property_type,
      location_text,
      latitude,
      longitude,
      monthly_rent,
      security_deposit,
      bedrooms,
      bathrooms,
      size_sqm,
      furnished,
    };

    console.log("Creating property with data:", property);

    const id = await propertyService.createProperty(
      property,
      mediaUrls,
      amenities
    );

    emitPropertyEvent("property_created", {
      propertyId: id,
      ownerId: owner_id,
    });

    res.status(201).json({
      success: true,
      message: "Property created successfully",
      propertyId: id,
      location: {
        location_text,
        latitude,
        longitude,
      },
    });
  } catch (err) {
    console.error("Error creating property:", err);
    res.status(500).json({
      error: err.message,
    });
  }
};

// Get all properties (public) - Filter out occupied properties
exports.getAllProperties = async (req, res) => {
  try {
    const pool = require("../config/db");
    const viewerId = req.user?.user_id || null;

    const result = await pool.query(
      `
      SELECT 
        p.*,
        EXISTS (
          SELECT 1
          FROM property_likes pl
          WHERE pl.property_id = p.id
            AND pl.user_id = $1::varchar
        ) AS is_liked,
        jsonb_build_object(
          'id', u.id,
          'user_id', u.user_id,
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
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.status != 'occupied'
      GROUP BY p.id, u.id, u.user_id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
      ORDER BY p.created_at DESC
    `,
      [viewerId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching properties:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getTrendingProperties = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 4;
    const viewerId = req.user?.user_id || null;

    const trending = await trendingService.getTrendingProperties(
      limit,
      viewerId
    );

    res.json({
      success: true,
      count: trending.length,
      properties: trending,
    });
  } catch (err) {
    console.error("Error fetching trending properties:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.incrementView = async (req, res) => {
  try {
    const { id } = req.params;
    await trendingService.incrementViewCount(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error incrementing view count:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.incrementInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    await trendingService.incrementInquiryCount(id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error incrementing inquiry count:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getPropertiesByOwnerId = async (req, res) => {
  try {
    const { ownerId } = req.params;
    const viewerId = req.user?.user_id || null;
    const pool = require("../config/db");

    const result = await pool.query(
      `
      SELECT 
        p.*,
        EXISTS (
          SELECT 1
          FROM property_likes pl
          WHERE pl.property_id = p.id
            AND pl.user_id = $2::varchar
        ) AS is_liked,
        jsonb_build_object(
          'id', u.id,
          'user_id', u.user_id,
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
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.owner_id = $1
      GROUP BY p.id, u.id, u.user_id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
      ORDER BY p.created_at DESC
    `,
      [ownerId, viewerId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching properties by owner:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getMyProperties = async (req, res) => {
  try {
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const owner_id = req.user.user_id;
    const pool = require("../config/db");

    const result = await pool.query(
      `
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
    `,
      [owner_id]
    );

    res.json({
      success: true,
      properties: result.rows,
    });
  } catch (err) {
    console.error("Error fetching my properties:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user?.user_id || null;

    const property = await trendingService.getPropertyWithTrendingScore(
      id,
      viewerId
    );

    if (!property) {
      return res.status(404).json({ error: "Property not found" });
    }

    res.json(property);
  } catch (err) {
    console.error("Error fetching property:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.user_id;
    const updates = req.body;
    const pool = require("../config/db");

    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );

    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Property not found or you don't have permission" });
    }

    const allowedUpdates = [
      "title",
      "description",
      "property_type",
      "location_text",
      "monthly_rent",
      "security_deposit",
      "bedrooms",
      "bathrooms",
      "size_sqm",
      "furnished",
    ];

    const updateFields = [];
    const values = [id];
    let paramIndex = 2;

    Object.keys(updates).forEach((key) => {
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
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await pool.query(query, values);

    emitPropertyEvent("property_updated", {
      propertyId: id,
      ownerId: owner_id,
      property: result.rows[0],
    });

    res.json({
      success: true,
      message: "Property updated successfully",
      property: result.rows[0],
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
    const owner_id = req.user.user_id;
    const pool = require("../config/db");

    const validStatuses = ["active", "pending", "occupied"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status. Must be one of: active, pending, occupied",
      });
    }

    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );

    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Property not found or you don't have permission" });
    }

    const result = await pool.query(
      `UPDATE properties 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 
       RETURNING id, title, status`,
      [status, id]
    );

    emitPropertyEvent("property_updated", {
      propertyId: id,
      ownerId: owner_id,
      status,
      property: result.rows[0],
    });

    res.json({
      success: true,
      message: `Property status updated to ${status}`,
      property: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating property status:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const owner_id = req.user.user_id;
    const pool = require("../config/db");

    const checkResult = await pool.query(
      `SELECT id FROM properties WHERE id = $1 AND owner_id = $2`,
      [id, owner_id]
    );

    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Property not found or you don't have permission" });
    }

    await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);

    const userService = require("../services/user.service");
    await userService.updateLandlordListingsCount(owner_id);

    emitPropertyEvent("property_deleted", {
      propertyId: id,
      ownerId: owner_id,
    });

    res.json({
      success: true,
      message: "Property deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting property:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.toggleLike = async (req, res) => {
  const pool = require("../config/db");
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const userId = req.user?.user_id;

    if (!userId) {
      return res.status(401).json({ error: "Please log in to like properties" });
    }

    await client.query("BEGIN");

    const propertyResult = await client.query(
      `SELECT id FROM properties WHERE id = $1 AND status != 'occupied'`,
      [id]
    );

    if (propertyResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Property not found" });
    }

    const insertResult = await client.query(
      `
      INSERT INTO property_likes (property_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (property_id, user_id) DO NOTHING
      RETURNING id
    `,
      [id, userId]
    );

    let liked = false;
    let propertyStats;

    if (insertResult.rows.length > 0) {
      liked = true;

      const updateResult = await client.query(
        `
        UPDATE properties
        SET likes = COALESCE(likes, 0) + 1,
            recent_likes = COALESCE(recent_likes, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING likes, recent_likes
      `,
        [id]
      );

      propertyStats = updateResult.rows[0];
    } else {
      liked = false;

      await client.query(
        `
        DELETE FROM property_likes
        WHERE property_id = $1 AND user_id = $2
      `,
        [id, userId]
      );

      const updateResult = await client.query(
        `
        UPDATE properties
        SET likes = GREATEST(COALESCE(likes, 0) - 1, 0),
            recent_likes = GREATEST(COALESCE(recent_likes, 0) - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING likes, recent_likes
      `,
        [id]
      );

      propertyStats = updateResult.rows[0];
    }

    await client.query("COMMIT");

    const trendingScore = await trendingService.updatePropertyTrendingScore(id);

    emitPropertyEvent("property_updated", {
      propertyId: id,
      likes: propertyStats.likes,
      recentLikes: propertyStats.recent_likes,
      trendingScore,
    });

    res.json({
      success: true,
      liked,
      likes: propertyStats.likes,
      recent_likes: propertyStats.recent_likes,
      trending_score: trendingScore,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error toggling like:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.searchProperties = async (req, res) => {
  try {
    const { query, minPrice, maxPrice, bedrooms, property_type, location } =
      req.query;
    const pool = require("../config/db");
    const viewerId = req.user?.user_id || null;

    let sqlQuery = `
      SELECT 
        p.*,
        EXISTS (
          SELECT 1
          FROM property_likes pl
          WHERE pl.property_id = p.id
            AND pl.user_id = $1::varchar
        ) AS is_liked,
        jsonb_build_object(
          'id', u.id,
          'user_id', u.user_id,
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
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.status != 'occupied'
    `;

    const values = [viewerId];
    let paramIndex = 2;

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

    sqlQuery += `
      GROUP BY p.id, u.id, u.user_id, u.full_name, u.profile_image_url, u.rating
      ORDER BY p.created_at DESC
    `;

    const result = await pool.query(sqlQuery, values);

    res.json({
      success: true,
      count: result.rows.length,
      properties: result.rows,
    });
  } catch (err) {
    console.error("Error searching properties:", err);
    res.status(500).json({ error: err.message });
  }
};