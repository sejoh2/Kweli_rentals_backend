const messageService = require("../services/message.service");
const { getIO } = require("../services/websocket.service");

const getConversations = async (req, res) => {
  try {
    const userId = req.user.firebase_uid;
    const conversations = await messageService.getUserConversations(userId);
    
    res.json({
      success: true,
      conversations: conversations
    });
  } catch (error) {
    console.error("Error getting conversations:", error);
    res.status(500).json({ error: error.message });
  }
};

const getConversationById = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.firebase_uid;
    
    const conversation = await messageService.getConversationById(conversationId, userId);
    
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    
    res.json({
      success: true,
      conversation: conversation
    });
  } catch (error) {
    console.error("Error getting conversation:", error);
    res.status(500).json({ error: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.firebase_uid;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const messages = await messageService.getConversationMessages(
      conversationId,
      userId,
      limit,
      offset
    );
    
    res.json({
      success: true,
      messages: messages,
      pagination: { limit, offset }
    });
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({ error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user.firebase_uid;
    
    if (!receiverId || !message) {
      return res.status(400).json({ error: "Receiver ID and message are required" });
    }
    
    if (message.trim().length === 0) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }
    
    if (message.length > 5000) {
      return res.status(400).json({ error: "Message too long (max 5000 characters)" });
    }
    
    if (senderId === receiverId) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }
    
    const newMessage = await messageService.sendMessage(senderId, receiverId, message.trim());
    
    // ✅ ADD THIS: Broadcast via WebSocket
    try {
      const { getIO } = require("../services/websocket.service");
      const io = getIO();
      io.to(`conversation:${newMessage.conversation_id}`).emit("new_message", newMessage);
      io.to(`user:${receiverId}`).emit("message_received", {
        conversationId: newMessage.conversation_id,
        message: newMessage
      });
      console.log(`📡 Broadcasted message to conversation: ${newMessage.conversation_id}`);
    } catch (wsError) {
      console.error("WebSocket broadcast error:", wsError.message);
      // Don't fail the request if WebSocket broadcast fails
    }
    
    res.status(201).json({
      success: true,
      message: newMessage
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.firebase_uid;
    
    const count = await messageService.markMessagesAsRead(conversationId, userId);
    
    // ✅ ADD THIS: Broadcast read receipt via WebSocket
    if (count > 0) {
      try {
        const { getIO } = require("../services/websocket.service");
        const io = getIO();
        io.to(`conversation:${conversationId}`).emit("messages_read", {
          conversationId: conversationId,
          readBy: userId,
          timestamp: new Date()
        });
      } catch (wsError) {
        console.error("WebSocket broadcast error:", wsError.message);
      }
    }
    
    res.json({
      success: true,
      messages_marked_read: count
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.firebase_uid;
    const count = await messageService.getUnreadCount(userId);
    
    res.json({
      success: true,
      unread_count: count
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const userId = req.user.firebase_uid;
    const { is_online } = req.body;
    
    if (typeof is_online !== 'boolean') {
      return res.status(400).json({ error: "is_online must be boolean" });
    }
    
    const status = await messageService.updateUserStatus(userId, is_online);
    
    // ✅ Broadcast status change via WebSocket
    try {
      const io = getIO();
      io.emit(is_online ? "user_online" : "user_offline", {
        userId: userId,
        timestamp: new Date(),
        last_seen: status.last_seen
      });
    } catch (wsError) {
      console.error("WebSocket broadcast error:", wsError.message);
    }
    
    res.json({
      success: true,
      status: {
        is_online: status.is_online,
        last_seen: status.last_seen
      }
    });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: error.message });
  }
};

const getUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await messageService.getUserStatus(userId);
    
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error("Error getting user status:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getConversations,
  getConversationById,
  getMessages,
  sendMessage,
  markAsRead,
  getUnreadCount,
  updateStatus,
  getUserStatus
};