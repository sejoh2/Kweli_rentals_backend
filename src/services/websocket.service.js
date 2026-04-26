const { Server } = require("socket.io");
const wsAuth = require("../middleware/wsAuth");
const messageService = require("./message.service");

let io;

const initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });
  
  io.use(wsAuth);
  
  io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.user.full_name})`);
    
    // Join user's personal room
    socket.join(`user:${socket.userId}`);
    
    // Update user status to online
    messageService.updateUserStatus(socket.userId, true).then(() => {
      socket.broadcast.emit("user_online", { 
        userId: socket.userId,
        timestamp: new Date()
      });
    });
    
    // Handle joining conversation room
    socket.on("join_conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`📱 User ${socket.userId} joined conversation ${conversationId}`);
    });
    
    // Handle leaving conversation room
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`📱 User ${socket.userId} left conversation ${conversationId}`);
    });
    
    // Handle sending message via WebSocket (real-time)
    socket.on("send_message", async (data, callback) => {
      try {
        const { receiverId, message, conversationId } = data;
        
        if (!message || message.trim().length === 0) {
          throw new Error("Message cannot be empty");
        }
        
        if (message.length > 5000) {
          throw new Error("Message too long (max 5000 characters)");
        }
        
        const newMessage = await messageService.sendMessage(
          socket.userId,
          receiverId,
          message.trim()
        );
        
        io.to(`conversation:${conversationId}`).emit("new_message", newMessage);
        io.to(`user:${receiverId}`).emit("message_received", {
          conversationId: conversationId,
          message: newMessage
        });
        
        socket.emit("message_sent", {
          success: true,
          message: newMessage
        });
        
        if (callback) callback({ success: true, message: newMessage });
      } catch (error) {
        console.error("WebSocket send_message error:", error);
        if (callback) callback({ success: false, error: error.message });
      }
    });
    
    // Handle typing indicator
    socket.on("typing", (data) => {
      const { conversationId, receiverId, isTyping } = data;
      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        userId: socket.userId,
        isTyping: isTyping,
        timestamp: new Date()
      });
    });
    
    // Handle read receipts via WebSocket
    socket.on("mark_read", async (data, callback) => {
      try {
        const { conversationId } = data;
        const count = await messageService.markMessagesAsRead(conversationId, socket.userId);
        
        if (count > 0) {
          io.to(`conversation:${conversationId}`).emit("messages_read", {
            conversationId: conversationId,
            readBy: socket.userId,
            timestamp: new Date()
          });
        }
        
        if (callback) callback({ success: true, count: count });
      } catch (error) {
        console.error("WebSocket mark_read error:", error);
        if (callback) callback({ success: false, error: error.message });
      }
    });
    
    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
      await messageService.updateUserStatus(socket.userId, false);
      socket.broadcast.emit("user_offline", { 
        userId: socket.userId, 
        last_seen: new Date() 
      });
    });
  });
  
  console.log("✅ WebSocket server initialized");
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("WebSocket not initialized. Call initializeWebSocket first.");
  }
  return io;
};

module.exports = { initializeWebSocket, getIO };