import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { JWT_SECRET } from "../../config/env.js";
import User from "../user/user.model.js";
import Conversation from "./conversation.model.js";
import { sendMessage } from "./chat.service.js";

let io = null;

/**
 * Socket.IO Authentication Middleware (Handshake JWT Verification)
 * AC: Socket chỉ cho User đã xác thực kết nối
 */
export const socketAuthMiddleware = async (socket, next) => {
  try {
    let token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization ||
      socket.handshake.query?.token;

    if (!token) {
      const error = new Error("Authentication error: Token required");
      error.data = { errorCode: "UNAUTHORIZED", message: "Token missing" };
      return next(error);
    }

    if (typeof token === "string") {
      token = token.replace(/^"(.*)"$/, "$1").trim();
      if (token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
      }
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.id).select("-passwordHash");
    if (!user) {
      const error = new Error("Authentication error: User not found");
      error.data = { errorCode: "UNAUTHORIZED", message: "User not found" };
      return next(error);
    }

    socket.user = user;
    socket.userId = user._id.toString();
    socket.userRole = user.role;

    console.log(`🟢 [Socket.IO] Authenticated socket ${socket.id} for user ${user.email} (${user.role})`);

    return next();
  } catch (err) {
    let message = "Authentication error: Invalid or expired token";
    let errorCode = "INVALID_TOKEN";

    if (err.name === "TokenExpiredError") {
      message = "Authentication error: Token expired";
      errorCode = "TOKEN_EXPIRED";
    }

    const error = new Error(message);
    error.data = { errorCode, message };
    return next(error);
  }
};

/**
 * Khởi tạo Socket.IO Server
 */
export const initSocketServer = (httpServer, customOptions = {}) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    ...customOptions,
  });

  // Gắn authentication middleware vào socket handshake
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    // Tự động join room cá nhân để nhận thông báo real-time theo user ID
    socket.join(`user:${socket.userId}`);
    if (socket.userRole === "SHOP_OWNER") {
      socket.join("role:SHOP_OWNER");
    }

    /**
     * AC: Chỉ participant mới join được room; User không thể đọc conversation của User khác
     */
    const handleJoinRoom = async (data, callback) => {
      try {
        const originalId = typeof data === "string" ? data : data?.conversationId;
        const rawConvId = (originalId || "").toString().replace(/_(RENT|THRIFT)$/, "");

        if (!rawConvId || !mongoose.Types.ObjectId.isValid(rawConvId)) {
          const res = {
            success: false,
            errorCode: "INVALID_ID",
            error: "Invalid conversation ID",
          };
          socket.emit("room_error", res);
          if (typeof callback === "function") callback(res);
          return;
        }

        const conversation = await Conversation.findById(rawConvId);
        if (!conversation) {
          const res = {
            success: false,
            errorCode: "CONVERSATION_NOT_FOUND",
            error: "Conversation not found",
          };
          socket.emit("room_error", res);
          if (typeof callback === "function") callback(res);
          return;
        }

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === socket.userId
        );

        if (!isParticipant) {
          const res = {
            success: false,
            errorCode: "FORBIDDEN",
            error: "Forbidden: You are not a participant in this conversation",
          };
          socket.emit("room_error", res);
          if (typeof callback === "function") callback(res);
          return;
        }

        // Chỉ participant mới được join room
        socket.join(rawConvId);
        if (originalId && originalId.toString() !== rawConvId) {
          socket.join(originalId.toString());
        }

        const res = {
          success: true,
          conversationId: rawConvId,
          message: "Joined conversation room successfully",
        };
        socket.emit("joined_room", res);
        if (typeof callback === "function") callback(res);
      } catch (err) {
        const res = {
          success: false,
          errorCode: "INTERNAL_ERROR",
          error: err.message,
        };
        socket.emit("room_error", res);
        if (typeof callback === "function") callback(res);
      }
    };

    socket.on("join_room", handleJoinRoom);
    socket.on("join_conversation", handleJoinRoom);

    /**
     * Rời khỏi room
     */
    const handleLeaveRoom = (data, callback) => {
      const originalId =
        typeof data === "string" ? data : data?.conversationId;
      if (originalId) {
        const rawConvId = originalId.toString().replace(/_(RENT|THRIFT)$/, "");
        socket.leave(rawConvId);
        socket.leave(originalId.toString());
        const res = {
          success: true,
          conversationId: rawConvId,
        };
        socket.emit("left_room", res);
        if (typeof callback === "function") callback(res);
      }
    };

    socket.on("leave_room", handleLeaveRoom);
    socket.on("leave_conversation", handleLeaveRoom);

    /**
     * Gửi tin nhắn qua Socket
     */
    socket.on("send_message", async (data, callback) => {
      try {
        const { conversationId, text, imageUrl, token: clientToken } = data || {};

        let senderId = socket.userId;
        if (clientToken) {
          try {
            let t = clientToken;
            if (typeof t === "string") {
              t = t.replace(/^"(.*)"$/, "$1").trim();
              if (t.startsWith("Bearer ")) t = t.slice(7).trim();
            }
            const decoded = jwt.verify(t, JWT_SECRET);
            if (decoded?.id) {
              senderId = decoded.id.toString();
              socket.userId = senderId;
              const freshUser = await User.findById(decoded.id).select("-passwordHash");
              if (freshUser) {
                socket.user = freshUser;
                socket.userRole = freshUser.role;
              }
            }
          } catch (tErr) {
            console.warn("⚠️ [Socket.IO] Client token verification notice:", tErr.message);
          }
        }

        const result = await sendMessage({
          conversationId,
          senderId,
          text,
          imageUrl,
          serviceType: data?.serviceType,
        });

        const messageObj = result.message.toObject
          ? result.message.toObject()
          : { ...result.message };
        messageObj.serviceType = result.message.serviceType || result.conversation.serviceType || "RENT";
        if (data?.clientMsgId) {
          messageObj.clientMsgId = data.clientMsgId;
        }

        // 1. Broadcast tin nhắn tới các thành viên khác trong room conversationId
        const rawConvId = conversationId.toString().replace(/_(RENT|THRIFT)$/, "");
        socket.to(rawConvId).emit("new_message", messageObj);
        socket.to(conversationId.toString()).emit("new_message", messageObj);

        // 2. Broadcast tin nhắn tới room cá nhân của từng participant (để nhận tin khi đứng ở trang bất kỳ)
        result.conversation.participants.forEach((participantId) => {
          const pIdStr = participantId._id
            ? participantId._id.toString()
            : participantId.toString();
          if (pIdStr !== senderId) {
            io.to(`user:${pIdStr}`).emit("new_message", messageObj);
          }
        });

        // 3. Phát tín hiệu cập nhật conversation tới room cá nhân của các participants
        result.conversation.participants.forEach((participantId) => {
          const pIdStr = participantId._id
            ? participantId._id.toString()
            : participantId.toString();
          io.to(`user:${pIdStr}`).emit(
            "conversation_updated",
            result.conversation
          );
        });

        if (typeof callback === "function") {
          callback({ success: true, data: messageObj, message: messageObj });
        }
      } catch (err) {
        const res = {
          success: false,
          errorCode: err.errorCode || "SEND_MESSAGE_FAILED",
          error: err.message,
        };
        socket.emit("message_error", res);
        if (typeof callback === "function") callback(res);
      }
    });

    /**
     * Typing indicators
     */
    socket.on("typing", (data) => {
      const conversationId = data?.conversationId;
      if (conversationId) {
        const rawConvId = conversationId.toString().replace(/_(RENT|THRIFT)$/, "");
        socket.to(rawConvId).emit("user_typing", {
          conversationId: rawConvId,
          userId: socket.userId,
          fullName: socket.user.fullName,
        });
        if (conversationId.toString() !== rawConvId) {
          socket.to(conversationId.toString()).emit("user_typing", {
            conversationId: conversationId.toString(),
            userId: socket.userId,
            fullName: socket.user.fullName,
          });
        }
      }
    });

    socket.on("stop_typing", (data) => {
      const conversationId = data?.conversationId;
      if (conversationId) {
        const rawConvId = conversationId.toString().replace(/_(RENT|THRIFT)$/, "");
        socket.to(rawConvId).emit("user_stop_typing", {
          conversationId: rawConvId,
          userId: socket.userId,
        });
        if (conversationId.toString() !== rawConvId) {
          socket.to(conversationId.toString()).emit("user_stop_typing", {
            conversationId: conversationId.toString(),
            userId: socket.userId,
          });
        }
      }
    });

    socket.on("disconnect", () => {
      // Socket tự động leave tất cả các rooms khi disconnect
    });
  });

  return io;
};

/**
 * Lấy instance của Socket.IO Server
 */
export const getIO = () => {
  return io;
};

/**
 * Cập nhật instance của Socket.IO Server
 */
export const setIO = (newIO) => {
  io = newIO;
  return io;
};
