const { verifyFirebaseToken } = require("../config/firebase");
const userService = require("../services/user.service");

const wsAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error("Authentication required"));
    }
    
    const decodedToken = await verifyFirebaseToken(token);
    const user = await userService.getUserByFirebaseUid(decodedToken.uid);
    
    if (!user || !user.is_active) {
      return next(new Error("User not found or inactive"));
    }
    
    socket.user = user;
    socket.userId = user.firebase_uid;
    next();
  } catch (error) {
    console.error("WebSocket auth error:", error.message);
    next(new Error("Invalid token"));
  }
};

module.exports = wsAuth;