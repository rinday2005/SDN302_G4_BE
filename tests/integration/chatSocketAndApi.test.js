import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { io as Client } from "socket.io-client";
import bcrypt from "bcrypt";
import app from "../../src/app.js";
import { initSocketServer } from "../../src/modules/chat/chat.socket.js";
import User from "../../src/modules/user/user.model.js";
import Conversation from "../../src/modules/chat/conversation.model.js";
import Message from "../../src/modules/chat/message.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[BE-S5-01] Integration Tests: Socket.IO Server & REST Chat APIs", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let server;
  let baseUrl;
  let userA, userB, shopOwner;
  let tokenA, tokenB, tokenShopOwner;
  let conversationId;

  before(async () => {
    await connectTestDb();

    // Khởi tạo HTTP server và Socket.IO server
    server = http.createServer(app);
    initSocketServer(server);

    await new Promise((resolve) => {
      server.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo Shop Owner duy nhất
    shopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwner) {
      shopOwner = await User.create({
        email: "socket_test_shopowner@reuse.vn",
        passwordHash,
        fullName: "Shop Owner Duy Nhất",
        phoneNumber: "0909000001",
        role: "SHOP_OWNER",
      });
    }

    // 2. Tạo User A
    userA = await User.findOneAndUpdate(
      { email: "socket_test_usera@reuse.vn" },
      {
        email: "socket_test_usera@reuse.vn",
        passwordHash,
        fullName: "Nguyễn Văn A (Khách thuê A)",
        phoneNumber: "0909000002",
        role: "USER",
      },
      { upsert: true, returnDocument: "after" }
    );

    // 3. Tạo User B
    userB = await User.findOneAndUpdate(
      { email: "socket_test_userb@reuse.vn" },
      {
        email: "socket_test_userb@reuse.vn",
        passwordHash,
        fullName: "Trần Thị B (Khách thuê B)",
        phoneNumber: "0909000003",
        role: "USER",
      },
      { upsert: true, returnDocument: "after" }
    );

    tokenA = generateTestToken(userA);
    tokenB = generateTestToken(userB);
    tokenShopOwner = generateTestToken(shopOwner);
  });

  after(async () => {
    if (server) {
      await new Promise((res) => server.close(res));
    }
    await disconnectTestDb();
  });

  describe("1. AC: Socket chỉ cho User đã xác thực kết nối", () => {
    it("Kết nối không kèm token -> Bị server ngắt kết nối với lỗi UNAUTHORIZED", async () => {
      const socket = Client(baseUrl, {
        transports: ["websocket"],
        autoConnect: false,
      });

      const connectError = await new Promise((resolve) => {
        socket.on("connect_error", (err) => {
          resolve(err);
        });
        socket.on("connect", () => {
          resolve(null);
        });
        socket.connect();
      });

      socket.close();
      assert.ok(connectError, "Bắt buộc phải trả về connect_error");
      assert.match(connectError.message, /Authentication error/i);
    });

    it("Kết nối với token JWT hợp lệ -> Kết nối thành công", async () => {
      const socket = Client(baseUrl, {
        transports: ["websocket"],
        auth: { token: `Bearer ${tokenA}` },
      });

      const connected = await new Promise((resolve) => {
        socket.on("connect", () => resolve(true));
        socket.on("connect_error", () => resolve(false));
      });

      socket.close();
      assert.strictEqual(connected, true, "Socket client A phải kết nối thành công");
    });
  });

  describe("2. AC: Conversation giữa User và Shop Owner được xác định đúng", () => {
    it("User A gọi GET /api/chat/conversation -> Tạo/Lấy conversation 1-1 với Shop Owner", async () => {
      const res = await fetch(`${baseUrl}/api/chat/conversation`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert.ok(data.data._id);
      conversationId = data.data._id;

      const participantIds = data.data.participants.map((p) =>
        p._id ? p._id.toString() : p.toString()
      );
      assert.ok(participantIds.includes(userA._id.toString()));
      assert.ok(participantIds.includes(shopOwner._id.toString()));
      assert.strictEqual(participantIds.length, 2);
    });

    it("User A gọi lại GET /api/chat/conversation -> Trả về đúng conversation cũ (không bị trùng lặp)", async () => {
      const res = await fetch(`${baseUrl}/api/chat/conversation`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const data = await res.json();

      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.data._id, conversationId);
    });
  });

  describe("3. AC: Chỉ participant mới join được room & User không đọc được conversation người khác", () => {
    it("User B gọi GET /api/chat/conversations/:id/messages của User A -> Bị chặn 403 FORBIDDEN", async () => {
      const res = await fetch(
        `${baseUrl}/api/chat/conversations/${conversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${tokenB}` },
        }
      );
      const data = await res.json();

      assert.strictEqual(res.status, 403);
      assert.strictEqual(data.errorCode, "FORBIDDEN");
    });

    it("User B cố join Socket room conversation của User A -> Bị từ chối với room_error FORBIDDEN", async () => {
      const socketB = Client(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenB },
      });

      await new Promise((resolve) => socketB.on("connect", resolve));

      const roomError = await new Promise((resolve) => {
        socketB.on("room_error", (err) => resolve(err));
        socketB.emit("join_room", { conversationId });
      });

      socketB.close();
      assert.ok(roomError);
      assert.strictEqual(roomError.errorCode, "FORBIDDEN");
    });

    it("User A (participant) join Socket room conversation -> Thành công nhận joined_room", async () => {
      const socketA = Client(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenA },
      });

      await new Promise((resolve) => socketA.on("connect", resolve));

      const joinResult = await new Promise((resolve) => {
        socketA.on("joined_room", (res) => resolve(res));
        socketA.emit("join_room", { conversationId });
      });

      socketA.close();
      assert.ok(joinResult);
      assert.strictEqual(joinResult.success, true);
      assert.strictEqual(joinResult.conversationId, conversationId);
    });
  });

  describe("4. Gửi nhận tin nhắn Real-time qua Socket và cập nhật lastMessage", () => {
    it("User A gửi tin nhắn qua Socket -> Shop Owner trong cùng room nhận được tin nhắn và lastMessage được cập nhật", async () => {
      const socketA = Client(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenA },
      });
      const socketShop = Client(baseUrl, {
        transports: ["websocket"],
        auth: { token: tokenShopOwner },
      });

      await Promise.all([
        new Promise((resolve) => socketA.on("connect", resolve)),
        new Promise((resolve) => socketShop.on("connect", resolve)),
      ]);

      // Cả 2 cùng join room
      await Promise.all([
        new Promise((resolve) => {
          socketA.on("joined_room", resolve);
          socketA.emit("join_room", { conversationId });
        }),
        new Promise((resolve) => {
          socketShop.on("joined_room", resolve);
          socketShop.emit("join_room", { conversationId });
        }),
      ]);

      const messageText = `Xin chào Shop ReUse Hub lúc ${Date.now()}`;

      // Shop Owner lắng nghe new_message
      const receivedMessagePromise = new Promise((resolve) => {
        socketShop.on("new_message", (msg) => {
          resolve(msg);
        });
      });

      // User A gửi tin nhắn
      socketA.emit("send_message", {
        conversationId,
        text: messageText,
      });

      const receivedMsg = await receivedMessagePromise;

      socketA.close();
      socketShop.close();

      assert.ok(receivedMsg);
      assert.strictEqual(receivedMsg.text, messageText);
      assert.strictEqual(receivedMsg.conversationId, conversationId);

      // Kiểm tra DB conversation đã cập nhật lastMessage và updatedAt
      const updatedConv = await Conversation.findById(conversationId);
      assert.strictEqual(updatedConv.lastMessage.text, messageText);
      assert.ok(updatedConv.updatedAt);
    });

    it("Gửi tin nhắn qua REST API POST /api/chat/conversations/:id/messages -> Lưu DB và trả về 201", async () => {
      const apiText = "Tin nhắn gửi qua REST API";
      const res = await fetch(
        `${baseUrl}/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({ text: apiText }),
        }
      );
      const data = await res.json();

      assert.strictEqual(res.status, 201);
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.text, apiText);

      // Kiểm tra GET messages trả về danh sách có tin nhắn vừa gửi
      const getRes = await fetch(
        `${baseUrl}/api/chat/conversations/${conversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${tokenA}` },
        }
      );
      const getData = await getRes.json();
      assert.strictEqual(getRes.status, 200);
      assert.ok(getData.data.some((m) => m.text === apiText));
    });
  });
});
