import { successResponse } from "../../utils/response.js";
import {
  getOrCreateConversationForUser,
  getUserConversations,
  getConversationById as getConvByIdService,
  getMessagesByConversationId,
  sendMessage as sendMessageService,
  deleteConversationService,
} from "./chat.service.js";
import { getIO } from "./chat.socket.js";

/**
 * Lấy hoặc tạo cuộc trò chuyện của user hiện tại với Shop Owner
 * GET /api/chat/conversation
 */
export const getMyConversation = async (req, res, next) => {
  try {
    const user = req.user;
    const shopId = req.query.shopId || req.query.shopOwnerId || req.query.ownerId || req.query.partnerId;
    const serviceType = req.query.serviceType === "THRIFT" ? "THRIFT" : "RENT";
    const orderCode = req.query.orderCode || "";
    const orderTitle = req.query.orderTitle || "";

    if (user.role === "SHOP_OWNER") {
      const conversations = await getUserConversations(user);
      return successResponse(
        res,
        "Shop Owner conversations retrieved successfully",
        conversations
      );
    }

    const conversation = await getOrCreateConversationForUser({
      userId: user._id,
      shopId,
      serviceType,
      orderCode,
      orderTitle,
    });
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
      const messageObj = result.message.toObject
        ? result.message.toObject()
        : { ...result.message };
      messageObj.serviceType = result.conversation.serviceType || "RENT";

      io.to(conversationId.toString()).emit("new_message", messageObj);

      result.conversation.participants.forEach((pId) => {
        const pIdStr = pId._id ? pId._id.toString() : pId.toString();
        if (pIdStr !== req.user._id.toString()) {
          io.to(`user:${pIdStr}`).emit("new_message", messageObj);
        }
        io.to(`user:${pIdStr}`).emit(
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

/**
 * Xóa một cuộc trò chuyện
 * DELETE /api/chat/conversations/:id
 */
export const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deleteConversationService(id, req.user);

    // Phát sự kiện Socket.IO để cả 2 bên cùng xóa hội thoại trên UI lập tức
    try {
      const io = getIO();
      if (io) {
        io.to(id.toString()).emit("conversation_deleted", { conversationId: id });
        io.emit("conversation_deleted", { conversationId: id });
      }
    } catch (socketErr) {
      console.warn("Could not emit conversation_deleted event:", socketErr.message);
    }

    return successResponse(res, "Cuộc trò chuyện đã được xóa thành công", result);
  } catch (error) {
    next(error);
  }
};
