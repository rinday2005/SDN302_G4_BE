import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import authorize from "../../src/middleware/role.middleware.js";
import {
  validateSubmitKyc,
  validateAdminReviewKyc,
} from "../../src/modules/kyc/kyc.validation.js";
import {
  submitKycApplication,
  reviewKycApplication,
} from "../../src/modules/kyc/kyc.service.js";
import KycRecord, { KYC_STATUS } from "../../src/modules/kyc/kyc.model.js";
import User from "../../src/modules/user/user.model.js";

describe("[KYC] Unit Tests: Schema, Validation & Nghiệp vụ Xác thực Danh tính", () => {
  const userId = new mongoose.Types.ObjectId();
  const mockUser = {
    _id: userId,
    role: "USER",
    kycStatus: null,
    kyc: {},
    save: async function () {
      return this;
    },
  };

  describe("1. Phân quyền Admin Review (Role Middleware Authorization)", () => {
    it("User thường không thể truy cập route admin KYC -> 403 FORBIDDEN", () => {
      const req = { user: { _id: userId, role: "USER" } };
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("Shop Owner không thể truy cập route admin KYC -> 403 FORBIDDEN", () => {
      const req = { user: { _id: new mongoose.Types.ObjectId(), role: "SHOP_OWNER" } };
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 403);
      assert.strictEqual(capturedError.errorCode, "FORBIDDEN");
    });

    it("Chưa đăng nhập (req.user không có) bị chặn -> 401 UNAUTHORIZED", () => {
      const req = {};
      let capturedError = null;

      authorize(["ADMIN"])(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 401);
      assert.strictEqual(capturedError.errorCode, "UNAUTHORIZED");
    });

    it("Admin vượt qua middleware authorize(['ADMIN']) thành công", () => {
      const req = { user: { _id: new mongoose.Types.ObjectId(), role: "ADMIN" } };
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

  describe("2. Validation Middleware: Submit KYC & Admin Review", () => {
    it("Submit KYC: Báo lỗi khi thiếu idCardNumber", () => {
      const req = {
        body: {
          frontImageUrl: "https://example.com/front.jpg",
          backImageUrl: "https://example.com/back.jpg",
        },
      };
      let capturedError = null;

      validateSubmitKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "ID_CARD_NUMBER_REQUIRED");
    });

    it("Submit KYC: Báo lỗi khi thiếu frontImageUrl", () => {
      const req = {
        body: {
          idCardNumber: "079201001234",
          backImageUrl: "https://example.com/back.jpg",
        },
      };
      let capturedError = null;

      validateSubmitKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "FRONT_IMAGE_URL_REQUIRED");
    });

    it("Submit KYC: Báo lỗi khi thiếu backImageUrl", () => {
      const req = {
        body: {
          idCardNumber: "079201001234",
          frontImageUrl: "https://example.com/front.jpg",
        },
      };
      let capturedError = null;

      validateSubmitKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "BACK_IMAGE_URL_REQUIRED");
    });

    it("Submit KYC: Cho phép khi có đủ thông tin hợp lệ", () => {
      const req = {
        body: {
          idCardNumber: "079201001234",
          frontImageUrl: "https://example.com/front.jpg",
          backImageUrl: "https://example.com/back.jpg",
        },
      };
      let nextCalled = false;

      validateSubmitKyc(req, {}, (err) => {
        nextCalled = true;
        assert.strictEqual(err, undefined);
      });

      assert.strictEqual(nextCalled, true);
    });

    it("Admin Review: Báo lỗi khi status không phải APPROVED hoặc REJECTED", () => {
      const req = { body: { status: "INVALID_STATUS" } };
      let capturedError = null;

      validateAdminReviewKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "INVALID_KYC_STATUS");
    });

    it("Admin Review AC: Từ chối (REJECTED) bắt buộc phải có lý do (rejectionReason)", () => {
      const req = { body: { status: "REJECTED" } };
      let capturedError = null;

      validateAdminReviewKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("Admin Review AC: Từ chối với rejectionReason là chuỗi rỗng/khoảng trắng bị từ chối", () => {
      const req = { body: { status: "REJECTED", rejectionReason: "   " } };
      let capturedError = null;

      validateAdminReviewKyc(req, {}, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.statusCode, 400);
      assert.strictEqual(capturedError.errorCode, "REJECTION_REASON_REQUIRED");
    });

    it("Admin Review: Chấp nhận khi REJECTED kèm lý do rõ ràng", () => {
      const req = {
        body: {
          status: "REJECTED",
          rejectionReason: "Ảnh căn cước bị mờ góc và lóa sáng",
        },
      };
      let nextCalled = false;

      validateAdminReviewKyc(req, {}, (err) => {
        nextCalled = true;
        assert.strictEqual(err, undefined);
      });

      assert.strictEqual(nextCalled, true);
    });

    it("Admin Review: Chấp nhận khi APPROVED không bắt buộc rejectionReason", () => {
      const req = { body: { status: "APPROVED" } };
      let nextCalled = false;

      validateAdminReviewKyc(req, {}, (err) => {
        nextCalled = true;
        assert.strictEqual(err, undefined);
      });

      assert.strictEqual(nextCalled, true);
    });
  });

  describe("3. Schema kycRecords Model Structure", () => {
    it("Model kycRecords có đầy đủ các trường yêu cầu: userId, idCardNumber, frontImageUrl, backImageUrl, status, rejectionReason", () => {
      const paths = KycRecord.schema.paths;
      assert.ok(paths.userId, "Missing userId path");
      assert.ok(paths.idCardNumber, "Missing idCardNumber path");
      assert.ok(paths.frontImageUrl, "Missing frontImageUrl path");
      assert.ok(paths.backImageUrl, "Missing backImageUrl path");
      assert.ok(paths.status, "Missing status path");
      assert.ok(paths.rejectionReason, "Missing rejectionReason path");
      assert.ok(paths.createdAt, "Missing createdAt timestamp");
      assert.ok(paths.updatedAt, "Missing updatedAt timestamp");

      assert.deepStrictEqual(
        paths.status.enumValues,
        ["PENDING", "APPROVED", "REJECTED"]
      );
      assert.strictEqual(paths.status.defaultValue, "PENDING");
    });
  });
});
