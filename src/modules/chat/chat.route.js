import { Router } from "express";
import authMiddleware from "../../middleware/auth.middleware.js";
import {
  getMyConversation,
  getConversations,
  getConversationById,
  getMessages,
  sendMessageHttp,
} from "./chat.controller.js";
import {
  validateConversationIdParam,
  validateSendMessage,
} from "./chat.validation.js";

const router = Router();

// Tất cả các routes chat yêu cầu xác thực JWT
router.use(authMiddleware);

// Lấy conversation giữa user hiện tại và Shop Owner
router.get("/conversation", getMyConversation);

// Danh sách conversations
router.get("/conversations", getConversations);

// Chi tiết conversation
router.get("/conversations/:id", validateConversationIdParam, getConversationById);

// Danh sách tin nhắn theo conversation
router.get(
  "/conversations/:id/messages",
  validateConversationIdParam,
  getMessages
);

// Gửi tin nhắn
router.post(
  "/conversations/:id/messages",
  validateConversationIdParam,
  validateSendMessage,
  sendMessageHttp
);

export default router;
