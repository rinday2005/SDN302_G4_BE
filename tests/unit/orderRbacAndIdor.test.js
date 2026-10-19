import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import authorize from "../../src/middleware/role.middleware.js";
import {
  approveOrder,
  rejectOrder,
  handoverOrder,
  getOrderById,
  cancelOrder,
  confirmReceivedOrder,
  updateOrderStatus,
} from "../../src/modules/rent/order/order.service.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../../src/modules/rent/order/order.model.js";

describe("[TEST-S3-02] Unit Tests: Phân quyền Thao tác Đơn & Chặn IDOR", () => {
  const shopOwnerId = new mongoose.Types.ObjectId();
  const otherShopOwnerId = new mongoose.Types.ObjectId();
  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  const mockShopOwner = { _id: shopOwnerId, role: "SHOP_OWNER" };
  const mockOtherShopOwner = { _id: otherShopOwnerId, role: "SHOP_OWNER" };
  const mockUserA = { _id: userAId, role: "USER" };
  const mockUserB = { _id: userBId, role: "USER" };
  const mockAdmin = { _id: adminId, role: "ADMIN" };

  describe("1. Phân quyền Middleware (Role Middleware Authorization)", () => {
    it("User không thể vượt qua authorize(['SHOP_OWNER']) -> 403 FORBIDDEN", () => {
      const req = { user: mockUserA };
      let capturedError = null;

      authorize(["SHOP_OWNER"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("User không thể vượt qua authorize(['SHOP_OWNER', 'ADMIN']) -> 403 FORBIDDEN", () => {
      const req = { user: mockUserA };
      let capturedError = null;

      authorize(["SHOP_OWNER", "ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("Chỉ SHOP_OWNER được qua authorize(['SHOP_OWNER'])", () => {
      const req = { user: mockShopOwner };
      let nextCalled = false;
      let capturedError = null;

      authorize(["SHOP_OWNER"])(req, {}, (err) => {
        if (err) capturedError = err;
        else nextCalled = true;
      });

      assert.strictEqual(capturedError, null);
      assert.strictEqual(nextCalled, true);
    });

    it("Chưa xác thực (không có req.user) bị chặn -> 401 UNAUTHORIZED", () => {
      const req = {};
      let capturedError = null;

      authorize(["SHOP_OWNER"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 401);
      assert.strictEqual(capturedError.errorCode, "UNAUTHORIZED");
    });
  });

  describe("2. Chỉ Shop Owner duy nhất của đơn mới được Approve / Reject / Handover", () => {
    // Mock RentalOrder.findById tạm thời cho unit test
    const originalFindById = RentalOrder.findById;

    const createMockOrder = (status = RENTAL_ORDER_STATUS.PENDING) => {
      const order = {
        _id: new mongoose.Types.ObjectId(),
        shopOwnerId: shopOwnerId,
        renterId: userAId,
        status: status,
        shippingDetails: {},
        save: async function () {
          return this;
        },
      };
      return order;
    };

    it("User (role USER) gọi approveOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder();
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await approveOrder(mockOrder._id.toString(), mockUserA);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Shop Owner khác (không sở hữu đơn) gọi approveOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder();
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await approveOrder(mockOrder._id.toString(), mockOtherShopOwner);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Đúng Shop Owner gọi approveOrder khi PENDING -> Thành công chuyển sang WAITING_PAYMENT", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PENDING);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const approved = await approveOrder(mockOrder._id.toString(), mockShopOwner);
      assert.strictEqual(approved.status, RENTAL_ORDER_STATUS.WAITING_PAYMENT);
    });

    it("Đơn đã xử lý (không phải PENDING) không thể approve lại -> 400 ORDER_ALREADY_PROCESSED", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.WAITING_PAYMENT);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await approveOrder(mockOrder._id.toString(), mockShopOwner);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, "ORDER_ALREADY_PROCESSED");
          return true;
        }
      );
    });

    it("User gọi rejectOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder();
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await rejectOrder(mockOrder._id.toString(), mockUserA);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Shop Owner khác gọi rejectOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder();
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await rejectOrder(mockOrder._id.toString(), mockOtherShopOwner);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Đúng Shop Owner gọi rejectOrder khi PENDING -> Thành công chuyển sang REJECTED", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PENDING);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const rejected = await rejectOrder(mockOrder._id.toString(), mockShopOwner, {
        reason: "Hết hàng đột xuất",
      });
      assert.strictEqual(rejected.status, RENTAL_ORDER_STATUS.REJECTED);
      assert.strictEqual(rejected.rejectionReason, "Hết hàng đột xuất");
    });

    it("User gọi handoverOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PAID);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await handoverOrder(mockOrder._id.toString(), mockUserA, {
            carrierName: "GHTK",
            trackingCode: "VN123456",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Shop Owner khác gọi handoverOrder -> Bị chặn 403 FORBIDDEN", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PAID);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await handoverOrder(mockOrder._id.toString(), mockOtherShopOwner, {
            carrierName: "GHTK",
            trackingCode: "VN123456",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("Shop Owner gọi handoverOrder khi đơn chưa thanh toán -> 400 ORDER_NOT_PAID", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PENDING);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await handoverOrder(mockOrder._id.toString(), mockShopOwner, {
            carrierName: "GHTK",
            trackingCode: "VN123456",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, "ORDER_NOT_PAID");
          return true;
        }
      );
    });

    it("Đúng Shop Owner gọi handoverOrder khi đơn đã PAID -> Thành công chuyển HANDED_OVER", async () => {
      const mockOrder = createMockOrder(RENTAL_ORDER_STATUS.PAID);
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const handedOver = await handoverOrder(
        mockOrder._id.toString(),
        mockShopOwner,
        {
          carrierName: "GHTK",
          trackingCode: "GHTK-9999",
          status: RENTAL_ORDER_STATUS.HANDED_OVER,
        }
      );
      assert.strictEqual(handedOver.status, RENTAL_ORDER_STATUS.HANDED_OVER);
      assert.strictEqual(handedOver.shippingDetails.carrierName, "GHTK");
      assert.strictEqual(handedOver.shippingDetails.trackingCode, "GHTK-9999");
    });

    // Cleanup mock
    RentalOrder.findById = originalFindById;
  });

  describe("3. Chặn IDOR - Không có trường hợp User sửa/xem order của người khác", () => {
    const originalFindById = RentalOrder.findById;

    it("User B không thể xem chi tiết đơn của User A (getOrderById) -> 403 FORBIDDEN", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        populate: function () {
          return this;
        },
      };
      RentalOrder.findById = () => ({
        populate: () => ({
          populate: () => Promise.resolve(mockOrder),
        }),
      });

      await assert.rejects(
        async () => {
          await getOrderById(mockOrder._id.toString(), mockUserB);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("User B không thể hủy đơn của User A (cancelOrder) -> 403 FORBIDDEN", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.PENDING,
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await cancelOrder(mockOrder._id.toString(), mockUserB);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("User A (chính chủ) hủy được đơn PENDING của mình", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.PENDING,
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const cancelled = await cancelOrder(mockOrder._id.toString(), mockUserA);
      assert.strictEqual(cancelled.status, RENTAL_ORDER_STATUS.CANCELLED);
    });

    it("User A không thể hủy đơn khi đã được xử lý (không còn PENDING) -> 400", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.WAITING_PAYMENT,
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await cancelOrder(mockOrder._id.toString(), mockUserA);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.errorCode, "ORDER_CANNOT_BE_CANCELLED");
          return true;
        }
      );
    });

    it("User B không thể xác nhận nhận hàng (confirmReceivedOrder) cho đơn của User A -> 403 FORBIDDEN", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.HANDED_OVER,
        shippingDetails: {},
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await confirmReceivedOrder(mockOrder._id.toString(), mockUserB);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    it("User A (chính chủ) xác nhận nhận hàng khi đơn HANDED_OVER -> chuyển sang RENTING", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.HANDED_OVER,
        shippingDetails: {},
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const confirmed = await confirmReceivedOrder(mockOrder._id.toString(), mockUserA);
      assert.strictEqual(confirmed.status, RENTAL_ORDER_STATUS.RENTING);
      assert.ok(confirmed.receivedAt instanceof Date);
    });

    it("User A ký xác nhận biên bản bàn giao CLA kèm ảnh đối kiểm 3 góc -> Lưu claProof thành công", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.DELIVERED,
        shippingAddress: {
          recipientName: "Nguyễn Văn A",
          recipientPhone: "0901234567",
        },
        shippingDetails: {},
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      const payload = {
        photos: {
          slot1: "https://example.com/photo1.jpg",
          slot2: "https://example.com/photo2.jpg",
          slot3: "https://example.com/photo3.jpg",
        },
        note: "Hộp còn nguyên niêm phong Nanuk, máy không trầy xước",
        signerName: "Nguyễn Văn A",
        signerPhone: "0901234567",
      };

      const confirmed = await confirmReceivedOrder(mockOrder._id.toString(), mockUserA, payload);
      assert.strictEqual(confirmed.status, RENTAL_ORDER_STATUS.RENTING);
      assert.ok(confirmed.claProof);
      assert.strictEqual(confirmed.claProof.isSigned, true);
      assert.strictEqual(confirmed.claProof.photos.slot1, "https://example.com/photo1.jpg");
      assert.strictEqual(confirmed.claProof.photos.slot2, "https://example.com/photo2.jpg");
      assert.strictEqual(confirmed.claProof.photos.slot3, "https://example.com/photo3.jpg");
      assert.strictEqual(confirmed.claProof.signerName, "Nguyễn Văn A");
      assert.strictEqual(confirmed.claProof.note, "Hộp còn nguyên niêm phong Nanuk, máy không trầy xước");
    });

    it("User thường không thể gọi updateOrderStatus -> 403 FORBIDDEN", async () => {
      const mockOrder = {
        _id: new mongoose.Types.ObjectId(),
        renterId: userAId,
        shopOwnerId: shopOwnerId,
        status: RENTAL_ORDER_STATUS.PENDING,
        save: async function () {
          return this;
        },
      };
      RentalOrder.findById = () => Promise.resolve(mockOrder);

      await assert.rejects(
        async () => {
          await updateOrderStatus(
            mockOrder._id.toString(),
            RENTAL_ORDER_STATUS.CONFIRMED,
            mockUserA
          );
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.errorCode, "FORBIDDEN");
          return true;
        }
      );
    });

    // Cleanup mock
    RentalOrder.findById = originalFindById;
  });
});
