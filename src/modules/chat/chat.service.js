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

const resolveRawId = (id) => (typeof id === "string" ? id.replace(/_(RENT|THRIFT)$/, "") : id);

/**
 * Lấy hoặc tạo cuộc trò chuyện giữa User và Shop Owner cụ thể
 * Hỗ trợ hệ thống đa Shop (multi-vendor): User chat với shop nào thì shop đó nhận được
 * Lưu ý: Giữa một User và một Shop Owner chỉ có DUY NHẤT 1 cuộc trò chuyện (User nhắn chung)
 */
export const getOrCreateConversationForUser = async ({
  userId,
  shopId = null,
  serviceType = "RENT",
  orderCode = "",
  orderTitle = "",
}) => {
  let targetShopOwner = null;

  if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    targetShopOwner = await User.findById(shopId);
  }

  // Nếu không truyền shopId hoặc không tìm thấy, lấy shop owner đầu tiên
  if (!targetShopOwner) {
    targetShopOwner = await User.findOne({ role: "SHOP_OWNER" });
  }

  if (!targetShopOwner) {
    const error = new Error("Shop Owner account is not configured in the system");
    error.statusCode = 404;
    error.errorCode = "SHOP_OWNER_NOT_FOUND";
    throw error;
  }

  if (targetShopOwner._id.toString() === userId.toString()) {
    const error = new Error("Shop Owner cannot initiate conversation with self");
    error.statusCode = 400;
    error.errorCode = "SELF_CONVERSATION_NOT_ALLOWED";
    throw error;
  }

  // 1 cuộc trò chuyện duy nhất giữa User và Shop Owner này
  let conversation = await Conversation.findOne({
    participants: { $all: [userId, targetShopOwner._id], $size: 2 },
  })
    .sort({ updatedAt: -1 })
    .populate("participants", "fullName email avatarUrl role shopProfile")
    .populate("lastMessage.senderId", "fullName avatarUrl role");

  if (!conversation) {
    const validServiceType = serviceType === "THRIFT" ? "THRIFT" : "RENT";
    const shopDisplayName = targetShopOwner.shopProfile?.shopName || targetShopOwner.fullName || "Shop";
    const newConv = await Conversation.create({
      participants: [userId, targetShopOwner._id],
      serviceType: validServiceType,
      orderCode: orderCode || "",
      orderTitle: orderTitle || `Trò chuyện cùng ${shopDisplayName}`,
      lastMessage: null,
    });

    conversation = await Conversation.findById(newConv._id)
      .populate("participants", "fullName email avatarUrl role shopProfile")
      .populate("lastMessage.senderId", "fullName avatarUrl role");
  }

  return conversation;
};

/**
 * Lấy danh sách conversation của người dùng hiện tại
 * - USER: Mỗi Shop chỉ thấy 1 cuộc trò chuyện duy nhất (nhắn chung liền mạch)
 * - SHOP_OWNER: Tự động tách thành 2 luồng RENT và THRIFT theo tin nhắn của khách
 */
export const getUserConversations = async (currentUser) => {
  const query = {
    participants: currentUser._id,
  };

  const conversations = await Conversation.find(query)
    .sort({ updatedAt: -1 })
    .populate("participants", "fullName email avatarUrl role shopProfile")
    .populate("lastMessage.senderId", "fullName avatarUrl role");

  // Đối với USER: Trả về danh sách bình thường (mỗi Shop 1 cuộc trò chuyện duy nhất)
  if (currentUser.role === "USER") {
    return conversations;
  }

  // Đối với SHOP_OWNER: Tách các hội thoại theo mảng dịch vụ RENT và THRIFT
  const shopConversations = [];

  for (const conv of conversations) {
    const [latestRentMsg, latestThriftMsg] = await Promise.all([
      Message.findOne({
        conversationId: conv._id,
        $or: [{ serviceType: "RENT" }, { serviceType: { $exists: false } }, { serviceType: null }],
      })
        .sort({ createdAt: -1 })
        .populate("senderId", "fullName avatarUrl role"),
      Message.findOne({ conversationId: conv._id, serviceType: "THRIFT" })
        .sort({ createdAt: -1 })
        .populate("senderId", "fullName avatarUrl role"),
    ]);

    // Luồng RENT: Nếu có tin nhắn RENT hoặc cuộc trò chuyện mới chưa có tin nhắn nào
    if (latestRentMsg || (!latestRentMsg && !latestThriftMsg)) {
      const rentConv = conv.toObject ? conv.toObject() : { ...conv };
      rentConv._id = `${conv._id}_RENT`;
      rentConv.rawConversationId = conv._id.toString();
      rentConv.serviceType = "RENT";
      if (latestRentMsg) {
        rentConv.lastMessage = {
          text: latestRentMsg.text || (latestRentMsg.imageUrl ? "[Hình ảnh]" : ""),
          senderId: latestRentMsg.senderId,
          imageUrl: latestRentMsg.imageUrl,
          serviceType: "RENT",
          createdAt: latestRentMsg.createdAt,
        };
        rentConv.updatedAt = latestRentMsg.createdAt;
      }
      shopConversations.push(rentConv);
    }

    // Luồng THRIFT: Nếu có tin nhắn THRIFT
    if (latestThriftMsg) {
      const thriftConv = conv.toObject ? conv.toObject() : { ...conv };
      thriftConv._id = `${conv._id}_THRIFT`;
      thriftConv.rawConversationId = conv._id.toString();
      thriftConv.serviceType = "THRIFT";
      thriftConv.lastMessage = {
        text: latestThriftMsg.text || (latestThriftMsg.imageUrl ? "[Hình ảnh]" : ""),
        senderId: latestThriftMsg.senderId,
        imageUrl: latestThriftMsg.imageUrl,
        serviceType: "THRIFT",
        createdAt: latestThriftMsg.createdAt,
      };
      thriftConv.updatedAt = latestThriftMsg.createdAt;
      shopConversations.push(thriftConv);
    }
  }

  return shopConversations.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
};

/**
 * Lấy chi tiết conversation theo ID và kiểm tra quyền truy cập
 * AC: Chỉ participant mới có quyền xem conversation
 */
export const getConversationById = async (conversationId, currentUser) => {
  const rawId = resolveRawId(conversationId);
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    const error = new Error("Invalid conversation ID");
    error.statusCode = 400;
    error.errorCode = "INVALID_ID";
    throw error;
  }

  const conversation = await Conversation.findById(rawId)
    .populate("participants", "fullName email avatarUrl role shopProfile")
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
  { page = 1, limit = 50, serviceType } = {}
) => {
  const rawId = resolveRawId(conversationId);
  // Kiểm tra quyền tham gia conversation trước
  await getConversationById(rawId, currentUser);

  const numericPage = Math.max(1, parseInt(page, 10) || 1);
  const numericLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const skip = (numericPage - 1) * numericLimit;

  const query = { conversationId: rawId };
  if (serviceType === "RENT") {
    query.$or = [{ serviceType: "RENT" }, { serviceType: { $exists: false } }, { serviceType: null }];
  } else if (serviceType === "THRIFT") {
    query.serviceType = "THRIFT";
  }

  const [messages, total] = await Promise.all([
    Message.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(numericLimit)
      .populate("senderId", "fullName avatarUrl role"),
    Message.countDocuments(query),
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
export const sendMessage = async ({ conversationId, senderId, text, imageUrl, serviceType = "RENT" }) => {
  const rawId = resolveRawId(conversationId);
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
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

  const conversation = await Conversation.findById(rawId);
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

  const validServiceType = serviceType === "THRIFT" ? "THRIFT" : "RENT";

  const message = await Message.create({
    conversationId: rawId,
    senderId,
    text: trimmedText,
    imageUrl: trimmedImageUrl,
    serviceType: validServiceType,
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
    serviceType: validServiceType,
    createdAt: message.createdAt,
  };
  conversation.serviceType = validServiceType;
  conversation.updatedAt = new Date();
  await conversation.save();

  await conversation.populate("participants", "fullName email avatarUrl role shopProfile");
  await conversation.populate("lastMessage.senderId", "fullName avatarUrl role");

  return {
    message: populatedMessage,
    conversation,
  };
};

/**
 * Xóa một cuộc trò chuyện và toàn bộ tin nhắn liên quan
 */
export const deleteConversationService = async (conversationId, user) => {
  const rawId = resolveRawId(conversationId);
  const conversation = await Conversation.findById(rawId);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.statusCode = 404;
    error.errorCode = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const userIdStr = user._id ? user._id.toString() : user.id;
  const isParticipant = conversation.participants.some(
    (p) => (p._id ? p._id.toString() : p.toString()) === userIdStr
  );

  if (!isParticipant && user.role !== "ADMIN" && user.role !== "SHOP_OWNER") {
    const error = new Error("Forbidden: You do not have permission to delete this conversation");
    error.statusCode = 403;
    error.errorCode = "FORBIDDEN";
    throw error;
  }

  await Message.deleteMany({ conversationId: rawId });
  await Conversation.findByIdAndDelete(rawId);

  return { conversationId: rawId };
};
