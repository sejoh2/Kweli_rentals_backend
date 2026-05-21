const pool = require("../config/db");

class TrendingService {
  _scoreExpression() {
    return `
      COALESCE(recent_likes, 0) * 2.0 +
      COALESCE(recent_views, 0) * 0.5 +
      COALESCE(recent_inquiries, 0) * 3.0
    `;
  }

  // Update trending score for all properties
  async updateAllTrendingScores() {
    const client = await pool.connect();

    try {
      console.log("Updating trending scores for all properties...");

      const result = await client.query(`
        UPDATE properties
        SET trending_score = ${this._scoreExpression()},
            last_trending_update = NOW()
        WHERE status != 'occupied'
        RETURNING id, title, trending_score
      `);

      console.log(`Updated trending scores for ${result.rows.length} properties`);
      return result.rows;
    } catch (error) {
      console.error("Error updating trending scores:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Update trending score for a single property
  async updatePropertyTrendingScore(propertyId) {
    const result = await pool.query(
      `
      UPDATE properties
      SET trending_score = ${this._scoreExpression()},
          last_trending_update = NOW()
      WHERE id = $1 AND status != 'occupied'
      RETURNING trending_score
    `,
      [propertyId]
    );

    return result.rows[0]?.trending_score || 0;
  }

  // Increment view count for a property
  async incrementViewCount(propertyId) {
    const result = await pool.query(
      `
      UPDATE properties
      SET recent_views = COALESCE(recent_views, 0) + 1,
          updated_at = NOW()
      WHERE id = $1 AND status != 'occupied'
      RETURNING recent_views
    `,
      [propertyId]
    );

    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }

    return result.rows[0];
  }

  // Increment inquiry count for a property
  async incrementInquiryCount(propertyId) {
    const result = await pool.query(
      `
      UPDATE properties
      SET recent_inquiries = COALESCE(recent_inquiries, 0) + 1,
          updated_at = NOW()
      WHERE id = $1 AND status != 'occupied'
      RETURNING recent_inquiries
    `,
      [propertyId]
    );

    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }

    return result.rows[0];
  }

  // Increment recent like count
  async incrementRecentLikeCount(propertyId) {
    const result = await pool.query(
      `
      UPDATE properties
      SET recent_likes = COALESCE(recent_likes, 0) + 1,
          updated_at = NOW()
      WHERE id = $1 AND status != 'occupied'
      RETURNING recent_likes
    `,
      [propertyId]
    );

    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }

    return result.rows[0];
  }

  // Reset weekly stats
  async resetWeeklyStats() {
    const result = await pool.query(`
      UPDATE properties
      SET recent_likes = 0,
          recent_views = 0,
          recent_inquiries = 0,
          trending_score = 0,
          last_trending_update = NOW(),
          updated_at = NOW()
      WHERE status != 'occupied'
    `);

    console.log(`Reset weekly stats for ${result.rowCount} properties`);
    return result.rowCount;
  }

  async _getTrendingSlotCount(requestedLimit) {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS active_count
      FROM properties
      WHERE status = 'active'
    `);

    const activeCount = result.rows[0]?.active_count || 0;

    if (activeCount < 4) {
      return 0;
    }

    const requested = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : 4;

    const percentageBasedSlots = Math.floor(activeCount * 0.25);
    const slots = Math.min(requested, 4, percentageBasedSlots, activeCount - 1);

    return Math.max(slots, 1);
  }

  // Get only the strongest properties as trending.
  // This keeps trending as a featured ranked slice, not a second "all properties" list.
  async getTrendingProperties(limit = 4) {
    const requestedLimit = parseInt(limit, 10) || 4;
    const slotCount = await this._getTrendingSlotCount(requestedLimit);

    if (slotCount === 0) {
      return [];
    }

    const result = await pool.query(
      `
      WITH ranked_properties AS (
        SELECT
          p.*,
          (${this._scoreExpression()}) AS calculated_trending_score,
          ROW_NUMBER() OVER (
            ORDER BY
              (${this._scoreExpression()}) DESC,
              COALESCE(p.recent_inquiries, 0) DESC,
              COALESCE(p.recent_likes, 0) DESC,
              COALESCE(p.recent_views, 0) DESC,
              p.updated_at DESC
          ) AS trend_rank
        FROM properties p
        WHERE p.status = 'active'
          AND (
            COALESCE(p.recent_likes, 0) > 0
            OR COALESCE(p.recent_views, 0) > 0
            OR COALESCE(p.recent_inquiries, 0) > 0
          )
      )
      SELECT
        p.*,
        p.calculated_trending_score AS trending_score,
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
      FROM ranked_properties p
      LEFT JOIN users u ON p.owner_id = u.user_id
      LEFT JOIN property_media pm ON p.id = pm.property_id
      LEFT JOIN property_amenities pa ON p.id = pa.property_id
      WHERE p.trend_rank <= $1
      GROUP BY
        p.id,
        p.owner_id,
        p.title,
        p.description,
        p.property_type,
        p.location_text,
        p.latitude,
        p.longitude,
        p.monthly_rent,
        p.security_deposit,
        p.bedrooms,
        p.bathrooms,
        p.size_sqm,
        p.furnished,
        p.status,
        p.likes,
        p.trending_score,
        p.recent_likes,
        p.recent_views,
        p.recent_inquiries,
        p.last_trending_update,
        p.created_at,
        p.updated_at,
        p.calculated_trending_score,
        p.trend_rank,
        u.id,
        u.user_id,
        u.full_name,
        u.email,
        u.phone_number,
        u.profile_image_url,
        u.rating
      ORDER BY
        p.calculated_trending_score DESC,
        COALESCE(p.recent_inquiries, 0) DESC,
        COALESCE(p.recent_likes, 0) DESC,
        COALESCE(p.recent_views, 0) DESC,
        p.updated_at DESC
    `,
      [slotCount]
    );

    return result.rows;
  }

  // Get property with its trending score
  async getPropertyWithTrendingScore(propertyId) {
    const result = await pool.query(
      `
      SELECT
        p.*,
        p.trending_score,
        p.recent_likes,
        p.recent_views,
        p.recent_inquiries,
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
      WHERE p.id = $1
      GROUP BY p.id, u.id, u.user_id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
    `,
      [propertyId]
    );

    return result.rows[0];
  }
}

module.exports = new TrendingService();