const pool = require("../config/db");
const userService = require("./user.service");

async function updatePropertyCount(ownerId) {
  return await userService.updateLandlordListingsCount(ownerId);
}

async function createProperty(property, mediaUrls, amenities) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      INSERT INTO properties (
        owner_id,
        title,
        description,
        property_type,
        location_text,
        monthly_rent,
        security_deposit,
        bedrooms,
        bathrooms,
        size_sqm,
        furnished
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
      `,
      [
        property.owner_id,
        property.title,
        property.description,
        property.property_type,
        property.location_text,
        property.monthly_rent,
        property.security_deposit,
        property.bedrooms,
        property.bathrooms,
        property.size_sqm,
        property.furnished,
      ]
    );

    const propertyId = result.rows[0].id;

    // insert media if any
    if (mediaUrls && mediaUrls.length > 0) {
      for (const url of mediaUrls) {
        await client.query(
          `
          INSERT INTO property_media (property_id, url, type)
          VALUES ($1, $2, $3)
          `,
          [
            propertyId,
            url,
            url.includes(".mp4") || url.includes(".mov") ? "video" : "image"
          ]
        );
      }
    }

    // insert amenities if any
    if (amenities && amenities.length > 0) {
      for (const name of amenities) {
        await client.query(
          `
          INSERT INTO property_amenities (property_id, name)
          VALUES ($1, $2)
          `,
          [propertyId, name]
        );
      }
    }

    await client.query("COMMIT");
    
    // Update landlord's total listings count
    await updatePropertyCount(property.owner_id);

    return propertyId;

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release(); // Always release the client back to the pool
  }
}

async function getPropertyById(propertyId) {
  const result = await pool.query(
    `
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
    WHERE p.id = $1
    GROUP BY p.id, u.id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
    `,
    [propertyId]
  );
  
  return result.rows[0];
}

async function getAllProperties(filters = {}) {
  let query = `
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
  
  if (filters.status) {
    query += ` AND p.status = $${paramIndex}`;
    values.push(filters.status);
    paramIndex++;
  }
  
  if (filters.property_type) {
    query += ` AND p.property_type = $${paramIndex}`;
    values.push(filters.property_type);
    paramIndex++;
  }
  
  if (filters.minPrice) {
    query += ` AND p.monthly_rent >= $${paramIndex}`;
    values.push(filters.minPrice);
    paramIndex++;
  }
  
  if (filters.maxPrice) {
    query += ` AND p.monthly_rent <= $${paramIndex}`;
    values.push(filters.maxPrice);
    paramIndex++;
  }
  
  query += ` GROUP BY p.id, u.id, u.full_name, u.profile_image_url, u.rating ORDER BY p.created_at DESC`;
  
  const result = await pool.query(query, values);
  return result.rows;
}

module.exports = { 
  createProperty, 
  getPropertyById, 
  getAllProperties,
  updatePropertyCount 
};