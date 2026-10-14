import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/modules/user/user.model.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import Category from "../../src/modules/category/category.model.js";
import Cart from "../../src/modules/cart/cart.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../../src/modules/rent/order/order.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  createTestServer,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[TEST-S3-02] Integration Tests: Shipping Zone & Phân quyền Thao tác Đơn (API E2E)", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let serverHelper;
  let shopOwner, userA, userB, userUnapproved;
  let shopToken, userAToken, userBToken, userUnapprovedToken;
  let testCategory, product1, product2;
  let createdOrderAId, createdOrderBId;

  before(async () => {
    await connectTestDb();
    serverHelper = await createTestServer();

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo Category test
    testCategory = await Category.findOneAndUpdate(
      { slug: "test-category-shipping-zone" },
      {
        name: "Test Category Shipping Zone",
        slug: "test-category-shipping-zone",
        type: "RENT",
        isActive: true,
      },
      { upsert: true, returnDocument: "after" }
    );

    // 2. Tạo hoặc cập nhật Shop Owner duy nhất
    shopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwner) {
      shopOwner = await User.create({
        email: "shopowner_test_s3@reuse.vn",
        passwordHash,
        fullName: "Test Shop Owner Official",
        phoneNumber: "0901234567",
        role: "SHOP_OWNER",
        kycStatus: "APPROVED",
        address: {
          province: "Hồ Chí Minh",
          district: "Quận 1",
          ward: "Bến Nghé",
          detail: "123 Lê Lợi",
        },
      });
    } else {
      shopOwner.address = {
        province: "Hồ Chí Minh",
        district: "Quận 1",
        ward: "Bến Nghé",
        detail: "123 Lê Lợi",
      };
      await shopOwner.save();
    }

    // 3. Tạo User A (KYC APPROVED, HCM)
    userA = await User.findOneAndUpdate(
      { email: "user_a_test_s3@reuse.vn" },
      {
        email: "user_a_test_s3@reuse.vn",
        passwordHash,
        fullName: "Nguyễn Văn A - Renter",
        phoneNumber: "0981111111",
        role: "USER",
        kycStatus: "APPROVED",
        address: {
          province: "Hồ Chí Minh",
          district: "Quận 3",
          ward: "Võ Thị Sáu",
          detail: "456 Nam Kỳ Khởi Nghĩa",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // 4. Tạo User B (KYC APPROVED, Hà Nội)
    userB = await User.findOneAndUpdate(
      { email: "user_b_test_s3@reuse.vn" },
      {
        email: "user_b_test_s3@reuse.vn",
        passwordHash,
        fullName: "Trần Văn B - Renter",
        phoneNumber: "0982222222",
        role: "USER",
        kycStatus: "APPROVED",
        address: {
          province: "Hà Nội",
          district: "Ba Đình",
          ward: "Kim Mã",
          detail: "789 Kim Mã",
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    // 5. Tạo User C chưa KYC (KYC PENDING)
    userUnapproved = await User.findOneAndUpdate(
      { email: "user_c_nokyc_test_s3@reuse.vn" },
      {
        email: "user_c_nokyc_test_s3@reuse.vn",
        passwordHash,
        fullName: "Lê Văn C - Chưa KYC",
        phoneNumber: "0983333333",
        role: "USER",
        kycStatus: "PENDING",
      },
      { upsert: true, returnDocument: "after" }
    );

    // 6. Tạo 2 sản phẩm RENT thuộc cùng Shop Owner
    product1 = await RentalProduct.findOneAndUpdate(
      { name: "Sản phẩm test thuê 1 - Vest nam" },
      {
        name: "Sản phẩm test thuê 1 - Vest nam",
        description: "Mô tả sản phẩm test 1",
        categoryId: testCategory._id,
        ownerId: shopOwner._id,
        pricePerDay: 100000,
        depositAmount: 200000,
        totalQuantity: 20,
        condition: "NEW",
        location: "123 Lê Lợi, Quận 1, Hồ Chí Minh",
        status: "APPROVED",
        images: ["https://example.com/p1.jpg"],
      },
      { upsert: true, returnDocument: "after" }
    );

    product2 = await RentalProduct.findOneAndUpdate(
      { name: "Sản phẩm test thuê 2 - Đầm dạ hội" },
      {
        name: "Sản phẩm test thuê 2 - Đầm dạ hội",
        description: "Mô tả sản phẩm test 2",
        categoryId: testCategory._id,
        ownerId: shopOwner._id,
        pricePerDay: 150000,
        depositAmount: 300000,
        totalQuantity: 20,
        condition: "LIKE_NEW",
        location: "123 Lê Lợi, Quận 1, Hồ Chí Minh",
        status: "APPROVED",
        images: ["https://example.com/p2.jpg"],
      },
      { upsert: true, returnDocument: "after" }
    );

    // Tạo token cho từng user
    shopToken = generateTestToken(shopOwner);
    userAToken = generateTestToken(userA);
    userBToken = generateTestToken(userB);
    userUnapprovedToken = generateTestToken(userUnapproved);
  });

  after(async () => {
    // Dọn dẹp dữ liệu test
    if (createdOrderAId) {
      await RentalOrder.findByIdAndDelete(createdOrderAId);
    }
    if (createdOrderBId) {
      await RentalOrder.findByIdAndDelete(createdOrderBId);
    }
    if (product1?._id) {
      await RentalProduct.findByIdAndDelete(product1._id);
    }
    if (product2?._id) {
      await RentalProduct.findByIdAndDelete(product2._id);
    }
    if (testCategory?._id) {
      await Category.findByIdAndDelete(testCategory._id);
    }
    const testUserIds = [userA?._id, userB?._id, userUnapproved?._id].filter(Boolean);
    if (testUserIds.length > 0) {
      await Cart.deleteMany({ userId: { $in: testUserIds } });
      await User.deleteMany({ _id: { $in: testUserIds } });
    }
    if (serverHelper) {
      await serverHelper.close();
    }
    await disconnectTestDb();
  });

  describe("1. Kiểm tra Điều kiện Tiên quyết & Tạo Đơn Thuê", () => {
    it("User chưa duyệt KYC không thể tạo đơn thuê -> 403 KYC_NOT_APPROVED", async () => {
      // Chuẩn bị giỏ hàng cho userUnapproved
      await Cart.findOneAndUpdate(
        { userId: userUnapproved._id },
        {
          userId: userUnapproved._id,
          rentItems: [{ productId: product1._id, quantity: 1 }],
        },
        { upsert: true }
      );

      const startDate = new Date(Date.now() + 86400000).toISOString();
      const endDate = new Date(Date.now() + 2 * 86400000).toISOString();

      const res = await serverHelper.request("/api/rent/orders", {
        method: "POST",
        token: userUnapprovedToken,
        body: {
          startDate,
          endDate,
          shippingAddress: {
            recipientName: "Lê Văn C",
            recipientPhone: "0983333333",
            province: "Hồ Chí Minh",
            district: "Quận 1",
            ward: "Bến Nghé",
            detail: "123 Lê Lợi",
          },
        },
      });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "KYC_NOT_APPROVED");
    });

    it("User A tạo đơn có nhiều items: Shipping fee tính 1 lần (LOCAL 25.000 VND), không nhân theo item", async () => {
      // Đưa 2 sản phẩm vào giỏ hàng: Product 1 (qty 2), Product 2 (qty 3)
      await Cart.findOneAndUpdate(
        { userId: userA._id },
        {
          userId: userA._id,
          rentItems: [
            { productId: product1._id, quantity: 2 },
            { productId: product2._id, quantity: 3 },
          ],
        },
        { upsert: true }
      );

      const startDate = new Date(Date.now() + 86400000);
      const endDate = new Date(Date.now() + 3 * 86400000); // 2 ngày thuê

      const shippingAddress = {
        recipientName: "Nguyễn Văn A",
        recipientPhone: "0981111111",
        province: "Hồ Chí Minh",
        district: "Quận 3",
        ward: "Võ Thị Sáu",
        detail: "456 Nam Kỳ Khởi Nghĩa",
      };

      const res = await serverHelper.request("/api/rent/orders", {
        method: "POST",
        token: userAToken,
        body: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          shippingAddress,
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);

      const order = res.data.data;
      createdOrderAId = order._id;

      // Kiểm tra items
      assert.strictEqual(order.items.length, 2);
      const totalUnits = order.items.reduce((sum, it) => sum + it.quantity, 0);
      assert.strictEqual(totalUnits, 5); // Tổng 5 sản phẩm

      // Shop ở HCM, User ở HCM -> LOCAL = 25.000 VND
      assert.strictEqual(order.shippingFee, 25000);

      // Tính toán tiền
      // 2 ngày thuê:
      // Product 1: 100.000 * 2 (qty) * 2 (ngày) = 400.000
      // Product 2: 150.000 * 3 (qty) * 2 (ngày) = 900.000
      // rentalFee = 1.300.000
      // depositAmount: 200.000 * 2 + 300.000 * 3 = 1.300.000
      // shippingFee: 25.000 (TÍNH 1 LẦN)
      // totalAmount: 1.300.000 + 1.300.000 + 25.000 = 2.625.000
      assert.strictEqual(order.rentalFee, 1300000);
      assert.strictEqual(order.depositAmount, 1300000);
      assert.strictEqual(order.totalAmount, 2625000);

      // Khẳng định phí ship KHÔNG bị nhân theo số loại items (25.000 * 2 = 50.000)
      assert.notStrictEqual(order.shippingFee, 25000 * order.items.length);
      // Khẳng định phí ship KHÔNG bị nhân theo tổng số lượng units (25.000 * 5 = 125.000)
      assert.notStrictEqual(order.shippingFee, 25000 * totalUnits);

      // Kiểm tra dữ liệu shippingAddress đúng User A
      assert.strictEqual(order.shippingAddress.recipientName, shippingAddress.recipientName);
      assert.strictEqual(order.shippingAddress.recipientPhone, shippingAddress.recipientPhone);
      assert.strictEqual(order.shippingAddress.province, shippingAddress.province);
      assert.strictEqual(order.shippingAddress.detail, shippingAddress.detail);
      assert.strictEqual(order.renterId.toString(), userA._id.toString());
      assert.strictEqual(order.status, RENTAL_ORDER_STATUS.PENDING);
    });

    it("User B tạo đơn liên miền (Hà Nội): Phí ship tính INTER_REGION (45.000 VND) đúng 1 lần", async () => {
      await Cart.findOneAndUpdate(
        { userId: userB._id },
        {
          userId: userB._id,
          rentItems: [{ productId: product1._id, quantity: 1 }],
        },
        { upsert: true }
      );

      const startDate = new Date(Date.now() + 86400000);
      const endDate = new Date(Date.now() + 2 * 86400000); // 1 ngày thuê

      const shippingAddress = {
        recipientName: "Trần Văn B",
        recipientPhone: "0982222222",
        province: "Hà Nội",
        district: "Ba Đình",
        ward: "Kim Mã",
        detail: "789 Kim Mã",
      };

      const res = await serverHelper.request("/api/rent/orders", {
        method: "POST",
        token: userBToken,
        body: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          shippingAddress,
        },
      });

      assert.strictEqual(res.status, 201);
      const order = res.data.data;
      createdOrderBId = order._id;

      // HCM -> Hà Nội = 45.000 VND
      assert.strictEqual(order.shippingFee, 45000);
      assert.strictEqual(order.totalAmount, order.rentalFee + order.depositAmount + 45000);
      assert.strictEqual(order.shippingAddress.province, "Hà Nội");
    });
  });

  describe("2. Chặn User không gọi được API của Shop Owner (RBAC Security)", () => {
    it("User không thể gọi API Approve đơn (POST /api/rent/orders/:id/approve) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/approve`,
        {
          method: "POST",
          token: userAToken,
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User không thể gọi API Reject đơn (POST /api/rent/orders/:id/reject) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/reject`,
        {
          method: "POST",
          token: userAToken,
          body: { reason: "Tôi muốn từ chối" },
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User không thể gọi API Handover đơn (POST /api/rent/orders/:id/handover) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/handover`,
        {
          method: "POST",
          token: userAToken,
          body: {
            carrierName: "GHTK",
            trackingCode: "VN999",
          },
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User không thể xem danh sách đơn của shop (GET /api/rent/orders/shop) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/rent/orders/shop", {
        method: "GET",
        token: userAToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User không thể cập nhật trạng thái đơn (PATCH /api/rent/orders/:id/status) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/status`,
        {
          method: "PATCH",
          token: userAToken,
          body: { status: "CONFIRMED" },
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });
  });

  describe("3. Chặn IDOR - User không thể xem hoặc sửa order của người khác", () => {
    it("User B không thể xem chi tiết đơn của User A (GET /api/rent/orders/:id) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}`,
        {
          method: "GET",
          token: userBToken,
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User B không thể hủy đơn của User A (PATCH /api/rent/orders/:id/cancel) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/cancel`,
        {
          method: "PATCH",
          token: userBToken,
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User B không thể xác nhận nhận hàng cho đơn của User A (POST /api/rent/orders/:id/confirm-received) -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/confirm-received`,
        {
          method: "POST",
          token: userBToken,
        }
      );
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User A xem danh sách đơn của mình (GET /api/rent/orders/my-orders) -> chỉ thấy đơn của mình", async () => {
      const res = await serverHelper.request("/api/rent/orders/my-orders", {
        method: "GET",
        token: userAToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      const orders = res.data.data.orders;

      // Tất cả đơn hàng trả về đều phải có renterId là User A
      for (const ord of orders) {
        assert.strictEqual(ord.renterId.toString(), userA._id.toString());
      }

      // Tuyệt đối không chứa đơn của User B
      const containsOrderB = orders.some(
        (o) => o._id.toString() === createdOrderBId.toString()
      );
      assert.strictEqual(containsOrderB, false);
    });
  });

  describe("4. Chỉ Shop Owner duy nhất của đơn mới được Approve / Reject / Handover", () => {
    it("Shop Owner của đơn gọi Approve -> Chuyển thành công sang WAITING_PAYMENT", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/approve`,
        {
          method: "POST",
          token: shopToken,
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.status, RENTAL_ORDER_STATUS.WAITING_PAYMENT);
    });

    it("Không thể Approve lại đơn đã được xử lý -> 400 ORDER_ALREADY_PROCESSED", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/approve`,
        {
          method: "POST",
          token: shopToken,
        }
      );

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "ORDER_ALREADY_PROCESSED");
    });

    it("Shop Owner không thể handover đơn khi chưa thanh toán (chưa PAID) -> 400 ORDER_NOT_PAID", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/handover`,
        {
          method: "POST",
          token: shopToken,
          body: {
            carrierName: "Giao Hàng Nhanh",
            trackingCode: "GHN-123456",
          },
        }
      );

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "ORDER_NOT_PAID");
    });

    it("Sau khi đơn chuyển PAID, Shop Owner handover thành công -> Status HANDED_OVER", async () => {
      // Giả lập thanh toán hoàn tất (cập nhật status thành PAID trong DB)
      await RentalOrder.findByIdAndUpdate(createdOrderAId, {
        status: RENTAL_ORDER_STATUS.PAID,
        paymentStatus: "PAID",
      });

      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/handover`,
        {
          method: "POST",
          token: shopToken,
          body: {
            carrierName: "GHTK Express",
            trackingCode: "GHTK-987654321",
            status: RENTAL_ORDER_STATUS.HANDED_OVER,
          },
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.status, RENTAL_ORDER_STATUS.HANDED_OVER);
      assert.strictEqual(
        res.data.data.shippingDetails.carrierName,
        "GHTK Express"
      );
      assert.strictEqual(
        res.data.data.shippingDetails.trackingCode,
        "GHTK-987654321"
      );
    });

    it("User A (chính chủ) xác nhận đã nhận đồ -> Chuyển sang RENTING và lưu receivedAt", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}/confirm-received`,
        {
          method: "POST",
          token: userAToken,
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.status, RENTAL_ORDER_STATUS.RENTING);
      assert.ok(res.data.data.receivedAt);
    });

    it("User xem lại chi tiết đơn hàng: shippingAddress khớp chính xác dữ liệu của User", async () => {
      const res = await serverHelper.request(
        `/api/rent/orders/${createdOrderAId}`,
        {
          method: "GET",
          token: userAToken,
        }
      );

      assert.strictEqual(res.status, 200);
      const order = res.data.data;
      assert.strictEqual(order.shippingAddress.recipientName, "Nguyễn Văn A");
      assert.strictEqual(order.shippingAddress.recipientPhone, "0981111111");
      assert.strictEqual(order.shippingAddress.province, "Hồ Chí Minh");
      assert.strictEqual(order.shippingAddress.detail, "456 Nam Kỳ Khởi Nghĩa");
    });
  });
});
