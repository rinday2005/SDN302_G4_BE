import { successResponse } from "../../utils/response.js";
import {
  getOrCreateConversationForUser,
  getUserConversations,
  getConversationById as getConvByIdService,
  getMessagesByConversationId,
  sendMessage as sendMessageService,
} from "./chat.service.js";
import { getIO } from "./chat.socket.js";

/**
 * Lấy hoặc tạo cuộc trò chuyện của user hiện tại với Shop Owner
 * GET /api/chat/conversation
 */
export const getMyConversation = async (req, res, next) => {
  try {
    const user = req.user;

    if (user.role === "SHOP_OWNER") {
      const conversations = await getUserConversations(user);
      return successResponse(
        res,
        "Shop Owner conversations retrieved successfully",
        conversations
      );
    }

    const conversation = await getOrCreateConversationForUser(user._id);
    return successResponse(
      res,
      "Conversation with Shop Owner retrieved successfully",
      conversation
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách conversations
 * GET /api/chat/conversations
 */
export const getConversations = async (req, res, next) => {
  try {
    const conversations = await getUserConversations(req.user);
    return successResponse(
      res,
      "Conversations retrieved successfully",
      conversations
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy chi tiết conversation theo ID
 * GET /api/chat/conversations/:id
 */
export const getConversationById = async (req, res, next) => {
  try {
    const conversation = await getConvByIdService(req.params.id, req.user);
    return successResponse(
      res,
      "Conversation retrieved successfully",
      conversation
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách tin nhắn của conversation
 * GET /api/chat/conversations/:id/messages
 */
export const getMessages = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await getMessagesByConversationId(
      req.params.id,
      req.user,
      { page, limit }
    );

    return successResponse(
      res,
      "Messages retrieved successfully",
      result.messages,
      200,
      result.pagination
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Gửi tin nhắn qua REST API (và đồng thời broadcast qua Socket.IO nếu có kết nối)
 * POST /api/chat/conversations/:id/messages
 */
export const sendMessageHttp = async (req, res, next) => {
  try {
    const { text, imageUrl } = req.body;
    const conversationId = req.params.id;

    const result = await sendMessageService({
      conversationId,
      senderId: req.user._id,
      text,
      imageUrl,
    });

    const io = getIO();
    if (io) {
      io.to(conversationId.toString()).emit("new_message", result.message);
      io.to(conversationId.toString()).emit("receive_message", result.message);

      result.conversation.participants.forEach((pId) => {
        io.to(`user:${pId.toString()}`).emit(
          "conversation_updated",
          result.conversation
        );
      });
    }

    return successResponse(
      res,
      "Message sent successfully",
      result.message,
      201
    );
  } catch (error) {
    next(error);
  }
};
