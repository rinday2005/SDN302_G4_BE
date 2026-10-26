import mongoose from "mongoose";
import Conversation from "./conversation.model.js";
import Message from "./message.model.js";
import User from "../user/user.model.js";

/**
 * Tìm kiếm Shop Owner duy nhất của hệ thống
 */
export const getShopOwner = async () => {
  const shopOwner = await User.findOne({ role: "SHOP_OWNER" });
  if (!shopOwner) {
    const error = new Error("Shop Owner account is not configured in the system");
    error.statusCode = 404;
    error.errorCode = "SHOP_OWNER_NOT_FOUND";
    throw error;
  }
  return shopOwner;
};

/**
 * Lấy hoặc tạo cuộc trò chuyện giữa User và Shop Owner duy nhất
 * Đảm bảo: Vì hệ thống chỉ có một Shop Owner, mỗi User chỉ có thể chat với Shop Owner duy nhất.
 */
export const getOrCreateConversationForUser = async (userId) => {
  const shopOwner = await getShopOwner();

  if (shopOwner._id.toString() === userId.toString()) {
    const error = new Error("Shop Owner cannot initiate conversation with self");
    error.statusCode = 400;
    error.errorCode = "SELF_CONVERSATION_NOT_ALLOWED";
    throw error;
  }

  let conversation = await Conversation.findOne({
    participants: { $all: [userId, shopOwner._id], $size: 2 },
  })
    .populate("participants", "fullName email avatarUrl role")
    .populate("lastMessage.senderId", "fullName avatarUrl role");

  if (!conversation) {
    const newConv = await Conversation.create({
      participants: [userId, shopOwner._id],
      lastMessage: null,
    });

    conversation = await Conversation.findById(newConv._id)
      .populate("participants", "fullName email avatarUrl role")
      .populate("lastMessage.senderId", "fullName avatarUrl role");
  }

  return conversation;
};

/**
 * Lấy danh sách conversation của người dùng hiện tại
 * - USER: Chỉ thấy conversation của chính mình với Shop Owner
 * - SHOP_OWNER: Thấy danh sách tất cả các cuộc trò chuyện của khách hàng với Shop
 */
export const getUserConversations = async (currentUser) => {
  const query = {
    participants: currentUser._id,
  };

  const conversations = await Conversation.find(query)
    .sort({ updatedAt: -1 })
    .populate("participants", "fullName email avatarUrl role")
    .populate("lastMessage.senderId", "fullName avatarUrl role");

  return conversations;
};

/**
 * Lấy chi tiết conversation theo ID và kiểm tra quyền truy cập
 * AC: Chỉ participant mới có quyền xem conversation
 */
export const getConversationById = async (conversationId, currentUser) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const error = new Error("Invalid conversation ID");
    error.statusCode = 400;
    error.errorCode = "INVALID_ID";
    throw error;
  }

  const conversation = await Conversation.findById(conversationId)
    .populate("participants", "fullName email avatarUrl role")
    .populate("lastMessage.senderId", "fullName avatarUrl role");

  if (!conversation) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    error.errorCode = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const isParticipant = conversation.participants.some((p) => {
    const pId = p._id ? p._id.toString() : p.toString();
    return pId === currentUser._id.toString();
  });

  if (!isParticipant) {
    const error = new Error("Forbidden: You do not have permission to view this conversation");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  return conversation;
};

/**
 * Lấy tin nhắn của conversation
 * AC: User không thể đọc conversation của User khác
 */
export const getMessagesByConversationId = async (
  conversationId,
  currentUser,
  { page = 1, limit = 50 } = {}
) => {
  // Kiểm tra quyền tham gia conversation trước
  await getConversationById(conversationId, currentUser);

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (numericPage - 1) * numericLimit;

  const [messages, total] = await Promise.all([
    Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("senderId", "fullName avatarUrl role"),
    Message.countDocuments({ conversationId }),
  ]);

  return {
    messages,
    pagination: {
      page: numericPage,
      limit: numericLimit,
      total,
      totalPages: Math.ceil(total / numericLimit) || 1,
    },
  };
};

/**
 * Gửi tin nhắn mới vào cuộc trò chuyện
 */
export const sendMessage = async ({ conversationId, senderId, text, imageUrl }) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const error = new Error("Invalid conversation ID");
    error.statusCode = 400;
    error.errorCode = "INVALID_ID";
    throw error;
  }

  const trimmedText = typeof text === "string" ? text.trim() : "";
  const trimmedImageUrl = typeof imageUrl === "string" ? imageUrl.trim() : null;

  if (!trimmedText && !trimmedImageUrl) {
    const error = new Error("Message text or image URL is required");
    error.statusCode = 400;
    error.errorCode = "MESSAGE_CONTENT_REQUIRED";
    throw error;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    error.errorCode = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const isParticipant = conversation.participants.some(
    (p) => p.toString() === senderId.toString()
  );

  if (!isParticipant) {
    const error = new Error("Forbidden: You are not a participant in this conversation");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  const message = await Message.create({
    conversationId,
    senderId,
    text: trimmedText,
    imageUrl: trimmedImageUrl,
    createdAt: new Date(),
  });

  const populatedMessage = await Message.findById(message._id).populate(
    "senderId",
    "fullName avatarUrl role"
  );

  conversation.lastMessage = {
    text: trimmedText || (trimmedImageUrl ? "[Hình ảnh]" : ""),
    senderId,
    imageUrl: trimmedImageUrl,
    createdAt: message.createdAt,
  };
  conversation.updatedAt = new Date();
  await conversation.save();

  return {
    message: populatedMessage,
    conversation,
  };
};
