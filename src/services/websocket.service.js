const { Server } = require("socket.io");
const wsAuth = require("../middleware/wsAuth");
const messageService = require("./message.service");

let io;

const getIO = () => {
  if (!io) {
    throw new Error("WebSocket not initialized. Call initializeWebSocket first.");
  }

  return io;
};

const joinConversationRoomForUsers = (conversationId, userIds = []) => {
  if (!io || !conversationId) return;

  userIds.filter(Boolean).forEach((userId) => {
    io.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
  });
};

const emitConversationUpdated = (conversationId, userIds = [], message = null) => {
  if (!io || !conversationId) return;

  userIds.filter(Boolean).forEach((userId) => {
    io.to(`user:${userId}`).emit("conversation_updated", {
      conversationId,
      message,
      updatedAt: new Date().toISOString()
    });
  });
};

const emitMessageCreated = (message) => {
  if (!io || !message) return;

  const conversationId = message.conversation_id;
  const senderId = message.sender_id;
  const receiverId = message.receiver_id;

  joinConversationRoomForUsers(conversationId, [senderId, receiverId]);

  io.to(`conversation:${conversationId}`).emit("new_message", message);

  io.to(`user:${receiverId}`).emit("message_received", {
    conversationId,
    message
  });

  emitConversationUpdated(conversationId, [senderId, receiverId], message);
};

const emitMessagesRead = (conversationId, readBy) => {
  if (!io || !conversationId || !readBy) return;

  io.to(`conversation:${conversationId}`).emit("messages_read", {
    conversationId,
    readBy,
    timestamp: new Date()
  });

  io.to(`user:${readBy}`).emit("conversation_read", {
    conversationId,
    readBy,
    timestamp: new Date()
  });
};

const initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"]
  });

  io.use(wsAuth);

  io.on("connection", async (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.user.full_name})`);

    socket.join(`user:${socket.userId}`);

    try {
      const conversationIds = await messageService.getUserConversationIds(
        socket.userId
      );

      conversationIds.forEach((convId) => {
        socket.join(`conversation:${convId}`);
      });

      console.log(
        `User ${socket.userId} auto-joined ${conversationIds.length} conversation rooms`
      );
    } catch (err) {
      console.error(
        `Failed to auto-join rooms for ${socket.userId}:`,
        err.message
      );
    }

    messageService.updateUserStatus(socket.userId, true).then(() => {
      socket.broadcast.emit("user_online", {
        userId: socket.userId,
        timestamp: new Date()
      });
    });

    socket.on("join_conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(
        `User ${socket.userId} manually joined conversation ${conversationId}`
      );
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${socket.userId} left conversation ${conversationId}`);
    });

    socket.on("send_message", async (data, callback) => {
      try {
        const { receiverId, message } = data;

        if (!receiverId) {
          throw new Error("Receiver ID is required");
        }

        if (!message || message.trim().length === 0) {
          throw new Error("Message cannot be empty");
        }

        if (message.length > 5000) {
          throw new Error("Message too long (max 5000 characters)");
        }

        if (receiverId === socket.userId) {
          throw new Error("Cannot send message to yourself");
        }

        const newMessage = await messageService.sendMessage(
          socket.userId,
          receiverId,
          message.trim()
        );

        emitMessageCreated(newMessage);

        socket.emit("message_sent", {
          success: true,
          message: newMessage
        });

        if (callback) {
          callback({ success: true, message: newMessage });
        }
      } catch (error) {
        console.error("WebSocket send_message error:", error);

        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on("typing", (data) => {
      const { conversationId, isTyping } = data;

      if (!conversationId) return;

      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        userId: socket.userId,
        isTyping: isTyping === true,
        timestamp: new Date()
      });
    });

    socket.on("mark_read", async (data, callback) => {
      try {
        const { conversationId } = data;

        if (!conversationId) {
          throw new Error("Conversation ID is required");
        }

        const count = await messageService.markMessagesAsRead(
          conversationId,
          socket.userId
        );

        if (count > 0) {
          emitMessagesRead(conversationId, socket.userId);
        }

        if (callback) {
          callback({ success: true, count });
        }
      } catch (error) {
        console.error("WebSocket mark_read error:", error);

        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.userId}`);

      await messageService.updateUserStatus(socket.userId, false);

      socket.broadcast.emit("user_offline", {
        userId: socket.userId,
        last_seen: new Date()
      });
    });
  });

  console.log("WebSocket server initialized");
  return io;
};

module.exports = {
  initializeWebSocket,
  getIO,
  joinConversationRoomForUsers,
  emitConversationUpdated,
  emitMessageCreated,
  emitMessagesRead
};