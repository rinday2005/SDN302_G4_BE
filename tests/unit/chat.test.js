import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../src/config/env.js";
import { socketAuthMiddleware } from "../../src/modules/chat/chat.socket.js";
import {
  getOrCreateConversationForUser,
  getConversationById,
  getMessagesByConversationId,
  sendMessage,
} from "../../src/modules/chat/chat.service.js";
import Conversation from "../../src/modules/chat/conversation.model.js";
import Message from "../../src/modules/chat/message.model.js";
import User from "../../src/modules/user/user.model.js";

const DEFAULT_SECRET = JWT_SECRET || "ReUseHub_Auth_9xK7mP2q_2026";

describe("[BE-S5-01] Unit Tests: Socket.IO Server & Schemas chats, messages", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyOtherUserId = new mongoose.Types.ObjectId();
  const dummyShopOwnerId = new mongoose.Types.ObjectId();
  const dummyConvId = new mongoose.Types.ObjectId();

  describe("1. Schema Validations: conversations & messages models", () => {
    it("Conversation model schema: có đầy đủ participants, lastMessage, timestamps", () => {
      const convSchemaPaths = Conversation.schema.paths;
      assert.ok(convSchemaPaths.participants, "Conversation phải có field participants");
      assert.ok(convSchemaPaths["lastMessage.text"], "lastMessage phải có field text");
      assert.ok(convSchemaPaths["lastMessage.senderId"], "lastMessage phải có field senderId");
      assert.ok(convSchemaPaths["lastMessage.imageUrl"], "lastMessage phải có field imageUrl");
      assert.ok(convSchemaPaths["lastMessage.createdAt"], "lastMessage phải có field createdAt");
      assert.ok(convSchemaPaths.updatedAt, "Conversation phải có field updatedAt");
      assert.strictEqual(Conversation.collection.name, "conversations");
    });

    it("Message model schema: có đầy đủ conversationId, senderId, text, imageUrl, createdAt", () => {
      const msgSchemaPaths = Message.schema.paths;
      assert.ok(msgSchemaPaths.conversationId, "Message phải có field conversationId");
      assert.ok(msgSchemaPaths.senderId, "Message phải có field senderId");
      assert.ok(msgSchemaPaths.text, "Message phải có field text");
      assert.ok(msgSchemaPaths.imageUrl, "Message phải có field imageUrl");
      assert.ok(msgSchemaPaths.createdAt, "Message phải có field createdAt");
      assert.strictEqual(Message.collection.name, "messages");
    });
  });

  describe("2. AC: Socket chỉ cho User đã xác thực kết nối (Handshake JWT)", () => {
    it("Từ chối kết nối khi không truyền token", async () => {
      const socket = {
        handshake: { auth: {}, headers: {}, query: {} },
      };

      let capturedError = null;
      await socketAuthMiddleware(socket, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError, "Bắt buộc phải trả về lỗi khi không có token");
      assert.strictEqual(capturedError.data.errorCode, "UNAUTHORIZED");
    });

    it("Từ chối kết nối khi truyền token không hợp lệ (sai signature / rác)", async () => {
      const socket = {
        handshake: {
          auth: { token: "Bearer invalid.jwt.token" },
          headers: {},
          query: {},
        },
      };

      let capturedError = null;
      await socketAuthMiddleware(socket, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError, "Bắt buộc phải từ chối token không hợp lệ");
      assert.strictEqual(capturedError.data.errorCode, "INVALID_TOKEN");
    });

    it("Từ chối kết nối khi token đã hết hạn (TokenExpiredError)", async () => {
      const expiredToken = jwt.sign(
        { id: dummyUserId, role: "USER" },
        DEFAULT_SECRET,
        { expiresIn: "-1s" }
      );

      const socket = {
        handshake: {
          auth: { token: expiredToken },
          headers: {},
          query: {},
        },
      };

      let capturedError = null;
      await socketAuthMiddleware(socket, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.data.errorCode, "TOKEN_EXPIRED");
    });

    it("Cho phép kết nối khi token hợp lệ và gán đúng socket.user, socket.userId", async () => {
      const validToken = jwt.sign(
        { id: dummyUserId, role: "USER" },
        DEFAULT_SECRET,
        { expiresIn: "1h" }
      );

      const originalFindById = User.findById;
      User.findById = (id) => ({
        select: async () => ({
          _id: dummyUserId,
          role: "USER",
          fullName: "Nguyễn Văn A",
        }),
      });

      try {
        const socket = {
          handshake: {
            auth: { token: `Bearer ${validToken}` },
            headers: {},
            query: {},
          },
        };

        let capturedError = null;
        await socketAuthMiddleware(socket, (err) => {
          capturedError = err;
        });

        assert.strictEqual(capturedError, undefined);
        assert.ok(socket.user);
        assert.strictEqual(socket.userId, dummyUserId.toString());
        assert.strictEqual(socket.userRole, "USER");
      } finally {
        User.findById = originalFindById;
      }
    });
  });

  describe("3. AC: Conversation giữa User và Shop Owner được xác định đúng", () => {
    it("User tự động bắt cặp với Shop Owner duy nhất của hệ thống", async () => {
      const originalUserFindOne = User.findOne;
      const originalConvFindOne = Conversation.findOne;

      User.findOne = async (query) => {
        if (query.role === "SHOP_OWNER") {
          return { _id: dummyShopOwnerId, role: "SHOP_OWNER", fullName: "Shop Owner" };
        }
        return null;
      };

      Conversation.findOne = (query) => ({
        populate: () => ({
          populate: async () => ({
            _id: dummyConvId,
            participants: [
              { _id: dummyUserId, fullName: "User A", role: "USER" },
              { _id: dummyShopOwnerId, fullName: "Shop Owner", role: "SHOP_OWNER" },
            ],
            lastMessage: null,
          }),
        }),
      });

      try {
        const conv = await getOrCreateConversationForUser(dummyUserId);
        assert.ok(conv);
        assert.strictEqual(conv.participants.length, 2);
        const hasShopOwner = conv.participants.some(
          (p) => p._id.toString() === dummyShopOwnerId.toString()
        );
        const hasUser = conv.participants.some(
          (p) => p._id.toString() === dummyUserId.toString()
        );
        assert.ok(hasShopOwner, "Conversation phải có Shop Owner tham gia");
        assert.ok(hasUser, "Conversation phải có User tham gia");
      } finally {
        User.findOne = originalUserFindOne;
        Conversation.findOne = originalConvFindOne;
      }
    });

    it("Shop Owner không thể tự tạo conversation với chính mình", async () => {
      const originalUserFindOne = User.findOne;
      User.findOne = async () => ({ _id: dummyShopOwnerId, role: "SHOP_OWNER" });

      try {
        await assert.rejects(
          async () => {
            await getOrCreateConversationForUser(dummyShopOwnerId);
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.errorCode, "SELF_CONVERSATION_NOT_ALLOWED");
            return true;
          }
        );
      } finally {
        User.findOne = originalUserFindOne;
      }
    });
  });

  describe("4. AC: User không thể đọc conversation của User khác & chỉ participant mới join được room", () => {
    it("User B không thể xem conversation của User A và Shop Owner -> 403 FORBIDDEN", async () => {
      const originalFindById = Conversation.findById;
      Conversation.findById = (id) => ({
        populate: () => ({
          populate: async () => ({
            _id: dummyConvId,
            participants: [dummyUserId, dummyShopOwnerId],
          }),
        }),
      });

      try {
        const userB = { _id: dummyOtherUserId, role: "USER" };
        await assert.rejects(
          async () => {
            await getConversationById(dummyConvId, userB);
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.strictEqual(err.errorCode, "FORBIDDEN");
            return true;
          }
        );
      } finally {
        Conversation.findById = originalFindById;
      }
    });

    it("User B không thể đọc messages trong conversation của User A -> 403 FORBIDDEN", async () => {
      const originalFindById = Conversation.findById;
      Conversation.findById = (id) => ({
        populate: () => ({
          populate: async () => ({
            _id: dummyConvId,
            participants: [dummyUserId, dummyShopOwnerId],
          }),
        }),
      });

      try {
        const userB = { _id: dummyOtherUserId, role: "USER" };
        await assert.rejects(
          async () => {
            await getMessagesByConversationId(dummyConvId, userB);
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.strictEqual(err.errorCode, "FORBIDDEN");
            return true;
          }
        );
      } finally {
        Conversation.findById = originalFindById;
      }
    });

    it("User B không thể gửi tin nhắn vào conversation của User A -> 403 FORBIDDEN", async () => {
      const originalFindById = Conversation.findById;
      Conversation.findById = async (id) => ({
        _id: dummyConvId,
        participants: [dummyUserId, dummyShopOwnerId],
      });

      try {
        await assert.rejects(
          async () => {
            await sendMessage({
              conversationId: dummyConvId,
              senderId: dummyOtherUserId,
              text: "Hack chat",
            });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 403);
            assert.strictEqual(err.errorCode, "FORBIDDEN");
            return true;
          }
        );
      } finally {
        Conversation.findById = originalFindById;
      }
    });

    it("Participant (User A hoặc Shop Owner) có quyền xem conversation và gửi tin nhắn hợp lệ", async () => {
      const originalConvFindById = Conversation.findById;
      const originalMsgCreate = Message.create;
      const originalMsgFindById = Message.findById;

      const mockConversation = {
        _id: dummyConvId,
        participants: [dummyUserId, dummyShopOwnerId],
        lastMessage: null,
        updatedAt: new Date(),
        save: async function () {
          return this;
        },
      };

      const createQueryMock = (data) => ({
        populate: () => createQueryMock(data),
        then: (resolve) => Promise.resolve(resolve(data)),
      });

      Conversation.findById = () => createQueryMock(mockConversation);

      Message.create = async (doc) => ({
        ...doc,
        _id: new mongoose.Types.ObjectId(),
      });

      Message.findById = (id) => ({
        populate: async () => ({
          _id: id,
          conversationId: dummyConvId,
          senderId: { _id: dummyUserId, fullName: "User A", role: "USER" },
          text: "Xin chào Shop!",
          createdAt: new Date(),
        }),
      });

      try {
        const userA = { _id: dummyUserId, role: "USER" };
        const conv = await getConversationById(dummyConvId, userA);
        assert.ok(conv);
        assert.strictEqual(conv._id.toString(), dummyConvId.toString());

        const result = await sendMessage({
          conversationId: dummyConvId,
          senderId: dummyUserId,
          text: "Xin chào Shop!",
        });

        assert.ok(result.message);
        assert.strictEqual(result.message.text, "Xin chào Shop!");
        assert.strictEqual(result.conversation.lastMessage.text, "Xin chào Shop!");
      } finally {
        Conversation.findById = originalConvFindById;
        Message.create = originalMsgCreate;
        Message.findById = originalMsgFindById;
      }
    });
  });
});
