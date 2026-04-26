const express = require("express");
const router = express.Router();
const messageController = require("../controllers/message.controller");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Conversations
router.get("/conversations", messageController.getConversations);
router.get("/conversations/:conversationId", messageController.getConversationById);

// Messages
router.get("/conversations/:conversationId/messages", messageController.getMessages);
router.post("/send", messageController.sendMessage);
router.patch("/conversations/:conversationId/read", messageController.markAsRead);

// Unread count
router.get("/unread/count", messageController.getUnreadCount);

// User status
router.post("/status", messageController.updateStatus);
router.get("/status/:userId", messageController.getUserStatus);

module.exports = router;