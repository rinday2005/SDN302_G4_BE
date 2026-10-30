import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import authorize from "../../src/middleware/role.middleware.js";
import { convertFromRental } from "../../src/modules/thrift/listing/thriftListing.service.js";
import RentalProduct from "../../src/modules/rent/product/product.model.js";
import RentalOrder from "../../src/modules/rent/order/order.model.js";
import RentalAvailability from "../../src/modules/rent/availability/availability.model.js";
import ThriftListing from "../../src/modules/thrift/listing/thriftListing.model.js";

// IMPORT DATA MẪU TÁCH RIÊNG TỪ THƯ MỤC DATA (Dễ dàng thay thế/upload sau này)
import {
  mockIds,
  sampleUsers,
  sampleRentalProducts,
  sampleOrders,
  sampleAvailabilities,
  sampleConvertRequests,
} from "../data/convertSampleData.js";

describe("[BE-S4-04] Unit Tests: Chuyển đổi Sản phẩm RENT sang THRIFT (Circular Economy API)", () => {
  const { shopOwnerId, otherShopOwnerId, rentalProductId } = mockIds;
  const { shopOwner, regularUser } = sampleUsers;

  // Lưu trữ các hàm gốc để phục hồi sau mỗi test
  let originalRentalProductFindById;
  let originalRentalOrderFindOne;
  let originalAvailabilityFindOne;
  let originalThriftListingCreate;

  beforeEach(() => {
    originalRentalProductFindById = RentalProduct.findById;
    originalRentalOrderFindOne = RentalOrder.findOne;
    originalAvailabilityFindOne = RentalAvailability.findOne;
    originalThriftListingCreate = ThriftListing.create;
  });

  afterEach(() => {
    RentalProduct.findById = originalRentalProductFindById;
    RentalOrder.findOne = originalRentalOrderFindOne;
    RentalAvailability.findOne = originalAvailabilityFindOne;
    ThriftListing.create = originalThriftListingCreate;
  });

  describe("1. Phân quyền API (Role Authorization)", () => {
    it("User không phải SHOP_OWNER gọi API bị chặn 403 FORBIDDEN", () => {
      const req = { user: regularUser };
      let capturedError = null;

      authorize(["SHOP_OWNER"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("SHOP_OWNER hợp lệ được phép truy cập endpoint", () => {
      const req = { user: shopOwner };
      let nextCalled = false;
      let capturedError = null;

      authorize(["SHOP_OWNER"])(req, {}, (err) => {
        if (err) capturedError = err;
        nextCalled = true;
      });

      assert.strictEqual(capturedError, null);
      assert.strictEqual(nextCalled, true);
    });
  });

  describe("2. Kiểm tra dữ liệu đầu vào (Input Validation)", () => {
    it("Thiếu rentalProductId ném lỗi 400", async () => {
      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            sellingPrice: 500000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /rentalProductId là bắt buộc/);
          return true;
        }
      );
    });

    it("Thiếu sellingPrice hoặc sellingPrice <= 0 ném lỗi 400", async () => {
      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: -100,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /sellingPrice là bắt buộc và phải lớn hơn 0/);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 0,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  describe("3. Xác minh quyền sở hữu & trạng thái sản phẩm RENT", () => {
    it("Sản phẩm RENT không tồn tại ném lỗi 404", async () => {
      RentalProduct.findById = async () => null;

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 650000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          assert.match(err.message, /Sản phẩm thuê không tồn tại/);
          return true;
        }
      );
    });

    it("Sản phẩm không thuộc Shop Owner gọi API ném lỗi 403 (Chặn IDOR)", async () => {
      RentalProduct.findById = async () => ({
        ...sampleRentalProducts.sonyCamera,
        ownerId: otherShopOwnerId,
      });

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 650000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.match(err.message, /Bạn không có quyền chuyển đổi sản phẩm này/);
          return true;
        }
      );
    });

    it("Sản phẩm RENT đã ở trạng thái HIDDEN ném lỗi 400", async () => {
      RentalProduct.findById = async () => ({
        ...sampleRentalProducts.sonyCamera,
        status: "HIDDEN",
      });

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 650000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /đã ở trạng thái HIDDEN hoặc đã được chuyển đổi/);
          return true;
        }
      );
    });
  });

  describe("4. AC: Không convert được sản phẩm đang thuê / có lịch tương lai / đang bảo trì", () => {
    it("Chặn convert nếu có RentalOrder active (đang thuê hoặc đặt trước tương lai) -> 400", async () => {
      RentalProduct.findById = async () => ({
        ...sampleRentalProducts.sonyCamera,
        status: "APPROVED",
      });

      RentalOrder.findOne = async () => sampleOrders.activeRentingOrder;

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 700000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /đang có đơn thuê đang xử lý\/hoạt động hoặc có lịch đặt trước/);
          return true;
        }
      );
    });

    it("Chặn convert nếu sản phẩm đang trong lịch bảo trì (RentalAvailability) -> 400", async () => {
      RentalProduct.findById = async () => ({
        ...sampleRentalProducts.sonyCamera,
        status: "APPROVED",
      });

      RentalOrder.findOne = async () => null; // Không có đơn thuê

      RentalAvailability.findOne = async () => sampleAvailabilities.activeMaintenance;

      await assert.rejects(
        async () => {
          await convertFromRental(shopOwnerId, {
            rentalProductId,
            sellingPrice: 700000,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /đang trong lịch bảo trì hoặc bị tạm khóa/);
          return true;
        }
      );
    });
  });

  describe("5. AC: Chuyển đổi thành công, lưu source listing chính xác & ẩn RENT product", () => {
    it("Đặt RENT product thành HIDDEN và tạo THRIFT listing với sourceType = RENTAL_PRODUCT", async () => {
      let savedProductStatus = null;
      let createdThriftPayload = null;

      const mockRentalProduct = {
        ...sampleRentalProducts.sonyCamera,
        save: async function () {
          savedProductStatus = this.status;
          return this;
        },
      };

      RentalProduct.findById = async () => mockRentalProduct;
      RentalOrder.findOne = async () => null;
      RentalAvailability.findOne = async () => null;

      ThriftListing.create = async (payload) => {
        createdThriftPayload = payload;
        return {
          _id: new mongoose.Types.ObjectId(),
          ...payload,
          createdAt: new Date(),
        };
      };

      const result = await convertFromRental(
        shopOwnerId,
        sampleConvertRequests.validFullRequest
      );

      // 1. Kiểm tra RENT product đã bị đổi thành HIDDEN (sản phẩm không tiếp tục xuất hiện trên marketplace RENT)
      assert.strictEqual(savedProductStatus, "HIDDEN");
      assert.strictEqual(mockRentalProduct.status, "HIDDEN");

      // 2. Kiểm tra THRIFT listing được tạo với đúng sourceType và sourceRentalProductId
      assert.ok(createdThriftPayload);
      assert.strictEqual(createdThriftPayload.sourceType, "RENTAL_PRODUCT");
      assert.strictEqual(
        createdThriftPayload.sourceRentalProductId.toString(),
        rentalProductId.toString()
      );
      assert.strictEqual(createdThriftPayload.ownerId.toString(), shopOwnerId.toString());
      assert.strictEqual(
        createdThriftPayload.price,
        sampleConvertRequests.validFullRequest.sellingPrice
      );
      assert.strictEqual(
        createdThriftPayload.description,
        sampleConvertRequests.validFullRequest.conditionDescription
      );
      assert.deepStrictEqual(
        createdThriftPayload.images,
        sampleConvertRequests.validFullRequest.images
      );
      assert.strictEqual(createdThriftPayload.status, "APPROVED");

      // 3. Kết quả trả về chứa thông tin listing
      assert.strictEqual(result.sourceType, "RENTAL_PRODUCT");
      assert.strictEqual(result.price, sampleConvertRequests.validFullRequest.sellingPrice);
    });

    it("Nếu không truyền images tùy chọn, tự động tái sử dụng images từ sản phẩm RENT", async () => {
      let createdThriftPayload = null;

      const mockRentalProduct = {
        ...sampleRentalProducts.eveningDress,
        save: async function () {
          return this;
        },
      };

      RentalProduct.findById = async () => mockRentalProduct;
      RentalOrder.findOne = async () => null;
      RentalAvailability.findOne = async () => null;

      ThriftListing.create = async (payload) => {
        createdThriftPayload = payload;
        return { _id: new mongoose.Types.ObjectId(), ...payload };
      };

      await convertFromRental(
        shopOwnerId,
        sampleConvertRequests.validFallbackImagesRequest
      );

      assert.deepStrictEqual(
        createdThriftPayload.images,
        sampleRentalProducts.eveningDress.images
      );
    });
  });
});
