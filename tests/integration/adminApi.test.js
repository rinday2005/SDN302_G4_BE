import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/modules/user/user.model.js";
import Category from "../../src/modules/category/category.model.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import ThriftListing from "../../src/modules/thrift/listing/thriftListing.model.js";
import RentalOrder, { RENTAL_ORDER_STATUS } from "../../src/modules/rent/order/order.model.js";
import ThriftOrder from "../../src/modules/thrift/order/thriftOrder.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  createTestServer,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[ADMIN] Integration Tests: Kiểm duyệt Listing, Xử lý Tranh chấp & Báo cáo Tài chính", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let serverHelper;
  let regularUser, shopOwnerUser, adminUser;
  let userToken, shopOwnerToken, adminToken;
  let testCategory;
  let pendingRentProduct, pendingThriftListing;
  let disputedRentalOrder;

  before(async () => {
    await connectTestDb();
    serverHelper = await createTestServer();

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo hoặc lấy Regular User
    regularUser = await User.findOneAndUpdate(
      { email: "admin_test_user@reuse.vn" },
      {
        email: "admin_test_user@reuse.vn",
        passwordHash,
        fullName: "Người Thuê Admin Test",
        phoneNumber: "0901234567",
        role: "USER",
        kycStatus: "APPROVED",
      },
      { upsert: true, returnDocument: "after" }
    );

    // 2. Tìm hoặc tạo Shop Owner duy nhất
    shopOwnerUser = await User.findOne({ role: "SHOP_OWNER" });
    if (!shopOwnerUser) {
      shopOwnerUser = await User.create({
        email: "admin_test_shopowner@reuse.vn",
        passwordHash,
        fullName: "Chủ Shop ReUse Official",
        phoneNumber: "0907654321",
        role: "SHOP_OWNER",
        kycStatus: "APPROVED",
      });
    }

    // 3. Tạo Admin User
    adminUser = await User.findOneAndUpdate(
      { email: "admin_test_moderator@reuse.vn" },
      {
        email: "admin_test_moderator@reuse.vn",
        passwordHash,
        fullName: "Tổng Giám Thị Admin",
        phoneNumber: "0999000111",
        role: "ADMIN",
        kycStatus: "APPROVED",
      },
      { upsert: true, returnDocument: "after" }
    );

    // Tokens
    userToken = generateTestToken(regularUser);
    shopOwnerToken = generateTestToken(shopOwnerUser);
    adminToken = generateTestToken(adminUser);

    // 4. Tạo Category test
    testCategory = await Category.findOneAndUpdate(
      { slug: "thoi-trang-admin-test" },
      {
        name: "Thời Trang Admin Test",
        slug: "thoi-trang-admin-test",
        type: "BOTH",
        isActive: true,
      },
      { upsert: true, returnDocument: "after" }
    );

    // 5. Tạo 1 sản phẩm RENT chờ duyệt (PENDING_APPROVAL)
    pendingRentProduct = await RentalProduct.create({
      ownerId: shopOwnerUser._id,
      name: "Đầm Dạ Hội Cao Cấp ReUse Test",
      description: "Đầm dạ hội cho thuê chờ duyệt kiểm định chất lượng",
      categoryId: testCategory._id,
      pricePerDay: 150000,
      depositAmount: 500000,
      images: ["https://example.com/dam1.jpg"],
      condition: "LIKE_NEW",
      rentalRules: "Giữ gìn cẩn thận không để dính rượu vang",
      location: "Hà Nội",
      status: "PENDING_APPROVAL",
      totalQuantity: 2,
      availableQuantity: 2,
    });

    // 6. Tạo 1 listing THRIFT chờ duyệt (PENDING_APPROVAL)
    pendingThriftListing = await ThriftListing.create({
      ownerId: shopOwnerUser._id,
      name: "Áo Khoác Da Vintage ReUse Test",
      description: "Áo khoác da thanh lý chờ admin duyệt",
      categoryId: testCategory._id,
      price: 320000,
      condition: "Rất tốt (90%)",
      images: ["https://example.com/aoda.jpg"],
      location: "Đà Nẵng",
      status: "PENDING_APPROVAL",
      quantity: 1,
    });

    // 7. Tạo 1 đơn thuê có tranh chấp (RentalOrder DISPUTED)
    disputedRentalOrder = await RentalOrder.create({
      orderCode: `RH-DISP-${Date.now().toString().slice(-6)}`,
      renterId: regularUser._id,
      shopOwnerId: shopOwnerUser._id,
      items: [
        {
          productId: pendingRentProduct._id,
          productName: pendingRentProduct.name,
          rentalDays: 3,
          pricePerDay: 150000,
          depositAmount: 500000,
          quantity: 1,
        },
      ],
      rentalFee: 450000,
      depositAmount: 500000,
      shippingFee: 35000,
      totalAmount: 985000,
      startDate: new Date(),
      endDate: new Date(Date.now() + 3 * 86400000),
      shippingAddress: {
        recipientName: "Người Thuê Admin Test",
        recipientPhone: "0901234567",
        province: "Hà Nội",
        district: "Ba Đình",
        ward: "Cống Vị",
        detail: "123 Đường Test",
      },
      status: RENTAL_ORDER_STATUS.DISPUTED,
      dispute: {
        status: "OPEN",
        reason: "Shop giữ lại toàn bộ cọc vì cho rằng váy bị rách, renter khẳng định váy đã xước từ trước",
        damageImages: ["https://example.com/dispute-tear.jpg"],
        reportedBy: regularUser._id,
        reportedAt: new Date(),
      },
    });
  });

  after(async () => {
    if (serverHelper?.close) {
      await serverHelper.close();
    }
    // Dọn dẹp dữ liệu test
    if (pendingRentProduct) {
      await RentalProduct.deleteOne({ _id: pendingRentProduct._id });
    }
    if (pendingThriftListing) {
      await ThriftListing.deleteOne({ _id: pendingThriftListing._id });
    }
    if (disputedRentalOrder) {
      await RentalOrder.deleteOne({ _id: disputedRentalOrder._id });
    }
    if (regularUser) {
      await User.deleteOne({ _id: regularUser._id });
    }
    await User.deleteOne({ email: "admin_test_moderator@reuse.vn" });
    await disconnectTestDb();
  });

  // ==========================================================================
  // 1. AC: Phân quyền RBAC nghiêm ngặt (Chỉ ADMIN gọi được, User/Shop nhận 403)
  // ==========================================================================
  describe("1. AC RBAC: Phân quyền API Admin", () => {
    it("Chưa đăng nhập gọi GET /api/admin/listings/pending -> 401 UNAUTHORIZED", async () => {
      const res = await serverHelper.request("/api/admin/listings/pending");
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.errorCode, "UNAUTHORIZED");
    });

    it("User thường gọi GET /api/admin/listings/pending -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/listings/pending", {
        token: userToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("Shop Owner gọi GET /api/admin/listings/pending -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/listings/pending", {
        token: shopOwnerToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User thường gọi GET /api/admin/disputes -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/disputes", {
        token: userToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("Shop Owner gọi GET /api/admin/disputes -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/disputes", {
        token: shopOwnerToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("User thường gọi GET /api/admin/finance/overview -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/finance/overview", {
        token: userToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });

    it("Shop Owner gọi GET /api/admin/finance/overview -> 403 FORBIDDEN", async () => {
      const res = await serverHelper.request("/api/admin/finance/overview", {
        token: shopOwnerToken,
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.data.errorCode, "FORBIDDEN");
    });
  });

  // ==========================================================================
  // 2. AC: Kiểm duyệt Listing Toàn diện (RENT & THRIFT)
  // ==========================================================================
  describe("2. AC: Kiểm duyệt Listings (RENT & THRIFT)", () => {
    it("Admin gọi GET /api/admin/listings/pending -> 200, trả về danh sách listing RENT & THRIFT", async () => {
      const res = await serverHelper.request("/api/admin/listings/pending", {
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.rent);
      assert.ok(res.data.data.thrift);
      assert.ok(Array.isArray(res.data.data.rent.items));
      assert.ok(Array.isArray(res.data.data.thrift.items));
      assert.ok(res.data.data.totalPending >= 2);

      const foundRent = res.data.data.rent.items.find(
        (i) => i._id === pendingRentProduct._id.toString()
      );
      assert.ok(foundRent, "Phải tìm thấy sản phẩm RENT chờ duyệt");

      const foundThrift = res.data.data.thrift.items.find(
        (i) => i._id === pendingThriftListing._id.toString()
      );
      assert.ok(foundThrift, "Phải tìm thấy listing THRIFT chờ duyệt");
    });

    it("Từ chối listing mà không cung cấp lý do -> 400 REJECTION_REASON_REQUIRED", async () => {
      const res = await serverHelper.request(
        `/api/admin/listings/${pendingRentProduct._id}/status`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            status: "REJECTED",
          },
        }
      );

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("Admin duyệt sản phẩm RENT -> 200, status cập nhật thành APPROVED trong database", async () => {
      const res = await serverHelper.request(
        `/api/admin/rent/listings/${pendingRentProduct._id}/status`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            status: "APPROVED",
          },
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Đối chiếu database
      const updatedProduct = await RentalProduct.findById(pendingRentProduct._id);
      assert.strictEqual(updatedProduct.status, "APPROVED");
      assert.strictEqual(updatedProduct.rejectionReason, "");
    });

    it("Admin từ chối listing THRIFT có lý do -> 200, status REJECTED và lưu rejectionReason vào database", async () => {
      const reason = "Hình ảnh sản phẩm không chụp rõ tem mác nguồn gốc và bị mờ";
      const res = await serverHelper.request(
        `/api/admin/thrift/listings/${pendingThriftListing._id}/status`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            status: "REJECTED",
            rejectionReason: reason,
          },
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Đối chiếu database
      const updatedThrift = await ThriftListing.findById(pendingThriftListing._id);
      assert.strictEqual(updatedThrift.status, "REJECTED");
      assert.strictEqual(updatedThrift.rejectionReason, reason);
    });
  });

  // ==========================================================================
  // 3. AC: Xử lý Tranh chấp (RentalOrder disputes)
  // ==========================================================================
  describe("3. AC: Xử lý Tranh chấp Đơn thuê (Dispute Resolution)", () => {
    it("Admin gọi GET /api/admin/disputes -> 200, hiển thị danh sách đơn tranh chấp và metrics", async () => {
      const res = await serverHelper.request("/api/admin/disputes", {
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.data.disputes));
      assert.ok(res.data.data.metrics);
      assert.ok(res.data.data.metrics.openCount >= 1);
      assert.ok(res.data.data.metrics.lockedEscrowAmount >= 500000);

      const foundDispute = res.data.data.disputes.find(
        (d) => d.id === disputedRentalOrder._id.toString()
      );
      assert.ok(foundDispute, "Phải tìm thấy đơn hàng tranh chấp trong danh sách");
      assert.strictEqual(foundDispute.disputeStatus, "OPEN");
      assert.strictEqual(foundDispute.escrowLocked, 500000);
    });

    it("Admin gọi GET /api/admin/disputes/:id -> 200, lấy chi tiết tranh chấp", async () => {
      const res = await serverHelper.request(
        `/api/admin/disputes/${disputedRentalOrder._id}`,
        {
          token: adminToken,
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.orderType, "RENT");
      assert.strictEqual(res.data.data.order._id, disputedRentalOrder._id.toString());
      assert.strictEqual(res.data.data.order.status, "DISPUTED");
    });

    it("Giải quyết tranh chấp vượt quá số tiền cọc (refund + payout > deposit) -> 400 DISPUTE_AMOUNT_EXCEEDS_DEPOSIT", async () => {
      // depositAmount = 500,000; gửi refund: 400,000 + payout: 200,000 = 600,000 > 500,000
      const res = await serverHelper.request(
        `/api/admin/disputes/${disputedRentalOrder._id}/resolve`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            resolution: "SPLIT",
            refundToRenter: 400000,
            payoutToShop: 200000,
            adminNotes: "Thử vượt quá cọc",
          },
        }
      );

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.errorCode, "DISPUTE_AMOUNT_EXCEEDS_DEPOSIT");
    });

    it("Admin giải quyết tranh chấp hợp lệ (SPLIT) -> 200, chuyển đơn sang COMPLETED & cập nhật Escrow phân bổ", async () => {
      const res = await serverHelper.request(
        `/api/admin/disputes/${disputedRentalOrder._id}/resolve`,
        {
          method: "PATCH",
          token: adminToken,
          body: {
            resolution: "SPLIT",
            refundToRenter: 350000,
            payoutToShop: 150000,
            adminNotes: "Admin phán quyết: Váy có vết ố nhỏ, bồi thường Shop 150k chi phí hấp sấy, hoàn 350k cọc cho Renter",
          },
        }
      );

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      // Đối chiếu dữ liệu chính xác trong database
      const resolvedOrder = await RentalOrder.findById(disputedRentalOrder._id);
      assert.strictEqual(resolvedOrder.status, RENTAL_ORDER_STATUS.COMPLETED);
      assert.strictEqual(resolvedOrder.dispute.status, "RESOLVED");
      assert.strictEqual(resolvedOrder.dispute.resolution, "SPLIT");
      assert.strictEqual(resolvedOrder.dispute.refundToRenter, 350000);
      assert.strictEqual(resolvedOrder.dispute.payoutToShop, 150000);
      assert.strictEqual(
        resolvedOrder.dispute.resolvedBy.toString(),
        adminUser._id.toString()
      );
      assert.ok(resolvedOrder.dispute.resolvedAt);
    });
  });

  // ==========================================================================
  // 4. AC: Báo cáo Tài chính toàn diện Hệ thống & Shop Owner duy nhất
  // ==========================================================================
  describe("4. AC: Báo cáo Tài chính Toàn Hệ thống & Shop Owner duy nhất", () => {
    it("Admin gọi GET /api/admin/finance/overview -> 200, dữ liệu phản ánh đúng database", async () => {
      const res = await serverHelper.request("/api/admin/finance/overview", {
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);

      const { overview, singleShopOwner, ordersBreakdown } = res.data.data;

      // 1. Kiểm tra cấu trúc số liệu tài chính toàn hệ thống
      assert.ok(overview);
      assert.strictEqual(typeof overview.totalPlatformGmv, "number");
      assert.strictEqual(typeof overview.totalPlatformRevenue, "number");
      assert.strictEqual(typeof overview.totalRentalRevenue, "number");
      assert.strictEqual(typeof overview.totalShippingRevenue, "number");
      assert.strictEqual(typeof overview.totalThriftSales, "number");
      assert.strictEqual(typeof overview.lockedEscrowAmount, "number");
      assert.strictEqual(typeof overview.totalDepositsRefunded, "number");
      assert.strictEqual(typeof overview.totalDamagePenalties, "number");
      assert.ok(overview.totalUsers >= 2);
      assert.ok(overview.totalRentalProducts >= 1);

      // 2. Kiểm tra thông tin Shop Owner duy nhất của hệ thống
      assert.ok(singleShopOwner);
      assert.ok(singleShopOwner.profile);
      assert.strictEqual(singleShopOwner.profile.email, shopOwnerUser.email);
      assert.strictEqual(singleShopOwner.profile.storeName, "ReUse Official Shop");

      // 3. Kiểm tra hiệu suất tài chính của Shop Owner
      assert.ok(singleShopOwner.performance);
      assert.strictEqual(typeof singleShopOwner.performance.totalOrdersReceived, "number");
      assert.strictEqual(typeof singleShopOwner.performance.rentalEarnings, "number");
      assert.strictEqual(typeof singleShopOwner.performance.damageCompensation, "number");
      assert.strictEqual(typeof singleShopOwner.performance.netRevenue, "number");

      // Net revenue = rentalEarnings + damageCompensation
      assert.strictEqual(
        singleShopOwner.performance.netRevenue,
        singleShopOwner.performance.rentalEarnings + singleShopOwner.performance.damageCompensation
      );

      // 4. Phân rã trạng thái đơn hàng (ordersBreakdown)
      assert.ok(ordersBreakdown);
      assert.strictEqual(typeof ordersBreakdown.COMPLETED, "number");
      assert.ok(ordersBreakdown.COMPLETED >= 1);
    });

    it("Alias GET /api/admin/finance -> 200, trả về cùng dữ liệu tài chính", async () => {
      const res = await serverHelper.request("/api/admin/finance", {
        token: adminToken,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.overview);
      assert.ok(res.data.data.singleShopOwner);
    });
  });
});
