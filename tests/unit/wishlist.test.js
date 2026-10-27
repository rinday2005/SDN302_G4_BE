import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Wishlist from "../../src/modules/wishlist/wishlist.model.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import ThriftListing from "../../src/modules/thrift/listing/thriftListing.model.js";
import {
  getUserWishlist,
  toggleWishlist,
  addToWishlist,
  removeFromWishlist,
  clearWishlist,
} from "../../src/modules/wishlist/wishlist.service.js";
import { validateToggleWishlist } from "../../src/modules/wishlist/wishlist.validation.js";

describe("[BE-S6-01] Unit Tests: API Danh sách Yêu thích (Wishlist Module)", () => {
  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();
  const rentProductId = new mongoose.Types.ObjectId();
  const thriftListingId = new mongoose.Types.ObjectId();

  const mockRentProduct = {
    _id: rentProductId,
    name: "Máy ảnh Sony Alpha A7 III",
    pricePerDay: 250000,
    depositAmount: 5000000,
    images: ["https://example.com/sony.jpg"],
    condition: "EXCELLENT",
    location: "Hà Nội",
    totalQuantity: 3,
    populate: function () {
      return this;
    },
  };

  const mockThriftListing = {
    _id: thriftListingId,
    name: "Áo khoác Vintage Leather 1990s",
    price: 450000,
    images: ["https://example.com/leather.jpg"],
    condition: "LIKE_NEW",
    location: "TP. Hồ Chí Minh",
    quantity: 1,
    status: "APPROVED",
    populate: function () {
      return this;
    },
  };

  beforeEach(() => {
    // Mock RentalProduct and ThriftListing find queries
    RentalProduct.findById = (id) => {
      const query = {
        select: () => query,
        populate: () => query,
        then: (resolve) => {
          if (id && id.toString() === rentProductId.toString()) {
            return resolve(mockRentProduct);
          }
          return resolve(null);
        },
      };
      return query;
    };

    ThriftListing.findById = (id) => {
      const query = {
        select: () => query,
        populate: () => query,
        then: (resolve) => {
          if (id && id.toString() === thriftListingId.toString()) {
            return resolve(mockThriftListing);
          }
          return resolve(null);
        },
      };
      return query;
    };
  });

  describe("1. Schema Validations: Wishlist Schema & Items", () => {
    it("Model Wishlist có đầy đủ userId và items với itemId, itemType", () => {
      const item = {
        itemId: rentProductId,
        itemType: "RENT",
      };

      const doc = new Wishlist({
        userId: userAId,
        items: [item],
      });

      assert.strictEqual(doc.userId.toString(), userAId.toString());
      assert.strictEqual(doc.items.length, 1);
      assert.strictEqual(doc.items[0].itemId.toString(), rentProductId.toString());
      assert.strictEqual(doc.items[0].itemType, "RENT");
    });

    it("Schema tự động đồng bộ itemId <-> productId và itemType <-> productType", async () => {
      const doc = new Wishlist({
        userId: userAId,
        items: [
          {
            itemId: thriftListingId,
            itemType: "THRIFT",
          },
        ],
      });

      await doc.validate();
      assert.strictEqual(doc.items[0].productId.toString(), thriftListingId.toString());
      assert.strictEqual(doc.items[0].productType, "THRIFT");
    });

    it("Chỉ chấp nhận itemType là 'RENT' hoặc 'THRIFT'", async () => {
      const doc = new Wishlist({
        userId: userAId,
        items: [
          {
            itemId: rentProductId,
            itemType: "INVALID_TYPE",
          },
        ],
      });

      let capturedError = null;
      try {
        await doc.validate();
      } catch (err) {
        capturedError = err;
      }

      assert.ok(capturedError);
    });
  });

  describe("2. Validation Middleware: validateToggleWishlist", () => {
    it("Báo lỗi khi thiếu itemId / productId -> 400 INVALID_INPUT", () => {
      const req = { body: {} };
      let capturedError = null;

      validateToggleWishlist(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_INPUT");
    });

    it("Báo lỗi khi itemType không hợp lệ -> 400 INVALID_ITEM_TYPE", () => {
      const req = { body: { itemId: rentProductId.toString(), itemType: "UNKNOWN" } };
      let capturedError = null;

      validateToggleWishlist(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_ITEM_TYPE");
    });

    it("Cho phép khi itemId hợp lệ và itemType chuẩn", () => {
      const req = { body: { itemId: rentProductId.toString(), itemType: "rent" } };
      let capturedError = null;

      validateToggleWishlist(req, {}, (err) => {
        capturedError = err;
      });

      assert.strictEqual(capturedError, undefined);
      assert.strictEqual(req.body.itemType, "RENT");
    });
  });

  describe("3. AC: Toggle lần 1 thêm, lần 2 xóa (RENT & THRIFT)", () => {
    it("Toggle lần 1: Thêm sản phẩm RENT vào danh sách yêu thích -> isFavorited = true", async () => {
      const mockWishlistDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userAId,
        items: [],
        save: async function () {
          return this;
        },
      };

      Wishlist.findOne = () => Promise.resolve(mockWishlistDoc);

      const result = await toggleWishlist(userAId, {
        itemId: rentProductId.toString(),
        itemType: "RENT",
      });

      assert.strictEqual(result.isFavorited, true);
      assert.strictEqual(mockWishlistDoc.items.length, 1);
      assert.strictEqual(mockWishlistDoc.items[0].itemId.toString(), rentProductId.toString());
      assert.strictEqual(mockWishlistDoc.items[0].itemType, "RENT");
    });

    it("Toggle lần 2: Xóa sản phẩm khỏi danh sách yêu thích -> isFavorited = false", async () => {
      const mockWishlistDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userAId,
        items: [
          {
            _id: new mongoose.Types.ObjectId(),
            itemId: rentProductId,
            productId: rentProductId,
            itemType: "RENT",
            productType: "RENT",
            addedAt: new Date(),
          },
        ],
        save: async function () {
          return this;
        },
      };

      Wishlist.findOne = () => Promise.resolve(mockWishlistDoc);

      const result = await toggleWishlist(userAId, {
        itemId: rentProductId.toString(),
        itemType: "RENT",
      });

      assert.strictEqual(result.isFavorited, false);
      assert.strictEqual(mockWishlistDoc.items.length, 0);
    });

    it("Toggle hỗ trợ mục đăng THRIFT mượt mà", async () => {
      const mockWishlistDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userAId,
        items: [],
        save: async function () {
          return this;
        },
      };

      Wishlist.findOne = () => Promise.resolve(mockWishlistDoc);

      // Lần 1: Thêm
      const addResult = await toggleWishlist(userAId, {
        itemId: thriftListingId.toString(),
        itemType: "THRIFT",
      });
      assert.strictEqual(addResult.isFavorited, true);
      assert.strictEqual(mockWishlistDoc.items[0].itemType, "THRIFT");

      // Lần 2: Xóa
      const removeResult = await toggleWishlist(userAId, {
        itemId: thriftListingId.toString(),
        itemType: "THRIFT",
      });
      assert.strictEqual(removeResult.isFavorited, false);
      assert.strictEqual(mockWishlistDoc.items.length, 0);
    });
  });

  describe("4. AC: Không tạo duplicate trong danh sách", () => {
    it("Thêm một sản phẩm đã có không tạo thêm bản ghi trùng lặp", async () => {
      const mockWishlistDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userAId,
        items: [
          {
            _id: new mongoose.Types.ObjectId(),
            itemId: rentProductId,
            productId: rentProductId,
            itemType: "RENT",
            productType: "RENT",
            addedAt: new Date(),
          },
        ],
        save: async function () {
          return this;
        },
      };

      Wishlist.findOne = () => Promise.resolve(mockWishlistDoc);

      await addToWishlist(userAId, {
        itemId: rentProductId.toString(),
        itemType: "RENT",
      });

      assert.strictEqual(mockWishlistDoc.items.length, 1);
    });
  });

  describe("5. AC: Populate đúng dữ liệu item (RENT -> RentalProduct, THRIFT -> ThriftListing)", () => {
    it("Populate chi tiết sản phẩm RENT và THRIFT tương ứng", async () => {
      const mockWishlistDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: userAId,
        items: [
          {
            _id: new mongoose.Types.ObjectId(),
            itemId: rentProductId,
            itemType: "RENT",
            addedAt: new Date(),
          },
          {
            _id: new mongoose.Types.ObjectId(),
            itemId: thriftListingId,
            itemType: "THRIFT",
            addedAt: new Date(),
          },
        ],
        save: async function () {
          return this;
        },
      };

      Wishlist.findOne = () => Promise.resolve(mockWishlistDoc);

      const result = await getUserWishlist(userAId);

      assert.strictEqual(result.items.length, 2);
      // Item 1: RENT
      assert.strictEqual(result.items[0].itemType, "RENT");
      assert.strictEqual(result.items[0].item.name, mockRentProduct.name);
      assert.strictEqual(result.items[0].item.pricePerDay, 250000);

      // Item 2: THRIFT
      assert.strictEqual(result.items[1].itemType, "THRIFT");
      assert.strictEqual(result.items[1].item.name, mockThriftListing.name);
      assert.strictEqual(result.items[1].item.price, 450000);
    });
  });
});
