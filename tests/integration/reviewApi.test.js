import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../../src/modules/user/user.model.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import ThriftListing from "../../src/modules/thrift/listing/thriftListing.model.js";
import RentalOrder from "../../src/modules/rent/order/order.model.js";
import ThriftOrder from "../../src/modules/thrift/order/thriftOrder.model.js";
import Review from "../../src/modules/review/review.model.js";
import Category from "../../src/modules/category/category.model.js";
import {
  generateTestToken,
  connectTestDb,
  disconnectTestDb,
  createTestServer,
  isMongoAvailable,
} from "../helpers/testUtils.js";

describe("[REVIEW] Integration Tests: API Đánh giá & Bình luận RENT / THRIFT", async () => {
  const mongoOk = await isMongoAvailable();
  if (!mongoOk) {
    it.skip("Bỏ qua Integration Tests vì MongoDB không khả dụng", () => {});
    return;
  }

  let serverHelper;
  let testUser1, testUser2, testShopOwner;
  let user1Token, user2Token;
  let rentProduct, thriftListing;
  let completedRentOrder, deliveredThriftOrder;
  let testCategory;

  before(async () => {
    await connectTestDb();
    serverHelper = await createTestServer();

    const passwordHash = await bcrypt.hash("Password123!", 10);

    // 1. Tạo Shop Owner
    testShopOwner = await User.findOne({ role: "SHOP_OWNER" });
    if (!testShopOwner) {
      testShopOwner = await User.create({
        email: "review_test_shopowner@reuse.vn",
        passwordHash,
        fullName: "Shop Owner Review Test",
        phoneNumber: "0909000111",
        role: "SHOP_OWNER",
      });
    }

    // 2. Tạo User 1 & User 2
    testUser1 = await User.findOneAndUpdate(
      { email: "review_test_user1@reuse.vn" },
      {
        email: "review_test_user1@reuse.vn",
        passwordHash,
        fullName: "Nguyễn Khách Thuê Một",
        phoneNumber: "0909000222",
        role: "USER",
        avatarUrl: "https://res.cloudinary.com/demo/user1.jpg",
      },
      { upsert: true, returnDocument: "after" }
    );

    testUser2 = await User.findOneAndUpdate(
      { email: "review_test_user2@reuse.vn" },
      {
        email: "review_test_user2@reuse.vn",
        passwordHash,
        fullName: "Trần Khách Mua Hai",
        phoneNumber: "0909000333",
        role: "USER",
        avatarUrl: "https://res.cloudinary.com/demo/user2.jpg",
      },
      { upsert: true, returnDocument: "after" }
    );

    user1Token = generateTestToken(testUser1);
    user2Token = generateTestToken(testUser2);

    // 3. Category
    testCategory = await Category.findOne({ slug: "thiet-bi-dien-tu" });
    if (!testCategory) {
      testCategory = await Category.create({
        name: "Thiết bị điện tử",
        slug: "thiet-bi-dien-tu",
      });
    }

    // 4. Tạo RentalProduct
    rentProduct = await RentalProduct.create({
      ownerId: testShopOwner._id,
      name: `Máy ảnh Canon EOS R5 Review Test ${Date.now()}`,
      description: "Máy ảnh mirrorless chuyên nghiệp",
      categoryId: testCategory._id,
      pricePerDay: 300000,
      depositAmount: 1000000,
      images: ["https://res.cloudinary.com/demo/canon1.jpg"],
      condition: "LIKE_NEW",
      location: "Đà Nẵng",
      status: "APPROVED",
      totalQuantity: 3,
    });

    // 5. Tạo ThriftListing
    thriftListing = await ThriftListing.create({
      ownerId: testShopOwner._id,
      name: `Ống kính Canon RF 50mm f/1.2L Review Test ${Date.now()}`,
      description: "Ống kính chân dung thanh lý",
      categoryId: testCategory._id,
      price: 18000000,
      condition: "Rất tốt (90%)",
      images: ["https://res.cloudinary.com/demo/lens1.jpg"],
      location: "Đà Nẵng",
      status: "APPROVED",
      quantity: 1,
    });

    // 6. Tạo Completed RentalOrder cho testUser1
    completedRentOrder = await RentalOrder.create({
      orderCode: `RO-REV-${Date.now().toString().slice(-6)}`,
      renterId: testUser1._id,
      shopOwnerId: testShopOwner._id,
      items: [
        {
          productId: rentProduct._id,
          productName: rentProduct.name,
          rentalDays: 3,
          pricePerDay: rentProduct.pricePerDay,
          depositAmount: rentProduct.depositAmount,
          quantity: 1,
        },
      ],
      rentalDays: 3,
      rentalFee: 900000,
      depositAmount: 1000000,
      shippingFee: 35000,
      totalAmount: 1935000,
      startDate: new Date(Date.now() - 5 * 86400000),
      endDate: new Date(Date.now() - 2 * 86400000),
      shippingAddress: {
        recipientName: "Nguyễn Khách Thuê Một",
        recipientPhone: "0909000222",
        province: "Đà Nẵng",
        district: "Hải Châu",
        ward: "Hải Châu 1",
        detail: "10 Bạch Đằng",
      },
      status: "COMPLETED", // Đã hoàn tất trả hàng
    });

    // 7. Tạo Delivered ThriftOrder cho testUser2
    deliveredThriftOrder = await ThriftOrder.create({
      orderCode: `TO-REV-${Date.now().toString().slice(-6)}`,
      buyerId: testUser2._id,
      items: [
        {
          listingId: thriftListing._id,
          productId: thriftListing._id,
          name: thriftListing.name,
          price: thriftListing.price,
          quantity: 1,
          condition: thriftListing.condition,
          images: thriftListing.images,
        },
      ],
      itemsTotal: 18000000,
      shippingFee: 45000,
      totalAmount: 18045000,
      shippingAddress: {
        recipientName: "Trần Khách Mua Hai",
        recipientPhone: "0909000333",
        province: "Đà Nẵng",
        district: "Sơn Trà",
        ward: "An Hải Bắc",
        detail: "20 Võ Nguyên Giáp",
      },
      status: "DELIVERED", // Đã nhận hàng thành công
    });
  });

  after(async () => {
    if (serverHelper) {
      await serverHelper.close();
    }
    // Dọn dẹp test reviews
    if (rentProduct) {
      await Review.deleteMany({ productId: rentProduct._id });
    }
    if (thriftListing) {
      await Review.deleteMany({ productId: thriftListing._id });
    }
    await disconnectTestDb();
  });

  describe("1. POST /api/reviews: Đánh giá & bình luận trực tiếp trên Marketplace Detail", () => {
    it("Gửi review + comment + ảnh trên RENT Detail thành công (không cần orderId)", async () => {
      const res = await serverHelper.request("/api/reviews", {
        method: "POST",
        token: user1Token,
        body: {
          productId: rentProduct._id.toString(),
          productType: "RENT",
          rating: 5,
          comment: "Sản phẩm xịn sò, cầm rất đầm tay, shop tư vấn nhiệt tình!",
          images: ["https://res.cloudinary.com/demo/image1.jpg"],
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.rating, 5);
      assert.strictEqual(res.data.data.comment, "Sản phẩm xịn sò, cầm rất đầm tay, shop tư vấn nhiệt tình!");
      assert.strictEqual(res.data.data.source, "PRODUCT_DETAIL");
      assert.strictEqual(res.data.data.images.length, 1);
    });

    it("Gửi review + comment trên THRIFT Detail thành công (không cần orderId)", async () => {
      const res = await serverHelper.request("/api/reviews", {
        method: "POST",
        token: user2Token,
        body: {
          productId: thriftListing._id.toString(),
          productType: "THRIFT",
          rating: 4,
          comment: "Ống kính kính trong veo, không một vết mốc!",
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.rating, 4);
      assert.strictEqual(res.data.data.productType, "THRIFT");
      assert.strictEqual(res.data.data.source, "PRODUCT_DETAIL");
    });
  });

  describe("2. POST /api/reviews: Đánh giá từ trang Đơn hàng sau khi trả hàng / nhận hàng", () => {
    it("Đánh giá sản phẩm RENT từ Rent Order đã hoàn tất (COMPLETED) -> isVerifiedPurchase = true", async () => {
      const res = await serverHelper.request("/api/reviews", {
        method: "POST",
        token: user1Token,
        body: {
          orderId: completedRentOrder._id.toString(),
          orderType: "RENT",
          productId: rentProduct._id.toString(),
          rating: 5,
          comment: "Đã thuê và trả máy, hoàn tiền cọc đúng chuẩn 2 giờ!",
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.source, "RENT_ORDER");
      assert.strictEqual(res.data.data.isVerifiedPurchase, true);
    });

    it("Đánh giá lại cùng sản phẩm trong cùng Rent Order -> 409 REVIEW_ALREADY_EXISTS", async () => {
      const res = await serverHelper.request("/api/reviews", {
        method: "POST",
        token: user1Token,
        body: {
          orderId: completedRentOrder._id.toString(),
          orderType: "RENT",
          productId: rentProduct._id.toString(),
          rating: 4,
          comment: "Cố tình đánh giá lần hai",
        },
      });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.data.errorCode, "REVIEW_ALREADY_EXISTS");
    });

    it("Đánh giá sản phẩm THRIFT từ Thrift Order đã nhận hàng (DELIVERED) -> isVerifiedPurchase = true", async () => {
      const res = await serverHelper.request("/api/reviews", {
        method: "POST",
        token: user2Token,
        body: {
          orderId: deliveredThriftOrder._id.toString(),
          orderType: "THRIFT",
          productId: thriftListing._id.toString(),
          rating: 5,
          comment: "Đã nhận hàng từ bưu tá, niêm phong Nanuk hoàn hảo!",
        },
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.data.source, "THRIFT_ORDER");
      assert.strictEqual(res.data.data.isVerifiedPurchase, true);
    });
  });

  describe("3. GET /api/reviews/product/:productId: Lấy danh sách & Thống kê sao", () => {
    it("Lấy đầy đủ danh sách review, ratingSummary và phân bổ sao của RENT product", async () => {
      const res = await serverHelper.request(`/api/reviews/product/${rentProduct._id}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.data.length >= 2);

      const summary = res.data.ratingSummary;
      assert.ok(summary);
      assert.strictEqual(summary.averageRating, 5);
      assert.strictEqual(summary.distribution[5] >= 2, true);

      // Kiểm tra user data được populate đầy đủ
      const firstReview = res.data.data[0];
      assert.ok(firstReview.userId);
      assert.ok(firstReview.userId.fullName);
    });

    it("Lấy đầy đủ danh sách review và ratingSummary của THRIFT listing", async () => {
      const res = await serverHelper.request(`/api/reviews/product/${thriftListing._id}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.length >= 2);
      assert.strictEqual(res.data.ratingSummary.averageRating, 4.5); // 1 cái 4 sao + 1 cái 5 sao = 4.5
    });
  });

  describe("4. GET /api/reviews/order/:orderId: Kiểm tra trạng thái đánh giá của đơn hàng", () => {
    it("Rent Order trả về danh sách sản phẩm và trạng thái canReview = true, isReviewed = true", async () => {
      const res = await serverHelper.request(`/api/reviews/order/${completedRentOrder._id}`, {
        token: user1Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.orderType, "RENT");
      assert.strictEqual(res.data.data.canReview, true);
      assert.ok(res.data.data.items.some((it) => it.isReviewed === true));
    });

    it("Thrift Order trả về danh sách sản phẩm và trạng thái canReview = true, isReviewed = true", async () => {
      const res = await serverHelper.request(`/api/reviews/order/${deliveredThriftOrder._id}`, {
        token: user2Token,
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.data.orderType, "THRIFT");
      assert.strictEqual(res.data.data.canReview, true);
      assert.ok(res.data.data.items.some((it) => it.isReviewed === true));
    });
  });

  describe("5. GET /api/reviews/product/:productId/ai-summary: Tổng hợp dữ liệu phục vụ AI", () => {
    it("Trả về cấu trúc dữ liệu tóm tắt đánh giá và ngữ cảnh cho AI", async () => {
      const res = await serverHelper.request(`/api/reviews/product/${rentProduct._id}/ai-summary`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.data.summary);
      assert.ok(res.data.data.aiPromptContext);
      assert.ok(Array.isArray(res.data.data.sampleComments));
    });
  });
});
