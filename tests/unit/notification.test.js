import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Notification, { NOTIFICATION_TYPE } from "../../src/modules/notification/notification.model.js";
import {
  createNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  sendSystemNotificationSafe,
} from "../../src/modules/notification/notification.service.js";
import * as chatSocketModule from "../../src/modules/chat/chat.socket.js";
import { validateNotificationId, validateCreateNotificationInput } from "../../src/modules/notification/notification.validation.js";

describe("[BE-S6-02] Unit Tests: Service Tự động Bắn Thông báo Hệ thống (In-app Notification)", () => {
  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();
  const notificationId = new mongoose.Types.ObjectId();

  let socketEmissions = [];
  const mockIO = {
    to: (room) => ({
      emit: (event, data) => {
        socketEmissions.push({ room, event, data });
      },
    }),
  };

  beforeEach(() => {
    socketEmissions = [];
    // Mock IO instance using setIO
    chatSocketModule.setIO(mockIO);
  });

  describe("1. Schema Validations: Notification Model", () => {
    it("Model Notification có đầy đủ các trường: userId, title, message, type, link, isRead", () => {
      const doc = new Notification({
        userId: userAId,
        title: "Đơn hàng đã được duyệt",
        message: "Chủ shop đã phê duyệt đơn RO-12345",
        type: NOTIFICATION_TYPE.RENTAL_ORDER,
        link: "/orders/12345",
      });

      assert.strictEqual(doc.userId.toString(), userAId.toString());
      assert.strictEqual(doc.title, "Đơn hàng đã được duyệt");
      assert.strictEqual(doc.type, "RENTAL_ORDER");
      assert.strictEqual(doc.isRead, false); // Mặc định chưa đọc
    });

    it("Báo lỗi validation khi thiếu userId, title hoặc message", async () => {
      const doc = new Notification({});
      let capturedError = null;

      try {
        await doc.validate();
      } catch (err) {
        capturedError = err;
      }

      assert.ok(capturedError);
      assert.ok(capturedError.errors.userId);
      assert.ok(capturedError.errors.title);
      assert.ok(capturedError.errors.message);
    });
  });

  describe("2. Validation Middleware", () => {
    it("validateNotificationId: Chặn ID không hợp lệ -> 400 INVALID_NOTIFICATION_ID", () => {
      const req = { params: { id: "not-a-valid-id" } };
      let capturedError = null;

      validateNotificationId(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_NOTIFICATION_ID");
    });

    it("validateNotificationId: Cho phép ID ObjectId hợp lệ", () => {
      const req = { params: { id: new mongoose.Types.ObjectId().toString() } };
      let capturedError = null;

      validateNotificationId(req, {}, (err) => {
        capturedError = err;
      });

      assert.strictEqual(capturedError, undefined);
    });

    it("validateCreateNotificationInput: Bắt lỗi khi thiếu các trường bắt buộc", () => {
      const req = { body: { title: "Test" } };
      let capturedError = null;

      validateCreateNotificationInput(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
    });
  });

  describe("3. AC: createNotification() tạo đúng User nhận & không gửi nhầm User", () => {
    it("Tạo notification thành công cho đúng User", async () => {
      const mockCreated = {
        _id: notificationId,
        userId: userAId,
        title: "Đơn thuê được phê duyệt",
        message: "Vui lòng thanh toán tiền cọc",
        type: NOTIFICATION_TYPE.RENTAL_ORDER,
        link: "/orders/123",
        isRead: false,
      };

      Notification.create = async (payload) => ({
        ...payload,
        _id: notificationId,
      });

      const notif = await createNotification({
        userId: userAId,
        title: "Đơn thuê được phê duyệt",
        message: "Vui lòng thanh toán tiền cọc",
        type: NOTIFICATION_TYPE.RENTAL_ORDER,
        link: "/orders/123",
      });

      assert.strictEqual(notif.userId.toString(), userAId.toString());
      assert.strictEqual(notif.title, "Đơn thuê được phê duyệt");
      assert.strictEqual(notif.isRead, false);
    });

    it("Ném lỗi khi gọi createNotification thiếu userId hoặc title", async () => {
      await assert.rejects(
        async () => {
          await createNotification({ title: "Hi", message: "Hello" });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, "MISSING_USER_ID");
          return true;
        }
      );
    });
  });

  describe("4. AC: Emit Socket.IO notification realtime tới đúng người dùng online", () => {
    it("Bắn Socket.IO realtime tới đúng room 'user:userId'", async () => {
      Notification.create = async (payload) => ({
        ...payload,
        _id: notificationId,
      });

      await createNotification({
        userId: userAId,
        title: "Thanh toán thành công",
        message: "Đơn hàng RO-999 đã thanh toán",
        type: NOTIFICATION_TYPE.PAYMENT,
      });

      // Kiểm tra Socket.IO đã phát tín hiệu tới room của User A
      const targetRoom = `user:${userAId.toString()}`;
      const userAEmissions = socketEmissions.filter((e) => e.room === targetRoom);

      assert.ok(userAEmissions.length > 0);
      assert.strictEqual(userAEmissions[0].event, "notification");
      assert.strictEqual(userAEmissions[0].data.title, "Thanh toán thành công");

      // Đảm bảo KHÔNG bắn vào room của User B (không gửi nhầm User)
      const userBRoom = `user:${userBId.toString()}`;
      const userBEmissions = socketEmissions.filter((e) => e.room === userBRoom);
      assert.strictEqual(userBEmissions.length, 0);
    });
  });

  describe("5. AC: Notification có thể đánh dấu đã đọc & Chặn IDOR", () => {
    it("Chính chủ đánh dấu đã đọc thành công -> isRead = true", async () => {
      const mockNotif = {
        _id: notificationId,
        userId: userAId,
        isRead: false,
        save: async function () {
          return this;
        },
      };

      Notification.findById = () => Promise.resolve(mockNotif);

      const result = await markNotificationAsRead(userAId, notificationId.toString());
      assert.strictEqual(result.isRead, true);
    });

    it("User B không thể đánh dấu đã đọc thông báo của User A -> Bị chặn 403 FORBIDDEN", async () => {
      const mockNotif = {
        _id: notificationId,
        userId: userAId,
        isRead: false,
        save: async function () {
          return this;
        },
      };

      Notification.findById = () => Promise.resolve(mockNotif);

      await assert.rejects(
        async () => {
          await markNotificationAsRead(userBId, notificationId.toString());
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("markAllNotificationsAsRead: Đánh dấu tất cả thông báo của user là đã đọc", async () => {
      let updateCriteria = null;
      Notification.updateMany = async (filter, update) => {
        updateCriteria = { filter, update };
        return { modifiedCount: 3 };
      };

      const result = await markAllNotificationsAsRead(userAId);
      assert.strictEqual(result.success, true);
      assert.strictEqual(updateCriteria.filter.userId.toString(), userAId.toString());
      assert.strictEqual(updateCriteria.update.$set.isRead, true);
    });
  });

  describe("6. Đếm số lượng thông báo chưa đọc", () => {
    it("getUnreadNotificationCount trả về chính xác số lượng thông báo chưa đọc", async () => {
      Notification.countDocuments = async (filter) => {
        if (filter.isRead === false) return 5;
        return 10;
      };

      const result = await getUnreadNotificationCount(userAId);
      assert.strictEqual(result.unreadCount, 5);
    });
  });

  describe("7. Helper an toàn: sendSystemNotificationSafe", () => {
    it("Không ném lỗi unhandled khi tham số không hợp lệ", async () => {
      // Thiếu userId -> bình thường sẽ throw, nhưng Safe helper bắt lại và trả về null
      const result = await sendSystemNotificationSafe({ title: "Crash Test" });
      assert.strictEqual(result, null);
    });
  });
});
