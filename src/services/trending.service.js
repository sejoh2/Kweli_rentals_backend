const pool = require("../config/db");

class TrendingService {
  
  // Update trending score for all properties
  async updateAllTrendingScores() {
    const client = await pool.connect();
    try {
      console.log('📊 Updating trending scores for all properties...');
      
      // Calculate trending score based on:
      // - Recent likes (last 30 days) * 2 points each
      // - Recent views * 0.5 points each  
      // - Recent inquiries * 3 points each
      const result = await client.query(`
        UPDATE properties 
        SET trending_score = 
          COALESCE(recent_likes, 0) * 2.0 +
          COALESCE(recent_views, 0) * 0.5 +
          COALESCE(recent_inquiries, 0) * 3.0,
          last_trending_update = NOW()
        WHERE status != 'occupied'
        RETURNING id, title, trending_score
      `);
      
      console.log(`✅ Updated trending scores for ${result.rows.length} properties`);
      return result.rows;
    } catch (error) {
      console.error('Error updating trending scores:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  // Update trending score for a single property
  async updatePropertyTrendingScore(propertyId) {
    const result = await pool.query(`
      UPDATE properties 
      SET trending_score = 
        COALESCE(recent_likes, 0) * 2.0 +
        COALESCE(recent_views, 0) * 0.5 +
        COALESCE(recent_inquiries, 0) * 3.0,
        last_trending_update = NOW()
      WHERE id = $1 AND status != 'occupied'
      RETURNING trending_score
    `, [propertyId]);
    
    return result.rows[0]?.trending_score || 0;
  }
  
  // Increment view count for a property
  async incrementViewCount(propertyId) {
    const result = await pool.query(`
      UPDATE properties 
      SET recent_views = COALESCE(recent_views, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING recent_views
    `, [propertyId]);
    
    // Update trending score after view
    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }
    
    return result.rows[0];
  }
  
  // Increment inquiry count for a property
  async incrementInquiryCount(propertyId) {
    const result = await pool.query(`
      UPDATE properties 
      SET recent_inquiries = COALESCE(recent_inquiries, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING recent_inquiries
    `, [propertyId]);
    
    // Update trending score after inquiry
    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }
    
    return result.rows[0];
  }
  
  // Increment recent like count (called when someone likes a property)
  async incrementRecentLikeCount(propertyId) {
    const result = await pool.query(`
      UPDATE properties 
      SET recent_likes = COALESCE(recent_likes, 0) + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING recent_likes
    `, [propertyId]);
    
    // Update trending score after like
    if (result.rows[0]) {
      await this.updatePropertyTrendingScore(propertyId);
    }
    
    return result.rows[0];
  }
  
  // Reset weekly stats (run via cron job weekly)
  async resetWeeklyStats() {
    const result = await pool.query(`
      UPDATE properties 
      SET recent_likes = 0,
          recent_views = 0,
          recent_inquiries = 0,
          updated_at = NOW()
      WHERE status != 'occupied'
    `);
    
    console.log(`✅ Reset weekly stats for ${result.rowCount} properties`);
    return result.rowCount;
  }
  
  // Get trending properties (top N by trending_score)
  async getTrendingProperties(limit = 10) {
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
      WHERE p.status != 'occupied' AND p.trending_score > 0
      GROUP BY p.id, u.id, u.full_name, u.email, u.phone_number, u.profile_image_url, u.rating
      ORDER BY p.trending_score DESC
      LIMIT $1
    `, [limit]);
    
    return result.rows;
  }
  
  // Get property with its trending score
  async getPropertyWithTrendingScore(propertyId) {
    const result = await pool.query(`
      SELECT 
        p.*,
        p.trending_score,
        p.recent_likes,
        p.recent_views,
        p.recent_inquiries,
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
    `, [propertyId]);
    
    return result.rows[0];
  }
}

module.exports = new TrendingService();