import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import authorize from "../../src/middleware/role.middleware.js";
import {
  validateReviewListing,
  validateResolveDispute,
} from "../../src/modules/admin/admin.validation.js";
import {
  RENTAL_ORDER_STATUS,
  canTransitionStatus,
} from "../../src/modules/rent/order/order.model.js";

describe("[ADMIN] Unit Tests: Phân quyền RBAC, Kiểm duyệt Listing & Xử lý Tranh chấp", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyShopOwnerId = new mongoose.Types.ObjectId();
  const dummyAdminId = new mongoose.Types.ObjectId();

  describe("1. AC RBAC: Chỉ ADMIN gọi được API; User/Shop Owner nhận 403; Chưa đăng nhập nhận 401", () => {
    it("User thường gọi API Admin -> Bị chặn 403 FORBIDDEN", () => {
      const req = { user: { _id: dummyUserId, role: "USER" } };
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("Shop Owner gọi API Admin -> Bị chặn 403 FORBIDDEN", () => {
      const req = { user: { _id: dummyShopOwnerId, role: "SHOP_OWNER" } };
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("Chưa đăng nhập (req.user không tồn tại) -> Bị chặn 401 UNAUTHORIZED", () => {
      const req = {};
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 401);
      assert.strictEqual(capturedError.errorCode, "UNAUTHORIZED");
    });

    it("Admin được phép vượt qua authorize(['ADMIN']) thành công", () => {
      const req = { user: { _id: dummyAdminId, role: "ADMIN" } };
      let nextCalled = false;
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        nextCalled = true;
        capturedError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(capturedError, undefined);
    });
  });

  describe("2. Validation Middleware: Kiểm duyệt Listing (validateReviewListing)", () => {
    it("Từ chối khi thiếu status -> 400 INVALID_LISTING_STATUS", () => {
      const req = { body: {} };
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_LISTING_STATUS");
    });

    it("Từ chối khi status không phải APPROVED hoặc REJECTED -> 400 INVALID_LISTING_STATUS", () => {
      const req = { body: { status: "ACTIVE" } };
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_LISTING_STATUS");
    });

    it("Từ chối listing (REJECTED) nhưng không có rejectionReason -> 400 REJECTION_REASON_REQUIRED", () => {
      const req = { body: { status: "REJECTED" } };
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("Từ chối listing (REJECTED) với rejectionReason là khoảng trắng -> 400 REJECTION_REASON_REQUIRED", () => {
      const req = { body: { status: "REJECTED", rejectionReason: "   " } };
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("Duyệt listing (APPROVED) không bắt buộc rejectionReason -> Cho phép", () => {
      const req = { body: { status: "APPROVED" } };
      let nextCalled = false;
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        nextCalled = true;
        capturedError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(capturedError, undefined);
    });

    it("Từ chối listing (REJECTED) có rejectionReason rõ ràng -> Cho phép", () => {
      const req = {
        body: {
          status: "REJECTED",
          rejectionReason: "Hình ảnh sản phẩm bị mờ và không đúng quy chuẩn đồ hiệu",
        },
      };
      let nextCalled = false;
      let capturedError = null;

      validateReviewListing(req, {}, (err) => {
        nextCalled = true;
        capturedError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(capturedError, undefined);
    });
  });

  describe("3. Validation Middleware: Giải quyết Tranh chấp (validateResolveDispute)", () => {
    it("Từ chối khi thiếu resolution -> 400 INVALID_DISPUTE_RESOLUTION", () => {
      const req = { body: {} };
      let capturedError = null;

      validateResolveDispute(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_DISPUTE_RESOLUTION");
    });

    it("Từ chối khi resolution không nằm trong danh sách cho phép -> 400 INVALID_DISPUTE_RESOLUTION", () => {
      const req = { body: { resolution: "CANCEL_ORDER_DIRECTLY" } };
      let capturedError = null;

      validateResolveDispute(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_DISPUTE_RESOLUTION");
    });

    it("Từ chối khi refundToRenter là số âm -> 400 INVALID_REFUND_AMOUNT", () => {
      const req = { body: { resolution: "REFUND_RENTER", refundToRenter: -50000 } };
      let capturedError = null;

      validateResolveDispute(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_REFUND_AMOUNT");
    });

    it("Từ chối khi payoutToShop là số âm -> 400 INVALID_PAYOUT_AMOUNT", () => {
      const req = { body: { resolution: "PAY_SHOP_OWNER", payoutToShop: -20000 } };
      let capturedError = null;

      validateResolveDispute(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_PAYOUT_AMOUNT");
    });

    it("Chấp nhận phương án SPLIT với số tiền hợp lệ -> Cho phép", () => {
      const req = {
        body: {
          resolution: "SPLIT",
          refundToRenter: 300000,
          payoutToShop: 200000,
          adminNotes: "Hoàn cọc 60% cho người thuê, 40% cho shop bồi thường vết xước nhẹ",
        },
      };
      let nextCalled = false;
      let capturedError = null;

      validateResolveDispute(req, {}, (err) => {
        nextCalled = true;
        capturedError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(capturedError, undefined);
    });
  });

  describe("4. Vòng đời Tranh chấp Đơn thuê (RentalOrder DISPUTED transitions)", () => {
    it("Model định nghĩa trạng thái DISPUTED", () => {
      assert.strictEqual(RENTAL_ORDER_STATUS.DISPUTED, "DISPUTED");
    });

    it("Đơn đang RENTING có thể chuyển sang DISPUTED khi có sự cố", () => {
      assert.strictEqual(canTransitionStatus(RENTAL_ORDER_STATUS.RENTING, "DISPUTED"), true);
    });

    it("Đơn đang RETURN_REQUESTED có thể chuyển sang DISPUTED khi đối soát bất đồng", () => {
      assert.strictEqual(canTransitionStatus(RENTAL_ORDER_STATUS.RETURN_REQUESTED, "DISPUTED"), true);
    });

    it("Đơn đang RETURNED có thể chuyển sang DISPUTED khi kiểm tra phát hiện hư hại tranh chấp", () => {
      assert.strictEqual(canTransitionStatus(RENTAL_ORDER_STATUS.RETURNED, "DISPUTED"), true);
    });

    it("Đơn đang DISPUTED có thể chuyển sang COMPLETED sau khi Admin phân xử", () => {
      assert.strictEqual(canTransitionStatus(RENTAL_ORDER_STATUS.DISPUTED, "COMPLETED"), true);
    });
  });
});
