const pool = require("../config/db");

class MessageService {
  
  async getOrCreateConversation(userId1, userId2) {
    const [smallerId, largerId] = [userId1, userId2].sort();
    
    let result = await pool.query(
      `SELECT * FROM conversations 
       WHERE participant1_id = $1 AND participant2_id = $2`,
      [smallerId, largerId]
    );
    
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO conversations (participant1_id, participant2_id)
         VALUES ($1, $2)
         RETURNING *`,
        [smallerId, largerId]
      );
    }
    
    return result.rows[0];
  }
  
  async getConversationById(conversationId, currentUserId) {
    const result = await pool.query(
      `SELECT 
        c.*,
        CASE 
          WHEN c.participant1_id = $2 THEN 
            jsonb_build_object(
              'id', u2.firebase_uid,
              'name', u2.full_name,
              'avatar', u2.profile_image_url,
              'email', u2.email,
              'role', u2.role
            )
          ELSE 
            jsonb_build_object(
              'id', u1.firebase_uid,
              'name', u1.full_name,
              'avatar', u1.profile_image_url,
              'email', u1.email,
              'role', u1.role
            )
        END as other_user
      FROM conversations c
      LEFT JOIN users u1 ON c.participant1_id = u1.firebase_uid
      LEFT JOIN users u2 ON c.participant2_id = u2.firebase_uid
      WHERE c.id = $1 AND (c.participant1_id = $2 OR c.participant2_id = $2)`,
      [conversationId, currentUserId]
    );
    
    if (result.rows.length === 0) return null;
    
    const conversation = result.rows[0];
    
    const statusResult = await pool.query(
      `SELECT is_online, last_seen FROM user_status WHERE user_id = $1`,
      [conversation.other_user.id]
    );
    
    conversation.other_user.is_online = statusResult.rows[0]?.is_online || false;
    conversation.other_user.last_seen = statusResult.rows[0]?.last_seen;
    
    return conversation;
  }
  
  async getUserConversations(userId) {
    const result = await pool.query(
      `SELECT 
        c.id,
        c.updated_at,
        c.last_message,
        c.last_message_time,
        c.last_message_sender_id,
        CASE 
          WHEN c.participant1_id = $1 THEN 
            jsonb_build_object(
              'id', u2.firebase_uid,
              'name', u2.full_name,
              'avatar', u2.profile_image_url,
              'email', u2.email,
              'role', u2.role
            )
          ELSE 
            jsonb_build_object(
              'id', u1.firebase_uid,
              'name', u1.full_name,
              'avatar', u1.profile_image_url,
              'email', u1.email,
              'role', u1.role
            )
        END as other_user,
        COALESCE(
          (SELECT COUNT(*) FROM messages 
           WHERE conversation_id = c.id 
           AND receiver_id = $1 
           AND is_read = false), 0
        ) as unread_count
      FROM conversations c
      LEFT JOIN users u1 ON c.participant1_id = u1.firebase_uid
      LEFT JOIN users u2 ON c.participant2_id = u2.firebase_uid
      WHERE c.participant1_id = $1 OR c.participant2_id = $1
      ORDER BY c.updated_at DESC`,
      [userId]
    );
    
    for (const conv of result.rows) {
      const statusResult = await pool.query(
        `SELECT is_online, last_seen FROM user_status WHERE user_id = $1`,
        [conv.other_user.id]
      );
      conv.other_user.is_online = statusResult.rows[0]?.is_online || false;
      conv.other_user.last_seen = statusResult.rows[0]?.last_seen;
    }
    
    return result.rows;
  }
  
  async getConversationMessages(conversationId, userId, limit = 50, offset = 0) {
    const checkResult = await pool.query(
      `SELECT id FROM conversations 
       WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)`,
      [conversationId, userId]
    );
    
    if (checkResult.rows.length === 0) {
      throw new Error("Conversation not found");
    }
    
    const result = await pool.query(
      `SELECT 
        id,
        sender_id,
        receiver_id,
        message_text as text,
        is_read,
        read_at,
        created_at as timestamp
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    
    return result.rows.reverse();
  }
  
  async sendMessage(senderId, receiverId, messageText) {
    const conversation = await this.getOrCreateConversation(senderId, receiverId);
    
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, receiver_id, message_text)
       VALUES ($1, $2, $3, $4)
       RETURNING 
        id,
        sender_id,
        receiver_id,
        message_text as text,
        is_read,
        created_at as timestamp`,
      [conversation.id, senderId, receiverId, messageText]
    );
    
    return {
      ...result.rows[0],
      conversation_id: conversation.id
    };
  }
  
  async markMessagesAsRead(conversationId, userId) {
    const result = await pool.query(
      `UPDATE messages
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE conversation_id = $1 
       AND receiver_id = $2 
       AND is_read = false
       RETURNING id`,
      [conversationId, userId]
    );
    
    return result.rows.length;
  }
  
  async getUnreadCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM messages
       WHERE receiver_id = $1 AND is_read = false`,
      [userId]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async updateUserStatus(userId, isOnline) {
  const result = await pool.query(
    `INSERT INTO user_status (user_id, is_online, last_seen)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id)
     DO UPDATE SET 
       is_online = $2,
       last_seen = CASE WHEN $2 = false THEN CURRENT_TIMESTAMP ELSE user_status.last_seen END,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [userId, isOnline]
  );
  
  return result.rows[0];
}
  
  async getUserStatus(userId) {
    const result = await pool.query(
      `SELECT is_online, last_seen FROM user_status WHERE user_id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return { is_online: false, last_seen: null };
    }
    
    return result.rows[0];
  }
}

module.exports = new MessageService();